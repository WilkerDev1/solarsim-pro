// Biblioteca de la evaluación del asistente con el modelo REAL (F7a). La usa `scripts/qa/evalAssistant.ts` (que le pone el cliente de
// Gemini con la clave del entorno) y `src/tests/testAssistantEvalScript.ts` (que le pone ScriptedLlm: sin red ni clave).
//
// Cada petición del catálogo (`EVAL_CASES`) monta la sesión REAL del asistente de la app (`createAssistantSession`) sobre un store
// en memoria con un catálogo sintético (ofertas de proveedor de prueba), sin sesión de SolarSim, sin sincronización y sin tocar datos
// del usuario; envía la petición en español y, al terminar, comprueba una aserción sobre el estado final. El resultado dice qué
// herramientas se llamaron (con su estado), si la aserción se cumplió, cuántas veces se llamó al modelo (pasos) y cuánto tardó.
//
// «error» no es «falla»: error = no se pudo evaluar (clave inválida, cuota, red, plazo agotado); falla = el modelo contestó y el
// estado final no cumple la aserción. La clave nunca entra en el informe: `redact` la quita de todo texto que viene del servidor.
import { useSimulationStore } from '../../src/store/useSimulationStore';
import { DEFAULT_GEMINI_MODEL } from '../../src/services/llm/models';
import { DEFAULT_RD_TARIFF_MATRIX } from '../../src/data/rdTariffs';
import { isConsumptionEstimated } from '../../src/domain/newProposal';
import { engineResults } from '../../src/domain/proposalSnapshot';
import { proposalCompleteness } from '../../src/domain/proposalCompleteness';
import { PROJECT_SECTIONS, pickFields } from '../../src/features/agentTools/nativeTools';
import type { AssistantSession, SessionMessage } from '../../src/features/assistant/session/assistantSession';
import type { LlmClient } from '../../src/services/llm/types';
import type { ProjectSimulation } from '../../src/types';
import {
  newEvalSession, offerCatalog, projectOf, resetEvalStore, seedFreshProposal, unpricedCatalog,
} from './assistantEvalHarness';

export const EXIT_OK = 0;
/** Alguna petición se evaluó y el estado final no cumple su aserción. */
export const EXIT_FAILED = 1;
/** Argumentos inválidos, falta la clave o no se evaluó nada. */
export const EXIT_USAGE = 2;
/** Alguna petición no se pudo evaluar (clave inválida, cuota, red, plazo): no es un fallo del asistente. */
export const EXIT_ERROR = 3;

export interface EvalToolCall { name: string; status: string }

export interface EvalCheckContext {
  /** Copia de la propuesta de partida (`null` si la petición parte de Inicio, sin propuestas). */
  seed: ProjectSimulation | null;
  /** Secciones de la propuesta de partida (JSON), para comparar «igual que al empezar». */
  seedSections: string | null;
  /** Propuestas vivas al terminar. */
  projects: ProjectSimulation[];
  /** La propuesta abierta al terminar. */
  active: ProjectSimulation | undefined;
  /** Las que no existían al empezar. */
  created: ProjectSimulation[];
  view: string;
  tools: EvalToolCall[];
  /** Texto final del último turno. */
  text: string;
  outcome: string;
}

export interface EvalCase {
  id: string;
  /** Lo que escribe el usuario, en orden (una conversación puede tener varios mensajes). */
  turns: string[];
  /**
   * `dashboard`: sin propuestas, en Inicio. `proposal`: una propuesta nueva abierta en el simulador. `unpriced`: Inicio, con un
   * catálogo sin ninguna oferta ni precio (nada puede dar un precio).
   */
  setup: 'dashboard' | 'proposal' | 'unpriced';
  /** Qué se exige del estado final, en una frase (va en el informe). */
  assertion: string;
  /** `null` si se cumple; si no, por qué no. */
  check(context: EvalCheckContext): string | null;
}

