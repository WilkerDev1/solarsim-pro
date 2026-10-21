import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../constants/defaultDocumentCustomization';
import { formatProposalDate } from '../utils/formatDateUtils';
import { buildDocumentTextContext } from '../utils/documentTextContext';
import { cleanClientName, getTariffDisplayName } from '../../shared/proposalPresentation';
import { resolveDynamicProjectSummaryParagraph1, resolveDynamicProjectSummaryParagraph2 } from '../utils/textFormatter';
import {
  formatBatteriesSummary,
  formatInvertersSummary,
  formatPanelsSummary,
  calculateTotalBatteryCapacityKWh,
} from '../utils/equipmentSpecsUtils';
import {
  applyDocumentTextPatch,
  companyTemplateTextPatch,
  DOCUMENT_TEXT_DEFINITIONS,
  documentTextPatch,
  documentTextResetPatch,
  documentTextsPatch,
  FACTORY_TEXTS,
  listDocumentTexts,
  resolveDocumentText,
  templateTexts,
  templatizeText,
} from '../../shared/documentTexts';
import type { DocumentCustomization, FinancialSummaryResult, ProjectSimulation } from '../types';

/*
 * Caracterización (B1): los 26 puntos editables de 2.6.x dan el mismo texto con el registro.
 * Los oráculos copian la lógica de las páginas antes del refactor. Diferencias intencionales,
 * documentadas en EXPECTED_DIFFERENCES:
 *  - regulatoryNote: un valor de fábrica guardado ya no oculta la nota dinámica (tarifa, inyección cero, baterías);
 *  - validityNote: el texto por defecto sigue los días de validez ("Precios sujetos… N días laborables.");
 *  - aboutUs.transition: restablecer ('') vuelve al texto de fábrica en vez de dejar el párrafo vacío;
 *  - aboutUs.intro / whyChooseUs: el texto de fábrica usa el nombre de la empresa emisora;
 *  - quote.date en la cotización: se muestra formateada, como en la portada.
 */

const DEFAULT_SERVICES = 'Permisos y Tramitación ante CNE y Distribuidora, Medición Neta, Planos Eléctricos, Instalación Certificada y Puesta en Marcha.';

