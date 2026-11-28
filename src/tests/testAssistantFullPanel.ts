// F5b: el panel completo del asistente único sobre la sesión de F4, sin DOM simulado (la lógica va en funciones puras y en la
// sesión fuera de React; scroll, foco y arrastre se comprueban a mano, docs/QA.md):
//  1. Acoplado o flotante según la vista y el ancho (`assistantPanelLayout`), con sus límites de ancho.
//  2. Escribir mientras trabaja: el mensaje se encola y se entrega al terminar el paso en curso; el historial sigue válido.
//  3. Stop con un mensaje en cola no reenvía nada (ni el anterior ni el encolado, que vuelve al compositor).
//  4. Las tres entradas del asistente de propuestas abren la sesión del asistente único (la de factura, con el selector).
//  5. El turno pinta ChangeCard con los datos reales de edit_proposal (Deshacer conectado) y dispara el resaltado del dock.
//  6. Cerrar no cancela: insignia de trabajo en curso o de cambios sin ver.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { DEFAULT_FEATURE_SETTINGS } from '../../shared/applicationFeatures';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';
import { dockHighlightStore } from '../store/dockHighlightStore';
import { ScriptedLlm, type ScriptedCall } from './support/scriptedLlm';
import type { LlmRequest } from '../services/llm/types';
import { resetAssistantToolPorts } from '../features/agentTools/appAssistant/ports';
import { closedTurnProblems, runAgentLoop } from '../features/assistant/session/agentLoop';
import { ChatComposer } from '../features/assistant/components/ChatComposer';
import { createAssistantSession, type AssistantSession, type SessionMessage } from '../features/assistant/session/assistantSession';
import {
  ASSISTANT_PANEL_DEFAULT_PX, ASSISTANT_PANEL_MAX_PX, ASSISTANT_PANEL_MIN_PX, DOCK_MIN_CONTENT_PX, assistantPanelLayout, parameterSidebarPx,
} from '../features/assistant/panelLayout';
import { assistantBadge, turnChangeCards } from '../features/assistant/panelState';
import { ASSISTANT_ENTRY_PROMPTS, openAssistant } from '../features/assistant/assistantEntry';
import { AssistantTurnDetails } from '../features/assistant/components/AssistantTurnDetails';
import type { ProjectSimulation } from '../types';

// ── 1. Acoplado o flotante ───────────────────────────────────────────────────────────────────────────────────────────────
assert.equal(ASSISTANT_PANEL_MIN_PX, 280);
assert.equal(ASSISTANT_PANEL_MAX_PX, 720);
assert.equal(DOCK_MIN_CONTENT_PX, 640);
// El dock de parámetros se mide como lo dibuja su CSS (parameterSidebarCssWidth): mínimo 380 en ventanas amplias, 40 % en estrechas.
assert.equal(parameterSidebarPx(380, 1920), 380);
assert.equal(parameterSidebarPx(500, 1920), 500);
assert.equal(parameterSidebarPx(300, 1920), 380, 'nunca menos de 380 en una ventana amplia');
assert.equal(parameterSidebarPx(500, 800), 320, 'en pantalla dividida cede hasta el 40 %');
assert.equal(parameterSidebarPx(500, 600), 280, 'sin bajar de 280');
{
  const docked = assistantPanelLayout({ view: 'simulator', viewportWidth: 1920, parameterSidebarWidth: 380 });
  assert.deepEqual(docked, { mode: 'docked', width: ASSISTANT_PANEL_DEFAULT_PX, minWidth: 280, maxWidth: 720 }, 'simulador en 1920: columna con el ancho por defecto');
  // 1440 − 64 (dock principal) − 380 (parámetros) − 640 (contenido) = 356: cabe, acotado.
  assert.deepEqual(assistantPanelLayout({ view: 'simulator', viewportWidth: 1440, parameterSidebarWidth: 380 }), { mode: 'docked', width: 356, minWidth: 280, maxWidth: 356 });
  assert.equal(assistantPanelLayout({ view: 'simulator', viewportWidth: 1280, parameterSidebarWidth: 380 }).mode, 'floating', '1280 con el dock de parámetros: no quedan 640 px, flota para no tapar resultados');
  assert.equal(assistantPanelLayout({ view: 'simulator', viewportWidth: 1440, parameterSidebarWidth: 600 }).mode, 'floating', 'un dock de parámetros más ancho también cuenta');
  assert.equal(assistantPanelLayout({ view: 'simulator', viewportWidth: 960, parameterSidebarWidth: 380 }).mode, 'floating', 'pantalla dividida: flotante');
  assert.equal(assistantPanelLayout({ view: 'project-hub', viewportWidth: 1280 }).mode, 'docked', 'resumen en 1280: 576 px libres');
  assert.equal(assistantPanelLayout({ view: 'pdf-preview', viewportWidth: 1024 }).width, 320, 'vista previa en 1024: el máximo que deja 640 px');
  assert.equal(assistantPanelLayout({ view: 'pdf-preview', viewportWidth: 960 }).mode, 'floating');
  // El ancho elegido se acota a [280, máximo].
  assert.equal(assistantPanelLayout({ view: 'project-hub', viewportWidth: 1280, panelWidth: 900 }).width, 576);
  assert.equal(assistantPanelLayout({ view: 'project-hub', viewportWidth: 1920, panelWidth: 900 }).width, 720);
  assert.equal(assistantPanelLayout({ view: 'project-hub', viewportWidth: 1920, panelWidth: 100 }).width, 280);
  assert.equal(assistantPanelLayout({ view: 'project-hub', viewportWidth: 1920, panelWidth: Number.NaN }).width, ASSISTANT_PANEL_DEFAULT_PX);
  // En Inicio y el resto de vistas sigue flotante, a cualquier ancho.
  for (const view of ['dashboard', 'clients-hub', 'companies-hub', 'quotations-hub', 'quotation-editor', 'quotation-library'])
    assert.equal(assistantPanelLayout({ view, viewportWidth: 2560 }).mode, 'floating', view);
}

