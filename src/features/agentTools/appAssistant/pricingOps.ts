/**
 * Qué lotes de `edit_proposal` tocan precios (F3a). Lo usan los permisos (`toolset.ts`: un lote de precios es protegido entero,
 * como `touchesPricing` en `propose_project_update`) y la traducción (`handlers.ts`: un lote de precios deja la propuesta con
 * `AUTOMATED_PRICING`, modo Simple con matriz de costos, como hace hoy `propose_project_update`).
 */
import { parseFieldPath } from '../../../domain/projectFields';
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
