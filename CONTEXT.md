# 八爪鱼 CLI 项目总结

## 项目概述

- **What**: `octo-cli` 是一个终端命令行工具，通过 node-ipc 与八爪鱼 Electron 采集客户端通信，实现任务的远程管理控制。
- **Why**: 允许用户在终端中直接管理采集任务（列表、启动、停止、暂停、恢复），无需操作 GUI 界面。适用于批量操作、脚本自动化和 AI Agent 集成。
- **Architecture**: 三层通信架构
  ```
  CLI (octo-cli)  --node-ipc-->  Electron main process (cli-server.ts)  --IPC/executeJS-->  renderer (runner/home)
  ```
  - CLI 端通过 `node-ipc` 连接到 Electron 主进程的 IPC server
  - 主进程根据 action 类型:
    - `task.start`: 转发到渲染进程（home/index.tsx）
    - `task.list`: 聚合 engine workflows + runner 窗口数据（通过 executeJavaScript 查询渲染进程）
    - `task.pause/resume/stop`: 先试 engine taskController，失败则 fallback 到 runner 窗口的 `__cliStatus` 控制方法

## 双引擎架构（关键设计约束）

八爪鱼客户端存在两套采集引擎，CLI 必须同时支持:

| | 新引擎 (`@octopus/engine`) | 旧引擎 (`@octopus/workflow`) |
|---|---|---|
| 运行位置 | 主进程（WorkflowAgent） | 渲染进程（RunnerWindow 内） |
| 数据存储 | `workflows` Map in engine.ts | `RunnerStore` in runner renderer |
| 任务控制 | `taskController.pause/resume/stop()` | `window.__cliStatus.pause/resume/stop()` via executeJS |
| 状态查询 | `WorkflowEntry.paused` + `WorkflowAgent.startTime/taskName` | `window.__cliStatus` getter (taskName/total/startTime/status) |
| task list 数据 | `taskController.list()` → `TaskListItem[]` | `appWindow.getRunningTasks()` → executeJS 查询 `__cliStatus` |
| key 格式 | `taskId` 或 `taskId-subtaskid-N`（加速模式） | 纯 `taskId` |

**合并策略** (cli-server.ts task.list):
1. engine tasks 按 base taskId（去掉 `-subtaskid-N` 后缀）聚合，total 求和，startTime 取最早
2. 与 runnerMap 按 base taskId 匹配，补充 mode/browser 信息
3. 云采集任务通过 `cloudPanelMap` 识别，设置 `mode='cloud'`
4. 未匹配的 runner 任务作为补充项（旧引擎任务）
5. status 精确映射 RunnerStatus（0=idle, 1=running, 2=paused, 3=stopped, 4=completed）
6. **保留已停止任务**：不再过滤 status=3/4，使用 runner 窗口实时 total 而非 API 过期数据

**控制 fallback 策略** (cli-server.ts pause/resume/stop):
1. 先试 `taskController`（新引擎 workflows Map）
2. 失败则 `appWindow.executeRunnerCommand(taskId, command)`（通过 executeJS 调用渲染进程 `__cliStatus` 方法）

## 云/本地拆分逻辑（v0.4.0 新增）

### 问题背景

GUI 任务列表在显示时，同一个 taskId 会展示为**两行**：
- 云采集行（☁️ 图标）：显示云采集状态和数据量
- 本地采集行（💻 图标）：显示本地采集状态和数据量

但 CLI 早期版本只输出一行，丢失了云/本地隔离的数据。

### 实现方案

**数据源**：
- API (`searchTaskListV3`) 返回一条记录，同时包含云和本地数据：
  - `taskExecuteStatus` / `currentTotalExtractCount` - 云采集状态和数据量
  - `local.Status` / `local.CollectCount` - 本地采集状态和数据量（来自 runner 窗口）

**拆分逻辑** (cli-server.ts `expandTaskToRecords` 函数):
1. 每个任务生成**两条** `CliTaskInfo` 记录
2. **云采集记录**：
   - `runOn: 'cloud'`
   - `status`: 映射 `taskExecuteStatus`（CloudStatus → CLI status）
   - `total`: `currentTotalExtractCount`
   - `mode`: 根据 `cloudPanelMap` 识别是否为云采集
