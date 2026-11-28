// Copias doradas («golden») de contratos que clientes externos o el propio modelo leen byte a byte: una diferencia de un solo
// byte hace fallar la prueba, y el mensaje dice qué cambió y cómo regenerar. Los ficheros viven versionados en `src/tests/golden/`.
// Regenerar a propósito:  UPDATE_GOLDEN=1 npm test -- Golden   y revisar el diff de git antes de confirmar.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GOLDEN_ENV = 'UPDATE_GOLDEN';
const goldenUrl = (name: string) => new URL(`../golden/${name}`, import.meta.url);

/** Recorta una línea larga alrededor de la primera diferencia, para que el fallo se lea de un vistazo. */
function around(line: string | undefined, other: string | undefined): string {
  if (line === undefined) return '(no existe)';
  if (line.length <= 160) return JSON.stringify(line);
  let at = 0;
  while (at < line.length && line[at] === other?.[at]) at++;
  const from = Math.max(0, at - 50);
  return `${from > 0 ? '…' : ''}${JSON.stringify(line.slice(from, at + 70))}${at + 70 < line.length ? '…' : ''} (diferencia en el carácter ${at + 1})`;
}

/** Diferencia legible: primeras líneas distintas (esperada vs. actual) y tamaños en bytes. */
export function describeGoldenDiff(expected: string, actual: string): string {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const lines: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length) && lines.length < 12; i++) {
    if (a[i] === b[i]) continue;
    lines.push(`  línea ${i + 1}:`, `    golden: ${around(a[i], b[i])}`, `    actual: ${around(b[i], a[i])}`);
  }
  const extra = lines.length >= 12 ? '\n  … (más diferencias; revisa `git diff` tras regenerar)' : '';
  return `${lines.join('\n')}${extra}\n  tamaño: golden ${Buffer.byteLength(expected)} bytes, actual ${Buffer.byteLength(actual)} bytes`;
}

/** Texto canónico de un JSON dorado: sangrado de dos espacios y salto de línea final. */
export const goldenJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export function assertGolden(name: string, actual: string, what: string): void {
  const url = goldenUrl(name);
  if (process.env[GOLDEN_ENV] === '1') {
    mkdirSync(fileURLToPath(new URL('./', url)), { recursive: true });
    writeFileSync(url, actual, 'utf8');
    console.log(`GOLDEN regenerado: src/tests/golden/${name}`);
    return;
  }
  if (!existsSync(url))
    throw new Error(`Falta la copia dorada src/tests/golden/${name} (${what}). Genérala con: ${GOLDEN_ENV}=1 npm test -- Golden`);
  const expected = readFileSync(url, 'utf8');
  if (expected === actual) return;
  throw new Error(
    `${what} cambió respecto de la copia dorada src/tests/golden/${name}.\n${describeGoldenDiff(expected, actual)}\n`
    + `Si el cambio es intencionado (un contrato que ven clientes MCP o el modelo), regenera con: ${GOLDEN_ENV}=1 npm test -- Golden `
    + 'y justifica el diff en el PR; si no, revierte el cambio.',
  );
}
