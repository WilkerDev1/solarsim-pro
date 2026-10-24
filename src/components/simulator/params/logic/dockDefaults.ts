/**
 * Valores por defecto que el dock de parámetros muestra cuando el proyecto no trae dato propio.
 * Son solo de presentación: no cambian el proyecto guardado ni los cálculos. Los precios unitarios
 * por modelo NO se muestran por defecto: un grupo sin precio se ve «sin precio» porque el motor cuenta 0 (`DEFAULT_UNIT_PRICE_USD`
 * solo rellena proyectos antiguos sin grupos, en `shared/equipment`, y el motor lee el mismo valor).
 * Los que comparten motor y dock (DOD, eficiencia de batería, tasa, multiplicador, mano de obra, marcadores
 * de ejemplo y marcas del modo Manual) viven en `shared/projectDefaults.ts` y se re-exportan aquí.
 */
export {
  BATTERY_PCT_RANGE,
  DEFAULT_BATTERY_DOD_PCT,
  DEFAULT_BATTERY_EFFICIENCY_PCT,
  DEFAULT_BATTERY_CAPACITY_KWH,
  DEFAULT_DETAILED_SYSTEM_LOSSES_PCT,
  DEFAULT_DOP_RATE,
  DEFAULT_GRID_EXPORT_FEE_PCT,
  DEFAULT_TARGET_COVERAGE_PCT,
  DEFAULT_SYSTEM_LOSSES_PCT,
  resolveSystemLossesPct,
  DEFAULT_INSTALLATION_USD_PER_KWP,
  DEFAULT_PRICE_PER_WATT_USD,
  DEFAULT_SALE_MARGIN_MULTIPLIER,
  MANUAL_BRAND_PLACEHOLDER,
  SAMPLE_PHONE_MARKER,
  SAMPLE_QUOTE_NUMBER,
  isValidDirectPrice,
  resolveBatteryBankDodPct,
  resolveBatteryBankEfficiencyPct,
  resolveBatteryDodPct,
  resolveBatteryEfficiencyPct,
  resolveDopRate,
  resolvePrimaryBatteryDodPct,
  resolvePrimaryBatteryEfficiencyPct,
  resolvePricePerWattUSD,
  resolveSaleMarginMultiplier,
} from '../../../../../shared/projectDefaults';

// ── Marcadores de ejemplo (vienen de `BENCHMARK_PROJECT`, `src/engine/referenceCase.ts`) ──
/** Coordenadas de ejemplo (Santo Domingo) para el modo GPS sin coordenadas. */
export const SAMPLE_GPS_COORDINATES = '18.4861, -69.9312';

// ── Tarifas ──
/** Consumo mensual (kWh) usado para la tarifa de referencia si el proyecto no tiene meses. */
export const DEFAULT_MONTHLY_CONSUMPTION_KWH = 900;

// ── Equipamiento ──
/** Valores que toma un panel del catálogo al que le faltan datos (`||`). */
export const DEFAULT_CATALOG_PANEL = { powerW: 550, efficiencyPct: 22, tempCoeff: -0.29, annualDegradation: 0.4 } as const;
/** Potencia (kW) de un inversor del catálogo sin potencia (`||`). */
export const DEFAULT_CATALOG_INVERTER_KW = 8;

