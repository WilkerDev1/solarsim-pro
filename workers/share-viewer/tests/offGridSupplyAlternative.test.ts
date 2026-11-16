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
const stored = (rates: Record<string, unknown>, mode: 'legacy' | 'self_consumption' = 'legacy', specs: Record<string, unknown> = {}): any => {
  const p = { ...project(rates), specs: { ...BENCHMARK_PROJECT.specs, ...specs } } as typeof BENCHMARK_PROJECT;
  return JSON.parse(JSON.stringify({
    id: 'aislado-suministro',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
    validityDays: 7,
    project: p,
    summary: calculateProjectFinancialSummary(p, mode),
    calculationSnapshot: { mode, capturedAt: new Date().toISOString(), organizationId: 'o', policyVersion: 1 },
  }));
};
const island = gridConnectionFields('off_grid');
const savingsMarkers = /Retorno de Inversión y Métricas Financieras|Flujo de Caja y Beneficios|Payback|>TIR<|>VAN<|>ROI<|VAN \(|ROI \(|Ahorro 25 Años|Ahorro Anual|Ahorro Energía|Beneficio Acumulado<\/th>|id="cumulativeChart"|Ahorro Energ\. \(kWh\)|Ahorro fact\./;
const tbodyOf = (html: string, marker: string) => {
  const table = html.slice(html.indexOf(marker));
  return table.slice(table.indexOf('<tbody'), table.indexOf('</tbody>'));
};

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
  assert.ok(!/US\$/.test(tbodyOf(html, 'Energía servida (kWh)')), 'la tabla mensual no lleva montos');
  // El script de gráficas no falla sin el lienzo del beneficio acumulado (guarda nula).
  assert.ok(/const cumCtx = document\.getElementById\('cumulativeChart'\);\s*if \(cumCtx\)/.test(html));
  const regulatory = html.slice(html.indexOf('modo isla), sin acometida'), html.indexOf('modo isla), sin acometida') + 1400).split('</div>')[0];
  assert.ok(!/ahorr/i.test(regulatory), `${basis}: el marco regulatorio no habla de ahorro`);
  // Opción C: ni distribuidora ni tarifa en ninguna parte de la página.
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.ok(!/EDE(?:ESTE|SUR|NORTE)|Distribuidora \/ Tarifa|SIE \/ EDES|BTS2|Tarifa BTS/.test(visible), `${basis}: ${(visible.match(/EDE(?:ESTE|SUR|NORTE)|Distribuidora \/ Tarifa|SIE \/ EDES|BTS2|Tarifa BTS/) ?? [''])[0]}`);
  if (basis === 'no_comparison') assert.ok(/Suministro actual:[\s\S]{0,120}Sin conexión a la red/.test(html), 'cabecera: sin conexión a la red');
}

// ── Generador con costo: se compara con la generación propia ───────────────────────────────
const generatorHtml = renderProposalPage(stored({ ...island, supplyAlternative: 'generator', generatorCostPerKWh: 0.385 }));
assert.ok(/Payback/.test(generatorHtml) && !generatorHtml.includes('data-savings-basis'));
assert.ok(/costo de generación propia/.test(generatorHtml) && /0\.385/.test(generatorHtml));
// La base del ahorro impresa es el costo del generador, no la tarifa.
assert.ok(/data-savings-reference="generator"[^>]*>[\s\S]*?Suministro actual:[\s\S]*?Generador • US\$ 0\.385\/kWh/.test(generatorHtml));
assert.ok(!generatorHtml.includes('Distribuidora / Tarifa:') && tariffHtml.includes('Distribuidora / Tarifa:'));
assert.ok(generatorHtml.includes('inflación del costo de generación propia') && !generatorHtml.includes('inflación tarifaria'));
assert.ok(/costo pendiente/.test(renderProposalPage(stored({ ...island, supplyAlternative: 'generator' }))));

// ── Energía entregada = energía servida de la app/PDF, en ambos modos de cálculo ───────────
for (const mode of ['legacy', 'self_consumption'] as const) {
  const link = stored({ ...island, supplyAlternative: 'no_comparison' }, mode);
  const served = Math.round(link.summary.monthlyBreakdown.reduce((sum: number, m: any) => sum + m.solarSelfConsumedKWh, 0));
  const html = renderProposalPage(link);
  assert.ok(html.includes(`${served.toLocaleString('en-US')} kWh/año`), `${mode}: ${served}`);
}

// ── Ramas «Sin dato» y «Sin baterías», enlaces antiguos y lectura tolerante ────────────────
{
  const link = stored({ ...island, supplyAlternative: 'no_comparison' });
  delete link.summary.annualUnservedKWh;
  delete link.summary.batteryBackupAutonomyHours;
  const section = renderProposalPage(link).split('data-savings-basis="no_comparison"')[1] ?? '';
  assert.equal((section.split('</section>')[0].match(/Sin dato/g) ?? []).length, 2, 'energía no servida y autonomía sin dato');
  const noBattery = renderProposalPage(stored({ ...island, supplyAlternative: 'no_comparison' }, 'legacy', { hasBattery: false, batteries: [] }));
  assert.ok(/Sin baterías/.test(noBattery.split('data-savings-basis="no_comparison"')[1] ?? ''));
  // Enlace antiguo sin `calculationSnapshot` ni campos nuevos: igual que siempre (retorno visible).
  const legacy = stored({});
  delete legacy.calculationSnapshot;
  const legacyHtml = renderProposalPage(legacy);
  assert.ok(/Payback/.test(legacyHtml) && legacyHtml.includes('id="cumulativeChart"') && !legacyHtml.includes('data-savings-basis'));
  // Un valor desconocido ya almacenado (no pasó por la validación actual) se lee como tarifa.
  assert.equal(renderProposalPage(stored({ ...island, supplyAlternative: 'planta' })), tariffHtml);
}

// ── Validación de la publicación ───────────────────────────────────────────────────────────
const payload = (rates: Record<string, unknown>) => {
  const { project: p, summary, calculationSnapshot } = stored(rates);
  return { project: p, summary, validityDays: 7, calculationSnapshot };
};
for (const rates of [
  {}, island, { ...island, supplyAlternative: 'utility_tariff' }, { ...island, supplyAlternative: 'no_comparison' },
  { ...island, supplyAlternative: 'generator' }, { ...island, supplyAlternative: 'generator', generatorCostPerKWh: 0.385 },
  { ...island, supplyAlternative: 'generator', generatorCostPerKWh: 25 }, // alto: advertencia en el dock, no un límite
]) assert.doesNotThrow(() => parseSharePayload(payload(rates)), JSON.stringify(rates));
for (const rates of [
  { ...island, supplyAlternative: 'planta' }, { ...island, supplyAlternative: 3 }, { ...island, supplyAlternative: null },
  { ...island, generatorCostPerKWh: -1 }, { ...island, generatorCostPerKWh: '0.4' }, { ...island, generatorCostPerKWh: null },
  // Mismo predicado que la app: 0 no es un costo (el escritorio omite un costo inválido al publicar).
  { ...island, supplyAlternative: 'generator', generatorCostPerKWh: 0 }, { ...island, generatorCostPerKWh: 5000 },
]) assert.throws(() => parseSharePayload(payload(rates)), (error: unknown) => error instanceof RequestValidationError && (rates.generatorCostPerKWh === undefined || /mayor que 0/.test(error.message)), JSON.stringify(rates));
// El resumen sin comparación (flujo vacío, ceros) es publicable.
assert.doesNotThrow(() => parseSharePayload(payload({ ...island, supplyAlternative: 'no_comparison' })));

console.log('Sistema aislado: alternativa de suministro en la propuesta web y validación de la publicación.');
