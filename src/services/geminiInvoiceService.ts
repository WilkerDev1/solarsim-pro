import type { ExtractedInvoiceData, GeminiModelInfo } from '../types/aiInvoice';
import type { AIProposalPayload } from '../../shared/aiProposal';
import { buildProposalRequest } from '../../shared/aiProposal';
import { DEFAULT_GEMINI_MODEL, GEMINI_API_BASE, requestGeminiJson, geminiResponseText, type GeminiTransport } from '../../shared/geminiTransport';
import { processExtractedInvoice } from '../utils/aiProposalNormalization';

// Presets are documented endpoints (https://ai.google.dev/gemini-api/docs/models); quotas depend on the account, not this list.
export const DEFAULT_POPULAR_MODELS: GeminiModelInfo[] = [
  { id:DEFAULT_GEMINI_MODEL,name:'Gemini 4 Hydrogen',description:'Modelo base: razonamiento ajustable, salida estructurada y PDF.',isRecommended:true },
  { id:'gemini-3.8-flash',name:'Gemini 3.8 Flash',description:'Flash estable de la generación anterior.',isRecommended:true },
  { id:'gemini-3.6-flash',name:'Gemini 3.6 Flash',isRecommended:true },
  { id:'gemini-3.5-flash-lite',name:'Gemini 3.5 Flash-Lite',description:'Modelo de menor coste para extracción.',isRecommended:true },
];
export function mapGeminiModels(data:any):GeminiModelInfo[] {
  return (Array.isArray(data?.models)?data.models:[])
    .filter((m:any)=>m.supportedGenerationMethods?.includes('generateContent') && /^models\/gemini-/.test(m.name) && !/image|tts|audio|live/.test(m.name))
    .map((m:any)=>({id:m.name.replace('models/',''),name:m.displayName || m.name.replace('models/',''),description:m.description,
      isRecommended:DEFAULT_POPULAR_MODELS.some(p=>p.id===m.name.replace('models/','') && p.isRecommended)}));
}
export async function fetchAvailableGeminiModels(apiKey:string):Promise<{success:boolean;error?:string;models:GeminiModelInfo[]}> {
  if(!apiKey?.trim()) return {success:false,error:'API Key vacía.',models:DEFAULT_POPULAR_MODELS};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(`${GEMINI_API_BASE}/models`,{headers:{'x-goog-api-key':apiKey.trim()},signal:controller.signal});
    const data=await response.json();
    if(!response.ok) return {success:false,error:data?.error?.message || `HTTP ${response.status}`,models:DEFAULT_POPULAR_MODELS};
    return {success:true,models:mapGeminiModels(data)};
  } catch(error:any) {return {success:false,error:error?.message || 'No se pudo consultar Gemini.',models:DEFAULT_POPULAR_MODELS};}
  finally {clearTimeout(timer);}
}
export type ParseProposalOptions=AIProposalPayload & {apiKey:string;onProgress?:(status:string)=>void;signal?:AbortSignal};
/** A proposal reasons over catalog, tariffs and commercial terms (more than an extraction) and may carry four documents. */
export const PROPOSAL_REQUEST_POLICY={thinkingLevel:'medium',timeoutMs:120000} as const;
/** Same prompt, transport policy and deterministic grounding in browser and Electron (which injects its HTTPS transport). */
export async function parseProposalWithAI(payload:ParseProposalOptions, signal?:AbortSignal, transport?:GeminiTransport):Promise<ExtractedInvoiceData> {
  payload.onProgress?.('Analizando documentos y requisitos con el catálogo actual…');
  const result=await requestGeminiJson({apiKey:payload.apiKey,model:payload.model,body:buildProposalRequest(payload),signal:signal || payload.signal,...PROPOSAL_REQUEST_POLICY},transport);
  payload.onProgress?.('Validando equipos, cantidades y datos del suministro…');
  return processExtractedInvoice(geminiResponseText(result.response),payload,result);
}
