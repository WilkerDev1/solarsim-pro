import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Guarda del ADR 0004: las reglas de edición de un proyecto viven en `src/domain/projectEdit.ts`
 * (`applyProjectEdit`) y mirar un proyecto nunca lo escribe. Pragmática, no exhaustiva:
 *  1. `withRecommendedPanels` (el autodimensionado de una edición) no existe fuera del módulo.
 *  2. `calculateRecommendedPanelCount` (la recomendación del motor) solo la llaman el motor, el módulo y las pantallas/
 *     tuberías del borrador de IA, que dimensionan o leen el rendimiento de un borrador, no editan un proyecto abierto.
 *     Las porciones del store y los componentes del simulador no la llaman: piden la edición al módulo.
 *  3. Ningún efecto (`useEffect`/`useLayoutEffect`) de `src/components/simulator` llama a los escritores del proyecto
 *     (`updateSpecs`, `updateRates`…): un efecto corre al mirar y mirar no escribe.
 *  4. Las porciones del store y las herramientas de agente no escriben `client`, `specs` ni `rates` directamente desde
 *     `updateActiveProject(...)`/`updateProjectById(...)`: lo hacen por `applyProjectEdit`/`applyDocumentClientEdit`.
 *     Quedan fuera, por no ser ediciones, la restauración de instantáneas (`restore: true`, deshacer/rehacer, historial,
 *     reconciliación con el servidor), la construcción de proyectos (nuevo, duplicado, importación, borrador de IA) y las
 *     escrituras que no tocan esos campos (estado, carpeta, enlace, personalización, anexos, diseño).
 * No ve las reglas reescritas con otros nombres; el comportamiento lo cubre `testProjectEdit`.
 */
const root = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', 'release', '.wrangler', 'tests']);
const MODULE = 'src/domain/projectEdit.ts';
const ENGINE = 'src/engine/solarEngine.ts';
/** Borrador de IA: dimensiona o lee el rendimiento específico de un borrador; no aplica una edición a un proyecto abierto. */
const DRAFT_PIPELINE = new Set([
  'src/store/slices/aiSlice.ts',
  'src/utils/proposalDraftProject.ts',
  'src/utils/aiProposalNormalization.ts',
  'src/components/common/ai-invoice/hooks/useAIInvoiceScanner.ts',
  'src/components/common/ai-invoice/components/ProposalConsumptionReview.tsx',
]);
const WRITERS = /\b(?:updateSpecs|updateRates|updateClient|updateFinancials|updateMonthlyConsumption|updateAllMonthlyConsumption|setMonthlyConsumption|applySupplierPriceToProject|editActiveProject)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}
const rel = (file: string) => path.relative(root, file).split(path.sep).join('/');
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

/** Cuerpos de las llamadas `useEffect(...)`/`useLayoutEffect(...)`: del paréntesis de apertura a su cierre. */
function effectBodies(source: string): string[] {
  const bodies: string[] = [];
  for (const match of source.matchAll(/\b(?:React\.)?use(?:Layout)?Effect\s*\(/g)) {
    let depth = 1;
    let i = match.index! + match[0].length;
    const start = i;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
    }
    bodies.push(source.slice(start, i));
  }
  return bodies;
}

/** Cuerpo de las llamadas `name(...)`: del paréntesis de apertura a su cierre. */
function callBodies(source: string, name: string): string[] {
  const bodies: string[] = [];
  for (const match of source.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))) {
    let depth = 1;
    let i = match.index! + match[0].length;
    const start = i;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
    }
    bodies.push(source.slice(start, i));
  }
  return bodies;
}
const WRITES_PROJECT_FIELD = /(?:^|[\s{,(])(?:client|specs|rates)\s*(?::|,|\})/;
const THROUGH_MODULE = /\b(?:applyProjectEdit|applyDocumentClientEdit)\s*\(/;
const directWrite = (body: string) => !/\brestore\s*:\s*true\b/.test(body) && !THROUGH_MODULE.test(body) && WRITES_PROJECT_FIELD.test(body);

const files = walk(path.join(root, 'src')).map((file) => ({ file: rel(file), source: stripComments(readFileSync(file, 'utf8')) }));

const sizing: string[] = [];
const recommendation: string[] = [];
const effects: string[] = [];
const direct: string[] = [];
for (const { file, source } of files) {
  if (file !== MODULE && /\bwithRecommendedPanels\b/.test(source)) sizing.push(file);
  if (![MODULE, ENGINE].includes(file) && !DRAFT_PIPELINE.has(file) && /\bcalculateRecommendedPanelCount\b/.test(source)) recommendation.push(file);
  if ((file.startsWith('src/store/slices/') || file.startsWith('src/features/agentTools/'))
    && ['updateActiveProject', 'updateProjectById'].some((name) => callBodies(source, name).some(directWrite))) direct.push(file);
  if (file.startsWith('src/components/simulator/') && effectBodies(source).some((body) => WRITERS.test(body))) effects.push(file);
}

assert.deepEqual(sizing, [], `withRecommendedPanels solo vive en ${MODULE}:\n${sizing.join('\n')}`);
assert.deepEqual(recommendation, [], `calculateRecommendedPanelCount fuera del motor, de ${MODULE} y del borrador de IA (pide la edición a applyProjectEdit):\n${recommendation.join('\n')}`);
assert.deepEqual(effects, [], `Un efecto del simulador escribe en el proyecto (mirar no escribe; usa applyProjectEdit desde una acción del usuario):\n${effects.join('\n')}`);

assert.deepEqual(direct, [], `Escritura directa de client/specs/rates fuera de applyProjectEdit (usa el módulo; ADR 0004):\n${direct.join('\n')}`);

// La guarda detecta lo que dice detectar.
assert.equal(callBodies('x(updateActiveProject((p) => { return { client, customization }; }))', 'updateActiveProject').some(directWrite), true);
assert.equal(callBodies('updateProjectById(id, (p) => ({ specs: { ...p.specs } }))', 'updateProjectById').some(directWrite), true);
assert.equal(callBodies('updateActiveProject((p, s) => applyProjectEdit(p, { kind: "client", patch }, ctx))', 'updateActiveProject').some(directWrite), false);
assert.equal(callBodies('updateProjectById(id, () => ({ client: old }), { restore: true })', 'updateProjectById').some(directWrite), false);
assert.equal(callBodies('updateProjectById(id, (p) => ({ customization: { ...p.customization } }))', 'updateProjectById').some(directWrite), false);
assert.deepEqual(effectBodies('React.useEffect(() => { updateSpecs({}); }, [a]); useEffect(() => { (x)(); }, [])').map((body) => WRITERS.test(body)), [true, false]);
assert.ok(files.some((file) => file.file === MODULE), `${MODULE} debe existir (actualiza la guarda si se mueve)`);
assert.ok(files.some((file) => file.file === ENGINE) && DRAFT_PIPELINE.size > 0);
for (const draft of DRAFT_PIPELINE) assert.ok(files.some((file) => file.file === draft), `${draft} ya no existe: quítalo de DRAFT_PIPELINE`);
console.log('PASS: las reglas de edición de proyecto viven en domain/projectEdit y ningún efecto del simulador escribe.');
