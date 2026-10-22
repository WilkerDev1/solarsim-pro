import React from 'react';
import { cx } from './cx';

export interface SquareSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/** Interruptor cuadrado de 34 × 20 px: esquinas de 5 px, botón interior de 3 px. */
export const SquareSwitch: React.FC<SquareSwitchProps> = ({ checked, onChange, ariaLabel, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cx(
      'flex h-5 w-[34px] flex-none cursor-pointer rounded-[5px] border-0 p-0.5 disabled:cursor-default disabled:opacity-50',
      checked ? 'justify-end bg-pd-accent' : 'bg-pd-switch-off',
    )}
  >
    <span
      aria-hidden="true"
      className={cx(
        'h-4 w-4 rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,.25)] dark:shadow-[0_1px_2px_rgba(0,0,0,.4)]',
        checked ? 'bg-pd-on-accent' : 'bg-pd-knob',
      )}
    />
  </button>
);
