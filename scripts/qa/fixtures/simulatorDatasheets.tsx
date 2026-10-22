import React from 'react';
import { createRoot } from 'react-dom/client';
import { PDFAttachmentStorage } from '../../../src/services/pdfAttachmentStorage';
import { PDFDocument } from 'pdf-lib';
import { useSimulationStore as store } from '../../../src/store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { PDFAttachmentsSection } from '../../../src/components/pdf/controls/PDFAttachmentsSection';
import { EquipmentParamsSection } from '../../../src/components/simulator/sidebar/EquipmentParamsSection';
import { ProposalAnnexSync } from '../../../src/components/pdf/annexes/ProposalAnnexSync';
/** `?assets=1`: the catalog datasheets live on a synthetic server, so they are annexed automatically. */
const withAssets = new URLSearchParams(location.search).has('assets');
import '../../../src/index.css';
const p = structuredClone(BENCHMARK_PROJECT);
p.id = 'qa-simulator-datasheets'; p.specs.hasBattery = false; p.specs.batteryCount = 0;
p.specs.panelBrandModel = 'QA Panel'; p.specs.batteryBrandModel = 'QA Battery';
p.specs.panels = undefined; p.specs.batteries = undefined; p.customization = { ...p.customization, attachedPdfs: [] };
store.setState({ projects: [p], activeProjectId: p.id, workspaceScope: 'local', sidebarTheme: 'light', equipmentCatalog: [
  { id: 'qa-panel', type: 'panel', brand: 'QA', modelSeries: 'QA', displayName: 'QA Panel', powerW: 620, datasheetUrl: 'https://qa.example.invalid/panel.pdf', datasheetName: 'QA Panel.pdf', createdAt: '2026-10-14', updatedAt: '2026-10-14' }
], syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
if (withAssets) store.setState({
  workspaceScope: 'https://qa.example.invalid|qa-org',
  equipmentCatalog: [
    { id: 'qa-panel', type: 'panel', brand: 'QA', modelSeries: 'QA', displayName: 'QA Panel', powerW: 620, datasheetAssetId: 'qa-panel-sheet', datasheetName: '5f3b762bf4e99b1.pdf', imageAssetIds: [], createdAt: '2026-10-14', updatedAt: '2026-10-14' },
    { id: 'qa-panel-b', type: 'panel', brand: 'QA', modelSeries: 'QA', displayName: 'QA Panel B', powerW: 640, datasheetAssetId: 'qa-panel-sheet', createdAt: '2026-10-14', updatedAt: '2026-10-14' },
    { id: 'qa-inverter', type: 'inverter', brand: 'QA', modelSeries: 'QA', displayName: 'QA Inversor 8K', powerKW: 8, datasheetAssetId: 'qa-inverter-sheet', createdAt: '2026-10-14', updatedAt: '2026-10-14' },
  ],
  syncSettings: { serverUrl: 'https://qa.example.invalid', authToken: 'synthetic-qa-only', autoSyncEnabled: false, lastSyncTimestamp: null,
    currentUser: { id: 'qa-user', name: 'QA', email: 'qa@example.invalid', role: new URLSearchParams(location.search).has('reader') ? 'VIEWER' : 'ADMIN', organizationId: 'qa-org' } },
});
const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
const threePages = await PDFDocument.create(); [1, 2, 3].forEach(() => threePages.addPage()); const threePageBytes = await threePages.save();
window.fetch = async (url) => {
  if (String(url) === 'https://qa.example.invalid/panel.pdf') return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } });
  if (withAssets && String(url) === 'https://qa.example.invalid/api/equipment-assets/qa-panel-sheet') return new Response(threePageBytes, { headers: { 'Content-Type': 'application/pdf' } });
  if (withAssets && String(url) === 'https://qa.example.invalid/api/equipment-assets/qa-inverter-sheet') return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } });
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
    }}>Simular otro dispositivo QA</button><PDFAttachmentsSection isDark={false} />{withAssets && <ProposalAnnexSync project={project} />}<p>Anexos guardados: {project.customization?.attachedPdfs?.length || 0}</p></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
