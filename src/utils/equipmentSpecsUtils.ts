import { SystemSpecs, PanelItemSpec, InverterItemSpec, BatteryItemSpec } from '../types';
import { equipmentTotals, readEquipment } from '../../shared/equipment';

/**
 * Lectores de equipos del cliente: todos pasan por `shared/equipment` (`readEquipment`, `equipmentTotals`), el único
 * lugar que conoce el espejo heredado. Con grupos guardados se devuelven tal cual; sin ellos se derivan de los
 * campos heredados (datos viejos o enlaces publicados). Con `hasBattery` falso no hay baterías.
 */
export const getProjectPanels = (specs: SystemSpecs): PanelItemSpec[] => readEquipment(specs).panels;
export const getProjectInverters = (specs: SystemSpecs): InverterItemSpec[] => readEquipment(specs).inverters;
export const getProjectBatteries = (specs: SystemSpecs): BatteryItemSpec[] => readEquipment(specs).batteries;

const totalsOf = (specs: SystemSpecs) => equipmentTotals(readEquipment(specs));

/** Potencia DC pico (kWp) de todos los modelos de panel. */
export const calculateTotalDCCapacityKWp = (specs: SystemSpecs): number => totalsOf(specs).capacityKWp;
/** Cantidad total de paneles. */
export const calculateTotalPanelCount = (specs: SystemSpecs): number => totalsOf(specs).panelCount;
/** Potencia nominal total de inversores (kW). */
export const calculateTotalInverterPowerKW = (specs: SystemSpecs): number => totalsOf(specs).inverterKW;
/** Cantidad total de inversores. */
export const calculateTotalInverterCount = (specs: SystemSpecs): number => totalsOf(specs).inverterCount;
/** Capacidad nominal total del banco (kWh); 0 sin batería. No es energía útil. */
export const calculateTotalBatteryCapacityKWh = (specs: SystemSpecs): number => totalsOf(specs).batteryNominalKWh;
/** Cantidad total de baterías; 0 sin batería. */
export const calculateTotalBatteryCount = (specs: SystemSpecs): number => totalsOf(specs).batteryCount;

/**
 * Banco de baterías para `resolveBatteryBank*` (`shared/projectDefaults`): DOD y eficiencia salen solo de los grupos.
 * Los escalares son los del primer grupo y únicamente cuentan si la capacidad total del banco es 0.
 */
export function batteryBankSpecs(specs: SystemSpecs): { batteries: BatteryItemSpec[]; batteryDOD?: number; batteryEfficiencyPct?: number } {
  const batteries = readEquipment(specs).batteries;
  return { batteries, batteryDOD: batteries[0]?.dodPct, batteryEfficiencyPct: batteries[0]?.efficiencyPct };
}

/**
 * Formats a natural language technical summary of inverters.
 * Example: "2 Inversores Luxpower 10k y 2 Inversores Luxpower 5k"
 */
export function formatInvertersSummary(specs: SystemSpecs): string {
  const inverters = getProjectInverters(specs);
  if (inverters.length === 0) return 'Inversor Solar';
  return inverters
    .map((inv) => {
      const brand = inv.brandModel || `${inv.powerKW} kW`;
      const prefix = brand.toLowerCase().startsWith('inversor') ? '' : 'Inversor ';
      const unit = inv.count === 1 ? 'Inversor' : 'Inversores';
      const cleanBrand = brand.replace(/^inversor(?:es)?\s+/i, '').trim();
      return `${inv.count} ${inv.count === 1 ? 'Inversor' : 'Inversores'} ${cleanBrand}`;
    })
    .join(' y ');
}

/**
 * Formats a natural language technical summary of panels.
 * Example: "24 Módulos JA Solar 630W y 10 Módulos Canadian Solar 600W"
 */
export function formatPanelsSummary(specs: SystemSpecs): string {
  const panels = getProjectPanels(specs);
  if (panels.length === 0) return 'Módulos Solares Fotovoltaicos';
  return panels
    .map((p) => {
      const cleanBrand = (p.brandModel || `${p.powerW}W`).replace(/^m[oó]dulos?\s+/i, '').trim();
      return `${p.count} ${p.count === 1 ? 'Módulo' : 'Módulos'} ${cleanBrand}`;
    })
    .join(' y ');
}

/**
 * Formats a natural language technical summary of batteries.
 * Example: "1 Batería Hinaess 16.08 kWh y 2 Baterías Hinaess 5.12 kWh"
 */
export function formatBatteriesSummary(specs: SystemSpecs): string {
  if (!specs.hasBattery) return '';
  const batteries = getProjectBatteries(specs);
  if (batteries.length === 0) return '';
  return batteries
    .map((b) => {
      const cleanBrand = (b.brandModel || `${b.capacityKWh} kWh`).replace(/^bater[ií]as?\s+/i, '').trim();
      return `${b.count} ${b.count === 1 ? 'Batería' : 'Baterías'} ${cleanBrand}`;
    })
    .join(' y ');
}
