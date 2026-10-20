import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
// Usage: `npm test` runs every suite; `npm test -- Tariff Sync` runs only suites whose path contains a filter.
const root = process.cwd();
const filters = process.argv.slice(2).map(f => f.toLowerCase());
const suites = readdirSync(path.join(root, 'src/tests')).filter(file => /^test.*\.ts$/.test(file)).sort().map(file => `src/tests/${file}`);
suites.push('electron/updater/tests/updaterIntegrity.test.ts');
const selected = filters.length ? suites.filter(suite => filters.some(f => suite.toLowerCase().includes(f))) : suites;
if (!selected.length) { console.error(`No suite matches: ${filters.join(', ')}`); process.exit(1); }
for (const suite of selected) {
  console.log(`\nRunning ${suite}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', path.join(root, 'scripts/testEnvironment.ts'), suite], { cwd: root, stdio: 'inherit', timeout: 60000 });
  if (result.error || result.status !== 0) { console.error(`Failed: ${suite}`, result.error?.message ?? ''); process.exit(result.status || 1); }
}
console.log(`\n${selected.length} suites passed.`);
