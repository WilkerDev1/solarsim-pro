// LEGADO: se elimina en F6 junto con applyExtractedInvoice (aiSlice) y el modal ai-invoice.
// Lo que de testPDFIssuerTemplate solo prueba el punto de entrada del asistente de propuestas: aplicarle la plantilla de la empresa emisora a la propuesta creada con applyExtractedInvoice.
// Parte de una suite mixta partida en F0 (red de seguridad del asistente único): la lógica que sobrevive sigue en la suite de origen.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_LOCAL_COMPANY } from '../types/companyProfile';

// Mismo emisor y plantilla de empresa de partida que testPDFIssuerTemplate.
const store = () => useSimulationStore.getState();
const issuerA = { ...DEFAULT_LOCAL_COMPANY, id: 'issuer-a', name: 'Empresa A', address: 'Perfil A' };
const issuerB = { ...DEFAULT_LOCAL_COMPANY, id: 'issuer-b', name: 'Empresa B', address: 'Perfil B' };
useSimulationStore.setState({ companies: [issuerA, issuerB], activeCompanyId: issuerA.id, projects: [], activeProjectId: '', documentTemplatesByCompany: {} });
store().createNewProject('Cliente original');
store().updateDocumentCustomization({ companyName: 'Empresa A S.R.L.', companyFooterText: 'Dirección completa A | contacto A', companyPhone: '+1 809 123 4567', companyWebsite: 'empresa-a.example', companyInstagram: 'empresa_a', companySlogan: 'El lema exclusivo A', aboutUsIntroText: 'Presentación de A', coverLogoBase64: 'data:image/png;base64,YQ==', headerLogoBase64: 'data:image/png;base64,Yg==', webHeaderLogoBase64: 'data:image/png;base64,d2Vi', contactName: 'Contacto privado', clientEmail: 'privado@example.test', quoteDate: '2020-01-01' });
const original = structuredClone(store().getActiveProject());
store().setActiveCompany(issuerB.id);
store().saveCurrentProjectAsDefaultDocumentTemplate();
store().setActiveCompany(issuerA.id);
await new Promise(resolve => setTimeout(resolve, 5));

// Una propuesta nueva del asistente de propuestas (applyExtractedInvoice) hereda la plantilla de la empresa emisora.
store().applyExtractedInvoice({ clientName: 'Cliente IA', monthlyConsumptionKWh: Array(12).fill(1000), distributor: 'EDEESTE', tariffCode: 'BTD', annualConsumptionKWh: 12000, averageMonthlyKWh: 1000, confidenceScore: 1 }, true);
assert.equal(store().getActiveProject().customization?.companyFooterText, original.customization?.companyFooterText);
assert.equal(store().getActiveProject().customization?.coverLogoBase64, original.customization?.coverLogoBase64);
console.log('PASS (legado): applyExtractedInvoice conserva la plantilla de la empresa emisora.');