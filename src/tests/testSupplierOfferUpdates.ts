import assert from "node:assert/strict";
import { planSupplierOfferUpdates } from "../utils/supplierOfferUpdates";
import { useSimulationStore as store } from "../store/useSimulationStore";
import { DEFAULT_EQUIPMENT_CATALOG } from "../data/defaultEquipmentCatalog";
import { serializeSimulationStore } from "../store/persistence/serializeSimulationStore";
const offer = {
  id: "offer-a",
  supplierName: "Proveedor A",
  priceUSD: 100,
  currency: "DOP" as const,
  priceDOP: 6000,
  sku: "SKU-1",
  notes: "Entrega local",
  source: "ai_scan" as const,
  stockStatus: "in_stock" as const,
  updatedAt: "2026-10-01",
};
const catalog = [0, 1, 2].map((index) => ({
  ...structuredClone(DEFAULT_EQUIPMENT_CATALOG[0]),
  id: `eq-${index}`,
  organizationId: "qa-org",
  syncServerUrl: "https://suppliers.invalid",
  version: 3,
  baseVersion: 3,
  supplierPrices: [
    { ...offer, id: `offer-${index}` },
    { ...offer, id: `other-${index}`, supplierName: "Otro proveedor" },
  ],
}));
const refs = [0, 1].map((index) => ({
  equipmentId: `eq-${index}`,
  offerId: `offer-${index}`,
}));
const updates = planSupplierOfferUpdates(
  catalog,
  refs,
  { stockStatus: "out_of_stock" },
  "2026-10-15",
);
assert.equal(updates.length, 2);
for (const update of updates) {
  assert.equal(update.supplierPrice.stockStatus, "out_of_stock");
  assert.equal(update.supplierPrice.priceUSD, 100);
  assert.equal(update.supplierPrice.priceDOP, 6000);
  assert.equal(update.supplierPrice.currency, "DOP");
  assert.equal(update.supplierPrice.sku, offer.sku);
  assert.equal(update.supplierPrice.notes, offer.notes);
  assert.equal(update.supplierPrice.source, offer.source);
}
assert.equal(
  catalog[0].supplierPrices[0].stockStatus,
  "in_stock",
  "Planning is immutable",
);
assert.throws(() =>
  planSupplierOfferUpdates(
    catalog,
    [...refs, { equipmentId: "missing", offerId: "x" }],
    { stockStatus: "consult" },
  ),
);
assert.throws(() =>
  planSupplierOfferUpdates(catalog, [...refs, refs[0]], {
    stockStatus: "consult",
  }),
);
for (const priceUSD of [-1, NaN, Infinity])
  assert.throws(() => planSupplierOfferUpdates(catalog, refs, { priceUSD }));
const usd = planSupplierOfferUpdates(catalog, refs, { priceUSD: 0 })[0]
  .supplierPrice;
assert.equal(usd.priceUSD, 0);
assert.equal(usd.currency, "USD");
assert.equal(usd.priceDOP, undefined);
const latest = structuredClone(catalog);
latest[0].supplierPrices[0].priceUSD = 125;
assert.equal(
  planSupplierOfferUpdates(latest, refs, { stockStatus: "consult" })[0]
    .supplierPrice.priceUSD,
  125,
  "A bulk stock change uses current prices",
);
const initial = store.getState();
try {
  store
    .getState()
    .setSyncSettings({
      serverUrl: "https://suppliers.invalid",
      currentUser: {
        id: "qa",
        name: "QA",
        email: "qa@example.invalid",
        role: "ADMIN",
        organizationId: "qa-org",
      },
      authToken: "synthetic",
      autoSyncEnabled: false,
    });
  store.setState({
    equipmentCatalog: catalog,
    equipmentChanges: {},
    equipmentDeletionQueue: [],
    projects: [],
  });
  store.getState().batchUpdateSupplierPrices(updates);
  const state = store.getState();
  assert.equal(
    state.equipmentCatalog[0].supplierPrices![0].supplierName,
    "Otro proveedor",
  );
  assert.equal(
    state.equipmentCatalog[0].supplierPrices!.find(
      (price) => price.id === "offer-0",
    )!.stockStatus,
    "out_of_stock",
  );
  assert.equal(
    state.equipmentCatalog[1].supplierPrices!.find(
      (price) => price.id === "offer-1",
    )!.stockStatus,
    "out_of_stock",
  );
  assert.deepEqual(
    state.equipmentCatalog[2].supplierPrices,
    catalog[2].supplierPrices,
    "Unselected equipment remains untouched",
  );
  assert.deepEqual(
    state.equipmentCatalog[0].supplierPrices!.find(
      (price) => price.id === "other-0",
    ),
    catalog[0].supplierPrices[1],
    "Other supplier remains untouched",
  );
  assert.deepEqual(Object.keys(state.equipmentChanges).sort(), [
    "eq-0",
    "eq-1",
  ]);
  assert.equal(state.equipmentChanges["eq-0"].baseVersion, 3);
  const saved = JSON.parse(JSON.stringify(serializeSimulationStore(state)));
  assert.equal(saved.equipmentChanges["eq-0"].baseVersion, 3);
  assert.equal(
    saved.equipmentCatalog[0].supplierPrices.find(
      (p: any) => p.id === "offer-0",
    ).stockStatus,
    "out_of_stock",
  );
  store.setState({
    syncSettings: {
      ...state.syncSettings,
      currentUser: { ...state.syncSettings.currentUser!, role: "VIEWER" },
    },
  });
  store
    .getState()
    .batchUpdateSupplierPrices(
      planSupplierOfferUpdates(state.equipmentCatalog, refs, {
        stockStatus: "consult",
      }),
    );
  assert.equal(
    store.getState().equipmentCatalog,
    state.equipmentCatalog,
    "Readers cannot mutate offers",
  );
} finally {
  store.setState(initial, true);
}
console.log(
  "✓ Supplier bulk updates preserve other offers, prices, DOP provenance, CAS and durable offline intent; validate inputs and reader permissions.",
);
