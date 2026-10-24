import { LEGACY_MIRROR_FIELDS } from '../../shared/equipment';
import { normalizeEquipmentEdit } from '../utils/equipmentGroups';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CustomQuotationDiscount, CustomQuotationItem, ProjectSimulation, LegacyProjectSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { editEquipmentGroup } from '../utils/equipmentGroups';
import { buildCatalogSelectionUpdate } from '../components/simulator/params/logic/catalogSelection';
import { computeLoadProfilePreview, detectLoadProfilePreset } from '../components/simulator/params/logic/loadProfilePreview';
import { computeQuotationAdjustments, discountAmountUSD } from '../components/simulator/params/logic/quotationAdjustments';
import {
  kwpPricePatch,
  marginPctFromMultiplier,
  multiplierFromMarginInput,
  multiplierFromQuickMargin,
  pricePerKWpFromWatt,
  pricePerWattFromKWp,
  roundedWattPrice,
  wattPricePatch,
  wholeMarginPctFromMultiplier,
} from '../components/simulator/params/logic/pricingSync';
import { useCatalogPowerSync } from '../components/simulator/params/hooks/useCatalogPowerSync';
import { useSupplierCleanup } from '../components/simulator/params/hooks/useSupplierCleanup';

/** Characterization of the parameter dock logic: pins the behavior the sidebar sections had inline. */
const close = (actual: number, expected: number, message?: string) =>
  assert(Math.abs(actual - expected) < 1e-9, `${message ?? 'value'}: ${actual} !== ${expected}`);

const supplier = (id: string, name: string, priceUSD: number) => ({ id, supplierName: name, priceUSD, updatedAt: '2026-01-01' });
const catalogItem = (extra: Partial<SolarEquipmentItem> & Pick<SolarEquipmentItem, 'id' | 'type' | 'displayName'>): SolarEquipmentItem =>
  ({ brand: 'B', modelSeries: 'M', ...extra }) as SolarEquipmentItem;

// ── Catalog selection ──────────────────────────────────────────────────────────────────────
const panel = catalogItem({
  id: 'p1', type: 'panel', displayName: 'Panel X 600W', powerW: 600, efficiencyPct: 23, tempCoeff: -0.3, annualDegradation: 0.35, weightKg: 30,
  supplierPrices: [supplier('s-hi', 'Alfa', 120), supplier('s-lo', 'Beta', 95)],
});
const baseSpecs = { panelBrandModel: 'Old', panelPowerW: 400, panelCount: 10, hasBattery: false } as LegacyProjectSpecs;

