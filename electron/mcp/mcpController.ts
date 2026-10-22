// Owns the local MCP server lifecycle: config, bridge, HTTP endpoint. No Electron imports; IPC lives in ipc.ts.
import type { McpInvokeMessage, McpServerStatus } from '../../shared/agentTools/bridge';
import { generateMcpToken, loadMcpConfig, saveMcpConfig, type McpConfig } from './config';
import { LocalMcpServer, MCP_PATH } from './mcpServer';
import { RendererBridge } from './rendererBridge';

export interface McpControllerOptions {
  configFile: string;
  version: string;
  send: (message: McpInvokeMessage) => boolean;
  /** Writes to the system clipboard (main process only). */
  copyText: (text: string) => void;
}

export class McpController {
  readonly bridge: RendererBridge;
  private readonly server: LocalMcpServer;
  private config: McpConfig;
  private error: string | undefined;
  /** Lifecycle changes run one at a time, so overlapping toggles always end in the last requested state. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: McpControllerOptions) {
    this.config = loadMcpConfig(options.configFile);
    this.bridge = new RendererBridge({ send: options.send });
    this.server = new LocalMcpServer({ bridge: this.bridge, getToken: () => this.config.token, version: options.version });
  }

  async init(): Promise<void> {
    if (this.config.enabled) await this.startServer();
  }

  status(): McpServerStatus {
    return {
      enabled: this.config.enabled,
      running: this.server.running,
      port: this.config.port,
      url: `http://127.0.0.1:${this.config.port}${MCP_PATH}`,
      error: this.error,
      clients: this.server.clients(),
    };
  }

  setEnabled(enabled: boolean): Promise<McpServerStatus> {
    return this.serial(async () => {
      this.config = { ...this.config, enabled };
      saveMcpConfig(this.options.configFile, this.config);
      if (enabled) await this.startServer();
      else await this.stopServer();
      return this.status();
    });
  }

  async regenerateToken(): Promise<McpServerStatus> {
    this.config = { ...this.config, token: generateMcpToken() };
    saveMcpConfig(this.options.configFile, this.config);
    this.server.resetSessions();
    return this.status();
  }

  copyToken(): boolean {
    this.options.copyText(this.config.token);
    return true;
  }

  async shutdown(): Promise<void> {
    this.bridge.rendererGone();
    await this.serial(() => this.stopServer());
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async startServer(): Promise<void> {
    this.error = undefined;
    try {
      await this.server.start(this.config.port);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      this.error = code === 'EADDRINUSE' ? `El puerto ${this.config.port} está en uso por otra aplicación.` : 'No se pudo iniciar el servidor MCP local.';
    }
  }

  private async stopServer(): Promise<void> {
    this.error = undefined;
    await this.server.stop();
  }
}
