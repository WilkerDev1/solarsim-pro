import type { GlobalTariffMatrix } from '../types/tariffs';
import { DEFAULT_RD_TARIFF_MATRIX } from './rdTariffs';

/**
 * Versiones de la matriz de FÁBRICA. Una matriz guardada (en el equipo o en el servidor de la organización) que es
 * exactamente una matriz de fábrica anterior no es un dato del usuario: es la referencia que la aplicación le dio y
 * que nadie tocó. Esa se actualiza a la vigente; cualquier otra (editada, escaneada, descargada distinta) se conserva.
 *
 * Criterio: huella de la matriz completa salvo `lastUpdatedAt` (cambia al sincronizar o al aplicar sin tocar valores).
 * Entran cabecera (resolución, vigencia, emisor, notas) y todas las filas con su procedencia (`source`). La forma es
 * canónica: claves ordenadas, campos `undefined` fuera e `Infinity` como `null` (así queda tras JSON), de modo que la
 * misma matriz da la misma huella recién creada, guardada en disco, normalizada al hidratar o devuelta por la API.
 */

/** FNV-1a de 64 bits en hexadecimal. Solo identifica versiones conocidas; no es una firma de seguridad. */
function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      return Object.fromEntries(Object.keys(current).sort().map((key) => [key, (current as Record<string, unknown>)[key]]));
    }
    return current;
  });
}

/** Huella de los valores de una matriz (todo salvo `lastUpdatedAt`). */
export function tariffMatrixFingerprint(matrix: GlobalTariffMatrix): string {
  const { lastUpdatedAt: _ignored, ...values } = matrix;
  return fnv1a64(canonicalJson(values));
}

export interface RetiredFactoryTariffMatrix {
  fingerprint: string;
  resolutionCode: string;
  effectiveDate: string;
  /** Versiones de la aplicación que la instalaban. */
  shippedIn: string;
}

/**
 * Matrices de fábrica publicadas antes de la vigente. Se guarda la huella, no la matriz entera; la prueba
 * `testFactoryTariffMatrixUpgrade` la comprueba contra la matriz de v2.7.4 (`src/tests/fixtures/`).
 */
export const RETIRED_FACTORY_TARIFF_MATRICES: readonly RetiredFactoryTariffMatrix[] = [
  // Única matriz de fábrica anterior: igual de v2.0.0 a v2.7.4 (EDESUR y EDENORTE copiaban los valores de EDEESTE).
  { fingerprint: '2bad7213d39b1ce8', resolutionCode: 'SIE-176-2025-TF', effectiveDate: '2026-01-01', shippedIn: '2.0.0–2.7.4' },
];

const CURRENT_FACTORY_FINGERPRINT = tariffMatrixFingerprint(DEFAULT_RD_TARIFF_MATRIX);

export type TariffMatrixOrigin = 'current_factory' | 'retired_factory' | 'custom';

/** De dónde viene una matriz guardada: la de fábrica vigente, una de fábrica anterior sin tocar o una personalizada. */
export function classifyTariffMatrix(matrix: GlobalTariffMatrix | null | undefined): TariffMatrixOrigin {
  if (!matrix || typeof matrix !== 'object' || !matrix.schedules) return 'custom';
  let fingerprint: string;
  try {
    fingerprint = tariffMatrixFingerprint(matrix);
  } catch {
    return 'custom';
  }
  if (fingerprint === CURRENT_FACTORY_FINGERPRINT) return 'current_factory';
  return RETIRED_FACTORY_TARIFF_MATRICES.some((retired) => retired.fingerprint === fingerprint) ? 'retired_factory' : 'custom';
}

/**
 * Sustituye una matriz de fábrica anterior sin tocar por la vigente; cualquier otra se devuelve igual (misma referencia).
 * Es una actualización de datos de fábrica, no una reparación de datos del usuario.
 */
export function upgradeRetiredFactoryTariffMatrix<T extends GlobalTariffMatrix | null | undefined>(matrix: T): T | GlobalTariffMatrix {
  return classifyTariffMatrix(matrix) === 'retired_factory' ? DEFAULT_RD_TARIFF_MATRIX : matrix;
}

export interface FactoryTariffUpdateNotice {
  savedResolutionCode: string;
  savedEffectiveDate: string;
  factoryResolutionCode: string;
  factoryEffectiveDate: string;
}

/**
 * Aviso para una matriz PERSONALIZADA cuya vigencia es anterior a la de fábrica: hay un pliego de fábrica más nuevo
 * que el usuario puede adoptar a mano. Una matriz escaneada de una resolución igual o más reciente no lo muestra.
 */
export function factoryTariffUpdateNotice(matrix: GlobalTariffMatrix | null | undefined): FactoryTariffUpdateNotice | null {
  if (!matrix || classifyTariffMatrix(matrix) !== 'custom') return null;
  const savedEffectiveDate = typeof matrix.effectiveDate === 'string' ? matrix.effectiveDate : '';
  if (savedEffectiveDate && savedEffectiveDate >= DEFAULT_RD_TARIFF_MATRIX.effectiveDate) return null;
  return {
    savedResolutionCode: matrix.resolutionCode || 'sin resolución',
    savedEffectiveDate: savedEffectiveDate || 'sin fecha',
    factoryResolutionCode: DEFAULT_RD_TARIFF_MATRIX.resolutionCode,
    factoryEffectiveDate: DEFAULT_RD_TARIFF_MATRIX.effectiveDate,
  };
}
