// Escáneres de tarifas, fichas y listas de precios sobre el puerto LlmClient (F1b), con ScriptedLlm: lo que cada uno
// manda al modelo (esquema, adjunto inline, plazo, límite de salida), cómo cancela, qué avisa y que el adaptador
// se carga bajo demanda. Sin SDK en la prueba, sin red y sin clave real.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseDatasheetWithGemini, DATASHEET_RESPONSE_SCHEMA } from '../services/geminiDatasheetService';
import { GeminiPriceCatalogService, PRICE_CATALOG_RESPONSE_SCHEMA } from '../services/geminiPriceCatalogService';
import { GeminiTariffService, TARIFF_RESPONSE_SCHEMA } from '../services/geminiTariffService';
import { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL } from '../services/llm/models';
import { LlmError } from '../services/llm/errors';
import type { LlmStructuredRequest } from '../services/llm/types';
import type { SolarEquipmentItem } from '../types/equipment';
import { clientFromTransport } from './support/clientFromTransport';
import { ScriptedLlm } from './support/scriptedLlm';

const tariffPayload = {
  country: 'DO', regulator: null, currency: 'DOP', resolutionCode: null, effectiveDate: '2026-11-01',
  publishedBy: 'EDESUR Dominicana, Dirección Comercial', notes: 'Cuadro tarifario aplicado al servicio público.',
  schedules: { EDESUR: {
    gridUseChargeDOPPerKWh: 3.9,
    tariffs: {
      BTS1: { code: 'BTS1', name: 'BTS1', currency: 'DOP', baseEnergyRateDOP: 13.09, fixedChargeDOP: 128.59,
        blocks: [{ minKWh: 0, maxKWh: 200, rateDOP: 6.05 }, { minKWh: 201, maxKWh: null, rateDOP: 13.09 }],
        fixedChargeTiersDOP: [{ minKWh: 0, maxKWh: 100, chargeDOP: 42.1 }, { minKWh: 101, maxKWh: null, chargeDOP: 128.59 }] },
      BTD: { code: 'BTD', currency: 'DOP', baseEnergyRateDOP: 9.02, fixedChargeDOP: 210.15, demandChargePerKWDOP: 1189.16, netMeteringRetentionPct: null },
      'BTS-VE': { code: 'BTS-VE', currency: 'USD', baseEnergyRateUSD: 0.2, fixedChargeUSD: 2 },
    },
  } },
};
const datasheetPayload = {
  equipmentType: 'inverter', brand: 'Solis', modelSeries: 'S5-GC', documentTitle: 'Solis S5-GC50K/60K',
  familySpecs: { maxEfficiencyPct: 98.7, mpptCount: 5, dimensions: '1065 x 567 x 344 mm' },
  variants: [{ modelCode: 'S5-GC50K', displayName: 'Inversor Solis S5-GC50K (50.0Kw)', powerKW: 50, maxAcPowerKW: 55, maxPvPowerKW: null, maxPvPowerPct: null, efficiencyPct: null, isc: null, imp: null, mpptMaxCurrentA: 32, dcRatedVoltageV: 600 }],
};
const pricePayload = {
  detectedSupplierName: 'Proveedor QA', matchedExistingSupplier: null, supplierMatchConfidence: 0, currencyDetected: 'USD',
  items: [{ extractedModelName: 'Panel QA 640W', equipmentType: 'panel', originalCurrency: 'USD', originalPrice: 95.5, matchedEquipmentId: null, matchedDisplayName: null, matchConfidence: 0 }],
};

