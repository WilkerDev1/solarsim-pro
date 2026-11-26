// Acciones del editor de cotización con el store real (features/quotations/editorActions.ts), sello del membrete que
// emitió la cotización, emisor recortado a sus límites, confirmación del cambio de moneda y la guarda «mirar no
// escribe» sobre el código de editor/.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { QUOTATION_LIMITS, emptyQuotationContent } from '../../shared/quotations';
import { useSimulationStore } from '../store/useSimulationStore';
import { quotationEditorActions } from '../features/quotations/editorActions';
import { companyForIssuer, issuerFromCompany, stampForIssuer } from '../features/quotations/issuer';
import { createAndOpenQuotation } from '../features/quotations/newQuotation';
import { currencyChangeSummary, setDocumentFields } from '../domain/quotationEdit';
import type { CompanyProfile } from '../types/companyProfile';
import type { ClientRecord } from '../types/client';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const SEAL_A = 'data:image/png;base64,QUFB';
const SEAL_B = 'data:image/png;base64,QkJC';
const company = (extra: Partial<CompanyProfile>): CompanyProfile => ({
  id: 'comp-a', name: 'M&A Electsun SRL', rncOrId: '1-32-04088-2', phone: '809-378-6590', email: 'info@electsun.com.do', address: 'Plaza Toledo',
  website: 'electsun.com.do', logoBase64: PNG, isDefault: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra,
});
const client: ClientRecord = { id: 'c-1', kind: 'empresa', name: 'Hotel Brisa', taxId: '131123456', phone: '809-555-1234', email: 'h@brisa.do', address: 'Calle 1', province: '', notes: '', createdAt: '2026-01-01T00:00:00Z' };
const store = useSimulationStore;
store.setState({
  syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false },
  companies: [company({}), company({ id: 'comp-b', name: 'Otra Empresa SRL', rncOrId: '1-01-00000-1', signatureSealBase64: SEAL_B, isDefault: false })],
  activeCompanyId: 'comp-a', quotations: [], quotationChanges: {}, clients: [client],
});

// Dos confirmaciones seguidas parten del contenido guardado más reciente: ninguna pisa a la otra.
const created = createAndOpenQuotation();
assert.ok(created.ok);
const id = (created as { id: string }).id;
const actions = quotationEditorActions(store.getState, id);
const stale = store.getState().quotations.find((q) => q.id === id)!; // lo que tenía la última pintura
assert.equal(actions.edit((c) => setDocumentFields(c, { seller: 'Mayler' })), null);
assert.equal(actions.edit((c) => setDocumentFields(c, { notes: 'Nota' })), null);
let saved = store.getState().quotations.find((q) => q.id === id)!;
assert.equal(saved.seller, 'Mayler');
assert.equal(saved.notes, 'Nota');
assert.equal(stale.notes, '', 'la copia de la pintura no se reutiliza');
assert.equal(actions.edit((c) => c), null, 'sin cambios no se escribe');
assert.ok(actions.edit((c) => setDocumentFields(c, { validUntil: '1999-01-01' })), 'la validación del store rechaza y se devuelve el mensaje');

// Elegir un cliente enlaza y copia; quitarlo solo desenlaza.
assert.equal(actions.edit((c) => ({ ...c, client: { ...c.client, attention: 'Ing. Pérez' } })), null);
assert.equal(actions.chooseClient(client), null);
saved = store.getState().quotations.find((q) => q.id === id)!;
assert.equal(saved.clientId, 'c-1');
assert.deepEqual(saved.client, { name: 'Hotel Brisa', attention: '', taxId: '131123456', phone: '809-555-1234', email: 'h@brisa.do', address: 'Calle 1' });
assert.equal(actions.edit((c) => ({ ...c, client: { ...c.client, phone: '829' } })), null);
assert.equal(actions.chooseClient(null), null);
saved = store.getState().quotations.find((q) => q.id === id)!;
assert.equal(saved.clientId, undefined);
assert.equal(saved.client.phone, '829', 'quitar el enlace no reescribe los datos impresos');

// «Actualizar desde el membrete» reemplaza el emisor impreso.
store.setState({ companies: [company({ name: 'M&A Electsun S.R.L.', phone: '809-000-0000' })] });
assert.equal(actions.refreshIssuer(store.getState().companies[0]), null);
saved = store.getState().quotations.find((q) => q.id === id)!;
assert.equal(saved.issuer.phone, '809-000-0000');
assert.equal(actions.refreshIssuer(company({ logoBase64: 'data:image/svg+xml;base64,PHN2Zz4=' })), null, 'un logo no admitido se omite');
assert.equal(store.getState().quotations.find((q) => q.id === id)!.issuer.logo, '');

