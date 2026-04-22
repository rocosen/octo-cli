# octo-cli

八爪鱼采集器命令行工具 — 通过终端控制八爪鱼客户端，适用于批量操作、脚本自动化和 AI Agent 集成。

```
CLI (octo-cli)  ──node-ipc──>  八爪鱼客户端 (Electron)  ──>  采集引擎
```

## 特性

- ✅ **交互式操作**：无参数时自动进入交互模式，引导式选择采集参数
- ✅ **脚本友好**：支持 `--json` 输出和管道操作
- ✅ **Agent 友好**：详细的 help 文档和稳定的 JSON schema
- ✅ **双引擎支持**：同时支持新引擎（主进程）和旧引擎（渲染进程）
- ✅ **智能约束**：根据任务类型动态调整可用选项

## 安装

```bash
npm install -g @rocosenyyy/octo-cli
```

安装后即可在终端使用 `octo` 命令。**前置条件**：八爪鱼客户端 v10.0+ 已启动并登录。

## 快速开始

### 人工操作（交互式）

```bash
# 检查客户端是否在线
$ octo ping
客户端运行中

# 列出运行中的任务
$ octo task list
运行中的任务 (2):

  ID              名称                状态    采集量    采集模式    浏览器    耗时
  abc-123         央视新闻搜索        运行中  1,234     本地-加速   独立      5m
  def-456         淘宝商品监控        暂停    567       云采集      -         12m

# 启动任务（交互式选择）
$ octo task start abc123
? 选择采集模式 ❯ 本地采集
? 选择速度模式 ❯ 加速模式
? 选择浏览器 ❯ 独立浏览器
已通知客户端启动本地采集 (加速) (独立浏览器): abc123

# 停止任务
$ octo task stop abc123
任务 abc123 已停止
```

### 脚本操作（自动化）

```bash
# 批量停止所有运行中的任务
octo task ls -q | xargs -I{} octo task stop {}

# 批量启动多个任务（加速模式）
echo -e "task1\ntask2\ntask3" | xargs -I{} octo task start {} --speed --yes

# JSON 输出（Agent/脚本解析）
octo task list --json | jq '.[].taskId'

# CI/CD 环境（禁用交互）
OCTO_NO_INTERACTIVE=1 octo task start abc123 --cloud
```

---

## 命令参考

### `octo ping`

检查八爪鱼客户端是否在线（通过 IPC 连接检测）。

**选项**:
- `--json` — JSON 格式输出

**示例**:
```bash
$ octo ping
客户端运行中

$ octo ping --json
{
  "ok": true,
  "data": {
    "status": "running"
  }
}
```

**退出码**:
- `0` — 客户端在线
- `2` — 客户端未启动或 IPC 连接失败

**用途**:
- 健康检查：监控脚本中检测客户端是否启动
- CI/CD 集成：自动化流程中的前置检查
- 故障排查：确认 IPC 通信是否正常

---

### `octo task list` (别名: `octo task ls`)

列出任务（默认仅显示运行中的任务）。

**选项**:
- `--json` — JSON 格式输出（Agent/脚本友好）
- `-q, --quiet` — 只输出任务 ID（每行一个，便于管道处理）
- `--no-header` — 表格模式不显示表头（便于脚本解析）
- `--all` — 显示所有任务（包含历史已停止任务）
- `--name <keyword>` — 按任务名称模糊搜索
- `--id <taskId>` — 查询指定任务详细信息

**示例**:

```bash
# 基础用法 - 列出运行中任务（表格格式）
$ octo task list
运行中的任务 (2):

  ID          名称              状态    采集量    采集模式    浏览器    耗时
  abc-123     央视新闻搜索      运行中  1,234     本地-加速   独立      5m
  def-456     淘宝商品监控      暂停    567       云采集      -         12m

# 查询所有任务（含历史）
$ octo task list --all

# 按名称搜索
$ octo task list --name "新闻"

# 查询指定任务详情
$ octo task list --id abc-123

# JSON 格式输出（Agent 友好）
$ octo task list --json
[
  {
    "taskId": "abc-123",
    "taskName": "央视新闻搜索",
    "status": "running",
    "total": 1234,
    "mode": "local-speed",
    "browser": "chrome",
    "startTime": "2026-04-22T10:30:00.000Z",
    "taskType": 1,
    "workFlowType": 1,
    "localMapReduce": true,
    "useKernelBrowser": false,
    "useChromeBrowser": true
  }
]

# 只输出任务 ID（管道友好）
$ octo task ls -q
abc-123
def-456

# 批量操作：停止所有任务
$ octo task ls -q | xargs -I{} octo task stop {}
```

