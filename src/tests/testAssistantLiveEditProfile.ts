// F3b: perfil «edición en vivo» del asistente de la app (ADR 0010). Los kinds (read/draft/guarded) no cambian: el perfil es
// una capa de política POR SUPERFICIE que decide `decideAgentToolPermission` (src/features/agentTools/permissionProfile.ts).
//  · Lo que ocurre dentro de una propuesta (campos, equipos, precios, margen, descuentos y extras) se aplica al momento desde
//    el asistente de la app, con diff y deshacer; la MISMA llamada desde un agente externo sigue pidiendo confirmación.
//  · Lo compartido o sin deshacer (catálogo, ofertas, clientes, estado y decisión comercial, papelera, borrados) se confirma
//    en ambas superficies.
//  · propose_project_update (MCP) no cambia: con un precio sigue quedando pendiente; las copias doradas no se tocan.
//  · El encendido del asistente flotante: migración de una sola vez, escrita y probada, apagada por una bandera que F4/F5b enciende.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { DEFAULT_AGENT_POLICY, normalizeAgentPolicy, type AgentPolicy } from '../store/slices/agentSlice';
import { DEFAULT_FEATURE_SETTINGS } from '../../shared/applicationFeatures';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';
import type { AgentSource } from '../../shared/agentTools/types';
import { executeAgentTool } from '../features/agentTools/registry';
import { assistantOwner } from '../features/assistant/tools';
import { executeAssistantToolset } from '../features/agentTools/appAssistant/toolset';
import { decideAgentToolPermission, type AgentPermissionRequest } from '../features/agentTools/permissionProfile';
import {
  APP_ASSISTANT_DEFAULTS_VERSION, APP_ASSISTANT_ON_BY_DEFAULT, migrateAppAssistantEnabled,
} from '../store/persistence/appAssistantEnablement';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { featureScope } from '../../shared/applicationFeatures';
import type { ProjectSimulation } from '../types';
import type { SimulationStore } from '../store/types';

const store = useSimulationStore;
const s = () => store.getState();
const stamp = '2026-10-01T00:00:00.000Z';
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG).map((item) => ({ ...item, supplierPrices: [] as NonNullable<typeof item.supplierPrices> }));
const battery = catalog.find((e) => e.type === 'battery')!;
battery.supplierPrices = [{ id: 'sp-b', supplierName: 'QA Baterías', priceUSD: 2100, stockStatus: 'in_stock', updatedAt: stamp }];

const base: ProjectSimulation = {
  ...structuredClone(BENCHMARK_PROJECT), id: 'f3b-base', syncStatus: 'local_only',
  specs: { ...structuredClone(BENCHMARK_PROJECT.specs), hasBattery: false, batteries: [{ id: 'b0', brandModel: 'Batería de Ajustes 10 kWh', capacityKWh: 10, count: 1, dodPct: 90 }] },
};
const reset = (policy: AgentPolicy = DEFAULT_AGENT_POLICY) => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(base)], activeProjectId: '', activeView: 'dashboard',
  equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0, clients: [],
  defaultSimulationSettings: DEFAULT_SIMULATION_SETTINGS, localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS },
  agentPolicy: structuredClone(policy), agentActivity: [], pendingAgentActions: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
let call = 0;
const ctx = (source: AgentSource, turnId = 'turn-f3b') => ({ source, owner: assistantOwner(), turnId, callId: String(call++), clientLabel: 'qa' });
const projectOf = (id = base.id) => s().projects.find((p) => p.id === id)!;
const undoSteps = (id = base.id) => s().undoHistory.journals[id]?.undo.length ?? 0;
const marginOps = [{ op: 'set_margin_pct', pct: 10 }];
const priceOps = [
  { op: 'set_margin_pct', pct: 10 },
  { op: 'upsert_item', description: 'Estructura especial', quantity: 1, unitPriceUSD: 350 },
  { op: 'upsert_discount', description: 'Descuento de cierre', discountType: 'fixed', value: 120 },
];

// ── 1. La decisión pura, por superficie ─────────────────────────────────────────────────────────────────────────────────
const request = (source: AgentSource, patch: Partial<AgentPermissionRequest> = {}): AgentPermissionRequest =>
  ({ source, kind: 'guarded', scope: 'proposal', undoable: true, ...patch });
