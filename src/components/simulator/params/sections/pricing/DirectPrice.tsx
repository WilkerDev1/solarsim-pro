import React from 'react';
import { Sparkles } from 'lucide-react';
import { InfoTip, ParamRow, StatStrip, SubHeader, SubHeaderTextButton, ToggleGroup } from '../../ui';
import type { FinancialSummaryResult, SystemSpecs } from '../../../../../types';
import { DEFAULT_PRICE_PER_WATT_USD, DEFAULT_SALE_MARGIN_MULTIPLIER } from '../../logic/dockDefaults';
import { kwpPricePatch, pricePerKWpFromWatt, roundedWattPrice, wattPricePatch } from '../../logic/pricingSync';
import { usd } from './format';
import { NumberField } from './NumberField';

interface DirectPriceProps {
  specs: SystemSpecs;
  summary: FinancialSummaryResult;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
}

const TIP =
  'Fija el costo llave en mano por Wp o kWp sin desglosar mano de obra. El excedente comercial se asigna a la ganancia o a mano de obra, ingeniería e instalación.';

/** Modo Directo: $/W y $/kWp sincronizados, destino del excedente y resumen de margen. */
export const DirectPrice: React.FC<DirectPriceProps> = ({ specs, summary, updateSpecs }) => {
  const wattPrice = specs.pricePerWattUSD !== undefined ? specs.pricePerWattUSD : DEFAULT_PRICE_PER_WATT_USD;
  const kwpPrice = specs.pricePerKWpUSD !== undefined ? specs.pricePerKWpUSD : pricePerKWpFromWatt(specs.pricePerWattUSD || DEFAULT_PRICE_PER_WATT_USD);
  const matrix = summary?.costMatrix;

  return (
    <>
      <SubHeader
        title="Precio directo"
        action={
          <span className="flex items-center gap-1">
            <InfoTip text={TIP} />
            <SubHeaderTextButton
              icon={<Sparkles size={13} strokeWidth={2} aria-hidden="true" />}
              onClick={() => updateSpecs(wattPricePatch(roundedWattPrice(matrix?.salePricePerWattUSD, DEFAULT_PRICE_PER_WATT_USD)))}
            >
              Sugerir de costos
            </SubHeaderTextButton>
          </span>
        }
      />
      <ParamRow label="Precio por W" htmlFor="pd-price-w">
        <NumberField id="pd-price-w" prefix="$" suffix="/Wp" step="0.01" min="0.1" value={wattPrice} onValue={(v) => updateSpecs(wattPricePatch(v))} />
      </ParamRow>
      <ParamRow label="Precio por kWp" htmlFor="pd-price-kwp">
        <NumberField id="pd-price-kwp" prefix="$" suffix="/kWp" step="10" min="100" value={kwpPrice} onValue={(v) => updateSpecs(kwpPricePatch(v))} />
      </ParamRow>
      <ParamRow label="Destino del excedente" labelId="pd-surplus-label">
        <ToggleGroup
          ariaLabel="Destino del excedente"
          value={specs.directPriceSurplusTarget === 'labor' ? 'labor' : 'margin'}
          onChange={(target) => updateSpecs({ directPriceSurplusTarget: target })}
          options={[
            { value: 'margin', label: 'Ganancia' },
            { value: 'labor', label: 'Mano de obra' },
          ]}
        />
      </ParamRow>
      <StatStrip
        items={[
          { label: 'Potencia', value: `${(summary?.systemCapacityKWp ?? 0).toFixed(2)} kWp` },
          { label: 'Margen', value: `${(matrix?.saleMarginMultiplier || DEFAULT_SALE_MARGIN_MULTIPLIER).toFixed(2)}× · +${(matrix?.markupOnCostPct || 0).toFixed(1)}%` },
          { label: 'Ganancia neta', value: `+$${usd(matrix?.gananciaUSD || 0)}` },
        ]}
      />
      {specs.hasBattery && (
        <div className="flex items-baseline justify-between text-[13px] text-pd-muted">
          <span>Almacenamiento incluido</span>
          <span className="font-mono text-pd-text">
            {specs.batteryCount || 1} ud ({((specs.batteryCapacityKWh || 5) * (specs.batteryCount || 1)).toFixed(1)} kWh)
          </span>
        </div>
      )}
    </>
  );
};
