import assert from 'node:assert/strict';
import type { BatteryItemSpec, InverterItemSpec, LegacyProjectSpecs, PanelItemSpec, SystemSpecs } from '../types';
import type {
  BatteryItemSpec as SharedBattery, EquipmentSpecs, InverterItemSpec as SharedInverter, LegacyEquipmentFields, LegacySystemSpecs, PanelItemSpec as SharedPanel,
} from '../../shared/equipment';
import { migrateLegacySpecs } from '../../shared/equipment';

// `shared/equipment` declara sus propios tipos para que la API (NodeNext) lo compile sin importar el renderer.
// Estas comprobaciones son de tipos: si los dos lados divergen, `npm run lint` deja de compilar.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const parity = {
  panel: true as Same<PanelItemSpec, SharedPanel>,
  inverter: true as Same<InverterItemSpec, SharedInverter>,
  battery: true as Same<BatteryItemSpec, SharedBattery>,
  // El renderer pasa sus SystemSpecs completas y recibe el mismo tipo.
  specs: true as SystemSpecs extends EquipmentSpecs ? true : false,
  // Los datos viejos (con espejo) también son propuestas válidas para leer y migrar.
  legacySpecs: true as LegacyProjectSpecs extends LegacySystemSpecs ? true : false,
  // Oleada 5: `SystemSpecs` ya no declara ningún campo del espejo heredado; si alguien lo vuelve a añadir, `npm run lint` falla aquí.
  noMirrorInSystemSpecs: true as [Extract<keyof SystemSpecs, keyof LegacyEquipmentFields>] extends [never] ? true : false,
};
const mirror = { isDetailed: false } as SystemSpecs;
const migrated: SystemSpecs = migrateLegacySpecs(mirror);

assert.deepEqual(Object.values(parity), [true, true, true, true, true, true]);
assert.equal(migrated.isDetailed, false, 'el genérico conserva el tipo de entrada');
console.log('PASS: los tipos de shared/equipment coinciden con los del renderer.');
