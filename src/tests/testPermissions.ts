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

// 3. Role checks live in shared/permissions.ts, not scattered through the app.
const roots = ['src', 'shared'];
const offenders: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) { if (!file.startsWith(path.join('src', 'tests'))) walk(file); continue; }
    if (!/\.(ts|tsx)$/.test(name) || file === path.join('shared', 'permissions.ts')) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/\[\s*['"](ADMIN|EDITOR|VIEWER|LECTOR)['"]\s*,\s*['"](ADMIN|EDITOR|VIEWER|LECTOR)['"]\s*\]\.includes|role\s*[!=]==\s*['"](ADMIN|EDITOR|LECTOR|VIEWER)['"]/.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
};
roots.forEach(walk);
assert.deepEqual(offenders, [], `Use shared/permissions.ts instead of inline role checks:\n${offenders.join('\n')}`);
console.log('Permissions: role predicates, trashed read-only store and centralized checks passed.');
