// Persistent configuration of the local MCP server (userData/mcp.json). No Electron imports: testable with plain Node.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_MCP_PORT = 47321;
export const MCP_CONFIG_FILE = 'mcp.json';

export interface McpConfig {
  enabled: boolean;
  port: number;
  /** 32 random bytes, base64url. Never sent to the renderer. */
  token: string;
}

export const generateMcpToken = (): string => randomBytes(32).toString('base64url');

const validPort = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1024 && (value as number) <= 65535;
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43,}$/.test(value);

export function mcpConfigPath(userDataDir: string): string {
  return path.join(userDataDir, MCP_CONFIG_FILE);
}

/** Atomic write with owner-only permissions: the file holds the bearer token. */
export function saveMcpConfig(file: string, config: McpConfig): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows ignores POSIX modes; the user profile ACL already restricts the file.
  }
}

/** Reads the config, creating it (disabled, fresh token) when missing or unusable. Invalid fields are repaired individually. */
export function loadMcpConfig(file: string): McpConfig {
  let raw: Partial<McpConfig> = {};
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') raw = parsed;
    } catch {
      raw = {};
    }
  }
  const config: McpConfig = {
    enabled: raw.enabled === true,
    port: validPort(raw.port) ? raw.port : DEFAULT_MCP_PORT,
    token: validToken(raw.token) ? raw.token : generateMcpToken(),
  };
  if (JSON.stringify(raw) !== JSON.stringify(config)) saveMcpConfig(file, config);
  return config;
}
