import assert from 'node:assert/strict';
import { fitEquipment, matchEquipment, type EquipmentFitKind, type EquipmentMatchKind } from '../../shared/equipmentMatch';
import { inferBrandFromText } from '../../shared/equipmentBrands';
import { findCatalogMatchForVariant } from '../utils/equipmentMatchingUtils';
import type { SolarEquipmentItem } from '../types/equipment';

/**
 * Tabla de casos reales del emparejador: catálogo sintético con nombres de equipos del mercado dominicano, con y
 * sin `modelSeries`. Fija a la vez aciertos y rechazos para no arreglar un lado rompiendo el otro.
 */
let n = 0;
const eq = (type: SolarEquipmentItem['type'], brand: string, displayName: string, modelSeries: string, spec: number, extra: Partial<SolarEquipmentItem> = {}): SolarEquipmentItem =>
  ({ id: `${type}-${++n}`, type, brand, displayName, modelSeries, supplierPrices: [], createdAt: '', updatedAt: '',
    ...(type === 'panel' ? { powerW: spec } : type === 'inverter' ? { powerKW: spec } : { capacityKWh: spec }), ...extra }) as SolarEquipmentItem;

const C = {
  powerwall2: eq('battery', 'Tesla', 'Batería Tesla Powerwall 2', '', 13.5),
  powerwall3: eq('battery', 'Tesla', 'Batería Tesla Powerwall 3', '', 13.5),
  luna10: eq('battery', 'Huawei', 'Batería Huawei LUNA2000-10-S0', '', 10),
  luna15: eq('battery', 'Huawei', 'Batería Huawei LUNA2000-15-S0', '', 15),
  primo50: eq('inverter', 'Fronius', 'Inversor Fronius Primo 5.0-1', '', 5),
  primo82: eq('inverter', 'Fronius', 'Inversor Fronius Primo 8.2-1', '', 8.2),
  gw30: eq('inverter', 'GoodWe', 'Inversor GoodWe GW5000-MS-30', 'GW5000-MS-30', 5),
  gw20: eq('inverter', 'GoodWe', 'Inversor GoodWe GW5000-MS-20', 'GW5000-MS-20', 5),
  mp48: eq('inverter', 'Victron Energy', 'Inversor Victron MultiPlus 48/5000/70-50', 'MultiPlus 48/5000/70-50', 4),
  mp24: eq('inverter', 'Victron Energy', 'Inversor Victron MultiPlus 24/5000/120-50', 'MultiPlus 24/5000/120-50', 4),
  weco5: eq('inverter', 'WeCo', 'Inversor WeCo 5K', '5K', 5),
  weco5pro: eq('inverter', 'WeCo', 'Inversor WeCo 5K Pro', '5K', 5), // serie mal cargada: no contradice el «Pro» del nombre
  weco15: eq('inverter', 'WeCo', 'Inversor WeCo 15K', '', 15),
  deye8: eq('inverter', 'Deye', 'Inversor Híbrido Deye SUN-8K-SG04LP1', '', 8),
  lxp12: eq('inverter', 'LuxpowerTek', 'Inversor Luxpower LXP-12KW', '', 12),
  lux8: eq('inverter', 'LuxpowerTek', 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)', 'LXP-LB-US 8k', 8),
  solark: eq('inverter', 'Sol-Ark', 'Inversor Sol-Ark 15K-2P', '', 15),
  jinko550: eq('panel', 'Jinko Solar', 'Panel Jinko 550W', '', 550),
  jinko580: eq('panel', 'JinkoSolar', 'Panel Jinko Solar JKM580N-72HL4-BDV 580W', '', 580),
  cs550: eq('panel', 'Canadian Solar', 'Canadian Solar CS6W-550MB (550W)', 'CS6W-550MB', 550),
  ja550: eq('panel', 'JA Solar', 'Módulos JA Solar JAM72S30-550/MR (550W)', 'JAM72S30-550/MR', 550),
  longi: eq('panel', 'LONGi', 'LONGi LR5-72HPH-550M', 'LR5-72HPH-550M', 550),
  wecoBat: eq('battery', 'WeCo', 'Batería WeCo 16kWh', '', 16),
  weco1606: eq('battery', 'WeCo', 'Batería WeCo 16K0-LV (16.06kWh)', '16K0-LV', 16.06),
  hina: eq('battery', 'HinaESS', 'Batería Hinaess 16 KwH-48 vdc.', 'PowerGem Max', 16.08),
  pylon: eq('battery', 'Pylontech', 'Batería Pylontech US5000 100AH', 'US5000-100AH', 4.8, { capacityAh: 100 }),
};
const catalog = Object.values(C);
const key = (item?: SolarEquipmentItem) => Object.entries(C).find(([, v]) => v === item)?.[0];