// ── Sesión con el store real y el modelo guionizado ──────────────────────────────────────────────────────────────────────
const store = useSimulationStore;
const s = () => store.getState();
const stamp = '2026-10-01T00:00:00.000Z';
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG).map((item) => ({ ...item, supplierPrices: [] as NonNullable<typeof item.supplierPrices> }));
catalog.find((e) => e.id === 'eq-mod-cs-620')!.supplierPrices = [{ id: 'sp-p', supplierName: 'QA Paneles', priceUSD: 95, stockStatus: 'in_stock', updatedAt: stamp }];
catalog.find((e) => e.id === 'eq-inv-luxpower-8k')!.supplierPrices = [{ id: 'sp-i', supplierName: 'QA Inversores', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: stamp }];
const base: ProjectSimulation = { ...structuredClone(BENCHMARK_PROJECT), id: 'f5b-base', syncStatus: 'local_only' };
const reset = (patch: Record<string, unknown> = {}) => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(base)], activeProjectId: base.id, activeView: 'simulator',
  equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
  defaultSimulationSettings: DEFAULT_SIMULATION_SETTINGS, localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS },
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false,
  geminiApiKey: 'synthetic-key', geminiModel: 'gemini-4-hydrogen', isNewProjectModalOpen: false, isSettingsModalOpen: false, isAIInvoiceModalOpen: false,
  syncSettings: { ...s().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
  ...patch,
});
let turnSeq = 0;
function newSession(llm: ScriptedLlm): AssistantSession {
  resetAssistantToolPorts();
  const session = createAssistantSession({ createClient: () => llm, newTurnId: () => `f5b-turn-${++turnSeq}`, sleep: async () => {} });
  session.connectPorts();
  return session;
}
const req = (call: ScriptedCall) => call.request as LlmRequest;
const userTexts = (call: ScriptedCall) => req(call).contents.filter((c) => c.role === 'user').flatMap((c) => c.parts.flatMap((p) => (p.type === 'text' && !p.text.startsWith('{"appContext"') ? [p.text] : [])));
const assistants = (session: AssistantSession) => session.getState().messages.filter((m): m is SessionMessage & { role: 'assistant' } => m.role === 'assistant');
const margin = (pct: number, id: string) => ({ functionCalls: [{ id, name: 'edit_proposal', args: { proposalId: base.id, title: `Margen ${pct} %`, ops: [{ op: 'set_margin_pct', pct }] } }] });
const projectOf = () => s().projects.find((p) => p.id === base.id)!;