{ // auto pricing takes the cheapest supplier and writes the primary group (never the legacy mirror)
  const patch = buildCatalogSelectionUpdate({ ...baseSpecs, autoSupplierPricing: true }, 'panel', panel);
  assert.equal(patch.panels?.[0].brandModel, 'Panel X 600W');
  assert.equal(patch.panels?.[0].powerW, 600);
  assert.equal(LEGACY_MIRROR_FIELDS.some((field) => field in patch) || 'selectedSupplierInfo' in patch, false, 'sin espejo');
  assert.equal(patch.panelEfficiency, 23);
  assert.equal(patch.tempCoeff, -0.3);
  assert.equal(patch.annualDegradation, 0.35);
  assert.deepEqual(patch.panels?.[0].selectedSupplierInfo, { supplierName: 'Beta', priceUSD: 95, updatedAt: '2026-01-01', supplierPriceId: 's-lo' });
  assert.equal(patch.panels?.[0].catalogItemId, 'p1');
  assert.equal(patch.panels?.[0].unitPriceUSD, 95);
  assert.equal(patch.panels?.[0].weightKilos, 30);
  assert.equal(patch.panels?.[0].count, 10, 'the group keeps its count');
}
{ // manual pricing keeps the chosen supplier when the new item still quotes it (by id or by name)
  const withSupplier = (supplierInfo: object) => ({ ...baseSpecs, autoSupplierPricing: false, panels: [{ id: 'primary-panel', brandModel: 'Old', powerW: 400, count: 10, unitPriceUSD: 103.32, selectedSupplierInfo: supplierInfo }] }) as LegacyProjectSpecs;
  const specs = withSupplier({ supplierName: 'old name', priceUSD: 1, supplierPriceId: 's-hi' });
  const patch = buildCatalogSelectionUpdate(specs, 'panel', panel);
  assert.equal(patch.panels?.[0].selectedSupplierInfo?.supplierPriceId, 's-hi');
  assert.equal(patch.panels?.[0].selectedSupplierInfo?.priceUSD, 120, 'price is refreshed from the matched supplier');
  assert.equal(patch.panels?.[0].unitPriceUSD, 103.32, 'manual mode keeps the engine default price, not the supplier price');
  const byName = buildCatalogSelectionUpdate(withSupplier({ supplierName: '  BETA ', priceUSD: 1 }), 'panel', panel);
  assert.equal(byName.panels?.[0].selectedSupplierInfo?.supplierPriceId, 's-lo');
}
{ // a supplier the new item does not quote is dropped; other kinds' info survives
  const specs = { ...baseSpecs, panels: [{ id: 'p', brandModel: 'Old', powerW: 400, count: 10, selectedSupplierInfo: { supplierName: 'Gone', priceUSD: 1 } }], inverters: [{ id: 'i', brandModel: 'I', powerKW: 8, count: 1, selectedSupplierInfo: { supplierName: 'Keep', priceUSD: 2 } }] } as LegacyProjectSpecs;
  const patch = buildCatalogSelectionUpdate(specs, 'panel', panel);
  assert.equal(patch.panels?.[0].selectedSupplierInfo, undefined);
  assert.equal(patch.inverters, undefined, 'the inverter group is not part of the patch');
  assert.deepEqual(normalizeEquipmentEdit(specs, patch).inverters?.[0].selectedSupplierInfo, { supplierName: 'Keep', priceUSD: 2 });
}
{ // auto pricing without supplier prices falls back to the manual branch
  const bare = catalogItem({ id: 'p2', type: 'panel', displayName: 'Bare' });
  const patch = buildCatalogSelectionUpdate({ ...baseSpecs, autoSupplierPricing: true }, 'panel', bare);
  assert.equal(patch.panels?.[0].powerW, 550, 'panel defaults');
  assert.equal(patch.panelEfficiency, 22);
  assert.equal(patch.tempCoeff, -0.29);
  assert.equal(patch.annualDegradation, 0.4);
  assert.equal(patch.panels?.[0].unitPriceUSD, 103.32, 'no supplier price: the group carries the engine default');
}
{ // inverter and battery use their own mirror fields and defaults
  const inv = catalogItem({ id: 'i1', type: 'inverter', displayName: 'Inv 10K', powerKW: 10, supplierPrices: [supplier('i-1', 'Alfa', 2000)] });
  const invPatch = buildCatalogSelectionUpdate({ ...baseSpecs, autoSupplierPricing: true, inverterCount: 1 } as LegacyProjectSpecs, 'inverter', inv);
  assert.equal(invPatch.inverters?.[0].brandModel, 'Inv 10K');
  assert.equal(invPatch.inverters?.[0].powerKW, 10);
  assert.equal(invPatch.inverters?.[0].unitPriceUSD, 2000);
  assert.equal(invPatch.inverters?.[0].selectedSupplierInfo?.supplierName, 'Alfa');
  assert.equal(invPatch.inverters?.[0].catalogItemId, 'i1');
  const bareInv = buildCatalogSelectionUpdate(baseSpecs, 'inverter', catalogItem({ id: 'i2', type: 'inverter', displayName: 'Bare' }));
  assert.equal(bareInv.inverters?.[0].powerKW, 8);

  const bat = catalogItem({ id: 'b1', type: 'battery', displayName: 'Bat 10', capacityKWh: 10, dodPct: 80, batteryEfficiencyPct: 92, supplierPrices: [supplier('b-1', 'Beta', 1500)] });
  const batPatch = buildCatalogSelectionUpdate({ ...baseSpecs, autoSupplierPricing: true } as LegacyProjectSpecs, 'battery', bat);
  assert.equal(batPatch.batteries?.[0].brandModel, 'Bat 10');
  assert.equal(batPatch.batteries?.[0].capacityKWh, 10);
  assert.equal(batPatch.batteries?.[0].dodPct, 80);
  assert.equal(batPatch.batteries?.[0].efficiencyPct, 92);
  assert.equal(batPatch.batteries?.[0].unitPriceUSD, 1500);
  const bareBat = buildCatalogSelectionUpdate(baseSpecs, 'battery', catalogItem({ id: 'b2', type: 'battery', displayName: 'Bare' }));
  assert.equal(bareBat.batteries?.[0].capacityKWh, 16.08);
  assert.equal(bareBat.batteries?.[0].dodPct, 90);
  assert.equal(bareBat.batteries?.[0].efficiencyPct, 90, 'eficiencia por defecto única (antes 95 en el dock)');
}
{ // The battery count in Manual mode goes through editEquipmentGroup like every other group edit, so
  // batteries[] is the only source (the legacy `batteryCount` mirror is not written).
  const specs = { hasBattery: true, batteryBrandModel: 'Bat', batteryCapacityKWh: 5, batteryCount: 2, batteries: [{ id: 'b', brandModel: 'Bat', capacityKWh: 5, count: 2 }] } as LegacyProjectSpecs;
  const manual = normalizeEquipmentEdit(specs, editEquipmentGroup(specs, 'battery', { type: 'update', index: 0, patch: { count: 7 } }));
  assert.equal(manual.batteries?.[0].count, 7, 'the group count follows the edit');
  assert.equal('batteryCount' in manual, false, 'the mirror is gone: the group is the only source');
}