type Row = [type: SolarEquipmentItem['type'], text: string, kind: EquipmentMatchKind, expected?: keyof typeof C | (keyof typeof C)[]];
const table: Row[] = [
  // Números cortos que distinguen variantes.
  ['battery', 'Tesla Powerwall 2', 'exact', 'powerwall2'],
  ['battery', 'Powerwall 3', 'exact', 'powerwall3'],
  ['battery', 'Tesla Powerwall', 'ambiguous', ['powerwall2', 'powerwall3']],
  ['battery', 'Huawei LUNA2000-10-S0', 'exact', 'luna10'],
  ['battery', 'LUNA2000-15-S0', 'exact', 'luna15'],
  ['battery', 'LUNA2000 S0', 'ambiguous', ['luna10', 'luna15']],
  ['inverter', 'Fronius Primo 5.0-1', 'exact', 'primo50'],
  ['inverter', 'Primo 8.2-1', 'exact', 'primo82'],
  ['inverter', 'Fronius Primo', 'ambiguous', ['primo50', 'primo82']],
  ['inverter', 'GoodWe GW5000-MS-30', 'exact', 'gw30'],
  ['inverter', 'GW5000-MS-20', 'exact', 'gw20'],
  ['inverter', 'Victron MultiPlus 48/5000/70-50', 'exact', 'mp48'],
  ['inverter', 'MultiPlus 24/5000/120-50', 'exact', 'mp24'],
  // «5K» frente a «5K Pro» y «15K».
  ['inverter', 'WeCo 5K', 'exact', 'weco5'],
  ['inverter', 'WeCo 5K Pro', 'exact', 'weco5pro'],
  ['inverter', 'WeCo 15K', 'exact', 'weco15'],
  // Con unidad: especificación.
  ['inverter', 'Deye SUN-8K 8kW', 'spec', 'deye8'],
  ['inverter', 'Deye SUN-8K-SG04LP1', 'exact', 'deye8'],
  // Búsquedas sin unidad.
  ['panel', 'Jinko 550', 'partial', 'jinko550'],
  ['inverter', 'LXP 12K', 'exact', 'lxp12'],
  ['battery', 'WeCo 16', 'partial', 'wecoBat'],
  ['inverter', 'Luxpower LXP-LB-US 8K', 'exact', 'lux8'],
  // Marcas compuestas.
  ['panel', 'JinkoSolar JKM580N-72HL4-BDV 580W', 'exact', 'jinko580'],
  ['panel', 'Jinko Solar JKM580N-72HL4-BDV', 'exact', 'jinko580'],
  ['inverter', 'SolArk 15K-2P', 'exact', 'solark'],
  ['inverter', 'Sol-Ark 15K-2P', 'exact', 'solark'],
  ['inverter', 'Lux Power LXP-12KW', 'exact', 'lxp12'],
  // Códigos con letras y cifras pegadas a la unidad.
  ['panel', 'Canadian Solar CS6W-550MB', 'exact', 'cs550'],
  ['panel', 'JA Solar JAM72S30-550/MR', 'exact', 'ja550'],
  ['panel', 'LONGi LR5-72HPH-550M 550W', 'exact', 'longi'],
  ['battery', 'Pylontech US5000-100AH', 'exact', 'pylon'],
  // Dos WeCo de ~16 kWh (16 y 16.06): por especificación es ambiguo, no se elige uno en silencio.
  ['battery', 'Batería WeCo 16 kWh', 'ambiguous', ['weco1606', 'wecoBat']],
  ['battery', 'Batería WeCo 16kWh', 'ambiguous', ['weco1606', 'wecoBat']],
  ['battery', 'WeCo 16K0-LV', 'exact', 'weco1606'],
  ['battery', 'HinaESS PowerGem Max', 'exact', 'hina'],
  // Rechazos.
  ['battery', 'Tesla Powerwall 4', 'none'],
  ['battery', 'LUNA2000-5-S0', 'none'],
  ['inverter', 'Fronius Primo 3.0-1', 'none'],
  ['inverter', 'GoodWe GW5000-MS-10', 'none'],
  ['inverter', 'MultiPlus 12/5000/70-50', 'none'],
  ['inverter', 'WeCo 25K', 'none'],
  ['inverter', 'Deye SUN-5K', 'none'],
  ['panel', 'Jinko 55', 'none'],
  ['panel', 'Jinko 5', 'none'],
  ['inverter', 'LXP 2K', 'none'],
  ['battery', 'WeCo 6', 'none'],
  ['inverter', 'Huawei SUN2000', 'none'],
];

