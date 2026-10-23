// Permissions are decided when the plan is ready to apply, not when the tool was called: a policy edited while an async handler
// awaits (e.g. counting PDF pages) must win over the one captured before the await.
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { PDFMergeService } from '../services/pdfMergeService';

const store = useSimulationStore;
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'live-p', status: 'Draft' as const, syncStatus: 'local_only' as const,
  customization: { ...structuredClone(BENCHMARK_PROJECT.customization), attachedPdfs: [] } };
const reset = () => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: 'other', sessionGeneration: 0,
  equipmentCatalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG), deletedEquipmentIds: [], equipmentConflicts: {},
  agentPolicy: structuredClone(DEFAULT_AGENT_POLICY), agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
const ctx = (source: 'mcp' | 'app-assistant') => ({ source, owner: assistantOwner(), clientLabel: 'codex' });
const policy = (key: 'external' | 'internal', draft: 'allow' | 'confirm' | 'deny', guarded: 'allow' | 'confirm' | 'deny') =>
  store.getState().setAgentPolicy({ [key]: { read: 'allow', draft, guarded } });
const doc = new jsPDF(); doc.text('Plano', 10, 10);
const base64 = Buffer.from(doc.output('arraybuffer')).toString('base64');
const attach = { name: 'attach_file_to_proposal', args: { proposalId: project.id, fileName: 'plano.pdf', contentBase64: base64 } };
const attachments = () => store.getState().projects.find((p) => p.id === project.id)!.customization?.attachedPdfs ?? [];
const trashed = () => !!store.getState().projects.find((p) => p.id === project.id)?.isDeleted;

// The page count is the await in attach_file_to_proposal: hold it on a promise we control.
const realCount = PDFMergeService.getPdfPageCount;
let release: (() => void) | undefined;
PDFMergeService.getPdfPageCount = (async (bytes: ArrayBuffer) => {
  await new Promise<void>((resolve) => { release = resolve; });
  return realCount.call(PDFMergeService, bytes);
}) as typeof PDFMergeService.getPdfPageCount;
const inFlight = async (call: { name: string; args: Record<string, unknown> }, source: 'mcp' | 'app-assistant', change: () => void) => {
  release = undefined as (() => void) | undefined;
  const pending = executeAgentTool(call, ctx(source));
  change(); // synchronous: the registry is still suspended at its first await, even for handlers that resolve at once
  await new Promise((resolve) => setTimeout(resolve, 0));
  (release as (() => void) | undefined)?.();
  return pending;
};

try {
  // 1. draft allow -> deny while the handler awaits: rejected, nothing applied, no activity.
  reset(); policy('external', 'allow', 'confirm');
  const denied = await inFlight(attach, 'mcp', () => policy('external', 'deny', 'confirm'));
  assert(denied.status === 'error' && denied.code === 'denied', JSON.stringify(denied));
  assert.equal(attachments().length, 0);
  assert.equal(store.getState().agentActivity.length, 0);
  assert.equal(store.getState().pendingAgentActions.length, 0);

  // 2. draft allow -> confirm: a pending confirmation instead of an automatic write.
  reset(); policy('external', 'allow', 'confirm');
  const queued = await inFlight(attach, 'mcp', () => policy('external', 'confirm', 'confirm'));
  assert(queued.status === 'pending_confirmation', JSON.stringify(queued));
  assert.equal(attachments().length, 0);
  assert.equal(store.getState().agentActivity.length, 0);
  assert.equal(store.getState().pendingAgentActions.length, 1);

  // 3. The internal source is independent: external changes do not affect an internal in-flight call.
  reset(); policy('internal', 'allow', 'confirm');
  const internal = await inFlight(attach, 'app-assistant', () => policy('external', 'deny', 'deny'));
  assert(internal.status === 'applied', JSON.stringify(internal));
  assert.equal(attachments().length, 1);

  // 4. The account loses write access in flight: nothing is written.
  reset(); policy('external', 'allow', 'confirm');
  const lost = await inFlight(attach, 'mcp', () => store.setState({ workspaceScope: 'https://qa.invalid|org', syncSettings: { ...store.getState().syncSettings, serverUrl: 'https://qa.invalid', authToken: 'synthetic',
    currentUser: { id: 'r', name: 'Lector', email: 'r@example.invalid', role: 'LECTOR', organizationId: 'org' } as any } }));
  assert.notEqual(lost.status, 'applied', JSON.stringify(lost));
  assert.equal(attachments().length, 0);

  // 5. Guarded bypass (allow) changed to confirm / deny in flight (sync handlers still await in the registry).
  const trash = { name: 'move_proposal_to_trash', args: { id: project.id } };
  reset(); policy('external', 'allow', 'allow');
  const asks = await inFlight(trash, 'mcp', () => policy('external', 'allow', 'confirm'));
  assert(asks.status === 'pending_confirmation', JSON.stringify(asks));
  assert.equal(trashed(), false);
  reset(); policy('external', 'allow', 'allow');
  const refused = await inFlight(trash, 'mcp', () => policy('external', 'allow', 'deny'));
  assert(refused.status === 'error' && refused.code === 'denied', JSON.stringify(refused));
  assert.equal(trashed(), false);
  assert.equal(store.getState().agentActivity.length, 0);

  // 6. Unchanged policy still behaves as before (allow applies, guarded bypass applies).
  reset(); policy('external', 'allow', 'allow');
  assert((await inFlight(attach, 'mcp', () => undefined)).status === 'applied');
  assert((await inFlight(trash, 'mcp', () => undefined)).status === 'applied');
  assert.equal(trashed(), true);
} finally {
  PDFMergeService.getPdfPageCount = realCount;
}
console.log('testAgentLivePolicy: ok');
