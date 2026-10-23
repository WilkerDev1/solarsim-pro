import React from 'react';
import { Sparkles } from 'lucide-react';
import { CommitNumberField, InfoTip, ParamRow, StatStrip, SubHeader, SubHeaderTextButton, ToggleGroup } from '../../ui';
import type { FinancialSummaryResult, SystemSpecs } from '../../../../../types';
import { isValidDirectPrice, resolvePricePerWattUSD, resolveSaleMarginMultiplier } from '../../logic/dockDefaults';
import { kwpPricePatch, pricePerKWpFromWatt, roundedWattPrice, wattPricePatch } from '../../logic/pricingSync';
import { usd } from './format';

interface DirectPriceProps {
  specs: SystemSpecs;
  summary: FinancialSummaryResult;
  /** `financials.pricePerWattUSD` del proyecto: segundo eslabón de la cadena de fallback del motor. */
  financialsPricePerWattUSD?: number;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
}

/** Precio directo mínimo ($/Wp); el equivalente en $/kWp es 1000 veces mayor. Menos se rechaza al confirmar. */
const MIN_WATT_PRICE_USD = 0.1;

const TIP =
  'Fija el costo llave en mano por Wp o kWp sin desglosar mano de obra. El excedente comercial se asigna a la ganancia o a mano de obra, ingeniería e instalación.';

/** Modo Directo: $/W y $/kWp sincronizados, destino del excedente y resumen de margen. */
export const DirectPrice: React.FC<DirectPriceProps> = ({ specs, summary, financialsPricePerWattUSD, updateSpecs }) => {
  // Ambos campos salen del mismo valor. El motor ignora un $/Wp ≤ 0 (usa financials y luego el default): la vista sigue la misma cadena.
  const wattPrice = resolvePricePerWattUSD(specs, { pricePerWattUSD: financialsPricePerWattUSD });
  const kwpPrice = isValidDirectPrice(specs.pricePerKWpUSD) && Math.abs(specs.pricePerKWpUSD / 1000 - wattPrice) <= 0.00051 ? specs.pricePerKWpUSD : pricePerKWpFromWatt(wattPrice);
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
              onClick={() => updateSpecs(wattPricePatch(roundedWattPrice(matrix?.salePricePerWattUSD, wattPrice)))}
            >
              Sugerir de costos
            </SubHeaderTextButton>
          </span>
        }
      />
      <ParamRow label="Precio por W" htmlFor="pd-price-w">
        <CommitNumberField id="pd-price-w" prefix="$" suffix="/Wp" step="0.01" min={MIN_WATT_PRICE_USD} belowMin="revert" value={wattPrice} onCommit={(v) => updateSpecs(wattPricePatch(v))} />
      </ParamRow>
      <ParamRow label="Precio por kWp" htmlFor="pd-price-kwp">
        <CommitNumberField id="pd-price-kwp" prefix="$" suffix="/kWp" step="10" min={MIN_WATT_PRICE_USD * 1000} belowMin="revert" value={kwpPrice} onCommit={(v) => updateSpecs(kwpPricePatch(v))} />
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
          { label: 'Margen', value: `${(resolveSaleMarginMultiplier(matrix?.saleMarginMultiplier)).toFixed(2)}× · +${(matrix?.markupOnCostPct || 0).toFixed(1)}%` },
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
