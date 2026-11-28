// LEGADO: se elimina en F6 junto con el modal ai-invoice (useAIInvoiceScanner, ProposalConsumptionReview) y aiProposalNormalization.
// Parte de la suite mixta testNoProjectEditRulesOutsideModule partida en F0: la guarda de edición de proyecto sobrevive allí; aquí queda
// solo la comprobación de que los tres archivos legados que esa guarda excluye (LEGACY_DRAFT_PIPELINE) siguen existiendo.
// Cuando F6 los borre, se quitan a la vez la constante LEGACY_DRAFT_PIPELINE de la guarda y esta suite.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

const LEGACY_DRAFT_PIPELINE = [
  'src/utils/aiProposalNormalization.ts',
  'src/components/common/ai-invoice/hooks/useAIInvoiceScanner.ts',
  'src/components/common/ai-invoice/components/ProposalConsumptionReview.tsx',
];
for (const file of LEGACY_DRAFT_PIPELINE)
  assert.ok(existsSync(path.join(process.cwd(), file)), `${file} ya no existe: quítalo de LEGACY_DRAFT_PIPELINE en testNoProjectEditRulesOutsideModule y borra esta suite`);
console.log('PASS (legado): los archivos de la tubería de borrador del asistente de propuestas que la guarda de edición excluye siguen existiendo.');
