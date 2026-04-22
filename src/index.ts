#!/usr/bin/env node
import { Command } from 'commander';
import { sendRequest, CliError, EXIT_OPERATION_FAILED } from './client';

function padRight(str: string, len: number): string {
	let width = 0;
	for (const ch of str) {
		width += ch.charCodeAt(0) > 0x7f ? 2 : 1;
	}
	if (width >= len) return str;
	return str + ' '.repeat(len - width);
}

function formatElapsed(startTime: string): string {
	if (!startTime) return '-';
	const start = new Date(startTime).getTime();
	if (isNaN(start)) return '-';
	const diff = Math.floor((Date.now() - start) / 1000);
	if (diff < 60) return `${diff}s`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m`;
	return `${Math.floor(diff / 3600)}h${Math.floor((diff % 3600) / 60)}m`;
}

function formatMode(mode: string): string {
	switch (mode) {
		case 'local': return '本地';
		case 'local-speed': return '本地-加速';
		case 'cloud': return '云采集';
		default: return mode;
	}
}

function formatStatus(status: string): string {
	switch (status) {
		case 'running': return '运行中';
		case 'paused': return '暂停';
		default: return status;
	}
}

function formatNumber(n: number): string {
	return n.toLocaleString('en-US');
}

function handleError(err: any): never {
	const code = err instanceof CliError ? err.code : EXIT_OPERATION_FAILED;
	console.error(err.message);
	process.exit(code);
}

const rootHelpText = `
常用操作:
  octo ping                          检查客户端是否在线
  octo task list                     列出运行中的任务
  octo task start <taskId>           启动采集任务
  octo task stop <taskId>            停止任务
  octo task ls -q | xargs -I{} octo task stop {}
                                     停止所有任务

更多帮助:
  octo <command> --help              查看命令详细用法
  octo task <command> --help         查看任务子命令用法

octo-cli v0.1.0 · 通过 node-ipc 与八爪鱼客户端通信`;

const taskHelpText = `
常用操作:
  octo task list                     列出所有运行中的任务
  octo task list --json              JSON 格式输出（管道友好）
  octo task ls -q                    只输出任务 ID
  octo task start <taskId>           本地普通模式启动
  octo task start <taskId> --cloud   云采集模式启动
  octo task start <taskId> --speed   本地加速模式启动
  octo task stop <taskId>            停止任务
  octo task pause <taskId>           暂停任务
  octo task resume <taskId>          恢复任务`;

const program = new Command();

program
	.name('octo')
	.description('八爪鱼采集器命令行工具')
	.version('0.1.0', '-v, --version', '输出版本号')
	.helpOption('-h, --help', '显示帮助信息')
	.addHelpCommand('help [command]', '显示命令帮助')
	.showSuggestionAfterError(true)
	.showHelpAfterError('(使用 --help 查看可用命令)')
	.addHelpText('after', rootHelpText);

// ping
program
	.command('ping')
	.description('检查客户端是否在线')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', '\n示例:\n  $ octo ping\n  $ octo ping --json')
	.action(async (opts) => {
		try {
			const res = await sendRequest({ action: 'ping' });
			if (opts.json) {
				console.log(JSON.stringify(res, null, 2));
				if (!res.ok) process.exit(EXIT_OPERATION_FAILED);
				return;
			}
			if (res.ok) {
				console.log('客户端运行中');
			} else {
				console.error('错误:', res.error);
				process.exit(EXIT_OPERATION_FAILED);
			}
		} catch (err: any) {
			handleError(err);
		}
	});

// task
const task = program
	.command('task')
	.description('任务管理')
	.showSuggestionAfterError(true)
	.showHelpAfterError('(使用 octo task --help 查看可用子命令)')
	.addHelpText('after', taskHelpText);

// task list
task
	.command('list')
	.alias('ls')
	.description('列出运行中的任务')
	.option('--json', 'JSON 格式输出')
	.option('-q, --quiet', '只输出任务 ID')
	.option('--no-header', '不显示表头')
	.addHelpText('after', '\n示例:\n  $ octo task list\n  $ octo task list --json\n  $ octo task ls -q\n  $ octo task list --no-header')
	.action(async (opts) => {
		try {
			const res = await sendRequest({ action: 'task.list' });
			if (!res.ok) {
				if (opts.json) {
					console.log(JSON.stringify(res, null, 2));
				} else {
					console.error('错误:', res.error);
				}
				process.exit(EXIT_OPERATION_FAILED);
			}
			const tasks: any[] = res.data || [];

			if (opts.json) {
				console.log(JSON.stringify(tasks, null, 2));
				return;
			}

			if (opts.quiet) {
				tasks.forEach((t) => console.log(typeof t === 'string' ? t : t.taskId));
				return;
			}

			if (!tasks.length) {
				console.log('当前无运行中的任务');
				return;
			}

			// 兼容旧版服务端返回 string[]
			if (typeof tasks[0] === 'string') {
				console.log(`运行中的任务 (${tasks.length}):\n`);
				tasks.forEach((taskId: string, i: number) => {
					console.log(`  ${i + 1}. ${taskId}`);
				});
				return;
			}

			const cols: { key: string; label: string; width: number; fmt?: (v: any) => string }[] = [
				{ key: 'taskId', label: 'ID', width: 14 },
				{ key: 'taskName', label: '名称', width: 20 },
				{ key: 'status', label: '状态', width: 8, fmt: formatStatus },
				{ key: 'total', label: '采集量', width: 10, fmt: formatNumber },
				{ key: 'mode', label: '模式', width: 12, fmt: formatMode },
				{ key: 'elapsed', label: '耗时', width: 8 },
			];

			// 动态列宽
			for (const col of cols) {
				let maxW = col.width;
				for (const t of tasks) {
					const val = col.key === 'elapsed'
						? formatElapsed(t.startTime)
						: col.fmt ? col.fmt(t[col.key]) : String(t[col.key] ?? '');
					let w = 0;
					for (const ch of val) {
						w += ch.charCodeAt(0) > 0x7f ? 2 : 1;
					}
					if (w > maxW) maxW = w;
				}
				col.width = maxW + 2;
			}

			console.log(`运行中的任务 (${tasks.length}):\n`);

			if (opts.header !== false) {
				console.log('  ' + cols.map(c => padRight(c.label, c.width)).join(''));
			}

			for (const t of tasks) {
				const row = cols.map(col => {
					const val = col.key === 'elapsed'
						? formatElapsed(t.startTime)
						: col.fmt ? col.fmt(t[col.key]) : String(t[col.key] ?? '');
					return padRight(val, col.width);
				}).join('');
				console.log('  ' + row);
			}
		} catch (err: any) {
			handleError(err);
		}
	});

// task start
task
	.command('start <taskId>')
	.description('启动采集任务（默认: 本地 + 普通模式 + 内置浏览器）')
	.option('--cloud', '使用云采集（默认本地采集）')
	.option('--speed', '加速模式')
	.option('--visual', '使用独立浏览器（默认内置浏览器，仅本地采集有效）')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', '\n示例:\n  $ octo task start abc123\n  $ octo task start abc123 --cloud\n  $ octo task start abc123 --speed --visual\n  $ octo task start abc123 --json')
	.action(async (taskId: string, opts: { cloud?: boolean; speed?: boolean; visual?: boolean; json?: boolean }) => {
		try {
			const params: Record<string, any> = { taskId };
			if (opts.cloud) params.cloud = true;
			if (opts.speed) params.speed = true;
			if (opts.visual) params.visual = true;

			const res = await sendRequest({ action: 'task.start', params });
			if (opts.json) {
				console.log(JSON.stringify(res, null, 2));
				if (!res.ok) process.exit(EXIT_OPERATION_FAILED);
				return;
			}
			if (res.ok) {
				const mode = opts.cloud ? '云采集' : '本地采集';
				const speed = opts.speed ? ' (加速)' : '';
				const browser = !opts.cloud && opts.visual ? ' (独立浏览器)' : '';
				console.log(`已通知客户端启动${mode}${speed}${browser}: ${taskId}`);
			} else {
				console.error('错误:', res.error);
				process.exit(EXIT_OPERATION_FAILED);
			}
		} catch (err: any) {
			handleError(err);
		}
	});

// task stop/pause/resume
function taskAction(action: string, successMsg: (taskId: string) => string) {
	return async (taskId: string, opts: { json?: boolean }) => {
		try {
			const res = await sendRequest({ action: `task.${action}`, params: { taskId } });
			if (opts.json) {
				console.log(JSON.stringify(res, null, 2));
				if (!res.ok) process.exit(EXIT_OPERATION_FAILED);
				return;
			}
			if (res.ok) {
				console.log(successMsg(taskId));
			} else {
				console.error('错误:', res.error);
				process.exit(EXIT_OPERATION_FAILED);
			}
		} catch (err: any) {
			handleError(err);
		}
	};
}

task
	.command('stop <taskId>')
	.description('停止指定任务')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', '\n示例:\n  $ octo task stop abc123')
	.action(taskAction('stop', (id) => `任务 ${id} 已停止`));

task
	.command('pause <taskId>')
	.description('暂停指定任务')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', '\n示例:\n  $ octo task pause abc123')
	.action(taskAction('pause', (id) => `任务 ${id} 已暂停`));

task
	.command('resume <taskId>')
	.description('恢复指定任务')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', '\n示例:\n  $ octo task resume abc123')
	.action(taskAction('resume', (id) => `任务 ${id} 已恢复`));

program.parse();
