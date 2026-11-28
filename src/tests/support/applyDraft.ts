// Soporte de pruebas (no entra en el bundle). Lo que hacía `applyExtractedInvoice` (el «Aplicar» del modal retirado en F6) con
// un borrador NUEVO: construir la propuesta con `buildProjectFromDraft` (el mismo pipeline de `create_proposal` compartido),
// insertarla, abrirla y sembrar su diario de deshacer. Las suites de caracterización de la fábrica y del deshacer lo usan para
// seguir fijando lo que ese pipeline produce sin depender de un punto de entrada que ya no existe.
import type { ExtractedInvoiceData } from '../../types';
import { buildProjectFromDraft } from '../../domain/proposalDraft';
import { useSimulationStore } from '../../store/useSimulationStore';

export function applyDraftForTest(draft: ExtractedInvoiceData): void {
  const store = useSimulationStore;
  const built = buildProjectFromDraft(store.getState(), draft, true);
  if ('error' in built) { store.setState({ saveFeedbackMessage: built.error }); return; }
  const { project } = built;
  store.setState((state) => ({ projects: [project, ...state.projects], activeProjectId: project.id, activeView: 'simulator' }));
  store.getState().activateUndoJournal(project);
}
