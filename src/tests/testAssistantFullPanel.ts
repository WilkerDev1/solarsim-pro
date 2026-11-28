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
  ASSISTANT_PANEL_DEFAULT_PX, ASSISTANT_PANEL_MAX_PX, ASSISTANT_PANEL_MIN_PX, DOCK_MIN_CONTENT_PX, PDF_PAGE_CONTENT_PX, assistantPanelLayout, parameterSidebarPx,
} from '../features/assistant/panelLayout';
import { assistantBadge, assistantPanelBlock, createdProposalCard, turnChangeCards, turnUndoTargets } from '../features/assistant/panelState';
import { ASSISTANT_ENTRY_PROMPTS, openAssistant } from '../features/assistant/assistantEntry';
import { AssistantTurnDetails, type TurnDetailsLive } from '../features/assistant/components/AssistantTurnDetails';
import { composerEscapeAction } from '../features/assistant/chatUi';
import { engineResults, proposalStateSummary } from '../domain/proposalSnapshot';
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
  // Vista previa del PDF (segunda ronda): descuenta su barra de controles (min(340, 40 %)) y deja la página entera (850 px +
  // el margen del lienzo) sin scroll horizontal; antes acoplaba en 1024 y recortaba la página.
  assert.equal(assistantPanelLayout({ view: 'pdf-preview', viewportWidth: 1024 }).mode, 'floating', 'vista previa en 1024: la página no cabe con la columna');
  assert.equal(assistantPanelLayout({ view: 'pdf-preview', viewportWidth: 960 }).mode, 'floating');
  assert.equal(assistantPanelLayout({ view: 'pdf-preview', viewportWidth: 1440 }).mode, 'floating', '1440 − 64 − 340 − 914 < 280');
  {
    const at1600 = assistantPanelLayout({ view: 'pdf-preview', viewportWidth: 1600 });
    assert.equal(at1600.mode, 'docked');
    assert.equal(at1600.maxWidth, 1600 - 64 - 340 - PDF_PAGE_CONTENT_PX, 'en 1600 la columna no recorta la página');
    assert.equal(at1600.width, at1600.maxWidth, 'el ancho de fábrica (380) se acota para no recortar');
  }
  assert.equal(assistantPanelLayout({ view: 'pdf-preview', viewportWidth: 1920 }).maxWidth, 1920 - 64 - 340 - PDF_PAGE_CONTENT_PX);
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

// ── 7. Correcciones de la revisión adversarial de F5b ───────────────────────────────────────────────────────────────────
const pdf = (name: string) => ({ name, arrayBuffer: async () => new TextEncoder().encode(`%PDF-1.4 ${name}`).buffer as ArrayBuffer });
const details = (session: AssistantSession, live?: TurnDetailsLive) =>
  renderToStaticMarkup(createElement(AssistantTurnDetails, {
    message: assistants(session).at(-1)!, busy: false, live,
    actions: { confirmPending() {}, rejectPending() {}, undo() {}, undoTurn() {}, continueTurn() {} },
  }));
