import {
  ExtractedEquipmentVariant,
  SolarEquipmentItem,
  EquipmentType,
} from "../types/equipment";
import { fitEquipment } from "../../shared/equipmentMatch";

export interface CatalogMatchResult {
  matchedItem: SolarEquipmentItem;
  score: number;
  reason: string;
}

/**
 * Compara una variante extraída de ficha técnica o cotización contra el catálogo de equipos con el emparejador
 * compartido (`shared/equipmentMatch`): misma marca (con alias e inferida si el catálogo la tenía genérica),
 * misma potencia/capacidad con la tolerancia común y modelo compatible. La puntuación conserva su escala:
 * 1 nombre idéntico, 0.95 especificación + modelo exacto, 0.9 especificación + modelo compatible (o Ah en baterías),
 * 0.85 solo especificación. Solo desde 0.95 la ficha actualiza el equipo sin revisión.
 */
export function findCatalogMatchForVariant(
  variant: ExtractedEquipmentVariant,
  type: EquipmentType,
  brand: string,
  catalog: SolarEquipmentItem[],
): CatalogMatchResult | null {
  const normDisplay = (variant.displayName || "").toLowerCase().trim();
  const identical = normDisplay
    ? catalog.find((item) => item.type === type && (item.displayName || "").toLowerCase().trim() === normDisplay)
    : undefined;
  if (identical) return { matchedItem: identical, score: 1.0, reason: "Nombre de modelo idéntico ya existente en el catálogo" };

  const magnitude = Number(type === "panel" ? variant.powerW : type === "inverter" ? variant.powerKW : variant.capacityKWh) || undefined;
  if (!magnitude) return null;
  let best: CatalogMatchResult | null = null;
  let bestDelta = Infinity;
  for (const item of catalog) {
    const fit = fitEquipment({ type, brand, model: variant.modelCode, magnitude, capacityAh: Number(variant.capacityAh) || undefined }, item);
    // Sin marca conocida en ambos lados, el modelo tiene que aportar la identidad.
    if (!fit.fits || (!fit.brandMatch && !fit.modelMatch)) continue;
    const score = fit.modelMatch === "exact" ? 0.95 : fit.modelMatch === "compatible" || fit.ahMatch ? 0.9 : 0.85;
    // Misma puntuación: gana la potencia/capacidad más cercana (620 W antes que 622 W).
    const delta = fit.magnitudeDelta ?? Infinity;
    if (!best || score > best.score || (score === best.score && delta < bestDelta)) {
      best = { matchedItem: item, score, reason: fit.reason };
      bestDelta = delta;
    }
  }
  return best;
}

/** Catalog item behind a project's equipment: exact name, assigned offer, normalized name, HinaESS alias, spec tolerance, then the first of its type. */
export function resolveProjectEquipment(
  equipmentCatalog: SolarEquipmentItem[],
  type: 'panel' | 'inverter' | 'battery',
  modelName?: string,
  powerOrCap?: number,
  supplierPriceId?: string
): SolarEquipmentItem | undefined {
  if (!equipmentCatalog || equipmentCatalog.length === 0) return undefined;

  // 1. Coincidencia exacta por displayName
  if (modelName) {
    const exact = equipmentCatalog.find((e) => e.type === type && e.displayName === modelName);
    if (exact) return exact;
  }

  // 2. Coincidencia por supplierPriceId asignado al proyecto
  if (supplierPriceId) {
    const byPrice = equipmentCatalog.find(
      (e) => e.type === type && e.supplierPrices?.some((sp) => sp.id === supplierPriceId)
    );
    if (byPrice) return byPrice;
  }

  // 3. Coincidencia normalizada sin caracteres especiales
  if (modelName) {
    const normModel = modelName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byNorm = equipmentCatalog.find((e) => {
      if (e.type !== type) return false;
      const normE = e.displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normE === normModel || normE.includes(normModel) || normModel.includes(normE);
    });
    if (byNorm) return byNorm;

    // Especial para Baterías: "HinaESS" o "PowerGem"
    if (type === 'battery' && (normModel.includes('hina') || normModel.includes('powergem'))) {
      const hinaMatch = equipmentCatalog.find(
        (e) => e.type === 'battery' && (e.brand.toLowerCase().includes('hina') || e.displayName.toLowerCase().includes('hina'))
      );
      if (hinaMatch) return hinaMatch;
    }
  }

  // 4. Coincidencia por especificación técnica (W / kW / kWh)
  if (powerOrCap && powerOrCap > 0) {
    if (type === 'battery') {
      const byCap = equipmentCatalog.find(
        (e) => e.type === 'battery' && e.capacityKWh && Math.abs(e.capacityKWh - powerOrCap) <= 0.5
      );
      if (byCap) return byCap;
    } else if (type === 'panel') {
      const byPower = equipmentCatalog.find(
        (e) => e.type === 'panel' && e.powerW && Math.abs(e.powerW - powerOrCap) <= 5
      );
      if (byPower) return byPower;
    } else if (type === 'inverter') {
      const byPower = equipmentCatalog.find(
        (e) => e.type === 'inverter' && e.powerKW && Math.abs(e.powerKW - powerOrCap) <= 0.5
      );
      if (byPower) return byPower;
    }
  }

  // 5. Fallback al primer equipo disponible del catálogo para este tipo
  return equipmentCatalog.find((e) => e.type === type);
}

/** Whether the selected supplier quotes this item, by offer id or by supplier name (case/space-insensitive). */
export function supplierQuotesItem(
  item: SolarEquipmentItem | undefined,
  supplier: { supplierPriceId?: string; supplierName?: string } | undefined
): boolean {
  return !!item?.supplierPrices?.some(
    (sp) =>
      (supplier?.supplierPriceId && sp.id === supplier.supplierPriceId) ||
      (supplier?.supplierName && sp.supplierName.toLowerCase().trim() === supplier.supplierName.toLowerCase().trim())
  );
}
