import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { RELEASE_SIGNER_FINGERPRINT, RELEASE_PUBLIC_KEY } from '../electron/updater/trustedReleaseKey';
import { validateReleaseVersion } from '../electron/updater/releaseVersion';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

function getHash(filePath: string, algorithm: 'sha256' | 'sha512'): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash(algorithm);
  hashSum.update(fileBuffer);
  return algorithm === 'sha512' ? hashSum.digest('base64') : hashSum.digest('hex');
}

export function generateManifests() {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  const version = pkg.version;
  console.log(`\n📋 Generando manifiestos de actualización para SolarSim Pro v${version}...`);

  // Asegurar nombres alternativos / enlaces duales para Linux (compatibilidad total)
  const aliasPairs: [string, string][] = [
    [path.join(releaseDir, `SolarSim-Pro-${version}.deb`), path.join(releaseDir, `solarsim-pro_${version}_amd64.deb`)],
    [path.join(releaseDir, `SolarSim-Pro-${version}.deb`), path.join(releaseDir, `solarsim-pro-${version}.deb`)],
    [path.join(releaseDir, `SolarSim-Pro-${version}.pacman`), path.join(releaseDir, `solarsim-pro-${version}.pacman`)],
    [path.join(releaseDir, `SolarSim-Pro-${version}.tar.gz`), path.join(releaseDir, `solarsim-pro-${version}.tar.gz`)],
    [path.join(releaseDir, `SolarSim-Pro-${version}.AppImage`), path.join(releaseDir, `solarsim-pro-${version}.AppImage`)],
  ];

  for (const [src, dest] of aliasPairs) {
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      try {
        fs.linkSync(src, dest);
        console.log(`   🔗 Enlace dual creado: ${path.basename(dest)} -> ${path.basename(src)}`);
      } catch {
        try {
          fs.copyFileSync(src, dest);
        } catch {}
      }
    }
  }

  function findFirstExisting(candidates: string[]): string {
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return candidates[0];
  }

  const files = {
    winInstaller: findFirstExisting([
      path.join(releaseDir, `SolarSim-Pro-Setup-${version}.exe`),
      path.join(releaseDir, `solarsim-pro-setup-${version}.exe`),
    ]),
    winPortable: findFirstExisting([
      path.join(releaseDir, `SolarSim-Pro-${version}.exe`),
      path.join(releaseDir, `solarsim-pro-${version}.exe`),
    ]),
    linuxAppImage: findFirstExisting([
      path.join(releaseDir, `SolarSim-Pro-${version}.AppImage`),
      path.join(releaseDir, `solarsim-pro-${version}.AppImage`),
    ]),
    linuxDeb: findFirstExisting([
      path.join(releaseDir, `SolarSim-Pro-${version}.deb`),
      path.join(releaseDir, `solarsim-pro_${version}_amd64.deb`),
      path.join(releaseDir, `solarsim-pro-${version}.deb`),
    ]),
    linuxPacman: findFirstExisting([
      path.join(releaseDir, `SolarSim-Pro-${version}.pacman`),
      path.join(releaseDir, `solarsim-pro-${version}.pacman`),
    ]),
    linuxTar: findFirstExisting([
      path.join(releaseDir, `SolarSim-Pro-${version}.tar.gz`),
      path.join(releaseDir, `solarsim-pro-${version}.tar.gz`),
    ]),
  };

  // Validar existencia de archivos
  for (const [key, filePath] of Object.entries(files)) {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Advertencia: No se encontró el binario: ${path.basename(filePath)}`);
    } else {
      console.log(`   ✓ Detectado: ${path.basename(filePath)} (${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(2)} MB)`);
    }
  }

  const notesFile = path.join(releaseDir, `release-notes-v${version}.md`);
  let notes = `Actualización oficial SolarSim Pro v${version}.`;
  if (fs.existsSync(notesFile)) {
    const rawNotes = fs.readFileSync(notesFile, 'utf-8');
    const firstParagraph = rawNotes.split('\n\n').find((p) => !p.startsWith('#') && p.trim().length > 20);
    if (firstParagraph) notes = firstParagraph.replace(/\r?\n/g, ' ').trim();
  }

  const manifest = {
    version,
    name: `SolarSim Pro v${version}`,
    releaseDate: new Date().toISOString(),
    notes,
    downloads: {
      windows: {
        installer: fs.existsSync(files.winInstaller) ? {
          fileName: path.basename(files.winInstaller),
          url: `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${version}/${path.basename(files.winInstaller)}`,
          sha256: getHash(files.winInstaller, 'sha256'),
          sha512: getHash(files.winInstaller, 'sha512'),
          size: fs.statSync(files.winInstaller).size,
        } : null,
        portable: fs.existsSync(files.winPortable) ? {
          fileName: path.basename(files.winPortable),
          url: `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${version}/${path.basename(files.winPortable)}`,
          sha256: getHash(files.winPortable, 'sha256'),
          size: fs.statSync(files.winPortable).size,
        } : null,
      },
      linux: {
        appimage: fs.existsSync(files.linuxAppImage) ? {
          fileName: path.basename(files.linuxAppImage),
          url: `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${version}/${path.basename(files.linuxAppImage)}`,
          sha256: getHash(files.linuxAppImage, 'sha256'),
          sha512: getHash(files.linuxAppImage, 'sha512'),
          size: fs.statSync(files.linuxAppImage).size,
        } : null,
        deb: fs.existsSync(files.linuxDeb) ? {
          fileName: path.basename(files.linuxDeb),
          url: `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${version}/${path.basename(files.linuxDeb)}`,
          sha256: getHash(files.linuxDeb, 'sha256'),
          sha512: getHash(files.linuxDeb, 'sha512'),
          size: fs.statSync(files.linuxDeb).size,
        } : null,
        pacman: fs.existsSync(files.linuxPacman) ? {
          fileName: path.basename(files.linuxPacman),
          url: `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${version}/${path.basename(files.linuxPacman)}`,
          sha256: getHash(files.linuxPacman, 'sha256'),
          size: fs.statSync(files.linuxPacman).size,
        } : null,
        tar: fs.existsSync(files.linuxTar) ? {
          fileName: path.basename(files.linuxTar),
          url: `https://github.com/WilkerDev1/solarsim-pro/releases/download/v${version}/${path.basename(files.linuxTar)}`,
          sha256: getHash(files.linuxTar, 'sha256'),
          size: fs.statSync(files.linuxTar).size,
        } : null,
      },
    },
  };

  const latestJsonPath = path.join(releaseDir, 'latest.json');
  const updateJsonPath = path.join(releaseDir, 'update.json');

  fs.writeFileSync(latestJsonPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(updateJsonPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✅ Manifiestos generados exitosamente en:\n   - ${latestJsonPath}\n   - ${updateJsonPath}`);
}

export function signLinuxPackages() {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  const version = pkg.version;
  console.log(`\n🔏 Firmando paquetes Linux con GPG para v${version}...`);

  const potentialTargets = [
    path.join(releaseDir, `SolarSim-Pro-${version}.AppImage`),
    path.join(releaseDir, `solarsim-pro-${version}.AppImage`),
    path.join(releaseDir, `SolarSim-Pro-${version}.pacman`),
    path.join(releaseDir, `solarsim-pro-${version}.pacman`),
    path.join(releaseDir, `SolarSim-Pro-${version}.tar.gz`),
    path.join(releaseDir, `solarsim-pro-${version}.tar.gz`),
    path.join(releaseDir, `SolarSim-Pro-${version}.deb`),
    path.join(releaseDir, `solarsim-pro_${version}_amd64.deb`),
    path.join(releaseDir, `solarsim-pro-${version}.deb`),
  ];

  const uniqueExistingTargets = Array.from(new Set(potentialTargets.filter((t) => fs.existsSync(t))));

  for (const target of uniqueExistingTargets) {
    const sigPath = `${target}.sig`;
    try {
      execFileSync('/usr/bin/gpg', ['--batch', '--yes', '--local-user', RELEASE_SIGNER_FINGERPRINT, '--detach-sign', '--armor', '--output', sigPath, target], { stdio: 'inherit' });
      console.log(`   ✓ Firmado: ${path.basename(sigPath)}`);
    } catch (err: any) {
      throw new Error(`No se pudo firmar ${path.basename(target)} con la clave de confianza de SolarSim: ${err.message}`);
    }
  }
}

export function bumpVersion(newVersion: string) {
  validateReleaseVersion(newVersion);
  console.log(`\n🔄 Sincronizando versión a ${newVersion} en todos los JSON y servicios...`);

  // 1. package.json raíz
  const rootPkgPath = path.join(rootDir, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
  rootPkg.version = newVersion;
  fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
  console.log(`   ✓ package.json -> ${newVersion}`);

  // 2. server/package.json
  const serverPkgPath = path.join(rootDir, 'server/package.json');
  if (fs.existsSync(serverPkgPath)) {
    const serverPkg = JSON.parse(fs.readFileSync(serverPkgPath, 'utf-8'));
    serverPkg.version = newVersion;
    fs.writeFileSync(serverPkgPath, JSON.stringify(serverPkg, null, 2) + '\n');
    console.log(`   ✓ server/package.json -> ${newVersion}`);
  }

  // 3. workers/share-viewer/package.json
  const workerPkgPath = path.join(rootDir, 'workers/share-viewer/package.json');
  if (fs.existsSync(workerPkgPath)) {
    const workerPkg = JSON.parse(fs.readFileSync(workerPkgPath, 'utf-8'));
    workerPkg.version = newVersion;
    fs.writeFileSync(workerPkgPath, JSON.stringify(workerPkg, null, 2) + '\n');
    console.log(`   ✓ workers/share-viewer/package.json -> ${newVersion}`);
  }

  // 4. server/src/app.ts
  const serverIndexPath = path.join(rootDir, 'server/src/app.ts');
  if (fs.existsSync(serverIndexPath)) {
    let content = fs.readFileSync(serverIndexPath, 'utf-8');
    content = content.replace(/version:\s*['"][0-9]+\.[0-9]+\.[0-9]+['"]/, `version: '${newVersion}'`);
    fs.writeFileSync(serverIndexPath, content);
    console.log(`   ✓ server/src/app.ts (/api/health) -> ${newVersion}`);
  }

  // 5. BackupSection.tsx
  const backupSectionPath = path.join(rootDir, 'src/components/settings/sections/BackupSection.tsx');
  if (fs.existsSync(backupSectionPath)) {
    let content = fs.readFileSync(backupSectionPath, 'utf-8');
    content = content.replace(/SolarSim Pro v[0-9]+\.[0-9]+\.[0-9]+/, `SolarSim Pro v${newVersion}`);
    fs.writeFileSync(backupSectionPath, content);
    console.log(`   ✓ BackupSection.tsx -> ${newVersion}`);
  }

  // 6. importExportSlice.ts
  const slicePath = path.join(rootDir, 'src/store/slices/importExportSlice.ts');
  if (fs.existsSync(slicePath)) {
    let content = fs.readFileSync(slicePath, 'utf-8');
    content = content.replace(/version:\s*['"][0-9]+\.[0-9]+\.[0-9]+['"]/g, `version: '${newVersion}'`);
    fs.writeFileSync(slicePath, content);
    console.log(`   ✓ importExportSlice.ts -> ${newVersion}`);
  }

  // Lockfiles sync
  console.log(`   ⏳ Sincronizando lockfiles con npm install --package-lock-only...`);
  execFileSync('npm', ['install', '--package-lock-only'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('npm', ['--prefix', 'server', 'install', '--package-lock-only'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('npm', ['--prefix', 'workers/share-viewer', 'install', '--package-lock-only'], { cwd: rootDir, stdio: 'ignore' });
  console.log(`   ✓ Lockfiles sincronizados.`);
}

// Signed manifest binds the requested version, package name, size and digest.
export function signUpdateManifests() {
  for (const filename of ['latest.json', 'update.json']) {
    const file = path.join(releaseDir, filename);
    if (!fs.existsSync(file)) throw new Error(`Falta el manifiesto ${filename}.`);
    execFileSync('/usr/bin/gpg', ['--batch', '--yes', '--local-user', RELEASE_SIGNER_FINGERPRINT, '--detach-sign', '--armor', '--output', `${file}.sig`, file], { stdio: 'inherit' });
  }
  fs.writeFileSync(path.join(releaseDir, 'solarsim-public-key.asc'), RELEASE_PUBLIC_KEY);
}

export function runReleaseCommand(args: string[]) {
  const command = args[0] || '--help';
  if (command === '--bump') bumpVersion(args[1]);
  else if (command === '--sign') {
    generateManifests();
    signLinuxPackages();
    signUpdateManifests();
  } else if (command === '--manifests') generateManifests();
  else if (command === '--help' || command === '-h') console.log(`
Uso de scripts/release.ts:
  npx tsx scripts/release.ts --manifests   Genera latest.json y update.json con hashes; no firma.
  npx tsx scripts/release.ts --bump <ver> Sincroniza versión en los JSON y servicios.
  npx tsx scripts/release.ts --sign       Firma paquetes, genera y firma manifiestos con la clave fijada.

Linux exige firmas válidas de manifiesto y paquete antes de instalar. Publicar latest.json.sig
junto a latest.json y las firmas .sig de paquetes. Se necesita la clave privada correspondiente a
${RELEASE_SIGNER_FINGERPRINT}; las releases sin manifiesto firmado quedan bloqueadas.
`);
  else throw new Error(`Comando de release no soportado: ${command}`);
}

// Importing helpers in tests must never sign files or bump a release.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) runReleaseCommand(process.argv.slice(2));
