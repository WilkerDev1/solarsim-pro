// F7a: pruebas del PROPIO script de evaluación con el modelo real (`scripts/qa/evalAssistant.ts` y su biblioteca
// `scripts/qa/assistantEvalRunner.ts`), con ScriptedLlm en lugar de Gemini: nunca red ni clave. Comprueban que
//  · cada petición del catálogo APRUEBA con un modelo que hace lo correcto y FALLA con uno que no hace nada (las aserciones
//    discriminan: un script de evaluación que aprueba siempre no sirve);
//  · el informe dice por petición las herramientas llamadas con su estado, la aserción, los pasos (llamadas al modelo) y la duración;
//  · un fallo de la API (clave inválida, cuota) es «error», no «falla», y cambia el código de salida;
//  · la clave nunca aparece en la salida (ni en un mensaje de error del servidor) y el script lee la clave solo del entorno;
//  · los argumentos (`--model` repetible, `--only`, `--list`, `--timeout`, `--json`) y los códigos de salida.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useSimulationStore } from '../store/useSimulationStore';
import { LlmError } from '../services/llm/errors';
import { DEFAULT_GEMINI_MODEL } from '../services/llm/models';
import {
  EVAL_CASES, EXIT_ERROR, EXIT_FAILED, EXIT_OK, EXIT_USAGE, exitCodeFor, formatReport, parseEvalArgs, redact, runEvalSuite,
  type EvalReport,
} from '../../scripts/qa/assistantEvalRunner';
import { ScriptedLlm, type ScriptedStep } from './support/scriptedLlm';
import { frOf } from './support/assistantHarness';

const s = () => useSimulationStore.getState();
const proposal = () => s().activeProjectId;
const call = (name: string, args: (() => Record<string, unknown>) | Record<string, unknown>, id = 'g1'): ScriptedStep =>
  () => ({ functionCalls: [{ id, name, args: typeof args === 'function' ? args() : args }] });
const edit = (title: string, ops: Record<string, unknown>[], id = 'g1') => call('edit_proposal', () => ({ proposalId: proposal(), title, ops }), id);
const said = (text: string): ScriptedStep => ({ text });

/** Lo que haría un modelo correcto en cada petición (un guion por caso del catálogo). */
const GOOD: Record<string, ScriptedStep[]> = {
  'crea-propuesta': [call('create_proposal', {}), said('Creé la propuesta con un consumo estimado de 1.000 kWh al mes.')],
  baterias: [edit('Baterías', [{ op: 'set_storage', enabled: true }]), said('Listo, con baterías.')],
  'cobertura-90': [edit('Cobertura', [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }]), said('Cobertura al 90 %.')],
  distribuidora: [edit('Distribuidora', [{ op: 'set_tariff', distributor: 'EDENORTE', tariffCode: 'BTS1' }]), said('Ahora es EDENORTE.')],
  'margen-35': [edit('Margen', [{ op: 'set_margin_pct', pct: 35 }]), said('Margen al 35 %.')],
  'consumo-1500': [edit('Consumo', [{ op: 'set_consumption', averageMonthlyKWh: 1500 }]), said('Consumo de 1.500 kWh al mes.')],
  'paneles-20': [edit('Paneles', [{ op: 'set', path: 'specs.panels[0].count', valueJson: '20' }]), said('Veinte paneles.')],
  'descuento-5': [edit('Descuento', [{ op: 'upsert_discount', description: 'Cliente frecuente', discountType: 'percentage', value: 5 }]), said('Descuento del 5 %.')],
  'extra-transporte': [edit('Transporte', [{ op: 'upsert_item', description: 'Transporte', quantity: 1, unitPriceUSD: 200 }]), said('Extra de transporte por US$ 200.')],
  'cuanto-cuesta': [
    call('get_proposal_state', () => ({ proposalId: proposal() })),
    (c) => said(`El precio de contrato es US$ ${frOf(c).response.results.after.metrics.contractPriceUSD.toLocaleString('en-US')}.`),
  ],
  'deshaz-eso': [
    edit('Cobertura', [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }], 'g1'), said('Cobertura al 90 %.'),
    call('undo_change', () => ({ proposalId: proposal() }), 'g2'), said('Deshecho.'),
  ],
  'sin-precios': [call('create_proposal', {}), said('Creada, pero falta el precio de los equipos: está incompleta.')],
  'falla-no-bloquea': [call('edit_proposal', { proposalId: 'zzz-no-existe', title: 'Margen', ops: [{ op: 'set_margin_pct', pct: 30 }] }), said('No encontré esa propuesta; no cambié nada.')],
  'dos-cambios': [
    edit('Cobertura y baterías', [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '80' }, { op: 'set_storage', enabled: true }]), said('Cobertura al 80 % y con baterías.'),
  ],
};
/** Un modelo que no hace nada útil: contesta con texto y ya. Con turnos de sobra para los casos de varios mensajes. */
const IDLE: ScriptedStep[] = [said('No sé qué hacer.'), said('No sé qué hacer.'), said('No sé qué hacer.')];

