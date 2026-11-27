// Enlaces externos (shared/externalUrl.ts): la lista blanca que aplica el proceso principal de Electron
// (IPC `open-external-url`) y el renderer (`openExternalUrl`). Solo http(s) con host y `mailto:` con una sola
// dirección válida (o ninguna) y únicamente `subject` y `body`, una vez cada una.
import assert from 'node:assert/strict';
import { isOpenableExternalUrl, isValidEmailAddress } from '../../shared/externalUrl';
import { openExternalUrl } from '../utils/openExternalUrl';

// Lo que ya abría la app sigue pasando: compartir propuesta, actualizador (GitHub) y Cloudflare.
for (const good of [
  'https://solarsim-share.example.workers.dev/p/abc123?t=XYZ',
  'https://github.com/WilkerDev1/solarsim/releases/tag/v2.9.4',
  'https://github.com/WilkerDev1/solarsim/releases/download/v2.9.4/SolarSim-Pro-2.9.4.AppImage',
  'http://localhost:8787/p/abc',
  'https://dash.cloudflare.com/',
  'mailto:',
  'mailto:miguel@example.com',
  'mailto:miguel@example.com?subject=Cotizaci%C3%B3n&body=Hola%3A%0D%0A%0D%0AL%C3%ADnea',
  'mailto:?subject=s&body=b',
  'mailto:a%2Bb@example.com?body=x',
]) assert.equal(isOpenableExternalUrl(good), true, `debe aceptar ${good}`);

for (const bad of [
  'mailto:?attach=/etc/passwd',
  'mailto:a@b.com?subject=x&attachment=file:///home',
  'mailto:a@b.com?cc=x@y.com',
  'mailto:a@b.com?bcc=x@y.com',
  'mailto:a@b.com?to=x@y.com',
  'mailto:a@b.com?cc=x@y.com&bcc=z@y.com&attachment=file:///home',
  'mailto:%0D%0ABcc:x@y.com',
  'mailto:a@b.com%0D%0ABcc:x@y.com',
  'mailto:a@b.com,c@d.com',
  'mailto:a@b.com%2Cc@d.com',
  'mailto:a@b.com;c@d.com',
  'mailto:no-es-correo',
  'mailto:a@b.com?subject=x%0D%0ABcc:%20y@z.com',
  'mailto:a@b.com?subject=a&subject=b',
  'mailto:a@b.com?body=a&body=b',
  'mailto:a@b.com?Subject=x',
  'mailto:a@b.com?subject=%E0%A4%A',
  'mailto:a@b.com?body=%00',
  'mailto:a@b.com#frag',
  'https://\\\\evil\\share',
  'https://\\evil\\share',
  'https:///nohost',
  'https://user:pass@example.com/',
  'file:///etc/passwd',
  'javascript:alert(1)',
  'smb://evil/share',
  'ms-msdt:/id PCWDiagnostic',
  'vscode://file/etc/passwd',
  'ftp://example.com',
  'data:text/html,<script>',
  'mailto:a@b.com\r\nX: y',
  'https://example.com/a b',
  '',
  42,
  null,
]) assert.equal(isOpenableExternalUrl(bad), false, `debe rechazar ${String(bad)}`);

assert.equal(isValidEmailAddress('miguel@example.com'), true);
assert.equal(isValidEmailAddress('a@b'), false);

// openExternalUrl: http(s) en el navegador abre ventana nueva; mailto: con location; el puente decide en Electron.
const calls: string[] = [];
const web = { assign: (u: string) => calls.push(`assign:${u}`), openWindow: (u: string) => calls.push(`window:${u}`) };
assert.equal(await openExternalUrl('https://example.com/x', web), true);
assert.equal(await openExternalUrl('mailto:a@b.com', web), true);
assert.deepEqual(calls, ['window:https://example.com/x', 'assign:mailto:a@b.com']);
assert.equal(await openExternalUrl('mailto:?attach=/etc/passwd', web), false, 'el renderer tampoco abre lo no permitido');
assert.equal(await openExternalUrl('https://example.com', { electron: { openExternalUrl: async () => true } }), true);
assert.equal(await openExternalUrl('https://example.com', { electron: { openExternalUrl: async () => false } }), false, 'el puente rechaza');
assert.equal(await openExternalUrl('https://example.com', { electron: { openExternalUrl: async () => { throw new Error('ipc'); } } }), false, 'el puente falla');
assert.equal(await openExternalUrl('https://example.com', {}), false, 'sin mecanismo');

console.log('External URL tests passed.');
