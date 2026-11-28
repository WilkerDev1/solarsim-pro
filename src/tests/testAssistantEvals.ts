// F7a: evaluaciones del asistente único SIN red, de punta a punta: la sesión real (`createAssistantSession`), el store real, el
// conjunto de herramientas real y el modelo guionizado (ScriptedLlm). Un escenario por promesa del dueño; lo que prueba cada uno
// y lo que NO prueba (el criterio del modelo real: eso es `scripts/qa/evalAssistant.ts`, con clave propia, fuera de CI):
//  E1. «Crea una propuesta» sin datos, desde Inicio: nace con 1.000 kWh/mes marcado como estimado y el turno acaba en el simulador.
//  E2. Edición en vivo de CADA familia de opciones del simulador (consumo, tarifa y distribuidora, paneles, inversores, baterías,
//      cobertura, margen, descuentos, extras): se aplica al momento, con su tarjeta de cambio (Deshacer conectado), el
//      resaltado del dock y su deshacer, que deja la propuesta como estaba.
//  E3. Nunca inventar precios: sin ofertas ni precio genérico la propuesta queda incompleta (motivos, ninguna cifra, ningún
//      cero falso); con precio genérico se señala «precio genérico, sin proveedor»; «¿cuánto cuesta?» de una incompleta no da cifras.
//  E4. Una herramienta que falla no bloquea: el error vuelve al modelo con la ruta, el turno sigue y el reintento aplica.
//  E5. Escribir mientras trabaja: el mensaje se encola, el turno cede al terminar el paso y nada se reenvía ni se pierde.
//  E6. Stop: sin llamadas a medias, lo ya aplicado se conserva y se puede deshacer, y el turno siguiente funciona.
//  E7. «Deshaz eso» (undo_change): revierte lo último que hizo el asistente y no pisa lo que cambió el usuario después.
// La cobertura de TODAS las rutas del registro de campos está en `testAssistantEvalFieldCoverage`.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { dockHighlightStore } from '../store/dockHighlightStore';
import { EMPTY_HIGHLIGHTS } from '../domain/dockHighlight';
import { isConsumptionEstimated } from '../domain/newProposal';
import { proposalCompleteness } from '../domain/proposalCompleteness';
import { isDirectWattPricing } from '../engine/financeEngine';
import { DEFAULT_EQUIPMENT_CATALOG } from '../data/defaultEquipmentCatalog';
import { featureScope } from '../../shared/applicationFeatures';
import { buildChangeCardView } from '../features/assistantFeedback/changeCardModel';
import { PROJECT_SECTIONS, pickFields } from '../features/agentTools/nativeTools';
import { ScriptedLlm, type ScriptedStep } from './support/scriptedLlm';
import {
  assertHistoryClosed, evalPanelId, frOf, lastAssistant, newEvalSession, offerCatalog, projectOf, req, resetEvalStore, seedFreshProposal, unpricedCatalog,
} from './support/assistantHarness';

const store = useSimulationStore;
const s = () => store.getState();
const sections = (id: string) => JSON.stringify(pickFields(projectOf(id), PROJECT_SECTIONS));
const edit = (id: string, proposalId: string, title: string, ops: Record<string, unknown>[]) =>
  ({ functionCalls: [{ id, name: 'edit_proposal', args: { proposalId, title, ops } }] }) as ScriptedStep;

