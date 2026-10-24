import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Guarda del ADR 0002: la energía útil del banco (capacidad × DOD × eficiencia) se calcula solo en
 * `shared/equipment/battery.ts` (`batteryBank`). Ningún otro archivo de `src`, `shared`, `server/src`, `workers` o
 * `electron` puede convertir un DOD o una eficiencia a fracción (`dodPct / 100`, `batteryEffPct / 100`,
 * `efficiency / 100`…); quien necesite energía útil o autonomía lee `batteryBank` / `batteryAutonomyHours`.
 * Esta guarda no ve la fórmula escrita con otros nombres; los consumidores conocidos están cubiertos por
 * `testBatteryBankModule`.
 */
const root = process.cwd();
const OWNER = 'shared/equipment/battery.ts';
const SELF = 'src/tests/testNoBatteryFormulaCopies.ts';
const SCAN_DIRS = ['src', 'shared', 'server/src', 'workers/share-viewer/src', 'electron', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'release', '.wrangler']);

// `dodPct / 100`, `batteryDodPct/100`, `DOD / 100`, `efficiencyPct / 100`, `batteryEffPct / 100`, `eff / 100`…
const FORMULA = /\b(?:\w*dod\w*|\w*efficiency\w*|\w*Eff(?:Pct)?|eff)\s*\/\s*100\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (/\.(ts|tsx|mts|mjs|cjs)$/.test(name) && !/\.d\.m?ts$/.test(name)) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
for (const dir of SCAN_DIRS) {
  const abs = path.join(root, dir);
  if (!statSync(abs, { throwIfNoEntry: false })?.isDirectory()) continue;
  for (const file of walk(abs)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel === OWNER || rel === SELF) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (FORMULA.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
    });
  }
}

assert.deepEqual(offenders, [], `Fórmula de energía útil fuera de ${OWNER} (usa batteryBank/batteryAutonomyHours de shared/equipment):\n${offenders.join('\n')}`);
assert.ok(FORMULA.test('total * (batteryDodPct / 100) * (batteryEffPct / 100)'), 'la guarda detecta la fórmula copiada');
assert.ok(statSync(path.join(root, OWNER)).isFile(), `${OWNER} debe existir (actualiza la guarda si se mueve)`);
console.log('PASS: la energía útil del banco solo se calcula en shared/equipment/battery.ts.');
