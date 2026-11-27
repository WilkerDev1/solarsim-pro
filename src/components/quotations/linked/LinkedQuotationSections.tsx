import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuotationsFeature } from '../../../features/application/quotationsFeature';
import { quotationsForClient, quotationsFromProposal } from '../../../features/quotations/linkedQuotations';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { localIsoDate } from '../../../utils/localDate';
import { LinkedQuotationsList } from './LinkedQuotationsList';

/** Cotizaciones creadas desde una propuesta, en su resumen. Con la función `quotations` apagada no se muestra. */
export const ProposalQuotationsSection: React.FC<{ projectId: string; className?: string }> = ({ projectId, className = 'summary-section summary-quotations' }) => {
  const enabled = useQuotationsFeature();
  const { quotations, deletionQueue, openQuotation, sidebarTheme } = useSimulationStore(useShallow((s) => ({
    quotations: s.quotations, deletionQueue: s.quotationDeletionQueue, openQuotation: s.openQuotation, sidebarTheme: s.sidebarTheme,
  })));
  const linked = useMemo(() => quotationsFromProposal(quotations, projectId, deletionQueue), [quotations, projectId, deletionQueue]);
  if (!enabled) return null;
  return (
    <section className={className} aria-labelledby={`proposal-quotations-${projectId}`}>
      <header>
        <h2 id={`proposal-quotations-${projectId}`}>Cotizaciones</h2>
        <p>Creadas desde esta propuesta.</p>
      </header>
      <LinkedQuotationsList
        quotations={linked}
        today={localIsoDate()}
        onOpen={openQuotation}
        label="Cotizaciones creadas desde esta propuesta"
        emptyText="Aún no hay cotizaciones creadas desde esta propuesta."
        theme={sidebarTheme}
      />
    </section>
  );
};

/** Cotizaciones enlazadas a un cliente del directorio, en su panel de detalle. Con la función apagada no se muestra. */
export const ClientQuotationsSection: React.FC<{ clientId: string }> = ({ clientId }) => {
  const enabled = useQuotationsFeature();
  const { quotations, deletionQueue, openQuotation, sidebarTheme } = useSimulationStore(useShallow((s) => ({
    quotations: s.quotations, deletionQueue: s.quotationDeletionQueue, openQuotation: s.openQuotation, sidebarTheme: s.sidebarTheme,
  })));
  const linked = useMemo(() => quotationsForClient(quotations, clientId, deletionQueue), [quotations, clientId, deletionQueue]);
  if (!enabled) return null;
  return (
    <section className="cl-section" aria-labelledby="client-quotations-title">
      <h3 id="client-quotations-title">Cotizaciones</h3>
      <LinkedQuotationsList
        quotations={linked}
        today={localIsoDate()}
        onOpen={openQuotation}
        label="Cotizaciones del cliente"
        emptyText="Sin cotizaciones enlazadas a este cliente."
        theme={sidebarTheme}
      />
    </section>
  );
};
