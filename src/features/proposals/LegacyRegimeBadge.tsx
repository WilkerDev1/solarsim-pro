import { History } from 'lucide-react';
import type { ProjectSimulation } from '../../types';
import { LEGACY_REGIME_BADGE_LABEL, LEGACY_REGIME_BADGE_TOOLTIP, showsLegacyRegimeBadge } from '../../domain/netMeteringUpgrade';

/**
 * Insignia discreta del listado y del resumen: propuesta abierta que sigue en el régimen anterior de medición neta con
 * inyección a la red. Solo informa; no escribe ni publica nada.
 */
export function LegacyRegimeBadge({ project, className = '' }: { project: ProjectSimulation; className?: string }) {
  if (!showsLegacyRegimeBadge(project)) return null;
  return (
    <span
      data-legacy-regime-badge
      title={LEGACY_REGIME_BADGE_TOOLTIP}
      className={`inline-flex w-fit items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 ${className}`}
    >
      <History className="h-3 w-3 shrink-0" aria-hidden="true" />
      {LEGACY_REGIME_BADGE_LABEL}
      <span className="sr-only">. {LEGACY_REGIME_BADGE_TOOLTIP}</span>
    </span>
  );
}
