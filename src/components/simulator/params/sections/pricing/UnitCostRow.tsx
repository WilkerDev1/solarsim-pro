import React from 'react';
import { NumberField } from './NumberField';

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
  value: number;
  onChange: (value: number) => void;
}

/** Fila de costo unitario: etiqueta, modelo y proveedores a la izquierda; precio en mono a la derecha. */
export const UnitCostRow: React.FC<UnitCostRowProps> = ({
  id, label, detail, suppliersLabel, onOpenSuppliers, supplierName, supplierTitle, value, onChange,
}) => (
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
      <NumberField id={id} step="any" prefix="$" value={value} onValue={onChange} />
      {supplierName && (
        <span className="mt-0.5 block truncate text-[11px] text-pd-muted" title={supplierTitle}>{supplierName}</span>
      )}
    </div>
  </div>
);
