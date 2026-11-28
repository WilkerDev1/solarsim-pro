// F4: la sesión del asistente de la app FUERA de React (`src/features/assistant/session/assistantSession.ts`) sobre el bucle
// nuevo, con el store, el conjunto de F3a y sus puertos reales, y el modelo guionizado (ScriptedLlm). Sin DOM: el panel solo
// se suscribe a esta sesión.
//  · «Crea una propuesta» desde Inicio → create_proposal → la sesión abre el simulador en la propuesta nueva → texto final
//    visible y turno cerrado en el historial (criterio de aceptación de F4).
//  · Una herramienta que falla no cuelga el turno; Stop a mitad de una llamada no deja functionCall huérfano y el turno
//    siguiente funciona; una confirmación pendiente no bloquea; sin clave, un mensaje claro con el camino a Ajustes.
//  · Cambiar de vista, cerrar o abrir el panel no pierde la sesión; cambiar de espacio o de sesión la descarta.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useSimulationStore } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { DEFAULT_FEATURE_SETTINGS } from '../../shared/applicationFeatures';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';
import { ASSISTANT_SYSTEM_PROMPT } from '../../shared/agentTools/rules';
import { ScriptedLlm, type ScriptedCall } from './support/scriptedLlm';
import type { LlmContent, LlmRequest } from '../services/llm/types';
import { APP_ASSISTANT_TOOLSET, listAssistantToolset } from '../features/agentTools/appAssistant/toolset';
import { buildSystemInstruction } from '../features/agentTools/appAssistant/instructions';
import { assistantToolPorts, resetAssistantToolPorts } from '../features/agentTools/appAssistant/ports';
import { closedTurnProblems } from '../features/assistant/session/agentLoop';
import { createAssistantSession, type AssistantSession, type SessionMessage } from '../features/assistant/session/assistantSession';
import { assistantComposerState } from '../features/assistant/assistantScope';
import { normalizeInvoiceExtraction } from '../features/assistant/session/invoiceExtraction';
import type { ProjectSimulation } from '../types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantTurnDetails, formatChangeValue, turnSteps } from '../features/assistant/components/AssistantTurnDetails';

const noop = { confirmPending() {}, rejectPending() {}, undo() {}, continueTurn() {} };
const details = (message: SessionMessage & { role: 'assistant' }) => renderToStaticMarkup(createElement(AssistantTurnDetails, { message, busy: false, actions: noop }));

const store = useSimulationStore;
const s = () => store.getState();
const stamp = '2026-10-01T00:00:00.000Z';
const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG).map((item) => ({ ...item, supplierPrices: [] as NonNullable<typeof item.supplierPrices> }));
catalog.find((e) => e.id === 'eq-mod-cs-620')!.supplierPrices = [{ id: 'sp-p', supplierName: 'QA Paneles', priceUSD: 95, stockStatus: 'in_stock', updatedAt: stamp }];
catalog.find((e) => e.id === 'eq-inv-luxpower-8k')!.supplierPrices = [{ id: 'sp-i', supplierName: 'QA Inversores', priceUSD: 1400, stockStatus: 'in_stock', updatedAt: stamp }];
catalog.find((e) => e.type === 'battery')!.supplierPrices = [{ id: 'sp-b', supplierName: 'QA Baterías', priceUSD: 2100, stockStatus: 'in_stock', updatedAt: stamp }];
const base: ProjectSimulation = {
  ...structuredClone(BENCHMARK_PROJECT), id: 'f4-base', syncStatus: 'local_only',
  specs: { ...structuredClone(BENCHMARK_PROJECT.specs), hasBattery: false, batteries: [{ id: 'b0', brandModel: 'Batería de Ajustes 10 kWh', capacityKWh: 10, count: 1, dodPct: 90 }] },
};

