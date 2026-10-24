import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { buildDocumentTextContext } from '../utils/documentTextContext';
import { docTextKey, isDocTextKey, publishedDocumentTexts, VIEWER_TEXT_KEYS, viewerText, DOCUMENT_TEXT_KEYS } from '../../shared/documentTexts';
import type { LegacyProjectSpecs, ProjectSimulation } from '../types';

const ctxFor = (project: ProjectSimulation) => buildDocumentTextContext(project, calculateProjectFinancialSummary(project), { currentDateStr: '21/10/2026' });
const base: ProjectSimulation = { ...structuredClone(BENCHMARK_PROJECT), customization: {} };

// A proposal with nothing customized publishes nothing: the Worker falls back to the shared defaults.
assert.deepEqual(publishedDocumentTexts(base, ctxFor(base)), {});

// Customized texts go out resolved, as strings under doc:<key>.
const custom: ProjectSimulation = {
  ...base,
  customization: {
    panelWarrantyText: '30 años **lineales**',
    customProjectSummaryParagraph1: 'Se instala **30 Módulos Anterior (600W)**, para {clientName}.',
    servicesIncludedText: '- Permisos\n- Planos',
    regulatoryNote: '', // texto de fábrica o vacío: sigue siendo dinámico, no se publica
    techIntroWhatIsText: 'FV propio',
    texts: { 'client.email': 'ignorado', 'quotation.warranty.panel': 'texts no se lee si hay campo heredado' },
  },
};
const published = publishedDocumentTexts(custom, ctxFor(custom));
assert.deepEqual(Object.keys(published).sort(), ['doc:projectDescription.paragraph1', 'doc:quotation.servicesIncluded', 'doc:quotation.warranty.panel', 'doc:techIntro.whatIs']);
assert.equal(published['doc:quotation.warranty.panel'], '30 años **lineales**');
assert.ok(published['doc:projectDescription.paragraph1'].includes('CENTRO MEDICO HISPANICO'), 'Los marcadores se publican ya sustituidos');
assert.ok(published['doc:projectDescription.paragraph1'].includes('38 Módulos'), 'Los números siguen la simulación');
assert.ok(Object.values(published).every((value) => typeof value === 'string'), 'El Worker solo acepta strings');
assert.ok(Object.keys(published).every((key) => isDocTextKey(key)));
assert.ok(VIEWER_TEXT_KEYS.every((key) => DOCUMENT_TEXT_KEYS.includes(key)), 'Todas las claves del visor existen en el registro');

// Viewer precedence: published doc: → legacy field → shared default.
const ctx = ctxFor(base);
assert.equal(viewerText('quotation.warranty.panel', { [docTextKey('quotation.warranty.panel')]: 'Publicado', panelWarrantyText: 'Heredado' }, base.client, ctx), 'Publicado');
assert.equal(viewerText('quotation.warranty.panel', { panelWarrantyText: 'Heredado' }, base.client, ctx), 'Heredado');
assert.equal(viewerText('quotation.warranty.panel', {}, base.client, ctx), '25 Años de Producción Lineal');
assert.equal(viewerText('quotation.warranty.panel', { panelWarrantyText: '25 Años de Producción Lineal' }, base.client, ctx), '25 Años de Producción Lineal');
assert.ok(viewerText('projectDescription.regulatoryNote', {}, base.client, ctx).includes('Medición Neta'), 'La nota regulatoria por defecto es la dinámica compartida');
assert.equal(isDocTextKey('doc:__proto__'), false);
assert.equal(isDocTextKey('doc:a.b'), true);
assert.equal(isDocTextKey('texts'), false);

// Published text uses equipment-group totals, and a combined inverter + battery bold block keeps both.
{
  const groups: ProjectSimulation = structuredClone(base);
  groups.specs.panels = [
    { id: 'a', brandModel: 'Panel A (600W)', powerW: 600, count: 10 },
    { id: 'b', brandModel: 'Panel B (620W)', powerW: 620, count: 20 },
  ] as never;
  groups.specs.hasBattery = true;
  (groups.specs as LegacyProjectSpecs).batteryCapacityKWh = 10;
  groups.customization = {
    customProjectSummaryParagraph1: 'Se instalarán {panelCount} paneles.',
    customProjectSummaryParagraph2: 'Adicionalmente, se contempla la instalación de **1 Inversor viejo y 1 Batería vieja** con estructura propia.',
  };
  const out = publishedDocumentTexts(groups, ctxFor(groups));
  assert.equal(out['doc:projectDescription.paragraph1'], 'Se instalarán 30 paneles.');
  const p2 = out['doc:projectDescription.paragraph2'];
  assert.ok(/Bater[íi]a/i.test(p2) && !p2.includes('vieja'), 'La batería sigue en el bloque combinado: ' + p2);
  assert.ok(p2.includes(' y ') && p2.includes('estructura propia'));
}

console.log('PASS: publicación de textos del documento para la propuesta web.');
