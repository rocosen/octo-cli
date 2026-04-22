# 八爪鱼 CLI 项目总结

## 项目概述

- **What**: `octo-cli` 是一个终端命令行工具，通过 node-ipc 与八爪鱼 Electron 采集客户端通信，实现任务的远程管理控制。
- **Why**: 允许用户在终端中直接管理采集任务（列表、启动、停止、暂停、恢复），无需操作 GUI 界面。适用于批量操作、脚本自动化等场景。
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
3. 未匹配的 runner 任务作为补充项（旧引擎任务）
4. status 优先用 runner 的（更准确，因为渲染进程直接持有实时状态）

**控制 fallback 策略** (cli-server.ts pause/resume/stop):
1. 先试 `taskController`（新引擎 workflows Map）
2. 失败则 `appWindow.executeRunnerCommand(taskId, command)`（通过 executeJS 调用渲染进程 `__cliStatus` 方法）

## 仓库结构

### octo-cli 仓库

- **路径**: `/Users/yaohui/Documents/GitHub/octo-cli`
- **文件列表**:
  - `package.json` - 项目配置，bin 入口 `octo` 指向 `dist/index.js`
  - `tsconfig.json` - TypeScript 配置，target ES2020，module commonjs
  - `src/index.ts` - CLI 入口，基于 commander 定义所有命令，含表格渲染、格式化工具函数
  - `src/client.ts` - node-ipc 客户端封装，含 `CliError` 类和 exit code 常量
  - `src/types.d.ts` - node-ipc 模块类型声明

### octopus 仓库（客户端改动）

- **路径**: `/Users/yaohui/Documents/GitHub/octopus`
- **分支**: `yh/10.0`
- **修改/新增文件**:
  - `src/main/cli-server.ts` (新文件) - IPC server 端，处理所有 CLI 请求，含双引擎 fallback 逻辑
  - `src/main/main.ts` (已修改) - 引入并启动/停止 CLI server
  - `src/main/ipc/engine.ts` (已修改) - 导出 `taskController` 和 `TaskListItem`，WorkflowEntry 含 totalCount/paused 缓存
  - `src/main/app/AppWindow.ts` (已修改) - 新增 `getRunningTasks()` (async, executeJS 查询) 和 `executeRunnerCommand()`
  - `src/renderer/pages/home/index.tsx` (已修改) - 新增 `cliStartTask` 事件监听
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
| `task.list` | 无 | 聚合 engine + runner 数据，返回结构化任务列表 | `CliTaskInfo[]` |
| `task.start` | `{ taskId, cloud?, speed?, visual? }` | 通过 `mainWindow.webContents.send('cliStartTask', ...)` 发送到渲染进程 | 无 |
| `task.stop` | `{ taskId }` | taskController → fallback executeRunnerCommand | 无 |
| `task.pause` | `{ taskId }` | taskController → fallback executeRunnerCommand | 无 |
| `task.resume` | `{ taskId }` | taskController → fallback executeRunnerCommand | 无 |

### task.list 返回的 CliTaskInfo 结构

```typescript
interface CliTaskInfo {
    taskId: string;                           // 任务 ID
    taskName: string;                         // 任务名称
    status: 'running' | 'paused';             // 运行状态
    total: number;                            // 已采集数据量
    mode: 'local' | 'local-speed' | 'cloud';  // 采集模式
    browser: 'kernel' | 'chrome';             // 浏览器类型
    startTime: string;                        // ISO 格式开始时间
}
```

## 已实现的命令

### `octo ping`
检查八爪鱼客户端是否在线。
```bash
octo ping            # 输出: 客户端运行中
octo ping --json     # JSON 格式输出
```

### `octo task list` (别名: `octo task ls`)
列出当前运行中的任务，默认表格显示。
```bash
octo task list              # 表格格式（ID、名称、状态、采集量、模式、耗时）
octo task list --json       # JSON 格式输出
octo task ls -q             # 只输出 taskId（管道友好）
octo task list --no-header  # 表格不显示表头
```

**表格输出示例**:
```
运行中的任务 (2):

  ID                                    名称                      状态      采集量      模式          耗时
  365cae99-f072-f054-474b-a0c6b54f7472  央视新闻-关键词搜索列表采集  运行中    11          本地          1m
  abc123-def456-789                     淘宝商品价格监控            暂停      1,234       本地-加速     12m
```