const reset = (patch: Record<string, unknown> = {}) => store.setState({
  appAssistantEnabled: true, workspaceScope: 'local', projects: [structuredClone(base)], activeProjectId: '', activeView: 'dashboard',
  equipmentCatalog: structuredClone(catalog), deletedEquipmentIds: [], equipmentConflicts: {}, sessionGeneration: 0,
  defaultSimulationSettings: DEFAULT_SIMULATION_SETTINGS, localFeatureSettings: { ...DEFAULT_FEATURE_SETTINGS },
  agentPolicy: DEFAULT_AGENT_POLICY, agentActivity: [], pendingAgentActions: [], undoHistory: EMPTY_UNDO_HISTORY, canUndo: false, canRedo: false,
  geminiApiKey: 'synthetic-key', geminiModel: 'gemini-4-hydrogen',
  syncSettings: { ...s().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
  ...patch,
});

let turnSeq = 0;
function newSession(llm: ScriptedLlm, extra: Parameters<typeof createAssistantSession>[0] = {}): AssistantSession {
  resetAssistantToolPorts();
  const session = createAssistantSession({ createClient: () => llm, newTurnId: () => `turn-${++turnSeq}`, sleep: async () => {}, ...extra });
  session.connectPorts();
  return session;
}
const req = (call: ScriptedCall) => call.request as LlmRequest;
const lastUserParts = (call: ScriptedCall) => req(call).contents.at(-1)!.parts;
const frOf = (call: ScriptedCall, index = 0) => (lastUserParts(call).filter((p) => p.type === 'functionResponse')[index] as { id?: string; name: string; response: Record<string, any> });
const lastAssistant = (session: AssistantSession) => [...session.getState().messages].reverse().find((m) => m.role === 'assistant') as SessionMessage & { role: 'assistant' };
const assertHistoryClosed = (session: AssistantSession, label: string) => assert.deepEqual(closedTurnProblems(session.history()), [], `${label}: historial sin functionCall huérfanos`);
const pdf = (name: string) => ({ name, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4 factura sintética').buffer as ArrayBuffer });

// ── 1. «Crea una propuesta» desde Inicio: crea, abre el simulador en la nueva y responde; turno cerrado en el historial ───
reset();
{
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  session.setPanelOpen(true);
  let createdId = '';
  llm.push(
    (call) => {
      const r = req(call);
      const declared = listAssistantToolset();
      assert.deepEqual(r.tools!.map((t) => t.name), [...APP_ASSISTANT_TOOLSET], 'declara el conjunto ENTERO de F3a');
      assert.equal(r.systemInstruction, buildSystemInstruction('app-assistant', { tools: declared }), 'instrucciones en tres capas');
      assert.ok(!r.systemInstruction!.includes(ASSISTANT_SYSTEM_PROMPT), 'ya no usa el prompt del flotante antiguo');
      const parts = lastUserParts(call);
      assert.equal(parts[0].type === 'text' && parts[0].text, 'Crea una propuesta');
      const context = parts.at(-1)!;
      assert.ok(context.type === 'text' && JSON.parse(context.text).appContext.view === 'dashboard', 'primera ronda: el contexto es la última parte del mensaje del usuario');
      return { text: 'Creo la propuesta.', functionCalls: [{ id: 'fc-create', name: 'create_proposal', args: {} }] };
    },
    (call) => {
      const fr = frOf(call);
      assert.equal(fr.id, 'fc-create');
      assert.equal(fr.name, 'create_proposal');
      assert.equal(fr.response.status, 'applied', JSON.stringify(fr.response.error));
      createdId = fr.response.proposalId;
      assert.ok(createdId && createdId !== base.id);
      // La sesión navegó a mitad de turno y el modelo lo sabe por el resultado: contexto vivo dentro de response.
      assert.equal(s().activeView, 'simulator', 'el simulador se abrió antes de la ronda siguiente');
      assert.equal(s().activeProjectId, createdId, 'en la propuesta nueva');
      assert.equal(fr.response.data.openSimulator, true);
      assert.equal(fr.response.data.opened, 'simulator', 'el resultado dice que la app ya la abrió');
      assert.equal(fr.response.proposal.open, true, 'el resumen vivo la marca abierta');
      assert.equal(fr.response.appContext.view, 'simulator');
      assert.equal(fr.response.appContext.activeProjectId, createdId);
      assert.equal('cards' in fr.response, false, 'las tarjetas son de la interfaz, no viajan al modelo');
      assert.ok(lastUserParts(call).every((p) => p.type === 'functionResponse'), 'ronda 2: sin texto aparte');
      assert.deepEqual(req(call).tools, req(llm.calls[0]).tools, 'declaraciones fijas aunque la vista cambió');
      assert.equal(req(call).systemInstruction, req(llm.calls[0]).systemInstruction);
      return { text: 'Listo: creé la propuesta con 1.000 kWh/mes estimados. Falta una factura para el consumo real.' };
    },
  );
  const sending = session.send('Crea una propuesta');
  assert.equal(session.getState().busy, true, 'la sesión marca el turno en curso al instante');
  assert.equal(session.getState().draft, '', 'el borrador se vacía al enviar');
  await sending;
  llm.assertDone();
  const state = session.getState();
  assert.equal(state.busy, false);
  assert.equal(state.panelOpen, true, 'el panel sigue abierto tras navegar');
  assert.deepEqual(state.messages.map((m) => m.role), ['user', 'assistant']);
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'finished');
  assert.equal(reply.turn.status, 'finished');
  assert.match(reply.turn.text, /Listo: creé la propuesta/, 'texto final visible');
  assert.deepEqual(reply.turn.summary?.proposalIds, [createdId]);
  assert.equal(reply.turn.tools[reply.turn.toolOrder[0]].status, 'applied');
  assert.equal(s().activeView, 'simulator');
  assert.equal(s().activeProjectId, createdId, 'el simulador queda abierto en la propuesta nueva');
  const history = session.history();
  assertHistoryClosed(session, 'crear');
  assert.equal(history.length, 4, 'usuario, llamada, respuesta y texto final');
  assert.equal(history[0].role, 'user');
  assert.equal(history.at(-1)!.role, 'model');

  // Cambiar de vista (también a una donde el panel no se monta), cerrar y abrir el panel: la sesión sigue entera.
  const before = session.getState().messages;
  s().setActiveView('clients-hub');
  session.setPanelOpen(false);
  s().setActiveView('dashboard');
  session.setPanelOpen(true);
  assert.equal(session.getState().messages, before, 'cambiar de vista o cerrar el panel no toca la conversación');
  assert.equal(session.history().length, 4);

  // Un turno en curso sobrevive a que el usuario cambie de vista y cierre el panel (cerrar no cancela).
  llm.push((call) => {
    assert.equal(req(call).contents.length, 5, 'el turno siguiente lleva el anterior cerrado');
    assert.deepEqual(req(call).contents.slice(0, 4), history);
    s().setActiveView('quotations-hub');
    session.setPanelOpen(false);
    return { text: 'Tienes dos propuestas.' };
  });
  await session.send('¿Cuántas propuestas tengo?');
  assert.equal(lastAssistant(session).outcome, 'finished');
  assert.equal(lastAssistant(session).turn.text, 'Tienes dos propuestas.');
  assert.equal(session.getState().messages.length, 4);
  assertHistoryClosed(session, 'turno con cambio de vista');
  llm.assertDone();
}

// ── 2. Una herramienta que falla no cuelga el turno: el modelo recibe el error y responde ──────────────────────────────────
reset();
{
  const llm = new ScriptedLlm([
    { functionCalls: [{ id: 'bad', name: 'edit_proposal', args: { proposalId: 'no-existe', ops: [{ op: 'set_margin_pct', pct: 30 }] } }] },
    (call) => {
      const fr = frOf(call);
      assert.equal(fr.response.status, 'error');
      assert.ok(fr.response.error?.message, 'el modelo recibe el mensaje del error');
      assert.ok(fr.response.appContext, 'también con contexto vivo');
      return { functionCalls: [{ id: 'look', name: 'search_projects', args: { query: '' } }] };
    },
    { text: 'No encontré esa propuesta; estas son las tuyas.' },
  ]);
  const session = newSession(llm);
  await session.send('Pon el margen al 30 % en la propuesta X');
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'finished', 'el turno no se cuelga');
  assert.equal(session.getState().busy, false);
  assert.ok(reply.turn.summary?.failedTools.includes('edit_proposal'), 'el resumen dice qué falló');
  assert.match(reply.turn.text, /No encontré/);
  assertHistoryClosed(session, 'herramienta que falla');
  llm.assertDone();
}

// ── 3. Stop a mitad de una llamada (leyendo la factura): sin huérfanos, sin reenvío, y el turno siguiente funciona ─────────
reset();
{
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  await session.addFiles([pdf('factura.pdf')]);
  const fileId = session.getState().files[0]?.id;
  assert.ok(fileId, 'el adjunto queda en la sesión');
  llm.push(
    (call) => {
      const parts = lastUserParts(call);
      assert.ok(parts.some((p) => p.type === 'inlineData' && p.mimeType === 'application/pdf'), 'el PDF va con el mensaje en que se adjunta');
      assert.ok(parts.some((p) => p.type === 'text' && p.text.includes(fileId)), 'con su id, para extract_invoice');
      assert.equal(parts.at(-1)!.type === 'text' && JSON.parse((parts.at(-1) as { text: string }).text).appContext.view, 'dashboard', 'el contexto sigue siendo la última parte');
      return { functionCalls: [{ id: 'read', name: 'extract_invoice', args: { fileId } }, { id: 'after', name: 'search_projects', args: { query: '' } }] };
    },
    (call) => {
      // La lectura con visión va por el puerto LlmClient (structured): el usuario pulsa Stop mientras lee.
      assert.equal(call.method, 'structured');
      assert.ok(req(call).contents[0].parts.some((p) => p.type === 'inlineData'), 'el puerto manda la factura al modelo');
      session.cancel();
      return { data: { clientName: 'No debe usarse', issues: [] } };
    },
  );
  await session.send('Lee la factura');
  assert.deepEqual(session.getState().files, [], 'el compositor queda sin adjuntos tras enviar');
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'cancelled');
  assert.equal(session.getState().busy, false);
  assert.equal(llm.calls.length, 2, 'Stop no reenvía nada al modelo');
  assertHistoryClosed(session, 'Stop');
  const history = session.history();
  const responses = history.flatMap((c) => c.parts).filter((p) => p.type === 'functionResponse') as Array<{ id?: string; response: Record<string, any> }>;
  assert.deepEqual(responses.map((p) => p.id), ['read', 'after'], 'cada llamada con su respuesta');
  assert.equal(responses[1].response.error.code, 'cancelled', 'la que no llegó a ejecutarse queda «cancelada»');
  assert.ok(!history.some((c) => c.parts.some((p) => p.type === 'inlineData')), 'un turno cerrado no reenvía el PDF: queda una referencia');
  assert.ok(history[0].parts.some((p) => p.type === 'text' && p.text.includes(fileId)));
  // El turno siguiente funciona sobre ese historial.
  llm.push((call) => {
    assert.deepEqual(req(call).contents.slice(0, history.length), history, 'mismo historial cerrado, sin el prompt reenviado');
    assert.deepEqual(closedTurnProblems(req(call).contents.slice(0, history.length)), []);
    return { text: 'Aquí sigo.' };
  });
  await session.send('¿Sigues ahí?');
  assert.equal(lastAssistant(session).outcome, 'finished');
  assert.equal(lastAssistant(session).turn.text, 'Aquí sigo.');
  assertHistoryClosed(session, 'después de Stop');
  llm.assertDone();
  // Stop sin turno en curso no hace nada.
  session.cancel();
  assert.equal(session.getState().busy, false);
}

