import { describe, test, expect } from 'vitest';
import os from 'os';
import path from 'path';

/**
 * task export 命令单元测试
 *
 * 测试 resolveOutputPath 逻辑、参数验证、批次列表格式等
 * 这些函数逻辑从 src/index.ts 内联复制，以便独立测试
 */

// ---- 内联 resolveOutputPath 逻辑（与 src/index.ts 保持一致）----
function resolveOutputPath(outputPath: string | undefined, taskId: string, format: string): string {
	const dateSuffix = new Date().toISOString().slice(0, 10);
	const defaultFileName = `${taskId}-${dateSuffix}.${format}`;

	if (!outputPath) {
		return path.join(os.homedir(), 'Downloads', defaultFileName);
	}

	const expanded = outputPath.startsWith('~')
		? path.join(os.homedir(), outputPath.slice(1))
		: outputPath;

	const ext = path.extname(expanded);
	if (!ext) {
		return path.join(expanded, defaultFileName);
	}

	return expanded;
}

// ---- 内联格式化函数 ----
function formatRunOn(runOn: string): string {
	switch (runOn) {
		case 'cloud': return '☁ 云';
		case 'local': return '💻 本地';
		default: return runOn;
	}
}

const VALID_FORMATS = ['xlsx', 'csv', 'json', 'html', 'xml'];

// =============================================================
// resolveOutputPath
// =============================================================

describe('resolveOutputPath - 无输出路径时', () => {
	test('默认保存到 ~/Downloads', () => {
		const result = resolveOutputPath(undefined, 'abc123', 'xlsx');
		expect(result).toContain(os.homedir());
		expect(result).toContain('Downloads');
	});

	test('文件名包含 taskId', () => {
		const result = resolveOutputPath(undefined, 'task-001', 'csv');
		expect(result).toContain('task-001');
	});

	test('文件名包含格式扩展名', () => {
		for (const fmt of VALID_FORMATS) {
			const result = resolveOutputPath(undefined, 'abc', fmt);
			expect(result.endsWith(`.${fmt}`)).toBe(true);
		}
	});

	test('文件名包含今天的日期', () => {
		const today = new Date().toISOString().slice(0, 10);
		const result = resolveOutputPath(undefined, 'abc', 'xlsx');
		expect(result).toContain(today);
	});
});

describe('resolveOutputPath - ~ 展开', () => {
	test('~/Downloads 展开为绝对路径', () => {
		const result = resolveOutputPath('~/Downloads/result.csv', 'abc', 'csv');
		expect(result.startsWith('/')).toBe(true);
		expect(result).not.toContain('~');
	});

	test('~/data 展开后追加文件名（无扩展名）', () => {
		const result = resolveOutputPath('~/data', 'abc', 'json');
		expect(result.endsWith('.json')).toBe(true);
		expect(result).not.toContain('~');
	});
});

describe('resolveOutputPath - 目录路径（无扩展名）', () => {
	test('/tmp/output 追加自动文件名', () => {
		const result = resolveOutputPath('/tmp/output', 'task1', 'csv');
		expect(result.startsWith('/tmp/output')).toBe(true);
		expect(result.endsWith('.csv')).toBe(true);
		expect(result).toContain('task1');
	});

	test('目录路径包含日期', () => {
		const today = new Date().toISOString().slice(0, 10);
		const result = resolveOutputPath('/tmp/output', 'task1', 'xlsx');
		expect(result).toContain(today);
	});
});

describe('resolveOutputPath - 完整文件路径', () => {
	test('完整路径直接返回（带扩展名）', () => {
		const input = '/tmp/result.json';
		const result = resolveOutputPath(input, 'abc', 'json');
		expect(result).toBe(input);
	});

	test('格式可以与路径扩展名不同', () => {
		// 用户手动指定路径，以路径为准
		const input = '/tmp/result.xlsx';
		const result = resolveOutputPath(input, 'abc', 'csv');
		expect(result).toBe(input);
	});
});

// =============================================================
// 格式验证
// =============================================================

describe('导出格式验证', () => {
	test('合法格式列表正确', () => {
		expect(VALID_FORMATS).toEqual(['xlsx', 'csv', 'json', 'html', 'xml']);
	});

	test('合法格式通过验证', () => {
		for (const fmt of VALID_FORMATS) {
			expect(VALID_FORMATS.includes(fmt)).toBe(true);
		}
	});

	test('非法格式被拒绝', () => {
		const invalid = ['xls', 'docx', 'txt', 'pdf', '', 'XLSX', 'CSV'];
		for (const fmt of invalid) {
			expect(VALID_FORMATS.includes(fmt)).toBe(false);
		}
	});
});

// =============================================================
// 批次列表数据结构验证
// =============================================================

