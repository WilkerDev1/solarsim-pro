import React from 'react';
import type { ClientCard as ClientCardData } from '../../../../shared/agentCards';
import { useSimulationStore } from '../../../store/useSimulationStore';

/** Directory client with a shortcut to its detail in the Clients view. */
export function ClientCard({ card }: { card: ClientCardData }) {
  const exists = useSimulationStore((s) => s.clients.some((c) => c.id === card.id));
  return (
    <div className="assistant-result">
      <div className="assistant-result-content">
        <h3>{card.title}</h3>
        {card.detail && <p>{card.detail}</p>}
        {exists && (
          <button
            type="button"
            onClick={() => {
              const s = useSimulationStore.getState();
              s.setActiveClientId(card.id);
              s.setActiveView('clients-hub');
            }}
          >
            Abrir cliente
          </button>
        )}
      </div>
    </div>
  );
}