const decide = (source: AgentSource, patch: Partial<AgentPermissionRequest> = {}, policy: AgentPolicy = DEFAULT_AGENT_POLICY) =>
  decideAgentToolPermission(policy, request(source, patch));

assert.equal(DEFAULT_AGENT_POLICY.appAssistantProfile, 'live-edit', 'el asistente de la app edita en vivo por defecto (decisión nº 4)');
assert.equal(decide('app-assistant'), 'apply', 'un precio dentro de una propuesta: en vivo desde el asistente de la app');
assert.equal(decide('mcp'), 'confirm', 'la misma operación desde un agente externo: confirmación, como hoy');
assert.equal(decide('proposal-assistant'), 'confirm', 'el asistente de propuestas (legado) no tiene el perfil');
assert.equal(decide('app-assistant', { scope: 'shared' }), 'confirm', 'lo compartido se confirma también en la app');
assert.equal(decide('mcp', { scope: 'shared' }), 'confirm', 'y fuera de ella');
assert.equal(decide('app-assistant', { undoable: false }), 'confirm', 'lo que no se puede deshacer se confirma');
assert.equal(decide('app-assistant', { kind: 'draft' }), 'apply', 'un borrador dentro de una propuesta, como hoy');
assert.equal(decide('app-assistant', { kind: 'read', scope: 'shared' }), 'apply', 'consultar');
// La política del dispositivo sigue mandando: bloquear o pedir confirmación gana al perfil.
const internal = (patch: Partial<AgentPolicy['internal']>, profile: AgentPolicy['appAssistantProfile'] = 'live-edit'): AgentPolicy =>
  ({ ...DEFAULT_AGENT_POLICY, internal: { ...DEFAULT_AGENT_POLICY.internal, ...patch }, appAssistantProfile: profile });
assert.equal(decide('app-assistant', {}, internal({ guarded: 'deny' })), 'deny', 'cambios sensibles bloqueados: tampoco en vivo');
assert.equal(decide('app-assistant', {}, internal({ draft: 'confirm' })), 'confirm', 'borradores con confirmación: el perfil no la salta');
assert.equal(decide('app-assistant', {}, internal({ draft: 'deny' })), 'deny');
assert.equal(decide('app-assistant', {}, internal({}, 'confirm')), 'confirm', 'perfil «confirmar»: como antes de F3b');
// El bypass explícito de cambios sensibles sigue valiendo con el perfil: «en vivo» nunca es más estricto que «confirmar».
const draftConfirmBypass = internal({ draft: 'confirm', guarded: 'allow' });
assert.equal(decide('app-assistant', {}, draftConfirmBypass), 'apply', 'precio dentro de la propuesta con bypass de sensibles: se aplica');
assert.equal(decide('app-assistant', {}, internal({ draft: 'confirm', guarded: 'allow' }, 'confirm')), 'apply', 'igual que con el perfil «confirmar»');
assert.equal(decide('app-assistant', { kind: 'draft' }, draftConfirmBypass), 'confirm', 'un borrador con «Pedir confirmación» se confirma');
assert.equal(decide('app-assistant', { undoable: false }, draftConfirmBypass), 'confirm', 'el bypass nunca salta lo que no se deshace');
// Lo que ya existía no cambia: bypass explícito, sus excepciones y el clic de «Aplicar» del asistente de propuestas.
const externalBypass: AgentPolicy = { ...DEFAULT_AGENT_POLICY, external: { read: 'allow', draft: 'allow', guarded: 'allow' } };
assert.equal(decide('mcp', { scope: 'shared' }, externalBypass), 'apply', 'bypass explícito');
assert.equal(decide('mcp', { scope: 'shared', undoable: false }, externalBypass), 'confirm', 'bypass nunca salta lo que no se deshace');
assert.equal(decide('proposal-assistant', { kind: 'draft', scope: 'shared' }, internal({ draft: 'confirm' })), 'apply', 'el clic «Aplicar» del modal es la confirmación');
assert.equal(decide('app-assistant', { kind: 'draft', scope: 'shared' }, internal({ draft: 'confirm' })), 'confirm');
assert.equal(decide('mcp', { kind: 'read', scope: 'shared' }, { ...DEFAULT_AGENT_POLICY, external: { read: 'deny', draft: 'allow', guarded: 'confirm' } }), 'deny');
// Lo guardado: sin el campo, edición en vivo; el perfil nunca se hereda a los agentes externos.
assert.equal(normalizeAgentPolicy(undefined).appAssistantProfile, 'live-edit');
assert.equal(normalizeAgentPolicy({ internal: DEFAULT_AGENT_POLICY.internal, external: DEFAULT_AGENT_POLICY.external } as AgentPolicy).appAssistantProfile, 'live-edit');
assert.equal(normalizeAgentPolicy({ appAssistantProfile: 'confirm' }).appAssistantProfile, 'confirm');
for (const junk of ['LIVE', 1, true, null, {}]) assert.equal(normalizeAgentPolicy({ appAssistantProfile: junk } as any).appAssistantProfile, 'live-edit');
assert.equal(normalizeAgentPolicy(undefined).internal.guarded, 'confirm', 'los kinds y sus niveles por defecto no cambian');
assert.equal(normalizeAgentPolicy(undefined).external.guarded, 'confirm');

