import assert from 'node:assert/strict';
import { createDocumentTextContext, FACTORY_TEXTS, regulatoryNoteDefault, resolveDocumentText } from '../../shared/documentTexts';
import { connectionFlowDiagram } from '../components/pdf/pages/connectionFlowDiagram';

/**
 * Inyección cero: el sistema se diseña para el autoconsumo y una mayor independencia de la red. Ningún texto del
 * documento puede presentarlo como un sistema de medición neta, de exportación o de crédito de excedentes.
 * Conectado a red y aislado conservan sus textos.
 */

const EXPORT_WORDING = /medici[oó]n neta|net metering|excedente se acreditar|cr[eé]dito|derecho de uso de la red|bidireccional|exportaci[oó]n de excedentes|optimizar la inyecci/i;

// Contexto nuevo y heredado (solo `isZeroExport`, como las propuestas anteriores a `gridConnection`).
const zeroContexts = [
  createDocumentTextContext({ gridConnection: 'zero_export', isZeroExport: true, hasBattery: false }),
  createDocumentTextContext({ isZeroExport: true, hasBattery: true }),
];
const grid = createDocumentTextContext({});
const island = createDocumentTextContext({ gridConnection: 'off_grid', isZeroExport: true, hasBattery: true });

const text = (key: string, ctx = zeroContexts[0], source: object = {}) => resolveDocumentText(key, source, ctx).text;

for (const ctx of zeroContexts) {
  // Nota regulatoria: autoconsumo e independencia, sin medición neta ni cita de la norma de generación distribuida.
  const note = regulatoryNoteDefault(ctx);
  assert.ok(!EXPORT_WORDING.test(note), note);
  assert.ok(/autoconsumo/i.test(note), `nota: autoconsumo\n${note}`);
  assert.ok(/independencia/i.test(note), `nota: independencia de la red\n${note}`);
  assert.ok(/antivertido/i.test(note), 'nota: limitador antivertido');
  assert.ok(!/SIE-007/.test(note), `nota: la Res. SIE-007 regula la medición neta, no la inyección cero\n${note}`);

  for (const key of [
    'quotation.servicesIncluded', 'executiveSummary.footnoteRight', 'executiveSummary.footnote', 'aboutUs.pillar3.text',
    'executiveSummary.row2.injection', 'quotation.installTypeValue', 'toc.projectDescription.subtitle',
  ]) {
    const value = text(key, ctx);
    assert.ok(!EXPORT_WORDING.test(value), `${key}: ${value}`);
    assert.ok(!/SIE-007/.test(value), `${key} no cita la SIE-007: ${value}`);
  }
  assert.ok(/antivertido/i.test(text('quotation.servicesIncluded', ctx)), 'servicios: limitador antivertido');
  assert.ok(/autoconsumo/i.test(text('executiveSummary.footnoteRight', ctx)));
  assert.equal(text('executiveSummary.row2.injection', ctx), 'Modo de Operación');
  assert.ok(/autoconsumo/i.test(text('quotation.installTypeValue', ctx)));
}

// Los servicios se parten en viñetas por comas y punto y coma: cada servicio debe quedar entero.
assert.ok(!/[;]/.test(text('quotation.servicesIncluded')));
for (const item of text('quotation.servicesIncluded').replace(/\.$/, '').split(',')) assert.ok(item.trim().length > 3, item);

// Conectado a red: los textos de siempre.
assert.ok(/Medición Neta/.test(regulatoryNoteDefault(grid)));
assert.equal(text('quotation.servicesIncluded', grid), FACTORY_TEXTS.servicesIncludedText);
assert.equal(text('executiveSummary.footnoteRight', grid), 'Régimen de Medición Neta • Certificación CNE / SIE');
assert.equal(text('executiveSummary.footnote', grid), '* Estimación calculada conforme al marco regulatorio dominicano, Resolución SIE-007 y Ley 57-07.');
assert.equal(text('executiveSummary.row2.injection', grid), 'Régimen de Inyección');
assert.equal(text('quotation.installTypeValue', grid), 'Fotovoltaica');
assert.ok(/medición neta/i.test(text('aboutUs.pillar3.text', grid)));
assert.equal(text('toc.projectDescription.subtitle', grid), 'Criterios de Dimensionamiento y Resolución SIE-007');

// Aislado: sus textos no cambian.
assert.equal(text('executiveSummary.footnoteRight', island), 'Sistema aislado (modo isla) • Sin conexión a la red');
assert.ok(!/medición neta/i.test(text('quotation.servicesIncluded', island)));

// Un texto de fábrica guardado (de cualquier modo) sigue al modo actual; uno editado por el usuario se respeta.
for (const [key, source] of ([
  ['quotation.servicesIncluded', { customization: { servicesIncludedText: FACTORY_TEXTS.servicesIncludedText } }],
  ['executiveSummary.footnoteRight', { customization: { texts: { 'executiveSummary.footnoteRight': 'Régimen de Medición Neta • Certificación CNE / SIE' } } }],
  ['executiveSummary.footnote', { customization: { texts: { 'executiveSummary.footnote': '* Estimación calculada conforme al marco regulatorio dominicano, Resolución SIE-007 y Ley 57-07.' } } }],
  ['executiveSummary.row2.injection', { customization: { texts: { 'executiveSummary.row2.injection': 'Régimen de Inyección' } } }],
  ['quotation.installTypeValue', { customization: { texts: { 'quotation.installTypeValue': 'Fotovoltaica' } } }],
] as Array<[string, any]>)) {
  const resolved = resolveDocumentText(key, source, zeroContexts[0]);
  assert.ok(!EXPORT_WORDING.test(resolved.text) && !/SIE-007/.test(resolved.text), `${key} guardado de fábrica sigue al modo: ${resolved.text}`);
  // `quotation.servicesIncluded` se guarda en su campo heredado; el resto, en `texts`.
  const saved: any = key === 'quotation.servicesIncluded' ? { customization: { servicesIncludedText: resolved.text } } : { customization: { texts: { [key]: resolved.text } } };
  const back = resolveDocumentText(key, saved, grid).text;
  assert.equal(back, resolveDocumentText(key, {}, grid).text, `${key}: la variante de inyección cero guardada vuelve a la de red al cambiar de modo`);
}
const custom = 'Trámites con la distribuidora a cargo del cliente.';
assert.equal(resolveDocumentText('quotation.servicesIncluded', { customization: { servicesIncludedText: custom } } as any, zeroContexts[0]).text, custom, 'personalizado: intacto');

// Diagrama de flujo técnico: el de red muestra medición bidireccional; el de inyección cero, autoconsumo sin exportación.
const gridDiagram = connectionFlowDiagram('grid_export');
const zeroDiagram = connectionFlowDiagram('zero_export');
assert.notEqual(gridDiagram.src, zeroDiagram.src);
assert.ok(/^data:image\/svg\+xml/.test(zeroDiagram.src), 'diagrama de inyección cero en SVG');
const svg = decodeURIComponent(zeroDiagram.src.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
assert.ok(/ANTIVERTIDO/.test(svg) && /AUTOCONSUMO/.test(svg), 'el diagrama nombra el limitador y el autoconsumo');
assert.ok(!/EXPORTACI|NET METERING|BIDIRECCIONAL/i.test(svg), 'el diagrama de inyección cero no muestra exportación');
assert.ok(/autoconsumo/i.test(zeroDiagram.alt));

console.log('Inyección cero: textos del documento orientados al autoconsumo y la independencia de la red.');
