import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, FilePlus2, FileText, Plus } from 'lucide-react';

export interface NewQuotationMenuProps {
  onBlank: () => void;
  onFromProposal: () => void;
  /** Ref del botón «Nueva cotización», para devolverle el foco al cerrar el diálogo que abrió una opción. */
  triggerRef?: React.MutableRefObject<HTMLButtonElement | null>;
}

/**
 * «Nueva cotización» del catálogo: menú con «En blanco» y «Desde una propuesta». Botón con `aria-haspopup`/`aria-expanded`;
 * flechas recorren las opciones, Escape cierra y devuelve el foco al botón, y un clic fuera lo cierra.
 */
export const NewQuotationMenu: React.FC<NewQuotationMenuProps> = ({ onBlank, onFromProposal, triggerRef }) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const ownTrigger = useRef<HTMLButtonElement | null>(null);
  const trigger = triggerRef ?? ownTrigger;
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return undefined;
    items.current[0]?.focus();
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  const choose = (action: () => void) => { close(false); action(); };
  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); list[(index + 1) % list.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); list[(index - 1 + list.length) % list.length]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); list[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); list[list.length - 1]?.focus(); }
    else if (event.key === 'Tab') close(false);
  };

  return (
    <div className="qh-new" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="qh-btn qh-btn-primary qh-btn-lg"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />Nueva cotización<ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div className="qh-new-menu" role="menu" id={menuId} aria-label="Nueva cotización" onKeyDown={onMenuKey}>
          <button ref={(el) => { items.current[0] = el; }} type="button" role="menuitem" onClick={() => choose(onBlank)}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span><strong>En blanco</strong><small>Un borrador vacío con el membrete de la empresa</small></span>
          </button>
          <button ref={(el) => { items.current[1] = el; }} type="button" role="menuitem" onClick={() => choose(onFromProposal)}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            <span><strong>Desde una propuesta</strong><small>Cliente, equipos, precios y condiciones de una propuesta</small></span>
          </button>
        </div>
      )}
    </div>
  );
};
