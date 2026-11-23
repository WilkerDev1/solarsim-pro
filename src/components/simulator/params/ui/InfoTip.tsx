import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { anchorVisible, computeTipPosition, scrollMovesAnchor, scrollReaction, type TipRect } from './infoTipPosition';

/** ¿El ⓘ se ve dentro de la ventana y de sus ancestros con scroll o recorte (el dock)? */
function isInView(element: HTMLElement): boolean {
  const clips: TipRect[] = [];
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowX, overflowY } = window.getComputedStyle(node);
    if (/(auto|scroll|hidden|clip)/.test(overflowX + overflowY)) clips.push(node.getBoundingClientRect());
  }
  return anchorVisible(element.getBoundingClientRect(), clips, { width: window.innerWidth, height: window.innerHeight });
}

export interface InfoTipProps {
  /** Explicación completa: va solo en el tooltip, que el botón describe con `aria-describedby`. */
  text: string;
  /** Nombre accesible corto del botón (no repite el texto). Por defecto «Más información». */
  label?: string;
}

/** Retardo de cierre: deja al puntero cruzar el hueco entre el ⓘ y el tooltip (WCAG 1.4.13, «hoverable»). */
const CLOSE_DELAY_MS = 150;

/**
 * Ícono ⓘ que sustituye a los párrafos explicativos. El tooltip se abre con puntero o foco, se posiciona con
 * `position: fixed` (no lo recorta el overflow del dock) acotado a la ventana, y Escape lo cierra sin mover el foco
 * (WCAG 1.4.13). El scroll de un ancestro o de la ventana lo cierra si se abrió con el puntero; con foco de teclado lo
 * recoloca mientras el ⓘ siga a la vista. El cambio de tamaño lo cierra. El puntero puede pasar al tooltip: React propaga mouseenter/leave a través del portal y el cierre lleva retardo.
 */
export const InfoTip: React.FC<InfoTipProps> = ({ text, label = 'Más información' }) => {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tras montar, el tooltip va en un portal a `body`: ni el overflow ni el apilamiento del dock (barra lateral) lo tapan.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
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

  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  useEffect(() => cancelClose, []);

  useEffect(() => {
    if (!open) { setPos(null); return undefined; }
    place();
    // El tooltip es `fixed`: si el dock, otro ancestro o la ventana se desplazan, el abierto con puntero se cierra en vez
    // de quedarse fijo tapando otros controles. Con foco de teclado (Tab hasta un ⓘ fuera de vista hace que el navegador
    // desplace el dock) sigue al ⓘ mientras esté a la vista. El scroll de un contenedor ajeno no lo toca; el resize lo
    // cierra. Vuelve a abrirse al salir y volver a entrar con el puntero o el foco.
    const onScroll = (event: Event) => {
      const button = buttonRef.current;
      const movesAnchor = scrollMovesAnchor(event.target, button);
      const focused = document.activeElement === button;
      // isInView recorre los ancestros: solo se calcula cuando decide algo (scroll que mueve un ⓘ con foco).
      const reaction = scrollReaction({ movesAnchor, focused, anchorInView: movesAnchor && focused && button ? isInView(button) : false });
      if (reaction === 'follow') place();
      else if (reaction === 'close') setDismissed(true);
    };
    const onResize = () => { setDismissed(true); };
    // Escape cierra también cuando solo hay puntero (sin foco en el ⓘ). El listener vive solo mientras está abierto.
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setDismissed(true); };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, place, text]);

  const tooltip = (
    <span
      ref={tipRef}
      role="tooltip"
      id={id}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
      className={`fixed z-[1200] w-64 whitespace-pre-line rounded-md border border-pd-border bg-pd-panel px-2.5 py-2 text-left text-xs font-normal leading-snug text-pd-text shadow-lg ${open && pos ? 'visible' : 'invisible'}`}
    >
      {text}
    </span>
  );

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => { cancelClose(); setHovered(true); }}
      onMouseLeave={() => {
        cancelClose();
        closeTimer.current = setTimeout(() => { closeTimer.current = null; setHovered(false); if (!focused) setDismissed(false); }, CLOSE_DELAY_MS);
      }}
      onFocus={() => { setFocused(true); }}
      onBlur={() => { setFocused(false); if (!hovered) setDismissed(false); }}
      onKeyDown={(event) => { if (event.key === 'Escape' && open) { setDismissed(true); event.stopPropagation(); } }}
    >
      <button ref={buttonRef} type="button" aria-label={label} aria-describedby={id} className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-md border-0 bg-transparent p-0 text-pd-muted hover:text-pd-text focus-visible:text-pd-text">
        <Info size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      {mounted ? createPortal(tooltip, document.body) : tooltip}
    </span>
  );
};
