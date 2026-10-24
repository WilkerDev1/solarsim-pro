import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cx, fieldShell } from './cx';
import {
  extendTypeAhead, findTypeAheadMatch, moveActiveIndex, placePopover, resolveSelectKey,
  type PopoverPlacement, type TypeAheadState,
} from './selectNavigation';

export interface SelectOption {
  value: string;
  label: string;
  /** Dato secundario a la derecha de la opción, en mono (p. ej. el HSP de la provincia). */
  hint?: string;
}

export interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  /** Obligatorio cuando no hay `label` enlazado por `id`. */
  ariaLabel?: string;
  disabled?: boolean;
  /** Distintivo mono a la derecha (el HSP de la provincia). */
  badge?: string;
  /** Abre el panel al montar (pruebas y capturas). */
  defaultOpen?: boolean;
}

const PANEL_MAX_HEIGHT = 280;
const OPTION_HEIGHT = 32;

/** Listbox propio (combobox select-only de WAI-ARIA): el botón completo abre un panel en un portal, el foco no sale del botón. */
export const SelectField: React.FC<SelectFieldProps> = ({ value, onChange, options, id, ariaLabel, disabled, badge, defaultOpen }) => {
  const listId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const typeAhead = React.useRef<TypeAheadState>({ buffer: '', at: 0 });
  const centerOnOpen = React.useRef(false);
  const [open, setOpen] = React.useState(Boolean(defaultOpen) && !disabled);
  const [active, setActive] = React.useState(-1);
  const [place, setPlace] = React.useState<PopoverPlacement | null>(null);

  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = options[selectedIndex];
  const optionId = (index: number) => `${listId}-opt-${index}`;
  const desiredHeight = Math.min(PANEL_MAX_HEIGHT, options.length * OPTION_HEIGHT + 8);

  const reposition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPlace(placePopover(rect, { width: window.innerWidth, height: window.innerHeight }, desiredHeight));
  }, [desiredHeight]);

  const openList = (nextActive?: number) => {
    if (disabled || !options.length) return;
    centerOnOpen.current = true;
    setActive(nextActive ?? selectedIndex);
    setOpen(true);
  };
  const closeList = (restoreFocus = false) => {
    setOpen(false);
    setPlace(null);
    typeAhead.current = { buffer: '', at: 0 };
    if (restoreFocus) triggerRef.current?.focus();
  };
  const choose = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    closeList(true);
  };

  React.useEffect(() => { if (disabled && open) closeList(); }, [disabled, open]);

  // Posición: al abrir y al desplazar o redimensionar cualquier contenedor (el dock hace scroll).
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

  // Clic fuera: cierra sin mover el foco.
  React.useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closeList();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Mantiene visible la opción activa; al abrir centra la seleccionada.
  React.useLayoutEffect(() => {
    const panel = panelRef.current;
    const element = active >= 0 ? panel?.querySelector<HTMLElement>(`[id="${optionId(active)}"]`) : null;
    if (!panel || !element || !place) return;
    if (centerOnOpen.current) {
      panel.scrollTop = element.offsetTop - (panel.clientHeight - element.offsetHeight) / 2;
      centerOnOpen.current = false;
    } else {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [active, place !== null]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const typing = Date.now() - typeAhead.current.at <= 700 && typeAhead.current.buffer !== '';
    const action = resolveSelectKey(open, event.key, { alt: event.altKey, ctrl: event.ctrlKey || event.metaKey, typing });
    if (!action) return;
    if (action !== 'close-tab') event.preventDefault();
    switch (action) {
      case 'open':
        openList(event.key === 'ArrowUp' && selectedIndex < 0 ? options.length - 1 : undefined);
        break;
      case 'close': closeList(true); break;
      case 'close-tab': closeList(); break;
      case 'select': if (active >= 0) choose(active); else closeList(true); break;
      case 'move': setActive(moveActiveIndex(active, event.key, options.length)); break;
      case 'typeahead': {
        typeAhead.current = extendTypeAhead(typeAhead.current, event.key, Date.now());
        const match = findTypeAheadMatch(options.map(option => option.label), typeAhead.current.buffer, active >= 0 ? active : selectedIndex);
        if (match < 0) break;
        if (open) setActive(match); else openList(match);
        break;
      }
      default: break;
    }
  };

  const panel = open && place && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        onMouseDown={event => event.preventDefault()}
        style={{
          top: place.top, bottom: place.bottom, left: place.left, minWidth: place.minWidth, maxHeight: place.maxHeight,
          transformOrigin: place.placement === 'top' ? 'bottom left' : 'top left',
        }}
        className="pd-select-panel fixed z-[1100] w-max max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-lg border border-pd-border bg-pd-panel p-1 shadow-lg"
      >
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <div
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={isSelected}
              onMouseMove={() => { if (active !== index) setActive(index); }}
              onClick={() => choose(index)}
              className={cx(
                'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px]',
                index === active && 'bg-pd-field',
                isSelected ? 'font-semibold text-pd-accent' : 'font-medium text-pd-text',
              )}
            >
              <Check size={14} strokeWidth={2.5} aria-hidden="true" className={cx('flex-none', !isSelected && 'invisible')} />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint && <span className="flex-none pl-2 font-mono text-[11px] font-medium text-pd-muted">{option.hint}</span>}
            </div>
          );
        })}
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open && place ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onKeyDown}
        onBlur={event => { if (!panelRef.current?.contains(event.relatedTarget as Node | null)) closeList(); }}
        className={cx(
          fieldShell,
          'w-full cursor-pointer text-left text-[13px] font-medium text-pd-text outline-none focus-visible:border-pd-accent focus-visible:ring-1 focus-visible:ring-pd-accent disabled:cursor-default disabled:opacity-60',
          open && 'border-pd-accent',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ''}</span>
        {badge && <span className="flex-none whitespace-nowrap rounded bg-pd-chip-bg px-1.5 py-0.5 font-mono text-[11px] font-semibold text-pd-chip-text">{badge}</span>}
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cx('flex-none text-pd-muted transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {panel}
    </>
  );
};
