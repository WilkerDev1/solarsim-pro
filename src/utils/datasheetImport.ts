import {
  ExtractedDatasheetData,
  ExtractedEquipmentVariant,
  SolarEquipmentItem,
} from "../types/equipment";
import { normalizeBrandName } from "./equipmentBrandUtils";

const numericFields = [
  "powerW",
  "powerKW",
  "capacityKWh",
  "capacityAh",
  "voltageV",
  "dodPct",
  "batteryEfficiencyPct",
  "cycles",
  "maxChargeCurrentA",
  "efficiencyPct",
  "tempCoeff",
  "annualDegradation",
  "voc",
  "isc",
  "vmp",
  "imp",
  "maxAcPowerKW",
  "maxPvPowerKW",
  "maxEfficiencyPct",
  "mpptCount",
  "weightKg",
] as const;
const textFields = [
  "chemistry",
  "voltageMPPT",
  "dimensions",
  "batteryVoltageRange",
] as const;
const percentFields = new Set([
  "dodPct",
  "batteryEfficiencyPct",
  "efficiencyPct",
  "maxEfficiencyPct",
  "annualDegradation",
]);
/** Efficiency-like values can never be <= 1 %, so a value in (0, 1] is a fraction that the catalog stores as %. */
const fractionToPercent = new Set([
  "dodPct",
  "batteryEfficiencyPct",
  "efficiencyPct",
  "maxEfficiencyPct",
]);
const dimensionKeys = ["lengthMm", "widthMm", "heightMm"] as const;

const isPresent = (value: unknown) =>
  value !== undefined && value !== null && value !== "";

function formatDimensions(a: number, b: number, c: number) {
  const f = (n: number) => String(Number(n.toFixed(2)));
  return `${f(a)} x ${f(b)} x ${f(c)} mm`;
}

/** "2465×1134×30 mm" / "2465 * 1134 * 30" → "2465 x 1134 x 30 mm" (the catalog format, in mm). */
function normalizeDimensionsText(text: string) {
  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:x|×|\*|X)\s*(\d+(?:[.,]\d+)?)\s*(?:x|×|\*|X)\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/,
  );
  if (!match) return text.trim();
  const unit = match[4] === "cm" ? 10 : match[4] === "m" ? 1000 : 1;
  const [a, b, c] = [match[1], match[2], match[3]].map(
    (n) => Number(n.replace(",", ".")) * unit,
  );
  return formatDimensions(a, b, c);
}

