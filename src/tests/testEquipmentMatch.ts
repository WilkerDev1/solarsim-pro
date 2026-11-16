import assert from 'node:assert/strict';
import { matchEquipment, fitEquipment, magnitudesMatch } from '../../shared/equipmentMatch';
import { normalizeProposalDraft, requestedModelMatches } from '../../shared/aiProposal';
import { findCatalogMatchForVariant } from '../utils/equipmentMatchingUtils';
import { inferBrandFromText } from '../../shared/equipmentBrands';
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

// --- Revisión: fronteras de código, unidades pegadas a códigos, coincidencias parciales, marcas y desempates. ---
{
  // 1. Un código de modelo solo es exacto con fronteras alfanuméricas: «5K» no está en «15K» ni es «5K Pro».
  const scannedFive = { id: 'v', modelCode: '5K', displayName: 'Inversor WeCo 5K', powerKW: 5 };
  const onlyPro = findCatalogMatchForVariant(scannedFive, 'inverter', 'WeCo', [inv5Pro]);
  assert(!onlyPro || onlyPro.score < 0.95, `5K frente a 5K Pro no actualiza sin revisión (${onlyPro?.score})`);
  assert.equal(findCatalogMatchForVariant({ ...scannedFive, displayName: 'x' }, 'inverter', 'WeCo', [inv5Pro, inv5])?.matchedItem.id, 'inv-5k');
  assert.equal(findCatalogMatchForVariant({ id: 'v', modelCode: '5K Pro', displayName: 'x', powerKW: 5 }, 'inverter', 'WeCo', [inv5, inv5Pro])?.matchedItem.id, 'inv-5k-pro');
  assert.equal(fitEquipment({ type: 'inverter', brand: 'WeCo', model: '5K' }, inv15).modelMatch, undefined, '5K no está dentro de 15K');
  assert.equal(fitEquipment({ type: 'inverter', brand: 'WeCo', model: '15K' }, inv5).modelMatch, undefined, '15K no contiene 5K como modelo');
  assert.equal(fitEquipment({ type: 'inverter', brand: 'WeCo', model: '5K' }, inv5Pro).modelMatch, 'compatible');
  assert.equal(fitEquipment({ type: 'inverter', brand: 'WeCo', model: '5K' }, inv5).modelMatch, 'exact');
  assert.equal(fitEquipment({ type: 'inverter', text: 'WeCo SUN-15K' }, inv5).fits, false);
  // Un código del texto cuyo token está pegado a otro dígito no cubre el nombre del equipo.
  assert.notEqual(fitEquipment({ type: 'inverter', text: 'WeCo X15K-A' }, inv5).kind, 'exact');

  // 2. Unidades solo con frontera: «CS6W-550MB» es un código, no 6 W.
  const real = [
    row('cs6w', 'panel', 'Canadian Solar', 'Canadian Solar CS6W-550MB (550W)', 'CS6W-550MB', { powerW: 550 }),
    row('jam72', 'panel', 'JA Solar', 'Módulos JA Solar JAM72S30-550/MR (550W)', 'JAM72S30-550/MR', { powerW: 550 }),
    row('lr5', 'panel', 'LONGi', 'LONGi LR5-72HPH-550M', 'LR5-72HPH-550M', { powerW: 550 }),
    row('deye', 'inverter', 'Deye', 'Inversor Deye SUN-10K-SG04LP3', 'SUN-10K-SG04LP3', { powerKW: 10 }),
    row('pylon', 'battery', 'Pylontech', 'Batería Pylontech US5000 100AH', 'US5000-100AH', { capacityKWh: 4.8, capacityAh: 100 }),
  ];
  for (const [text, id] of [['Canadian Solar CS6W-550MB', 'cs6w'], ['JA Solar JAM72S30-550/MR', 'jam72'], ['LONGi LR5-72HPH-550M 550W', 'lr5'],
    ['Deye SUN-10K-SG04LP3', 'deye'], ['Pylontech US5000-100AH', 'pylon'], ['CS6W-550MB', 'cs6w']] as const) {
    const type = real.find(r => r.id === id)!.type;
    const result = matchEquipment({ type, text }, real);
    assert.equal(result.item?.id, id, `${text}: ${result.reason}`);
    assert.equal(result.kind, 'exact', `${text} es el modelo exacto: ${result.reason}`);
  }
  // Una unidad pegada a una palabra sí se lee («Solar630W», «HinaESS15kW»), pero no a un código.
  assert(fitEquipment({ type: 'panel', text: 'JA Solar630W' }, panel630).fits);
  assert(!fitEquipment({ type: 'battery', text: 'HinaESS15kW' }, hina).fits);

  // 3. Coincidencia parcial (sin especificación ni nombre completo) es un resultado propio, no «por especificación».
  const onlyProCatalog = [inv5Pro];
  const partial = matchEquipment({ type: 'inverter', text: 'WeCo 5K' }, onlyProCatalog);
  assert.equal(partial.kind, 'partial', partial.reason);
  const huawei = row('hw', 'inverter', 'Huawei', 'Huawei SUN2000-10KTL', 'SUN2000-10KTL', { powerKW: 10 });
  assert.equal(matchEquipment({ type: 'inverter', text: 'Huawei' }, [huawei]).kind, 'partial');
  const partialDraft = normalizeProposalDraft({
    clientName: 'Cliente', distributor: 'EDESUR', tariffCode: 'BTS1', monthlyConsumptionKWh: Array(12).fill(500), consumptionSource: 'observed',
    panels: [{ equipmentId: 'p-ja-630', quantity: 10 }], inverters: [{ equipmentId: 'inv-5k-pro', quantity: 1, requestedModel: 'WeCo 5K' }], batteries: [],
  }, [panel630, inv5Pro], {});
  const partialIssue = partialDraft.validationIssues?.find(i => i.code === 'requested_inverter_model_partial');
  assert.equal(partialIssue?.severity, 'warning', JSON.stringify(partialDraft.validationIssues));

  // 5. Marcas: genéricas no descartan, alias en ambos lados, inferencia sin adjetivos ni «China».
  const cs = real[0];
  assert(fitEquipment({ type: 'panel', brand: 'Fabricante', magnitude: 550 }, cs).fits, '«Fabricante» es marca desconocida');
  assert(fitEquipment({ type: 'panel', brand: 'Desconocido', magnitude: 550 }, cs).fits);
  assert(fitEquipment({ type: 'panel', text: 'CanadianSolar 550W' }, cs).fits);
  assert(fitEquipment({ type: 'panel', text: 'Canadian-Solar 550W' }, cs).fits);
  const victron = row('vic', 'inverter', 'Victron', 'Victron MultiPlus-II 5000', 'MultiPlus-II', { powerKW: 5 });
  assert(fitEquipment({ type: 'inverter', text: 'Victron Energy 5 kW' }, victron).fits, 'Victron ↔ Victron Energy');
  assert(fitEquipment({ type: 'inverter', brand: 'Victron Energy', magnitude: 5 }, victron).fits);
  assert(fitEquipment({ type: 'battery', text: 'Hina 16 kWh' }, hina).fits, 'Hina ↔ HinaESS');
  assert(fitEquipment({ type: 'inverter', text: 'Lux 10 kW' }, lux10).fits, 'Lux ↔ LuxpowerTek');
  assert(fitEquipment({ type: 'inverter', brand: 'Lux', magnitude: 10 }, lux10).fits);
  const inferred = (displayName: string) => inferBrandFromText(displayName, '');
  assert.equal(inferred('Inversor Fronius Primo 5.0'), 'Fronius');
  assert.equal(inferred('Inversor Híbrido Fronius Symo'), 'Fronius');
  assert.equal(inferred('Inversor SMA Sunny Boy 5.0'), 'SMA');
  assert.equal(inferred('Microinversor Hoymiles HM-800'), 'Hoymiles');
  assert.equal(inferred('Inversor GoodWe GW5K-DT'), 'GoodWe');
  assert.equal(inferred('Inversor SolarEdge SE5000H'), 'SolarEdge');
  assert.equal(inferred('Inversor Híbrido 10K'), 'General', 'un adjetivo no es una marca');
  assert.equal(inferred('Inversor Trifásico 20K'), 'General');
  assert.equal(inferred('Batería China 5kWh'), 'General', '«China» no es HinaESS');
  assert.equal(inferred('Batería Hina 5kWh'), 'HinaESS');
  // Un equipo con marca genérica y nombre sin marca no se empareja por una marca inventada.
  const generic = row('gen', 'inverter', 'Fabricante', 'Inversor Híbrido 10K', '10K', { powerKW: 10 });
  assert.equal(fitEquipment({ type: 'inverter', text: 'Híbrido 10 kW' }, generic).brandMatch, undefined);

  // 6. Mismo nivel de coincidencia: gana la potencia más cercana.
  const t622 = row('t622', 'panel', 'Trina Solar', 'Trina Vertex 622W', 'Vertex 622', { powerW: 622 });
  const t620 = row('t620', 'panel', 'Trina Solar', 'Trina Vertex 620W', 'Vertex 620', { powerW: 620 });
  assert.equal(findCatalogMatchForVariant({ id: 'v', modelCode: '', displayName: 'x', powerW: 620 }, 'panel', 'Trina', [t622, t620])?.matchedItem.id, 't620');
  assert.equal(findCatalogMatchForVariant({ id: 'v', modelCode: '', displayName: 'x', powerW: 621.5 }, 'panel', 'Trina', [t620, t622])?.matchedItem.id, 't622');
}

console.log('Equipment matcher passed.');
