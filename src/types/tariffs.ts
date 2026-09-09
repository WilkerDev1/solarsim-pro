export type UtilityDistributor = 'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM';

export type TariffCode =
  | 'BTS1'
  | 'BTS2'
  | 'BTD'
  | 'BTH'
  | 'MTD1'
  | 'MTD2'
  | 'MTH'
  | 'VMT1'
  | 'VMT2'
  | 'VMT3'
  | 'RBT-1'
  | 'RBT-2'
  | 'ESTRBT-2'
  | 'RMT-1'
  | 'RMT-2'
  | string;

export interface TariffBlock {
  minKWh: number;
  maxKWh: number; // e.g. 200, 300, 700, Infinity
  rateDOP: number; // e.g. 6.17, 8.71, 13.04
}

export interface UtilityTariffDetails {
  code: TariffCode;
  name: string;
  description: string;
  currency: 'DOP' | 'USD';
  // Monomic energy rate (for flat rate tariffs like BTS2 or weighted averages)
  baseEnergyRateDOP: number;
  baseEnergyRateUSD?: number;
  // Tiered blocks (primarily for BTS1 residential)
  blocks?: TariffBlock[];
  // Fixed monthly customer charge
  fixedChargeDOP: number;
  fixedChargeUSD?: number;
  // Power demand charges (for BTD, MTD1, MTD2, RBT-2, ESTRBT-2)
  demandChargePerKWDOP?: number;
  demandChargePerKWUSD?: number;
  // Time-of-use rates (for MTD2, BTH)
  peakEnergyRateDOP?: number;
  offPeakEnergyRateDOP?: number;
  // Network export retention (Medición Neta SIE-007)
  netMeteringRetentionPct: number; // Default 25%
}

export interface DistributorTariffSchedule {
  distributor: UtilityDistributor;
  fullName: string;
  region: string;
  concessionType: 'INTERCONECTADO_SENI' | 'AISLADO_PRIVADO';
  tariffs: Record<string, UtilityTariffDetails>;
}

export interface GlobalTariffMatrix {
  resolutionCode: string; // e.g. 'SIE-176-2025-TF'
  effectiveDate: string; // ISO date '2026-01-01'
  lastUpdatedAt: string;
  publishedBy: string; // e.g. 'Superintendencia de Electricidad (SIE) & CEPM'
  notes?: string;
  schedules: Record<UtilityDistributor, DistributorTariffSchedule>;
}

/**
 * Retorna las opciones de tarifas disponibles según la distribuidora seleccionada.
 * - Para CEPM: RBT-1, RBT-2, ESTRBT-2, RMT-1
 * - Para EDEs (EDEESTE, EDESUR, EDENORTE): BTS1, BTS2, BTD, BTH, MTD1, MTD2, MTH
 */
export function getDistributorTariffOptions(distributor: UtilityDistributor | string): {
  value: string;
  label: string;
  description: string;
}[] {
  if (distributor === 'CEPM') {
    return [
      {
        value: 'RBT-1',
        label: 'RBT-1 — Baja Tensión Regular (RD$ 22.90/kWh)',
        description: 'Tarifa monómica regular para residencias y comercios pequeños sin medición de potencia.',
      },
      {
        value: 'RBT-2',
        label: 'RBT-2 — Baja Tensión con Demanda (RD$ 14.1278/kWh + RD$ 2,342.83/kW)',
        description: 'Suministro en baja tensión con medición de demanda máxima de potencia para plazas y comercios en zona CEPM.',
      },
      {
        value: 'ESTRBT-2',
        label: 'ESTRBT-2 — Baja Tensión con Demanda CEB Bayahíbe (RD$ 14.1278/kWh)',
        description: 'Suministro en baja tensión con demanda en la concesión de Bayahíbe (CEB).',
      },
      {
        value: 'RMT-1',
        label: 'RMT-1 — Media Tensión con Demanda Hotelero',
        description: 'Suministro en media tensión para complejos hoteleros y grandes usuarios.',
      },
    ];
  }

  return [
    {
      value: 'BTS1',
      label: 'BTS1 — Residencial Monómica Escalonada (<10kW)',
      description: 'Tarifa residencial en baja tensión con bloques escalonados de consumo (0-200, 201-300, 301-700, >700 kWh).',
    },
    {
      value: 'BTS2',
      label: 'BTS2 — Comercial Simple Monómica (<10kW)',
      description: 'Tarifa comercial pequeña y servicios en baja tensión sin medición de potencia.',
    },
    {
      value: 'BTD',
      label: 'BTD — Baja Tensión con Demanda (>10kW)',
      description: 'Suministro en baja tensión con medición de demanda máxima de potencia.',
    },
    {
      value: 'BTH',
      label: 'BTH — Baja Tensión con Demanda Horaria',
      description: 'Tarifa horaria diferenciada entre horas punta y fuera de punta en baja tensión.',
    },
    {
      value: 'MTD1',
      label: 'MTD1 — Media Tensión con Demanda Simple',
      description: 'Suministro en media tensión (12.47kV a 34.5kV) con cargo por capacidad.',
    },
    {
      value: 'MTD2',
      label: 'MTD2 — Media Tensión con Demanda Horaria',
      description: 'Media tensión con tarifas diferenciadas por horario.',
    },
    {
      value: 'MTH',
      label: 'MTH — Media Tensión Horaria Industrial',
      description: 'Suministro en media tensión horaria con cargos punta/fuera de punta.',
    },
  ];
}

