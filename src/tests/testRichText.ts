import assert from 'node:assert/strict';
import {
  parseRichText,
  serializeRichText,
  sanitizeRichText,
  renderRichTextHtml,
  serializeEditableDom,
  richTextToPlain,
  type NodeLike,
} from '../../shared/documentTexts/richText';

// Subconjunto admitido: **negrita**, *cursiva*, viñetas "- ", párrafos (línea en blanco) y saltos de línea.

// 1. Parse / serialize round-trip keeps the canonical markdown.
const canonical = 'La **Ley 57-07** fue *promulgada* para:\n\n- Ahorro **inmediato**\n- Plusvalía\n\nÚltima línea\ncon salto.';
assert.equal(serializeRichText(parseRichText(canonical)), canonical);
const blocks = parseRichText(canonical);
assert.equal(blocks.length, 3);
assert.equal(blocks[1].type, 'list');
assert.equal(blocks[1].type === 'list' && blocks[1].items.length, 2);
assert.deepEqual(blocks[0].type === 'paragraph' && blocks[0].lines[0][1], { text: 'Ley 57-07', bold: true });

// 2. Legacy texts that use "*" as a plain marker are not turned into italics (no flanking).
const validity = '* Equipos según disponibilidad de inventario | * Propuesta válida por 7 días | * Precios en USD *';
assert.equal(sanitizeRichText(validity), validity);
assert.equal(renderRichTextHtml(validity).includes('<em>'), false);
// Bold without closing marker stays literal.
assert.equal(sanitizeRichText('Precio **especial'), 'Precio **especial');

// 3. Sanitize normalizes whitespace, control characters and blank-line runs, and enforces a maximum length.
assert.equal(sanitizeRichText('  Hola\u0000 mundo \r\n\r\n\r\n\r\nAdiós  '), 'Hola mundo\n\nAdiós');
assert.equal(sanitizeRichText('**  **'), '', 'Empty bold disappears');
assert.equal(sanitizeRichText('a'.repeat(50), { maxLength: 10 }), 'a'.repeat(10));
assert.equal(sanitizeRichText('Uno\nDos', { multiline: false }), 'Uno Dos', 'Single-line fields collapse breaks');
assert.equal(sanitizeRichText('**Uno** y *dos*', { format: 'plain' }), 'Uno y dos', 'Plain fields drop formatting');
assert.equal(sanitizeRichText('• Punto uno\n- Punto dos'), '- Punto uno\n- Punto dos', 'Bullet glyphs normalize to "- "');
assert.equal(sanitizeRichText('* Nota al pie'), '* Nota al pie', 'A leading "* " is legacy text, not a bullet');

// 4. HTML rendering (Worker) escapes every character and uses span bullets, never ::marker lists.
const html = renderRichTextHtml('<script>alert(1)</script> **A&B**\n\n- uno\n- *dos*', { boldClass: 'font-bold' });
assert.ok(!html.includes('<script>'), 'Escapes markup');
assert.ok(html.includes('&lt;script&gt;'));
assert.ok(html.includes('<strong class="font-bold">A&amp;B</strong>'));
assert.ok(html.includes('<em>dos</em>'));
assert.ok(!/<(ul|ol|li)\b/.test(html), 'No list elements with ::marker');
assert.ok(html.includes('•'));
assert.equal(renderRichTextHtml(''), '');

// 5. Plain projection (for labels, search and AI tools).
assert.equal(richTextToPlain('**Uno** *dos*\n\n- tres'), 'Uno dos\n\n• tres');

// 6. serializeEditableDom works on a DOM-like tree (contentEditable output from Chromium).
const text = (value: string): NodeLike => ({ nodeType: 3, nodeName: '#text', textContent: value, childNodes: [] });
const el = (name: string, children: NodeLike[], style: Record<string, string> = {}): NodeLike => ({
  nodeType: 1,
  nodeName: name.toUpperCase(),
  textContent: null,
  childNodes: children,
  style,
});
const root = el('div', [
  text('La '),
  el('b', [text('Ley')]),
  text(' y '),
  el('span', [text('pesada')], { fontWeight: '700' }),
  el('i', [text(' cursiva')]),
  el('div', [text('Segunda línea')]),
  el('div', [el('br', [])]),
  el('ul', [el('li', [text('uno')]), el('li', [el('strong', [text('dos')])])]),
  el('p', [text('Fin'), el('br', []), text('de texto')]),
  el('script', [text('alert(1)')]),
]);
assert.equal(
  serializeEditableDom(root),
  'La **Ley** y **pesada** *cursiva*\nSegunda línea\n\n- uno\n- **dos**\n\nFin\nde texto',
);
// Adjacent bold runs merge and whitespace inside markers moves outside.
assert.equal(serializeEditableDom(el('div', [el('b', [text('Hola ')]), el('b', [text('mundo')])])), '**Hola mundo**');
assert.equal(serializeEditableDom(el('div', [text('a'), el('b', [text(' b ')]), text('c')])), 'a **b** c');

console.log('PASS: rich text parse/serialize/sanitize/render and DOM serialization.');
