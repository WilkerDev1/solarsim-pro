// Ajustes de Gemini (clave y modelo). Desde F6 es solo eso: el borrador de IA vive en `src/domain/proposalDraft.ts`.
import { SimulationSlice, AISlice } from '../types';
import { DEFAULT_GEMINI_MODEL, INHERITED_DEFAULT_GEMINI_MODELS } from '../../services/llm/models';

/**
 * Each install saved the factory default as if it were a choice, so a stored former default only survives when the user
 * picked it explicitly (`geminiModelChosenByUser`); otherwise it follows the current default. Any other stored model was
 * never a factory default, so it is an explicit choice and is marked as such.
 */
export function migrateStoredGeminiModel(model:string|undefined,chosenByUser:boolean|undefined):{geminiModel:string;geminiModelChosenByUser:boolean} {
  const stored=model?.trim() || '';
  if(!stored || stored===DEFAULT_GEMINI_MODEL || (!chosenByUser && INHERITED_DEFAULT_GEMINI_MODELS.includes(stored)))
    return {geminiModel:DEFAULT_GEMINI_MODEL,geminiModelChosenByUser:false};
  return {geminiModel:stored,geminiModelChosenByUser:true};
}

export const createAISlice: SimulationSlice<AISlice> = (set) => ({
  geminiApiKey: '', geminiModel: DEFAULT_GEMINI_MODEL, geminiModelChosenByUser: false,
  setGeminiApiKey: key=>set({geminiApiKey:key}),
  // Choosing the default means "follow the default": a later default change applies to this install too.
  setGeminiModel: model=>{const geminiModel=model?.trim() || DEFAULT_GEMINI_MODEL;set({geminiModel,geminiModelChosenByUser:geminiModel!==DEFAULT_GEMINI_MODEL});},
});
