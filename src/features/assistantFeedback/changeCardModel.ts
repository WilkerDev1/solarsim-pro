/**
 * Modelo de la tarjeta de cambio del asistente (F5a): TODO el formateo, en funciones puras (sin React, sin store, sin reloj).
 * Recibe los datos en la forma común de F3a/F3c (`AssistantToolResponse` completa; el evento `tool_call_finished` no trae resultados ni avisos y no basta: cambios por ruta con etiqueta,
 * antes, después y derivados; resultados del motor antes y después, o los motivos de «incompleta»; avisos; supuestos) y
 * devuelve lo que `ChangeCard.tsx` solo tiene que pintar.
 *
 * Reglas:
 * - Cada valor con su unidad y su moneda (`formatFieldValue`); «—» para un dato borrado o sin «antes».
 * - Lo que pidió el lote va primero; lo que cambió una regla o una dependencia (`derived`) va agrupado aparte.
 * - Resultados: las cifras del motor antes → después (solo lo que cambió); en una propuesta incompleta NUNCA hay cifras, solo los
 *   motivos (ADR 0009): ni las de antes ni ceros.
 * - Botones según el estado: Deshacer solo si está aplicado y hay actividad que deshacer; Confirmar y Rechazar solo si está pendiente.
 */
import type { ProjectFieldChange, ProjectEditMetrics } from '../../domain/projectEditTransaction';
import type { EngineResults } from '../../domain/proposalSnapshot';
import type { AssistantToolResponse } from '../agentTools/appAssistant/toolset';
import type { AssumptionSource, DeclaredAssumption } from '../agentTools/appAssistant/assumptions';
import { GRID_CONNECTION_LABELS, isGridConnectionMode } from '../../../shared/gridConnection';
import { SUPPLY_ALTERNATIVE_LABELS, isSupplyAlternative } from '../../../shared/offGridSupply';
import { NET_METERING_REGIME_LABELS, isNetMeteringRegime } from '../../../shared/netMetering';

/** Filas que muestra la tarjeta antes de «y N más». */
export const CARD_MAX_ROWS = 8;
const MAX_TEXT = 60;
const NO_VALUE = '—';

export type ChangeCardStatus = 'applied' | 'pending_confirmation' | 'undone' | 'rejected' | 'expired' | 'error';

export interface ChangeCardInput {
  status: ChangeCardStatus;
  /** Qué hizo el asistente («Cambio de distribuidora»); sin él, un título según el estado. */
  title?: string;
  proposalId?: string;
  changes: readonly ProjectFieldChange[];
  /** Resultados del motor antes y después (`results` de la respuesta de una herramienta). */
  results?: { before: EngineResults | null; after: EngineResults | null } | null;
  warnings?: readonly string[];
  assumptions?: readonly DeclaredAssumption[];
  /** Cambio aplicado: lo que recibe `undo_change` / `undoAgentActivity`. */
  activityId?: string;
  /** Cambio pendiente: lo que recibe `confirmAgentAction` / `rejectAgentAction`. */
  actionId?: string;
  error?: { code: string; message: string };
}

// ── Valores ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const number = (value: number, options: Intl.NumberFormatOptions = {}) => value.toLocaleString('en-US', options);
const fixed = (value: number, digits: number) => number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const plain = (value: number) => number(value, { maximumFractionDigits: 2 });
const shorten = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text);

const ENUM_LABELS: Readonly<Record<string, string>> = {
  cost_matrix: 'Matriz de costos', direct_watt: 'Precio directo',
  residential: 'Residencial', commercial: 'Comercial', industrial: 'Industrial', custom: 'Personalizado',
  reference: 'Referencia de la distribuidora', invoice: 'Factura', manual: 'Manual',
  margin: 'Margen', labor: 'Mano de obra',
  province: 'Provincia', gps: 'GPS',
  fixed: 'Monto fijo', percentage: 'Porcentaje', general: 'General', equipment: 'Equipos',
  average: 'Consumo promedio', peak_month: 'Mes pico',
  withdrawn: 'Energía retirada', net: 'Energía neta',
  USD: 'USD', DOP: 'DOP',
};

