import { ipcMain } from 'electron';
import { buildProposalRequest } from '../../shared/aiProposal';
import { requestGeminiJson, geminiResponseText, GEMINI_API_BASE, DEFAULT_GEMINI_MODEL } from '../../shared/geminiTransport';
import { httpsPostJson, httpsGetJson } from './httpClient';
import { mapGeminiModels } from '../../src/services/geminiInvoiceService';
import { processExtractedInvoice } from './invoiceExtractor';
import type { AIInvoicePayload } from './types';
export function registerAIInvoiceHandlers() {
  const requests=new Map<string,AbortController>();
  ipcMain.handle('cancel-ai-request', (event, requestId:string)=>{
    const controller=requests.get(`${event.sender.id}:${requestId}`);
    controller?.abort(new Error('Solicitud de IA cancelada.'));
  });
  const listModels=async(apiKey:string)=>{
    if(!apiKey?.trim()) return {success:false,error:'API Key vacía.'};
    try {const data=await httpsGetJson(`${GEMINI_API_BASE}/models`,{'x-goog-api-key':apiKey.trim()});return {success:true,models:mapGeminiModels(data)};}
    catch(error:any){return {success:false,error:error.message || 'No se pudo consultar Gemini.'};}
  };
  ipcMain.handle('list-gemini-models',(_event,apiKey:string)=>listModels(apiKey));
  ipcMain.handle('validate-gemini-key',async(_event,apiKey:string,model=DEFAULT_GEMINI_MODEL)=>{
    const result=await listModels(apiKey);
    if(!result.success) return result;
    const matched=result.models?.find((m:any)=>m.id===model.replace(/^models\//,''));
    return matched?{...result,modelName:matched.name}:{...result,success:false,error:`El modelo ${model} no está disponible para esta cuenta.`};
  });
  ipcMain.handle('parse-invoice-with-ai',async(event,payload:AIInvoicePayload)=>{
    const requestId=payload.requestId;
    if(requestId && (typeof requestId!=='string' || requestId.length>100)) return {success:false,error:'Identificador de solicitud inválido.'};
    const key=`${event.sender.id}:${requestId || 'legacy'}`;
    if(requests.has(key)) return {success:false,error:'Hay un análisis en curso para esta solicitud.'};
    const controller=new AbortController();requests.set(key,controller);
    const destroy=()=>controller.abort(new Error('La ventana de análisis se cerró.'));
    event.sender.once('destroyed',destroy);
    try {
      const result=await requestGeminiJson({apiKey:payload.apiKey || '',model:payload.model,body:buildProposalRequest(payload),signal:controller.signal},
        (url,body,headers,timeout,signal)=>httpsPostJson(url,body,timeout,headers,signal));
      return {success:true,data:processExtractedInvoice(geminiResponseText(result.response),payload,result)};
    }catch(error:any){return {success:false,error:error.message || 'Error analizando la propuesta.'};}
    finally {requests.delete(key);event.sender.removeListener('destroyed',destroy);}
  });
}
