import type { AIProposalIssue } from '../../../../shared/aiProposal';
import type { ExtractedInvoiceData } from '../../../types/aiInvoice';

/**
 * Capa de presentación de los avisos del borrador. La validación sólo expone código, gravedad y mensaje;
 * aquí se derivan el grupo visible (bloquea / confirmar / informativo) y el campo de la revisión al que
 * apunta cada aviso. No cambia la validación ni decide si se puede aplicar: eso sigue en el hook.
 */
export type IssueTier = 'blocking' | 'confirm' | 'info';
export type ReviewTab = 'consumption' | 'equipment' | 'commercial' | 'client';
export type EquipmentKey = 'panels' | 'inverters' | 'batteries';
export interface IssueTarget { tab?: ReviewTab; anchor: string; label: string }
export interface ReviewIssueView extends AIProposalIssue { tier: IssueTier; target?: IssueTarget }

export const REVIEW_TABS: readonly { key: ReviewTab; label: string }[] = [
  { key: 'consumption', label: 'Consumo y diseño' },
  { key: 'equipment', label: 'Equipos' },
  { key: 'commercial', label: 'Cotización' },
  { key: 'client', label: 'Cliente y tarifa' },
];

export const reviewAnchor = {
  field: (name: string) => `proposal-field-${name}`,
  group: (key: EquipmentKey) => `proposal-group-${key}`,
  row: (key: EquipmentKey, index: number) => `proposal-row-${key}-${index}`,
  commercial: (part: 'conditions' | 'costs' | 'extras' | 'discounts' | 'reconciliation' | 'totals') => `proposal-commercial-${part}`,
  unresolved: 'proposal-unresolved',
  documentTexts: 'proposal-document-texts',
};

const GROUP_LABEL: Record<EquipmentKey, string> = { panels: 'Paneles', inverters: 'Inversores', batteries: 'Baterías' };
const TYPE_KEY: Record<string, EquipmentKey> = { panel: 'panels', inverter: 'inverters', battery: 'batteries' };
/** Avisos que no piden una decisión: describen de dónde salió un dato o una referencia externa. */
const INFORMATIVE = /^(context_consumption|theoretical_consumption|automated_pricing_forced|document_\w+_difference|too_many_document_texts|unknown_document_text|document_text_is_draft_field|invalid_document_text)$/;

export function issueTier(issue: Pick<AIProposalIssue, 'code' | 'severity'>): IssueTier {
  if (issue.severity === 'error') return 'blocking';
  return INFORMATIVE.test(issue.code) ? 'info' : 'confirm';
}

/** Índice de la fila cuyo texto aparece en el mensaje; con nombres solapados («WeCo 5K» / «WeCo 5K Pro») gana el más largo. */
function longestMention(message: string, rows: readonly { text?: string; index: number }[]): number {
  let best = -1, length = 0;
  for (const { text, index } of rows) if (text && text.length > length && message.includes(text)) { best = index; length = text.length; }
  return best;
}

function equipmentTarget(issue: AIProposalIssue, key: EquipmentKey, draft?: ExtractedInvoiceData): IssueTarget {
  const rows = (draft?.[key] || []).map((row, index) => ({ row, index }));
  let index = -1;
  if (/requested_/.test(issue.code)) {
    const requested = rows.filter(({ row }) => row.requestedModel);
    // El mensaje cita el modelo solicitado entre paréntesis: es lo que mejor distingue la fila.
    index = longestMention(issue.message, requested.map(({ row, index }) => ({ text: row.requestedModel, index })));
    if (index < 0) index = longestMention(issue.message, requested.map(({ row, index }) => ({ text: row.brandModel, index })));
    if (index < 0 && requested.length === 1) index = requested[0].index;
  } else if (/_(price|count|spec)$/.test(issue.code)) {
    index = longestMention(issue.message, rows.map(({ row, index }) => ({ text: row.brandModel, index })));
  }
  return { tab: 'equipment', anchor: index >= 0 ? reviewAnchor.row(key, index) : reviewAnchor.group(key), label: GROUP_LABEL[key] };
}

