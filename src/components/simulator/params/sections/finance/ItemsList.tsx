import React from 'react';
import { Plus } from 'lucide-react';
import { Field, ItemCard, SubHeader, SubHeaderIconButton } from '../../ui';
import type { CustomQuotationItem } from '../../../../../types';
import type { QuotationAdjustments } from '../../logic/quotationAdjustments';
import { usd } from '../pricing/format';
import { NumberField } from '../pricing/NumberField';
import { itbisPatch, itemItbisNote, itemTotalUSD, itemWithMarginUSD, parseQuantity } from './quotationEdits';
import { TagToggle } from './TagToggle';

interface ItemsListProps {
  items: CustomQuotationItem[];
  marginMultiplier: number;
  totals: Pick<QuotationAdjustments, 'itemsSubtotalUSD' | 'chargedITBISUSD' | 'exoneratedITBISUSD'>;
  onAdd: () => void;
  onUpdate: (id: string, partial: Partial<CustomQuotationItem>) => void;
  onRemove: (id: string) => void;
}

/** Ítems extra de la cotización, cada uno como ItemCard, con subtotal e ITBIS cobrado y exonerado. */
export const ItemsList: React.FC<ItemsListProps> = ({ items, marginMultiplier, totals, onAdd, onUpdate, onRemove }) => (
  <>
    <SubHeader
      title="Ítems extra"
      action={<SubHeaderIconButton label="Agregar ítem" icon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} onClick={onAdd} />}
    />
    {items.length === 0 ? (
      <p className="m-0 text-[13px] text-pd-muted">Sin ítems extra.</p>
    ) : (
      <>
        {items.map((item, index) => {
          const itbis = itemItbisNote(item);
          const margin = itemWithMarginUSD(item, marginMultiplier);
          const key = item.id || String(index);
          return (
            <ItemCard
              key={key}
              title={item.description}
              onTitleChange={(description) => onUpdate(item.id, { description })}
              titleLabel={`Descripción del ítem ${index + 1}`}
              titlePlaceholder="Descripción del ítem"
              onRemove={() => onRemove(item.id)}
              removeLabel={`Eliminar ítem ${index + 1}`}
            >
              <div className="grid grid-cols-[52px_52px_minmax(0,1fr)_auto] items-center gap-1.5">
                <Field
                  type="number"
                  min="1"
                  mono
                  aria-label="Cantidad"
                  value={item.quantity}
                  onChange={(raw) => onUpdate(item.id, { quantity: parseQuantity(raw) })}
                />
                <Field
                  aria-label="Unidad"
                  placeholder="UD"
                  value={item.unit || 'UD'}
                  onChange={(raw) => onUpdate(item.id, { unit: raw.toUpperCase() })}
                />
                <NumberField
                  step="0.01"
                  min="0"
                  prefix="$"
                  aria-label="Precio unitario"
                  value={item.unitPriceUSD}
                  onValue={(v) => onUpdate(item.id, { unitPriceUSD: Math.max(0, v) })}
                />
                <span className="min-w-[62px] text-right font-mono text-[13px] font-semibold text-pd-text">${usd(itemTotalUSD(item))}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <TagToggle pressed={itbis.exonerated} onChange={(exonerated) => onUpdate(item.id, itbisPatch(exonerated))}>
                  ITBIS exento
                </TagToggle>
                <TagToggle pressed={margin.withMargin} onChange={(applyMargin) => onUpdate(item.id, { applyMargin })}>
                  Con margen
                </TagToggle>
              </div>
              <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-pd-muted">
                <span>{itbis.exonerated ? `ITBIS −$${usd(itbis.amountUSD)}` : `ITBIS +$${usd(itbis.amountUSD)}`}</span>
                <span>{margin.withMargin ? `Con margen $${usd(margin.amountUSD)}` : `Costo directo $${usd(margin.amountUSD)}`}</span>
              </div>
            </ItemCard>
          );
        })}
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-pd-muted">Subtotal ítems</span>
          <span className="font-mono text-[13px] font-semibold text-pd-text">${usd(totals.itemsSubtotalUSD)}</span>
        </div>
        {totals.chargedITBISUSD > 0 && (
          <div className="flex items-baseline justify-between text-xs text-pd-warn-text">
            <span>ITBIS cobrado al cliente</span>
            <span className="font-mono">+${usd(totals.chargedITBISUSD)}</span>
          </div>
        )}
        {totals.exoneratedITBISUSD > 0 && (
          <div className="flex items-baseline justify-between text-xs text-pd-muted">
            <span>ITBIS exonerado (Ley 57-07)</span>
            <span className="font-mono">${usd(totals.exoneratedITBISUSD)}</span>
          </div>
        )}
      </>
    )}
  </>
);
