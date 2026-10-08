import assert from 'node:assert/strict';
import { DEFAULT_POPULAR_MODELS, mapGeminiModels } from '../services/geminiInvoiceService';
import { createAISlice } from '../store/slices/aiSlice';
import { DEFAULT_GEMINI_MODEL } from '../../shared/geminiTransport';
// Historical suite name retained. Test actual APIs instead of cloning obsolete cascade constants.
assert(!DEFAULT_POPULAR_MODELS.some(m=>m.id==='gemini-3.8-flash-high'),'unsupported endpoint is not a preset');
assert(DEFAULT_POPULAR_MODELS.every(m=>m.rateLimitNote===undefined),'do not advertise invented account quotas');
let state:any={};const slice=createAISlice((update:any)=>{state={...state,...update};},()=>state,{} as any);
assert.equal(slice.geminiModel,DEFAULT_GEMINI_MODEL);slice.setGeminiModel('custom-account-model');assert.equal(state.geminiModel,'custom-account-model');
const mapped=mapGeminiModels({models:[{name:'models/gemini-real-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-tts',supportedGenerationMethods:['generateContent']},{name:'models/gemini-embedding',supportedGenerationMethods:['embedContent']}]});
assert.deepEqual(mapped.map(m=>m.id),['gemini-real-flash']);
console.log('Gemini model discovery and explicit user selection passed. Transport retry budget is exercised by testAIProposalPipeline.');