const run = (scripts: Record<string, ScriptedStep[]>, extra: Partial<Parameters<typeof runEvalSuite>[0]> = {}) => {
  const clients: Record<string, ScriptedLlm> = {};
  const report = runEvalSuite({
    models: ['modelo-a'], cases: EVAL_CASES, secrets: [], sleep: async () => {},
    clientFor: (_model, caseId) => (clients[caseId] = new ScriptedLlm(scripts[caseId] ?? [])),
    ...extra,
  });
  return { report, clients };
};

// ── El catálogo: una petición por promesa, con id único y en español ─────────────────────────────────────────────────────────────
assert.deepEqual(Object.keys(GOOD).sort(), EVAL_CASES.map((c) => c.id).sort(), 'cada caso del catálogo tiene su guion correcto en esta prueba');
assert.equal(new Set(EVAL_CASES.map((c) => c.id)).size, EVAL_CASES.length, 'ids únicos');
for (const evalCase of EVAL_CASES) {
  assert.ok(evalCase.turns.length >= 1 && evalCase.turns.every((t) => t.trim().length > 3), `${evalCase.id}: peticiones en español`);
  assert.ok(evalCase.assertion.length > 15, `${evalCase.id}: la aserción se describe en el informe`);
}
const prompts = EVAL_CASES.flatMap((c) => c.turns).join(' | ').toLowerCase();
for (const wanted of ['crea una propuesta', 'ponle baterías', 'sube la cobertura al 90 %', 'cambia la distribuidora', '¿cuánto cuesta?', 'deshaz eso'])
  assert.ok(prompts.includes(wanted), `el catálogo incluye «${wanted}»`);

// ── Un modelo correcto aprueba TODO; uno que no hace nada falla TODO ──────────────────────────────────────────────────────────
{
  const { report, clients } = run(GOOD);
  const done = await report;
  const bad = done.results.filter((r) => r.status !== 'pass');
  assert.deepEqual(bad.map((r) => `${r.caseId}: ${r.status} ${r.failure ?? r.error ?? ''}`), [], 'con un modelo correcto, todas las peticiones aprueban');
  assert.equal(exitCodeFor(done), EXIT_OK);
  for (const llm of Object.values(clients)) llm.assertDone();
  const create = done.results.find((r) => r.caseId === 'crea-propuesta')!;
  assert.deepEqual(create.tools, [{ name: 'create_proposal', status: 'applied' }], 'herramientas llamadas, con su estado');
  assert.equal(create.steps, 2, 'pasos = llamadas al modelo');
  assert.ok(create.durationMs >= 0 && Number.isFinite(create.durationMs));
  assert.equal(create.outcome, 'finished');
  assert.equal(done.results.find((r) => r.caseId === 'deshaz-eso')!.tools.map((t) => t.name).join(), 'edit_proposal,undo_change', 'una conversación de dos mensajes junta sus herramientas');
  assert.equal(done.results.find((r) => r.caseId === 'falla-no-bloquea')!.tools[0].status, 'error', 'la herramienta que falla se informa como error');
  assert.equal(done.results.find((r) => r.caseId === 'cuanto-cuesta')!.tools[0].name, 'get_proposal_state');
}
{
  const done = await run(Object.fromEntries(EVAL_CASES.map((c) => [c.id, IDLE]))).report;
  const passed = done.results.filter((r) => r.status === 'pass').map((r) => r.caseId);
  assert.deepEqual(passed, [], 'un modelo que no hace nada no aprueba ninguna petición');
  assert.ok(done.results.every((r) => r.status === 'fail' && r.failure), 'cada una con el motivo del fallo');
  assert.equal(exitCodeFor(done), EXIT_FAILED);
}

