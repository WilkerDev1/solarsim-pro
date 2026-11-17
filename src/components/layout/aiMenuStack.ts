/**
 * Capa del dock. Ajustes es `fixed z-40` y se monta después que el dock (z-40): a igual z-index gana el
 * posterior y cubría el menú flotante de IA (`fixed left-[4.5rem]`, dentro del contexto de apilamiento del dock).
 * Con el menú abierto el dock sube por encima; cerrado conserva su capa habitual.
 */
export const aiMenuStackClass = (menuOpen: boolean): string => (menuOpen ? 'z-[60]' : 'z-40');
