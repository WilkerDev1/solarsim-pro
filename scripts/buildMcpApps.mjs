// Builds the MCP Apps card views into self-contained HTML (inline script and style, strict CSP). Used by `build:electron`.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Keep in sync with MCP_APP_CARD_TYPES in shared/agentCards.ts (a test compares them).
const CARD_TYPES = ['proposal', 'catalog-audit', 'pending-action'];

const CSP = ["default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", "img-src data:", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');

const STYLE = `
:root{color-scheme:light dark;--bg:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--chip:#f1f5f9;--ok:#047857;--warn:#b45309;--err:#be123c;--note:#eff6ff}
@media (prefers-color-scheme:dark){:root{--bg:#18181b;--fg:#f4f4f5;--muted:#a1a1aa;--line:#3f3f46;--chip:#27272a;--ok:#34d399;--warn:#fbbf24;--err:#fb7185;--note:#1e293b}}
*{box-sizing:border-box}body{margin:0;padding:12px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.card{border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 10px}h2{font-size:15px;margin:0 0 4px}
.muted{color:var(--muted);margin:2px 0;font-size:13px}.chips{margin:8px 0 0;display:flex;flex-wrap:wrap;gap:6px}
.chip{background:var(--chip);border-radius:999px;padding:2px 10px;font-size:12px}ul{list-style:none;margin:8px 0 0;padding:0}li{margin:4px 0}
.finding{display:flex;gap:8px;align-items:baseline}.dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex:none}
.finding.error .dot{background:var(--err)}.finding.warning .dot{background:var(--warn)}.finding.info .dot{background:var(--ok)}
.notice{background:var(--note);border-radius:8px;padding:6px 10px;margin:6px 0;font-size:13px}.before{text-decoration:line-through;color:var(--muted)}.after{font-weight:600}
`.replace(/\n/g, '');

/** @returns {Promise<{type: string, file: string, html: string}[]>} */
export async function buildMcpApps(outDir) {
  const bundle = await build({
    entryPoints: [path.join(root, 'electron/mcp/apps/view.ts')],
    bundle: true, write: false, minify: true, format: 'iife', platform: 'browser', target: 'es2022', legalComments: 'none', logLevel: 'silent',
  });
  // A literal closing tag inside the inline script would end it early.
  const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  await mkdir(outDir, { recursive: true });
  const built = [];
  for (const type of CARD_TYPES) {
    const html = `<!doctype html><html lang="es" data-card="${type}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>SolarSim</title><style>${STYLE}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
    const file = path.join(outDir, `${type}.html`);
    await writeFile(file, html);
    built.push({ type, file, html });
  }
  return built;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = await buildMcpApps(path.join(root, 'dist-electron/mcp-apps'));
  console.log(`MCP Apps: ${built.map((b) => `${b.type} (${Math.round(b.html.length / 1024)} KB)`).join(', ')}`);
}
