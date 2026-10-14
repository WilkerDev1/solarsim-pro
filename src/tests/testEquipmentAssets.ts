import assert from 'node:assert/strict';
import { fetchEquipmentAsset, uploadEquipmentAsset, validateEquipmentAsset } from '../services/equipmentAssetService';

const originalFetch = globalThis.fetch;
let requests = 0;
try {
  const pdf = new File(['%PDF-1.7 test'], 'fixture.pdf', { type: 'application/pdf' });
  assert.throws(() => validateEquipmentAsset(new File(['x'], 'unsafe.svg', { type: 'image/svg+xml' }), 'image'), /Formato/);
  assert.throws(() => validateEquipmentAsset(pdf, 'image'), /Formato/);
  assert.throws(() => validateEquipmentAsset(new File([], 'empty.pdf', { type: 'application/pdf' }), 'datasheet'), /contenido/);
  assert.throws(() => validateEquipmentAsset(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' }), 'datasheet'), /8 MB/);
  await assert.rejects(uploadEquipmentAsset('https://qa.example.invalid', '', pdf, 'datasheet'), /sesión/);
  globalThis.fetch = async (url, init) => {
    requests++;
    assert.equal(String(url), 'https://qa.example.invalid/api/equipment-assets');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic');
    assert.equal(new Headers(init?.headers).get('Content-Type'), null, 'Browser chooses multipart boundary');
    const form = init?.body as FormData;
    assert.equal(form.get('kind'), 'datasheet');
    assert.equal((form.get('file') as File).name, 'fixture.pdf');
    return new Response(JSON.stringify({ success: true, asset: { id: 'shared-fixture', name: 'fixture.pdf', kind: 'datasheet' } }));
  };
  const first = await uploadEquipmentAsset('https://qa.example.invalid/', 'synthetic', pdf, 'datasheet');
  assert.equal(first.id, 'shared-fixture');
  assert.equal(requests, 1);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Permisos insuficientes' }), { status: 403 });
  await assert.rejects(uploadEquipmentAsset('https://qa.example.invalid', 'synthetic', pdf, 'datasheet'), /Permisos insuficientes/);
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://qa.example.invalid/api/equipment-assets/asset%2Fencoded');
    assert.ok(!String(url).includes('synthetic'), 'Credentials never enter attachment URLs');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic');
    return new Response('%PDF-private', { headers: { 'Content-Type': 'application/pdf' } });
  };
  const downloaded = await fetchEquipmentAsset('https://qa.example.invalid', 'synthetic', 'asset/encoded');
  assert.equal(await downloaded.text(), '%PDF-private');
  globalThis.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(fetchEquipmentAsset('https://qa.example.invalid', 'synthetic', 'missing'), /HTTP 404/);
} finally { globalThis.fetch = originalFetch; }
console.log('Equipment asset multipart, type/size validation, errors and authenticated download regressions passed.');