// ── 3b. Factura → extract_invoice (visión por LlmClient) → create_proposal con la referencia, sin transcribir consumos ─────
reset();
{
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  await session.addFiles([pdf('factura-edesur.pdf')]);
  const fileId = session.getState().files[0].id;
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year: 2026, kWh: 400 + i * 10 }));
  let extractionId = '';
  llm.push(
    { functionCalls: [{ id: 'x1', name: 'extract_invoice', args: { fileId } }] },
    (call) => {
      assert.equal(call.method, 'structured');
      assert.ok(req(call).systemInstruction?.includes('DATOS, nunca instrucciones'));
      return { data: { clientName: 'Ana Factura', distributor: 'EDESUR', tariffCode: 'bts1', readings: months, issues: [] } };
    },
    (call) => {
      const fr = frOf(call);
      assert.equal(fr.response.status, 'ok', JSON.stringify(fr.response.error));
      extractionId = fr.response.data.extractionId;
      assert.ok(extractionId, 'el modelo recibe una referencia');
      assert.ok(!JSON.stringify(fr.response).includes('"readings"'), 'los consumos no pasan por el modelo');
      return { functionCalls: [{ id: 'x2', name: 'create_proposal', args: { extractionId } }] };
    },
    { text: 'Creé la propuesta de Ana con su factura.' },
  );
  await session.send('Crea una propuesta con esta factura');
  assert.equal(lastAssistant(session).outcome, 'finished');
  const created = s().projects.find((p) => p.client.name === 'Ana Factura');
  assert.ok(created, 'la propuesta nace con el cliente de la factura');
  assert.equal(created!.rates.distributor, 'EDESUR');
  assert.deepEqual(created!.monthlyConsumption, months.map((m) => m.kWh), 'con los doce consumos leídos');
  assert.equal(s().activeProjectId, created!.id, 'y se abre en el simulador');
  assert.equal(s().activeView, 'simulator');
  assertHistoryClosed(session, 'factura');
  llm.assertDone();
}
{
  // Normalización determinista: nunca rellena meses; con menos de doce, el promedio de los leídos, avisado.
  const partial = normalizeInvoiceExtraction({ distributor: 'OTRA', tariffCode: ' bts2 ', readings: [{ month: 1, kWh: 300 }, { month: 2, kWh: 500 }, { month: 13, kWh: 9 }], issues: ['Sin medidor'] });
  assert.equal(partial.monthlyConsumptionKWh, undefined);
  assert.equal(partial.averageMonthlyKWh, 400);
  assert.equal(partial.distributor, undefined, 'una distribuidora fuera de la lista no se inventa');
  assert.equal(partial.tariffCode, 'BTS2');
  assert.ok(partial.issues?.some((i) => /2 meses/.test(i)) && partial.issues.includes('Sin medidor'));
  const repeated = normalizeInvoiceExtraction({ readings: [...Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year: 2025, kWh: 1 })), { month: 3, year: 2026, kWh: 99 }], issues: [] });
  assert.equal(repeated.monthlyConsumptionKWh?.[2], 99, 'el mes más reciente manda');
  assert.ok(normalizeInvoiceExtraction({ issues: [] }).issues?.some((i) => /consumo/.test(i)), 'sin consumo, se dice');
}

