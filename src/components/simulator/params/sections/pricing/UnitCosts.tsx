import React from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { InfoTip, SubHeader, SubHeaderTextButton } from '../../ui';
import { resolveProjectEquipment } from '../../../../../utils/equipmentMatchingUtils';
import { getProjectBatteries, getProjectInverters, getProjectPanels } from '../../../../../utils/equipmentSpecsUtils';
import type { SystemSpecs } from '../../../../../types';
import type { SolarEquipmentItem } from '../../../../../types/equipment';
import {
  DEFAULT_INSTALLATION_USD_PER_KWP, bestSupplierPricingPatch, displayedUnitPrice, manualUnitPricePatch, type PricedKind,
} from './supplierPricing';
import { UnitCostRow } from './UnitCostRow';

interface UnitCostsProps {
  specs: SystemSpecs;
  equipmentCatalog: SolarEquipmentItem[];
  /** Equipos principales ya resueltos en el catálogo (los usa «Mejor proveedor»). */
  selected: { panel?: SolarEquipmentItem | null; inverter?: SolarEquipmentItem | null; battery?: SolarEquipmentItem | null };
  openSupplierPriceModal: (item: SolarEquipmentItem) => void;
  updateSpecs: (specs: Partial<SystemSpecs>) => void;
}

const LABELS: Record<PricedKind, string> = { panel: 'Panel', inverter: 'Inversor', battery: 'Batería' };

/** Costos unitarios por modelo y «Mejor proveedor». Solo se dibuja en modo Desglosado. */
export const UnitCosts: React.FC<UnitCostsProps> = ({ specs, equipmentCatalog, selected, openSupplierPriceModal, updateSpecs }) => {
  const hasAnySupplierPrices =
    (selected.panel?.supplierPrices?.length || 0) > 0 ||
    (selected.inverter?.supplierPrices?.length || 0) > 0 ||
    (!!specs.hasBattery && (selected.battery?.supplierPrices?.length || 0) > 0);

  const auto = !!specs.autoSupplierPricing;

  const renderModels = (
    kind: PricedKind,
    models: Array<{
      id?: string;
      brandModel: string;
      unitPriceUSD?: number;
      selectedSupplierInfo?: { supplierName: string; priceUSD: number };
      equipment: SolarEquipmentItem | undefined;
    }>,
    flat: number | undefined
  ) =>
    models.map((model, idx) => {
      const count = model.equipment?.supplierPrices?.length || 0;
      const info = model.selectedSupplierInfo;
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
          value={displayedUnitPrice(model.unitPriceUSD, flat, kind)}
          onChange={(value) => updateSpecs(manualUnitPricePatch(specs, kind, idx, value))}
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
        })),
        specs.panelUnitPriceUSD
      )}
      {renderModels(
        'inverter',
        getProjectInverters(specs).map((inv) => ({
          ...inv,
          equipment: resolveProjectEquipment(equipmentCatalog, 'inverter', inv.brandModel, inv.powerKW, inv.selectedSupplierInfo?.supplierPriceId),
        })),
        specs.inverterUnitPriceUSD
      )}
      {specs.hasBattery &&
        renderModels(
          'battery',
          getProjectBatteries(specs).map((bat) => ({
            ...bat,
            equipment: resolveProjectEquipment(equipmentCatalog, 'battery', bat.brandModel, bat.capacityKWh, bat.selectedSupplierInfo?.supplierPriceId),
          })),
          specs.batteryUnitPriceUSD
        )}
      <UnitCostRow
        id="pd-cost-installation"
        label="Mano de obra y mat."
        detail="por kWp"
        value={specs.installationUnitPriceUSD !== undefined ? specs.installationUnitPriceUSD : DEFAULT_INSTALLATION_USD_PER_KWP}
        onChange={(value) => updateSpecs({ installationUnitPriceUSD: value })}
      />
    </>
  );
};
