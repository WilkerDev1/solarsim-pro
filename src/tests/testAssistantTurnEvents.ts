// F3c: tipos de evento del turno del asistente y su reducción pura (los consumen el bucle de F4 y el panel de F5; aquí no hay
// interfaz). Eventos: texto parcial, llamada a herramienta iniciada/terminada con su diff, confirmación pendiente, supuesto
// declarado (solo de la lista cerrada), error recuperable y fin de turno con resumen.
import assert from 'node:assert/strict';
import {
  ASSUMPTION_SOURCES, assumptionFromSizing, validateDeclaredAssumption, type DeclaredAssumption,
} from '../features/agentTools/appAssistant/assumptions';
import {
  TURN_EVENT_TYPES, initialTurnState, reduceTurnEvent, reduceTurnEvents, toolResponseEvents, turnSummary, type AssistantTurnEvent,
} from '../features/agentTools/appAssistant/turnEvents';
import type { AssistantToolResponse } from '../features/agentTools/appAssistant/toolset';
import { NEW_PROPOSAL_DEFAULTS } from '../domain/newProposal';
import { SIZING_ASSUMPTIONS } from '../domain/sizing';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { ASSUMPTION_RULES } from '../../shared/assumptions';

// ── 1. Supuestos: lista cerrada (Ajustes, fábrica, SIZING_ASSUMPTIONS, datos de la propuesta) ─────────────────────────────
assert.deepEqual([...ASSUMPTION_SOURCES], ['settings', 'factory', 'sizing', 'proposal']);
const ok = (a: DeclaredAssumption, refs?: Parameters<typeof validateDeclaredAssumption>[1]) => {
  const result = validateDeclaredAssumption(a, refs);
  assert.ok(result.ok, JSON.stringify(result));
  return result.ok ? result.assumption : undefined!;
};
const rejected = (a: unknown, pattern: RegExp, refs?: Parameters<typeof validateDeclaredAssumption>[1]) => {
  const result = validateDeclaredAssumption(a, refs);
  assert.equal(result.ok, false, `debía rechazarse: ${JSON.stringify(a)}`);
  if (!result.ok) assert.match(result.reason, pattern);
};
// Fábrica: la clave existe en NEW_PROPOSAL_DEFAULTS y el valor es el de verdad.
ok({ source: 'factory', key: 'monthlyConsumptionKWh', label: 'Consumo estimado', value: NEW_PROPOSAL_DEFAULTS.monthlyConsumptionKWh });
rejected({ source: 'factory', key: 'monthlyConsumptionKWh', label: 'Consumo', value: 1200 }, /no es el valor de fábrica/);
rejected({ source: 'factory', key: 'precioPorVatio', label: 'x', value: 1 }, /no es un valor de fábrica/);
// Dimensionado: ruta de SIZING_ASSUMPTIONS (también por su nombre corto, como lo cita sizing.ts) y su valor.
assert.equal(ok({ source: 'sizing', key: 'targetDcAcRatio', label: 'DC/AC', value: SIZING_ASSUMPTIONS.targetDcAcRatio }).key, 'targetDcAcRatio');
assert.equal(ok({ source: 'sizing', key: 'peakDailyFraction', label: 'Batería', value: SIZING_ASSUMPTIONS.battery.peakDailyFraction }).key, 'battery.peakDailyFraction', 'el nombre corto se normaliza a la ruta');
rejected({ source: 'sizing', key: 'targetDcAcRatio', label: 'DC/AC', value: 1.5 }, /no es el supuesto de dimensionado/);
rejected({ source: 'sizing', key: 'battery', label: 'x', value: 1 }, /no es un supuesto de dimensionado/);
// Ajustes: la clave es de DefaultSimulationSettings y el valor debe coincidir con los Ajustes vigentes. Sin ellos no se puede
// comprobar, así que no entra (revisión F3c: un valor inventado, también un margen o un precio, no se acepta a ciegas).
rejected({ source: 'settings', key: 'defaultTargetMarginPct', label: 'Margen objetivo', value: 40 }, /sin los Ajustes/);
ok({ source: 'settings', key: 'defaultTargetMarginPct', label: 'Margen objetivo', value: DEFAULT_SIMULATION_SETTINGS.defaultTargetMarginPct }, { settings: DEFAULT_SIMULATION_SETTINGS });
rejected({ source: 'settings', key: 'defaultTargetMarginPct', label: 'Margen objetivo', value: 55 }, /no coincide con Ajustes/, { settings: DEFAULT_SIMULATION_SETTINGS });
rejected({ source: 'settings', key: 'defaultTargetMarginPct', label: 'Margen', value: 'lo que diga el modelo' }, /no coincide con Ajustes/, { settings: DEFAULT_SIMULATION_SETTINGS });
ok({ source: 'settings', key: 'defaultDistributor', label: 'Distribuidora', value: 'EDESUR' }, { settings: { ...DEFAULT_SIMULATION_SETTINGS, defaultDistributor: 'EDESUR' } });
rejected({ source: 'settings', key: 'defaultDistributor', label: 'Distribuidora', value: 'EDENORTE' }, /no coincide con Ajustes/, { settings: DEFAULT_SIMULATION_SETTINGS });
rejected({ source: 'settings', key: 'defaultPrecioInventado', label: 'x', value: 1 }, /no es un campo de Ajustes/);
// Datos de la propuesta: una ruta del registro de campos y el valor leído de la propuesta; sin ella, no entra.
rejected({ source: 'proposal', key: 'rates.tariffCode', label: 'Tarifa', value: 'BTS1' }, /sin la propuesta/);
rejected({ source: 'proposal', key: 'rates.energyCostPerKWh', label: 'Precio de la energía', value: 99.9 }, /sin la propuesta/);
rejected({ source: 'proposal', key: 'rates.energyCostPerKWh', label: 'Precio de la energía', value: 99.9 }, /no es el dato de la propuesta/, { project: { rates: { energyCostPerKWh: 12.5 } } as never });
ok({ source: 'proposal', key: 'rates.tariffCode', label: 'Tarifa', value: 'BTS2' }, { project: { rates: { tariffCode: 'BTS2' } } as never });
rejected({ source: 'proposal', key: 'rates.tariffCode', label: 'Tarifa', value: 'BTS1' }, /no es el dato de la propuesta/, { project: { rates: { tariffCode: 'BTS2' } } as never });
rejected({ source: 'proposal', key: 'rates.inventado', label: 'x', value: 1 }, /no es una ruta del registro/);
// Cualquier otra fuente (la «experiencia», el modelo, internet) no vale.
rejected({ source: 'model', key: 'x', label: 'x', value: 1 }, /fuente/);
rejected({ source: 'factory', key: 'monthlyConsumptionKWh', label: '', value: 1000 }, /etiqueta/);
rejected(null, /supuesto/);
// Lo que cita el dimensionado se clasifica solo: lo de SIZING_ASSUMPTIONS como «sizing», lo de la propuesta como «proposal»
// solo si es el dato leído de la propuesta (revisión F3c).
const sizedProject = { rates: { targetCoveragePct: 95 }, specs: { sizingBasis: 'peak_month' } } as never;
assert.equal(assumptionFromSizing({ key: 'targetDcAcRatio', label: 'Relación DC/AC objetivo', value: 1.2 })?.source, 'sizing');
assert.deepEqual(assumptionFromSizing({ key: 'targetCoveragePct', label: 'Cobertura objetivo (%)', value: 95 }, { project: sizedProject }), { source: 'proposal', key: 'rates.targetCoveragePct', label: 'Cobertura objetivo (%)', value: 95 });
assert.equal(assumptionFromSizing({ key: 'sizingBasis', label: 'Mes pico', value: 'peak_month' }, { project: sizedProject })?.key, 'specs.sizingBasis');
assert.equal(assumptionFromSizing({ key: 'algoRaro', label: 'x', value: 1 }), undefined, 'lo que no está en la lista no se convierte en supuesto');
// Sin la propuesta no se puede saber si el dato es suyo: no se declara.
assert.equal(assumptionFromSizing({ key: 'targetCoveragePct', label: 'Cobertura objetivo (%)', value: 95 }), undefined);
// Una cobertura pedida como argumento de size_system es lo que pidió el usuario, no un supuesto.
assert.equal(assumptionFromSizing({ key: 'targetCoveragePct', label: 'Cobertura objetivo (%)', value: 80 }, { project: sizedProject, args: { coveragePct: 80 } }), undefined);
// Una cobertura que no es la de la propuesta (p. ej. la resuelta por defecto) no se hace pasar por dato de la propuesta.
assert.equal(assumptionFromSizing({ key: 'targetCoveragePct', label: 'Cobertura objetivo (%)', value: 80 }, { project: sizedProject }), undefined);
// Una cobertura guardada que cuenta como ausente (0, o fuera de rango; zeroIsMissing en shared/assumptions) hace que el
// dimensionado use el valor por defecto: se declara como valor de fábrica, no se pierde ni pasa por dato de la propuesta
// (revisión F3c, 2.ª ronda).
for (const stored of [0, undefined, 999]) {
  const missingCoverage = { rates: { targetCoveragePct: stored }, specs: { sizingBasis: 'peak_month' } } as never;
  assert.deepEqual(assumptionFromSizing({ key: 'targetCoveragePct', label: 'Cobertura objetivo (%)', value: ASSUMPTION_RULES.targetCoveragePct.default }, { project: missingCoverage }),
    { source: 'factory', key: 'targetCoveragePct', label: 'Cobertura objetivo (%)', value: ASSUMPTION_RULES.targetCoveragePct.default }, `guardada ${stored}`);
  assert.equal(assumptionFromSizing({ key: 'targetCoveragePct', label: 'Cobertura objetivo (%)', value: 42 }, { project: missingCoverage }), undefined, 'otro valor no entra');
}
ok({ source: 'factory', key: 'targetCoveragePct', label: 'Cobertura', value: ASSUMPTION_RULES.targetCoveragePct.default });
rejected({ source: 'factory', key: 'targetCoveragePct', label: 'Cobertura', value: 50 }, /no es el valor de fábrica/);
// Un supuesto sin valor no entra (antes, una ruta vacía de la propuesta lo dejaba pasar: undefined === undefined).
rejected({ source: 'proposal', key: 'rates.usdExchangeRate', label: 'x' }, /valor/, { project: { rates: {} } as never });
rejected({ source: 'settings', key: 'defaultTargetMarginPct', label: 'Margen' }, /valor/, { settings: DEFAULT_SIMULATION_SETTINGS });
// Una propuesta guardada sin base usa la heredada: es el supuesto de dimensionado legacyBasis, no un dato de la propuesta.
assert.deepEqual(assumptionFromSizing({ key: 'sizingBasis', label: 'Consumo real del año', value: 'average' }, { project: { rates: {}, specs: {} } as never }),
  { source: 'sizing', key: 'legacyBasis', label: 'Consumo real del año', value: SIZING_ASSUMPTIONS.legacyBasis });

