// Tamaños de la ventana principal. Sin dependencias de Electron para poder probarlos.
//
// El mínimo cabe en media pantalla desde 1280 px de ancho y en un cuadrante de 1080p: así Windows Snap
// (Win+←/→/↑/↓, Snap Layouts) y el tiling de GNOME/KDE (Super+←/→) pueden acoplar la app junto a otra ventana.
export const MAIN_WINDOW_DEFAULT_SIZE = { width: 1440, height: 900 } as const;
export const MAIN_WINDOW_MIN_SIZE = { width: 640, height: 480 } as const;
