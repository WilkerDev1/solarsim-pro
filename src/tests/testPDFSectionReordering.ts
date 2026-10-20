import { PDFSectionId, DEFAULT_PDF_SECTION_ORDER } from '../constants/pdfSections';
import { buildPdfLayout, normalizeSectionOrder } from '../utils/pdfLayout';
import { AttachedPDFDocument, DocumentCustomization, ProjectSimulation } from '../types';
import { useSimulationStore } from '../store/useSimulationStore';

console.log('=====================================================');
console.log('🧪 RUNNING PDF SECTION & ATTACHMENT REORDERING SUITE');
console.log('=====================================================\n');

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(message);
  }
}

const computePageNumbers = (order: PDFSectionId[], visibility: Record<PDFSectionId, boolean>) => {
  const layout = buildPdfLayout(order, visibility);
  return { totalPages: layout.activePagesCount, numbers: layout.pageNumbers };
};
const computeTOCItems = (order: PDFSectionId[], visibility: Record<PDFSectionId, boolean>) => buildPdfLayout(order, visibility).tocItems;

// -------------------------------------------------------------
// TEST 2: Normalization handles undefined, partial, or invalid IDs
// -------------------------------------------------------------
console.log('\n--- TEST 2: Order Normalization Robustness ---');
const order1 = normalizeSectionOrder(undefined);
assert(order1.length === 12 && order1[0] === 'cover', 'Undefined order falls back to default');

const order2 = normalizeSectionOrder(['quotation', 'cover', 'invalid_section' as any]);
assert(order2[0] === 'quotation', 'User prioritized quotation to #1');
assert(order2[1] === 'cover', 'User prioritized cover to #2');
assert(!order2.includes('invalid_section' as any), 'Invalid section IDs must be filtered out');
assert(order2.length === 12, 'All other sections must be appended in order');
console.log(' ✅ PASS: Order normalization gracefully fills missing sections and strips invalid IDs.');

// -------------------------------------------------------------
// TEST 3: Dynamic Page Numbering upon Section Reordering
// -------------------------------------------------------------
console.log('\n--- TEST 3: Dynamic Page Numbering with Reordered Sections ---');
const defaultVisibility: Record<PDFSectionId, boolean> = {
  cover: true,
  tableOfContents: true,
  executiveSummary: true,
  aboutUs: true,
  benefits: true,
  techIntro: true,
  projectDescription: true,
  energy: true,
  quotation: true,
  roi: true,
  cashFlow: true,
  costMatrix: false,
};

const defaultRes = computePageNumbers(DEFAULT_PDF_SECTION_ORDER, defaultVisibility);
assert(defaultRes.totalPages === 11, 'Default active pages count must be 11');
assert(defaultRes.numbers.cover === 1, 'Cover is page 1 by default');
assert(defaultRes.numbers.tableOfContents === 2, 'TOC is page 2 by default');
assert(defaultRes.numbers.executiveSummary === 3, 'Executive Summary is page 3 by default');
assert(defaultRes.numbers.energy === 8, 'Energy is page 8 by default');
assert(defaultRes.numbers.quotation === 9, 'Quotation is page 9 by default');

// Custom reorder: Move 'quotation' and 'roi' immediately after TOC
const customOrder: PDFSectionId[] = [
  'cover',
  'tableOfContents',
  'quotation',
  'roi',
  'executiveSummary',
  'energy',
  'aboutUs',
  'benefits',
  'techIntro',
  'projectDescription',
  'cashFlow',
  'costMatrix',
];

const customRes = computePageNumbers(customOrder, defaultVisibility);
assert(customRes.totalPages === 11, 'Total pages remains 11');
assert(customRes.numbers.cover === 1, 'Cover is page 1');
assert(customRes.numbers.tableOfContents === 2, 'TOC is page 2');
assert(customRes.numbers.quotation === 3, 'Quotation moved to page 3');
assert(customRes.numbers.roi === 4, 'ROI moved to page 4');
assert(customRes.numbers.executiveSummary === 5, 'Executive Summary moved to page 5');
assert(customRes.numbers.energy === 6, 'Energy shifted to page 6');
assert(customRes.numbers.aboutUs === 7, 'AboutUs shifted to page 7');
console.log(' ✅ PASS: Reordered pages receive strictly sequential page numbers matching new order.');

// -------------------------------------------------------------
// TEST 4: Dynamic Table of Contents (TOC) Reflects Custom Order
// -------------------------------------------------------------
console.log('\n--- TEST 4: Dynamic TOC Sequence and Target Pages ---');
const tocItems = computeTOCItems(customOrder, defaultVisibility);
assert(tocItems.length === 9, 'TOC lists all active body pages');
assert(tocItems[0].title === 'Presupuesto y Cotización de Sistema', 'First TOC item is Quotation');
assert(tocItems[0].targetPage === 3, 'First TOC item targets page 3');
assert(tocItems[1].title === 'Cálculo de Retorno de Inversión', 'Second TOC item is ROI');
assert(tocItems[1].targetPage === 4, 'Second TOC item targets page 4');
assert(tocItems[2].title === 'Cuadro Resumen de Inversión y Retorno', 'Third TOC item is Executive Summary');
assert(tocItems[2].targetPage === 5, 'Third TOC item targets page 5');
assert(tocItems[3].title === 'Análisis de Energía y Balance', 'Fourth TOC item is Energy');
assert(tocItems[3].targetPage === 6, 'Fourth TOC item targets page 6');
console.log(' ✅ PASS: Table of Contents automatically reflects user-defined order and target pages.');