// ── E1. «Crea una propuesta» sin datos, desde Inicio ─────────────────────────────────────────────────────────────────────
resetEvalStore({ catalog: offerCatalog(), view: 'dashboard' });
{
  const llm = new ScriptedLlm();
  const session = newEvalSession(llm);
  session.setPanelOpen(true);
  let createdId = '';
  llm.push(
    { functionCalls: [{ id: 'e1-create', name: 'create_proposal', args: {} }] },
    (call) => {
      const fr = frOf(call);
      assert.equal(fr.response.status, 'applied', JSON.stringify(fr.response.error));
      createdId = fr.response.proposalId;
      assert.equal(fr.response.proposal.consumption.estimated, true, 'el modelo lo sabe: el consumo es estimado');
      assert.ok(fr.response.warnings.some((w: string) => /estimad/i.test(w)), `avisa que el consumo es una estimación (${JSON.stringify(fr.response.warnings)})`);
      assert.equal(fr.response.results.after.complete, true, 'con ofertas de proveedor la propuesta nace completa');
      return { text: 'Creé la propuesta con un consumo estimado de 1.000 kWh al mes; pásame una factura para el real.' };
    },
  );
  await session.send('Crea una propuesta');
  llm.assertDone();
  const created = projectOf(createdId);
  assert.deepEqual(created.monthlyConsumption, Array(12).fill(1000), 'consumo genérico: 1.000 kWh los doce meses');
  assert.equal(created.consumptionEstimate?.kind, 'factory_default', 'marcado como estimado');
  assert.equal(isConsumptionEstimated(created), true);
  assert.equal(proposalCompleteness(created).incomplete, false);
  assert.equal(isDirectWattPricing(created.specs), false, 'cotiza con la matriz de costos, nunca por $/W');
  assert.equal(s().activeView, 'simulator', 'el turno acaba en el simulador');
  assert.equal(s().activeProjectId, createdId, '...en la propuesta nueva');
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'finished');
  assert.deepEqual(reply.turn.summary?.proposalIds, [createdId]);
  assert.equal(reply.createdProposals?.length, 1, 'tarjeta «Propuesta creada»');
  assert.ok(reply.createdProposals![0].card.metrics, 'completa: con cifras del motor');
  assertHistoryClosed(session, 'E1');
  // Editar un mes deja de ser «estimado»; deshacer lo vuelve a mostrar (derivado, sin restaurar nada aparte).
  const id = createdId;
  llm.push(
    edit('e1-edit', id, 'Consumo real', [{ op: 'set', path: 'monthlyConsumption[0]', valueJson: '1200' }]),
    { text: 'Listo.' },
  );
  await session.send('Enero consumió 1.200 kWh');
  assert.equal(isConsumptionEstimated(projectOf(id)), false, 'un mes escrito ya no es una estimación');
  const activityId = Object.values(lastAssistant(session).turn.tools)[0].activityId!;
  assert.equal(session.undoActivity(activityId).success, true);
  assert.equal(isConsumptionEstimated(projectOf(id)), true, 'deshacer lo devuelve a «estimado»');
  assert.deepEqual(projectOf(id).monthlyConsumption, Array(12).fill(1000));
}

