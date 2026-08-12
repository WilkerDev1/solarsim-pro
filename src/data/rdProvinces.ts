export interface ProvinceHSP {
  name: string;
  code: string;
  monthlyHSP: number[]; // 12 months (Jan-Dec) kWh/m²/day
  avgHSP: number;
}

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
    monthlyHSP: [5.1, 5.4, 5.8, 6.0, 5.7, 5.8, 5.9, 5.8, 5.4, 5.0, 4.8, 4.9],
    avgHSP: 5.47,
  },
  {
    name: 'La Altagracia (Punta Cana / Higüey)',
    code: 'LA',
    monthlyHSP: [5.3, 5.6, 6.0, 6.2, 5.8, 5.9, 6.0, 5.9, 5.5, 5.1, 4.9, 5.1],
    avgHSP: 5.61,
  },
  {
    name: 'Puerto Plata',
    code: 'PP',
    monthlyHSP: [4.8, 5.1, 5.5, 5.7, 5.4, 5.6, 5.8, 5.6, 5.2, 4.7, 4.4, 4.5],
    avgHSP: 5.19,
  },
  {
    name: 'San Cristóbal',
    code: 'SC',
    monthlyHSP: [4.9, 5.2, 5.6, 5.8, 5.5, 5.6, 5.7, 5.5, 5.1, 4.8, 4.6, 4.7],
    avgHSP: 5.25,
  },
  {
    name: 'La Vega',
    code: 'VE',
    monthlyHSP: [5.0, 5.3, 5.7, 5.9, 5.6, 5.7, 5.8, 5.7, 5.3, 4.9, 4.7, 4.8],
    avgHSP: 5.37,
  },
  {
    name: 'Duarte (San Francisco de Macorís)',
    code: 'DU',
    monthlyHSP: [4.9, 5.2, 5.6, 5.8, 5.5, 5.6, 5.7, 5.6, 5.2, 4.8, 4.6, 4.7],
    avgHSP: 5.27,
  },
  {
    name: 'Barahona',
    code: 'BA',
    monthlyHSP: [5.4, 5.7, 6.1, 6.3, 6.0, 6.1, 6.2, 6.1, 5.7, 5.3, 5.1, 5.2],
    avgHSP: 5.72,
  },
  {
    name: 'Monte Cristi',
    code: 'MC',
    monthlyHSP: [5.5, 5.8, 6.2, 6.4, 6.1, 6.2, 6.3, 6.2, 5.8, 5.4, 5.2, 5.3],
    avgHSP: 5.80,
  },
  {
    name: 'La Romana',
    code: 'LR',
    monthlyHSP: [5.2, 5.5, 5.9, 6.1, 5.7, 5.8, 5.9, 5.8, 5.4, 5.0, 4.8, 5.0],
    avgHSP: 5.51,
  },
  {
    name: 'San Pedro de Macorís',
    code: 'SPM',
    monthlyHSP: [5.1, 5.4, 5.8, 6.0, 5.6, 5.7, 5.8, 5.7, 5.3, 4.9, 4.7, 4.9],
    avgHSP: 5.41,
  },
  {
    name: 'Azua',
    code: 'AZ',
    monthlyHSP: [5.3, 5.6, 6.0, 6.2, 5.9, 6.0, 6.1, 6.0, 5.6, 5.2, 5.0, 5.1],
    avgHSP: 5.67,
  },
];

export function getProvinceHSP(provinceName: string): ProvinceHSP {
  const found = RD_PROVINCES.find(
    (p) => p.name.toLowerCase().includes(provinceName.toLowerCase()) || p.code.toLowerCase() === provinceName.toLowerCase()
  );
  return found || RD_PROVINCES[0]; // Default Santo Domingo
}
