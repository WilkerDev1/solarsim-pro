import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RELEASE_PUBLIC_KEY, RELEASE_SIGNER_FINGERPRINT } from './trustedReleaseKey';

const execFileAsync = promisify(execFile);
export type RunProgram = (binary: string, args: string[]) => Promise<{ stdout: string }>;
export const runProgram: RunProgram = async (binary, args) => execFileAsync(binary, args, {
  // Never terminate a package manager halfway through a system transaction.
  timeout: binary === '/usr/bin/pkexec' ? 0 : 120_000,
  maxBuffer: 8 * 1024 * 1024,
  env: { PATH: '/usr/bin:/bin', LANG: 'C' },
});

export async function createReleaseVerifier(directory: string, run: RunProgram = runProgram) {
  const home = path.join(directory, 'gpg');
  await fs.mkdir(home, { mode: 0o700 });
  const publicKey = path.join(home, 'release-public-key.asc');
  const keyring = path.join(home, 'trusted-keyring.gpg');
  await fs.writeFile(publicKey, RELEASE_PUBLIC_KEY, { mode: 0o600, flag: 'wx' });
  try {
    await run('/usr/bin/gpg', ['--no-options', '--homedir', home, '--batch', '--dearmor', '--output', keyring, publicKey]);
  } catch {
    throw new Error('Se requieren GPG y GPGV para verificar la firma de la actualización. No se instalará un paquete sin verificar.');
  }
  return async (payload: string, signature: string) => {
    let stdout: string;
    try {
      ({ stdout } = await run('/usr/bin/gpgv', ['--homedir', home, '--keyring', keyring, '--status-fd', '1', signature, payload]));
    } catch {
      throw new Error('Firma de actualización inválida o no verificable. La instalación se ha bloqueado.');
    }
    const valid = stdout.split('\n').filter(line => line.startsWith('[GNUPG:] VALIDSIG '));
    if (valid.length !== 1 || valid[0].split(' ')[2] !== RELEASE_SIGNER_FINGERPRINT || /\[GNUPG:\] (?:BADSIG|ERRSIG|EXPSIG|EXPKEYSIG|REVKEYSIG)\b/.test(stdout)) {
      throw new Error('La actualización no está firmada por la clave de confianza de SolarSim.');
    }
  };
}

export async function verifyPackageHash(file: string, expectedHash: string, expectedSize: number) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size !== expectedSize) throw new Error('El tamaño del paquete no coincide con el manifiesto firmado.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== expectedHash) throw new Error('El contenido del paquete no coincide con el manifiesto firmado.');
}
