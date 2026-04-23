/**
 * JSON Schema 定义
 * 用于验证 CLI --json 输出格式
 */

export const pingResponseSchema = {
  type: 'object',
  required: ['ok', 'data'],
  properties: {
    ok: { type: 'boolean', enum: [true] },
    data: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['running'] },
      },
    },
  },
};

export const taskListResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    required: ['taskId', 'taskName', 'runOn', 'status', 'total', 'mode', 'browser', 'startTime'],
    properties: {
      taskId: { type: 'string' },
      taskName: { type: 'string' },
      runOn: { type: 'string', enum: ['cloud', 'local'] },
      status: { type: 'string', enum: ['idle', 'running', 'paused', 'stopped', 'completed'] },
      total: { type: 'number', minimum: 0 },
      mode: { type: 'string', enum: ['local', 'local-speed', 'cloud', '-'] },
      browser: { type: 'string', enum: ['kernel', 'chrome', '-'] },
      startTime: { type: 'string' },
      // 可选字段
      taskType: { type: 'number' },
      workFlowType: { type: 'number' },
      localMapReduce: { type: 'boolean' },
      useKernelBrowser: { type: 'boolean' },
      useChromeBrowser: { type: 'boolean' },
    },
  },
};

export const taskDataResponseSchema = {
  type: 'object',
  required: ['taskId', 'runOn', 'total', 'fields', 'items'],
  properties: {
    taskId: { type: 'string' },
    runOn: { type: 'string', enum: ['local', 'cloud', 'all'] },
    limit: { type: 'number', minimum: 0, maximum: 1000 },
    offset: { type: 'number', minimum: 0 },
    total: { type: 'number', minimum: 0 },
    fields: {
      type: 'array',
      items: { type: 'string' },
    },
    items: {
      type: 'array',
      items: { type: 'object' },
    },
  },
};

export const taskDataStatsResponseSchema = {
  type: 'object',
  required: ['taskId', 'runOn', 'total', 'fields', 'items'],
  properties: {
    taskId: { type: 'string' },
    runOn: { type: 'string', enum: ['local', 'cloud', 'all'] },
    total: { type: 'number', minimum: 0 },
    fields: {
      type: 'array',
      items: { type: 'string' },
    },
    items: {
      type: 'array',
      maxItems: 0, // stats 模式不返回数据
    },
    stats: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        fieldStats: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'nonEmptyRate'],
            properties: {
              name: { type: 'string' },
              nonEmptyRate: { type: 'number', minimum: 0, maximum: 100 },
            },
          },
        },
      },
    },
  },
};

export const taskDataSchemaResponseSchema = {
  type: 'object',
  required: ['taskId', 'runOn', 'total', 'schema'],
  properties: {
    taskId: { type: 'string' },
    runOn: { type: 'string', enum: ['local', 'cloud', 'all'] },
    total: { type: 'number', minimum: 0 },
    schema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          example: {},
        },
      },
    },
  },
};

export const errorResponseSchema = {
  type: 'object',
  required: ['ok', 'error'],
  properties: {
    ok: { type: 'boolean', enum: [false] },
    error: { type: 'string' },
  },
};
