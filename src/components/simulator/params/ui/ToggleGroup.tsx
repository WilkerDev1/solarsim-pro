import React from 'react';
import { cx } from './cx';

export interface ToggleOption<T extends string | number | boolean> {
  value: T;
  label: string;
}

export interface ToggleGroupProps<T extends string | number | boolean> {
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Alto de los botones en px: 30 por defecto, 28 en tarjetas compactas. */
  compact?: boolean;
}

/** De 2 a 3 opciones; la activa se rellena con el acento. */
export function ToggleGroup<T extends string | number | boolean>({ options, value, onChange, ariaLabel, disabled, compact }: ToggleGroupProps<T>): React.ReactElement {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx('grid gap-1', options.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              'cursor-pointer rounded-md border-0 text-[13px] disabled:cursor-default disabled:opacity-50',
              compact ? 'h-7' : 'h-[30px]',
              active ? 'bg-pd-accent font-semibold text-pd-on-accent' : 'bg-pd-field font-medium text-pd-muted',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
