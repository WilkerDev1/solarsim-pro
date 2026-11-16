// Copy-ready snippets for the remote MCP endpoint. The personal token is shown once at creation and never embedded here.
export const REMOTE_TOKEN_PLACEHOLDER = '<TOKEN>';
export const REMOTE_TOKEN_ENV = 'SOLARSIM_REMOTE_MCP_TOKEN';

export interface RemoteMcpSnippets {
  claudeCode: string;
  codex: string;
  codexEnv: string;
  geminiCli: string;
}

export function buildRemoteMcpSnippets(url: string): RemoteMcpSnippets {
  return {
    claudeCode: `claude mcp add --transport http solarsim-remoto ${url} --header "Authorization: Bearer ${REMOTE_TOKEN_PLACEHOLDER}"`,
    codex: `[mcp_servers.solarsim-remoto]\nurl = "${url}"\nbearer_token_env_var = "${REMOTE_TOKEN_ENV}"`,
    codexEnv: `export ${REMOTE_TOKEN_ENV}="${REMOTE_TOKEN_PLACEHOLDER}"`,
    geminiCli: JSON.stringify({ mcpServers: { 'solarsim-remoto': { httpUrl: url, headers: { Authorization: `Bearer ${REMOTE_TOKEN_PLACEHOLDER}` } } } }, null, 2),
  };
}