// ── 2. La MISMA llamada edit_proposal con precios: en vivo en la app, pendiente desde un agente externo ────────────────────
reset();
s().setActiveProject(base.id, 'simulator');
const steps = undoSteps();
const livePrice = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, title: 'Margen, extra y descuento', ops: priceOps } }, ctx('app-assistant'));
assert.equal(livePrice.status, 'applied', JSON.stringify(livePrice.error ?? livePrice));
assert.ok(livePrice.activityId, 'queda en la actividad, con su deshacer');
assert.equal(undoSteps(), steps + 1, 'un solo paso de deshacer para el lote');
assert.ok(livePrice.changes.some((c) => c.path === 'specs.saleMarginMultiplier' && c.before !== c.after), 'diff con antes y después');
assert.ok(projectOf().financials.customItems?.some((i) => i.description === 'Estructura especial' && i.unitPriceUSD === 350), 'extra aplicado');
assert.ok(projectOf().financials.customDiscounts?.some((d) => d.description === 'Descuento de cierre'), 'descuento aplicado');
assert.equal(s().pendingAgentActions.length, 0, 'sin tarjeta de confirmación');
const liveEntry = s().agentActivity.find((a) => a.id === livePrice.activityId)!;
assert.equal(liveEntry.kind, 'guarded', 'el kind efectivo no cambia: sigue siendo un cambio de precios');
assert.equal(liveEntry.source, 'app-assistant');
// «Ponle baterías» (equipo del catálogo con su precio de oferta) también en vivo.
const liveStorage = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: [{ op: 'set_storage', enabled: true }] } }, ctx('app-assistant'));
assert.equal(liveStorage.status, 'applied', JSON.stringify(liveStorage.error));
assert.equal(projectOf().specs.batteries?.[0].unitPriceUSD, 2100, 'precio de la oferta del proveedor, nunca inventado');
assert.equal(projectOf().specs.batteries?.[0].priceSource, 'supplier');
// Un costo de equipo escrito por el modelo (precio «manual», sin oferta ni genérico) NO va en vivo: se confirma, para que
// ningún precio inventado llegue a la propuesta sin un humano (regla de no inventar precios).
for (const path of ['specs.panels[0].unitPriceUSD', 'specs.inverters[0].unitPriceUSD']) {
  const pendingBefore = s().pendingAgentActions.length;
  const frozenSpecs = JSON.stringify(projectOf().specs);
  const manual = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: [{ op: 'set', path, valueJson: '0.01' }] } }, ctx('app-assistant'));
  assert.equal(manual.status, 'pending_confirmation', `${path}: costo manual desde la app, confirmación (${JSON.stringify(manual.error ?? manual.status)})`);
  assert.equal(JSON.stringify(projectOf().specs), frozenSpecs, 'pendiente: nada escrito');
  assert.equal(s().pendingAgentActions.length, pendingBefore + 1);
}
// Mezclado con un cambio en vivo, el lote entero se confirma.
const mixedManual = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: [...marginOps, { op: 'set', path: 'specs.panels[0].unitPriceUSD', valueJson: '0.01' }] } }, ctx('app-assistant'));
assert.equal(mixedManual.status, 'pending_confirmation');
store.setState({ pendingAgentActions: [] });
// Deshacer un cambio de precios hecho en vivo es también un cambio dentro de la propuesta: en vivo.
const undoLive = await executeAssistantToolset({ name: 'undo_change', args: { proposalId: base.id } }, ctx('app-assistant'));
assert.equal(undoLive.status, 'applied', JSON.stringify(undoLive.error));
assert.equal(projectOf().specs.hasBattery, false, 'deshecho');