### `octo task start <taskId>`
启动采集任务。默认: 本地采集 + 普通模式 + 内置浏览器。
```bash
octo task start abc123                   # 本地 + 普通 + 内置浏览器
octo task start abc123 --cloud           # 云采集
octo task start abc123 --speed           # 本地 + 加速模式
octo task start abc123 --visual          # 本地 + 独立浏览器
octo task start abc123 --speed --visual  # 本地 + 加速 + 独立浏览器
octo task start abc123 --json            # JSON 格式输出
```

### `octo task stop <taskId>`
停止指定任务。支持新旧两套引擎。
```bash
octo task stop abc123
octo task stop abc123 --json
```

### `octo task pause <taskId>`
暂停指定任务。
```bash
octo task pause abc123
```

### `octo task resume <taskId>`
恢复已暂停的任务。
```bash
octo task resume abc123
```

### 通用选项

- `--json` — 所有命令均支持，输出原始 JSON
- `-q, --quiet` — task list 专用，只输出 taskId（每行一个）
- `--no-header` — task list 专用，表格不带表头
- 每个命令的 `--help` 均含使用示例

### Exit Code

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 操作失败（任务未找到、参数错误等） |
| 2 | 连接失败（客户端未启动） |

### 脚本组合示例

```bash
# 停止所有运行中的任务
octo task ls -q | xargs -I{} octo task stop {}

# 检查客户端状态用于监控
octo ping --json | jq '.ok'

# 获取任务列表 JSON 用于后续处理
octo task list --json | jq '.[].taskId'
```

## octopus 客户端改动清单

### 1. `src/main/cli-server.ts` (新文件)
- 完整的 IPC server 实现
- `getMainWindow()`: 查找主窗口（包含 `index.html` 的 BrowserWindow）
- `handleRequest()`: 请求路由，分发到对应 handler
  - `task.list`: 聚合 engine + runner 数据，engine tasks 按 base taskId 聚合（去 subtaskid 后缀），runner 数据通过 async `getRunningTasks()` 获取
  - `task.pause/resume/stop`: 两级查找 — 先 taskController（新引擎），后 executeRunnerCommand（旧引擎）
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

### 5. `src/renderer/pages/home/index.tsx`
- 新增 `useEffect` 监听 `cliStartTask` 事件
  - 云采集: 调用 `startCloudRunnerByTaskId(taskId, false, true)`
  - 本地采集: 调用 `startLocalRunner({ taskId, isSpeedMode, useKernelBrowser, useChromeBrowser, showChromeBrowser })`

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

## 下一步

1. **task start 确认机制**: 考虑增加 `--wait` 标志，等待任务实际出现在 runnerMap/workflows 中后再返回。
2. **v2 功能规划**:
   - `task export` - 导出任务数据
   - `task create` - 创建新任务
   - `task status <taskId>` - 查询单个任务详细状态
   - `task log <taskId>` - 查看任务运行日志
   - 无头引擎启动（headless engine start）

## 设计决策记录

### CLI 设计分类 (CLI Design Framework)

| 维度 | 分类 |
|------|------|
| Primary role | Capability（管理任务资源的 CRUD/action） |
| Primary user | Human-Primary，演进方向 Balanced |
| Interaction form | Batch CLI |
| Statefulness | Stateless（CLI 自身不维护状态） |
| Risk profile | Mixed（list/ping 只读；start/stop/pause/resume 有副作用） |
| Secondary surfaces | `--json` 机器可读输出（所有命令均支持） |

### task start 使用 flags 而非交互式提示
`--cloud` / `--speed` / `--visual` 作为命令行标志传入，而非通过交互式问答。原因:
- 符合 Batch CLI 的设计范式
- 便于脚本自动化和管道组合
- 默认值（本地 + 普通 + 内置浏览器）覆盖最常用场景

### task list 双数据源聚合
`cli-server.ts` 聚合 `taskController.list()` (engine层) 和 `appWindow.getRunningTasks()` (窗口层):
- engine tasks 按 base taskId 聚合（去 `-subtaskid-N` 后缀），total 求和，startTime 取最早
- runner tasks 提供 mode/browser 信息 + 旧引擎任务的完整运行时数据
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
