import React from 'react';
import type { UtilityRates } from '../../../../../types';
import type { ResolvedAssumptions } from '../../../../../../shared/assumptions';
import {
  GRID_USE_CHARGE_ESTIMATE_NOTICE,
  MAX_GRID_USE_CHARGE_DOP_PER_KWH,
  chargeRoundsToZero,
  NET_METERING_REGIMES,
  NET_METERING_REGIME_LABELS,
  factoryGridUseCharge,
  gridUseChargeApplies,
  type NetMeteringRegime,
} from '../../../../../../shared/netMetering';
import { CommitNumberField, Field, FieldMenu, InfoTip, ParamRow, SelectField } from '../../ui';
import { exportFeeValue } from './ratesLogic';
import { planSie007Upgrade } from '../../../../../domain/netMeteringUpgrade';
import { Sie007UpgradeNotice } from './Sie007UpgradeNotice';

export interface NetMeteringFieldsProps {
  rates: UtilityRates;
  /** Supuestos efectivos de la propuesta (régimen y cargo resueltos, ADR 0003). */
  assumptions: Pick<ResolvedAssumptions, 'netMeteringRegime' | 'gridUseChargeDOPPerKWh' | 'gridExportFeePct'>;
  /** Función de este equipo `netMeteringRegimeSelector`: muestra el selector temporal de régimen. */
  showRegimeSelector: boolean;
  /** Texto del InfoTip de la retención del régimen anterior. */
  exportTip: string;
  /** Lo que escribiría «Aplicar tarifa oficial»: el aviso de actualización solo lo menciona, no lo aplica. */
  officialReferencePatch?: Partial<UtilityRates>;
  updateRates: (rates: Partial<UtilityRates>) => void;
}

const REGIME_OPTIONS = NET_METERING_REGIMES.map((value) => ({ value, label: NET_METERING_REGIME_LABELS[value] }));
const parseNumber = (raw: string) => parseFloat(raw) || 0;

/**
 * Medición neta en el dock: selector temporal de régimen y, según el régimen, la retención % anterior o el cargo
 * por uso de la red SIE-007-2026 en RD$/kWh inyectado (editable, con el valor de fábrica a un clic y el aviso de
 * que es estimado). Componente aparte de `RatesFields` para que los cambios de tarifas queden localizados.
 */
export const NetMeteringFields: React.FC<NetMeteringFieldsProps> = ({ rates, assumptions, showRegimeSelector, exportTip, officialReferencePatch, updateRates }) => {
  const regime = assumptions.netMeteringRegime;
  const zeroExport = !!rates.isZeroExport;
  const factory = factoryGridUseCharge(rates.distributor);
  const charge = assumptions.gridUseChargeDOPPerKWh;
  const isFactory = Math.abs(charge - factory.dopPerKWh) < 0.005;
  const applies = gridUseChargeApplies(rates);
  // Fase 7: actualizar una propuesta del régimen anterior. Si la organización oculta el selector, tampoco se ofrece:
  // la política decide quién cambia el régimen en el dock, y sin selector no habría vuelta atrás al régimen anterior.
  const upgrade = showRegimeSelector ? planSie007Upgrade(rates, officialReferencePatch) : null;
  const chargeTip = !applies
    ? zeroExport
      ? 'Inyección cero activa: no se inyecta energía a la red, por lo que no hay cargo por uso de red.'
      : 'Tarifa con cargo de potencia: el Reglamento SIE-007-2026-REG reserva el cargo por uso de la red a las tarifas de un solo precio (BTS-1, BTS-2, RBT-1). No se cobra.'
    : `Medición neta SIE-007-2026-REG (art. 19.1.e): se acredita todo lo inyectado y se cobra este cargo por cada kWh inyectado a la red. Valor de fábrica: RD$${factory.dopPerKWh.toFixed(2)} (Resolución ${factory.resolutionCode}, ${factory.period}).`;

  return (
    <>
      {showRegimeSelector && (
        <ParamRow label="Régimen" htmlFor="pd-rates-regime">
          <SelectField
            id="pd-rates-regime"
            value={regime}
            options={REGIME_OPTIONS}
            onChange={(value) => updateRates({ netMeteringRegime: value as NetMeteringRegime })}
          />
        </ParamRow>
      )}
      {upgrade && <Sie007UpgradeNotice plan={upgrade} updateRates={updateRates} />}
      {regime === 'sie007_2026' ? (
        <>
          {applies ? (
            <ParamRow label="Cargo uso de red" htmlFor="pd-rates-grid-charge">
              <CommitNumberField
                id="pd-rates-grid-charge"
                step="0.01"
                prefix="RD$"
                suffix="/kWh"
                min={0}
                max={MAX_GRID_USE_CHARGE_DOP_PER_KWH}
                value={charge}
                onCommit={(value) => updateRates({ gridUseChargeDOPPerKWh: value })}
                right={(
                  <FieldMenu
                    ariaLabel={isFactory ? 'Opciones del cargo: valor de fábrica aplicado' : `Opciones del cargo: difiere del de fábrica (RD$${factory.dopPerKWh.toFixed(2)}/kWh)`}
                    attention={!isFactory}
                    items={[{
                      label: isFactory ? 'Valor de fábrica aplicado' : 'Aplicar valor de fábrica',
                      hint: `RD$${factory.dopPerKWh.toFixed(2)}`,
                      checked: isFactory,
                      onSelect: () => updateRates({ gridUseChargeDOPPerKWh: factory.dopPerKWh }),
                    }]}
                  />
                )}
              />
            </ParamRow>
          ) : (
            // Inyección cero o tarifa con potencia: no hay cargo, así que no se muestra un campo (ni un 0 editable).
            <p role="note" data-grid-use-charge="not-applicable" className="m-0 text-xs text-pd-muted">{chargeTip}</p>
          )}
          {applies && !chargeRoundsToZero(charge) && (
            <p role="note" className="m-0 flex items-start gap-1.5 rounded bg-pd-warn-bg px-2 py-1.5 text-[11px] font-medium leading-snug text-pd-warn-text">
              <span>{GRID_USE_CHARGE_ESTIMATE_NOTICE} {factory.resolutionCode}, {factory.period}.</span>
              <InfoTip text={chargeTip} />
            </p>
          )}
        </>
      ) : (
        <ParamRow label="Cargo exportación" htmlFor="pd-rates-export">
          <Field
            id="pd-rates-export"
            type="number"
            step="1"
            mono
            suffix="%"
            disabled={zeroExport}
            value={exportFeeValue(rates, assumptions.gridExportFeePct)}
            onChange={(value) => updateRates({ gridExportFeePct: parseNumber(value) })}
            right={<InfoTip text={exportTip} />}
          />
        </ParamRow>
      )}
    </>
  );
};
