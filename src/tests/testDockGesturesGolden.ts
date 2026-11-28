// F2b, prueba diferencial: el proyecto que deja cada gesto del dock no cambia al mudar sus reglas al dominio. La copia dorada
// `src/tests/golden/dock-gestures.json` se generó con el código ANTERIOR a F2b (las reglas aún en los constructores de
// parche del dock); tras la mudanza, la misma batería de gestos debe dar el mismo proyecto, byte a byte.
// Regenerar solo si un cambio de comportamiento del dock es intencionado: UPDATE_GOLDEN=1 npm test -- testDockGesturesGolden
import assert from 'node:assert/strict';
import { assertGolden, goldenJson } from './support/golden';
import { DOCK_GESTURES, canonicalJson, runDockGesture, sectionsOf } from './support/dockGestures';

const results: Record<string, unknown> = {};
for (const gesture of DOCK_GESTURES) {
  assert.ok(!(gesture.label in results), `gesto repetido: ${gesture.label}`);
  const before = canonicalJson(sectionsOf(gesture.base()));
  const after = runDockGesture(gesture);
  // Cada gesto cambia algo: si no, la batería no prueba nada.
  assert.notEqual(canonicalJson(sectionsOf(after)), before, `${gesture.label}: el gesto no cambió la propuesta`);
  results[gesture.label] = JSON.parse(canonicalJson(sectionsOf(after)));
}
assertGolden('dock-gestures.json', goldenJson(results), 'El proyecto que deja la batería de gestos del dock');
console.log(`PASS: ${DOCK_GESTURES.length} gestos del dock dejan el mismo proyecto que antes de F2b (copia dorada).`);
