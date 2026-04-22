import ipc from 'node-ipc';

const IPC_APPSPACE = 'octoparse.';
const CLI_CHANNEL = 'cli';
const CONNECT_TIMEOUT = 3000;

export const EXIT_OK = 0;
export const EXIT_OPERATION_FAILED = 1;
export const EXIT_CONNECTION_FAILED = 2;

export class CliError extends Error {
	code: number;

	constructor(message: string, code: number) {
		super(message);
		this.name = 'CliError';
		this.code = code;
	}
}

export interface CliRequest {
	action: string;
	params?: Record<string, any>;
}

export interface CliResponse {
	ok: boolean;
	data?: any;
	error?: string;
}

export function sendRequest(request: CliRequest): Promise<CliResponse> {
	return new Promise((resolve, reject) => {
		const _ipc = new ipc.IPC();
		_ipc.config.appspace = IPC_APPSPACE;
		_ipc.config.id = `cli-client-${process.pid}`;
		_ipc.config.silent = true;
		_ipc.config.retry = 500;
		_ipc.config.maxRetries = 2;
		_ipc.config.stopRetrying = false;

		let settled = false;

		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			try {
				_ipc.disconnect(CLI_CHANNEL);
			} catch {
				// ignore
			}
			reject(new CliError('无法连接到八爪鱼客户端，请确认客户端已启动', EXIT_CONNECTION_FAILED));
		}, CONNECT_TIMEOUT);

		_ipc.connectTo(CLI_CHANNEL, () => {
			_ipc.of[CLI_CHANNEL].on('connect', () => {
				_ipc.of[CLI_CHANNEL].emit('message', request);
			});

			_ipc.of[CLI_CHANNEL].on('message', (response: CliResponse) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				_ipc.disconnect(CLI_CHANNEL);
				resolve(response);
			});

			_ipc.of[CLI_CHANNEL].on('error', () => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				try {
					_ipc.disconnect(CLI_CHANNEL);
				} catch {
					// ignore
				}
				reject(new CliError('无法连接到八爪鱼客户端，请确认客户端已启动', EXIT_CONNECTION_FAILED));
			});

			_ipc.of[CLI_CHANNEL].on('destroy', () => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				reject(new CliError('无法连接到八爪鱼客户端，请确认客户端已启动', EXIT_CONNECTION_FAILED));
			});
		});
	});
}
