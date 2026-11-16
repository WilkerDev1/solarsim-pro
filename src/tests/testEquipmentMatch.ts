import assert from 'node:assert/strict';
import { matchEquipment, fitEquipment, magnitudesMatch } from '../../shared/equipmentMatch';
import { normalizeProposalDraft, requestedModelMatches } from '../../shared/aiProposal';
import { findCatalogMatchForVariant } from '../utils/equipmentMatchingUtils';
import type { SolarEquipmentItem } from '../types/equipment';

const row = (id: string, type: SolarEquipmentItem['type'], brand: string, displayName: string, modelSeries: string, extra: Partial<SolarEquipmentItem>): SolarEquipmentItem =>
  ({ id, type, brand, displayName, modelSeries, supplierPrices: [], createdAt: '', updatedAt: '', ...extra }) as SolarEquipmentItem;

const weco = row('bat-weco', 'battery', 'WeCo', 'Batería WeCo 16K0-LV (16.06kWh)', '16K0-LV', { capacityKWh: 16.06, capacityAh: 314, voltageV: 51.2 });
const wecoSmall = row('bat-weco-5', 'battery', 'WeCo', 'Batería WeCo 5K3-LV (5.12kWh)', '5K3-LV', { capacityKWh: 5.12 });
const hina = row('bat-hina', 'battery', 'HinaESS', 'Batería HinaESS PowerGem Max (16.08kWh)', 'PowerGem Max', { capacityKWh: 16.08 });
const inv5 = row('inv-5k', 'inverter', 'WeCo', 'Inversor Híbrido WeCo 5K', '5K', { powerKW: 5 });
const inv5Pro = row('inv-5k-pro', 'inverter', 'WeCo', 'Inversor Híbrido WeCo 5K Pro', '5K Pro', { powerKW: 5 });
const inv15 = row('inv-15k', 'inverter', 'WeCo', 'Inversor Híbrido WeCo 15K', '15K', { powerKW: 15 });
const lux10 = row('inv-lux-10', 'inverter', 'LuxpowerTek', 'Inversor Híbrido LuxpowerTek SNA 10K', 'SNA 10K', { powerKW: 10 });
const panel630 = row('p-ja-630', 'panel', 'JA Solar', 'JA Solar JAM66D45-630/LB', 'JAM66D45-630/LB', { powerW: 630 });
const panel630b = row('p-ja-630-mb', 'panel', 'JA Solar', 'JA Solar JAM72D40-630/MB', 'JAM72D40-630/MB', { powerW: 630 });
const catalog = [weco, wecoSmall, hina, inv5, inv5Pro, inv15, lux10, panel630, panel630b];

// --- Caso WeCo: «Batería WeCo 16 kWh» es la WeCo 16K0-LV de 16.06 kWh (antes: falso «no coincide»). ---
for (const text of ['Batería WeCo 16 kWh', 'Bateria Weco 16.0 kwh', 'batería weco 16kWh']) {
  const fit = fitEquipment({ type: 'battery', text }, weco);
  assert.equal(fit.fits, true, `${text}: ${fit.reason}`);
  assert.equal(fit.kind, 'spec', 'marca y capacidad coinciden; el código del modelo no se pidió');
  const result = matchEquipment({ type: 'battery', text }, catalog);
  assert.equal(result.kind, 'spec', `${text}: ${result.reason}`);
  assert.equal(result.item?.id, 'bat-weco');
  assert.match(result.reason, /16\.06 kWh/);
}
assert(requestedModelMatches('Bateria Weco 16.0 kwh', weco), 'el envoltorio heredado usa el mismo emparejador');
assert.equal(matchEquipment({ type: 'battery', text: 'WeCo 16K0-LV' }, catalog).kind, 'exact');
// Capacidad numérica del esquema (requestedCapacityKWh) con la misma tolerancia que el texto.
assert(magnitudesMatch('battery', 16, 16.06));
assert(!magnitudesMatch('battery', 15, 16.06));
assert(!magnitudesMatch('panel', 620, 630), '620 W no es 630 W');
assert(magnitudesMatch('panel', 630, 630.5));

// Explicable: marca distinta, unidad equivocada o capacidad distinta dicen por qué.
const otherBrand = fitEquipment({ type: 'battery', text: 'Batería HinaESS 16 kWh' }, weco);
assert.equal(otherBrand.fits, false);
assert.match(otherBrand.reason, /hinaess/i);
const wrongUnit = fitEquipment({ type: 'battery', text: 'Batería WeCo 16 kW' }, weco);
assert.equal(wrongUnit.fits, false);
assert.match(wrongUnit.reason, /kW/);
const wrongCapacity = fitEquipment({ type: 'battery', text: 'Batería WeCo 10 kWh' }, weco);
assert.equal(wrongCapacity.fits, false);
assert.match(wrongCapacity.reason, /10 kWh.*16\.06 kWh/);
assert.equal(matchEquipment({ type: 'battery', text: 'Batería WeCo 10 kWh' }, catalog).kind, 'none');
assert.equal(fitEquipment({ type: 'inverter', text: 'Batería WeCo 16 kWh' }, weco).fits, false, 'tipo distinto');

