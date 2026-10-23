import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { registerChatFile } from '../features/assistant/chatFiles';
import { PDFAttachmentStorage } from '../services/pdfAttachmentStorage';
import { findAgentTool } from '../../shared/agentTools/definitions';

const store = useSimulationStore;
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG);
const panel = catalog.find((e) => e.type === 'panel')!;
panel.datasheetAssetId = 'asset-panel-ds';
panel.datasheetName = 'ficha.pdf';
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'att-p', status: 'Draft' as const, syncStatus: 'local_only' as const,
  specs: { ...structuredClone(BENCHMARK_PROJECT.specs), panels: [{ id: 'g1', catalogItemId: panel.id, brandModel: panel.displayName, powerW: panel.powerW || 600, count: 10 }] },
  customization: { ...structuredClone(BENCHMARK_PROJECT.customization), attachedPdfs: [] } };
store.setState({ workspaceScope: 'local', projects: [project], activeProjectId: 'other', sessionGeneration: 0, equipmentCatalog: catalog, deletedEquipmentIds: [],
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
const ctx = () => ({ source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'codex' });
const attachments = () => store.getState().projects.find((p) => p.id === project.id)!.customization?.attachedPdfs ?? [];

assert.equal(findAgentTool('attach_file_to_proposal')?.kind, 'draft');
assert.equal(findAgentTool('remove_proposal_attachment')?.kind, 'guarded');

// 1. Catalog datasheets of the equipment in use are annexed on request (same policy as the PDF view).
const synced = await executeAgentTool({ name: 'sync_catalog_datasheets', args: { proposalId: project.id } }, ctx());
assert(synced.status === 'applied', JSON.stringify(synced));
assert.equal(attachments().length, 1);
assert.equal(attachments()[0].origin, 'catalog');
assert.match(attachments()[0].title, new RegExp(panel.displayName.replace(/[()]/g, '.')));

// 2. A PDF dropped in the chat (by id) or sent as base64 by an external agent becomes a manual annex with its pages counted.
const doc = new jsPDF(); doc.text('Plano', 10, 10); doc.addPage(); doc.text('Detalle', 10, 10);
const bytes = doc.output('arraybuffer');
const chatFile = registerChatFile('Plano eléctrico.pdf', bytes);
const fromChat = await executeAgentTool({ name: 'attach_file_to_proposal', args: { proposalId: project.id, fileId: chatFile.id, title: 'Plano eléctrico' } }, ctx());
assert(fromChat.status === 'applied', JSON.stringify(fromChat));
const manual = attachments().find((a) => a.title === 'Plano eléctrico')!;
assert.equal(manual.origin, 'manual');
assert.equal(manual.pageCount, 2);
assert.equal(manual.enabled, true);
assert(await PDFAttachmentStorage.getAttachment(manual.id), 'bytes are stored for the export merge');
const base64 = Buffer.from(bytes).toString('base64');
const fromAgent = await executeAgentTool({ name: 'attach_file_to_proposal', args: { proposalId: project.id, fileName: 'certificado.pdf', contentBase64: base64 } }, ctx());
assert(fromAgent.status === 'applied');
// A request cancelled while the PDF was being read never applies.
const controller = new AbortController();
const pendingAttach = executeAgentTool({ name: 'attach_file_to_proposal', args: { proposalId: project.id, fileName: 'cancelado.pdf', contentBase64: base64 } }, { ...ctx(), signal: controller.signal });
controller.abort();
const cancelled = await pendingAttach;
assert(cancelled.status === 'error' && cancelled.code === 'cancelled');
assert(!attachments().some((a) => a.fileName === 'cancelado.pdf'));
const notPdf = await executeAgentTool({ name: 'attach_file_to_proposal', args: { proposalId: project.id, fileName: 'x.pdf', contentBase64: Buffer.from('<html>').toString('base64') } }, ctx());
assert.equal(notPdf.status, 'error', 'only real PDFs (signature check)');
const image = registerChatFile('foto.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer);
assert.equal((await executeAgentTool({ name: 'attach_file_to_proposal', args: { proposalId: project.id, fileId: image.id } }, ctx())).status, 'error');
assert.equal((await executeAgentTool({ name: 'attach_file_to_proposal', args: { proposalId: project.id } }, ctx())).status, 'error', 'needs fileId or contentBase64');

// 3. Listing and toggling.
const listed = await executeAgentTool({ name: 'list_proposal_attachments', args: { proposalId: project.id } }, ctx());
assert(listed.status === 'ok');
assert.equal((listed.data as { attachments: unknown[] }).attachments.length, 3);
const toggled = await executeAgentTool({ name: 'set_attachment_enabled', args: { proposalId: project.id, attachmentId: manual.id, enabled: false, inTableOfContents: true } }, ctx());
assert(toggled.status === 'applied');
assert.equal(attachments().find((a) => a.id === manual.id)?.enabled, false);
assert.equal(attachments().find((a) => a.id === manual.id)?.addToTableOfContents, true);

// 4. Removal needs confirmation; a removed catalog datasheet is remembered as dismissed (not re-added).
const catalogId = attachments().find((a) => a.origin === 'catalog')!.id;
const removal = await executeAgentTool({ name: 'remove_proposal_attachment', args: { proposalId: project.id, attachmentId: catalogId } }, ctx());
assert(removal.status === 'pending_confirmation');
assert.equal(store.getState().confirmAgentAction(removal.actionId).success, true);
assert(!attachments().some((a) => a.id === catalogId));
await executeAgentTool({ name: 'sync_catalog_datasheets', args: { proposalId: project.id } }, ctx());
assert(!attachments().some((a) => a.origin === 'catalog'), 'dismissed datasheets stay out');
assert.equal(store.getState().undoAgentActivity(store.getState().agentActivity.find((a) => a.tool === 'remove_proposal_attachment')!.id).success, true);
// 5. Catalog still loading: equipment in use that cannot be resolved keeps its automatic annex.
assert(attachments().some((a) => a.origin === 'catalog'), 'precondition: the automatic annex is back after undo');
const annexBefore = attachments().find((a) => a.origin === 'catalog')!;
store.setState({ equipmentCatalog: catalog.filter((e) => e.id !== annexBefore.catalogItemId) });
const whileLoading = await executeAgentTool({ name: 'sync_catalog_datasheets', args: { proposalId: project.id } }, ctx());
assert.equal(whileLoading.status, 'ok', JSON.stringify(whileLoading)); // nothing to change
assert.deepEqual(attachments().find((a) => a.id === annexBefore.id), annexBefore, 'The annex is kept untouched while its equipment is unresolved');
store.setState({ equipmentCatalog: catalog });

console.log('PASS: agent attachment tools: catalog datasheets, chat/base64 PDFs with page count, list, toggle, guarded removal and undo.');
