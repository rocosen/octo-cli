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
		case 'local': return '本地';
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

function handleError(err: any): never {
	const code = err instanceof CliError ? err.code : EXIT_OPERATION_FAILED;
	console.error(err.message);
	process.exit(code);
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

任务控制:
  octo task stop <taskId>                     停止指定任务
  octo task pause <taskId>                    暂停指定任务
  octo task resume <taskId>                   恢复已暂停的任务

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
	.action(async (taskId: string, opts: { cloud?: boolean; speed?: boolean; visual?: boolean; yes?: boolean; json?: boolean }) => {
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

program.parse();
