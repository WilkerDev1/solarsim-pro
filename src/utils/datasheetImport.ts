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
/** Specs that make sense for each equipment type; the model sometimes echoes battery voltage as an inverter's Vmp. */
const relevantNumeric: Record<string, Set<string>> = {
  panel: new Set(["powerW", "powerKW", "efficiencyPct", "tempCoeff", "annualDegradation", "voc", "isc", "vmp", "imp", "weightKg"]),
  inverter: new Set(["powerKW", "powerW", "maxAcPowerKW", "maxPvPowerKW", "maxEfficiencyPct", "mpptCount", "weightKg"]),
  battery: new Set(["capacityKWh", "capacityAh", "voltageV", "dodPct", "batteryEfficiencyPct", "cycles", "maxChargeCurrentA", "weightKg"]),
};
const relevantText: Record<string, Set<string>> = {
  panel: new Set(["dimensions"]),
  inverter: new Set(["dimensions", "voltageMPPT", "batteryVoltageRange"]),
  battery: new Set(["dimensions", "chemistry"]),
};
/** Fields a datasheet of each type almost always carries; if the model leaves one empty the user is told. */
const expectedFields: Record<string, [keyof ExtractedEquipmentVariant, string][]> = {
  panel: [["efficiencyPct", "eficiencia"], ["tempCoeff", "coeficiente de temperatura"], ["voc", "Voc"], ["vmp", "Vmp"], ["isc", "Isc"], ["imp", "Imp"], ["dimensions", "dimensiones"]],
  inverter: [["maxAcPowerKW", "potencia AC máxima"], ["maxPvPowerKW", "FV máxima"], ["maxEfficiencyPct", "eficiencia máxima"], ["mpptCount", "número de MPPT"], ["voltageMPPT", "rango MPPT"], ["dimensions", "dimensiones"]],
  battery: [["voltageV", "tensión nominal"], ["dodPct", "DoD"], ["cycles", "ciclos"], ["dimensions", "dimensiones"]],
};
const dimensionKeys = ["lengthMm", "widthMm", "heightMm"] as const;

const isPresent = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  (typeof value !== "string" || value.trim() !== "");

/** "2,465" (thousands comma) → 2465; "13,5" (decimal comma) → 13.5; "1,234.5" → 1234.5. */
function parseLocaleNumber(text: string) {
  const t = text.trim();
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  return Number(t.replace(",", "."));
}

function formatDimensions(a: number, b: number, c: number) {
  const f = (n: number) => String(Number(n.toFixed(2)));
  return `${f(a)} x ${f(b)} x ${f(c)} mm`;
}

/** "2465×1134×30 mm" / "2465 * 1134 * 30" → "2465 x 1134 x 30 mm" (the catalog format, in mm). */
function normalizeDimensionsText(text: string) {
  const match = text.match(
    /(\d+(?:[.,]\d+)*)\s*[x×*]\s*(\d+(?:[.,]\d+)*)\s*[x×*]\s*(\d+(?:[.,]\d+)*)\s*(mm|cm|m)?/i,
  );
  if (!match) return text.trim();
  const unitText = match[4]?.toLowerCase();
  const unit = unitText === "cm" ? 10 : unitText === "m" ? 1000 : 1;
  const [a, b, c] = [match[1], match[2], match[3]].map(
    (n) => parseLocaleNumber(n) * unit,
  );
  return formatDimensions(a, b, c);
}

/** Typical DC/AC ratio, deliberately conservative: a lower value only adds overload warnings, never hides them. */
export const ESTIMATED_DC_AC_RATIO = 1.3;

/**
 * Optional estimate of an inverter's maximum PV power (kW) when the datasheet does not publish it:
 * min(MPPT count × max current per MPPT × rated DC voltage, 1.3 × rated AC power), rounded to 0.1.
 * Deterministic and local; any missing input means no estimate.
 */
export function estimateMaxPvPowerKW(input: {
  powerKW?: number;
  mpptCount?: number;
  mpptMaxCurrentA?: number;
  dcRatedVoltageV?: number;
}): number | undefined {
  const { powerKW, mpptCount, mpptMaxCurrentA, dcRatedVoltageV } = input;
  const values = [powerKW, mpptCount, mpptMaxCurrentA, dcRatedVoltageV];
  if (!values.every((n) => n !== undefined && Number.isFinite(n) && n > 0))
    return undefined;
  const byInput = (mpptCount! * mpptMaxCurrentA! * dcRatedVoltageV!) / 1000;
  const byRatio = ESTIMATED_DC_AC_RATIO * powerKW!;
  return Math.round(Math.min(byInput, byRatio) * 10) / 10;
}

