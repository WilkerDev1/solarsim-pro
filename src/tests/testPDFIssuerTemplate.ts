import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_LOCAL_COMPANY } from '../types/companyProfile';
import { documentLogo } from '../utils/documentLogo';
import { PDFCoverPage } from '../components/pdf/pages/PDFCoverPage';
import { PDFHeaderBanner } from '../components/pdf/PDFHeaderBanner';
import { companyDocumentCustomization } from '../utils/companyDocumentTemplate';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { changeWorkspace } from '../store/sync/organizationWorkspace';

const store = () => useSimulationStore.getState();
const issuerA = { ...DEFAULT_LOCAL_COMPANY, id: 'issuer-a', name: 'Empresa A', address: 'Perfil A' };
const issuerB = { ...DEFAULT_LOCAL_COMPANY, id: 'issuer-b', name: 'Empresa B', address: 'Perfil B' };
useSimulationStore.setState({ companies: [issuerA, issuerB], activeCompanyId: issuerA.id, projects: [], activeProjectId: '', documentTemplatesByCompany: {} });
store().createNewProject('Cliente original');
store().updateDocumentCustomization({ companyName: 'Empresa A S.R.L.', companyFooterText: 'Dirección completa A | contacto A', companyPhone: '+1 809 123 4567', companyWebsite: 'empresa-a.example', companyInstagram: 'empresa_a', companySlogan: 'El lema exclusivo A', aboutUsIntroText: 'Presentación de A', coverLogoBase64: 'data:image/png;base64,YQ==', headerLogoBase64: 'data:image/png;base64,Yg==', contactName: 'Contacto privado', clientEmail: 'privado@example.test', quoteDate: '2020-01-01' });
const original = structuredClone(store().getActiveProject());
// The edited document's issuer wins even if another company is selected.
store().setActiveCompany(issuerB.id);
store().saveCurrentProjectAsDefaultDocumentTemplate();
assert.equal(store().documentTemplatesByCompany[issuerA.id].companyFooterText, original.customization?.companyFooterText);
assert.equal(store().documentTemplatesByCompany[issuerA.id].clientEmail, undefined);
assert.equal(store().documentTemplatesByCompany[issuerA.id].quoteDate, undefined);
await new Promise(resolve => setTimeout(resolve, 5));
store().createNewProject('Cliente B');
assert.equal(store().getActiveProject().customization?.companyFooterText, 'Perfil B');
assert.equal(store().getActiveProject().customization?.coverLogoBase64, '');
assert.notEqual(store().getActiveProject().customization?.companySlogan, 'El lema exclusivo A');
assert.notEqual(store().getActiveProject().customization?.aboutUsIntroText, 'Presentación de A');
store().setActiveCompany(issuerA.id);
await new Promise(resolve => setTimeout(resolve, 5));
store().createNewProject('Cliente nuevo');
const next = store().getActiveProject();
for (const key of ['companyName', 'companyFooterText', 'companyPhone', 'companyWebsite', 'companyInstagram', 'coverLogoBase64', 'headerLogoBase64'] as const) {
  assert.equal(next.customization?.[key], original.customization?.[key], key);
}
assert.notEqual(next.customization?.contactName, 'Contacto privado');
assert.equal(next.customization?.quoteDate, undefined);
assert.equal(serializeSimulationStore(store()).documentTemplatesByCompany[issuerA.id].coverLogoBase64, original.customization?.coverLogoBase64);
const restored = { ...store(), ...JSON.parse(JSON.stringify(serializeSimulationStore(store()))) };
hydrateSimulationStore(restored);
assert.equal(restored.documentTemplatesByCompany[issuerA.id].companyFooterText, original.customization?.companyFooterText);
await new Promise(resolve => setTimeout(resolve, 5));
store().applyExtractedInvoice({ clientName: 'Cliente IA', monthlyConsumptionKWh: Array(12).fill(1000), distributor: 'EDEESTE', tariffCode: 'BTD', annualConsumptionKWh: 12000, averageMonthlyKWh: 1000, confidenceScore: 1 }, true);
assert.equal(store().getActiveProject().customization?.companyFooterText, original.customization?.companyFooterText);
assert.equal(store().getActiveProject().customization?.coverLogoBase64, original.customization?.coverLogoBase64);
// Render the actual cover with different company names: the selected image stays identical.
for (const name of ['ELECTSUN', 'Electsun Dominicana S.R.L.', 'Otra empresa']) {
  const customization = { ...next.customization, companyName: name };
  assert.equal(documentLogo(customization, 'cover'), original.customization?.coverLogoBase64);
  const html = renderToStaticMarkup(React.createElement(PDFCoverPage, { project: { ...next, customization }, summary: store().getFinancialSummary(), activeTheme: { id: 'test', name: 'Test', primary: '#123456', secondary: '#345678', accent: '#123456', accentDark: '#123456', accentLightBg: '#fff', accentBorder: '#123456', barColor: '#123456' }, currentDateStr: '7 octubre 2026' }));
  assert.ok(html.includes('src="data:image/png;base64,YQ=="'));
}
const theme = { id: 'test', name: 'Test', primary: '#123456', secondary: '#345678', accent: '#123456', accentDark: '#123456', accentLightBg: '#fff', accentBorder: '#123456', barColor: '#123456' };
for (const name of ['Electsun', 'Otra empresa S.R.L.']) {
  const header = renderToStaticMarkup(React.createElement(PDFHeaderBanner, { activeTheme: theme, projectId: next.id, clientName: next.client.name, systemCapacityKWp: 10, location: 'QA', currentDateStr: '7 octubre', pageTitle: 'QA', customization: { ...next.customization, companyName: name } }));
  assert.ok(header.includes('src="data:image/png;base64,Yg=="'));
}
const legacy = companyDocumentCustomization(issuerA, { quoteDate: '1990-01-01', clientEmail: 'old-client@example.test', attachedPdfs: [{ id: 'private', fileName: 'private.pdf', fileSize: 100, pageCount: 1, title: 'Private', uploadedAt: '', enabled: true, addToTableOfContents: true }], extraTocItems: [{ id: 'private', title: 'Private' }] }, {});
assert.equal(legacy.quoteDate, undefined);
assert.equal(legacy.clientEmail, '');
assert.equal(legacy.attachedPdfs, undefined);
assert.equal(legacy.extraTocItems, undefined);
assert.equal(documentLogo({ coverLogoBase64: '', headerLogoBase64: '' }, 'cover'), undefined);
assert.equal(documentLogo({ companyName: 'Empresa', headerLogoBase64: 'header' }, 'cover'), 'header');
assert.equal(documentLogo({ companyName: 'Otro' }, 'cover'), documentLogo({ companyName: 'Electsun' }, 'cover'));
const scoped = { ...store(), workspaceScope: 'local', organizationWorkspaces: {} };
const switched = changeWorkspace(scoped, { ...scoped.syncSettings, authToken: 'synthetic', currentUser: { id: 'test-user', name: 'Test', email: 'test@example.test', role: 'ADMIN', organizationId: 'other-org' } });
assert.deepEqual(switched.documentTemplatesByCompany, {});
const returned = changeWorkspace({ ...scoped, ...switched }, { ...scoped.syncSettings, authToken: null, currentUser: null });
assert.equal(returned.documentTemplatesByCompany?.[issuerA.id].companyFooterText, original.customization?.companyFooterText);
// Old archives without the new field must never carry a prior tenant's templates.
const oldWorkspace = { ...switched, documentTemplatesByCompany: undefined };
const oldArchiveState = { ...scoped, organizationWorkspaces: { [switched.workspaceScope!]: oldWorkspace } };
const oldArchive = changeWorkspace(oldArchiveState as typeof scoped, { ...scoped.syncSettings, authToken: 'synthetic', currentUser: { id: 'test-user', name: 'Test', email: 'test@example.test', role: 'ADMIN', organizationId: 'other-org' } });
assert.deepEqual(oldArchive.documentTemplatesByCompany, {});
store().resetDefaultDocumentCustomization();
assert.equal(store().documentTemplatesByCompany[issuerA.id], undefined);
assert.deepEqual(store().projects.find(project => project.id === original.id)?.customization, original.customization);
const beforeAmbiguousSave = store().documentTemplatesByCompany;
useSimulationStore.setState({ projects: store().projects.map(project => project.id === store().activeProjectId ? { ...project, companyProfileId: undefined } : project) });
store().updateDefaultDocumentCustomization({ companyFooterText: 'Must not persist' });
assert.equal(store().documentTemplatesByCompany, beforeAmbiguousSave);
assert.ok(store().saveFeedbackMessage?.includes('Selecciona'));
store().saveCurrentProjectAsDefaultDocumentTemplate();
assert.equal(store().documentTemplatesByCompany, beforeAmbiguousSave);
store().resetDefaultDocumentCustomization();
assert.equal(store().documentTemplatesByCompany, beforeAmbiguousSave);
console.log('PDF issuer templates, isolation, persistence and cover rendering passed.');
