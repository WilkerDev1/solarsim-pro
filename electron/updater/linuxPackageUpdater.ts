import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { downloadReleaseFile } from './secureDownload';
import { createReleaseVerifier, runProgram } from './releaseVerification';
import { verifyPackageHash } from './releaseVerification';
import { assertNewerReleaseVersion, validateReleaseVersion } from './releaseVersion';

type PackageType = 'pacman' | 'deb';
interface PackageDescriptor { fileName: string; url: string; sha256: string; size: number }
const REPOSITORY_DOWNLOAD = 'https://github.com/WilkerDev1/solarsim-pro/releases/download';
export function releaseBaseUrl(version: string): string {
  validateReleaseVersion(version);
  return `${REPOSITORY_DOWNLOAD}/v${version}`;
}

export function parseSignedPackageManifest(raw: string, version: string, type: PackageType): PackageDescriptor {
  const manifest = JSON.parse(raw);
  const pkg = manifest?.downloads?.linux?.[type];
  const base = releaseBaseUrl(version);
  if (manifest?.version !== version || !pkg || typeof pkg.fileName !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(pkg.fileName) || !pkg.fileName.endsWith(`.${type}`) || pkg.url !== `${base}/${pkg.fileName}` || !/^[a-f0-9]{64}$/.test(pkg.sha256) || !Number.isSafeInteger(pkg.size) || pkg.size <= 0 || pkg.size > 2 * 1024 * 1024 * 1024) {
    throw new Error('El manifiesto firmado no corresponde a la versión o al paquete solicitado.');
  }
  return pkg;
}

interface Dependencies {
  download: typeof downloadReleaseFile;
  verifier: typeof createReleaseVerifier;
  run: typeof runProgram;
  temporaryRoot: string;
}

export async function installVerifiedLinuxPackage(
  type: PackageType, version: string, installedVersion: string, progress: (transferred: number, total: number) => void,
  onVerified: () => void, overrides: Partial<Dependencies> = {},
): Promise<void> {
  if (type !== 'pacman' && type !== 'deb') throw new Error('Tipo de paquete Linux no soportado.');
  assertNewerReleaseVersion(version, installedVersion);
  const base = releaseBaseUrl(version);
  const deps: Dependencies = { download: downloadReleaseFile, verifier: createReleaseVerifier, run: runProgram, temporaryRoot: os.tmpdir(), ...overrides };
  const directory = await fs.mkdtemp(path.join(deps.temporaryRoot, 'solarsim-update-'));
  try {
    await fs.chmod(directory, 0o700);
    const verifySignature = await deps.verifier(directory, deps.run);
    const manifestPath = path.join(directory, 'latest.json');
    const manifestSignature = `${manifestPath}.sig`;
    try {
      await deps.download(`${base}/latest.json`, manifestPath, () => {}, 1024 * 1024);
      await deps.download(`${base}/latest.json.sig`, manifestSignature, () => {}, 1024 * 1024);
    } catch {
      throw new Error('Esta release no dispone de un manifiesto firmado verificable. Se necesita una release con latest.json.sig antes de actualizar Linux.');
    }
    await verifySignature(manifestPath, manifestSignature);
    const descriptor = parseSignedPackageManifest(await fs.readFile(manifestPath, 'utf8'), version, type);
    const packagePath = path.join(directory, descriptor.fileName);
    await deps.download(descriptor.url, packagePath, progress, descriptor.size);
    const signaturePath = `${packagePath}.sig`;
    await deps.download(`${descriptor.url}.sig`, signaturePath, () => {}, 1024 * 1024);
    await verifySignature(packagePath, signaturePath);
    await verifyPackageHash(packagePath, descriptor.sha256, descriptor.size);
    onVerified();
    const args = type === 'pacman' ? ['/usr/bin/pacman', '-U', '--noconfirm', packagePath] : ['/usr/bin/dpkg', '-i', packagePath];
    await deps.run('/usr/bin/pkexec', args);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
