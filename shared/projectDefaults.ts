/**
 * Valores por defecto de proyecto compartidos por el motor (`src/engine`), el store y la interfaz.
 * Módulo neutral: TypeScript puro, sin dependencias. Cualquier default que el motor y el dock
 * deban ver igual vive aquí; `dockDefaults.ts` lo re-exporta para la interfaz.
 */

// ── Batería ──
/** Profundidad de descarga (%) cuando el proyecto no la define o no es válida (≤ 0). */
export const DEFAULT_BATTERY_DOD_PCT = 90;
/** Eficiencia de la batería (%) cuando el proyecto no la define o no es válida (≤ 0). Es la del motor de energía. */
export const DEFAULT_BATTERY_EFFICIENCY_PCT = 90;
/** Rango válido de DOD y eficiencia (%) al editarlos. */
export const BATTERY_PCT_RANGE = { min: 1, max: 100 } as const;

// ── Costos y margen ──
/** Tasa RD$ por US$ cuando falta o no es válida (≤ 0). */
export const DEFAULT_DOP_RATE = 60;
/** Multiplicador de venta (1.25 = 25 % de margen) cuando falta o no es válido (≤ 0). */
export const DEFAULT_SALE_MARGIN_MULTIPLIER = 1.25;
/** Mano de obra (US$ por kWp) cuando el proyecto no la define (`!== undefined`: un 0 explícito se conserva). */
export const DEFAULT_INSTALLATION_USD_PER_KWP = 170;

/** Precio directo por Wp (US$) cuando el proyecto no trae uno válido (> 0). Es el del motor (`financeEngine`), que determina los totales. */
export const DEFAULT_PRICE_PER_WATT_USD = 1.13;

// ── Marcadores de ejemplo (vienen de `BENCHMARK_PROJECT`, `src/engine/referenceCase.ts`) ──
/** Número de cotización de ejemplo que se muestra si el proyecto no tiene uno. */
export const SAMPLE_QUOTE_NUMBER = 'C-0030';
/** Fragmento del teléfono de ejemplo del caso de referencia: si lo contiene, el campo se muestra vacío. */
export const SAMPLE_PHONE_MARKER = '555-0199';
/** Marca y modelo que muestra el modelo principal sin nombre en modo Manual. */
export const MANUAL_BRAND_PLACEHOLDER = {
  panel: 'Módulos Canadian Solar CS6.1-72TB-600 (600W)',
  inverter: 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)',
  battery: 'Batería Hinaess 16 KwH-48 vdc.',
} as const;

/** Marca que imprime la cotización para un grupo de paneles sin nombre (distinta del marcador del modo Manual del dock). */
export const QUOTATION_PANEL_BRAND_FALLBACK = 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)';

/** Número finito y > 0: la regla común de «dato válido» para tasa, multiplicador, DOD y eficiencia. */
const isPositive = (value: number | undefined | null): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Tasa a usar: la del proyecto si es > 0; si no, el default. La usan la vista y el cálculo. */
export const resolveDopRate = (rate: number | undefined | null): number => (isPositive(rate) ? rate : DEFAULT_DOP_RATE);
/** Multiplicador de venta a usar: el del proyecto si es > 0; si no, el default. */
export const resolveSaleMarginMultiplier = (multiplier: number | undefined | null): number => (isPositive(multiplier) ? multiplier : DEFAULT_SALE_MARGIN_MULTIPLIER);
/** DOD (%) a usar: el del proyecto si es > 0; si no, el default. */
export const resolveBatteryDodPct = (dod: number | undefined | null): number => (isPositive(dod) ? dod : DEFAULT_BATTERY_DOD_PCT);
/** Eficiencia de batería (%) a usar: la del proyecto si es > 0; si no, el default. */
export const resolveBatteryEfficiencyPct = (efficiency: number | undefined | null): number => (isPositive(efficiency) ? efficiency : DEFAULT_BATTERY_EFFICIENCY_PCT);
/** `true` si el precio directo ($/Wp o $/kWp) es utilizable: finito y > 0, como exige el motor. */
export const isValidDirectPrice = (price: number | undefined | null): price is number => isPositive(price);
/**
 * Precio directo por Wp (US$) efectivo: el del proyecto si es > 0; si no, el de `financials` si es > 0;
 * si no, el default. Es la cadena del motor y la de la vista del dock, para que nunca diverjan.
 */
