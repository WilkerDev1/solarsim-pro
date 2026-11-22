// Resultado de `get_price_history` (ADR 0006 §6), igual en la app y en el MCP remoto. TypeScript puro.
import { priceHistoryStats, type EquipmentPriceObservation, type GenericPriceInfo } from '../equipmentPrices.js';

/** Página por llamada: 100 registros caben de sobra en los 64 KB de resultado. */
export const PRICE_HISTORY_TOOL_LIMITS = { defaultLimit: 50, maxLimit: 100 } as const;

/** Registro tal como lo leen la vista y los agentes: el del servidor o uno en cola local. */
export type PriceHistoryRecord = EquipmentPriceObservation & {
  /** Registro aún en la cola local (sin `seq`). */
  pendingSync?: boolean;
  /** Anulación en cola local: cuenta como anulado. */
  voidPending?: boolean;
};

/** Los registros con anulación en cola salen de las estadísticas igual que los anulados. */
export const statsInput = (rows: readonly PriceHistoryRecord[]): EquipmentPriceObservation[] =>
  rows.map((row) => (row.voidPending && !row.voidedAt ? { ...row, voidedAt: 'pending' } : row));

/**
 * Datos para agentes: registros sin ids internos de usuario y un resumen (meses del año, variación a 3/6/12 meses,
 * fecha del primer registro). La propuesta se identifica por código y nombre del cliente, como en `search_projects`.
 */
export function agentPriceHistory(input: {
  equipmentId: string;
  equipmentName?: string;
  records: readonly PriceHistoryRecord[];
  generic: GenericPriceInfo | null | undefined;
  hasMore: boolean;
  now?: Date;
}) {
  const stats = priceHistoryStats(statsInput(input.records), input.now ?? new Date());
  return {
    equipmentId: input.equipmentId,
    ...(input.equipmentName ? { equipmentName: input.equipmentName } : {}),
    genericPrice: input.generic ? { priceUSD: input.generic.priceUSD, observedAt: input.generic.observedAt } : null,
    records: input.records.map((row) => ({
      id: row.id,
      ...(row.seq !== undefined ? { seq: row.seq } : {}),
      kind: row.kind,
      priceUSD: row.priceUSD,
      ...(row.originalCurrency ? { originalCurrency: row.originalCurrency, originalPrice: row.originalPrice } : {}),
      source: row.source,
      ...(row.supplierName ? { supplierName: row.supplierName } : {}),
      ...(row.source === 'proposal'
        ? {
            projectId: row.projectId,
            projectCode: row.projectCode ?? null,
            projectName: row.projectName ?? null,
            ...(row.projectId && !row.projectName && !row.projectCode && !row.pendingSync ? { proposalDeleted: true } : {}),
          }
        : {}),
      observedAt: row.observedAt,
      author: row.createdByName ?? null,
      voided: !!row.voidedAt || !!row.voidPending,
      ...(row.voidedAt ? { voidedAt: row.voidedAt } : {}),
      ...(row.pendingSync ? { pendingSync: true } : {}),
      ...(row.voidPending ? { voidPending: true } : {}),
    })),
    stats: {
      byCalendarMonth: stats.byCalendarMonth,
      latestMonth: stats.latestMonth,
      change: stats.change,
      firstObservedAt: stats.firstObservedAt,
      basis: 'Registros observation no anulados con precio > 0 de esta página; meses sin registros quedan en null (sin interpolar).',
    },
    hasMore: input.hasMore,
  };
}
