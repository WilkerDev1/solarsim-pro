// Entry for `SolarSim Pro --mcp-stdio`: no window, no single-instance lock, stdout carries only JSON-RPC.
import { app } from 'electron';
import { mcpConfigPath, readMcpConfig } from './config';
import { runStdioProxy } from './stdioProxy';

export function runMcpStdio(): void {
  app.dock?.hide();
  app.whenReady().then(async () => {
    const file = mcpConfigPath(app.getPath('userData'));
    await runStdioProxy({ stdin: process.stdin, stdout: process.stdout, readConfig: () => readMcpConfig(file) });
    app.quit();
  });
}
