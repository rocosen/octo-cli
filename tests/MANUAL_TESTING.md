# 手动测试指南

本文档列出需要在真实八爪鱼客户端环境下进行的手动测试。

## 前置条件

- 八爪鱼客户端 v10.0+ 已启动并登录
- 有至少 1-2 个测试任务（建议包含云采集和本地采集）
- `octo-cli` 已安装（`npm link` 或 `npm install -g`）

## 基础功能测试

### 1. 连接测试

```bash
# 测试客户端连接
octo ping

# 预期输出
# 客户端运行中

# JSON 格式
octo ping --json

# 预期输出
# {
#   "ok": true,
#   "data": {
#     "status": "running"
#   }
# }
```

**检查点**：
- [ ] 返回成功
- [ ] JSON 格式正确
- [ ] 退出码为 0

### 2. 任务列表测试

```bash
# 列出运行中的任务
octo task list

# 列出所有任务
octo task list --all

# 按名称搜索
octo task list --name "关键词"

# 查询指定任务
octo task list --id <taskId>

# JSON 格式
octo task list --json

# 只输出 ID
octo task ls -q
```

**检查点**：
- [ ] 表格格式正确（包含所有列）
- [ ] 云/本地拆分显示（同一任务两行）
- [ ] JSON 包含所有必需字段
- [ ] `-q` 只输出任务 ID
- [ ] 状态映射正确（idle/running/paused/stopped/completed）

### 3. 任务启动测试

#### 3.1 交互式启动

```bash
# 无参数时进入交互模式
octo task start <taskId>

# 预期：
# ? 选择采集模式
#   ❯ 本地采集
#     云采集
# ? 选择速度模式
#   ❯ 普通模式
#     加速模式
# ? 选择浏览器
#   ❯ 内置浏览器
#     独立浏览器
```

**检查点**：
- [ ] 进入交互模式
- [ ] 选项根据任务类型动态调整
- [ ] JSON 任务强制内置浏览器
- [ ] CloudWeb 任务强制云采集
- [ ] Ctrl+C 可以取消

#### 3.2 命令行参数启动

```bash
# 云采集
octo task start <taskId> --cloud --yes

# 本地加速
octo task start <taskId> --speed --yes

# 本地加速 + 独立浏览器
octo task start <taskId> --speed --visual --yes

# 使用默认值
octo task start <taskId> --yes
```

**检查点**：
- [ ] 所有参数组合都能正常启动
- [ ] JSON 格式输出正确
- [ ] 启动后任务出现在任务列表中

### 4. 任务控制测试

```bash
# 停止任务
octo task stop <taskId>

# 暂停任务（仅本地采集）
octo task pause <taskId>

# 恢复任务（仅本地采集）
octo task resume <taskId>
```

**检查点**：
- [ ] 停止/暂停/恢复成功
- [ ] 状态在任务列表中正确更新
- [ ] 云采集任务不支持暂停（应报错）

### 5. 任务数据测试

```bash
# 查看本次采集数据（默认）
octo task data <taskId>

# 查看全部历史数据
octo task data <taskId> --all

# 查看云采集结果
octo task data <taskId> --run-on cloud

# 同时查询本地和云端
octo task data <taskId> --run-on all

# 分页查询
octo task data <taskId> --limit 50 --offset 100

# 只返回指定字段
octo task data <taskId> --fields 标题,链接,发布时间

# 查看统计信息
octo task data <taskId> --stats

# 查看字段定义
octo task data <taskId> --schema

# JSON 格式
octo task data <taskId> --json
```

**检查点**：
- [ ] 表格格式正确（根据终端宽度自动调整列数）
- [ ] 优先显示重要字段（标题、链接、时间等）
- [ ] `--stats` 显示非空率统计
- [ ] `--schema` 显示字段类型
- [ ] `--fields` 只返回指定字段
- [ ] `--run-on all` 合并本地和云端数据
- [ ] JSON 格式包含所有必需字段

## 批量操作测试

```bash
# 停止所有运行中的任务
octo task ls -q | xargs -I{} octo task stop {}

# 批量启动任务（加速模式）
echo -e "task1\ntask2\ntask3" | xargs -I{} octo task start {} --speed --yes
```

**检查点**：
- [ ] 管道操作正常
- [ ] 批量操作成功
- [ ] 退出码正确

## 错误处理测试

```bash
# 连接失败（关闭客户端后）
octo ping

# 预期：退出码 2，提示"连接失败"

# 参数错误
octo task data test --limit 9999
# 预期：退出码 1，提示错误信息

octo task data test --run-on invalid
# 预期：退出码 1，提示错误信息

# 未知命令
octo unknown-command
# 预期：退出码非 0，提示错误信息
```

**检查点**：
- [ ] 连接失败时退出码为 2
- [ ] 参数错误时退出码为 1
- [ ] 错误信息清晰
- [ ] JSON 模式下错误也是 JSON 格式

## 版本兼容性测试

### v0.4.0 云/本地拆分逻辑

```bash
# 查看任务列表，确认同一任务显示两行
octo task list

# 预期：
# ID          名称              运行方式  状态    采集量    采集模式    浏览器    耗时
# abc-123     央视新闻搜索      云采集    已停止  13        云采集      -         5m
# abc-123     央视新闻搜索      本地      已停止  6         本地        内置      3m
```

**检查点**：
- [ ] 同一任务显示两行（云采集 + 本地采集）
- [ ] 数据量分别显示
- [ ] 状态独立显示

### v0.5.0 task.data 数据范围

```bash
# 默认显示本次采集数据
octo task data <taskId>

# 查看 GUI 中显示的"本次采集"数据量
# 确认 CLI 显示的数量与 GUI 一致
```

**检查点**：
- [ ] 默认显示本次采集数据
- [ ] 与 GUI 显示的数量一致
- [ ] `--all` 显示全部历史数据

## 性能测试

```bash
# 大数据集测试
octo task data <taskId> --limit 1000

# 预期：能正常显示 1000 条数据（表格模式）
```

**检查点**：
- [ ] 表格渲染正常
- [ ] 没有性能问题
- [ ] 超长字段正确截断

## CI/CD 环境测试

```bash
# 禁用交互式输入
OCTO_NO_INTERACTIVE=1 octo task start <taskId> --cloud

# 预期：直接启动，不进入交互模式
```

**检查点**：
- [ ] 环境变量生效
- [ ] 不进入交互模式
- [ ] 批量操作友好

## 测试报告

完成手动测试后，请填写以下表格：

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 连接测试 | ✅ / ❌ | |
| 任务列表 | ✅ / ❌ | |
| 交互式启动 | ✅ / ❌ | |
| 命令行参数启动 | ✅ / ❌ | |
| 任务控制 | ✅ / ❌ | |
| 任务数据 | ✅ / ❌ | |
| 批量操作 | ✅ / ❌ | |
| 错误处理 | ✅ / ❌ | |
| 云/本地拆分 | ✅ / ❌ | |
| 数据范围一致性 | ✅ / ❌ | |

## 问题反馈

如果发现问题，请提供：
1. 命令完整输入
2. 实际输出
3. 预期输出
4. 错误截图（如有）
5. 客户端版本号
