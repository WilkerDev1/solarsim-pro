// Copy-ready connection snippets. The bearer token is never available here: users copy it separately from main.
export const MCP_TOKEN_PLACEHOLDER = '<TOKEN>';

export interface McpSnippets {
  claudeCode: string;
  codex: string;
  codexEnv: string;
  /** Claude Desktop launches stdio servers itself; the proxy reads the token from mcp.json, so none is embedded. */
  claudeDesktop: string;
}

export function buildMcpSnippets(url: string, executablePath?: string): McpSnippets {
  return {
    claudeCode: `claude mcp add --transport http solarsim ${url} --header "Authorization: Bearer ${MCP_TOKEN_PLACEHOLDER}"`,
    codex: `[mcp_servers.solarsim]\nurl = "${url}"\nbearer_token_env_var = "SOLARSIM_MCP_TOKEN"`,
    codexEnv: `export SOLARSIM_MCP_TOKEN="${MCP_TOKEN_PLACEHOLDER}"`,
    claudeDesktop: JSON.stringify({ mcpServers: { solarsim: { command: executablePath ?? '<ruta de SolarSim Pro>', args: ['--mcp-stdio'] } } }, null, 2),
  };
}
