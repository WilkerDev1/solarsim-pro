import React from 'react';
import { resolveProjectEquipment, supplierQuotesItem } from '../../../utils/equipmentMatchingUtils';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { useSupplierCleanup } from '../params/hooks/useSupplierCleanup';
import {
  DEFAULT_PRICE_PER_WATT_USD,
  marginPctFromMultiplier,
  multiplierFromMarginInput,
  multiplierFromQuickMargin,
  roundedWattPrice,
  wattPricePatch,
  wholeMarginPctFromMultiplier,
} from '../params/logic/pricingSync';
import { ChipGroup, ParamRow, StatStrip, ToggleGroup } from '../params/ui';
import { DirectPrice } from '../params/sections/pricing/DirectPrice';
import { NumberField } from '../params/sections/pricing/NumberField';
import { UnitCosts } from '../params/sections/pricing/UnitCosts';
import { usd } from '../params/sections/pricing/format';

interface PricingParamsSectionProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  /** Ya no se usa: el estilo sale de los tokens `pd-*`. Se elimina en la limpieza final. */
  isDark?: boolean;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
}

const MARGIN_OPTIONS = [10, 15, 20, 25, 30, 35].map((pct) => ({ value: pct, label: String(pct) }));
const MODE_OPTIONS = [
  { value: 'cost_matrix' as const, label: 'Desglosado' },
  { value: 'direct_watt' as const, label: 'Directo $/W' },
];

export const PricingParamsSection: React.FC<PricingParamsSectionProps> = ({ project, summary, updateSpecs }) => {
  const { equipmentCatalog, openSupplierPriceModal } = useSimulationStore(
    useShallow((s) => ({ equipmentCatalog: s.equipmentCatalog, openSupplierPriceModal: s.openSupplierPriceModal }))
  );
  const specs = project.specs;
  const info = specs.selectedSupplierInfo;

  const selectedPanel = resolveProjectEquipment(equipmentCatalog, 'panel', specs.panelBrandModel, specs.panelPowerW, info?.panel?.supplierPriceId);
  const selectedInverter = resolveProjectEquipment(equipmentCatalog, 'inverter', specs.inverterBrandModel, specs.inverterPowerKW, info?.inverter?.supplierPriceId);
  const selectedBattery = resolveProjectEquipment(equipmentCatalog, 'battery', specs.batteryBrandModel, specs.batteryCapacityKWh, info?.battery?.supplierPriceId);

  // La limpieza escribe en el proyecto: vive aquí (siempre montada), no en una vista que dependa del modo.
  useSupplierCleanup({
    specs,
    equipmentCatalog,
    panelSupplierMatches: supplierQuotesItem(selectedPanel, info?.panel),
    inverterSupplierMatches: supplierQuotesItem(selectedInverter, info?.inverter),
    batterySupplierMatches: supplierQuotesItem(selectedBattery, info?.battery),
    updateSpecs,
  });

  const isDirect = specs.pricingMode === 'direct_watt';
  const matrix = summary?.costMatrix;
  const multiplier = specs.saleMarginMultiplier || 1.25;

  const setMode = (mode: 'cost_matrix' | 'direct_watt') => {
    if (mode === 'cost_matrix') {
      updateSpecs({ pricingMode: 'cost_matrix' });
      return;
    }
    const autoWp = roundedWattPrice(matrix?.salePricePerWattUSD, specs.pricePerWattUSD, DEFAULT_PRICE_PER_WATT_USD);
    updateSpecs({ pricingMode: 'direct_watt', ...wattPricePatch(autoWp) });
  };

  const autoSaleWp = roundedWattPrice(matrix?.salePricePerWattUSD, 1.08);
  const costWp = Math.round((matrix?.costPerWattUSD || 0.86) * 100) / 100;
  const profitWp = Math.max(0, Math.round((autoSaleWp - costWp) * 100) / 100);

  return (
    <div className="flex flex-col gap-2.5">
      <ParamRow label="Fijación de precio" labelId="pd-pricing-mode">
        <ToggleGroup ariaLabel="Fijación de precio" options={MODE_OPTIONS} value={isDirect ? 'direct_watt' : 'cost_matrix'} onChange={setMode} />
      </ParamRow>

      {isDirect ? (
        <DirectPrice specs={specs} summary={summary} updateSpecs={updateSpecs} />
      ) : (
        <>
          <ParamRow label="Tasa DOP/USD" htmlFor="pd-dop-rate">
            <NumberField
              id="pd-dop-rate"
              prefix="RD$"
              step="0.5"
              value={specs.dopExchangeRate !== undefined ? specs.dopExchangeRate : 60.0}
              onValue={(v) => updateSpecs({ dopExchangeRate: v })}
            />
          </ParamRow>
          <ParamRow label="Margen de ganancia" htmlFor="pd-margin">
            <NumberField
              id="pd-margin"
              step="0.5"
              min="0"
              max="500"
              placeholder="25"
              suffix={`% · ${multiplier.toFixed(2)}×`}
              value={marginPctFromMultiplier(specs.saleMarginMultiplier)}
              onValue={(pct) => updateSpecs({ saleMarginMultiplier: multiplierFromMarginInput(pct) })}
            />
          </ParamRow>
          <ChipGroup
            ariaLabel="Márgenes sugeridos"
            options={MARGIN_OPTIONS}
            value={wholeMarginPctFromMultiplier(specs.saleMarginMultiplier)}
            onChange={(pct) => updateSpecs({ saleMarginMultiplier: multiplierFromQuickMargin(pct) })}
          />
          <UnitCosts
            specs={specs}
            equipmentCatalog={equipmentCatalog}
            selected={{ panel: selectedPanel, inverter: selectedInverter, battery: selectedBattery }}
            openSupplierPriceModal={openSupplierPriceModal}
            updateSpecs={updateSpecs}
          />
          <StatStrip
            items={[
              { label: 'Costo /Wp', value: `$${costWp.toFixed(2)}` },
              { label: 'Ganancia /Wp', value: `+$${profitWp.toFixed(2)}` },
              { label: 'Venta /Wp', value: `$${autoSaleWp.toFixed(2)}`, tone: 'accent' },
            ]}
          />
          <div className="flex items-baseline justify-between text-[13px] text-pd-muted">
            <span>Venta /kWp</span>
            <span className="font-mono text-pd-text">${usd(matrix?.precioKilosVentasUSD || autoSaleWp * 1000)}</span>
          </div>
        </>
      )}

      <div className="flex items-baseline justify-between pt-1">
        <span className="text-[13px] text-pd-muted">Total de venta</span>
        <span className="font-mono text-lg font-semibold text-pd-accent">${usd(summary?.grossInvestmentUSD || 0)}</span>
      </div>
    </div>
  );
};
