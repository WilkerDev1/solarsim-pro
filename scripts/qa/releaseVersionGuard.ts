/**
 * Guardas de versión del flujo de release (docs/MAINTENANCE_AND_UPDATES.md). El cliente se identifica ante la API con
 * la versión de `package.json`, y la API reparte la política de funciones según esa versión: una release por debajo de
 * `FEATURE_POLICY_V3_CLIENT_VERSION` (también una prerrelease de esa versión) recibiría la política de dos claves y no
 * podría gestionar `quotations`. Solo se aplica al subir la versión y al generar los manifiestos; el CI de `beta` no la
 * ejecuta.
 */
import { compareSemver, FEATURE_POLICY_V3_CLIENT_VERSION } from '../../shared/clientVersion.js';

export function assertReleaseVersionSupportsFeaturePolicy(version: string): void {
  const comparison = compareSemver(version, FEATURE_POLICY_V3_CLIENT_VERSION);
  if (comparison === null) throw new Error(`Versión de release inválida: «${version}».`);
  if (comparison < 0) {
    throw new Error(
      `La versión ${version} es anterior a FEATURE_POLICY_V3_CLIENT_VERSION (${FEATURE_POLICY_V3_CLIENT_VERSION}): la API le daría la política de dos claves ` +
      'y no podría gestionar las cotizaciones. Publica esa versión o una posterior, o ajusta la constante en shared/clientVersion.ts al número de esta release.',
    );
  }
}