// ── E2. Edición en vivo de cada familia de opciones, con su tarjeta y su deshacer ────────────────────────────────────────────
interface Family { id: string; prompt: string; ops: Record<string, unknown>[]; changed: RegExp; verify(id: string): void }
const FAMILIES: Family[] = [
  { id: 'consumo', prompt: 'Sube el consumo a 1.500 kWh al mes', ops: [{ op: 'set_consumption', averageMonthlyKWh: 1500 }], changed: /^monthlyConsumption/,
    verify: (id) => { assert.deepEqual(projectOf(id).monthlyConsumption, Array(12).fill(1500)); assert.equal(isConsumptionEstimated(projectOf(id)), false); } },
  { id: 'tarifa y distribuidora', prompt: 'Cambia la distribuidora a EDENORTE con la tarifa BTS1', ops: [{ op: 'set_tariff', distributor: 'EDENORTE', tariffCode: 'BTS1' }], changed: /^rates\.(distributor|tariffCode)/,
    verify: (id) => { assert.equal(projectOf(id).rates.distributor, 'EDENORTE'); assert.equal(projectOf(id).rates.tariffCode, 'BTS1'); } },
  { id: 'paneles', prompt: 'Ponle 20 paneles', ops: [{ op: 'set', path: 'specs.panels[0].count', valueJson: '20' }], changed: /^specs\.panels\[0\]\.count/,
    verify: (id) => assert.equal(projectOf(id).specs.panels![0].count, 20) },
  { id: 'inversores', prompt: 'Ponle dos inversores', ops: [{ op: 'set', path: 'specs.inverters[0].count', valueJson: '2' }], changed: /^specs\.inverters\[0\]\.count/,
    verify: (id) => assert.equal(projectOf(id).specs.inverters![0].count, 2) },
  { id: 'baterías', prompt: 'Ponle baterías', ops: [{ op: 'set_storage', enabled: true }], changed: /^specs\.(hasBattery|batteries)/,
    verify: (id) => { const p = projectOf(id); assert.equal(p.specs.hasBattery, true); assert.ok((p.specs.batteries![0].unitPriceUSD ?? 0) > 0, 'con el precio de la oferta, no inventado'); } },
  { id: 'cobertura', prompt: 'Sube la cobertura al 90 %', ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }], changed: /^rates\.targetCoveragePct$/,
    verify: (id) => assert.equal(projectOf(id).rates.targetCoveragePct, 90) },
  { id: 'margen', prompt: 'Pon el margen en 35 %', ops: [{ op: 'set_margin_pct', pct: 35 }], changed: /saleMarginMultiplier/,
    verify: (id) => assert.equal(Math.round(projectOf(id).specs.saleMarginMultiplier! * 100), 135) },
  { id: 'descuentos', prompt: 'Hazle un descuento del 5 %', ops: [{ op: 'upsert_discount', description: 'Cliente frecuente', discountType: 'percentage', value: 5 }], changed: /^financials\.customDiscounts/,
    verify: (id) => assert.deepEqual(projectOf(id).financials.customDiscounts?.map((d) => [d.description, d.type, d.value]), [['Cliente frecuente', 'percentage', 5]]) },
  { id: 'extras', prompt: 'Agrega un extra de transporte por 200 dólares', ops: [{ op: 'upsert_item', description: 'Transporte', quantity: 1, unitPriceUSD: 200 }], changed: /^financials\.customItems/,
    verify: (id) => assert.deepEqual(projectOf(id).financials.customItems?.map((i) => [i.description, i.quantity, i.unitPriceUSD]), [['Transporte', 1, 200]]) },
];
for (const family of FAMILIES) {
  resetEvalStore({ catalog: offerCatalog(), view: 'dashboard' });
  const id = await seedFreshProposal();
  const before = sections(id);
  dockHighlightStore.clear();
  let response: Record<string, any> = {};
  const llm = new ScriptedLlm([
    edit('e2', id, family.prompt, family.ops),
    (call) => { response = frOf(call).response; return { text: 'Hecho.' }; },
  ]);
  const session = newEvalSession(llm);
  await session.send(family.prompt);
  llm.assertDone();
  const label = `E2 ${family.id}`;
  assert.equal(response.status, 'applied', `${label}: se aplica al momento (perfil edición en vivo): ${JSON.stringify(response.error)}`);
  assert.ok(response.activityId, `${label}: con su deshacer`);
  assert.ok(response.changes.some((c: { path: string }) => family.changed.test(c.path)), `${label}: el diff trae ${family.changed} (${response.changes.map((c: { path: string }) => c.path)})`);
  assert.equal(response.results.after.complete, true, `${label}: con los resultados del motor, no incompleta`);
  assert.equal(response.proposal.id, id, `${label}: el contexto vivo es el de la propuesta`);
  assert.equal('cards' in response, false, `${label}: las tarjetas no viajan al modelo`);
  family.verify(id);
  assert.notEqual(sections(id), before, `${label}: la propuesta cambió`);
  // La tarjeta: aplicada, con filas y el botón Deshacer conectado a la actividad.
  const reply = lastAssistant(session);
  const card = reply.changeCards?.find((c) => c.input.activityId === response.activityId);
  assert.ok(card, `${label}: hay tarjeta de cambio`);
  assert.equal(card!.input.status, 'applied');
  const view = buildChangeCardView(card!.input);
  assert.equal(view.actions.undo, true, `${label}: la tarjeta ofrece Deshacer`);
  assert.ok(view.rows.length > 0, `${label}: la tarjeta lista lo que cambió`);
  assert.equal(view.results.kind, 'metrics', `${label}: y las cifras del motor`);
  // El resaltado del dock lo alimenta el lote (solo lo del asistente), sin tocar la interfaz.
  assert.notEqual(dockHighlightStore.getState(), EMPTY_HIGHLIGHTS, `${label}: el dock destaca lo que cambió`);
  assert.equal(dockHighlightStore.getState().projectId, id);
  // Deshacer desde la tarjeta deja la propuesta como estaba.
  const undone = session.undoActivity(response.activityId);
  assert.equal(undone.success, true, `${label}: deshacer: ${undone.error}`);
  assert.equal(sections(id), before, `${label}: deshacer devuelve la propuesta a como estaba`);
  assert.equal(lastAssistant(session).undone?.[response.activityId], true, `${label}: la sesión lo recuerda (la tarjeta pasa a «deshecho»)`);
  assertHistoryClosed(session, label);
}

