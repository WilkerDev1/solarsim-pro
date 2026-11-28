import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cx } from './cx';

export interface ParamSectionProps {
  /** Prefijo de los ids: el cuerpo se llama `${id}-body` y el título `${id}-title`. */
  id: string;
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Contador opcional a la derecha del título (solo Finanzas). */
  badge?: React.ReactNode;
  /** Texto accesible completo del badge. */
  badgeLabel?: string;
  /**
   * «Cambió aquí»: lo que cambió el asistente en esta sección y no se ve en un control (plegada, sin control visible o sin id
   * por campo). Un punto discreto con el detalle en su tooltip; no abre la sección ni mueve el foco (F5a).
   */
  changeHint?: string;
  children?: React.ReactNode;
}

export const ParamSection: React.FC<ParamSectionProps> = ({ id, title, icon, open, onToggle, badge, badgeLabel, changeHint, children }) => (
  <section
    data-dock-anchor={id}
    data-assistant-changed={changeHint ? 'section' : undefined}
    className="border-t border-pd-border"
    aria-labelledby={`${id}-title`}
  >
    <h2 className="m-0">
      <button
        type="button"
        id={`${id}-title`}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className="flex h-12 w-full items-center justify-between gap-2.5 border-0 bg-transparent px-4 text-left text-sm font-medium text-pd-text"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-pd-icon-tile-border bg-pd-icon-tile text-pd-icon-tile-text dark:border-pd-icon-tile-border"
          >
            {icon}
          </span>
          <span className="truncate">{title}</span>
        </span>
        <span className="flex flex-none items-center gap-2">
          {changeHint && (
            <span role="img" aria-label={changeHint} title={changeHint} data-assistant-dot className="h-2 w-2 flex-none rounded-full bg-pd-accent" />
          )}
          {badge != null && (
            <span aria-label={badgeLabel} className="rounded bg-pd-field px-1.5 py-0.5 font-mono text-[11px] font-semibold text-pd-strong">
              {badge}
            </span>
          )}
          {open ? <ChevronUp size={16} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />}
        </span>
      </button>
    </h2>
    <div id={`${id}-body`} hidden={!open} className={cx('flex-col gap-2.5 px-4 pb-[18px] pt-0.5', open && 'flex')}>
      {children}
    </div>
  </section>
);
