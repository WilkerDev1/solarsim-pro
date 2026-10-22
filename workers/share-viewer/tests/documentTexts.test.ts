import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { calculateProjectFinancialSummary } from '../../../src/engine/financeEngine';
import { renderProposalPage } from '../src/template';
import { parseSharePayload, RequestValidationError } from '../src/validation';
import { formatInlineMarkdown, formatMarkdown } from '../src/escaping';

const base = (customization: Record<string, unknown>, project: Record<string, unknown> = {}): any => ({
  id: 'doc-texts',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  validityDays: 7,
  project: {
    id: 'p',
    client: { name: 'Cliente Prueba', projectId: 'SP-1', quoteNumber: 'C-1', province: 'Santiago', distributor: 'EDENORTE' },
    specs: { panelCount: 10, panelPowerW: 600, panelBrandModel: 'Panel', inverterCount: 1, inverterBrandModel: 'Inversor', hasBattery: false },
    rates: { distributor: 'EDENORTE', tariffCode: 'BTS1' },
    financials: { applyITBISExemption: true, applyLey5707: true },
    customization,
    ...project,
  },
  summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 9500, energyCoveragePct: 100, grossInvestmentUSD: 10000, itbisSavedUSD: 900, ley5707CreditUSD: 2000, monthlyBreakdown: [] },
});

// 1. Old links (no doc: keys, factory values copied by 2.6.x) keep rendering and show the shared defaults.
const legacy = renderProposalPage(base({ panelWarrantyText: '25 Años de Producción Lineal', validityNote: 'Precios sujetos a disponibilidad de inventario. Cotización válida por 7 días laborables.' }));
assert.ok(legacy.includes('25 Años de Producción Lineal'));
assert.ok(legacy.includes('Medición Neta'), 'La nota regulatoria por defecto es la dinámica compartida');
assert.ok(legacy.includes('Cotización válida por 7 días laborables'));

// 2. Legacy field of an old link that was really customized still wins over the default.
assert.ok(renderProposalPage(base({ inverterWarrantyText: '12 años propios' })).includes('12 años propios'));

// 3. A published doc: text is preferred over the legacy field, rendered with the shared rich subset and escaped.
const published = renderProposalPage(base({
  panelWarrantyText: 'heredado',
  'doc:quotation.warranty.panel': '30 años **lineales** <img src=x>',
  'doc:quotation.servicesIncluded': '- Permisos y trámites\n- Planos eléctricos',
  'doc:projectDescription.regulatoryNote': 'Primer párrafo propio.\n\n- Punto *clave*',
  'doc:projectDescription.paragraph1': 'Párrafo **publicado** para el cliente.',
  'doc:projectDescription.subtitle': 'Subtítulo publicado',
}));
assert.ok(!published.includes('heredado'));
assert.ok(published.includes('30 años <strong class="font-bold text-slate-950">lineales</strong> &lt;img src=x&gt;'));
assert.ok(!published.includes('<img src=x>'));
assert.ok(published.includes('Permisos y trámites') && published.includes('Planos eléctricos'));
assert.ok(published.includes('Primer párrafo propio.') && published.includes('<em>clave</em>'));
assert.ok(published.includes('Párrafo <strong class="font-bold text-slate-950">publicado</strong> para el cliente.'));
assert.ok(published.includes('Subtítulo publicado'));

// 4. Validation: doc: texts are strings of registry keys only.
const payload = (customization: Record<string, unknown>) => ({ project: { ...structuredClone(BENCHMARK_PROJECT), customization }, summary: calculateProjectFinancialSummary(BENCHMARK_PROJECT, 'legacy'), validityDays: 7, calculationSnapshot: { mode: 'legacy', capturedAt: new Date().toISOString(), organizationId: 'o', policyVersion: 1 } });
assert.doesNotThrow(() => parseSharePayload(payload({ 'doc:quotation.warranty.panel': 'ok' })));
for (const bad of [{ 'doc:inexistente.clave': 'x' }, { 'doc:quotation.warranty.panel': 5 }, { 'doc:quotation.warranty.panel': 'x'.repeat(10001) }, { 'doc:__proto__': 'x' }]) {
  assert.throws(() => parseSharePayload(payload(bad)), RequestValidationError);
}

// 5. The viewer renders the shared rich subset (italics, bullets) without raw HTML.
assert.equal(formatMarkdown('a **b** *c*'), '<span style="display:block">a <strong class="font-bold text-slate-950">b</strong> <em>c</em></span>');
assert.equal(formatInlineMarkdown('a **b**'), 'a <strong class="font-bold text-slate-950">b</strong>');
assert.ok(!formatMarkdown('<script>alert(1)</script>').includes('<script>'));

console.log('Document texts: doc: keys, legacy links and shared defaults render and validate.');
