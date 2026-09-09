import { ExtractedEquipmentVariant, SolarEquipmentItem, EquipmentType } from '../types/equipment';
import { areBrandsMatching, inferBrandFromText } from './equipmentBrandUtils';

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
  catalog: SolarEquipmentItem[]
): CatalogMatchResult | null {
  const normModel = (variant.modelCode || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normDisplay = (variant.displayName || '').toLowerCase().trim();

  let bestMatch: SolarEquipmentItem | null = null;
  let bestScore = 0;
  let bestReason = '';

  for (const item of catalog) {
    if (item.type !== type) continue;

    const itemModel = (item.modelSeries || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const itemDisplay = (item.displayName || '').toLowerCase().trim();

    // Comprobación de coincidencia exacta por nombre display
    if (itemDisplay === normDisplay) {
      return {
        matchedItem: item,
        score: 1.0,
        reason: 'Nombre de modelo idéntico ya existente en el catálogo',
      };
    }

    // 1. Verificación de marca e inferencia si el catálogo legacy no la tenía
    const effectiveItemBrand = item.brand && item.brand.toLowerCase() !== 'fabricante' && item.brand.trim() !== ''
      ? item.brand
      : inferBrandFromText(item.displayName, item.modelSeries);

    const brandMatches = areBrandsMatching(brand, effectiveItemBrand);

    // Si la marca no coincide directamente pero el modelo/nombre coincide fuertemente
    const modelMatchesDirectly = Boolean(normModel && itemModel && (normModel.includes(itemModel) || itemModel.includes(normModel)));
    const displayMatchesDirectly = Boolean(normModel && itemDisplay.replace(/[^a-z0-9]/g, '').includes(normModel));

    if (!brandMatches && !modelMatchesDirectly && !displayMatchesDirectly) {
      continue;
    }

    const brandLabel = effectiveItemBrand || brand;

    // 2. Coincidencias técnicas según tipo de equipo
    if (type === 'battery') {
      const vCap = Number(variant.capacityKWh) || 0;
      const iCap = Number(item.capacityKWh) || 0;
      const vAh = Number(variant.capacityAh) || 0;
      const iAh = Number(item.capacityAh) || 0;

      const capMatch = vCap > 0 && iCap > 0 && Math.abs(vCap - iCap) <= 0.3;
      const ahMatch = vAh > 0 && iAh > 0 && Math.abs(vAh - iAh) <= 15;
      const modelMatch = Boolean(normModel && itemModel && (normModel.includes(itemModel) || itemModel.includes(normModel)));

      if (capMatch && (modelMatch || ahMatch)) {
        const score = 0.95;
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
    } else if (type === 'panel') {
      const vPower = Number(variant.powerW) || 0;
      const iPower = Number(item.powerW) || 0;
      const powerMatch = vPower > 0 && iPower > 0 && Math.abs(vPower - iPower) <= 3;
      const modelMatch = Boolean(normModel && itemModel && (normModel.includes(itemModel) || itemModel.includes(normModel)));

      if (powerMatch && modelMatch) {
        const score = 0.95;
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
    } else if (type === 'inverter') {
      const vKW = Number(variant.powerKW) || 0;
      const iKW = Number(item.powerKW) || 0;
      const kwMatch = vKW > 0 && iKW > 0 && Math.abs(vKW - iKW) <= 0.25;
      const modelMatch = Boolean(normModel && itemModel && (normModel.includes(itemModel) || itemModel.includes(normModel)));

      if (kwMatch && modelMatch) {
        const score = 0.95;
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