type UnitRule = readonly [RegExp, (value: number) => string];
/** Unidad de un número según la ruta (el patrón del registro, sin índices). */
const UNIT_RULES: readonly UnitRule[] = [
  [/\.(unitPriceUSD|batteryReplacementCostUSD|replacementCostUSD)$|^specs\.batteryReplacementCostUSD$/, (v) => `$${fixed(v, 2)}`],
  [/pricePerWattUSD$/, (v) => `$${fixed(v, 2)}/W`],
  [/pricePerKWpUSD$|installationUnitPriceUSD$/, (v) => `$${fixed(v, 2)}/kWp`],
  [/energyCostPerKWh$|generatorCostPerKWh$/, (v) => `$${fixed(v, 3)}/kWh`],
  [/DOPPerKWh$/, (v) => `RD$ ${fixed(v, 2)}/kWh`],
  [/dopExchangeRate$|usdExchangeRate$/, (v) => `RD$ ${fixed(v, 2)}`],
  [/saleMarginMultiplier$/, (v) => `×${fixed(v, 2)} (margen ${plain((v - 1) * 100)} %)`],
  [/Pct$|systemLosses$|panelEfficiency$|annualDegradation$|daytimeLoadRatio$|daytimeSelfConsumptionRatio$/, (v) => `${plain(v)} %`],
  [/tempCoeff$/, (v) => `${plain(v)} %/°C`],
  [/powerW$/, (v) => `${plain(v)} W`],
  [/powerKW$/, (v) => `${plain(v)} kW`],
  [/capacityKWh$|^monthlyConsumption\[\]$/, (v) => `${plain(v)} kWh`],
  [/Years$/, (v) => `${plain(v)} años`],
  [/quoteValidityDays$/, (v) => `${plain(v)} días`],
];

const pattern = (path: string) => path.replace(/\[\d+\]/g, '[]');
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Un grupo de equipos: `10× Canadian 590 W`. */
const isGroup = (value: unknown): value is { brandModel?: unknown; count?: unknown } => isRecord(value) && ('brandModel' in value || 'count' in value);
const groupText = (group: { brandModel?: unknown; count?: unknown }) =>
  `${typeof group.count === 'number' ? `${plain(group.count)}× ` : ''}${typeof group.brandModel === 'string' && group.brandModel.trim() ? group.brandModel.trim() : 'sin modelo'}`;

/** Un valor del registro de campos, legible y con su unidad. Nunca JSON crudo. */
export function formatFieldValue(path: string, value: unknown): string {
  if (value === undefined || value === null) return NO_VALUE;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  const key = pattern(path);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NO_VALUE;
    const rule = UNIT_RULES.find(([re]) => re.test(key));
    return rule ? rule[1](value) : plain(value);
  }
  if (typeof value === 'string') {
    if (value === '') return '(vacío)';
    if (isGridConnectionMode(value)) return GRID_CONNECTION_LABELS[value];
    if (isSupplyAlternative(value)) return SUPPLY_ALTERNATIVE_LABELS[value];
    if (isNetMeteringRegime(value)) return NET_METERING_REGIME_LABELS[value];
    return shorten(ENUM_LABELS[value] ?? value);
  }
  if (Array.isArray(value)) {
    if (key === 'monthlyConsumption' && value.every((item) => typeof item === 'number')) return `${plain((value as number[]).reduce((a, b) => a + b, 0))} kWh/año`;
    if (/^financials\.customItems$/.test(key)) return plural(value.length, 'ítem', 'ítems');
    if (/^financials\.customDiscounts$/.test(key)) return plural(value.length, 'descuento', 'descuentos');
    if (!value.length) return 'ninguno';
    if (value.every(isGroup)) return shorten(value.map(groupText).join(', '));
    return plural(value.length, 'elemento', 'elementos');
  }
  if (isGroup(value)) return shorten(groupText(value));
  return '(ver detalle)';
}

/** La etiqueta sin la unidad entre paréntesis: la unidad ya va en el valor. «Costo unitario del panel (USD) (#1)» → «… del panel (#1)». */
const cleanLabel = (label: string) => label.replace(/\s*\((?:USD|W|kW|kWh|años|HSP|RD\$\/kWh|USD\/kWh|USD\/kWp)\)/g, '').trim();

