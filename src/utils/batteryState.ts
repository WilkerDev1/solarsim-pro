import type { SystemSpecs } from '../types';
import { migrateLegacySpecs, readEquipment } from '../../shared/equipment';

/** Enabling storage must commit the same positive quantity the editor displays (en los grupos, nunca en el espejo). */
export function normalizeEnabledBatteries(specs: SystemSpecs): SystemSpecs {
  if (!specs.hasBattery) return specs;
  const count = (value: number | undefined) => Number.isFinite(value) && value! >= 1 ? Math.floor(value!) : 1;
  const migrated = migrateLegacySpecs(specs);
  const batteries = readEquipment(migrated).batteries;
  const fixed = batteries.map((item) => (item.count === count(item.count) ? item : { ...item, count: count(item.count) }));
  return fixed.every((item, index) => item === batteries[index]) ? migrated : { ...migrated, batteries: fixed };
}
