// F5a: tarjeta de cambio del asistente. El formateo vive en funciones puras (`changeCardModel.ts`): valores con su unidad,
// antes → después, derivados agrupados, resultados del motor antes y después, «—» (nunca ceros) en una propuesta incompleta
// y los botones que corresponden a cada estado. El componente (`ChangeCard.tsx`) solo pinta ese modelo.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProjectFieldChange, ProjectEditMetrics } from '../domain/projectEditTransaction';
import type { EngineResults } from '../domain/proposalSnapshot';
import {
  CARD_MAX_ROWS, buildChangeCardView, changeCardInputFromResponse, formatFieldValue, type ChangeCardInput,
} from '../features/assistantFeedback/changeCardModel';
import { ChangeCard } from '../features/assistantFeedback/ChangeCard';
import type { AssistantToolResponse } from '../features/agentTools/appAssistant/toolset';

const change = (path: string, label: string, before: unknown, after: unknown, derived = false): ProjectFieldChange => ({ path, label, before, after, derived });
const metrics = (extra: Partial<ProjectEditMetrics> = {}): ProjectEditMetrics => ({
  systemCapacityKWp: 5.9, annualProductionKWh: 9400, energyCoveragePct: 88, contractPriceUSD: 7350, netInvestmentUSD: 6100, year1SavingsUSD: 1800, paybackYears: 3.4, ...extra,
});
const complete = (extra: Partial<ProjectEditMetrics> = {}): EngineResults => ({ complete: true, metrics: metrics(extra) });
const incomplete: EngineResults = {
  complete: false,
  reasons: [{ code: 'missing_equipment_price', path: 'specs.panels[0].unitPriceUSD', message: 'Falta el precio de Canadian 590 W: elige una oferta de proveedor o escribe el costo unitario.' }],
};

// ── 1. Valores con su unidad ────────────────────────────────────────────────────────────────────────────────────────────
assert.equal(formatFieldValue('rates.targetCoveragePct', 90), '90 %');
assert.equal(formatFieldValue('specs.panels[0].unitPriceUSD', 1234.5), '$1,234.50');
assert.equal(formatFieldValue('specs.panels[0].powerW', 590), '590 W');
assert.equal(formatFieldValue('specs.inverters[0].powerKW', 8), '8 kW');
assert.equal(formatFieldValue('specs.batteries[0].capacityKWh', 16.1), '16.1 kWh');
assert.equal(formatFieldValue('rates.energyCostPerKWh', 0.215), '$0.215/kWh');
assert.equal(formatFieldValue('rates.gridUseChargeDOPPerKWh', 2.5), 'RD$ 2.50/kWh');
assert.equal(formatFieldValue('specs.pricePerWattUSD', 0.85), '$0.85/W');
assert.equal(formatFieldValue('specs.installationUnitPriceUSD', 170), '$170.00/kWp');
assert.equal(formatFieldValue('specs.dopExchangeRate', 61.2), 'RD$ 61.20');
assert.equal(formatFieldValue('specs.saleMarginMultiplier', 1.4), '×1.40 (margen 40 %)');
assert.equal(formatFieldValue('monthlyConsumption[3]', 1200), '1,200 kWh');
assert.equal(formatFieldValue('specs.hasBattery', true), 'Sí');
assert.equal(formatFieldValue('financials.applyLey5707', false), 'No');
assert.equal(formatFieldValue('specs.pricingMode', 'direct_watt'), 'Precio directo');
assert.equal(formatFieldValue('specs.pricingMode', 'cost_matrix'), 'Matriz de costos');
assert.equal(formatFieldValue('rates.gridConnection', 'off_grid'), 'Aislado (modo isla)');
assert.equal(formatFieldValue('rates.distributor', 'EDENORTE'), 'EDENORTE');
assert.equal(formatFieldValue('client.address', undefined), '—', 'borrar un dato se ve como «—»');
assert.equal(formatFieldValue('client.address', ''), '(vacío)');
assert.equal(formatFieldValue('client.name', 'x'.repeat(100)).length, 60, 'un texto largo se acorta');
assert.equal(formatFieldValue('monthlyConsumption', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]), '1,200 kWh/año');
assert.equal(formatFieldValue('specs.panels', [{ brandModel: 'Canadian 590 W', count: 10 }, { brandModel: 'Jinko 620 W', count: 4 }]), '10× Canadian 590 W, 4× Jinko 620 W');
assert.equal(formatFieldValue('specs.panels', []), 'ninguno');
assert.equal(formatFieldValue('financials.customItems', [{ description: 'Cableado' }, { description: 'Mano de obra' }]), '2 ítems');
assert.equal(formatFieldValue('financials.customDiscounts', [{ description: 'Promo' }]), '1 descuento');
assert.equal(formatFieldValue('specs.panels[1]', { brandModel: 'Jinko 620 W', count: 4 }), '4× Jinko 620 W', 'un grupo entero (añadido o quitado)');
assert.equal(formatFieldValue('rates.billingTariff', { code: 'BTS1' }), '(ver detalle)', 'un objeto de la tarifa no se vuelca como JSON');

