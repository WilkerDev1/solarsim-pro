export interface ProjectFolder {
  id: string;
  name: string;
  color?: string; // Hex or tailwind color
  description?: string;
  createdAt: string;
  createdBy?: string;
  icon?: string;
}