/** Texto que mostraba cada punto (modo vista de InlineEditableText: valor no vacío o defaultValue). */
function legacySites(project: ProjectSimulation, summary: FinancialSummaryResult, currentDateStr: string): Record<string, string> {
  const cust: DocumentCustomization = project.customization || {};
  const eff = (value: string | null | undefined, fallback = '') => (value !== undefined && value !== null && value !== '' ? value : fallback);
  const days = project.client.quoteValidityDays || 7;

  // PDFAboutUsPage
  const companyName = cust.companyName || DEFAULT_DOCUMENT_CUSTOMIZATION.companyName || 'ELECTSUN';
  const transitionPhrase = 'Descubre cómo nuestros productos y servicios pueden ayudarte a aprovechar al máximo la energía del sol.';
  let rawIntroText = cust.aboutUsIntroText !== undefined ? cust.aboutUsIntroText : (DEFAULT_DOCUMENT_CUSTOMIZATION.aboutUsIntroText || '');
  if (rawIntroText.includes(transitionPhrase)) rawIntroText = rawIntroText.replace(transitionPhrase, '').trim();
  const aboutUsIntroText = rawIntroText || `En ${companyName.toUpperCase()}, transformamos la energía solar en una solución inteligente, sostenible y accesible para todos. Creemos en un futuro más limpio y eficiente, y estamos aquí para hacerlo posible.`;
  const aboutUsTransitionText = cust.aboutUsTransitionText !== undefined ? cust.aboutUsTransitionText : (DEFAULT_DOCUMENT_CUSTOMIZATION.aboutUsTransitionText || transitionPhrase);
  const whyChooseUsText = cust.whyChooseUsText || DEFAULT_DOCUMENT_CUSTOMIZATION.whyChooseUsText || '';

  // PDFProjectDescriptionPage
  const regulatory = () => {
    if (cust.regulatoryNote && cust.regulatoryNote !== DEFAULT_DOCUMENT_CUSTOMIZATION.regulatoryNote) return cust.regulatoryNote.split('\n\n').filter(Boolean);
    const isZeroExport = !!project.rates.isZeroExport;
    const distributor = project.client.distributor || project.rates.distributor || 'EDES';
    const isCEPM = distributor === 'CEPM';
    const tariff = project.rates.tariffCode || (isCEPM ? 'RBT-1' : 'BTS2');
    const tariffDisplayName = getTariffDisplayName(distributor, tariff);
    const exportFee = project.rates.gridExportFeePct ?? 25;
    const p1 = isZeroExport
      ? 'El sistema fotovoltaico operará bajo la modalidad de Inyección Cero (Zero-Export con limitador antivertido), suministrando energía prioritariamente a los consumos internos del inmueble y evitando cualquier inyección de excedentes hacia la red eléctrica de distribución.'
      : `La energía generada mensualmente se descontará del consumo tomado de la red de ${isCEPM ? 'CEPM' : 'la distribuidora eléctrica (EDES)'}. Cuando la producción supere el consumo, el excedente se acreditará como descuento en su factura eléctrica bajo el régimen de Medición Neta.`;
    const p2 = 'La presente propuesta ha sido elaborada conforme a la Resolución SIE-007-2026-REG y se basa en criterios técnicos y el historial de consumo del cliente.';
    const p3 = 'Los ahorros indicados son estimados y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.';
    const p4 = isZeroExport
      ? `Al operar con limitador antivertido (inyección cero)${project.specs.hasBattery ? ' y almacenamiento en baterías de litio' : ''}, la totalidad de la energía solar se aprovecha internamente, por lo que el proyecto no genera cargos por derecho de uso de la red bajo la normativa vigente.`
      : `Para la tarifa ${tariffDisplayName}, el análisis económico considera el cargo por derecho de uso de la red, equivalente al ${exportFee}% del valor de la energía excedente exportada, conforme al régimen de Medición Neta y la normativa vigente (Resolución SIE-007-2026-REG). Por esta razón, el sistema se diseña para maximizar el autoconsumo y optimizar la inyección de energía, obteniendo así el mayor retorno de inversión posible.${project.specs.hasBattery ? '' : ' Cuando resulte conveniente, se recomendará la incorporación de baterías de litio para incrementar el aprovechamiento directo de la energía generada.'}`;
    return [p1, p2, p3, p4];
  };
  const clientName = cleanClientName(project.client.name || 'Cliente');
  const s = project.specs;
  const rawPanelModel = s.panelBrandModel || 'Módulos Monocristalinos TOPCon';
  const panelModel = (rawPanelModel.toLowerCase().includes('w') || (s.panelPowerW || 0) <= 0) ? rawPanelModel : `${rawPanelModel} (${s.panelPowerW}W)`;
  const rawInverterModel = s.inverterBrandModel || 'Inversor Solar Inteligente';
  const inverterModel = (rawInverterModel.toLowerCase().includes('kw') || (s.inverterPowerKW || 0) <= 0) ? rawInverterModel : `${rawInverterModel} (${s.inverterPowerKW || (summary.systemCapacityKWp * 0.9).toFixed(1)} kW)`;
  const rawBatteryModel = s.batteryBrandModel || 'Batería de Litio LiFePO4';
  const batteryModel = (rawBatteryModel.toLowerCase().includes('kwh') || (s.batteryCapacityKWh || 0) <= 0) ? rawBatteryModel : `${rawBatteryModel} (${s.batteryCapacityKWh} kWh)`;
  const hasMultiPanels = !!(s.panels && s.panels.length > 1);
  const panelsSummaryText = hasMultiPanels ? formatPanelsSummary(s) : `${s.panelCount} ${panelModel}`;
  const hasMultiInverters = !!(s.inverters && s.inverters.length > 1);
  const invertersSummaryText = hasMultiInverters ? formatInvertersSummary(s) : `${s.inverterCount || 1} ${inverterModel}`;
  const hasMultiBatteries = !!(s.batteries && s.batteries.length > 1);
  const batteriesSummaryText = hasMultiBatteries ? formatBatteriesSummary(s) : `${s.batteryCount || 1} ${batteryModel}`;
  const totalBESSKWh = calculateTotalBatteryCapacityKWh(s);
  const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const defaultParagraph1 = `El consumo promedio anual de **${clientName}** es de **${fmt(summary.annualConsumptionKWh)} kWh**, por lo que se le propone la instalación de **${panelsSummaryText}**, alcanzando una potencia DC instalada de **${summary.systemCapacityKWp.toFixed(2)} kWp**. La producción energética estimada para este sistema es de **${fmt(summary.annualProductionKWh)} kWh anuales**, representando el **${summary.energyCoveragePct.toFixed(1)}%** del consumo total del cliente.`;
  const scope = cust.projectEngineeringScopeText !== undefined && cust.projectEngineeringScopeText.trim() !== '' ? cust.projectEngineeringScopeText.trim() : DEFAULT_DOCUMENT_CUSTOMIZATION.projectEngineeringScopeText || '';
  const defaultParagraph2 = `Adicionalmente, se contempla la instalación de **${invertersSummaryText}**${s.hasBattery && totalBESSKWh > 0 ? ` y **${batteriesSummaryText}**` : ''} ${scope}`;
  const p1 = resolveDynamicProjectSummaryParagraph1(cust.customProjectSummaryParagraph1, defaultParagraph1, project, summary, clientName, hasMultiPanels ? panelsSummaryText : panelModel);
  const p2 = resolveDynamicProjectSummaryParagraph2(cust.customProjectSummaryParagraph2, defaultParagraph2, project, hasMultiInverters ? invertersSummaryText : inverterModel, hasMultiBatteries ? batteriesSummaryText : batteryModel, scope);

  // PDFPage2Quotation
  const contactName = cust.contactName !== undefined ? cust.contactName : (project.client.contactPerson || project.client.company || clientName || '');
  const rawClientPhone = cust.clientPhone !== undefined ? cust.clientPhone : (project.client.contactPhone || '');
  const clientPhone = (rawClientPhone.includes('555-0199') || rawClientPhone.includes('5550199') || rawClientPhone === '+1 (809) 000-0000') ? '' : rawClientPhone;
  const defaultValidityNote = `* Equipos según disponibilidad de inventario | * Propuesta válida por ${days} días | * Precios en USD *`;

  return {
    'cover.quoteDate': currentDateStr,
    'cover.validityDays': String(days),
    'aboutUs.intro': eff(cust.aboutUsIntroText, aboutUsIntroText),
    'aboutUs.transition': eff(cust.aboutUsTransitionText, aboutUsTransitionText),
    'aboutUs.whyChooseUs': eff(cust.whyChooseUsText, whyChooseUsText),
    'benefits.ley5707Intro': eff(cust.ley5707ObjectivesIntroText, DEFAULT_DOCUMENT_CUSTOMIZATION.ley5707ObjectivesIntroText),
    'techIntro.whatIs': eff(cust.techIntroWhatIsText, DEFAULT_DOCUMENT_CUSTOMIZATION.techIntroWhatIsText),
    'techIntro.howItWorks1': eff(cust.techIntroHowItWorksParagraph1, DEFAULT_DOCUMENT_CUSTOMIZATION.techIntroHowItWorksParagraph1),
    'techIntro.howItWorks2': eff(cust.techIntroHowItWorksParagraph2, DEFAULT_DOCUMENT_CUSTOMIZATION.techIntroHowItWorksParagraph2),
    'projectDescription.subtitle': eff(cust.projectSummarySubtitle, `Criterios de dimensionamiento técnico para ${clientName}`),
    'projectDescription.paragraph1': eff(p1, defaultParagraph1),
    'projectDescription.paragraph2': eff(p2, defaultParagraph2),
    'projectDescription.regulatoryNote': eff(cust.regulatoryNote, regulatory().join('\n\n')),
    'quotation.clientName': eff(project.client.name, 'Cliente'),
    'quotation.contact': eff(contactName, ''),
    'quotation.phone': eff(clientPhone, ''),
    'quotation.address': eff(project.client.address || '', `${project.client.province || project.client.location || 'Santo Domingo'}, República Dominicana`),
    'quotation.quoteNumber': eff(project.client.quoteNumber || 'C-0001', 'C-0001'),
    'quotation.quoteDate': eff(project.client.quoteDate || currentDateStr, currentDateStr),
    'quotation.validityDays': String(days),
    'quotation.warranty.panel': eff(cust.panelWarrantyText, DEFAULT_DOCUMENT_CUSTOMIZATION.panelWarrantyText),
    'quotation.warranty.inverter': eff(cust.inverterWarrantyText, DEFAULT_DOCUMENT_CUSTOMIZATION.inverterWarrantyText),
    'quotation.warranty.battery': eff(cust.batteryWarrantyText, DEFAULT_DOCUMENT_CUSTOMIZATION.batteryWarrantyText),
    'quotation.warranty.workmanship': eff(cust.workmanshipWarrantyText, DEFAULT_DOCUMENT_CUSTOMIZATION.workmanshipWarrantyText),
    'quotation.servicesIncluded': cust.servicesIncludedText !== undefined && cust.servicesIncludedText !== '' ? cust.servicesIncludedText : DEFAULT_DOCUMENT_CUSTOMIZATION.servicesIncludedText || DEFAULT_SERVICES,
    'quotation.validityNote': eff(cust.validityNote, defaultValidityNote),
  };
}

