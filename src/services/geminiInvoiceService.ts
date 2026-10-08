import type { ExtractedInvoiceData, GeminiModelInfo } from '../types/aiInvoice';
import type { AIProposalPayload } from '../../shared/aiProposal';
import { buildProposalRequest } from '../../shared/aiProposal';
import { GEMINI_API_BASE, DEFAULT_GEMINI_MODEL, requestGeminiJson, geminiResponseText } from '../../shared/geminiTransport';
import { processExtractedInvoice } from '../utils/aiProposalNormalization';

// Presets are documented endpoints; quotas depend on the account, not this list.
export const DEFAULT_POPULAR_MODELS: GeminiModelInfo[] = [
  { id:'gemini-3.8-flash',name:'Gemini 3.8 Flash',description:'Modelo Flash estable reciente.',isRecommended:true },
  { id:'gemini-3.7-flash',name:'Gemini 3.7 Flash',description:'Multimodal y razonamiento general.',isRecommended:true },
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
export async function validateGeminiApiKey(apiKey:string,model=DEFAULT_GEMINI_MODEL):Promise<{success:boolean;error?:string;modelName?:string;models?:GeminiModelInfo[]}> {
  const result=await fetchAvailableGeminiModels(apiKey);
  if(!result.success) return result;
  const matched=result.models.find(m=>m.id===model.replace(/^models\//,''));
  if(!matched) return {success:false,error:`La clave es válida, pero el modelo ${model} no está disponible para esta cuenta. Selecciona uno de la lista.`,models:result.models};
  return {success:true,modelName:matched.name,models:result.models};
}
export type ParseProposalOptions=AIProposalPayload & {apiKey:string;onProgress?:(status:string)=>void;signal?:AbortSignal};
/** Same prompt, transport policy and deterministic grounding in browser and Electron. */
export async function parseProposalWithAI(payload:ParseProposalOptions, signal?:AbortSignal):Promise<ExtractedInvoiceData> {
  payload.onProgress?.('Analizando documentos y requisitos con el catálogo actual…');
  const result=await requestGeminiJson({apiKey:payload.apiKey,model:payload.model,body:buildProposalRequest(payload),signal:signal || payload.signal});
  payload.onProgress?.('Validando equipos, cantidades y datos del suministro…');
  return processExtractedInvoice(geminiResponseText(result.response),payload,result);
}
export const parseInvoiceWithGemini=parseProposalWithAI;
