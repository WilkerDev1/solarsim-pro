import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FEATURE_POLICY_V3_CLIENT_VERSION } from '../../../shared/clientVersion.js';
import { assertReleaseVersionSupportsFeaturePolicy } from '../releaseVersionGuard.js';

test('Release guard: rechaza versiones anteriores a FEATURE_POLICY_V3_CLIENT_VERSION, prerreleases incluidas', () => {
  for (const version of ['2.9.4', '2.9.5', '2.8.0', `${FEATURE_POLICY_V3_CLIENT_VERSION}-beta.1`, `${FEATURE_POLICY_V3_CLIENT_VERSION}-rc.2`])
    assert.throws(() => assertReleaseVersionSupportsFeaturePolicy(version), /FEATURE_POLICY_V3_CLIENT_VERSION/, version);
});

test('Release guard: acepta esa versión y las posteriores', () => {
  const [major, minor] = FEATURE_POLICY_V3_CLIENT_VERSION.split('.').map(Number);
  for (const version of [FEATURE_POLICY_V3_CLIENT_VERSION, `${major}.${minor}.1`, `${major}.${minor + 1}.0-beta.1`, `${major + 1}.0.0`])
    assert.doesNotThrow(() => assertReleaseVersionSupportsFeaturePolicy(version), version);
});

test('Release guard: versiones mal formadas se rechazan', () => {
  assert.throws(() => assertReleaseVersionSupportsFeaturePolicy('2.10'));
  assert.throws(() => assertReleaseVersionSupportsFeaturePolicy(''));
});

test('Release guard: scripts/release.ts la aplica al subir la versión y al generar los manifiestos', async () => {
  const source = await readFile(new URL('../../release.ts', import.meta.url), 'utf8');
  const body = (name: string) => {
    const start = source.indexOf(`export function ${name}(`);
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\nexport function ', start + 1));
  };
  assert.match(body('bumpVersion'), /assertReleaseVersionSupportsFeaturePolicy\(newVersion\)[\s\S]*writeFileSync/, 'antes de escribir nada');
  assert.match(body('generateManifests'), /assertReleaseVersionSupportsFeaturePolicy\(version\)/);
});
