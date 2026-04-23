import { describe, test, expect } from 'vitest';
import Ajv from 'ajv';
import {
  pingResponseSchema,
  taskListResponseSchema,
  taskDataResponseSchema,
  taskDataStatsResponseSchema,
  taskDataSchemaResponseSchema,
} from '../helpers/schemas';
import { mockTasks, mockTaskData, mockTaskDataStats, mockTaskDataSchema } from '../fixtures/mock-tasks';

/**
 * Contract 测试：JSON Schema 验证
 *
 * 注意：这些测试验证 Schema 定义的正确性，以及 mock 数据符合 schema
 * 实际运行 CLI 的测试需要真实的八爪鱼客户端环境
 */

const ajv = new Ajv({ allErrors: true });

describe('Schema 定义验证', () => {
  test('pingResponseSchema 定义正确', () => {
    const validate = ajv.compile(pingResponseSchema);
    expect(validate).toBeDefined();
  });

  test('taskListResponseSchema 定义正确', () => {
    const validate = ajv.compile(taskListResponseSchema);
    expect(validate).toBeDefined();
  });

  test('taskDataResponseSchema 定义正确', () => {
    const validate = ajv.compile(taskDataResponseSchema);
    expect(validate).toBeDefined();
  });

  test('taskDataStatsResponseSchema 定义正确', () => {
    const validate = ajv.compile(taskDataStatsResponseSchema);
    expect(validate).toBeDefined();
  });

  test('taskDataSchemaResponseSchema 定义正确', () => {
    const validate = ajv.compile(taskDataSchemaResponseSchema);
    expect(validate).toBeDefined();
  });
});

describe('Mock 数据符合 Schema', () => {
  test('mockTasks 符合 taskListResponseSchema', () => {
    const validate = ajv.compile(taskListResponseSchema);
    const valid = validate(mockTasks);

    if (!valid) {
      console.error('Schema 验证失败:', validate.errors);
    }

    expect(valid).toBe(true);
  });

  test('mockTaskData 符合 taskDataResponseSchema', () => {
    const validate = ajv.compile(taskDataResponseSchema);
    const valid = validate(mockTaskData);

    if (!valid) {
      console.error('Schema 验证失败:', validate.errors);
    }

    expect(valid).toBe(true);
  });

  test('mockTaskDataStats 符合 taskDataStatsResponseSchema', () => {
    const validate = ajv.compile(taskDataStatsResponseSchema);
    const valid = validate(mockTaskDataStats);

    if (!valid) {
      console.error('Schema 验证失败:', validate.errors);
    }

    expect(valid).toBe(true);
  });

  test('mockTaskDataSchema 符合 taskDataSchemaResponseSchema', () => {
    const validate = ajv.compile(taskDataSchemaResponseSchema);
    const valid = validate(mockTaskDataSchema);

    if (!valid) {
      console.error('Schema 验证失败:', validate.errors);
    }

    expect(valid).toBe(true);
  });
});

describe('Schema 必需字段检查', () => {
  test('taskListResponseSchema 包含所有必需字段', () => {
    const schema = taskListResponseSchema.items;
    const requiredFields = schema.required || [];

    expect(requiredFields).toContain('taskId');
    expect(requiredFields).toContain('taskName');
    expect(requiredFields).toContain('runOn');
    expect(requiredFields).toContain('status');
    expect(requiredFields).toContain('total');
    expect(requiredFields).toContain('mode');
    expect(requiredFields).toContain('browser');
    expect(requiredFields).toContain('startTime');
  });

  test('taskDataResponseSchema 包含所有必需字段', () => {
    const schema = taskDataResponseSchema;
    const requiredFields = schema.required || [];

    expect(requiredFields).toContain('taskId');
    expect(requiredFields).toContain('runOn');
    expect(requiredFields).toContain('total');
    expect(requiredFields).toContain('fields');
    expect(requiredFields).toContain('items');
  });
});

describe('Schema 枚举值检查', () => {
  test('status 枚举值正确', () => {
    const schema = taskListResponseSchema.items.properties.status;
    expect(schema.enum).toEqual(['idle', 'running', 'paused', 'stopped', 'completed']);
  });

  test('runOn 枚举值正确', () => {
    const schema = taskListResponseSchema.items.properties.runOn;
    expect(schema.enum).toEqual(['cloud', 'local']);
  });

  test('mode 枚举值正确', () => {
    const schema = taskListResponseSchema.items.properties.mode;
    expect(schema.enum).toEqual(['local', 'local-speed', 'cloud', '-']);
  });

  test('browser 枚举值正确', () => {
    const schema = taskListResponseSchema.items.properties.browser;
    expect(schema.enum).toEqual(['kernel', 'chrome', '-']);
  });
});