// ── 2. Tipos de evento ───────────────────────────────────────────────────────────────────────────────────────────────────
assert.deepEqual([...TURN_EVENT_TYPES], [
  'text_delta', 'tool_call_started', 'tool_call_finished', 'confirmation_pending', 'assumption_declared', 'recoverable_error', 'turn_finished',
]);

// ── 3. Reducción de un turno completo ─────────────────────────────────────────────────────────────────────────────────────
const change = { path: 'rates.targetCoveragePct', label: 'Cobertura objetivo (%)', before: 95, after: 80, derived: false };
const events: AssistantTurnEvent[] = [
  { type: 'text_delta', text: 'Creo la ' },
  { type: 'text_delta', text: 'propuesta.' },
  { type: 'tool_call_started', callId: 'c1', name: 'create_proposal', args: {} },
  { type: 'assumption_declared', assumption: { source: 'factory', key: 'monthlyConsumptionKWh', label: 'Consumo estimado (kWh/mes)', value: 1000 } },
  { type: 'assumption_declared', assumption: { source: 'factory', key: 'monthlyConsumptionKWh', label: 'Consumo estimado (kWh/mes)', value: 1000 } },
  { type: 'tool_call_finished', callId: 'c1', name: 'create_proposal', status: 'applied', proposalId: 'p1', activityId: 'a1', changes: [] },
  { type: 'tool_call_started', callId: 'c2', name: 'edit_proposal' },
  { type: 'tool_call_finished', callId: 'c2', name: 'edit_proposal', status: 'applied', proposalId: 'p1', activityId: 'a2', changes: [change] },
  { type: 'tool_call_started', callId: 'c3', name: 'set_proposal_status' },
  { type: 'tool_call_finished', callId: 'c3', name: 'set_proposal_status', status: 'pending_confirmation', proposalId: 'p1', changes: [] },
  { type: 'confirmation_pending', callId: 'c3', actionId: 'act-3', title: 'Marcar como enviada', changes: [{ label: 'Estado', value: 'Enviada' }] },
  { type: 'tool_call_started', callId: 'c4', name: 'search_equipment' },
  { type: 'tool_call_finished', callId: 'c4', name: 'search_equipment', status: 'error', changes: [], error: { code: 'tool_failed', message: 'Catálogo no disponible.' } },
  { type: 'recoverable_error', callId: 'c4', code: 'tool_failed', message: 'Catálogo no disponible.' },
  { type: 'turn_finished', summary: { missing: ['Una factura para el consumo real'], nextSteps: ['Adjunta la factura'] } },
];
const start = initialTurnState('turn-1');
const end = reduceTurnEvents(start, events);
assert.equal(start.text, '', 'reducir no muta el estado de partida');
assert.equal(start.status, 'running');
assert.equal(end.turnId, 'turn-1');
assert.equal(end.text, 'Creo la propuesta.', 'los deltas se concatenan');
assert.deepEqual(end.toolOrder, ['c1', 'c2', 'c3', 'c4']);
assert.equal(end.tools.c2.status, 'applied');
assert.deepEqual(end.tools.c2.changes, [change], 'la llamada terminada lleva su diff');
assert.equal(end.tools.c1.status, 'applied');
assert.equal(end.tools.c4.status, 'error');
assert.deepEqual(end.pendingConfirmations.map((p) => p.actionId), ['act-3']);
assert.equal(end.assumptions.length, 1, 'el mismo supuesto dos veces se cuenta una');
assert.equal(end.errors.length, 1);
assert.equal(end.errors[0].recoverable, true);
assert.equal(end.status, 'finished');
assert.deepEqual(end.summary, {
  changes: [{ proposalId: 'p1', ...change }],
  assumptions: [{ source: 'factory', key: 'monthlyConsumptionKWh', label: 'Consumo estimado (kWh/mes)', value: 1000 }],
  pendingConfirmations: [{ callId: 'c3', actionId: 'act-3', title: 'Marcar como enviada', changes: [{ label: 'Estado', value: 'Enviada' }] }],
  missing: ['Una factura para el consumo real'],
  nextSteps: ['Adjunta la factura'],
  failedTools: ['search_equipment'],
  proposalIds: ['p1'],
});
assert.deepEqual(turnSummary(end), end.summary, 'el resumen se puede calcular en cualquier momento');