3. **本地采集记录**：
   - `runOn: 'local'`
   - `status`: 映射 `local.Status`（RunnerStatus → CLI status）
   - `total`: `local.CollectCount`（runner 窗口实时数据）
   - `mode`: `local` / `local-speed`（根据 `isSpeedMode`）
   - `browser`: `kernel` / `chrome`（根据 `useKernelBrowser`）

**状态映射**：
- CloudStatus: `Running(1)→running`, `Ready(0)→idle`, `Waitting(6)→running`, `Completed(4)→completed`, `Stoped(5)→stopped`
- RunnerStatus: `Start(1)→running`, `Pause(2)→paused`, `Stop(3)→stopped`, `Complete(4)→completed`, `Idle(0)→idle`

### CLI 输出示例

```bash
$ octo task list
运行中的任务 (4):

  ID          名称              运行方式  状态    采集量    采集模式    浏览器    耗时
  abc-123     央视新闻          云采集    已停止  13        云采集      -         5m
  abc-123     央视新闻          本地      已停止  6         本地        内置      3m
  def-456     淘宝监控          云采集    运行中  1,234     云采集      -         12m
  def-456     淘宝监控          本地      暂停    567       本地-加速   独立      8m
```

### 实现文件

**octopus 仓库**:
- `src/main/cli-server.ts`:
  - 增加 `CliTaskInfo.runOn` 字段
  - 增加 `CloudStatus` 枚举和状态映射函数
  - 增加 `expandTaskToRecords()` 函数
  - 修改 `task.list` 和 `handleTaskQuery` 使用展开逻辑

**octo-cli 仓库**:
- `src/index.ts`:
  - 增加 `formatRunOn()` 格式化函数
  - 表格列增加"运行方式"列
  - 更新帮助文档示例和字段说明

## 仓库结构

### octo-cli 仓库

- **路径**: `/Users/yaohui/Documents/GitHub/octo-cli`
- **文件列表**:
  - `package.json` - 项目配置，bin 入口 `octo` 指向 `dist/index.js`
  - `tsconfig.json` - TypeScript 配置，target ES2020，module commonjs
  - `src/index.ts` - CLI 入口，基于 commander 定义所有命令，含表格渲染、格式化工具函数、交互式启动逻辑
  - `src/client.ts` - node-ipc 客户端封装，含 `CliError` 类和 exit code 常量
  - `src/types.d.ts` - node-ipc 模块类型声明
  - `README.md` - 详细的使用文档（Agent 友好）
  - `CONTEXT.md` - 本文档，技术总结

### octopus 仓库（客户端改动）

- **路径**: `/Users/yaohui/Documents/GitHub/octopus`
- **分支**: `yh/10.0`
- **修改/新增文件**:
  - `src/main/cli-server.ts` (新文件) - IPC server 端，处理所有 CLI 请求，含双引擎 fallback 逻辑
  - `src/main/main.ts` (已修改) - 引入并启动/停止 CLI server
  - `src/main/ipc/engine.ts` (已修改) - 导出 `taskController` 和 `TaskListItem`，WorkflowEntry 含 totalCount/paused 缓存
  - `src/main/app/AppWindow.ts` (已修改) - 新增 `getRunningTasks()` (async, executeJS 查询) 和 `executeRunnerCommand()`，新增 `getCloudTaskIds()` 返回云采集任务 ID 集合
  - `src/renderer/pages/home/index.tsx` (已修改) - 新增 `cliStartTask` 事件监听，挂载 `window.__cliQuery.searchTasks()` 用于全量任务查询
  - `src/renderer/pages/runner/index.tsx` (已修改) - 新增 `window.__cliStatus` 全局对象（getter + 控制方法）

## 通信协议

### IPC 连接参数

| 参数 | 值 |
|------|------|
| appspace | `octoparse.` |
| channel/id | `cli` |
| 完整 socket 标识 | `octoparse.cli` |
| 连接超时 | 3000ms（CLI 端） |
| 重试次数 | 最多 2 次，间隔 500ms（CLI 端） |

### 请求/响应格式

