import { auditCatalog, type CatalogAuditCode } from '../../utils/catalogAudit';
import { CATALOG_AUDIT_CODE_LABELS } from '../../../shared/catalogAuditCodes';
import { genericPriceDecision } from '../../../shared/equipmentPrices';
import { effectiveGenericPrice, priceFeatureActive } from '../../store/slices/equipmentPriceSlice';
import { visibleAssistantEquipment, visibleAssistantProjects } from '../assistant/tools';
import { canWriteWorkspace, findVisibleEquipment, fingerprint, store, type NativeHandler } from './nativeTools';

const STOCK_LABEL = { in_stock: 'En stock', on_order: 'Bajo pedido', out_of_stock: 'Agotado', consult: 'Consultar' } as const;
const normalize = (s: unknown) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const auditCatalogTool: NativeHandler = (args) => {
  const s = store();
  const equipment = visibleAssistantEquipment();
  // Precio genérico efectivo (ADR 0006); sin sesión la función está apagada y el mapa queda vacío.
  const genericPrices = priceFeatureActive(s) ? Object.fromEntries(equipment.map((e) => [e.id, effectiveGenericPrice(s, e.id)])) : {};
  const report = auditCatalog(equipment, visibleAssistantProjects(), { now: new Date(), staleDays: args.staleDays, type: args.type, genericPrices });
  // «Equipos sin precio» y similares: solo los tipos de hallazgo pedidos (el esquema ya validó los códigos).
  const codes = Array.isArray(args.codes) && args.codes.length ? new Set(args.codes as CatalogAuditCode[]) : undefined;
  const matching = codes ? report.findings.filter((f) => codes.has(f.code)) : report.findings;
  const findings = matching.slice(0, 100);
  const filterLabel = codes ? ` (${[...codes].map((c) => CATALOG_AUDIT_CODE_LABELS[c]).join(', ')})` : '';
  return {
    data: { summary: report.summary, ...(codes ? { codes: [...codes], matching: matching.length } : {}), findings, truncated: matching.length > findings.length },
    cards: [{
      type: 'catalog-audit', id: `audit-${Date.now()}`, title: 'Auditoría del inventario',
      detail: `${matching.length} hallazgos${filterLabel} en ${report.summary.equipmentCount} equipos`,
      findings: findings.slice(0, 60).map((f) => ({ code: f.code, severity: f.severity, equipmentId: f.equipmentId, message: f.message })),
    }],
  };
};

const listSupplierOffers: NativeHandler = (args) => {
  const query = normalize(args.query);
  const supplier = normalize(args.supplier);
  const offers = visibleAssistantEquipment()
    .filter((e) => !args.equipmentId || e.id === args.equipmentId)
    .flatMap((e) => (e.supplierPrices || []).map((o) => ({
      equipmentId: e.id, equipmentName: e.displayName, type: e.type, offerId: o.id, supplierName: o.supplierName,
      priceUSD: o.priceUSD, currency: o.currency, priceDOP: o.priceDOP, stockStatus: o.stockStatus, sku: o.sku, updatedAt: o.updatedAt,
      preferred: e.preferredSupplierId === o.id,
    })))
    .filter((o) => (!supplier || normalize(o.supplierName).includes(supplier)) && (!query || normalize(`${o.equipmentName} ${o.supplierName} ${o.sku}`).includes(query)))
    .slice(0, 50);
  return { data: { offers, limit: 50 } };
};

/** Texto del resultado cuando el nuevo precio difiere del precio genérico (sin sesión la función está apagada). */
function genericPriceNote(equipmentId: string, priceUSD: number): string | undefined {
  const s = store();
  if (!priceFeatureActive(s) || !(priceUSD > 0)) return undefined;
  const generic = effectiveGenericPrice(s, equipmentId);
  const decision = genericPriceDecision(generic?.priceUSD, priceUSD);
  if (decision === 'none') return undefined;
  return generic
    ? `El nuevo precio (US$ ${priceUSD}) difiere del precio genérico del equipo (US$ ${generic.priceUSD}); el genérico no cambió.`
    : `El equipo no tiene precio genérico; el nuevo precio (US$ ${priceUSD}) no lo fija.`;
}

const updateSupplierPrice: NativeHandler = (args) => {
  const check = () => {
    if (!canWriteWorkspace()) throw new Error('Tu cuenta solo puede consultar.');
    const item = findVisibleEquipment(args.equipmentId);
    if (store().equipmentConflicts[item.id]) throw new Error('Resuelve primero el conflicto del equipo.');
    const offer = item.supplierPrices?.find((o) => o.id === args.offerId);
    if (!offer) throw new Error('Oferta no encontrada en ese equipo.');
    if (args.priceUSD === undefined && args.stockStatus === undefined) throw new Error('Indica priceUSD o stockStatus.');
    return { item, offer };
  };
  const { item, offer } = check();
  const changes = [
    ...(args.priceUSD !== undefined ? [{ label: 'Precio USD', value: `${offer.priceUSD} → ${args.priceUSD}` }] : []),
    ...(args.stockStatus ? [{ label: 'Disponibilidad', value: `${STOCK_LABEL[offer.stockStatus || 'consult']} → ${STOCK_LABEL[args.stockStatus as keyof typeof STOCK_LABEL]}` }] : []),
  ];
  return {
    data: { status: 'ready' },
    plan: {
      title: `${item.displayName} · ${offer.supplierName}`, targetType: 'equipment', changes,
      execute() {
        const fresh = check();
        const before = { supplierPrices: structuredClone(fresh.item.supplierPrices) };
        // An explicit USD price replaces the original DOP quote, as in the supplier editor.
        const priceChange = args.priceUSD !== undefined ? { priceUSD: args.priceUSD, currency: 'USD' as const, priceDOP: undefined } : {};
        // ADR 0006: the price change is recorded with source `agent` (never a prompt: the tool may run unattended).
        const priceObservationIds = store().addOrUpdateSupplierPrice(fresh.item.id, { ...fresh.offer, ...priceChange, ...(args.stockStatus ? { stockStatus: args.stockStatus } : {}) }, { priceSource: 'agent' });
        const after = store().equipmentCatalog.find((e) => e.id === fresh.item.id)!;
        const genericPrice = args.priceUSD !== undefined ? genericPriceNote(fresh.item.id, Number(args.priceUSD)) : undefined;
        return {
          targetId: fresh.item.id,
          data: genericPrice ? { genericPrice } : undefined,
          undo: { before, afterFingerprint: fingerprint({ supplierPrices: after.supplierPrices }), ...(priceObservationIds.length ? { priceObservationIds } : {}) },
        };
      },
    },
  };
};

export const CATALOG_TOOL_HANDLERS: Record<string, NativeHandler> = {
  audit_catalog: auditCatalogTool,
  list_supplier_offers: listSupplierOffers,
  update_supplier_price: updateSupplierPrice,
};
