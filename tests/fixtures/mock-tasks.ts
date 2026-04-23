/**
 * Mock 任务数据
 * 用于测试
 */

export const mockTasks = [
  {
    taskId: 'test-task-001',
    taskName: '央视新闻搜索',
    runOn: 'local',
    status: 'running',
    total: 1234,
    mode: 'local-speed',
    browser: 'chrome',
    startTime: '2026-04-23T10:00:00.000Z',
    taskType: 1,
    workFlowType: 1,
    localMapReduce: true,
    useKernelBrowser: false,
    useChromeBrowser: true,
  },
  {
    taskId: 'test-task-001',
    taskName: '央视新闻搜索',
    runOn: 'cloud',
    status: 'stopped',
    total: 567,
    mode: 'cloud',
    browser: '-',
    startTime: '2026-04-23T10:00:00.000Z',
    taskType: 1,
    workFlowType: 1,
    localMapReduce: true,
    useKernelBrowser: false,
    useChromeBrowser: true,
  },
  {
    taskId: 'test-task-002',
    taskName: '淘宝商品监控',
    runOn: 'local',
    status: 'paused',
    total: 89,
    mode: 'local',
    browser: 'kernel',
    startTime: '2026-04-23T11:30:00.000Z',
    taskType: 1,
    workFlowType: 1,
    localMapReduce: false,
    useKernelBrowser: true,
    useChromeBrowser: false,
  },
];

export const mockTaskData = {
  taskId: 'test-task-001',
  runOn: 'local',
  limit: 20,
  offset: 0,
  total: 1234,
  fields: ['标题', '链接', '发布时间'],
  items: [
    {
      标题: '示例新闻标题 1',
      链接: 'https://example.com/news/1',
      发布时间: '2026-04-23',
    },
    {
      标题: '示例新闻标题 2',
      链接: 'https://example.com/news/2',
      发布时间: '2026-04-22',
    },
  ],
};

export const mockTaskDataStats = {
  taskId: 'test-task-001',
  runOn: 'local',
  total: 1234,
  fields: ['标题', '链接', '发布时间'],
  items: [],
  stats: {
    total: 1234,
    fieldStats: [
      { name: '标题', nonEmptyRate: 100 },
      { name: '链接', nonEmptyRate: 98.5 },
      { name: '发布时间', nonEmptyRate: 95.2 },
    ],
  },
};

export const mockTaskDataSchema = {
  taskId: 'test-task-001',
  runOn: 'local',
  total: 1234,
  schema: [
    { name: '标题', type: 'string', example: '示例新闻标题 1' },
    { name: '链接', type: 'string', example: 'https://example.com/news/1' },
    { name: '发布时间', type: 'string', example: '2026-04-23' },
  ],
};
