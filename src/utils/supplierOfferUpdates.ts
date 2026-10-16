import type {
  EquipmentSupplierPrice,
  SolarEquipmentItem,
} from "../types/equipment";

export const STOCK_LABELS = {
  in_stock: "En stock",
  on_order: "Bajo pedido",
  out_of_stock: "Agotado",
  consult: "Consultar",
} as const;
export type StockStatus = keyof typeof STOCK_LABELS;
export type OfferReference = { equipmentId: string; offerId: string };
export const offerKey = (reference: OfferReference) =>
  JSON.stringify([reference.equipmentId, reference.offerId]);

/** Resolve against the latest catalogue so a stock change never restores an old price. */
export function planSupplierOfferUpdates(
  catalog: SolarEquipmentItem[],
  references: OfferReference[],
  patch: { stockStatus?: StockStatus; priceUSD?: number },
  now = new Date().toISOString(),
): { equipmentId: string; supplierPrice: EquipmentSupplierPrice }[] {
  if (
    patch.priceUSD !== undefined &&
    (!Number.isFinite(patch.priceUSD) || patch.priceUSD < 0)
  )
    throw new Error("Introduce un precio USD válido, igual o mayor que cero.");
  if (
    patch.stockStatus !== undefined &&
    !Object.hasOwn(STOCK_LABELS, patch.stockStatus)
  )
    throw new Error("Selecciona una disponibilidad válida.");
  const seen = new Set<string>();
  return references.map((reference) => {
    const key = offerKey(reference);
    if (seen.has(key))
      throw new Error("La selección contiene una oferta repetida.");
    seen.add(key);
    const offer = catalog
      .find((item) => item.id === reference.equipmentId)
      ?.supplierPrices?.find((price) => price.id === reference.offerId);
    if (!offer)
      throw new Error(
        "Una oferta cambió o fue eliminada. Revisa la selección e inténtalo de nuevo.",
      );
    const supplierPrice = { ...offer, ...patch, updatedAt: now };
    // An explicit USD edit replaces the original DOP quotation; stock-only edits retain it.
    if (patch.priceUSD !== undefined) {
      supplierPrice.currency = "USD";
      supplierPrice.priceDOP = undefined;
      supplierPrice.source = "manual";
    }
    return { equipmentId: reference.equipmentId, supplierPrice };
  });
}
