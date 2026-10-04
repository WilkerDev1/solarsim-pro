export function equipmentItem(
  row: Record<string, any>,
  organizationId: string,
) {
  const own = row.organization_id === organizationId;
  const details = { ...(row.details ?? {}) };
  if (!own) {
    delete details.supplierPrices;
    delete details.preferredSupplierId;
  }
  const numeric = (value: unknown) =>
    value == null ? undefined : Number(value);
  return {
    ...details,
    id: row.id,
    organizationId: row.organization_id,
    version: row.version,
    baseVersion: row.version,
    type: row.type,
    brand: row.brand,
    modelSeries: row.model_series,
    displayName: row.display_name,
    powerW: numeric(row.power_w),
    powerKW: numeric(row.power_kw),
    capacityKWh: numeric(row.capacity_kwh),
    voltageV: numeric(row.voltage_v),
    dodPct: numeric(row.dod_pct),
    efficiencyPct: numeric(row.efficiency_pct),
    tempCoeff: numeric(row.temp_coeff),
    category: row.category,
    voltageMPPT: row.voltage_mppt,
    supplierPrices:
      own && Array.isArray(row.supplier_prices) ? row.supplier_prices : [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
export const EQUIPMENT_DETAIL_KEYS = [
  "voc",
  "isc",
  "vmp",
  "imp",
  "annualDegradation",
  "cellType",
  "bifacialityPct",
  "maxAcPowerKW",
  "maxPvPowerKW",
  "maxEfficiencyPct",
  "mpptCount",
  "capacityAh",
  "batteryEfficiencyPct",
  "cycles",
  "chemistry",
  "maxChargeCurrentA",
  "maxDischargeCurrentA",
  "dimensions",
  "weightKg",
  "isCustom",
  "preferredSupplierId",
] as const;
