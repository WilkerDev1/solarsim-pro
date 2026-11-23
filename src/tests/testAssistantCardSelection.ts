import assert from 'node:assert/strict';
import { selectAnswerCards } from '../features/assistant/cardSelection';
import { runAssistant } from '../features/assistant/service';
import type { GeminiTransport } from '../../shared/geminiTransport';
import type { AssistantCard } from '../features/assistant/types';

const project = (n: number, title = `Cliente ${n}`, code = `SP-2026-${n}`): AssistantCard => ({ kind: 'project', id: `p${n}`, title, detail: code });
const search = [
  project(149, 'CAMILO HERNANDEZ, EUDY'),
  project(148, 'YOLANDA SANCHEZ DE GENAO'),
  project(147, 'PEÑA MENDOZA, ANA MARIA'),
  project(146, 'PEÑA MENDOZA, ANA MARIA'),
  project(105, 'Arianny de La Cruz Baldera', 'SP-2026-105'),
  project(1051, 'Arianny de La Cruz Baldera', 'SP-2026-105-V3'),
];

// Una búsqueda amplia no inunda el chat: solo quedan las tarjetas que la respuesta nombra.
assert.deepEqual(
  selectAnswerCards([search], 'La última propuesta es **CAMILO HERNANDEZ, EUDY** (`SP-2026-149`), en borrador.').cards.map((c) => c.id),
  ['p149'],
);
// Sin mención, una lista larga no muestra tarjetas: el texto ya responde.
{
  // Sin mención, la búsqueda larga se muestra como listado abierto (no como tarjetas sueltas).
  const none = selectAnswerCards([search], 'Tienes seis propuestas recientes.');
  assert.deepEqual(none.cards, []);
  assert.equal(none.lists.length, 1);
  assert.equal(none.lists[0].kind, 'project');
  assert.equal(none.lists[0].collapsed, false);
  assert.deepEqual(none.lists[0].items.map((c) => c.id), search.map((c) => c.id));
  // Una o pocas citadas: tarjetas para ellas y el resto del resultado a mano, plegado.
  const one = selectAnswerCards([search], 'La última es SP-2026-149.');
  assert.deepEqual(one.cards.map((c) => c.id), ['p149']);
  assert.equal(one.lists[0].collapsed, true);
  assert.equal(one.lists[0].items.length, search.length);
  // Muchas citadas (la respuesta enumera): listado abierto con las citadas primero, sin tarjetas grandes.
  const many = selectAnswerCards([search], 'Tienes SP-2026-146, SP-2026-147, SP-2026-148 y SP-2026-105-V3.');
  assert.deepEqual(many.cards, []);
  assert.equal(many.lists[0].collapsed, false);
  assert.deepEqual(many.lists[0].items.slice(0, 4).map((c) => c.id), ['p148', 'p147', 'p146', 'p1051']);
  assert.equal(many.lists[0].items.length, search.length);
  // Hasta 12 filas por listado y 3 listados por respuesta; los resultados puntuales no generan listado.
  const big = Array.from({ length: 20 }, (_, i) => project(i));
  assert.equal(selectAnswerCards([big], 'Listo.').lists[0].items.length, 12);
  assert.equal(selectAnswerCards([big, big.slice(1), big.slice(2), big.slice(3)], 'Listo.').lists.length, 3);
  assert.deepEqual(selectAnswerCards([[project(1)]], 'Listo.').lists, []);
  // La misma búsqueda repetida no duplica el listado.
  assert.equal(selectAnswerCards([search, search], 'Listo.').lists.length, 1);
}
// El código se compara completo: SP-2026-105-V3 no enciende SP-2026-105, y tildes/mayúsculas no importan.
assert.deepEqual(selectAnswerCards([search], 'Es la versión sp-2026-105-v3 de Arianny.').cards.map((c) => c.id), ['p1051']);
assert.deepEqual(selectAnswerCards([search], 'La original es SP-2026-105.').cards.map((c) => c.id), ['p105']);
// Mismo cliente en dos propuestas: el código nombrado decide; el nombre solo cuenta si ninguna hermana se nombró por código.
assert.deepEqual(selectAnswerCards([search], 'Peña Mendoza, Ana María (SP-2026-147).').cards.map((c) => c.id), ['p147']);
assert.deepEqual(selectAnswerCards([search], 'Yolanda Sanchez de Genao tiene una propuesta.').cards.map((c) => c.id), ['p148']);
// Resultados puntuales (get_project, búsquedas estrechas) se muestran siempre, sin duplicados y con tope.
assert.deepEqual(selectAnswerCards([[project(1)], [project(1)], [project(2), project(3)]], 'Listo.').cards.map((c) => c.id), ['p1', 'p2', 'p3']);
assert.equal(selectAnswerCards([[project(1), project(2), project(3)], [project(4), project(5), project(6)], [project(7), project(8)]], 'Listo.').cards.length, 6);
// En equipos la marca no basta (todas las tarjetas la comparten): cuenta el modelo.
const equipment: AssistantCard[] = ['JA Solar JAM72 550W', 'JA Solar JAM72 580W', 'JA Solar JAM66 610W', 'JA Solar JAM54 420W'].map((t, i) => ({ kind: 'equipment', id: `e${i}`, title: t, detail: 'JA Solar' }));
assert.deepEqual(selectAnswerCards([equipment], 'Te recomiendo el JA Solar JAM72 580W.').cards.map((c) => c.id), ['e1']);
// Una copia («… (Copia)», código -V2) contiene el nombre de la original: nombrar la copia no muestra la original.
const copies = [...search.slice(0, 3), project(7, 'Ana Peña', 'SP-2026-7'), project(70, 'Ana Peña (Copia)', 'SP-2026-7-V2')];
assert.deepEqual(selectAnswerCards([copies], 'La última es Ana Peña (Copia), SP-2026-7-V2.').cards.map((c) => c.id), ['p70']);
assert.deepEqual(selectAnswerCards([copies], 'La última es Ana Peña (Copia).').cards.map((c) => c.id), ['p70']);
const deye: AssistantCard[] = ['Deye SUN-8K-SG04LP1', 'Deye SUN-8K-SG04LP1 EU', 'Deye SUN-5K', 'Deye SUN-12K'].map((t, i) => ({ kind: 'equipment', id: `d${i}`, title: t, detail: 'Deye' }));
assert.deepEqual(selectAnswerCards([deye], 'Usa el Deye SUN-8K-SG04LP1 EU.').cards.map((c) => c.id), ['d1']);
assert.deepEqual(selectAnswerCards([deye], 'Usa el Deye SUN-8K-SG04LP1.').cards.map((c) => c.id), ['d0']);
// El markdown de la respuesta (negrita en la marca, código entre comillas invertidas) no impide reconocer el nombre.
assert.deepEqual(selectAnswerCards([equipment], 'Recomiendo **JA Solar** _JAM72_ 580W.').cards.map((c) => c.id), ['e1']);
// Umbral: tres tarjetas se muestran enteras; cuatro ya son un listado.
assert.equal(selectAnswerCards([search.slice(0, 3)], 'Listo.').cards.length, 3);
assert.equal(selectAnswerCards([search.slice(0, 4)], 'Listo.').cards.length, 0);

// Integración: el servicio aplica la selección a la respuesta final.
let round = 0;
const transport: GeminiTransport = async () => {
  round++;
  if (round === 1) return { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'search_projects', args: { query: '' } } }] } }] };
  return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'La más reciente es CAMILO HERNANDEZ, EUDY (SP-2026-149).' }] } }] };
};
const reply = await runAssistant({
  apiKey: 'synthetic', model: 'gemini-4-hydrogen', prompt: 'muéstrame la última propuesta', history: [],
  signal: new AbortController().signal, transport,
  execute: () => ({ data: { projects: [] }, cards: search }),
});
assert.deepEqual(reply.cards?.map((c) => c.id), ['p149']);
assert.equal(reply.lists?.[0]?.collapsed, true, 'the rest of the search stays one click away');
console.log('Assistant card selection: only answer-relevant cards, exact codes, sibling disambiguation and cap passed.');