// ── 2. Cambios aplicados con derivados y resultados ────────────────────────────────────────────────────────────────────
const applied: ChangeCardInput = {
  status: 'applied', title: 'Cambio de distribuidora', activityId: 'act-1',
  changes: [
    change('rates.distributor', 'Distribuidora', 'EDEESTE', 'EDENORTE'),
    change('rates.tariffCode', 'Tarifa', 'BTS1', 'BTS2', true),
    change('rates.energyCostPerKWh', 'Precio kWh (USD)', 0.2, 0.18, true),
    change('specs.panels[0].unitPriceUSD', 'Costo unitario del panel (USD) (#1)', 100, 95),
  ],
  results: { before: complete(), after: complete({ contractPriceUSD: 7200, year1SavingsUSD: 1900, paybackYears: 3.2 }) },
  warnings: ['El precio del kWh es el de referencia de la distribuidora.'],
  assumptions: [{ source: 'factory', key: 'targetCoveragePct', label: 'Cobertura objetivo', value: 90 }],
};
const view = buildChangeCardView(applied);
assert.equal(view.title, 'Cambio de distribuidora');
assert.equal(view.tone, 'applied');
assert.equal(view.status, 'applied');
assert.deepEqual(view.rows.map((row) => [row.label, row.before, row.after]), [
  ['Distribuidora', 'EDEESTE', 'EDENORTE'],
  ['Costo unitario del panel (#1)', '$100.00', '$95.00'],
], 'lo pedido, con la unidad en el valor y no repetida en la etiqueta');
assert.equal(view.derived?.rows.length, 2, 'lo que cambió una regla va agrupado');
assert.match(view.derived!.label, /^Se ajustó solo \(2\)/);
assert.deepEqual(view.derived!.rows.map((row) => [row.label, row.before, row.after]), [['Tarifa', 'BTS1', 'BTS2'], ['Precio kWh', '$0.200/kWh', '$0.180/kWh']]);
assert.ok(view.derived!.rows.every((row) => row.derived));
assert.equal(view.results.kind, 'metrics');
assert.deepEqual(view.results.kind === 'metrics' ? view.results.rows.map((row) => [row.label, row.before, row.after]) : [], [
  ['Precio de contrato', '$7,350.00', '$7,200.00'],
  ['Ahorro del año 1', '$1,800.00', '$1,900.00'],
  ['Retorno', '3.4 años', '3.2 años'],
], 'solo lo que cambió en los resultados del motor');
assert.deepEqual(view.warnings, ['El precio del kWh es el de referencia de la distribuidora.']);
assert.deepEqual(view.assumptions, [{ label: 'Cobertura objetivo', value: '90', origin: 'valor de fábrica' }]);
assert.deepEqual(view.actions, { undo: true, confirm: false, reject: false });
assert.match(view.summary, /4 cambios/);
assert.match(view.summary, /2 ajustados solos/);

// Sin diferencia en los resultados: lo dice (no una tabla vacía).
const flat = buildChangeCardView({ status: 'applied', changes: [change('client.name', 'Nombre del cliente', 'A', 'B')], results: { before: complete(), after: complete() } });
assert.equal(flat.results.kind, 'metrics');
assert.deepEqual(flat.results.kind === 'metrics' ? flat.results.rows : null, []);
assert.equal(flat.results.kind === 'metrics' ? flat.results.unchanged : false, true, 'los resultados no cambiaron');
assert.equal(flat.derived, null, 'sin derivados no hay grupo');

// Una propuesta recién creada: sin «antes», todas las cifras del después.
const created = buildChangeCardView({ status: 'applied', changes: [change('client.name', 'Nombre del cliente', undefined, 'Juan Pérez')], results: { before: null, after: complete() } });
assert.equal(created.results.kind === 'metrics' ? created.results.rows.length : 0, 7);
assert.equal(created.results.kind === 'metrics' ? created.results.rows[0].before : 'x', '—');
assert.equal(created.rows[0].before, '—');

