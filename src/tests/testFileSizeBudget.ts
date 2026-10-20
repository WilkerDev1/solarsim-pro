import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Large files hide unrelated concerns; split by responsibility before crossing the budget.
const BUDGET = 1000;
const oversized: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) { if (file !== path.join('src', 'tests')) walk(file); continue; }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    const lines = readFileSync(file, 'utf8').split('\n').length;
    if (lines > BUDGET) oversized.push(`${file} (${lines})`);
  }
};
['src', 'shared', 'electron'].forEach(walk);
assert.deepEqual(oversized, [], `Files over ${BUDGET} lines:\n${oversized.join('\n')}`);
console.log(`File size budget: every source file stays under ${BUDGET} lines.`);
