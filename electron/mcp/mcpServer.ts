// Local MCP endpoint: stateless Streamable HTTP on loopback. Tools live in the renderer (see RendererBridge).
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AGENT_RULES_ES } from '../../shared/agentTools/rules';
import { authorizeRequest, BodyTooLargeError, MAX_BODY_BYTES, readLimitedBody } from './httpGuard';
import { BridgeError, type RendererBridge } from './rendererBridge';
import { failureResult, toMcpTool, toolResult } from './toolResult';

export const MCP_PATH = '/mcp';
const MAX_SESSIONS = 64;

export interface LocalMcpServerOptions {
  bridge: RendererBridge;
  /** Read on every request so rotating the token takes effect immediately. */
  getToken: () => string;
  version: string;
  maxBodyBytes?: number;
}

export interface McpClientInfo {
  name: string;
  lastSeenAt: string;
}

const safeLabel = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/[^\p{L}\p{N} ._@/-]/gu, '').trim().slice(0, 64);
  return clean || undefined;
};

export class LocalMcpServer {
  private http: http.Server | null = null;
  private boundPort = 0;
  /** session id → client. Sessions are only a labeling aid: the transport itself stays stateless. */
  private sessions = new Map<string, { name: string; lastSeenAt: number }>();

  constructor(private readonly options: LocalMcpServerOptions) {}

  get running(): boolean {
    return this.http?.listening === true;
  }

  get port(): number {
    return this.boundPort;
  }

  clients(): McpClientInfo[] {
    const byName = new Map<string, number>();
    for (const { name, lastSeenAt } of this.sessions.values()) byName.set(name, Math.max(byName.get(name) ?? 0, lastSeenAt));
    return [...byName].map(([name, at]) => ({ name, lastSeenAt: new Date(at).toISOString() }));
  }

  /** Forgets known clients (token rotation: they must authenticate again). */
  resetSessions(): void {
    this.sessions.clear();
  }

  start(port: number): Promise<number> {
    if (this.http) return Promise.resolve(this.boundPort);
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handle(req, res).catch(() => {
          if (!res.headersSent) this.reply(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Error interno.' }, id: null });
          else res.end();
        });
      });
      server.once('error', (error) => reject(error));
      // Loopback only: the endpoint is never reachable from the network.
      server.listen(port, '127.0.0.1', () => {
        this.http = server;
        this.boundPort = (server.address() as AddressInfo).port;
        server.removeAllListeners('error');
        resolve(this.boundPort);
      });
    });
  }

  stop(): Promise<void> {
    const server = this.http;
    this.http = null;
    this.boundPort = 0;
    this.sessions.clear();
    if (!server) return Promise.resolve();
    return new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  private reply(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }

  private rpcError(res: http.ServerResponse, status: number, code: number, message: string, headers?: Record<string, string>) {
    this.reply(res, status, { jsonrpc: '2.0', error: { code, message }, id: null }, headers);
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const guard = authorizeRequest(req.headers, { port: this.boundPort, token: this.options.getToken() });
    if (!guard.ok) return this.rpcError(res, guard.status, -32001, guard.message);
    if (new URL(req.url ?? '/', 'http://127.0.0.1').pathname !== MCP_PATH) return this.rpcError(res, 404, -32601, 'No encontrado.');
    // Stateless server: no standalone SSE stream (GET) and no session teardown (DELETE).
    if (req.method !== 'POST') return this.rpcError(res, 405, -32000, 'Método no permitido.', { allow: 'POST' });

    let body: unknown;
    try {
      body = JSON.parse((await readLimitedBody(req, this.options.maxBodyBytes ?? MAX_BODY_BYTES)).toString('utf8'));
    } catch (error) {
      if (error instanceof BodyTooLargeError) return this.rpcError(res, 413, -32000, 'Solicitud demasiado grande.');
      return this.rpcError(res, 400, -32700, 'JSON no válido.');
    }

    const clientLabel = this.identify(req, res, body);
    const server = new Server(
      { name: 'solarsim', version: this.options.version },
      { capabilities: { tools: { listChanged: false } }, instructions: AGENT_RULES_ES },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.options.bridge.tools.map(toMcpTool) }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        return toolResult(await this.options.bridge.invoke({ name, args: (args ?? {}) as Record<string, unknown> }, clientLabel));
      } catch (error) {
        if (error instanceof BridgeError) return failureResult(error.code, error.message);
        return failureResult('tool_failed', 'La herramienta no pudo ejecutarse.');
      }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  /** Names the caller: initialize.clientInfo → session id echoed by the client → User-Agent product → generic. */
  private identify(req: http.IncomingMessage, res: http.ServerResponse, body: unknown): string {
    const messages = Array.isArray(body) ? body : [body];
    const init = messages.find((m) => m && typeof m === 'object' && (m as { method?: unknown }).method === 'initialize') as
      | { params?: { clientInfo?: { name?: unknown } } }
      | undefined;
    if (init) {
      const name = safeLabel(init.params?.clientInfo?.name) ?? 'mcp';
      const id = randomUUID();
      if (this.sessions.size >= MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value as string);
      this.sessions.set(id, { name, lastSeenAt: Date.now() });
      res.setHeader('mcp-session-id', id);
      return name;
    }
    const header = req.headers['mcp-session-id'];
    const known = typeof header === 'string' ? this.sessions.get(header) : undefined;
    if (known) {
      known.lastSeenAt = Date.now();
      return known.name;
    }
    return safeLabel(String(req.headers['user-agent'] ?? '').split('/')[0]) ?? 'mcp';
  }
}
