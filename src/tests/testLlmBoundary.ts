// Guarda del puerto LlmClient (ADR 0008): solo src/services/llm/ importa @google/genai, electron/ no lo alcanza ni
// transitivamente (el SDK no puede acabar en dist-electron/main.cjs), el puerto no reexporta tipos del SDK y los
// dobles de prueba no entran en código de producción.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rel = (file: string) => path.relative(root, file).split(path.sep).join('/');
const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs)$/;
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'dist-electron' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}
const IMPORT = /(?:^|[^\w.$])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
  return [...text.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? m[3]).filter(Boolean);
}
const isSdk = (spec: string) => spec === '@google/genai' || spec.startsWith('@google/genai/');
function resolveLocal(from: string, spec: string): string | undefined {
  const base = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : undefined;
  if (!base) return undefined;
  const stem = base.replace(/\.(?:js|mjs|cjs)$/, '');
  for (const candidate of [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')])
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return undefined;
}

const LLM_DIR = 'src/services/llm/';
const files = ['src', 'shared', 'electron', 'scripts', 'server/src', 'mcp-remote/src', 'workers/share-viewer/src'].flatMap((d) => walk(path.join(root, d)));
assert(files.length > 100, 'the guard scans the repository');

// 1. Solo src/services/llm/ importa el SDK.
const sdkImporters = files.filter((f) => specifiers(f).some(isSdk)).map(rel);
assert.deepEqual(sdkImporters.filter((f) => !f.startsWith(LLM_DIR)), [], 'only src/services/llm/ imports @google/genai');
assert(sdkImporters.includes(`${LLM_DIR}geminiAdapter.ts`), 'the adapter is the SDK importer');

// 2. electron/ no alcanza el SDK ni el adaptador, ni directa ni transitivamente.
for (const entry of ['electron/main.ts', 'electron/preload.ts']) {
  const seen = new Set<string>();
  const stack = [path.join(root, entry)];
  const trail = new Map<string, string>();
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiers(file)) {
      assert(!isSdk(spec), `${entry} reaches @google/genai through ${rel(file)} (via ${trail.get(file) ?? entry})`);
      const next = resolveLocal(file, spec);
      if (next && !seen.has(next)) { trail.set(next, rel(file)); stack.push(next); }
    }
  }
  assert(seen.size > 1, `${entry}: import graph was walked`);
  // Hasta F6, main llega al catálogo de modelos por geminiInvoiceService: la guarda recorre ese camino de verdad.
  if (entry === 'electron/main.ts') assert([...seen].map(rel).includes(`${LLM_DIR}models.ts`), 'main reaches the SDK-free catalog through electron/ai');
  for (const file of seen) {
    const name = rel(file);
    assert(!name.startsWith(LLM_DIR) || name === `${LLM_DIR}models.ts` || name === `${LLM_DIR}types.ts`,
      `${entry} reaches ${name} (via ${trail.get(file)}): only the SDK-free model catalog may be shared with electron/`);
  }
}

// 3. El puerto tiene tipos propios: nada del SDK se reexporta y los módulos sin SDK siguen sin él.
for (const file of files.filter((f) => rel(f).startsWith(LLM_DIR))) {
  const text = readFileSync(file, 'utf8');
  assert(!/export\s+(?:\*|\{[^}]*\}|type\s+\{[^}]*\})\s*from\s*['"]@google\/genai/.test(text), `${rel(file)} re-exports SDK symbols`);
}
for (const name of ['types.ts', 'errors.ts', 'models.ts']) assert(!specifiers(path.join(root, LLM_DIR, name)).some(isSdk), `${LLM_DIR}${name} must not import the SDK`);

// 4. Los dobles de prueba no entran en producción.
const support = files.filter((f) => !rel(f).startsWith('src/tests/') && specifiers(f).some((s) => /tests\/support\//.test(s) || /(?:^|\/)support\/(?:scriptedLlm|transportAsFetch)/.test(s)));
assert.deepEqual(support.map(rel), [], 'test doubles are imported only from src/tests');

// 5. Versión exacta del SDK en dependencias de producción.
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.dependencies?.['@google/genai'], '3.6.1', 'exact version, no range');
assert.equal(pkg.devDependencies?.['@google/genai'], undefined);
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
assert.equal(lock.packages?.['node_modules/@google/genai']?.version, '3.6.1', 'package-lock matches');
assert.equal(lock.packages?.['']?.dependencies?.['@google/genai'], '3.6.1');

console.log('LlmClient boundary (SDK only in src/services/llm, unreachable from electron/, own port types, exact version) passed.');