const sectionsOf = (project: ProjectSimulation) => JSON.stringify(pickFields(project, PROJECT_SECTIONS));
const applied = (tools: readonly EvalToolCall[], name: string) => tools.some((t) => t.name === name && t.status === 'applied');
const groupsInUse = (project: ProjectSimulation) => [
  ...(project.specs.panels ?? []), ...(project.specs.inverters ?? []), ...(project.specs.hasBattery ? project.specs.batteries ?? [] : []),
].filter((g) => (g.count ?? 0) > 0);
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Una propuesta abierta que cumple `predicate`, o el motivo de que no. */
const onActive = (what: string, predicate: (project: ProjectSimulation) => boolean) => (c: EvalCheckContext): string | null =>
  !c.active ? 'No hay ninguna propuesta abierta.' : predicate(c.active) ? null : `${what} (la propuesta quedó así).`;

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'crea-propuesta', turns: ['crea una propuesta'], setup: 'dashboard',
    assertion: 'Se crea una propuesta nueva con consumo genérico de 1.000 kWh/mes marcado como estimado y el simulador queda abierto en ella.',
    check: (c) => {
      if (!applied(c.tools, 'create_proposal')) return 'No llamó a create_proposal (o no se aplicó).';
      if (c.created.length !== 1) return `Se esperaba 1 propuesta nueva y hay ${c.created.length}.`;
      const [created] = c.created;
      if (!created.monthlyConsumption.every((v) => v === 1000)) return `El consumo no es 1.000 kWh los doce meses: ${created.monthlyConsumption.join(', ')}.`;
      if (created.consumptionEstimate?.kind !== 'factory_default') return 'El consumo no quedó marcado como estimado.';
      if (c.view !== 'simulator' || c.active?.id !== created.id) return `El simulador no quedó abierto en la propuesta nueva (vista «${c.view}»).`;
      return null;
    },
  },
  {
    id: 'baterias', turns: ['ponle baterías'], setup: 'proposal',
    assertion: 'La propuesta incluye baterías con un precio que sale de la oferta del catálogo (nunca 0 ni inventado).',
    check: (c) => {
      const problem = onActive('No incluye baterías', (p) => p.specs.hasBattery === true && (p.specs.batteries?.length ?? 0) > 0)(c);
      if (problem) return problem;
      const unpriced = (c.active!.specs.batteries ?? []).filter((b) => !((b.unitPriceUSD ?? 0) > 0));
      return unpriced.length ? 'Alguna batería quedó sin precio positivo.' : null;
    },
  },
  {
    id: 'cobertura-90', turns: ['sube la cobertura al 90 %'], setup: 'proposal',
    assertion: 'La cobertura objetivo de la propuesta es exactamente 90 %.',
    check: onActive('La cobertura objetivo no es 90 %', (p) => p.rates.targetCoveragePct === 90),
  },
  {
    id: 'distribuidora', turns: ['cambia la distribuidora a EDENORTE'], setup: 'proposal',
    assertion: 'La distribuidora de la propuesta es EDENORTE y su tarifa es una de EDENORTE (no queda la de otra distribuidora).',
    check: onActive('La distribuidora no es EDENORTE', (p) => p.rates.distributor === 'EDENORTE' && p.rates.billingTariff?.distributor === 'EDENORTE' && !!p.rates.tariffCode && p.rates.tariffCode in (DEFAULT_RD_TARIFF_MATRIX.schedules.EDENORTE.tariffs as Record<string, unknown>)),
  },
  {
    id: 'margen-35', turns: ['pon el margen en 35 %'], setup: 'proposal',
    assertion: 'El factor de venta de la propuesta es 1,35 (margen del 35 %).',
    check: onActive('El factor de venta no es 1,35', (p) => Math.abs((p.specs.saleMarginMultiplier ?? 0) - 1.35) < 0.005),
  },
  {
    id: 'consumo-1500', turns: ['el cliente consume 1.500 kWh al mes'], setup: 'proposal',
    assertion: 'Los doce meses de consumo son 1.500 kWh y el consumo deja de estar marcado como estimado.',
    check: onActive('El consumo no es 1.500 kWh en los doce meses', (p) => p.monthlyConsumption.length === 12 && p.monthlyConsumption.every((v) => v === 1500) && !isConsumptionEstimated(p)),
  },
  {
    id: 'paneles-20', turns: ['ponle 20 paneles'], setup: 'proposal',
    assertion: 'El grupo principal de paneles tiene 20 unidades.',
    check: onActive('El grupo principal de paneles no tiene 20 unidades', (p) => p.specs.panels?.[0]?.count === 20),
  },
  {
    id: 'descuento-5', turns: ['hazle un descuento del 5 %'], setup: 'proposal',
    assertion: 'La propuesta tiene un descuento porcentual de 5.',
    check: onActive('No hay un descuento porcentual de 5', (p) => (p.financials.customDiscounts ?? []).some((d) => d.type === 'percentage' && d.value === 5)),
  },
  {
    id: 'extra-transporte', turns: ['agrega un extra de transporte por 200 dólares'], setup: 'proposal',
    assertion: 'La propuesta tiene un ítem extra cuyo total (cantidad por precio unitario) es 200 dólares.',
    check: onActive('No hay un ítem extra de 200 dólares', (p) => (p.financials.customItems ?? []).some((i) => i.quantity * i.unitPriceUSD === 200)),
  },
  {
    id: 'cuanto-cuesta', turns: ['¿cuánto cuesta?'], setup: 'proposal',
    assertion: 'No modifica la propuesta y la respuesta nombra el precio de contrato del motor (la parte entera, en dólares).',
    check: (c) => {
      if (!c.seed || !c.active) return 'No hay propuesta de partida.';
      if (sectionsOf(c.active) !== c.seedSections) return 'Una pregunta modificó la propuesta.';
      const results = engineResults(c.seed);
      if (!results.complete) return 'La propuesta de partida está incompleta (no debería).';
      const price = String(Math.floor(results.metrics.contractPriceUSD));
      return c.text.replace(/[.,\s']/g, '').includes(price) ? null : `La respuesta no nombra el precio de contrato (${price}): «${c.text.slice(0, 160)}».`;
    },
  },
  {
    id: 'deshaz-eso', turns: ['sube la cobertura al 90 %', 'deshaz eso'], setup: 'proposal',
    assertion: 'Aplicó un cambio y, tras «deshaz eso», la propuesta quedó exactamente como al empezar.',
    check: (c) => {
      if (!applied(c.tools, 'edit_proposal')) return 'No llegó a aplicar el primer cambio (edit_proposal).';
      if (!c.active || sectionsOf(c.active) !== c.seedSections) return `La propuesta no quedó como al empezar (cobertura ${c.active?.rates.targetCoveragePct}).`;
      return null;
    },
  },
  {
    id: 'sin-precios', turns: ['crea una propuesta'], setup: 'unpriced',
    assertion: 'Con un catálogo sin ofertas ni precio genérico, la propuesta nace incompleta: ningún equipo con precio inventado ni con 0 falso.',
    check: (c) => {
      if (c.created.length !== 1) return `Se esperaba 1 propuesta nueva y hay ${c.created.length}.`;
      const [created] = c.created;
      const priced = groupsInUse(created).filter((g) => g.unitPriceUSD !== undefined && g.unitPriceUSD !== null);
      if (priced.length) return `Hay equipos con precio sin oferta que lo respalde: ${priced.map((g) => `${g.brandModel} (${g.unitPriceUSD})`).join(', ')}.`;
      return proposalCompleteness(created).reasons.some((r) => r.code === 'missing_equipment_price') ? null : 'La propuesta no quedó incompleta por falta de precio.';
    },
  },
  {
    id: 'falla-no-bloquea', turns: ['pon el margen al 30 % en la propuesta zzz-no-existe'], setup: 'proposal',
    assertion: 'Con una propuesta que no existe, el turno termina con una respuesta que lo dice y sin cambiar nada.',
    check: (c) => {
      if (c.outcome !== 'finished') return `El turno no terminó normalmente (${c.outcome}).`;
      if (!c.active || sectionsOf(c.active) !== c.seedSections) return 'La propuesta existente cambió.';
      if (applied(c.tools, 'edit_proposal')) return 'Aplicó una edición que no debía existir.';
      return /no (existe|encontr|hay|se encontr|pude|logr)|inexistente|no se pudo|no tengo/.test(normalize(c.text)) ? null : `La respuesta no explica que no se pudo: «${c.text.slice(0, 160)}».`;
    },
  },
  {
    id: 'dos-cambios', turns: ['sube la cobertura al 80 % y ponle baterías'], setup: 'proposal',
    assertion: 'Una sola petición con dos cambios: cobertura 80 % y baterías incluidas.',
    check: onActive('No quedaron la cobertura al 80 % y las baterías', (p) => p.rates.targetCoveragePct === 80 && p.specs.hasBattery === true),
  },
];

// ── Resultados ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface EvalCaseResult {
  caseId: string;
  model: string;
  /** Lo que se le pidió (los mensajes, unidos). */
  prompt: string;
  assertion: string;
  status: 'pass' | 'fail' | 'error';
  /** Por qué falló la aserción. */
  failure?: string;
  /** Por qué no se pudo evaluar. */
  error?: string;
  tools: EvalToolCall[];
  /** Llamadas al modelo (incluidos los reintentos). */
  steps: number;
  durationMs: number;
  outcome?: string;
  finalText: string;
  /** El modelo de respaldo contestó en lugar del pedido. */
  fallback?: string;
}

