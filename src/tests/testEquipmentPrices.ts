import assert from "node:assert/strict";
import {
  OBSERVATION_ID_PATTERN,
  currentGenericPrice,
  genericPriceDecision,
  isObservationId,
  offerObservations,
  priceHistoryStats,
  resolveAutoPrice,
  usableOffers,
  validateObservation,
  type EquipmentPriceObservation,
  type PricedItem,
} from "../../shared/equipmentPrices";
import type { SolarEquipmentItem } from "../types/equipment";

// Type-level guard (checked by `npm run lint`): the app's real catalog item must be usable with the shared helpers.
const _catalogItemIsPriced: PricedItem = {} as SolarEquipmentItem;
void _catalogItemIsPriced;

const ID = (n: number) => `po-00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// --- Ids ---------------------------------------------------------------------------------------------------------
assert.ok(isObservationId(ID(1)));
assert.ok(OBSERVATION_ID_PATTERN.test("po-3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b"));
for (const bad of ["", "po-", "po-XYZ", "obs-00000000-0000-4000-8000-000000000001", `${ID(1)}0`, 7, null])
  assert.equal(isObservationId(bad), false, String(bad));

// --- Validation --------------------------------------------------------------------------------------------------
const base = {
  id: ID(1),
  equipmentId: "eq-1",
  kind: "observation",
  priceUSD: 120.5,
  source: "supplier_offer",
  supplierName: "  Proveedor   A ",
  supplierOfferId: "offer-a",
  originalCurrency: "DOP",
  originalPrice: 7200,
  observedAt: "2026-03-10T12:00:00.000Z",
};
const ok = validateObservation(base);
assert.ok(ok.ok);
if (ok.ok) {
  assert.equal(ok.value.supplierName, "Proveedor A", "names are trimmed and collapsed");
  assert.equal(ok.value.observedAt, "2026-03-10T12:00:00.000Z");
  assert.equal(ok.value.kind, "observation");
  assert.equal("seq" in ok.value, false, "seq is never accepted from a client");
  assert.equal("voidedAt" in ok.value, false, "voids are set by the server");
}
const generic = validateObservation({ ...base, id: ID(2), kind: "generic", source: "manual", derivedFromId: ID(1) });
assert.ok(generic.ok);
const proposal = validateObservation({ ...base, id: ID(3), source: "proposal", projectId: "proj-1", supplierName: undefined, supplierOfferId: undefined });
assert.ok(proposal.ok);
for (const [label, invalid] of [
  ["not an object", null],
  ["array", []],
  ["bad id", { ...base, id: "x" }],
  ["missing equipment", { ...base, equipmentId: "" }],
  ["long equipment", { ...base, equipmentId: "e".repeat(65) }],
  ["kind", { ...base, kind: "estimate" }],
  ["negative price", { ...base, priceUSD: -1 }],
  ["NaN price", { ...base, priceUSD: Number.NaN }],
  ["string price", { ...base, priceUSD: "10" }],
  ["generic zero", { ...base, kind: "generic", priceUSD: 0 }],
  ["source", { ...base, source: "web" }],
  ["currency", { ...base, originalCurrency: "EUR" }],
  ["original price", { ...base, originalPrice: -5 }],
  ["date", { ...base, observedAt: "ayer" }],
  ["missing date", { ...base, observedAt: undefined }],
  ["before 2020", { ...base, observedAt: "2019-12-31T23:59:59.000Z" }],
  ["project on non-proposal", { ...base, projectId: "proj-1" }],
  ["derived on observation", { ...base, derivedFromId: ID(9) }],
  ["bad derived id", { ...base, kind: "generic", derivedFromId: "x" }],
  ["long supplier", { ...base, supplierName: "s".repeat(256) }],
  // PostgreSQL text cannot store U+0000: these must be rejected per item, never reach the database.
  ["NUL equipment", { ...base, equipmentId: "eq\u0000x" }],
  ["NUL supplier", { ...base, supplierName: "Prov\u0000eedor" }],
  ["NUL offer id", { ...base, supplierOfferId: "offer\u0000" }],
  ["NUL project", { ...base, source: "proposal", projectId: "proj\u00001", supplierName: undefined, supplierOfferId: undefined }],
] as const)
  assert.equal(validateObservation(invalid).ok, false, label);
assert.ok(validateObservation({ ...base, priceUSD: 0 }).ok, "an observation may record a zero price");

// --- Current generic price ---------------------------------------------------------------------------------------
const obs = (n: number, patch: Partial<EquipmentPriceObservation> = {}): EquipmentPriceObservation => ({
  id: ID(n),
  equipmentId: "eq-1",
  kind: "generic",
  priceUSD: 100 + n,
  source: "manual",
  observedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});
assert.equal(currentGenericPrice([]), undefined);
assert.equal(currentGenericPrice([obs(1, { kind: "observation", seq: 9 })]), undefined, "observations never set the generic price");
assert.equal(currentGenericPrice([obs(1, { seq: 5 }), obs(2, { seq: 3 })])?.id, ID(1), "highest seq wins, not array order");
assert.equal(
  currentGenericPrice([obs(1, { seq: 5, observedAt: "2020-02-01T00:00:00.000Z" }), obs(2, { seq: 3, observedAt: "2026-09-01T00:00:00.000Z" })])?.id,
  ID(1),
  "the client clock (observedAt) never orders",
);
assert.equal(currentGenericPrice([obs(1, { seq: 5, voidedAt: "2026-02-01T00:00:00.000Z" }), obs(2, { seq: 3 })])?.id, ID(2), "a void reverts to the previous one");
assert.equal(currentGenericPrice([obs(1, { seq: 5, voidedAt: "2026-02-01T00:00:00.000Z" })]), undefined);
assert.equal(currentGenericPrice([obs(1, { seq: 50 }), obs(2), obs(3)])?.id, ID(3), "pending ones rank above server ones, last inserted wins");
assert.equal(currentGenericPrice([obs(2), obs(1, { seq: 50 })])?.id, ID(2));
assert.equal(currentGenericPrice([obs(2), obs(3, { voidedAt: "2026-02-01T00:00:00.000Z" })])?.id, ID(2));

// --- Generic price decision --------------------------------------------------------------------------------------
assert.equal(genericPriceDecision(undefined, 100), "assign");
assert.equal(genericPriceDecision(null, 100), "assign");
assert.equal(genericPriceDecision(0, 100), "assign");
assert.equal(genericPriceDecision(100, 100.004), "none");
assert.equal(genericPriceDecision(100, 100.005), "none", "±0.005 tolerance");
assert.equal(genericPriceDecision(100, 99.995), "none");
assert.equal(genericPriceDecision(100, 100.01), "update");
assert.equal(genericPriceDecision(100, 0), "none", "≤ 0 never");
assert.equal(genericPriceDecision(undefined, -3), "none");
assert.equal(genericPriceDecision(undefined, Number.NaN), "none");

// --- Offer observations ------------------------------------------------------------------------------------------
const offer = (patch: Record<string, unknown> = {}) => ({
  id: "offer-a",
  supplierName: "Proveedor A",
  priceUSD: 100,
  currency: "USD" as const,
  sku: "SKU-1",
  notes: "Nota",
  stockStatus: "in_stock" as const,
  updatedAt: "2026-10-01",
  ...patch,
});
const item = (offers: ReturnType<typeof offer>[], patch: Partial<PricedItem> = {}): PricedItem => ({ id: "eq-1", supplierPrices: offers, ...patch });
assert.deepEqual(offerObservations(item([offer()]), item([offer({ stockStatus: "out_of_stock", sku: "SKU-2", notes: "Otra" })])), [], "stock, sku and notes produce nothing");
assert.deepEqual(offerObservations(item([offer()]), item([offer({ supplierName: "Proveedor A2" })])), [], "a rename produces nothing");
assert.deepEqual(offerObservations(item([offer()]), item([])), [], "a delete produces nothing");
assert.deepEqual(offerObservations(item([offer()]), item([offer({ priceUSD: 100.004 })])), [], "float noise is not a change");
assert.deepEqual(offerObservations(item([offer()]), item([offer({ id: "offer-new", supplierName: "  proveedor  a " })])), [], "matched by normalized supplier name");
assert.deepEqual(offerObservations(item([offer()]), item([offer({ priceUSD: 0 })])), [], "a zero price is not a candidate");
const changed = offerObservations(item([offer()]), item([offer({ priceUSD: 110, currency: "DOP", priceDOP: 6600, source: "ai_scan" })]));
assert.deepEqual(changed, [
  {
    equipmentId: "eq-1",
    kind: "observation",
    priceUSD: 110,
    source: "ai_scan",
    supplierName: "Proveedor A",
    supplierOfferId: "offer-a",
    originalCurrency: "DOP",
    originalPrice: 6600,
  },
]);
const fresh = offerObservations(item([offer()]), item([offer(), offer({ id: "offer-b", supplierName: "Proveedor B", priceUSD: 90, source: "manual" })]));
assert.deepEqual(fresh, [
  {
    equipmentId: "eq-1",
    kind: "observation",
    priceUSD: 90,
    source: "supplier_offer",
    supplierName: "Proveedor B",
    supplierOfferId: "offer-b",
    originalCurrency: "USD",
    originalPrice: 90,
  },
]);
assert.equal(offerObservations(undefined, item([offer()])).length, 1, "a new equipment's offers are new");
assert.equal(offerObservations(item([offer()]), item([offer({ priceUSD: 95 }), offer({ id: "offer-c", supplierName: "C", priceUSD: 80 })])).length, 2);

// --- Auto price --------------------------------------------------------------------------------------------------
const genericInfo = { priceUSD: 150, observedAt: "2026-05-01T00:00:00.000Z", observationId: ID(4) };
const offers = [
  offer({ id: "o1", supplierName: "Uno", priceUSD: 120 }),
  offer({ id: "o2", supplierName: "Dos", priceUSD: 90, stockStatus: "out_of_stock" }),
  offer({ id: "o3", supplierName: "Tres", priceUSD: 100 }),
  offer({ id: "o4", supplierName: "Cuatro", priceUSD: 100 }),
  offer({ id: "o5", supplierName: "Cinco", priceUSD: 0 }),
];
assert.deepEqual(usableOffers(item(offers)).map((o) => o.id), ["o1", "o3", "o4"]);
const cheapest = resolveAutoPrice(item(offers), genericInfo);
assert.equal(cheapest?.kind, "supplier");
assert.equal(cheapest?.priceUSD, 100);
assert.equal(cheapest?.kind === "supplier" && cheapest.offer.id, "o3", "first wins on a tie");
const preferred = resolveAutoPrice(item(offers, { preferredSupplierId: "o1" }), genericInfo);
assert.equal(preferred?.kind === "supplier" && preferred.offer.id, "o1");
const unusablePreferred = resolveAutoPrice(item(offers, { preferredSupplierId: "o2" }), genericInfo);
assert.equal(unusablePreferred?.kind === "supplier" && unusablePreferred.offer.id, "o3", "an out-of-stock preferred offer falls back to the cheapest");
const viaGeneric = resolveAutoPrice(item([offers[1], offers[4]]), genericInfo);
assert.deepEqual(viaGeneric, { priceUSD: 150, kind: "generic", generic: genericInfo });
assert.equal(resolveAutoPrice(item([]), undefined), undefined);
assert.equal(resolveAutoPrice(item([]), { ...genericInfo, priceUSD: 0 }), undefined);
assert.equal(resolveAutoPrice({ supplierPrices: undefined }, null), undefined);

// --- History statistics ------------------------------------------------------------------------------------------
const row = (n: number, observedAt: string, priceUSD: number, patch: Partial<EquipmentPriceObservation> = {}): EquipmentPriceObservation => ({
  id: ID(n),
  seq: n,
  equipmentId: "eq-1",
  kind: "observation",
  priceUSD,
  source: "supplier_offer",
  observedAt,
  ...patch,
});
const history = [
  row(1, "2025-03-15T15:00:00.000Z", 100),
  row(2, "2025-03-20T15:00:00.000Z", 110),
  row(3, "2025-09-10T15:00:00.000Z", 120),
  row(4, "2026-03-05T15:00:00.000Z", 130),
  row(5, "2026-03-25T15:00:00.000Z", 150),
  row(6, "2026-06-10T15:00:00.000Z", 999, { voidedAt: "2026-06-11T00:00:00.000Z" }),
  row(7, "2026-06-12T15:00:00.000Z", 0),
  row(8, "2026-06-14T15:00:00.000Z", 500, { kind: "generic" }),
  row(9, "2026-06-01T02:00:00.000Z", 160), // May 31 in the Dominican Republic (UTC−4)
  row(0, "2024-11-30T15:00:00.000Z", 50, { voidedAt: "2024-12-01T00:00:00.000Z" }),
];
const stats = priceHistoryStats(history, new Date("2026-06-20T00:00:00.000Z"));
assert.equal(stats.byCalendarMonth.length, 12);
const march = stats.byCalendarMonth[2];
assert.deepEqual(march, { month: 3, avg: 122.5, min: 100, max: 150, count: 4 });
assert.deepEqual(stats.byCalendarMonth[5], { month: 6, avg: null, min: null, max: null, count: 0 }, "void, zero and generic rows never count");
assert.deepEqual(stats.byCalendarMonth[4], { month: 5, avg: 160, min: 160, max: 160, count: 1 }, "months follow the Dominican calendar");
assert.deepEqual(stats.byCalendarMonth[0], { month: 1, avg: null, min: null, max: null, count: 0 }, "empty months stay empty");
assert.deepEqual(
  stats.series.map((s) => [s.month, s.avg, s.count]),
  [
    ["2025-03", 105, 2],
    ["2025-09", 120, 1],
    ["2026-03", 140, 2],
    ["2026-05", 160, 1],
  ],
);
assert.equal(stats.latestMonth, "2026-05");
assert.equal(stats.change.m3, null, "no data exactly 3 months before the latest month");
assert.equal(stats.change.m6, null);
assert.equal(stats.change.m12, null);
const stats2 = priceHistoryStats(history.filter((r) => r.id !== ID(9)), new Date("2026-06-20T00:00:00.000Z"));
assert.equal(stats2.latestMonth, "2026-03");
assert.ok(Math.abs((stats2.change.m6 ?? Number.NaN) - ((140 - 120) / 120) * 100) < 1e-9);
assert.ok(Math.abs((stats2.change.m12 ?? Number.NaN) - ((140 - 105) / 105) * 100) < 1e-9);
assert.equal(stats2.change.m3, null);
assert.equal(stats.firstObservedAt, "2025-03-15T15:00:00.000Z", "voided rows do not start the history");
const future = priceHistoryStats([row(1, "2026-09-01T15:00:00.000Z", 100)], new Date("2026-06-20T00:00:00.000Z"));
assert.equal(future.series.length, 0, "rows after now are ignored");
const empty = priceHistoryStats([], new Date());
assert.equal(empty.firstObservedAt, null);
assert.equal(empty.latestMonth, null);
assert.deepEqual(empty.change, { m3: null, m6: null, m12: null });
assert.ok(empty.byCalendarMonth.every((m) => m.count === 0 && m.avg === null));

console.log("testEquipmentPrices: OK");
