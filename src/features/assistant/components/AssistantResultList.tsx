import React, { useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { visibleAssistantEquipment, visibleAssistantProjects } from '../tools';
import type { AssistantResultListData } from '../types';
import { AssistantResultCard } from './AssistantResultCard';

/** Filas visibles antes de «Ver N más». */
const INITIAL_ROWS = 6;

/**
 * Resultado largo de una búsqueda como lista compacta: una fila por propuesta o equipo con su acción. Una propuesta
 * se abre; un equipo se despliega en su tarjeta (ficha técnica, inventario). Solo lista lo visible en este espacio.
 */
export function AssistantResultList({ list }: { list: AssistantResultListData }) {
  const setActiveProject = useSimulationStore((s) => s.setActiveProject);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  const visible = new Set((list.kind === 'project' ? visibleAssistantProjects() : visibleAssistantEquipment()).map((item) => item.id));
  const items = list.items.filter((item) => visible.has(item.id));
  if (!items.length) return null;
  const shown = showAll ? items : items.slice(0, INITIAL_ROWS);
  const heading = `${list.kind === 'project' ? 'Propuestas' : 'Equipos'} (${items.length})`;
  const rows = (
    <>
      <ul className="assistant-result-list" aria-label={heading}>
        {shown.map((item) => (
          <li key={item.id}>
            <div className="assistant-result-row">
              <span className="assistant-result-row-text">
                <strong>{item.title}</strong>
                {item.detail && <small>{item.detail}</small>}
              </span>
              {list.kind === 'project' ? (
                <button type="button" onClick={() => { if (visibleAssistantProjects().some((p) => p.id === item.id)) setActiveProject(item.id); }}>
                  Abrir
                </button>
              ) : (
                <button type="button" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? undefined : item.id)}>
                  {expanded === item.id ? 'Ocultar' : 'Ver'}
                </button>
              )}
            </div>
            {expanded === item.id && <AssistantResultCard card={item} />}
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <button type="button" className="assistant-result-more" onClick={() => setShowAll(true)}>
          Ver {items.length - shown.length} más
        </button>
      )}
    </>
  );
  if (list.collapsed)
    return (
      <details className="assistant-result assistant-result-fold">
        <summary>Ver los {items.length} resultados de la búsqueda</summary>
        {rows}
      </details>
    );
  return (
    <div className="assistant-result">
      <div className="assistant-result-content">
        <h3>{heading}</h3>
        {rows}
      </div>
    </div>
  );
}
