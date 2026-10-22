import React, { useState } from 'react';
import type { CatalogAuditCard as AuditCard } from '../../../../shared/agentCards';
import { useSimulationStore } from '../../../store/useSimulationStore';

const SEVERITY = { error: 'Error', warning: 'Atención', info: 'Info' } as const;

/** Interactive audit result: severity filter, per-row link to the equipment editor. */
export function CatalogAuditCard({ card }: { card: AuditCard }) {
  const [severity, setSeverity] = useState<'all' | keyof typeof SEVERITY>('all');
  const catalog = useSimulationStore((s) => s.equipmentCatalog);
  const openSettings = useSimulationStore((s) => s.openSettingsModal);
  const rows = card.findings.filter((f) => severity === 'all' || f.severity === severity);
  return (
    <div className="assistant-result">
      <div className="assistant-result-content">
        <h3>{card.title}</h3>
        {card.detail && <p>{card.detail}</p>}
        <label className="assistant-audit-filter">
          Mostrar
          <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
            <option value="all">Todos ({card.findings.length})</option>
            {(Object.keys(SEVERITY) as (keyof typeof SEVERITY)[]).map((s) => (
              <option key={s} value={s}>{SEVERITY[s]} ({card.findings.filter((f) => f.severity === s).length})</option>
            ))}
          </select>
        </label>
        <ul className="assistant-audit-list">
          {rows.map((f, i) => {
            const item = f.equipmentId ? catalog.find((e) => e.id === f.equipmentId) : undefined;
            return (
              <li key={`${f.code}-${f.equipmentId || i}`} data-severity={f.severity}>
                <span className="assistant-audit-badge">{SEVERITY[f.severity]}</span>
                <span>{f.message}</span>
                {item && <button type="button" onClick={() => openSettings('equipment')}>Abrir inventario</button>}
              </li>
            );
          })}
        </ul>
        {!rows.length && <p>Sin hallazgos con este filtro.</p>}
      </div>
    </div>
  );
}