// Validador mínimo del subconjunto de JSON Schema que usan los esquemas (type con null, enum, required, properties,
// additionalProperties, items): comprueba que lo que el modelo devolvería cabe en el esquema que se le pide.
type Schema = { type?: string | readonly string[]; enum?: unknown[]; required?: readonly string[]; properties?: Record<string, Schema>; additionalProperties?: boolean | Schema; items?: Schema };
const typeOf = (value: unknown) => (value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value);
function conforms(schema: Schema, value: unknown, at = '$'): string[] {
  const actual = typeOf(value);
  const types = schema.type === undefined ? undefined : ([] as string[]).concat(schema.type);
  if (types && !types.includes(actual) && !(actual === 'integer' && types.includes('number'))) return [`${at}: ${actual} no está en [${types}]`];
  if (schema.enum && !schema.enum.includes(value)) return [`${at}: ${String(value)} fuera del enum`];
  const errors: string[] = [];
  if (actual === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (record[key] === undefined) errors.push(`${at}.${key}: obligatorio`);
    for (const [key, child] of Object.entries(record)) {
      const known = schema.properties?.[key];
      if (known) errors.push(...conforms(known, child, `${at}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}.${key}: no permitido`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errors.push(...conforms(schema.additionalProperties, child, `${at}.${key}`));
    }
  }
  if (actual === 'array' && schema.items) (value as unknown[]).forEach((item, i) => errors.push(...conforms(schema.items!, item, `${at}[${i}]`)));
  return errors;
}

// 1. Esquemas: JSON Schema (no el dialecto OpenAPI de `responseSchema`), coherentes y satisfechos por respuestas reales.
const schemas = { tarifas: TARIFF_RESPONSE_SCHEMA, fichas: DATASHEET_RESPONSE_SCHEMA, precios: PRICE_CATALOG_RESPONSE_SCHEMA };
function walk(schema: any, at: string, visit: (node: any, at: string) => void) {
  visit(schema, at);
  for (const [key, child] of Object.entries<any>(schema.properties ?? {})) walk(child, `${at}.${key}`, visit);
  if (schema.items) walk(schema.items, `${at}[]`, visit);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') walk(schema.additionalProperties, `${at}{}`, visit);
}
for (const [name, schema] of Object.entries(schemas)) {
  assert.equal((schema as Schema).type, 'object', `${name}: la raíz es un objeto`);
  walk(schema, name, (node, at) => {
    for (const type of ([] as string[]).concat(node.type ?? [])) assert.equal(type, type.toLowerCase(), `${at}: tipo en minúsculas (JSON Schema, no OpenAPI)`);
    assert.equal(node.nullable, undefined, `${at}: JSON Schema admite null con type [..., 'null'], no con nullable`);
    for (const key of node.required ?? []) assert(node.properties?.[key], `${at}: required «${key}» está declarado en properties`);
  });
}
assert.deepEqual(conforms(TARIFF_RESPONSE_SCHEMA, tariffPayload), [], 'un pliego completo cabe en el esquema de tarifas');
assert.deepEqual(conforms(DATASHEET_RESPONSE_SCHEMA, datasheetPayload), [], 'una ficha cabe en el esquema de fichas');
assert.deepEqual(conforms(PRICE_CATALOG_RESPONSE_SCHEMA, pricePayload), [], 'una lista de precios cabe en el esquema de precios');
// Las respuestas crudas guardadas son anteriores a «campos obligatorios, null si no está»: solo se comprueban tipos y enums.
const withoutRequired = (schema: any): any => (Array.isArray(schema) ? schema.map(withoutRequired) : schema && typeof schema === 'object'
  ? Object.fromEntries(Object.entries(schema).filter(([key]) => key !== 'required').map(([key, value]) => [key, withoutRequired(value)])) : schema);
for (const fixture of ['datasheet-jinko.json', 'datasheet-weco.json', 'datasheet-solis-s5-gc.json']) {
  const raw = JSON.parse(readFileSync(path.join('src/tests/fixtures', fixture), 'utf8'));
  assert.deepEqual(conforms(withoutRequired(DATASHEET_RESPONSE_SCHEMA), raw), [], `${fixture}: la respuesta real de Gemini cabe en el esquema`);
}
assert(conforms(TARIFF_RESPONSE_SCHEMA, { ...tariffPayload, schedules: { EDESUR: { tariffs: { BTS1: { code: 'BTS1' } } } } }).length > 0, 'una tarifa sin moneda no cabe');
assert(conforms(PRICE_CATALOG_RESPONSE_SCHEMA, { ...pricePayload, currencyDetected: 'EUR' }).length > 0, 'una moneda fuera de USD/DOP/OTHER no cabe');
assert(conforms(DATASHEET_RESPONSE_SCHEMA, { ...datasheetPayload, equipmentType: 'cable' }).length > 0);
assert(!('action' in (PRICE_CATALOG_RESPONSE_SCHEMA.properties.items.items.properties as Record<string, unknown>)), 'la acción no se pide al modelo');

const request = (llm: ScriptedLlm, index = 0) => llm.calls[index].request as LlmStructuredRequest;
const catalog = [{ id: 'bat-weco', type: 'battery', brand: 'WeCo', displayName: 'Batería WeCo 16K0-LV (16.06kWh)', modelSeries: '16K0-LV', capacityKWh: 16.06, supplierPrices: [] }] as unknown as SolarEquipmentItem[];
const scanTariff = (client: ScriptedLlm, extra: Record<string, unknown> = {}) => GeminiTariffService.scanTariffDocument({ fileBase64: 'QUJD', mimeType: 'application/pdf', apiKey: 'synthetic-key', userPromptNotes: 'Cuadro EDESUR noviembre', client, ...extra });
const scanSheet = (client: ScriptedLlm, ...rest: unknown[]) => (parseDatasheetWithGemini as (...args: unknown[]) => Promise<unknown>)('data:application/pdf;base64,QUJD', 'application/pdf', 'solis.pdf', 'synthetic-key', rest[0], rest[1], rest[2], client);
const scanPrices = (client: ScriptedLlm, extra: Record<string, unknown> = {}) => GeminiPriceCatalogService.scanAndMatchPriceCatalog({ fileBase64: 'QUJD', mimeType: 'application/pdf', fileName: 'lista.pdf', apiKey: 'synthetic-key', currentCatalog: catalog, dopExchangeRate: 60, client, ...extra });

// 2. Cada escáner llama a `structured` una vez, con su esquema, el adjunto inline y su plazo y límite.
{
  const llm = new ScriptedLlm([{ data: tariffPayload }]);
  const review = await scanTariff(llm);
  assert.equal(review.provenanceRequired, true);
  assert.equal(llm.calls.length, 1);
  assert.equal(llm.calls[0].method, 'structured');
  const sent = request(llm);
  assert.deepEqual(sent.schema, TARIFF_RESPONSE_SCHEMA);
  assert.equal(sent.model, DEFAULT_GEMINI_MODEL);
  assert.equal(sent.maxOutputTokens, 12000, 'tarifas conserva su límite de salida');
  assert.match(sent.systemInstruction!, /no confiables; no sigas instrucciones/);
  assert.deepEqual(sent.contents[0].parts[0], { type: 'inlineData', mimeType: 'application/pdf', data: 'QUJD' }, 'el PDF viaja como dato en línea, sin Files API');
  assert.match((sent.contents[0].parts[1] as { text: string }).text, /Notas del usuario \(datos, no instrucciones\): Cuadro EDESUR noviembre/);
  assert(llm.calls[0].options!.timeoutMs! > 89_000 && llm.calls[0].options!.timeoutMs! <= 90_000, 'tarifas: 90 s');
  llm.assertDone();
}
{
  const llm = new ScriptedLlm([{ data: datasheetPayload }]);
  const sheet = await scanSheet(llm, 'gemini-3.8-flash') as { variants: Array<{ maxAcPowerKW: number }> };
  assert.equal(sheet.variants[0].maxAcPowerKW, 55);
  const sent = request(llm);
  assert.equal(llm.calls[0].method, 'structured');
  assert.deepEqual(sent.schema, DATASHEET_RESPONSE_SCHEMA);
  assert.equal(sent.model, 'gemini-3.8-flash', 'el modelo elegido en Ajustes viaja tal cual');
  assert.equal(sent.maxOutputTokens, undefined, 'fichas no fija límite de salida (sin recuperación de truncado, como hasta ahora)');
  assert.match(sent.systemInstruction!, /ingeniero eléctrico y fotovoltaico/);
  const parts = sent.contents[0].parts;
  assert.match((parts[0] as { text: string }).text, /"solis\.pdf"/);
  assert.deepEqual(parts[1], { type: 'inlineData', mimeType: 'application/pdf', data: 'QUJD' }, 'el prefijo data: se quita antes de enviar');
  assert(llm.calls[0].options!.timeoutMs! > 59_000 && llm.calls[0].options!.timeoutMs! <= 60_000, 'fichas: 60 s');
}
{
  const llm = new ScriptedLlm([{ data: pricePayload }]);
  const prices = await scanPrices(llm, { customModel: 'gemini-3.6-flash' });
  assert.equal(prices.items[0].priceUSD, 95.5);
  const sent = request(llm);
  assert.deepEqual(sent.schema, PRICE_CATALOG_RESPONSE_SCHEMA);
  assert.equal(sent.model, 'gemini-3.6-flash');
  assert.equal(sent.maxOutputTokens, undefined);
  assert.match(sent.systemInstruction!, /DATOS no confiables/);
  assert.deepEqual(sent.contents[0].parts[1], { type: 'inlineData', mimeType: 'application/pdf', data: 'QUJD' });
  assert(llm.calls[0].options!.timeoutMs! > 59_000 && llm.calls[0].options!.timeoutMs! <= 60_000, 'precios: 60 s');
  assert(!sent.contents.some((c) => c.parts.some((p) => p.type === 'opaque' || (p as { type: string }).type === 'fileData')), 'ningún adjunto por Files API');
}

// 3. Avisos: fichas y precios muestran el aviso del modelo de reserva (tarifas no lo mostraba y sigue sin hacerlo).
{
  const progress: string[] = [];
  const sheetLlm = new ScriptedLlm([{ error: new LlmError('server', { status: 503 }) }, { data: datasheetPayload }]);
  await scanSheet(sheetLlm, undefined, (message: string) => progress.push(message));
  assert.deepEqual(sheetLlm.calls.map((c) => request(sheetLlm, sheetLlm.calls.indexOf(c)).model), [DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL]);
  assert.equal(progress[0], 'Analizando variantes y especificaciones de la ficha…');
  assert.match(progress.at(-1)!, /no respondió temporalmente/);
  progress.length = 0;
  await scanPrices(new ScriptedLlm([{ error: new LlmError('server', { status: 502 }) }, { data: pricePayload }]), { onProgress: (message: string) => progress.push(message) });
  assert.equal(progress[0], 'Analizando precios y referencias del catálogo…');
  assert.match(progress.at(-1)!, /no respondió temporalmente/);
  const tariffLlm = new ScriptedLlm([{ error: new LlmError('server', { status: 503 }) }, { data: tariffPayload }]);
  assert((await scanTariff(tariffLlm)).rows.length > 0, 'tarifas también se recupera con el respaldo');
  assert.equal(tariffLlm.calls.length, 2);
}

// 4. Validaciones locales: sin llamadas facturadas y con los mensajes de siempre.
{
  const idle = new ScriptedLlm([{ data: tariffPayload }]);
  await assert.rejects(scanTariff(idle, { mimeType: 'text/plain' }), /Usa PDF, PNG, JPEG o WebP/);
  await assert.rejects(scanTariff(idle, { fileBase64: '' }), /no superar 20 MB/);
  await assert.rejects(scanTariff(idle, { apiKey: ' ' }), /Configura una clave Gemini para procesar el pliego/);
  await assert.rejects(parseDatasheetWithGemini('QQ==', 'text/plain', 'x', 'k', undefined, undefined, undefined, idle), /Formato de ficha técnica no soportado/);
  await assert.rejects(parseDatasheetWithGemini('', 'application/pdf', 'x', 'k', undefined, undefined, undefined, idle), /vacía o supera 20 MB/);
  await assert.rejects(scanPrices(idle, { apiKey: '' }), /No se ha configurado la clave API/);
  await assert.rejects(scanPrices(idle, { dopExchangeRate: 0 }), /tasa USD\/DOP/);
  assert.equal(idle.calls.length, 0, 'ninguna validación local llega a facturarse');
}

// 5. Cancelación: la señal viaja al puerto y la razón de quien cancela llega tal cual; nada se factura tras cancelar.
{
  const reason = new Error('Escaneo cancelado por el usuario');
  const scans: Array<[string, (llm: ScriptedLlm, signal: AbortSignal) => Promise<unknown>]> = [
    ['tarifas', (llm, signal) => scanTariff(llm, { signal })],
    ['fichas', (llm, signal) => scanSheet(llm, undefined, undefined, signal)],
    ['precios', (llm, signal) => scanPrices(llm, { signal })],
  ];
  const payloads: Record<string, unknown> = { tarifas: tariffPayload, fichas: datasheetPayload, precios: pricePayload };
  for (const [name, scan] of scans) {
    const before = new AbortController();
    before.abort(reason);
    const idle = new ScriptedLlm([{ data: payloads[name] }]);
    await assert.rejects(scan(idle, before.signal), (error: unknown) => error === reason, `${name}: abortado antes de empezar`);
    assert.equal(idle.calls.length, 0, `${name}: ninguna llamada`);
    const during = new AbortController();
    const mid = new ScriptedLlm([() => { during.abort(reason); return { error: new LlmError('cancelled', { reason }) }; }, { data: payloads[name] }]);
    await assert.rejects(scan(mid, during.signal), (error: unknown) => error === reason, `${name}: abortado en la llamada`);
    assert.equal(mid.calls.length, 1, `${name}: no se reintenta tras cancelar`);
    assert.equal(mid.calls[0].options?.aborted, false, `${name}: la señal viajó al puerto`);
  }
}

// 5b. Con el adaptador real (fetch falso que se queda esperando): cancelar a mitad de la petición HTTP rechaza con la razón de
// quien cancela, una sola petición, sin pasar al modelo de reserva.
{
  const reason = new Error('El usuario cerró el diálogo');
  let sent = 0;
  const hanging = clientFromTransport((_url, _body, _headers, _timeout, signal) => new Promise((_resolve, reject) => {
    sent++;
    signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
  }));
  const controller = new AbortController();
  const pending = GeminiTariffService.scanTariffDocument({ fileBase64: 'QUJD', mimeType: 'application/pdf', apiKey: 'synthetic-key', client: hanging, signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort(reason);
  await assert.rejects(pending, (error: unknown) => error === reason);
  assert.equal(sent, 1, 'una sola petición: cancelar no cambia de modelo');
}

// 6. El adaptador (y el SDK) se cargan bajo demanda: sin cliente inyectado, el primer escaneo lo importa y usa el fetch global
// (que en las pruebas lanza), así que falla como un error de red tipado del puerto y sin reintentos.
{
  await assert.rejects(parseDatasheetWithGemini('QQ==', 'application/pdf', 'x.pdf', 'synthetic-key'), (error: unknown) => error instanceof LlmError && error.kind === 'network');
  await assert.rejects(scanTariff(undefined as unknown as ScriptedLlm), (error: unknown) => error instanceof LlmError && error.kind === 'network');
  await assert.rejects(parseDatasheetWithGemini('QQ==', 'application/pdf', 'x.pdf', ''), /Configura una API Key de Google Gemini en Ajustes/);
}
const sourceFiles = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'tests') sourceFiles(full, out); } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
};
const staticAdapterImports = sourceFiles('src').filter((file) => /^\s*(?:import|export)\b[^;]*?from\s*['"][^'"]*geminiAdapter['"]/m.test(readFileSync(file, 'utf8')));
assert.deepEqual(staticAdapterImports, [], 'ningún archivo de producción importa el adaptador de forma estática: solo import() bajo demanda');
for (const file of ['src/services/llm/scannerClient.ts', 'src/services/llm/listModels.ts'])
  assert.match(readFileSync(file, 'utf8'), /import\(\s*['"]\.\/geminiAdapter['"]\s*\)/, `${file} carga el adaptador bajo demanda`);
for (const service of ['geminiTariffService', 'geminiDatasheetService', 'geminiPriceCatalogService']) {
  const source = readFileSync(`src/services/${service}.ts`, 'utf8');
  assert(/createScannerClient/.test(source) && /requestStructured/.test(source), `${service} usa la política sobre el puerto`);
}

console.log('Scanners on the LlmClient port: schemas, inline attachments, deadlines, fallback notices, cancellation and lazy adapter (ScriptedLlm only).');
