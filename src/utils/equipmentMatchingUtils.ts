import {
  ExtractedEquipmentVariant,
  SolarEquipmentItem,
  EquipmentType,
} from "../types/equipment";
import { areBrandsMatching, inferBrandFromText } from "./equipmentBrandUtils";

export interface CatalogMatchResult {
  matchedItem: SolarEquipmentItem;
  score: number;
  reason: string;
}

/**
 * Compara una variante extraída de ficha técnica o cotización contra el catálogo de equipos
 * y determina la mejor coincidencia inteligente.
 */
export function findCatalogMatchForVariant(
  variant: ExtractedEquipmentVariant,
  type: EquipmentType,
  brand: string,
  catalog: SolarEquipmentItem[],
): CatalogMatchResult | null {
  const normModel = (variant.modelCode || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const normDisplay = (variant.displayName || "").toLowerCase().trim();

  let bestMatch: SolarEquipmentItem | null = null;
  let bestScore = 0;
  let bestReason = "";

  for (const item of catalog) {
    if (item.type !== type) continue;

    const itemModel = (item.modelSeries || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const itemDisplay = (item.displayName || "").toLowerCase().trim();

    // Comprobación de coincidencia exacta por nombre display
    if (normDisplay && itemDisplay === normDisplay) {
      return {
        matchedItem: item,
        score: 1.0,
        reason: "Nombre de modelo idéntico ya existente en el catálogo",
      };
    }

    // 1. Verificación de marca e inferencia si el catálogo legacy no la tenía
    const effectiveItemBrand =
      item.brand &&
      item.brand.toLowerCase() !== "fabricante" &&
      item.brand.trim() !== ""
        ? item.brand
        : inferBrandFromText(item.displayName, item.modelSeries);

    const brandMatches = areBrandsMatching(brand, effectiveItemBrand);

    // Si la marca no coincide directamente pero el modelo/nombre coincide fuertemente
    const modelMatchesDirectly = Boolean(
      normModel &&
      itemModel &&
      (normModel.includes(itemModel) || itemModel.includes(normModel)),
    );
    const displayMatchesDirectly = Boolean(
      normModel && itemDisplay.replace(/[^a-z0-9]/g, "").includes(normModel),
    );

    if (brand && effectiveItemBrand && !brandMatches) continue;
    if (!brandMatches && !modelMatchesDirectly && !displayMatchesDirectly) {
      continue;
    }

    const brandLabel = effectiveItemBrand || brand;

    // 2. Coincidencias técnicas según tipo de equipo
    if (type === "battery") {
      const vCap = Number(variant.capacityKWh) || 0;
      const iCap = Number(item.capacityKWh) || 0;
      const vAh = Number(variant.capacityAh) || 0;
      const iAh = Number(item.capacityAh) || 0;

      const capMatch = vCap > 0 && iCap > 0 && Math.abs(vCap - iCap) <= 0.3;
      const ahMatch = vAh > 0 && iAh > 0 && Math.abs(vAh - iAh) <= 15;
      const modelMatch = Boolean(
        normModel &&
        itemModel &&
        (normModel.includes(itemModel) || itemModel.includes(normModel)),
      );

      if (capMatch && (modelMatch || ahMatch)) {
        const score =
          normModel === itemModel ||
          itemDisplay.replace(/[^a-z0-9]/g, "").includes(normModel)
            ? 0.95
            : 0.9;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
          bestReason = `Misma marca (${brandLabel}), capacidad (${iCap} kWh) y modelo compatible`;
        }
      } else if (capMatch) {
        const score = 0.85;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
          bestReason = `Misma marca (${brandLabel}) y capacidad nominal (${iCap} kWh)`;
        }
      }
    } else if (type === "panel") {
      const vPower = Number(variant.powerW) || 0;
      const iPower = Number(item.powerW) || 0;
      const powerMatch =
        vPower > 0 && iPower > 0 && Math.abs(vPower - iPower) <= 3;
      const modelMatch = Boolean(
        normModel &&
        itemModel &&
        (normModel.includes(itemModel) || itemModel.includes(normModel)),
      );

      if (powerMatch && modelMatch) {
        const score =
          normModel === itemModel ||
          itemDisplay.replace(/[^a-z0-9]/g, "").includes(normModel)
            ? 0.95
            : 0.9;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
          bestReason = `Misma marca (${brandLabel}), potencia (${iPower}W) y serie de modelo`;
        }
      } else if (powerMatch) {
        const score = 0.85;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
          bestReason = `Misma marca (${brandLabel}) y potencia nominal (${iPower}W)`;
        }
      }
    } else if (type === "inverter") {
      const vKW = Number(variant.powerKW) || 0;
      const iKW = Number(item.powerKW) || 0;
      const kwMatch = vKW > 0 && iKW > 0 && Math.abs(vKW - iKW) <= 0.25;
      const modelMatch = Boolean(
        normModel &&
        itemModel &&
        (normModel.includes(itemModel) || itemModel.includes(normModel)),
      );

      if (kwMatch && modelMatch) {
        const score =
          normModel === itemModel ||
          itemDisplay.replace(/[^a-z0-9]/g, "").includes(normModel)
            ? 0.95
            : 0.9;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
          bestReason = `Misma marca (${brandLabel}), potencia AC (${iKW} kW) y modelo`;
        }
      } else if (kwMatch) {
        const score = 0.85;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
          bestReason = `Misma marca (${brandLabel}) y potencia AC (${iKW} kW)`;
        }
      }
    }
  }

  if (bestMatch && bestScore >= 0.75) {
    return {
      matchedItem: bestMatch,
      score: bestScore,
      reason: bestReason,
    };
  }

  return null;
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
