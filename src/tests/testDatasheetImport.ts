import assert from "node:assert/strict";
import {
  normalizeDatasheetResponse,
  planDatasheetImport,
} from "../utils/datasheetImport";
import { findCatalogMatchForVariant } from "../utils/equipmentMatchingUtils";
import { useSimulationStore } from "../store/useSimulationStore";
import { GeminiPriceCatalogService } from "../services/geminiPriceCatalogService";
import type { SolarEquipmentItem } from "../types/equipment";

async function main() {
  const old: SolarEquipmentItem = {
    id: "stable-id",
    type: "panel",
    brand: "Canadian Solar",
    modelSeries: "CS-OLD",
    displayName: "Modelo antiguo",
    powerW: 600,
    efficiencyPct: 22,
    tempCoeff: -0.29,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    preferredSupplierId: "offer-1",
    supplierPrices: [
      {
        id: "offer-1",
        supplierName: "Supplier QA",
        priceUSD: 140,
        updatedAt: "2025-01-01",
      },
    ],
    voc: 50,
  };
  const extracted = normalizeDatasheetResponse({
    equipmentType: "panel",
    brand: "Canadian",
    modelSeries: "CS6",
    variants: [
      {
        modelCode: "CS-NEW",
        displayName: "Modelo actualizado",
        powerW: 615,
        tempCoeff: 0,
      },
    ],
  });
  assert.equal(
    extracted.variants[0].efficiencyPct,
    undefined,
    "Unknown efficiency must remain unknown",
  );
  assert.equal(
    extracted.variants[0].annualDegradation,
    undefined,
    "Unknown degradation must remain unknown",
  );
  assert.equal(extracted.brand, "Canadian Solar");
  const data = {
    ...extracted,
    variants: [
      {
        ...extracted.variants[0],
        action: "update" as const,
        matchedEquipmentId: old.id,
      },
    ],
  };
  const plan = planDatasheetImport(data, [old]);
  assert.equal(plan.updates[0].patch.displayName, "Modelo actualizado");
  assert.equal(plan.updates[0].patch.modelSeries, "CS-NEW");
  assert.equal(plan.updates[0].patch.tempCoeff, 0);
  assert.ok(!("efficiencyPct" in plan.updates[0].patch));
  useSimulationStore.setState({
    equipmentCatalog: [old],
    equipmentChanges: {},
    equipmentDeletionQueue: [],
    syncSettings: {
      ...useSimulationStore.getState().syncSettings,
      authToken: null,
      currentUser: null,
      autoSyncEnabled: false,
    },
  });
  useSimulationStore
    .getState()
    .updateEquipmentItem(plan.updates[0].id, plan.updates[0].patch);
  const updated = useSimulationStore.getState().equipmentCatalog[0];
  assert.equal(updated.id, old.id);
  assert.equal(updated.displayName, "Modelo actualizado");
  assert.equal(updated.modelSeries, "CS-NEW");
  assert.equal(updated.efficiencyPct, 22);
  assert.equal(updated.voc, 50);
  assert.equal(updated.createdAt, old.createdAt);
  assert.equal(updated.preferredSupplierId, old.preferredSupplierId);
  assert.deepEqual(updated.supplierPrices, old.supplierPrices);
  assert.throws(
    () =>
      planDatasheetImport(
        {
          ...data,
          variants: [
            ...data.variants,
            { ...data.variants[0], id: "second", displayName: "Otra variante" },
          ],
        },
        [old],
      ),
    /mismo equipo/,
  );
  assert.throws(() => planDatasheetImport(data, []), /ya no/);
  assert.throws(
    () =>
      planDatasheetImport(
        { ...data, variants: [{ ...data.variants[0], powerW: -1 }] },
        [old],
      ),
    /positiva/,
  );
  assert.throws(
    () =>
      normalizeDatasheetResponse({
        equipmentType: "unexpected",
        variants: [{}],
      }),
    /tipo/,
  );
  assert.throws(
    () =>
      normalizeDatasheetResponse({
        equipmentType: "battery",
        variants: [{ modelCode: "B1", capacityKWh: 10, dodPct: 200 }],
      }),
    /inválido/,
  );
  const empty = normalizeDatasheetResponse({
    equipmentType: "battery",
    brand: "QA",
    variants: [{ modelCode: "No-data" }],
  });
  assert.equal(empty.variants[0].capacityKWh, undefined);
  assert.equal(empty.variants[0].voltageV, undefined);
  assert.throws(() => planDatasheetImport(empty, []), /positiva/);
  const battery = normalizeDatasheetResponse({
    equipmentType: "battery",
    brand: "QA",
    variants: [{ modelCode: "B1", voltageV: 51.2, capacityAh: 100 }],
  });
  assert.equal(battery.variants[0].capacityKWh, 5.12);
  assert.equal(
    findCatalogMatchForVariant(
      {
        id: "scan",
        modelCode: "CS-OLD",
        displayName: "Different",
        powerW: 600,
      },
      "panel",
      "JA Solar",
      [old],
    ),
    null,
    "A shared model fragment cannot override a different known brand",
  );
  const create = planDatasheetImport(
    { ...data, variants: [{ ...data.variants[0], action: "create_new" }] },
    [old],
  );
  assert.equal(create.creates.length, 1);
  assert.notEqual(create.creates[0].item.id, old.id);
  assert.equal(create.creates[0].item.displayName, "Modelo actualizado");
  assert.throws(
    () =>
      planDatasheetImport(
        {
          ...data,
          variants: [
            {
              ...data.variants[0],
              action: "create_new",
              displayName: old.displayName,
            },
          ],
        },
        [old],
      ),
    /ya existe/,
  );

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.ok(!String(input).includes("?key="));
    assert.equal(
      new Headers(init?.headers).get("x-goog-api-key"),
      "synthetic-key",
    );
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    detectedSupplierName: "Supplier QA",
                    currencyDetected: "DOP",
                    matchedExistingSupplier: "invented supplier",
                    items: [
                      {
                        extractedModelName: "Modelo antiguo",
                        brand: "Canadian Solar",
                        equipmentType: "panel",
                        priceUSD: 9999,
                        originalCurrency: "DOP",
                        originalPrice: 8400,
                        matchedEquipmentId: "invented-id",
                        matchConfidence: 0.99,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const prices = await GeminiPriceCatalogService.scanAndMatchPriceCatalog({
      fileBase64: "YQ==",
      mimeType: "application/pdf",
      fileName: "QA.pdf",
      apiKey: "synthetic-key",
      currentCatalog: [old],
      dopExchangeRate: 60,
      existingSuppliers: [],
    });
    assert.equal(
      prices.items[0].priceUSD,
      140,
      "Currency conversion must be deterministic, never trust model arithmetic",
    );
    assert.equal(
      prices.items[0].matchedEquipmentId,
      old.id,
      "Only a real catalog ID or exact local name is accepted",
    );
    assert.equal(prices.matchedExistingSupplier, null);
    assert.equal(calls, 1, "One request per valid response");
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(
    "PASS: datasheet rename/ID/offers preservation, unknown fields, validation, batch collision and price normalization",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
