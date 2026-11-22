import React from 'react';
import { InfoTip } from '../../ui';
import { NumberField } from './NumberField';
import { createPriceCommitTracker } from './priceCommit';

export interface UnitCostRowProps {
  id: string;
  label: string;
  /** Modelo o aclaración bajo la etiqueta («por kWp»). */
  detail?: string;
  /** «N prov.» abre el modal de proveedores; ausente si el modelo no está en el catálogo. */
  suppliersLabel?: string;
  onOpenSuppliers?: () => void;
  /** Proveedor asignado al modelo, bajo el precio. */
  supplierName?: string;
  supplierTitle?: string;
  /** Precio genérico aplicado (sin proveedor): «Genérico» bajo el precio, con la explicación en un ⓘ. */
  genericLabel?: { tip: string };
  /** `undefined`: sin precio (campo vacío); el motor cuenta 0. */
  value: number | undefined;
  /** Cada tecla (el precio se ve al instante en los totales). */
  onChange: (value: number) => void;
  /** Confirmación (Enter, o salir con la ventana enfocada) solo si cambió respecto al valor al entrar. */
  onCommit?: (previousUSD: number | undefined, priceUSD: number) => void;
  /** Acción compacta bajo el precio (la pregunta de la Regla 2). */
  footer?: React.ReactNode;
}

const hasWindowFocus = () => typeof document === 'undefined' || document.hasFocus();

/** Fila de costo unitario: etiqueta, modelo y proveedores a la izquierda; precio en mono a la derecha. */
export const UnitCostRow: React.FC<UnitCostRowProps> = ({
  id, label, detail, suppliersLabel, onOpenSuppliers, supplierName, supplierTitle, genericLabel, value, onChange, onCommit, footer,
}) => {
  const tracker = React.useRef(createPriceCommitTracker());
  // El valor confirmado es el del grupo (cada tecla ya lo escribió); se lee del último render, no del evento.
  const latest = React.useRef(value);
  latest.current = value;
  const commit = (reason: 'enter' | 'blur') => {
    const result = tracker.current.commit(latest.current ?? 0, reason, hasWindowFocus());
    if (result && onCommit) onCommit(result.previousUSD, result.priceUSD);
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px] items-start gap-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[13px] text-pd-text">{label}</label>
        <span className="flex min-w-0 items-center gap-1 text-xs text-pd-muted">
          {detail && <span className="truncate" title={detail}>{detail}</span>}
          {suppliersLabel && onOpenSuppliers && (
            <>
              {detail && <span aria-hidden="true">·</span>}
              <button
                type="button"
                onClick={onOpenSuppliers}
                className="flex-none cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-pd-strong underline underline-offset-2"
              >
                {suppliersLabel}
              </button>
            </>
          )}
        </span>
      </div>
      <div className="min-w-0">
        <NumberField
          id={id}
          step="any"
          prefix="$"
          value={value}
          placeholder={value === undefined ? 'Sin precio' : undefined}
          onValue={onChange}
          onFocus={onCommit ? () => tracker.current.focus(latest.current) : undefined}
          onBlur={onCommit ? () => commit('blur') : undefined}
          onKeyDown={onCommit ? (event) => { if (event.key === 'Enter') commit('enter'); } : undefined}
        />
        {supplierName ? (
          <span className="mt-0.5 block truncate text-[11px] text-pd-muted" title={supplierTitle}>{supplierName}</span>
        ) : genericLabel ? (
          <span className="mt-0.5 flex items-center gap-0.5 text-[11px] text-pd-muted">
            <span>Genérico</span>
            <InfoTip text={genericLabel.tip} label="Sobre el precio genérico" />
          </span>
        ) : null}
        {footer}
      </div>
    </div>
  );
};
