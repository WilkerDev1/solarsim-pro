// `--mcp-stdio`: lets stdio-only hosts (Claude Desktop) talk to the running app by forwarding each JSON-RPC line over HTTP.
import http from 'node:http';
import { StringDecoder } from 'node:string_decoder';
import { MCP_PATH } from './mcpServer';

export interface ProxyConfig {
  enabled: boolean;
  port: number;
  token: string;
}

export interface StdioProxyOptions {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  /** Read per message: the token or the on/off switch can change while the host stays connected. */
  readConfig: () => ProxyConfig | null;
}

const MAX_LINE_CHARS = 16 * 1024 * 1024;
const NOT_RUNNING = 'SolarSim no está en ejecución: abre SolarSim Pro y activa el servidor MCP en Ajustes → Agentes e IA.';

/** Splits a byte or string stream into non-empty lines, keeping multi-byte characters intact across chunks. */
export class LineSplitter {
  private decoder = new StringDecoder('utf8');
  private buffer = '';

  push(chunk: Buffer | string): string[] {
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    if (this.buffer.length > MAX_LINE_CHARS && !this.buffer.includes('\n')) {
      this.buffer = '';
      throw new Error('Línea demasiado larga.');
    }
    const parts = this.buffer.split('\n');
    this.buffer = parts.pop() ?? '';
    return parts.map((line) => line.replace(/\r$/, '')).filter((line) => line.trim());
  }

  flush(): string | undefined {
    const rest = (this.buffer + this.decoder.end()).trim();
    this.buffer = '';
    return rest || undefined;
  }
}

const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

interface HttpReply {
  status: number;
  body: string;
  sessionId?: string;
}

function post(config: ProxyConfig, payload: string, sessionId?: string): Promise<HttpReply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: config.port,
        method: 'POST',
        path: MCP_PATH,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${config.token}`,
          'content-length': Buffer.byteLength(payload),
          ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const header = res.headers['mcp-session-id'];
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), sessionId: typeof header === 'string' ? header : undefined });
        });
        res.on('error', reject);
      },
    );
    req.setTimeout(60_000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

/** Hosts expect one JSON message per line; tolerate an SSE-framed reply by extracting its `data:` lines. */
function replyLines(body: string): string[] {
  const text = body.trim();
  if (!text) return [];
  if (!/^(event|data|id|retry):/m.test(text)) return [text.replace(/\r?\n/g, ' ')];
  return text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
}

export async function runStdioProxy(options: StdioProxyOptions): Promise<void> {
  const { stdin, stdout, readConfig } = options;
  let sessionId: string | undefined;
  const inFlight = new Set<Promise<void>>();
  const write = (message: unknown) => stdout.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`);

  const handle = async (line: string) => {
    let id: unknown;
    let expectsReply = true;
    try {
      const parsed = JSON.parse(line);
      const first = Array.isArray(parsed) ? parsed.find((m) => m && typeof m === 'object' && 'id' in m) : parsed;
      expectsReply = !!first && typeof first === 'object' && 'id' in first;
      id = expectsReply ? first.id : undefined;
    } catch {
      write(rpcError(null, -32700, 'JSON no válido.'));
      return;
    }
    const fail = (message: string) => {
      if (expectsReply) write(rpcError(id, -32000, message));
    };
    const config = readConfig();
    if (!config) return fail(NOT_RUNNING);
    if (!config.enabled) return fail('El servidor MCP de SolarSim está desactivado: actívalo en Ajustes → Agentes e IA.');
    try {
      const reply = await post(config, line, sessionId);
      if (reply.sessionId) sessionId = reply.sessionId;
      if (reply.status === 401) return fail('SolarSim rechazó el token: copia el token vigente en Ajustes → Agentes e IA y actualiza el cliente.');
      for (const out of replyLines(reply.body)) write(out);
      if (reply.status >= 400 && !reply.body.trim()) fail(`SolarSim respondió con el estado ${reply.status}.`);
    } catch {
      fail(NOT_RUNNING);
    }
  };

  const splitter = new LineSplitter();
  const dispatch = (line: string) => {
    const task = handle(line).finally(() => inFlight.delete(task));
    inFlight.add(task);
  };
  await new Promise<void>((resolve) => {
    stdin.on('data', (chunk) => {
      try {
        splitter.push(chunk as Buffer | string).forEach(dispatch);
      } catch {
        write(rpcError(null, -32700, 'Línea demasiado larga.'));
      }
    });
    stdin.on('end', resolve);
    stdin.on('error', resolve);
  });
  const rest = splitter.flush();
  if (rest) dispatch(rest);
  await Promise.all(inFlight);
}
