import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cx } from './cx';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  min?: number;
  max?: number;
  step?: number;
  /** Deshabilita el contador completo (cantidad calculada automáticamente). */
  disabled?: boolean;
  /** 34 px de alto en lugar de 30, para alinear con un selector. */
  tall?: boolean;
}

const stepButton = 'flex h-7 w-7 cursor-pointer items-center justify-center border-0 bg-transparent text-pd-strong disabled:cursor-default disabled:text-pd-subtle';

/** Texto confirmado → valor: vacío o no numérico conserva el actual; el resto se limita a [min, max]. */
export function commitStepperDraft(text: string, current: number, min: number, max: number): number {
  const next = Number(text);
  if (text.trim() === '' || !Number.isFinite(next)) return current;
  return Math.min(max, Math.max(min, next));
}

export const Stepper: React.FC<StepperProps> = ({ value, onChange, ariaLabel, min = 0, max = Number.POSITIVE_INFINITY, step = 1, disabled, tall }) => {
  const [draft, setDraft] = React.useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const next = commitStepperDraft(draft, value, min, max);
    if (next !== value) onChange(next);
  };
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <div role="group" aria-label={ariaLabel} className={cx('flex flex-none items-center rounded-md border border-pd-field-border bg-pd-field', tall ? 'h-[34px]' : 'h-[30px]')}>
      <button type="button" aria-label="Menos" disabled={disabled || value <= min} onClick={() => { setDraft(null); onChange(clamp(value - step)); }} className={stepButton}>
        <Minus size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Cantidad"
        value={draft ?? value}
        disabled={disabled}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') commit(); }}
        className="w-[34px] border-0 bg-transparent p-0 text-center font-mono text-[13px] font-semibold text-pd-text outline-none disabled:opacity-100 disabled:[-webkit-text-fill-color:var(--pd-text)]"
      />
      <button type="button" aria-label="Más" disabled={disabled || value >= max} onClick={() => { setDraft(null); onChange(clamp(value + step)); }} className={stepButton}>
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
};
