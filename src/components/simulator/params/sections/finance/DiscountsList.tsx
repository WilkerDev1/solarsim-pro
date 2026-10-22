import React from 'react';
import { Plus } from 'lucide-react';
import { InfoTip, ItemCard, SelectField, SubHeader, SubHeaderIconButton, ToggleGroup } from '../../ui';
import type { CustomQuotationDiscount } from '../../../../../types';
import { discountAmountUSD, type QuotationAdjustments } from '../../logic/quotationAdjustments';
import { usd } from '../pricing/format';
import { NumberField } from '../pricing/NumberField';

interface DiscountsListProps {
  discounts: CustomQuotationDiscount[];
  listPriceUSD: number;
  totals: Pick<QuotationAdjustments, 'totalDiscountUSD' | 'equipmentDiscountUSD' | 'finalPriceUSD'>;
  onAdd: () => void;
  onUpdate: (id: string, partial: Partial<CustomQuotationDiscount>) => void;
  onRemove: (id: string) => void;
}

const TYPE_OPTIONS = [
  { value: 'fixed' as const, label: '$' },
  { value: 'percentage' as const, label: '%' },
];
const TARGET_OPTIONS = [
  { value: 'general', label: 'Global' },
  { value: 'equipment', label: 'Equipos (DGII)' },
];

const TARGETS_TIP =
  'Global: descuento general; la base de equipos renovables ante DGII se mantiene al 100%. Equipos (DGII): reduce la base elegible del 40% ISR de la Ley 57-07, porque DGII no admite crédito fiscal sobre montos que no se facturen.';

const equipmentTip = (amountUSD: number): string =>
  `Reduce la base elegible del 40% ISR Ley 57-07 en −$${usd(amountUSD)} USD (DGII no admite crédito fiscal sobre montos que no se facturen).`;

/** Descuentos fijos o porcentuales, con destino general o a equipos, y el paso de precio de lista a final. */
export const DiscountsList: React.FC<DiscountsListProps> = ({ discounts, listPriceUSD, totals, onAdd, onUpdate, onRemove }) => (
  <>
    <SubHeader
      title="Descuentos"
      action={
        <span className="flex items-center gap-1">
          <InfoTip text={TARGETS_TIP} />
          <SubHeaderIconButton label="Agregar descuento" icon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} onClick={onAdd} />
        </span>
      }
    />
    {discounts.length === 0 ? (
      <p className="m-0 text-[13px] text-pd-muted">Sin descuentos.</p>
    ) : (
      <>
        {discounts.map((disc, index) => {
          const amount = discountAmountUSD(disc, listPriceUSD);
          const isEquipment = disc.target === 'equipment';
          return (
            <ItemCard
              key={disc.id || index}
              title={disc.description}
              onTitleChange={(description) => onUpdate(disc.id, { description })}
              titleLabel={`Motivo del descuento ${index + 1}`}
              titlePlaceholder="Motivo del descuento"
              onRemove={() => onRemove(disc.id)}
              removeLabel={`Eliminar descuento ${index + 1}`}
              trailing={
                <>
                  {isEquipment && <InfoTip text={equipmentTip(amount)} />}
                  <span className="font-mono text-[13px] font-semibold text-pd-negative">−${usd(amount)}</span>
                </>
              }
            >
              <div className="grid grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5">
                <ToggleGroup
                  compact
                  ariaLabel={`Tipo del descuento ${index + 1}`}
                  options={TYPE_OPTIONS}
                  value={disc.type}
                  onChange={(type) => onUpdate(disc.id, { type })}
                />
                <NumberField
                  aria-label={disc.type === 'percentage' ? 'Porcentaje' : 'Monto'}
                  step={disc.type === 'percentage' ? '0.5' : '50'}
                  min="0"
                  max={disc.type === 'percentage' ? '100' : undefined}
                  value={disc.value}
                  onValue={(v) => onUpdate(disc.id, { value: Math.max(0, v) })}
                />
                <SelectField
                  ariaLabel={`Destino del descuento ${index + 1}`}
                  value={isEquipment ? 'equipment' : 'general'}
                  options={TARGET_OPTIONS}
                  onChange={(target) => onUpdate(disc.id, { target: target === 'equipment' ? 'equipment' : 'general' })}
                />
              </div>
            </ItemCard>
          );
        })}
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-pd-muted">Total descuentos</span>
          <span className="font-mono text-[13px] font-semibold text-pd-negative">−${usd(totals.totalDiscountUSD)}</span>
        </div>
        {totals.equipmentDiscountUSD > 0 && (
          <div className="flex items-baseline justify-between text-xs text-pd-muted">
            <span>Imputado a equipos Ley 57-07</span>
            <span className="font-mono">−${usd(totals.equipmentDiscountUSD)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between text-[13px] text-pd-muted">
          <span>Lista <span className="font-mono text-pd-text">${usd(listPriceUSD)}</span></span>
          <span>Final <span className="font-mono text-base font-semibold text-pd-text">${usd(totals.finalPriceUSD)}</span></span>
        </div>
      </>
    )}
  </>
);