// ── 4. Una confirmación pendiente no bloquea el panel: el turno termina y la tarjeta queda para confirmar o rechazar ───────
reset({ agentPolicy: { ...DEFAULT_AGENT_POLICY, appAssistantProfile: 'confirm' } });
{
  const llm = new ScriptedLlm([
    { functionCalls: [{ id: 'bat', name: 'edit_proposal', args: { proposalId: base.id, title: 'Ponle baterías', ops: [{ op: 'set_storage', enabled: true }] } }] },
    (call) => {
      assert.equal(frOf(call).response.status, 'pending_confirmation');
      return { text: 'Preparé las baterías: confírmalo en la tarjeta.' };
    },
  ]);
  const session = newSession(llm);
  await session.send('Ponle baterías a la propuesta');
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'finished', 'el turno no espera a la confirmación');
  assert.equal(session.getState().busy, false);
  const pending = reply.turn.summary?.pendingConfirmations ?? [];
  assert.equal(pending.length, 1);
  assert.equal(s().projects.find((p) => p.id === base.id)!.specs.hasBattery, false, 'pendiente: nada escrito');
  assert.match(details(reply), /Confirmar/, 'el panel muestra la tarjeta para confirmar o descartar');
  assert.deepEqual(turnSteps(reply), ['Editar propuesta (espera confirmación)']);
  const result = session.confirmPending(pending[0].actionId);
  assert.equal(result.success, true, result.error);
  assert.equal(s().projects.find((p) => p.id === base.id)!.specs.hasBattery, true, 'confirmar aplica el cambio');
  assert.equal(lastAssistant(session).resolutions?.[pending[0].actionId], 'applied');
  assert.match(details(lastAssistant(session)), /Aplicado\./);
  assert.doesNotMatch(details(lastAssistant(session)), /Confirmar/);
  assert.equal(session.confirmPending(pending[0].actionId).success, false, 'una confirmación ya resuelta no se repite');
}

