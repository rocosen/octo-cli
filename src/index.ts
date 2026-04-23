#!/usr/bin/env node
import { Command } from 'commander';
import { sendRequest, CliError, EXIT_OPERATION_FAILED } from './client';
import { version } from '../package.json';
import prompts from 'prompts';

function padRight(str: string, len: number): string {
	let width = 0;
	for (const ch of str) {
		width += ch.charCodeAt(0) > 0x7f ? 2 : 1;
	}
	if (width >= len) return str;
	return str + ' '.repeat(len - width);
}

function formatTime(dateStr: string): string {
	if (!dateStr) return '-';
	const d = new Date(dateStr);
	if (isNaN(d.getTime())) return '-';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
		case '-': return '-';
		default: return mode;
	}
}

function formatBrowser(browser: string): string {
	switch (browser) {
		case 'kernel': return '内置';
		case 'chrome': return '独立';
		case '-': return '-';
		default: return browser;
	}
}

function formatRunOn(runOn: string): string {
	switch (runOn) {
		case 'cloud': return '云采集';
		case 'local': return '本地采集';
		case 'all': return '本地+云采集';
		default: return runOn;
	}
}

function formatStatus(status: string): string {
	switch (status) {
		case 'idle': return '空闲';
		case 'running': return '运行中';
		case 'paused': return '暂停';
		case 'stopped': return '已停止';
		case 'completed': return '已完成';
		default: return status;
	}
}

function formatNumber(n: number): string {
	return n.toLocaleString('en-US');
}

function getDisplayWidth(str: string): number {
	let width = 0;
	for (const ch of str) {
		width += ch.charCodeAt(0) > 0x7f ? 2 : 1;
	}
	return width;
}

const FIELD_PRIORITY = [
	'title', 'url', 'name', 'id',
	'time', 'date', 'publishTime', '发布时间',
	'price', 'amount', '价格',
	'status', 'state', '状态',
	'content', 'description', '内容', '简介'
];

const MIN_TABLE_COLUMN_WIDTH = 15;
const MAX_TABLE_COLUMN_WIDTH = 30;
const MAX_TABLE_COLUMNS = 6;

function getFieldPriorityIndex(field: string): number {
	const normalized = field.toLowerCase();
	return FIELD_PRIORITY.findIndex((keyword) => normalized.includes(keyword.toLowerCase()));
}

function selectDisplayFields(allFields: string[], maxCols: number = 5, preserveOrder = false): string[] {
	if (preserveOrder) return allFields.slice(0, maxCols);

	const prioritized = allFields
		.map((field, index) => ({ field, index, priorityIndex: getFieldPriorityIndex(field) }))
		.sort((a, b) => {
			const aPriority = a.priorityIndex === -1 ? Number.MAX_SAFE_INTEGER : a.priorityIndex;
			const bPriority = b.priorityIndex === -1 ? Number.MAX_SAFE_INTEGER : b.priorityIndex;
			return aPriority - bPriority || a.index - b.index;
		});

	return prioritized.slice(0, maxCols).map((item) => item.field);
}

function getMaxColumns(terminalWidth: number, fieldCount: number): number {
	const maxColsByWidth = Math.max(1, Math.floor(terminalWidth / MIN_TABLE_COLUMN_WIDTH) - 1);
	return Math.max(1, Math.min(maxColsByWidth, fieldCount, MAX_TABLE_COLUMNS));
}

function getMaxColumnWidth(terminalWidth: number, columnCount: number): number {
	const availableWidth = Math.max(terminalWidth - 4, MIN_TABLE_COLUMN_WIDTH);
	return Math.max(
		MIN_TABLE_COLUMN_WIDTH,
		Math.min(MAX_TABLE_COLUMN_WIDTH, Math.floor(availableWidth / Math.max(1, columnCount)) - 1)
	);
}

function stringifyFieldValue(value: any): string {
	if (value === null || value === undefined) return '-';
	if (typeof value === 'string') return value;
	try {
		const json = JSON.stringify(value);
		if (json !== undefined) return json;
	} catch {
		// Fallback to String(value) for values that JSON.stringify cannot serialize.
	}
	return String(value);
}

function formatFieldValue(value: any, maxWidth: number): string {
	const text = stringifyFieldValue(value);
	if (getDisplayWidth(text) <= maxWidth) return text;

	let width = 0;
	let out = '';
	for (const ch of text) {
		const chWidth = ch.charCodeAt(0) > 0x7f ? 2 : 1;
		if (width + chWidth > Math.max(0, maxWidth - 3)) break;
		out += ch;
		width += chWidth;
	}
	return out + '...';
}

function handleError(err: any): never {
	const code = err instanceof CliError ? err.code : EXIT_OPERATION_FAILED;
	console.error(err.message);
	process.exit(code);
}

function resolveOutputPath(outputPath: string | undefined, taskId: string, format: string): string {
	const os = require('os');
	const path = require('path');
	const dateSuffix = new Date().toISOString().slice(0, 10);
	const defaultFileName = `${taskId}-${dateSuffix}.${format}`;

	if (!outputPath) {
		return path.join(os.homedir(), 'Downloads', defaultFileName);
	}

	// ~ 展开
	const expanded = outputPath.startsWith('~')
		? path.join(os.homedir(), outputPath.slice(1))
		: outputPath;

	// 如果是目录路径（无扩展名），自动追加文件名
	const ext = path.extname(expanded);
	if (!ext) {
		return path.join(expanded, defaultFileName);
	}

	return expanded;
}

const rootHelpText = `
常用操作:
  octo ping                                    检查客户端是否在线
  octo task list                               列出运行中的任务
  octo task start <taskId>                     启动采集任务（交互式选择）
  octo task start <taskId> --cloud --yes       云采集模式（跳过交互）
  octo task stop <taskId>                      停止任务
  octo task pause <taskId>                     暂停任务
  octo task resume <taskId>                    恢复任务
  octo task data <taskId>                      查看任务采集结果数据
  octo task export <taskId> --yes              导出最新批次数据到 ~/Downloads

批量操作示例:
  # 停止所有运行中的任务
  octo task ls -q | xargs -I{} octo task stop {}

  # 批量启动任务（加速模式）
  octo task ls -q | xargs -I{} octo task start {} --speed --yes

JSON 输出（Agent/脚本友好）:
  octo ping --json                             JSON 格式状态
  octo task list --json                        JSON 格式任务列表
  octo task start <taskId> --cloud --json      JSON 格式启动结果

环境变量:
  OCTO_NO_INTERACTIVE=1    禁用交互式输入（CI/CD 环境）

退出码:
  0  成功
  1  操作失败（任务未找到、参数错误等）
  2  连接失败（客户端未启动）

更多帮助:
  octo <command> --help                        查看命令详细用法
  octo task <command> --help                   查看任务子命令用法

版本: v${version}
通信方式: node-ipc (socket: octoparse.cli)
项目主页: https://github.com/your-org/octo-cli`;

