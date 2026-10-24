import type { AIProposalPayload as AIInvoicePayload } from '../../shared/aiProposal';
import type { ExtractedInvoiceData as ExtractedInvoiceResult } from '../types/aiInvoice';
import { normalizeProposalDraft, robustParseJson } from '../../shared/aiProposal';
import { resolveAssumption } from '../../shared/assumptions';
import { calculateRecommendedPanelCount, getMonthlySolarProductionFactors } from '../engine/solarEngine';
export { robustParseJson } from '../../shared/aiProposal';
/** Exact normalized brand comparisons; no prefix matching across unrelated brands. */
export function processExtractedInvoice(rawText:string,payload:AIInvoicePayload,modelInfo?:{modelUsed?:string;requestedModel?:string;modelWarning?:string}):ExtractedInvoiceResult {
  const raw=robustParseJson(rawText);
  const context={...payload.context};
  context.province=raw.province || context.province;
  if(context.province) context.annualSpecificYieldKWhPerKWp=calculateRecommendedPanelCount(context.province,Array(12).fill(0),620,context.targetCoveragePct,context.systemLosses,context.customMonthlyHSP).annualSpecificYieldKWhPerKWp;
  if(context.province)context.monthlySpecificYieldKWhPerKWp=getMonthlySolarProductionFactors(context.province,resolveAssumption('systemLossesPct',context.systemLosses),context.customMonthlyHSP);
  const data=normalizeProposalDraft({...raw,dopExchangeRate:raw.dopExchangeRate===undefined||raw.dopExchangeRate===null?payload.dopExchangeRate:raw.dopExchangeRate,hasBattery:payload.includeBattery || raw.hasBattery},payload.equipmentCatalog || [],context);
  return {...data,modelUsed:modelInfo?.modelUsed,requestedModel:modelInfo?.requestedModel,modelWarning:modelInfo?.modelWarning,extractedFromFileName:(payload.files?.map(f=>f.fileName).join(', ') || payload.fileName),projectRequirementsPrompt:payload.projectRequirementsText};
}
