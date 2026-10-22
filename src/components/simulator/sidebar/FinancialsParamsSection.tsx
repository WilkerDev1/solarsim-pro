import React from 'react';
import { ProjectSimulation, FinancialParams, CustomQuotationItem, CustomQuotationDiscount } from '../../../types';
import { computeQuotationAdjustments } from '../params/logic/quotationAdjustments';
import { calculateCostMatrixSummary } from '../../../engine/financeEngine';
import { calculateTotalDCCapacityKWp } from '../../../utils/equipmentSpecsUtils';
import { ParamRow, ToggleGroup } from '../params/ui';
import { DiscountsList } from '../params/sections/finance/DiscountsList';
import { ItemsList } from '../params/sections/finance/ItemsList';
import { NumberField } from '../params/sections/pricing/NumberField';
import { newCustomDiscount, newCustomItem, patchById, removeById } from '../params/sections/finance/quotationEdits';

interface FinancialsParamsSectionProps {
  project: ProjectSimulation;
  /** Ya no se usa: el estilo sale de los tokens `pd-*`. Se elimina en la limpieza final. */
  updateFinancials: (financials: Partial<FinancialParams>) => void;
}

const YES_NO = [
  { value: true, label: 'Sí' },
  { value: false, label: 'No' },
];

export const FinancialsParamsSection: React.FC<FinancialsParamsSectionProps> = ({ project, updateFinancials }) => {
  const customItems = project.financials.customItems || [];
  const customDiscounts = project.financials.customDiscounts || [];

  const matrixSummary = React.useMemo(() => {
    const dcCap = project.specs ? calculateTotalDCCapacityKWp(project.specs) : 1;
    return calculateCostMatrixSummary(project.specs, dcCap, customItems);
  }, [project.specs, customItems]);

  const listPriceUSD = matrixSummary.listPorcentajeVentaUSD || matrixSummary.porcentajeVentaUSD || 0;
  const totals = computeQuotationAdjustments(customItems, customDiscounts, listPriceUSD);

  return (
    <div className="flex flex-col gap-2.5">
      <ParamRow label="Ley 57-07 · ISR 40%" labelId="pd-ley5707">
        <ToggleGroup
          ariaLabel="Aplicar Ley 57-07 (crédito ISR 40%)"
          options={YES_NO}
          value={!!project.financials.applyLey5707}
          onChange={(applyLey5707) => updateFinancials({ applyLey5707 })}
        />
      </ParamRow>
      <ParamRow label="ITBIS exento" labelId="pd-itbis">
        <ToggleGroup
          ariaLabel="Exoneración de ITBIS 100% (18%)"
          options={YES_NO}
          value={!!project.financials.applyITBISExemption}
          onChange={(applyITBISExemption) => updateFinancials({ applyITBISExemption })}
        />
      </ParamRow>
      <ParamRow label="Tasa de descuento" htmlFor="pd-discount-rate">
        <NumberField
          id="pd-discount-rate"
          step="0.1"
          suffix="%"
          value={project.financials.discountRatePct}
          onValue={(discountRatePct) => updateFinancials({ discountRatePct })}
        />
      </ParamRow>

      <ItemsList
        items={customItems}
        marginMultiplier={project.specs?.saleMarginMultiplier || 1.25}
        totals={totals}
        onAdd={() => updateFinancials({ customItems: [...customItems, newCustomItem()] })}
        onUpdate={(id: string, partial: Partial<CustomQuotationItem>) => updateFinancials({ customItems: patchById(customItems, id, partial) })}
        onRemove={(id) => updateFinancials({ customItems: removeById(customItems, id) })}
      />

      <DiscountsList
        discounts={customDiscounts}
        listPriceUSD={listPriceUSD}
        totals={totals}
        onAdd={() => updateFinancials({ customDiscounts: [...customDiscounts, newCustomDiscount()] })}
        onUpdate={(id: string, partial: Partial<CustomQuotationDiscount>) => updateFinancials({ customDiscounts: patchById(customDiscounts, id, partial) })}
        onRemove={(id) => updateFinancials({ customDiscounts: removeById(customDiscounts, id) })}
      />
    </div>
  );
};
