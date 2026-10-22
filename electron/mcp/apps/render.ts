// Pure rendering of agent cards for MCP Apps views. Every dynamic value goes through escapeHtml; no markup comes from data.
import type { AgentCard, McpAppCardType } from '../../../shared/agentCards';

type CardOf<T extends McpAppCardType> = Extract<AgentCard, { type: T }>;

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Cards of this view's type from a tool result's `structuredContent.cards` (the outcome envelope). */
export function extractCards<T extends McpAppCardType>(result: { structuredContent?: unknown; content?: unknown } | undefined, type: T): CardOf<T>[] {
  const cards = (result?.structuredContent as { cards?: unknown } | undefined)?.cards;
  if (!Array.isArray(cards)) return [];
  return cards.filter((c): c is CardOf<T> => !!c && typeof c === 'object' && (c as AgentCard).type === type && typeof (c as AgentCard).title === 'string');
}

/** Text shown when a result has no card of this view's type: the same text every host receives. */
export function fallbackText(result: { content?: unknown } | undefined): string {
  const first = Array.isArray(result?.content) ? (result!.content as { type?: string; text?: string }[]).find((c) => c?.type === 'text') : undefined;
  return first?.text?.slice(0, 2000) || 'Sin resultados que mostrar.';
}

const number = (value: number, digits = 1) => new Intl.NumberFormat('es-DO', { maximumFractionDigits: digits }).format(value);
const chip = (label: string) => `<span class="chip">${escapeHtml(label)}</span>`;

function proposal(card: CardOf<'proposal'>): string {
  const chips = [
    card.status && chip(card.status),
    card.commercialStatus && chip(card.commercialStatus),
    typeof card.systemKWp === 'number' && chip(`${number(card.systemKWp)} kWp`),
    typeof card.priceUSD === 'number' && chip(`USD ${number(card.priceUSD, 0)}`),
  ].filter(Boolean).join('');
  return `<article class="card"><h2>${escapeHtml(card.title)}</h2>${card.detail ? `<p class="muted">${escapeHtml(card.detail)}</p>` : ''}${chips ? `<p class="chips">${chips}</p>` : ''}</article>`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const SEVERITY = { error: 'error', warning: 'warning', info: 'info' } as const;

function audit(card: CardOf<'catalog-audit'>): string {
  const count = (severity: keyof typeof SEVERITY) => card.findings.filter((f) => f.severity === severity).length;
  // The card carries a capped subset (the real total travels in `detail`), so the counts say they cover only what is listed.
  const shown = [plural(count('error'), 'error', 'errores'), plural(count('warning'), 'aviso', 'avisos'), plural(count('info'), 'nota', 'notas')].join(' · ');
  const rows = card.findings.map((f) =>
    `<li class="finding ${SEVERITY[f.severity] ?? 'info'}"><span class="dot"></span><span>${escapeHtml(f.message)}${f.equipmentId ? ` <span class="muted">(${escapeHtml(f.equipmentId)})</span>` : ''}</span></li>`).join('');
  return `<article class="card"><h2>${escapeHtml(card.title)}</h2>${card.detail ? `<p class="muted">${escapeHtml(card.detail)}</p>` : ''}<p class="muted">Mostrados: ${escapeHtml(shown)}</p>${rows ? `<ul>${rows}</ul>` : '<p class="muted">Sin hallazgos.</p>'}</article>`;
}

function pending(card: CardOf<'pending-action'>): string {
  const rows = card.changes.slice(0, 20).map((c) =>
    `<li><strong>${escapeHtml(c.label)}</strong>: ${c.before !== undefined ? `<span class="before">${escapeHtml(c.before)}</span> → ` : ''}<span class="after">${escapeHtml(c.after)}</span></li>`).join('');
  return `<article class="card"><h2>${escapeHtml(card.title)}</h2><p class="notice">Pendiente de confirmación en SolarSim (id ${escapeHtml(card.actionId)}). No está aplicada.</p>${rows ? `<ul>${rows}</ul>` : ''}</article>`;
}

export function renderCards<T extends McpAppCardType>(type: T, cards: CardOf<T>[]): string {
  const render = { proposal, 'catalog-audit': audit, 'pending-action': pending }[type] as (card: CardOf<T>) => string;
  return cards.slice(0, 12).map(render).join('');
}