// ── E3. Nunca inventar precios ─────────────────────────────────────────────────────────────────────────────────────────────
const unpricedGroups = (id: string) => [...projectOf(id).specs.panels!, ...projectOf(id).specs.inverters!];
resetEvalStore({ catalog: unpricedCatalog(), view: 'dashboard' });
{
  // a) Sin ofertas ni precio genérico: la propuesta se crea INCOMPLETA, con motivos y sin cifras ni ceros.
  const llm = new ScriptedLlm();
  const session = newEvalSession(llm);
  let created: Record<string, any> = {};
  llm.push(
    { functionCalls: [{ id: 'e3-create', name: 'create_proposal', args: {} }] },
    (call) => { created = frOf(call).response; return { text: 'Creada, pero falta el precio de los equipos.' }; },
  );
  await session.send('Crea una propuesta');
  llm.assertDone();
  assert.equal(created.status, 'applied', JSON.stringify(created.error));
  const id = created.proposalId as string;
  assert.equal(created.results.after.complete, false, 'incompleta');
  assert.ok(created.results.after.reasons.some((r: { code: string }) => r.code === 'missing_equipment_price'), 'dice qué falta: el precio de los equipos');
  assert.ok(!('metrics' in created.results.after), 'ninguna cifra del motor en una incompleta');
  assert.ok(unpricedGroups(id).every((g) => g.unitPriceUSD === undefined || g.unitPriceUSD === null), 'ningún precio inventado: sin valor, no un 0 ni un relleno');
  assert.ok(unpricedGroups(id).every((g) => g.unitPriceUSD !== 0), 'ningún cero falso');
  assert.equal(proposalCompleteness(projectOf(id)).incomplete, true);
  const reply = lastAssistant(session);
  assert.equal(reply.createdProposals![0].card.metrics, null, 'la tarjeta «Propuesta creada» no muestra cifras');
  assert.ok(reply.createdProposals![0].card.reasons.length > 0, '...muestra lo que falta');
  assert.ok((reply.turn.summary?.missing ?? []).length > 0, 'el resumen del turno lo marca pendiente');
  assert.ok(!JSON.stringify(created.results).includes('"contractPriceUSD"'), 'sin precio de contrato en el resultado');

  // b) «¿Cuánto cuesta?» de una incompleta: el estado trae los motivos, jamás un precio de contrato en cero.
  let state: Record<string, any> = {};
  llm.push(
    { functionCalls: [{ id: 'e3-state', name: 'get_proposal_state', args: { proposalId: id } }] },
    (call) => { state = frOf(call).response; return { text: 'Aún no puedo darte el precio: faltan los costos de los equipos.' }; },
  );
  await session.send('¿Cuánto cuesta?');
  llm.assertDone();
  assert.equal(state.results.after.complete, false);
  assert.ok(state.warnings.some((w: string) => /^Incompleta:/.test(w)), 'el aviso «Incompleta: …» viaja al modelo');
  assert.ok(!/contractPriceUSD|"paybackYears"|"year1SavingsUSD"/.test(JSON.stringify(state)), 'ninguna cifra de resultados (ni en cero)');

  // c) Elegir en el catálogo un equipo sin oferta ni genérico lo deja sin precio y se avisa: nunca un precio inventado.
  llm.push(
    edit('e3-sel', id, 'Otro panel', [{ op: 'select_equipment', equipment: 'panel', catalogItemId: evalPanelId(), count: 10 }]),
    (call) => { state = frOf(call).response; return { text: 'Quedó sin precio.' }; },
  );
  await session.send('Cambia el panel');
  llm.assertDone();
  assert.ok(state.warnings.some((w: string) => /sin oferta de proveedor ni precio gen[eé]rico|sin precio/i.test(w)), `avisa: sin precio (${JSON.stringify(state.warnings)})`);
  assert.ok(unpricedGroups(id).every((g) => g.unitPriceUSD !== 0), 'tampoco aquí un 0 falso');
  assert.equal(state.results.after.complete, false);
}
{
  // d) Con precio genérico (sesión de organización) y sin ofertas: se usa y se SEÑALA como «precio genérico, sin proveedor».
  const server = 'https://eval.invalid';
  const user = { id: 'u-eval', name: 'Editor', email: 'e@x.invalid', role: 'EDITOR', organizationId: 'org-eval' } as const;
  const catalog = structuredClone(DEFAULT_EQUIPMENT_CATALOG).map((item) => ({ ...item, supplierPrices: [] as NonNullable<typeof item.supplierPrices>, organizationId: user.organizationId, syncServerUrl: server }));
  resetEvalStore({
    catalog, view: 'dashboard',
    patch: {
      workspaceScope: featureScope(server, user.organizationId),
      genericPrices: Object.fromEntries(['eq-mod-cs-620', 'eq-inv-luxpower-8k'].map((equipmentId, i) => [equipmentId, { priceUSD: i ? 1500 : 100, observedAt: '2026-11-01T12:00:00.000Z', observationId: `po-0000000${i}-0000-4000-8000-000000000001` }])),
      pricePending: { observations: [], voids: [] },
      syncSettings: { ...s().syncSettings, serverUrl: server, currentUser: user as never, authToken: 'synthetic', autoSyncEnabled: false },
    },
  });
  const llm = new ScriptedLlm();
  const session = newEvalSession(llm);
  let created: Record<string, any> = {};
  llm.push(
    { functionCalls: [{ id: 'e3-gen', name: 'create_proposal', args: {} }] },
    (call) => { created = frOf(call).response; return { text: 'Creada con precios genéricos.' }; },
  );
  await session.send('Crea una propuesta');
  llm.assertDone();
  assert.equal(created.status, 'applied', JSON.stringify(created.error));
  const groups = [...created.proposal.equipment.panels, ...created.proposal.equipment.inverters] as { priceSource?: string; unitPriceUSD?: number }[];
  assert.ok(groups.length && groups.every((g) => g.priceSource === 'generic' && (g.unitPriceUSD ?? 0) > 0), `precio genérico, con su procedencia (${JSON.stringify(groups)})`);
  assert.ok(created.warnings.some((w: string) => /Precio gen[eé]rico, sin proveedor/.test(w)), 'señalado como «precio genérico, sin proveedor», nunca como oferta');
  assert.equal(created.results.after.complete, true);
}

