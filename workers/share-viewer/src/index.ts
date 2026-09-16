import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, ShareProposalPayload, StoredProposal } from './types';
import { renderExpiredPage, renderProposalPage } from './template';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for desktop app & browser requests
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

function generateShortId(length = 7): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Health Check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'SolarSim Pro Share Viewer',
    timestamp: new Date().toISOString(),
  });
});

// Create & Store a Shared Proposal
app.post('/api/share', async (c) => {
  try {
    const body = await c.req.json<ShareProposalPayload>();
    if (!body || !body.project) {
      return c.json({ success: false, error: 'Project data is required.' }, 400);
    }

    const validityDays = Math.max(1, Math.min(Number(body.validityDays) || 7, 90));
    const id = generateShortId(7);
    const ttlSeconds = validityDays * 86400;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const storedProposal: StoredProposal = {
      id,
      createdAt: new Date().toISOString(),
      expiresAt,
      validityDays,
      project: body.project,
      summary: body.summary || null,
    };

    // Save in Cloudflare KV with expiration TTL
    await c.env.PROPOSALS_KV.put(
      `proposal:${id}`,
      JSON.stringify(storedProposal),
      { expirationTtl: ttlSeconds }
    );

    const url = new URL(c.req.url);
    const shareUrl = `${url.protocol}//${url.host}/p/${id}`;

    return c.json({
      success: true,
      id,
      shareUrl,
      expiresAt,
      validityDays,
    });
  } catch (err: any) {
    console.error('Error sharing proposal in Cloudflare Worker:', err);
    return c.json({
      success: false,
      error: err?.message || 'Internal Server Error storing proposal.',
    }, 500);
  }
});

// Get Proposal Metadata as JSON
app.get('/api/share/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, error: 'Proposal ID is required.' }, 400);
  }

  try {
    const raw = await c.env.PROPOSALS_KV.get(`proposal:${id}`);
    if (!raw) {
      return c.json({ success: false, error: 'Proposal not found or expired.' }, 404);
    }

    const stored: StoredProposal = JSON.parse(raw);
    const client = stored.project?.client;
    const specs = stored.project?.specs;
    const systemKWp =
      stored.summary?.systemCapacityKWp ||
      (specs && specs.panelCount && specs.panelPowerW
        ? Number(((specs.panelCount * specs.panelPowerW) / 1000).toFixed(2))
        : 0);

    const url = new URL(c.req.url);
    const shareUrl = `${url.protocol}//${url.host}/p/${id}`;

    return c.json({
      success: true,
      id: stored.id,
      projectId: stored.project?.id || '',
      clientName: client?.name || 'Cliente Solar',
      projectCode: client?.projectId || stored.project?.id || 'SP-XXXX',
      quoteNumber: client?.quoteNumber || 'C-0001',
      systemKWp,
      location: client?.province || client?.location || 'República Dominicana',
      companyName: stored.project?.customization?.companyName || 'electsun',
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      validityDays: stored.validityDays,
      shareUrl,
    });
  } catch (err: any) {
    console.error(`Error retrieving proposal metadata for ${id}:`, err);
    return c.json({ success: false, error: err?.message || 'Error fetching proposal.' }, 500);
  }
});

// Batch Hydrate Metadata for multiple Proposal IDs
app.post('/api/share/hydrate', async (c) => {
  try {
    const body = await c.req.json<{ ids: string[] }>();
    if (!body || !Array.isArray(body.ids)) {
      return c.json({ success: false, error: 'Array of proposal IDs is required.' }, 400);
    }

    const safeIds = body.ids.slice(0, 50);
    const url = new URL(c.req.url);

    const proposals = await Promise.all(
      safeIds.map(async (id) => {
        try {
          const raw = await c.env.PROPOSALS_KV.get(`proposal:${id}`);
          if (!raw) return null;
          const stored: StoredProposal = JSON.parse(raw);
          const client = stored.project?.client;
          const specs = stored.project?.specs;
          const systemKWp =
            stored.summary?.systemCapacityKWp ||
            (specs && specs.panelCount && specs.panelPowerW
              ? Number(((specs.panelCount * specs.panelPowerW) / 1000).toFixed(2))
              : 0);

          return {
            id: stored.id,
            projectId: stored.project?.id || '',
            clientName: client?.name || 'Cliente Solar',
            projectCode: client?.projectId || stored.project?.id || 'SP-XXXX',
            quoteNumber: client?.quoteNumber || 'C-0001',
            systemKWp,
            location: client?.province || client?.location || 'República Dominicana',
            companyName: stored.project?.customization?.companyName || 'electsun',
            createdAt: stored.createdAt,
            expiresAt: stored.expiresAt,
            validityDays: stored.validityDays,
            shareUrl: `${url.protocol}//${url.host}/p/${id}`,
          };
        } catch {
          return null;
        }
      })
    );

    return c.json({
      success: true,
      proposals: proposals.filter(Boolean),
    });
  } catch (err: any) {
    console.error('Error hydrating proposals:', err);
    return c.json({ success: false, error: err?.message || 'Internal Server Error' }, 500);
  }
});

// Render the Interactive Proposal View
app.get('/p/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) {
    return c.html(renderExpiredPage(), 404);
  }

  try {
    const raw = await c.env.PROPOSALS_KV.get(`proposal:${id}`);
    if (!raw) {
      return c.html(renderExpiredPage(), 404);
    }

    const storedProposal: StoredProposal = JSON.parse(raw);
    try {
      return c.html(renderProposalPage(storedProposal));
    } catch (renderErr) {
      console.error('Error rendering proposal page:', renderErr);
      const compName = storedProposal?.project?.customization?.companyName || 'electsun';
      const compPhone = storedProposal?.project?.customization?.companyPhone || '+1 (809) 378-6590';
      return c.html(renderExpiredPage(compName, compPhone), 500);
    }
  } catch (err) {
    console.error('Error fetching proposal from KV:', err);
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

export default app;
