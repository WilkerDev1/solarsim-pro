import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentEditorProvider } from '../components/pdf/editor/DocumentEditorContext';
import { PDFProjectDescriptionPage } from '../components/pdf/pages/PDFProjectDescriptionPage';
import { PDFPage2Quotation } from '../components/pdf/pages/PDFPage2Quotation';
import { PDF_COLOR_THEMES } from '../constants/pdfThemes';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_LOCAL_COMPANY } from '../types/companyProfile';
import { canEditDocument, documentTextContextFor } from '../components/pdf/editor/documentEditorState';
import { resolveDocumentText } from '../../shared/documentTexts';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';

const store = () => useSimulationStore.getState();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const issuer = { ...DEFAULT_LOCAL_COMPANY, id: 'issuer-editor', name: 'Solar Norte', address: 'Santiago' };
useSimulationStore.setState({ companies: [issuer], activeCompanyId: issuer.id, projects: [], activeProjectId: '', documentTemplatesByCompany: {} });

// 1. New proposals no longer copy factory texts: the dynamic regulatory note shows and nothing is "customized".
store().createNewProject({ name: 'Clínica Del Valle', province: 'Santiago', distributor: 'CEPM', tariffCode: 'RBT-1' });
let project = store().getActiveProject();
for (const field of ['regulatoryNote', 'validityNote', 'aboutUsIntroText', 'panelWarrantyText', 'servicesIncludedText']) {
  assert.equal((project.customization as Record<string, unknown>)[field], undefined, `${field} no se copia de fábrica`);
}
const ctx = () => documentTextContextFor(store(), store().getActiveProject());
assert.ok(resolveDocumentText('projectDescription.regulatoryNote', project, ctx()).text.includes('CEPM'));
assert.ok(resolveDocumentText('aboutUs.intro', project, ctx()).text.startsWith('En SOLAR NORTE,'));

// 2. setDocumentTexts writes legacy fields and client mirrors, and records undo.
store().setActiveProject(project.id, 'simulator'); // abrir la propuesta fija la base del historial
await wait(700);
store().setDocumentTexts({ 'quotation.warranty.panel': '**30** años', 'client.phone': '809-777-1212' });
project = store().getActiveProject();
assert.equal(project.customization?.panelWarrantyText, '**30** años');
assert.equal(project.customization?.clientPhone, '809-777-1212');
assert.equal(project.client.contactPhone, '809-777-1212');
await wait(700);
assert.equal(store().canUndo, true, 'Editar un texto registra deshacer');
store().undo();
assert.notEqual(store().getActiveProject().customization?.panelWarrantyText, '**30** años');
store().redo();
assert.equal(store().getActiveProject().customization?.panelWarrantyText, '**30** años');

// 2b. Resetting contact/phone clears the client mirror too, so the edited value really disappears.
store().setDocumentTexts({ 'client.contact': 'Ing. Mario', 'client.phone': '809-111-0000' });
assert.equal(store().getActiveProject().client.contactPerson, 'Ing. Mario');
store().setDocumentTexts({ 'client.contact': null, 'client.phone': null });
assert.notEqual(resolveDocumentText('client.contact', store().getActiveProject(), ctx()).text, 'Ing. Mario');
assert.equal(resolveDocumentText('client.phone', store().getActiveProject(), ctx()).text, '');
assert.equal(store().getActiveProject().client.contactPhone, '');

// 3. Reset (null) restores the default.
store().setDocumentTexts({ 'quotation.warranty.panel': null });
assert.equal(resolveDocumentText('quotation.warranty.panel', store().getActiveProject(), ctx()).isCustomized, false);

// 4. updateDocumentCustomization also goes through the undo history and keeps the email mirror.
await wait(700);
store().updateDocumentCustomization({ clientEmail: 'compras@clinica.test', companySlogan: 'Lema' });
assert.equal(store().getActiveProject().client.contactEmail, 'compras@clinica.test');
await wait(700);
store().undo();
assert.notEqual(store().getActiveProject().customization?.companySlogan, 'Lema');
store().redo();

// 5. Saving to the company template uses placeholders and skips client data.
store().setDocumentTexts({ 'projectDescription.subtitle': 'Diseño exclusivo para Clínica Del Valle', 'client.contact': 'Dra. Ruiz' });
const result = store().saveDocumentTextsToCompanyTemplate(['projectDescription.subtitle', 'client.contact']);
assert.deepEqual(result, { saved: ['projectDescription.subtitle'], skipped: ['client.contact'] });
const template = store().documentTemplatesByCompany[issuer.id];
assert.equal(template.projectSummarySubtitle, 'Diseño exclusivo para {clientName}');
assert.equal(template.contactName, undefined, 'El contacto del cliente no entra en la plantilla');
store().createNewProject({ name: 'Hotel Playa', province: 'La Romana' });
assert.equal(resolveDocumentText('projectDescription.subtitle', store().getActiveProject(), ctx()).text, 'Diseño exclusivo para Hotel Playa');

