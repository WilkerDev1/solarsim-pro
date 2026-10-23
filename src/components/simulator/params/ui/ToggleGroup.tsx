import React from 'react';
import { cx } from './cx';

/** Índice al que mueve una tecla de flecha/Home/End dentro de un radiogroup; null si la tecla no navega. */
export function nextRadioIndex(index: number, key: string, count: number): number | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': return (index + 1) % count;
    case 'ArrowLeft': case 'ArrowUp': return (index - 1 + count) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

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
  const groupRef = React.useRef<HTMLDivElement>(null);
  const selected = options.findIndex(option => option.value === value);
  const tabStop = selected >= 0 ? selected : 0;
  const onKeyDown = (event: React.KeyboardEvent) => {
    const current = options.findIndex((_, index) => index === Number((event.target as HTMLElement).dataset.index));
    const next = current < 0 ? null : nextRadioIndex(current, event.key, options.length);
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div ref={groupRef} role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className={cx('grid gap-1', options.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === tabStop ? 0 : -1}
            data-index={index}
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