// ── 3. Propuesta incompleta: motivos, nunca cifras ─────────────────────────────────────────────────────────────────────
const afterIncomplete = buildChangeCardView({ status: 'applied', changes: [change('specs.panels', 'Paneles', [], [{ brandModel: 'Canadian 590 W', count: 10 }])], results: { before: complete(), after: incomplete }, activityId: 'a' });
assert.equal(afterIncomplete.results.kind, 'incomplete');
assert.equal(afterIncomplete.results.kind === 'incomplete' ? afterIncomplete.results.reasons[0] : '', 'Falta el precio de Canadian 590 W: elige una oferta de proveedor o escribe el costo unitario.');
assert.doesNotMatch(JSON.stringify(afterIncomplete.results), /\$|\d+(\.\d+)? (kWp|kWh|años)|"rows"/, 'ni una cifra del motor en una propuesta incompleta (ni las de antes)');
const wasIncomplete = buildChangeCardView({ status: 'applied', changes: [change('specs.panels[0].unitPriceUSD', 'Costo del panel', undefined, 95)], results: { before: incomplete, after: complete() } });
assert.equal(wasIncomplete.results.kind, 'metrics');
assert.ok(wasIncomplete.results.kind === 'metrics' && wasIncomplete.results.rows.every((row) => row.before === '—'), 'lo que estaba incompleto no tiene un «antes» en cero: «—»');
const bothIncomplete = buildChangeCardView({ status: 'applied', changes: [change('client.name', 'Nombre', 'A', 'B')], results: { before: incomplete, after: incomplete } });
assert.equal(bothIncomplete.results.kind, 'incomplete');
assert.equal(buildChangeCardView({ status: 'applied', changes: [change('client.name', 'Nombre', 'A', 'B')] }).results.kind, 'none');

// ── 4. Pendiente de confirmación ───────────────────────────────────────────────────────────────────────────────────────
const pending = buildChangeCardView({
  status: 'pending_confirmation', title: 'Subir el margen', actionId: 'act-9',
  changes: [change('specs.saleMarginMultiplier', 'Factor de venta (margen)', 1.3, 1.45)],
  results: { before: complete(), after: complete({ contractPriceUSD: 8100 }) },
});
assert.equal(pending.tone, 'pending');
assert.equal(pending.headline, 'Espera tu confirmación');
assert.deepEqual(pending.actions, { undo: false, confirm: true, reject: true });
assert.deepEqual(pending.rows[0], { path: 'specs.saleMarginMultiplier', label: 'Factor de venta (margen)', before: '×1.30 (margen 30 %)', after: '×1.45 (margen 45 %)', derived: false });
assert.match(pending.summary, /no se ha aplicado/i);

// Otros estados: deshecho, rechazado, caducado y con error no tienen botones; un error nombra el motivo.
for (const status of ['undone', 'rejected', 'expired'] as const) {
  const v = buildChangeCardView({ status, changes: [change('client.name', 'Nombre', 'A', 'B')], activityId: 'a', actionId: 'b' });
  assert.deepEqual(v.actions, { undo: false, confirm: false, reject: false }, status);
  assert.equal(v.tone, 'neutral');
}
const failed = buildChangeCardView({ status: 'error', changes: [], error: { code: 'invalid_arguments', message: 'La cobertura debe estar entre 1 y 100.' } });
assert.equal(failed.tone, 'error');
assert.equal(failed.error, 'La cobertura debe estar entre 1 y 100.');
assert.deepEqual(failed.rows, []);
// Aplicado sin actividad que deshacer: sin botón.
assert.equal(buildChangeCardView({ status: 'applied', changes: [change('client.name', 'Nombre', 'A', 'B')] }).actions.undo, false);

// Muchas filas: se muestran las primeras y se cuenta el resto.
const many = buildChangeCardView({ status: 'applied', activityId: 'a', changes: Array.from({ length: CARD_MAX_ROWS + 4 }, (_, i) => change(`monthlyConsumption[${i % 12}]`, `Mes ${i}`, i, i + 1)) });
assert.equal(many.rows.length, CARD_MAX_ROWS);
assert.equal(many.hiddenRows, 4);