export function issueTarget(issue: AIProposalIssue, draft?: ExtractedInvoiceData): IssueTarget | undefined {
  const { code } = issue;
  const client = (name: string, label: string): IssueTarget => ({ tab: 'client', anchor: reviewAnchor.field(name), label });
  const commercial = (part: Parameters<typeof reviewAnchor.commercial>[0], label: string): IssueTarget => ({ tab: 'commercial', anchor: reviewAnchor.commercial(part), label });
  if (code === 'unresolved_request') return { anchor: reviewAnchor.unresolved, label: 'Solicitudes pendientes' };
  if (/document_text/.test(code)) return { anchor: reviewAnchor.documentTexts, label: 'Textos del documento' };
  if (code === 'missing_client') return client('clientName', 'Nombre del cliente');
  if (code === 'missing_distributor') return client('distributor', 'Distribuidora');
  if (code === 'missing_tariff' || code === 'unknown_tariff') return client('tariffCode', 'Tarifa');
  if (code === 'missing_energy_rate' || code === 'reference_energy_rate') return client('energyRate', 'Tarifa de energía');
  if (code === 'invalid_exchange') return client('exchange', 'Cambio RD$ por USD');
  if (/consumption$/.test(code)) return { tab: 'consumption', anchor: reviewAnchor.field('months'), label: 'Consumo mensual' };
  if (code === 'pv_overload') return equipmentTarget(issue, 'inverters', draft);
  if (/^battery_/.test(code)) return equipmentTarget(issue, 'batteries', draft);
  if (code === 'conflicting_group_prices') return { tab: 'equipment', anchor: reviewAnchor.field('equipment'), label: 'Equipos' };
  const plural = /^missing_(panels|inverters|batteries)$/.exec(code);
  if (plural) return equipmentTarget(issue, plural[1] as EquipmentKey, draft);
  const typed = /^(?:unknown|invalid|missing|requested|too_many)_(panel|inverter|battery)(?:_|$)/.exec(code);
  if (typed) return equipmentTarget(issue, TYPE_KEY[typed[1]], draft);
  if (/^document_|source_totals/.test(code)) return commercial('reconciliation', 'Conciliación con la ficha');
  if (/discount/i.test(code)) return commercial('discounts', 'Descuentos');
  if (/extra|item/i.test(code)) return commercial('extras', 'Ítems adicionales');
  if (/labor|margin|markup|surplus|price_basis|pricing|installation/i.test(code)) return commercial('conditions', 'Condiciones de la cotización');
  return undefined;
}

export function describeIssues(issues: readonly AIProposalIssue[], draft?: ExtractedInvoiceData): ReviewIssueView[] {
  return issues.map(issue => ({ ...issue, tier: issueTier(issue), target: issueTarget(issue, draft) }));
}

export function groupIssues(views: readonly ReviewIssueView[]): Record<IssueTier, ReviewIssueView[]> {
  return { blocking: views.filter(v => v.tier === 'blocking'), confirm: views.filter(v => v.tier === 'confirm'), info: views.filter(v => v.tier === 'info') };
}

/** Pendientes por pestaña: sólo bloqueos y puntos por confirmar; los informativos no cuentan. */
export function pendingByTab(views: readonly ReviewIssueView[]): Record<ReviewTab, number> {
  const counts: Record<ReviewTab, number> = { consumption: 0, equipment: 0, commercial: 0, client: 0 };
  for (const v of views) if (v.tier !== 'info' && v.target?.tab) counts[v.target.tab]++;
  return counts;
}

export function issuesAt(views: readonly ReviewIssueView[], anchor: string): ReviewIssueView[] {
  return views.filter(v => v.target?.anchor === anchor);
}

/** Destino del botón del resumen: el primer bloqueo con campo; si no hay, el primer punto por confirmar. */
export function firstPendingTarget(views: readonly ReviewIssueView[]): IssueTarget | undefined {
  return (views.find(v => v.tier === 'blocking' && v.target) ?? views.find(v => v.tier === 'confirm' && v.target))?.target;
}

/** Qué control de una fila de equipo es responsable del aviso (para `aria-invalid`). */
export function rowControlFor(code: string): 'model' | 'count' | 'price' {
  return /_count$/.test(code) ? 'count' : /_price$|conflicting_group_prices/.test(code) ? 'price' : 'model';
}

/** El tono más grave de una lista, para colorear un campo o una pestaña (siempre acompañado de texto). */
export function worstTier(views: readonly Pick<ReviewIssueView, 'tier'>[]): IssueTier | undefined {
  return views.some(v => v.tier === 'blocking') ? 'blocking' : views.some(v => v.tier === 'confirm') ? 'confirm' : views.length ? 'info' : undefined;
}

export const TIER_COPY: Record<IssueTier, { group: string; prefix: string; empty: string }> = {
  blocking: { group: 'Bloquean la creación', prefix: 'Bloquea:', empty: '' },
  confirm: { group: 'Por confirmar', prefix: 'Confirmar:', empty: '' },
  info: { group: 'Informativos', prefix: 'Nota:', empty: '' },
};

/** Lleva la revisión al campo: cambia de pestaña si hace falta, desplaza y enfoca el primer control. */
export function focusReviewAnchor(anchor: string, attempt = 0): void {
  if (typeof document === 'undefined') return;
  const element = document.getElementById(anchor);
  if (!element || element.closest('[hidden]')) {
    if (attempt < 5) requestAnimationFrame(() => focusReviewAnchor(anchor, attempt + 1));
    return;
  }
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  const control = element.matches('input,select,textarea,button') ? element : element.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)');
  (control || element).focus({ preventScroll: true });
  element.classList.remove('proposal-flash');
  void element.offsetWidth;
  element.classList.add('proposal-flash');
}
