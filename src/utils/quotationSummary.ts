/**
 * Lógica pura del catálogo de cotizaciones (docs/QUOTATIONS.md#catálogo): vistas por estado efectivo, indicadores en
 * RD$, filtro/búsqueda/orden, etiquetas de fecha y vigencia, transiciones ofrecidas y marca de sincronización.
 * No lee relojes: la fecha local de hoy entra como argumento (`localIsoDate`).
 */
import {
  canTransitionQuotation, computeQuotationTotals, convertCents, effectiveQuotationStatus, type QuotationCurrency, type QuotationStatus,
} from '../../shared/quotations';
import type { QuotationChange, QuotationDeletionCommand, QuotationRecord } from '../types/quotation';
import { isProjectInFolderView } from './folderVisibility';

export type QuotationView = 'all' | 'draft' | 'issued' | 'accepted' | 'expired' | 'rejected' | 'void';

/** Vistas de la columna izquierda, en orden. `title` es el título de la cabecera con la vista activa. */
export const QUOTATION_VIEWS: readonly { id: QuotationView; label: string; title: string }[] = [
  { id: 'all', label: 'Todas', title: 'Todas las cotizaciones' },
  { id: 'draft', label: 'Borradores', title: 'Borradores' },
  { id: 'issued', label: 'Emitidas', title: 'Emitidas' },
  { id: 'accepted', label: 'Aceptadas', title: 'Aceptadas' },
  { id: 'expired', label: 'Vencidas', title: 'Vencidas' },
  { id: 'rejected', label: 'Rechazadas', title: 'Rechazadas' },
  { id: 'void', label: 'Anuladas', title: 'Anuladas' },
];

/** Carpeta activa (o ninguna) y carpetas ocultas de la vista general, con la misma regla que Inicio. */
export interface QuotationFolderScope {
  folderId: string | null;
  hiddenFolderIds: ReadonlySet<string>;
}

const inScope = (quotation: QuotationRecord, scope?: QuotationFolderScope) =>
  !scope || isProjectInFolderView(quotation, scope.hiddenFolderIds as Set<string>, scope.folderId);

/** Total del documento en su moneda (centavos), con `computeQuotationTotals`. */
export const quotationTotalCents = (quotation: Pick<QuotationRecord, 'items' | 'discounts'>): number => computeQuotationTotals(quotation).totalCents;

/** Total convertido a RD$ con la tasa de la propia cotización. */
export const quotationTotalDopCents = (quotation: QuotationRecord): number =>
  convertCents(quotationTotalCents(quotation), quotation.currency, 'DOP', quotation.exchangeRate);

/** Recuento de cada vista por estado efectivo («Vencida» incluida) dentro del ámbito de carpeta. */
export function countQuotationsByView(quotations: readonly QuotationRecord[], today: string, scope?: QuotationFolderScope): Record<QuotationView, number> {
  const counts: Record<QuotationView, number> = { all: 0, draft: 0, issued: 0, accepted: 0, expired: 0, rejected: 0, void: 0 };
  for (const quotation of quotations) {
    if (!inScope(quotation, scope)) continue;
    counts.all++;
    counts[effectiveQuotationStatus(quotation, today)]++;
  }
  return counts;
}

export interface QuotationKpi {
  id: 'draft' | 'issued' | 'accepted' | 'expired';
  label: string;
  count: number;
  /** Suma en RD$ (centavos); cada cotización convertida con su propia tasa. */
  amountDopCents: number;
}

const KPI_LABELS: Record<QuotationKpi['id'], string> = {
  draft: 'Borradores',
  issued: 'Emitidas por responder',
  accepted: 'Aceptadas',
  expired: 'Vencidas',
};

/** Indicadores: borradores, emitidas por responder (vigentes), aceptadas y vencidas, con importe y número. */
export function summarizeQuotations(quotations: readonly QuotationRecord[], today: string, scope?: QuotationFolderScope): QuotationKpi[] {
  const kpis = (Object.keys(KPI_LABELS) as QuotationKpi['id'][]).map((id) => ({ id, label: KPI_LABELS[id], count: 0, amountDopCents: 0 }));
  const byId = new Map(kpis.map((kpi) => [kpi.id, kpi]));
  for (const quotation of quotations) {
    if (!inScope(quotation, scope)) continue;
    const kpi = byId.get(effectiveQuotationStatus(quotation, today) as QuotationKpi['id']);
    if (!kpi) continue;
    kpi.count++;
    kpi.amountDopCents += quotationTotalDopCents(quotation);
  }
  return kpis;
}

