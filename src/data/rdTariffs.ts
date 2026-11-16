import { DistributorTariffSchedule, GlobalTariffMatrix, UtilityDistributor, UtilityTariffDetails } from '../types/tariffs';
import { averageBlockEnergyRateDOP, tariffMatrixKey } from '../../shared/tariffRules';
import { billingTariffFromRow, type BillingTariff } from '../../shared/tariffBilling';

/**
 * Matriz de tarifas de FÁBRICA: solo es la referencia que se propone al crear o escanear una propuesta.
 * Las propuestas guardan su propia tarifa escalar y la matriz de cada usuario u organización (local o en
 * el servidor) no se reemplaza con esta; solo la usan instalaciones nuevas o «Restablecer».
 *
 * EDE: cuadro de las TARIFAS DE TRANSICIÓN A APLICAR del trimestre octubre–diciembre 2026 de la Resolución
 * SIE-121-2026-TF (art. 2, cuadro de la pág. 9; el art. 1 lo repite en la pág. 8). RD$, RD$/kWh y RD$/kW.
 * BTS-1 tiene cargo fijo por rango (0–100 kWh / ≥101 kWh); BTH y MTH, potencia fuera de punta (HFP) y en punta (HP).
 * La retención de exportación (25 %) es la política histórica del producto, no un dato de la resolución.
 */
interface EdeColumn {
  BTS1: { fixed: [number, number]; blocks: [number, number, number, number] };
  BTS2: { fixed: number; blocks: [number, number, number, number] };
  BTD: { fixed: number; energy: number; demand: number };
  BTH: { fixed: number; energy: number; hfp: number; hp: number };
  MTD1: { fixed: number; energy: number; demand: number };
  MTD2: { fixed: number; energy: number; demand: number };
  MTH: { fixed: number; energy: number; hfp: number; hp: number };
}

const SIE_121_2026_TF: Record<'EDESUR' | 'EDENORTE' | 'EDEESTE', EdeColumn> = {
  EDESUR: {
    BTS1: { fixed: [42.10, 128.59], blocks: [6.05, 8.59, 12.89, 13.09] },
    BTS2: { fixed: 128.96, blocks: [8.62, 10.93, 13.26, 13.43] },
    BTD: { fixed: 210.15, energy: 9.02, demand: 1189.16 },
    BTH: { fixed: 210.15, energy: 8.92, hfp: 357.24, hp: 1579.29 },
    MTD1: { fixed: 211.68, energy: 9.13, demand: 575.21 },
    MTD2: { fixed: 211.68, energy: 8.75, demand: 448.41 },
    MTH: { fixed: 211.68, energy: 8.64, hfp: 122.73, hp: 1025.25 },
  },
  EDENORTE: {
    BTS1: { fixed: [40.33, 126.81], blocks: [5.97, 8.51, 13.83, 14.04] },
    BTS2: { fixed: 127.18, blocks: [9.57, 11.88, 14.22, 14.38] },
    BTD: { fixed: 207.14, energy: 9.83, demand: 1310.10 },
    BTH: { fixed: 207.14, energy: 9.74, hfp: 393.45, hp: 1714.50 },
    MTD1: { fixed: 211.19, energy: 9.89, demand: 673.63 },
    MTD2: { fixed: 211.19, energy: 9.52, demand: 546.82 },
    MTH: { fixed: 211.19, energy: 9.42, hfp: 142.59, hp: 1131.61 },
  },
  EDEESTE: {
    BTS1: { fixed: [41.34, 127.83], blocks: [6.17, 8.71, 13.04, 13.26] },
    BTS2: { fixed: 128.20, blocks: [8.79, 11.10, 13.43, 13.59] },
    BTD: { fixed: 208.78, energy: 9.07, demand: 1280.88 },
    BTH: { fixed: 208.78, energy: 8.98, hfp: 376.09, hp: 1684.59 },
    MTD1: { fixed: 210.29, energy: 9.19, demand: 677.21 },
    MTD2: { fixed: 210.29, energy: 8.81, demand: 550.40 },
    MTH: { fixed: 210.29, energy: 8.70, hfp: 160.56, hp: 1142.36 },
  },
};

const RETENTION_PCT = 25.0;

const energyBlocks = (rates: [number, number, number, number]) => [
  { minKWh: 0, maxKWh: 200, rateDOP: rates[0] },
  { minKWh: 201, maxKWh: 300, rateDOP: rates[1] },
  { minKWh: 301, maxKWh: 700, rateDOP: rates[2] },
  // Desde 701 kWh todos los kWh del mes van a este precio (art. 4.d), no solo el excedente.
  { minKWh: 701, maxKWh: Infinity, rateDOP: rates[3] },
];