/** Punto de 2.6.x → clave del registro. */
const SITE_KEYS: Record<string, string> = {
  'cover.quoteDate': 'quote.date',
  'cover.validityDays': 'quote.validityDays',
  'quotation.clientName': 'client.name',
  'quotation.contact': 'client.contact',
  'quotation.phone': 'client.phone',
  'quotation.address': 'client.address',
  'quotation.quoteNumber': 'quote.number',
  'quotation.quoteDate': 'quote.date',
  'quotation.validityDays': 'quote.validityDays',
};

const base = structuredClone(BENCHMARK_PROJECT) as ProjectSimulation;
const summary = calculateProjectFinancialSummary(base);
const seeded = { ...DEFAULT_DOCUMENT_CUSTOMIZATION, contactName: 'CENTRO MEDICO HISPANICO SRL', clientPhone: '', clientEmail: '' };
const textFields = Object.keys(FACTORY_TEXTS).concat(['projectSummarySubtitle', 'customProjectSummaryParagraph1', 'customProjectSummaryParagraph2']);

const FIXTURES: Record<string, ProjectSimulation> = {
  seeded: { ...base, customization: seeded },
  legacy: { ...base, customization: undefined },
  custom: {
    ...base,
    client: { ...base.client, quoteDate: '15/10/2026', quoteValidityDays: 12 },
    customization: {
      ...seeded,
      contactName: 'Ing. Pérez',
      clientPhone: '809-222-3344',
      aboutUsIntroText: 'Somos **pioneros** del Caribe.',
      aboutUsTransitionText: 'Transición propia.',
      whyChooseUsText: 'Porque sí.',
      ley5707ObjectivesIntroText: 'Ley **propia**.',
      techIntroWhatIsText: 'FV propio.',
      techIntroHowItWorksParagraph1: 'Cómo 1.',
      techIntroHowItWorksParagraph2: 'Cómo 2.',
      projectSummarySubtitle: 'Subtítulo propio',
      customProjectSummaryParagraph1: 'Se instala **30 Módulos Anterior (600W)**, alcanzando una potencia DC instalada de **18.00 kWp**.',
      customProjectSummaryParagraph2: 'Además se instala **1 Inversor viejo**. {scopeText}',
      projectEngineeringScopeText: 'con estructuras propias.',
      regulatoryNote: 'Nota regulatoria propia.\n\nSegundo párrafo.',
      panelWarrantyText: '**30** años',
      inverterWarrantyText: '12 años',
      batteryWarrantyText: '10 años',
      workmanshipWarrantyText: '2 años',
      servicesIncludedText: 'Permisos, Planos',
      validityNote: 'Nota propia de validez',
    },
  },
  reset: {
    ...base,
    customization: { ...seeded, ...Object.fromEntries(textFields.map((field) => [field, ''])), contactName: '', clientPhone: '' },
  },
  otherCompany: {
    ...base,
    client: { ...base.client, quoteDate: '2026-10-21', quoteValidityDays: 10, distributor: 'CEPM' },
    rates: { ...base.rates, isZeroExport: true, distributor: 'CEPM', tariffCode: 'RBT-2' },
    customization: { ...seeded, companyName: 'Acme Solar' },
  },
};

