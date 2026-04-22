# octo-cli

八爪鱼采集器命令行工具 — 通过终端控制八爪鱼客户端，适用于批量操作和脚本自动化。

```
CLI (octo-cli)  ──node-ipc──>  八爪鱼客户端 (Electron)  ──>  采集引擎
```

## 安装

```bash
npm install -g @rocosenyyy/octo-cli
```

安装后即可在终端使用 `octo` 命令。需要八爪鱼客户端 v10.0+ 同时运行。

## 快速开始

```bash
# 检查客户端是否在线
octo ping

# 列出运行中的任务
octo task list

# 启动采集任务
octo task start <taskId>

# 停止任务
octo task stop <taskId>
```

## 命令

### `octo ping`

检查八爪鱼客户端是否在线。

```bash
octo ping            # 输出: 客户端运行中
octo ping --json     # JSON 格式输出
```

### `octo task list`

列出当前运行中的任务，默认表格显示。

```bash
octo task list              # 表格格式（ID、名称、状态、采集量、模式、耗时）
octo task list --json       # JSON 格式输出
octo task ls -q             # 只输出 taskId（管道友好）
octo task list --no-header  # 表格不显示表头
```

输出示例：

```
运行中的任务 (2):

  ID              名称                        状态      采集量      模式          耗时
  365cae99-...    央视新闻-关键词搜索列表采集    运行中    11          本地          1m
  abc123-...      淘宝商品价格监控              暂停      1,234       本地-加速     12m
```

### `octo task start <taskId>`

启动采集任务。默认：本地采集 + 普通模式 + 内置浏览器。

```bash
octo task start <taskId>                   # 本地 + 普通 + 内置浏览器
octo task start <taskId> --cloud           # 云采集
octo task start <taskId> --speed           # 本地加速模式
octo task start <taskId> --visual          # 独立浏览器
octo task start <taskId> --speed --visual  # 加速 + 独立浏览器
```

### `octo task stop/pause/resume <taskId>`

```bash
octo task stop <taskId>      # 停止任务
octo task pause <taskId>     # 暂停任务
octo task resume <taskId>    # 恢复任务
```

### 通用选项

| 选项 | 说明 |
|------|------|
| `--json` | 所有命令均支持，输出 JSON |
| `-q, --quiet` | `task list` 专用，只输出 taskId |
| `--no-header` | `task list` 专用，不显示表头 |
| `-v, --version` | 输出版本号 |
| `-h, --help` | 显示帮助信息 |

## Exit Code

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 操作失败（任务未找到、参数错误等） |
| 2 | 连接失败（客户端未启动） |

## 脚本示例

```bash
# 停止所有运行中的任务
octo task ls -q | xargs -I{} octo task stop {}

# 检查客户端状态
octo ping --json | jq '.ok'

# 获取所有任务 ID
octo task list --json | jq '.[].taskId'
```

## 前置条件

- Node.js >= 18
- 八爪鱼采集器客户端 v10.0+ 已启动并登录

## License

MIT