// --- Ambigüedades reales. ---
// «5K» frente a «5K Pro»: el nombre corto es exacto; el Pro tiene una palabra que no se pidió.
const fiveK = matchEquipment({ type: 'inverter', text: 'Inversor WeCo 5K' }, catalog);
assert.equal(fiveK.kind, 'exact', fiveK.reason);
assert.equal(fiveK.item?.id, 'inv-5k');
assert.equal(fitEquipment({ type: 'inverter', text: 'Inversor WeCo 5K' }, inv15).fits, false, '5K no está dentro de 15K');
const fivePro = matchEquipment({ type: 'inverter', text: 'WeCo 5K Pro' }, catalog);
assert.equal(fivePro.kind, 'exact');
assert.equal(fivePro.item?.id, 'inv-5k-pro');
assert.equal(fitEquipment({ type: 'inverter', text: 'WeCo 5K Pro' }, inv5).fits, false, 'Pro pedido explícitamente');
// Dos modelos de la misma potencia y marca: ambiguo, con ambos candidatos.
const fiveKW = matchEquipment({ type: 'inverter', text: 'inversor híbrido WeCo 5 kW' }, catalog);
assert.equal(fiveKW.kind, 'ambiguous', fiveKW.reason);
assert.deepEqual(fiveKW.candidates.map(c => c.item.id).sort(), ['inv-5k', 'inv-5k-pro']);
assert.match(fiveKW.reason, /5K Pro/);
const panels = matchEquipment({ type: 'panel', text: 'Panel JA Solar 630 W' }, catalog);
assert.equal(panels.kind, 'ambiguous');
assert.equal(matchEquipment({ type: 'panel', text: 'JA Solar JAM66D45-630/LB' }, catalog).item?.id, 'p-ja-630');
// «inversor híbrido 10 kW» sin marca: un único 10 kW en el catálogo.
const hybrid10 = matchEquipment({ type: 'inverter', text: 'inversor híbrido 10 kW' }, catalog);
assert.equal(hybrid10.kind, 'spec');
assert.equal(hybrid10.item?.id, 'inv-lux-10');
assert.equal(matchEquipment({ type: 'inverter', text: 'Luxpower 10kW' }, catalog).item?.id, 'inv-lux-10', 'alias Luxpower → LuxpowerTek');
assert.equal(matchEquipment({ type: 'inverter', text: 'Deye 5K' }, catalog).kind, 'none');
assert.equal(matchEquipment({ type: 'battery', text: 'Batería 16 kWh' }, catalog).kind, 'ambiguous', 'WeCo y HinaESS de ~16 kWh');

// --- Consumidor: el borrador de propuesta ya no marca la WeCo 16 kWh como desajuste. ---
const draft = normalizeProposalDraft({
  clientName: 'Cliente', distributor: 'EDESUR', tariffCode: 'BTS1', monthlyConsumptionKWh: Array(12).fill(500), consumptionSource: 'observed',
  panels: [{ equipmentId: 'p-ja-630', quantity: 10 }], inverters: [{ equipmentId: 'inv-5k', quantity: 1, requestedModel: 'Inversor WeCo 5K' }],
  batteries: [{ equipmentId: 'bat-weco', quantity: 2, requestedModel: 'Bateria Weco 16.0 kwh', requestedCapacityKWh: 16 }], hasBattery: true,
}, catalog, {});
const codes = (draft.validationIssues || []).map(i => i.code);
assert(!codes.includes('requested_battery_model_mismatch'), JSON.stringify(draft.validationIssues));
assert(!codes.includes('requested_battery_mismatch'));
assert(!codes.includes('requested_inverter_model_mismatch'));
// Un pedido que casa con dos modelos queda «por confirmar», no bloquea.
const ambiguous = normalizeProposalDraft({
  clientName: 'Cliente', distributor: 'EDESUR', tariffCode: 'BTS1', monthlyConsumptionKWh: Array(12).fill(500), consumptionSource: 'observed',
  panels: [{ equipmentId: 'p-ja-630', quantity: 10 }], inverters: [{ equipmentId: 'inv-5k-pro', quantity: 1, requestedModel: 'Inversor WeCo 5 kW' }], batteries: [],
}, catalog, {});
const ambiguity = ambiguous.validationIssues?.find(i => i.code === 'requested_inverter_model_ambiguous');
assert.equal(ambiguity?.severity, 'warning');
assert.match(ambiguity!.message, /WeCo 5K/);
// Un modelo distinto sigue bloqueando.
const wrong = normalizeProposalDraft({
  clientName: 'Cliente', distributor: 'EDESUR', tariffCode: 'BTS1', monthlyConsumptionKWh: Array(12).fill(500), consumptionSource: 'observed',
  panels: [{ equipmentId: 'p-ja-630', quantity: 10 }], inverters: [{ equipmentId: 'inv-5k', quantity: 1 }],
  batteries: [{ equipmentId: 'bat-hina', quantity: 1, requestedModel: 'Batería WeCo 16 kWh' }], hasBattery: true,
}, catalog, {});
const mismatch = wrong.validationIssues?.find(i => i.code === 'requested_battery_model_mismatch');
assert.equal(mismatch?.severity, 'error');
assert.match(mismatch!.message, /weco/i);

// --- Consumidor: la ficha técnica usa el mismo emparejador (16.0 kWh escaneado frente a 16.06 del inventario). ---
const scanned = findCatalogMatchForVariant({ id: 'v', modelCode: '16K0-LV', displayName: 'WeCo 16K0-LV', capacityKWh: 16.06 }, 'battery', 'WeCo', catalog);
assert.equal(scanned?.matchedItem.id, 'bat-weco');
assert(scanned!.score >= 0.95);
const byCapacity = findCatalogMatchForVariant({ id: 'v', modelCode: '', displayName: 'WeCo 16 kWh', capacityKWh: 16 }, 'battery', 'WeCo', catalog);
assert.equal(byCapacity?.matchedItem.id, 'bat-weco');
assert(byCapacity!.score < 0.95, 'por especificación no se actualiza sin revisar');

console.log('Equipment matcher passed.');
