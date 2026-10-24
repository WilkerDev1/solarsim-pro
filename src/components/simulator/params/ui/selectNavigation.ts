/** Lógica pura del listbox de SelectField: teclado, búsqueda por letras y posición del panel. Sin DOM ni React. */

/** Minúsculas y sin acentos, para comparar «María» con «maria». */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export type SelectKeyAction = 'open' | 'close' | 'close-tab' | 'select' | 'move' | 'typeahead' | null;

const MOVE_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']);

export interface SelectKeyModifiers {
  alt?: boolean;
  ctrl?: boolean;
  /** Hay una búsqueda por letras en curso: el espacio es texto, no «seleccionar». */
  typing?: boolean;
}

/** Qué hace una tecla según el listbox esté abierto o cerrado (patrón select-only combobox de WAI-ARIA). */
export function resolveSelectKey(open: boolean, key: string, modifiers: SelectKeyModifiers = {}): SelectKeyAction {
  const printable = key.length === 1 && !modifiers.ctrl && !modifiers.alt;
  if (!open) {
    if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'ArrowUp') return 'open';
    return printable && key !== ' ' ? 'typeahead' : null;
  }
  if (key === 'ArrowUp' && modifiers.alt) return 'select';
  if (key === 'Enter') return 'select';
  if (key === ' ') return modifiers.typing ? 'typeahead' : 'select';
  if (key === 'Escape') return 'close';
  if (key === 'Tab') return 'close-tab';
  if (MOVE_KEYS.has(key)) return 'move';
  return printable ? 'typeahead' : null;
}

const PAGE_STEP = 10;

/** Nuevo índice activo tras una tecla de navegación. Sin vuelta: se detiene en los extremos, como un select nativo. */
export function moveActiveIndex(active: number, key: string, count: number): number {
  if (count <= 0) return -1;
  const last = count - 1;
  const clamp = (index: number) => Math.min(last, Math.max(0, index));
  switch (key) {
    case 'ArrowDown': return active < 0 ? 0 : clamp(active + 1);
    case 'ArrowUp': return active < 0 ? last : clamp(active - 1);
    case 'Home': return 0;
    case 'End': return last;
    case 'PageDown': return clamp((active < 0 ? 0 : active) + PAGE_STEP);
    case 'PageUp': return clamp((active < 0 ? last : active) - PAGE_STEP);
    default: return active;
  }
}

export interface TypeAheadState {
  buffer: string;
  at: number;
}

export const TYPE_AHEAD_WINDOW_MS = 700;

/** Agrega una letra al buffer; si pasó la ventana desde la última, empieza de nuevo. */
export function extendTypeAhead(state: TypeAheadState, char: string, now: number): TypeAheadState {
  const fresh = now - state.at > TYPE_AHEAD_WINDOW_MS;
  return { buffer: `${fresh ? '' : state.buffer}${char}`.toLowerCase(), at: now };
}

/**
 * Índice de la opción que empieza por el buffer (sin acentos), o -1.
 * Con una sola letra, o la misma letra repetida, avanza a la siguiente coincidencia y da la vuelta;
 * con un prefijo más largo parte de la opción activa para no saltarla.
 */
export function findTypeAheadMatch(labels: readonly string[], buffer: string, from: number): number {
  const query = normalizeSearchText(buffer);
  if (!query || !labels.length) return -1;
  const normalized = labels.map(normalizeSearchText);
  const cycling = [...query].every(char => char === query[0]);
  const needle = cycling ? query[0] : query;
  const start = cycling ? from + 1 : Math.max(from, 0);
  for (let step = 0; step < normalized.length; step += 1) {
    const index = ((start + step) % normalized.length + normalized.length) % normalized.length;
    if (normalized[index].startsWith(needle)) return index;
  }
  return -1;
}

export interface TriggerRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface PopoverPlacement {
  placement: 'top' | 'bottom';
  /** Borde superior (solo si placement = bottom). */
  top?: number;
  /** Distancia al borde inferior de la ventana (solo si placement = top). */
  bottom?: number;
  left: number;
  minWidth: number;
  maxHeight: number;
}

const POPOVER_GAP = 4;
const POPOVER_MARGIN = 8;
const POPOVER_MIN_HEIGHT = 96;

/** Panel debajo del disparador si cabe; si no, hacia el lado con más espacio. Siempre dentro de la ventana. */
export function placePopover(rect: TriggerRect, viewport: { width: number; height: number }, desiredHeight: number): PopoverPlacement {
  const spaceBelow = viewport.height - rect.bottom - POPOVER_GAP - POPOVER_MARGIN;
  const spaceAbove = rect.top - POPOVER_GAP - POPOVER_MARGIN;
  const placement = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
  const space = placement === 'bottom' ? spaceBelow : spaceAbove;
  const left = Math.max(POPOVER_MARGIN, Math.min(rect.left, viewport.width - rect.width - POPOVER_MARGIN));
  const maxHeight = Math.max(POPOVER_MIN_HEIGHT, Math.min(desiredHeight, space));
  return placement === 'bottom'
    ? { placement, top: rect.bottom + POPOVER_GAP, left, minWidth: rect.width, maxHeight }
    : { placement, bottom: viewport.height - rect.top + POPOVER_GAP, left, minWidth: rect.width, maxHeight };
}