export interface EvalReport { startedAt: string; results: EvalCaseResult[] }

export interface EvalRunOptions {
  models: readonly string[];
  cases: readonly EvalCase[];
  /** Solo estos ids (vacío o ausente: todos). */
  only?: readonly string[];
  /** El cliente del modelo para una petición. El script real devuelve siempre el mismo cliente de Gemini. */
  clientFor(model: string, caseId: string): LlmClient | Promise<LlmClient>;
  /** Textos que nunca deben salir en el informe (la clave). */
  secrets: readonly string[];
  /** Plazo por petición (por defecto 180 s). */
  timeoutMs?: number;
  now?: () => number;
  /** Espera entre reintentos del bucle (por defecto, real). */
  sleep?: (ms: number) => Promise<void>;
  onResult?: (result: EvalCaseResult) => void;
}

export function redact(text: string, secrets: readonly string[]): string {
  return secrets.filter((secret) => secret.length >= 4).reduce((out, secret) => out.split(secret).join('[clave]'), text);
}

function countingClient(client: LlmClient, counter: { n: number }): LlmClient {
  return {
    generate: (request, options) => { counter.n++; return client.generate(request, options); },
    stream: (request, options) => { counter.n++; return client.stream(request, options); },
    structured: (request, options) => { counter.n++; return client.structured(request, options); },
    listModels: (options) => client.listModels(options),
  };
}