// ── E4. Una herramienta que falla no bloquea el turno ───────────────────────────────────────────────────────────────────────
resetEvalStore({ catalog: offerCatalog(), view: 'simulator' });
{
  const id = await seedFreshProposal();
  const before = sections(id);
  const seen: Record<string, any>[] = [];
  const llm = new ScriptedLlm([
    // 1) propuesta que no existe; 2) un valor fuera de rango (el error dice la ruta); 3) el valor corregido.
    edit('e4-a', 'no-existe', 'Margen', [{ op: 'set_margin_pct', pct: 30 }]),
    (call) => { seen.push(frOf(call).response); return edit('e4-b', id, 'Cobertura', [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '900' }]); },
    (call) => { seen.push(frOf(call).response); return edit('e4-c', id, 'Cobertura', [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }]); },
    (call) => { seen.push(frOf(call).response); return { text: 'Quedó la cobertura al 90 %.' }; },
  ]);
  const session = newEvalSession(llm);
  await session.send('Pon el margen al 30 % y la cobertura al 900 %');
  llm.assertDone();
  assert.equal(seen[0].status, 'error', 'la propuesta inexistente falla');
  assert.ok(seen[0].error.message, 'con su mensaje');
  assert.equal(seen[1].status, 'error', 'un valor fuera de rango falla');
  assert.match(seen[1].error.message, /rates\.targetCoveragePct/, 'el error nombra la ruta para que el modelo corrija');
  assert.equal(seen[2].status, 'applied', 'el reintento corregido se aplica');
  assert.equal(projectOf(id).rates.targetCoveragePct, 90);
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'finished', 'el turno no se cuelga ni se cancela');
  assert.equal(session.getState().busy, false);
  assert.ok(reply.turn.summary?.failedTools.includes('edit_proposal'), 'el resumen dice qué falló');
  assert.match(reply.turn.text, /90 %/);
  assert.notEqual(sections(id), before);
  assertHistoryClosed(session, 'E4');
  // La falla no dejó basura: lo único aplicado es el cambio bueno, que se deshace entero.
  assert.equal(Object.values(reply.turn.tools).filter((t) => t.status === 'applied').length, 1);
  assert.equal(session.undoTurn(reply.turn.turnId).success, true);
  assert.equal(sections(id), before, 'deshacer el turno lo deja como estaba');
}