// ── Mutaciones del modelo: casi bien no aprueba ──────────────────────────────────────────────────────────────────────────────────
{
  const wrong: Record<string, ScriptedStep[]> = {
    ...GOOD,
    'cobertura-90': [edit('Cobertura', [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '80' }]), said('Cobertura al 90 %.')],
    'deshaz-eso': [edit('Cobertura', [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }]), said('Cobertura al 90 %.'), said('Ya está deshecho.')],
    'cuanto-cuesta': [call('get_proposal_state', () => ({ proposalId: proposal() })), said('Cuesta 1 dólar.')],
    'sin-precios': [call('create_proposal', {}), said('Creada.')],
  };
  const done = await run(wrong).report;
  const status = Object.fromEntries(done.results.map((r) => [r.caseId, r.status]));
  assert.equal(status['cobertura-90'], 'fail', 'la cobertura equivocada no aprueba aunque el texto diga 90 %');
  assert.equal(status['deshaz-eso'], 'fail', 'decir «deshecho» sin deshacer no aprueba');
  assert.equal(status['cuanto-cuesta'], 'fail', 'un precio que no es el del motor no aprueba');
  assert.equal(status.baterias, 'pass', 'los demás siguen aprobando');
  assert.ok(done.results.find((r) => r.caseId === 'deshaz-eso')!.failure!.length > 10);
}

// ── Un fallo de la API es «error», no «falla»; la clave no sale en ninguna parte ──────────────────────────────────────────────────
{
  const secret = 'AIzaSy-CLAVE-QUE-NO-DEBE-SALIR-123456';
  const scripts = { ...GOOD, baterias: [{ error: new LlmError('bad_request', { status: 400, serverMessage: `Rechazada la clave ${secret}` }) } as ScriptedStep] };
  const done = await run(scripts, { secrets: [secret] }).report;
  const result = done.results.find((r) => r.caseId === 'baterias')!;
  assert.equal(result.status, 'error', 'clave inválida: no se pudo evaluar (no es un fallo del asistente)');
  assert.ok(result.error, 'con el motivo');
  assert.equal(exitCodeFor(done), EXIT_ERROR, 'el código de salida distingue «no se pudo evaluar» de «falló»');
  const text = formatReport(done) + JSON.stringify(done);
  assert.ok(!text.includes(secret), 'la clave nunca aparece en el informe, ni en el texto ni en el JSON');
  assert.equal(redact(`x ${secret} y ${secret}`, [secret]), 'x [clave] y [clave]');
  assert.equal(redact('sin secretos', [secret]), 'sin secretos');
  assert.equal(redact('abc', ['']), 'abc', 'una clave vacía no borra el texto');
  // El estado de la sesión de la prueba no deja la clave del usuario en el store tras el informe (la del script va en memoria).
  assert.ok(!JSON.stringify(done).includes('synthetic-key'));
}

// ── Plazo por petición ───────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const slow = [(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); return said('Tarde.'); }) as ScriptedStep];
  const done = await run({ ...GOOD, baterias: slow }, { only: ['baterias'], timeoutMs: 20 }).report;
  assert.equal(done.results[0].status, 'error', 'agotar el plazo es «error»');
  assert.match(done.results[0].error ?? '', /plazo|tiempo/i);
}

// ── Varios modelos: se evalúa cada petición con cada uno; el informe los separa ────────────────────────────────────────────────────
{
  const seen: string[] = [];
  const done = await run(GOOD, { models: ['m1', 'm2'], only: ['cobertura-90'], clientFor: (model, caseId) => { seen.push(`${model}/${caseId}`); return new ScriptedLlm(GOOD[caseId]); } }).report;
  assert.deepEqual(seen, ['m1/cobertura-90', 'm2/cobertura-90']);
  assert.deepEqual(done.results.map((r) => r.model), ['m1', 'm2']);
  const text = formatReport(done);
  assert.match(text, /m1/);
  assert.match(text, /m2/);
}

