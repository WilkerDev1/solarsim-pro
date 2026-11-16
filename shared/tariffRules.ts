/**
 * Reglas de códigos y bloques tarifarios compartidas por la app, el borrador de IA y el visor.
 * TypeScript puro: sin dependencias de `src/`.
 */

/** Códigos de CEPM que la matriz guarda con guion (RBT-1, RBT-2, ESTRBT-2, RMT-1). */
const HYPHENATED_CODE = /^(ESTRBT|RBT|RMT)(\d+)$/;

/**
 * Forma canónica de un código de tarifa, igual a las claves de la matriz: mayúsculas, sin espacios
 * ni guiones en las tarifas de las EDE (BTS-1, «BTS 1», bts1 → BTS1; MTD-1 → MTD1) y con guion en las
 * de CEPM (RBT1 → RBT-1). Un valor que no es texto da ''.
 */
export function normalizeTariffCode(code: unknown): string {
  if (typeof code !== 'string') return '';
  const compact = code.normalize('NFKC').toUpperCase().replace(/[\s_.\-‐-―]+/g, '');
  const hyphenated = compact.match(HYPHENATED_CODE);
  return hyphenated ? `${hyphenated[1]}-${hyphenated[2]}` : compact;
}

/** Códigos de las EDE que CEPM factura con su propio pliego (alias de proyectos antiguos). */
const CEPM_ALIASES: Record<string, string> = { BTS1: 'RBT-1', BTS2: 'RBT-1', BTD: 'RBT-2', MTD1: 'RMT-1', MTD2: 'RMT-1' };

/** Clave de la fila en la matriz para una distribuidora: código normalizado y, en CEPM, el alias resuelto. */
export function tariffMatrixKey(distributor: string | undefined, code: unknown): string {
  const normalized = normalizeTariffCode(code);
  return distributor === 'CEPM' ? CEPM_ALIASES[normalized] ?? normalized : normalized;
}

/**
 * Tipo de cargo de la tarifa según el Reglamento SIE-007-2026-REG: las tarifas de un solo precio
 * (monómicas: BTS-1, BTS-2, RBT-1 de CEPM) pagan cargo por uso de la red sobre lo inyectado; las que
 * tienen cargo de potencia (BTD, BTH, MTD-1, MTD-2, MTH, RBT-2/ESTRBT-2 de CEPM) no. Lo demás queda sin clasificar.
 */
export type TariffChargeKind = 'single_price' | 'demand' | 'unknown';
const SINGLE_PRICE = new Set(['BTS1', 'BTS2', 'RBT-1']);
const DEMAND = new Set(['BTD', 'BTH', 'MTD1', 'MTD2', 'MTH', 'RBT-2', 'ESTRBT-2']);
export function tariffChargeKind(distributor: string | undefined, code: unknown): TariffChargeKind {
  const key = tariffMatrixKey(distributor, code);
  if (SINGLE_PRICE.has(key)) return 'single_price';
  if (DEMAND.has(key)) return 'demand';
  return 'unknown';
}

/** Tramo de energía con límites impresos inclusivos (0–200, 201–300…); `toKWh: null` es el último tramo abierto. */
export interface EnergyBlock {
  fromKWh: number;
  toKWh: number | null;
  rateDOP: number;
}

/**
 * Tarifas en las que, según la Resolución SIE-121-2026-TF (art. 4.d), con un consumo del mes de 701 kWh
 * o mayor todos los kWh se facturan al precio del cuarto rango (no escalonado).
 */
const ALL_UNITS_AT_LAST_BLOCK = new Set(['BTS1', 'BTS2']);

/**
 * Precio medio de energía (RD$/kWh) de un consumo mensual con tarifa por bloques. Los tramos se aplican
 * escalonados; en BTS-1 y BTS-2, con un consumo de 701 kWh o mayor (inicio del último tramo), todo el
 * consumo va al precio de ese tramo. Devuelve `undefined` sin consumo positivo, con un precio o unos
 * límites de tramo no finitos, o si el resultado no es finito.
 */
export function averageBlockEnergyRateDOP(blocks: readonly EnergyBlock[], monthlyKWh: number, tariffCode?: unknown): number | undefined {
  if (!blocks.length || !(monthlyKWh > 0) || !Number.isFinite(monthlyKWh)) return undefined;
  if (blocks.some((block) => typeof block.rateDOP !== 'number' || !Number.isFinite(block.rateDOP))) return undefined;
  if (blocks.some((block) => !Number.isFinite(block.fromKWh) || (block.toKWh !== null && !Number.isFinite(block.toKWh)))) return undefined;
  let remaining = monthlyKWh;
  let total = 0;
  let previousMax = 0;
  const lowerBounds: number[] = [];
  for (const block of blocks) {
    // Límites impresos inclusivos: «201–300» continúa a «0–200» sin perder el kWh 200→201.
    const lower = block.fromKWh > 0 && block.fromKWh === previousMax + 1 ? previousMax : block.fromKWh;
    lowerBounds.push(lower);
    previousMax = block.toKWh === null ? Infinity : block.toKWh;
  }
  const last = blocks[blocks.length - 1];
  if (ALL_UNITS_AT_LAST_BLOCK.has(normalizeTariffCode(tariffCode)) && last.toKWh === null && blocks.length > 1 && monthlyKWh >= last.fromKWh) {
    return last.rateDOP;
  }
  for (let i = 0; i < blocks.length && remaining > 0; i++) {
    const block = blocks[i];
    const size = block.toKWh === null ? Infinity : Math.max(0, block.toKWh - lowerBounds[i]);
    const amount = Math.min(remaining, size);
    total += amount * block.rateDOP;
    remaining -= amount;
  }
  if (remaining > 0) return undefined;
  const average = total / monthlyKWh;
  return Number.isFinite(average) ? average : undefined;
}
