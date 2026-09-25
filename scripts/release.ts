import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
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

  const files = {
    winInstaller: path.join(releaseDir, `SolarSim-Pro-Setup-${version}.exe`),
    winPortable: path.join(releaseDir, `SolarSim-Pro-${version}.exe`),
    linuxAppImage: path.join(releaseDir, `SolarSim-Pro-${version}.AppImage`),
    linuxDeb: path.join(releaseDir, `solarsim-pro_${version}_amd64.deb`),
    linuxPacman: path.join(releaseDir, `solarsim-pro-${version}.pacman`),
    linuxTar: path.join(releaseDir, `solarsim-pro-${version}.tar.gz`),
  };

  // Validar existencia de archivos
  for (const [key, filePath] of Object.entries(files)) {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Advertencia: No se encontró el binario: ${path.basename(filePath)}`);
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

  const targets = [
    path.join(releaseDir, `SolarSim-Pro-${version}.AppImage`),
    path.join(releaseDir, `solarsim-pro-${version}.pacman`),
    path.join(releaseDir, `solarsim-pro-${version}.tar.gz`),
  ];

  for (const target of targets) {
    if (fs.existsSync(target)) {
      const sigPath = `${target}.sig`;
      try {
        execSync(`gpg --batch --yes --detach-sign --armor --output "${sigPath}" "${target}"`, { stdio: 'inherit' });
        console.log(`   ✓ Firmado: ${path.basename(sigPath)}`);
      } catch (err: any) {
        console.warn(`   ⚠️ No se pudo firmar ${path.basename(target)}: ${err.message}`);
      }
    }
  }
}

export function bumpVersion(newVersion: string) {
  if (!newVersion || !/^[0-9]+\.[0-9]+\.[0-9]+/.test(newVersion)) {
    throw new Error(`Versión semántica inválida: ${newVersion}`);
  }
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

  // 4. server/src/index.ts
  const serverIndexPath = path.join(rootDir, 'server/src/index.ts');
  if (fs.existsSync(serverIndexPath)) {
    let content = fs.readFileSync(serverIndexPath, 'utf-8');
    content = content.replace(/version:\s*'[0-9]+\.[0-9]+\.[0-9]+'/, `version: '${newVersion}'`);
    fs.writeFileSync(serverIndexPath, content);
    console.log(`   ✓ server/src/index.ts (/api/health) -> ${newVersion}`);
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
    content = content.replace(/version:\s*'[0-9]+\.[0-9]+\.[0-9]+'/g, `version: '${newVersion}'`);
    fs.writeFileSync(slicePath, content);
    console.log(`   ✓ importExportSlice.ts -> ${newVersion}`);
  }

  // Lockfiles sync
  console.log(`   ⏳ Sincronizando lockfiles con npm install --package-lock-only...`);
  execSync(`npm install --package-lock-only`, { cwd: rootDir, stdio: 'ignore' });
  execSync(`npm --prefix server install --package-lock-only`, { cwd: rootDir, stdio: 'ignore' });
  execSync(`npm --prefix workers/share-viewer install --package-lock-only`, { cwd: rootDir, stdio: 'ignore' });
  console.log(`   ✓ Lockfiles sincronizados.`);
}

// CLI Runner
const args = process.argv.slice(2);
const command = args[0] || '--manifests';

if (command === '--bump') {
  const newVer = args[1];
  bumpVersion(newVer);
} else if (command === '--sign') {
  signLinuxPackages();
} else if (command === '--manifests') {
  signLinuxPackages();
  generateManifests();
} else if (command === '--help' || command === '-h') {
  console.log(`
Uso de scripts/release.ts:
  npx tsx scripts/release.ts --manifests      Genera latest.json y update.json con hashes automáticos y firma GPG.
  npx tsx scripts/release.ts --bump <ver>    Sincroniza versión <ver> en todos los JSON y servicios.
  npx tsx scripts/release.ts --sign          Firma criptográfica GPG de paquetes Linux.
`);
} else {
  signLinuxPackages();
  generateManifests();
}
