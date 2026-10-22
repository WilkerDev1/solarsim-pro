import React from 'react';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { useCatalogPowerSync } from '../params/hooks/useCatalogPowerSync';
import { DEFAULT_SYSTEM_LOSSES_PCT, DEFAULT_TARGET_COVERAGE_PCT } from '../params/logic/dockDefaults';
import { BatteryEquipmentSection } from './BatteryEquipmentSection';
import { Field, ParamRow, StatStrip, ToggleGroup } from '../params/ui';
import { AdvancedDisclosure } from '../params/sections/equipment/AdvancedDisclosure';
import { EquipmentGroupList } from '../params/sections/equipment/EquipmentGroupList';
import { formatDcAcRatio, formatKW } from '../params/sections/equipment/equipmentGroupModel';
import { calculateTotalDCCapacityKWp, calculateTotalInverterPowerKW } from '../../../utils/equipmentSpecsUtils';

interface EquipmentParamsSectionProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
  /** Ya no se usa: los colores salen de los tokens pd-* y cambian con la clase dark. */
}

const MODES = [
  { value: 'catalog' as const, label: 'Catálogo' },
  { value: 'manual' as const, label: 'Manual' },
];

export const EquipmentParamsSection: React.FC<EquipmentParamsSectionProps> = ({ project, summary, updateSpecs }) => {
  const { equipmentCatalog, openAIDatasheetModal } = useSimulationStore(useShallow((s) => ({ equipmentCatalog: s.equipmentCatalog, openAIDatasheetModal: s.openAIDatasheetModal })));
  const specs = project.specs;
  const isDetailed = !!specs.isDetailed;
  const mode = isDetailed ? 'manual' : 'catalog';

  // Efecto que escribe en el proyecto: el cuerpo sigue montado aunque la sección esté plegada.
  useCatalogPowerSync(specs, equipmentCatalog, updateSpecs);

  const totalDCKWp = calculateTotalDCCapacityKWp(specs);
  const totalInverterKW = calculateTotalInverterPowerKW(specs);
  const losses = specs.systemLosses !== undefined ? specs.systemLosses : 25;
  const autoInfo = `Calcula los paneles para cubrir el ${project.rates.targetCoveragePct ?? DEFAULT_TARGET_COVERAGE_PCT}% del consumo, con ${specs.systemLosses ?? DEFAULT_SYSTEM_LOSSES_PCT}% de pérdidas.`;
  const common = { mode, specs, catalog: equipmentCatalog, updateSpecs, onOpenScanner: openAIDatasheetModal } as const;

  return (
    <div className="flex flex-col gap-2.5">
      <ParamRow label="Modo" labelId="dock-equipment-mode">
        <ToggleGroup options={MODES} value={mode} onChange={(value) => updateSpecs({ isDetailed: value === 'manual' })} ariaLabel="Modo de equipamiento" />
      </ParamRow>
      <ParamRow label="Pérdidas del sistema" htmlFor="dock-equipment-losses">
        <Field
          id="dock-equipment-losses"
          type="number"
          mono
          min={0}
          max={50}
          step={0.5}
          suffix="%"
          value={losses}
          onChange={(value) => updateSpecs({ systemLosses: parseFloat(value) || 0 })}
        />
      </ParamRow>

      <EquipmentGroupList
        kind="panel"
        {...common}
        autoCalculate={{
          checked: !!specs.autoCalculatePanels,
          onChange: (checked) => updateSpecs({ autoCalculatePanels: checked }),
          info: autoInfo,
        }}
      >
        {isDetailed && (
          <AdvancedDisclosure>
            <ParamRow label="Eficiencia del panel" htmlFor="dock-panel-efficiency">
              <Field
                id="dock-panel-efficiency"
                type="number"
                mono
                step={0.1}
                suffix="%"
                value={specs.panelEfficiency}
                onChange={(value) => updateSpecs({ panelEfficiency: parseFloat(value) || 0 })}
              />
            </ParamRow>
            <ParamRow label="Coef. de temperatura" htmlFor="dock-panel-temp-coeff">
              <Field
                id="dock-panel-temp-coeff"
                type="number"
                mono
                step={0.01}
                suffix="%/°C"
                value={specs.tempCoeff}
                onChange={(value) => updateSpecs({ tempCoeff: parseFloat(value) || 0 })}
              />
            </ParamRow>
            <ParamRow label="Degradación anual" htmlFor="dock-panel-degradation">
              <Field
                id="dock-panel-degradation"
                type="number"
                mono
                step={0.1}
                suffix="%"
                value={specs.annualDegradation}
                onChange={(value) => updateSpecs({ annualDegradation: parseFloat(value) || 0 })}
              />
            </ParamRow>
          </AdvancedDisclosure>
        )}
      </EquipmentGroupList>

      <EquipmentGroupList kind="inverter" {...common} />

      <BatteryEquipmentSection project={project} summary={summary} isDetailed={isDetailed} updateSpecs={updateSpecs} />

      <StatStrip
        items={[
          { label: 'DC', value: `${totalDCKWp.toFixed(2)} kWp` },
          { label: 'AC', value: `${formatKW(totalInverterKW)} kW` },
          { label: 'DC/AC', value: formatDcAcRatio(totalDCKWp, totalInverterKW) },
        ]}
      />
    </div>
  );
};