export interface ChangeRowView {
  path: string;
  label: string;
  before: string;
  after: string;
  derived: boolean;
}

const rowOf = (change: ProjectFieldChange): ChangeRowView => ({
  path: change.path, label: cleanLabel(change.label), before: formatFieldValue(change.path, change.before), after: formatFieldValue(change.path, change.after), derived: change.derived,
});

// ── Resultados del motor ────────────────────────────────────────────────────────────────────────────────────────────────
export interface ResultRowView {
  key: keyof ProjectEditMetrics;
  label: string;
  before: string;
  after: string;
}

export type ResultsView =
  | { kind: 'none' }
  /** Cifras del motor: `rows` solo con lo que cambió (todas si no había «antes»); `unchanged` si nada cambió. */
  | { kind: 'metrics'; rows: ResultRowView[]; unchanged: boolean }
  /** Propuesta incompleta: los motivos y ninguna cifra. */
  | { kind: 'incomplete'; reasons: string[] };

const METRICS: readonly { key: keyof ProjectEditMetrics; label: string; format: (value: number) => string }[] = [
  { key: 'systemCapacityKWp', label: 'Potencia del sistema', format: (v) => `${plain(v)} kWp` },
  { key: 'annualProductionKWh', label: 'Producción anual', format: (v) => `${plain(v)} kWh` },
  { key: 'energyCoveragePct', label: 'Cobertura de energía', format: (v) => `${plain(v)} %` },
  { key: 'contractPriceUSD', label: 'Precio de contrato', format: (v) => `$${fixed(v, 2)}` },
  { key: 'netInvestmentUSD', label: 'Inversión neta', format: (v) => `$${fixed(v, 2)}` },
  { key: 'year1SavingsUSD', label: 'Ahorro del año 1', format: (v) => `$${fixed(v, 2)}` },
  { key: 'paybackYears', label: 'Retorno', format: (v) => `${fixed(v, 1)} años` },
];

function resultsView(results: ChangeCardInput['results']): ResultsView {
  if (!results || (!results.before && !results.after)) return { kind: 'none' };
  const { before, after } = results;
  // Incompleta después: solo los motivos (ni las cifras de antes, que ya no son las de la propuesta).
  if (after && !after.complete) return { kind: 'incomplete', reasons: after.reasons.map((reason) => reason.message) };
  if (!after) return { kind: 'none' };
  const previous = before && before.complete ? before.metrics : null;
  const rows = METRICS.flatMap(({ key, label, format }): ResultRowView[] => {
    const now = after.metrics[key];
    const was = previous?.[key];
    if (previous && Math.abs((was as number) - now) < 1e-9) return [];
    return [{ key, label, before: was === undefined ? NO_VALUE : format(was), after: format(now) }];
  });
  return { kind: 'metrics', rows, unchanged: !!previous && rows.length === 0 };
}

// ── Tarjeta ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface AssumptionView {
  label: string;
  value: string;
  /** De dónde sale, en una frase corta. */
  origin: string;
}

const ORIGIN_LABELS: Readonly<Record<AssumptionSource, string>> = {
  settings: 'tus Ajustes', factory: 'valor de fábrica', sizing: 'supuesto del dimensionado', proposal: 'dato de la propuesta',
};

const assumptionValue = (value: unknown): string =>
  typeof value === 'number' ? plain(value) : typeof value === 'string' ? shorten(ENUM_LABELS[value] ?? value) : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : shorten(JSON.stringify(value) ?? NO_VALUE);

export interface ChangeCardView {
  status: ChangeCardStatus;
  tone: 'applied' | 'pending' | 'neutral' | 'error';
  title: string;
  /** Línea de estado («Cambios aplicados»). */
  headline: string;
  /** «4 cambios (2 ajustados solos)». */
  summary: string;
  rows: ChangeRowView[];
  /** Filas pedidas que no caben en la tarjeta. */
  hiddenRows: number;
  /** Lo que cambió una regla o una dependencia, agrupado. */
  derived: { label: string; rows: ChangeRowView[] } | null;
  results: ResultsView;
  warnings: string[];
  assumptions: AssumptionView[];
  error?: string;
  actions: { undo: boolean; confirm: boolean; reject: boolean };
}