const liveNow = (now = Date.now()): TurnDetailsLive => ({ agentActivity: s().agentActivity, pendingAgentActions: s().pendingAgentActions, projects: s().projects, now });
{
  // 7.1 Esc en el compositor: en modo cola (el asistente único) no detiene; Detener queda solo en su botón.
  assert.equal(composerEscapeAction({ busy: true, queueWhileBusy: false, isComposing: false }), 'stop', 'sin cola (modal antiguo), Esc detiene como siempre');
  assert.equal(composerEscapeAction({ busy: true, queueWhileBusy: true, isComposing: false }), null, 'con cola, Esc no mata el turno mientras se escribe');
  assert.equal(composerEscapeAction({ busy: false, queueWhileBusy: true, isComposing: false }), null);
  assert.equal(composerEscapeAction({ busy: true, queueWhileBusy: false, isComposing: true }), null, 'Esc de un IME nunca detiene');
  const props = { id: 'c', label: 'Mensaje', value: 'algo', onChange() {}, onSubmit() {}, onCancel() {}, onPickFiles() {}, canSend: true, attachments: [], placeholder: '', accept: '' };
  const queueing = renderToStaticMarkup(createElement(ChatComposer, { ...props, busy: true, queueWhileBusy: true }));
  assert.doesNotMatch(queueing, /Esc detiene/, 'la pista no promete que Esc detiene');
  assert.doesNotMatch(queueing, /title="Detener \(Esc\)"/);
}
reset();
{
  // 7.2 Deshacer que falla: la tarjeta lo dice (role=alert) y deja de ofrecer Deshacer.
  const llm = new ScriptedLlm([
    { functionCalls: [{ id: 'fc-u1', name: 'edit_proposal', args: { proposalId: base.id, title: 'Cobertura 85', ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '85' }] } }] },
    { text: 'Hecho.' },
  ]);
  const session = newSession(llm);
  await session.send('Cobertura al 85 %');
  const [card] = turnChangeCards(assistants(session).at(-1)!);
  s().updateSpecs({ systemLosses: 17 });
  s().updateRates({ targetCoveragePct: 70 });
  const result = session.undoActivity(card.input.activityId!);
  assert.equal(result.success, false, JSON.stringify(result));
  const [after] = turnChangeCards(assistants(session).at(-1)!);
  assert.equal(after.input.error?.message, result.error, 'el fallo de Deshacer queda en la tarjeta');
  const html = details(session, liveNow());
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, />Deshacer</, 'sin un Deshacer que vuelva a fallar');
}
reset();
{
  // 7.2b El modelo deshizo con undo_change: la tarjeta original pasa a «deshecho» (lo dice la actividad).
  const llm = new ScriptedLlm([
    { functionCalls: [{ id: 'fc-u2', name: 'edit_proposal', args: { proposalId: base.id, title: 'Cobertura 85', ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '85' }] } }] },
    { functionCalls: [{ id: 'fc-u3', name: 'undo_change', args: { proposalId: base.id } }] },
    { text: 'Lo deshice.' },
  ]);
  const session = newSession(llm);
  await session.send('Cobertura al 85 % y luego deshazlo');
  llm.assertDone();
  assert.equal(projectOf().rates.targetCoveragePct, base.rates.targetCoveragePct, 'undo_change revirtió');
  const live = liveNow();
  const cards = turnChangeCards(assistants(session).at(-1)!, live);
  assert.equal(cards[0].input.status, 'undone', JSON.stringify(cards.map((c) => c.input.status)));
  assert.doesNotMatch(details(session, live).split('data-change-card="undone"')[1]?.split('data-change-card')[0] ?? '', />Deshacer</);
}
reset();
{
  // 7.3a «Deshacer todo el turno»: con dos o más cambios deshacibles del turno, un botón que los revierte todos.
  const llm = new ScriptedLlm([
    { functionCalls: [{ id: 'fc-t1', name: 'edit_proposal', args: { proposalId: base.id, title: 'Margen', ops: [{ op: 'set_margin_pct', pct: 31 }] } }] },
    { functionCalls: [{ id: 'fc-t2', name: 'edit_proposal', args: { proposalId: base.id, title: 'Cobertura', ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '85' }] } }] },
    { text: 'Dos cambios.' },
  ]);
  const session = newSession(llm);
  await session.send('margen y cobertura');
  const reply = assistants(session).at(-1)!;
  assert.equal(turnUndoTargets(reply.id, s().agentActivity).length, 2);
  assert.match(details(session, liveNow()), /Deshacer todo el turno/);
  const result = session.undoTurn(reply.id);
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(projectOf().rates.targetCoveragePct, base.rates.targetCoveragePct);
  assert.equal(projectOf().specs.saleMarginMultiplier, base.specs.saleMarginMultiplier);
  assert.deepEqual(turnChangeCards(assistants(session).at(-1)!, liveNow()).map((c) => c.input.status), ['undone', 'undone']);
  assert.doesNotMatch(details(session, liveNow()), /Deshacer todo el turno/, 'nada más que deshacer');
  // Un solo cambio: basta el Deshacer de su tarjeta.
  const one = newSession(new ScriptedLlm([margin(30, 'fc-t3'), { text: 'ok' }]));
  await one.send('margen');
  assert.doesNotMatch(details(one, liveNow()), /Deshacer todo el turno/);
}
reset({ activeView: 'dashboard', activeProjectId: '' });
{
  // 7.3b Tarjeta «Propuesta creada»: equipos y, si está completa, kWp, precio de contrato, ahorro del año 1 y retorno.
  const llm = new ScriptedLlm([{ functionCalls: [{ id: 'fc-created', name: 'create_proposal', args: {} }] }, { text: 'Creada.' }]);
  const session = newSession(llm);
  await session.send('Crea una propuesta');
  const reply = assistants(session).at(-1)!;
  assert.equal(reply.createdProposals?.length, 1, 'la creación deja su tarjeta');
  const created = reply.createdProposals![0].card;
  assert.equal(created.proposalId, s().activeProjectId);
  const html = details(session, liveNow());
  assert.match(html, /data-created-proposal=/);
  assert.match(html, /Propuesta creada/);
  if (created.metrics) assert.ok(created.metrics.length === 4);
  else {
    assert.ok(created.reasons.length > 0, 'incompleta: los motivos');
    assert.doesNotMatch(html.split('data-created-proposal')[1], /\$\d/, 'incompleta: ninguna cifra');
    assert.match(html, /Propuesta incompleta: sin resultados todavía/, 'la marca es de la propuesta');
    assert.doesNotMatch(html, /assistant-turn-notes/, 'el motivo no se repite en el bloque «Propuesta incompleta» del turno');
  }
  // Completa: las cuatro cifras del motor.
  const complete = { ...structuredClone(BENCHMARK_PROJECT), id: 'f5b-created', syncStatus: 'local_only' } as ProjectSimulation;
  const card = createdProposalCard({
    status: 'applied', tool: 'create_proposal', proposalId: complete.id, changes: [], warnings: [],
    results: { before: null, after: engineResults(complete) }, proposal: proposalStateSummary(complete),
  });
  assert.ok(card);
  assert.deepEqual(card!.metrics!.map((m) => m.label), ['Potencia', 'Precio de contrato', 'Ahorro del año 1', 'Retorno']);
  assert.ok(card!.equipment.length > 0, 'los equipos');
  assert.equal(card!.reasons.length, 0);
  assert.equal(createdProposalCard({ status: 'error', tool: 'create_proposal', changes: [], warnings: [], results: { before: null, after: null }, proposal: null }), null);
}
reset();
{
  // 7.8 Una tarjeta incompleta no repite su motivo en el bloque «Propuesta incompleta».
  const llm = new ScriptedLlm([
    { functionCalls: [{ id: 'fc-zero', name: 'edit_proposal', args: { proposalId: base.id, title: 'Sin consumo', ops: [{ op: 'set', path: 'monthlyConsumption', valueJson: JSON.stringify(Array(12).fill(0)) }] } }] },
    { text: 'Hecho.' },
  ]);
  const session = newSession(llm);
  await session.send('consumo a cero');
  const [card] = turnChangeCards(assistants(session).at(-1)!);
  const reasons = card.input.results?.after && !card.input.results.after.complete ? card.input.results.after.reasons.map((r) => r.message) : [];
  assert.ok(reasons.length, JSON.stringify(card.input.results));
  const html = details(session, liveNow());
  for (const reason of reasons) {
    const escaped = renderToStaticMarkup(createElement('span', null, reason)).slice(6, -7);
    assert.equal(html.split(escaped).length - 1, 1, `«${reason}» una sola vez`);
  }
}
reset();
{
  // 7.9 Una tarjeta pendiente caducada se muestra caducada al pintarla, sin Confirmar.
  reset({ agentPolicy: { ...DEFAULT_AGENT_POLICY, appAssistantProfile: 'confirm' } });
  const session = newSession(new ScriptedLlm([margin(29, 'fc-exp'), { text: 'Confírmalo.' }]));
  await session.send('Margen al 29 %');
  const [pending] = turnChangeCards(assistants(session).at(-1)!, liveNow());
  assert.equal(pending.input.status, 'pending_confirmation');
  const later = Date.now() + 11 * 60_000;
  assert.equal(turnChangeCards(assistants(session).at(-1)!, liveNow(later))[0].input.status, 'expired');
  assert.doesNotMatch(details(session, liveNow(later)), />Confirmar</);
  // Resuelta fuera del panel (p. ej. desde Ajustes → Agentes): la tarjeta lo refleja.
  s().rejectAgentAction(pending.input.actionId!);
  assert.equal(turnChangeCards(assistants(session).at(-1)!, liveNow())[0].input.status, 'rejected');
}
{
  // 7.4 Con la papelera abierta, la entrada del menú de IA sale de la papelera para que el panel se vea.
  reset({ isTrashActive: true });
  const session = newSession(new ScriptedLlm());
  openAssistant('dock-menu', { session });
  assert.equal(s().isTrashActive, false);
  assert.equal(session.getState().panelOpen, true);
}
{
  // 7.5 El ⓘ del perfil no promete confirmaciones absolutas que el modo sin confirmación (bypass) no cumple.
  const text = readFileSync(new URL('../components/settings/sections/agents/AgentPermissionsPanel.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /se confirma siempre, y los agentes externos siguen pidiendo confirmación/);
  assert.match(text, /sin confirmación/);
}
reset();
{
  // 7.6 Juntar en la cola más de tres archivos: lo que no cabe se queda en el compositor con su aviso (no se pierde).
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  llm.push(async () => {
    await session.addFiles([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]);
    await session.send('uno');
    await session.addFiles([pdf('d.pdf'), pdf('e.pdf')]);
    await session.send('dos');
    const st = session.getState();
    assert.deepEqual(st.queued?.files.map((f) => f.name), ['a.pdf', 'b.pdf', 'c.pdf']);
    assert.deepEqual(st.files.map((f) => f.name), ['d.pdf', 'e.pdf'], 'lo que no cabe sigue en el compositor');
    assert.match(st.composerError, /Máximo tres archivos/);
    // 7.7 Stop: lo encolado vuelve primero, delante de lo escrito después.
    session.setDraft('escribiendo otra');
    session.cancel();
    return { text: 'ok' };
  });
  await session.send('cero');
  const st = session.getState();
  assert.equal(st.draft, 'uno\n\ndos\n\nescribiendo otra', 'el orden en que se escribió');
  // Segunda ronda: Stop no descarta nada. Vuelven los de la cola delante de los que se quedaron en el compositor (los cinco),
  // y no se envía hasta quitar los que sobran.
  assert.deepEqual(st.files.map((f) => f.name), ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf'], 'ningún adjunto se pierde con Stop');
  assert.match(st.composerError, /Máximo tres archivos.*quita 2/i, 'y se pide quitar los que sobran');
  llm.assertDone();
  await session.send('enviar con cinco');
  assert.equal(llm.calls.length, 1, 'con más de tres adjuntos no se envía');
  assert.equal(session.getState().draft, 'uno\n\ndos\n\nescribiendo otra', 'y el borrador sigue ahí');
  assert.match(session.getState().composerError, /quita 2/i);
  session.removeFile(session.getState().files[4].id);
  session.removeFile(session.getState().files[3].id);
  assert.equal(session.getState().composerError, '', 'al quitarlos el aviso se va');
  llm.push({ text: 'Recibidos.' });
  await session.send();
  assert.equal(llm.calls.length, 2, 'con tres ya se envía');
}
{
  // 7.10 El comentario de cabecera ya no dice que el asistente viene apagado de fábrica.
  const text = readFileSync(new URL('../store/persistence/appAssistantEnablement.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /Hoy `appAssistantEnabled` es `false` de fábrica/);
}

// ── 8. Segunda ronda (revisión y QA en navegador) ────────────────────────────────────────────────────────────────────────
const journalSteps = () => s().undoHistory.journals[base.id]?.undo.length ?? 0;
const coverage = (id: string, pct: number, title = `Cobertura ${pct}`) =>
  ({ functionCalls: [{ id, name: 'edit_proposal', args: { proposalId: base.id, title, ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: String(pct) }] } }] });
reset();
s().activateUndoJournal(s().getActiveProject());
{
  // 8.1 El Deshacer de la tarjeta va por el mismo camino que undo_change: por el diario (como Ctrl+Z), así que un Ctrl+Z
  // después no vuelve a aplicar el cambio del asistente.
  const session = newSession(new ScriptedLlm([coverage('fc-j1', 85), { text: 'Hecho.' }]));
  await session.send('Cobertura al 85 %');
  assert.equal(projectOf().rates.targetCoveragePct, 85);
  assert.equal(journalSteps(), 1, 'un paso en el diario');
  const [card] = turnChangeCards(assistants(session).at(-1)!, liveNow());
  assert.equal(session.undoActivity(card.input.activityId!).success, true);
  assert.equal(projectOf().rates.targetCoveragePct, base.rates.targetCoveragePct);
  assert.equal(journalSteps(), 0, 'por el diario: sin paso de restauración nuevo');
  assert.equal(s().canRedo, true, 'pasa a rehacer, como Ctrl+Z');
  s().undo();
  assert.equal(projectOf().rates.targetCoveragePct, base.rates.targetCoveragePct, 'Ctrl+Z después no reaplica el cambio');
  assert.equal(turnChangeCards(assistants(session).at(-1)!, liveNow())[0].input.status, 'undone');
}
reset();
s().activateUndoJournal(s().getActiveProject());
{
  // 8.1b «Deshacer todo el turno» también: después, un Ctrl+Z no reaplica nada.
  const session = newSession(new ScriptedLlm([margin(31, 'fc-j2'), coverage('fc-j3', 85), { text: 'Dos.' }]));
  await session.send('margen y cobertura');
  assert.equal(journalSteps(), 2);
  assert.equal(session.undoTurn(assistants(session).at(-1)!.id).success, true);
  assert.equal(journalSteps(), 0);
  s().undo();
  assert.equal(projectOf().rates.targetCoveragePct, base.rates.targetCoveragePct);
  assert.equal(projectOf().specs.saleMarginMultiplier, base.specs.saleMarginMultiplier);
}
reset();
{
  // 8.2 Un fallo pasajero (cuenta de solo lectura) muestra el motivo y mantiene Deshacer; al reintentar, funciona y el aviso se va.
  const session = newSession(new ScriptedLlm([coverage('fc-p1', 85), { text: 'Hecho.' }]));
  await session.send('Cobertura al 85 %');
  const [card] = turnChangeCards(assistants(session).at(-1)!);
  const id = card.input.activityId!;
  store.setState({ workspaceScope: 'cloud' });
  const failed = session.undoActivity(id);
  assert.equal(failed.success, false);
  assert.match(failed.error ?? '', /solo puede consultar/);
  const [shown] = turnChangeCards(assistants(session).at(-1)!, liveNow());
  assert.equal(shown.input.activityId, id, 'el Deshacer se sigue ofreciendo');
  assert.equal(shown.input.error?.message, failed.error);
  assert.match(details(session, liveNow()), /role="alert"[^>]*>[^<]*solo puede consultar/);
  assert.match(details(session, liveNow()), />Deshacer</);
  store.setState({ workspaceScope: 'local' });
  assert.equal(session.undoActivity(id).success, true, 'al volver, el reintento funciona');
  const [done] = turnChangeCards(assistants(session).at(-1)!, liveNow());
  assert.equal(done.input.status, 'undone');
  assert.equal(done.input.error, undefined, 'sin el aviso viejo');
}
reset();
{
  // 8.3 «Deshacer todo el turno» que falla: el motivo se pinta junto al botón (role=alert); si el fallo es permanente, el
  // botón se retira (no hay clic mudo).
  const session = newSession(new ScriptedLlm([margin(31, 'fc-q1'), coverage('fc-q2', 85), { text: 'Dos.' }]));
  await session.send('margen y cobertura');
  const reply = () => assistants(session).at(-1)!;
  // Pasajero: solo lectura.
  store.setState({ workspaceScope: 'cloud' });
  const transient = session.undoTurn(reply().id);
  assert.equal(transient.success, false);
  let html = details(session, liveNow());
  assert.match(html, /Deshacer todo el turno/, 'pasajero: el botón sigue');
  assert.match(html, /class="assistant-turn-undo-error" role="alert"/, 'con su motivo al lado');
  store.setState({ workspaceScope: 'local' });
  // Permanente: la propuesta cambió después en lo que tocó el asistente.
  s().updateRates({ targetCoveragePct: 70 });
  s().updateSpecs({ saleMarginMultiplier: 1.5 });
  const permanent = session.undoTurn(reply().id);
  assert.equal(permanent.success, false, JSON.stringify(permanent));
  html = details(session, liveNow());
  assert.doesNotMatch(html, /Deshacer todo el turno/, 'permanente: sin botón que falle en silencio');
  // La cobertura (la que falló) deja de ofrecerlo; el margen no se llegó a intentar y conserva el suyo.
  assert.equal(html.split('>Deshacer<').length - 1, 1, 'solo el Deshacer del cambio que no se intentó');
  assert.match(html.split('Cambios aplicados: Cobertura 85')[1], /role="alert"[^>]*>La propuesta cambió después/);
  assert.doesNotMatch(html.split('Cambios aplicados: Cobertura 85')[1], />Deshacer</);
}
reset({ activeView: 'dashboard', activeProjectId: '' });
{
  // 8.4 La tarjeta «Propuesta creada» se pone al día: deshecha la creación (a la papelera), sin cifras.
  const session = newSession(new ScriptedLlm([{ functionCalls: [{ id: 'fc-c1', name: 'create_proposal', args: {} }] }, { text: 'Creada.' }]));
  await session.send('Crea una propuesta');
  const reply = assistants(session).at(-1)!;
  const activityId = reply.turn.tools[reply.createdProposals![0].callId]?.activityId ?? '';
  assert.ok(activityId, 'la creación deja actividad');
  const proposalId = reply.createdProposals![0].card.proposalId;
  assert.equal(s().undoAgentActivity(activityId).success, true, 'deshacer la creación (Ajustes → Agentes)');
  assert.equal(s().projects.find((p) => p.id === proposalId)?.isDeleted, true);
  const html = details(session, liveNow());
  assert.match(html, /data-created-proposal="undone"/);
  assert.match(html, /Creación deshecha/);
  assert.doesNotMatch(html.split('data-created-proposal')[1].split('</section>')[0], /\$\d|kWp|años/, 'sin cifras de una propuesta en la papelera');
  // Solo en la papelera (sin deshacer la actividad): también sin cifras.
  const trashed: TurnDetailsLive = { agentActivity: [], pendingAgentActions: [], projects: s().projects, now: Date.now() };
  assert.match(details(session, trashed), /data-created-proposal="trashed"/);
}
{
  // 8.5 Con un modal encima, la columna acoplada se reserva (sin salto de layout); la papelera la oculta; flotante, nada.
  const none = { isSettingsModalOpen: false, isAIInvoiceModalOpen: false, isAIDatasheetModalOpen: false, isAIPriceCatalogModalOpen: false, isNewProjectModalOpen: false, activeConflict: null, isTrashActive: false };
  assert.equal(assistantPanelBlock(none, true), null);
  assert.equal(assistantPanelBlock({ ...none, isNewProjectModalOpen: true }, true), 'reserve', 'Nueva simulación encima: la columna se queda');
  assert.equal(assistantPanelBlock({ ...none, isSettingsModalOpen: true }, true), 'reserve');
  assert.equal(assistantPanelBlock({ ...none, isNewProjectModalOpen: true }, false), 'hide', 'flotante: se oculta como antes');
  assert.equal(assistantPanelBlock({ ...none, isTrashActive: true }, true), 'hide');
}

console.log('PASS: panel completo del asistente (acoplado/flotante, cola mientras trabaja, Stop con cola, tres entradas, ChangeCard real, insignia, correcciones de la revisión).');