// ── 5. Sin clave: mensaje claro con el camino a Ajustes, sin turno colgado y sin llamar al modelo ──────────────────────────
reset({ geminiApiKey: '' });
{
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  await session.send('Crea una propuesta');
  assert.equal(session.getState().busy, false);
  assert.equal(llm.calls.length, 0);
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'failed');
  assert.match(reply.error?.message ?? '', /Ajustes → IA/);
  assert.match(reply.error?.message ?? '', /API Key de (Google )?Gemini/, 'el panel lo reconoce como «falta la clave»');
  assert.deepEqual(session.history(), [], 'no entra nada en el historial');
  // QA 2.ª ronda: sin clave, Enviar no se queda mudo; el intento llega a la sesión y el hilo muestra el mensaje de arriba.
  assert.deepEqual(assistantComposerState({ draft: 'crea una propuesta', hasApiKey: false, loadingFiles: 0 }), { canSend: true, disabledReason: '' },
    'sin clave se puede pulsar Enviar: la sesión responde con el camino a Ajustes en la conversación');
  assert.equal(assistantComposerState({ draft: '  ', hasApiKey: false, loadingFiles: 0 }).canSend, false);
  assert.equal(assistantComposerState({ draft: 'hola', hasApiKey: true, loadingFiles: 1 }).canSend, false);
}

