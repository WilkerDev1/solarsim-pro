import { selectEligibleRelease } from '../releaseChannel';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { installVerifiedLinuxPackage, parseSignedPackageManifest, releaseBaseUrl } from '../linuxPackageUpdater';
import { downloadReleaseFile, validateDownloadUrl } from '../secureDownload';
import { createReleaseVerifier } from '../releaseVerification';
import { RELEASE_SIGNER_FINGERPRINT } from '../trustedReleaseKey';
import { compareReleaseVersions } from '../releaseVersion';

const payload = Buffer.from('synthetic test package, never executed');
const version = '2.2.0';
const base = releaseBaseUrl(version);
const descriptor = { fileName: `SolarSim-Pro-${version}.pacman`, url: `${base}/SolarSim-Pro-${version}.pacman`, sha256: createHash('sha256').update(payload).digest('hex'), size: payload.length };
const manifest = JSON.stringify({ version, downloads: { linux: { pacman: descriptor, deb: { ...descriptor, fileName: `SolarSim-Pro-${version}.deb`, url: `${base}/SolarSim-Pro-${version}.deb` } } } });

async function testHttpsDownloads(root: string) {
  const originalGet = https.get;
  let mode = 'normal';
  let calls = 0;
  // The transport double produces streams, never sockets or real HTTP requests.
  https.get = ((_url: unknown, _options: unknown, callback: (response: unknown) => void) => {
    calls++;
    const request = new EventEmitter() as EventEmitter & { setTimeout: () => unknown; destroy: (error?: Error) => void };
    request.setTimeout = () => request;
    request.destroy = error => { if (error) request.emit('error', error); };
    queueMicrotask(() => {
      const response = Readable.from([payload]) as Readable & { statusCode: number; headers: Record<string, string> };
      response.statusCode = mode === 'redirect' || mode === 'loop' || mode === 'bad-redirect' ? 302 : mode === 'missing' ? 404 : 200;
      response.headers = mode === 'redirect' || mode === 'loop' ? { location: 'https://release-assets.githubusercontent.com/package' }
        : mode === 'bad-redirect' ? { location: 'http://github.com/package' }
        : { 'content-length': String(mode === 'too-large' ? 9999 : mode === 'chunk-overflow' ? 0 : mode === 'truncated' ? payload.length + 1 : payload.length) };
      if (mode === 'redirect') mode = 'normal';
      callback(response);
      if (mode === 'connection-error') response.destroy(new Error('connection reset before output stream exists'));
    });
    return request;
  }) as unknown as typeof https.get;
  try {
    const file = path.join(root, 'https-payload');
    await downloadReleaseFile(`${base}/package`, file, () => {});
    assert.deepEqual(await fs.readFile(file), payload);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    await assert.rejects(downloadReleaseFile(`${base}/package`, file, () => {}), /EEXIST/);
    assert.deepEqual(await fs.readFile(file), payload, 'an existing file is never overwritten or deleted');
    await fs.rm(file);
    mode = 'redirect'; calls = 0;
    await downloadReleaseFile(`${base}/package`, file, () => {});
    assert.equal(calls, 2);
    await fs.rm(file);
    for (const failure of ['bad-redirect', 'missing', 'too-large', 'truncated', 'loop', 'connection-error', 'chunk-overflow']) {
      mode = failure;
      await assert.rejects(downloadReleaseFile(`${base}/package`, file, () => {}, failure === 'chunk-overflow' ? 10 : 100));
      await assert.rejects(fs.stat(file), /ENOENT/);
    }
  } finally {
    https.get = originalGet;
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'solarsim-updater-tests-'));
  try {
    await testHttpsDownloads(root);
    assert.equal(compareReleaseVersions('2.10.0', '2.9.0'), 1);
    assert.equal(compareReleaseVersions('2.9.0', '2.10.0'), -1);
    assert.equal(compareReleaseVersions('2.2.0-beta.10', '2.2.0-beta.2'), 1);
    assert.equal(compareReleaseVersions('2.2.0', '2.2.0-rc.1'), 1);
    assert.equal(compareReleaseVersions('2.2.0-beta', '2.2.0'), -1);
    assert.equal(compareReleaseVersions('2.2.0+build.2', '2.2.0+build.1'), 0);
    const precedence = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
    for (let index = 1; index < precedence.length; index++) assert.equal(compareReleaseVersions(precedence[index], precedence[index - 1]), 1);
    for (const invalid of ['', '2.01.0', '2.2.0-beta.01', '2.2.0-', '2.2.0+', 'v2.2.0', '2.2.0 trailing']) {
      assert.throws(() => compareReleaseVersions(invalid, '2.1.5'), /semántica inválido/);
      assert.throws(() => compareReleaseVersions('2.2.0', invalid), /semántica inválido/);
    }
    for (const [candidate, installed] of [
      ['2.1.5', '2.1.5'], ['2.0.0', '2.1.5'], ['2.1.5+other-build', '2.1.5'],
      ['2.1.5-beta.1', '2.1.5'], ['2.2.0-beta.2', '2.2.0-beta.10'],
      ['2.9.0', '2.10.0'], ['invalid', '2.1.5'], ['2.2.0', 'invalid'],
    ]) {
      let installerCalls = 0;
      let downloadCalls = 0;
      await assert.rejects(installVerifiedLinuxPackage('pacman', candidate, installed, () => {}, () => {}, {
        temporaryRoot: root,
        download: async () => { downloadCalls++; throw new Error('download forbidden'); },
        run: async () => { installerCalls++; return { stdout: '' }; },
      }));
      assert.equal(installerCalls, 0, 'same/older/invalid versions never execute pkexec');
      assert.equal(downloadCalls, 0, 'same/older/invalid versions rejected before download');
      assert.deepEqual(await fs.readdir(root), [], 'version rejection creates no temporary directory');
    }
    for (const badVersion of ['../../2.2.0', '2.2.0;id', '2.2.0$(id)', '2.2.0 trailing', '2.2.0/']) assert.throws(() => releaseBaseUrl(badVersion));
    for (const url of ['http://github.com/x', 'https://github.com.evil.test/x', 'https://user:pass@github.com/x', 'https://github.com:8443/x', 'https://evil.test/x']) assert.throws(() => validateDownloadUrl(url));
    assert.equal(validateDownloadUrl(`${base}/latest.json`).protocol, 'https:');
    assert.throws(() => parseSignedPackageManifest(manifest, '2.1.5', 'pacman'), /manifiesto/);
    assert.throws(() => parseSignedPackageManifest(manifest.replace(descriptor.url, 'https://evil.test/pkg.pacman'), version, 'pacman'), /manifiesto/);
    assert.throws(() => parseSignedPackageManifest(manifest.replace(descriptor.fileName, '../pkg.pacman'), version, 'pacman'), /manifiesto/);

    for (const type of ['pacman', 'deb'] as const) {
      const events: string[] = [];
      const programs: Array<{ binary: string; args: string[] }> = [];
      await installVerifiedLinuxPackage(type, version, '2.1.5', () => {}, () => events.push('installing'), {
        temporaryRoot: root,
        download: async (url, target) => {
          assert.equal((await fs.stat(path.dirname(target))).mode & 0o777, 0o700);
          events.push(`download:${path.basename(target)}`);
          await fs.writeFile(target, url.endsWith('/latest.json') ? manifest : url.endsWith('.sig') ? 'synthetic-signature' : payload, { mode: 0o600, flag: 'wx' });
        },
        verifier: async () => async (file, signature) => {
          events.push(`verify:${path.basename(file)}`);
          assert.ok(await fs.readFile(signature));
        },
        run: async (binary, args) => {
          assert.deepEqual(events.slice(-2), [`verify:SolarSim-Pro-${version}.${type}`, 'installing']);
          programs.push({ binary, args });
          return { stdout: '' };
        },
      });
      assert.equal(programs.length, 1);
      assert.equal(programs[0].binary, '/usr/bin/pkexec');
      assert.equal(programs[0].args[0], `/usr/bin/${type === 'pacman' ? 'pacman' : 'dpkg'}`);
      assert.ok(programs[0].args.at(-1)?.startsWith(`${root}/solarsim-update-`));
      assert.equal((await fs.readdir(root)).length, 0, 'temporary files removed after install');
    }

    for (const failure of ['manifest-missing', 'manifest-signature', 'package-signature', 'hash-mismatch', 'install-failed']) {
      let installAttempts = 0;
      await assert.rejects(installVerifiedLinuxPackage('pacman', version, '2.1.5', () => {}, () => {}, {
        temporaryRoot: root,
        download: async (url, target) => {
          if (failure === 'manifest-missing' && url.endsWith('/latest.json.sig')) throw new Error('HTTP 404');
          await fs.writeFile(target, url.endsWith('/latest.json') ? manifest : url.endsWith('.sig') ? 'signature' : failure === 'hash-mismatch' ? Buffer.alloc(payload.length) : payload, { flag: 'wx' });
        },
        verifier: async () => async file => {
          if (failure === 'manifest-signature' && file.endsWith('latest.json')) throw new Error('bad manifest signature');
          if (failure === 'package-signature' && file.endsWith('.pacman')) throw new Error('bad package signature');
        },
        run: async () => { installAttempts++; throw new Error('installer rejected'); },
      }));
      assert.equal(installAttempts, failure === 'install-failed' ? 1 : 0, 'verification failures never execute installer');
      assert.equal((await fs.readdir(root)).length, 0, 'temporary files removed on failure');
    }

    for (const status of [`[GNUPG:] VALIDSIG ${RELEASE_SIGNER_FINGERPRINT} 2026-10-03`, '[GNUPG:] VALIDSIG OTHER_KEY 2026-10-03', `[GNUPG:] VALIDSIG ${RELEASE_SIGNER_FINGERPRINT} 2026-10-03\n[GNUPG:] EXPKEYSIG bad`]) {
      const directory = await fs.mkdtemp(path.join(root, 'verifier-'));
      const calls: string[] = [];
      const verify = await createReleaseVerifier(directory, async (binary, args) => {
        calls.push(binary);
        assert.ok(args.includes(path.join(directory, 'gpg')));
        return { stdout: status };
      });
      if (status === `[GNUPG:] VALIDSIG ${RELEASE_SIGNER_FINGERPRINT} 2026-10-03`) await verify('payload', 'signature');
      else await assert.rejects(verify('payload', 'signature'), /clave de confianza/);
      assert.deepEqual(calls, ['/usr/bin/gpg', '/usr/bin/gpgv']);
    }
    const directory = await fs.mkdtemp(path.join(root, 'missing-gpg-'));
    await assert.rejects(createReleaseVerifier(directory, async () => { throw new Error('ENOENT'); }), /GPG y GPGV/);
    console.log('Updater integrity: version, URL, private files, signatures, digest, installer isolation and cleanup passed.');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

const channelReleases = [
  { tag_name: 'v2.3.0-beta.2', prerelease: true },
  { tag_name: 'v2.2.1', prerelease: false },
  { tag_name: 'v2.4.0', draft: true },
  { tag_name: 'not-a-version' },
];
assert.equal(selectEligibleRelease(channelReleases, '2.2.0')?.tag_name, 'v2.2.1');
assert.equal(selectEligibleRelease(channelReleases, '2.3.0-beta.1')?.tag_name, 'v2.3.0-beta.2');
assert.equal(selectEligibleRelease(channelReleases, '2.3.0') , null);
assert.equal(selectEligibleRelease([{ tag_name: 'v2.3.0' }], '2.3.0-beta.2')?.tag_name, 'v2.3.0');

assert.equal(selectEligibleRelease([...channelReleases, {tag_name: 'v2.4.0-alpha.1', prerelease: true}], '2.3.0-beta.1')?.tag_name, 'v2.3.0-beta.2');
assert.equal(selectEligibleRelease([{tag_name: 'v2.3.0-rc.1', prerelease: true}], '2.3.0-beta.2')?.tag_name, 'v2.3.0-rc.1');