// ── 2. Escribir mientras trabaja: se encola y se entrega al terminar el paso en curso ────────────────────────────────────
reset();
{
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  session.setPanelOpen(true);
  let queuedWhileWorking = false;
  llm.push(
    async () => {
      // El usuario escribe mientras el modelo responde: no se pierde, no se envía aún y no corta el paso.
      session.setDraft('Y la cobertura al 90 %');
      await session.send();
      const st = session.getState();
      assert.equal(st.busy, true);
      assert.equal(st.queued?.text, 'Y la cobertura al 90 %', 'el mensaje queda en cola en la sesión');
      assert.equal(st.draft, '', 'y el compositor se vacía');
      queuedWhileWorking = true;
      return margin(31, 'fc-m31');
    },
    (call) => {
      // Ronda siguiente = turno nuevo con el mensaje encolado; el paso anterior se ejecutó y su turno se cerró bien.
      assert.ok(queuedWhileWorking);
      assert.notEqual(projectOf().specs.saleMarginMultiplier, base.specs.saleMarginMultiplier, 'el paso en curso se terminó (margen aplicado)');
      const contents = req(call).contents;
      const last = contents.at(-1)!;
      assert.equal(last.role, 'user');
      assert.equal(last.parts[0].type === 'text' && last.parts[0].text, 'Y la cobertura al 90 %', 'se entrega como mensaje del usuario');
      assert.deepEqual(closedTurnProblems(contents.slice(0, -1)), [], 'el turno interrumpido entra cerrado: sin functionCall huérfano');
      const responses = contents.flatMap((c) => c.parts.filter((p) => p.type === 'functionResponse'));
      assert.equal(responses.length, 1, 'la llamada ejecutada lleva su respuesta real');
      assert.deepEqual(userTexts(call), ['Cambia el margen al 31 %', 'Y la cobertura al 90 %'], 'nada se reenvía: cada mensaje una vez');
      return { functionCalls: [{ id: 'fc-cov', name: 'edit_proposal', args: { proposalId: base.id, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }] } }] };
    },
    { text: 'Listo: margen al 31 % y cobertura al 90 %.' },
  );
  await session.send('Cambia el margen al 31 %');
  llm.assertDone();
  const st = session.getState();
  assert.equal(st.busy, false);
  assert.equal(st.queued, null);
  assert.deepEqual(st.messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  const [first, second] = assistants(session);
  assert.equal(first.outcome, 'yielded', 'el primer turno cede el paso al mensaje nuevo');
  assert.ok(first.notice, 'con una nota breve de lo hecho');
  assert.equal(second.outcome, 'finished');
  assert.equal(projectOf().rates.targetCoveragePct, 90);
  assert.deepEqual(closedTurnProblems(session.history()), [], 'historial válido');
  assert.equal(session.history().filter((c) => c.role === 'user' && c.parts.some((p) => p.type === 'text')).length, 2, 'dos turnos cerrados');

  // Un mensaje escrito durante la respuesta final (sin herramientas) espera a que termine y va en el turno siguiente.
  llm.push(
    async () => { await session.send('¿Y el retorno?'); return { text: 'El margen ya está.' }; },
    (call) => { assert.deepEqual(userTexts(call).slice(-1), ['¿Y el retorno?']); return { text: 'Unos 5 años.' }; },
  );
  await session.send('Confirma el margen');
  llm.assertDone();
  assert.deepEqual(assistants(session).slice(-2).map((m) => m.outcome), ['finished', 'finished']);
  assert.deepEqual(closedTurnProblems(session.history()), []);
  // Dos mensajes en cola se juntan en uno.
  llm.push(
    async () => { await session.send('uno'); await session.send('dos'); assert.equal(session.getState().queued?.text, 'uno\n\ndos'); return { text: 'ok' }; },
    (call) => { assert.deepEqual(userTexts(call).slice(-1), ['uno\n\ndos']); return { text: 'ok 2' }; },
  );
  await session.send('cero');
  llm.assertDone();
}