// ── 6. Límite de pasos: cierre con resumen y «Continuar» sin reenviar el mensaje ──────────────────────────────────────────
reset();
{
  const llm = new ScriptedLlm([
    { functionCalls: [{ id: 'p1', name: 'search_projects', args: { query: '' } }, { id: 'p2', name: 'search_equipment', args: { query: 'panel' } }] },
  ]);
  const session = newSession(llm, { limits: { maxToolCalls: 1 } });
  await session.send('Revisa todo');
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'step_limit');
  assert.match(reply.notice ?? '', /límite/i, 'el usuario ve por qué se detuvo');
  assert.equal(reply.canContinue, true, 'se ofrece Continuar');
  assert.match(details(reply), /Continuar/);
  assertHistoryClosed(session, 'límite de pasos');
  const closing = session.history().at(-1)!;
  assert.ok(closing.role === 'model' && closing.parts[0].type === 'text' && /límite/i.test(closing.parts[0].text), 'el resumen cierra el turno en el historial');
  llm.push((call) => {
    const parts = lastUserParts(call);
    assert.ok(parts[0].type === 'text' && !parts[0].text.includes('Revisa todo'), 'Continuar no reenvía el mensaje original');
    return { text: 'Sigo con lo que faltaba.' };
  });
  await session.continueTurn();
  assert.equal(lastAssistant(session).outcome, 'finished');
  llm.assertDone();
}

// ── 7. Cambiar de espacio o de sesión descarta la conversación ──────────────────────────────────────────────────────────
reset();
{
  const llm = new ScriptedLlm([{ text: 'Hola.' }]);
  const session = newSession(llm);
  await session.send('Hola');
  assert.equal(session.getState().messages.length, 2);
  store.setState({ sessionGeneration: 1 });
  session.syncOwner();
  assert.deepEqual(session.getState().messages, []);
  assert.deepEqual(session.history(), []);
}

// ── 8. Puertos de F3a conectados por la sesión ─────────────────────────────────────────────────────────────────────────
reset();
{
  const session = newSession(new ScriptedLlm());
  assert.equal(typeof assistantToolPorts().openProposal, 'function', 'open_proposal navega');
  assert.equal(typeof assistantToolPorts().extractInvoice, 'function', 'extract_invoice lee con visión');
  await assistantToolPorts().openProposal!({ proposalId: base.id, view: 'pdf-preview' });
  assert.equal(s().activeProjectId, base.id);
  assert.equal(s().activeView, 'pdf-preview');
  session.reset();
}

// ── 9. Valores legibles en la lista de cambios (nunca JSON largo) ─────────────────────────────────────────────────────────
assert.equal(formatChangeValue(1200.5), (1200.5).toLocaleString('es-DO', { maximumFractionDigits: 2 }));
assert.equal(formatChangeValue(true), 'Sí');
assert.equal(formatChangeValue(null), 'Sin dato');
assert.match(formatChangeValue(Array(12).fill(1000)), /^12 meses/);
assert.equal(formatChangeValue([{ brandModel: 'A' }, { brandModel: 'B' }]), '2 elementos');
assert.equal(formatChangeValue({ brandModel: 'Panel 620 W' }), 'Panel 620 W');
assert.ok(formatChangeValue('x'.repeat(200)).length <= 80);

