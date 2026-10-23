import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { findAgentTool } from '../../shared/agentTools/definitions';
import { renderRichTextHtml } from '../../shared/documentTexts';
import { resolveSectionVisibility } from '../../shared/documentLayout';

const store = useSimulationStore;
const other = { ...structuredClone(BENCHMARK_PROJECT), id: 'doc-other', status: 'Draft' as const, syncStatus: 'local_only' as const };
const active = { ...structuredClone(BENCHMARK_PROJECT), id: 'doc-active', status: 'Draft' as const, syncStatus: 'local_only' as const };
store.setState({ workspaceScope: 'local', projects: [active, other], activeProjectId: active.id, activeView: 'simulator', sessionGeneration: 0,
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [],
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
const ctx = () => ({ source: 'mcp' as const, owner: assistantOwner(), clientLabel: 'claude-code' });
const project = (id: string) => store.getState().projects.find((p) => p.id === id)!;

assert.equal(findAgentTool('list_document_texts')?.kind, 'read');
assert.equal(findAgentTool('set_document_text')?.kind, 'draft');
assert.equal(findAgentTool('save_document_text_to_company_template')?.kind, 'guarded');

// 1. Listing: keys, labels, resolved text and flags, filterable by section; works without opening the proposal.
const listed = await executeAgentTool({ name: 'list_document_texts', args: { proposalId: other.id, section: 'quotation' } }, ctx());
assert(listed.status === 'ok');
const texts = (listed.data as { texts: { key: string; section: string; text: string; templatable: boolean }[] }).texts;
assert(texts.some((t) => t.key === 'quotation.warranty.panel' && t.text.length > 0));
assert(texts.every((t) => t.section === 'quotation'), 'section filter');
// Long paragraphs are returned complete (no silent truncation before a replace).
const long = 'Párrafo largo. '.repeat(180).trim();
await executeAgentTool({ name: 'set_document_text', args: { proposalId: other.id, key: 'aboutUs.intro', text: long } }, ctx());
const fullIntro = (await executeAgentTool({ name: 'list_document_texts', args: { proposalId: other.id, section: 'aboutUs' } }, ctx()) as any).data.texts.find((t: any) => t.key === 'aboutUs.intro').text;
assert.equal(fullIntro.length, long.length);

// 2. The user's example: change the panel warranty text of a proposal that is not open.
const warranty = await executeAgentTool({ name: 'set_document_text', args: { proposalId: other.id, key: 'quotation.warranty.panel', text: '30 años de **producción lineal**' } }, ctx());
assert(warranty.status === 'applied', JSON.stringify(warranty));
const relisted = await executeAgentTool({ name: 'list_document_texts', args: { proposalId: other.id, section: 'quotation' } }, ctx());
assert.equal((relisted as any).data.texts.find((t: any) => t.key === 'quotation.warranty.panel').text, '30 años de **producción lineal**');
assert.equal(store.getState().activeProjectId, active.id, 'editing another proposal does not switch the active one');

// 3. The client phone is mirrored into the printed client data.
const phone = await executeAgentTool({ name: 'set_document_text', args: { proposalId: other.id, key: 'client.phone', text: '809-555-7777' } }, ctx());
assert(phone.status === 'applied');
assert.equal(project(other.id).client.contactPhone, '809-555-7777');

// 4. Undo restores the previous text; reset returns to the default.
assert.equal(store.getState().undoAgentActivity(phone.activityId).success, true);
assert.notEqual(project(other.id).client.contactPhone, '809-555-7777');
const reset = await executeAgentTool({ name: 'reset_document_text', args: { proposalId: other.id, key: 'quotation.warranty.panel' } }, ctx());
assert(reset.status === 'applied');
const afterReset = await executeAgentTool({ name: 'list_document_texts', args: { proposalId: other.id, section: 'quotation' } }, ctx());
assert.equal((afterReset as any).data.texts.find((t: any) => t.key === 'quotation.warranty.panel').isCustomized, false);

// 5. Unknown keys and HTML are handled safely.
assert.equal((await executeAgentTool({ name: 'set_document_text', args: { proposalId: other.id, key: 'nope.key', text: 'x' } }, ctx())).status, 'error');
await executeAgentTool({ name: 'set_document_text', args: { proposalId: other.id, key: 'aboutUs.intro', text: '<script>x</script> Hola' } }, ctx());
const intro = (await executeAgentTool({ name: 'list_document_texts', args: { proposalId: other.id, section: 'aboutUs' } }, ctx()) as any).data.texts.find((t: any) => t.key === 'aboutUs.intro').text;
assert(!renderRichTextHtml(intro).includes('<script'), 'markup is stored as text and escaped when rendered');

// 6. Layout: hide sections and change theme; invalid ids are rejected.
const layout = await executeAgentTool({ name: 'set_document_layout', args: { proposalId: other.id, hiddenSections: ['costMatrix', 'roi'], themeId: 'navy', showHeadersFooters: false } }, ctx());
assert(layout.status === 'applied', JSON.stringify(layout));
assert.equal(resolveSectionVisibility(project(other.id).customization?.layout).roi, false);
assert.equal(resolveSectionVisibility(project(other.id).customization?.layout).costMatrix, false);
// An explicit "visible" override (cost matrix shown in the editor) is cleared when an agent hides it.
await executeAgentTool({ name: 'set_document_layout', args: { proposalId: other.id, visibleSections: ['costMatrix'] } }, ctx());
assert.equal(resolveSectionVisibility(project(other.id).customization?.layout).costMatrix, true);
await executeAgentTool({ name: 'set_document_layout', args: { proposalId: other.id, hiddenSections: ['costMatrix'] } }, ctx());
assert.equal(resolveSectionVisibility(project(other.id).customization?.layout).costMatrix, false, 'confidential costs stay hidden');
assert.equal(project(other.id).customization?.layout?.themeId, 'navy');
assert.equal((await executeAgentTool({ name: 'set_document_layout', args: { proposalId: other.id, hiddenSections: ['bogus'] } }, ctx())).status, 'error');
assert.equal((await executeAgentTool({ name: 'set_document_layout', args: { proposalId: other.id, themeId: 'bogus' } }, ctx())).status, 'error');

// 7. Company template saving needs confirmation and the proposal open.
assert.equal((await executeAgentTool({ name: 'save_document_text_to_company_template', args: { proposalId: other.id, keys: ['quotation.warranty.panel'] } }, ctx())).status, 'error');
const template = await executeAgentTool({ name: 'save_document_text_to_company_template', args: { proposalId: active.id, keys: ['quotation.warranty.panel'] } }, ctx());
assert(template.status === 'pending_confirmation' || template.status === 'error');

// 8. Trashed proposals are read-only.
store.getState().moveToTrash(other.id);
assert.equal((await executeAgentTool({ name: 'set_document_text', args: { proposalId: other.id, key: 'quotation.warranty.panel', text: 'x' } }, ctx())).status, 'error');
console.log('PASS: agent document tools: list, set (warranty, client phone), reset, layout, template guard, undo and trash.');
