import React from 'react';
import { ChevronDown } from 'lucide-react';
import { bareInput, fieldShell } from './cx';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  /** Obligatorio cuando no hay `label` enlazado por `id`. */
  ariaLabel?: string;
  disabled?: boolean;
  /** Distintivo mono a la derecha (el HSP de la provincia). */
  badge?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({ value, onChange, options, id, ariaLabel, disabled, badge }) => (
  <div className={fieldShell}>
    <select
      id={id}
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      className={`${bareInput} cursor-pointer disabled:cursor-default disabled:opacity-60`}
    >
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {badge && <span className="flex-none whitespace-nowrap rounded bg-pd-chip-bg px-1.5 py-0.5 font-mono text-[11px] font-semibold text-pd-chip-text">{badge}</span>}
    <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className="flex-none text-pd-muted" />
  </div>
);
