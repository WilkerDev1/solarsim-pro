/** Disposable synthetic fixture: all requests are intercepted locally. */
import { createRoot } from "react-dom/client";
import { EquipmentManagerSettingsTab } from "../../../src/components/common/EquipmentManagerSettingsTab";
import { SupplierPricesDetailModal } from "../../../src/components/common/SupplierPricesDetailModal";
import { AIDatasheetScannerModal } from "../../../src/components/common/AIDatasheetScannerModal";
import { useSimulationStore } from "../../../src/store/useSimulationStore";
import "../../../src/index.css";
const params = new URLSearchParams(location.search);
const dark = params.get("theme") === "dark";
// Like App.tsx: Tailwind dark variants hang from the root element.
document.documentElement.classList.toggle("dark", dark);
const offline = params.has("offline");
const withAssets = params.has("assets");
/** `?assets=1`: synthetic images and datasheets so the catalog previews render real thumbnails. */
async function syntheticAssets() {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const page of [1, 2, 3]) {
    const sheet = pdf.addPage([595, 842]);
    sheet.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: rgb(0.06, 0.55, 0.38) });
    sheet.drawText(`Ficha QA · página ${page}`, { x: 40, y: 780, size: 28, font, color: rgb(1, 1, 1) });
  }
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#1e3a8a";
  context.fillRect(0, 0, 320, 320);
  context.fillStyle = "#93c5fd";
  for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) context.fillRect(20 + col * 72, 20 + row * 48, 64, 40);
  const png = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
  return { pdf: await pdf.save(), png: new Uint8Array(await png.arrayBuffer()) };
}
const assets = withAssets ? await syntheticAssets() : null;
const assetPatch = (index: number) =>
  !withAssets ? {} : index % 3 === 0
    ? { imageAssetIds: ["qa-image"], imageNames: ["Vista frontal"], datasheetAssetId: "qa-datasheet" }
    : index % 3 === 1
      ? { datasheetAssetId: "qa-datasheet", datasheetName: "5f3b762bf4e99b1.pdf" }
      : { datasheetAssetId: undefined, datasheetName: undefined };
const item = {
  id: "qa-panel",
  organizationId: "qa-org",
  syncServerUrl: "https://qa.example.invalid",
  type: "panel" as const,
  displayName: "Módulo QA Solar Serie A (600W)",
  brand: "QA Solar",
  modelSeries: "Serie A-600",
  category: "Bifacial N-Type TOPCon",
  powerW: 600,
  efficiencyPct: 22.2,
  tempCoeff: -0.29,
  annualDegradation: 0.4,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  supplierPrices: [
    {
      id: "offer-qa",
      supplierName: "Proveedor de prueba",
      priceUSD: 90,
      currency: "USD" as const,
      stockStatus: "in_stock" as const,
      sku: "QA-600",
      notes: "Precio unitario de prueba",
      updatedAt: new Date().toISOString(),
    },
  ],
  datasheetAssetId: "qa-datasheet",
  datasheetName: "Familia QA Solar.pdf",
};
useSimulationStore.setState({
  equipmentChanges: {},
  equipmentCatalog: params.has("suppliers")
    ? Array.from({ length: 9 }, (_, index) => ({
        ...item,
        id: `qa-${index}`,
        displayName:
          [
            "Módulo QA Solar TOPCon 620 W",
            "Inversor híbrido QA 16 kW split phase",
            "Batería QA LiFePO4 16.08 kWh",
          ][index % 3] + (index > 2 ? ` · Serie ${index + 1}` : ""),
        type: (["panel", "inverter", "battery"] as const)[index % 3],
        ...assetPatch(index),
        brand: ["QA Solar", "QA Power", "QA Storage"][index % 3],
        supplierPrices: [
          {
            ...item.supplierPrices[0],
            id: `offer-${index}`,
            supplierName: "Distribuidora Solar del Caribe",
            priceUSD: [95, 2300, 1450][index % 3],
            stockStatus: (
              ["in_stock", "on_order", "out_of_stock", "consult"] as const
            )[index % 4],
          },
          ...(index < 4
            ? [
                {
                  ...item.supplierPrices[0],
                  id: `alternative-${index}`,
                  supplierName:
                    index < 2
                      ? "Energía y Suministros"
                      : "Almacén Fotovoltaico",
                  priceUSD: 120 + index * 200,
                },
              ]
            : []),
        ],
      }))
    : [{...item,supplierPrices:params.has("emptyOffers")?[]:item.supplierPrices,...assetPatch(0)}],
  projects: [],
  sidebarTheme: dark ? "dark" : "light",
  workspaceScope: "https://qa.example.invalid|qa-org",
  geminiApiKey: "synthetic-qa-only",
  syncSettings: {
    serverUrl: "https://qa.example.invalid",
    authToken: "synthetic-qa-only",
    autoSyncEnabled: false,
    lastSyncTimestamp: null,
    currentUser: {
      id: "qa-user",
      name: "Consultora QA",
      email: "qa@example.invalid",
      role: params.has("reader") ? "VIEWER" : "ADMIN",
      organizationId: "qa-org",
    },
  },
});
Object.assign(window, { qaCatalogStore: useSimulationStore });
const extraction = {
  equipmentType: "panel",
  brand: "QA Solar",
  modelSeries: "Serie B",
  documentTitle: "Familia QA",
  category: "TOPCon",
  variants: [610, 620].map((powerW) => ({
    modelCode: `QA-B-${powerW}`,
    displayName: `Módulo QA Solar Serie B (${powerW}W)`,
    powerW,
    efficiencyPct: 22.5,
  })),
};
window.fetch = async (url, init) => {
  if (String(url).includes("generativelanguage.googleapis.com"))
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify(extraction) }] },
            finishReason: "STOP",
          },
        ],
      }),
    );
  if (
    String(url).endsWith("/api/equipment-assets") &&
    init?.method === "POST"
  ) {
    if (offline) throw new TypeError("Servidor QA apagado");
    const file = (init.body as FormData).get("file") as File;
    return new Response(
      JSON.stringify({
        success: true,
        asset: {
          id: "qa-shared-asset",
          name: file.name,
          kind: (init.body as FormData).get("kind"),
        },
      }),
    );
  }
  if (assets && String(url).endsWith("/api/equipment-assets/qa-image"))
    return new Response(assets.png, { headers: { "Content-Type": "image/png" } });
  if (assets && String(url).endsWith("/api/equipment-assets/qa-datasheet"))
    return new Response(assets.pdf, { headers: { "Content-Type": "application/pdf" } });
  if (String(url).includes("/api/equipment-assets/"))
    return new Response("%PDF-1.7 synthetic", {
      headers: { "Content-Type": "application/pdf" },
    });
  if (String(url).endsWith("/api/equipment/batch"))
    return new Response(
      JSON.stringify({ success: true, syncedCount: 1, equipment: [] }),
    );
  throw new Error(`Unexpected network in fixture: ${String(url)}`);
};
createRoot(document.getElementById("root")!).render(
  <div
    style={
      params.has("suppliers")
        ? { maxWidth: params.has("narrow") ? 720 : 1100, margin: "0 auto" }
        : undefined
    }
    className={`min-h-screen p-6 ${dark ? "bg-[#141619] text-zinc-100" : "bg-slate-50 text-slate-900"}`}
  >
    <EquipmentManagerSettingsTab isDark={dark} />
    <SupplierPricesDetailModal/><AIDatasheetScannerModal />
  </div>,
);
