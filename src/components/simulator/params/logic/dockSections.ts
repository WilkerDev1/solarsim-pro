/** Estado puro del dock de parámetros: secciones abiertas, persistencia por usuario y contadores. */

export const DOCK_SECTION_KEYS = ['client', 'rates', 'equipment', 'costs', 'financials'] as const;
export type DockSectionKey = (typeof DOCK_SECTION_KEYS)[number];
export type OpenSections = Record<DockSectionKey, boolean>;

export type DockStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const allSections = (open: boolean): OpenSections => ({
  client: open, rates: open, equipment: open, costs: open, financials: open,
});

export const dockStorageKey = (userId?: string | null): string => `solarsim.paramDock.open.${userId || 'anon'}`;

export const toggleSection = (state: OpenSections, key: DockSectionKey): OpenSections => ({ ...state, [key]: !state[key] });

export const anySectionOpen = (state: OpenSections): boolean => DOCK_SECTION_KEYS.some((k) => state[k]);

const defaultStorage = (): DockStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** Lee las secciones abiertas; ante cualquier fallo o dato inválido devuelve todo cerrado. */
export const loadOpenSections = (userId?: string | null, storage: DockStorage | null = defaultStorage()): OpenSections => {
  const result = allSections(false);
  try {
    const raw = storage?.getItem(dockStorageKey(userId));
    if (!raw) return result;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
    for (const key of DOCK_SECTION_KEYS) {
      if ((parsed as Record<string, unknown>)[key] === true) result[key] = true;
    }
  } catch {
    return allSections(false);
  }
  return result;
};

/** Guarda las secciones abiertas; devuelve false si el almacenamiento falla (la UI sigue funcionando). */
export const saveOpenSections = (state: OpenSections, userId?: string | null, storage: DockStorage | null = defaultStorage()): boolean => {
  try {
    if (!storage) return false;
    storage.setItem(dockStorageKey(userId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
};

export interface FinancialsBadge {
  items: number;
  discounts: number;
  label: string;
}

/** Contadores de Finanzas: ítems personalizados y descuentos. */
export const financialsBadge = (financials: { customItems?: unknown[]; customDiscounts?: unknown[] }): FinancialsBadge => {
  const items = financials.customItems?.length ?? 0;
  const discounts = financials.customDiscounts?.length ?? 0;
  const parts: string[] = [];
  if (items > 0) parts.push(`${items} ${items === 1 ? 'ítem personalizado' : 'ítems personalizados'}`);
  if (discounts > 0) parts.push(`${discounts} ${discounts === 1 ? 'descuento' : 'descuentos'}`);
  return { items, discounts, label: parts.join(', ') };
};
