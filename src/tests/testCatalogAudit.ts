import assert from 'node:assert/strict';
import { auditCatalog } from '../utils/catalogAudit';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import type { SolarEquipmentItem } from '../types/equipment';

const now = new Date('2026-10-21T00:00:00.000Z');
const offer = (priceUSD: number, updatedAt = '2026-10-01T00:00:00.000Z', stockStatus: 'in_stock' | 'out_of_stock' = 'in_stock') =>
  ({ id: `sp-${priceUSD}-${updatedAt}`, supplierName: 'QA', priceUSD, updatedAt, stockStatus });
const panel = (id: string, powerW: number | undefined, prices: ReturnType<typeof offer>[], extra: Partial<SolarEquipmentItem> = {}): SolarEquipmentItem =>
  ({ id, type: 'panel', brand: 'QA', modelSeries: id, displayName: `Panel ${id}`, powerW, supplierPrices: prices, datasheetAssetId: 'ds', imageAssetIds: ['img'], ...extra } as SolarEquipmentItem);

const catalog: SolarEquipmentItem[] = [
  panel('ok-a', 600, [offer(90)]),
  panel('ok-b', 600, [offer(96)]),
  panel('ok-c', 600, [offer(100)]),
  panel('noprice', 600, []),
  panel('stale', 600, [offer(95, '2026-01-01T00:00:00.000Z')]),
  panel('nodocs', 600, [offer(92)], { datasheetAssetId: undefined, imageAssetIds: [] }),
  panel('nopower', undefined, [offer(90)]),
  panel('dup', 600, [offer(97)], { displayName: 'Panel ok-a' }),
  panel('nostock', 600, [offer(94, undefined, 'out_of_stock')]),
  panel('outlier', 600, [offer(900)]),
];
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'audit-p',
  specs: { ...structuredClone(BENCHMARK_PROJECT.specs), panels: [{ id: 'g1', brandModel: 'Panel fantasma', powerW: 600, count: 10 }, { id: 'g2', catalogItemId: 'ok-a', brandModel: 'Panel ok-a', powerW: 600, count: 5 }] } };

const report = auditCatalog(catalog, [project], { now });
const codes = (id: string) => report.findings.filter((f) => f.equipmentId === id).map((f) => f.code).sort();
assert.deepEqual(codes('ok-b'), []);
assert.deepEqual(codes('noprice'), ['missing_price']);
assert.deepEqual(codes('stale'), ['stale_price']);
assert.deepEqual(codes('nodocs'), ['missing_datasheet', 'missing_image']);
assert.deepEqual(codes('nopower'), ['missing_nominal']);
assert(codes('dup').includes('duplicate_model'));
assert.deepEqual(codes('nostock'), ['no_stock']);
assert.deepEqual(codes('outlier'), ['price_outlier']);
// The benchmark's inverter (scalar mirror) is not in this synthetic catalog either, so only panels are asserted.
const unmatched = report.findings.filter((f) => f.code === 'unmatched_proposal_equipment' && f.message.includes('Panel'));
assert.equal(unmatched.length, 1, 'catalogItemId and exact names resolve; unknown models are reported');
assert.equal(unmatched[0].projectId, 'audit-p');
assert(unmatched[0].message.includes('Panel fantasma'));
assert.equal(report.summary.total, report.findings.length);
assert.equal(report.summary.byCode.missing_price, 1);
assert(report.findings.every((f) => f.message.length > 0));
assert.equal(auditCatalog([], [], { now }).findings.length, 0);
// 2.6.0 proposals without group arrays are audited through the compatibility readers (and not migrated).
const legacy = { ...structuredClone(BENCHMARK_PROJECT), id: 'legacy-p',
  specs: { ...structuredClone(BENCHMARK_PROJECT.specs), panels: undefined, inverters: undefined, batteries: undefined, panelBrandModel: 'Panel legado', panelCount: 8 } };
const legacyReport = auditCatalog(catalog, [legacy], { now });
assert(legacyReport.findings.some((f) => f.projectId === 'legacy-p' && f.message.includes('Panel legado')));
assert.equal(legacy.specs.panels, undefined, 'audit never migrates stored proposals');
console.log('PASS: catalog audit flags prices, staleness, documents, specs, duplicates, stock, outliers and unmatched proposal equipment.');
