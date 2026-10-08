import type {
  EquipmentSupplierPrice,
  ExtractedPriceCatalogItem,
  SolarEquipmentItem,
} from "../types/equipment";

const normalizedName = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
export interface PriceImportScope {
  user?: { role: string; organizationId: string } | null;
  serverUrl?: string;
}

/** Complete batch preflight, before any catalog write. */
export function planPriceCatalogImport(
  selected: ExtractedPriceCatalogItem[],
  catalog: SolarEquipmentItem[],
  supplierName: string,
  scope: PriceImportScope = {},
) {
  if (!selected.length)
    throw new Error("Selecciona al menos una fila con precio.");
  if (!supplierName.trim())
    throw new Error("Completa el nombre del proveedor.");
  const { user } = scope;
  if (user && !["ADMIN", "EDITOR"].includes(user.role))
    throw new Error("Tu cuenta solo puede consultar el catálogo.");
  const updates: {
    equipmentId: string;
    supplierPrice: EquipmentSupplierPrice;
  }[] = [];
  const creates: SolarEquipmentItem[] = [];
  const names = new Set<string>();
  const targetIds = new Set<string>();
  const server = scope.serverUrl?.trim().replace(/\/+$/, "");
  const now = new Date().toISOString();
  for (const item of selected) {
    if (!item.extractedModelName?.trim())
      throw new Error("Una fila seleccionada carece de nombre de modelo.");
    if (!Number.isFinite(item.priceUSD) || item.priceUSD <= 0)
      throw new Error("Revisa los precios de las filas seleccionadas.");
    if (!["panel", "inverter", "battery"].includes(item.equipmentType))
      throw new Error("Una fila seleccionada tiene un tipo desconocido.");
    const name = normalizedName(item.extractedModelName);
    const target =
      item.action === "update_price"
        ? catalog.find(
            (entry) =>
              entry.id === item.matchedEquipmentId &&
              entry.type === item.equipmentType,
          )
        : undefined;
    if (item.action === "update_price") {
      if (!target)
        throw new Error(
          "Un equipo coincidente ya no está disponible. Vuelve a analizar la lista.",
        );
      if (targetIds.has(target.id))
        throw new Error(
          "Varias filas cotizan el mismo modelo. Elige un precio por equipo para este proveedor.",
        );
      if (
        user &&
        ((target.organizationId &&
          target.organizationId !== user.organizationId) ||
          (target.syncServerUrl &&
            target.syncServerUrl.trim().replace(/\/+$/, "") !== server))
      )
        throw new Error(
          "Una coincidencia pertenece a otro ámbito. No se puede actualizar desde esta organización.",
        );
      targetIds.add(target.id);
    } else if (item.action === "create_new") {
      if (names.has(name))
        throw new Error(
          "Varias filas nuevas tienen el mismo nombre. Diferéncialas o selecciona una sola antes de importar.",
        );
      if (catalog.some((entry) => normalizedName(entry.displayName) === name))
        throw new Error(
          "Un nombre ya existe. Vincula esa fila con su modelo del catálogo.",
        );
      names.add(name);
    } else throw new Error("Una fila seleccionada no tiene una acción válida.");
    const priorOffer = target?.supplierPrices?.find(
      (entry) =>
        normalizedName(entry.supplierName) === normalizedName(supplierName),
    );
    const offer: EquipmentSupplierPrice = {
      ...priorOffer,
      id: priorOffer?.id || `sp-${crypto.randomUUID()}`,
      supplierName: supplierName.trim(),
      priceUSD: item.priceUSD,
      currency: item.originalCurrency || "USD",
      priceDOP:
        item.originalCurrency === "DOP" ? item.originalPrice : undefined,
      sku: item.sku || priorOffer?.sku,
      notes: item.notes || priorOffer?.notes,
      stockStatus: "consult",
      updatedAt: now,
      source: "ai_scan",
    };
    if (target) updates.push({ equipmentId: target.id, supplierPrice: offer });
    else
      creates.push({
        id: `eq-${crypto.randomUUID()}`,
        type: item.equipmentType,
        brand: item.brand || "Fabricante",
        modelSeries: item.extractedModelName.trim(),
        displayName: item.extractedModelName.trim(),
        isCustom: true,
        supplierPrices: [offer],
        createdAt: now,
        updatedAt: now,
      });
  }
  return { updates, creates };
}

/** A rejected store mutation must not be presented as a completed import. */
export function isPriceCatalogPlanApplied(
  plan: ReturnType<typeof planPriceCatalogImport>,
  catalog: SolarEquipmentItem[],
) {
  const hasOffer = (id: string, expected: EquipmentSupplierPrice) =>
    catalog
      .find((entry) => entry.id === id)
      ?.supplierPrices?.some(
        (offer) =>
          offer.id === expected.id &&
          offer.priceUSD === expected.priceUSD &&
          offer.currency === expected.currency &&
          offer.priceDOP === expected.priceDOP &&
          offer.supplierName === expected.supplierName,
      ) === true;
  return (
    plan.updates.every((entry) =>
      hasOffer(entry.equipmentId, entry.supplierPrice),
    ) &&
    plan.creates.every((entry) => hasOffer(entry.id, entry.supplierPrices![0]))
  );
}