reset();
const frozen = JSON.stringify(s().projects);
const externalPrice = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, title: 'Margen, extra y descuento', ops: priceOps } }, ctx('mcp'));
assert.equal(externalPrice.status, 'pending_confirmation', 'desde un agente externo, la misma llamada espera confirmación');
assert.equal(JSON.stringify(s().projects), frozen, 'pendiente: nada escrito');
assert.equal(s().pendingAgentActions.length, 1);
assert.equal(s().pendingAgentActions[0].source, 'mcp');
assert.equal(s().confirmAgentAction(externalPrice.actionId!).success, true, 'al confirmar se aplica');
assert.equal(projectOf().financials.customItems?.some((i) => i.description === 'Estructura especial'), true);

// Un cambio sin precios desde fuera: como hoy (borrador, se aplica con la política por defecto).
reset();
const externalCoverage = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '85' }] } }, ctx('mcp'));
assert.equal(externalCoverage.status, 'applied', JSON.stringify(externalCoverage.error));

// Con el perfil «confirmar» el asistente de la app vuelve a pedir confirmación para precios (lo de antes de F3b).
reset({ ...DEFAULT_AGENT_POLICY, appAssistantProfile: 'confirm' });
const confirmProfile = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: marginOps } }, ctx('app-assistant'));
assert.equal(confirmProfile.status, 'pending_confirmation');
// Y con los cambios sensibles bloqueados en el dispositivo, ni en vivo ni pendiente.
reset(internal({ guarded: 'deny' }));
const blocked = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: marginOps } }, ctx('app-assistant'));
assert.equal(blocked.status, 'error');
assert.equal(blocked.error?.code, 'denied');
assert.equal(JSON.stringify(projectOf().specs.saleMarginMultiplier), JSON.stringify(base.specs.saleMarginMultiplier));