**输出字段说明**:

**表格模式列**:
- `ID`: 任务唯一标识符
- `名称`: 任务名称
- `状态`: `idle`（空闲）/ `running`（运行中）/ `paused`（暂停）/ `stopped`（已停止）/ `completed`（已完成）
- `采集量`: 已采集的数据条数
- `采集模式`: `local`（本地普通）/ `local-speed`（本地加速）/ `cloud`（云采集）/ `-`（未运行）
- `浏览器`: `kernel`（内置浏览器）/ `chrome`（独立浏览器）/ `-`（不适用）
- `耗时`: 任务运行时长（s=秒 / m=分钟 / h=小时）

**JSON 模式字段**:
- `taskId`: 任务 ID
- `taskName`: 任务名称
- `status`: 状态（idle/running/paused/stopped/completed）
- `total`: 已采集数据量
- `mode`: 采集模式（local/local-speed/cloud/-）
- `browser`: 浏览器类型（kernel/chrome/-）
- `startTime`: 开始时间（ISO 8601 格式，UTC 时区）
- `taskType`: 任务类型（1=Web, 2=Txt, 3=Excel, 4=Pdf, 5=App, 6=CloudWeb）
- `workFlowType`: 工作流类型（1=自定义, 10=模板任务）
- `localMapReduce`: 是否支持加速模式（boolean）
- `useKernelBrowser`: 是否使用内置浏览器（boolean）
- `useChromeBrowser`: 是否使用独立浏览器（boolean）

**退出码**:
- `0` — 成功
- `1` — 查询失败
- `2` — 客户端未启动

---

### `octo task start <taskId>`

启动采集任务（支持交互式选择或命令行参数）。

**选项**:
- `--cloud` — 使用云采集（默认本地采集）
- `--speed` — 加速模式（仅本地采集有效，需任务支持加速）
- `--visual` — 使用独立浏览器（默认内置浏览器，仅本地采集且非 JSON 任务有效）
- `-y, --yes` — 跳过交互式选择，使用默认值或命令行参数
- `--json` — JSON 格式输出

**使用模式**:

#### 1. 交互式模式（无参数时，TTY 环境）
```bash
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

#### 2. 命令行参数模式（有任意 flag 时直接执行）
```bash
$ octo task start abc123 --cloud
已通知客户端启动云采集: abc123
```

#### 3. 批量操作模式（--yes 跳过交互）
```bash
$ octo task ls -q | xargs -I{} octo task start {} --speed --yes
```

**示例**:

```bash
# 交互式选择（推荐人工操作）
$ octo task start abc123

# 使用默认值（本地+普通+内置浏览器）
$ octo task start abc123 --yes

# 云采集
$ octo task start abc123 --cloud

# 本地加速模式
$ octo task start abc123 --speed

# 本地普通+独立浏览器
$ octo task start abc123 --visual

# 本地加速+独立浏览器
$ octo task start abc123 --speed --visual

# 云采集（批量操作时跳过交互）
$ octo task start abc123 --cloud --yes

# JSON 格式输出
$ octo task start abc123 --cloud --json

