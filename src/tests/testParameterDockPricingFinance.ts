import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BENCHMARK_LEGACY_SPECS, BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateFinancialSummary } from '../engine/financeEngine';
import type { CustomQuotationDiscount, CustomQuotationItem, FinancialParams, ProjectSimulation, LegacyProjectSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { PricingParamsSection } from '../components/simulator/sidebar/PricingParamsSection';
import { UnitCosts } from '../components/simulator/params/sections/pricing/UnitCosts';
import { resolveProjectEquipment } from '../utils/equipmentMatchingUtils';
import { FinancialsParamsSection } from '../components/simulator/sidebar/FinancialsParamsSection';
import { computeQuotationAdjustments } from '../components/simulator/params/logic/quotationAdjustments';
import { kwpPricePatch, wattPricePatch } from '../components/simulator/params/logic/pricingSync';
import {
  bestSupplierPricingPatch, displayedUnitPrice, manualUnitPricePatch,
} from '../components/simulator/params/sections/pricing/supplierPricing';
import {
  itbisPatch, itemItbisNote, itemWithMarginUSD, newCustomDiscount, newCustomItem, patchById, removeById,
} from '../components/simulator/params/sections/finance/quotationEdits';

const h = React.createElement;
const noop = () => {};
const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const close = (actual: number, expected: number, message: string) =>
  assert(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);

// Propuesta heredada (solo espejo, sin grupos): el dock y el motor la leen por el módulo de equipos.
const base = { ...structuredClone(BENCHMARK_PROJECT), specs: { ...BENCHMARK_LEGACY_SPECS } };
const specsOf = (extra: Partial<LegacyProjectSpecs> = {}): LegacyProjectSpecs => ({ ...base.specs, ...extra });
const projectOf = (specs: Partial<LegacyProjectSpecs> = {}, financials: Partial<FinancialParams> = {}): ProjectSimulation =>
  ({ ...base, specs: specsOf(specs), financials: { ...base.financials, ...financials } });
const summaryOf = (p: ProjectSimulation) =>
  calculateFinancialSummary(p.client.province, p.specs, p.rates, p.financials, p.monthlyConsumption, p.client.customMonthlyHSP);

const sp = (id: string, supplierName: string, priceUSD: number) => ({ id, supplierName, priceUSD, updatedAt: '2026-10-01T00:00:00.000Z' });
const equipment = (type: 'panel' | 'inverter' | 'battery', displayName: string, supplierPrices: ReturnType<typeof sp>[]) =>
  ({ id: `cat-${type}`, type, displayName, brand: 'B', modelSeries: 'M', supplierPrices }) as unknown as SolarEquipmentItem;

// ── W ↔ kWp ────────────────────────────────────────────────────────────────────────────────
{
  const fromWatt = wattPricePatch(1.15);
  assert.equal(fromWatt.pricePerKWpUSD, 1150, '$/W escribe también $/kWp');
  const fromKwp = kwpPricePatch(1080);
  assert.equal(fromKwp.pricePerWattUSD, 1.08, '$/kWp escribe también $/W');
  const direct = projectOf({ pricingMode: 'direct_watt', ...fromWatt });
  const html = render(h(PricingParamsSection, { project: direct, summary: summaryOf(direct), updateSpecs: noop }));
  assert.match(html, /id="pd-price-w"[^>]*value="1.15"|value="1.15"[^>]*id="pd-price-w"/);
  assert.match(html, /id="pd-price-kwp"[^>]*value="1150"|value="1150"[^>]*id="pd-price-kwp"/);
  assert.match(html, /Destino del excedente/);
  assert.match(html, /aria-checked="true"[^>]*>Ganancia</, 'por defecto el excedente va a la ganancia');
  assert.doesNotMatch(html, /pd-dop-rate/, 'el modo Directo no muestra costos desglosados');
  const labor = projectOf({ pricingMode: 'direct_watt', directPriceSurplusTarget: 'labor', ...fromWatt });
  assert.match(render(h(PricingParamsSection, { project: labor, summary: summaryOf(labor), updateSpecs: noop })), /aria-checked="true"[^>]*>Mano de obra</);
}

// ── Modo Desglosado: margen y tasa ─────────────────────────────────────────────────────────
{
  const p = projectOf({ pricingMode: 'cost_matrix', saleMarginMultiplier: 1.25, dopExchangeRate: 60 });
  const html = render(h(PricingParamsSection, { project: p, summary: summaryOf(p), updateSpecs: noop }));
  assert.match(html, /Desglosado/);
  assert.match(html, /id="pd-dop-rate"/);
  assert.match(html, /% · 1\.25×/);
  assert.match(html, /aria-pressed="true"[^>]*>25</, 'el chip del margen actual está activo');
  assert.equal((html.match(/aria-pressed="true"[^>]*>(10|15|20|30|35)</g) || []).length, 0);
  for (const pct of [10, 15, 20, 25, 30, 35]) assert.match(html, new RegExp(`>${pct}</button>`));
  assert.match(html, /Venta \/Wp/);
  assert.match(html, /Total de venta/);
  assert.doesNotMatch(html, /emerald|amber|blue-|isDark/, 'sin colores sueltos de Tailwind');
}

// ── «Mejor proveedor» ──────────────────────────────────────────────────────────────────────
{
  const specs = specsOf({ hasBattery: false, autoSupplierPricing: false, selectedSupplierInfo: undefined, panels: undefined, panelBrandModel: 'PANEL-T', panelPowerW: 600 });
  const panel = equipment('panel', 'P', [sp('p1', 'Caro', 110), sp('p2', 'Barato', 95), sp('p3', 'Empate', 95)]);
  const inverter = equipment('inverter', 'I', [sp('i1', 'Unico', 1400)]);
  const battery = equipment('battery', 'B', [sp('b1', 'Bat', 1800)]);
  const patch = bestSupplierPricingPatch(specs, { panel, inverter, battery });
  assert.equal(patch.autoSupplierPricing, true, 'activa el modo automático');
  assert.equal(patch.panels?.[0].unitPriceUSD, 95, 'elige el precio más bajo');
  assert.equal(patch.panels?.[0].selectedSupplierInfo?.supplierName, 'Barato', 'ante empate gana el primero');
  assert.equal(patch.panels?.[0].selectedSupplierInfo?.supplierPriceId, 'p2');
  assert.equal(patch.inverters?.[0].unitPriceUSD, 1400);
  assert.equal(patch.batteries, undefined, 'sin batería no se toca su grupo');
  assert.equal('selectedSupplierInfo' in patch, false, 'el proveedor vive en el grupo');

  const withBattery = bestSupplierPricingPatch({ ...specs, hasBattery: true }, { panel, inverter, battery });
  assert.equal(withBattery.batteries?.[0].unitPriceUSD, 1800);
  assert.equal(withBattery.batteries?.[0].selectedSupplierInfo?.supplierName, 'Bat');

  const keeps = bestSupplierPricingPatch(
    { ...specs, hasBattery: true, batteries: [{ id: 'b', brandModel: 'B', capacityKWh: 5, count: 1, selectedSupplierInfo: { supplierName: 'Previo', priceUSD: 1, supplierPriceId: 'x' } }] },
    { panel }
  );
  assert.equal(keeps.batteries, undefined, 'conserva el proveedor de lo que no se sincroniza');
  assert.equal(keeps.inverters, undefined);

  const none = bestSupplierPricingPatch(specs, { panel: equipment('panel', 'P', []) });
  assert.equal(none.panels, undefined, 'sin proveedores no cambia el precio');
  assert.equal(none.autoSupplierPricing, true);

  // El botón aparece solo si hay proveedores y refleja el modo automático.
  const catalog = [equipment('panel', 'PANEL-T', [sp('p1', 'A', 100), sp('p2', 'B', 90)])];
  const renderCosts = (current: LegacyProjectSpecs, items: SolarEquipmentItem[]) =>
    render(h(UnitCosts, {
      specs: current,
      equipmentCatalog: items,
      selected: { panel: resolveProjectEquipment(items, 'panel', current.panelBrandModel, current.panelPowerW) },
      openSupplierPriceModal: noop,
      updateSpecs: noop,
    }));
  const htmlOff = renderCosts(specs, catalog);
  assert.match(htmlOff, /aria-pressed="false"[^>]*>(<svg[^>]*>.*?<\/svg>)?Mejor proveedor/);
  assert.match(htmlOff, />2 prov\.</);
  assert.match(renderCosts({ ...specs, autoSupplierPricing: true }, catalog), /aria-pressed="true"[^>]*>(<svg[^>]*>.*?<\/svg>)?Mejor proveedor/);
  assert.doesNotMatch(renderCosts(specs, []), /Mejor proveedor<\/button>/, 'sin proveedores no hay botón');
}

// ── Edición a mano desactiva el modo automático ────────────────────────────────────────────
{
  const specs = specsOf({ autoSupplierPricing: true, panels: undefined, inverters: undefined, hasBattery: false });
  const panel = manualUnitPricePatch(specs, 'panel', 0, 99);
  assert.equal(panel.autoSupplierPricing, false);
  assert.equal(panel.panels?.[0].unitPriceUSD, 99, 'el precio se escribe en el grupo');
  assert.equal('panelUnitPriceUSD' in panel, false, 'sin precio plano (espejo)');
  const inverter = manualUnitPricePatch(specs, 'inverter', 0, 1500);
  assert.equal(inverter.autoSupplierPricing, false);
  assert.equal(inverter.inverters?.[0].unitPriceUSD, 1500);

  const multi = specsOf({
    panels: [
      { id: 'a', brandModel: 'A', powerW: 500, count: 4, unitPriceUSD: 100 },
      { id: 'b', brandModel: 'B', powerW: 600, count: 2, unitPriceUSD: 120 },
    ],
  });
  const second = manualUnitPricePatch(multi, 'panel', 1, 130);
  assert.equal(second.panels?.[1].unitPriceUSD, 130);
  assert.equal(second.panels?.[0].unitPriceUSD, 100);
  assert.equal(second.autoSupplierPricing, false);

  const bat = manualUnitPricePatch(specsOf({ hasBattery: true, batteries: undefined }), 'battery', 0, 2100);
  assert.equal(bat.batteries?.[0].unitPriceUSD, 2100);
  assert.equal(bat.autoSupplierPricing, false);

  assert.equal(displayedUnitPrice(50), 50);
  assert.equal(displayedUnitPrice(undefined), undefined, 'un grupo sin precio no muestra uno de referencia');

  const html = render(h(PricingParamsSection, { project: projectOf({ pricingMode: 'cost_matrix', installationUnitPriceUSD: 185 }), summary: summaryOf(projectOf()), updateSpecs: noop }));
  assert.match(html, /id="pd-cost-installation"[^>]*value="185"|value="185"[^>]*id="pd-cost-installation"/);
}

// ── Cableado del componente (UnitCosts no usa hooks: se invoca como función y se recorre el árbol) ──
{
  const findProps = (node: unknown, pred: (props: Record<string, any>) => boolean, out: Record<string, any>[] = []): Record<string, any>[] => {
    if (Array.isArray(node)) node.forEach((n) => findProps(n, pred, out));
    else if (node && typeof node === 'object' && 'props' in node) {
      const props = (node as { props: Record<string, any> }).props;
      if (pred(props)) out.push(props);
      findProps(props.children, pred, out);
      findProps(props.action, pred, out);
    }
    return out;
  };
  const calls: Partial<LegacyProjectSpecs>[] = [];
  const panel = equipment('panel', 'PANEL-T', [sp('p1', 'A', 100), sp('p2', 'B', 90)]);
  const specs = specsOf({ hasBattery: false, autoSupplierPricing: true, panels: undefined, panelBrandModel: 'PANEL-T', panelPowerW: 600 });
  const tree = UnitCosts({ specs, equipmentCatalog: [panel], selected: { panel }, openSupplierPriceModal: (item) => calls.push({ panelBrandModel: item.displayName }), updateSpecs: (p) => calls.push(p) });
  const row = findProps(tree, (props) => props.id === 'pd-cost-panel-0')[0];
  row.onChange(99);
  assert.equal(calls[0].autoSupplierPricing, false, 'editar a mano apaga el modo automático');
  assert.equal(calls[0].panels?.[0].unitPriceUSD, 99);
  findProps(tree, (props) => props.suppliersLabel === '2 prov.')[0].onOpenSuppliers();
  assert.equal(calls[1].panelBrandModel, 'PANEL-T', 'N prov. abre el modal del equipo');
  findProps(tree, (props) => props.pressed !== undefined)[0].onClick();
  assert.equal(calls[2].panels?.[0].unitPriceUSD, 90, '«Mejor proveedor» aplica el precio más bajo');
  assert.equal(calls[2].autoSupplierPricing, true);
  findProps(tree, (props) => props.id === 'pd-cost-installation')[0].onChange(185);
  assert.deepEqual(calls[3], { installationUnitPriceUSD: 185 }, 'mano de obra no toca el modo automático');
}

// ── Totales de descuentos e ITBIS ──────────────────────────────────────────────────────────
{
  const items: CustomQuotationItem[] = [
    { id: 'a', description: 'Exento', quantity: 2, unitPriceUSD: 100, exonerateITBIS: true },
    { id: 'b', description: 'Cobrado', quantity: 1, unitPriceUSD: 50, exonerateITBIS: false, applyMargin: false },
  ];
  const discounts: CustomQuotationDiscount[] = [
    { id: 'd1', description: 'Fijo', type: 'fixed', value: 250, target: 'general' },
    { id: 'd2', description: 'Porcentaje', type: 'percentage', value: 10, target: 'equipment' },
  ];
  const t = computeQuotationAdjustments(items, discounts, 5000);
  close(t.itemsSubtotalUSD, 250, 'subtotal de ítems');
  close(t.exoneratedITBISUSD, 36, 'ITBIS exonerado (200 × 18%)');
  close(t.chargedITBISUSD, 9, 'ITBIS cobrado (50 × 18%)');
  close(t.totalDiscountUSD, 750, 'descuentos: 250 fijo + 10% de 5000');
  close(t.equipmentDiscountUSD, 500, 'solo el de equipos reduce la base 57-07');
  close(t.finalPriceUSD, 4250, 'Lista → Final');
  close(computeQuotationAdjustments([], [{ ...discounts[0], value: 9999 }], 5000).finalPriceUSD, 0, 'el final nunca baja de cero');

  assert.deepEqual(itemItbisNote(items[0]), { exonerated: true, amountUSD: 36 });
  assert.equal(itemItbisNote(items[1]).exonerated, false);
  assert.deepEqual(itemWithMarginUSD(items[0], 1.25), { withMargin: true, amountUSD: 250 });
  assert.deepEqual(itemWithMarginUSD(items[1], 1.25), { withMargin: false, amountUSD: 50 });
  assert.deepEqual(itbisPatch(false), { exonerateITBIS: false, applyITBIS: false });

  const fresh = newCustomItem();
  assert.equal(fresh.quantity, 1);
  assert.equal(fresh.unit, 'UD');
  assert.equal(fresh.exonerateITBIS, true);
  assert.equal(fresh.applyMargin, true);
  assert.deepEqual({ ...newCustomDiscount(), id: '' }, { id: '', description: '', type: 'fixed', value: 0, target: 'general' });
  assert.notEqual(newCustomItem().id, newCustomItem().id);
  assert.deepEqual(patchById(items, 'a', { quantity: 5 }).map((i) => i.quantity), [5, 1]);
  assert.deepEqual(removeById(items, 'a').map((i) => i.id), ['b']);
}

// ── Finanzas: markup ───────────────────────────────────────────────────────────────────────
{
  const items: CustomQuotationItem[] = [
    { id: 'a', description: 'Estructura techo', quantity: 2, unitPriceUSD: 350, exonerateITBIS: true },
    { id: 'b', description: 'Permisología', quantity: 1, unitPriceUSD: 100, exonerateITBIS: false, applyMargin: false },
  ];
  const discounts: CustomQuotationDiscount[] = [
    { id: 'd1', description: 'Cierre', type: 'fixed', value: 250, target: 'general' },
    { id: 'd2', description: 'Equipos', type: 'percentage', value: 5, target: 'equipment' },
  ];
  const p = projectOf({}, { applyLey5707: true, applyITBISExemption: false, discountRatePct: 10, customItems: items, customDiscounts: discounts });
  const html = render(h(FinancialsParamsSection, { project: p, updateFinancials: noop }));
  assert.match(html, /aria-label="Aplicar Ley 57-07[^"]*"/);
  assert.match(html, /role="radio" aria-checked="true"[^>]*>Sí</);
  assert.match(html, /id="pd-discount-rate"/);
  assert.match(html, /value="Estructura techo"/);
  assert.match(html, /aria-label="Eliminar ítem 1"/);
  assert.match(html, /aria-pressed="true"[^>]*>(<svg.*?<\/svg>)?ITBIS exento/);
  assert.match(html, /aria-pressed="false"[^>]*>Con margen/);
  assert.match(html, /ITBIS cobrado al cliente/);
  assert.match(html, /ITBIS exonerado \(Ley 57-07\)/);
  assert.match(html, /aria-label="Agregar ítem"/);
  assert.match(html, /aria-label="Agregar descuento"/);
  assert.match(html, /Equipos \(DGII\)/);
  assert.match(html, /Lista <span[^>]*>\$/);
  assert.match(html, /Final <span/);
  assert.match(html, /role="tooltip"[^>]*>Reduce la base elegible del 40% ISR Ley 57-07/, 'el aviso de DGII va en un InfoTip');
  assert.doesNotMatch(html, /⚠️|✓|emerald|rose-|amber|isDark/, 'sin emojis ni colores sueltos');

  const empty = render(h(FinancialsParamsSection, { project: projectOf({}, { customItems: [], customDiscounts: [] }), updateFinancials: noop }));
  assert.match(empty, /Sin ítems extra\./);
  assert.match(empty, /Sin descuentos\./);
}

console.log('Parameter dock pricing and finance tests passed');
