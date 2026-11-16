import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isAdminRole, isReaderRole, isWriterRole, canWrite, canAdminister, normalizeRole } from '../../shared/permissions';
import { legacyPatch } from './legacyFixtures';
import { useSimulationStore as store } from '../store/useSimulationStore';

// 1. Role predicates. VIEWER is the legacy client alias of LECTOR.
assert.deepEqual(['ADMIN', 'EDITOR', 'LECTOR', 'VIEWER', undefined].map(isWriterRole), [true, true, false, false, false]);
assert.deepEqual(['ADMIN', 'EDITOR', 'LECTOR', 'VIEWER', undefined].map(isAdminRole), [true, false, false, false, false]);
assert.deepEqual(['ADMIN', 'EDITOR', 'LECTOR', 'VIEWER', undefined].map(isReaderRole), [false, false, true, true, false]);
assert.deepEqual(['ADMIN', 'EDITOR', 'LECTOR', 'VIEWER'].map(normalizeRole), ['ADMIN', 'EDITOR', 'LECTOR', 'LECTOR']);
// Without an account (local mode) the user owns everything.
assert.equal(canWrite(null), true);
assert.equal(canWrite({ role: 'LECTOR' }), false);
assert.equal(canWrite({ role: 'EDITOR' }), true);
assert.equal(canAdminister(undefined), true);
assert.equal(canAdminister({ role: 'EDITOR' }), false);

// 2. The store, not only the UI, keeps trashed proposals read-only.
store.getState().createNewProject({ name: 'Papelera', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS2' });
const id = store.getState().activeProjectId;
store.getState().moveToTrash(id);
store.setState({ activeProjectId: id });
const before = structuredClone(store.getState().projects.find((p) => p.id === id));
store.getState().updateSpecs(legacyPatch({ panelCount: 99 }));
store.getState().updateClient({ name: 'Cambiado' });
store.getState().updateRates({ energyCostPerKWh: 0.5 });
store.getState().updateFinancials({ discountRatePct: 3 });
store.getState().updateMonthlyConsumption(0, 9999);
store.getState().updateDocumentCustomization({ companySlogan: 'x' });
assert.deepEqual(store.getState().projects.find((p) => p.id === id), before, 'Edits to a trashed proposal are ignored');
store.getState().restoreProject(id);
store.setState({ activeProjectId: id });
store.getState().updateSpecs(legacyPatch({ panelCount: 12 }));
assert.equal(store.getState().projects.find((p) => p.id === id)?.specs.panels?.[0].count, 12, 'Restored proposals are editable again');

// 3. Role checks live in shared/permissions.ts, not scattered through the app, the API or the remote MCP.
const roots = ['src', 'shared', path.join('server', 'src'), path.join('mcp-remote', 'src')];
/**
 * Inline checks the API had before this guard covered it (count per file). The list may only shrink: new server or
 * MCP code (agent access, OAuth, remote tools) must use the shared predicates.
 */
const LEGACY_SERVER_CHECKS: Record<string, number> = {
  'server/src/membership.ts': 2,
  'server/src/modules/auth.ts': 1,
  'server/src/modules/companies.ts': 5,
  'server/src/modules/equipmentAssets.ts': 1,
  'server/src/modules/equipment.ts': 2,
  'server/src/modules/folders.ts': 2,
  'server/src/modules/organization.ts': 1,
  'server/src/modules/projects.ts': 5,
  'server/src/modules/tariffs.ts': 1,
  'server/src/modules/users.ts': 4,
};
const found = new Map<string, string[]>();
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) { if (!file.startsWith(path.join('src', 'tests'))) walk(file); continue; }
    if (!/\.(ts|tsx)$/.test(name) || file === path.join('shared', 'permissions.ts')) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/\[\s*['"](ADMIN|EDITOR|VIEWER|LECTOR)['"]\s*,\s*['"](ADMIN|EDITOR|VIEWER|LECTOR)['"]\s*\]\.includes|role\s*[!=]==\s*['"](ADMIN|EDITOR|LECTOR|VIEWER)['"]/.test(line))
        found.set(file, [...(found.get(file) ?? []), `${file}:${i + 1}`]);
    });
  }
};
roots.forEach(walk);
const offenders = [...found].flatMap(([file, lines]) => (lines.length > (LEGACY_SERVER_CHECKS[file.split(path.sep).join('/')] ?? 0) ? lines : []));
assert.deepEqual(offenders, [], `Use shared/permissions.ts instead of inline role checks:\n${offenders.join('\n')}`);
assert.ok(!found.has(path.join('server', 'src', 'modules', 'agentAccess', 'routes.ts')) && !found.has(path.join('mcp-remote', 'src', 'tools.ts')), 'agent access code has no inline role checks');
console.log('Permissions: role predicates, trashed read-only store and centralized checks passed.');
