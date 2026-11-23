import type { AssistantCard } from './types';

/** Resultados con más tarjetas que esto son listados: solo se muestran las que la respuesta nombra. */
const LIST_THRESHOLD = 3;
/** Tarjetas como mucho por respuesta: el texto lleva el detalle; las tarjetas son accesos directos. */
export const MAX_ANSWER_CARDS = 6;

/** Sin tildes, mayúsculas ni marcas de Markdown (`**JA Solar**`, `_JAM72_`, comillas invertidas), igual en texto y nombres. */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*_`~]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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
 * por su código o por el nombre del cliente; un equipo por su modelo, nunca solo por la marca (que comparten
 * todas las tarjetas del listado). Si el nombre de una tarjeta está dentro del de otra también nombrada
 * («Ana Peña» en «Ana Peña (Copia)», «SUN-8K» en «SUN-8K EU») o una propuesta del mismo cliente se nombró por
 * código, cuenta la más específica.
 */
export function selectAnswerCards(groups: AssistantCard[][], answer: string): AssistantCard[] {
  const text = normalize(answer);
  const selected: AssistantCard[] = [];
  for (const group of groups) {
    if (group.length <= LIST_THRESHOLD) {
      selected.push(...group);
      continue;
    }
    const hits = group.map((card) => ({
      card,
      title: normalize(card.title),
      byCode: card.kind === 'project' && mentions(text, card.detail),
      byName: mentions(text, card.title),
    }));
    for (const hit of hits) {
      if (hit.byCode) {
        selected.push(hit.card);
        continue;
      }
      if (!hit.byName) continue;
      const shadowed = hits.some((other) => other !== hit && other.title.includes(hit.title)
        && (other.byCode || (other.byName && other.title.length > hit.title.length)));
      if (!shadowed) selected.push(hit.card);
    }
  }
  return [...new Map(selected.map((c) => [`${c.kind}:${c.id}`, c])).values()].slice(0, MAX_ANSWER_CARDS);
}
