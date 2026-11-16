import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_POPULAR_MODELS, mapGeminiModels } from '../services/geminiInvoiceService';
import { createAISlice, migrateStoredGeminiModel } from '../store/slices/aiSlice';
import { DEFAULT_GEMINI_MODEL } from '../../shared/geminiTransport';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';

// Identificadores publicados en https://ai.google.dev/gemini-api/docs/models (noviembre de 2026).
const DOCUMENTED = ['gemini-4-hydrogen', 'gemini-4-argon', 'gemini-4-carbon', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
assert(!DEFAULT_POPULAR_MODELS.some(m=>m.id==='gemini-3.8-flash-high'),'unsupported endpoint is not a preset');
assert(DEFAULT_POPULAR_MODELS.every(m=>DOCUMENTED.includes(m.id)),'presets are documented endpoints only');
assert.equal(DEFAULT_POPULAR_MODELS[0].id,DEFAULT_GEMINI_MODEL,'the default model leads the presets');
assert(DEFAULT_POPULAR_MODELS.every(m=>m.rateLimitNote===undefined),'do not advertise invented account quotas');

let state:any={};const slice=createAISlice((update:any)=>{state={...state,...update};},()=>state,{} as any);
assert.equal(slice.geminiModel,DEFAULT_GEMINI_MODEL);
assert.equal(slice.geminiModelChosenByUser,false);
slice.setGeminiModel('custom-account-model');assert.equal(state.geminiModel,'custom-account-model');assert.equal(state.geminiModelChosenByUser,true);
slice.setGeminiModel(DEFAULT_GEMINI_MODEL);assert.equal(state.geminiModelChosenByUser,false,'choosing the default follows future defaults');
slice.setGeminiModel('');assert.equal(state.geminiModel,DEFAULT_GEMINI_MODEL);
assert.equal(serializeSimulationStore({geminiModel:'gemini-3.6-flash',geminiModelChosenByUser:true} as any).geminiModelChosenByUser,true);

// El predeterminado de fábrica se guardaba con cada instalación: solo una elección explícita lo conserva.
const migrated=(model:string|undefined,chosen:boolean|undefined)=>migrateStoredGeminiModel(model,chosen);
for (const inherited of ['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash-lite','gemini-2.0-flash',' gemini-3.8-flash '])
  assert.deepEqual(migrated(inherited,undefined),{geminiModel:DEFAULT_GEMINI_MODEL,geminiModelChosenByUser:false},`${inherited} was an inherited default`);
assert.deepEqual(migrated('gemini-3.8-flash',true),{geminiModel:'gemini-3.8-flash',geminiModelChosenByUser:true},'explicit choice is respected');
// A model that was never a factory default was chosen: the flag must say so, or a future migration could overwrite it.
assert.deepEqual(migrated('gemini-2.5-pro',undefined),{geminiModel:'gemini-2.5-pro',geminiModelChosenByUser:true});
assert.deepEqual(migrated('  custom-account-model ',false),{geminiModel:'custom-account-model',geminiModelChosenByUser:true},'trimmed');
for (const empty of ['','   ',undefined]) assert.deepEqual(migrated(empty,true),{geminiModel:DEFAULT_GEMINI_MODEL,geminiModelChosenByUser:false},'empty follows the default');
assert.deepEqual(migrated(DEFAULT_GEMINI_MODEL,true),{geminiModel:DEFAULT_GEMINI_MODEL,geminiModelChosenByUser:false});

const mapped=mapGeminiModels({models:[{name:'models/gemini-real-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-tts',supportedGenerationMethods:['generateContent']},{name:'models/gemini-embedding',supportedGenerationMethods:['embedContent']}]});
assert.deepEqual(mapped.map(m=>m.id),['gemini-real-flash']);

// Interfaz: la clave nunca viaja en la URL y no hay identificadores retirados escritos a mano.
for (const file of ['src/components/settings/sections/IntegrationsSection.tsx','src/components/layout/PrimaryIconDock.tsx','src/components/common/AIPriceCatalogScannerModal.tsx']) {
  const text=readFileSync(file,'utf8');
  assert(!/[?&]key=/.test(text),`${file} must send the API key in x-goog-api-key`);
  assert(!/['"]gemini-(?:2\.[05]|3\.[5-8])[a-z.-]*['"]/.test(text),`${file} must use DEFAULT_GEMINI_MODEL or the presets`);
}
console.log('Gemini model discovery, inherited-default migration and explicit user selection passed. Transport policy is exercised by testGeminiTransport.');