{
  // El bucle solo (regla 9): cede tras ejecutar el paso, nunca a mitad de una respuesta ni sin cerrar el turno.
  const llm = new ScriptedLlm([{ functionCalls: [{ id: 'a', name: 'uno', args: {} }, { id: 'b', name: 'dos', args: {} }] }]);
  const executed: string[] = [];
  const result = await runAgentLoop({
    client: llm, model: 'm', systemInstruction: 'x', tools: [], history: [], user: { role: 'user', parts: [{ type: 'text', text: 'hola' }] },
    signal: new AbortController().signal, shouldYield: () => true,
    execute: async (call) => { executed.push(call.name); return { status: 'ok' }; },
  });
  assert.equal(result.outcome, 'yielded');
  assert.deepEqual(executed, ['uno', 'dos'], 'las llamadas de la respuesta en curso se ejecutan todas antes de ceder');
  assert.equal(llm.calls.length, 1, 'no pide otra ronda');
  assert.deepEqual(closedTurnProblems(result.contents), [], 'turno cerrado con texto local');
  assert.equal(result.contents.at(-1)!.role, 'model');
}
{
  // El compositor en modo cola: con un turno en curso el campo sigue editable y Detener es un botón aparte de Enviar.
  const props = { id: 'c', label: 'Mensaje', value: 'otra cosa', onChange() {}, onSubmit() {}, onCancel() {}, onPickFiles() {}, canSend: true, attachments: [], placeholder: '', accept: '' };
  const queueing = renderToStaticMarkup(createElement(ChatComposer, { ...props, busy: true, queueWhileBusy: true }));
  assert.ok(!/readonly/i.test(queueing.match(/<textarea[^>]*>/)![0]), 'se puede escribir mientras trabaja');
  assert.match(queueing, /aria-label="Detener"/);
  assert.match(queueing, /aria-label="Enviar al terminar el paso"/);
  assert.match(queueing, /Enter lo deja en cola/);
  const classic = renderToStaticMarkup(createElement(ChatComposer, { ...props, busy: true }));
  assert.match(classic.match(/<textarea[^>]*>/)![0], /readonly/i, 'sin cola (modal antiguo), como siempre');
  assert.doesNotMatch(classic, /Enviar al terminar el paso/);
}

// ── 3. Stop con un mensaje en cola: no se reenvía nada y el encolado vuelve al compositor ───────────────────────────────
reset();
{
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  llm.push(async () => {
    await session.send('mensaje en cola');
    assert.equal(session.getState().queued?.text, 'mensaje en cola');
    session.cancel();
    return margin(33, 'fc-stop');
  });
  await session.send('Cambia el margen al 33 %');
  llm.assertDone();
  assert.equal(llm.calls.length, 1, 'Stop no reenvía el mensaje anterior ni entrega el encolado');
  const st = session.getState();
  assert.equal(st.busy, false);
  assert.equal(st.queued, null);
  assert.equal(st.draft, 'mensaje en cola', 'lo encolado vuelve al compositor: el usuario decide si lo envía');
  assert.equal(assistants(session).at(-1)!.outcome, 'cancelled');
  assert.deepEqual(closedTurnProblems(session.history()), [], 'sin functionCall huérfano tras Stop');
  assert.equal(projectOf().specs.saleMarginMultiplier, base.specs.saleMarginMultiplier, 'la llamada tras Stop no se ejecutó');
  llm.push((call) => {
    // Stop antes de ejecutar nada: el turno detenido no entra en el historial (F4) y su mensaje no se reenvía.
    assert.deepEqual(userTexts(call), ['mensaje en cola'], 'el siguiente turno no reenvía el mensaje detenido');
    assert.deepEqual(closedTurnProblems(req(call).contents.slice(0, -1)), []);
    return { text: 'Hecho.' };
  });
  await session.send();
  llm.assertDone();
  // Stop sin cola tampoco deja nada encolado ni toca el borrador.
  session.setDraft('a medias');
  session.cancel();
  assert.equal(session.getState().draft, 'a medias');
}

