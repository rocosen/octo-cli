import { describe, test, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import Ajv from 'ajv';
import {
  pingResponseSchema,
  taskListResponseSchema,
  taskDataResponseSchema,
} from '../helpers/schemas';

/**
 * 完整的 E2E 测试
 *
 * ⚠️ 注意：这些测试需要八爪鱼客户端运行
 * - 客户端必须已启动并登录
 * - 建议有至少 1-2 个测试任务
 */

const ajv = new Ajv({ allErrors: true });

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function execCli(command: string, expectError = false): CliResult {
  try {
    const stdout = execSync(`node dist/index.js ${command}`, {
      encoding: 'utf-8',
      cwd: '/Users/yaohui/Documents/GitHub/octo-cli',
      stdio: 'pipe',
    });
    return { code: 0, stdout: stdout.trim(), stderr: '' };
  } catch (error: any) {
    if (expectError) {
      return {
        code: error.status || 1,
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || '',
      };
    }
    throw error;
  }
}

function execCliJson(command: string, allowError = false): any {
  const result = execCli(`${command} --json`, allowError);
  if (result.code !== 0) {
    if (allowError) {
      // 尝试解析 stderr 中的 JSON 错误
      try {
        return JSON.parse(result.stdout || result.stderr);
      } catch {
        throw new Error(`Command failed: ${command}\nCode: ${result.code}\nStderr: ${result.stderr}`);
      }
    }
    throw new Error(`Command failed: ${command}\nCode: ${result.code}\nStderr: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

// 检查客户端是否运行
let clientRunning = false;
let firstTaskId: string | undefined;

beforeAll(() => {
  try {
    const result = execCli('ping');
    clientRunning = result.code === 0;
    console.log(`客户端状态: ${clientRunning ? '✅ 运行中' : '❌ 未运行'}`);

    if (clientRunning) {
      // 尝试获取第一个任务 ID
      const tasks = execCliJson('task list --all');
      if (Array.isArray(tasks) && tasks.length > 0) {
        firstTaskId = tasks[0].taskId;
        console.log(`找到测试任务: ${firstTaskId}`);
      }
    }
  } catch (error) {
    console.error('初始化失败:', error);
  }
});

describe('E2E: octo ping', () => {
  test('ping 返回成功', () => {
    if (!clientRunning) {
      console.warn('⚠️ 跳过测试：客户端未运行');
      return;
    }

    const result = execCli('ping');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('客户端运行中');
  });

  test('ping --json 返回正确的 JSON 格式', () => {
    if (!clientRunning) {
      console.warn('⚠️ 跳过测试：客户端未运行');
      return;
    }

    const json = execCliJson('ping');

    // 验证 Schema
    const validate = ajv.compile(pingResponseSchema);
    const valid = validate(json);

    if (!valid) {
      console.error('Schema 验证失败:', validate.errors);
    }

    expect(valid).toBe(true);
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe('running');
  });
});

describe('E2E: octo task list', () => {
  test('task list 返回表格格式或无任务提示', () => {
    if (!clientRunning) {
      console.warn('⚠️ 跳过测试：客户端未运行');
      return;
    }

    const result = execCli('task list');
    expect(result.code).toBe(0);

    // 验证输出是否包含预期内容
    const hasTaskListOutput =
      result.stdout.includes('运行中的任务') ||
      result.stdout.includes('任务列表') ||
      result.stdout.includes('当前无运行中的任务') ||
      result.stdout.includes('未找到');

    expect(hasTaskListOutput).toBe(true);
  });

  test('task list --all 返回表格格式', () => {
    if (!clientRunning) {
      console.warn('⚠️ 跳过测试：客户端未运行');
      return;
    }

    const result = execCli('task list --all');
    expect(result.code).toBe(0);

    // --all 应该返回所有任务，通常会有数据
    if (result.stdout.includes('任务列表') || result.stdout.includes('运行中的任务')) {
      // 验证表格包含列名
      const hasTableHeader =
        result.stdout.includes('ID') &&
        result.stdout.includes('名称') &&
        result.stdout.includes('状态');

      expect(hasTableHeader).toBe(true);
    } else if (result.stdout.includes('未找到')) {
      // 如果真的一个任务都没有，也是可以的
      expect(result.stdout).toContain('未找到');
    }
  });

  test('task list --json 返回正确的 JSON 格式', () => {
    if (!clientRunning) {
      console.warn('⚠️ 跳过测试：客户端未运行');
      return;
    }

    const json = execCliJson('task list');

    // 验证是数组
    expect(Array.isArray(json)).toBe(true);

    if (json.length > 0) {
      // 验证 Schema
      const validate = ajv.compile(taskListResponseSchema);
      const valid = validate(json);

      if (!valid) {
        console.error('Schema 验证失败:', validate.errors);
        console.error('实际数据:', JSON.stringify(json[0], null, 2));
      }

      expect(valid).toBe(true);

      // 验证必需字段
      const firstTask = json[0];
      expect(firstTask).toHaveProperty('taskId');
      expect(firstTask).toHaveProperty('taskName');
      expect(firstTask).toHaveProperty('runOn');
      expect(firstTask).toHaveProperty('status');
      expect(firstTask).toHaveProperty('total');
      expect(firstTask).toHaveProperty('mode');
      expect(firstTask).toHaveProperty('browser');
      expect(firstTask).toHaveProperty('startTime');

      // 验证枚举值
      expect(['cloud', 'local']).toContain(firstTask.runOn);
      expect(['idle', 'running', 'paused', 'stopped', 'completed']).toContain(firstTask.status);
      expect(['local', 'local-speed', 'cloud', '-']).toContain(firstTask.mode);
      expect(['kernel', 'chrome', '-']).toContain(firstTask.browser);
    }
  });

  test('task list -q 只输出任务 ID', () => {
    if (!clientRunning) {
      console.warn('⚠️ 跳过测试：客户端未运行');
      return;
    }

    const result = execCli('task list -q');
    expect(result.code).toBe(0);

    // 验证输出不包含表头
    expect(result.stdout).not.toContain('运行中的任务');
    expect(result.stdout).not.toContain('ID');

    // 如果有任务，验证输出格式（每行一个 ID）
    if (result.stdout.trim()) {
      const lines = result.stdout.trim().split('\n');
      lines.forEach(line => {
        expect(line.length).toBeGreaterThan(0);
        expect(line).not.toContain('  '); // 不应该有多个空格（表格格式）
      });
    }
  });

  test('task list --all 返回所有任务（包含历史）', () => {
    if (!clientRunning) {
      console.warn('⚠️ 跳过测试：客户端未运行');
      return;
    }

    const json = execCliJson('task list --all');
    expect(Array.isArray(json)).toBe(true);

    // 全量查询应该返回更多任务（或至少相同数量）
    const runningOnly = execCliJson('task list');
    expect(json.length).toBeGreaterThanOrEqual(runningOnly.length);
  });

  test('task list --id <taskId> 返回指定任务', () => {
    if (!clientRunning || !firstTaskId) {
      console.warn('⚠️ 跳过测试：客户端未运行或无测试任务');
      return;
    }

    const json = execCliJson(`task list --id ${firstTaskId}`);
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);

    const task = json[0];
    expect(task.taskId).toBe(firstTaskId);

    // 验证元数据字段存在
    expect(task).toHaveProperty('taskType');
    expect(task).toHaveProperty('workFlowType');
  });
});

describe('E2E: octo task data', () => {
  test('task data <id> 返回数据', () => {
    if (!clientRunning || !firstTaskId) {
      console.warn('⚠️ 跳过测试：客户端未运行或无测试任务');
      return;
    }

    const result = execCli(`task data ${firstTaskId}`, true);

    // 可能返回成功（有数据）或失败（无数据）
    if (result.code === 0) {
      expect(result.stdout).toContain('任务');
      expect(result.stdout).toContain(firstTaskId);
    } else {
      // 如果失败，应该有错误信息
      const output = result.stderr || result.stdout;
      expect(output).toContain('错误');

      // 如果是"任务暂无数据"，这是预期的
      if (output.includes('任务暂无数据') || output.includes('查询服务未就绪')) {
        console.warn('⚠️ 任务暂无数据或服务未就绪');
      }
    }
  });

  test('task data <id> --json 返回正确格式', () => {
    if (!clientRunning || !firstTaskId) {
      console.warn('⚠️ 跳过测试：客户端未运行或无测试任务');
      return;
    }

    try {
      const json = execCliJson(`task data ${firstTaskId}`, true);

      // 如果返回错误，检查是否是"无数据"
      if (!json.ok && json.error) {
        if (json.error.includes('任务暂无数据') || json.error.includes('查询服务未就绪')) {
          console.warn('⚠️ 任务暂无数据或服务未就绪，跳过测试');
          return;
        }
        throw new Error(`查询失败: ${json.error}`);
      }

      // 验证 Schema
      const validate = ajv.compile(taskDataResponseSchema);
      const valid = validate(json);

      if (!valid) {
        console.error('Schema 验证失败:', validate.errors);
        console.error('实际数据:', JSON.stringify(json, null, 2));
      }

      expect(valid).toBe(true);

      // 验证必需字段
      expect(json).toHaveProperty('taskId');
      expect(json).toHaveProperty('runOn');
      expect(json).toHaveProperty('total');
      expect(json).toHaveProperty('fields');
      expect(json).toHaveProperty('items');

      expect(json.taskId).toBe(firstTaskId);
      expect(['local', 'cloud', 'all']).toContain(json.runOn);
      expect(Array.isArray(json.fields)).toBe(true);
      expect(Array.isArray(json.items)).toBe(true);
    } catch (error: any) {
      if (error.message.includes('任务暂无数据') || error.message.includes('查询服务未就绪')) {
        console.warn('⚠️ 任务暂无数据，跳过测试');
      } else {
        throw error;
      }
    }
  });

  test('task data --run-on cloud 查询云端数据', () => {
    if (!clientRunning || !firstTaskId) {
      console.warn('⚠️ 跳过测试：客户端未运行或无测试任务');
      return;
    }

    try {
      const json = execCliJson(`task data ${firstTaskId} --run-on cloud`, true);
      if (!json.ok && json.error?.includes('任务暂无数据')) {
        console.warn('⚠️ 任务暂无数据，跳过测试');
        return;
      }
      expect(json.runOn).toBe('cloud');
    } catch (error: any) {
      if (error.message.includes('任务暂无数据') || error.message.includes('查询服务未就绪')) {
        console.warn('⚠️ 任务暂无数据，跳过测试');
      } else {
        throw error;
      }
    }
  });

  test('task data --limit 10 限制返回条数', () => {
    if (!clientRunning || !firstTaskId) {
      console.warn('⚠️ 跳过测试：客户端未运行或无测试任务');
      return;
    }

    try {
      const json = execCliJson(`task data ${firstTaskId} --limit 10`, true);
      if (!json.ok && json.error?.includes('任务暂无数据')) {
        console.warn('⚠️ 任务暂无数据，跳过测试');
        return;
      }
      expect(json.items.length).toBeLessThanOrEqual(10);
    } catch (error: any) {
      if (error.message.includes('任务暂无数据') || error.message.includes('查询服务未就绪')) {
        console.warn('⚠️ 任务暂无数据，跳过测试');
      } else {
        throw error;
      }
    }
  });

  test('task data --stats 返回统计信息', () => {
    if (!clientRunning || !firstTaskId) {
      console.warn('⚠️ 跳过测试：客户端未运行或无测试任务');
      return;
    }

    try {
      const json = execCliJson(`task data ${firstTaskId} --stats`, true);
      if (!json.ok && json.error?.includes('任务暂无数据')) {
        console.warn('⚠️ 任务暂无数据，跳过测试');
        return;
      }
      expect(json).toHaveProperty('stats');
      expect(json.items).toEqual([]);
    } catch (error: any) {
      if (error.message.includes('任务暂无数据') || error.message.includes('查询服务未就绪')) {
        console.warn('⚠️ 任务暂无数据，跳过测试');
      } else {
        throw error;
      }
    }
  });

  test('task data --schema 返回字段定义', () => {
    if (!clientRunning || !firstTaskId) {
      console.warn('⚠️ 跳过测试：客户端未运行或无测试任务');
      return;
    }

    try {
      const json = execCliJson(`task data ${firstTaskId} --schema`, true);
      if (!json.ok && json.error?.includes('任务暂无数据')) {
        console.warn('⚠️ 任务暂无数据，跳过测试');
        return;
      }
      expect(json).toHaveProperty('schema');
      expect(Array.isArray(json.schema)).toBe(true);
    } catch (error: any) {
      if (error.message.includes('任务暂无数据') || error.message.includes('查询服务未就绪')) {
        console.warn('⚠️ 任务暂无数据，跳过测试');
      } else {
        throw error;
      }
    }
  });
});

describe('E2E: 参数校验', () => {
  test('task data --limit 超过最大值返回错误', () => {
    const result = execCli('task data test-id --limit 9999', true);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('错误');
  });

  test('task data --offset 负数返回错误', () => {
    const result = execCli('task data test-id --offset -10', true);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('错误');
  });

  test('task data --run-on 非法值返回错误', () => {
    const result = execCli('task data test-id --run-on invalid', true);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('错误');
  });
});

describe('E2E: 云/本地拆分逻辑', () => {
  test('同一任务应显示云采集和本地采集两条记录', () => {
    if (!clientRunning) {
      console.warn('⚠️ 跳过测试：客户端未运行');
      return;
    }

    const json = execCliJson('task list --all');

    if (json.length === 0) {
      console.warn('⚠️ 无任务，跳过测试');
      return;
    }

    // 统计每个 taskId 的记录数
    const taskCounts = new Map<string, number>();
    json.forEach((task: any) => {
      const count = taskCounts.get(task.taskId) || 0;
      taskCounts.set(task.taskId, count + 1);
    });

    // 检查是否有任务被拆分为多条记录
    const hasSplitTask = Array.from(taskCounts.values()).some(count => count > 1);

    if (hasSplitTask) {
      // 验证拆分的任务有不同的 runOn 值
      const taskGroups = new Map<string, any[]>();
      json.forEach((task: any) => {
        const group = taskGroups.get(task.taskId) || [];
        group.push(task);
        taskGroups.set(task.taskId, group);
      });

      taskGroups.forEach((group, taskId) => {
        if (group.length > 1) {
          const runOnValues = group.map(t => t.runOn);
          // 同一任务的多条记录应该有不同的 runOn 值
          expect(new Set(runOnValues).size).toBe(group.length);
        }
      });
    }
  });
});

describe('E2E: 退出码验证', () => {
  test('成功命令返回退出码 0', () => {
    if (!clientRunning) {
      console.warn('⚠️ 跳过测试：客户端未运行');
      return;
    }

    const result = execCli('ping');
    expect(result.code).toBe(0);
  });

  test('参数错误返回退出码 1', () => {
    const result = execCli('task data test --limit 9999', true);
    expect(result.code).toBe(1);
  });

  test('--version 返回退出码 0', () => {
    const result = execCli('--version');
    expect(result.code).toBe(0);
  });

  test('--help 返回退出码 0', () => {
    const result = execCli('--help');
    expect(result.code).toBe(0);
  });
});
