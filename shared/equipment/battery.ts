import { resolveBatteryDodPct, resolveBatteryEfficiencyPct } from '../projectDefaults.js';
import { equipmentTotals } from './summary.js';
import type { BatteryItemSpec, Equipment } from './types.js';

/**
 * Banco de baterías (ADR 0002): ÚNICO lugar donde se calcula la energía útil y la autonomía. Los motores y las
 * vistas leen este resultado; nadie más multiplica capacidad × DOD × eficiencia.
 */
export interface BatteryBank {
  /** `true` si el banco tiene capacidad nominal > 0. Un banco de 0 kWh no almacena aunque «Sí batería» esté activo. */
  hasStorage: boolean;
  /** Capacidad nominal (kWh), a 2 decimales: la misma de `equipmentTotals(...).batteryNominalKWh`. */
  nominalKWh: number;
  /** DOD del banco (%): promedio de los grupos ponderado por su capacidad total (`capacidad × cantidad`). */
  dodPct: number;
  /** Eficiencia del banco (%): ponderada por capacidad × DOD de cada grupo, de modo que `nominal × DOD × η` = Σ(Cᵢ·DODᵢ·ηᵢ). */
  efficiencyPct: number;
  /** Energía útil por ciclo (kWh), sin redondear; 0 sin almacenamiento. */
  usableKWh: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Banco de baterías de un `Equipment`. No necesita el interruptor «Sí batería»: `readEquipment` ya entrega
 * `batteries: []` cuando `hasBattery` es falso, y un banco vacío no almacena.
 *
 * Cada grupo aporta su DOD y su eficiencia (un dato ausente o fuera de 1-100 usa el default de 90 %). Los grupos
 * sin capacidad no pesan. Un banco sin capacidad informa el DOD y la eficiencia del primer grupo (o los defaults).
 */
export function batteryBank(equipment: Equipment): BatteryBank {
  const groups: BatteryItemSpec[] = equipment.batteries;
  const nominalKWh = equipmentTotals(equipment).batteryNominalKWh;
  let dodWeighted = 0;
  let capacityTotal = 0;
  let efficiencyWeighted = 0;
  let efficiencyWeight = 0;
  for (const group of groups) {
    const capacity = (Number(group?.capacityKWh) || 0) * (Number(group?.count) || 0);
    if (!(capacity > 0)) continue;
    const dod = resolveBatteryDodPct(group.dodPct);
    const efficiency = resolveBatteryEfficiencyPct(group.efficiencyPct);
    dodWeighted += capacity * dod;
    capacityTotal += capacity;
    efficiencyWeighted += capacity * dod * efficiency;
    efficiencyWeight += capacity * dod;
  }
  const dodPct = capacityTotal > 0 ? dodWeighted / capacityTotal : resolveBatteryDodPct(groups[0]?.dodPct);
  const efficiencyPct = efficiencyWeight > 0 ? efficiencyWeighted / efficiencyWeight : resolveBatteryEfficiencyPct(groups[0]?.efficiencyPct);
  const hasStorage = nominalKWh > 0;
  return { hasStorage, nominalKWh, dodPct, efficiencyPct, usableKWh: hasStorage ? nominalKWh * (dodPct / 100) * (efficiencyPct / 100) : 0 };
}

/**
 * Horas que el banco sostiene una carga diaria promedio (kWh/día): energía útil (a 0,1 kWh) ÷ carga horaria, a 0,1 h.
 * Sin almacenamiento o sin carga, 0.
 */
export function batteryAutonomyHours(bank: BatteryBank, dailyLoadKWh: number): number {
  const hourlyLoadKW = dailyLoadKWh / 24;
  if (!bank.hasStorage || !(hourlyLoadKW > 0)) return 0;
  return round1(round1(bank.usableKWh) / hourlyLoadKW);
}