const taskHelpText = `
任务列表查询:
  octo task list                              列出运行中的任务（表格格式）
  octo task list --all                        列出所有任务（含历史任务）
  octo task list --name "关键词"               按任务名称模糊搜索
  octo task list --id <taskId>                查询指定任务详情
  octo task ls -q                             只输出任务 ID（管道友好）
  octo task list --json                       JSON 格式输出（Agent 友好）
  octo task list --no-header                  表格无表头（脚本解析）

任务启动（交互式 + 命令行参数）:
  octo task start <taskId>                    交互式选择采集模式/速度/浏览器
  octo task start <taskId> --yes              使用默认值（本地+普通+内置浏览器）
  octo task start <taskId> --cloud            云采集模式
  octo task start <taskId> --speed            本地加速模式
  octo task start <taskId> --visual           使用独立浏览器（仅本地采集）
  octo task start <taskId> --speed --visual   本地加速+独立浏览器
  octo task start <taskId> --cloud --yes      云采集（跳过交互，批量操作用）
  octo task start <taskId> --export           启动任务并在完成后自动导出 xlsx
  octo task start <taskId> --export --export-format csv  完成后自动导出 CSV
  octo task start <taskId> --export --export-output ~/data  导出到指定目录

任务控制:
  octo task stop <taskId>                     停止指定任务
  octo task pause <taskId>                    暂停指定任务
  octo task resume <taskId>                   恢复已暂停的任务
  octo task data <taskId>                     查看任务采集结果数据
  octo task export <taskId>                   导出任务数据到本地文件（交互式）
  octo task export <taskId> --yes             导出最新批次到 ~/Downloads（无交互）
  octo task export <taskId> --format csv --yes  导出 CSV 格式
  octo task export <taskId> --list-lots       列出所有可用批次

批量操作示例:
  # 查询所有运行中任务的 ID
  octo task ls -q

  # 停止所有运行中任务
  octo task ls -q | xargs -I{} octo task stop {}

  # 批量启动多个任务（加速模式）
  echo "task-id-1\ntask-id-2" | xargs -I{} octo task start {} --speed --yes

JSON 输出格式说明:
  task list --json  返回数组，每项包含:
    - taskId: 任务 ID
    - taskName: 任务名称
    - status: 状态（idle/running/paused/stopped/completed）
    - total: 已采集数据量
    - mode: 采集模式（local/local-speed/cloud/-）
    - browser: 浏览器类型（kernel/chrome/-）
    - startTime: 开始时间（ISO 8601 格式）
    - taskType: 任务类型（1=Web, 2=Txt, 3=Excel, 4=Pdf, 5=App, 6=CloudWeb）
    - localMapReduce: 是否支持加速模式（boolean）

交互式启动注意事项:
  - 无参数时进入交互模式（TTY 环境）
  - 管道/重定向时自动跳过交互，使用默认值
  - 环境变量 OCTO_NO_INTERACTIVE=1 强制禁用交互
  - JSON 任务（Txt/Excel/Pdf）强制使用内置浏览器
  - CloudWeb 任务强制使用云采集
  - 不支持加速的任务不显示加速选项`;

const program = new Command();

program
	.name('octo')
	.description('八爪鱼采集器命令行工具')
	.version(version, '-v, --version', '输出版本号')
	.helpOption('-h, --help', '显示帮助信息')
	.addHelpCommand('help [command]', '显示命令帮助')
	.showSuggestionAfterError(true)
	.showHelpAfterError('(使用 --help 查看可用命令)')
	.addHelpText('after', rootHelpText);

// ping
program
	.command('ping')
	.description('检查八爪鱼客户端是否在线（通过 IPC 连接检测）')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', `
示例:
  $ octo ping
  客户端运行中

  $ octo ping --json
  {
    "ok": true,
    "data": {
      "status": "running"
    }
  }

用途:
  - 健康检查：监控脚本中检测客户端是否启动
  - CI/CD 集成：自动化流程中的前置检查
  - 故障排查：确认 IPC 通信是否正常

退出码:
  0  客户端在线
  2  客户端未启动或 IPC 连接失败`)
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
	.description('列出任务（默认仅显示运行中的任务）')
	.option('--json', 'JSON 格式输出（Agent/脚本友好）')
	.option('-q, --quiet', '只输出任务 ID（每行一个，便于管道处理）')
	.option('--no-header', '表格模式不显示表头（便于脚本解析）')
	.option('--all', '显示所有任务（包含历史已停止任务）')
	.option('--name <keyword>', '按任务名称模糊搜索')
	.option('--id <taskId>', '查询指定任务详细信息')
	.addHelpText('after', `
示例:

  # 基础用法 - 列出运行中任务（表格格式）
  $ octo task list
  运行中的任务 (4):

    ID                                    名称              运行方式  状态    采集量    采集模式    浏览器    耗时
    abc-123                               央视新闻搜索      云采集    已停止  13        云采集      -         5m
    abc-123                               央视新闻搜索      本地      已停止  6         本地        内置      3m
    def-456                               淘宝商品监控      云采集    运行中  1,234     云采集      -         12m
    def-456                               淘宝商品监控      本地      暂停    567       本地-加速   独立      8m

  # 查询所有任务（含历史）
  $ octo task list --all

  # 按名称搜索
  $ octo task list --name "新闻"

  # 查询指定任务详情
  $ octo task list --id abc-123

  # JSON 格式输出（Agent 友好）
  $ octo task list --json
  [
    {
      "taskId": "abc-123",
      "taskName": "央视新闻搜索",
      "status": "running",
      "total": 1234,
      "mode": "local-speed",
      "browser": "chrome",
      "startTime": "2026-04-22T10:30:00.000Z",
      "taskType": 1,
      "localMapReduce": true,
      "useKernelBrowser": false,
      "useChromeBrowser": true
    }
  ]

  # 只输出任务 ID（管道友好）
  $ octo task ls -q
  abc-123
  def-456

  # 批量操作：停止所有任务
  $ octo task ls -q | xargs -I{} octo task stop {}

