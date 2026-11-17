import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { computeTipPosition } from './infoTipPosition';

export interface InfoTipProps {
  /** Explicación completa: va en el tooltip y en el aria-label. */
  text: string;
}

/**
 * Ícono ⓘ que sustituye a los párrafos explicativos. El tooltip se abre con puntero o foco, se posiciona con
 * `position: fixed` (no lo recorta el overflow del dock) acotado a la ventana, y Escape lo cierra sin mover el foco
 * (WCAG 1.4.13).
 */
export const InfoTip: React.FC<InfoTipProps> = ({ text }) => {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const open = (hovered || focused) && !dismissed;

  const place = useCallback(() => {
    const button = buttonRef.current;
    const tip = tipRef.current;
    if (!button || !tip) return;
    const anchor = button.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    const { left, top } = computeTipPosition(anchor, { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight });
    setPos({ left, top });
  }, []);

  useEffect(() => {
    if (!open) { setPos(null); return undefined; }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place, text]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => { setHovered(true); }}
      onMouseLeave={() => { setHovered(false); if (!focused) setDismissed(false); }}
      onFocus={() => { setFocused(true); }}
      onBlur={() => { setFocused(false); if (!hovered) setDismissed(false); }}
      onKeyDown={(event) => { if (event.key === 'Escape' && open) { setDismissed(true); event.stopPropagation(); } }}
    >
      <button ref={buttonRef} type="button" aria-label={text} aria-describedby={id} className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-md border-0 bg-transparent p-0 text-pd-muted hover:text-pd-text focus-visible:text-pd-text">
        <Info size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <span
        ref={tipRef}
        role="tooltip"
        id={id}
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
        className={`fixed z-50 w-64 whitespace-pre-line rounded-md border border-pd-border bg-pd-panel px-2.5 py-2 text-left text-xs font-normal leading-snug text-pd-text shadow-lg ${open && pos ? 'visible' : 'invisible'}`}
      >
        {text}
      </span>
    </span>
  );
};
