import assert from 'node:assert/strict';
import { resolveProjectEquipment, supplierQuotesItem } from '../utils/equipmentMatchingUtils';
import type { SolarEquipmentItem } from '../types/equipment';

const item = (id: string, type: SolarEquipmentItem['type'], displayName: string, extra: Partial<SolarEquipmentItem> = {}) =>
  ({ id, type, displayName, brand: displayName.split(' ')[0], supplierPrices: [], ...extra }) as SolarEquipmentItem;
const catalog = [
  item('p1', 'panel', 'Canadian Solar 615W', { powerW: 615, supplierPrices: [{ id: 'sp-a', supplierName: 'Solar Dist', priceUSD: 90 } as any] }),
  item('p2', 'panel', 'Jinko Tiger 590W', { powerW: 590 }),
  item('i1', 'inverter', 'Luxpower LXP 8K', { powerKW: 8 }),
  item('b1', 'battery', 'Weco 5.12kWh', { capacityKWh: 5.12 }),
  item('b2', 'battery', 'HinaESS PowerGem Max', { capacityKWh: 16.08 }),
];

// Resolution cascade: exact name → assigned supplier offer → normalized name → HinaESS alias → spec tolerance → first of type.
assert.equal(resolveProjectEquipment(catalog, 'panel', 'Jinko Tiger 590W')?.id, 'p2');
assert.equal(resolveProjectEquipment(catalog, 'panel', 'Modelo desconocido', undefined, 'sp-a')?.id, 'p1');
assert.equal(resolveProjectEquipment(catalog, 'panel', 'jinko-tiger 590w')?.id, 'p2');
assert.equal(resolveProjectEquipment(catalog, 'battery', 'Batería Hina 16 KwH')?.id, 'b2');
assert.equal(resolveProjectEquipment(catalog, 'battery', 'Otra', 5.3)?.id, 'b1');
assert.equal(resolveProjectEquipment(catalog, 'panel', 'Otra', 612)?.id, 'p1');
assert.equal(resolveProjectEquipment(catalog, 'inverter', 'Otro', 20)?.id, 'i1', 'Falls back to the first item of the type');
assert.equal(resolveProjectEquipment([], 'panel', 'x'), undefined);

// A selected supplier quotes an item by offer id or by case/space-insensitive supplier name.
assert.equal(supplierQuotesItem(catalog[0], { supplierPriceId: 'sp-a', supplierName: 'Otro' }), true);
assert.equal(supplierQuotesItem(catalog[0], { supplierName: '  solar dist ' }), true);
assert.equal(supplierQuotesItem(catalog[0], { supplierName: 'Nadie' }), false);
assert.equal(supplierQuotesItem(catalog[0], undefined), false);
assert.equal(supplierQuotesItem(undefined, { supplierName: 'Solar Dist' }), false);
console.log('Project equipment resolution and supplier matching passed.');