输出字段说明:
  表格模式列:
    - ID: 任务唯一标识符
    - 名称: 任务名称
    - 运行方式: cloud（云采集）/ local（本地采集）
    - 状态: idle（空闲）/ running（运行中）/ paused（暂停）/ stopped（已停止）/ completed（已完成）
    - 采集量: 已采集的数据条数
    - 采集模式: local（本地普通）/ local-speed（本地加速）/ cloud（云采集）/ -（未运行）
    - 浏览器: kernel（内置浏览器）/ chrome（独立浏览器）/ -（不适用）
    - 耗时: 任务运行时长（s=秒 / m=分钟 / h=小时）

  JSON 模式字段:
    - taskId: 任务 ID
    - taskName: 任务名称
    - runOn: 运行方式（cloud=云采集 / local=本地采集）
    - status: 状态（idle/running/paused/stopped/completed）
    - total: 已采集数据量
    - mode: 采集模式（local/local-speed/cloud/-）
    - browser: 浏览器类型（kernel/chrome/-）
    - startTime: 开始时间（ISO 8601 格式，UTC 时区）
    - taskType: 任务类型（1=Web, 2=Txt, 3=Excel, 4=Pdf, 5=App, 6=CloudWeb）
    - workFlowType: 工作流类型（1=自定义, 10=模板任务, ...）
    - localMapReduce: 是否支持加速模式（boolean）
    - useKernelBrowser: 是否使用内置浏览器（boolean）
    - useChromeBrowser: 是否使用独立浏览器（boolean）

退出码:
  0  成功
  1  查询失败
  2  客户端未启动`)
	.action(async (opts) => {
		try {
			const params: Record<string, any> = {};
			if (opts.all) params.all = true;
			if (opts.name) params.keyword = opts.name;
			if (opts.id) params.taskId = opts.id;
			const hasQuery = opts.all || opts.name || opts.id;

			const res = await sendRequest({ action: 'task.list', params: Object.keys(params).length ? params : undefined });
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
				console.log(hasQuery ? '未找到匹配的任务' : '当前无运行中的任务');
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
				{ key: 'runOn', label: '运行方式', width: 10, fmt: formatRunOn },
				{ key: 'status', label: '状态', width: 8, fmt: formatStatus },
				{ key: 'total', label: '采集量', width: 10, fmt: formatNumber },
				{ key: 'mode', label: '采集模式', width: 12, fmt: formatMode },
				{ key: 'browser', label: '浏览器', width: 8, fmt: formatBrowser },
				{ key: 'elapsed', label: hasQuery ? '更新时间' : '耗时', width: hasQuery ? 20 : 8 },
			];

			// 动态列宽
			for (const col of cols) {
				let maxW = col.width;
				for (const t of tasks) {
					const val = col.key === 'elapsed'
						? (hasQuery ? formatTime(t.startTime) : formatElapsed(t.startTime))
						: col.fmt ? col.fmt(t[col.key]) : String(t[col.key] ?? '');
					let w = 0;
					for (const ch of val) {
						w += ch.charCodeAt(0) > 0x7f ? 2 : 1;
					}
					if (w > maxW) maxW = w;
				}
				col.width = maxW + 2;
			}

			const title = hasQuery ? `任务列表 (${tasks.length})` : `运行中的任务 (${tasks.length})`;
			console.log(`${title}:\n`);

			if (opts.header !== false) {
				console.log('  ' + cols.map(c => padRight(c.label, c.width)).join(''));
			}

			for (const t of tasks) {
				const row = cols.map(col => {
					const val = col.key === 'elapsed'
						? (hasQuery ? formatTime(t.startTime) : formatElapsed(t.startTime))
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
	.description('启动采集任务（支持交互式选择或命令行参数）')
	.option('--cloud', '使用云采集（默认本地采集）')
	.option('--speed', '加速模式（仅本地采集有效）')
	.option('--visual', '使用独立浏览器（默认内置浏览器，仅本地采集有效）')
	.option('-y, --yes', '使用默认值，跳过交互式选择')
	.option('--json', 'JSON 格式输出')
	.option('--export', '采集完成后自动导出数据')
	.option('--export-format <format>', '自动导出格式 (xlsx/csv/json/html/xml)', 'xlsx')
	.option('--export-output <path>', '自动导出路径（默认 ~/Downloads/）')
	.addHelpText('after', `
使用模式:

  1. 交互式模式（无参数时，TTY 环境）
     $ octo task start abc123
     ? 选择采集模式
       ❯ 本地采集
         云采集
     ? 选择速度模式
       ❯ 普通模式
         加速模式
     ? 选择浏览器
       ❯ 内置浏览器
         独立浏览器
     已通知客户端启动本地采集 (加速) (独立浏览器): abc123

  2. 命令行参数模式（有任意 flag 时直接执行）
     $ octo task start abc123 --cloud
     已通知客户端启动云采集: abc123

  3. 批量操作模式（--yes 跳过交互）
     $ octo task ls -q | xargs -I{} octo task start {} --speed --yes

示例:

  # 交互式选择（推荐人工操作）
  $ octo task start abc123

  # 使用默认值（本地+普通+内置浏览器）
  $ octo task start abc123 --yes

  # 云采集
  $ octo task start abc123 --cloud

  # 本地加速模式
  $ octo task start abc123 --speed

  # 本地普通+独立浏览器
  $ octo task start abc123 --visual

  # 本地加速+独立浏览器
  $ octo task start abc123 --speed --visual

  # 云采集（批量操作时跳过交互）
  $ octo task start abc123 --cloud --yes

  # JSON 格式输出
  $ octo task start abc123 --cloud --json

  # 批量启动（管道自动禁用交互）
  $ echo -e "task1\\ntask2\\ntask3" | xargs -I{} octo task start {} --speed --yes

参数说明:

  --cloud          使用云采集（默认本地采集）
  --speed          本地加速模式（仅本地采集有效，需任务支持加速）
  --visual         使用独立浏览器（默认内置浏览器，仅本地采集且非 JSON 任务有效）
  -y, --yes        跳过交互式选择，使用默认值或命令行参数
  --json           JSON 格式输出
  --export         采集完成后自动导出数据（默认格式 xlsx，路径 ~/Downloads/）
  --export-format  自动导出格式：xlsx/csv/json/html/xml（默认 xlsx）
  --export-output  自动导出路径（同 export --output，支持 ~ 展开）

交互式启动逻辑:

  何时进入交互模式:
    - 无任何 flag（--cloud/--speed/--visual）
    - 且无 --yes 标志
    - 且在 TTY 环境（非管道/重定向）
    - 且环境变量 OCTO_NO_INTERACTIVE 未设置

  何时跳过交互（使用默认值或参数）:
    - 有任意 flag（--cloud/--speed/--visual）  → 使用指定参数
    - 有 --yes 标志                              → 使用默认值（本地+普通+内置）
    - 非 TTY 环境（管道/重定向）                 → 使用默认值
    - 环境变量 OCTO_NO_INTERACTIVE=1             → 使用默认值

  动态选项（根据任务类型调整）:
    - JSON 任务（Txt/Excel/Pdf）: 强制内置浏览器，不显示浏览器选项
    - CloudWeb 任务: 强制云采集，不显示采集模式选项
    - 不支持加速的任务: 不显示速度模式选项
    - App 任务: 不显示浏览器选项

