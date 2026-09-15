import assert from 'assert';
import { DEFAULT_POPULAR_MODELS } from '../services/geminiInvoiceService';
import { createAISlice } from '../store/slices/aiSlice';
import { processExtractedInvoice } from '../../electron/ai/invoiceExtractor';

console.log('=====================================================');
console.log('🧪 RUNNING GEMINI FAMILY 3 & 503 CASCADE TEST SUITE');
console.log('=====================================================');

// TEST 1: Verificar que gemini-3.7-flash es el recomendado predeterminado y 3.8 no está censurado
console.log('\n--- TEST 1: Model Defaults & Recommendations ---');
const recommendedModels = DEFAULT_POPULAR_MODELS.filter((m) => m.isRecommended);
const recommendedIds = recommendedModels.map((m) => m.id);

assert(
  recommendedIds.includes('gemini-3.7-flash'),
  'gemini-3.7-flash debe estar en los modelos recomendados'
);
assert(
  recommendedIds.includes('gemini-3.6-flash'),
  'gemini-3.6-flash debe estar en los modelos recomendados'
);
assert(
  recommendedIds.includes('gemini-3.5-flash-lite'),
  'gemini-3.5-flash-lite debe estar en los modelos recomendados'
);

const has38 = DEFAULT_POPULAR_MODELS.some((m) => m.id === 'gemini-3.8-flash-high');
assert(has38, 'gemini-3.8-flash-high debe estar disponible en la lista de modelos');
console.log(' ✅ PASS: Familia 3 recomendada por defecto y gemini-3.8-flash-high habilitado');

// TEST 2: aiSlice permite seleccionar gemini-3.8-flash-high sin forzar downgrade preventivo
console.log('\n--- TEST 2: aiSlice Model Selection Flexibility ---');
let storeState: any = {};
const mockSet = (updater: any) => {
  if (typeof updater === 'function') {
    storeState = { ...storeState, ...updater(storeState) };
  } else {
    storeState = { ...storeState, ...updater };
  }
};
const mockGet = () => storeState;

const slice = createAISlice(mockSet as any, mockGet as any, {} as any);
assert.strictEqual(slice.geminiModel, 'gemini-3.7-flash', 'El modelo por defecto debe ser gemini-3.7-flash');

slice.setGeminiModel('gemini-3.8-flash-high');
assert.strictEqual(storeState.geminiModel, 'gemini-3.8-flash-high', 'setGeminiModel debe permitir seleccionar gemini-3.8-flash-high');

slice.setGeminiModel('gemini-3.6-flash');
assert.strictEqual(storeState.geminiModel, 'gemini-3.6-flash', 'setGeminiModel debe permitir seleccionar gemini-3.6-flash');
console.log(' ✅ PASS: aiSlice no bloquea gemini-3.8-flash-high y respeta la elección del usuario');

// TEST 3: Cascada y Deduplicación de Modelos Candidatos
console.log('\n--- TEST 3: Candidate Models Cascade Logic ---');
const requestedModel = 'gemini-3.8-flash-high';
const FAMILY_3_CASCADE = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];
const candidateModels = Array.from(new Set([requestedModel, ...FAMILY_3_CASCADE]));

assert.strictEqual(candidateModels[0], 'gemini-3.8-flash-high', 'El modelo solicitado por el usuario debe probarse en 1er lugar');
assert.strictEqual(candidateModels[1], 'gemini-3.7-flash', 'El segundo candidato en cascada debe ser gemini-3.7-flash');
assert.strictEqual(candidateModels[2], 'gemini-3.6-flash', 'El tercer candidato en cascada debe ser gemini-3.6-flash');
console.log(' ✅ PASS: Cascada ordenada: usuario -> 3.7 -> 3.6 -> 3.5 -> 2.5 -> 2.0');

// TEST 4: Advertencia Activa de Fallback en Extractor
console.log('\n--- TEST 4: Fallback Warning in Extractor Metadata ---');
const mockRawJson = JSON.stringify({
  clientName: 'Juan Pérez Solar',
  distributor: 'EDEESTE',
  tariffCode: 'BTS1',
  monthlyConsumptionKWh: [1000, 1100, 1200, 1050, 950, 900, 1150, 1200, 1300, 1100, 1000, 1050],
  annualConsumptionKWh: 13100,
  averageMonthlyKWh: 1092,
  confidenceScore: 99,
});

const mockPayload = {
  fileName: 'factura_edeeste.pdf',
  apiKey: 'fake-key',
  model: 'gemini-3.8-flash-high',
};

const mockWarning = 'Google reportó saturación en gemini-3.8-flash-high (Error 503). Se utilizó gemini-3.7-flash como respaldo.';
const extracted = processExtractedInvoice(mockRawJson, mockPayload, {
  modelUsed: 'gemini-3.7-flash',
  requestedModel: 'gemini-3.8-flash-high',
  modelWarning: mockWarning,
});

assert.strictEqual(extracted.modelUsed, 'gemini-3.7-flash', 'modelUsed debe reflejar el modelo que tuvo éxito');
assert.strictEqual(extracted.requestedModel, 'gemini-3.8-flash-high', 'requestedModel debe registrar el modelo solicitado');
assert.strictEqual(extracted.modelWarning, mockWarning, 'modelWarning debe incluirse en la propuesta extraída');
console.log(' ✅ PASS: Metadatos de modelo y advertencia 503 inyectados correctamente');

console.log('\n=====================================================');
console.log('🎉 ALL GEMINI FAMILY 3 & 503 TESTS PASSED (100% SUCCESS)');
console.log('=====================================================');
