import type { AssistantCard } from './types';

/** Resultados con más tarjetas que esto son listados: solo se muestran las que la respuesta nombra. */
const LIST_THRESHOLD = 3;
/** Tarjetas como mucho por respuesta: el texto lleva el detalle; las tarjetas son accesos directos. */
export const MAX_ANSWER_CARDS = 6;

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `needle` aparece completo en `text` (ya normalizado): SP-2026-105 no coincide dentro de SP-2026-105-V3. */
function mentions(text: string, needle: string): boolean {
  const n = normalize(needle);
  if (n.length < 3) return false;
  return new RegExp(`(^|[^a-z0-9-])${escapeRegExp(n)}(?![a-z0-9]|-[a-z0-9])`).test(text);
}

/**
 * Tarjetas que acompañan la respuesta del asistente. Cada grupo son las tarjetas de una llamada a herramienta:
 * un resultado puntual (get_project, una búsqueda estrecha) se muestra entero; un listado amplio (search_projects
 * sin filtro, search_equipment) solo aporta las tarjetas que la respuesta final nombra. Una propuesta se nombra
 * por su código; por el nombre del cliente solo si ninguna otra propuesta de ese cliente se nombró por código.
 * Un equipo se nombra por su modelo, nunca solo por la marca (que comparten todas las tarjetas del listado).
 */
export function selectAnswerCards(groups: AssistantCard[][], answer: string): AssistantCard[] {
  const text = normalize(answer);
  const codeHit = (c: AssistantCard) => c.kind === 'project' && mentions(text, c.detail);
  const selected: AssistantCard[] = [];
  for (const group of groups) {
    if (group.length <= LIST_THRESHOLD) {
      selected.push(...group);
      continue;
    }
    for (const card of group) {
      const named = card.kind === 'project'
        ? codeHit(card) || (mentions(text, card.title) && !group.some((other) => other !== card && normalize(other.title) === normalize(card.title) && codeHit(other)))
        : mentions(text, card.title);
      if (named) selected.push(card);
    }
  }
  return [...new Map(selected.map((c) => [`${c.kind}:${c.id}`, c])).values()].slice(0, MAX_ANSWER_CARDS);
}
