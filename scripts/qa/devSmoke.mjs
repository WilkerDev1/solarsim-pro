/** Start npm run dev on an isolated port; never authenticate or write application data. */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '3197', '--strictPort'], { stdio: 'ignore', detached: process.platform !== 'win32' });
let exited = false;
child.on('exit', () => { exited = true; });
child.on('error', () => { exited = true; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100 && !exited; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:3197/', {signal: AbortSignal.timeout(1000)});
      if (response.ok && (await response.text()).includes('/src/main.tsx')) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'npm run dev must serve the application entry');
  const source = await fetch('http://127.0.0.1:3197/src/App.tsx');
  assert.equal(source.status, 200, 'Vite must transform the application module');
  console.log('PASS: npm run dev serves and transforms the application without packaging OS binaries.');
} finally {
  if (!exited && child.pid) {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  }
}
