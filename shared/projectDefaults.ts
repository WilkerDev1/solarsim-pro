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

// ── Tarifas ──
/** Cobertura objetivo (%) cuando la tarifa no la define. */
export const DEFAULT_TARGET_COVERAGE_PCT = 95;
/** Retención de exportación SIE (%) cuando la tarifa no la define. */
export const DEFAULT_GRID_EXPORT_FEE_PCT = 25;

// ── Sistema ──
/** Pérdidas del sistema (%) cuando el proyecto no las define. */
export const DEFAULT_SYSTEM_LOSSES_PCT = 25;
/** Pérdidas (%) que el motor asume en modo detallado cuando el proyecto no las define (otro concepto: modelo de pérdidas desglosado). */
export const DEFAULT_DETAILED_SYSTEM_LOSSES_PCT = 14;
/** Capacidad (kWh) de una batería sin capacidad. */
export const DEFAULT_BATTERY_CAPACITY_KWH = 16.08;
/** Pérdidas efectivas (%): las del proyecto (un 0 explícito se conserva); si faltan, 14 en modo detallado y 25 en simple. */
export const resolveSystemLossesPct = (specs: { systemLosses?: number | null; isDetailed?: boolean }): number =>
  specs.systemLosses !== undefined && specs.systemLosses !== null ? specs.systemLosses : specs.isDetailed ? DEFAULT_DETAILED_SYSTEM_LOSSES_PCT : DEFAULT_SYSTEM_LOSSES_PCT;

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

/** Porcentaje válido para DOD y eficiencia: finito y dentro de `BATTERY_PCT_RANGE` (1-100). */
const isPercent = (value: number | undefined | null): value is number => typeof value === 'number' && Number.isFinite(value) && value >= BATTERY_PCT_RANGE.min && value <= BATTERY_PCT_RANGE.max;

/** Número finito y > 0: la regla común de «dato válido» para tasa, multiplicador, DOD y eficiencia. */
const isPositive = (value: number | undefined | null): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Tasa a usar: la del proyecto si es > 0; si no, el default. La usan la vista y el cálculo. */
export const resolveDopRate = (rate: number | undefined | null): number => (isPositive(rate) ? rate : DEFAULT_DOP_RATE);
/** Multiplicador de venta a usar: el del proyecto si es > 0; si no, el default. */
export const resolveSaleMarginMultiplier = (multiplier: number | undefined | null): number => (isPositive(multiplier) ? multiplier : DEFAULT_SALE_MARGIN_MULTIPLIER);
/** DOD (%) a usar: el del proyecto si está en 1-100; si no, el default. */
export const resolveBatteryDodPct = (dod: number | undefined | null): number => (isPercent(dod) ? dod : DEFAULT_BATTERY_DOD_PCT);
/** Eficiencia de batería (%) a usar: la del proyecto si está en 1-100; si no, el default. */
export const resolveBatteryEfficiencyPct = (efficiency: number | undefined | null): number => (isPercent(efficiency) ? efficiency : DEFAULT_BATTERY_EFFICIENCY_PCT);
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