function edeTariffs(c: EdeColumn): Record<string, UtilityTariffDetails> {
  return {
    BTS1: {
      code: 'BTS1',
      name: 'BTS1 (Residencial Monómica Escalonada)',
      description: 'Tarifa residencial en baja tensión con escalones de consumo; desde 701 kWh todo el consumo al cuarto rango.',
      currency: 'DOP',
      // Precio plano de referencia: el del cuarto rango, que aplica a todo el consumo desde 701 kWh.
      baseEnergyRateDOP: c.BTS1.blocks[3],
      fixedChargeDOP: c.BTS1.fixed[1],
      fixedChargeTiersDOP: [
        { minKWh: 0, maxKWh: 100, chargeDOP: c.BTS1.fixed[0] },
        { minKWh: 101, maxKWh: null, chargeDOP: c.BTS1.fixed[1] },
      ],
      blocks: energyBlocks(c.BTS1.blocks),
      netMeteringRetentionPct: RETENTION_PCT,
    },
    BTS2: {
      code: 'BTS2',
      name: 'BTS2 (Comercial Simple Monómica)',
      description: 'Tarifa comercial pequeña y servicios en baja tensión sin medición de potencia; desde 701 kWh todo el consumo al cuarto rango.',
      currency: 'DOP',
      baseEnergyRateDOP: c.BTS2.blocks[3],
      fixedChargeDOP: c.BTS2.fixed,
      blocks: energyBlocks(c.BTS2.blocks),
      netMeteringRetentionPct: RETENTION_PCT,
    },
    BTD: {
      code: 'BTD',
      name: 'BTD (Baja Tensión con Demanda >10kW)',
      description: 'Suministro en baja tensión con medición de demanda máxima de potencia.',
      currency: 'DOP',
      baseEnergyRateDOP: c.BTD.energy,
      fixedChargeDOP: c.BTD.fixed,
      demandChargePerKWDOP: c.BTD.demand,
      netMeteringRetentionPct: RETENTION_PCT,
    },
    BTH: {
      code: 'BTH',
      name: 'BTH (Baja Tensión Horaria)',
      description: 'Baja tensión con demanda máxima de potencia en horas de punta y fuera de punta.',
      currency: 'DOP',
      baseEnergyRateDOP: c.BTH.energy,
      fixedChargeDOP: c.BTH.fixed,
      demandChargePerKWDOP: c.BTH.hp,
      peakDemandChargePerKWDOP: c.BTH.hp,
      offPeakDemandChargePerKWDOP: c.BTH.hfp,
      netMeteringRetentionPct: RETENTION_PCT,
    },
    MTD1: {
      code: 'MTD1',
      name: 'MTD1 (Media Tensión con Demanda)',
      description: 'Suministro en media tensión con cargo por demanda máxima de potencia.',
      currency: 'DOP',
      baseEnergyRateDOP: c.MTD1.energy,
      fixedChargeDOP: c.MTD1.fixed,
      demandChargePerKWDOP: c.MTD1.demand,
      netMeteringRetentionPct: RETENTION_PCT,
    },
    MTD2: {
      code: 'MTD2',
      name: 'MTD2 (Media Tensión con Demanda)',
      description: 'Suministro en media tensión con cargo por demanda máxima de potencia (MTD-2).',
      currency: 'DOP',
      baseEnergyRateDOP: c.MTD2.energy,
      fixedChargeDOP: c.MTD2.fixed,
      demandChargePerKWDOP: c.MTD2.demand,
      netMeteringRetentionPct: RETENTION_PCT,
    },
    MTH: {
      code: 'MTH',
      name: 'MTH (Media Tensión Horaria)',
      description: 'Media tensión con demanda máxima de potencia en horas de punta y fuera de punta.',
      currency: 'DOP',
      baseEnergyRateDOP: c.MTH.energy,
      fixedChargeDOP: c.MTH.fixed,
      demandChargePerKWDOP: c.MTH.hp,
      peakDemandChargePerKWDOP: c.MTH.hp,
      offPeakDemandChargePerKWDOP: c.MTH.hfp,
      netMeteringRetentionPct: RETENTION_PCT,
    },
  };
}

/**
 * CEPM: pliego de septiembre de 2026 reconocido provisionalmente por la Resolución SIE-147-2026-TF (art. 1,
 * pág. 5): BT 22.90 RD$/kWh; binómica 14.00 RD$/kWh + 2,251.45 RD$/kW-mes; MT 0.2789 US$/kWh. La resolución
 * no publica cargos fijos ni la tarifa ESTRBT-2 de CEB: esos valores son los del catálogo anterior y quedan
 * marcados por campo como no confirmados.
 */