任务类型约束:

  taskType=1 (Web):      支持本地/云采集，支持加速（如配置），支持内置/独立浏览器
  taskType=2 (Txt):      支持本地/云采集，支持加速（如配置），强制内置浏览器
  taskType=3 (Excel):    支持本地/云采集，支持加速（如配置），强制内置浏览器
  taskType=4 (Pdf):      支持本地/云采集，支持加速（如配置），强制内置浏览器
  taskType=5 (App):      支持本地/云采集，支持加速（如配置），无浏览器选项
  taskType=6 (CloudWeb): 强制云采集，无加速和浏览器选项

环境变量:

  OCTO_NO_INTERACTIVE=1    强制禁用交互式输入（CI/CD 环境）

退出码:

  0  成功通知客户端启动任务
  1  任务不存在、参数错误或启动失败
  2  客户端未启动

注意事项:

  - 命令只负责通知客户端启动，不等待任务实际启动成功
  - 如需确认任务启动，请使用 octo task list 检查任务状态
  - 交互式模式下，Ctrl+C 可随时取消操作
  - 批量操作时务必加 --yes 避免卡在交互提示`)
	.action(async (taskId: string, opts: { cloud?: boolean; speed?: boolean; visual?: boolean; yes?: boolean; json?: boolean; export?: boolean; exportFormat?: string; exportOutput?: string }) => {
		try {
			// 检查是否跳过交互
			const hasExplicitFlags = opts.cloud || opts.speed || opts.visual;
			const shouldSkipInteractive =
				hasExplicitFlags ||
				opts.yes ||
				!process.stdin.isTTY ||
				process.env.OCTO_NO_INTERACTIVE === '1';

			let params: Record<string, any> = { taskId };

			if (!shouldSkipInteractive) {
				// 交互模式：先查询任务元数据
				const queryRes = await sendRequest({ action: 'task.list', params: { taskId } });
				if (!queryRes.ok || !queryRes.data || queryRes.data.length === 0) {
					console.error('错误: 任务不存在或查询失败');
					process.exit(EXIT_OPERATION_FAILED);
				}

				const taskInfo = queryRes.data[0];
				const taskType = taskInfo.taskType ?? 1; // 默认 Web
				const canSpeed = taskInfo.localMapReduce ?? false;
				const isJsonTask = [2, 3, 4].includes(taskType); // Txt/Excel/Pdf
				const isCloudOnly = [6].includes(taskType); // CloudWeb 等
				const isAppTask = [5].includes(taskType); // App

				// 构建交互式问题
				const questions: prompts.PromptObject[] = [];

				// 1. 采集模式选择（云/本地）
				if (!isCloudOnly) {
					const modeChoices: Array<{ title: string; value: string }> = [];
					modeChoices.push({ title: '本地采集', value: 'local' });
					modeChoices.push({ title: '云采集', value: 'cloud' });

					questions.push({
						type: 'select',
						name: 'mode',
						message: '选择采集模式',
						choices: modeChoices,
						initial: 0
					});
				}

				// 2. 加速模式选择（仅本地 + 支持加速时）
				if (!isCloudOnly && canSpeed) {
					questions.push({
						type: (prev: any, values: any) => values.mode === 'local' || !values.mode ? 'select' : null,
						name: 'speed',
						message: '选择速度模式',
						choices: [
							{ title: '普通模式', value: false },
							{ title: '加速模式', value: true }
						],
						initial: 0
					});
				}

				// 3. 浏览器选择（仅本地 + 非JSON任务）
				if (!isCloudOnly && !isJsonTask && !isAppTask) {
					questions.push({
						type: (prev: any, values: any) => values.mode === 'local' || !values.mode ? 'select' : null,
						name: 'browser',
						message: '选择浏览器',
						choices: [
							{ title: '内置浏览器', value: 'kernel' },
							{ title: '独立浏览器', value: 'chrome' }
						],
						initial: 0
					});
				}

				// 执行交互
				const response = await prompts(questions, {
					onCancel: () => {
						console.log('已取消');
						process.exit(1);
					}
				});

				// 检查用户是否取消（Ctrl+C）
				if (questions.length > 0 && !response.mode && !isCloudOnly) {
					console.log('已取消');
					process.exit(1);
				}

				// 转换为参数
				params.cloud = isCloudOnly || response.mode === 'cloud';
				params.speed = response.speed ?? false;
				params.visual = response.browser === 'chrome';
			} else {
				// 非交互模式：使用命令行参数或默认值
				if (opts.cloud) params.cloud = true;
				if (opts.speed) params.speed = true;
				if (opts.visual) params.visual = true;
			}

			if (opts.export) {
				const fmt = opts.exportFormat ?? 'xlsx';
				const validExportFormats = ['xlsx', 'csv', 'json', 'html', 'xml'];
				if (!validExportFormats.includes(fmt)) {
					console.error(`错误: --export-format 无效，支持: ${validExportFormats.join(', ')}`);
					process.exit(EXIT_OPERATION_FAILED);
				}
				params.export = true;
				params.exportFormat = fmt;
				params.exportOutputPath = resolveOutputPath(opts.exportOutput, taskId, fmt);
			}

			const res = await sendRequest({ action: 'task.start', params });
			if (opts.json) {
				console.log(JSON.stringify(res, null, 2));
				if (!res.ok) process.exit(EXIT_OPERATION_FAILED);
				return;
			}
			if (res.ok) {
				const mode = params.cloud ? '云采集' : '本地采集';
				const speed = params.speed ? ' (加速)' : '';
				const browser = !params.cloud && params.visual ? ' (独立浏览器)' : '';
				console.log(`已通知客户端启动${mode}${speed}${browser}: ${taskId}`);
				if (params.export) {
					console.log(`采集完成后将自动导出 ${String(params.exportFormat).toUpperCase()} 到: ${params.exportOutputPath}`);
				}
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
	.description('停止指定任务（支持新旧引擎，本地/云采集）')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', `
示例:

  # 停止单个任务
  $ octo task stop abc123
  任务 abc123 已停止

  # JSON 格式输出
  $ octo task stop abc123 --json
  {
    "ok": true
  }

  # 批量停止所有运行中任务
  $ octo task ls -q | xargs -I{} octo task stop {}

