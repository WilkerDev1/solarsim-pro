// Bypass mode: guarded = 'allow' skips the human confirmation but never the validations, permissions or activity log.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_AGENT_POLICY, normalizeAgentPolicy } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';

const store = useSimulationStore;
const project = { ...structuredClone(BENCHMARK_PROJECT), id: 'agent-bypass', syncStatus: 'local_only' as const };
const reset = () => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(project)], activeProjectId: project.id, activeView: 'simulator',
  equipmentCatalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
  agentPolicy: structuredClone(DEFAULT_AGENT_POLICY), agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
const internal = () => ({ source: 'app-assistant' as const, owner: assistantOwner() });
const external = () => ({ source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'claude-code' });
const bypass = { read: 'allow', draft: 'allow', guarded: 'allow' } as const;
const confirm = { read: 'allow', draft: 'allow', guarded: 'confirm' } as const;
const asReader = () => store.setState({ workspaceScope: 'https://qa.invalid|org', syncSettings: { ...store.getState().syncSettings, serverUrl: 'https://qa.invalid', authToken: 'synthetic',
  currentUser: { id: 'r', name: 'Lector', email: 'r@example.invalid', role: 'LECTOR', organizationId: 'org' } as any } });
const margin = (value: number) => ({ name: 'propose_project_update', args: { id: project.id, title: 'Margen', edits: [{ section: 'specs', field: 'saleMarginMultiplier', valueJson: String(value) }] } });
const equipmentEdit = (id: string, name: string) => ({ name: 'propose_equipment_update', args: { id, edits: [{ section: 'equipment', field: 'displayName', valueJson: JSON.stringify(name) }] } });
const id = store.getState().equipmentCatalog.find((e) => e.type === 'panel')!.id;
const displayName = () => store.getState().equipmentCatalog.find((e) => e.id === id)?.displayName;
const original = displayName();
const marginNow = () => store.getState().getActiveProject().specs.saleMarginMultiplier;
const proposal = () => store.getState().projects.find((p) => p.id === project.id);

// 1. Normalization keeps a persisted 'allow' and turns junk into the safe default.
reset();
assert.equal(normalizeAgentPolicy({ external: { read: 'allow', draft: 'allow', guarded: 'allow' } }).external.guarded, 'allow');
assert.equal(normalizeAgentPolicy({ internal: { read: 'allow', draft: 'allow', guarded: 'allow' } }).internal.guarded, 'allow');
assert.equal(normalizeAgentPolicy({ internal: { read: 'allow', draft: 'allow', guarded: 'deny' } }).internal.guarded, 'deny');
for (const junk of ['yes', 'ALLOW', 1, true, null, undefined, {}]) assert.equal(normalizeAgentPolicy({ internal: { guarded: junk } } as any).internal.guarded, 'confirm');
assert.equal(normalizeAgentPolicy(undefined).external.guarded, 'confirm', 'default stays confirm');
assert.equal(DEFAULT_AGENT_POLICY.internal.guarded, 'confirm');
store.getState().setAgentPolicy({ external: { ...bypass } });
assert.equal(store.getState().agentPolicy.external.guarded, 'allow', 'setAgentPolicy accepts bypass');
assert.equal(store.getState().agentPolicy.internal.guarded, 'confirm', 'sources are independent');

// 2. Under "confirm" a guarded catalog edit waits; under bypass it applies at once with activity and undo.
reset();
assert((await executeAgentTool(equipmentEdit(id, 'Panel A'), external())).status === 'pending_confirmation');
assert.equal(displayName(), original);
reset();
store.getState().setAgentPolicy({ external: { ...bypass } });
const applied = await executeAgentTool(equipmentEdit(id, 'Panel B'), external());
assert(applied.status === 'applied', JSON.stringify(applied));
assert.equal(displayName(), 'Panel B');
assert.equal(store.getState().pendingAgentActions.length, 0, 'no confirmation card queued');
const entry = store.getState().agentActivity[0];
assert.equal(entry.id, applied.activityId);
assert.equal(entry.kind, 'guarded');
assert.equal(entry.source, 'mcp');
assert.equal(entry.clientLabel, 'claude-code');
assert.equal(store.getState().undoAgentActivity(entry.id).success, true);
assert.equal(displayName(), original);

// 3. Sources are independent: bypass on one does not open the other.
reset();
store.getState().setAgentPolicy({ external: { ...bypass } });
assert((await executeAgentTool(equipmentEdit(id, 'Panel C'), internal())).status === 'pending_confirmation');
reset();
store.getState().setAgentPolicy({ internal: { ...bypass } });
assert((await executeAgentTool(equipmentEdit(id, 'Panel D'), external())).status === 'pending_confirmation');
assert((await executeAgentTool(equipmentEdit(id, 'Panel D'), internal())).status === 'applied');