const assistantMessages = (session: AssistantSession) =>
  session.getState().messages.filter((m): m is SessionMessage & { role: 'assistant' } => m.role === 'assistant');

async function runCase(evalCase: EvalCase, model: string, options: EvalRunOptions): Promise<EvalCaseResult> {
  const store = useSimulationStore;
  const now = options.now ?? Date.now;
  const secrets = options.secrets;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const base = { caseId: evalCase.id, model, prompt: evalCase.turns.join(' → '), assertion: evalCase.assertion };
  const startedAt = now();
  const counter = { n: 0 };
  let timedOut = false;
  let session: AssistantSession | undefined;
  const fail = (partial: Partial<EvalCaseResult> & Pick<EvalCaseResult, 'status'>): EvalCaseResult => ({
    ...base, tools: [], steps: counter.n, durationMs: now() - startedAt, finalText: '', ...partial,
  });
  try {
    const client = countingClient(await options.clientFor(model, evalCase.id), counter);
    resetEvalStore({ catalog: evalCase.setup === 'unpriced' ? unpricedCatalog() : offerCatalog(), view: evalCase.setup === 'proposal' ? 'simulator' : 'dashboard', model });
    let seed: ProjectSimulation | null = null;
    if (evalCase.setup === 'proposal') seed = structuredClone(projectOf(await seedFreshProposal()));
    const before = new Set(store.getState().projects.map((p) => p.id));
    session = newEvalSession(client, { sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))) });
    const timer = setTimeout(() => { timedOut = true; session?.cancel(); }, timeoutMs);
    try {
      for (const turn of evalCase.turns) {
        if (timedOut) break;
        await session.send(turn);
      }
    } finally { clearTimeout(timer); }

    const messages = assistantMessages(session);
    const tools: EvalToolCall[] = messages.flatMap((m) => m.turn.toolOrder.map((id) => ({ name: m.turn.tools[id].name, status: m.turn.tools[id].status })));
    const last = messages.at(-1);
    // Con varios turnos se guardan todas las respuestas: el fallo suele estar en un turno anterior al último.
    const finalText = redact(messages.map((m) => m.turn.text ?? '').filter(Boolean).join(' ‖ '), secrets);
    const outcome = last?.outcome;
    const fallback = messages.map((m) => m.modelNotice).find(Boolean);
    const common = { tools, steps: counter.n, durationMs: now() - startedAt, finalText, ...(outcome ? { outcome } : {}), ...(fallback ? { fallback: redact(fallback, secrets) } : {}) };
    if (timedOut) return { ...base, ...common, status: 'error', error: `Plazo agotado: la petición superó los ${Math.round(timeoutMs / 1000)} s.` };
    const failed = messages.find((m) => m.outcome === 'failed');
    if (failed) return { ...base, ...common, status: 'error', error: redact(failed.error?.message ?? 'El turno falló.', secrets) };
    if (messages.length < evalCase.turns.length) return { ...base, ...common, status: 'error', error: 'La conversación no llegó a completarse.' };
    const state = store.getState();
    const projects = state.projects.filter((p) => !p.isDeleted && !p.deletedAt);
    const active = projects.find((p) => p.id === state.activeProjectId);
    const context: EvalCheckContext = {
      seed, seedSections: seed ? sectionsOf(seed) : null, projects, active, created: projects.filter((p) => !before.has(p.id)),
      view: state.activeView, tools, text: last?.turn.text ?? '', outcome: outcome ?? 'unknown',
    };
    let failure: string | null;
    try { failure = evalCase.check(context); } catch (error) { failure = `La aserción no se pudo evaluar: ${error instanceof Error ? error.message : String(error)}`; }
    return failure === null ? { ...base, ...common, status: 'pass' } : { ...base, ...common, status: 'fail', failure: redact(failure, secrets) };
  } catch (error) {
    return fail({ status: 'error', error: redact(error instanceof Error ? error.message : String(error), secrets) });
  }
}

