// F2b: estado «incompleta» (ADR 0009). Lo que antes impedía crear una propuesta es un estado derivado: si faltan los mínimos
// para calcular, `proposalCompleteness` dice por qué (en español), los resultados no se muestran (nunca en cero) y no se
// puede exportar el PDF, compartir ni convertir a cotización. Una propuesta completa no cambia en nada.
import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { proposalActionBlock, proposalCompleteness, proposalResults } from '../domain/proposalCompleteness';
import { editEquipmentGroup } from '../utils/equipmentGroups';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { createQuotationFromProposal } from '../features/quotations/proposalConversion';
import { EMPTY_UNDO_HISTORY } from '../store/undo/projectUndoJournal';
import { DEFAULT_RD_TARIFF_MATRIX, referenceBillingTariff } from '../data/rdTariffs';
import { ALL_CONVERSION_BLOCKS } from '../features/quotations/proposalSource';
import type { ProjectSimulation } from '../types';

const base = (): ProjectSimulation => ({ ...structuredClone(BENCHMARK_PROJECT), id: 'complete-base' });
const codes = (p: ProjectSimulation) => proposalCompleteness(p).reasons.map((r) => r.code);

// 1. Completa: el caso de referencia (y cualquier propuesta con los mínimos) no cambia en nada.
const complete = base();
assert.deepEqual(proposalCompleteness(complete), { incomplete: false, reasons: [] });
const results = proposalResults(complete);
assert.equal(results.incomplete, false);
assert.deepEqual(results.summary, calculateProjectFinancialSummary(complete), 'los resultados son los del motor, tal cual');
assert.deepEqual(proposalActionBlock(complete), { blocked: false, reason: null });

// 2. Cada mínimo que falta da su motivo.
const without = (edit: (p: ProjectSimulation) => void) => { const p = base(); edit(p); return p; };
assert.deepEqual(codes(without((p) => { p.monthlyConsumption = []; })), ['missing_consumption'], 'sin consumo (el motor asumiría 36.000 kWh/año)');
assert.deepEqual(codes(without((p) => { p.monthlyConsumption = Array(12).fill(0); })), ['missing_consumption']);
assert.deepEqual(codes(without((p) => { p.monthlyConsumption = [100, 200]; })), ['missing_consumption'], 'menos de doce meses');
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { powerW: 0 } }) }; })), ['missing_panel']);
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { count: 0 } }) }; })), ['missing_panel']);
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, inverters: [] }; })), ['missing_inverter']);
assert.deepEqual(codes(without((p) => { p.rates = { ...p.rates, energyCostPerKWh: 0 }; })), ['missing_energy_price']);
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'inverter', { type: 'update', index: 0, patch: { unitPriceUSD: undefined } }) }; })), ['missing_equipment_price']);
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'battery', { type: 'update', index: 0, patch: { unitPriceUSD: 0 } }) }; })), ['missing_equipment_price'], 'una batería en uso sin precio');
// Una batería apagada no está en uso: su precio no cuenta.
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, hasBattery: false, ...editEquipmentGroup(p.specs, 'battery', { type: 'update', index: 0, patch: { unitPriceUSD: 0 } }) }; })), []);
// En precio directo ($/W) los costos unitarios no fijan el precio: no se exigen.
assert.deepEqual(codes(without((p) => { p.specs = { ...p.specs, pricingMode: 'direct_watt', pricePerWattUSD: 1.2, ...editEquipmentGroup(p.specs, 'inverter', { type: 'update', index: 0, patch: { unitPriceUSD: undefined } }) }; })), []);
// Con la fila de la tarifa (factura por bloques) el precio escalar no es el único dato de energía.
assert.deepEqual(codes(without((p) => { p.rates = { ...p.rates, energyCostPerKWh: 0, billingTariff: referenceBillingTariff(DEFAULT_RD_TARIFF_MATRIX, p.rates.distributor!, p.rates.tariffCode!) }; })), []);
// Varios motivos a la vez, cada uno con su texto en español y la ruta del registro donde se corrige.
const many = proposalCompleteness(without((p) => { p.monthlyConsumption = []; p.specs = { ...p.specs, inverters: [] }; p.rates = { ...p.rates, energyCostPerKWh: 0 }; }));
assert.equal(many.incomplete, true);
assert.deepEqual(many.reasons.map((r) => r.code), ['missing_consumption', 'missing_inverter', 'missing_energy_price']);
for (const reason of many.reasons) {
  assert.match(reason.message, /^[A-ZÁÉÍÓÚÑ¿]/, 'mensaje en español, con mayúscula');
  assert.ok(reason.path, 'cada motivo dice dónde se corrige');
}
const unpricedInverter = proposalCompleteness(without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'inverter', { type: 'update', index: 0, patch: { unitPriceUSD: undefined } }) }; }));
assert.match(unpricedInverter.reasons[0].message, /Inversor Lux Power/, 'el motivo nombra el equipo sin precio');

// 3. Incompleta ⇒ sin métricas (nunca ceros) y acciones bloqueadas con su motivo.
const incomplete = without((p) => { p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { unitPriceUSD: undefined } }) }; });
const pending = proposalResults(incomplete);
assert.equal(pending.incomplete, true);
assert.equal(pending.summary, null, 'los resultados se muestran vacíos, no en cero');
assert.ok(pending.reasons.length > 0);
const block = proposalActionBlock(incomplete);
assert.equal(block.blocked, true);
assert.match(block.reason!, /Completa la propuesta/);

// 4. Las acciones lo respetan también fuera de los botones: convertir a cotización y compartir.
store.setState({
  projects: [incomplete, { ...complete, id: 'complete-ok' }], activeProjectId: incomplete.id, activeView: 'project-hub', workspaceScope: 'local',
  undoHistory: EMPTY_UNDO_HISTORY, isShareModalOpen: false, saveFeedbackMessage: null,
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
});
const converted = createQuotationFromProposal(incomplete.id, ALL_CONVERSION_BLOCKS);
assert.equal(converted.ok, false);
assert.match((converted as { error: string }).error, /incompleta/i);
store.getState().openShareModal();
assert.equal(store.getState().isShareModalOpen, false, 'una propuesta incompleta no se comparte');
assert.match(store.getState().saveFeedbackMessage ?? '', /incompleta/i);
store.setState({ activeProjectId: 'complete-ok', saveFeedbackMessage: null });
store.getState().openShareModal();
assert.equal(store.getState().isShareModalOpen, true, 'una completa se comparte como siempre');

console.log('PASS: propuesta incompleta: motivos en español, resultados vacíos (no en cero) y PDF, compartir y cotización bloqueados; una completa no cambia.');