const failures: string[] = [];
for (const [type, text, kind, expected] of table) {
  const result = matchEquipment({ type, text }, catalog);
  const got = result.kind === 'ambiguous' ? result.candidates.map(c => key(c.item)).sort() : key(result.item);
  const want = Array.isArray(expected) ? [...expected].sort() : expected;
  if (result.kind !== kind || JSON.stringify(got ?? null) !== JSON.stringify(want ?? null))
    failures.push(`${type} «${text}»: esperado ${kind} ${JSON.stringify(want ?? null)}, obtenido ${result.kind} ${JSON.stringify(got ?? null)} — ${result.reason}`);
}

// Por equipo (lo que mira el borrador): pedir la variante 2 nunca es «exacto» para la 3, y viceversa.
const pairs: [string, keyof typeof C, EquipmentFitKind][] = [
  ['Tesla Powerwall 2', 'powerwall3', 'none'], ['LUNA2000-10-S0', 'luna15', 'none'], ['Primo 5.0-1', 'primo82', 'none'],
  ['GW5000-MS-30', 'gw20', 'none'], ['MultiPlus 48/5000/70-50', 'mp24', 'none'], ['WeCo 5K', 'weco5pro', 'partial'], ['WeCo 5K', 'weco15', 'none'],
  ['Tesla Powerwall', 'powerwall2', 'partial'],
];
for (const [text, id, kind] of pairs) {
  const fit = fitEquipment({ type: C[id].type, text }, C[id]);
  if (fit.kind !== kind) failures.push(`fit «${text}» frente a ${id}: esperado ${kind}, obtenido ${fit.kind} — ${fit.reason}`);
}

// Ficha técnica (código de modelo aparte): la serie no basta si el nombre tiene una palabra distintiva más.
const sheet = (modelCode: string, brand: string, spec: Partial<SolarEquipmentItem>, items: SolarEquipmentItem[]) =>
  findCatalogMatchForVariant({ id: 'v', modelCode, displayName: 'x', ...spec } as never, items[0].type, brand, items);
const checks: [string, ReturnType<typeof sheet>, keyof typeof C | null, 'update' | 'review' | null][] = [
  ['5K vs 5K Pro (serie 5K)', sheet('5K', 'WeCo', { powerKW: 5 }, [C.weco5pro]), 'weco5pro', 'review'],
  ['5K vs 5K', sheet('5K', 'WeCo', { powerKW: 5 }, [C.weco5pro, C.weco5]), 'weco5', 'update'],
  ['LUNA2000-10-S0', sheet('LUNA2000-10-S0', 'Huawei', { capacityKWh: 10 }, [C.luna15, C.luna10]), 'luna10', 'update'],
  ['Powerwall 2 vs 3', sheet('Powerwall 2', 'Tesla', { capacityKWh: 13.5 }, [C.powerwall3]), 'powerwall3', 'review'],
  ['LXP-LB-US 8k', sheet('LXP-LB-US 8k', 'Luxpower', { powerKW: 8 }, [C.lux8]), 'lux8', 'update'],
  ['PowerGem Max', sheet('PowerGem Max', 'HinaESS', { capacityKWh: 16.08 }, [C.hina]), 'hina', 'update'],
];
for (const [label, result, id, action] of checks) {
  const got = result ? [key(result.matchedItem), result.score >= 0.95 ? 'update' : 'review'] : [null, null];
  if (JSON.stringify(got) !== JSON.stringify([id, action])) failures.push(`ficha ${label}: esperado ${id}/${action}, obtenido ${got.join('/')} (${result?.score})`);
}

