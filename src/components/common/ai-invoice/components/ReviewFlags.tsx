import React from 'react';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { TIER_COPY, worstTier, type IssueTier, type ReviewIssueView } from '../reviewIssues';

const ICONS: Record<IssueTier, typeof Info> = { blocking: AlertOctagon, confirm: AlertTriangle, info: Info };

/** Avisos en línea junto al campo: icono, prefijo textual y mensaje (el color nunca va solo). */
export function IssueNotes({ issues, id }: { issues: readonly ReviewIssueView[]; id?: string }) {
  if (!issues.length) return null;
  return <ul className="proposal-field-issues" id={id}>
    {issues.map((issue, i) => {
      const Icon = ICONS[issue.tier];
      return <li key={`${issue.code}-${i}`} data-tier={issue.tier}><Icon size={14} aria-hidden /><span><strong>{TIER_COPY[issue.tier].prefix}</strong> {issue.message}</span></li>;
    })}
  </ul>;
}

/** Campo de revisión con ancla para el chat y marca en línea cuando la IA no pudo confirmarlo. */
export function Field({ anchor, label, issues, wide, children }: { anchor: string; label: React.ReactNode; issues: readonly ReviewIssueView[]; wide?: boolean; children: React.ReactElement }) {
  const tier = worstTier(issues);
  const noteId = `${anchor}-issues`;
  const control = issues.length
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { 'aria-invalid': tier === 'blocking' ? true : undefined, 'aria-describedby': noteId })
    : children;
  return <div id={anchor} className={`proposal-field${wide ? ' wide' : ''}`} data-flag={tier}>
    <label>{label}{control}</label>
    <IssueNotes id={noteId} issues={issues} />
  </div>;
}