const HEADLINES: Record<ChangeCardStatus, { headline: string; title: string; tone: ChangeCardView['tone'] }> = {
  applied: { headline: 'Cambios aplicados', title: 'Cambios en la propuesta', tone: 'applied' },
  pending_confirmation: { headline: 'Espera tu confirmación', title: 'Cambio por confirmar', tone: 'pending' },
  undone: { headline: 'Cambio deshecho', title: 'Cambios en la propuesta', tone: 'neutral' },
  rejected: { headline: 'Cambio rechazado', title: 'Cambio por confirmar', tone: 'neutral' },
  expired: { headline: 'Cambio caducado: pídelo de nuevo', title: 'Cambio por confirmar', tone: 'neutral' },
  error: { headline: 'No se pudo aplicar', title: 'Cambio no aplicado', tone: 'error' },
};

function summaryText(status: ChangeCardStatus, total: number, derived: number): string {
  if (!total) return status === 'error' ? 'No se cambió nada.' : 'Sin cambios.';
  const base = plural(total, 'cambio', 'cambios');
  const extra = derived ? ` (${plural(derived, 'ajustado solo', 'ajustados solos')})` : '';
  return status === 'pending_confirmation' ? `${base}${extra}: no se ha aplicado todavía.` : `${base}${extra}`;
}

export function buildChangeCardView(input: ChangeCardInput): ChangeCardView {
  const meta = HEADLINES[input.status];
  const all = input.changes.map(rowOf);
  const asked = all.filter((row) => !row.derived);
  const derived = all.filter((row) => row.derived);
  return {
    status: input.status,
    tone: meta.tone,
    title: input.title?.trim() || meta.title,
    headline: meta.headline,
    summary: summaryText(input.status, all.length, derived.length),
    rows: asked.slice(0, CARD_MAX_ROWS),
    hiddenRows: Math.max(0, asked.length - CARD_MAX_ROWS),
    derived: derived.length ? { label: `Se ajustó solo (${derived.length})`, rows: derived.slice(0, CARD_MAX_ROWS) } : null,
    results: resultsView(input.results),
    warnings: [...(input.warnings ?? [])],
    assumptions: (input.assumptions ?? []).map((a) => ({ label: a.label, value: assumptionValue(a.value), origin: ORIGIN_LABELS[a.source] })),
    ...(input.error ? { error: input.error.message } : {}),
    actions: {
      undo: input.status === 'applied' && !!input.activityId,
      confirm: input.status === 'pending_confirmation' && !!input.actionId,
      reject: input.status === 'pending_confirmation' && !!input.actionId,
    },
  };
}

/**
 * La entrada de la tarjeta a partir de la respuesta común de una herramienta del asistente (F3a). `null` si la respuesta no es
 * un cambio que mostrar: una consulta (`ok`), o un cambio aplicado sin ningún cambio real.
 */
export function changeCardInputFromResponse(
  response: AssistantToolResponse,
  extra: { title?: string; assumptions?: readonly DeclaredAssumption[] } = {},
): ChangeCardInput | null {
  if (response.status === 'ok') return null;
  if (response.status === 'applied' && !response.changes.length) return null;
  const base = {
    ...(extra.title ? { title: extra.title } : {}), ...(response.proposalId ? { proposalId: response.proposalId } : {}),
    changes: response.changes, results: response.results, warnings: response.warnings,
    ...(extra.assumptions?.length ? { assumptions: extra.assumptions } : {}),
  };
  if (response.status === 'error') return { ...base, status: 'error', error: response.error ?? { code: 'unknown', message: 'No se pudo aplicar.' } };
  if (response.status === 'pending_confirmation') return { ...base, status: 'pending_confirmation', ...(response.actionId ? { actionId: response.actionId } : {}) };
  return { ...base, status: 'applied', ...(response.activityId ? { activityId: response.activityId } : {}) };
}
