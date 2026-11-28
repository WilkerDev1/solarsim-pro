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
 * Eso no se aplica en vivo: el lote entero se confirma, en cualquier superficie, porque esa confirmación es la única barrera
 * humana contra un precio inventado. Los precios que resuelve la transacción (catálogo, «ponle baterías», mejor proveedor) y
 * los de margen, extras y descuentos, que el usuario dicta, sí van en vivo.
 */
const MANUAL_EQUIPMENT_PRICE = /^specs\.(panels|inverters|batteries)(\[\](\.(unitPriceUSD|priceSource|genericPriceInfo|selectedSupplierInfo))?)?$/;
export function operationsSetManualPrice(ops: unknown): boolean {
  if (!Array.isArray(ops)) return false;
  return ops.some((op: ProposalOperation) => {
    if (op?.op !== 'set' || typeof op.path !== 'string') return false;
    const pattern = fieldPattern(op.path);
    return MANUAL_EQUIPMENT_PRICE.test(pattern) || pattern === 'specs.batteryCostUSD';
  });
}
