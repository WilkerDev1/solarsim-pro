import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { findAgentTool } from '../../../shared/agentTools/definitions';

/** Teclado del compositor: Enter envía, Shift+Enter salta línea; nunca envía durante una composición IME. */
export function composerKeyAction(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing: boolean }): 'send' | null {
  if (e.key !== 'Enter' || e.isComposing) return null;
  if (e.ctrlKey || e.metaKey) return 'send';
  return e.shiftKey || e.altKey ? null : 'send';
}

/** Nombre legible de una herramienta para el progreso por pasos (título declarado o el nombre técnico). */
export function toolStepLabel(name: string): string {
  return findAgentTool(name)?.title || name.replace(/_/g, ' ');
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Campo que crece con el contenido hasta un máximo y luego desplaza. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement>, value: string, max = 220) {
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [ref, value, max]);
  // El panel del chat es redimensionable: al cambiar el ancho cambia el número de líneas.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, max)}px`;
      });
    });
    let frame = 0;
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [ref, max]);
}

/**
 * Desplazamiento anclado al final: sigue los mensajes nuevos mientras la persona está abajo; si subió a
 * leer, no la arrastra y ofrece volver al final.
 */
export function useStickToBottom(ref: RefObject<HTMLElement>, deps: unknown[]) {
  const stick = useRef(true);
  const [away, setAway] = useState(false);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stick.current = atBottom;
    setAway(!atBottom);
  }, [ref]);
  const scrollToBottom = useCallback((smooth = true) => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    stick.current = true;
    setAway(false);
  }, [ref]);
  useEffect(() => {
    if (stick.current) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { onScroll, away, scrollToBottom, stick };
}

/** Segundos transcurridos mientras `active`; vuelve a cero al terminar. */
export function useElapsedSeconds(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}