function dimensionNumbers(text: unknown): [number, number, number] | null {
  if (typeof text !== "string") return null;
  const normalized = normalizeDimensionsText(text);
  const match = normalized.match(/^(\d+(?:\.\d+)?) x (\d+(?:\.\d+)?) x (\d+(?:\.\d+)?) mm$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

const measure = (value: unknown) => {
  if (!isPresent(value)) return undefined;
  const n = typeof value === "string" ? parseLocaleNumber(value) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Length/width/height combine key by key: the variant's own measure wins, the rest comes from the family.
 * The family's text only stands in when the variant defines no measure, or when it holds the very same
 * numbers (it keeps the sheet's order; models often mislabel axes). It also completes missing axes.
 */
function combineDimensions(
  own: Record<string, unknown>,
  family: Record<string, unknown>,
): { text?: string; partial?: boolean } {
  if (isPresent(own.dimensions) && dimensionNumbers(own.dimensions))
    return { text: normalizeDimensionsText(String(own.dimensions)) };
  const familyNumbers = dimensionNumbers(family.dimensions);
  const ownMeasures = dimensionKeys.map((key) => measure(own[key]));
  if (ownMeasures.every((n) => n === undefined)) {
    if (familyNumbers) return { text: formatDimensions(...familyNumbers) };
    const fromFamily = dimensionKeys.map((key) => measure(family[key]));
    if (fromFamily.every((n) => n !== undefined))
      return { text: formatDimensions(fromFamily[0]!, fromFamily[1]!, fromFamily[2]!) };
    return { partial: fromFamily.some((n) => n !== undefined) };
  }
  const merged = dimensionKeys.map(
    (key, i) => ownMeasures[i] ?? measure(family[key]),
  );
  if (merged.every((n) => n !== undefined)) {
    const sorted = (list: number[]) => [...list].sort((a, b) => a - b).join(",");
    return {
      text:
        familyNumbers && sorted(familyNumbers) === sorted(merged as number[])
          ? formatDimensions(...familyNumbers)
          : formatDimensions(merged[0]!, merged[1]!, merged[2]!),
    };
  }
  if (familyNumbers) {
    // Fill the gaps with the family's numbers the variant did not already use.
    const pool = [...familyNumbers];
    for (const n of merged)
      if (n !== undefined) {
        const at = pool.indexOf(n);
        if (at >= 0) pool.splice(at, 1);
      }
    const missing = merged.filter((n) => n === undefined).length;
    if (pool.length === missing) {
      const filled = merged.map((n) => n ?? pool.shift()!);
      return { text: formatDimensions(filled[0], filled[1], filled[2]) };
    }
  }
  return { partial: true };
}

function missingFieldWarnings(
  equipmentType: string,
  variants: ExtractedEquipmentVariant[],
) {
  const notices: string[] = [];
  const tail = "complétalo a mano si la ficha lo trae";
  const common: string[] = [];
  const perVariant = new Map<string, string[]>();
  for (const [key, label] of expectedFields[equipmentType] || []) {
    const missing = variants.filter(
      (v) =>
        v[key] === undefined &&
        !(key === "maxPvPowerKW" && v.maxPvPowerEstimateKW !== undefined),
    );
    if (!missing.length) continue;
    if (missing.length === variants.length) common.push(label);
    else
      for (const v of missing) {
        const name = v.modelCode || v.displayName;
        perVariant.set(name, [...(perVariant.get(name) || []), label]);
      }
  }
  if (common.length)
    notices.push(
      `La IA no extrajo${variants.length > 1 ? " en ninguna variante" : ""}: ${common.join(", ")}; ${tail}.`,
    );
  for (const [name, labels] of perVariant)
    notices.push(`La IA no extrajo en ${name}: ${labels.join(", ")}; ${tail}.`);
  return notices;
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
            ? parseLocaleNumber(value)
            : Number(value);
        if (!Number.isFinite(n)) {
          discard(key, value);
          return undefined;
        }
        return n;
      };
      for (const key of numericFields) {
        if (!relevantNumeric[equipmentType].has(key)) continue;
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
        if (
          relevantText[equipmentType].has(key) &&
          key !== "dimensions" &&
          typeof v[key] === "string" &&
          v[key].trim()
        )
          result[key] = v[key].trim();
      const dimensions = combineDimensions(own, family);
      if (dimensions.text) result.dimensions = dimensions.text;
      else if (dimensions.partial)
        warnings.push(
          `Dimensiones incompletas de ${label}: faltan largo, ancho o alto.`,
        );
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
      if (equipmentType === "inverter") delete result.powerW;
      if (equipmentType === "panel") delete result.powerKW;
      if (equipmentType === "inverter" && result.maxPvPowerKW === undefined) {
        // Many sheets state the PV input as a percentage of the rated AC power (200 %, 150 %).
        // Runs after the W → kW conversion so a sheet that only gives watts still resolves.
        const pct = readNumber("maxPvPowerPct");
        const ac = result.powerKW ?? result.maxAcPowerKW;
        if (pct !== undefined && pct <= 0)
          warnings.push(
            `Se descartó maxPvPowerPct de ${label}: el porcentaje debe ser positivo (${pct}).`,
          );
        else if (pct !== undefined && ac !== undefined)
          result.maxPvPowerKW = Number(((ac * pct) / 100).toFixed(4));
        else if (pct !== undefined)
          warnings.push(
            `No se pudo calcular la FV máxima de ${label}: falta la potencia AC nominal.`,
          );
      }
      if (equipmentType === "inverter") {
        // Inputs for the optional estimate; they are not catalog fields.
        for (const key of ["mpptMaxCurrentA", "dcRatedVoltageV"] as const) {
          const n = readNumber(key);
          if (n === undefined) continue;
          if (n > 0) result[key] = n;
          else discard(key, v[key]);
        }
        if (result.maxPvPowerKW === undefined) {
          const estimate = estimateMaxPvPowerKW({
            powerKW: result.powerKW,
            mpptCount: result.mpptCount,
            mpptMaxCurrentA: result.mpptMaxCurrentA,
            dcRatedVoltageV: result.dcRatedVoltageV,
          });
          if (estimate !== undefined) result.maxPvPowerEstimateKW = estimate;
        }
      }
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
  warnings.push(...missingFieldWarnings(equipmentType, variants));
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
  // An accepted estimate is stored with its provenance; a published value clears an older mark.
  if (variant.maxPvPowerKW !== undefined)
    patch.maxPvPowerSource =
      variant.maxPvPowerSource === "estimated" ? "estimated" : undefined;
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