// ── 9b. Apagar el asistente a mitad de turno lo detiene: sin escrituras, sin navegación, turno cerrado y sin huérfanos ────
// (Hallazgo de la revisión de F4: antes el panel se desmontaba y el turno se abortaba; ahora la sesión sobrevive al panel.)
reset();
{
  // a) Se apaga mientras el modelo responde: el ejecutor no escribe ni navega aunque la suscripción no haya llegado.
  const llm = new ScriptedLlm([
    () => {
      store.setState({ appAssistantEnabled: false });
      return { functionCalls: [
        { id: 'off-edit', name: 'edit_proposal', args: { proposalId: base.id, ops: [{ op: 'set_margin_pct', pct: 31 }] } },
        { id: 'off-create', name: 'create_proposal', args: {} },
      ] };
    },
  ]);
  const session = newSession(llm);
  const projectsBefore = s().projects.length;
  const marginBefore = JSON.stringify(s().projects.find((p) => p.id === base.id));
  await session.send('Pon el margen al 31 % y crea otra propuesta');
  llm.assertDone();
  assert.equal(llm.calls.length, 1, 'apagado: no vuelve a llamar al modelo');
  assert.equal(s().projects.length, projectsBefore, 'apagado: no crea propuestas');
  assert.equal(JSON.stringify(s().projects.find((p) => p.id === base.id)), marginBefore, 'apagado: no edita');
  assert.equal(s().activeView, 'dashboard', 'apagado: no navega');
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'cancelled');
  assert.equal(session.getState().busy, false);
  assert.ok(Object.values(reply.turn.tools).every((call) => call.status !== 'applied'), 'ninguna llamada aplicada');
  assert.match(reply.notice ?? '', /asistente se desactivó/, 'el cierre dice por qué se detuvo');
  assertHistoryClosed(session, 'apagado en el ejecutor');
}
reset();
{
  // b) La suscripción al store (syncEnabled) cancela el turno en cuanto se apaga, aunque no haya llamadas.
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  llm.push(() => {
    store.setState({ appAssistantEnabled: false });
    session.syncEnabled();
    return { functionCalls: [{ id: 'sub-create', name: 'create_proposal', args: {} }] };
  });
  const projectsBefore = s().projects.length;
  await session.send('Crea una propuesta');
  assert.equal(llm.calls.length, 1);
  assert.equal(s().projects.length, projectsBefore, 'suscripción: no crea');
  assert.equal(s().activeView, 'dashboard');
  assert.equal(lastAssistant(session).outcome, 'cancelled');
  assertHistoryClosed(session, 'apagado por suscripción');
  // Con el asistente encendido de nuevo, el turno siguiente funciona sobre ese historial.
  store.setState({ appAssistantEnabled: true });
  session.syncEnabled();
  llm.push({ text: 'De vuelta.' });
  await session.send('¿Sigues?');
  assert.equal(lastAssistant(session).outcome, 'finished');
  assertHistoryClosed(session, 'tras volver a encender');
  llm.assertDone();
}

// ── 9c. Cliente y modelo son del turno: un turno viejo (tras «Nueva conversación») no pisa los del turno nuevo ───────────
reset();
{
  const llmA = new ScriptedLlm();
  const llmB = new ScriptedLlm();
  const llmExtra = new ScriptedLlm();
  const clients = [llmA, llmB];
  const session = newSession(llmA, { createClient: () => clients.shift() ?? llmExtra });
  let releaseA!: () => void;
  const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
  let turnB: Promise<void> | undefined;
  let fileId = '';
  llmA.push(async () => {
    session.reset();
    store.setState({ geminiModel: 'gemini-3.8-flash' });
    await session.addFiles([pdf('b.pdf')]);
    fileId = session.getState().files[0].id;
    turnB = session.send('Lee la factura');
    await gateA;
    return { text: 'Turno viejo.' };
  });
  llmB.push(
    async () => {
      // El turno viejo termina (y pasa por su finally) mientras el nuevo está en curso.
      releaseA();
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { functionCalls: [{ id: 'b-read', name: 'extract_invoice', args: { fileId } }] };
    },
    (call) => {
      assert.equal(call.method, 'structured', 'la lectura va por el cliente del turno nuevo');
      assert.equal(req(call).model, 'gemini-3.8-flash', 'con el modelo del turno nuevo');
      return { data: { clientName: 'Cliente B', issues: [] } };
    },
    { text: 'Leída.' },
  );
  await session.send('Turno A');
  await turnB;
  assert.equal(llmExtra.calls.length, 0, 'no se crea un cliente ajeno al turno');
  llmA.assertDone();
  llmB.assertDone();
  assert.equal(lastAssistant(session).outcome, 'finished');
  assert.deepEqual(session.getState().messages.map((m) => m.role), ['user', 'assistant']);
}

