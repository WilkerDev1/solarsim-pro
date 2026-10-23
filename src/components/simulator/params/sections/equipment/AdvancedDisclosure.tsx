import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface AdvancedDisclosureProps {
  /** Texto del botón; «Avanzado» por defecto. */
  label?: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

/** Subsección plegable «Avanzado». El cuerpo sigue montado al plegar, solo se oculta. */
export const AdvancedDisclosure: React.FC<AdvancedDisclosureProps> = ({ label = 'Avanzado', defaultOpen = false, children }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(value => !value)}
        className="flex h-7 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-pd-muted hover:text-pd-text"
      >
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={open ? '' : '-rotate-90'} />
        {label}
      </button>
      <div id={id} hidden={!open} className={open ? 'flex flex-col gap-2.5' : undefined}>
        {children}
      </div>
    </div>
  );
};
