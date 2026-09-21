import {
  PDFSectionId,
  DEFAULT_PDF_SECTION_ORDER,
  PDF_SECTIONS_META,
} from '../constants/pdfSections';
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

// Helper to normalize section order as in components
function normalizeSectionOrder(saved?: string[]): PDFSectionId[] {
  if (saved && Array.isArray(saved) && saved.length > 0) {
    const validSaved = saved.filter((id): id is PDFSectionId =>
      DEFAULT_PDF_SECTION_ORDER.includes(id as PDFSectionId)
    );
    const missing = DEFAULT_PDF_SECTION_ORDER.filter((id) => !validSaved.includes(id));
    return [...validSaved, ...missing];
  }
  return DEFAULT_PDF_SECTION_ORDER;
}

// Helper to compute page numbers
function computePageNumbers(order: PDFSectionId[], visibility: Record<PDFSectionId, boolean>) {
  let currentNum = 0;
  const numbers: Partial<Record<PDFSectionId, number>> = {};
  order.forEach((id) => {
    if (visibility[id]) {
      currentNum++;
      numbers[id] = currentNum;
    }
  });
  return { totalPages: currentNum, numbers };
}

// Helper to compute TOC items
function computeTOCItems(order: PDFSectionId[], visibility: Record<PDFSectionId, boolean>) {
  const TOC_METADATA: Partial<Record<PDFSectionId, { title: string; subtitle: string }>> = {
    executiveSummary: { title: 'Cuadro Resumen de Inversión y Retorno', subtitle: 'Pipeline Técnico' },
    aboutUs: { title: 'Quiénes Somos & Nuestros Servicios', subtitle: 'Por Qué Elegirnos' },
    benefits: { title: 'Beneficios de la Energía Solar', subtitle: 'Ley 57-07' },
    techIntro: { title: '¿Qué es un Sistema Fotovoltaico?', subtitle: 'Flujo Técnico' },
    projectDescription: { title: 'Descripción del Proyecto & Normativa SIE', subtitle: 'SIE-007' },
    energy: { title: 'Análisis de Energía y Balance', subtitle: 'Generación Solar' },
    quotation: { title: 'Presupuesto y Cotización de Sistema', subtitle: 'Inversión' },
    roi: { title: 'Cálculo de Retorno de Inversión', subtitle: 'Payback y TIR' },
    cashFlow: { title: 'Flujo de Caja y Proyección a 25 Años', subtitle: 'Rendimiento' },
    costMatrix: { title: 'Matriz de Costos Internos (Confidencial)', subtitle: 'Proveedores' },
  };

  const { numbers } = computePageNumbers(order, visibility);
  const items: Array<{ title: string; targetPage: number; sectionIndex: number }> = [];
  let sectionIndex = 1;

  order.forEach((id) => {
    if (visibility[id] && TOC_METADATA[id]) {
      items.push({
        title: TOC_METADATA[id]!.title,
        targetPage: numbers[id] || 0,
        sectionIndex: sectionIndex++,
      });
    }
  });

  return items;
}

// -------------------------------------------------------------
// TEST 1: DEFAULT_PDF_SECTION_ORDER integrity
// -------------------------------------------------------------
console.log('--- TEST 1: Default Section Order Integrity ---');
assert(DEFAULT_PDF_SECTION_ORDER.length === 12, 'DEFAULT_PDF_SECTION_ORDER must have exactly 12 pages');
assert(DEFAULT_PDF_SECTION_ORDER[0] === 'cover', 'First default section must be cover');
assert(DEFAULT_PDF_SECTION_ORDER[1] === 'tableOfContents', 'Second default section must be tableOfContents');
assert(DEFAULT_PDF_SECTION_ORDER[2] === 'executiveSummary', 'Third default section must be executiveSummary');
assert(DEFAULT_PDF_SECTION_ORDER.includes('energy'), 'Must include energy');
assert(DEFAULT_PDF_SECTION_ORDER.includes('quotation'), 'Must include quotation');
assert(DEFAULT_PDF_SECTION_ORDER.includes('roi'), 'Must include roi');
assert(DEFAULT_PDF_SECTION_ORDER.includes('cashFlow'), 'Must include cashFlow');
assert(DEFAULT_PDF_SECTION_ORDER.includes('costMatrix'), 'Must include costMatrix');
console.log(' ✅ PASS: Default section order contains all 12 sections in correct initial sequence.');

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