const SIE_147 = { resolutionCode: 'SIE-147-2026-TF', effectiveDate: '2026-09-01', publishedBy: 'Superintendencia de Electricidad (SIE)' };
const UNCONFIRMED = { resolutionCode: 'Catálogo anterior (no confirmado)', effectiveDate: '2026-01-01', publishedBy: 'CEPM / CEB (sin resolución SIE)' };
const cepmSource = (confirmed: string[], unconfirmed: string[]): UtilityTariffDetails['source'] => ({
  ...SIE_147,
  fields: confirmed,
  fieldSources: Object.fromEntries([...confirmed.map((field) => [field, SIE_147]), ...unconfirmed.map((field) => [field, UNCONFIRMED])]),
});

const RBT1: UtilityTariffDetails = {
  code: 'RBT-1',
  name: 'Tarifa baja tensión regular (RBT-1)',
  description: 'Tarifa baja tensión regular monómica para residencias y comercios pequeños en Punta Cana, Bávaro y Bayahíbe.',
  currency: 'DOP',
  baseEnergyRateDOP: 22.90,
  fixedChargeDOP: 250.00,
  netMeteringRetentionPct: RETENTION_PCT,
  source: cepmSource(['baseEnergyRateDOP'], ['fixedChargeDOP']),
};

const RBT2: UtilityTariffDetails = {
  code: 'RBT-2',
  name: 'Tarifa baja tensión con demanda (RBT-2)',
  description: 'Tarifa binómica con medición de demanda máxima de potencia para plazas y comercios en zona CEPM.',
  currency: 'DOP',
  baseEnergyRateDOP: 14.00,
  fixedChargeDOP: 600.00,
  demandChargePerKWDOP: 2251.45,
  netMeteringRetentionPct: RETENTION_PCT,
  source: cepmSource(['baseEnergyRateDOP', 'demandChargePerKWDOP'], ['fixedChargeDOP']),
};

const CEPM_SCHEDULE: DistributorTariffSchedule = {
  distributor: 'CEPM',
  fullName: 'Consorcio Energético Punta Cana - Macao, S.A. & CEB',
  region: 'Punta Cana, Bávaro, Macao, Uvero Alto, Miches, Bayahíbe (CEB)',
  concessionType: 'AISLADO_PRIVADO',
  tariffs: {
    'RBT-1': RBT1,
    'RBT-2': RBT2,
    'ESTRBT-2': {
      code: 'ESTRBT-2',
      name: 'Tarifa baja tensión con demanda (ESTRBT-2) CEB',
      description: 'Suministro en baja tensión con demanda en el área de concesión de Bayahíbe (CEB). Sin resolución SIE: confirmar con la factura.',
      currency: 'DOP',
      baseEnergyRateDOP: 14.1278,
      baseEnergyRateUSD: 0.235,
      fixedChargeDOP: 600.00,
      fixedChargeUSD: 10.00,
      demandChargePerKWDOP: 2342.83,
      demandChargePerKWUSD: 39.05,
      netMeteringRetentionPct: RETENTION_PCT,
      source: UNCONFIRMED,
    },
    'RMT-1': {
      code: 'RMT-1',
      name: 'Tarifa media tensión (RMT-1)',
      description: 'Media tensión: tarifa media en US$/kWh resultante de descuentos escalonados por volumen de consumo.',
      currency: 'USD',
      baseEnergyRateUSD: 0.2789,
      // Tarifa en dólares: la resolución no publica un equivalente en pesos (mismo criterio que el escáner).
      baseEnergyRateDOP: 0,
      fixedChargeUSD: 20.00,
      fixedChargeDOP: 1200.00,
      netMeteringRetentionPct: RETENTION_PCT,
      source: cepmSource(['baseEnergyRateUSD'], ['fixedChargeUSD', 'fixedChargeDOP']),
    },
    // Alias de retrocompatibilidad para proyectos legacy
    BTS1: { ...RBT1, description: 'Tarifa baja tensión regular monómica para residencias y comercios.' },
    BTS2: { ...RBT1, description: 'Tarifa baja tensión regular monómica para comercios y servicios.', fixedChargeDOP: 350.00 },
    BTD: { ...RBT2, description: 'Tarifa baja tensión con medición de demanda máxima de potencia.' },
  },
};