说明:

  - 支持本地采集和云采集任务
  - 支持新引擎（主进程）和旧引擎（渲染进程）
  - 命令发送停止指令后立即返回，不等待任务实际停止
  - 使用 octo task list 检查任务是否已停止

退出码:

  0  成功发送停止指令
  1  任务未找到或操作失败
  2  客户端未启动`)
	.action(taskAction('stop', (id) => `任务 ${id} 已停止`));

task
	.command('pause <taskId>')
	.description('暂停指定任务（仅本地采集支持）')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', `
示例:

  # 暂停任务
  $ octo task pause abc123
  任务 abc123 已暂停

  # JSON 格式输出
  $ octo task pause abc123 --json
  {
    "ok": true
  }

说明:

  - 仅本地采集任务支持暂停/恢复
  - 云采集任务不支持暂停，只能停止
  - 暂停后数据保留，可使用 resume 恢复采集
  - 命令立即返回，不等待任务实际暂停

退出码:

  0  成功发送暂停指令
  1  任务未找到或操作失败（如云采集任务）
  2  客户端未启动`)
	.action(taskAction('pause', (id) => `任务 ${id} 已暂停`));

task
	.command('resume <taskId>')
	.description('恢复已暂停的任务（仅本地采集支持）')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', `
示例:

  # 恢复已暂停任务
  $ octo task resume abc123
  任务 abc123 已恢复

  # JSON 格式输出
  $ octo task resume abc123 --json
  {
    "ok": true
  }

  # 查看任务状态确认已恢复
  $ octo task list --id abc123

说明:

  - 仅本地采集任务支持恢复
  - 只能恢复状态为 "paused"（暂停）的任务
  - 已停止（stopped）的任务需要重新 start
  - 命令立即返回，不等待任务实际恢复

退出码:

  0  成功发送恢复指令
  1  任务未找到、未暂停或操作失败
  2  客户端未启动`)
	.action(taskAction('resume', (id) => `任务 ${id} 已恢复`));

task
	.command('data <taskId>')
	.description('查看任务采集结果数据')
	.option('--run-on <source>', '数据来源（local/cloud/all，默认 local）', 'local')
	.option('--all', '查询全部历史数据（默认只显示本次采集数据）')
	.option('--limit <n>', '返回数据条数（默认 20，最大 1000）', '20')
	.option('--offset <n>', '跳过前 N 条数据（默认 0）', '0')
	.option('--fields <list>', '只返回指定字段（逗号分隔）')
	.option('--stats', '只显示统计信息')
	.option('--schema', '显示字段定义')
	.option('--json', 'JSON 格式输出')
	.option('--no-header', '表格不显示表头')
	.addHelpText('after', `
示例:

  # 查看本次采集数据（默认，与 GUI 显示数量一致）
  $ octo task data abc123

  # 查看全部历史数据
  $ octo task data abc123 --all

  # 云采集的本次数据
  $ octo task data abc123 --run-on cloud

  # 云采集的全部历史数据
  $ octo task data abc123 --run-on cloud --all

  # 同时查询本地和云端的本次数据
  $ octo task data abc123 --run-on all

  # 同时查询本地和云端的全部历史数据
  $ octo task data abc123 --run-on all --all

  # 只看前 50 条，并跳过前 100 条
  $ octo task data abc123 --limit 50 --offset 100

  # 只返回指定字段
  $ octo task data abc123 --fields 标题,链接,发布时间

  # 查看统计信息
  $ octo task data abc123 --stats

  # 查看字段定义
  $ octo task data abc123 --schema

  # JSON 格式输出（Agent 友好）
  $ octo task data abc123 --json

  # Agent / 脚本使用：获取结构化结果
  $ octo task data abc123 --run-on all --limit 100 --json

  # Agent / 脚本使用：只看统计信息
  $ octo task data abc123 --stats --json

数据来源与查询范围:

  - 默认只显示本次采集数据，与 GUI 一致
  - 传入 --all 后，返回当前数据来源下的全部历史数据
  - --run-on all 表示同时查询本地和云端两个数据来源
  - --all 表示扩大到历史范围；它和 --run-on all 不是同一个含义

参数说明:

  --run-on <source>   数据来源：local / cloud / all，默认 local
  --all               查询全部历史数据（默认只显示本次采集数据）
  --limit <n>         返回数据条数，默认 20，最大 1000
  --offset <n>        跳过前 N 条数据，默认 0
  --fields <list>     只返回指定字段，多个字段用逗号分隔
  --stats             只显示统计信息
  --schema            显示字段定义
  --json              JSON 格式输出
  --no-header         表格模式不显示表头

输出格式:

  1. 表格模式
     - 显示任务信息
     - 显示字段列表
     - 显示数据表格
     - 根据终端宽度自动显示 1-6 列
     - 优先显示标题、时间、链接、状态等重要字段
     - 使用 --fields 指定想看的字段，使用 --json 查看完整数据

  2. stats 模式
     - 总数据条数
     - 字段列表
     - 各字段非空率

  3. schema 模式
     - 字段名
     - 字段类型
     - 示例值

  4. JSON 模式
     返回完整结构化数据，典型结构如下：
     {
       "taskId": "abc123",
       "runOn": "local",
       "limit": 20,
       "offset": 0,
       "total": 1280,
       "fields": ["标题", "链接", "发布时间"],
       "items": [
         {
           "标题": "示例标题",
           "链接": "https://example.com",
           "发布时间": "2026-04-23"
         }
       ],
       "stats": {
         "total": 1280,
         "fieldStats": [
           {
             "name": "标题",
             "nonEmptyRate": 1
           }
         ]
       },
       "schema": [
         {
           "name": "标题",
           "type": "string",
           "example": "示例标题"
         }
       ]
     }

Agent 使用最佳实践:

  典型工作流（控制上下文，避免爆 token）：

  1. 先查统计信息（轻量，不爆上下文）
     $ octo task data <taskId> --json --stats
     返回: { total, fields, fieldStats }

  2. 查看字段定义（了解数据结构）
     $ octo task data <taskId> --json --schema
     返回: { schema: [{ name, type, example }] }

  3. 采样分析（限制 10-20 条）
     $ octo task data <taskId> --json --limit 10
     返回: { items: [...] }

  4. 按需过滤字段（减少输出）
     $ octo task data <taskId> --json --fields 标题,链接,时间 --limit 20
     返回: 只包含指定字段的数据

  5. 分页查询（大数据集）
     $ octo task data <taskId> --json --limit 100 --offset 0
     $ octo task data <taskId> --json --limit 100 --offset 100

  JSON 输出字段稳定性保证：
  - taskId, runOn, total, fields, items 字段名不变
  - 退出码稳定：0=成功, 1=失败, 2=连接失败
  - 未知字段会报错（不会静默忽略）

  数据范围注意事项：
  - 默认只返回"本次采集"数据（与 GUI 一致）
  - 如需分析全部历史数据，显式传入 --all
  - 云采集和本地采集数据完全隔离，通过 --run-on 区分

