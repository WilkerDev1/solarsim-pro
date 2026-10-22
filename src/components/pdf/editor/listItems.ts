/** Elementos de un texto-lista («- uno\n- dos», o separados por comas en textos heredados) sin marcas de formato. */
export function listItems(text: string, separators: RegExp = /\n/): string[] {
  return text
    .split(separators)
    .map((item) => item.replace(/^\s*[-•]\s*/, '').replace(/\*/g, '').trim())
    .filter(Boolean);
}