// 4. Pricing edits through a draft tool are guarded as a whole: bypass applies them (with undo), confirm queues them.
reset();
const marginBefore = marginNow();
assert((await executeAgentTool(margin(1.4), internal())).status === 'pending_confirmation');
assert.equal(marginNow(), marginBefore);
reset();
store.getState().setAgentPolicy({ internal: { ...bypass } });
const priced = await executeAgentTool(margin(1.4), internal());
assert(priced.status === 'applied', JSON.stringify(priced));
assert.equal(marginNow(), 1.4);
assert.equal(store.getState().agentActivity[0].kind, 'guarded');
assert.equal(store.getState().undoAgentActivity(priced.activityId).success, true);
assert.equal(marginNow(), marginBefore);

// 5. Bypass skips the human, not the validations: invalid edits are still rejected and nothing changes.
reset();
store.getState().setAgentPolicy({ internal: { ...bypass } });
assert.notEqual((await executeAgentTool(margin(0.5), internal())).status, 'applied');
assert.equal(marginNow(), marginBefore);
const badField = await executeAgentTool({ name: 'propose_equipment_update', args: { id, edits: [{ section: 'equipment', field: 'notAField', valueJson: '1' }] } }, internal());
assert.notEqual(badField.status, 'applied');
assert.equal(store.getState().agentActivity.length, 0);

// 6. Native guarded tools (status, trash) also apply without confirmation and stay undoable.
reset();
store.getState().setAgentPolicy({ external: { ...bypass } });
const trashed = await executeAgentTool({ name: 'move_proposal_to_trash', args: { id: project.id } }, external());
assert(trashed.status === 'applied', JSON.stringify(trashed));
assert.equal(proposal()?.isDeleted, true);
// Proposals in the trash are not modified, even under bypass.
assert.notEqual((await executeAgentTool({ name: 'set_proposal_status', args: { id: project.id, status: 'Archived' } }, external())).status, 'applied');
assert.notEqual(proposal()?.status, 'Archived');
assert.notEqual((await executeAgentTool(margin(1.3), internal())).status, 'applied');
assert.equal(store.getState().undoAgentActivity(trashed.activityId).success, true);
assert.equal(!!proposal()?.isDeleted, false);
const status = await executeAgentTool({ name: 'set_proposal_status', args: { id: project.id, status: 'Archived' } }, external());
assert(status.status === 'applied', JSON.stringify(status));
assert.equal(store.getState().undoAgentActivity(status.activityId).success, true);

// 7. Deny still blocks, even next to other bypass sources.
reset();
store.getState().setAgentPolicy({ external: { read: 'allow', draft: 'allow', guarded: 'deny' }, internal: { ...bypass } });
const denied = await executeAgentTool(equipmentEdit(id, 'Panel E'), external());
assert(denied.status === 'error' && denied.code === 'denied');
const deniedPrice = await executeAgentTool(margin(1.4), external());
assert(deniedPrice.status === 'error' && deniedPrice.code === 'denied');

// 8. A reader never writes, whatever the policy.
reset();
store.getState().setAgentPolicy({ internal: { ...bypass }, external: { ...bypass } });
asReader();
for (const ctx of [internal(), external()]) {
  assert.notEqual((await executeAgentTool(equipmentEdit(id, 'Panel R'), ctx)).status, 'applied');
  assert.notEqual((await executeAgentTool(margin(1.5), ctx)).status, 'applied');
  assert.notEqual((await executeAgentTool({ name: 'move_proposal_to_trash', args: { id: project.id } }, ctx)).status, 'applied');
}
assert.equal(displayName(), original);
assert.equal(marginNow(), marginBefore);
assert.equal(!!proposal()?.isDeleted, false);
assert.equal(store.getState().agentActivity.length, 0);

// 9. Tools that the activity log cannot undo keep the confirmation even under bypass.
reset();
store.getState().setAgentPolicy({ internal: { ...bypass }, external: { ...bypass } });
const report = await executeAgentTool({ name: 'add_commercial_report', args: { id: project.id, note: 'Cliente interesado' } }, external());
assert(report.status === 'pending_confirmation', JSON.stringify(report));
const clientCreate = await executeAgentTool({ name: 'create_client', args: { name: 'Cliente QA' } }, external());
assert(clientCreate.status === 'applied', JSON.stringify(clientCreate));
const clientId = (clientCreate.data as { clientId: string }).clientId;
const removal = await executeAgentTool({ name: 'delete_client', args: { id: clientId } }, external());
assert(removal.status === 'pending_confirmation', 'delete_client has no undo entry: keeps confirmation');
assert(store.getState().clients.some((c) => c.id === clientId));

// 10. Under confirm nothing changed for the rest: guarded native tools still queue.
reset();
store.getState().setAgentPolicy({ external: { ...confirm } });
assert((await executeAgentTool({ name: 'move_proposal_to_trash', args: { id: project.id } }, external())).status === 'pending_confirmation');
assert.equal(!!proposal()?.isDeleted, false);

console.log('testAgentBypassPolicy: ok');
