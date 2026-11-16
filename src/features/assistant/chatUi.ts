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

/** Ajusta alto y desplazamiento del campo en un solo paso (al escribir y al cambiar el ancho del panel). */
export function fitTextarea(el: { scrollHeight: number; style: { height: string; overflowY: string } }, max: number) {
  el.style.height = 'auto';
  const needed = el.scrollHeight;
  el.style.height = `${Math.min(needed, max)}px`;
  el.style.overflowY = needed > max ? 'auto' : 'hidden';
}

/** Campo que crece con el contenido hasta un máximo y luego desplaza. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement>, value: string, max = 220) {
  useIsomorphicLayoutEffect(() => {
    if (ref.current) fitTextarea(ref.current, max);
  }, [ref, value, max]);
  // El panel del chat es redimensionable: al cambiar el ancho cambia el número de líneas.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitTextarea(el, max));
    });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [ref, max]);
}

/** Arrastrar sobre el compositor: siempre se consume el evento; sólo se acepta cuando se puede adjuntar. */
export function composerDropEffect(state: { busy: boolean; attachDisabled?: boolean }): 'copy' | 'none' {
  return state.busy || state.attachDisabled ? 'none' : 'copy';
}

/** `dragleave` también salta al pasar a un hijo: sólo cuenta cuando el puntero sale del contenedor. */
export function leavesContainer<T>(container: { contains(node: T): boolean }, related: T | null): boolean {
  return !related || !container.contains(related);
}

/** El foco vuelve al campo sólo cuando termina una respuesta (no en cada montaje). */
export function shouldRefocusComposer(previousBusy: boolean, busy: boolean): boolean {
  return previousBusy && !busy;
}

export interface ScrollMetrics { scrollTop: number; scrollHeight: number; clientHeight: number }
/** Respaldo si el navegador no emite `scrollend` tras un desplazamiento suave. */
const PROGRAMMATIC_SCROLL_MS = 700;
const BOTTOM_THRESHOLD = 48;

/**
 * Estado puro del anclaje al final. Los eventos de scroll que provoca el propio desplazamiento programático
 * se ignoran hasta llegar al final, `scrollend`, el temporizador de respaldo o una intención del usuario
 * (rueda, toque, teclado, puntero); sólo el scroll del usuario desancla.
 * `onScroll` devuelve `null` si ignoró el evento o si hay que mostrar «Ir al final».
 */
export function createStickController() {
  let stuck = true;
  let guardUntil = -1;
  return {
    get stuck() { return stuck; },
    beginProgrammatic(now: number) { guardUntil = now + PROGRAMMATIC_SCROLL_MS; stuck = true; },
    endProgrammatic() { guardUntil = -1; },
    userIntent() { guardUntil = -1; },
    onScroll(m: ScrollMetrics, now: number): boolean | null {
      const atBottom = m.scrollHeight - m.scrollTop - m.clientHeight < BOTTOM_THRESHOLD;
      if (guardUntil >= 0 && now <= guardUntil) {
        if (atBottom) guardUntil = -1;
        else return null;
      }
      guardUntil = -1;
      stuck = atBottom;
      return !atBottom;
    },
  };
}

/**
 * Desplazamiento anclado al final: sigue los mensajes nuevos mientras la persona está abajo; si subió a
 * leer, no la arrastra y ofrece volver al final.
 */
export function useStickToBottom(ref: RefObject<HTMLElement>, deps: unknown[]) {
  const controller = useRef(createStickController());
  const [away, setAway] = useState(false);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const result = controller.current.onScroll(el, Date.now());
    if (result !== null) setAway(result);
  }, [ref]);
  const scrollToBottom = useCallback((smooth = true) => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    controller.current.beginProgrammatic(Date.now());
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    setAway(false);
  }, [ref]);
  // Rueda, toque, teclado o puntero durante la animación devuelven el control al usuario; scrollend la cierra.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const intent = () => controller.current.userIntent();
    const end = () => controller.current.endProgrammatic();
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    events.forEach((name) => el.addEventListener(name, intent, { passive: true }));
    el.addEventListener('scrollend', end);
    return () => { events.forEach((name) => el.removeEventListener(name, intent)); el.removeEventListener('scrollend', end); };
  }, [ref]);
  useEffect(() => {
    if (controller.current.stuck) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { onScroll, away, scrollToBottom, controller };
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