const EXPECTED_DIFFERENCES = new Set([
  'seeded:projectDescription.regulatoryNote',
  'legacy:quotation.validityNote',
  'reset:quotation.validityNote',
  'reset:aboutUs.transition',
  'otherCompany:projectDescription.regulatoryNote',
  'otherCompany:quotation.validityNote',
  'otherCompany:aboutUs.intro',
  'otherCompany:aboutUs.whyChooseUs',
  'otherCompany:quotation.quoteDate',
]);

let compared = 0;
for (const [name, project] of Object.entries(FIXTURES)) {
  const projectSummary = calculateProjectFinancialSummary(project);
  const currentDateStr = formatProposalDate(project.client.quoteDate || project.customization?.quoteDate);
  const ctx = buildDocumentTextContext(project, projectSummary, { currentDateStr });
  const legacy = legacySites(project, projectSummary, currentDateStr);
  assert.equal(Object.keys(legacy).length, 26, 'Los 26 puntos editables de 2.6.x');
  for (const [site, expected] of Object.entries(legacy)) {
    const key = SITE_KEYS[site] || site;
    const actual = resolveDocumentText(key, project, ctx).text;
    const id = `${name}:${site}`;
    if (EXPECTED_DIFFERENCES.has(id)) assert.notEqual(actual, expected, `${id} debía cambiar (diferencia documentada)`);
    else assert.equal(actual, expected, `${id} (${key})`);
    compared++;
  }
}
assert.equal(compared, 26 * Object.keys(FIXTURES).length);

