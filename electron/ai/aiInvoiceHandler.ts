import { ipcMain } from 'electron';
import { GEMINI_API_BASE } from '../../shared/geminiTransport';
import { httpsPostJson, httpsGetJson } from './httpClient';
import { mapGeminiModels, parseProposalWithAI } from '../../src/services/geminiInvoiceService';
import type { AIProposalPayload } from '../../shared/aiProposal';
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
  ipcMain.handle('parse-invoice-with-ai',async(event,payload:AIProposalPayload)=>{
    const requestId=payload.requestId;
    if(requestId && (typeof requestId!=='string' || requestId.length>100)) return {success:false,error:'Identificador de solicitud inválido.'};
    const key=`${event.sender.id}:${requestId || 'legacy'}`;
    if(requests.has(key)) return {success:false,error:'Hay un análisis en curso para esta solicitud.'};
    const controller=new AbortController();requests.set(key,controller);
    const destroy=()=>controller.abort(new Error('La ventana de análisis se cerró.'));
    event.sender.once('destroyed',destroy);
    try {
      const data=await parseProposalWithAI({...payload,apiKey:payload.apiKey || ''},controller.signal,
        (url,body,headers,timeout,signal)=>httpsPostJson(url,body,timeout,headers,signal));
      return {success:true,data};
    }catch(error:any){return {success:false,error:error.message || 'Error analizando la propuesta.'};}
    finally {requests.delete(key);event.sender.removeListener('destroyed',destroy);}
  });
}
