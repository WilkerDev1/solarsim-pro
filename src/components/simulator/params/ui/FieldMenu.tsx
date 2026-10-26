import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from './cx';
import { moveActiveIndex, placePopover, type PopoverPlacement } from './selectNavigation';

export interface FieldMenuItem {
  label: string;
  /** Dato a la derecha, en mono (p. ej. la tarifa oficial). */
  hint?: string;
  /** Ya aplicado: se marca con ✓ y no hace nada. */
  checked?: boolean;
  onSelect: () => void;
}

export interface FieldMenuProps {
  ariaLabel: string;
  items: FieldMenuItem[];
  /** Punto ámbar en la flecha: hay una acción pendiente (p. ej. el precio difiere del oficial). */
  attention?: boolean;
  /** Abre el menú al montar (pruebas y capturas). */
  defaultOpen?: boolean;
}

const ITEM_HEIGHT = 32;

/**
 * Flecha dentro de un `Field` (ranura derecha) que abre acciones en un portal, con el estilo de `SelectField`.
 * El campo sigue editándose a mano; el panel se alinea con el campo completo, no con la flecha.
 */
export const FieldMenu: React.FC<FieldMenuProps> = ({ ariaLabel, items, attention, defaultOpen }) => {
  const menuId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(Boolean(defaultOpen));
  const [active, setActive] = React.useState(-1);
  const [place, setPlace] = React.useState<PopoverPlacement | null>(null);
  const itemId = (index: number) => `${menuId}-item-${index}`;

  const reposition = React.useCallback(() => {
    const anchor = triggerRef.current?.parentElement ?? triggerRef.current;
    if (!anchor) return;
    setPlace(placePopover(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, items.length * ITEM_HEIGHT + 8));
  }, [items.length]);

  const openMenu = () => { setActive(0); setOpen(true); };
  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setPlace(null);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const choose = (index: number) => {
    const item = items[index];
    if (item && !item.checked) item.onSelect();
    closeMenu(true);
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

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(); }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
    else if (event.key === 'Tab') closeMenu();
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (active >= 0) choose(active); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setActive(moveActiveIndex(active, event.key, items.length)); }
  };

  const panel = open && place && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        id={menuId}
        role="menu"
        aria-label={ariaLabel}
        onMouseDown={event => event.preventDefault()}
        style={{ top: place.top, bottom: place.bottom, left: place.left, minWidth: place.minWidth, maxHeight: place.maxHeight }}
        className="pd-select-panel fixed z-[1100] w-max max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-lg border border-pd-border bg-pd-panel p-1 shadow-lg"
      >
        {items.map((item, index) => (
          <div
            key={item.label}
            id={itemId(index)}
            role="menuitemcheckbox"
            aria-checked={Boolean(item.checked)}
            onMouseMove={() => { if (active !== index) setActive(index); }}
            onClick={() => choose(index)}
            className={cx(
              'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px]',
              index === active && 'bg-pd-field',
              item.checked ? 'font-semibold text-pd-accent' : 'font-medium text-pd-text',
            )}
          >
            <Check size={14} strokeWidth={2.5} aria-hidden="true" className={cx('flex-none', !item.checked && 'invisible')} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint && <span className="flex-none pl-2 font-mono text-[11px] font-medium text-pd-muted">{item.hint}</span>}
          </div>
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
        aria-activedescendant={open && active >= 0 ? itemId(active) : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onKeyDown}
        onBlur={event => { if (!panelRef.current?.contains(event.relatedTarget as Node | null)) closeMenu(); }}
        className="relative -mr-1 flex h-6 w-5 flex-none cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 text-pd-muted hover:text-pd-text focus-visible:text-pd-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pd-accent"
      >
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cx('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
        {attention && <span aria-hidden="true" className="absolute right-0 top-0.5 h-1.5 w-1.5 rounded-full bg-pd-warn-text" />}
      </button>
      {panel}
    </>
  );
};