# 批量启动（管道自动禁用交互）
$ echo -e "task1\ntask2\ntask3" | xargs -I{} octo task start {} --speed --yes
```

**交互式启动逻辑**:

**何时进入交互模式**:
- 无任何 flag（`--cloud`/`--speed`/`--visual`）
- 且无 `--yes` 标志
- 且在 TTY 环境（非管道/重定向）
- 且环境变量 `OCTO_NO_INTERACTIVE` 未设置

**何时跳过交互（使用默认值或参数）**:
- 有任意 flag（`--cloud`/`--speed`/`--visual`） → 使用指定参数
- 有 `--yes` 标志 → 使用默认值（本地+普通+内置）
- 非 TTY 环境（管道/重定向） → 使用默认值
- 环境变量 `OCTO_NO_INTERACTIVE=1` → 使用默认值

**动态选项（根据任务类型调整）**:
- JSON 任务（Txt/Excel/Pdf）：强制内置浏览器，不显示浏览器选项
- CloudWeb 任务：强制云采集，不显示采集模式选项
- 不支持加速的任务：不显示速度模式选项
- App 任务：不显示浏览器选项

**任务类型约束**:

| taskType | 任务类型 | 采集模式 | 加速模式 | 浏览器选择 |
|----------|---------|---------|---------|----------|
| 1 | Web | 本地/云 | 支持（如配置） | 内置/独立 |
| 2 | Txt | 本地/云 | 支持（如配置） | 强制内置 |
| 3 | Excel | 本地/云 | 支持（如配置） | 强制内置 |
| 4 | Pdf | 本地/云 | 支持（如配置） | 强制内置 |
| 5 | App | 本地/云 | 支持（如配置） | 无浏览器选项 |
| 6 | CloudWeb | 强制云采集 | 无 | 无 |

**环境变量**:
- `OCTO_NO_INTERACTIVE=1` — 强制禁用交互式输入（CI/CD 环境）

**退出码**:
- `0` — 成功通知客户端启动任务
- `1` — 任务不存在、参数错误或启动失败
- `2` — 客户端未启动

**注意事项**:
- 命令只负责通知客户端启动，不等待任务实际启动成功
- 如需确认任务启动，请使用 `octo task list` 检查任务状态
- 交互式模式下，Ctrl+C 可随时取消操作
- 批量操作时务必加 `--yes` 避免卡在交互提示

---

### `octo task stop <taskId>`

停止指定任务（支持新旧引擎，本地/云采集）。

**选项**:
- `--json` — JSON 格式输出

**示例**:
```bash
# 停止单个任务
$ octo task stop abc123
任务 abc123 已停止

# JSON 格式输出
$ octo task stop abc123 --json
{
  "ok": true
}

# 批量停止所有运行中任务
$ octo task ls -q | xargs -I{} octo task stop {}
```

**说明**:
- 支持本地采集和云采集任务
- 支持新引擎（主进程）和旧引擎（渲染进程）
- 命令发送停止指令后立即返回，不等待任务实际停止
- 使用 `octo task list` 检查任务是否已停止

**退出码**:
- `0` — 成功发送停止指令
- `1` — 任务未找到或操作失败
- `2` — 客户端未启动

---

### `octo task pause <taskId>`

暂停指定任务（仅本地采集支持）。

**选项**:
- `--json` — JSON 格式输出

**示例**:
```bash
$ octo task pause abc123
任务 abc123 已暂停
```

**说明**:
- 仅本地采集任务支持暂停/恢复
- 云采集任务不支持暂停，只能停止
- 暂停后数据保留，可使用 `resume` 恢复采集
- 命令立即返回，不等待任务实际暂停

**退出码**:
- `0` — 成功发送暂停指令
- `1` — 任务未找到或操作失败（如云采集任务）
- `2` — 客户端未启动

---

### `octo task resume <taskId>`

恢复已暂停的任务（仅本地采集支持）。

**选项**:
- `--json` — JSON 格式输出

**示例**:
```bash
$ octo task resume abc123
任务 abc123 已恢复
```

**说明**:
- 仅本地采集任务支持恢复
- 只能恢复状态为 `paused`（暂停）的任务
- 已停止（`stopped`）的任务需要重新 `start`
- 命令立即返回，不等待任务实际恢复

**退出码**:
- `0` — 成功发送恢复指令
- `1` — 任务未找到、未暂停或操作失败
- `2` — 客户端未启动

---

## 高级用法

### 批量操作脚本

```bash
#!/bin/bash

# 停止所有运行中的任务
echo "停止所有运行中的任务..."
octo task ls -q | xargs -I{} octo task stop {}

# 批量启动指定任务（加速模式）
tasks=("task-id-1" "task-id-2" "task-id-3")
for task in "${tasks[@]}"; do
  echo "启动任务: $task"
  octo task start "$task" --speed --yes
done

# 监控任务状态
while true; do
  clear
  echo "=== 任务状态 ==="
  octo task list
  sleep 5
done
```

### JSON 解析示例

```bash
# 获取所有运行中任务的 ID
octo task list --json | jq -r '.[].taskId'

# 获取采集量超过 1000 的任务
octo task list --json | jq '.[] | select(.total > 1000) | .taskId'

# 只获取云采集任务
octo task list --json | jq '.[] | select(.mode == "cloud")'

