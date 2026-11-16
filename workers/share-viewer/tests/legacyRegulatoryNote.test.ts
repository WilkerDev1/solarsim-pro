import assert from 'node:assert/strict';
import { renderProposalPage } from '../src/template';
import { formatMarkdown } from '../src/escaping';

/**
 * Enlaces ya publicados (sin `doc:projectDescription.regulatoryNote`): la nota regulatoria que el visor
 * dibuja debe seguir siendo la misma aunque cambie el texto por defecto de propuestas nuevas.
 * Las cifras del enlace salen del resumen guardado (ver también `publicationIntegrity.test.ts`).
 */
const stored = (rates: Record<string, unknown>, extra: { hasBattery?: boolean } = {}): any => ({
  id: 'legacy-note',
  createdAt: '2026-10-15T12:00:00.000Z',
  expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  validityDays: 7,
  project: {
    id: 'p',
    client: { name: 'Cliente Antiguo', projectId: 'SP-1', quoteNumber: 'C-1', province: 'Santiago' },
    specs: { panelCount: 10, panelPowerW: 600, panelBrandModel: 'Panel', inverterCount: 1, inverterBrandModel: 'Inversor', hasBattery: !!extra.hasBattery },
    rates,
    financials: { applyITBISExemption: true, applyLey5707: true },
    customization: {},
  },
  summary: { systemCapacityKWp: 6, annualConsumptionKWh: 9000, annualProductionKWh: 9500, energyCoveragePct: 100, grossInvestmentUSD: 10000, itbisSavedUSD: 900, ley5707CreditUSD: 2000, year1SavingsUSD: 1234.56, monthlyBreakdown: [] },
});

const P1_EDES = 'La energía generada mensualmente se descontará del consumo tomado de la red de la distribuidora eléctrica (EDES). Cuando la producción supere el consumo, el excedente se acreditará como descuento en su factura eléctrica bajo el régimen de Medición Neta.';
const P2 = 'La presente propuesta ha sido elaborada conforme a la Resolución SIE-007-2026-REG y se basa en criterios técnicos y el historial de consumo del cliente.';
const P3 = 'Los ahorros indicados son estimados y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.';
const charge = (tariff: string, fee: number) => `Para la tarifa ${tariff}, el análisis económico considera el cargo por derecho de uso de la red, equivalente al ${fee}% del valor de la energía excedente exportada, conforme al régimen de Medición Neta y la normativa vigente (Resolución SIE-007-2026-REG). Por esta razón, el sistema se diseña para maximizar el autoconsumo y optimizar la inyección de energía, obteniendo así el mayor retorno de inversión posible. Cuando resulte conveniente, se recomendará la incorporación de baterías de litio para incrementar el aprovechamiento directo de la energía generada.`;

const paragraphs = (texts: string[]) => texts.map((p) => `<p>${formatMarkdown(p, 'font-bold text-orange-950')}</p>`).join('\n');
const expectNote = (html: string, texts: string[], label: string) => assert.ok(html.includes(paragraphs(texts)), `${label}: nota regulatoria del enlace antiguo`);

// Tarifa de un solo precio.
expectNote(renderProposalPage(stored({ distributor: 'EDENORTE', tariffCode: 'BTS1', gridExportFeePct: 25 })), [P1_EDES, P2, P3, charge('BTS1 (Residencial Monómica)', 25)], 'EDENORTE BTS1');
// Tarifa con cargo de potencia: los enlaces antiguos conservan la frase del 25 % que mostraban.
const btd = renderProposalPage(stored({ distributor: 'EDESUR', tariffCode: 'BTD', gridExportFeePct: 25 }));
assert.ok(btd.includes('equivalente al 25% del valor de la energía excedente exportada'), 'EDESUR BTD conserva su nota');
assert.ok(btd.includes(P1_EDES) && btd.includes(P2) && btd.includes(P3));
// Retención explícita distinta de la de fábrica.
assert.ok(renderProposalPage(stored({ distributor: 'EDEESTE', tariffCode: 'BTS2', gridExportFeePct: 10 })).includes('equivalente al 10% del valor de la energía excedente exportada'));
// Inyección cero con baterías.
expectNote(renderProposalPage(stored({ distributor: 'EDEESTE', tariffCode: 'BTS2', isZeroExport: true }, { hasBattery: true })), [
  'El sistema fotovoltaico operará bajo la modalidad de Inyección Cero (Zero-Export con limitador antivertido), suministrando energía prioritariamente a los consumos internos del inmueble y evitando cualquier inyección de excedentes hacia la red eléctrica de distribución.',
  P2, P3,
  'Al operar con limitador antivertido (inyección cero) y almacenamiento en baterías de litio, la totalidad de la energía solar se aprovecha internamente, por lo que el proyecto no genera cargos por derecho de uso de la red bajo la normativa vigente.',
], 'Inyección cero');
// CEPM.
const cepm = renderProposalPage(stored({ distributor: 'CEPM', tariffCode: 'RBT-1', gridExportFeePct: 25 }));
assert.ok(cepm.includes('consumo tomado de la red de CEPM'));
assert.ok(cepm.includes('equivalente al 25% del valor de la energía excedente exportada'));
// Una nota publicada (personalizada) gana siempre.
assert.ok(renderProposalPage({ ...stored({ distributor: 'EDESUR', tariffCode: 'BTD' }), project: { ...stored({ distributor: 'EDESUR', tariffCode: 'BTD' }).project, customization: { 'doc:projectDescription.regulatoryNote': 'Nota propia.' } } }).includes('Nota propia.'));

console.log('Visor: los enlaces antiguos conservan la nota regulatoria que mostraban.');
