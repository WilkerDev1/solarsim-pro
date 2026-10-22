import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { calculateTotalBatteryCapacityKWh, calculateTotalBatteryCount, getProjectBatteries } from '../../../utils/equipmentSpecsUtils';
import { Field, ParamRow, StatStrip, ToggleGroup } from '../params/ui';
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
              <Field
                id="dock-battery-dod"
                type="number"
                mono
                step={5}
                suffix="%"
                value={specs.batteryDOD || 90}
                onChange={(value) => updateSpecs({ batteryDOD: parseFloat(value) || 90 })}
              />
            </ParamRow>
            <ParamRow label="Eficiencia de carga" htmlFor="dock-battery-efficiency">
              <Field
                id="dock-battery-efficiency"
                type="number"
                mono
                step={1}
                suffix="%"
                value={specs.batteryEfficiencyPct || 95}
                onChange={(value) => updateSpecs({ batteryEfficiencyPct: parseFloat(value) || 95 })}
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
