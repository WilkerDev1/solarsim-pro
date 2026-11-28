// F6: guarda de arquitectura. El asistente único (sesión + bucle sobre `LlmClient`) es el único camino de IA del chat.
// Fallan, y dicen qué hacer, estas reapariciones:
//  · el transporte REST antiguo (`shared/geminiTransport`) y el proceso principal llamando a Gemini (`electron/ai` con sus canales IPC);
//  · el modal «Asistente de propuestas» (`ai-invoice`, su estado en el store y sus puntos de entrada);
//  · el camino de ejecución antiguo del flotante (`service.ts`, `useAppAssistant`, `executeForAssistant`, `runAssistant`).
// Lo que se conserva a propósito (la fuente `proposal-assistant` y su etiqueta para leer actividad guardada, la herramienta
// `apply_proposal_draft` declarada en `shared/`) lo cubre `testAgentActivityLegacySource`.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SELF = path.join('src', 'tests', 'testNoLegacyAssistantPath.ts');

/** Rutas que no pueden volver a existir. */
const GONE = [
  'shared/geminiTransport.ts',
  'electron/ai',
  'src/components/common/ai-invoice',
  'src/features/assistant/service.ts',
  'src/features/assistant/useAppAssistant.ts',
  'src/services/geminiInvoiceService.ts',
];
for (const entry of GONE) assert.ok(!existsSync(path.join(root, entry)), `${entry} ya no existe (F6): el asistente único es el único camino de IA del chat; no lo restaures.`);

/** Lo que ningún archivo de código puede nombrar (sin contar comentarios). */
const FORBIDDEN: { name: string; pattern: RegExp; why: string }[] = [
  { name: 'shared/geminiTransport', pattern: /geminiTransport/, why: 'el transporte REST antiguo; usa el puerto LlmClient (src/services/llm/)' },
  { name: 'electron/ai', pattern: /electron\/ai\b|\.\/ai\/aiInvoiceHandler|\baiInvoiceHandler\b|registerAIInvoiceHandlers/, why: 'las llamadas de IA no se hacen en el proceso principal' },
  { name: 'canales IPC de IA', pattern: /parse-invoice-with-ai|cancel-ai-request|list-gemini-models|\bparseInvoiceWithAI\b|\bcancelAIRequest\b|\blistGeminiModels\b/, why: 'preload no expone IA: el renderer usa el puerto' },
  { name: 'ai-invoice (modal antiguo)', pattern: /ai-invoice|AIInvoiceScannerModal|\bopenAIInvoiceModal\b|\bcloseAIInvoiceModal\b|\bisAIInvoiceModalOpen\b/, why: 'las tres entradas abren el asistente único con openAssistant' },
  { name: 'camino de ejecución antiguo', pattern: /\bexecuteForAssistant\b|\buseAppAssistant\b|\brunAssistant\b|\bAssistantRunError\b|assistant\/service['"]|from ['"]\.\/service['"]|from ['"]\.\.\/service['"]/, why: 'el bucle es session/agentLoop.ts' },
  { name: 'applyExtractedInvoice', pattern: /\bapplyExtractedInvoice\b|\bapplyProposalDraft\b/, why: 'lo que aplicaba el borrador del modal' },
];

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const SKIP = new Set(['node_modules', 'dist', 'dist-electron', '.git', 'assets']);
function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(path.join(root, dir))) {
    if (SKIP.has(name)) continue;
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) yield* walk(rel);
    else if (/\.(ts|tsx|mjs|cjs|js|json|html|css)$/.test(name) && !/package-lock\.json$/.test(name)) yield rel;
  }
}
const codeFiles = ['src', 'electron', 'scripts', 'shared'].filter((dir) => existsSync(path.join(root, dir))).flatMap((dir) => [...walk(dir)]).concat(['package.json', 'vite.config.ts', 'index.html'].filter((f) => existsSync(path.join(root, f))));
assert.ok(codeFiles.length > 500, 'la guarda recorre todo el código');

// Las suites (`src/tests/`) quedan fuera de las reglas de texto: algunas afirman justamente la ausencia de estos nombres, y un
// import de lo borrado ya lo rechaza `npm run lint` (tsc).
const offenders: string[] = [];
for (const file of codeFiles) {
  if (file === SELF || file.startsWith(`src${path.sep}tests${path.sep}`)) continue;
  const text = /\.(ts|tsx|mjs|cjs|js)$/.test(file) ? stripComments(readFileSync(path.join(root, file), 'utf8')) : readFileSync(path.join(root, file), 'utf8');
  for (const rule of FORBIDDEN) if (rule.pattern.test(text)) offenders.push(`${file}: ${rule.name} (${rule.why})`);
}
assert.deepEqual(offenders, [], `Reapareció código del camino antiguo (F6 lo eliminó):\n${offenders.join('\n')}`);

// El preload y el proceso principal no tienen ya ningún canal de IA.
const preload = readFileSync(path.join(root, 'electron/preload.ts'), 'utf8');
assert.ok(!/gemini|invoice|ai-request/i.test(preload), 'electron/preload.ts no expone nada de IA');
const main = readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
assert.ok(!/AIInvoice|\.\/ai\//.test(main), 'electron/main.ts no registra manejadores de IA');

console.log('PASS: ningún código del modal antiguo, del transporte REST, de electron/ai ni del camino de ejecución antiguo.');
