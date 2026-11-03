import React from 'react';
import type { ProjectSimulation } from '../../types';
import { projectDateLabel, projectDateStamps, type ProjectDateLabels } from './projectPresentation';

interface ProposalDatesProps {
  project: Pick<ProjectSimulation, 'createdAt' | 'updatedAt'>;
  /** `inline`: en una línea separadas por "·"; `stacked`: una fecha por línea. */
  layout?: 'inline' | 'stacked';
  /** `short` abrevia "Actualizada" a "Act." para espacios estrechos. */
  labels?: ProjectDateLabels;
  className?: string;
}

/** Fecha de creación y de última actualización de una propuesta, cada una con su etiqueta y su `<time>`. */
export function ProposalDates({ project, layout = 'inline', labels = 'long', className }: ProposalDatesProps) {
  const stamps = projectDateStamps(project);
  if (!stamps.length) return <span className={className}>Sin fecha</span>;
  const items = stamps.map((s) => (
    <span key={s.kind} className="whitespace-nowrap">
      {projectDateLabel(s.kind, labels)} <time dateTime={s.iso}>{s.text}</time>
    </span>
  ));
  if (layout === 'stacked') {
    return <span className={`flex flex-col ${className ?? ''}`.trim()}>{items}</span>;
  }
  return (
    <span className={className}>
      {items.flatMap((item, index) => (index ? [<span key={`sep-${index}`} aria-hidden="true"> · </span>, item] : [item]))}
    </span>
  );
}
