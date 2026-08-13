export interface PDFColorTheme {
  id: string;
  name: string;
  primary: string;       // Header & Table headers background
  secondary: string;     // Sub-banner background
  accent: string;        // Text highlights
  accentDark: string;    // Dark accent text
  accentLightBg: string; // Highlight cards background
  accentBorder: string;  // Highlight border
  barColor: string;      // Production chart bar color
}

export const PDF_COLOR_THEMES: PDFColorTheme[] = [
  {
    id: 'emerald',
    name: 'Verde Esmeralda (Clásico)',
    primary: '#14532d',
    secondary: '#1e6a3b',
    accent: '#16a34a',
    accentDark: '#14532d',
    accentLightBg: 'bg-emerald-50/80',
    accentBorder: 'border-emerald-200',
    barColor: '#22c55e',
  },
  {
    id: 'navy',
    name: 'Azul Marino Corporativo',
    primary: '#1e3a8a',
    secondary: '#1d4ed8',
    accent: '#2563eb',
    accentDark: '#1e3a8a',
    accentLightBg: 'bg-blue-50/80',
    accentBorder: 'border-blue-200',
    barColor: '#3b82f6',
  },
  {
    id: 'slate',
    name: 'Gris Grafito Platinum',
    primary: '#0f172a',
    secondary: '#334155',
    accent: '#475569',
    accentDark: '#0f172a',
    accentLightBg: 'bg-slate-100/80',
    accentBorder: 'border-slate-300',
    barColor: '#64748b',
  },
  {
    id: 'amber',
    name: 'Ámbar Bronce Solar',
    primary: '#78350f',
    secondary: '#92400e',
    accent: '#d97706',
    accentDark: '#78350f',
    accentLightBg: 'bg-amber-50/80',
    accentBorder: 'border-amber-200',
    barColor: '#f59e0b',
  },
  {
    id: 'indigo',
    name: 'Índigo Moderno',
    primary: '#312e81',
    secondary: '#3730a3',
    accent: '#4f46e5',
    accentDark: '#312e81',
    accentLightBg: 'bg-indigo-50/80',
    accentBorder: 'border-indigo-200',
    barColor: '#6366f1',
  },
];