// Dynamic regulatory note now reaches seeded proposals and follows zero-export / CEPM.
{
  const project = FIXTURES.otherCompany;
  const ctx = buildDocumentTextContext(project, calculateProjectFinancialSummary(project), { currentDateStr: 'hoy' });
  const note = resolveDocumentText('projectDescription.regulatoryNote', project, ctx);
  assert.equal(note.source, 'default');
  assert.equal(note.isCustomized, false);
  assert.ok(note.text.includes('Inyección Cero'));
  assert.ok(resolveDocumentText('aboutUs.intro', project, ctx).text.startsWith('En ACME SOLAR,'));
  assert.ok(resolveDocumentText('quotation.validityNote', project, ctx).text.includes('10 días'));
}

// A proposal created with 2.6.x (factory values in its fields) shows nothing as customized.
{
  const project = FIXTURES.seeded;
  const ctx = buildDocumentTextContext(project, summary, { currentDateStr: '21/10/2026' });
  const customized = listDocumentTexts(project, ctx).filter((item) => item.isCustomized && !item.key.startsWith('company.') && !item.key.startsWith('client.') && !item.key.startsWith('quote.'));
  assert.deepEqual(customized.map((item) => item.key), [], 'Por Defecto ya no aparece en propuestas sin cambios');
}