/** Evalúa cada petición con cada modelo, una tras otra (compartir el store en memoria obliga a no solapar). */
export async function runEvalSuite(options: EvalRunOptions): Promise<EvalReport> {
  const report: EvalReport = { startedAt: new Date().toISOString(), results: [] };
  const only = options.only?.length ? new Set(options.only) : null;
  for (const model of options.models) {
    for (const evalCase of options.cases) {
      if (only && !only.has(evalCase.id)) continue;
      const result = await runCase(evalCase, model, options);
      report.results.push(result);
      options.onResult?.(result);
    }
  }
  // El estado de la evaluación no se queda en el almacén: ni propuestas de prueba ni la sesión.
  resetEvalStore({ projects: [] });
  return report;
}

// ── Informe y salida ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const STATUS_LABEL = { pass: 'PASS ', fail: 'FAIL ', error: 'ERROR' } as const;

export function formatResult(result: EvalCaseResult): string {
  const tools = result.tools.length ? result.tools.map((t) => `${t.name} (${t.status})`).join(', ') : 'sin herramientas';
  const lines = [
    `  ${STATUS_LABEL[result.status]} ${result.caseId}  ${seconds(result.durationMs)} · ${result.steps} ${result.steps === 1 ? 'paso' : 'pasos'} · ${tools}`,
    `         Petición: «${result.prompt}»`,
    `         Aserción: ${result.assertion}`,
  ];
  if (result.failure) lines.push(`         Falló: ${result.failure}`);
  if (result.error) lines.push(`         No se pudo evaluar: ${result.error}`);
  if (result.fallback) lines.push(`         Aviso: ${result.fallback}`);
  if (result.finalText && result.status !== 'pass') lines.push(`         Respuesta: ${result.finalText.replace(/\s+/g, ' ').slice(0, 700)}`);
  return lines.join('\n');
}

