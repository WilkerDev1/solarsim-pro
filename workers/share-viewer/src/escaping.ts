import { renderRichTextHtml } from '../../../shared/documentTexts/richText';
/** Context-specific encoding. Only generated markup may bypass these functions. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function formatMarkdown(text?: string | null, boldClass = 'font-bold text-slate-950'): string {
  if (!text) return '';
  // Subconjunto compartido con el editor (negrita, cursiva, viñetas, párrafos): todo escapado, sin HTML crudo.
  return renderRichTextHtml(text, { boldClass });
}
/** Lo mismo, pero un texto de una línea no abre un bloque (etiquetas y garantías dentro de un `<span>`). */
export function formatInlineMarkdown(text?: string | null, boldClass = 'font-bold text-slate-950'): string {
  return text ? renderRichTextHtml(text, { boldClass, inline: true }) : '';
}
export function safeLogoUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  // SVG/HTML data URLs are deliberately excluded, including custom logos.
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value)) return value;
  try { const url = new URL(value); if (url.protocol === 'https:') return url.href; } catch { /* invalid URL */ }
  return fallback;
}
