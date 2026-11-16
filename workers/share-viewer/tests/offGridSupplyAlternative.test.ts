import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { parseSharePayload, RequestValidationError } from '../src/validation';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { calculateProjectFinancialSummary } from '../../../src/engine/financeEngine';
import { gridConnectionFields } from '../../../shared/gridConnection';

/*
 * Sistema aislado: alternativa de suministro (`rates.supplyAlternative`). Con «sin comparación» (o el generador sin
 * costo) la propuesta web oculta ahorro, payback, TIR/VAN y flujo de caja, y presenta inversión, energía entregada,
 * energía no servida y autonomía. Los enlaces sin el campo se ven igual que siempre.
 */

const project = (rates: Record<string, unknown>) => ({ ...structuredClone(BENCHMARK_PROJECT), rates: { ...BENCHMARK_PROJECT.rates, ...rates } });
const stored = (rates: Record<string, unknown>): any => {
  const p = project(rates);
  return JSON.parse(JSON.stringify({
    id: 'aislado-suministro',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
    validityDays: 7,
    project: p,
    summary: calculateProjectFinancialSummary(p),
    calculationSnapshot: { mode: 'legacy', capturedAt: new Date().toISOString(), organizationId: 'o', policyVersion: 1 },
  }));
};
const island = gridConnectionFields('off_grid');
const savingsMarkers = /Retorno de Inversión y Métricas Financieras|Flujo de Caja y Beneficios|Payback|>TIR<|Ahorro 25 Años|id="cumulativeChart"|Ahorro Energ\. \(kWh\)|Ahorro fact\./;

// ── Enlaces antiguos y alternativa por defecto: idénticos ──────────────────────────────────
const tariffHtml = renderProposalPage(stored(island));
assert.equal(renderProposalPage(stored({ ...island, supplyAlternative: 'utility_tariff' })), tariffHtml, 'tarifa explícita = sin campo');
assert.ok(/Payback/.test(tariffHtml) && tariffHtml.includes('id="cumulativeChart"'), 'la tarifa muestra el retorno como siempre');
assert.ok(!tariffHtml.includes('data-savings-basis'));
// Con red el campo se ignora por completo.
assert.equal(renderProposalPage(stored({ supplyAlternative: 'no_comparison', generatorCostPerKWh: 0.4 })), renderProposalPage(stored({})));

// ── Sin comparación: sin cifras de ahorro ──────────────────────────────────────────────────
for (const [basis, rates] of [
  ['no_comparison', { ...island, supplyAlternative: 'no_comparison' }],
  ['generator_missing_cost', { ...island, supplyAlternative: 'generator' }],
] as const) {
  const html = renderProposalPage(stored(rates));
  const found = html.match(savingsMarkers);
  assert.ok(!found, `${basis}: ${found ? html.slice(Math.max(0, (found.index ?? 0) - 80), (found.index ?? 0) + 40) : ''}`);
  const section = html.slice(html.indexOf(`data-savings-basis="${basis}"`));
  assert.ok(section.length > 0 && html.includes(`data-savings-basis="${basis}"`), basis);
  assert.ok(/Energía entregada/.test(section) && /Energía no servida/.test(section) && /Autonomía/.test(section) && /Inversión/.test(section), basis);
  assert.ok(/\d[\d,]* kWh\/año/.test(section), 'energía entregada en kWh');
  assert.ok(/\d+(\.\d)? h</.test(section), 'autonomía del banco de baterías');
  assert.ok(html.includes('Energía servida (kWh)'), 'columna de energía servida en la tabla mensual');
  const regulatory = html.slice(html.indexOf('modo isla), sin acometida'), html.indexOf('modo isla), sin acometida') + 1400).split('</div>')[0];
  assert.ok(!/ahorr/i.test(regulatory), `${basis}: el marco regulatorio no habla de ahorro`);
}

// ── Generador con costo: se compara con la generación propia ───────────────────────────────
const generatorHtml = renderProposalPage(stored({ ...island, supplyAlternative: 'generator', generatorCostPerKWh: 0.385 }));
assert.ok(/Payback/.test(generatorHtml) && !generatorHtml.includes('data-savings-basis'));
assert.ok(/costo de generación propia/.test(generatorHtml) && /0\.385/.test(generatorHtml));

// ── Validación de la publicación ───────────────────────────────────────────────────────────
const payload = (rates: Record<string, unknown>) => {
  const { project: p, summary, calculationSnapshot } = stored(rates);
  return { project: p, summary, validityDays: 7, calculationSnapshot };
};
for (const rates of [
  {}, island, { ...island, supplyAlternative: 'utility_tariff' }, { ...island, supplyAlternative: 'no_comparison' },
  { ...island, supplyAlternative: 'generator' }, { ...island, supplyAlternative: 'generator', generatorCostPerKWh: 0.385 },
  { ...island, supplyAlternative: 'generator', generatorCostPerKWh: 0 },
]) assert.doesNotThrow(() => parseSharePayload(payload(rates)), JSON.stringify(rates));
for (const rates of [
  { ...island, supplyAlternative: 'planta' }, { ...island, supplyAlternative: 3 }, { ...island, supplyAlternative: null },
  { ...island, generatorCostPerKWh: -1 }, { ...island, generatorCostPerKWh: '0.4' }, { ...island, generatorCostPerKWh: null },
]) assert.throws(() => parseSharePayload(payload(rates)), RequestValidationError, JSON.stringify(rates));
// El resumen sin comparación (flujo vacío, ceros) es publicable.
assert.doesNotThrow(() => parseSharePayload(payload({ ...island, supplyAlternative: 'no_comparison' })));

console.log('Sistema aislado: alternativa de suministro en la propuesta web y validación de la publicación.');
