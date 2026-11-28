import type { ExtractedInvoiceData } from '../types/aiInvoice';
import type { AIProposalPayload } from '../../shared/aiProposal';
import { buildProposalRequest } from '../../shared/aiProposal';
import { requestGeminiStructured, type GeminiTransport } from '../../shared/geminiTransport';
import { processExtractedInvoiceData, PROPOSAL_INVALID_JSON } from '../utils/aiProposalNormalization';

// El catálogo de modelos vive en src/services/llm/models.ts (sin SDK); se reexporta para electron/ai y las suites
// existentes hasta que F6 retire este archivo. El listado de Ajustes usa el puerto (src/services/llm/listModels.ts).
export { DEFAULT_POPULAR_MODELS, mapGeminiModels } from './llm/models';
export type ParseProposalOptions=AIProposalPayload & {apiKey:string;onProgress?:(status:string)=>void;signal?:AbortSignal};
/** A proposal reasons over catalog, tariffs and commercial terms (more than an extraction) and may carry four documents. */
export const PROPOSAL_REQUEST_POLICY={thinkingLevel:'medium',timeoutMs:120000} as const;
/** Same prompt, transport policy and deterministic grounding in browser and Electron (which injects its HTTPS transport). */
export async function parseProposalWithAI(payload:ParseProposalOptions, signal?:AbortSignal, transport?:GeminiTransport):Promise<ExtractedInvoiceData> {
  payload.onProgress?.('Analizando documentos y requisitos con el catálogo actual…');
  const result=await requestGeminiStructured({apiKey:payload.apiKey,model:payload.model,body:buildProposalRequest(payload),signal:signal || payload.signal,invalidMessage:PROPOSAL_INVALID_JSON,...PROPOSAL_REQUEST_POLICY},transport);
  payload.onProgress?.('Validando equipos, cantidades y datos del suministro…');
  return processExtractedInvoiceData(result.data,payload,result);
}
