import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdateAvailableBanner, UpdateBannerView, updateBannerModel } from '../components/dashboard/sidebar/UpdateAvailableBanner';
import { shouldAutoCheckForUpdates, UPDATE_CHECK_INTERVAL_MS } from '../components/common/useAutoUpdateCheck';
import { useSimulationStore } from '../store/useSimulationStore';

// Sin actualización no hay aviso.
for (const state of ['idle', 'checking', 'not-available', 'error'] as const) {
  assert.equal(updateBannerModel({ state, version: '2.7.4' }, null), null, `sin aviso en ${state}`);
}

const available = updateBannerModel({ state: 'available', version: '2.7.4' }, null);
assert.equal(available?.kind, 'available');
assert.match(available!.detail, /v2\.7\.4/);
assert.equal(available!.dismissible, true);
assert.equal(updateBannerModel({ state: 'available', version: '2.7.4' }, '2.7.4'), null, 'ocultado para esa versión');
assert.equal(updateBannerModel({ state: 'available', version: '2.7.5' }, '2.7.4')?.kind, 'available', 'una versión nueva vuelve a avisar');
assert.equal(updateBannerModel({ state: 'available' }, null)?.dismissible, false, 'sin versión no se ofrece ocultar');

const downloading = updateBannerModel({ state: 'downloading', version: '2.7.4', progressPct: 42.6 }, '2.7.4');
assert.equal(downloading?.kind, 'downloading', 'la descarga se ve aunque se ocultara el aviso');
assert.equal(downloading!.progressPct, 43);
assert.equal(downloading!.dismissible, false);
assert.equal(updateBannerModel({ state: 'downloading', progressPct: 140 }, null)!.progressPct, 100);

assert.equal(updateBannerModel({ state: 'downloaded', version: '2.7.4' }, null)?.kind, 'ready');
assert.equal(updateBannerModel({ state: 'installing', version: '2.7.4' }, null)?.kind, 'ready');

// La comprobación automática no pisa una actualización ya encontrada o en curso.
for (const state of ['idle', 'not-available', 'error'] as const) assert.equal(shouldAutoCheckForUpdates(state), true, state);
for (const state of ['checking', 'available', 'downloading', 'downloaded', 'installing'] as const) assert.equal(shouldAutoCheckForUpdates(state), false, state);
assert.equal(UPDATE_CHECK_INTERVAL_MS, 6 * 60 * 60 * 1000);

// Render: el aviso abre el modal (botón con nombre accesible) y solo «disponible» se puede ocultar.
const noop = () => {};
const html = renderToStaticMarkup(React.createElement(UpdateBannerView, { model: available!, onOpen: noop, onDismiss: noop }));
assert.match(html, /aria-label="Actualización disponible: v2\.7\.4 lista para descargar\. Ver novedades"/);
assert.match(html, /aria-label="Ocultar el aviso hasta la próxima versión"/);
assert.match(html, /motion-safe:animate-ping/, 'pulso llamativo en el icono, sin animación con movimiento reducido');
assert.doesNotMatch(html, /blur-\[6px\][^"]*animate-pulse/, 'el halo con desenfoque no se anima de forma continua');
const progress = renderToStaticMarkup(React.createElement(UpdateBannerView, { model: downloading!, onOpen: noop, onDismiss: noop }));
assert.match(progress, /width:43%/, 'barra de progreso');
assert.doesNotMatch(progress, /Ocultar el aviso/, 'la descarga no se puede ocultar');
useSimulationStore.setState({ updateInfo: { state: 'not-available' } });
assert.equal(renderToStaticMarkup(React.createElement(UpdateAvailableBanner)), '', 'sin actualización no se pinta nada');
useSimulationStore.setState({ updateInfo: { state: 'idle' } });

// El proceso principal no deja que una búsqueda pise una descarga en curso.
const handler = readFileSync('electron/updater/autoUpdaterHandler.ts', 'utf8');
assert.match(handler, /ipcMain\.handle\('check-for-updates', async \(\) => \{(\s*\/\/[^\n]*\n)+\s*if \(BUSY_UPDATE_STATES\.has\(lastUpdateStatus\.state\)\)/, 'la guarda va antes de emitir «checking»');
assert.match(handler, /Error downloading update[\s\S]{0,300}sendUpdateStatus\(\{ state: 'error'/, 'una descarga fallida libera la guarda');

console.log('Update banner: avisa disponible, descarga y lista; se oculta por versión; la comprobación automática no pisa una actualización.');