// Writing: legacy fields, mirrors, reset and "writing the default resets".
{
  const project = FIXTURES.seeded;
  const ctx = buildDocumentTextContext(project, summary, { currentDateStr: '21/10/2026' });
  const warranty = documentTextPatch('quotation.warranty.panel', '  **30** años  ', project, ctx);
  assert.deepEqual(warranty, { customization: { panelWarrantyText: '**30** años' } });
  const phone = documentTextPatch('client.phone', '809-111-2222', project, ctx);
  assert.deepEqual(phone, { customization: { clientPhone: '809-111-2222' }, client: { contactPhone: '809-111-2222' } });
  assert.deepEqual(documentTextPatch('quote.validityDays', '15 días', project, ctx), { client: { quoteValidityDays: 15 } });
  assert.deepEqual(documentTextPatch('client.name', 'Nuevo Cliente', project, ctx), { client: { name: 'Nuevo Cliente' } });
  // Writing the dynamic default keeps it dynamic.
  const regulatoryDefault = resolveDocumentText('projectDescription.regulatoryNote', project, ctx).text;
  assert.deepEqual(documentTextPatch('projectDescription.regulatoryNote', regulatoryDefault, project, ctx), { customization: { regulatoryNote: '' } });
  assert.deepEqual(documentTextResetPatch('client.contact', project), { customization: { contactName: undefined } });
  assert.deepEqual(documentTextResetPatch('client.name', project), {}, 'El nombre del cliente no se restablece');
  // Single-line plain fields drop formatting and line breaks.
  assert.deepEqual(documentTextPatch('company.phone', '**809**\n111', project, ctx), { customization: { companyPhone: '809 111' } });

  const applied = applyDocumentTextPatch(project, documentTextsPatch({ 'quotation.warranty.panel': '40 años', 'client.phone': '809-000-1111', 'aboutUs.intro': null }, project, ctx));
  assert.equal(resolveDocumentText('quotation.warranty.panel', applied, ctx).text, '40 años');
  assert.equal(applied.client.contactPhone, '809-000-1111');
  assert.equal(applied.customization?.aboutUsIntroText, '');
}

// Placeholders and templates: the client's literal name never reaches the company template.
{
  const project = FIXTURES.custom;
  const ctx = buildDocumentTextContext(project, summary, { currentDateStr: 'hoy' });
  assert.equal(templatizeText('Propuesta para CENTRO MEDICO HISPANICO (Ing. Pérez, 809-222-3344)', { ...ctx, clientContactPerson: 'Ing. Pérez', clientPhone: '809-222-3344' }), 'Propuesta para {clientName} ({contactName}, {clientPhone})');
  const withName = applyDocumentTextPatch(project, documentTextPatch('projectDescription.subtitle', 'Dimensionamiento para CENTRO MEDICO HISPANICO', project, ctx));
  const { patch, skipped } = companyTemplateTextPatch(['projectDescription.subtitle', 'client.contact', 'quotation.warranty.inverter', 'techIntro.whatIs'], withName, ctx);
  assert.equal(patch.projectSummarySubtitle, 'Dimensionamiento para {clientName}');
  assert.equal(patch.inverterWarrantyText, '12 años');
  assert.deepEqual(skipped, ['client.contact'], 'Contacto no es plantillable (antes: Hacer Permanente sin efecto)');
  assert.equal(resolveDocumentText('projectDescription.subtitle', { customization: { projectSummarySubtitle: '{cliente} — dimensionamiento' } as DocumentCustomization }, { ...ctx, clientName: 'OTRO' }).text, 'OTRO — dimensionamiento');
  const filtered = templateTexts({ contactName: 'x', clientPhone: 'y', panelWarrantyText: 'z', texts: { 'client.email': 'a', 'aboutUs.intro': 'b', unknown: 'c' } });
  assert.deepEqual(filtered, { panelWarrantyText: 'z', texts: { 'aboutUs.intro': 'b' } });
}

// Registry hygiene: unique keys, every legacy field is a string field of DocumentCustomization or client.
{
  const keys = DOCUMENT_TEXT_DEFINITIONS.map((definition) => definition.key);
  assert.equal(new Set(keys).size, keys.length, 'Claves únicas');
  for (const definition of DOCUMENT_TEXT_DEFINITIONS) {
    assert.ok(/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(definition.key), `Clave estable: ${definition.key}`);
    assert.ok(definition.maxLength > 0 && definition.label.length > 0);
    assert.ok(!(definition.templatable && definition.clientField), `${definition.key}: los datos del cliente no van en plantillas`);
  }
}

console.log(`PASS: registro de textos del documento (${compared} comparaciones con 2.6.x, diferencias documentadas: ${EXPECTED_DIFFERENCES.size}).`);