// ── El informe: legible y completo por petición ────────────────────────────────────────────────────────────────────────────────────
{
  let clock = 1000;
  const done = await run(GOOD, { only: ['cobertura-90', 'cuanto-cuesta'], now: () => (clock += 2500) }).report;
  const text = formatReport(done);
  for (const needle of ['cobertura-90', 'sube la cobertura al 90 %', 'edit_proposal', 'applied', 'pasos', 'PASS', 'modelo-a', '2,5 s']) assert.ok(text.includes(needle), `el informe incluye «${needle}»:\n${text}`);
  assert.match(text, /2\/2/, 'resumen con el total');
  const failing = await run(Object.fromEntries(EVAL_CASES.map((c) => [c.id, IDLE])), { only: ['baterias'] }).report;
  const failText = formatReport(failing);
  assert.match(failText, /FAIL/);
  assert.ok(failText.includes(failing.results[0].failure!), 'el fallo se explica');
  const json = JSON.parse(JSON.stringify(done)) as EvalReport;
  assert.equal(json.results.length, 2, 'el informe es serializable (--json)');
}

// ── Argumentos y códigos de salida ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  assert.deepEqual(parseEvalArgs([]), { ok: true, models: [DEFAULT_GEMINI_MODEL], only: [], list: false, json: false, timeoutSec: 180 });
  assert.deepEqual(parseEvalArgs(['--model', 'a', '--model', 'b', '--only', 'baterias,cobertura-90', '--json', '--timeout', '30']),
    { ok: true, models: ['a', 'b'], only: ['baterias', 'cobertura-90'], list: false, json: true, timeoutSec: 30 });
  assert.equal(parseEvalArgs(['--list']).ok && (parseEvalArgs(['--list']) as { list: boolean }).list, true);
  for (const bad of [['--model'], ['--nope'], ['--timeout', 'x'], ['--timeout', '0'], ['--only', 'no-existe']]) {
    const parsed = parseEvalArgs(bad);
    assert.equal(parsed.ok, false, `${bad.join(' ')} se rechaza`);
    assert.ok(!parsed.ok && parsed.error.length > 5);
  }
  assert.deepEqual([EXIT_OK, EXIT_FAILED, EXIT_USAGE, EXIT_ERROR], [0, 1, 2, 3]);
  const mixed: EvalReport = { startedAt: '', results: [
    { caseId: 'a', model: 'm', prompt: 'x', assertion: 'y', status: 'fail', failure: 'z', tools: [], steps: 1, durationMs: 1, finalText: '' },
    { caseId: 'b', model: 'm', prompt: 'x', assertion: 'y', status: 'error', error: 'z', tools: [], steps: 1, durationMs: 1, finalText: '' },
  ] };
  assert.equal(exitCodeFor(mixed), EXIT_ERROR, 'si no se pudo evaluar algo, eso manda sobre los fallos');
  assert.equal(exitCodeFor({ startedAt: '', results: [] }), EXIT_USAGE, 'ninguna petición evaluada no es un éxito');
}

// ── Frontera: la clave solo se lee del entorno y nunca se imprime ──────────────────────────────────────────────────────────────────
{
  const cli = readFileSync(new URL('../../scripts/qa/evalAssistant.ts', import.meta.url), 'utf8');
  assert.match(cli, /process\.env\.GEMINI_API_KEY/, 'la clave sale del entorno');
  assert.ok(!/console\.(log|error|warn)\([^)]*apiKey/.test(cli), 'ningún console.* recibe la clave');
  assert.ok(!/--(api-?key|key)\b/.test(cli), 'sin argumento de línea de órdenes para la clave (quedaría en el historial del shell)');
  assert.ok(/GEMINI_API_KEY/.test(cli) && /Falta GEMINI_API_KEY/.test(cli), 'sin clave, sale con el mensaje y el código de uso');
  for (const file of ['../../scripts/qa/evalAssistant.ts', '../../scripts/qa/assistantEvalRunner.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/shared\/geminiTransport|electron\/ai|ai-invoice|features\/assistant\/service|useAppAssistant/.test(source), `${file}: no depende de lo que F6 borra`);
    assert.ok(!/solarsim\.electsun|fetch\(/.test(source), `${file}: sin red de SolarSim ni fetch propio`);
  }
}

console.log('PASS: eval script (every request passes with a correct model and fails with an idle one, errors vs failures, key never printed, args and exit codes).');
