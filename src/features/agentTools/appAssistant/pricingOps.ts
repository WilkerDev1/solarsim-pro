/**
 * Qué lotes de `edit_proposal` tocan precios (F3a). Lo usan los permisos (`toolset.ts`: un lote de precios es protegido entero,
 * como `touchesPricing` en `propose_project_update`) y la traducción (`handlers.ts`: un lote de precios deja la propuesta con
 * `AUTOMATED_PRICING`, modo Simple con matriz de costos, como hace hoy `propose_project_update`).
 */
import { fieldPattern, parseFieldPath } from '../../../domain/projectFields';
import type { ProposalOperation } from '../../../domain/proposalOperations';
import { touchesPricingEdits } from '../../assistant/pricingFields';

const PRICING_OPERATIONS = new Set<ProposalOperation['op']>([
  'select_equipment', 'add_equipment', 'remove_equipment', 'set_storage', 'set_margin_pct', 'best_supplier',
  'upsert_item', 'remove_item', 'upsert_discount', 'remove_discount',
]);

/** Como hoy: los precios son sensibles venga de la herramienta que venga; un lote que los toca se trata entero como protegido. */
export function operationsTouchPricing(ops: unknown): boolean {
  if (!Array.isArray(ops)) return false;
  return ops.some((op: ProposalOperation) => {
    if (PRICING_OPERATIONS.has(op?.op)) return true;
    if (op?.op !== 'set' || typeof op.path !== 'string') return false;
    const [section, field] = parseFieldPath(op.path) ?? [];
    return typeof section === 'string' && typeof field === 'string' && touchesPricingEdits([{ section, field }]);
  });
}

/**
 * Precios que NO salen de la transacción (F3b, ADR 0010 §3): un `set` directo sobre el costo o la procedencia de un equipo
 * (o sobre el grupo entero, o el costo antiguo de baterías) escribe un número que dio el modelo y deja `priceSource: 'manual'`.
 * Lo mismo un `set` del modelo o la magnitud (`brandModel`, `powerW`, `powerKW`, `capacityKWh`) de un grupo con precio: el
 * equipo deja de ser el de la oferta (pierde su catálogo y su proveedor) pero conserva el costo de antes, que ya no tiene
 * procedencia. Eso no se aplica en vivo: el lote entero se confirma, en cualquier superficie, porque esa confirmación es la
 * única barrera humana contra un precio inventado. Los precios que resuelve la transacción (catálogo, «ponle baterías», mejor
 * proveedor), la cantidad de un grupo y los de margen, extras y descuentos, que el usuario dicta, sí van en vivo.
 */
const MANUAL_EQUIPMENT_PRICE = /^specs\.(panels|inverters|batteries)(\[\](\.(unitPriceUSD|priceSource|genericPriceInfo|selectedSupplierInfo))?)?$/;
const EQUIPMENT_IDENTITY = /^specs\.(panels|inverters|batteries)\[(\d+)\]\.(brandModel|powerW|powerKW|capacityKWh)$/;
type PricedGroups = { specs?: Partial<Record<'panels' | 'inverters' | 'batteries', Array<{ unitPriceUSD?: number | null }> | undefined>> };
/** ¿El grupo `index` de `list` tiene precio? Sin la propuesta o sin el grupo (p. ej. uno que añade el mismo lote), se supone que sí. */
function groupHasPrice(project: PricedGroups | undefined, list: string, index: number): boolean {
  if (!project) return true;
  const group = project.specs?.[list as 'panels' | 'inverters' | 'batteries']?.[index];
  if (!group) return true;
  return typeof group.unitPriceUSD === 'number';
}
export function operationsSetManualPrice(ops: unknown, project?: PricedGroups): boolean {
  if (!Array.isArray(ops)) return false;
  return ops.some((op: ProposalOperation) => {
    if (op?.op !== 'set' || typeof op.path !== 'string') return false;
    const pattern = fieldPattern(op.path);
    if (MANUAL_EQUIPMENT_PRICE.test(pattern) || pattern === 'specs.batteryCostUSD') return true;
    const identity = EQUIPMENT_IDENTITY.exec(op.path);
    return !!identity && groupHasPrice(project, identity[1], Number(identity[2]));
  });
}
