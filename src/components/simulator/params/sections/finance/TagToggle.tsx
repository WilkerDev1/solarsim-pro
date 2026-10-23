import React from 'react';
import { Check } from 'lucide-react';

export interface TagToggleProps {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  children: React.ReactNode;
}

/** Etiqueta conmutable de un ítem («ITBIS exento», «Con margen»): activa con borde y texto de acento. */
export const TagToggle: React.FC<TagToggleProps> = ({ pressed, onChange, children }) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={() => onChange(!pressed)}
    className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-2 text-[11px] font-medium ${
      pressed ? 'border-pd-accent bg-pd-panel text-pd-accent' : 'border-pd-outline bg-pd-panel text-pd-muted'
    }`}
  >
    {pressed && <Check size={12} strokeWidth={2} aria-hidden="true" />}
    {children}
  </button>
);
