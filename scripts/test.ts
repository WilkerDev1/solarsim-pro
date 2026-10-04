import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
const suites = readdirSync(path.join(root, 'src/tests')).filter(file => /^test.*\.ts$/.test(file)).sort().map(file => `src/tests/${file}`);
suites.push('electron/updater/tests/updaterIntegrity.test.ts');
for (const suite of suites) {
  console.log(`\nRunning ${suite}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', path.join(root, 'scripts/testEnvironment.ts'), suite], { cwd: root, stdio: 'inherit', timeout: 60000 });
  if (result.error || result.status !== 0) { console.error(`Failed: ${suite}`, result.error?.message ?? ''); process.exit(result.status || 1); }
}
console.log(`\n${suites.length} suites passed.`);
