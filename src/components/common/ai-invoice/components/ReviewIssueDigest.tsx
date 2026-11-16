import { AlertOctagon, AlertTriangle, ArrowRight, ChevronDown, Info } from 'lucide-react';
import { groupIssues, TIER_COPY, type IssueTier, type ReviewIssueView } from '../reviewIssues';

const ICONS: Record<IssueTier, typeof Info> = { blocking: AlertOctagon, confirm: AlertTriangle, info: Info };

/** Avisos del borrador en el chat: agrupados por gravedad, plegables, con contador y enlace al campo. */
export function ReviewIssueDigest({ issues, onNavigate }: { issues: readonly ReviewIssueView[]; onNavigate: (issue: ReviewIssueView) => void }) {
  const groups = groupIssues(issues);
  const pending = groups.blocking.length + groups.confirm.length;
  return <section className="proposal-digest" aria-labelledby="proposal-digest-title">
    <header>
      <h3 id="proposal-digest-title">Revisemos estos detalles</h3>
      <p>{pending ? `${pending} ${pending === 1 ? 'punto pendiente' : 'puntos pendientes'} antes de crear la propuesta.` : 'Sin pendientes que bloqueen o requieran confirmación.'} Corrígelos aquí o en el borrador; se actualizan mientras editas.</p>
    </header>
    {(['blocking', 'confirm', 'info'] as const).filter(tier => groups[tier].length).map(tier => {
      const Icon = ICONS[tier];
      return <details key={tier} className="proposal-digest-group" data-tier={tier} open={tier !== 'info'}>
        <summary>
          <Icon size={16} aria-hidden />
          <span>{TIER_COPY[tier].group}</span>
          <span className="proposal-count" aria-label={`${groups[tier].length} avisos`}>{groups[tier].length}</span>
          <ChevronDown size={16} aria-hidden className="proposal-digest-chevron" />
        </summary>
        <ul>{groups[tier].map((issue, i) => <li key={`${issue.code}-${i}`}>
          <p>{issue.message}</p>
          {issue.target && <button type="button" className="proposal-digest-link" aria-label={`Ir a ${issue.target.label}: ${issue.message}`} onClick={() => onNavigate(issue)}>
            {issue.target.label}<ArrowRight size={14} aria-hidden />
          </button>}
        </li>)}</ul>
      </details>;
    })}
  </section>;
}