**请求 (CliRequest)**:
```typescript
interface CliRequest {
    action: string;
    params?: Record<string, any>;
}
```

**响应 (CliResponse)**:
```typescript
interface CliResponse {
    ok: boolean;
    data?: any;
    error?: string;
}
```

### 支持的 action 列表

| action | params | 行为 | 返回 data |
|--------|--------|------|-----------|
| `ping` | 无 | 检查客户端是否在线 | `{ status: 'running' }` |
| `task.list` | `{ all?, keyword?, taskId? }` | 聚合 engine + runner + cloud 数据，返回结构化任务列表 | `CliTaskInfo[]` |
| `task.start` | `{ taskId, cloud?, speed?, visual? }` | 通过 `mainWindow.webContents.send('cliStartTask', ...)` 发送到渲染进程 | 无 |
| `task.stop` | `{ taskId }` | taskController → fallback executeRunnerCommand | 无 |
| `task.pause` | `{ taskId }` | taskController → fallback executeRunnerCommand | 无 |
| `task.resume` | `{ taskId }` | taskController → fallback executeRunnerCommand | 无 |

### task.list 返回的 CliTaskInfo 结构

```typescript
interface CliTaskInfo {
    taskId: string;                                      // 任务 ID
    taskName: string;                                    // 任务名称
    runOn: 'cloud' | 'local';                            // v0.4.0 新增：云采集或本地采集
    status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed';  // 运行状态（v0.3.0 扩展）
    total: number;                                       // 已采集数据量
    mode: 'local' | 'local-speed' | 'cloud' | '-';      // 采集模式
    browser: 'kernel' | 'chrome' | '-';                 // 浏览器类型
    startTime: string;                                   // ISO 格式开始时间
    // v0.3.0 新增元数据字段（用于交互式启动）
    taskType?: number;                                   // Web=1, Txt=2, Excel=3, Pdf=4, App=5, CloudWeb=6
    workFlowType?: number;                               // AdvancedMode=1, TaskTemplates=10, etc
    localMapReduce?: boolean;                            // 是否支持加速模式
    useKernelBrowser?: boolean;                          // 是否使用内置浏览器
    useChromeBrowser?: boolean;                          // 是否使用独立浏览器
}
```

## 已实现的命令

### `octo ping`
检查八爪鱼客户端是否在线（通过 IPC 连接检测）。
```bash
octo ping            # 输出: 客户端运行中
octo ping --json     # JSON 格式输出
```

### `octo task list` (别名: `octo task ls`)
列出任务（默认仅运行中，可查询全量）。
```bash
octo task list                      # 表格格式（ID、名称、状态、采集量、采集模式、浏览器、耗时）
octo task list --all                # 所有任务（含历史）
octo task list --name "关键词"       # 按名称搜索
octo task list --id <taskId>        # 查询指定任务（含元数据）
octo task list --json               # JSON 格式输出（Agent 友好）
octo task ls -q                     # 只输出 taskId（管道友好）
octo task list --no-header          # 表格不显示表头
```

**表格输出示例**:
```
运行中的任务 (3):

  ID          名称              状态      采集量    采集模式      浏览器    耗时
  abc-123     央视新闻搜索      已停止    30        本地          内置      5m
  def-456     淘宝商品监控      运行中    1,234     本地-加速     独立      12m
  ghi-789     微博热搜          暂停      567       云采集        -         8m
```

**状态枚举** (v0.3.0 扩展):
- `idle` - 空闲（未启动）
- `running` - 运行中
- `paused` - 暂停
- `stopped` - 已停止
- `completed` - 已完成

### `octo task start <taskId>` (v0.3.0 交互式增强)

启动采集任务。支持交互式选择或命令行参数。

**命令行参数模式**:
```bash
octo task start abc123                      # 交互式选择（无参数时，TTY 环境）
octo task start abc123 --yes                # 使用默认值（本地+普通+内置浏览器）
octo task start abc123 --cloud              # 云采集
octo task start abc123 --speed              # 本地加速模式
octo task start abc123 --visual             # 本地普通+独立浏览器
octo task start abc123 --speed --visual     # 本地加速+独立浏览器
octo task start abc123 --cloud --yes        # 云采集（批量操作时跳过交互）
octo task start abc123 --json               # JSON 格式输出
```

