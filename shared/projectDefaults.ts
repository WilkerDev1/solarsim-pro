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
