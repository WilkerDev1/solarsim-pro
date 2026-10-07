/** Context-specific encoding. Only generated markup may bypass these functions. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function formatMarkdown(text?: string | null, boldClass = 'font-bold text-slate-950'): string {
  if (!text) return '';
  // No raw HTML, links, images or script attributes are part of this restricted format.
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, `<strong class="${escapeHtml(boldClass)}">$1</strong>`);
}
export function safeLogoUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  // SVG/HTML data URLs are deliberately excluded, including custom logos.
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value)) return value;
  try { const url = new URL(value); if (url.protocol === 'https:') return url.href; } catch { /* invalid URL */ }
  return fallback;
}
