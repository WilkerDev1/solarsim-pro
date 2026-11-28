import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Guarda de la red de seguridad de F0: una suite que sobrevive a F6 no depende de un punto de entrada que F6 elimina.
 *
 * `applyExtractedInvoice` (aiSlice) muere en F6 junto con el modal `ai-invoice`. Lo que prueba la lógica que sobrevive (normalización,
 * motor, dominio) construye el proyecto con `buildProjectFromDraft` (que pasa al dominio) y no escribe en el store; lo que prueba el
 * efecto de `applyExtractedInvoice` en el store vive en una suite `testLegacyProposalAssistant*`, que se borra entera con él.
 *
 * Excepciones, cada una con su motivo; si una deja de usar el punto de entrada, la guarda pide quitarla de la lista:
 *  · testAssistantUndoCharacterization (b3) y testProposalCreationDefaultsCharacterization: son caracterizaciones del camino legado
 *    del asistente de propuestas (qué hace hoy al deshacer y con qué valores nace una propuesta). F2a1/F2b invierten o unifican esas
 *    aserciones, y F6 borra las que queden.
 */
const ENTRY_POINTS = [/\bapplyExtractedInvoice\b/];
const ALLOWED_CHARACTERIZATIONS = new Set(['testAssistantUndoCharacterization.ts', 'testProposalCreationDefaultsCharacterization.ts']);

const dir = path.join(process.cwd(), 'src/tests');
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
const suites = readdirSync(dir).filter((name) => /^test.*\.ts$/.test(name) && !name.startsWith('testLegacy') && name !== path.basename(import.meta.url));
const uses = (name: string) => ENTRY_POINTS.some((entry) => entry.test(stripComments(readFileSync(path.join(dir, name), 'utf8'))));

const offenders = suites.filter((name) => !ALLOWED_CHARACTERIZATIONS.has(name) && uses(name));
assert.deepEqual(offenders, [], `Estas suites que sobreviven a F6 llaman a un punto de entrada que F6 elimina (usa buildProjectFromDraft para el proyecto resultante y mueve el efecto en el store a una suite testLegacyProposalAssistant*):\n${offenders.join('\n')}`);
for (const name of ALLOWED_CHARACTERIZATIONS)
  assert.ok(suites.includes(name) && uses(name), `${name} ya no usa el punto de entrada legado o no existe: quítalo de ALLOWED_CHARACTERIZATIONS`);
console.log('PASS: ninguna suite que sobrevive a F6 depende de applyExtractedInvoice, salvo las caracterizaciones declaradas.');
