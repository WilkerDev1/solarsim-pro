import assert from 'node:assert/strict';
import {
  extendTypeAhead, findTypeAheadMatch, moveActiveIndex, normalizeSearchText, placePopover, resolveSelectKey,
} from '../components/simulator/params/ui/selectNavigation';

// --- Normalización: sin acentos ni mayúsculas ---
assert.equal(normalizeSearchText('  Peravia '), 'peravia');
assert.equal(normalizeSearchText('María Trinidad Sánchez'), 'maria trinidad sanchez');
assert.equal(normalizeSearchText('ÁÉÍÓÚ'), 'aeiou');

// --- Teclas con el listbox cerrado ---
for (const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp']) assert.equal(resolveSelectKey(false, key), 'open', `abre con ${JSON.stringify(key)}`);
assert.equal(resolveSelectKey(false, 'Escape'), null);
assert.equal(resolveSelectKey(false, 'Tab'), null);
assert.equal(resolveSelectKey(false, 'a'), 'typeahead', 'escribir abre y busca');

// --- Teclas con el listbox abierto ---
assert.equal(resolveSelectKey(true, 'Enter'), 'select');
assert.equal(resolveSelectKey(true, ' '), 'select', 'espacio sin búsqueda en curso selecciona');
assert.equal(resolveSelectKey(true, ' ', { typing: true }), 'typeahead', 'espacio durante una búsqueda es texto');
assert.equal(resolveSelectKey(true, 'Escape'), 'close');
assert.equal(resolveSelectKey(true, 'Tab'), 'close-tab');
for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']) assert.equal(resolveSelectKey(true, key), 'move', key);
assert.equal(resolveSelectKey(true, 'q'), 'typeahead');
assert.equal(resolveSelectKey(true, 'F5'), null);
assert.equal(resolveSelectKey(true, 'a', { ctrl: true }), null, 'ctrl/meta no son búsqueda');
assert.equal(resolveSelectKey(true, 'ArrowUp', { alt: true }), 'select', 'alt+flecha arriba confirma y cierra');
assert.equal(resolveSelectKey(false, 'ArrowDown', { alt: true }), 'open');

// --- Movimiento del índice activo ---
assert.equal(moveActiveIndex(2, 'ArrowDown', 5), 3);
assert.equal(moveActiveIndex(4, 'ArrowDown', 5), 4, 'sin vuelta al final');
assert.equal(moveActiveIndex(0, 'ArrowUp', 5), 0, 'sin vuelta al inicio');
assert.equal(moveActiveIndex(2, 'Home', 5), 0);
assert.equal(moveActiveIndex(2, 'End', 5), 4);
assert.equal(moveActiveIndex(1, 'PageDown', 32), 11);
assert.equal(moveActiveIndex(30, 'PageDown', 32), 31);
assert.equal(moveActiveIndex(3, 'PageUp', 32), 0);
assert.equal(moveActiveIndex(-1, 'ArrowDown', 5), 0, 'sin activo, abajo va al primero');
assert.equal(moveActiveIndex(-1, 'ArrowUp', 5), 4, 'sin activo, arriba va al último');
assert.equal(moveActiveIndex(0, 'ArrowDown', 0), -1, 'lista vacía');
assert.equal(moveActiveIndex(1, 'x', 5), 1, 'tecla ajena no mueve');

// --- Type-ahead ---
const provinces = ['Azua', 'Bahoruco', 'Barahona', 'Santiago', 'Santo Domingo', 'San Cristóbal', 'María Trinidad Sánchez', 'Sánchez Ramírez'];
assert.equal(findTypeAheadMatch(provinces, 'b', 0), 1, 'primera que empieza por b');
assert.equal(findTypeAheadMatch(provinces, 'bar', 0), 2, 'prefijo acumulado');
assert.equal(findTypeAheadMatch(provinces, 'maria', 0), 6, 'sin acentos');
assert.equal(findTypeAheadMatch(provinces, 'san c', 0), 5, 'prefijo con espacio');
assert.equal(findTypeAheadMatch(provinces, 'santo', 0), 4);
assert.equal(findTypeAheadMatch(provinces, 'zz', 0), -1, 'sin coincidencia');
assert.equal(findTypeAheadMatch(provinces, '', 0), -1, 'búsqueda vacía');
assert.equal(findTypeAheadMatch(provinces, 'sa', 3), 3, 'prefijo largo conserva la activa si coincide');
assert.equal(findTypeAheadMatch(provinces, 's', 3), 4, 'una sola letra avanza a la siguiente coincidencia');
assert.equal(findTypeAheadMatch(provinces, 's', 7), 3, 'y da la vuelta');
assert.equal(findTypeAheadMatch(provinces, 'ss', 3), 4, 'misma letra repetida cicla');
assert.equal(findTypeAheadMatch(provinces, 'sánchez', 0), 7, 'normaliza el buffer');

// --- Buffer del type-ahead: expira a los 700 ms ---
{
  const first = extendTypeAhead({ buffer: '', at: 0 }, 'b', 1000);
  assert.deepEqual(first, { buffer: 'b', at: 1000 });
  const second = extendTypeAhead(first, 'a', 1500);
  assert.equal(second.buffer, 'ba', 'dentro de la ventana acumula');
  const stale = extendTypeAhead(second, 's', 1500 + 701);
  assert.equal(stale.buffer, 's', 'fuera de la ventana reinicia');
  assert.equal(extendTypeAhead({ buffer: 'B', at: 0 }, 'A', 10).buffer, 'ba', 'en minúsculas');
}

// --- Posición del popover: debajo si cabe, arriba si no, siempre dentro de la ventana ---
{
  const viewport = { width: 800, height: 700 };
  const below = placePopover({ top: 100, bottom: 132, left: 40, width: 220 }, viewport, 280);
  assert.equal(below.placement, 'bottom');
  assert.equal(below.top, 136, 'a 4 px del disparador');
  assert.equal(below.left, 40);
  assert.equal(below.minWidth, 220, 'al menos el ancho del disparador');
  assert.equal(below.maxHeight, 280);

  const flipped = placePopover({ top: 600, bottom: 632, left: 40, width: 220 }, viewport, 280);
  assert.equal(flipped.placement, 'top', 'sin espacio abajo se abre hacia arriba');
  assert.equal(flipped.bottom, 700 - 600 + 4, 'anclado por su borde inferior');
  assert.equal(flipped.maxHeight, 280);

  const tight = placePopover({ top: 150, bottom: 182, left: 40, width: 220 }, { width: 800, height: 400 }, 280);
  assert.equal(tight.placement, 'bottom', 'si abajo cabe más que arriba, abajo');
  assert.ok(tight.maxHeight <= 400 - 186 - 8, 'el máximo respeta el borde de la ventana');
  assert.ok(tight.maxHeight >= 96, 'altura mínima usable');

  const right = placePopover({ top: 100, bottom: 132, left: 700, width: 220 }, viewport, 280);
  assert.ok(right.left + 220 <= 800 - 8, 'no se sale por la derecha');
  const leftEdge = placePopover({ top: 100, bottom: 132, left: -20, width: 220 }, viewport, 280);
  assert.equal(leftEdge.left, 8, 'no se sale por la izquierda');
}

console.log('Parameter dock select navigation tests passed.');