// ── E5. Escribir mientras trabaja ────────────────────────────────────────────────────────────────────────────────────────────
resetEvalStore({ catalog: offerCatalog(), view: 'simulator' });
{
  const id = await seedFreshProposal();
  const llm = new ScriptedLlm();
  const session = newEvalSession(llm);
  llm.push(
    async () => {
      session.setDraft('Y la cobertura al 90 %');
      await session.send();
      assert.equal(session.getState().queued?.text, 'Y la cobertura al 90 %', 'queda en cola');
      assert.equal(session.getState().busy, true);
      return edit('e5-a', id, 'Margen 31', [{ op: 'set_margin_pct', pct: 31 }]);
    },
    (call) => {
      const last = req(call).contents.at(-1)!;
      assert.equal(last.parts[0].type === 'text' && last.parts[0].text, 'Y la cobertura al 90 %', 'el mensaje llega como turno nuevo');
      assert.equal(Math.round(projectOf(id).specs.saleMarginMultiplier! * 100), 131, 'el paso en curso terminó antes de ceder');
      return edit('e5-b', id, 'Cobertura 90', [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }]);
    },
    { text: 'Margen al 31 % y cobertura al 90 %.' },
  );
  await session.send('Pon el margen en 31 %');
  llm.assertDone();
  const [first, second] = session.getState().messages.filter((m) => m.role === 'assistant') as ReturnType<typeof lastAssistant>[];
  assert.equal(first.outcome, 'yielded', 'el primer turno cede el paso');
  assert.equal(second.outcome, 'finished');
  assert.equal(projectOf(id).rates.targetCoveragePct, 90);
  assert.equal(session.getState().queued, null);
  assert.equal(session.getState().busy, false);
  assertHistoryClosed(session, 'E5');
}

