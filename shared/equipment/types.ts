/**
 * Tipos propios del módulo (TypeScript puro): la API los compila con `NodeNext` y no puede importar los tipos del
 * renderer. Son copias estructurales de `PanelItemSpec`/`InverterItemSpec`/`BatteryItemSpec` y del subconjunto de
 * `SystemSpecs` que este módulo lee o escribe; `src/tests/testEquipmentTypeParity.ts` falla al compilar si divergen.
 */
interface SupplierInfo {
  supplierName: string;
  priceUSD: number;
  updatedAt?: string;
  supplierPriceId?: string;
}

interface ItemSpecBase {
  priceSource?: 'manual' | 'supplier';
  requestedModel?: string;
  id: string;
  catalogItemId?: string;
  manualModel?: boolean;
  brandModel: string;
  count: number;
  unitPriceUSD?: number;
  weightKilos?: number;
  efficiencyPct?: number;
  selectedSupplierInfo?: SupplierInfo;
}

export interface PanelItemSpec extends ItemSpecBase {
  powerW: number;
  tempCoeff?: number;
  annualDegradation?: number;
}

export interface InverterItemSpec extends ItemSpecBase {
  powerKW: number;
}

export interface BatteryItemSpec extends ItemSpecBase {
  capacityKWh: number;
  dodPct?: number;
  lifespanYears?: number;
  replacementCostUSD?: number;
}

/** Campos de `SystemSpecs` que lee o escribe este módulo: los grupos y el espejo heredado. */
export interface EquipmentSpecs {
  hasBattery?: boolean;
  panels?: PanelItemSpec[];
  inverters?: InverterItemSpec[];
  batteries?: BatteryItemSpec[];
  panelBrandModel?: string;
  panelPowerW?: number;
  panelCount?: number;
  panelUnitPriceUSD?: number;
  panelWeightKilos?: number;
  panelEfficiency?: number;
  tempCoeff?: number;
  annualDegradation?: number;
  inverterBrandModel?: string;
  inverterPowerKW?: number;
  inverterCount?: number;
  inverterUnitPriceUSD?: number;
  inverterWeightKilos?: number;
  inverterEfficiencyPct?: number;
  batteryBrandModel?: string;
  batteryCapacityKWh?: number;
  batteryCount?: number;
  batteryUnitPriceUSD?: number;
  batteryWeightKilos?: number;
  batteryDOD?: number;
  batteryEfficiencyPct?: number;
  batteryLifespanYears?: number;
  batteryReplacementCostUSD?: number;
  selectedSupplierInfo?: { panel?: SupplierInfo; inverter?: SupplierInfo; battery?: SupplierInfo };
}

export type EquipmentKind = 'panel' | 'inverter' | 'battery';

/** Grupo (modelo + cantidad + precio) de cada tipo de equipo. */
export interface EquipmentGroups {
  panel: PanelItemSpec;
  inverter: InverterItemSpec;
  battery: BatteryItemSpec;
}

/** Equipos normalizados de una propuesta. `batteries` es `[]` cuando el sistema no lleva batería. */
export interface Equipment {
  panels: PanelItemSpec[];
  inverters: InverterItemSpec[];
  batteries: BatteryItemSpec[];
}

export type EquipmentListKey = keyof Equipment;

export const LIST_KEY: Record<EquipmentKind, EquipmentListKey> = { panel: 'panels', inverter: 'inverters', battery: 'batteries' };
export const EQUIPMENT_KINDS: readonly EquipmentKind[] = ['panel', 'inverter', 'battery'];

/** Edición de un grupo. El último grupo de un tipo nunca se elimina. */
export type EquipmentEdit<K extends EquipmentKind> =
  | { type: 'add'; item: EquipmentGroups[K] }
  | { type: 'update'; index: number; patch: Partial<EquipmentGroups[K]> }
  | { type: 'remove'; index: number };