// 6. Trashed proposals cannot be edited, through the store or the editor.
const trashedId = store().activeProjectId;
store().moveToTrash(trashedId);
useSimulationStore.setState({ activeProjectId: trashedId });
const trashed = () => store().projects.find((item) => item.id === trashedId)!;
const before = structuredClone(trashed());
assert.equal(before.isDeleted, true);
store().setDocumentTexts({ 'quotation.warranty.inverter': 'No debe guardarse' });
assert.deepEqual(trashed().customization, before.customization);
// History is read-only for trashed proposals too (undo/redo cannot rewrite them).
useSimulationStore.setState({ undoStack: [structuredClone(before), { ...structuredClone(before), client: { ...before.client, name: 'Otro nombre' } }], redoStack: [structuredClone(before)], canUndo: true, canRedo: true });
store().undo();
store().redo();
assert.deepEqual(trashed().client, before.client, 'Deshacer/rehacer no modifican la papelera');
assert.equal(canEditDocument({ project: before, user: null }), false, 'Papelera: solo lectura');

// 7. Readers and conflicted proposals are read-only; writers in local mode can edit.
const writable = { ...before, isDeleted: false };
assert.equal(canEditDocument({ project: writable, user: null }), true);
assert.equal(canEditDocument({ project: writable, user: { role: 'LECTOR' } }), false);
assert.equal(canEditDocument({ project: { ...writable, syncStatus: 'conflict' }, user: { role: 'EDITOR' } }), false);

// 8. Pages render every text through the registry; chrome only exists in edit mode.
{
  const page = { ...structuredClone(before), isDeleted: false, customization: { ...before.customization, regulatoryNote: undefined } };
  const summary = calculateProjectFinancialSummary(page);
  const theme = (Array.isArray(PDF_COLOR_THEMES) ? PDF_COLOR_THEMES[0] : Object.values(PDF_COLOR_THEMES)[0]) as any;
  const props = { project: page, summary, activeTheme: theme, showHeadersFooters: true, currentDateStr: '21/10/2026', pageNum: 5, totalPages: 9 };
  const render = (mode: 'view' | 'edit' | 'export', element: React.ReactElement) => renderToStaticMarkup(
    React.createElement(DocumentEditorProvider, { project: page, summary, currentDateStr: '21/10/2026', mode, writable: true, children: element }),
  );
  const description = React.createElement(PDFProjectDescriptionPage, props);
  const view = render('view', description);
  for (const key of ['projectDescription.subtitle', 'projectDescription.paragraph1', 'projectDescription.paragraph2', 'projectDescription.regulatoryNote']) {
    assert.ok(view.includes(`data-doc-text="${key}"`), key);
  }
  assert.ok(view.includes('Medición Neta'), 'La nota regulatoria dinámica se muestra');
  assert.ok(!view.includes('data-pdf-chrome'), 'Sin cromo de edición en la vista');
  assert.ok(!render('export', description).includes('data-pdf-chrome'), 'Sin cromo al exportar');
  assert.ok(render('edit', description).includes('data-pdf-chrome'), 'Cromo de edición en modo edición');
  const quotation = render('view', React.createElement(PDFPage2Quotation, props));
  for (const key of ['client.name', 'client.contact', 'client.phone', 'client.address', 'quote.number', 'quote.date', 'quote.validityDays', 'quotation.warranty.panel', 'quotation.servicesIncluded', 'quotation.validityNote']) {
    assert.ok(quotation.includes(`data-doc-text="${key}"`), key);
  }
  // A key rendered twice (cover + quotation date) keeps one editor: the active instance is tracked apart from the key.
  assert.equal((quotation.match(/data-doc-text="quote.date"/g) || []).length, 1);
  assert.ok(readFileSync('src/components/pdf/editor/EditableText.tsx', 'utf8').includes('editor.activeInstance === instance'));
  // Without a provider (tests, standalone renders) the pages fall back to read-only texts.
  assert.ok(!renderToStaticMarkup(description).includes('data-pdf-chrome'));
}

console.log('PASS: document editor store actions (texts, undo, templates, read-only rules).');
