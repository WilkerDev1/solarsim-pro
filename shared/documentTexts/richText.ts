/**
 * Texto enriquecido del documento: un subconjunto de Markdown que se guarda como string.
 *
 * - `**negrita**` y `*cursiva*` (la cursiva exige marcadores pegados al texto, así que
 *   textos heredados como `* Precios en USD *` siguen siendo literales);
 * - viñetas con `- ` (o `• `) al inicio de la línea;
 * - párrafos separados por una línea en blanco y saltos de línea simples.
 *
 * TypeScript puro: lo usan la app (render y editor), el Worker del visor y las pruebas en node.
 */

export interface RichInline {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/** Una línea es una secuencia de fragmentos con estilo. */
export type RichLine = RichInline[];

export type RichBlock =
  | { type: 'paragraph'; lines: RichLine[]; tight?: boolean }
  | { type: 'list'; items: RichLine[]; tight?: boolean };

export interface SanitizeOptions {
  format?: 'plain' | 'rich';
  multiline?: boolean;
  maxLength?: number;
}

const BULLET_LINE = /^\s*(?:-|•)\s+(.*)$/;
const BOLD = /\*\*((?:\*[^*\n]+\*|[^*\n])+?)\*\*/g;
const ITALIC = /(?<![\p{L}\p{N}*])\*(?![\s*])([^*\n]*?[^\s*]|[^\s*])\*(?![\p{L}\p{N}*])/gu;

function parseItalic(text: string, bold: boolean): RichInline[] {
  const out: RichInline[] = [];
  let last = 0;
  for (const match of text.matchAll(ITALIC)) {
    const index = match.index ?? 0;
    if (index > last) out.push(style(text.slice(last, index), bold, false));
    out.push(style(match[1], bold, true));
    last = index + match[0].length;
  }
  if (last < text.length) out.push(style(text.slice(last), bold, false));
  return out;
}

function style(text: string, bold: boolean, italic: boolean): RichInline {
  const inline: RichInline = { text };
  if (bold) inline.bold = true;
  if (italic) inline.italic = true;
  return inline;
}

/** Fragmentos de una línea (sin saltos). */
export function parseInlineRichText(line: string): RichLine {
  const out: RichInline[] = [];
  let last = 0;
  for (const match of line.matchAll(BOLD)) {
    const index = match.index ?? 0;
    if (index > last) out.push(...parseItalic(line.slice(last, index), false));
    out.push(...parseItalic(match[1], true));
    last = index + match[0].length;
  }
  if (last < line.length) out.push(...parseItalic(line.slice(last), false));
  return mergeInlines(out);
}

function sameStyle(a: RichInline, b: RichInline) {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic;
}

function mergeInlines(segments: RichInline[]): RichLine {
  const out: RichInline[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const previous = out[out.length - 1];
    if (previous && sameStyle(previous, segment)) previous.text += segment.text;
    else out.push({ ...segment });
  }
  return out;
}

/** Bloques de párrafo y lista. Un bloque `tight` va separado del anterior por un solo salto. */
export function parseRichText(source: string | null | undefined): RichBlock[] {
  const blocks: RichBlock[] = [];
  const chunks = normalizeNewlines(source || '').split(/\n{2,}/);
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    let tight = false;
    for (const rawLine of chunk.split('\n')) {
      const bullet = rawLine.match(BULLET_LINE);
      const line = parseInlineRichText(bullet ? bullet[1] : rawLine);
      const previous = blocks[blocks.length - 1];
      const extend = tight && previous && previous.type === (bullet ? 'list' : 'paragraph');
      if (extend) {
        if (previous.type === 'list') previous.items.push(line);
        else previous.lines.push(line);
      } else {
        blocks.push(bullet ? { type: 'list', items: [line], ...(tight ? { tight } : {}) } : { type: 'paragraph', lines: [line], ...(tight ? { tight } : {}) });
      }
      tight = true;
    }
  }
  return blocks;
}

function serializeInline(line: RichLine): string {
  let out = '';
  for (const segment of mergeInlines(line)) {
    if (!segment.bold && !segment.italic) {
      out += segment.text;
      continue;
    }
    // Markers hug the words: whitespace moves outside so the result stays parseable.
    const lead = segment.text.match(/^\s*/)?.[0] || '';
    const trail = segment.text.slice(lead.length).match(/\s*$/)?.[0] || '';
    const core = segment.text.slice(lead.length, segment.text.length - trail.length);
    if (!core) {
      out += segment.text;
      continue;
    }
    let wrapped = core;
    if (segment.italic) wrapped = `*${wrapped}*`;
    if (segment.bold) wrapped = `**${wrapped}**`;
    out += lead + wrapped + trail;
  }
  return out;
}

export function serializeRichText(blocks: RichBlock[]): string {
  return blocks
    .map((block, index) => {
      const separator = index === 0 ? '' : block.tight ? '\n' : '\n\n';
      const body = block.type === 'list'
        ? block.items.map((item) => `- ${serializeInline(item)}`).join('\n')
        : block.lines.map(serializeInline).join('\n');
      return separator + body;
    })
    .join('');
}

function normalizeNewlines(source: string) {
  return source.replace(/\r\n?/g, '\n');
}

