import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { LEGACY_MIRROR_FIELDS } from '../../shared/equipment';

/**
 * Guarda de la oleada 5 (ADR 0001): `SystemSpecs` ya no declara el espejo heredado y `npm run lint` rechaza
 * `specs.panelCount` & co. Esta prueba cubre lo que el compilador no ve (`any`, JSON sin tipar, tipos
 * estructurales propios): ningún archivo fuera de la lista de lectura de datos viejos puede acceder a un campo
 * del espejo a través de unas specs (`specs.panelCount`, `project.specs.batteryDOD`, `specs['panelPowerW']`).
 * Los totales (`equipmentTotals(...).panelCount`) y los campos del catálogo no son el espejo y no se tocan.
 * No ve nombres de campo guardados como texto (listas de validación, contrato del asistente): los del visor viven en
 * `shared/equipment` (`LEGACY_MIRROR_TEXT_FIELDS`/`LEGACY_MIRROR_NUMBER_FIELDS`) y los del asistente se traducen con
 * `applyLegacyEquipmentPatch`.
 */
const root = process.cwd();

/** Único código que lee datos VIEJOS antes de migrarlos: todo lo demás usa grupos. */
const LEGACY_READERS = new Set([
  'src/store/persistence/hydrateSimulationStore.ts', // rehidratación local previa a `migrateLegacySpecs`
  'src/store/slices/importExportSlice.ts', // importación de archivos `.json` de versiones anteriores
]);
const LEGACY_DIRS = ['shared/equipment/'];

const SCAN_DIRS = ['src', 'shared', 'workers/share-viewer/src', 'server/src', 'electron'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tests', 'release', '.wrangler']);

const fields = [...LEGACY_MIRROR_FIELDS, 'selectedSupplierInfo'].join('|');
// Receptor «specs»: `specs.x`, `project.specs.x`, `legacySpecs?.x`, `specs['x']`.
const ACCESS = new RegExp(`[sS]pecs\\??(?:\\.(?:${fields})\\b|\\[\\s*['"](?:${fields})['"]\\s*\\])`);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(root, dir))) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (LEGACY_READERS.has(rel) || LEGACY_DIRS.some((legacy) => rel.startsWith(legacy))) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (ACCESS.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
    });
  }
}

assert.deepEqual(offenders, [], `Acceso al espejo heredado fuera de los lectores de datos viejos (usa readEquipment/equipmentTotals/describeEquipment):\n${offenders.join('\n')}`);
for (const legacyReader of LEGACY_READERS) assert.ok(statSync(path.join(root, legacyReader)).isFile(), `${legacyReader} debe existir (actualiza la lista si se mueve)`);
console.log('PASS: ningún código fuera de los lectores de datos viejos accede al espejo heredado.');
