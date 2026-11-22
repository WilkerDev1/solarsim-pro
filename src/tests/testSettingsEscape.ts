import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { settingsEscapeCloses } from '../components/settings/settingsEscape';

// «Esc = Volver a SolarSim» vive en la ventana: un Escape que nace dentro de un modal abierto (el <dialog> de ofertas,
// la confirmación, un aria-modal) es de ese modal y no debe cerrar también Ajustes.
const target = (insideModal: boolean) => ({ closest: (selector: string) => (insideModal && /dialog\[open\]/.test(selector) && /aria-modal/.test(selector) ? {} : null) });

assert.equal(settingsEscapeCloses({ key: 'Escape', defaultPrevented: false, target: target(false) }), true, 'Escape en Ajustes vuelve a SolarSim');
assert.equal(settingsEscapeCloses({ key: 'Escape', defaultPrevented: false, target: target(true) }), false, 'Escape escribiendo en «Agregar oferta» se queda en el diálogo');
assert.equal(settingsEscapeCloses({ key: 'Escape', defaultPrevented: true, target: target(false) }), false, 'un control que ya atendió Escape (preventDefault) manda');
assert.equal(settingsEscapeCloses({ key: 'Enter', defaultPrevented: false, target: target(false) }), false, 'otras teclas no cierran');
assert.equal(settingsEscapeCloses({ key: 'Escape', defaultPrevented: false, target: null }), true, 'sin destino (ventana) cierra');
assert.equal(settingsEscapeCloses({ key: 'Escape', defaultPrevented: false, target: {} }), true, 'destino sin closest (documento) cierra');

const source = readFileSync('src/components/settings/SettingsModal.tsx', 'utf8');
assert.match(source, /if \(settingsEscapeCloses\(event\)\) closeSettingsModal\(\)/, 'Ajustes usa la regla general');

console.log('Settings Escape tests passed.');