// ── 5. Desde la respuesta común de F3a ────────────────────────────────────────────────────────────────────────────────
const response = (extra: Partial<AssistantToolResponse> = {}): AssistantToolResponse => ({
  status: 'applied', tool: 'edit_proposal', proposalId: 'p1', changes: [change('rates.targetCoveragePct', 'Cobertura objetivo', 80, 90)],
  results: { before: complete(), after: complete({ energyCoveragePct: 94 }) }, warnings: ['Aviso'], proposal: null, activityId: 'act-7', ...extra,
});
const fromApplied = changeCardInputFromResponse(response(), { assumptions: [{ source: 'sizing', key: 'peakDailyFraction', label: 'Fracción del pico', value: 0.8 }] });
assert.ok(fromApplied);
assert.equal(fromApplied.status, 'applied');
assert.equal(fromApplied.activityId, 'act-7');
assert.equal(fromApplied.assumptions?.length, 1);
assert.equal(fromApplied.proposalId, 'p1');
assert.equal(changeCardInputFromResponse(response({ status: 'ok' })), null, 'una consulta no lleva tarjeta de cambio');
assert.equal(changeCardInputFromResponse(response({ status: 'ok', changes: [] })), null);
const fromPending = changeCardInputFromResponse(response({ status: 'pending_confirmation', activityId: undefined, actionId: 'act-8' }));
assert.equal(fromPending?.status, 'pending_confirmation');
assert.equal(fromPending?.actionId, 'act-8');
const fromError = changeCardInputFromResponse(response({ status: 'error', changes: [], error: { code: 'denied', message: 'Sin permiso.' } }));
assert.equal(fromError?.status, 'error');
assert.equal(fromError?.error?.message, 'Sin permiso.');
// Aplicado sin cambios reales (nada cambió): sin tarjeta de cambio.
assert.equal(changeCardInputFromResponse(response({ changes: [] })), null, 'aplicado sin ningún cambio: nada que mostrar');
assert.equal(buildChangeCardView(fromApplied!).rows[0].before, '80 %');

// ── 6. El componente pinta el modelo ───────────────────────────────────────────────────────────────────────────────────
const html = (input: ChangeCardInput, handlers: Partial<React.ComponentProps<typeof ChangeCard>> = {}) =>
  renderToStaticMarkup(React.createElement(ChangeCard, { input, ...handlers }));
const appliedHtml = html(applied, { onUndo: () => undefined });
assert.match(appliedHtml, /Cambio de distribuidora/);
assert.match(appliedHtml, /EDEESTE/);
assert.match(appliedHtml, /EDENORTE/);
assert.match(appliedHtml, /\$7,350\.00/);
assert.match(appliedHtml, />Deshacer</);
assert.doesNotMatch(appliedHtml, />Confirmar</);
assert.match(appliedHtml, /Se ajustó solo \(2\)/);
assert.match(appliedHtml, /El precio del kWh es el de referencia/);
assert.match(appliedHtml, /Cobertura objetivo/);
assert.doesNotMatch(html(applied), />Deshacer</, 'sin callback no hay botón');
const pendingHtml = html({ status: 'pending_confirmation', actionId: 'a', changes: [change('specs.saleMarginMultiplier', 'Factor de venta (margen)', 1.3, 1.45)] }, { onConfirm: () => undefined, onReject: () => undefined });
assert.match(pendingHtml, />Confirmar</);
assert.match(pendingHtml, />Rechazar</);
assert.doesNotMatch(pendingHtml, />Deshacer</);
const incompleteHtml = html({ status: 'applied', changes: [change('specs.panels', 'Paneles', [], [{ brandModel: 'Canadian 590 W', count: 10 }])], results: { before: complete(), after: incomplete } });
assert.match(incompleteHtml, /Falta el precio de Canadian 590 W/);
assert.doesNotMatch(incompleteHtml, /\$7,350|\$0\.00|0 kWp|0 kWh/, 'una propuesta incompleta no pinta cifras del motor ni ceros falsos');
assert.match(incompleteHtml, /Resultados pendientes/);
assert.match(html({ status: 'error', changes: [], error: { code: 'x', message: 'Algo falló.' } }), /role="alert"/);
assert.match(appliedHtml, /aria-label="[^"]*cambios/i, 'la tarjeta es una región con nombre');
// Avisos discretos: ni cajas grandes de color ni «warning» ruidoso; el aviso va en un ⓘ o en texto atenuado.
assert.doesNotMatch(appliedHtml, /bg-(red|amber|yellow|rose)-/, 'sin cajas de color');

console.log('PASS: tarjeta de cambio: formateo con unidades, derivados agrupados, resultados antes/después, «—» sin cifras si está incompleta y botones por estado.');