注意事项:

  - 默认查询本地的本次采集数据；这与 GUI 中显示的数量一致
  - 如需云采集结果，请显式传入 --run-on cloud
  - 如需全部历史数据，请显式传入 --all
  - --run-on all 适合排查本地/云端结果差异，--run-on all --all 则会查询两端全部历史数据
  - --fields 只影响返回字段，不会修改任务本身的数据结构
  - 表格模式会根据终端宽度自动选择显示列数，并优先展示重要字段
  - 如需固定查看某些字段，请使用 --fields
  - 超长字段会被截断显示，如需完整内容请使用 --json
  - 统计信息中的非空率范围为 0-100%

退出码:

  0  查询成功
  1  参数错误或查询失败
  2  客户端未启动`)
	.action(async (taskId: string, opts: { runOn?: string; all?: boolean; limit?: string; offset?: string; fields?: string; stats?: boolean; schema?: boolean; json?: boolean; header?: boolean }) => {
		try {
			const runOn = opts.runOn ?? 'local';
			if (!['local', 'cloud', 'all'].includes(runOn)) {
				console.error('错误: --run-on 只能是 local、cloud 或 all');
				process.exit(EXIT_OPERATION_FAILED);
			}

			const limit = Number.parseInt(opts.limit ?? '20', 10);
			if (!Number.isInteger(limit) || limit < 0 || limit > 1000) {
				console.error('错误: --limit 必须是 0 到 1000 之间的整数');
				process.exit(EXIT_OPERATION_FAILED);
			}

			const offset = Number.parseInt(opts.offset ?? '0', 10);
			if (!Number.isInteger(offset) || offset < 0) {
				console.error('错误: --offset 必须是大于等于 0 的整数');
				process.exit(EXIT_OPERATION_FAILED);
			}

			const fields = opts.fields
				? opts.fields.split(',').map(v => v.trim()).filter(Boolean)
				: undefined;

			const params: Record<string, any> = {
				taskId,
				runOn,
				limit,
				offset,
			};
			if (opts.all) params.all = true;
			if (fields?.length) params.fields = fields;
			if (opts.stats) params.stats = true;
			if (opts.schema) params.schema = true;

			const res = await sendRequest({ action: 'task.data', params });
			if (!res.ok) {
				if (opts.json) {
					console.log(JSON.stringify(res, null, 2));
				} else {
					console.error('错误:', res.error);
				}
				process.exit(EXIT_OPERATION_FAILED);
			}

			const data = res.data ?? {};
			if (opts.json) {
				console.log(JSON.stringify(data, null, 2));
				return;
			}

			const items: any[] = Array.isArray(data.items)
				? data.items
				: Array.isArray(data.list)
					? data.list
					: Array.isArray(data.rows)
						? data.rows
						: Array.isArray(data.data)
							? data.data
							: [];

			const fieldNames: string[] = Array.isArray(data.fields)
				? data.fields
				: Array.isArray(data.fieldNames)
					? data.fieldNames
					: Array.isArray(data.columns)
						? data.columns.map((c: any) => typeof c === 'string' ? c : (c?.name ?? c?.field ?? ''))
						: (items[0] && typeof items[0] === 'object' ? Object.keys(items[0]) : []);

			const total = typeof data.total === 'number'
				? data.total
				: typeof data.count === 'number'
					? data.count
					: items.length;
			const taskName = [
				data.taskName,
				data.name,
				data.task?.taskName,
				data.task?.name,
			].find((value) => typeof value === 'string' && value.trim()) ?? '-';
			const dataScopeLabel = opts.all ? '全部历史数据' : '本次数据';

			const normalizedSchema: Array<{ name: string; type: string; example: any }> = Array.isArray(data.schema)
				? data.schema.map((item: any) => ({
					name: item?.name ?? item?.field ?? '-',
					type: item?.type ?? item?.valueType ?? '-',
					example: item?.example ?? item?.sample ?? item?.sampleValue ?? '-'
				}))
				: fieldNames.map((name) => {
					const sample = items.find((row) => row && row[name] !== undefined && row[name] !== null)?.[name];
					return {
						name,
						type: sample === undefined || sample === null ? '-' : Array.isArray(sample) ? 'array' : typeof sample,
						example: sample ?? '-'
					};
				});

			const fieldStatsMap = new Map<string, any>();
			if (Array.isArray(data.stats?.fieldStats)) {
				for (const stat of data.stats.fieldStats) {
					const key = stat?.name ?? stat?.field;
					if (key) fieldStatsMap.set(key, stat);
				}
			}

			const computedStats = fieldNames.map((name) => {
				const existing = fieldStatsMap.get(name);
				if (existing) {
					const rate = existing.nonEmptyRate ?? existing.fillRate ?? existing.rate ?? 0;
					return {
						name,
						nonEmptyRate: typeof rate === 'number' && rate <= 1 ? rate * 100 : Number(rate) || 0
					};
				}
				const nonEmpty = items.filter((row) => {
					const value = row?.[name];
					return value !== undefined && value !== null && value !== '';
				}).length;
				const rate = items.length ? (nonEmpty / items.length) * 100 : 0;
				return { name, nonEmptyRate: rate };
			});

			if (opts.stats) {
				console.log('统计信息:\n');
				console.log(`  任务 ID: ${taskId}`);
				console.log(`  数据来源: ${formatRunOn(runOn)}`);
				console.log(`  总数: ${formatNumber(total)}`);
				console.log(`  字段列表: ${fieldNames.length ? fieldNames.join('、') : '-'}`);
				console.log('\n  非空率:');
				for (const stat of computedStats) {
					console.log(`  ${padRight(stat.name, 20)}${stat.nonEmptyRate.toFixed(1)}%`);
				}
				return;
			}

			if (opts.schema) {
				const cols = [
					{ key: 'name', label: '字段名', width: 20 },
					{ key: 'type', label: '类型', width: 12 },
					{ key: 'example', label: '示例值', width: 30 },
				];

				console.log('字段定义:\n');
				console.log(`  任务 ID: ${taskId}`);
				console.log(`  数据来源: ${formatRunOn(runOn)}`);
				console.log(`  字段数: ${normalizedSchema.length}`);
				console.log('');

				if (opts.header !== false) {
					console.log('  ' + cols.map((c) => padRight(c.label, c.width)).join(''));
				}

				for (const item of normalizedSchema) {
					console.log('  ' + [
						padRight(formatFieldValue(item.name, cols[0].width - 2), cols[0].width),
						padRight(formatFieldValue(item.type, cols[1].width - 2), cols[1].width),
						padRight(formatFieldValue(item.example, cols[2].width - 2), cols[2].width),
					].join(''));
				}
				return;
			}

			console.log(`任务: ${taskName} (${taskId}) - ${formatRunOn(runOn)} - ${dataScopeLabel}\n`);
			console.log(`  返回条数: ${items.length}`);
			console.log(`  总数: ${formatNumber(total)}`);
			console.log(`  字段列表: ${fieldNames.length ? fieldNames.join('、') : '-'}`);
			console.log('');

			if (!items.length) {
				console.log('  暂无数据');
				return;
			}

			const terminalWidth = process.stdout.columns || 120;
			const maxCols = getMaxColumns(terminalWidth, fieldNames.length);
			const displayFields = selectDisplayFields(fieldNames, maxCols, Boolean(fields?.length));
			const maxColumnWidth = getMaxColumnWidth(terminalWidth, Math.max(1, displayFields.length));
			const cols = displayFields.map((name) => {
				let width = Math.min(maxColumnWidth, Math.max(MIN_TABLE_COLUMN_WIDTH, getDisplayWidth(name) + 2));
				for (const row of items) {
					const candidate = formatFieldValue(row?.[name], maxColumnWidth - 2);
					width = Math.min(maxColumnWidth, Math.max(width, getDisplayWidth(candidate) + 2));
				}
				return { name, width };
			});

			if (opts.header !== false) {
				console.log('  ' + cols.map((c) => padRight(formatFieldValue(c.name, c.width - 2), c.width)).join(''));
			}

			for (const row of items) {
				console.log('  ' + cols.map((c) => padRight(formatFieldValue(row?.[c.name], c.width - 2), c.width)).join(''));
			}

			if (displayFields.length < fieldNames.length) {
				const hiddenFields = fieldNames.filter((name) => !displayFields.includes(name));
				const suggestFields = hiddenFields.slice(0, 3);
				console.log('');
				console.log(`提示: 已隐藏 ${hiddenFields.length} 个字段: ${hiddenFields.join('、')}`);
				if (suggestFields.length) {
					console.log(`使用 --fields ${suggestFields.join(',')} 查看特定字段`);
				}
				console.log('使用 --json 查看完整数据');
			}
		} catch (err: any) {
			handleError(err);
		}
	});

// task export
task
	.command('export <taskId>')
	.description('导出任务采集数据到本地文件（xlsx/csv/json/html/xml）')
	.option('--lot <lotId>', '指定批次 ID（省略则自动选最新批次）')
	.option('--all', '导出全部历史数据（不按批次过滤）')
	.option('--format <fmt>', '导出格式（xlsx/csv/json/html/xml，默认 xlsx）', 'xlsx')
	.option('--output <path>', '输出目录或完整文件路径（默认 ~/Downloads/<任务名>.<格式>）')
	.option('--list-lots', '列出可用批次，不执行导出')
	.option('-y, --yes', '跳过交互式选择，使用默认值（最新批次 + xlsx）')
	.option('--json', 'JSON 格式输出')
	.addHelpText('after', `
