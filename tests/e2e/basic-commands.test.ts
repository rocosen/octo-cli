import { describe, test, expect } from 'vitest';
import { execSync } from 'child_process';

/**
 * 基础命令测试（不依赖客户端）
 *
 * 这些测试验证 CLI 的基础功能，不需要八爪鱼客户端运行
 */

function execCli(command: string): { code: number; stdout: string } {
  try {
    const stdout = execSync(`node dist/index.js ${command}`, {
      encoding: 'utf-8',
      cwd: '/Users/yaohui/Documents/GitHub/octo-cli',
      stdio: 'pipe',
    });
    return { code: 0, stdout: stdout.trim() };
  } catch (error: any) {
    return {
      code: error.status || 1,
      stdout: error.stdout?.toString() || '',
    };
  }
}

describe('基础命令（不依赖客户端）', () => {
  test('octo --version 返回版本号', () => {
    const result = execCli('--version');
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  test('octo --help 返回帮助信息', () => {
    const result = execCli('--help');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('八爪鱼采集器命令行工具');
    expect(result.stdout).toContain('octo ping');
    expect(result.stdout).toContain('octo task');
  });

  test('octo task --help 返回任务帮助', () => {
    const result = execCli('task --help');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('任务管理');
    expect(result.stdout).toContain('task list');
    expect(result.stdout).toContain('task start');
    expect(result.stdout).toContain('task data');
  });

  test('octo task list --help 返回详细帮助', () => {
    const result = execCli('task list --help');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('列出任务');
    expect(result.stdout).toContain('--json');
    expect(result.stdout).toContain('--all');
  });

  test('octo task data --help 返回详细帮助', () => {
    const result = execCli('task data --help');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('查看任务采集结果');
    expect(result.stdout).toContain('--run-on');
    expect(result.stdout).toContain('--limit');
    expect(result.stdout).toContain('--stats');
    expect(result.stdout).toContain('--schema');
  });

  test('未知命令返回错误', () => {
    const result = execCli('unknown-command');
    expect(result.code).not.toBe(0);
  });
});

describe('参数校验（不依赖客户端）', () => {
  test('task start 缺少 taskId 返回错误', () => {
    const result = execCli('task start');
    expect(result.code).not.toBe(0);
  });

  test('task data --limit 超过最大值返回错误', () => {
    const result = execCli('task data test-task --limit 9999');
    expect(result.code).toBe(1);
  });

  test('task data --offset 负数返回错误', () => {
    const result = execCli('task data test-task --offset -10');
    expect(result.code).toBe(1);
  });

  test('task data --run-on 非法值返回错误', () => {
    const result = execCli('task data test-task --run-on invalid');
    expect(result.code).toBe(1);
  });
});
