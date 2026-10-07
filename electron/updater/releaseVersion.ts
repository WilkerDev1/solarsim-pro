interface ReleaseVersion { core: bigint[]; prerelease: string[] }

function parseVersion(value: string): ReleaseVersion {
  const match = typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match) throw new Error('Formato de versión semántica inválido.');
  const prerelease = match[4]?.split('.') || [];
  if (prerelease.some(identifier => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'))) {
    throw new Error('Formato de versión semántica inválido.');
  }
  return { core: match.slice(1, 4).map(value => BigInt(value)), prerelease };
}

export function validateReleaseVersion(version: string): void { parseVersion(version); }

/** SemVer precedence: numeric components, prerelease identifiers, then stable.
 * Build metadata does not affect precedence; invalid versions always throw. */
export function compareReleaseVersions(candidate: string, installed: string): -1 | 0 | 1 {
  const next = parseVersion(candidate);
  const current = parseVersion(installed);
  for (let index = 0; index < 3; index++) {
    if (next.core[index] !== current.core[index]) return next.core[index] > current.core[index] ? 1 : -1;
  }
  if (!next.prerelease.length || !current.prerelease.length) {
    return !next.prerelease.length && !current.prerelease.length ? 0 : !next.prerelease.length ? 1 : -1;
  }
  for (let index = 0; index < Math.max(next.prerelease.length, current.prerelease.length); index++) {
    const left = next.prerelease[index];
    const right = current.prerelease[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) return BigInt(left) > BigInt(right) ? 1 : -1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left > right ? 1 : -1;
  }
  return 0;
}

export function assertNewerReleaseVersion(candidate: string, installed: string): void {
  if (compareReleaseVersions(candidate, installed) <= 0) throw new Error('La actualización debe ser posterior a la versión instalada. No se permiten retrocesos ni reinstalaciones.');
}
