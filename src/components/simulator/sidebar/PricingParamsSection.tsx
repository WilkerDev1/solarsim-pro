import React from 'react';
import { resolveProjectEquipment, supplierQuotesItem } from '../../../utils/equipmentMatchingUtils';
import { ProjectSimulation, FinancialSummaryResult, SystemSpecs } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { useSupplierCleanup } from '../params/hooks/useSupplierCleanup';
import {
  marginPctFromMultiplier,
  multiplierFromMarginInput,
  multiplierFromQuickMargin,
  roundedWattPrice,
  wattPricePatch,
  wholeMarginPctFromMultiplier,
} from '../params/logic/pricingSync';
import { DEFAULT_PRICE_PER_WATT_USD, resolveDopRate, resolveSaleMarginMultiplier } from '../params/logic/dockDefaults';
import { ChipGroup, CommitNumberField, ParamRow, StatStrip, ToggleGroup } from '../params/ui';
import { DirectPrice } from '../params/sections/pricing/DirectPrice';
import { NumberField } from '../params/sections/pricing/NumberField';
import { UnitCosts } from '../params/sections/pricing/UnitCosts';
import { usd } from '../params/sections/pricing/format';

interface PricingParamsSectionProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  /** Ya no se usa: el estilo sale de los tokens `pd-*`. Se elimina en la limpieza final. */
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
}

/** Texto cuando una cifra no se puede calcular. */
const NO_VALUE = '—';
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
  const multiplier = resolveSaleMarginMultiplier(specs.saleMarginMultiplier);

  const setMode = (mode: 'cost_matrix' | 'direct_watt') => {
    if (mode === 'cost_matrix') {
      updateSpecs({ pricingMode: 'cost_matrix' });
      return;
    }
    const autoWp = roundedWattPrice(matrix?.salePricePerWattUSD, specs.pricePerWattUSD, DEFAULT_PRICE_PER_WATT_USD);
    updateSpecs({ pricingMode: 'direct_watt', ...wattPricePatch(autoWp) });
  };

  // Valores reales de la matriz; si no se pueden calcular (sin matriz o no finitos) se muestra «—», nunca una cifra inventada.
  const finiteOrNull = (value: number | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const cents = (value: number) => Math.round(value * 100) / 100;
  const costWp = finiteOrNull(matrix?.costPerWattUSD);
  const saleWp = finiteOrNull(matrix?.salePricePerWattUSD);
  const saleKWp = finiteOrNull(matrix?.precioKilosVentasUSD) ?? (saleWp === null ? null : saleWp * 1000);
  const profitWp = costWp === null || saleWp === null ? null : Math.max(0, cents(cents(saleWp) - cents(costWp)));
  const dollars = (value: number | null) => (value === null ? NO_VALUE : `$${cents(value).toFixed(2)}`);

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
            <CommitNumberField
              id="pd-dop-rate"
              prefix="RD$"
              step="0.5"
              min={0.01}
              belowMin="revert"
              value={resolveDopRate(specs.dopExchangeRate)}
              onCommit={(rate) => updateSpecs({ dopExchangeRate: rate })}
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
              { label: 'Costo /Wp', value: dollars(costWp) },
              { label: 'Ganancia /Wp', value: profitWp === null ? NO_VALUE : `+$${profitWp.toFixed(2)}` },
              { label: 'Venta /Wp', value: dollars(saleWp), tone: 'accent' },
            ]}
          />
          <div className="flex items-baseline justify-between text-[13px] text-pd-muted">
            <span>Venta /kWp</span>
            <span className="font-mono text-pd-text">{saleKWp === null ? NO_VALUE : `$${usd(saleKWp)}`}</span>
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
