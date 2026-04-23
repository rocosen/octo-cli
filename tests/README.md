# octo-cli 测试框架

## 概述

octo-cli 使用 **vitest** 作为测试框架，采用 **分层测试策略**，确保 CLI 的稳定性和向后兼容性。

## 测试分层

```
tests/
├── unit/              # 单元测试（格式化函数、工具函数）
├── contract/          # Contract 测试（JSON Schema 验证）
├── helpers/          # 测试工具（Schema 定义）
├── fixtures/         # 测试数据
├── README.md         # 测试文档
└── MANUAL_TESTING.md # 手动测试指南（需要真实客户端环境）
```

### 1. 单元测试（Unit Tests）

**目标**：验证纯函数逻辑

**覆盖内容**：
- 格式化函数（`formatTime`, `formatElapsed`, `formatStatus` 等）
- 工具函数（`padRight`, `getDisplayWidth` 等）
- 状态/模式映射逻辑

**示例**：
```bash
npm run test:unit
```

### 2. Contract 测试（Contract Tests）

**目标**：确保 `--json` 输出格式稳定性

**覆盖内容**：
- JSON Schema 验证（所有 `--json` 命令）
- 字段存在性检查
- 枚举值验证
- 向后兼容性（防止字段删除/重命名）

**重要性**：🔴 **P0 优先级**（防止破坏 Agent/脚本）

**示例**：
```bash
npm run test:contract
```

### 3. 手动测试（Manual Tests）

**目标**：验证需要真实八爪鱼客户端环境的功能

**覆盖内容**：
- 所有命令的 Happy Path
- 交互式启动流程
- 任务控制（start/stop/pause/resume）
- 任务数据查询
- 批量操作
- 错误处理
- 版本兼容性

**文档**：[MANUAL_TESTING.md](./MANUAL_TESTING.md)

**注意**：
- 需要八爪鱼客户端 v10.0+ 已启动并登录
- 需要有测试任务（建议包含云采集和本地采集）
- 每次发布前必须执行完整的手动测试

## 快速开始

### 安装依赖

```bash
npm install
```

### 运行所有测试

```bash
npm test
```

### 运行特定测试

```bash
# 只运行单元测试
npm run test:unit

# 只运行 Contract 测试
npm run test:contract
```

### 监听模式（开发时）

```bash
npm run test:watch
```

### 可视化界面

```bash
npm run test:ui
```

访问 http://localhost:51204/__vitest__/ 查看测试结果

### 覆盖率报告

```bash
npm run test:coverage
```

## 测试工具

### JSON Schema 验证

`tests/helpers/schemas.ts` 定义了所有 `--json` 输出的 Schema。

**示例**：
```typescript
import Ajv from 'ajv';
import { taskListResponseSchema } from '../helpers/schemas';

const ajv = new Ajv();
const validate = ajv.compile(taskListResponseSchema);
const valid = validate(data);

if (!valid) {
  console.error('Schema 验证失败:', validate.errors);
}
```

### 测试数据 Fixtures

`tests/fixtures/mock-tasks.ts` 提供了测试用的 mock 数据。

**示例**：
```typescript
import { mockTasks, mockTaskData } from '../fixtures/mock-tasks';

// 使用 mock 数据进行测试
expect(mockTasks.length).toBeGreaterThan(0);
```

## 编写新测试

### 1. 新增单元测试

在 `tests/unit/` 下创建 `*.test.ts` 文件：

```typescript
import { describe, test, expect } from 'vitest';

describe('新功能', () => {
  test('应该返回正确结果', () => {
    expect(1 + 1).toBe(2);
  });
});
```

### 2. 新增 Contract 测试

1. 在 `tests/helpers/schemas.ts` 中定义 Schema
2. 在 `tests/contract/json-output.test.ts` 中添加测试用例

```typescript
test('新命令 --json 输出符合 schema', () => {
  const result = execCliJson('new-command');
  const validate = ajv.compile(newCommandSchema);
  const valid = validate(result);
  expect(valid).toBe(true);
});
```

### 3. 新增 E2E 测试

在 `tests/e2e/commands.test.ts` 中添加测试用例：

```typescript
describe('E2E: octo new-command', () => {
  test('new-command 返回成功', () => {
    const result = execCli('new-command');
    expect(result.code).toBe(0);
  });
});
```

## CI/CD 集成

在 `.github/workflows/test.yml` 中添加：

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
```

## 测试覆盖率目标

| 层级 | 目标覆盖率 | 优先级 | 当前状态 |
|------|-----------|--------|---------|
| Unit 测试 | 90%（格式化函数） | **P0** | ✅ 24 tests |
| Contract 测试 | 100%（Schema 验证） | **P0** | ✅ 15 tests |
| Manual 测试 | 核心流程 | **P0** | ⏳ 需要手动执行 |

## 常见问题

### Q: 为什么测试需要先 `npm run build`？

A: 因为测试直接执行 `dist/index.js`（编译后的 CLI），确保测试的是实际发布的代码。

### Q: 如何进行完整测试？

A: 自动化测试 + 手动测试：
```bash
# 1. 运行自动化测试
npm test

# 2. 参考 tests/MANUAL_TESTING.md 进行手动测试
```

### Q: 如何调试单个测试？

A: 使用 `vitest` 的 `--reporter=verbose` 模式：
```bash
npx vitest tests/contract/json-output.test.ts --reporter=verbose
```

## 贡献指南

**提交代码前务必运行**：
```bash
npm test
```

**新增功能时，必须同时添加**：
1. Contract 测试（如果有 `--json` 输出，更新 Schema 定义）
2. 手动测试步骤（更新 MANUAL_TESTING.md）

**修复 bug 时，必须添加**：
1. 单元测试（如果是纯函数 bug）
2. 手动测试步骤（验证修复效果）

## 参考资料

- [Vitest 官方文档](https://vitest.dev/)
- [Ajv JSON Schema 验证](https://ajv.js.org/)
- [octo-cli CONTEXT.md](../CONTEXT.md)
