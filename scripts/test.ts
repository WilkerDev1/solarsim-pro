import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseShard, selectShard } from './testShards';
// Usage: `npm test` runs every suite; `npm test -- Tariff Sync` runs only suites whose path contains a filter.
// CI: `npm test -- --shard=1/3` runs one of three disjoint parts (see scripts/testShards.ts).
const root = process.cwd();
const parsed = parseShard(process.argv.slice(2));
const filters = parsed.filters.map(f => f.toLowerCase());
const suites = readdirSync(path.join(root, 'src/tests')).filter(file => /^test.*\.ts$/.test(file)).sort().map(file => `src/tests/${file}`);
suites.push('electron/updater/tests/updaterIntegrity.test.ts');
// Electron main-process suites run on node:http: `fetch` is disabled in the test environment.
suites.push(...readdirSync(path.join(root, 'electron/mcp/tests')).filter(file => /\.test\.ts$/.test(file)).sort().map(file => `electron/mcp/tests/${file}`));
const matching = filters.length ? suites.filter(suite => filters.some(f => suite.toLowerCase().includes(f))) : suites;
if (!matching.length) { console.error(`No suite matches: ${filters.join(', ')}`); process.exit(1); }
const selected = parsed.shard ? selectShard(matching, parsed.shard) : matching;
if (!selected.length) { console.log(`Shard ${parsed.shard?.index}/${parsed.shard?.total}: no suites.`); process.exit(0); }
for (const suite of selected) {
  console.log(`\nRunning ${suite}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', path.join(root, 'scripts/testEnvironment.ts'), suite], { cwd: root, stdio: 'inherit', timeout: 60000 });
  if (result.error || result.status !== 0) { console.error(`Failed: ${suite}`, result.error?.message ?? ''); process.exit(result.status || 1); }
}
console.log(`\n${selected.length} suites passed.`);
