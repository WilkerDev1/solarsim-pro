import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from './cx';
import { moveActiveIndex, placePopover, type PopoverPlacement } from './selectNavigation';

export interface FieldMenuItem {
  label: string;
  /** Dato a la derecha, en mono (p. ej. la tarifa oficial). */
  hint?: string;
  /** Ya aplicado: se marca con ✓, queda deshabilitado y no hace nada. */
  checked?: boolean;
  onSelect: () => void;
}

export interface FieldMenuProps {
  ariaLabel: string;
  items: FieldMenuItem[];
  /** Punto ámbar en la flecha: hay una acción pendiente (p. ej. el precio difiere del oficial). */
  attention?: boolean;
}

export type FieldMenuKeyAction = { type: 'open'; focus: number } | { type: 'close' } | { type: 'focus'; index: number } | null;

/** Teclado del botón de menú (WAI-ARIA menu button): flechas abren y recorren, Escape cierra; Enter y Espacio los resuelve el botón nativo. */
export function fieldMenuKey(open: boolean, key: string, focused: number, count: number): FieldMenuKeyAction {
  if (!open) return key === 'ArrowDown' ? { type: 'open', focus: 0 } : key === 'ArrowUp' ? { type: 'open', focus: count - 1 } : null;
  if (key === 'Escape') return { type: 'close' };
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return { type: 'focus', index: moveActiveIndex(focused, key, count) };
  return null;
}

const ITEM_HEIGHT = 32;

/**
 * Flecha dentro de un `Field` (ranura derecha) que abre acciones en un portal, con el estilo de `SelectField`.
 * El campo sigue editándose a mano; el panel se alinea con el campo completo, no con la flecha.
 */
export const FieldMenu: React.FC<FieldMenuProps> = ({ ariaLabel, items, attention }) => {
  const menuId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = React.useState(false);
  const [focusIndex, setFocusIndex] = React.useState(-1);
  const [place, setPlace] = React.useState<PopoverPlacement | null>(null);

  const reposition = React.useCallback(() => {
    const anchor = triggerRef.current?.parentElement ?? triggerRef.current;
    if (!anchor) return;
    setPlace(placePopover(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, items.length * ITEM_HEIGHT + 8));
  }, [items.length]);

  const openMenu = (focus: number) => { setFocusIndex(focus); setOpen(true); };
  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setPlace(null);
    setFocusIndex(-1);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const current = itemRefs.current.findIndex(item => item === document.activeElement);
    const action = fieldMenuKey(open, event.key, current, items.length);
    if (!action) {
      if (event.key === 'Tab') closeMenu();
      return;
    }
    event.preventDefault();
    if (action.type === 'open') openMenu(action.focus);
    else if (action.type === 'close') closeMenu(true);
    else setFocusIndex(action.index);
  };

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  // El foco entra en el ítem activo en cuanto el panel está colocado.
  React.useEffect(() => {
    if (open && place && focusIndex >= 0) itemRefs.current[focusIndex]?.focus();
  }, [open, place !== null, focusIndex]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const panel = open && place && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        id={menuId}
        role="menu"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        onBlur={event => {
          const next = event.relatedTarget as Node | null;
          if (!panelRef.current?.contains(next) && next !== triggerRef.current) closeMenu();
        }}
        style={{ top: place.top, bottom: place.bottom, left: place.left, minWidth: place.minWidth, maxHeight: place.maxHeight }}
        className="pd-select-panel fixed z-[1100] w-max max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-lg border border-pd-border bg-pd-panel p-1 shadow-lg"
      >
        {items.map((item, index) => (
          <button
            key={item.label}
            ref={element => { itemRefs.current[index] = element; }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={item.checked || undefined}
            onMouseMove={() => itemRefs.current[index]?.focus()}
            onClick={() => {
              if (!item.checked) item.onSelect();
              closeMenu(true);
            }}
            className={cx(
              'flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-[13px] outline-none focus:bg-pd-field',
              item.checked ? 'cursor-default font-semibold text-pd-accent' : 'font-medium text-pd-text',
            )}
          >
            <Check size={14} strokeWidth={2.5} aria-hidden="true" className={cx('flex-none', !item.checked && 'invisible')} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint && <span className="flex-none pl-2 font-mono text-[11px] font-medium text-pd-muted">{item.hint}</span>}
          </button>
        ))}
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open && place ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? closeMenu() : openMenu(0))}
        onKeyDown={onKeyDown}
        className="relative -mr-1 flex h-6 w-5 flex-none cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 text-pd-muted hover:text-pd-text focus-visible:text-pd-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pd-accent"
      >
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cx('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
        {attention && <span aria-hidden="true" className="absolute right-0 top-0.5 h-1.5 w-1.5 rounded-full bg-pd-warn-text" />}
      </button>
      {panel}
    </>
  );
};
