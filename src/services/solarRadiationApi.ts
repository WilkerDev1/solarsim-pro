/**
 * Service to fetch historical monthly solar radiation (HSP - Peak Sun Hours / kWh/m²/day)
 * for specific coordinates (Lat, Lng) using Open-Meteo & NASA POWER Solar APIs.
 */

export interface SolarIrradiationFetchResult {
  success: boolean;
  latitude: number;
  longitude: number;
  monthlyHSP: number[]; // 12 values (Jan-Dec) in kWh/m²/day
  avgHSP: number;
  source: string;
  error?: string;
}

export async function fetchSolarRadiationByCoordinates(
  lat: number,
  lng: number
): Promise<SolarIrradiationFetchResult> {
  try {
    // Open-Meteo Historical Solar Radiation endpoint for full 12 months
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=2023-01-01&end_date=2023-12-31&daily=shortwave_radiation_sum&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en API solar (${res.status})`);
    }

    const data = await res.json();
    if (!data.daily || !data.daily.time || !data.daily.shortwave_radiation_sum) {
      throw new Error('Formato de datos no reconocido');
    }

    const times: string[] = data.daily.time; // YYYY-MM-DD
    const radSum: number[] = data.daily.shortwave_radiation_sum; // MJ/m²

    // Group radiation sums by month index (0 to 11)
    const monthSums = Array(12).fill(0);
    const monthCounts = Array(12).fill(0);

    for (let i = 0; i < times.length; i++) {
      const monthIndex = parseInt(times[i].split('-')[1], 10) - 1;
      const valMJ = radSum[i];
      if (valMJ !== null && !isNaN(valMJ)) {
        // Convert MJ/m² to kWh/m²/day (1 MJ/m² = 0.277778 kWh/m²)
        const valKWh = valMJ * 0.277778;
        monthSums[monthIndex] += valKWh;
        monthCounts[monthIndex] += 1;
      }
    }

    const monthlyHSP = monthSums.map((sum, idx) => {
      const count = monthCounts[idx] || 1;
      return Math.round((sum / count) * 100) / 100;
    });

    const avgHSP = Math.round((monthlyHSP.reduce((a, b) => a + b, 0) / 12) * 100) / 100;

    return {
      success: true,
      latitude: lat,
      longitude: lng,
      monthlyHSP,
      avgHSP,
      source: 'Open-Meteo Solar API',
    };
  } catch (err: any) {
    return {
      success: false,
      latitude: lat,
      longitude: lng,
      monthlyHSP: [],
      avgHSP: 0,
      source: 'Open-Meteo Solar API',
      error: err.message || 'No se pudo conectar a la API solar',
    };
  }
}
