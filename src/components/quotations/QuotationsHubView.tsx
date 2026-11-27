import { useSimulationStore } from '../../store/useSimulationStore';
import { draftOwnerKey } from '../../utils/draftOwnerKey';
import { QuotationsHub } from './hub/QuotationsHub';
import './hub/quotations-hub.css';
import './hub/new-quotation-menu.css';
import './convert/convert-dialog.css';

/**
 * Catálogo de cotizaciones (docs/QUOTATIONS.md#catálogo). La selección y los filtros son de un espacio de trabajo:
 * cambiar de cuenta u organización remonta la vista.
 */
export function QuotationsHubView() {
  const owner = useSimulationStore((s) => draftOwnerKey(s.workspaceScope, s.syncSettings));
  return <QuotationsHub key={owner} />;
}
