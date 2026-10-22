/**
 * Valores por defecto que el dock de parámetros muestra cuando el proyecto no trae dato propio.
 * Son solo de presentación: no cambian el proyecto guardado ni los cálculos. Los precios unitarios
 * por modelo salen de `DEFAULT_UNIT_PRICE_USD` (`src/utils/equipmentGroups.ts`), que también usa el motor.
 * Ojo: varios usan `||`, así que un 0 se muestra como el valor por defecto (ver cada comentario).
 */

// ── Marcadores de ejemplo (vienen de `BENCHMARK_PROJECT`, `src/engine/referenceCase.ts`) ──
/** Número de cotización de ejemplo que se muestra si el proyecto no tiene uno. */
export const SAMPLE_QUOTE_NUMBER = 'C-0030';
/** Fragmento del teléfono de ejemplo del caso de referencia: si lo contiene, el campo se muestra vacío. */
export const SAMPLE_PHONE_MARKER = '555-0199';
/** Coordenadas de ejemplo (Santo Domingo) para el modo GPS sin coordenadas. */
export const SAMPLE_GPS_COORDINATES = '18.4861, -69.9312';

// ── Tarifas ──
/** Cobertura objetivo (%) cuando la tarifa no la define (`??`: un 0 explícito se conserva). */
export const DEFAULT_TARGET_COVERAGE_PCT = 95;
/** Retención de exportación SIE (%) cuando la tarifa no la define (`??`: un 0 explícito se conserva). */
export const DEFAULT_GRID_EXPORT_FEE_PCT = 25;
/** Consumo mensual (kWh) usado para la tarifa de referencia si el proyecto no tiene meses. */
export const DEFAULT_MONTHLY_CONSUMPTION_KWH = 900;
/** Tasa RD$ por US$ cuando falta o es 0 (`||`). */
export const DEFAULT_DOP_RATE = 60;

// ── Equipamiento ──
/** Pérdidas del sistema (%) cuando el proyecto no las define (`??`). */
export const DEFAULT_SYSTEM_LOSSES_PCT = 25;
/** Profundidad de descarga (%) cuando falta o es 0 (`||`). */
export const DEFAULT_BATTERY_DOD_PCT = 90;
/** Eficiencia de la batería (%) cuando falta o es 0 (`||`). */
export const DEFAULT_BATTERY_EFFICIENCY_PCT = 95;
/** Eficiencia (%) que la vista previa de autoconsumo asume si falta (`!== undefined`); es 90, no 95 como en el campo de la batería. Refleja el motor (`solarEngine`). */
export const PREVIEW_BATTERY_EFFICIENCY_PCT = 90;
/** Capacidad (kWh) de una batería del catálogo sin capacidad (`||`). */
export const DEFAULT_BATTERY_CAPACITY_KWH = 16.08;
/** Valores que toma un panel del catálogo al que le faltan datos (`||`). */
export const DEFAULT_CATALOG_PANEL = { powerW: 550, efficiencyPct: 22, tempCoeff: -0.29, annualDegradation: 0.4 } as const;
/** Potencia (kW) de un inversor del catálogo sin potencia (`||`). */
export const DEFAULT_CATALOG_INVERTER_KW = 8;
/** Marca y modelo que muestra el modelo principal sin nombre en modo Manual. */
export const MANUAL_BRAND_PLACEHOLDER = {
  panel: 'Módulos Canadian Solar CS6.1-72TB-600 (600W)',
  inverter: 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)',
  battery: 'Batería Hinaess 16 KwH-48 vdc.',
} as const;

// ── Costos y margen ──
/** Multiplicador de venta (1.25 = 25 % de margen) cuando falta o es 0 (`||`). */
export const DEFAULT_SALE_MARGIN_MULTIPLIER = 1.25;
/** Precio directo por Wp (US$) cuando no hay uno propio. */
export const DEFAULT_PRICE_PER_WATT_USD = 1.15;
/** Mano de obra (US$ por kWp) cuando el proyecto no la define (`!== undefined`: un 0 explícito se conserva). */
export const DEFAULT_INSTALLATION_USD_PER_KWP = 170;
/** Costo por Wp (US$) del resumen cuando la matriz no lo trae o es 0 (`||`). */
export const FALLBACK_COST_PER_WP_USD = 0.86;
/** Venta por Wp (US$) del resumen cuando la matriz no la trae o es 0. */
export const FALLBACK_SALE_PER_WP_USD = 1.08;