# 格式化输出任务名称和采集量
octo task list --json | jq -r '.[] | "\(.taskName): \(.total) 条"'
```

### CI/CD 集成示例

```yaml
# GitHub Actions 示例
name: Daily Data Collection
on:
  schedule:
    - cron: '0 2 * * *'  # 每天凌晨 2 点

jobs:
  collect:
    runs-on: self-hosted  # 需要自托管 Runner 运行八爪鱼客户端
    steps:
      - name: Check Client Status
        run: |
          if ! octo ping; then
            echo "八爪鱼客户端未启动"
            exit 1
          fi

      - name: Start Collection Tasks
        env:
          OCTO_NO_INTERACTIVE: 1
        run: |
          # 启动多个任务
          octo task start task-id-1 --cloud --yes
          octo task start task-id-2 --speed --yes

      - name: Wait and Check Status
        run: |
          sleep 300  # 等待 5 分钟
          octo task list --json > task-status.json

      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: task-status
          path: task-status.json
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OCTO_NO_INTERACTIVE` | 禁用交互式输入（设置为 `1` 启用） | 未设置 |

---

## Exit Code

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 操作失败（任务未找到、参数错误等） |
| 2 | 连接失败（客户端未启动） |

---

## 故障排查

### 客户端连接失败

**错误**: `连接失败，请确保八爪鱼客户端已启动`

**解决方案**:
1. 确认八爪鱼客户端 v10.0+ 已启动
2. 确认已登录账户
3. 检查 IPC socket: `ls /tmp/ | grep octoparse.cli`
4. 重启客户端

### 任务未找到

**错误**: `任务 xxx 未找到`

**解决方案**:
1. 使用 `octo task list --all` 确认任务 ID 正确
2. 检查任务是否已被删除
3. 使用 `octo task list --id <taskId>` 查看任务详情

### 交互模式卡住

**问题**: 批量操作时卡在交互提示

**解决方案**:
- 使用 `--yes` 标志跳过交互
- 或设置环境变量 `OCTO_NO_INTERACTIVE=1`

---

## 技术细节

### 通信架构

```
CLI (octo-cli)
    ↓ node-ipc (socket: octoparse.cli)
Electron 主进程 (cli-server.ts)
    ↓ IPC / executeJavaScript
渲染进程 (home/runner)
    ↓
采集引擎 (新/旧)
```

### 双引擎支持

| | 新引擎 (`@octopus/engine`) | 旧引擎 (`@octopus/workflow`) |
|---|---|---|
| 运行位置 | 主进程（WorkflowAgent） | 渲染进程（RunnerWindow） |
| 数据存储 | `workflows` Map in engine.ts | `RunnerStore` in runner renderer |
| 任务控制 | `taskController.pause/resume/stop()` | `window.__cliStatus.pause/resume/stop()` |
| 状态查询 | `taskController.list()` | `executeJavaScript` 查询 `__cliStatus` |

### JSON Schema 稳定性

CLI 的 `--json` 输出格式保证向后兼容：
- 新增字段：可能添加新字段，旧代码可忽略
- 字段重命名：会保留旧字段别名
- 字段删除：会提前在 changelog 中标记为 deprecated

---

## 开发

### 从源码安装

```bash
git clone https://github.com/your-org/octo-cli.git
cd octo-cli
npm install
npm run build
npm link
```

### 本地开发

```bash
npm run dev     # 监听模式
npm run build   # 生产构建
npm test        # 运行测试
```

---

## 更新日志

### v0.3.0 (2026-04-22)

- ✨ 新增交互式 `task start` 模式
- ✨ 新增 `--yes/-y` 标志跳过交互
- ✨ 支持任务元数据查询（taskType、localMapReduce 等）
- ✨ 动态调整选项（根据任务类型）
- 🐛 修复 `task list --id` 返回过期数据问题
- 🐛 修复已停止任务显示 total=0 问题
- 📝 大幅增强 help 文档（Agent 友好）

### v0.1.0 (2026-04-20)

- 🎉 初始版本
- ✨ 支持 ping、task list、task start/stop/pause/resume

---

## License

MIT

---

## 相关链接

- 八爪鱼采集器官网: https://www.octoparse.com
- GitHub Issues: https://github.com/your-org/octo-cli/issues
- 技术文档: https://docs.octoparse.com
