import type { AIProposalPayload as AIInvoicePayload } from '../../shared/aiProposal';
import type { ExtractedInvoiceData as ExtractedInvoiceResult } from '../types/aiInvoice';
import { normalizeProposalDraft, robustParseJson } from '../../shared/aiProposal';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
export { robustParseJson } from '../../shared/aiProposal';
/** Exact normalized brand comparisons; no prefix matching across unrelated brands. */
export function matchBrandFuzzy(a?:string,b?:string) {
  const normalize=(value?:string)=>value?.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^luxpower$/,'luxpowertek').replace(/^canadian$/,'canadiansolar');
  return Boolean(a && b && normalize(a)===normalize(b));
}
export function processExtractedInvoice(rawText:string,payload:AIInvoicePayload,modelInfo?:{modelUsed?:string;requestedModel?:string;modelWarning?:string}):ExtractedInvoiceResult {
  const raw=robustParseJson(rawText);
  const context={...payload.context};
  context.province=raw.province || context.province;
  if(context.province) context.annualSpecificYieldKWhPerKWp=calculateRecommendedPanelCount(context.province,Array(12).fill(0),620,context.targetCoveragePct,context.systemLosses,context.customMonthlyHSP).annualSpecificYieldKWhPerKWp;
  const data=normalizeProposalDraft({...raw,dopExchangeRate:payload.dopExchangeRate,hasBattery:payload.includeBattery || raw.hasBattery},payload.equipmentCatalog || [],context);
  return {...data,modelUsed:modelInfo?.modelUsed,requestedModel:modelInfo?.requestedModel,modelWarning:modelInfo?.modelWarning,extractedFromFileName:(payload.files?.map(f=>f.fileName).join(', ') || payload.fileName),projectRequirementsPrompt:payload.projectRequirementsText};
}
