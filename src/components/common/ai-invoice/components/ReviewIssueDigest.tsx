import { useEffect, useRef, useState } from 'react';
import { AlertOctagon, AlertTriangle, ArrowRight, ChevronDown, Info } from 'lucide-react';
import { issueModelFromViews, TIER_COPY, type IssueTier, type ReviewIssueModel, type ReviewIssueView } from '../reviewIssues';

const ICONS: Record<IssueTier, typeof Info> = { blocking: AlertOctagon, confirm: AlertTriangle, info: Info };
const VISIBLE = 3;
const CHIP: Record<IssueTier, (n: number) => string> = {
  blocking: (n) => `${n} ${n === 1 ? 'bloquea' : 'bloquean'}`,
  confirm: (n) => `${n} por confirmar`,
  info: (n) => `${n} ${n === 1 ? 'nota' : 'notas'}`,
};

/** Progreso de resolución: el máximo de avisos visto en este borrador es el total. */
export function digestProgress(peak: number, current: number) {
  const total = Math.max(peak, current);
  return { resolved: total - current, total };
}

/** Pico siguiente: crece con los avisos, vuelve a cero sin avisos y arranca de nuevo con un borrador nuevo. */
export function nextPeak(previous: number, current: number, newDraft: boolean): number {
  if (current === 0) return 0;
  return newDraft ? current : Math.max(previous, current);
}

/** Máximo de avisos vistos desde que apareció el borrador (se reinicia sin avisos o cuando `draftKey` cambia: borrador nuevo). */
export function useDigestPeak(current: number, draftKey?: number) {
  const peak = useRef({ key: draftKey, value: current });
  if (peak.current.key !== draftKey) peak.current = { key: draftKey, value: nextPeak(0, current, true) };
  useEffect(() => { peak.current.value = nextPeak(peak.current.value, current, false); }, [current]);
  return Math.max(peak.current.value, current);
}

/** Avisos del borrador en el chat: cabecera con resumen, grupos plegables y filas compactas con destino. */
export function ReviewIssueDigest({ model, issues, onNavigate, peak }: { /** Modelo del contenedor; sin él se deriva de `issues`. */ model?: ReviewIssueModel; issues?: readonly ReviewIssueView[]; onNavigate: (issue: ReviewIssueView) => void; peak?: number }) {
  const { byTier: groups, views } = model ?? issueModelFromViews(issues || []);
  const [expanded, setExpanded] = useState<Partial<Record<IssueTier, boolean>>>({});
  const { resolved, total } = digestProgress(peak ?? views.length, views.length);
  return <section className="proposal-digest" aria-labelledby="proposal-digest-title" aria-live="off">
    <header>
      <h3 id="proposal-digest-title">Revisemos estos detalles</h3>
      <div className="proposal-digest-chips">
        {(['blocking', 'confirm', 'info'] as const).filter((tier) => groups[tier].length).map((tier) => <span key={tier} className="proposal-digest-chip" data-tier={tier}>{CHIP[tier](groups[tier].length)}</span>)}
      </div>
      <div className="proposal-digest-progress">
        <span role="progressbar" aria-label="Avisos resueltos" aria-valuemin={0} aria-valuemax={total} aria-valuenow={resolved}><i style={{ width: `${total ? (resolved / total) * 100 : 0}%` }} /></span>
        <small>{`${resolved} de ${total} resueltos`}</small>
      </div>
    </header>
    {(['blocking', 'confirm', 'info'] as const).filter((tier) => groups[tier].length).map((tier) => {
      const Icon = ICONS[tier];
      const list = groups[tier];
      const open = tier === 'blocking' || (tier === 'confirm' && !groups.blocking.length);
      const shown = expanded[tier] ? list : list.slice(0, VISIBLE);
      return <details key={tier} className="proposal-digest-group" data-tier={tier} open={open}>
        <summary>
          <Icon size={15} aria-hidden />
          <span>{TIER_COPY[tier].group}</span>
          <span className="proposal-count" aria-label={`${list.length} avisos`}>{list.length}</span>
          <ChevronDown size={16} aria-hidden className="proposal-digest-chevron" />
        </summary>
        <ul>{shown.map((issue, i) => {
          const id = `proposal-digest-${tier}-${i}`;
          return <li key={`${issue.code}-${i}`}>
            <p id={id}>{issue.message}</p>
            {issue.target && <button type="button" className="proposal-digest-link" aria-label={`Ir a ${issue.target.label}`} aria-describedby={id} onClick={() => onNavigate(issue)}>
              <span>{issue.target.label}</span><ArrowRight size={13} aria-hidden />
            </button>}
          </li>;
        })}</ul>
        {list.length > VISIBLE && <button type="button" className="proposal-digest-more" aria-expanded={!!expanded[tier]} onClick={() => setExpanded((e) => ({ ...e, [tier]: !e[tier] }))}>
          {expanded[tier] ? 'Ver menos' : `Ver ${list.length - VISIBLE} más`}
        </button>}
      </details>;
    })}
  </section>;
}
