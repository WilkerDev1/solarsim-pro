import { auditCatalog } from '../../utils/catalogAudit';
import { visibleAssistantEquipment, visibleAssistantProjects } from '../assistant/tools';
import { canWriteWorkspace, findVisibleEquipment, fingerprint, store, type NativeHandler } from './nativeTools';

const STOCK_LABEL = { in_stock: 'En stock', on_order: 'Bajo pedido', out_of_stock: 'Agotado', consult: 'Consultar' } as const;
const normalize = (s: unknown) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const auditCatalogTool: NativeHandler = (args) => {
  const report = auditCatalog(visibleAssistantEquipment(), visibleAssistantProjects(), { now: new Date(), staleDays: args.staleDays, type: args.type });
  const findings = report.findings.slice(0, 100);
  return {
    data: { summary: report.summary, findings, truncated: report.findings.length > findings.length },
    cards: [{
      type: 'catalog-audit', id: `audit-${Date.now()}`, title: 'Auditoría del inventario',
      detail: `${report.summary.total} hallazgos en ${report.summary.equipmentCount} equipos`,
      findings: findings.slice(0, 30).map((f) => ({ code: f.code, severity: f.severity, equipmentId: f.equipmentId, message: f.message })),
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
        store().addOrUpdateSupplierPrice(fresh.item.id, { ...fresh.offer, ...priceChange, ...(args.stockStatus ? { stockStatus: args.stockStatus } : {}) });
        const after = store().equipmentCatalog.find((e) => e.id === fresh.item.id)!;
        return { targetId: fresh.item.id, undo: { before, afterFingerprint: fingerprint({ supplierPrices: after.supplierPrices }) } };
      },
    },
  };
};

export const CATALOG_TOOL_HANDLERS: Record<string, NativeHandler> = {
  audit_catalog: auditCatalogTool,
  list_supplier_offers: listSupplierOffers,
  update_supplier_price: updateSupplierPrice,
};
