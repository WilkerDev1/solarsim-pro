import React from 'react';
import type { UtilityRates } from '../../../../../types';
import { InfoTip } from '../../ui';
import { SIE007_UPGRADE_NOTICE, type Sie007UpgradePlan } from '../../../../../domain/netMeteringUpgrade';

export interface Sie007UpgradeNoticeProps {
  plan: Sie007UpgradePlan;
  updateRates: (rates: Partial<UtilityRates>) => void;
}

/**
 * Aviso compacto (botón + ⓘ) en el dock para una propuesta del régimen anterior: «Actualizar a SIE-007-2026» aplica el parche
 * por `updateRates` (→ `applyProjectEdit`, con deshacer). Solo presenta: la decisión vive en `planSie007Upgrade`.
 */
export const Sie007UpgradeNotice: React.FC<Sie007UpgradeNoticeProps> = ({ plan, updateRates }) => {
  const charge = `RD$${plan.chargeDOPPerKWh.toFixed(2)}/kWh`;
  const chargeText = plan.seedsFactoryCharge
    ? `Se aplicará el cargo de fábrica de ${charge} (${plan.factory.resolutionCode}, ${plan.factory.period}), estimado.`
    : `Se conserva el cargo guardado de ${charge}.`;
  const explanation = [
    SIE007_UPGRADE_NOTICE,
    [
      chargeText,
      plan.valuesByBlocks && 'Con la tarifa oficial guardada, la energía pasará a valorarse por bloques.',
      plan.suggestOfficialTariff && 'El precio del kWh no cambia: para facturar por bloques puedes usar después «Aplicar tarifa oficial» en Precio kWh.',
      'Se puede deshacer y el régimen anterior sigue disponible en el selector.',
    ].filter(Boolean).join(' '),
  ].join('\n');
  return (
    <div data-sie007-upgrade role="note" className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => updateRates(plan.patch)}
        className="flex h-7 cursor-pointer items-center justify-center rounded-md border border-pd-accent bg-transparent px-2.5 text-[12px] font-semibold text-pd-accent"
      >
        Actualizar a SIE-007-2026
      </button>
      <InfoTip text={explanation} />
    </div>
  );
};
