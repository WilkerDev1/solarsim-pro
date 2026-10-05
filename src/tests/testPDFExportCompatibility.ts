import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { PDFDocument, PDFName } from 'pdf-lib';
import { PDF_COVER_HERO_BASE64 } from '../assets/pdfGraphicAssets';
import { PDFMergeService } from '../services/pdfMergeService';

// Exercise the raster-page format used by both exporters after the jsPDF upgrade.
// The DOM/html2canvas capture and browser download are checked separately in QA.
const proposal = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
for (let page = 0; page < 11; page++) {
  if (page) proposal.addPage('a4', 'portrait');
  proposal.addImage(PDF_COVER_HERO_BASE64, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
}
const proposalBytes = proposal.output('arraybuffer');
const parsed = await PDFDocument.load(proposalBytes);
assert.equal(parsed.getPageCount(), 11);
for (const page of parsed.getPages()) {
  assert.ok(Math.abs(page.getWidth() - 595.28) < 0.1);
  assert.ok(Math.abs(page.getHeight() - 841.89) < 0.1);
  assert.ok(page.node.Resources()?.lookup(PDFName.of('XObject')), 'Raster image resource must survive serialization');
}
const attachment = new jsPDF();
attachment.text('Synthetic attachment', 20, 20);
const merged = await PDFMergeService.mergeProposalWithAttachments(proposalBytes, [
  { name: 'synthetic.pdf', buffer: attachment.output('arraybuffer') },
]);
const parsedMerged = await PDFDocument.load(merged);
assert.equal(parsedMerged.getPageCount(), 12);
assert.deepEqual(parsedMerged.getPage(11).getSize(), (await PDFDocument.load(attachment.output('arraybuffer'))).getPage(0).getSize());
console.log('PASS: jsPDF raster A4 dossier, image resources and pdf-lib attachment merge.');
