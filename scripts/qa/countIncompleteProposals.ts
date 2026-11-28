// Recuento de SOLO LECTURA de las propuestas guardadas que pasarían a «Incompleta» (F7a; decisión abierta del ADR 0009).
// Lee los archivos JSON que le pases y cuenta con las reglas de producción (`proposalCompleteness`); no escribe nada, no abre el
// almacén de la app y no usa la red. Ejecútalo tú, en tu equipo, con tus datos: el informe agregado no imprime nombres de clientes.
//
// Cómo obtener el archivo (cualquiera de los dos):
//   1. Respaldo de proyectos: en la app, Ajustes → «Respaldo & Exportación» → «Descargar Respaldo JSON» (SolarSim_Pro_Backup_Proyectos_….json).
//      No incluye los ajustes: para contar el margen guardado, léelo en Ajustes → «Costos y margen» («Margen bruto objetivo») y pásalo
//      con --margin.
//   2. Estado guardado local (incluye los ajustes): con la app en modo de desarrollo (`npm run electron:dev`), en la consola del
//      desarrollador (Application → Local Storage → la clave `solarsim-pro-storage`), o desde la consola con
//      `copy(localStorage.getItem('solarsim-pro-storage'))`, y pegarlo en un archivo .json.
//      Con una sesión de la organización, el respaldo (1) trae lo que hay en este equipo (lo sincronizado y lo local).
//
// Uso:
//   npx tsx scripts/qa/countIncompleteProposals.ts respaldo.json
//   npx tsx scripts/qa/countIncompleteProposals.ts equipo-a.json equipo-b.json --detail      (una instalación por archivo)
//   npx tsx scripts/qa/countIncompleteProposals.ts respaldo.json --margin 28 --json
// Opciones: --detail (lista el código de cada propuesta incompleta con sus motivos, sin nombres de clientes), --margin <pct> (margen
// leído en Ajustes para un archivo sin ajustes), --json (el recuento en JSON).
// Salida: 0 recuento hecho; 2 argumentos inválidos o ningún archivo legible.
import { readFileSync } from 'node:fs';
import { countIncompleteProposals, formatIncompleteCount, parseCountArgs, type ExportedFile } from './incompleteProposalCount';

const parsed = parseCountArgs(process.argv.slice(2));
if (!parsed.ok) { console.error(parsed.error); process.exit(2); }

const files: ExportedFile[] = [];
const unreadable: string[] = [];
for (const name of parsed.files) {
  try {
    files.push({ name, json: JSON.parse(readFileSync(name, 'utf8')), ...(parsed.margin === undefined ? {} : { margin: parsed.margin }) });
  } catch (error) {
    unreadable.push(`${name} (${error instanceof Error ? error.message : 'ilegible'})`);
  }
}
if (!files.length) { console.error(`Ningún archivo se pudo leer: ${unreadable.join('; ')}`); process.exit(2); }

const report = countIncompleteProposals(files, { detail: parsed.detail });
report.unreadable.push(...unreadable);
report.files += unreadable.length;
if (parsed.json) console.log(JSON.stringify(report, null, 2));
else console.log(formatIncompleteCount(report, { detail: parsed.detail }));
if (report.evaluated === 0) { console.error('No hay propuestas que evaluar en los archivos indicados.'); process.exit(2); }
process.exit(0);