export function formatReport(report: EvalReport): string {
  const models = [...new Set(report.results.map((r) => r.model))];
  const out: string[] = ['Evaluación del asistente (almacén en memoria, catálogo sintético; no toca datos del usuario)'];
  for (const model of models) {
    const results = report.results.filter((r) => r.model === model);
    out.push('', `Modelo: ${model}`, ...results.map(formatResult));
    const count = (status: EvalCaseResult['status']) => results.filter((r) => r.status === status).length;
    // Una petición que contestó el modelo de respaldo no habla del modelo pedido: se cuenta aparte.
    const viaFallback = results.filter((r) => r.status === 'pass' && r.fallback).length;
    out.push('', `  Resumen ${model}: ${count('pass') - viaFallback}/${results.length} aprobadas${viaFallback ? ` (y ${viaFallback} aprobadas con el modelo de respaldo, que no cuentan para ${model})` : ''}, ${count('fail')} fallidas, ${count('error')} sin evaluar.`);
  }
  return out.join('\n');
}

export function exitCodeFor(report: EvalReport): number {
  if (!report.results.length) return EXIT_USAGE;
  if (report.results.some((r) => r.status === 'error')) return EXIT_ERROR;
  return report.results.some((r) => r.status === 'fail') ? EXIT_FAILED : EXIT_OK;
}

// ── Argumentos ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type ParsedEvalArgs =
  | { ok: true; models: string[]; only: string[]; list: boolean; json: boolean; timeoutSec: number }
  | { ok: false; error: string };

export function parseEvalArgs(argv: readonly string[]): ParsedEvalArgs {
  const models: string[] = [];
  const only: string[] = [];
  let list = false;
  let json = false;
  let timeoutSec = 180;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i];
    if (arg === '--model') { const v = value(); if (!v || v.startsWith('--')) return { ok: false, error: '--model necesita el nombre de un modelo.' }; models.push(v); }
    else if (arg === '--only') {
      const v = value();
      if (!v || v.startsWith('--')) return { ok: false, error: '--only necesita ids separados por comas (--list los muestra).' };
      only.push(...v.split(',').map((id) => id.trim()).filter(Boolean));
    } else if (arg === '--timeout') {
      const v = Number(value());
      if (!Number.isFinite(v) || v <= 0) return { ok: false, error: '--timeout necesita un número de segundos mayor que 0.' };
      timeoutSec = v;
    } else if (arg === '--list') list = true;
    else if (arg === '--json') json = true;
    else return { ok: false, error: `Argumento no reconocido: ${arg}` };
  }
  const unknown = only.filter((id) => !EVAL_CASES.some((c) => c.id === id));
  if (unknown.length) return { ok: false, error: `Petición desconocida: ${unknown.join(', ')}. Con --list se ven las disponibles.` };
  return { ok: true, models: models.length ? models : [DEFAULT_GEMINI_MODEL], only, list, json, timeoutSec };
}