示例:

  # 交互式选择批次和格式（TTY 环境）
  $ octo task export abc123

  # 跑完任务直接导出（无交互，最新批次 + xlsx → ~/Downloads）
  $ octo task export abc123 --yes

  # 指定格式
  $ octo task export abc123 --format csv --yes

  # 指定批次
  $ octo task export abc123 --lot cld-001 --format json

  # 导出全部历史数据
  $ octo task export abc123 --all --format csv --yes

  # 列出所有可用批次
  $ octo task export abc123 --list-lots

  # 列出批次（JSON，脚本用）
  $ octo task export abc123 --list-lots --json

  # 指定输出路径（目录）
  $ octo task export abc123 --format csv --output ~/data --yes

  # 指定输出路径（完整文件名）
  $ octo task export abc123 --format json --output ~/data/result.json --yes

  # 任务跑完后立刻导出的快捷链路
  $ octo task stop abc123 && octo task export abc123 --format csv --yes

参数说明:

  --lot <lotId>     指定批次 ID；省略时进交互选择（TTY）或取最新批次（非 TTY/--yes）
  --all             不按批次过滤，导出全部历史数据
  --format <fmt>    导出格式：xlsx / csv / json / html / xml（默认 xlsx）
  --output <path>   保存路径：目录（自动命名）或完整文件路径
  --list-lots       仅列出批次，不导出
  -y, --yes         跳过交互：lot=最新批次，format=xlsx，output=~/Downloads
  --json            JSON 格式输出（导出结果或批次列表）

交互式流程（无 --lot / --yes / 非 TTY 时）:

  ? 选择采集批次
    ❯ [云]  2026-04-23 13:45  1,234 条  (lot: cld-001)
      [本地] 2026-04-23 12:30    567 条  (lot: lcl-002)
      ...
      全部历史数据（不按批次过滤）

  ? 选择导出格式
    ❯ Excel (.xlsx)
      CSV (.csv)
      JSON (.json)
      HTML (.html)
      XML (.xml)

  ? 保存路径 (回车使用默认)
  › ~/Downloads/央视新闻-2026-04-23.xlsx

JSON 输出格式（--list-lots --json）:
  [
    { "lotId": "cld-001", "runOn": "cloud",  "time": "2026-04-23T13:45:00Z", "count": 1234, "status": "completed" },
    { "lotId": "lcl-002", "runOn": "local",  "time": "2026-04-23T12:30:00Z", "count": 567,  "status": "completed" }
  ]

JSON 输出格式（导出完成 --json）:
  {
    "ok": true,
    "taskId": "abc123",
    "lotId": "cld-001",
    "runOn": "cloud",
    "format": "xlsx",
    "outputPath": "/Users/xxx/Downloads/央视新闻-2026-04-23.xlsx",
    "rowCount": 1234
  }

