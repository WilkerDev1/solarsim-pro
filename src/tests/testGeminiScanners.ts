import assert from 'node:assert/strict';
import { parseDatasheetWithGemini, DATASHEET_RESPONSE_SCHEMA } from '../services/geminiDatasheetService';
import { GeminiPriceCatalogService, PRICE_CATALOG_RESPONSE_SCHEMA } from '../services/geminiPriceCatalogService';
import { GeminiTariffService } from '../services/geminiTariffService';
import type { SolarEquipmentItem } from '../types/equipment';

// Synthetic network only: every scanner shares the transport, structured output and the no-repair JSON rule.
const originalFetch = globalThis.fetch;
const bodies: any[] = [];
let reply = '{}';
globalThis.fetch = (async (url: any, init: RequestInit) => {
  assert(!String(url).includes('key='));
  bodies.push(JSON.parse(String(init.body)));
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: reply }] } }] }), { status: 200 });
}) as typeof fetch;

const catalog = [{ id: 'bat-weco', type: 'battery', brand: 'WeCo', displayName: 'Batería WeCo 16K0-LV (16.06kWh)', modelSeries: '16K0-LV', capacityKWh: 16.06, supplierPrices: [] }] as unknown as SolarEquipmentItem[];
try {
  reply = JSON.stringify({ equipmentType: 'battery', brand: 'WeCo', variants: [{ modelCode: '16K0-LV', displayName: 'Batería WeCo 16K0-LV (16.06kWh)', capacityKWh: 16.06 }] });
  const sheet = await parseDatasheetWithGemini('data:application/pdf;base64,QQ==', 'application/pdf', 'weco.pdf', 'synthetic-key');
  assert.equal(sheet.variants[0].capacityKWh, 16.06);
  let body = bodies.at(-1);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema, DATASHEET_RESPONSE_SCHEMA);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  assert.equal(body.generationConfig.temperature, undefined, 'Gemini 4 ignores sampling parameters');
  assert(!body.systemInstruction.parts[0].text.includes('"variants": ['), 'the schema replaces the JSON shape in the prompt');

  reply = JSON.stringify({ detectedSupplierName: 'Proveedor QA', currencyDetected: 'DOP', items: [{ extractedModelName: 'Batería WeCo 16K0-LV (16.06kWh)', equipmentType: 'battery', originalCurrency: 'DOP', originalPrice: 60000 }] });
  const prices = await GeminiPriceCatalogService.scanAndMatchPriceCatalog({ fileBase64: 'QQ==', mimeType: 'application/pdf', fileName: 'lista.pdf', apiKey: 'synthetic-key', currentCatalog: catalog, dopExchangeRate: 60, existingSuppliers: ['Proveedor QA'] });
  assert.equal(prices.items[0].priceUSD, 1000);
  assert.equal(prices.items[0].matchedEquipmentId, 'bat-weco');
  body = bodies.at(-1);
  assert.deepEqual(body.generationConfig.responseSchema, PRICE_CATALOG_RESPONSE_SCHEMA);
  assert(body.contents[0].parts.some((p: any) => p.inlineData?.mimeType === 'application/pdf'), 'one camelCase request dialect');
  assert(!/\n\s+"id"/.test(body.contents[0].parts[0].text), 'compact catalog JSON: indentation only costs input tokens');

  // Prose around the JSON was previously "repaired" with a regex; structured output makes it a hard error.
  reply = 'Aquí tienes: {"detectedSupplierName":"X","currencyDetected":"USD","items":[]} ¿algo más?';
  await assert.rejects(GeminiPriceCatalogService.scanAndMatchPriceCatalog({ fileBase64: 'QQ==', mimeType: 'application/pdf', fileName: 'lista.pdf', apiKey: 'synthetic-key', currentCatalog: catalog }), /No se aplicó ningún precio/);

  reply = '{"resolutionCode":';
  await assert.rejects(GeminiTariffService.extractTariffMatrixFromDocument({ fileBase64: 'QQ==', mimeType: 'application/pdf', apiKey: 'synthetic-key' }), /No se aplicaron tarifas/);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Scanners share structured output, Gemini 4 request policy and strict JSON parsing (synthetic only).');