export interface QuotationFilter extends QuotationFolderScope {
  view: QuotationView;
  query: string;
  currency: 'all' | QuotationCurrency;
  today: string;
}

/** Minúsculas sin acentos, para buscar sin importar cómo se escribió. */
const searchKey = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Fecha de emisión descendente; a igual fecha, número descendente y después la creación más reciente. */
export function compareQuotationsByIssueDate(a: QuotationRecord, b: QuotationRecord): number {
  if (a.issueDate !== b.issueDate) return a.issueDate < b.issueDate ? 1 : -1;
  const numberA = a.number ?? '', numberB = b.number ?? '';
  if (numberA !== numberB) return numberA < numberB ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

/** Lista visible: ámbito de carpeta, vista por estado efectivo, moneda y búsqueda por número, cliente o proyecto. */
export function filterQuotations(quotations: readonly QuotationRecord[], filter: QuotationFilter): QuotationRecord[] {
  const query = searchKey(filter.query);
  return quotations
    .filter((quotation) => {
      if (!inScope(quotation, filter)) return false;
      if (filter.view !== 'all' && effectiveQuotationStatus(quotation, filter.today) !== filter.view) return false;
      if (filter.currency !== 'all' && quotation.currency !== filter.currency) return false;
      if (!query) return true;
      return [quotation.number ?? '', quotation.client.name, quotation.projectLabel].some((field) => searchKey(field).includes(query));
    })
    .sort(compareQuotationsByIssueDate);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11-23' → '23 nov 2026' (sin Intl: no depende del idioma del sistema). Lo que no sea una fecha → '—'. */
export function formatQuotationDate(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) return '—';
  return `${Number(match[3])} ${MONTHS[month - 1]} ${match[1]}`;
}

/** «Sin vigencia», «Vence 21 dic 2026» (también hoy, que aún es válida) o «Venció 14 nov 2026». */
export function quotationValidityLabel(quotation: { status: QuotationStatus; validUntil: string | null }, today: string): string {
  if (!quotation.validUntil) return 'Sin vigencia';
  return `${quotation.validUntil < today ? 'Venció' : 'Vence'} ${formatQuotationDate(quotation.validUntil)}`;
}

const STATUS_ACTIONS: readonly { to: QuotationStatus; label: string }[] = [
  { to: 'issued', label: 'Emitir' },
  { to: 'accepted', label: 'Marcar aceptada' },
  { to: 'rejected', label: 'Marcar rechazada' },
  { to: 'draft', label: 'Reabrir' },
  { to: 'void', label: 'Anular' },
];

/** Cambios de estado que se ofrecen desde `status`: exactamente los que permite `canTransitionQuotation`. */
export const quotationStatusActions = (status: QuotationStatus) => STATUS_ACTIONS.filter((action) => canTransitionQuotation(status, action.to));

export type QuotationSyncIssueKind =
  | 'pending'
  | 'version_conflict'
  | 'stale_deletion'
  | 'server_deleted'
  | 'rejected'
  | 'deletion_rejected';

export interface QuotationSyncIssue {
  kind: QuotationSyncIssueKind;
  /** El cambio es de esta cuenta (o del espacio local): solo entonces se puede resolver desde aquí. */
  own: boolean;
  error?: string;
  /** Versión del servidor en un conflicto de versión o de borrado obsoleto. */
  serverVersion?: number;
}

/**
 * Estado de sincronización que se marca en la fila y se explica en el dock. Sin cuenta no hay servidor, así que no
 * hay nada pendiente de publicar ni conflictos.
 */
export function quotationSyncIssue(
  id: string,
  context: { changes: Record<string, QuotationChange>; deletionQueue: readonly QuotationDeletionCommand[]; userId?: string | null; signedIn: boolean },
): QuotationSyncIssue | null {
  if (!context.signedIn) return null;
  const own = (ownerId?: string) => !ownerId || ownerId === context.userId;
  const change = context.changes[id];
  if (change) {
    const mine = own(change.ownerId);
    if (change.serverDeleted) return { kind: 'server_deleted', own: mine };
    if (change.serverQuotation) {
      return { kind: change.deletionConflict ? 'stale_deletion' : 'version_conflict', own: mine, serverVersion: change.serverQuotation.version };
    }
    if (change.rejected) return { kind: 'rejected', own: mine, error: change.rejected.error };
    return { kind: 'pending', own: mine };
  }
  const refused = context.deletionQueue.find((command) => command.id === id && command.rejected);
  if (refused?.rejected) return { kind: 'deletion_rejected', own: own(refused.ownerId), error: refused.rejected.error };
  return null;
}
