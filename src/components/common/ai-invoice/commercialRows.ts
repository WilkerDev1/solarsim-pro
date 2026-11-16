import type { ExtractedInvoiceData } from '../../../types/aiInvoice';
import type { FinancialSummaryResult } from '../../../types';
import { readEquipment } from '../../../../shared/equipment';

type Key = 'panels' | 'inverters' | 'batteries';
type Row = NonNullable<ExtractedInvoiceData[Key]>[number];
interface Group { id?: string; catalogItemId?: string }
/** Grupos que el motor leyó del proyecto del preview (uno por fila de la matriz de costos, en este orden). */
export interface PreviewEquipment { panels?: Group[]; inverters?: Group[]; batteries?: Group[]; hasBattery?: boolean }
export interface EquipmentCostRow { key: Key; row: Row; i: number; totalUSD?: number; itbisUSD?: number }

const KEYS: Key[] = ['panels', 'inverters', 'batteries'];

/**
 * Filas de la tabla de costos del borrador. El ITBIS sale de la matriz del motor emparejando por bloque
 * (paneles → inversores → baterías, leídos con `readEquipment` igual que el motor, incluido el grupo heredado
 * que ocupa una fila cuando el borrador no trae paneles) y por id del equipo; si el grupo no coincide, el ITBIS
 * queda pendiente en vez de leer la fila de otro equipo. Sin proyecto del preview también queda pendiente.
 */
export function equipmentCostRows(draft: ExtractedInvoiceData, financial?: FinancialSummaryResult, specs?: PreviewEquipment): EquipmentCostRow[] {
  const items = financial?.costMatrix.items || [];
  // Mismo lector que el motor: sin grupos guardados usa un grupo heredado, que también ocupa una fila.
  const equipment = specs ? readEquipment(specs as never) : undefined;
  const groups: Group[][] | undefined = equipment ? [equipment.panels, equipment.inverters, equipment.batteries] : undefined;
  const offsets = groups ? [0, groups[0].length, groups[0].length + groups[1].length] : undefined;
  return KEYS.flatMap((key, k) => (draft[key] || []).map((row, i): EquipmentCostRow => {
    const count = Number(row.count);
    const priced = row.unitPriceUSD !== undefined && Number.isFinite(row.unitPriceUSD) && Number.isFinite(count);
    const group = groups?.[k][i];
    const sameGroup = !!group && (group.id === row.id || (!!group.catalogItemId && group.catalogItemId === row.id));
    const matrixRow = sameGroup && offsets ? items[offsets[k] + i] : undefined;
    return {
      key, row, i,
      totalUSD: priced ? row.unitPriceUSD! * count : undefined,
      itbisUSD: priced && matrixRow && Number.isFinite(matrixRow.itbisUSD) ? matrixRow.itbisUSD : undefined,
    };
  }));
}
