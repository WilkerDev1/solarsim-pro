import type { AssistantCard, AssistantResultListData } from './types';

/** Resultados con más tarjetas que esto son listados: se muestran como lista compacta, no como tarjetas sueltas. */
const LIST_THRESHOLD = 3;
/** Tarjetas como mucho por respuesta: el texto lleva el detalle; las tarjetas son accesos directos. */
export const MAX_ANSWER_CARDS = 6;
/** Filas por listado (el tope de las búsquedas) y listados por respuesta. */
export const MAX_LIST_ITEMS = 12;
export const MAX_ANSWER_LISTS = 3;

/** Sin tildes, mayúsculas ni marcas de Markdown (`**JA Solar**`, `_JAM72_`, comillas invertidas), igual en texto y nombres. */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*_`~]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const key = (c: AssistantCard) => `${c.kind}:${c.id}`;

/**
 * `needle` aparece completo en `text` (ya normalizado): SP-2026-105 no coincide dentro de SP-2026-105-V3, ni
 * SG04LP1 dentro de SUN-8K-SG04LP1. Un guion suelto delante (viñeta o separador: «-SP-2026-149») sí vale.
 */
function mentions(text: string, needle: string): boolean {
  const n = normalize(needle);
  if (n.length < 3) return false;
  return new RegExp(`(?<![a-z0-9])(?<![a-z0-9]-)${escapeRegExp(n)}(?![a-z0-9]|-[a-z0-9])`).test(text);
}

/**
 * Tarjetas del listado que la respuesta nombra. Una propuesta se nombra por su código o por el nombre del cliente;
 * un equipo por su modelo, nunca solo por la marca (que comparten todas las tarjetas del listado). Si el nombre de
 * una tarjeta está dentro del de otra también nombrada («Ana Peña» en «Ana Peña (Copia)», «SUN-8K» en «SUN-8K EU»)
 * o una propuesta del mismo cliente se nombró por código, cuenta la más específica.
 */
function namedIn(group: AssistantCard[], text: string): AssistantCard[] {
  const hits = group.map((card) => ({
    card,
    title: normalize(card.title),
    byCode: card.kind === 'project' && mentions(text, card.detail),
    byName: mentions(text, card.title),
  }));
  return hits
    .filter((hit) => hit.byCode || (hit.byName && !hits.some((other) => other !== hit && other.title.includes(hit.title)
      && (other.byCode || (other.byName && other.title.length > hit.title.length)))))
    .map((hit) => hit.card);
}

/**
 * Lo que acompaña la respuesta del asistente. Cada grupo son las tarjetas de una llamada a herramienta:
 * - un resultado puntual (get_project, una búsqueda estrecha, ≤3) se muestra como tarjetas;
 * - un listado amplio (search_projects, search_equipment) se muestra como lista compacta. Si la respuesta se centra
 *   en una a tres de sus filas («la última propuesta»), esas van como tarjetas y la lista queda plegada; si no nombra
 *   ninguna (resume) o enumera muchas, la lista va abierta, con las nombradas primero.
 */
export function selectAnswerCards(groups: AssistantCard[][], answer: string): { cards: AssistantCard[]; lists: AssistantResultListData[] } {
  const text = normalize(answer);
  const cards: AssistantCard[] = [];
  const lists: AssistantResultListData[] = [];
  const listed = new Set<string>();
  for (const group of groups) {
    if (group.length <= LIST_THRESHOLD) {
      cards.push(...group);
      continue;
    }
    const named = namedIn(group, text);
    const focused = named.length > 0 && named.length <= LIST_THRESHOLD;
    if (focused) cards.push(...named);
    const items = [...new Map([...(focused ? [] : named), ...group].map((c) => [key(c), c])).values()].slice(0, MAX_LIST_ITEMS);
    const signature = items.map(key).sort().join('|');
    if (listed.has(signature)) continue;
    listed.add(signature);
    lists.push({ kind: group[0].kind, items, collapsed: focused });
  }
  return {
    cards: [...new Map(cards.map((c) => [key(c), c])).values()].slice(0, MAX_ANSWER_CARDS),
    lists: lists.slice(0, MAX_ANSWER_LISTS),
  };
}
