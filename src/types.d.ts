declare module 'node-ipc' {
	interface IPC {
		config: {
			appspace: string;
			id: string;
			silent: boolean;
			retry: number;
			maxRetries: number;
			stopRetrying: boolean;
			[key: string]: any;
		};
		server: {
			on(event: string, handler: (...args: any[]) => void): void;
			emit(socket: any, event: string, data: any): void;
			start(): void;
			stop(): void;
		};
		of: Record<string, {
			on(event: string, handler: (...args: any[]) => void): void;
			emit(event: string, data: any): void;
		}>;
		serve(callback: () => void): void;
		connectTo(id: string, callback: () => void): void;
		disconnect(id: string): void;
	}

	interface IPCModule {
		IPC: new () => IPC;
	}

	const mod: IPCModule;
	export default mod;
}