// ── Load profile preview ───────────────────────────────────────────────────────────────────
assert.equal(detectLoadProfilePreset(35), 'residential');
assert.equal(detectLoadProfilePreset(75), 'commercial');
assert.equal(detectLoadProfilePreset(90), 'industrial');
assert.equal(detectLoadProfilePreset(50), 'custom');
assert.equal(detectLoadProfilePreset(35.5), 'custom');

const previewProject = (specs: Partial<LegacyProjectSpecs>) => ({
  client: { province: 'Santo Domingo', customMonthlyHSP: [5, 5, 5] },
  specs: { panelCount: 10, panelPowerW: 500, systemLosses: 20, hasBattery: false, ...specs },
}) as unknown as ProjectSimulation;
{ // 5 kWp * 5 HSP * 0.8 = 20 kWh/d against 900 kWh/month = 30 kWh/d at 35% daytime
  const p = computeLoadProfilePreview(previewProject({ daytimeLoadRatio: 35 }), 'BTS2', 900);
  assert.equal(p.currentPreset, 'residential', 'preset is derived from the 35/75/90 ratio');
  close(p.avgDailyCons, 30);
  close(p.avgDailyProd, 20);
  close(p.solarDirectDaily, 10.5);
  close(p.gridImportDaily, 19.5);
  close(p.gridExportDaily, 9.5);
  close(p.bessDischargeDaily, 0);
  assert.equal(p.hasBattery, false);
  assert.equal(p.genDirectPct, 53);
  assert.equal(p.genBessPct, 0);
  assert.equal(p.genExportPct, 47);
  close(p.solarDirectPct, 35);
}
{ // a 10 kWh battery at 90% DoD and 90% efficiency cycles 8.1 kWh/d of the 9.5 surplus
  const p = computeLoadProfilePreview(previewProject({ daytimeLoadRatio: 35, hasBattery: true, batteryCapacityKWh: 10, batteryCount: 1, batteryDOD: 90, batteryEfficiencyPct: 90 }), 'BTS2', 900);
  assert.equal(p.hasBattery, true);
  close(p.bessChargeDaily, 8.1);
  close(p.bessDischargeDaily, 8.1);
  close(p.totalSelfDaily, 18.6);
  close(p.gridImportDaily, 11.4);
  close(p.gridExportDaily, 1.4);
  assert.equal(p.genBessPct, 41);
  assert.equal(p.genExportPct, 6);
}
{ // without a stored ratio the tariff recommendation applies; an explicit preset wins over detection
  const rec = computeLoadProfilePreview(previewProject({}), 'MTD1', 900);
  assert.equal(rec.currentDaytimeRatio, 90);
  assert.equal(rec.currentPreset, 'industrial');
  const explicit = computeLoadProfilePreview(previewProject({ daytimeLoadRatio: 35, loadProfilePreset: 'custom' }), 'BTS2', 900);
  assert.equal(explicit.currentPreset, 'custom');
  const fallback = computeLoadProfilePreview(previewProject({ daytimeLoadRatio: undefined, daytimeSelfConsumptionRatio: 75 }), 'BTS2', 900);
  assert.equal(fallback.currentDaytimeRatio, 75);
}
{ // zero consumption never divides by zero
  const p = computeLoadProfilePreview(previewProject({ daytimeLoadRatio: 35 }), 'BTS2', 0);
  assert.equal(p.solarDirectPct, 0);
  assert.equal(p.gridImportPct, 0);
}

