import assert from "node:assert/strict";
import {
  planPriceCatalogImport,
  isPriceCatalogPlanApplied,
} from "../utils/priceCatalogImport";
import { useSimulationStore } from "../store/useSimulationStore";
import type {
  ExtractedPriceCatalogItem,
  SolarEquipmentItem,
} from "../types/equipment";

const row: ExtractedPriceCatalogItem = {
  id: "row-1",
  extractedModelName: "New Model",
  brand: "QA",
  equipmentType: "panel",
  priceUSD: 150,
  matchConfidence: 0,
  action: "create_new",
  selected: true,
};
const existing: SolarEquipmentItem = {
  id: "stable-id",
  type: "panel",
  brand: "QA",
  modelSeries: "M1",
  displayName: "Existing Model",
  powerW: 600,
  preferredSupplierId: "stable-offer",
  supplierPrices: [
    {
      id: "stable-offer",
      supplierName: "Supplier QA",
      priceUSD: 100,
      updatedAt: "2026-01-01",
    },
    {
      id: "other-offer",
      supplierName: "Other supplier",
      priceUSD: 200,
      updatedAt: "2026-01-01",
    },
  ],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
useSimulationStore.setState({
  equipmentCatalog: [existing],
  equipmentChanges: {},
  equipmentDeletionQueue: [],
  syncSettings: {
    ...useSimulationStore.getState().syncSettings,
    authToken: null,
    currentUser: null,
    autoSyncEnabled: false,
  },
});
const before = JSON.stringify(useSimulationStore.getState().equipmentCatalog);
assert.throws(
  () =>
    planPriceCatalogImport(
      [row, { ...row, id: "row-2", extractedModelName: "  NEW   MODEL  " }],
      [existing],
      "Supplier QA",
    ),
  /mismo nombre/,
);
assert.equal(
  JSON.stringify(useSimulationStore.getState().equipmentCatalog),
  before,
  "Failed batch preflight must never mutate catalog or discard IDs/offers",
);
assert.throws(
  () =>
    planPriceCatalogImport(
      [{ ...row, extractedModelName: " EXISTING   MODEL " }],
      [existing],
      "Supplier QA",
    ),
  /ya existe/,
);
const update = {
  ...row,
  action: "update_price" as const,
  matchedEquipmentId: existing.id,
  extractedModelName: existing.displayName,
};
assert.throws(
  () =>
    planPriceCatalogImport(
      [update, { ...update, id: "second" }],
      [existing],
      "Supplier QA",
    ),
  /Varias filas/,
);
assert.throws(
  () =>
    planPriceCatalogImport([row], [existing], "Supplier QA", {
      user: { role: "VIEWER", organizationId: "org-a" },
    }),
  /solo puede/,
);
assert.throws(
  () =>
    planPriceCatalogImport(
      [row, update],
      [{ ...existing, organizationId: "org-b" }],
      "Supplier QA",
      {
        user: { role: "ADMIN", organizationId: "org-a" },
        serverUrl: "https://qa.invalid",
      },
    ),
  /otro ámbito/,
);
assert.throws(
  () =>
    planPriceCatalogImport(
      [update],
      [{ ...existing, syncServerUrl: "https://other.invalid" }],
      "Supplier QA",
      {
        user: { role: "ADMIN", organizationId: "org-a" },
        serverUrl: "https://qa.invalid",
      },
    ),
  /otro ámbito/,
);
assert.equal(
  JSON.stringify(useSimulationStore.getState().equipmentCatalog),
  before,
  "Mixed valid/protected batch must remain untouched",
);
const plan = planPriceCatalogImport(
  [row, { ...update, originalCurrency: "DOP", originalPrice: 9000 }],
  [existing],
  "Supplier QA",
);
assert.equal(
  plan.updates[0].supplierPrice.id,
  "stable-offer",
  "Updating an existing supplier must retain the preferred offer ID",
);
assert.equal(plan.updates[0].supplierPrice.priceDOP, 9000);
assert.equal(
  isPriceCatalogPlanApplied(plan, [existing]),
  false,
  "A denied/rejected mutation cannot yield false success",
);
for (const create of plan.creates)
  useSimulationStore.getState().addEquipmentItem(create);
useSimulationStore.getState().batchUpdateSupplierPrices(plan.updates);
const after = useSimulationStore.getState().equipmentCatalog;
assert.equal(isPriceCatalogPlanApplied(plan, after), true);
assert.equal(after.length, 2);
const original = after.find((item) => item.id === existing.id)!;
assert.equal(original.preferredSupplierId, "stable-offer");
assert.equal(
  original.supplierPrices?.find((offer) => offer.id === "other-offer")
    ?.priceUSD,
  200,
);
assert.equal(
  original.supplierPrices?.find((offer) => offer.id === "stable-offer")
    ?.priceUSD,
  150,
);
assert.ok(after.some((item) => item.id === plan.creates[0].id));
console.log(
  "PASS: duplicate new names, whole-batch scope validation, stable supplier IDs and rejected-write verification",
);