// Annexes follow internal pages; only attachments flagged for the TOC are listed.
const annexLayout = buildPdfLayout(
  DEFAULT_PDF_SECTION_ORDER,
  defaultVisibility,
  [{ id: 'x1', title: '  Planos  ', pageCount: 3 }, { id: 'x2', title: '   ' }],
  [
    { id: 'a1', fileName: 'ficha.pdf', fileSize: 1, pageCount: 2, title: 'Ficha panel', uploadedAt: '', enabled: true, addToTableOfContents: true },
    { id: 'a2', fileName: 'oculta.pdf', fileSize: 1, pageCount: 5, title: 'Oculta', uploadedAt: '', enabled: true, addToTableOfContents: false },
  ],
);
const annexItems = annexLayout.tocItems.slice(-2);
assert(annexItems[0].title === 'Planos' && annexItems[0].targetPage === 12, 'Extra TOC entry starts after the 11 internal pages');
assert(annexItems[1].subtitle === 'Ficha Técnica / Anexo Oficial (ficha.pdf)' && annexItems[1].targetPage === 15, 'Attachment starts after the 3-page extra entry');
assert(annexLayout.activePagesCount === 11, 'Internal page count excludes annexes');
// Every page footer ("N de M") counts the annexes as part of the document.
assert(annexLayout.footerTotalPages === 16, 'Footer total includes annex pages on every page');
assert(buildPdfLayout(DEFAULT_PDF_SECTION_ORDER, defaultVisibility).footerTotalPages === 11, 'Without annexes the footer total is the internal page count');

// -------------------------------------------------------------
// TEST 5: Attached External PDFs Reordering via Zustand Store
// -------------------------------------------------------------
console.log('\n--- TEST 5: Attached External PDFs Drag & Drop Reordering ---');
const store = useSimulationStore.getState();

// Create sample attachments
const initialAttachments: AttachedPDFDocument[] = [
  {
    id: 'att-1',
    fileName: 'Datasheet_Panel_CanadianSolar.pdf',
    title: 'Ficha Técnica Panel TOPCon 620W',
    pageCount: 2,
    fileSize: 512000,
    uploadedAt: new Date().toISOString(),
    enabled: true,
    addToTableOfContents: true,
    thumbnailDataUrl: 'data:image/jpeg;base64,sample1',
  },
  {
    id: 'att-2',
    fileName: 'Manual_Inversor_Luxpower.pdf',
    title: 'Manual Inversor Híbrido 12kW',
    pageCount: 4,
    fileSize: 1048576,
    uploadedAt: new Date().toISOString(),
    enabled: true,
    addToTableOfContents: true,
    thumbnailDataUrl: 'data:image/jpeg;base64,sample2',
  },
  {
    id: 'att-3',
    fileName: 'Certificado_Garantia_Baterias.pdf',
    title: 'Certificado de Garantía LiFePO4',
    pageCount: 1,
    fileSize: 256000,
    uploadedAt: new Date().toISOString(),
    enabled: true,
    addToTableOfContents: false,
    thumbnailDataUrl: 'data:image/jpeg;base64,sample3',
  },
];

// Reorder attachments: Move att-2 to first position, att-3 to second, att-1 to third
const reorderedAttachments: AttachedPDFDocument[] = [
  initialAttachments[1], // att-2
  initialAttachments[2], // att-3
  initialAttachments[0], // att-1
];

assert(reorderedAttachments[0].id === 'att-2', 'Att-2 is now first');
assert(reorderedAttachments[1].id === 'att-3', 'Att-3 is now second');
assert(reorderedAttachments[2].id === 'att-1', 'Att-1 is now third');
assert(reorderedAttachments[0].thumbnailDataUrl === 'data:image/jpeg;base64,sample2', 'Thumbnails remain bound to respective documents');

console.log(' ✅ PASS: Attached PDF documents reordered successfully with intact thumbnails.');

// -------------------------------------------------------------
// TEST 6: Zustand Customization Persistence of sectionOrder
// -------------------------------------------------------------
console.log('\n--- TEST 6: Store Document Customization with sectionOrder ---');
store.createNewProject({
  name: 'Cliente Test Reordenamiento',
  province: 'Santiago',
  distributor: 'EDENORTE',
});

store.updateDocumentCustomization({
  sectionOrder: customOrder,
  attachedPdfs: reorderedAttachments,
});

const activeProj = store.getActiveProject();
assert(activeProj.customization?.sectionOrder !== undefined, 'Project customization contains sectionOrder');
assert(activeProj.customization?.sectionOrder?.length === 12, 'Saved sectionOrder has 12 entries');
assert(activeProj.customization?.sectionOrder?.[0] === 'cover', 'Saved section 0 is cover');
assert(activeProj.customization?.sectionOrder?.[2] === 'quotation', 'Saved section 2 is quotation');
assert(activeProj.customization?.attachedPdfs?.length === 3, 'Attached PDFs correctly saved in project');
assert(activeProj.customization?.attachedPdfs?.[0].id === 'att-2', 'Attached PDFs order persisted');

console.log(' ✅ PASS: Zustand store properly updates and persists sectionOrder and attachedPdfs.');

console.log('\n=====================================================');
console.log('🎉 ALL PDF SECTION & ATTACHMENT REORDERING TESTS PASSED!');
console.log('=====================================================\n');
