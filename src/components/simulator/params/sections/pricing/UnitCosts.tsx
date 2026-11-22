import React from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { InfoTip, SubHeader, SubHeaderTextButton } from '../../ui';
import { resolveProjectEquipment } from '../../../../../utils/equipmentMatchingUtils';
import { getProjectBatteries, getProjectInverters, getProjectPanels } from '../../../../../utils/equipmentSpecsUtils';
import type { SystemSpecs } from '../../../../../types';
import type { SolarEquipmentItem } from '../../../../../types/equipment';
import { resolveAssumption } from '../../../../../../shared/assumptions';
import { resolveGroupCatalogItem } from '../../../../../utils/equipmentGroups';
import { bestSupplierPricingPatch, displayedUnitPrice, isGenericPriced, manualUnitPricePatch, type PricedKind } from './supplierPricing';
import { formatGenericDate, formatGenericUSD } from '../../../../common/equipment/genericPriceFormat';
import { UnitCostRow } from './UnitCostRow';

interface UnitCostsProps {
  specs: SystemSpecs;
  /** Mano de obra efectiva (US$/kWp) del proyecto completo; sin ella se resuelve de `specs`. */
  installationUsdPerKwp?: number;
  equipmentCatalog: SolarEquipmentItem[];
  /** Equipos principales ya resueltos en el catálogo (los usa «Mejor proveedor»). */
  selected: { panel?: SolarEquipmentItem | null; inverter?: SolarEquipmentItem | null; battery?: SolarEquipmentItem | null };
  openSupplierPriceModal: (item: SolarEquipmentItem) => void;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
  /** Con sesión (ADR 0006): la fila muestra «Genérico» mientras el precio sea la copia del genérico. */
  showGenericLabel?: boolean;
  /**
   * Regla 2: precio confirmado a mano. `equipmentId` es el equipo resuelto con `resolveGroupCatalogItem` (estricto) o
   * `undefined`; `supplierPriceUSD` es el precio del proveedor asignado al grupo.
   */
  onPriceCommit?: (target: PriceCommitTarget, previousUSD: number | undefined, priceUSD: number) => void;
  /** Pregunta compacta bajo el precio de una fila (o `null`). */
  priceQuestionFor?: (kind: PricedKind, index: number) => React.ReactNode;
}

export interface PriceCommitTarget {
  kind: PricedKind;
  index: number;
  equipmentId: string | undefined;
  supplierPriceUSD: number | undefined;
}

const LABELS: Record<PricedKind, string> = { panel: 'Panel', inverter: 'Inversor', battery: 'Batería' };

/** Costos unitarios por modelo y «Mejor proveedor». Solo se dibuja en modo Desglosado. */
export const UnitCosts: React.FC<UnitCostsProps> = ({ specs, installationUsdPerKwp, equipmentCatalog, selected, openSupplierPriceModal, updateSpecs, showGenericLabel, onPriceCommit, priceQuestionFor }) => {
  const hasAnySupplierPrices =
    (selected.panel?.supplierPrices?.length || 0) > 0 ||
    (selected.inverter?.supplierPrices?.length || 0) > 0 ||
    (!!specs.hasBattery && (selected.battery?.supplierPrices?.length || 0) > 0);

  const auto = !!specs.autoSupplierPricing;

  const renderModels = (
    kind: PricedKind,
    models: Array<{
      id?: string;
      catalogItemId?: string;
      manualModel?: boolean;
      brandModel: string;
      unitPriceUSD?: number;
      selectedSupplierInfo?: { supplierName: string; priceUSD: number };
      genericPriceInfo?: { priceUSD: number; observedAt: string };
      equipment: SolarEquipmentItem | undefined;
    }>
  ) =>
    models.map((model, idx) => {
      const count = model.equipment?.supplierPrices?.length || 0;
      const info = model.selectedSupplierInfo;
      const generic = showGenericLabel && isGenericPriced(model) ? model.genericPriceInfo : undefined;
      return (
        <UnitCostRow
          key={model.id || idx}
          id={`pd-cost-${kind}-${idx}`}
          label={models.length > 1 ? `${LABELS[kind]} #${idx + 1}` : LABELS[kind]}
          detail={model.brandModel}
          suppliersLabel={model.equipment ? (count > 0 ? `${count} prov.` : '+ prov.') : undefined}
          onOpenSuppliers={model.equipment ? () => openSupplierPriceModal(model.equipment!) : undefined}
          supplierName={info?.supplierName}
          supplierTitle={info ? `Proveedor: ${info.supplierName} ($${info.priceUSD} USD)` : undefined}
          genericLabel={generic ? {
            tip: `Precio genérico del catálogo: ${formatGenericUSD(generic.priceUSD)}, del ${formatGenericDate(generic.observedAt)}. Es una copia: cambiar el genérico en el catálogo no cambia el precio de esta propuesta.`,
          } : undefined}
          value={displayedUnitPrice(model.unitPriceUSD)}
          onChange={(value) => updateSpecs(manualUnitPricePatch(specs, kind, idx, value))}
          onCommit={onPriceCommit ? (previousUSD, priceUSD) => onPriceCommit({
            kind, index: idx,
            // Estricto: catalogItemId → id del grupo → nombre exacto único (nunca «el primer equipo del tipo»).
            equipmentId: resolveGroupCatalogItem(model, kind, equipmentCatalog)?.id,
            supplierPriceUSD: info?.priceUSD,
          }, previousUSD, priceUSD) : undefined}
          footer={priceQuestionFor?.(kind, idx) ?? undefined}
        />
      );
    });

  return (
    <>
      <SubHeader
        title="Costos unitarios"
        action={
          <span className="flex items-center gap-1">
            <InfoTip text="Costos de compra en USD por unidad. «Mejor proveedor» sincroniza cada costo con el precio más bajo del catálogo de proveedores; al editar un precio a mano vuelve al modo manual." />
            {hasAnySupplierPrices && (
              <SubHeaderTextButton
                pressed={auto}
                icon={auto ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />}
                onClick={() => updateSpecs(bestSupplierPricingPatch(specs, selected))}
                className={auto ? 'border-pd-accent text-pd-accent' : undefined}
              >
                Mejor proveedor
              </SubHeaderTextButton>
            )}
          </span>
        }
      />
      {renderModels(
        'panel',
        getProjectPanels(specs).map((p) => ({
          ...p,
          equipment: resolveProjectEquipment(equipmentCatalog, 'panel', p.brandModel, p.powerW, p.selectedSupplierInfo?.supplierPriceId),
        }))
      )}
      {renderModels(
        'inverter',
        getProjectInverters(specs).map((inv) => ({
          ...inv,
          equipment: resolveProjectEquipment(equipmentCatalog, 'inverter', inv.brandModel, inv.powerKW, inv.selectedSupplierInfo?.supplierPriceId),
        }))
      )}
      {specs.hasBattery &&
        renderModels(
          'battery',
          getProjectBatteries(specs).map((bat) => ({
            ...bat,
            equipment: resolveProjectEquipment(equipmentCatalog, 'battery', bat.brandModel, bat.capacityKWh, bat.selectedSupplierInfo?.supplierPriceId),
          }))
        )}
      <UnitCostRow
        id="pd-cost-installation"
        label="Mano de obra y mat."
        detail="por kWp"
        value={installationUsdPerKwp ?? resolveAssumption('installationUsdPerKwp', specs.installationUnitPriceUSD)}
        onChange={(value) => updateSpecs({ installationUnitPriceUSD: value })}
      />
    </>
  );
};
