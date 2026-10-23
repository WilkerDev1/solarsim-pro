/** Elementos de un texto-lista («- uno\n- dos») sin la viñeta; conservan **negrita** y *cursiva* para dibujarlos con RichText. */
export function listItems(text: string, separators: RegExp = /\n/): string[] {
  return text
    .split(separators)
    .map((item) => item.replace(/^\s*[-•]\s*/, '').trim())
    .filter(Boolean);
}