export const resolvePricePerWattUSD = (
  specs: { pricePerWattUSD?: number | null } | undefined,
  financials?: { pricePerWattUSD?: number | null } | undefined,
): number => (isPositive(specs?.pricePerWattUSD) ? specs.pricePerWattUSD : isPositive(financials?.pricePerWattUSD) ? financials.pricePerWattUSD : DEFAULT_PRICE_PER_WATT_USD);

// ── Banco de baterías ──
interface BankGroup { capacityKWh?: number; count?: number; dodPct?: number | null; efficiencyPct?: number | null }
interface BankSpecs {
  batteries?: BankGroup[];
  batteryDOD?: number | null;
  batteryEfficiencyPct?: number | null;
}

/** Valor de un grupo: el propio si es válido; el primero hereda antes el escalar del proyecto (espejo del primer grupo); el resto, el default. */
function groupPct(specs: BankSpecs, index: number, field: 'dodPct' | 'efficiencyPct'): number {
  const own = specs.batteries?.[index]?.[field];
  if (isPositive(own)) return own;
  if (field === 'dodPct') return index === 0 ? resolveBatteryDodPct(specs.batteryDOD) : DEFAULT_BATTERY_DOD_PCT;
  return index === 0 ? resolveBatteryEfficiencyPct(specs.batteryEfficiencyPct) : DEFAULT_BATTERY_EFFICIENCY_PCT;
}

/**
 * Promedio ponderado del banco. El DOD pesa por capacidad total del grupo (`capacityKWh × count`); la eficiencia pesa por
 * esa capacidad × el DOD del grupo, de modo que `total × DOD × η` conserva la energía útil Σ(Cᵢ·DOD ᵢ·ηᵢ) (con el mismo DOD
 * en todos los grupos es el promedio ponderado por capacidad). Sin grupos o con capacidad total 0 se usa el escalar del proyecto.
 */
function weightedBankPct(specs: BankSpecs, field: 'dodPct' | 'efficiencyPct', scalar: number): number {
  const groups = Array.isArray(specs.batteries) ? specs.batteries : [];
  let weighted = 0;
  let total = 0;
  groups.forEach((group, index) => {
    const capacity = (Number(group?.capacityKWh) || 0) * (Number(group?.count) || 0);
    if (!(capacity > 0)) return;
    const weight = field === 'efficiencyPct' ? capacity * groupPct(specs, index, 'dodPct') : capacity;
    weighted += weight * groupPct(specs, index, field);
    total += weight;
  });
  return total > 0 ? weighted / total : scalar;
}

/** Eficiencia (%) del banco: promedio ponderado de la de cada grupo. Un solo modelo: la suya. */
export const resolveBatteryBankEfficiencyPct = (specs: BankSpecs): number =>
  weightedBankPct(specs, 'efficiencyPct', resolveBatteryEfficiencyPct(specs.batteryEfficiencyPct));
/** DOD (%) del banco: promedio ponderado por capacidad del de cada grupo. */
export const resolveBatteryBankDodPct = (specs: BankSpecs): number =>
  weightedBankPct(specs, 'dodPct', resolveBatteryDodPct(specs.batteryDOD));

/** Eficiencia (%) que ve el dock para la batería principal: la del primer grupo si es válida; si no, la del proyecto. */
export const resolvePrimaryBatteryEfficiencyPct = (specs: BankSpecs): number =>
  resolveBatteryEfficiencyPct(isPositive(specs.batteries?.[0]?.efficiencyPct) ? specs.batteries?.[0]?.efficiencyPct : specs.batteryEfficiencyPct);
/** DOD (%) que ve el dock para la batería principal: el del primer grupo si es válido; si no, el del proyecto. */
export const resolvePrimaryBatteryDodPct = (specs: BankSpecs): number =>
  resolveBatteryDodPct(isPositive(specs.batteries?.[0]?.dodPct) ? specs.batteries?.[0]?.dodPct : specs.batteryDOD);