export const DEFAULT_RD_TARIFF_MATRIX: GlobalTariffMatrix = {
  resolutionCode: 'SIE-121-2026-TF',
  effectiveDate: '2026-10-01',
  lastUpdatedAt: '2026-10-01T00:00:00.000Z',
  publishedBy: 'Superintendencia de Electricidad (SIE)',
  notes: 'Tarifas de transición a aplicar por EDESUR, EDENORTE y EDEESTE en octubre-diciembre 2026 (Resolución SIE-121-2026-TF, art. 2). CEPM: pliego de septiembre 2026 reconocido por la Resolución SIE-147-2026-TF; sus cargos fijos y la tarifa ESTRBT-2 (CEB) no figuran en esa resolución.',
  schedules: {
    EDEESTE: {
      distributor: 'EDEESTE',
      fullName: 'Empresa Distribuidora de Electricidad del Este, S.A.',
      region: 'Santo Domingo Este, Boca Chica, San Pedro, La Romana, Hato Mayor, El Seibo, Monte Plata',
      concessionType: 'INTERCONECTADO_SENI',
      tariffs: edeTariffs(SIE_121_2026_TF.EDEESTE),
    },
    EDESUR: {
      distributor: 'EDESUR',
      fullName: 'Empresa Distribuidora de Electricidad del Sur, S.A.',
      region: 'Distrito Nacional, Santo Domingo Oeste, San Cristóbal, Baní, Azua, San Juan, Barahona',
      concessionType: 'INTERCONECTADO_SENI',
      tariffs: edeTariffs(SIE_121_2026_TF.EDESUR),
    },
    EDENORTE: {
      distributor: 'EDENORTE',
      fullName: 'Empresa Distribuidora de Electricidad del Norte, S.A.',
      region: 'Santiago, Puerto Plata, La Vega, Duarte, Espaillat, Valverde, Montecristi, Samaná',
      concessionType: 'INTERCONECTADO_SENI',
      tariffs: edeTariffs(SIE_121_2026_TF.EDENORTE),
    },
    CEPM: CEPM_SCHEDULE,
  },
};

/**
 * Fila de facturación (bloques, cargo fijo o cargo fijo por rango) de la tarifa exacta de una distribuidora en la matriz
 * activa, para guardarla en la propuesta junto con el precio de referencia (`shared/tariffBilling.ts`). A diferencia de
 * `getReferenceEnergyRateUSD`, sin fila exacta no hay sustituto: `undefined` (la propuesta se valora con el escalar).
 */
export function referenceBillingTariff(matrix: GlobalTariffMatrix | null | undefined, distributor: UtilityDistributor | string, tariffCode: string): BillingTariff | undefined {
  const schedule = matrix?.schedules?.[distributor as UtilityDistributor];
  if (!schedule) return undefined;
  const row = schedule.tariffs[tariffMatrixKey(distributor, tariffCode)];
  return billingTariffFromRow(distributor, row, { resolutionCode: matrix?.resolutionCode, effectiveDate: matrix?.effectiveDate });
}

/**
 * Calcula el costo unitario de referencia en USD/kWh a partir de la matriz tarifaria activa.
 */
export function getReferenceEnergyRateUSD(
  matrix: GlobalTariffMatrix,
  distributor: UtilityDistributor | string,
  tariffCode: string,
  monthlyKWh: number = 900,
  usdExchangeRate: number = 60.0
): number {
  const distKey = (distributor as UtilityDistributor) || 'EDESUR';
  const sched = matrix.schedules[distKey] || matrix.schedules.EDESUR;

  // Código normalizado (BTS-1 → BTS1, RBT1 → RBT-1) y, en CEPM, alias de las EDE.
  const canonical = tariffMatrixKey(distKey, tariffCode);
  let tariff: UtilityTariffDetails | undefined = sched.tariffs[canonical];

  if (!tariff) {
    // Si estamos en CEPM y vino código BTS1/BTS2
    if (distKey === 'CEPM') {
      tariff = sched.tariffs['RBT-1'] || sched.tariffs.BTS1;
    } else {
      tariff = sched.tariffs.BTS2 || sched.tariffs.BTS1;
    }
  }

  if (!tariff) return 0.20;

  if (tariff.currency === 'USD' && typeof tariff.baseEnergyRateUSD === 'number' && Number.isFinite(tariff.baseEnergyRateUSD)) {
    return Math.round(tariff.baseEnergyRateUSD * 1000) / 1000;
  }

  // Bloques (BTS-1, BTS-2): escalonados y, desde 701 kWh, todo al 4.º rango (SIE-121-2026-TF, art. 4.d).
  if (tariff.blocks && tariff.blocks.length > 0 && monthlyKWh > 0) {
    const effectiveDOPPerKWh = averageBlockEnergyRateDOP(
      tariff.blocks.map((block) => ({ fromKWh: block.minKWh, toKWh: Number.isFinite(block.maxKWh) ? block.maxKWh : null, rateDOP: block.rateDOP })),
      monthlyKWh,
      tariff.code,
    );
    if (effectiveDOPPerKWh !== undefined) {
      const rateUSD = effectiveDOPPerKWh / (usdExchangeRate > 0 ? usdExchangeRate : 60.0);
      return Math.round(rateUSD * 1000) / 1000;
    }
  }

  // Tarifa monómica plana (ej. RBT-1 en CEPM = 22.90 DOP)
  const rateDOP = tariff.baseEnergyRateDOP ?? 12.0;
  const rateUSD = rateDOP / (usdExchangeRate > 0 ? usdExchangeRate : 60.0);
  return Math.round(rateUSD * 1000) / 1000;
}
