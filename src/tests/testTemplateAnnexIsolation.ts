import assert from 'node:assert/strict';
import { companyDocumentCustomization, reusableDocumentTemplate } from '../utils/companyDocumentTemplate';
import { DEFAULT_LOCAL_COMPANY } from '../types/companyProfile';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../constants/defaultDocumentCustomization';
import type { DocumentCustomization } from '../types';

const company = { ...DEFAULT_LOCAL_COMPANY, id: 'issuer-a' };
const annex = { sourceDatasheetKey: 'sheet-x', id: 'att-1', fileName: 'x.pdf', fileSize: 1, pageCount: 1, title: 'Ficha X', uploadedAt: '', enabled: false, addToTableOfContents: true };
const proposal: DocumentCustomization = {
  ...DEFAULT_DOCUMENT_CUSTOMIZATION,
  companySlogan: 'Lema reutilizable',
  attachedPdfs: [annex],
  extraTocItems: [{ id: 'att-1', title: 'Ficha X' }],
  dismissedDatasheetKeys: ['sheet-x'],
};

// Guardar: la plantilla no arrastra nada específico de los anexos de la propuesta.
const saved = reusableDocumentTemplate(proposal) as Record<string, unknown>;
assert.equal(saved.dismissedDatasheetKeys, undefined, 'dismissedDatasheetKeys no es reutilizable');
assert.equal(saved.attachedPdfs, undefined, 'attachedPdfs no es reutilizable');
assert.equal(saved.extraTocItems, undefined, 'extraTocItems no es reutilizable');
assert.equal(saved.companySlogan, 'Lema reutilizable', 'los ajustes reutilizables se conservan');

// Aplicar: plantillas ya guardadas con las claves antiguas se ignoran sin migración.
const old = { ...proposal } as DocumentCustomization;
for (const [label, result] of [
  ['por empresa', companyDocumentCustomization(company, DEFAULT_DOCUMENT_CUSTOMIZATION, { [company.id]: old })],
  ['heredada', companyDocumentCustomization(company, old, {})],
] as const) {
  const r = result as Record<string, unknown>;
  assert.equal(r.dismissedDatasheetKeys, undefined, `plantilla ${label}: no suprime fichas`);
  assert.equal(r.attachedPdfs, undefined, `plantilla ${label}: sin anexos ajenos`);
  assert.equal(r.extraTocItems, undefined, `plantilla ${label}: sin índice ajeno`);
}
console.log('Template annex isolation passed.');
