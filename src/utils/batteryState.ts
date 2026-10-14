import type { SystemSpecs } from '../types';

/** Enabling storage must commit the same positive quantity the editor displays. */
export function normalizeEnabledBatteries(specs: SystemSpecs): SystemSpecs {
  if (!specs.hasBattery) return specs;
  const count = (value: number | undefined) => Number.isFinite(value) && value! >= 1 ? Math.floor(value!) : 1;
  const batteries = specs.batteries?.map(item => ({ ...item, count: count(item.count) }));
  return { ...specs, batteryCount: batteries?.length ? batteries[0].count : count(specs.batteryCount), ...(batteries ? { batteries } : {}) };
}
