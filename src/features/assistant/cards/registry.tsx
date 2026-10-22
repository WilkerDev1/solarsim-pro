import React from 'react';
import type { AgentCard } from '../../../../shared/agentCards';
import { CatalogAuditCard } from './CatalogAuditCard';
import { ClientCard } from './ClientCard';

/**
 * Card registry: one React view per AgentCard type. The same payloads are rendered by MCP Apps views for
 * external hosts, so cards must stay pure data. Unknown types render nothing (forward compatible).
 */
export function AgentCardView({ card }: { card: AgentCard }) {
  switch (card.type) {
    case 'catalog-audit':
      return <CatalogAuditCard card={card} />;
    case 'client':
      return <ClientCard card={card} />;
    default:
      return null;
  }
}