// ── 9d. «Incompleta» es de la propuesta y solo se marca cuando el turno la deja así (no en cada turno) ──────────────────
reset({ equipmentCatalog: structuredClone(DEFAULT_EQUIPMENT_CATALOG).map((item) => ({ ...item, supplierPrices: [] })) });
{
  const llm = new ScriptedLlm();
  const session = newSession(llm);
  llm.push(
    () => ({ functionCalls: [{ id: 'fc-inc-create', name: 'create_proposal', args: {} }] }),
    (call) => { assert.equal(frOf(call).response.status, 'applied', JSON.stringify(frOf(call).response.error)); return { text: 'Creada.' }; },
  );
  await session.send('Crea una propuesta');
  const created = lastAssistant(session);
  assert.ok((created.turn.summary?.missing ?? []).length > 0, 'crear sin precios deja la propuesta incompleta y el turno lo dice');
  const createdHtml = details(created);
  assert.match(createdHtml, /Propuesta incompleta/, 'la marca dice que es de la propuesta, no del turno');
  assert.ok(!/Falta: Falta/.test(createdHtml), 'sin el prefijo «Falta:» duplicado');
  const proposalId = s().activeProjectId;
  llm.push(
    () => ({ functionCalls: [{ id: 'fc-inc-edit', name: 'edit_proposal', args: { proposalId, title: 'Cobertura 90', ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }] } }] }),
    (call) => { assert.equal(frOf(call).response.status, 'applied', JSON.stringify(frOf(call).response.error)); return { text: 'Cobertura al 90 %.' }; },
  );
  await session.send('cobertura 90');
  llm.assertDone();
  const edited = lastAssistant(session);
  assert.deepEqual(edited.turn.summary?.missing, [], 'un turno que no cambia lo que falta no repite la marca');
  assert.ok(!/ncompleta/.test(details(edited)), 'sin «Incompleta» en un turno que solo cambia la cobertura');
}

// ── 10. Frontera: la sesión y el bucle no usan el transporte ni el bucle antiguos; el panel pinta la sesión nueva ─────────
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
for (const file of ['../features/assistant/session/agentLoop.ts', '../features/assistant/session/assistantSession.ts', '../features/assistant/session/invoiceExtraction.ts']) {
  const text = read(file);
  assert.ok(!/requestGeminiJson|GeminiTransport|geminiResponseText|electronAPI|executeForAssistant|from '\.\.\/service'|useAppAssistant|@google\/genai/.test(text), `${file}: sin el camino antiguo ni el SDK directo`);
  assert.ok(!/shared\/geminiTransport/.test(text), `${file}: ni siquiera las constantes del transporte antiguo (F6 lo borra): van por services/llm/models`);
}
assert.ok(/subscribe\(\(\) => \{[^}]*syncOwner\(\)[^}]*syncEnabled\(\)/.test(read('../features/assistant/session/assistantSession.ts')), 'la sesión única sigue al interruptor del asistente');
const panel = read('../features/assistant/components/AppAssistant.tsx');
assert.ok(/canSend=\{composer\.canSend\}/.test(panel), 'el compositor usa assistantComposerState (no bloquea Enviar por falta de clave)');
assert.ok(/from '\.\.\/session\/assistantSession'/.test(panel) && !/from '\.\.\/(useAppAssistant|service)'/.test(panel), 'el panel flotante pinta la sesión nueva');

console.log('PASS: assistant session outside React (create & open, failing tool, stop, pending, no key, step limit, owner).');