**交互式模式示例** (v0.3.0 新增):
```
$ octo task start abc123
? 选择采集模式
  ❯ 本地采集
    云采集
? 选择速度模式
  ❯ 普通模式
    加速模式
? 选择浏览器
  ❯ 内置浏览器
    独立浏览器
已通知客户端启动本地采集 (加速) (独立浏览器): abc123
```

**交互式启动逻辑**:

**触发条件**:
- 无任何 flag（`--cloud`/`--speed`/`--visual`）
- 且无 `--yes` 标志
- 且在 TTY 环境（非管道/重定向）
- 且环境变量 `OCTO_NO_INTERACTIVE` 未设置

**跳过条件**:
- 有任意 flag → 使用指定参数
- 有 `--yes` 标志 → 使用默认值
- 非 TTY 环境 → 使用默认值
- 环境变量 `OCTO_NO_INTERACTIVE=1` → 使用默认值

**动态选项（根据任务类型调整）**:
1. **查询任务元数据**: 先调用 `task.list --id <taskId>` 获取 `taskType`、`localMapReduce` 等字段
2. **JSON 任务** (Txt=2/Excel=3/Pdf=4): 强制内置浏览器，不显示浏览器选项
3. **CloudWeb 任务** (taskType=6): 强制云采集，不显示采集模式选项
4. **不支持加速**: `localMapReduce=false` 时不显示速度模式选项
5. **App 任务** (taskType=5): 不显示浏览器选项

**任务类型约束矩阵**:

| taskType | 任务类型 | 采集模式选择 | 加速模式选择 | 浏览器选择 |
|----------|---------|-------------|-------------|-----------|
| 1 | Web | ✅ 本地/云 | ✅ 普通/加速（如支持） | ✅ 内置/独立 |
| 2 | Txt | ✅ 本地/云 | ✅ 普通/加速（如支持） | ❌ 强制内置 |
| 3 | Excel | ✅ 本地/云 | ✅ 普通/加速（如支持） | ❌ 强制内置 |
| 4 | Pdf | ✅ 本地/云 | ✅ 普通/加速（如支持） | ❌ 强制内置 |
| 5 | App | ✅ 本地/云 | ✅ 普通/加速（如支持） | ❌ 无浏览器选项 |
| 6 | CloudWeb | ❌ 强制云采集 | ❌ 无 | ❌ 无 |

### `octo task stop/pause/resume <taskId>`

```bash
octo task stop <taskId>      # 停止任务（支持本地/云采集，新旧引擎）
octo task pause <taskId>     # 暂停任务（仅本地采集）
octo task resume <taskId>    # 恢复任务（仅本地采集）
```

### 通用选项

| 选项 | 说明 | 适用命令 |
|------|------|---------|
| `--json` | JSON 格式输出（Agent 友好） | 所有命令 |
| `-q, --quiet` | 只输出 taskId（每行一个） | `task list` |
| `--no-header` | 表格不显示表头 | `task list` |
| `-y, --yes` | 跳过交互式选择，使用默认值 | `task start` (v0.3.0) |
| `-v, --version` | 输出版本号 | `octo` |
| `-h, --help` | 显示帮助信息 | 所有命令 |

### Exit Code

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 操作失败（任务未找到、参数错误等） |
| 2 | 连接失败（客户端未启动） |

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OCTO_NO_INTERACTIVE` | 禁用交互式输入（设置为 `1` 启用，CI/CD 环境） | 未设置 |

### 脚本组合示例

```bash
# 停止所有运行中的任务
octo task ls -q | xargs -I{} octo task stop {}

# 批量启动多个任务（加速模式，跳过交互）
echo -e "task1\ntask2\ntask3" | xargs -I{} octo task start {} --speed --yes

# 检查客户端状态用于监控
octo ping --json | jq '.ok'

# 获取任务列表 JSON 用于后续处理
octo task list --json | jq '.[].taskId'

# 获取采集量超过 1000 的任务
octo task list --json | jq '.[] | select(.total > 1000) | .taskId'

