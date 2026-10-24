import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Guarda del ADR 0003: los valores por defecto de los supuestos del proyecto viven solo en `shared/assumptions.ts`
 * (y los ajustes de fábrica del usuario, en `src/store/defaultSimulationSettings.ts`, que los toma de esas constantes).
 * Ningún otro archivo de `src`, `shared`, `server/src`, `workers/share-viewer/src` o `electron` puede escribir
 * `|| 3.5`, `?? 25`, `|| 60`… al leer un campo de supuesto: quien necesite el valor efectivo llama a
 * `resolveAssumptions` / `resolveAssumption` o usa la constante `DEFAULT_*`.
 *
 * Heurística (pragmática, no un analizador): una línea de código (no comentario) falla si reúne
 *   1. un operador de respaldo (`||`, `??`) o una asignación de parámetro por defecto (`campo = 60`) seguido de uno de los
 *      literales conocidos de los defaults (60, 3.5, 12, 25, 95, 7, 10, 14, 1.13, 1.25, 170, 0.4, 0.5, 0.481, 28…), y
 *   2. el nombre de un campo de supuesto (cambio, pérdidas, inflación, descuento, vida, cobertura, retención, vigencia,
 *      degradación, margen, mano de obra, $/W, CO₂, reemplazo de batería) en la misma línea.
 * No ve literales escritos con otros nombres (p. ej. `const rate = x > 0 ? x : 60`); los consumidores conocidos están
 * cubiertos por `testResolvedAssumptions` y `testAssumptionsFactory`. Lo que no es un supuesto del proyecto se lista en
 * `ALLOW` con su motivo.
 */
const root = process.cwd();
const SELF = 'src/tests/testNoAssumptionDefaultLiterals.ts';
const SCAN_DIRS = ['src', 'shared', 'server/src', 'workers/share-viewer/src', 'electron'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'release', '.wrangler', 'tests']);

/** Archivos donde los literales son legítimos. */
const OWNERS = new Set([
  'shared/assumptions.ts', // la tabla y las constantes
  'src/store/defaultSimulationSettings.ts', // ajustes de fábrica del usuario (siembran proyectos nuevos)
  'src/engine/referenceCase.ts', // caso de referencia auditado: datos, no defaults
]);

/** Excepciones por línea: `archivo` + fragmento de la línea → motivo. Un literal que no sea un supuesto del proyecto. */
const ALLOW: { file: string; includes: string; reason: string }[] = [
  { file: 'src/data/rdTariffs.ts', includes: 'baseEnergyRateDOP ?? 12.0', reason: 'tarifa base en RD$ del régimen tarifario, no un supuesto del proyecto' },
  { file: 'src/components/common/ShareProposalModal.tsx', includes: 'validityDays || 7', reason: 'vigencia del ENLACE compartido, no de la cotización' },
  { file: 'src/services/shareProposalService.ts', includes: 'validityDays || 7', reason: 'vigencia del ENLACE compartido, no de la cotización' },
  { file: 'shared/equipment/legacy.ts', includes: 'batteryLifespanYears || 10', reason: 'vida útil por grupo del formato heredado (ADR 0001)' },
  { file: 'src/components/common/EquipmentEditorModal.tsx', includes: 'annualDegradation || 0.4', reason: 'degradación de un equipo del catálogo' },
];

const FALLBACK = /(?:\|\||\?\?)\s*(?:60(?:\.0+)?|60\.5|3\.5|12(?:\.0+)?|25(?:\.0+)?|95|7|10|14(?:\.0+)?|1\.13|1\.25|170|0\.4(?:0)?|0\.5|0\.481|28)\b(?!\s*[*/%\d.])/;
const PARAM_DEFAULT = /\b(?:dopExchangeRate|usdExchangeRate|systemLosses\w*|annualDegradation|gridExportFeePct|targetCoveragePct|quoteValidityDays|discountRatePct|projectLifespanYears)\s*=\s*(?:60(?:\.0+)?|60\.5|3\.5|12|25|95|7|0\.4|0\.5)\b/;
const FIELD = /(?:exchange|dop|usdRate|losses|inflation|escalation|discount|lifespan|coverage|export\s*fee|exportFee|retention|validity|degradation|margin|installation|co2|pricePerW|price_per_w|wattPrice|replacement)/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (/\.(ts|tsx|mts|mjs|cjs)$/.test(name) && !/\.d\.m?ts$/.test(name) && !/\.test\.tsx?$/.test(name) && !/^test[A-Z].*\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const isCommentLine = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
export function offendingLine(line: string): boolean {
  if (isCommentLine(line)) return false;
  const code = line.replace(/\/\/.*$/, '');
  return (FALLBACK.test(code) || PARAM_DEFAULT.test(code)) && FIELD.test(code);
}

const offenders: string[] = [];
const used = new Set<number>();
for (const dir of SCAN_DIRS) {
  const abs = path.join(root, dir);
  if (!statSync(abs, { throwIfNoEntry: false })?.isDirectory()) continue;
  for (const file of walk(abs)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel === SELF || OWNERS.has(rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (!offendingLine(line)) return;
      const allowed = ALLOW.findIndex((entry) => entry.file === rel && line.includes(entry.includes));
      if (allowed >= 0) used.add(allowed);
      else offenders.push(`${rel}:${index + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
}

assert.deepEqual(offenders, [], `Default de supuesto escrito fuera de shared/assumptions.ts (usa resolveAssumptions/resolveAssumption o DEFAULT_*):\n${offenders.join('\n')}`);
const stale = ALLOW.filter((_, index) => !used.has(index)).map((entry) => `${entry.file}: ${entry.includes}`);
assert.deepEqual(stale, [], `Excepciones sin uso en ALLOW (bórralas):\n${stale.join('\n')}`);
for (const sample of ['rates.annualEnergyInflationPct || 3.5', 'rates.gridExportFeePct ?? 25', 'project.rates.usdExchangeRate || 60.0', 'const systemLosses ?? 25;', 'dopExchangeRate = 60.0,', 'quoteValidityDays || 7']) {
  assert.ok(offendingLine(sample), `la guarda detecta: ${sample}`);
}
for (const sample of ['const wide = width || 25;', 'rates.gridExportFeePct ?? DEFAULT_GRID_EXPORT_FEE_PCT', '// rates.gridExportFeePct ?? 25', 'discountRatePct / 100 * 12']) {
  assert.ok(!offendingLine(sample), `la guarda no acusa: ${sample}`);
}
assert.ok(statSync(path.join(root, 'shared/assumptions.ts')).isFile(), 'shared/assumptions.ts debe existir (actualiza la guarda si se mueve)');
console.log('PASS: los defaults de los supuestos solo se escriben en shared/assumptions.ts.');