// ── 3. Lo compartido o sin deshacer pide confirmación en ambas superficies ─────────────────────────────────────────────────
reset();
const statusApp = await executeAssistantToolset({ name: 'set_commercial_status', args: { id: base.id, status: 'approved' } }, ctx('app-assistant'));
assert.equal(statusApp.status, 'pending_confirmation', 'decisión comercial desde la app: confirmación');
const statusExternal = await executeAgentTool({ name: 'set_commercial_status', args: { id: base.id, status: 'approved' } }, ctx('mcp'));
assert.equal(statusExternal.status, 'pending_confirmation', 'y desde fuera');
const proposalStatusApp = await executeAssistantToolset({ name: 'set_proposal_status', args: { id: base.id, status: 'Final' } }, ctx('app-assistant'));
assert.equal(proposalStatusApp.status, 'pending_confirmation', 'estado técnico: confirmación');
const trashApp = await executeAgentTool({ name: 'move_proposal_to_trash', args: { id: base.id } }, ctx('app-assistant'));
assert.equal(trashApp.status, 'pending_confirmation', 'papelera: confirmación también en la app');
assert.equal(projectOf().commercial?.status === 'approved', false);
assert.equal(projectOf().isDeleted ?? false, false);
// Deshacer una creación la manda a la papelera: se confirma aunque la creación fuera en vivo.
const created = await executeAssistantToolset({ name: 'create_proposal', args: { clientName: 'Cliente F3b' } }, ctx('app-assistant'));
assert.equal(created.status, 'applied', JSON.stringify(created.error));
const undoCreate = await executeAssistantToolset({ name: 'undo_change', args: { proposalId: created.proposalId! } }, ctx('app-assistant'));
assert.equal(undoCreate.status, 'pending_confirmation', 'papelera vía deshacer: confirmación');
// Deshacer el estado técnico o la decisión comercial tampoco va en vivo: lo que se confirmó al hacerlo se confirma al deshacerlo.
reset();
const statusShared = await executeAssistantToolset({ name: 'set_commercial_status', args: { id: base.id, status: 'approved' } }, ctx('app-assistant', 'turn-shared-1'));
assert.equal(s().confirmAgentAction(statusShared.actionId!).success, true);
assert.equal(projectOf().commercial?.status, 'approved');
const undoCommercial = await executeAssistantToolset({ name: 'undo_change', args: { proposalId: base.id } }, ctx('app-assistant'));
assert.equal(undoCommercial.status, 'pending_confirmation', 'deshacer la decisión comercial: confirmación');
assert.equal(projectOf().commercial?.status, 'approved', 'pendiente: nada deshecho');
store.setState({ pendingAgentActions: [] });
const technical = await executeAssistantToolset({ name: 'set_proposal_status', args: { id: base.id, status: 'Final' } }, ctx('app-assistant', 'turn-shared-2'));
assert.equal(s().confirmAgentAction(technical.actionId!).success, true);
const statusAfter = projectOf().status;
const undoTechnical = await executeAssistantToolset({ name: 'undo_change', args: { proposalId: base.id } }, ctx('app-assistant'));
assert.equal(undoTechnical.status, 'pending_confirmation', 'deshacer el estado técnico: confirmación');
assert.equal(projectOf().status, statusAfter);
store.setState({ pendingAgentActions: [] });
// Un turno que mezcla un cambio en vivo con uno compartido: deshacer el turno entero se confirma.
const mixedTurn = 'turn-shared-3';
const liveInTurn = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '85' }] } }, ctx('app-assistant', mixedTurn));
assert.equal(liveInTurn.status, 'applied', JSON.stringify(liveInTurn.error));
const sharedInTurn = await executeAssistantToolset({ name: 'set_commercial_status', args: { id: base.id, status: 'rejected' } }, ctx('app-assistant', mixedTurn));
assert.equal(s().confirmAgentAction(sharedInTurn.actionId!).success, true);
// Hoy las herramientas compartidas no guardan el turno en la actividad; si F4 lo propaga, el turno quedaría mezclado. Se simula.
const sharedEntryId = s().agentActivity.find((a) => a.tool === 'set_commercial_status' && a.status === 'applied')!.id; // la más reciente
store.setState({ agentActivity: s().agentActivity.map((a) => (a.id === sharedEntryId ? { ...a, turnId: mixedTurn } : a)) });
assert.equal(s().agentActivity.filter((a) => a.turnId === mixedTurn && a.status === 'applied').length, 2, 'ambos cambios del turno en la actividad');
const undoTurn = await executeAssistantToolset({ name: 'undo_change', args: { proposalId: base.id, turnId: mixedTurn } }, ctx('app-assistant'));
assert.equal(undoTurn.status, 'pending_confirmation', 'deshacer un turno con algo compartido: confirmación');
// Un cambio en vivo solo se deshace en vivo.
const liveOnly = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }] } }, ctx('app-assistant', 'turn-shared-4'));
const undoLiveOnly = await executeAssistantToolset({ name: 'undo_change', args: { proposalId: base.id, activityId: liveOnly.activityId } }, ctx('app-assistant'));
assert.equal(undoLiveOnly.status, 'applied', JSON.stringify(undoLiveOnly.error));
store.setState({ pendingAgentActions: [] });
// Un equipo del catálogo compartido (propose_equipment_update) sigue protegido.
const equipmentEdit = await executeAgentTool({ name: 'propose_equipment_update', args: { id: battery.id, edits: [{ section: 'equipment', field: 'displayName', valueJson: '"Otro nombre"' }] } }, ctx('app-assistant'));
assert.equal(equipmentEdit.status, 'pending_confirmation', JSON.stringify(equipmentEdit));
assert.equal(s().equipmentCatalog.find((e) => e.id === battery.id)!.displayName, battery.displayName, 'el catálogo no cambia sin confirmación');

