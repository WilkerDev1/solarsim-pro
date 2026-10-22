/**
 * Valores por defecto que el dock de parámetros muestra cuando el proyecto no trae dato propio.
 * Son solo de presentación: no cambian el proyecto guardado ni los cálculos. Los precios unitarios
 * por modelo salen de `DEFAULT_UNIT_PRICE_USD` (`src/utils/equipmentGroups.ts`), que también usa el motor.
 * Los que comparten motor y dock (DOD, eficiencia de batería, tasa, multiplicador, mano de obra, marcadores
 * de ejemplo y marcas del modo Manual) viven en `shared/projectDefaults.ts` y se re-exportan aquí.
 */
export {
  BATTERY_PCT_RANGE,
  DEFAULT_BATTERY_DOD_PCT,
  DEFAULT_BATTERY_EFFICIENCY_PCT,
  DEFAULT_DOP_RATE,
  DEFAULT_INSTALLATION_USD_PER_KWP,
  DEFAULT_PRICE_PER_WATT_USD,
  DEFAULT_SALE_MARGIN_MULTIPLIER,
  MANUAL_BRAND_PLACEHOLDER,
  SAMPLE_PHONE_MARKER,
  SAMPLE_QUOTE_NUMBER,
  isValidDirectPrice,
  resolveBatteryDodPct,
  resolveBatteryEfficiencyPct,
  resolveDopRate,
  resolvePricePerWattUSD,
  resolveSaleMarginMultiplier,
} from '../../../../../shared/projectDefaults';

// ── Marcadores de ejemplo (vienen de `BENCHMARK_PROJECT`, `src/engine/referenceCase.ts`) ──
/** Coordenadas de ejemplo (Santo Domingo) para el modo GPS sin coordenadas. */
export const SAMPLE_GPS_COORDINATES = '18.4861, -69.9312';

// ── Tarifas ──
/** Cobertura objetivo (%) cuando la tarifa no la define (`??`: un 0 explícito se conserva). */
export const DEFAULT_TARGET_COVERAGE_PCT = 95;
/** Retención de exportación SIE (%) cuando la tarifa no la define (`??`: un 0 explícito se conserva). */
export const DEFAULT_GRID_EXPORT_FEE_PCT = 25;
/** Consumo mensual (kWh) usado para la tarifa de referencia si el proyecto no tiene meses. */
export const DEFAULT_MONTHLY_CONSUMPTION_KWH = 900;

// ── Equipamiento ──
/** Pérdidas del sistema (%) cuando el proyecto no las define (`??`). */
export const DEFAULT_SYSTEM_LOSSES_PCT = 25;
/** Capacidad (kWh) de una batería del catálogo sin capacidad (`||`). */
export const DEFAULT_BATTERY_CAPACITY_KWH = 16.08;
/** Valores que toma un panel del catálogo al que le faltan datos (`||`). */
export const DEFAULT_CATALOG_PANEL = { powerW: 550, efficiencyPct: 22, tempCoeff: -0.29, annualDegradation: 0.4 } as const;
/** Potencia (kW) de un inversor del catálogo sin potencia (`||`). */
export const DEFAULT_CATALOG_INVERTER_KW = 8;

