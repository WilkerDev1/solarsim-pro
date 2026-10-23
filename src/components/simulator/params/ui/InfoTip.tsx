import React, { useId } from 'react';
import { Info } from 'lucide-react';

export interface InfoTipProps {
  /** Explicación completa: va en el tooltip y en el aria-label. */
  text: string;
}

/** Ícono ⓘ que sustituye a los párrafos explicativos. */
export const InfoTip: React.FC<InfoTipProps> = ({ text }) => {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={text} aria-describedby={id} className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-md border-0 bg-transparent p-0 text-pd-muted hover:text-pd-text focus-visible:text-pd-text">
        <Info size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        id={id}
        className="invisible absolute bottom-full right-0 z-20 mb-1.5 w-56 rounded-md border border-pd-border bg-pd-panel px-2.5 py-2 text-left text-xs font-normal leading-snug text-pd-text shadow-lg group-focus-within:visible group-hover:visible"
      >
        {text}
      </span>
    </span>
  );
};
