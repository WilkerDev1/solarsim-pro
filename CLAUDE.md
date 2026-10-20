# CLAUDE.md

Guidance for Claude Code in this repository.

SolarSim Pro: Electron + React + TypeScript desktop simulator for PV/BESS proposals in the Dominican Republic, plus a Hono/PostgreSQL sync API (`server/`) and a Cloudflare Worker proposal viewer (`workers/share-viewer/`). Docs and UI copy are in Spanish.

**[AGENTS.md](AGENTS.md) is canonical** for contracts, invariants and required gates; read it first. Then [docs/README.md](docs/README.md) for the documentation index. If docs and code disagree, the code wins and the doc gets fixed.

## Commands

```bash
npm run dev               # Vite web only
npm run electron:dev      # builds electron/ with esbuild, then Vite + Electron
npm run lint              # tsc --noEmit
npm test                  # every src/tests/test*.ts + updater test, each in its own process
npm test -- <filter>      # run matching suites only (same test environment)
npm --prefix server test  # node:test; integration tests start a throwaway Docker Postgres
npm --prefix workers/share-viewer test
npm run context:pack      # repomix snapshot; rerun when structure changes
```

Client suites are plain `tsx` scripts that exit non-zero on failure. `scripts/testEnvironment.ts` makes `fetch` throw: inject a synthetic transport. No test may write to production servers.

## Architecture

```
React views ─▶ Zustand slices ─▶ pure engines (src/engine)
     │               └─▶ services (HTTP) ─▶ Hono API (server/) ─▶ PostgreSQL
     └─▶ preload IPC ─▶ electron/ (AI calls, window/print, updater)
services ─▶ Worker (workers/share-viewer) ─▶ KV
shared/  = portable TS contracts used by client, API and Worker
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Server: `index.ts` only boots, `app.ts` is the injectable composition root (`createApp`), routes in `modules/`. Deployment (only when asked): [docs/INFRASTRUCTURE_ARCHITECTURE.md](docs/INFRASTRUCTURE_ARCHITECTURE.md). Releases: [docs/MAINTENANCE_AND_UPDATES.md](docs/MAINTENANCE_AND_UPDATES.md).

## Workflow

`beta` = development, `main` = stable releases. Conventional Commits. Don't claim "no vulnerabilities" without a fresh `npm audit`.
