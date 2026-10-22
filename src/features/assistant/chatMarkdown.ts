// Safe markdown subset for assistant replies. Produces data, never HTML: React escapes every string.

export type ChatInline = { t: 'text' | 'b' | 'i' | 'code' | 'br'; v: string };
export type ChatBlock =
  | { type: 'p'; inlines: ChatInline[] }
  | { type: 'h'; inlines: ChatInline[] }
  | { type: 'ul'; items: ChatInline[][] }
  | { type: 'ol'; items: ChatInline[][] };

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

export function parseInline(text: string): ChatInline[] {
  const out: ChatInline[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) out.push({ t: 'b', v: part.slice(2, -2) });
    else if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) out.push({ t: 'code', v: part.slice(1, -1) });
    else if (part.length > 2 && ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_')))) out.push({ t: 'i', v: part.slice(1, -1) });
    else out.push({ t: 'text', v: part.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') });
  }
  return out;
}

export function parseChatMarkdown(source: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    const inlines: ChatInline[] = [];
    paragraph.forEach((line, i) => {
      if (i) inlines.push({ t: 'br', v: '' });
      inlines.push(...parseInline(line));
    });
    blocks.push({ type: 'p', inlines });
    paragraph = [];
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (heading) { flush(); blocks.push({ type: 'h', inlines: parseInline(heading[1]) }); continue; }
    if (bullet || ordered) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const last = blocks[blocks.length - 1];
      const item = parseInline((bullet || ordered)![1]);
      if (last && (last.type === 'ul' || last.type === 'ol') && last.type === type) last.items.push(item);
      else blocks.push(type === 'ul' ? { type: 'ul', items: [item] } : { type: 'ol', items: [item] });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}
