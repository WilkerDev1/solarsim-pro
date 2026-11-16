import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShard, selectShard } from '../../testShards.js';

const suites = Array.from({ length: 10 }, (_, index) => `src/tests/test${String(index).padStart(2, '0')}.ts`);

test('sin --shard se ejecutan todas las suites y se conservan los filtros', () => {
  assert.deepEqual(parseShard(['Tariff', 'Sync']), { shard: null, filters: ['Tariff', 'Sync'] });
});

test('--shard=i/n se separa de los filtros', () => {
  assert.deepEqual(parseShard(['--shard=2/3', 'Sync']), { shard: { index: 2, total: 3 }, filters: ['Sync'] });
});

test('un --shard inválido falla en lugar de ejecutar un subconjunto silencioso', () => {
  for (const value of ['--shard=0/3', '--shard=4/3', '--shard=1/0', '--shard=a/b', '--shard=1', '--shard=1.5/3']) {
    assert.throws(() => parseShard([value]), /shard/i, value);
  }
});

test('las particiones son disjuntas, cubren todas las suites y están equilibradas', () => {
  const total = 3;
  const parts = Array.from({ length: total }, (_, index) => selectShard(suites, { index: index + 1, total }));
  assert.deepEqual(parts.flat().sort(), [...suites].sort());
  assert.equal(new Set(parts.flat()).size, suites.length);
  const sizes = parts.map(part => part.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `tamaños desequilibrados: ${sizes.join(', ')}`);
});

test('la partición no depende del orden de entrada', () => {
  const shuffled = [...suites].reverse();
  assert.deepEqual(selectShard(shuffled, { index: 1, total: 3 }), selectShard(suites, { index: 1, total: 3 }));
});

test('una partición de 1/1 es la lista completa ordenada', () => {
  assert.deepEqual(selectShard([...suites].reverse(), { index: 1, total: 1 }), suites);
});
