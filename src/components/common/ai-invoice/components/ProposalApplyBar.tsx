import { AlertOctagon, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';

export interface PrimaryState { blocking: number; reviewConfirmed: boolean; canApply: boolean; /** Procesando: la casilla está deshabilitada, así que no hay nada que guiar. */ busy?: boolean }
export interface PrimaryAction { mode: 'resolve' | 'confirm' | 'apply' | 'wait'; label: string; blocked: boolean }

/**
 * Qué hace el botón principal del pie. Sigue viéndose principal: con bloqueos lleva al primero,
 * sin la casilla lleva a la casilla y sólo con `canApply` (la misma guarda del hook) crea la propuesta.
 */
export function primaryAction({ blocking, reviewConfirmed, canApply, busy }: PrimaryState): PrimaryAction {
  if (blocking > 0) return { mode: 'resolve', label: `Resolver ${blocking} ${blocking === 1 ? 'bloqueo' : 'bloqueos'}`, blocked: true };
  if (busy) return { mode: 'wait', label: 'Procesando…', blocked: true };
  if (!reviewConfirmed || !canApply) return { mode: 'confirm', label: 'Crear propuesta nueva', blocked: true };
  return { mode: 'apply', label: 'Crear propuesta nueva', blocked: false };
}

interface Handlers { onResolve: () => void; onCreate: () => void; onFocusCheck: () => void }

interface Props extends PrimaryState, Handlers {
  toConfirm: number;
  busy: boolean;
  onConfirmChange: (checked: boolean) => void;
  /** Actualizar la propuesta abierta (secundario); abre la confirmación contextual del contenedor. */
  updateLabel?: string;
  onUpdate?: () => void;
}

/** Pie de la revisión en una fila: casilla compacta, estado y acción principal. */
export function ProposalApplyBar(props: Props) {
  const action = primaryAction(props);
  const { blocking, toConfirm, reviewConfirmed } = props;
  const status = blocking
    ? `${blocking} ${blocking === 1 ? 'bloqueo impide' : 'bloqueos impiden'} crear la propuesta.`
    : !reviewConfirmed ? (toConfirm ? `Marca la revisión · ${toConfirm} por confirmar.` : 'Marca la revisión para continuar.')
    : 'Listo para crear la propuesta.';
  const tier = blocking ? 'blocking' : reviewConfirmed ? 'ok' : 'confirm';
  const Icon = blocking ? AlertOctagon : reviewConfirmed ? CheckCircle2 : ShieldCheck;
  return <footer className="proposal-apply" aria-label="Paso final">
    <div className="proposal-apply-check">
      <label data-checked={reviewConfirmed || undefined} data-locked={blocking > 0 || undefined}>
        <input id="proposal-review-check" type="checkbox" checked={reviewConfirmed} disabled={props.busy || blocking > 0} aria-describedby="proposal-apply-status" onChange={(e) => props.onConfirmChange(e.target.checked)} />
        <span>Revisé los datos, equipos, precios y supuestos del borrador.{blocking > 0 && <small> Disponible al resolver los bloqueos.</small>}</span>
      </label>
      <p id="proposal-apply-status" className="proposal-apply-status" data-tier={tier} aria-live="polite"><Icon size={14} aria-hidden />{status}</p>
    </div>
    <div className="proposal-actions">
      {props.updateLabel && props.onUpdate && <button type="button" disabled={props.busy || !props.canApply} onClick={props.onUpdate}>{props.updateLabel}</button>}
      <button type="button" className="proposal-primary" data-mode={action.mode} aria-disabled={action.blocked || undefined} aria-describedby="proposal-apply-status"
        onClick={() => ProposalApplyBar.activate(primaryAction(props), props)}>
        {action.label}{action.mode === 'resolve' && <ArrowRight size={16} aria-hidden />}
      </button>
    </div>
  </footer>;
}

/** Única ruta del clic: crear sólo en modo `apply`; el resto guía al usuario. */
ProposalApplyBar.activate = (action: PrimaryAction, handlers: Handlers) => {
  if (action.mode === 'resolve') handlers.onResolve();
  else if (action.mode === 'confirm') handlers.onFocusCheck();
  else if (action.mode === 'apply') handlers.onCreate();
};
