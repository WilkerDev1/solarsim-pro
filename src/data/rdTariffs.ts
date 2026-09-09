import { GlobalTariffMatrix, UtilityDistributor, TariffCode, UtilityTariffDetails } from '../types/tariffs';

export const DEFAULT_RD_TARIFF_MATRIX: GlobalTariffMatrix = {
  resolutionCode: 'SIE-176-2025-TF',
  effectiveDate: '2026-01-01',
  lastUpdatedAt: '2026-01-01T00:00:00.000Z',
  publishedBy: 'Superintendencia de Electricidad (SIE) & CEPM',
  notes: 'Pliego tarifario de transición oficial vigente en RD según Resolución SIE-176-2025-TF (Enero-Marzo 2026) y tarifas oficiales de concesión CEPM/CEB.',
  schedules: {
    EDEESTE: {
      distributor: 'EDEESTE',
      fullName: 'Empresa Distribuidora de Electricidad del Este, S.A.',
      region: 'Santo Domingo Este, Boca Chica, San Pedro, La Romana, Hato Mayor, El Seibo, Monte Plata',
      concessionType: 'INTERCONECTADO_SENI',
      tariffs: {
        BTS1: {
          code: 'BTS1',
          name: 'BTS1 (Residencial Monómica Escalonada)',
          description: 'Tarifa residencial en baja tensión con escalones progresivos de consumo.',
          currency: 'DOP',
          baseEnergyRateDOP: 11.85,
          fixedChargeDOP: 127.83,
          blocks: [
            { minKWh: 0, maxKWh: 200, rateDOP: 6.17 },
            { minKWh: 201, maxKWh: 300, rateDOP: 8.71 },
            { minKWh: 301, maxKWh: 700, rateDOP: 13.04 },
            { minKWh: 701, maxKWh: Infinity, rateDOP: 13.26 },
          ],
          netMeteringRetentionPct: 25.0,
        },
        BTS2: {
          code: 'BTS2',
          name: 'BTS2 (Comercial Simple Monómica)',
          description: 'Tarifa comercial pequeña y servicios en baja tensión sin medición de potencia.',
          currency: 'DOP',
          baseEnergyRateDOP: 13.20,
          fixedChargeDOP: 128.20,
          blocks: [
            { minKWh: 0, maxKWh: 200, rateDOP: 8.79 },
            { minKWh: 201, maxKWh: 300, rateDOP: 11.10 },
            { minKWh: 301, maxKWh: 700, rateDOP: 13.43 },
            { minKWh: 701, maxKWh: Infinity, rateDOP: 13.59 },
          ],
          netMeteringRetentionPct: 25.0,
        },
        BTD: {
          code: 'BTD',
          name: 'BTD (Baja Tensión con Demanda >10kW)',
          description: 'Suministro en baja tensión con medición de demanda máxima de potencia.',
          currency: 'DOP',
          baseEnergyRateDOP: 9.07,
          fixedChargeDOP: 208.78,
          demandChargePerKWDOP: 1280.88,
          netMeteringRetentionPct: 25.0,
        },
        BTH: {
          code: 'BTH',
          name: 'BTH (Baja Tensión Horaria)',
          description: 'Tarifa en baja tensión con cargos diferenciados por horario.',
          currency: 'DOP',
          baseEnergyRateDOP: 8.98,
          fixedChargeDOP: 208.78,
          demandChargePerKWDOP: 1684.59,
          peakEnergyRateDOP: 8.98,
          offPeakEnergyRateDOP: 8.98,
          netMeteringRetentionPct: 25.0,
        },
        MTD1: {
          code: 'MTD1',
          name: 'MTD1 (Media Tensión con Demanda)',
          description: 'Suministro en media tensión (12.47kV a 34.5kV) con cargo por capacidad.',
          currency: 'DOP',
          baseEnergyRateDOP: 9.19,
          fixedChargeDOP: 210.29,
          demandChargePerKWDOP: 677.21,
          netMeteringRetentionPct: 25.0,
        },
        MTD2: {
          code: 'MTD2',
          name: 'MTD2 (Media Tensión con Demanda Horaria)',
          description: 'Tarifa horaria diferenciada entre horas punta y fuera de punta.',
          currency: 'DOP',
          baseEnergyRateDOP: 8.81,
          fixedChargeDOP: 210.29,
          demandChargePerKWDOP: 550.40,
          peakEnergyRateDOP: 10.50,
          offPeakEnergyRateDOP: 7.50,
          netMeteringRetentionPct: 25.0,
        },
        MTH: {
          code: 'MTH',
          name: 'MTH (Media Tensión Horaria)',
          description: 'Suministro en media tensión industrial con cargos punta y fuera de punta.',
          currency: 'DOP',
          baseEnergyRateDOP: 8.70,
          fixedChargeDOP: 210.29,
          demandChargePerKWDOP: 1142.36,
          netMeteringRetentionPct: 25.0,
        },
      },
    },
    EDESUR: {
      distributor: 'EDESUR',
      fullName: 'Empresa Distribuidora de Electricidad del Sur, S.A.',
      region: 'Distrito Nacional, Santo Domingo Oeste, San Cristóbal, Baní, Azua, San Juan, Barahona',
      concessionType: 'INTERCONECTADO_SENI',
      tariffs: {
        BTS1: {
          code: 'BTS1',
          name: 'BTS1 (Residencial Monómica Escalonada)',
          description: 'Tarifa residencial en baja tensión con escalones progresivos de consumo.',
          currency: 'DOP',
          baseEnergyRateDOP: 11.85,
          fixedChargeDOP: 127.83,
          blocks: [
            { minKWh: 0, maxKWh: 200, rateDOP: 6.17 },
            { minKWh: 201, maxKWh: 300, rateDOP: 8.71 },
            { minKWh: 301, maxKWh: 700, rateDOP: 13.04 },
            { minKWh: 701, maxKWh: Infinity, rateDOP: 13.26 },
          ],
          netMeteringRetentionPct: 25.0,
        },
        BTS2: {
          code: 'BTS2',
          name: 'BTS2 (Comercial Simple Monómica)',
          description: 'Tarifa comercial pequeña y servicios en baja tensión sin medición de potencia.',
          currency: 'DOP',
          baseEnergyRateDOP: 13.20,
          fixedChargeDOP: 128.20,
          blocks: [
            { minKWh: 0, maxKWh: 200, rateDOP: 8.79 },
            { minKWh: 201, maxKWh: 300, rateDOP: 11.10 },
            { minKWh: 301, maxKWh: 700, rateDOP: 13.43 },
            { minKWh: 701, maxKWh: Infinity, rateDOP: 13.59 },
          ],
          netMeteringRetentionPct: 25.0,
        },
        BTD: {
          code: 'BTD',
          name: 'BTD (Baja Tensión con Demanda >10kW)',
          description: 'Suministro en baja tensión con medición de demanda máxima de potencia.',
          currency: 'DOP',
          baseEnergyRateDOP: 9.07,
          fixedChargeDOP: 208.78,
          demandChargePerKWDOP: 1280.88,
          netMeteringRetentionPct: 25.0,
        },
        BTH: {
          code: 'BTH',
          name: 'BTH (Baja Tensión Horaria)',
          description: 'Tarifa horaria diferenciada entre horas punta y fuera de punta.',
          currency: 'DOP',
          baseEnergyRateDOP: 8.98,
          fixedChargeDOP: 208.78,
          demandChargePerKWDOP: 1684.59,
          netMeteringRetentionPct: 25.0,
        },
        MTD1: {
          code: 'MTD1',
          name: 'MTD1 (Media Tensión con Demanda)',
          description: 'Suministro en media tensión con cargo por capacidad de potencia.',
          currency: 'DOP',
          baseEnergyRateDOP: 9.19,
          fixedChargeDOP: 210.29,
          demandChargePerKWDOP: 677.21,
          netMeteringRetentionPct: 25.0,
        },
        MTD2: {
          code: 'MTD2',
          name: 'MTD2 (Media Tensión con Demanda Horaria)',
          description: 'Tarifa horaria diferenciada entre horas punta y fuera de punta.',
          currency: 'DOP',
          baseEnergyRateDOP: 8.81,
          fixedChargeDOP: 210.29,
          demandChargePerKWDOP: 550.40,
          netMeteringRetentionPct: 25.0,
        },
        MTH: {
          code: 'MTH',
          name: 'MTH (Media Tensión Horaria)',
          description: 'Suministro en media tensión horaria con cargos punta y fuera de punta.',
          currency: 'DOP',
          baseEnergyRateDOP: 8.70,
          fixedChargeDOP: 210.29,
          demandChargePerKWDOP: 1142.36,
          netMeteringRetentionPct: 25.0,
        },
      },
    },
    EDENORTE: {
      distributor: 'EDENORTE',
      fullName: 'Empresa Distribuidora de Electricidad del Norte, S.A.',
      region: 'Santiago, Puerto Plata, La Vega, Duarte, Espaillat, Valverde, Montecristi, Samaná',
      concessionType: 'INTERCONECTADO_SENI',
      tariffs: {
        BTS1: {
          code: 'BTS1',
          name: 'BTS1 (Residencial Monómica Escalonada)',
          description: 'Tarifa residencial en baja tensión con escalones progresivos de consumo.',
          currency: 'DOP',
          baseEnergyRateDOP: 11.85,
          fixedChargeDOP: 127.83,
          blocks: [
            { minKWh: 0, maxKWh: 200, rateDOP: 6.17 },
            { minKWh: 201, maxKWh: 300, rateDOP: 8.71 },
            { minKWh: 301, maxKWh: 700, rateDOP: 13.04 },
            { minKWh: 701, maxKWh: Infinity, rateDOP: 13.26 },
          ],
          netMeteringRetentionPct: 25.0,
        },
        BTS2: {
          code: 'BTS2',
          name: 'BTS2 (Comercial Simple Monómica)',
          description: 'Tarifa comercial pequeña y servicios en baja tensión sin medición de potencia.',
          currency: 'DOP',
          baseEnergyRateDOP: 13.20,
          fixedChargeDOP: 128.20,
          blocks: [
            { minKWh: 0, maxKWh: 200, rateDOP: 8.79 },
            { minKWh: 201, maxKWh: 300, rateDOP: 11.10 },
            { minKWh: 301, maxKWh: 700, rateDOP: 13.43 },
            { minKWh: 701, maxKWh: Infinity, rateDOP: 13.59 },
          ],
          netMeteringRetentionPct: 25.0,
        },
        BTD: {
          code: 'BTD',
          name: 'BTD (Baja Tensión con Demanda >10kW)',
          description: 'Suministro en baja tensión con medición de demanda máxima de potencia.',
          currency: 'DOP',
          baseEnergyRateDOP: 9.07,
          fixedChargeDOP: 208.78,
          demandChargePerKWDOP: 1280.88,
          netMeteringRetentionPct: 25.0,
        },
        BTH: {
          code: 'BTH',
          name: 'BTH (Baja Tensión Horaria)',
          description: 'Tarifa horaria diferenciada en baja tensión.',
          currency: 'DOP',
          baseEnergyRateDOP: 8.98,
          fixedChargeDOP: 208.78,
          demandChargePerKWDOP: 1684.59,
          netMeteringRetentionPct: 25.0,
        },
        MTD1: {
          code: 'MTD1',
          name: 'MTD1 (Media Tensión con Demanda)',
          description: 'Suministro en media tensión con cargo por capacidad de potencia.',
          currency: 'DOP',
          baseEnergyRateDOP: 9.19,
          fixedChargeDOP: 210.29,
          demandChargePerKWDOP: 677.21,
          netMeteringRetentionPct: 25.0,
        },
        MTD2: {
          code: 'MTD2',
          name: 'MTD2 (Media Tensión con Demanda Horaria)',
          description: 'Tarifa horaria diferenciada entre horas punta y fuera de punta.',
          currency: 'DOP',
          baseEnergyRateDOP: 8.81,
          fixedChargeDOP: 210.29,
          demandChargePerKWDOP: 550.40,
          netMeteringRetentionPct: 25.0,
        },
        MTH: {
          code: 'MTH',
          name: 'MTH (Media Tensión Horaria)',
          description: 'Suministro en media tensión horaria.',
          currency: 'DOP',
          baseEnergyRateDOP: 8.70,
          fixedChargeDOP: 210.29,
          demandChargePerKWDOP: 1142.36,
          netMeteringRetentionPct: 25.0,
        },
      },
    },
    CEPM: {
      distributor: 'CEPM',
      fullName: 'Consorcio Energético Punta Cana - Macao, S.A. & CEB',
      region: 'Punta Cana, Bávaro, Macao, Uvero Alto, Miches, Bayahíbe (CEB)',
      concessionType: 'AISLADO_PRIVADO',
      tariffs: {
        'RBT-1': {
          code: 'RBT-1',
          name: 'Tarifa baja tensión regular (RBT-1)',
          description: 'Tarifa baja tensión regular monómica para residencias y comercios pequeños en Punta Cana, Bávaro y Bayahíbe.',
          currency: 'DOP',
          baseEnergyRateDOP: 22.90,
          baseEnergyRateUSD: 0.382,
          fixedChargeDOP: 250.00,
          fixedChargeUSD: 4.17,
          netMeteringRetentionPct: 25.0,
        },
        'RBT-2': {
          code: 'RBT-2',
          name: 'Tarifa baja tensión con demanda (RBT-2)',
          description: 'Tarifa baja tensión con medición de demanda máxima de potencia para plazas y comercios en zona CEPM.',
          currency: 'DOP',
          baseEnergyRateDOP: 14.1278,
          baseEnergyRateUSD: 0.235,
          fixedChargeDOP: 600.00,
          fixedChargeUSD: 10.00,
          demandChargePerKWDOP: 2342.83,
          demandChargePerKWUSD: 39.05,
          netMeteringRetentionPct: 25.0,
        },
        'ESTRBT-2': {
          code: 'ESTRBT-2',
          name: 'Tarifa baja tensión con demanda (ESTRBT-2) CEB',
          description: 'Suministro en baja tensión con demanda en área de concesión de Bayahíbe (CEB).',
          currency: 'DOP',
          baseEnergyRateDOP: 14.1278,
          baseEnergyRateUSD: 0.235,
          fixedChargeDOP: 600.00,
          fixedChargeUSD: 10.00,
          demandChargePerKWDOP: 2342.83,
          demandChargePerKWUSD: 39.05,
          netMeteringRetentionPct: 25.0,
        },
        'RMT-1': {
          code: 'RMT-1',
          name: 'Tarifa media tensión con demanda (RMT-1)',
          description: 'Suministro en media tensión para complejos hoteleros y grandes usuarios en polo turístico.',
          currency: 'DOP',
          baseEnergyRateDOP: 12.85,
          baseEnergyRateUSD: 0.214,
          fixedChargeDOP: 1200.00,
          fixedChargeUSD: 20.00,
          demandChargePerKWDOP: 2150.00,
          demandChargePerKWUSD: 35.83,
          netMeteringRetentionPct: 25.0,
        },
        // Alias de retrocompatibilidad para proyectos legacy
        BTS1: {
          code: 'RBT-1',
          name: 'Tarifa baja tensión regular (RBT-1)',
          description: 'Tarifa baja tensión regular monómica para residencias y comercios.',
          currency: 'DOP',
          baseEnergyRateDOP: 22.90,
          baseEnergyRateUSD: 0.382,
          fixedChargeDOP: 250.00,
          netMeteringRetentionPct: 25.0,
        },
        BTS2: {
          code: 'RBT-1',
          name: 'Tarifa baja tensión regular (RBT-1)',
          description: 'Tarifa baja tensión regular monómica para comercios y servicios.',
          currency: 'DOP',
          baseEnergyRateDOP: 22.90,
          baseEnergyRateUSD: 0.382,
          fixedChargeDOP: 350.00,
          netMeteringRetentionPct: 25.0,
        },
        BTD: {
          code: 'RBT-2',
          name: 'Tarifa baja tensión con demanda (RBT-2)',
          description: 'Tarifa baja tensión con medición de demanda máxima de potencia.',
          currency: 'DOP',
          baseEnergyRateDOP: 14.1278,
          baseEnergyRateUSD: 0.235,
          fixedChargeDOP: 600.00,
          demandChargePerKWDOP: 2342.83,
          netMeteringRetentionPct: 25.0,
        },
      },
    },
  },
};

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

  // Si no existe la tarifa exacta, buscar por clave directa o alias
  let tariff: UtilityTariffDetails | undefined = sched.tariffs[tariffCode];

  if (!tariff) {
    // Si estamos en CEPM y vino código BTS1/BTS2
    if (distKey === 'CEPM') {
      tariff = sched.tariffs['RBT-1'] || sched.tariffs.BTS1;
    } else {
      tariff = sched.tariffs.BTS2 || sched.tariffs.BTS1;
    }
  }

  if (!tariff) return 0.20;

  if (tariff.currency === 'USD' && tariff.baseEnergyRateUSD) {
    return Math.round(tariff.baseEnergyRateUSD * 1000) / 1000;
  }

  // Si tiene bloques escalonados (ej. BTS1) y se provee consumo mensual
  if (tariff.blocks && tariff.blocks.length > 0 && monthlyKWh > 0) {
    let remaining = monthlyKWh;
    let totalDOP = 0;

    for (const block of tariff.blocks) {
      if (remaining <= 0) break;
      const blockSize = block.maxKWh - block.minKWh;
      const consumedInBlock = Math.min(remaining, blockSize);
      totalDOP += consumedInBlock * block.rateDOP;
      remaining -= consumedInBlock;
    }

    const effectiveDOPPerKWh = totalDOP / monthlyKWh;
    const rateUSD = effectiveDOPPerKWh / (usdExchangeRate > 0 ? usdExchangeRate : 60.0);
    return Math.round(rateUSD * 1000) / 1000;
  }

  // Tarifa monómica plana (ej. RBT-1 en CEPM = 22.90 DOP)
  const rateDOP = tariff.baseEnergyRateDOP || 12.0;
  const rateUSD = rateDOP / (usdExchangeRate > 0 ? usdExchangeRate : 60.0);
  return Math.round(rateUSD * 1000) / 1000;
}