// ── 4. Se conservan permisos de cuenta, papelera, conflicto y lo que oculta la organización ─────────────────────────────
reset();
store.setState({ projects: s().projects.map((p) => (p.id === base.id ? { ...p, isDeleted: true } : p)) });
const inTrash = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: marginOps } }, ctx('app-assistant'));
assert.equal(inTrash.status, 'error', 'papelera: solo lectura, también en vivo');
reset();
store.setState({ projects: s().projects.map((p) => (p.id === base.id ? { ...p, syncStatus: 'conflict' as const } : p)) });
const inConflict = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: marginOps } }, ctx('app-assistant'));
assert.equal(inConflict.status, 'error', 'conflicto: solo lectura, también en vivo');
// Permisos de la cuenta: con la propuesta VISIBLE en la organización, un lector no edita ni en vivo y un administrador sí.
const orgServer = 'https://org.invalid';
const inOrganization = (role: string) => {
  reset();
  store.setState({
    workspaceScope: featureScope(orgServer, 'o'),
    projects: s().projects.map((p) => ({ ...p, organizationId: 'o', syncServerUrl: orgServer })),
    syncSettings: { ...s().syncSettings, serverUrl: orgServer, currentUser: { id: 'u', email: 'qa@qa.test', name: 'QA', role, organizationId: 'o', organizationName: 'QA' } as any, authToken: 'token-qa' },
  });
};
inOrganization('LECTOR');
const reader = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: priceOps } }, ctx('app-assistant'));
assert.equal(reader.status, 'error', 'un lector solo consulta');
assert.match(reader.error?.message ?? '', /permisos/, `el motivo es el rol, no la visibilidad: ${JSON.stringify(reader.error)}`);
assert.equal(s().pendingAgentActions.length, 0);
inOrganization('ADMIN');
const admin = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: priceOps } }, ctx('app-assistant'));
assert.equal(admin.status, 'applied', `un administrador sí, en vivo: ${JSON.stringify(admin.error)}`);
reset();
store.setState({ localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS, netMeteringRegimeSelector: false } });
const hidden = await executeAssistantToolset({ name: 'edit_proposal', args: { proposalId: base.id, ops: [{ op: 'set_net_metering', regime: 'sie007_2026' }] } }, ctx('app-assistant'));
assert.equal(hidden.status, 'error', 'lo que la organización oculta sigue sin poder editarse');
assert.ok(hidden.error?.errors?.some((e) => e.path === 'rates.netMeteringRegime'), JSON.stringify(hidden.error));

// ── 5. propose_project_update desde el MCP: igual que hoy (precio ⇒ confirmación) ─────────────────────────────────────────
reset();
s().setActiveProject(base.id, 'simulator');
const legacyExternal = await executeAgentTool({
  name: 'propose_project_update',
  args: { id: base.id, title: 'Margen', edits: [{ section: 'specs', field: 'saleMarginMultiplier', valueJson: '1.2' }] },
}, ctx('mcp'));
assert.equal(legacyExternal.status, 'pending_confirmation', JSON.stringify(legacyExternal));
assert.equal(JSON.stringify(projectOf().specs.saleMarginMultiplier), JSON.stringify(base.specs.saleMarginMultiplier), 'pendiente: nada escrito');

// ── 6. Encender el asistente flotante: una sola vez, detrás de una bandera que F4/F5b enciende ───────────────────────────
assert.equal(APP_ASSISTANT_ON_BY_DEFAULT, false, 'F3b deja la migración escrita y apagada: encenderla antes de F4 expondría el asistente a medias');
assert.equal(APP_ASSISTANT_DEFAULTS_VERSION, 1);
const on = { onByDefault: true };
// Con la bandera apagada: lo de hoy (solo `true` enciende) y la marca NO se estampa, para que la migración corra al encenderla.
assert.deepEqual(migrateAppAssistantEnabled({ appAssistantEnabled: false }), { appAssistantEnabled: false, appAssistantEnabledChosenByUser: false, appAssistantDefaultsVersion: 0 });
assert.deepEqual(migrateAppAssistantEnabled({ appAssistantEnabled: true }), { appAssistantEnabled: true, appAssistantEnabledChosenByUser: false, appAssistantDefaultsVersion: 0 });
assert.equal(migrateAppAssistantEnabled({ appAssistantEnabled: 'yes' }).appAssistantEnabled, false);
// Con la bandera encendida: el `false` heredado (o ausente) pasa a encendido UNA vez y queda la marca.
const first = migrateAppAssistantEnabled({ appAssistantEnabled: false }, on);
assert.deepEqual(first, { appAssistantEnabled: true, appAssistantEnabledChosenByUser: false, appAssistantDefaultsVersion: APP_ASSISTANT_DEFAULTS_VERSION });
assert.equal(migrateAppAssistantEnabled({}, on).appAssistantEnabled, true, 'instalación sin el campo');
assert.deepEqual(migrateAppAssistantEnabled(first, on), first, 'idempotente');
// Después de la marca, un apagado cuenta: no se vuelve a encender.
assert.equal(migrateAppAssistantEnabled({ ...first, appAssistantEnabled: false }, on).appAssistantEnabled, false, 'tras la marca se respeta el apagado');
// Un apagado elegido en Ajustes antes de que se encienda la bandera también cuenta (desde F3b el interruptor lo registra).
assert.equal(migrateAppAssistantEnabled({ appAssistantEnabled: false, appAssistantEnabledChosenByUser: true }, on).appAssistantEnabled, false);
assert.equal(migrateAppAssistantEnabled({ appAssistantEnabled: true, appAssistantEnabledChosenByUser: true }, on).appAssistantEnabled, true);

