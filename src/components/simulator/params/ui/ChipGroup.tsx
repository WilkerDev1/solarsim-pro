import React from 'react';
import { cx } from './cx';

export interface ChipOption<T extends string | number> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string | number> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

/** Opciones rápidas en rejilla (márgenes sugeridos). */
export function ChipGroup<T extends string | number>({ options, value, onChange, ariaLabel }: ChipGroupProps<T>): React.ReactElement {
  return (
    <div role="group" aria-label={ariaLabel} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx('h-[30px] cursor-pointer rounded-md border-0 text-xs font-semibold', active ? 'bg-pd-accent text-pd-on-accent' : 'bg-pd-field text-pd-strong')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
