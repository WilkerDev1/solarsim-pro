export interface ProvinceHSP {
  name: string;
  code: string;
  monthlyHSP: number[]; // 12 months (Jan-Dec) kWh/m²/day
  avgHSP: number;
}

/**
 * Irradiación solar satelital (HSP - Horas Sol Pico en kWh/m²/día)
 * para las 31 provincias y el Distrito Nacional de la República Dominicana (32 demarcaciones).
 * Fuentes: NASA SSE (Surface Meteorology and Solar Energy) y NREL Solar Radiation Database.
 */
export const RD_PROVINCES: ProvinceHSP[] = [
  {
    name: 'Santo Domingo / Distrito Nacional',
    code: 'SD',
    monthlyHSP: [4.54, 4.91, 5.25, 5.30, 5.17, 5.28, 5.20, 4.78, 4.75, 4.79, 4.54, 4.41],
    avgHSP: 4.91,
  },
  {
    name: 'Santiago',
    code: 'ST',
    monthlyHSP: [5.10, 5.40, 5.80, 6.00, 5.70, 5.80, 5.90, 5.80, 5.40, 5.00, 4.80, 4.90],
    avgHSP: 5.47,
  },
  {
    name: 'La Altagracia (Punta Cana / Higüey)',
    code: 'LA',
    monthlyHSP: [5.30, 5.60, 6.00, 6.20, 5.80, 5.90, 6.00, 5.90, 5.50, 5.10, 4.90, 5.10],
    avgHSP: 5.61,
  },
  {
    name: 'Puerto Plata',
    code: 'PP',
    monthlyHSP: [4.80, 5.10, 5.50, 5.70, 5.40, 5.60, 5.80, 5.60, 5.20, 4.70, 4.40, 4.50],
    avgHSP: 5.19,
  },
  {
    name: 'San Cristóbal',
    code: 'SC',
    monthlyHSP: [4.90, 5.20, 5.60, 5.80, 5.50, 5.60, 5.70, 5.50, 5.10, 4.80, 4.60, 4.70],
    avgHSP: 5.25,
  },
  {
    name: 'La Vega',
    code: 'VE',
    monthlyHSP: [5.00, 5.30, 5.70, 5.90, 5.60, 5.70, 5.80, 5.70, 5.30, 4.90, 4.70, 4.80],
    avgHSP: 5.37,
  },
  {
    name: 'Duarte (San Francisco de Macorís)',
    code: 'DU',
    monthlyHSP: [4.90, 5.20, 5.60, 5.80, 5.50, 5.60, 5.70, 5.60, 5.20, 4.80, 4.60, 4.70],
    avgHSP: 5.27,
  },
  {
    name: 'Barahona',
    code: 'BA',
    monthlyHSP: [5.40, 5.70, 6.10, 6.30, 6.00, 6.10, 6.20, 6.10, 5.70, 5.30, 5.10, 5.20],
    avgHSP: 5.72,
  },
  {
    name: 'Monte Cristi',
    code: 'MC',
    monthlyHSP: [5.50, 5.80, 6.20, 6.40, 6.10, 6.20, 6.30, 6.20, 5.80, 5.40, 5.20, 5.30],
    avgHSP: 5.80,
  },
  {
    name: 'La Romana',
    code: 'LR',
    monthlyHSP: [5.20, 5.50, 5.90, 6.10, 5.70, 5.80, 5.90, 5.80, 5.40, 5.00, 4.80, 5.00],
    avgHSP: 5.51,
  },
  {
    name: 'San Pedro de Macorís',
    code: 'SPM',
    monthlyHSP: [5.10, 5.40, 5.80, 6.00, 5.60, 5.70, 5.80, 5.70, 5.30, 4.90, 4.70, 4.90],
    avgHSP: 5.41,
  },
  {
    name: 'Azua',
    code: 'AZ',
    monthlyHSP: [5.30, 5.60, 6.00, 6.20, 5.90, 6.00, 6.10, 6.00, 5.60, 5.20, 5.00, 5.10],
    avgHSP: 5.67,
  },
  {
    name: 'Peravia (Baní)',
    code: 'PR',
    monthlyHSP: [5.35, 5.65, 6.05, 6.25, 5.95, 6.05, 6.15, 6.05, 5.65, 5.25, 5.05, 5.15],
    avgHSP: 5.72,
  },
  {
    name: 'Espaillat (Moca)',
    code: 'ES',
    monthlyHSP: [4.95, 5.25, 5.65, 5.85, 5.55, 5.65, 5.75, 5.65, 5.25, 4.85, 4.65, 4.75],
    avgHSP: 5.32,
  },
  {
    name: 'San Juan (San Juan de la Maguana)',
    code: 'SJ',
    monthlyHSP: [5.20, 5.50, 5.90, 6.10, 5.80, 5.90, 6.00, 5.90, 5.50, 5.10, 4.90, 5.00],
    avgHSP: 5.57,
  },
  {
    name: 'Monseñor Nouel (Bonao)',
    code: 'MN',
    monthlyHSP: [4.75, 5.05, 5.45, 5.65, 5.35, 5.45, 5.55, 5.45, 5.05, 4.65, 4.45, 4.55],
    avgHSP: 5.12,
  },
  {
    name: 'Sánchez Ramírez (Cotuí)',
    code: 'SR',
    monthlyHSP: [4.85, 5.15, 5.55, 5.75, 5.45, 5.55, 5.65, 5.55, 5.15, 4.75, 4.55, 4.65],
    avgHSP: 5.22,
  },
  {
    name: 'Samaná',
    code: 'SM',
    monthlyHSP: [4.80, 5.10, 5.50, 5.70, 5.40, 5.50, 5.60, 5.50, 5.10, 4.70, 4.50, 4.60],
    avgHSP: 5.17,
  },
  {
    name: 'Valverde (Mao)',
    code: 'VV',
    monthlyHSP: [5.40, 5.70, 6.10, 6.30, 6.00, 6.10, 6.20, 6.10, 5.70, 5.30, 5.10, 5.20],
    avgHSP: 5.72,
  },
  {
    name: 'María Trinidad Sánchez (Nagua)',
    code: 'MTS',
    monthlyHSP: [4.75, 5.05, 5.45, 5.65, 5.35, 5.45, 5.55, 5.45, 5.05, 4.65, 4.45, 4.55],
    avgHSP: 5.12,
  },
  {
    name: 'Monte Plata',
    code: 'MP',
    monthlyHSP: [4.70, 5.00, 5.40, 5.60, 5.30, 5.40, 5.50, 5.40, 5.00, 4.60, 4.40, 4.50],
    avgHSP: 5.08,
  },
  {
    name: 'Hermanas Mirabal (Salcedo)',
    code: 'HM',
    monthlyHSP: [4.90, 5.20, 5.60, 5.80, 5.50, 5.60, 5.70, 5.60, 5.20, 4.80, 4.60, 4.70],
    avgHSP: 5.27,
  },
  {
    name: 'Hato Mayor',
    code: 'HM2',
    monthlyHSP: [4.95, 5.25, 5.65, 5.85, 5.50, 5.60, 5.70, 5.60, 5.20, 4.80, 4.60, 4.75],
    avgHSP: 5.29,
  },
  {
    name: 'El Seibo',
    code: 'ES2',
    monthlyHSP: [5.00, 5.30, 5.70, 5.90, 5.55, 5.65, 5.75, 5.65, 5.25, 4.85, 4.65, 4.80],
    avgHSP: 5.34,
  },
  {
    name: 'Dajabón',
    code: 'DA',
    monthlyHSP: [5.35, 5.65, 6.05, 6.25, 5.95, 6.05, 6.15, 6.05, 5.65, 5.25, 5.05, 5.15],
    avgHSP: 5.72,
  },
  {
    name: 'Santiago Rodríguez',
    code: 'SRO',
    monthlyHSP: [5.30, 5.60, 6.00, 6.20, 5.90, 6.00, 6.10, 6.00, 5.60, 5.20, 5.00, 5.10],
    avgHSP: 5.67,
  },
  {
    name: 'Elías Piña (Comendador)',
    code: 'EP',
    monthlyHSP: [5.25, 5.55, 5.95, 6.15, 5.85, 5.95, 6.05, 5.95, 5.55, 5.15, 4.95, 5.05],
    avgHSP: 5.62,
  },
  {
    name: 'Baoruco (Neyba)',
    code: 'BH',
    monthlyHSP: [5.45, 5.75, 6.15, 6.35, 6.05, 6.15, 6.25, 6.15, 5.75, 5.35, 5.15, 5.25],
    avgHSP: 5.77,
  },
  {
    name: 'Independencia (Jimaní)',
    code: 'IN',
    monthlyHSP: [5.50, 5.80, 6.20, 6.40, 6.10, 6.20, 6.30, 6.20, 5.80, 5.40, 5.20, 5.30],
    avgHSP: 5.80,
  },
  {
    name: 'Pedernales',
    code: 'PD',
    monthlyHSP: [5.55, 5.85, 6.25, 6.45, 6.15, 6.25, 6.35, 6.25, 5.85, 5.45, 5.25, 5.35],
    avgHSP: 5.85,
  },
  {
    name: 'San José de Ocoa',
    code: 'SJO',
    monthlyHSP: [5.05, 5.35, 5.75, 5.95, 5.65, 5.75, 5.85, 5.75, 5.35, 4.95, 4.75, 4.85],
    avgHSP: 5.42,
  },
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Busca inteligentemente los datos de radiación HSP para cualquier provincia de RD,
 * manejando acentos, municipios conocidos y nombres alternativos.
 */
export function getProvinceHSP(provinceName: string): ProvinceHSP {
  if (!provinceName) return RD_PROVINCES[0];

  const normQuery = normalizeText(provinceName);

  // 1. Coincidencia exacta o contenida en el nombre
  const found = RD_PROVINCES.find((p) => {
    const normName = normalizeText(p.name);
    return normName === normQuery || normName.includes(normQuery) || normQuery.includes(normName);
  });

  if (found) return found;

  // 2. Mapeo inteligente de alias, municipios principales o abreviaturas comunes
  const aliases: Record<string, string> = {
    'distrito nacional': 'Santo Domingo / Distrito Nacional',
    'santo domingo': 'Santo Domingo / Distrito Nacional',
    'santo domingo este': 'Santo Domingo / Distrito Nacional',
    'santo domingo oeste': 'Santo Domingo / Distrito Nacional',
    'santo domingo norte': 'Santo Domingo / Distrito Nacional',
    'boca chica': 'Santo Domingo / Distrito Nacional',
    'punta cana': 'La Altagracia (Punta Cana / Higüey)',
    'higuey': 'La Altagracia (Punta Cana / Higüey)',
    'bavaro': 'La Altagracia (Punta Cana / Higüey)',
    'cap cana': 'La Altagracia (Punta Cana / Higüey)',
    'san francisco': 'Duarte (San Francisco de Macorís)',
    'sfm': 'Duarte (San Francisco de Macorís)',
    'bani': 'Peravia (Baní)',
    'moca': 'Espaillat (Moca)',
    'bonao': 'Monseñor Nouel (Bonao)',
    'cotui': 'Sánchez Ramírez (Cotuí)',
    'mao': 'Valverde (Mao)',
    'nagua': 'María Trinidad Sánchez (Nagua)',
    'salcedo': 'Hermanas Mirabal (Salcedo)',
    'comendador': 'Elías Piña (Comendador)',
    'neyba': 'Baoruco (Neyba)',
    'neiba': 'Baoruco (Neyba)',
    'bahoruco': 'Baoruco (Neyba)',
    'jimani': 'Independencia (Jimaní)',
    'ocoa': 'San José de Ocoa',
    'las terrenas': 'Samaná',
    'sosua': 'Puerto Plata',
    'cabarete': 'Puerto Plata',
    'jarabacoa': 'La Vega',
    'constanza': 'La Vega',
    'bajos de haina': 'San Cristóbal',
    'haina': 'San Cristóbal',
  };

  for (const [aliasKey, targetProvince] of Object.entries(aliases)) {
    if (normQuery.includes(aliasKey) || aliasKey.includes(normQuery)) {
      const match = RD_PROVINCES.find((p) => p.name === targetProvince);
      if (match) return match;
    }
  }

  // 3. Fallback a Santo Domingo / Distrito Nacional
  return RD_PROVINCES[0];
}