// Marca inferida: la primera palabra válida, aunque haya cifras o adjetivos antes.
for (const [name, brand] of [
  ['Panel Bifacial 550W Astronergy', 'Astronergy'], ['Inversor Híbrido 10kW Sunsynk', 'Sunsynk'], ['Batería de Litio 15kWh Dyness', 'Dyness'],
  ['Inversor Híbrido 10K', 'General'], ['Batería China 5kWh', 'General'], ['Microinversor Hoymiles HM-800', 'Hoymiles'],
] as const) {
  const got = inferBrandFromText(name, '');
  if (got !== brand) failures.push(`marca de «${name}»: esperado ${brand}, obtenido ${got}`);
}

// --- Revisión final: marcas por subcadena, Ah, tensión, «watts», alias con guion, series de marketing, modelo pegado y desempate. ---
const R = {
  orion: eq('inverter', 'Orion', 'Inversor Orion 5kW', '', 5),
  solis: eq('inverter', 'Solis', 'Inversor Solis S6-GR1P5K 5kW', 'S6-GR1P5K', 5),
  canadian: eq('panel', 'Canadian Solar', 'Canadian Solar CS6W-550MB 550W', 'CS6W-550MB', 550),
  generic: eq('battery', 'Fabricante', 'Batería Lithium Iron Phosphate 5kWh', '', 5),
  dyness50: eq('battery', 'Dyness', 'Batería Dyness B4850 50Ah 2.4kWh', '', 2.4),
  ah100: eq('battery', 'Pylontech', 'Batería Pylontech US2000C', 'US2000C', 2.4, { capacityAh: 100 }),
  weco16: eq('battery', 'WeCo', 'Batería WeCo 16K0-LV 16 kWh', '16K0-LV', 16),
  growatt: eq('inverter', 'Growatt', 'Inversor Growatt MIN 6000TL-X 6 kilowatts', '', 6),
  lux10: eq('inverter', 'LuxpowerTek', 'Inversor LuxpowerTek LXP 10kW', '', 10),
  weco5k3: eq('battery', 'WeCo', 'Batería WeCo 5K3 Pro 5.3 kWh', '', 5.3),
  fusion: eq('inverter', 'Huawei', 'Huawei SUN2000-10KTL-M1 10kW', 'FusionSolar', 10),
  jam: eq('panel', 'JA Solar', 'JA Solar JAM72S30-550/MR 550W', 'JAM72S30', 550),
  deepblue: eq('panel', 'JA Solar', 'JA Solar DeepBlue 3.0 550W', '', 550),
};
const rkey = (item?: SolarEquipmentItem) => Object.entries(R).find(([, v]) => v === item)?.[0];
const review: [label: string, got: string, want: string][] = [];
const expectMatch = (label: string, request: Parameters<typeof matchEquipment>[0], items: SolarEquipmentItem[], kind: EquipmentMatchKind, id?: keyof typeof R) => {
  const result = matchEquipment(request, items);
  review.push([label, `${result.kind} ${rkey(result.item) ?? '-'}`, `${kind} ${id ?? '-'}`]);
};
// 1. Marcas: subcadenas de 3+ letras no son la misma marca.
expectMatch('marca Ion vs Orion', { type: 'inverter', brand: 'Ion', magnitude: 5 }, [R.orion], 'none');
expectMatch('marca Sol vs Solis', { type: 'inverter', brand: 'Sol', magnitude: 5 }, [R.solis], 'none');
expectMatch('marca Solar vs Canadian Solar', { type: 'panel', brand: 'Solar', magnitude: 550 }, [R.canadian], 'none');
expectMatch('marca Solis vs Solis', { type: 'inverter', brand: 'SOLIS', magnitude: 5 }, [R.solis], 'spec', 'solis');
expectMatch('marca Canadian vs Canadian Solar', { type: 'panel', brand: 'Canadian', magnitude: 550 }, [R.canadian], 'spec', 'canadian');
// 2. Inferencia con palabra completa: «phosphate» no es Growatt (sph) ni «Lithium Iron» Ion Energy.
review.push(['marca de «Lithium Iron Phosphate»', inferBrandFromText(R.generic.displayName, ''), 'General']);
review.push(['marca de «Pylontech Force H2»', inferBrandFromText('Batería Force H2 7.1kWh', ''), 'Pylontech']);
// 3. Amperios-hora: leídos del nombre si falta el campo; «100Ah» solo es especificación válida.
expectMatch('Dyness 100Ah vs 50Ah', { type: 'battery', text: 'Dyness B4850 100Ah 2.4kWh' }, [R.dyness50], 'none');
expectMatch('Dyness 50Ah', { type: 'battery', text: 'Dyness B4850 50Ah 2.4kWh' }, [R.dyness50], 'exact', 'dyness50');
expectMatch('solo 100Ah', { type: 'battery', text: 'Batería 100Ah' }, [R.ah100], 'spec', 'ah100');
expectMatch('solo 50Ah vs 100Ah', { type: 'battery', text: 'Batería 50Ah' }, [R.ah100], 'none');
// 4. Tensión en el pedido (texto y modelo).
expectMatch('WeCo 48V en el pedido', { type: 'battery', text: 'Batería WeCo 16K0-LV 48V 16 kWh' }, [R.weco16], 'exact', 'weco16');
expectMatch('WeCo 48V en el modelo', { type: 'battery', brand: 'WeCo', model: '16K0-LV 48V', magnitude: 16 }, [R.weco16], 'exact', 'weco16');
// 5. «kilowatts», «Growatt» y «Lux Power Tek».
expectMatch('6 kilowatts', { type: 'inverter', text: 'Growatt MIN 6000TL-X 6 kilowatts' }, [R.growatt], 'exact', 'growatt');
expectMatch('Growatt sin «grow»', { type: 'inverter', text: 'Growatt MIN 6000TL-X' }, [R.growatt], 'exact', 'growatt');
expectMatch('Lux Power Tek', { type: 'inverter', text: 'Lux Power Tek LXP 10kW' }, [R.lux10], 'exact', 'lux10');
// 6. Alias con guion.
expectMatch('We-Co', { type: 'battery', text: 'We-Co 5K3 Pro 5.3 kWh' }, [R.weco5k3], 'exact', 'weco5k3');
// 7. Serie de marketing que no está en el nombre.
expectMatch('serie FusionSolar', { type: 'inverter', text: 'Huawei SUN2000-10KTL-M1 10kW' }, [R.fusion], 'exact', 'fusion');
// 8. Modelo pegado en `model` igual que en `text`.
expectMatch('model 5K3Pro', { type: 'battery', brand: 'WeCo', model: '5K3Pro', magnitude: 5.3 }, [R.weco5k3], 'exact', 'weco5k3');
expectMatch('text 5K3Pro', { type: 'battery', text: 'WeCo 5K3Pro 5.3 kWh' }, [R.weco5k3], 'exact', 'weco5k3');
// 9. Desempate por modelo compatible.
// El código es la serie de JAM72S30-550/MR, no su nombre completo: gana como compatible (por especificación), no exacto.
expectMatch('JAM72S30 550', { type: 'panel', brand: 'JA Solar', model: 'JAM72S30', magnitude: 550 }, [R.jam, R.deepblue], 'spec', 'jam');
expectMatch('JAM72S30 sin magnitud', { type: 'panel', model: 'JAM72S30' }, [R.deepblue, R.jam], 'partial', 'jam');
expectMatch('JAM72S30-550/MR', { type: 'panel', brand: 'JA Solar', model: 'JAM72S30-550/MR', magnitude: 550 }, [R.deepblue, R.jam], 'exact', 'jam');
for (const [label, got, want] of review) if (got !== want) failures.push(`${label}: esperado ${want}, obtenido ${got}`);

assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
console.log(`Equipment matcher case table: ${table.length + pairs.length + checks.length + 6 + review.length} real cases passed.`);