// Una reducción es reproducible: mismos eventos, mismo estado (F5 puede reconstruir el panel desde el registro).
assert.deepEqual(reduceTurnEvents(initialTurnState('turn-1'), events), end);
// Paso a paso igual que de golpe.
assert.deepEqual(events.reduce((state, event) => reduceTurnEvent(state, event), initialTurnState('turn-1')), end);

// ── 4. Invariantes de la reducción ───────────────────────────────────────────────────────────────────────────────────────
// Un supuesto fuera de la lista no entra: queda un error recuperable que el bucle devuelve al modelo.
const bad = reduceTurnEvent(initialTurnState('t'), { type: 'assumption_declared', assumption: { source: 'factory', key: 'monthlyConsumptionKWh', label: 'Consumo', value: 1500 } });
assert.equal(bad.assumptions.length, 0);
assert.equal(bad.errors[0].code, 'assumption_rejected');
assert.equal(bad.errors[0].recoverable, true);
assert.match(bad.errors[0].message, /no es el valor de fábrica/);
// Tras el fin de turno, nada cambia.
const after = reduceTurnEvent(end, { type: 'text_delta', text: 'más' });
assert.equal(after, end, 'un evento tardío se ignora (mismo objeto)');
// Terminar una llamada que no empezó la registra igual (el bucle pudo perder el inicio), sin romper el orden.
const orphan = reduceTurnEvent(initialTurnState('t'), { type: 'tool_call_finished', callId: 'x', name: 'edit_proposal', status: 'applied', changes: [change] });
assert.deepEqual(orphan.toolOrder, ['x']);
assert.equal(orphan.tools.x.status, 'applied');
// Una llamada que sigue en curso al terminar el turno queda como interrumpida.
const open = reduceTurnEvents(initialTurnState('t'), [{ type: 'tool_call_started', callId: 'y', name: 'size_system' }, { type: 'turn_finished', summary: {} }]);
assert.equal(open.tools.y.status, 'interrupted');
assert.deepEqual(open.summary?.failedTools, ['size_system']);
// Confirmar fuera del panel retira la pendiente si el bucle lo comunica con la llamada terminada como aplicada.
const confirmed = reduceTurnEvents(initialTurnState('t'), [
  { type: 'confirmation_pending', callId: 'z', actionId: 'act', title: 'Precio', changes: [] },
  { type: 'tool_call_finished', callId: 'z', name: 'edit_proposal', status: 'applied', changes: [change] },
]);
assert.deepEqual(confirmed.pendingConfirmations, []);
// Un error no recuperable termina el turno.
const fatal = reduceTurnEvent(initialTurnState('t'), { type: 'recoverable_error', code: 'auth', message: 'Clave no válida.', recoverable: false });
assert.equal(fatal.status, 'failed');
// …y lo cierra como turn_finished (revisión F3c): lo en curso queda interrumpido y hay resumen de lo ya aplicado.
const fatalMid = reduceTurnEvents(initialTurnState('t'), [
  { type: 'tool_call_finished', callId: 'a', name: 'edit_proposal', status: 'applied', proposalId: 'p1', changes: [change] },
  { type: 'tool_call_started', callId: 'b', name: 'size_system' },
  { type: 'recoverable_error', code: 'network', message: 'Sin conexión.', recoverable: false },
  { type: 'turn_finished', summary: { missing: ['ignorado'] } },
]);
assert.equal(fatalMid.status, 'failed');
assert.equal(fatalMid.tools.b.status, 'interrupted', 'la llamada en curso queda interrumpida');
assert.ok(fatalMid.summary, 'un turno que termina por error fatal también tiene resumen');
assert.deepEqual(fatalMid.summary?.changes, [{ proposalId: 'p1', ...change }], 'con lo que ya se aplicó');
assert.deepEqual(fatalMid.summary?.failedTools, ['size_system']);
assert.deepEqual(fatalMid.summary?.missing, [], 'el turn_finished tardío se ignora');
// Un tool_call_started repetido de una llamada ya terminada no borra su diff (reintento del mismo callId).
const restarted = reduceTurnEvents(initialTurnState('t'), [
  { type: 'tool_call_finished', callId: 'a', name: 'edit_proposal', status: 'applied', proposalId: 'p1', changes: [change] },
  { type: 'tool_call_started', callId: 'a', name: 'edit_proposal' },
  { type: 'turn_finished', summary: {} },
]);
assert.equal(restarted.tools.a.status, 'applied');
assert.deepEqual(restarted.summary?.changes, [{ proposalId: 'p1', ...change }]);
assert.deepEqual(restarted.summary?.failedTools, []);
// El reductor valida los supuestos de Ajustes y de la propuesta contra las referencias del turno: uno inventado se rechaza.
const refs = { settings: DEFAULT_SIMULATION_SETTINGS, project: { rates: { energyCostPerKWh: 12.5 } } as never };
const withRefs = reduceTurnEvents(initialTurnState('t'), [
  { type: 'assumption_declared', assumption: { source: 'settings', key: 'defaultTargetMarginPct', label: 'Margen', value: 55 } },
  { type: 'assumption_declared', assumption: { source: 'proposal', key: 'rates.energyCostPerKWh', label: 'Precio de la energía', value: 99.9 } },
  { type: 'assumption_declared', assumption: { source: 'settings', key: 'defaultTargetMarginPct', label: 'Margen', value: 'lo que diga el modelo' } },
  { type: 'assumption_declared', assumption: { source: 'settings', key: 'defaultTargetMarginPct', label: 'Margen', value: DEFAULT_SIMULATION_SETTINGS.defaultTargetMarginPct } },
  { type: 'assumption_declared', assumption: { source: 'proposal', key: 'rates.energyCostPerKWh', label: 'Precio de la energía', value: 12.5 } },
], refs);
assert.deepEqual(withRefs.assumptions.map((a) => a.value), [DEFAULT_SIMULATION_SETTINGS.defaultTargetMarginPct, 12.5], 'solo entran los valores verdaderos');
assert.deepEqual(withRefs.errors.map((e) => e.code), ['assumption_rejected', 'assumption_rejected', 'assumption_rejected']);
// Sin referencias, un supuesto de Ajustes o de la propuesta tampoco entra.
const noRefs = reduceTurnEvent(initialTurnState('t'), { type: 'assumption_declared', assumption: { source: 'settings', key: 'defaultTargetMarginPct', label: 'Margen', value: 40 } });
assert.equal(noRefs.assumptions.length, 0);
assert.equal(noRefs.errors[0]?.code, 'assumption_rejected');
// Paso a paso con referencias, igual que de golpe.
const stepped = reduceTurnEvent(reduceTurnEvent(initialTurnState('t'), { type: 'assumption_declared', assumption: { source: 'proposal', key: 'rates.energyCostPerKWh', label: 'P', value: 12.5 } }, refs), { type: 'turn_finished', summary: {} }, refs);
assert.equal(stepped.assumptions.length, 1);
// Un evento desconocido no rompe la reducción: se ignora.
assert.equal(reduceTurnEvent(start, { type: 'otro' } as unknown as AssistantTurnEvent), start);