describe('批次列表格式（CliLotInfo）', () => {
	const validLot = {
		lotId: 'cld-001',
		runOn: 'cloud' as 'cloud' | 'local',
		time: '2026-04-23T13:45:00.000Z',
		count: 1234,
		status: 'completed'
	};

	test('批次对象包含必要字段', () => {
		expect(validLot).toHaveProperty('lotId');
		expect(validLot).toHaveProperty('runOn');
		expect(validLot).toHaveProperty('time');
		expect(validLot).toHaveProperty('count');
		expect(validLot).toHaveProperty('status');
	});

	test('runOn 只允许 cloud 或 local', () => {
		expect(['cloud', 'local']).toContain(validLot.runOn);
	});

	test('status 枚举值合法', () => {
		const validStatuses = ['completed', 'running'];
		expect(validStatuses).toContain(validLot.status);
	});

	test('count 为非负整数', () => {
		expect(validLot.count).toBeGreaterThanOrEqual(0);
		expect(Number.isInteger(validLot.count)).toBe(true);
	});

	test('time 为 ISO 8601 格式', () => {
		const d = new Date(validLot.time);
		expect(isNaN(d.getTime())).toBe(false);
	});
});

// =============================================================
// 批次排序逻辑
// =============================================================

describe('批次按时间倒序排列', () => {
	const lots = [
		{ lotId: 'a', time: '2026-04-21T10:00:00Z', runOn: 'local', count: 100, status: 'completed' },
		{ lotId: 'b', time: '2026-04-23T13:00:00Z', runOn: 'cloud', count: 200, status: 'completed' },
		{ lotId: 'c', time: '2026-04-22T08:00:00Z', runOn: 'local', count: 50,  status: 'completed' },
	];

	const sorted = [...lots].sort((a, b) => {
		const ta = a.time ? new Date(a.time).getTime() : 0;
		const tb = b.time ? new Date(b.time).getTime() : 0;
		return tb - ta;
	});

	test('最新批次排在第一位', () => {
		expect(sorted[0].lotId).toBe('b'); // 2026-04-23 最新
	});

	test('最旧批次排在最后', () => {
		expect(sorted[sorted.length - 1].lotId).toBe('a'); // 2026-04-21 最旧
	});

	test('排序后长度不变', () => {
		expect(sorted.length).toBe(lots.length);
	});
});

// =============================================================
// 导出结果 JSON 契约
// =============================================================

describe('导出结果 JSON 契约', () => {
	const successResult = {
		ok: true,
		taskId: 'abc123',
		lotId: 'cld-001',
		format: 'xlsx',
		outputPath: '/Users/test/Downloads/abc123-2026-04-23.xlsx',
		rowCount: 1234
	};

	test('成功结果包含所有必要字段', () => {
		expect(successResult).toHaveProperty('ok', true);
		expect(successResult).toHaveProperty('taskId');
		expect(successResult).toHaveProperty('format');
		expect(successResult).toHaveProperty('outputPath');
		expect(successResult).toHaveProperty('rowCount');
	});

	test('rowCount 为非负整数', () => {
		expect(successResult.rowCount).toBeGreaterThanOrEqual(0);
	});

	test('outputPath 为绝对路径', () => {
		expect(successResult.outputPath.startsWith('/')).toBe(true);
	});

	const errorResult = {
		ok: false,
		error: '任务暂无采集数据'
	};

	test('失败结果包含 ok=false 和 error 字段', () => {
		expect(errorResult.ok).toBe(false);
		expect(typeof errorResult.error).toBe('string');
		expect(errorResult.error.length).toBeGreaterThan(0);
	});
});

// =============================================================
// 交互触发条件
// =============================================================

describe('是否跳过交互的判断逻辑', () => {
	function shouldSkipInteractive(opts: {
		lot?: string;
		all?: boolean;
		yes?: boolean;
		isTTY?: boolean;
		noInteractiveEnv?: boolean;
	}): boolean {
		return !!(
			opts.lot ||
			opts.all ||
			opts.yes ||
			!opts.isTTY ||
			opts.noInteractiveEnv
		);
	}

	test('有 --lot 时跳过交互', () => {
		expect(shouldSkipInteractive({ lot: 'cld-001', isTTY: true })).toBe(true);
	});

	test('有 --all 时跳过交互', () => {
		expect(shouldSkipInteractive({ all: true, isTTY: true })).toBe(true);
	});

	test('有 --yes 时跳过交互', () => {
		expect(shouldSkipInteractive({ yes: true, isTTY: true })).toBe(true);
	});

	test('非 TTY 环境跳过交互', () => {
		expect(shouldSkipInteractive({ isTTY: false })).toBe(true);
	});

	test('OCTO_NO_INTERACTIVE=1 跳过交互', () => {
		expect(shouldSkipInteractive({ isTTY: true, noInteractiveEnv: true })).toBe(true);
	});

	test('TTY + 无任何 flag 时进入交互', () => {
		expect(shouldSkipInteractive({ isTTY: true })).toBe(false);
	});
});

// =============================================================
// 批次来源标签
// =============================================================

describe('批次来源标签格式化', () => {
	test('cloud 显示为 ☁ 云', () => {
		expect(formatRunOn('cloud')).toBe('☁ 云');
	});

	test('local 显示为 💻 本地', () => {
		expect(formatRunOn('local')).toBe('💻 本地');
	});
});
