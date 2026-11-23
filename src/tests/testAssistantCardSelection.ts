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
  selectAnswerCards([search], 'La última propuesta es **CAMILO HERNANDEZ, EUDY** (`SP-2026-149`), en borrador.').map((c) => c.id),
  ['p149'],
);
// Sin mención, una lista larga no muestra tarjetas: el texto ya responde.
assert.deepEqual(selectAnswerCards([search], 'Tienes seis propuestas recientes.'), []);
// El código se compara completo: SP-2026-105-V3 no enciende SP-2026-105, y tildes/mayúsculas no importan.
assert.deepEqual(selectAnswerCards([search], 'Es la versión sp-2026-105-v3 de Arianny.').map((c) => c.id), ['p1051']);
assert.deepEqual(selectAnswerCards([search], 'La original es SP-2026-105.').map((c) => c.id), ['p105']);
// Mismo cliente en dos propuestas: el código nombrado decide; el nombre solo cuenta si ninguna hermana se nombró por código.
assert.deepEqual(selectAnswerCards([search], 'Peña Mendoza, Ana María (SP-2026-147).').map((c) => c.id), ['p147']);
assert.deepEqual(selectAnswerCards([search], 'Yolanda Sanchez de Genao tiene una propuesta.').map((c) => c.id), ['p148']);
// Resultados puntuales (get_project, búsquedas estrechas) se muestran siempre, sin duplicados y con tope.
assert.deepEqual(selectAnswerCards([[project(1)], [project(1)], [project(2), project(3)]], 'Listo.').map((c) => c.id), ['p1', 'p2', 'p3']);
assert.equal(selectAnswerCards([Array.from({ length: 12 }, (_, i) => project(i))], Array.from({ length: 12 }, (_, i) => `SP-2026-${i}`).join(', ')).length, 6);
// En equipos la marca no basta (todas las tarjetas la comparten): cuenta el modelo.
const equipment: AssistantCard[] = ['JA Solar JAM72 550W', 'JA Solar JAM72 580W', 'JA Solar JAM66 610W', 'JA Solar JAM54 420W'].map((t, i) => ({ kind: 'equipment', id: `e${i}`, title: t, detail: 'JA Solar' }));
assert.deepEqual(selectAnswerCards([equipment], 'Te recomiendo el JA Solar JAM72 580W.').map((c) => c.id), ['e1']);
// Una copia («… (Copia)», código -V2) contiene el nombre de la original: nombrar la copia no muestra la original.
const copies = [...search.slice(0, 3), project(7, 'Ana Peña', 'SP-2026-7'), project(70, 'Ana Peña (Copia)', 'SP-2026-7-V2')];
assert.deepEqual(selectAnswerCards([copies], 'La última es Ana Peña (Copia), SP-2026-7-V2.').map((c) => c.id), ['p70']);
assert.deepEqual(selectAnswerCards([copies], 'La última es Ana Peña (Copia).').map((c) => c.id), ['p70']);
const deye: AssistantCard[] = ['Deye SUN-8K-SG04LP1', 'Deye SUN-8K-SG04LP1 EU', 'Deye SUN-5K', 'Deye SUN-12K'].map((t, i) => ({ kind: 'equipment', id: `d${i}`, title: t, detail: 'Deye' }));
assert.deepEqual(selectAnswerCards([deye], 'Usa el Deye SUN-8K-SG04LP1 EU.').map((c) => c.id), ['d1']);
assert.deepEqual(selectAnswerCards([deye], 'Usa el Deye SUN-8K-SG04LP1.').map((c) => c.id), ['d0']);
// El markdown de la respuesta (negrita en la marca, código entre comillas invertidas) no impide reconocer el nombre.
assert.deepEqual(selectAnswerCards([equipment], 'Recomiendo **JA Solar** _JAM72_ 580W.').map((c) => c.id), ['e1']);
// Umbral: tres tarjetas se muestran enteras; cuatro ya son un listado.
assert.equal(selectAnswerCards([search.slice(0, 3)], 'Listo.').length, 3);
assert.equal(selectAnswerCards([search.slice(0, 4)], 'Listo.').length, 0);

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
console.log('Assistant card selection: only answer-relevant cards, exact codes, sibling disambiguation and cap passed.');