// ── Quotation adjustments ──────────────────────────────────────────────────────────────────
const disc = (partial: Partial<CustomQuotationDiscount>): CustomQuotationDiscount => ({ id: 'd', description: '', type: 'fixed', value: 0, target: 'general', ...partial });
close(discountAmountUSD(disc({ type: 'fixed', value: 250 }), 10000), 250);
close(discountAmountUSD(disc({ type: 'fixed', value: -5 }), 10000), 0);
close(discountAmountUSD(disc({ type: 'percentage', value: 12.5 }), 10000), 1250);
close(discountAmountUSD(disc({ type: 'percentage', value: 150 }), 10000), 10000, 'percentage clamps to 100');
close(discountAmountUSD(disc({ type: 'percentage', value: 3.333 }), 1000), 33.33, 'percentage rounds to cents');
{
  const items = [
    { id: 'a', description: 'a', quantity: 2, unit: 'UD', unitPriceUSD: 100, exonerateITBIS: true },
    { id: 'b', description: 'b', quantity: 1, unit: 'UD', unitPriceUSD: 50, exonerateITBIS: false },
    { id: 'c', description: 'c', quantity: 3, unit: 'UD', unitPriceUSD: 10, applyITBIS: false },
  ] as CustomQuotationItem[];
  const r = computeQuotationAdjustments(items, [disc({ value: 500, target: 'equipment' }), disc({ type: 'percentage', value: 10 })], 10000);
  close(r.totalDiscountUSD, 1500);
  close(r.equipmentDiscountUSD, 500);
  close(r.itemsSubtotalUSD, 280);
  close(r.exoneratedITBISUSD, 200 * 0.18, 'exonerateITBIS wins; applyITBIS:false alone does not exonerate');
  close(r.chargedITBISUSD, 80 * 0.18);
  close(r.finalPriceUSD, 8500);
  close(computeQuotationAdjustments([], [disc({ value: 99999 })], 1000).finalPriceUSD, 0, 'final price never goes negative');
  const empty = computeQuotationAdjustments([], [], 0);
  assert.deepEqual([empty.totalDiscountUSD, empty.itemsSubtotalUSD, empty.finalPriceUSD], [0, 0, 0]);
}

// ── Pricing sync ───────────────────────────────────────────────────────────────────────────
close(pricePerKWpFromWatt(1.15), 1150);
close(pricePerKWpFromWatt(0.8765), 876.5);
close(pricePerWattFromKWp(1234.5), 1.235);
assert.deepEqual(wattPricePatch(1.08), { pricePerWattUSD: 1.08, pricePerKWpUSD: 1080 });
assert.deepEqual(kwpPricePatch(950), { pricePerKWpUSD: 950, pricePerWattUSD: 0.95 });
close(roundedWattPrice(undefined, 1.234), 1.23);
close(roundedWattPrice(0, 1.15), 1.15);
close(roundedWattPrice(1.056, 9), 1.06);
close(roundedWattPrice(undefined), 0);
close(marginPctFromMultiplier(1.25), 25);
close(marginPctFromMultiplier(undefined), 25, 'default multiplier is 1.25');
close(marginPctFromMultiplier(1.2349), 23.5);
close(wholeMarginPctFromMultiplier(1.234), 23);
close(multiplierFromMarginInput(25), 1.25);
close(multiplierFromMarginInput(NaN), 1);
close(multiplierFromMarginInput(-10), 1);
close(multiplierFromMarginInput(12.3456), 1.123);
close(multiplierFromQuickMargin(30), 1.3);