/**
 * Retorna el nombre formateado y entendible de una tarifa según la distribuidora
 */
export function getTariffDisplayName(distributor: UtilityDistributor | string, tariffCode: string): string {
  const code = (tariffCode || '').toUpperCase().trim();

  if (distributor === 'CEPM') {
    if (code === 'RBT-1' || code === 'BTS1' || code === 'BTS2') return 'RBT-1 (Baja Tensión Regular)';
    if (code === 'RBT-2' || code === 'BTD') return 'RBT-2 (Baja Tensión con Demanda)';
    if (code === 'ESTRBT-2') return 'ESTRBT-2 (Demanda Bayahíbe)';
    if (code === 'RMT-1' || code === 'MTD1' || code === 'MTD2') return 'RMT-1 (Media Tensión con Demanda)';
    return code;
  }

  // EDEs
  if (code === 'BTS1') return 'BTS1 (Residencial Monómica)';
  if (code === 'BTS2') return 'BTS2 (Comercial Simple)';
  if (code === 'BTD') return 'BTD (Baja Tensión con Demanda)';
  if (code === 'BTH') return 'BTH (Baja Tensión Horaria)';
  if (code === 'MTD1') return 'MTD1 (Media Tensión con Demanda)';
  if (code === 'MTD2') return 'MTD2 (Media Tensión Demanda Horaria)';
  if (code === 'MTH') return 'MTH (Media Tensión Horaria)';

  // Si tiene código CEPM en una EDE por migración
  if (code === 'RBT-1') return 'BTS1 (Residencial Monómica)';
  if (code === 'RBT-2') return 'BTD (Baja Tensión con Demanda)';

  return code || 'BTS2';
}

/**
 * Mapea inteligentemente el código de tarifa al cambiar de distribuidora
 */
export function mapTariffCodeOnDistributorChange(
  oldDistributor: UtilityDistributor | string,
  newDistributor: UtilityDistributor | string,
  currentCode: string
): string {
  if (oldDistributor === newDistributor) return currentCode;

  // De EDE a CEPM
  if (newDistributor === 'CEPM') {
    if (currentCode === 'BTS1' || currentCode === 'BTS2') return 'RBT-1';
    if (currentCode === 'BTD' || currentCode === 'BTH') return 'RBT-2';
    if (currentCode.startsWith('MT') || currentCode.startsWith('VM')) return 'RMT-1';
    return 'RBT-1';
  }

  // De CEPM a EDE
  if (oldDistributor === 'CEPM') {
    if (currentCode === 'RBT-1') return 'BTS2'; // o BTS1
    if (currentCode === 'RBT-2' || currentCode === 'ESTRBT-2') return 'BTD';
    if (currentCode.startsWith('RMT')) return 'MTD1';
    return 'BTS2';
  }

  return currentCode;
}