/** Normaliza texto de usuario o del portapapeles al subconjunto admitido. */
export function sanitizeRichText(source: string | null | undefined, options: SanitizeOptions = {}): string {
  const { format = 'rich', multiline = true, maxLength } = options;
  let text = normalizeNewlines(String(source ?? ''))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\t ]/g, ' ');
  if (!multiline) text = text.replace(/\n+/g, ' ');
  text = text
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').replace(/^ +| +$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const canonical = (value: string) => (format === 'plain' ? richTextToPlain(value, { bullet: '- ' }) : serializeRichText(parseRichText(value)));
  let result = canonical(text).trim();
  if (maxLength !== undefined && result.length > maxLength) result = canonical(result.slice(0, maxLength)).trim();
  return result;
}

/** Proyección sin formato (búsqueda, etiquetas, herramientas de IA). */
export function richTextToPlain(source: string | null | undefined, options: { bullet?: string } = {}): string {
  const bullet = options.bullet ?? '• ';
  return parseRichText(source)
    .map((block, index) => {
      const separator = index === 0 ? '' : block.tight ? '\n' : '\n\n';
      const text = (line: RichLine) => line.map((segment) => segment.text).join('');
      const body = block.type === 'list' ? block.items.map((item) => bullet + text(item)).join('\n') : block.lines.map(text).join('\n');
      return separator + body;
    })
    .join('');
}

export function escapeRichHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export interface RichHtmlOptions {
  boldClass?: string;
  /** Separación entre párrafos (CSS). */
  paragraphGap?: string;
}

/**
 * HTML escapado para el visor web. Las viñetas son spans con `•` (nunca `<ul>`/`::marker`,
 * que html2canvas no dibuja de forma fiable).
 */
export function renderRichTextHtml(source: string | null | undefined, options: RichHtmlOptions = {}): string {
  const { boldClass, paragraphGap = '0.5em' } = options;
  const inline = (line: RichLine) => line.map((segment) => {
    let html = escapeRichHtml(segment.text);
    if (segment.italic) html = `<em>${html}</em>`;
    if (segment.bold) html = `<strong${boldClass ? ` class="${escapeRichHtml(boldClass)}"` : ''}>${html}</strong>`;
    return html;
  }).join('');
  return parseRichText(source)
    .map((block, index) => {
      const gap = index > 0 && !block.tight ? ` style="display:block;margin-top:${paragraphGap}"` : ' style="display:block"';
      if (block.type === 'paragraph') return `<span${gap}>${block.lines.map(inline).join('<br>')}</span>`;
      const items = block.items
        .map((item) => `<span style="display:flex;gap:0.4em"><span>•</span><span>${inline(item)}</span></span>`)
        .join('');
      return `<span${gap}>${items}</span>`;
    })
    .join('');
}

/** Lo mínimo de un nodo DOM que necesita el serializador (probado en node con objetos planos). */
export interface NodeLike {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<NodeLike>;
  style?: { fontWeight?: string; fontStyle?: string };
}

const SKIPPED = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'SVG', 'IMG']);
const LINE_BLOCKS = new Set(['DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);

function isBoldStyle(weight?: string) {
  if (!weight) return false;
  return weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
}

/**
 * Convierte el DOM de un `contentEditable` al subconjunto admitido. Cualquier otra etiqueta o
 * atributo se descarta: el resultado siempre pasa por `sanitizeRichText`.
 */
export function serializeEditableDom(root: NodeLike, options: SanitizeOptions = {}): string {
  type Line = { segments: RichInline[]; bullet: boolean };
  const lines: Line[] = [];
  let current: Line = { segments: [], bullet: false };
  const hasContent = () => current.segments.some((segment) => segment.text.trim()) || current.bullet;
  const pushLine = () => {
    lines.push(current);
    current = { segments: [], bullet: false };
  };
  const boundary = () => {
    if (hasContent()) pushLine();
    else current = { segments: [], bullet: false };
  };
  const blank = () => {
    boundary();
    if (lines.length) lines.push({ segments: [], bullet: false });
  };

  const walk = (node: NodeLike, bold: boolean, italic: boolean) => {
    if (node.nodeType === 3) {
      const text = (node.textContent || '').replace(/[\n\r]+/g, ' ');
      if (text) current.segments.push(style(text, bold, italic));
      return;
    }
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toUpperCase();
    if (SKIPPED.has(name)) return;
    if (name === 'BR') {
      pushLine();
      return;
    }
    const nextBold = bold || name === 'B' || name === 'STRONG' || isBoldStyle(node.style?.fontWeight);
    const nextItalic = italic || name === 'I' || name === 'EM' || node.style?.fontStyle === 'italic';
    const children = () => {
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i], nextBold, nextItalic);
    };
    if (name === 'P') {
      blank();
      children();
      blank();
    } else if (name === 'LI') {
      boundary();
      current.bullet = true;
      children();
      boundary();
    } else if (name === 'UL' || name === 'OL' || LINE_BLOCKS.has(name)) {
      boundary();
      children();
      boundary();
    } else {
      children();
    }
  };

  walk(root, false, false);
  boundary();
  const markdown = lines.map((line) => (line.bullet ? '- ' : '') + serializeInline(line.segments)).join('\n');
  return sanitizeRichText(markdown, options);
}
