import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { StoredProposal } from './types';
import type { Env } from './bindings';
import { renderExpiredPage, renderProposalPage } from './template';
import { AuthorizationError, authorizePublication } from './publicationAuthorization';
import { generateProposalId, proposalMetadata, readProposal, storeProposal } from './proposalRepository';
import { isRecord, parseSharePayload, readBoundedJson, RequestValidationError, validProposalId } from './validation';

/** Construct an app without deployment or network side effects; tests inject authorization fetch. */
export function createShareViewer(requestFetch: typeof fetch = fetch) {
const app = new Hono<{ Bindings: Env }>();
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] }));
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
  c.header('Cache-Control', 'no-store');
  await next();
});
app.onError((error, c) => {
  if (error instanceof RequestValidationError || error instanceof AuthorizationError) return c.json({ success: false, error: error.message }, error.status);
  // Do not echo stack traces, token claims, project contents or storage errors to the caller.
  console.error(JSON.stringify({ event: 'share_request_failed', name: error.name }));
  return c.json({ success: false, error: 'El servicio de propuestas no pudo completar la solicitud.' }, 500);
});
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'SolarSim Pro Share Viewer', timestamp: new Date().toISOString() }));
app.post('/api/share', async (c) => {
  const identity = await authorizePublication(c.env, c.req.header('Authorization'), requestFetch);
  const body = parseSharePayload(await readBoundedJson(c.req.raw));
  const policy = identity.featurePolicy;
  const mode = policy.settings.selfConsumptionProjection ? 'self_consumption' : 'legacy';
  if (body.calculationSnapshot.organizationId !== identity.organizationId || body.calculationSnapshot.policyVersion !== policy.version || body.calculationSnapshot.mode !== mode) {
    return c.json({ success: false, error: 'La configuración de simulación cambió. Actualízala antes de publicar.' }, 409);
  }
  const createdAt = new Date().toISOString();
  const stored: StoredProposal = {
    id: generateProposalId(), createdAt, validityDays: body.validityDays,
    expiresAt: new Date(Date.now() + body.validityDays * 86400000).toISOString(),
    project: body.project, summary: body.summary, calculationSnapshot: body.calculationSnapshot,
    publishedBy: { userId: identity.userId, organizationId: identity.organizationId },
  };
  // Rendering is validated before storage; malformed supported payloads never produce a broken link.
  renderProposalPage(stored);
  await storeProposal(c.env, stored);
  return c.json({ success: true, id: stored.id, shareUrl: `${new URL(c.req.url).origin}/p/${stored.id}`, expiresAt: stored.expiresAt, validityDays: stored.validityDays });
});
app.get('/api/share/:id', async (c) => {
  const id = c.req.param('id');
  if (!validProposalId(id)) return c.json({ success: false, error: 'El identificador no es válido.' }, 400);
  const stored = await readProposal(c.env, id);
  if (!stored) return c.json({ success: false, error: 'La propuesta no existe o ha vencido.' }, 404);
  return c.json({ success: true, ...proposalMetadata(stored, new URL(c.req.url).origin) });
});
app.post('/api/share/hydrate', async (c) => {
  const body = await readBoundedJson(c.req.raw, 8192);
  if (!isRecord(body) || !Array.isArray(body.ids) || body.ids.length > 50 || !body.ids.every(validProposalId)) throw new RequestValidationError('Se requiere una lista de hasta 50 identificadores válidos.');
  const origin = new URL(c.req.url).origin;
  const proposals = await Promise.all([...new Set(body.ids)].map(async (id) => {
    const stored = await readProposal(c.env, id);
    return stored ? proposalMetadata(stored, origin) : null;
  }));
  return c.json({ success: true, proposals: proposals.filter(Boolean) });
});
app.get('/p/:id', async (c) => {
  const id = c.req.param('id');
  if (!validProposalId(id)) return c.html(renderExpiredPage(), 404);
  try {
    const stored = await readProposal(c.env, id);
    if (!stored) return c.html(renderExpiredPage(), 404);
    return c.html(renderProposalPage(stored));
  } catch {
    console.error(JSON.stringify({ event: 'proposal_render_failed' }));
    return c.html(renderExpiredPage(), 500);
  }
});
// Root Landing Page
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="es" class="h-full bg-slate-950 text-slate-100">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SolarSim Pro | Visor de Propuestas Web</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="h-full flex items-center justify-center p-4">
  <div class="max-w-md w-full text-center bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
    <div class="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-400">
      ⚡
    </div>
    <h1 class="text-2xl font-bold text-white mb-2">SolarSim Pro Cloud Service</h1>
    <p class="text-slate-400 text-xs mb-6">Microservicio Serverless de Propuestas Solares Web y Temporales.</p>
    <div class="text-[11px] text-emerald-400 font-mono bg-emerald-950/50 py-2 px-4 rounded-xl border border-emerald-800/40">
      ● Cloudflare Worker Online
    </div>
  </div>
</body>
</html>`);
});

return app;
}

export default createShareViewer();