# CI/CD 环境批量启动
OCTO_NO_INTERACTIVE=1 octo task start abc123 --cloud
```

## octopus 客户端改动清单

### 1. `src/main/cli-server.ts` (新文件)

- 完整的 IPC server 实现
- `getMainWindow()`: 查找主窗口（包含 `index.html` 的 BrowserWindow）
- `handleRequest()`: 请求路由，分发到对应 handler
  - `task.list`: 聚合 engine + runner + cloud 数据
    - **默认模式**（无参数）: 只返回运行中任务（engine tasks + active runner tasks）
    - **查询模式**（有 `--all/--keyword/--id`）: 调用 `handleTaskQuery`，查询 API + 合并运行态数据
    - engine tasks 按 base taskId 聚合（去 `-subtaskid-N` 后缀），total 求和，startTime 取最早
    - runner 数据通过 async `getRunningTasks()` 获取
    - 云采集任务通过 `getCloudTaskIds()` 识别，设置 `mode='cloud'`, `browser='-'`
    - **保留已停止任务**: 不过滤 status=3/4，使用 runner 实时 total
  - `task.pause/resume/stop`: 两级查找 — 先 taskController（新引擎），后 executeRunnerCommand（旧引擎）
- `handleTaskQuery()`: 全量任务查询逻辑（v0.3.0 新增）
  - 通过 `window.__cliQuery.searchTasks()` 查询 API 数据
  - 合并 engine + runner + cloud 运行态数据
  - **修复过期数据问题**: 优先使用 runner 窗口实时 total，避免 API 返回 0
  - 返回完整任务元数据（taskType、workFlowType、localMapReduce 等）
- `startCliServer()` / `stopCliServer()`: IPC server 生命周期管理
- 所有错误信息统一中文
- 依赖: `taskController` + `TaskListItem` (from `./ipc/engine`), `appWindow` (from `./app/AppWindow`)

### 2. `src/main/main.ts`
- 在 `app.on('ready')` 中调用 `startCliServer()`
- 在 `app.on('will-quit')` 中调用 `stopCliServer()`

### 3. `src/main/ipc/engine.ts`
- `WorkflowEntry` 增加 `totalCount: number` 和 `paused: boolean` 字段
- `setupWorkflowListeners` 中 `ExtraData` 事件同步缓存 `totalCount` 到 entry
- `workflows.set()` 初始化新字段 `{ ..., totalCount: 0, paused: false }`
- 导出 `TaskListItem` 接口:
  ```typescript
  export interface TaskListItem {
      taskId: string;
      taskName: string;
      status: 'running' | 'paused';
      startTime: string;
      total: number;
  }
  ```
- `taskController.list()` 返回 `TaskListItem[]`（结构化数据，含 taskName/status/startTime/total）
- `taskController.pause()` / `resume()` 同步维护 `entry.paused` 状态

### 4. `src/main/app/AppWindow.ts`
- 保留原 `getRunningTaskIds()` 方法
- 新增 `async getRunningTasks()`: 遍历 `runnerMap`，通过 `executeJavaScript` 查询每个 runner 窗口的 `window.__cliStatus`，返回含 taskName/total/startTime/status/isSpeedMode/useKernelBrowser/useChromeBrowser 的结构化数据
- 新增 `async executeRunnerCommand(taskId, command)`: 通过 `executeJavaScript` 调用 runner 窗口的 `window.__cliStatus.pause/resume/stop()`，用于旧引擎任务的 CLI 控制
- **新增 `getCloudTaskIds()` (v0.3.0)**: 返回 `cloudPanelMap` 中所有未销毁窗口的 taskId 集合，用于识别云采集任务

### 5. `src/renderer/pages/home/index.tsx`
- 新增 `useEffect` 监听 `cliStartTask` 事件
  - 云采集: 调用 `startCloudRunnerByTaskId(taskId, false, true)`
  - 本地采集: 调用 `startLocalRunner({ taskId, isSpeedMode, useKernelBrowser, useChromeBrowser, showChromeBrowser })`
- **新增 `window.__cliQuery.searchTasks()` (v0.3.0)**: 暴露 `TaskService.searchTaskListV3()` API 查询接口，支持全量任务查询（含历史任务）

### 6. `src/renderer/pages/runner/index.tsx`
- RunnerStore 实例挂到 `window.__cliStatus` 全局对象:
  - **Getter**: `taskName`, `total` (dataStore.total), `startTime`, `status` (RunnerStatus 枚举)
  - **方法**: `pause()`, `resume()`, `stop()` — 直接调用 RunnerStore 对应方法
- 主进程通过 `executeJavaScript` 查询/调用这些属性和方法

## 已知问题和待修复项

1. **task start 无确认反馈**: `task.start` 仅向渲染进程发送事件后即返回 `{ ok: true }`，不等待任务实际启动成功。CLI 用户无法知道任务是否真正开始运行。

2. **task start 依赖主窗口**: 如果用户未登录或主窗口未打开（`getMainWindow()` 返回 null），`task.start` 会报错"客户端主窗口未打开，请先登录"。

3. **node-ipc 版本锁定**: 使用 `node-ipc@9.2.1`（锁定版本），因为更高版本曾有供应链安全事件。

4. **executeJavaScript 依赖 `__cliStatus`**: 如果 runner 页面未就绪（尚未渲染完成），`__cliStatus` 不存在，查询返回默认值。有 try-catch 兜底。

5. **模板任务 runOn 判断**: 目前 `templatesInfo.runOn` 字段在 CLI 中未查询，交互式启动时无法判断模板任务的云采集支持情况。

## v0.3.0 更新内容（2026-04-22）

### 新增功能

1. **交互式 `task start` 模式**
   - 无参数时自动进入交互模式（TTY 环境）
   - 使用 `prompts` 库实现引导式选择
   - 动态调整选项（根据任务类型）
   - 支持 Ctrl+C 随时取消

2. **`--yes/-y` 标志**
   - 跳过交互式选择，使用默认值或命令行参数
   - 批量操作必备（管道自动禁用交互）
   - 环境变量 `OCTO_NO_INTERACTIVE=1` 强制禁用交互

3. **任务元数据查询**
   - `task.list --id <taskId>` 返回完整元数据
   - 包含 `taskType`、`workFlowType`、`localMapReduce`、`useKernelBrowser`、`useChromeBrowser`
   - 用于交互式启动前的任务类型判断

4. **状态扩展**
   - 原状态: `running` / `paused`
   - 新增状态: `idle` / `stopped` / `completed`
   - 精确映射 RunnerStatus 枚举（0-4）

5. **云采集识别**
   - 通过 `cloudPanelMap` 判断任务是否为云采集
   - 云采集任务显示 `mode='cloud'`, `browser='-'`

6. **已停止任务显示修复**
   - 不再过滤 status=3/4 的任务
   - 使用 runner 窗口实时 total，避免 API 过期数据（0）

7. **Help 文档增强**
   - 详细的命令说明和示例
   - JSON 输出格式 schema 说明
   - 退出码、环境变量、故障排查文档
   - Agent 友好：便于 AI 学习工具使用

### 技术改动

**octo-cli 仓库**:
- 新增依赖: `prompts` + `@types/prompts`
- `src/index.ts`: 重写 `task start` 命令，增加交互式逻辑
- 所有命令的 help 文档大幅增强
- `README.md` 完全重写（Agent 友好）

**octopus 仓库**:
- `src/main/cli-server.ts`:
  - 扩展 `CliTaskInfo` 接口（新增元数据字段）
  - 新增 `handleTaskQuery()` 处理全量查询
  - 云采集识别逻辑
  - 保留已停止任务逻辑
- `src/main/app/AppWindow.ts`: 新增 `getCloudTaskIds()` 方法
- `src/renderer/pages/home/index.tsx`: 新增 `window.__cliQuery.searchTasks()` API 桥接

### 设计决策

**CLI Design Framework 分析** (基于 `/Users/yaohui/.claude/skills/cli-design-framework`):

- **Primary role**: Capability（管理采集任务资源）
- **Primary user**: Human-Primary（以操作员为主，`--json` 和管道为次要自动化路径）
- **Interaction form**: Batch CLI + optional Interactive prompts (v0.3.0)
- **Statefulness**: Stateless（CLI 自身不维护状态）
- **Risk profile**: Mixed（list 只读，start/stop/pause/resume 有副作用）
- **Secondary surfaces**: `--json` 机器可读输出（所有命令均支持）

**交互式启动设计原则**:
1. **条件触发**: 有 flags → 直接执行，无 flags → 交互模式
2. **批量友好**: `--yes` 和 TTY 检测自动跳过交互
3. **Agent 友好**: 详细 help 文档 + 稳定 JSON schema
4. **智能约束**: 根据任务类型动态调整选项（避免无效选择）
5. **Ctrl+C 友好**: `prompts` 库内置优雅退出

## v0.4.0 更新内容（2026-04-22）

### 新增功能

1. **云/本地拆分显示**
   - `task list` 将每个任务拆分为云采集和本地采集两条记录
   - 新增"运行方式"列，显示云采集/本地采集
   - 与 GUI 任务列表的显示逻辑保持一致

2. **`runOn` 字段**
   - `CliTaskInfo` 接口新增 `runOn: 'cloud' | 'local'` 字段
   - JSON 输出包含 `runOn` 字段，便于脚本区分云/本地记录

3. **状态精确映射**
   - 云采集状态映射：CloudStatus → CLI status
   - 本地采集状态映射：RunnerStatus → CLI status
   - 分别展示云和本地的独立状态和数据量

### 技术改动

**octopus 仓库** (`src/main/cli-server.ts`):
- 新增 `CloudStatus` 枚举定义
- 新增 `mapCloudStatus()` 和 `mapLocalStatus()` 状态映射函数
- 新增 `expandTaskToRecords()` 函数，将一个任务展开为云/本地两条记录
- 修改 `task.list` 和 `handleTaskQuery` 使用展开逻辑

**octo-cli 仓库** (`src/index.ts`):
- 新增 `formatRunOn()` 格式化函数
- 表格列定义增加"运行方式"列
- 更新帮助文档示例和字段说明

### 设计决策

**为什么拆分而不是合并？**
- GUI 显示逻辑：同一任务的云/本地数据在状态列渲染为两行（参考 `TaskStatusCol` 组件）
- 数据隔离：云采集和本地采集的状态、数据量、运行时间完全独立
- 用户需求：用户需要分别查看云/本地的采集进度

**拆分的收益**：
- CLI 输出与 GUI 一致，降低用户学习成本
- 支持分别查看云/本地的采集状态和数据量
- `--json` 输出中可通过 `runOn` 字段过滤云/本地记录

**实现要点**：
- 数据源：API 返回一条记录，包含 `taskExecuteStatus`（云）和 `local.Status`（本地）
- 展开时机：在 cli-server.ts 聚合数据时展开，CLI 端直接渲染
- 过滤策略：默认模式只保留有数据的记录（status=running/paused 或 total>0）

## 下一步

### v2 功能规划

1. **task start 确认机制**: 考虑增加 `--wait` 标志，等待任务实际出现在 runnerMap/workflows 中后再返回
2. **任务数据操作**:
   - `task export <taskId>` - 导出任务数据
   - `task data <taskId>` - 查看任务数据预览
3. **任务管理增强**:
   - `task create` - 创建新任务
   - `task delete <taskId>` - 删除任务
   - `task status <taskId>` - 查询单个任务详细状态（含进度条）
   - `task log <taskId>` - 查看任务运行日志
4. **无头引擎启动**: headless engine start（无 GUI 模式）
5. **模板任务 runOn 查询**: 查询模板任务的云采集支持情况
6. **Watch 模式**: `task list --watch` 实时监控任务状态

### 待优化项

1. **交互式启动性能**: 当前先查询 API 再进入交互，可能有延迟
2. **模板任务元数据**: 需要额外查询 `templatesInfo.runOn` 字段
3. **错误处理增强**: 更详细的错误信息和故障排查提示
4. **配置文件支持**: 允许用户保存常用启动参数

## 设计决策记录

### CLI 设计分类 (CLI Design Framework)

| 维度 | 分类 |
|------|------|
| Primary role | Capability（管理任务资源的 CRUD/action） |
| Primary user | Human-Primary → 演进方向 Balanced (v0.3.0 增强 Agent 友好) |
| Interaction form | Batch CLI + optional Interactive prompts (v0.3.0) |
| Statefulness | Stateless（CLI 自身不维护状态） |
| Risk profile | Mixed（list 只读；start/stop/pause/resume 有副作用） |
| Secondary surfaces | `--json` 机器可读输出（所有命令均支持） |

### task start 使用 flags 而非强制交互式

`--cloud` / `--speed` / `--visual` 作为命令行标志传入，交互式为可选模式。原因:
- 符合 Batch CLI 的设计范式
- 便于脚本自动化和管道组合
- 默认值（本地 + 普通 + 内置浏览器）覆盖最常用场景
- v0.3.0 增加交互模式，提升人工操作体验

### task list 双数据源聚合

`cli-server.ts` 聚合 `taskController.list()` (engine层) 和 `appWindow.getRunningTasks()` (窗口层):
- engine tasks 按 base taskId 聚合（去 `-subtaskid-N` 后缀），total 求和，startTime 取最早
- runner tasks 提供 mode/browser 信息 + 旧引擎任务的完整运行时数据
- 云采集任务通过 `cloudPanelMap` 识别
- 原因: 新旧两套引擎共存，数据分布在主进程和渲染进程两侧

### pause/resume/stop 两级 fallback

1. 先 `taskController`（新引擎 workflows Map，主进程内操作）
2. 后 `appWindow.executeRunnerCommand()`（旧引擎，通过 executeJS 调用渲染进程 RunnerStore 方法）
- 原因: 旧引擎任务的 workflow 运行在渲染进程内，主进程 workflows Map 中不存在

### `window.__cliStatus` 桥接模式

在 runner 渲染进程入口挂载全局对象，暴露 MobX store 的 getter 和控制方法:
- 项目已有先例: `window.runnerController`（preload/runner.ts）、`window.__exportServerReadyFired`
- `contextIsolation: false` + `nodeIntegration: true` 确保 executeJS 可访问
- getter 使用 MobX 响应式属性，每次查询获取最新值

### cliStartTask 绕过 showStartTaskDialog

渲染进程的 `cliStartTask` 处理逻辑直接调用 `startLocalRunner` / `startCloudRunnerByTaskId`，跳过了 GUI 中的"启动任务对话框"。CLI 触发的任务启动是静默的，所有配置参数已通过 flags 提供。

### IPC server 生命周期

- `startCliServer()` 在 `app.on('ready')` 中调用，确保 Electron 完全就绪后才接受 CLI 连接
- `stopCliServer()` 在 `app.on('will-quit')` 中调用，确保应用退出前清理 IPC server
- 使用单例模式（`cliIpc` 变量），防止重复启动

### 交互式启动库选择

选择 `prompts` 而非 `inquirer`:
- 体积小（18KB vs 2.5MB）
- TTY 自动检测（管道/重定向时自动跳过）
- Ctrl+C 优雅退出
- TypeScript 类型定义清晰
- CJS+ESM 双支持

### 状态枚举扩展

v0.3.0 扩展状态从 2 种到 5 种:
- 原: `running` / `paused`
- 新增: `idle` / `stopped` / `completed`
- 精确映射 RunnerStatus（0=Idle, 1=Start, 2=Pause, 3=Stop, 4=Complete）
- 原因: 用户需要区分"已停止"和"空闲"状态

### 保留已停止任务

v0.3.0 修复: 不再过滤 status=3/4 的任务
- 问题: 任务停止后，`runningMap` 为空，fallback 到 API 数据（`currentTotalExtractCount=0`）
- 解决: 保留所有 runner 任务，使用 runner 窗口实时 total
- 原因: 已停止任务的窗口未关闭，runner 数据仍然可用且准确

### Help 文档 Agent 友好设计

v0.3.0 大幅增强 help 文档:
- 详细的参数说明和示例
- JSON schema 定义
- 退出码、环境变量说明
- 批量操作示例
- CI/CD 集成示例
- 故障排查指南
- 原因: AI Agent 通过 `--help` 学习工具使用，需要完整上下文