退出码:

  0  导出成功
  1  任务不存在、批次不存在、暂无数据或参数错误
  2  客户端未启动`)
	.action(async (taskId: string, opts: { lot?: string; all?: boolean; format?: string; output?: string; listLots?: boolean; yes?: boolean; json?: boolean }) => {
		try {
			const validFormats = ['xlsx', 'csv', 'json', 'html', 'xml'];
			const format = (opts.format ?? 'xlsx').toLowerCase();
			if (!validFormats.includes(format)) {
				console.error(`错误: --format 只能是 ${validFormats.join(' / ')}`);
				process.exit(EXIT_OPERATION_FAILED);
			}

			// --list-lots 模式：列出批次后退出
			if (opts.listLots) {
				const res = await sendRequest({ action: 'task.lots', params: { taskId } });
				if (!res.ok) {
					if (opts.json) {
						console.log(JSON.stringify(res, null, 2));
					} else {
						console.error('错误:', res.error);
					}
					process.exit(EXIT_OPERATION_FAILED);
				}

				const lots: any[] = (res as any).lots ?? res.data?.lots ?? [];
				if (opts.json) {
					console.log(JSON.stringify(lots, null, 2));
					return;
				}

				if (!lots.length) {
					console.log('该任务暂无采集批次');
					return;
				}

				console.log(`可用批次 (${lots.length}):\n`);
				const cols = [
					{ key: 'runOn', label: '来源', width: 8 },
					{ key: 'time', label: '时间', width: 20 },
					{ key: 'count', label: '数据量', width: 10 },
					{ key: 'status', label: '状态', width: 8 },
					{ key: 'lotId', label: '批次 ID', width: 36 },
				];
				console.log('  ' + cols.map((c) => padRight(c.label, c.width)).join(''));
				for (const lot of lots) {
					const runOnLabel = lot.runOn === 'cloud' ? '☁ 云' : '💻 本地';
					console.log('  ' + [
						padRight(runOnLabel, cols[0].width),
						padRight(formatTime(lot.time), cols[1].width),
						padRight(formatNumber(lot.count ?? 0), cols[2].width),
						padRight(lot.status === 'completed' ? '已完成' : '采集中', cols[3].width),
						padRight(lot.lotId ?? '-', cols[4].width),
					].join(''));
				}
				return;
			}

			// 确定是否进入交互模式
			const hasExplicitLot = !!opts.lot;
			const shouldSkipInteractive =
				hasExplicitLot ||
				opts.all ||
				opts.yes ||
				!process.stdin.isTTY ||
				process.env.OCTO_NO_INTERACTIVE === '1';

			let lotId: string | undefined = opts.lot;
			let selectedFormat = format;
			let outputPath = opts.output;

			if (!shouldSkipInteractive) {
				// 交互模式：先获取批次列表
				const lotsRes = await sendRequest({ action: 'task.lots', params: { taskId } });
				if (!lotsRes.ok) {
					console.error('错误:', lotsRes.error);
					process.exit(EXIT_OPERATION_FAILED);
				}

				const lots: any[] = (lotsRes as any).lots ?? lotsRes.data?.lots ?? [];

				// 批次选择
				const lotChoices = lots.map((lot) => {
					const runOnLabel = lot.runOn === 'cloud' ? '[云] ' : '[本地]';
					const timeLabel = formatTime(lot.time);
					const title = `${runOnLabel} ${timeLabel}  ${formatNumber(lot.count ?? 0)} 条  (lot: ${lot.lotId})`;
					return { title, value: lot.lotId };
				});
				lotChoices.push({ title: '── 全部历史数据（不按批次过滤）', value: '__all__' });

				const lotResponse = await prompts({
					type: 'select',
					name: 'lotId',
					message: '选择采集批次',
					choices: lotChoices,
					initial: 0
				}, {
					onCancel: () => { console.log('已取消'); process.exit(1); }
				});
				if (!lotResponse.lotId) { console.log('已取消'); process.exit(1); }

				if (lotResponse.lotId === '__all__') {
					lotId = undefined;
					// 全部历史模式，跳过 lotId
				} else {
					lotId = lotResponse.lotId;
				}

				// 格式选择
				const formatResponse = await prompts({
					type: 'select',
					name: 'format',
					message: '选择导出格式',
					choices: [
						{ title: 'Excel (.xlsx)', value: 'xlsx' },
						{ title: 'CSV (.csv)', value: 'csv' },
						{ title: 'JSON (.json)', value: 'json' },
						{ title: 'HTML (.html)', value: 'html' },
						{ title: 'XML (.xml)', value: 'xml' },
					],
					initial: 0
				}, {
					onCancel: () => { console.log('已取消'); process.exit(1); }
				});
				if (!formatResponse.format) { console.log('已取消'); process.exit(1); }
				selectedFormat = formatResponse.format;

				// 路径确认
				const defaultPath = `~/Downloads/${taskId}-${new Date().toISOString().slice(0, 10)}.${selectedFormat}`;
				const pathResponse = await prompts({
					type: 'text',
					name: 'outputPath',
					message: '保存路径 (回车使用默认)',
					initial: defaultPath
				}, {
					onCancel: () => { console.log('已取消'); process.exit(1); }
				});
				outputPath = pathResponse.outputPath || defaultPath;
			}

			// 解析输出路径
			const resolvedOutput = resolveOutputPath(outputPath, taskId, selectedFormat);

			// 文件已存在时的覆盖确认
			const fs = require('fs');
			if (fs.existsSync(resolvedOutput) && !opts.yes) {
				if (process.stdin.isTTY) {
					const confirmRes = await prompts({
						type: 'confirm',
						name: 'overwrite',
						message: `文件已存在: ${resolvedOutput}，是否覆盖？`,
						initial: false
					}, {
						onCancel: () => { console.log('已取消'); process.exit(1); }
					});
					if (!confirmRes.overwrite) {
						console.log('已取消');
						process.exit(0);
					}
				}
			}

			// 发送导出请求
			const exportParams: Record<string, any> = {
				taskId,
				format: selectedFormat,
				outputPath: resolvedOutput
			};
			if (lotId) exportParams.lotId = lotId;
			if (opts.all || (!lotId && !opts.lot)) exportParams.all = !!(opts.all || (!lotId && !opts.lot && !shouldSkipInteractive));

			if (!opts.json) {
				process.stdout.write('正在导出...');
			}

			const res = await sendRequest({ action: 'task.export', params: exportParams });

			if (!opts.json) {
				process.stdout.write('\r');
			}

			if (!res.ok) {
				if (opts.json) {
					console.log(JSON.stringify(res, null, 2));
				} else {
					console.error(`错误: ${res.error}`);
				}
				process.exit(EXIT_OPERATION_FAILED);
			}

			const result = res.data ?? res;
			if (opts.json) {
				console.log(JSON.stringify({
					ok: true,
					taskId,
					lotId: result.lotId ?? lotId,
					format: selectedFormat,
					outputPath: result.outputPath ?? resolvedOutput,
					rowCount: result.rowCount ?? 0
				}, null, 2));
			} else {
				console.log(`✓ 已导出 ${formatNumber(result.rowCount ?? 0)} 条数据到: ${result.outputPath ?? resolvedOutput}`);
			}
		} catch (err: any) {
			handleError(err);
		}
	});

program.parse();