/** Product name for the dialog heading: manufacturer + series, never the datasheet file code. */
export function datasheetTitle(
  data: Pick<ExtractedDatasheetData, "brand" | "modelSeries" | "documentTitle">,
) {
  const brand = data.brand?.trim() || "";
  const series = data.modelSeries?.trim() || "";
  if (series) {
    return brand && !series.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${series}`
      : series;
  }
  return (
    [brand, data.documentTitle?.trim()].filter(Boolean).join(" ") ||
    "Ficha analizada"
  );
}

/** Unknown values stay unknown: datasheet extraction must not invent engineering specifications. */
export function normalizeDatasheetResponse(
  raw: unknown,
): ExtractedDatasheetData {
  if (!raw || typeof raw !== "object")
    throw new Error("La respuesta de la ficha técnica no es válida.");
  const data = raw as Record<string, unknown>;
  if (!["panel", "inverter", "battery"].includes(String(data.equipmentType)))
    throw new Error(
      "No se pudo identificar el tipo de equipo. Usa una ficha de panel, inversor o batería.",
    );
  if (
    !Array.isArray(data.variants) ||
    data.variants.length === 0 ||
    data.variants.length > 100
  )
    throw new Error(
      "La ficha debe contener entre 1 y 100 variantes identificables.",
    );
  const equipmentType =
    data.equipmentType as ExtractedDatasheetData["equipmentType"];
  const brand =
    normalizeBrandName(typeof data.brand === "string" ? data.brand : "") || "";
  const family =
    data.familySpecs && typeof data.familySpecs === "object"
      ? (data.familySpecs as Record<string, unknown>)
      : {};
  const warnings: string[] = [];
  const variants = data.variants.map(
    (entry, index): ExtractedEquipmentVariant => {
      if (!entry || typeof entry !== "object")
        throw new Error(`La variante ${index + 1} no es válida.`);
      // Common family values fill what the variant leaves out; the variant's own value wins.
      const own = entry as Record<string, unknown>;
      const v: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(family))
        if (isPresent(value)) v[key] = value;
      for (const [key, value] of Object.entries(own))
        if (isPresent(value)) v[key] = value;
      const modelCode =
        typeof own.modelCode === "string" ? own.modelCode.trim() : "";
      const label = modelCode || `variante ${index + 1}`;
      const result: ExtractedEquipmentVariant = {
        id: `var-${crypto.randomUUID()}`,
        modelCode,
        displayName:
          typeof own.displayName === "string" ? own.displayName.trim() : "",
        selected: true,
      };
      const discard = (key: string, value: unknown) =>
        warnings.push(
          `Se descartó ${key} de ${label}: el valor leído (${String(value)}) no es válido.`,
        );
      const readNumber = (key: string) => {
        const value = v[key];
        if (!isPresent(value)) return undefined;
        const n =
          typeof value === "string"
            ? Number(value.replace(",", "."))
            : Number(value);
        if (!Number.isFinite(n)) {
          discard(key, value);
          return undefined;
        }
        return n;
      };
      for (const key of numericFields) {
        let n = readNumber(key);
        if (n === undefined) continue;
        if (fractionToPercent.has(key) && n > 0 && n <= 1) n *= 100;
        if (key === "tempCoeff") {
          // %/°C: a fraction (-0.0029) becomes -0.29, and Pmax never improves with heat.
          if (n !== 0 && Math.abs(n) < 0.02) n *= 100;
          if (equipmentType === "panel" && n > 0) {
            warnings.push(
              `Se interpretó el coeficiente de temperatura de ${label} como negativo (${-n} %/°C).`,
            );
            n = -n;
          }
        }
        if (
          (key !== "tempCoeff" && n < 0) ||
          (percentFields.has(key) && n > 100)
        ) {
          discard(key, v[key]);
          continue;
        }
        result[key] = Number(n.toFixed(6));
      }
      for (const key of textFields)
        if (typeof v[key] === "string" && v[key].trim())
          result[key] = v[key].trim();
      if (result.dimensions) {
        result.dimensions = normalizeDimensionsText(result.dimensions);
      } else {
        const mm = dimensionKeys.map(readNumber);
        if (mm.every((n) => n !== undefined && n > 0))
          result.dimensions = formatDimensions(mm[0]!, mm[1]!, mm[2]!);
        else if (mm.some((n) => n !== undefined))
          warnings.push(
            `Dimensiones incompletas de ${label}: faltan largo, ancho o alto.`,
          );
      }
      if (equipmentType === "inverter" && result.maxPvPowerKW === undefined) {
        // Many sheets state the PV input as a percentage of the rated AC power (200 %, 150 %).
        const pct = readNumber("maxPvPowerPct");
        const ac = result.powerKW ?? result.maxAcPowerKW;
        if (pct !== undefined && pct > 0 && ac !== undefined)
          result.maxPvPowerKW = Number(((ac * pct) / 100).toFixed(4));
        else if (pct !== undefined)
          warnings.push(
            `No se pudo calcular la FV máxima de ${label}: falta la potencia AC nominal.`,
          );
      }
      if (
        equipmentType === "panel" &&
        result.powerW === undefined &&
        result.powerKW !== undefined
      )
        result.powerW = result.powerKW * 1000;
      if (
        equipmentType === "inverter" &&
        result.powerKW === undefined &&
        result.powerW !== undefined
      )
        result.powerKW = result.powerW / 1000;
      if (
        equipmentType === "battery" &&
        result.capacityKWh === undefined &&
        result.capacityAh !== undefined &&
        result.voltageV !== undefined
      )
        result.capacityKWh = Number(
          ((result.capacityAh * result.voltageV) / 1000).toFixed(4),
        );
      if (!result.displayName)
        result.displayName = [brand, modelCode].filter(Boolean).join(" ");
      return result;
    },
  );
  return {
    equipmentType,
    brand,
    modelSeries:
      typeof data.modelSeries === "string" ? data.modelSeries.trim() : "",
    documentTitle:
      typeof data.documentTitle === "string" ? data.documentTitle : undefined,
    category: typeof data.category === "string" ? data.category : undefined,
    specsSummary:
      typeof data.specsSummary === "string" ? data.specsSummary : undefined,
    variants,
    ...(warnings.length ? { warnings } : {}),
  };
}

export function datasheetVariantPatch(
  data: ExtractedDatasheetData,
  variant: ExtractedEquipmentVariant,
): Partial<SolarEquipmentItem> {
  const patch: Partial<SolarEquipmentItem> = {
    brand: normalizeBrandName(data.brand) || data.brand.trim(),
    displayName: variant.displayName.trim(),
    modelSeries: variant.modelCode.trim() || data.modelSeries.trim(),
  };
  if (data.category?.trim()) patch.category = data.category.trim();
  for (const key of numericFields)
    if (variant[key] !== undefined) patch[key] = variant[key];
  for (const key of textFields)
    if (variant[key]?.trim()) patch[key] = variant[key];
  return patch;
}

/** Validate the entire batch before touching the store; two variants cannot replace one ID. */
export function planDatasheetImport(
  data: ExtractedDatasheetData,
  catalog: SolarEquipmentItem[],
) {
  const selected = data.variants.filter((v) => v.selected);
  if (!selected.length) throw new Error("Selecciona al menos una variante.");
  if (!data.brand.trim())
    throw new Error("Completa la marca del fabricante antes de guardar.");
  const updates: {
    id: string;
    patch: Partial<SolarEquipmentItem>;
    variantId: string;
  }[] = [];
  const creates: { item: SolarEquipmentItem; variantId: string }[] = [];
  const targetIds = new Set<string>();
  const names = new Set<string>();
  for (const variant of selected) {
    const patch = datasheetVariantPatch(data, variant);
    if (!patch.displayName?.trim() || !patch.modelSeries?.trim())
      throw new Error(
        "Completa el nombre y modelo de cada variante seleccionada.",
      );
    const primary =
      data.equipmentType === "panel"
        ? variant.powerW
        : data.equipmentType === "inverter"
          ? variant.powerKW
          : variant.capacityKWh;
    if (!Number.isFinite(primary) || Number(primary) <= 0)
      throw new Error(
        `Completa una potencia o capacidad positiva para ${variant.displayName}.`,
      );
    for (const key of numericFields)
      if (
        variant[key] !== undefined &&
        (!Number.isFinite(variant[key]) ||
          (key !== "tempCoeff" && variant[key]! < 0) ||
          (percentFields.has(key) && variant[key]! > 100))
      )
        throw new Error(`Revisa ${key} en ${variant.displayName}.`);
    const name = patch.displayName.toLowerCase();
    if (names.has(name))
      throw new Error(
        "Dos variantes seleccionadas tienen el mismo nombre. Diferéncialas antes de guardar.",
      );
    names.add(name);
    if (variant.action === "update") {
      const target = catalog.find(
        (item) => item.id === variant.matchedEquipmentId,
      );
      if (!target || target.type !== data.equipmentType)
        throw new Error(
          "El equipo coincidente ya no está disponible. Vuelve a analizar la ficha.",
        );
      if (targetIds.has(target.id))
        throw new Error(
          "Varias variantes reemplazarían el mismo equipo. Elige una para actualizar y guarda las demás como nuevas.",
        );
      if (
        catalog.some(
          (item) =>
            item.id !== target.id &&
            item.displayName.trim().toLowerCase() === name,
        )
      )
        throw new Error(
          "Ese nombre pertenece a otro equipo del catálogo. Revisa la coincidencia.",
        );
      targetIds.add(target.id);
      updates.push({ id: target.id, patch, variantId: variant.id });
    } else {
      if (
        catalog.some((item) => item.displayName.trim().toLowerCase() === name)
      )
        throw new Error(
          "Ese nombre ya existe. Actualiza su coincidencia o usa un nombre de variante distinto.",
        );
      const now = new Date().toISOString();
      creates.push({
        variantId: variant.id,
        item: {
          ...patch,
          id: `eq-${crypto.randomUUID()}`,
          type: data.equipmentType,
          brand: patch.brand!,
          displayName: patch.displayName!,
          modelSeries: patch.modelSeries!,
          isCustom: true,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }
  return { updates, creates };
}
