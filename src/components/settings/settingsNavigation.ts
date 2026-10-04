import { Building2, Database, Globe, Layers, SlidersHorizontal, Sparkles, Users, ToggleLeft } from 'lucide-react';

export const settingsSections = [
  { id: 'cuenta', label: 'Cuenta y perfiles', icon: Users, group: 'Personal' },
  { id: 'preferencias', label: 'Simulación', icon: SlidersHorizontal, group: 'Aplicación' },
  { id: 'funciones', label: 'Funciones de la aplicación', icon: ToggleLeft, group: 'Aplicación' },
  { id: 'catalogo', label: 'Catálogo de equipos', icon: Layers, group: 'Aplicación' },
  { id: 'integraciones', label: 'IA e integraciones', icon: Sparkles, group: 'Aplicación' },
  { id: 'cloudflare', label: 'Propuestas web', icon: Globe, group: 'Aplicación' },
  { id: 'organizacion', label: 'Organización y equipo', icon: Building2, group: 'Administración' },
  { id: 'respaldo', label: 'Respaldo y exportación', icon: Database, group: 'Administración' },
] as const;
export type SettingsSectionId = typeof settingsSections[number]['id'];
export function resolveSettingsSection(tab: string): SettingsSectionId {
  const aliases: Record<string, SettingsSectionId> = {
    ai: 'integraciones', sync: 'integraciones', share: 'cloudflare', equipment: 'catalogo', account: 'cuenta', features: 'funciones',
  };
  return aliases[tab] ?? settingsSections.find((section) => section.id === tab)?.id ?? 'cuenta';
}
