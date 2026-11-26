import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// shared/quotations es TypeScript puro: solo importa de shared/ (con extensión .js) y nunca fija la tasa de ITBIS.
const dir = path.join(process.cwd(), 'shared/quotations');
const files = readdirSync(dir, { recursive: true, withFileTypes: false }).map(String).filter(file => file.endsWith('.ts')).sort();
assert(files.length >= 8, `se esperaban los módulos de cotizaciones, hay ${files.length}`);

const importSpecifiers = (source: string): string[] => {
  const specifiers: string[] = [];
  const patterns = [/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
};

for (const file of files) {
  const source = readFileSync(path.join(dir, file), 'utf8');
  for (const specifier of importSpecifiers(source)) {
    assert(specifier.startsWith('./') || specifier.startsWith('../'), `${file}: importa un módulo ajeno a shared/ ("${specifier}")`);
    assert(specifier.endsWith('.js'), `${file}: el import relativo "${specifier}" debe terminar en .js`);
    const target = path.posix.normalize(path.posix.join('shared/quotations', path.posix.dirname(file.split(path.sep).join('/')), specifier));
    assert(target.startsWith('shared/'), `${file}: "${specifier}" sale de shared/ (${target})`);
  }
  assert(!source.includes('0.18'), `${file}: el literal 0.18 no va aquí; la tasa sale de ITBIS_RATE (shared/financialRules.ts)`);
  assert(!/\b(?:Date\.now|new Date\(\)|crypto\.|Math\.random)\b/.test(source), `${file}: shared/quotations no lee relojes ni genera ids`);
}

// el detector funciona
assert.deepEqual(importSpecifiers(`import { a } from '../x.js';\nexport * from "./y.js";\nimport type { T } from 'node:fs';\nimport('z')`), ['../x.js', './y.js', 'node:fs', 'z']);

console.log(`Quotation shared purity tests passed (${files.length} files).`);
