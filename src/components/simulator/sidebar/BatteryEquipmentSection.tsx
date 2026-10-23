import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { editEquipmentGroup } from '../../../utils/equipmentGroups';
import { batteryBankSpecs, calculateTotalBatteryCapacityKWh, calculateTotalBatteryCount, getProjectBatteries } from '../../../utils/equipmentSpecsUtils';
import { BATTERY_PCT_RANGE, resolvePrimaryBatteryDodPct, resolvePrimaryBatteryEfficiencyPct } from '../params/logic/dockDefaults';
import { CommitNumberField, Field, ParamRow, StatStrip, ToggleGroup } from '../params/ui';
import { AdvancedDisclosure } from '../params/sections/equipment/AdvancedDisclosure';
import { EquipmentGroupList } from '../params/sections/equipment/EquipmentGroupList';

interface BatteryEquipmentSectionProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  isDetailed: boolean;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
  /** Ya no se usa: los colores salen de los tokens pd-* y cambian con la clase dark. */
}

const YES_NO = [
  { value: true, label: 'Sí' },
  { value: false, label: 'No' },
];

/** Almacenamiento (BESS) del dock: Sí/No, modelos de batería, parámetros avanzados y autonomía. */
export const BatteryEquipmentSection: React.FC<BatteryEquipmentSectionProps> = ({ project, summary, isDetailed, updateSpecs }) => {
  const { equipmentCatalog, openAIDatasheetModal } = useSimulationStore(useShallow((s) => ({ equipmentCatalog: s.equipmentCatalog, openAIDatasheetModal: s.openAIDatasheetModal })));
  const specs = project.specs;
  const hasBattery = !!specs.hasBattery;
  const batteryCount = getProjectBatteries(specs).length;
  const totalKWh = calculateTotalBatteryCapacityKWh(specs);
  const totalUnits = calculateTotalBatteryCount(specs);

  const stats = [
    { label: 'Energía útil', value: `${summary.batteryUsableKWh} kWh` },
    ...(batteryCount > 1 ? [{ label: 'Capacidad total', value: `${totalKWh.toFixed(1)} kWh · ${totalUnits} un.` }] : []),
    { label: 'Autonomía', value: `~${summary.batteryBackupAutonomyHours} h` },
  ];

  return (
    <EquipmentGroupList
      kind="battery"
      mode={isDetailed ? 'manual' : 'catalog'}
      specs={specs}
      catalog={equipmentCatalog}
      updateSpecs={updateSpecs}
      onOpenScanner={openAIDatasheetModal}
      enabled={hasBattery}
      intro={
        <ParamRow label="Incluir batería" labelId="dock-battery-label">
          <ToggleGroup options={YES_NO} value={hasBattery} onChange={(value) => updateSpecs({ hasBattery: value })} ariaLabel="Incluir batería" />
        </ParamRow>
      }
    >
      {hasBattery && (
        <>
          <AdvancedDisclosure>
            <ParamRow label="Profundidad de descarga" htmlFor="dock-battery-dod">
              <CommitNumberField
                id="dock-battery-dod"
                step={5}
                suffix="%"
                {...BATTERY_PCT_RANGE}
                value={resolvePrimaryBatteryDodPct(batteryBankSpecs(specs))}
                onCommit={(value) => updateSpecs(editEquipmentGroup(specs, 'battery', { type: 'update', index: 0, patch: { dodPct: value } }))}
              />
            </ParamRow>
            <ParamRow label="Eficiencia de carga" htmlFor="dock-battery-efficiency">
              <CommitNumberField
                id="dock-battery-efficiency"
                step={1}
                suffix="%"
                {...BATTERY_PCT_RANGE}
                value={resolvePrimaryBatteryEfficiencyPct(batteryBankSpecs(specs))}
                onCommit={(value) => updateSpecs(editEquipmentGroup(specs, 'battery', { type: 'update', index: 0, patch: { efficiencyPct: value } }))}
              />
            </ParamRow>
            <ParamRow label="Reemplazo año 10" htmlFor="dock-battery-replacement">
              <Field
                id="dock-battery-replacement"
                type="number"
                mono
                step={500}
                prefix="$"
                suffix="USD"
                value={specs.batteryReplacementCostUSD || 0}
                onChange={(value) => updateSpecs({ batteryReplacementCostUSD: parseFloat(value) || 0 })}
              />
            </ParamRow>
          </AdvancedDisclosure>
          <StatStrip items={stats} />
        </>
      )}
    </EquipmentGroupList>
  );
};
