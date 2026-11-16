/**
 * Utilidades para normalización, inferencia y comparación inteligente de Marcas
 * de Equipos Fotovoltaicos y Almacenamiento BESS (SolarSim Pro).
 */

// Marcas canónicas oficiales reconocidas en la industria fotovoltaica
export const KNOWN_SOLAR_BRANDS: Record<string, string> = {
  'canadiansolar': 'Canadian Solar',
  'canadian': 'Canadian Solar',
  'luxpower': 'LuxpowerTek',
  'luxpowertek': 'LuxpowerTek',
  'lux': 'LuxpowerTek',
  'hinaess': 'HinaESS',
  'hina': 'HinaESS',
  'weco': 'WeCo',
  'we-co': 'WeCo',
  'solis': 'Solis',
  'huawei': 'Huawei',
  'jasolar': 'JA Solar',
  'ja': 'JA Solar',
  'trina': 'Trina Solar',
  'trinasolar': 'Trina Solar',
  'jinko': 'Jinko Solar',
  'jinkosolar': 'Jinko Solar',
  'longi': 'LONGi Solar',
  'longisolar': 'LONGi Solar',
  'deye': 'Deye',
  'growatt': 'Growatt',
  'sungrow': 'Sungrow',
  'victron': 'Victron Energy',
  'victronenergy': 'Victron Energy',
  'fronius': 'Fronius',
  'sma': 'SMA',
  'dyness': 'Dyness',
  'pylontech': 'Pylontech',
  'felicity': 'Felicity Solar',
  'felicitysolar': 'Felicity Solar',
  'byd': 'BYD',
  'ionenergy': 'Ion Energy',
  'ion': 'Ion Energy',
  'enphase': 'Enphase',
  'hoymiles': 'Hoymiles',
  'goodwe': 'GoodWe',
  'solaredge': 'SolarEdge',
  'sol-ark': 'Sol-Ark',
  'solark': 'Sol-Ark',
};

/**
 * Normaliza un string de marca a su forma canónica si es conocida,
 * o limpia capitalización y espacios respetando el nombre original.
 */
export function normalizeBrandName(rawBrand?: string | null): string {
  if (!rawBrand) return '';
  const trimmed = rawBrand.trim();
  if (!trimmed || trimmed.toLowerCase() === 'fabricante' || trimmed.toLowerCase() === 'desconocido') {
    return '';
  }

  const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (KNOWN_SOLAR_BRANDS[key]) {
    return KNOWN_SOLAR_BRANDS[key];
  }

  // Capitalización de palabras para marcas no catalogadas previamente
  return trimmed
    .split(/\s+/)
    .map((word) => {
      // Preservar siglas en mayúsculas como BESS, SMA, BYD
      if (word.length <= 4 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Infiere la marca de un equipo a partir de su displayName y modelSeries
 */
export function inferBrandFromText(displayName = '', modelSeries = ''): string {
  const combined = `${displayName} ${modelSeries}`.toLowerCase();

  // Búsqueda por prioridades
  if (combined.includes('canadian solar') || combined.includes('canadian') || combined.includes('cs6.1') || combined.includes('topbiliku')) {
    return 'Canadian Solar';
  }
  if (combined.includes('luxpowertek') || combined.includes('luxpower') || combined.includes('lxp-lb') || combined.includes('lxp')) {
    return 'LuxpowerTek';
  }
  if (combined.includes('hinaess') || combined.includes('powergem') || combined.includes('hina')) {
    return 'HinaESS';
  }
  if (combined.includes('weco') || combined.includes('we-co') || combined.includes('16k0-lv')) {
    return 'WeCo';
  }
  if (combined.includes('solis') || combined.includes('ginlong')) {
    return 'Solis';
  }
  if (combined.includes('huawei') || combined.includes('sun2000')) {
    return 'Huawei';
  }
  if (combined.includes('ja solar') || combined.includes('jam72s') || combined.includes('jam60s')) {
    return 'JA Solar';
  }
  if (combined.includes('trina solar') || combined.includes('trina') || combined.includes('vertex')) {
    return 'Trina Solar';
  }
  if (combined.includes('jinko solar') || combined.includes('jinko') || combined.includes('tiger neo')) {
    return 'Jinko Solar';
  }
  if (combined.includes('longi') || combined.includes('hi-mo')) {
    return 'LONGi Solar';
  }
  if (combined.includes('deye')) {
    return 'Deye';
  }
  if (combined.includes('growatt') || combined.includes('min 5000') || combined.includes('sph')) {
    return 'Growatt';
  }
  if (combined.includes('sungrow')) {
    return 'Sungrow';
  }
  if (combined.includes('victron')) {
    return 'Victron Energy';
  }
  if (combined.includes('dyness') || combined.includes('powerbox')) {
    return 'Dyness';
  }
  if (combined.includes('pylontech') || combined.includes('us5000') || combined.includes('force')) {
    return 'Pylontech';
  }
  if (combined.includes('felicity') || combined.includes('felicitysolar')) {
    return 'Felicity Solar';
  }
  if (combined.includes('byd')) {
    return 'BYD';
  }
  if (combined.includes('ion energy') || combined.includes('ion-lv')) {
    return 'Ion Energy';
  }
  if (combined.includes('enphase') || combined.includes('iq7') || combined.includes('iq8')) {
    return 'Enphase';
  }
  if (combined.includes('sol-ark') || combined.includes('solark')) {
    return 'Sol-Ark';
  }

  // Si no coincide con marcas conocidas, intentar extraer la primera palabra significativa
  const cleanDisplay = displayName
    .replace(/^m[oó]dulos?\s+/i, '')
    .replace(/^inversor(?:es)?\s+/i, '')
    .replace(/^bater[íi]as?\s+/i, '')
    .trim();

  const firstWord = cleanDisplay.split(/\s+/)[0];
  if (firstWord && firstWord.length > 2 && !/^\d+/.test(firstWord)) {
    return normalizeBrandName(firstWord);
  }

  return 'General';
}

/**
 * Comprueba si dos nombres de marcas representan el mismo fabricante,
 * admitiendo alias, eliminación de espacios y normalización fonética.
 */
export function areBrandsMatching(brandA?: string | null, brandB?: string | null): boolean {
  if (!brandA || !brandB) return false;

  const cleanA = brandA.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanB = brandB.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;

  // Comprobación de alias canónicos
  const normA = KNOWN_SOLAR_BRANDS[cleanA] || cleanA;
  const normB = KNOWN_SOLAR_BRANDS[cleanB] || cleanB;
  if (normA.toLowerCase().replace(/[^a-z0-9]/g, '') === normB.toLowerCase().replace(/[^a-z0-9]/g, '')) {
    return true;
  }

  // Contención directa si tiene al menos 3 caracteres
  if (cleanA.length >= 3 && cleanB.length >= 3) {
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
      return true;
    }
  }

  return false;
}
