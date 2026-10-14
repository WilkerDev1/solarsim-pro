import React from 'react';
import { createRoot } from 'react-dom/client';
import { PDFAttachmentStorage } from '../../../src/services/pdfAttachmentStorage';
import { PDFDocument } from 'pdf-lib';
import { useSimulationStore as store } from '../../../src/store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { PDFAttachmentsSection } from '../../../src/components/pdf/controls/PDFAttachmentsSection';
import { EquipmentParamsSection } from '../../../src/components/simulator/sidebar/EquipmentParamsSection';
import '../../../src/index.css';
const p = structuredClone(BENCHMARK_PROJECT);
p.id = 'qa-simulator-datasheets'; p.specs.hasBattery = false; p.specs.batteryCount = 0;
p.specs.panelBrandModel = 'QA Panel'; p.specs.batteryBrandModel = 'QA Battery';
p.specs.panels = undefined; p.specs.batteries = undefined; p.customization = { ...p.customization, attachedPdfs: [] };
store.setState({ projects: [p], activeProjectId: p.id, workspaceScope: 'local', sidebarTheme: 'light', equipmentCatalog: [
  { id: 'qa-panel', type: 'panel', brand: 'QA', modelSeries: 'QA', displayName: 'QA Panel', powerW: 620, datasheetUrl: 'https://qa.example.invalid/panel.pdf', datasheetName: 'QA Panel.pdf', createdAt: '2026-10-14', updatedAt: '2026-10-14' }
], syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
window.fetch = async (url) => {
  if (String(url) === 'https://qa.example.invalid/panel.pdf') return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } });
  throw new Error('Unexpected network in isolated fixture: ' + String(url));
};
function Fixture() {
  const project = store(s => s.projects[0]);
  const summary = store(s => s.getFinancialSummary());
  return <main className="grid grid-cols-2 gap-6 p-6 bg-slate-50 min-h-screen">
    <section><EquipmentParamsSection project={project} summary={summary} updateSpecs={store.getState().updateSpecs} isDark={false} isOpen={true} onToggle={() => {}} />
      <p role="status">Cantidad real de baterías: {project.specs.batteryCount}. Costo total: {summary.costMatrix.totalNetoUSD.toFixed(2)} USD.</p>
    </section><section><button onClick={async () => {
      for (const att of project.customization?.attachedPdfs || []) await PDFAttachmentStorage.deleteAttachment(att.id);
      store.getState().updateDocumentCustomization({ attachedPdfs: [...(project.customization?.attachedPdfs || [])] });
    }}>Simular otro dispositivo QA</button><PDFAttachmentsSection isDark={false} /><p>Anexos guardados: {project.customization?.attachedPdfs?.length || 0}</p></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