// ── Effect hooks (render once; effects are verified through a stubbed React.useEffect) ──────
function runEffects(body: () => void): Array<() => void> {
  const original = React.useEffect;
  const effects: Array<() => void> = [];
  (React as { useEffect: unknown }).useEffect = (fn: () => void) => { effects.push(fn); };
  try {
    renderToStaticMarkup(React.createElement(() => { body(); return null; }));
  } finally {
    (React as { useEffect: unknown }).useEffect = original;
  }
  return effects;
}
{
  const catalog = [
    catalogItem({ id: 'p1', type: 'panel', displayName: 'Panel X', powerW: 600 }),
    catalogItem({ id: 'i1', type: 'inverter', displayName: 'Inv X', powerKW: 10 }),
  ];
  const updates: Array<Partial<LegacyProjectSpecs>> = [];
  const effects = runEffects(() => useCatalogPowerSync({ panelBrandModel: 'Panel X', panelPowerW: 550, inverterBrandModel: 'Inv X', inverterPowerKW: 10 } as LegacyProjectSpecs, catalog, (u) => updates.push(u)));
  effects.forEach((run) => run());
  assert.equal(updates.length, 1, 'only the stale panel power is rewritten; matching inverter untouched');
  assert.deepEqual(Object.keys(updates[0]), ['panels'], 'the patch is the panel group list');
  assert.equal(updates[0].panels?.[0].powerW, 600);
  const none: Array<Partial<LegacyProjectSpecs>> = [];
  runEffects(() => useCatalogPowerSync({ panelBrandModel: 'Unknown', panelPowerW: 550 } as LegacyProjectSpecs, catalog, (u) => none.push(u))).forEach((run) => run());
  assert.deepEqual(none, [], 'models outside the catalog are not touched');
}
{
  const catalog = [catalogItem({ id: 'p1', type: 'panel', displayName: 'Panel X', supplierPrices: [supplier('s1', 'Alfa', 100)] })];
  const info = { panel: { supplierName: 'Ghost', priceUSD: 1 }, inverter: { supplierName: 'Ghost2', priceUSD: 2 }, battery: { supplierName: 'Alfa', priceUSD: 3 } };
  const updates: Array<Partial<LegacyProjectSpecs>> = [];
  runEffects(() => useSupplierCleanup({
    specs: { selectedSupplierInfo: info } as LegacyProjectSpecs, equipmentCatalog: catalog,
    panelSupplierMatches: false, inverterSupplierMatches: false, batterySupplierMatches: false, updateSpecs: (u) => updates.push(u),
  })).forEach((run) => run());
  // Ghost suppliers are removed; the battery supplier exists on a catalog panel but the lookup is per type, so it goes too.
  assert.equal(updates.length, 1);
  const cleaned = normalizeEquipmentEdit({ selectedSupplierInfo: info } as LegacyProjectSpecs, updates[0]);
  assert.deepEqual([cleaned.panels?.[0].selectedSupplierInfo, cleaned.inverters?.[0].selectedSupplierInfo, cleaned.batteries?.[0].selectedSupplierInfo], [undefined, undefined, undefined], 'orphan suppliers leave their groups');
  assert.equal('selectedSupplierInfo' in cleaned, false);
  const kept: Array<Partial<LegacyProjectSpecs>> = [];
  runEffects(() => useSupplierCleanup({
    specs: { selectedSupplierInfo: { panel: { supplierName: 'Alfa', priceUSD: 100 } } } as LegacyProjectSpecs, equipmentCatalog: catalog,
    panelSupplierMatches: false, inverterSupplierMatches: false, batterySupplierMatches: false, updateSpecs: (u) => kept.push(u),
  })).forEach((run) => run());
  assert.deepEqual(kept, [], 'a supplier still quoted by some catalog item of that type is kept');
  const matched: Array<Partial<LegacyProjectSpecs>> = [];
  runEffects(() => useSupplierCleanup({
    specs: { selectedSupplierInfo: info } as LegacyProjectSpecs, equipmentCatalog: catalog,
    panelSupplierMatches: true, inverterSupplierMatches: true, batterySupplierMatches: true, updateSpecs: (u) => matched.push(u),
  })).forEach((run) => run());
  assert.deepEqual(matched, [], 'nothing is cleaned while the selected equipment matches its supplier');
}

console.log('PASS: parameter dock logic (catalog selection, load profile preview, quotation adjustments, pricing sync, effect hooks).');
