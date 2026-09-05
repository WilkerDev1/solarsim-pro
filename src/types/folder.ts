export interface ProjectFolder {
  id: string;
  name: string;
  color?: string; // Hex or tailwind color
  description?: string;
  hideFromGeneral?: boolean; // Si es true, las propuestas asignadas se ocultan del menú principal/proyectos generales y solo aparecen en esta carpeta
  createdAt: string;
  createdBy?: string;
  icon?: string;
}
