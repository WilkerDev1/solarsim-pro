import React from 'react';
import { bareInput, cx, fieldShell } from './cx';

export interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'onChange' | 'value' | 'size'> {
  value: string | number;
  onChange: (value: string) => void;
  /** Prefijo de unidad ($, RD$). */
  prefix?: string;
  /** Sufijo de unidad (%, kWh). */
  suffix?: string;
  mono?: boolean;
  /** Identificador bloqueado: borde punteado y entrada deshabilitada. */
  locked?: boolean;
  /** Ranura a la derecha: un WarnChip o una FieldAction. */
  right?: React.ReactNode;
}

const unit = 'whitespace-nowrap text-xs text-pd-muted';

/**
 * Mientras el campo tiene el foco se muestra lo que se escribe, aunque el valor guardado lo normalice
 * (vacío → 0): así se puede borrar y teclear un precio sin que reaparezca el 0 delante. Al salir se ve el valor guardado.
 */
export const Field: React.FC<FieldProps> = ({ value, onChange, prefix, suffix, mono, locked, right, disabled, className, onFocus, onBlur, ...input }) => {
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <div className={cx(fieldShell, locked && 'border-dashed border-pd-field-ro-border bg-pd-field-ro')}>
      {prefix && <span className={unit}>{prefix}</span>}
      <input
        {...input}
        value={draft ?? value}
        onFocus={event => { setDraft(String(value)); onFocus?.(event); }}
        onBlur={event => { setDraft(null); onBlur?.(event); }}
        onChange={event => { setDraft(event.target.value); onChange(event.target.value); }}
        disabled={disabled || locked}
        className={cx(
          bareInput,
          // Un chip a la derecha no puede dejar el número sin espacio.
          right != null && 'min-w-[7ch]',
          'disabled:text-pd-strong disabled:opacity-100 disabled:[-webkit-text-fill-color:var(--pd-strong)]',
          mono && 'font-mono',
          className,
        )}
      />
      {suffix && <span className={unit}>{suffix}</span>}
      {right}
    </div>
  );
};

/** Chip ámbar para un valor distinto al oficial; al pulsarlo se aplica el oficial. */
export const WarnChip: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...button }) => (
  <button
    type="button"
    {...button}
    className={cx('h-[22px] flex-none cursor-pointer rounded border-0 bg-pd-warn-bg px-1.5 font-mono text-[11px] font-semibold text-pd-warn-text', className)}
  >
    {children}
  </button>
);

/** Acción corta dentro del campo, en acento («Hoy»). */
export const FieldAction: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...button }) => (
  <button
    type="button"
    {...button}
    className={cx('flex-none cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-pd-accent', className)}
  >
    {children}
  </button>
);
