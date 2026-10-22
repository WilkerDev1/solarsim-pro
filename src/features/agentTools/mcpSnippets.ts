// Copy-ready connection snippets. The bearer token is never available here: users copy it separately from main.
export const MCP_TOKEN_PLACEHOLDER = '<TOKEN>';

export interface McpSnippets {
  claudeCode: string;
  codex: string;
  codexEnv: string;
}

export function buildMcpSnippets(url: string): McpSnippets {
  return {
    claudeCode: `claude mcp add --transport http solarsim ${url} --header "Authorization: Bearer ${MCP_TOKEN_PLACEHOLDER}"`,
    codex: `[mcp_servers.solarsim]\nurl = "${url}"\nbearer_token_env_var = "SOLARSIM_MCP_TOKEN"`,
    codexEnv: `export SOLARSIM_MCP_TOKEN="${MCP_TOKEN_PLACEHOLDER}"`,
  };
}
