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

/** Valores de marca que no identifican a ningún fabricante («Fabricante», «Desconocido», «General»…). */
const GENERIC_BRANDS = new Set(['fabricante', 'desconocido', 'desconocida', 'general', 'generico', 'generica', 'na', 'nd', 'otro', 'otros', 'otra', 'varios', 'sinmarca', 'nomarca', 'unknown', 'generic']);
export function isGenericBrand(brand?: string | null): boolean {
  const key = (brand || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return !key || GENERIC_BRANDS.has(key);
}

/** Palabras descriptivas que encabezan nombres de equipos y nunca son una marca. */
const DESCRIPTOR_WORDS = new Set(['modulo', 'modulos', 'panel', 'paneles', 'inversor', 'inversores', 'microinversor', 'microinversores', 'bateria', 'baterias',
  'hibrido', 'hibrida', 'hibridos', 'trifasico', 'trifasica', 'monofasico', 'monofasica', 'bifasico', 'split', 'phase', 'fase', 'string', 'ongrid', 'offgrid',
  'on-grid', 'off-grid', 'solar', 'solares', 'litio', 'lithium', 'lifepo4', 'de', 'del', 'para', 'con', 'bifacial', 'mono', 'monocristalino', 'policristalino',
  'iron', 'phosphate', 'fosfato', 'hierro', 'lfp', 'ion', 'li-ion', 'liion', 'red', 'aislado', 'almacenamiento', 'sistema', 'kit', 'equipo', 'china', 'chino', 'generico', 'generica', 'nuevo', 'nueva', 'alta', 'baja', 'tension', 'voltaje']);

/**
 * Normaliza un string de marca a su forma canónica si es conocida,
 * o limpia capitalización y espacios respetando el nombre original.
 */
export function normalizeBrandName(rawBrand?: string | null): string {
  if (!rawBrand) return '';
  const trimmed = rawBrand.trim();
  if (!trimmed || isGenericBrand(trimmed)) {
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
  const word = (pattern: string) => new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`).test(combined);

  // Búsqueda por prioridades
  if (combined.includes('canadian solar') || combined.includes('canadian') || combined.includes('cs6.1') || combined.includes('topbiliku')) {
    return 'Canadian Solar';
  }
  if (combined.includes('luxpowertek') || combined.includes('luxpower') || combined.includes('lxp-lb') || word('lxp')) {
    return 'LuxpowerTek';
  }
  // «hina» como palabra: «China» no es HinaESS.
  if (combined.includes('hinaess') || combined.includes('powergem') || word('hina')) {
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
  if (combined.includes('growatt') || combined.includes('min 5000') || word('sph\\d*')) {
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
  if (combined.includes('pylontech') || combined.includes('us5000') || word('force(?:-?[hl]\\d+)?')) {
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
  if (combined.includes('fronius')) return 'Fronius';
  if (word('sma') || combined.includes('sunny boy') || combined.includes('sunny tripower')) return 'SMA';
  if (combined.includes('hoymiles')) return 'Hoymiles';
  if (combined.includes('goodwe')) return 'GoodWe';
  if (combined.includes('solaredge')) return 'SolarEdge';

  // Si no coincide con marcas conocidas, intentar extraer la primera palabra significativa
  // (sin descriptores como «Híbrido», «Microinversor» o «Trifásico», ni códigos con cifras).
  // Todos los filtros van dentro de la búsqueda: cifras y unidades («550W», «10kW») se saltan, no la detienen.
  const firstWord = displayName.trim().split(/\s+/).find((w) => {
    const key = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]/g, '');
    return key.length > 2 && !/\d/.test(key) && !DESCRIPTOR_WORDS.has(key) && !DESCRIPTOR_WORDS.has(key.replace(/-/g, '')) && !isGenericBrand(key);
  });
  if (firstWord) {
    return normalizeBrandName(firstWord.replace(/[^\p{L}\p{N}-]/gu, ''));
  }

  return 'General';
}

/** Palabras que acompañan a muchas marcas y no identifican a ninguna por sí solas. */
const BRAND_GENERIC_WORDS = new Set(['solar', 'energy', 'energia', 'power', 'tech', 'technology', 'group', 'new', 'electric', 'electrical', 'co', 'ltd', 'inc', 'sa', 'srl']);

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

  // Palabras completas, no subcadenas («Ion» no es «Orion», «Sol» no es «Solis»): una marca puede ser la otra sin
  // sus palabras genéricas («Canadian» ↔ «Canadian Solar», «Victron» ↔ «Victron Energy»), pero «Solar» sola no es ninguna.
  const brandWords = (raw: string, canonical: string) => new Set(`${raw} ${canonical}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !BRAND_GENERIC_WORDS.has(w)));
  const wordsA = brandWords(brandA, normA);
  const wordsB = brandWords(brandB, normB);
  const within = (a: Set<string>, b: Set<string>) => a.size > 0 && [...a].every((w) => b.has(w));
  return within(wordsA, wordsB) || within(wordsB, wordsA);
}