// El interruptor registra la elección, se persiste y la hidratación la respeta (con la bandera de hoy, apagada).
reset();
store.setState({ appAssistantEnabled: false, appAssistantEnabledChosenByUser: false, appAssistantDefaultsVersion: 0 });
s().setAppAssistantEnabled(true);
assert.equal(s().appAssistantEnabledChosenByUser, true, 'el interruptor marca la elección del usuario');
s().setAppAssistantEnabled(false);
const persisted = serializeSimulationStore(s()) as Record<string, unknown>;
assert.equal(persisted.appAssistantEnabled, false);
assert.equal(persisted.appAssistantEnabledChosenByUser, true, 'la elección se guarda');
assert.equal(persisted.appAssistantDefaultsVersion, 0, 'la marca se guarda');
const reloaded = structuredClone(persisted) as unknown as SimulationStore;
hydrateSimulationStore(reloaded);
assert.equal(reloaded.appAssistantEnabled, false);
assert.equal(reloaded.appAssistantEnabledChosenByUser, true);
// Un estado guardado antiguo (sin los campos nuevos) arranca como hoy: apagado y sin marca.
const legacyRaw = structuredClone(persisted);
delete legacyRaw.appAssistantEnabledChosenByUser;
delete legacyRaw.appAssistantDefaultsVersion;
const legacy = legacyRaw as unknown as SimulationStore;
hydrateSimulationStore(legacy);
assert.equal(legacy.appAssistantEnabled, false, 'hasta F4/F5b nadie se enciende solo');
assert.equal(legacy.appAssistantEnabledChosenByUser, false);
assert.equal(legacy.appAssistantDefaultsVersion, 0);

// El ciclo completo con la bandera encendida (la que F4/F5b enciende): guardado antiguo con `false` → hidratar → encendido y
// marca → el usuario lo apaga → guardar → rehidratar → sigue apagado.
const onHydrate = { appAssistantOnByDefault: true };
const oldInstall = structuredClone(legacyRaw) as Record<string, unknown>;
oldInstall.appAssistantEnabled = false;
delete oldInstall.appAssistantEnabledChosenByUser;
const migrated = oldInstall as unknown as SimulationStore;
hydrateSimulationStore(migrated, onHydrate);
assert.equal(migrated.appAssistantEnabled, true, 'se enciende una vez');
assert.equal(migrated.appAssistantDefaultsVersion, APP_ASSISTANT_DEFAULTS_VERSION, 'y queda la marca');
reset();
store.setState({ appAssistantEnabled: migrated.appAssistantEnabled, appAssistantEnabledChosenByUser: migrated.appAssistantEnabledChosenByUser, appAssistantDefaultsVersion: migrated.appAssistantDefaultsVersion });
s().setAppAssistantEnabled(false);
const afterOff = structuredClone(serializeSimulationStore(s())) as unknown as SimulationStore;
hydrateSimulationStore(afterOff, onHydrate);
assert.equal(afterOff.appAssistantEnabled, false, 'el apagado del usuario se respeta al rehidratar');
assert.equal(afterOff.appAssistantDefaultsVersion, APP_ASSISTANT_DEFAULTS_VERSION);
// Rehidratar lo ya migrado sin tocar el interruptor tampoco vuelve a correr la migración.
const migratedAgain = structuredClone({ ...afterOff, appAssistantEnabledChosenByUser: false }) as SimulationStore;
hydrateSimulationStore(migratedAgain, onHydrate);
assert.equal(migratedAgain.appAssistantEnabled, false, 'la marca basta: no se vuelve a encender');

console.log('PASS: perfil «edición en vivo»: precios dentro de la propuesta en vivo en la app y con confirmación desde fuera; lo compartido se confirma en ambas; propose_project_update igual; migración del encendido de una sola vez, detrás de su bandera.');