// Un membrete con datos por encima de los límites nunca impide crear la cotización: se recortan.
store.setState({ companies: [company({ phone: '8'.repeat(100), address: 'a'.repeat(900), name: 'N'.repeat(400), rncOrId: '1'.repeat(40) })], activeCompanyId: 'comp-a' });
const big = createAndOpenQuotation();
assert.ok(big.ok, big.ok ? '' : big.error);
const bigIssuer = store.getState().quotations.find((q) => q.id === (big as { id: string }).id)!.issuer;
assert.equal(bigIssuer.phone.length, QUOTATION_LIMITS.phone);
assert.equal(bigIssuer.address.length, QUOTATION_LIMITS.address);
assert.equal(bigIssuer.name.length, QUOTATION_LIMITS.label);
assert.equal(bigIssuer.taxId.length, QUOTATION_LIMITS.taxId);
assert.equal(issuerFromCompany(company({ name: '  Electsun  ' })).name, 'Electsun');

// Sello: el del membrete que emitió la cotización (RNC normalizado; sin RNC, nombre normalizado), nunca el activo.
const companies = [company({ signatureSealBase64: SEAL_A }), company({ id: 'comp-b', name: 'Otra Empresa SRL', rncOrId: '1-01-00000-1', signatureSealBase64: SEAL_B })];
assert.equal(stampForIssuer(companies, { name: 'Cualquiera', taxId: '132040882' }), SEAL_A, 'RNC sin guiones');
assert.equal(stampForIssuer(companies, { name: 'M&A Electsun SRL', taxId: '1-01-00000-1' }), SEAL_B, 'manda el RNC');
assert.equal(stampForIssuer(companies, { name: 'otra  empresa srl', taxId: '' }), SEAL_B, 'sin RNC, por nombre normalizado');
assert.equal(stampForIssuer(companies, { name: 'Tercera SRL', taxId: '' }), null, 'sin coincidencia, sin sello');
assert.equal(stampForIssuer(companies, { name: 'M&A Electsun SRL', taxId: '9-99-99999-9' }), null, 'RNC distinto: sin sello aunque coincida el nombre');
assert.equal(companyForIssuer(companies, { name: '', taxId: '' }), undefined);

// Cambio de moneda: se confirma solo con importes que convertir, y el mensaje lo explica.
const empty = emptyQuotationContent('2026-11-26', { exchangeRate: 58.75 });
assert.equal(currencyChangeSummary(empty, 'USD').needsConfirmation, false);
const priced = { ...empty, items: [{ id: 'a', kind: 'item' as const, description: 'x', quantity: 1, unit: 'UD', unitPriceCents: 1000, discountPct: 0, taxable: true }], discounts: [{ id: 'd', label: '', type: 'fixed' as const, value: 500 }] };
const summary = currencyChangeSummary(priced, 'USD');
assert.equal(summary.needsConfirmation, true);
for (const text of ['dólares (US$)', '58.75', '1 precio', '1 descuento fijo', 'redondearán']) assert.ok(summary.message.includes(text), `mensaje: ${text}`);

// Guarda: mirar nunca escribe. Ningún efecto del editor llama a un escritor del store (estilo testNoProjectEditRulesOutsideModule).
const WRITERS = /\b(?:updateQuotationRecord|setQuotationStatus|linkQuotationToClient|createQuotationRecord|deleteQuotationRecord|duplicateQuotationRecord|moveQuotationToFolder|resolveQuotationConflict|edit|refreshIssuer|chooseClient|commit|onCommit)\s*\(/;
const editorDir = path.join(process.cwd(), 'src/components/quotations/editor');
const effectBodies = (source: string): string[] => {
  const bodies: string[] = [];
  for (const match of source.matchAll(/\buse(?:Layout)?Effect\s*\(/g)) {
    let depth = 0;
    let end = match.index! + match[0].length - 1;
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++;
      else if (source[end] === ')' && --depth === 0) break;
    }
    bodies.push(source.slice(match.index!, end + 1));
  }
  return bodies;
};
const offenders: string[] = [];
for (const file of readdirSync(editorDir).filter((f) => /\.tsx?$/.test(f))) {
  for (const body of effectBodies(readFileSync(path.join(editorDir, file), 'utf8'))) if (WRITERS.test(body)) offenders.push(`${file}: ${body.slice(0, 80)}`);
}
assert.deepEqual(offenders, [], 'un efecto del editor escribe en el store');
// el detector funciona
assert.equal(effectBodies('useEffect(() => { updateQuotationRecord(id, {}); }, [id]);').some((b) => WRITERS.test(b)), true);
assert.equal(effectBodies('useEffect(() => { if (!q) closeQuotation(); }, [q]);').some((b) => WRITERS.test(b)), false);

console.log('Quotation editor actions tests passed.');