// ── 5. De la respuesta común del conjunto (F3a) a eventos ────────────────────────────────────────────────────────────────
const response = (extra: Partial<AssistantToolResponse>): AssistantToolResponse => ({
  status: 'applied', tool: 'edit_proposal', proposalId: 'p1', changes: [change], results: { before: null, after: null }, warnings: [], proposal: null, ...extra,
});
assert.deepEqual(toolResponseEvents('c9', response({ activityId: 'a9' })), [
  { type: 'tool_call_finished', callId: 'c9', name: 'edit_proposal', status: 'applied', proposalId: 'p1', activityId: 'a9', changes: [change] },
]);
assert.deepEqual(toolResponseEvents('c9', response({ status: 'pending_confirmation', actionId: 'q', changes: [change], cards: [{ type: 'pending-action', id: 'q', title: 'Precios', actionId: 'q', changes: [{ label: 'Precio', after: '100' }] }] })), [
  { type: 'tool_call_finished', callId: 'c9', name: 'edit_proposal', status: 'pending_confirmation', proposalId: 'p1', changes: [change] },
  { type: 'confirmation_pending', callId: 'c9', actionId: 'q', title: 'Precios', changes: [{ label: 'Precio', value: '100' }] },
]);
assert.deepEqual(toolResponseEvents('c9', response({ status: 'error', changes: [], error: { code: 'invalid_edits', message: 'Ruta desconocida.' } })), [
  { type: 'tool_call_finished', callId: 'c9', name: 'edit_proposal', status: 'error', proposalId: 'p1', changes: [], error: { code: 'invalid_edits', message: 'Ruta desconocida.' } },
  { type: 'recoverable_error', callId: 'c9', code: 'invalid_edits', message: 'Ruta desconocida.' },
]);
// Los supuestos que cita el dimensionado (data.assumptions de size_system/create_proposal) salen como eventos de la lista cerrada.
const sized = toolResponseEvents('s', response({ status: 'ok', tool: 'size_system', changes: [], data: { assumptions: [
  { key: 'targetDcAcRatio', label: 'Relación DC/AC objetivo', value: 1.2 }, { key: 'algoRaro', label: 'x', value: 1 },
] } }));
assert.deepEqual(sized.filter((e) => e.type === 'assumption_declared').map((e) => e.type === 'assumption_declared' && e.assumption.key), ['targetDcAcRatio']);
// Con la propuesta y los argumentos de la llamada: la cobertura pedida por argumento no se declara; la de la propuesta sí.
const coverageCited = (value: number): Partial<AssistantToolResponse> => ({ status: 'ok', tool: 'size_system', changes: [], data: { assumptions: [{ key: 'targetCoveragePct', label: 'Cobertura objetivo (%)', value }] } });
const declared = (events: AssistantTurnEvent[]) => events.flatMap((e) => (e.type === 'assumption_declared' ? [e.assumption.key] : []));
assert.deepEqual(declared(toolResponseEvents('s', response(coverageCited(80)), { project: sizedProject, args: { coveragePct: 80 } })), []);
assert.deepEqual(declared(toolResponseEvents('s', response(coverageCited(95)))), [], 'sin la propuesta no se declara');
assert.deepEqual(declared(toolResponseEvents('s', response(coverageCited(95)), { project: sizedProject })), ['rates.targetCoveragePct']);
// Un callId reutilizado con otros argumentos (idempotency_conflict) no borra la llamada ya terminada (revisión F3c, 2.ª ronda):
// conserva su diff y su confirmación pendiente; el conflicto queda solo como error recuperable.
const conflict = response({ status: 'error', proposalId: undefined, changes: [], error: { code: 'idempotency_conflict', message: 'Esta llamada del turno ya se usó con otros argumentos.' } });
const afterApplied = reduceTurnEvents(initialTurnState('t'), [
  ...toolResponseEvents('c1', response({ activityId: 'a1' })), ...toolResponseEvents('c1', conflict), { type: 'turn_finished', summary: {} },
]);
assert.equal(afterApplied.tools.c1.status, 'applied');
assert.deepEqual(afterApplied.summary?.changes, [{ proposalId: 'p1', ...change }], 'el diff aplicado sigue en el resumen');
assert.deepEqual(afterApplied.summary?.failedTools, []);
assert.deepEqual(afterApplied.summary?.proposalIds, ['p1']);
assert.deepEqual(afterApplied.errors.map((e) => e.code), ['idempotency_conflict'], 'el conflicto se registra como error recuperable');
const pendingResponse = response({ status: 'pending_confirmation', actionId: 'q1', cards: [{ type: 'pending-action', id: 'q1', title: 'Precios', actionId: 'q1', changes: [{ label: 'Precio', after: '100' }] }] });
const afterPending = reduceTurnEvents(initialTurnState('t'), [...toolResponseEvents('c1', pendingResponse), ...toolResponseEvents('c1', conflict), { type: 'turn_finished', summary: {} }]);
assert.equal(afterPending.tools.c1.status, 'pending_confirmation');
assert.deepEqual(afterPending.summary?.pendingConfirmations.map((p) => p.actionId), ['q1'], 'la acción sigue en la cola: sigue pendiente');
// Un error posterior (sin conflicto) tampoco borra lo ya aplicado.
const appliedThenError = reduceTurnEvents(initialTurnState('t'), [
  { type: 'tool_call_finished', callId: 'a', name: 'edit_proposal', status: 'applied', proposalId: 'p1', changes: [change] },
  { type: 'tool_call_finished', callId: 'a', name: 'edit_proposal', status: 'error', changes: [], error: { code: 'x', message: 'y' } },
]);
assert.equal(appliedThenError.tools.a.status, 'applied');
assert.deepEqual(appliedThenError.tools.a.changes, [change]);
// La transición legítima pendiente → aplicada / error (el estado real de la acción, withActionStatus) sí se registra.
const pendingThenApplied = reduceTurnEvents(initialTurnState('t'), [
  ...toolResponseEvents('c1', pendingResponse), ...toolResponseEvents('c1', response({ activityId: 'a1', duplicate: true })), { type: 'turn_finished', summary: {} },
]);
assert.equal(pendingThenApplied.tools.c1.status, 'applied');
assert.deepEqual(pendingThenApplied.summary?.pendingConfirmations, []);
assert.deepEqual(pendingThenApplied.summary?.changes, [{ proposalId: 'p1', ...change }]);
const pendingThenRejected = reduceTurnEvents(initialTurnState('t'), [
  ...toolResponseEvents('c1', pendingResponse), ...toolResponseEvents('c1', response({ status: 'error', error: { code: 'action_rejected', message: 'El usuario rechazó este cambio.' } })),
]);
assert.equal(pendingThenRejected.tools.c1.status, 'error');
assert.deepEqual(pendingThenRejected.pendingConfirmations, []);

console.log('PASS: eventos del turno: tipos, reducción pura y reproducible, supuestos de la lista cerrada y respuesta común → eventos.');
