/**
 * Listado de la actividad de agentes (Ajustes → Agentes). Puro: lo usa el panel y lo prueba `testAgentActivityLegacySource`.
 *
 * La fuente `proposal-assistant` (el modal «Asistente de propuestas», retirado en F6) ya no ejecuta nada, pero las
 * instalaciones que actualizan traen sus entradas guardadas: se siguen leyendo, con su etiqueta «anterior», y se pueden
 * deshacer como siempre. Por eso el tipo y la etiqueta se conservan aquí aunque nadie vuelva a escribir con esa fuente.
 */
import type { AgentSource } from '../../../shared/agentTools/types';
import { subjectHeadline } from './documentTextLog';
import type { AgentActivityEntry } from '../../store/slices/agentSlice';

const SOURCE_LABEL: Readonly<Record<AgentSource, string>> = {
  'app-assistant': 'Asistente general',
  'proposal-assistant': 'Asistente de propuestas (anterior)',
  mcp: 'Agente externo',
};

/** Etiqueta del origen; un origen que esta versión no conoce (estado guardado por otra versión) se muestra tal cual. */
export const agentSourceLabel = (source: AgentSource): string => SOURCE_LABEL[source] ?? (String(source || '').trim() || 'Origen desconocido');

export type AgentActivityFilter = 'all' | 'mcp' | 'internal';
/** Filas que muestra el panel como máximo. */
export const AGENT_ACTIVITY_VISIBLE_ROWS = 100;

export interface AgentActivityRow {
  entry: AgentActivityEntry;
  sourceLabel: string;
  /** Qué tocó: el catálogo, la propuesta (con su titular si es un texto del documento) o un cliente. */
  targetLabel: string;
}

export function listAgentActivity(activity: readonly AgentActivityEntry[], filter: AgentActivityFilter): AgentActivityRow[] {
  return activity
    .filter((entry) => filter === 'all' || (filter === 'mcp' ? entry.source === 'mcp' : entry.source !== 'mcp'))
    .slice(0, AGENT_ACTIVITY_VISIBLE_ROWS)
    .map((entry) => ({
      entry,
      sourceLabel: agentSourceLabel(entry.source),
      targetLabel: entry.targetType === 'equipment' ? 'Catálogo' : entry.subject ? subjectHeadline(entry.subject) : 'Propuesta',
    }));
}
