// «Nueva cotización» nace con el emisor del membrete que usarían las propuestas nuevas, y el nombre del PDF.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { createAndOpenQuotation } from '../features/quotations/newQuotation';
import { issuerFromCompany } from '../features/quotations/issuer';
import { quotationPdfFileName } from '../features/quotations/exportQuotationPdf';
import type { CompanyProfile } from '../types/companyProfile';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const company = (extra: Partial<CompanyProfile>): CompanyProfile => ({
  id: 'comp-a', name: 'M&A Electsun SRL', rncOrId: '1-32-04088-2', phone: '809-378-6590', email: 'info@electsun.com.do', address: 'Plaza Toledo, Local 307',
  website: 'electsun.com.do', logoBase64: PNG, isDefault: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra,
});
const store = useSimulationStore;
const local = { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false };
const created = (overrides = {}) => {
  const result = createAndOpenQuotation(overrides);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return store.getState().quotations.find((q) => q.id === (result as { id: string }).id)!;
};

// El membrete activo (el de las propuestas nuevas) se copia al emisor; el logo, tal cual.
store.setState({ syncSettings: local, companies: [company({ id: 'comp-b', name: 'Otra SRL', isDefault: false }), company({})], activeCompanyId: 'comp-a', quotations: [], quotationChanges: {} });
const first = created();
assert.deepEqual(first.issuer, { name: 'M&A Electsun SRL', taxId: '1-32-04088-2', address: 'Plaza Toledo, Local 307', phone: '809-378-6590', email: 'info@electsun.com.do', website: 'electsun.com.do', logo: PNG });
assert.equal(store.getState().activeView, 'quotation-editor');

// Una referencia del servidor se copia tal cual.
const ref = `asset:sha256:${'b'.repeat(64)}`;
store.setState({ companies: [company({ logoBase64: ref })] });
assert.equal(created().issuer.logo, ref);

// Un emisor pasado explícitamente gana.
const explicit = created({ issuer: { name: 'Manual', taxId: '', address: '', phone: '', email: '', website: '', logo: '' } });
assert.equal(explicit.issuer.name, 'Manual');

// Sin membrete: emisor vacío (no se inventan datos).
store.setState({ companies: [], activeCompanyId: 'missing' });
assert.deepEqual(created().issuer, { name: '', taxId: '', address: '', phone: '', email: '', website: '', logo: '' });

// Un logo que la cotización no admite (p. ej. SVG) no impide crearla: el borrador nace sin logo.
store.setState({ companies: [company({ logoBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })], activeCompanyId: 'comp-a' });
const svg = created();
assert.equal(svg.issuer.logo, '');
assert.equal(svg.issuer.name, 'M&A Electsun SRL');

// El RNC ficticio de los ejemplos antiguos no se copia; los campos ausentes quedan vacíos.
assert.equal(issuerFromCompany(company({ rncOrId: '1-31-12345-6' })).taxId, '');
assert.deepEqual(issuerFromCompany(company({ website: undefined, logoBase64: undefined })), { name: 'M&A Electsun SRL', taxId: '1-32-04088-2', address: 'Plaza Toledo, Local 307', phone: '809-378-6590', email: 'info@electsun.com.do', website: '', logo: '' });
assert.deepEqual(issuerFromCompany(undefined), { name: '', taxId: '', address: '', phone: '', email: '', website: '', logo: '' });

// Nombre del archivo PDF.
assert.equal(quotationPdfFileName('COT-2026-0147'), 'COT-2026-0147.pdf');
assert.equal(quotationPdfFileName(null), 'Cotizacion-borrador.pdf');
assert.equal(quotationPdfFileName('  '), 'Cotizacion-borrador.pdf');
assert.equal(quotationPdfFileName('COT/2026:01*47?'), 'COT-2026-01-47.pdf');
assert.equal(quotationPdfFileName('../../etc'), 'etc.pdf');

console.log('Quotation issuer and export tests passed.');