// ── 4. Las tres entradas abren el asistente único (no el modal antiguo) ──────────────────────────────────────────────────
for (const entry of ['dock-menu', 'new-project', 'invoice'] as const) {
  reset({ appAssistantEnabled: false, appAssistantEnabledChosenByUser: true, isNewProjectModalOpen: entry === 'new-project', isSettingsModalOpen: entry === 'dock-menu' });
  const session = newSession(new ScriptedLlm());
  openAssistant(entry, { session });
  const st = session.getState();
  assert.equal(st.panelOpen, true, `${entry}: abre el panel del asistente único`);
  assert.equal(s().isAIInvoiceModalOpen, false, `${entry}: el modal antiguo no se abre`);
  assert.equal(s().appAssistantEnabled, true, `${entry}: pedirlo desde una entrada lo enciende (es una elección del usuario)`);
  assert.equal(s().isNewProjectModalOpen, false, `${entry}: ningún modal tapa el panel`);
  assert.equal(s().isSettingsModalOpen, false);
  assert.equal(st.filePickerRequested, entry === 'invoice', `${entry}: el selector de archivo solo lo pide «Autocompletar con factura»`);
  assert.equal(st.draft, ASSISTANT_ENTRY_PROMPTS[entry], `${entry}: borrador sugerido, sin enviarlo`);
  assert.equal(st.messages.length, 0, `${entry}: no envía nada solo`);
  session.consumeFilePickerRequest();
  assert.equal(session.getState().filePickerRequested, false);
}
{
  // Un borrador que el usuario ya escribió no se pisa; el nombre de «Nueva simulación» entra en la sugerencia.
  reset();
  const session = newSession(new ScriptedLlm());
  session.setDraft('lo mío');
  openAssistant('invoice', { session });
  assert.equal(session.getState().draft, 'lo mío');
  const other = newSession(new ScriptedLlm());
  openAssistant('new-project', { session: other, projectName: 'Casa Pérez' });
  assert.equal(other.getState().draft, 'Crea una propuesta llamada «Casa Pérez»');
}
{
  // Las tres entradas del asistente de propuestas llaman a openAssistant y ya no abren el modal (sus archivos siguen hasta F6).
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
  for (const file of ['../components/layout/PrimaryIconDock.tsx', '../components/common/NewProjectModal.tsx', '../components/simulator/tabs/EnergyAnalysisTab.tsx', '../components/simulator/SimulatorView.tsx']) {
    const text = read(file);
    assert.ok(!/openAIInvoiceModal/.test(text), `${file}: ya no abre el modal antiguo`);
  }
  assert.match(read('../components/layout/PrimaryIconDock.tsx'), /openAssistant\('dock-menu'/);
  assert.match(read('../components/common/NewProjectModal.tsx'), /openAssistant\('new-project'/);
  assert.match(read('../components/simulator/tabs/EnergyAnalysisTab.tsx'), /openAssistant\('invoice'/);
  assert.ok(readFileSync(new URL('../components/common/ai-invoice/AIInvoiceScannerModal.tsx', import.meta.url), 'utf8').length > 0, 'el modal antiguo no se borra en F5b');
}

// ── 5. ChangeCard con los datos reales de edit_proposal, Deshacer conectado y resaltado del dock ─────────────────────────
reset();
{
  dockHighlightStore.clear();
  const llm = new ScriptedLlm([
    { functionCalls: [{ id: 'fc-card', name: 'edit_proposal', args: { proposalId: base.id, title: 'Cobertura 85', ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '85' }] } }] },
    { text: 'Cobertura al 85 %.' },
  ]);
  const session = newSession(llm);
  await session.send('Cobertura al 85 %');
  llm.assertDone();
  const reply = assistants(session).at(-1)!;
  const cards = turnChangeCards(reply);
  assert.equal(cards.length, 1, 'una tarjeta por cambio');
  const card = cards[0];
  assert.equal(card.input.status, 'applied');
  assert.equal(card.input.title, 'Cobertura 85', 'el título que pidió el modelo');
  assert.equal(card.input.proposalId, base.id);
  const coverage = card.input.changes.find((c) => c.path === 'rates.targetCoveragePct');
  assert.ok(coverage, JSON.stringify(card.input.changes));
  assert.equal(coverage!.before, base.rates.targetCoveragePct);
  assert.equal(coverage!.after, 85);
  assert.ok(card.input.results?.before && card.input.results.after, 'resultados del motor antes y después');
  assert.ok(card.input.activityId, 'con la actividad para deshacer');
  // El bucle nuevo dispara el resaltado del dock (commitProjectEdits con source 'assistant').
  const marks = dockHighlightStore.getState();
  assert.equal(marks.projectId, base.id);
  assert.ok(marks.marks.length > 0, 'el dock destaca el control tocado');
  const html = () => renderToStaticMarkup(createElement(AssistantTurnDetails, { message: assistants(session).at(-1)!, busy: false, actions: { confirmPending() {}, rejectPending() {}, undo: (id: string) => { session.undoActivity(id); }, continueTurn() {} } }));
  assert.match(html(), /data-change-card="applied"/, 'el panel pinta ChangeCard');
  assert.match(html(), /Deshacer/);
  assert.ok(!/assistant-turn-list/.test(html().split('Supuse')[0]), 'la lista de texto de F4 ya no pinta los cambios');
  assert.equal(session.undoActivity(card.input.activityId!).success, true);
  assert.equal(projectOf().rates.targetCoveragePct, base.rates.targetCoveragePct, 'Deshacer revierte el cambio real');
  assert.equal(turnChangeCards(assistants(session).at(-1)!)[0].input.status, 'undone');
  assert.match(html(), /data-change-card="undone"/);
  assert.doesNotMatch(html(), />Deshacer</, 'un cambio deshecho no ofrece deshacer otra vez');
}
{
  // Crear una propuesta: el dock destaca las secciones que se llenaron, en la propuesta nueva (no hay diff por ruta, así que
  // tampoco tarjeta de cambio: lo dice el texto del turno).
  reset({ activeView: 'dashboard', activeProjectId: '' });
  dockHighlightStore.clear();
  const llm = new ScriptedLlm([{ functionCalls: [{ id: 'fc-new', name: 'create_proposal', args: {} }] }, { text: 'Creada.' }]);
  const session = newSession(llm);
  await session.send('Crea una propuesta');
  llm.assertDone();
  const createdId = s().activeProjectId;
  assert.notEqual(createdId, base.id);
  assert.equal(dockHighlightStore.getState().projectId, createdId, 'el dock destaca lo que llenó la creación');
  assert.ok(dockHighlightStore.getState().marks.length >= 3, 'cliente, tarifa, consumo y equipos');
}
{
  // Pendiente de confirmación (perfil «pedir confirmación»): Confirmar y Rechazar desde la tarjeta, conectados a la cola real.
  reset({ agentPolicy: { ...DEFAULT_AGENT_POLICY, appAssistantProfile: 'confirm' } });
  const llm = new ScriptedLlm([margin(29, 'fc-pend'), { text: 'Confírmalo en la tarjeta.' }]);
  const session = newSession(llm);
  await session.send('Margen al 29 %');
  const [pending] = turnChangeCards(assistants(session).at(-1)!);
  assert.equal(pending.input.status, 'pending_confirmation');
  assert.ok(pending.input.actionId);
  assert.equal(session.confirmPending(pending.input.actionId!).success, true);
  assert.notEqual(projectOf().specs.saleMarginMultiplier, base.specs.saleMarginMultiplier, 'confirmar aplica');
  assert.equal(turnChangeCards(assistants(session).at(-1)!)[0].input.status, 'applied');
  const llm2 = new ScriptedLlm([margin(27, 'fc-rej'), { text: 'Ok.' }]);
  const session2 = newSession(llm2);
  await session2.send('Margen al 27 %');
  const [toReject] = turnChangeCards(assistants(session2).at(-1)!);
  session2.rejectPending(toReject.input.actionId!);
  assert.equal(turnChangeCards(assistants(session2).at(-1)!)[0].input.status, 'rejected');
}
{
  // Una consulta no pinta tarjeta; un error de una escritura sí (sin cifras).
  reset();
  const llm = new ScriptedLlm([
    { functionCalls: [{ id: 'q', name: 'search_projects', args: { query: '' } }, { id: 'bad', name: 'edit_proposal', args: { proposalId: 'no-existe', ops: [{ op: 'set_margin_pct', pct: 30 }] } }] },
    { text: 'No existe.' },
  ]);
  const session = newSession(llm);
  await session.send('busca y edita');
  const cards = turnChangeCards(assistants(session).at(-1)!);
  assert.deepEqual(cards.map((c) => c.input.status), ['error']);
}

// ── 6. Cerrar no cancela; insignia discreta ─────────────────────────────────────────────────────────────────────────────
reset();
{
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  session.setPanelOpen(true);
  llm.push(() => {
    session.setPanelOpen(false);
    assert.equal(assistantBadge(session.getState()).kind, 'working', 'trabajando con el panel cerrado');
    return margin(32, 'fc-badge');
  }, { text: 'Hecho.' });
  await session.send('Margen al 32 %');
  assert.equal(assistants(session).at(-1)!.outcome, 'finished', 'cerrar el panel no canceló el turno');
  assert.equal(session.getState().unseen, true);
  const badge = assistantBadge(session.getState());
  assert.equal(badge.kind, 'unseen', 'cambios sin ver');
  assert.ok(badge.label);
  session.setPanelOpen(true);
  assert.equal(session.getState().unseen, false, 'abrir el panel los marca vistos');
  assert.equal(assistantBadge(session.getState()).kind, null);
  // Con el panel abierto, terminar un turno no deja nada «sin ver».
  llm.push({ text: 'Sí.' });
  await session.send('¿Listo?');
  assert.equal(session.getState().unseen, false);
}

console.log('PASS: panel completo del asistente (acoplado/flotante, cola mientras trabaja, Stop con cola, tres entradas, ChangeCard real, insignia).');
