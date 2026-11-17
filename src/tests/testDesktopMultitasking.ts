import assert from 'node:assert/strict';
import { MAIN_WINDOW_MIN_SIZE, MAIN_WINDOW_DEFAULT_SIZE } from '../../electron/window/windowLayout';
import { parameterSidebarCssWidth, draggedSidebarWidth, PARAMETER_SIDEBAR_MIN_PX } from '../components/simulator/sidebar/sidebarWidth';

// Multitarea de escritorio: Windows Snap (Win+←/→, Win+↑/↓ en cuadrantes) y el tiling de GNOME/KDE
// (Super+←/→) solo acomodan la ventana si su tamaño mínimo cabe en la mitad / el cuadrante del área de trabajo.

// Áreas de trabajo típicas: ancho de pantalla y alto menos barra de tareas/panel (~48 px).
const workAreas = [
  { name: '1280×720', width: 1280, height: 720 - 48 },
  { name: '1366×768', width: 1366, height: 768 - 48 },
  { name: '1920×1080', width: 1920, height: 1080 - 48 },
];

for (const area of workAreas) {
  assert.ok(MAIN_WINDOW_MIN_SIZE.width <= Math.floor(area.width / 2), `${area.name}: la mitad de la pantalla debe admitir el ancho mínimo`);
}
// Cuadrantes (Win+↑/↓ tras acoplar a un lado) en 1080p.
assert.ok(MAIN_WINDOW_MIN_SIZE.height <= Math.floor((1080 - 48) / 2), '1920×1080: un cuadrante debe admitir el alto mínimo');
// Pero no tan pequeña que la app deje de ser usable.
assert.ok(MAIN_WINDOW_MIN_SIZE.width >= 600, 'el ancho mínimo sigue dejando espacio al dock y al contenido');
assert.ok(MAIN_WINDOW_MIN_SIZE.height >= 450, 'el alto mínimo sigue dejando ver cabecera y contenido');
// El tamaño inicial no cambia respecto a 2.8.0.
assert.deepEqual(MAIN_WINDOW_DEFAULT_SIZE, { width: 1440, height: 900 });

// Panel de parámetros: conserva el ancho elegido en ventanas amplias y cede espacio en ventanas estrechas.
assert.equal(parameterSidebarCssWidth(380), `min(380px, max(${PARAMETER_SIDEBAR_MIN_PX}px, 40vw))`);
assert.equal(parameterSidebarCssWidth(520), `min(520px, max(${PARAMETER_SIDEBAR_MIN_PX}px, 40vw))`);
// Valores ausentes o por debajo del piso histórico vuelven a 380 px (comportamiento de 2.8.0 en pantalla completa).
assert.equal(parameterSidebarCssWidth(0), `min(380px, max(${PARAMETER_SIDEBAR_MIN_PX}px, 40vw))`);
assert.equal(parameterSidebarCssWidth(200), `min(380px, max(${PARAMETER_SIDEBAR_MIN_PX}px, 40vw))`);
assert.equal(parameterSidebarCssWidth(Number.NaN), `min(380px, max(${PARAMETER_SIDEBAR_MIN_PX}px, 40vw))`);
// Con la ventana al mínimo el contenido del simulador conserva al menos 280 px (dock de 64 px).
assert.ok(MAIN_WINDOW_MIN_SIZE.width - 64 - PARAMETER_SIDEBAR_MIN_PX >= 280, 'el contenido del simulador conserva espacio con la ventana al mínimo');

// Arrastre del borde: el ancho guardado es la distancia al borde izquierdo del panel (no a la ventana)
// y nunca supera lo que se dibuja (40 % de la ventana, máx. 600 px), así el borde sigue al cursor.
assert.equal(draggedSidebarWidth(64 + 450, 64, 1440), 450, 'descuenta el dock de iconos');
assert.equal(draggedSidebarWidth(64 + 900, 64, 1920), 600, 'tope absoluto de 600 px');
assert.equal(draggedSidebarWidth(64 + 700, 64, 1280), 512, 'tope del 40 % de la ventana');
assert.equal(draggedSidebarWidth(64 + 100, 64, 1440), PARAMETER_SIDEBAR_MIN_PX, 'piso de 280 px');
assert.equal(draggedSidebarWidth(64 + 500, 64, 640), PARAMETER_SIDEBAR_MIN_PX, 'ventana mínima: el panel no baja de 280 px');

console.log('testDesktopMultitasking: OK');
