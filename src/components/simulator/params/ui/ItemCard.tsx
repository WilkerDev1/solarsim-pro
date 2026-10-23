import React from 'react';
import { Trash2 } from 'lucide-react';
import { cx } from './cx';

export interface ItemCardProps {
  /** Sin título ni papelera la tarjeta no lleva encabezado (modelo de equipo con selector). */
  title?: string;
  /** Con él el título es una entrada editable; sin él, texto. */
  onTitleChange?: (title: string) => void;
  titleLabel?: string;
  titlePlaceholder?: string;
  onRemove?: () => void;
  removeLabel?: string;
  /** Contenido entre el título y la papelera (monto de un descuento). */
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}

export const ItemCard: React.FC<ItemCardProps> = ({ title, onTitleChange, titleLabel, titlePlaceholder, onRemove, removeLabel = 'Eliminar', trailing, children }) => {
  const hasHeader = title !== undefined || onRemove !== undefined || trailing != null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-pd-border bg-pd-item p-2.5">
      {hasHeader && (
        <div className="flex items-center gap-2">
          {onTitleChange ? (
            <input
              value={title ?? ''}
              onChange={event => onTitleChange(event.target.value)}
              aria-label={titleLabel}
              placeholder={titlePlaceholder}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-medium text-pd-text outline-none placeholder:font-normal placeholder:text-pd-subtle"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-pd-text">{title}</span>
          )}
          {trailing}
          {onRemove && (
            <button
              type="button"
              aria-label={removeLabel}
              onClick={onRemove}
              className={cx('inline-flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-pd-strong hover:text-pd-negative focus-visible:text-pd-negative')}
            >
              <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
};