// ── E6. Stop ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
resetEvalStore({ catalog: offerCatalog(), view: 'simulator' });
{
  const id = await seedFreshProposal();
  const before = sections(id);
  const llm = new ScriptedLlm();
  const session = newEvalSession(llm);
  let stopped = false;
  llm.push({
    functionCalls: [
      { id: 'e6-a', name: 'edit_proposal', args: { proposalId: id, title: 'Margen 33', ops: [{ op: 'set_margin_pct', pct: 33 }] } },
      { id: 'e6-b', name: 'edit_proposal', args: { proposalId: id, title: 'Cobertura 80', ops: [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '80' }] } },
    ],
  });
  // Stop justo después de aplicarse la primera llamada: la segunda no debe ejecutarse.
  const unsubscribe = session.subscribe(() => {
    const message = lastAssistantSafe(session);
    if (!stopped && message && Object.values(message.turn.tools).some((t) => t.status === 'applied')) { stopped = true; session.cancel(); }
  });
  await session.send('Pon el margen en 33 % y la cobertura en 80 %');
  unsubscribe();
  const reply = lastAssistant(session);
  assert.equal(reply.outcome, 'cancelled', 'Stop cierra el turno');
  assert.equal(session.getState().busy, false);
  assert.equal(llm.calls.length, 1, 'Stop no reenvía nada al modelo');
  assert.equal(Math.round(projectOf(id).specs.saleMarginMultiplier! * 100), 133, 'lo ya aplicado se conserva');
  assert.notEqual(projectOf(id).rates.targetCoveragePct, 80, 'lo que no llegó a ejecutarse no se aplica');
  assertHistoryClosed(session, 'E6');
  const responses = session.history().flatMap((c) => c.parts).filter((p) => p.type === 'functionResponse') as { id?: string; response: Record<string, any> }[];
  assert.deepEqual(responses.map((r) => r.id), ['e6-a', 'e6-b'], 'cada llamada con su respuesta (sin huérfanos)');
  assert.equal(responses[1].response.error.code, 'cancelled', 'la que no se ejecutó queda «cancelada»');
  // Lo aplicado antes de Stop se puede deshacer, y el turno siguiente funciona.
  assert.equal(session.undoTurn(reply.turn.turnId).success, true);
  assert.equal(sections(id), before);
  llm.push({ text: 'Aquí sigo.' });
  await session.send('¿Sigues ahí?');
  assert.equal(lastAssistant(session).outcome, 'finished');
  assertHistoryClosed(session, 'E6 después de Stop');
}
function lastAssistantSafe(session: ReturnType<typeof newEvalSession>) {
  return [...session.getState().messages].reverse().find((m) => m.role === 'assistant') as ReturnType<typeof lastAssistant> | undefined;
}

// ── E7. «Deshaz eso» ─────────────────────────────────────────────────────────────────────────────────────────────────────────
resetEvalStore({ catalog: offerCatalog(), view: 'simulator' });
{
  const id = await seedFreshProposal();
  const before = sections(id);
  const llm = new ScriptedLlm();
  const session = newEvalSession(llm);
  llm.push(edit('e7-a', id, 'Cobertura 90', [{ op: 'set', path: 'rates.targetCoveragePct', valueJson: '90' }]), { text: 'Cobertura al 90 %.' });
  await session.send('Sube la cobertura al 90 %');
  assert.equal(projectOf(id).rates.targetCoveragePct, 90);
  let undo: Record<string, any> = {};
  llm.push(
    { functionCalls: [{ id: 'e7-u', name: 'undo_change', args: { proposalId: id } }] },
    (call) => { undo = frOf(call).response; return { text: 'Deshecho.' }; },
  );
  await session.send('Deshaz eso');
  llm.assertDone();
  assert.equal(undo.status, 'applied', JSON.stringify(undo.error));
  assert.equal(sections(id), before, '«deshaz eso» deja la propuesta como estaba antes del cambio');
  assert.ok(undo.changes.some((c: { path: string }) => c.path === 'rates.targetCoveragePct'), 'dice qué revirtió');
  assertHistoryClosed(session, 'E7');

  // Si el usuario cambió la propuesta después, el asistente NO pisa su cambio: se detiene y lo explica.
  llm.push(edit('e7-b', id, 'Margen 36', [{ op: 'set_margin_pct', pct: 36 }]), { text: 'Margen al 36 %.' });
  await session.send('Pon el margen en 36 %');
  const manual = projectOf(id).rates.targetCoveragePct;
  s().updateRates({ targetCoveragePct: 77 });
  assert.notEqual(manual, 77);
  const mine = sections(id);
  llm.push(
    { functionCalls: [{ id: 'e7-v', name: 'undo_change', args: { proposalId: id } }] },
    (call) => { undo = frOf(call).response; return { text: 'No pude deshacerlo: cambiaste la propuesta después.' }; },
  );
  await session.send('Deshaz eso');
  llm.assertDone();
  assert.equal(undo.status, 'error', 'no pisa lo que cambió el usuario');
  assert.ok(undo.error.message, 'y dice por qué');
  assert.equal(sections(id), mine, 'la propuesta queda tal cual la dejó el usuario');
}

console.log('PASS: assistant evals (create from Home, live edit per family with card and undo, never invent prices, failing tool, write while working, Stop, undo).');
