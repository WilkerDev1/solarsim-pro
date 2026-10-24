import { commercialContent, commercialState } from '../../../shared/proposalCommercial';
import { migrateLegacySpecs } from '../../../shared/equipment';
import type { DiffFieldChange, ProjectSimulation } from '../../types';

/** JSON semantics: object order is immaterial; array order is significant. */
export function contentEqual(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
const sections = { client: 'Cliente', specs: 'Equipos', rates: 'Tarifas', financials: 'Finanzas', monthlyConsumption: 'Consumo mensual', customization: 'Documento', status: 'Estado', isDeleted: 'Papelera', folderId: 'Organización', clientId: 'Cliente vinculado', companyProfileId: 'Empresa emisora', commercial: 'Seguimiento comercial', proposalLink: 'Grupo de propuestas' };
const labels: Record<string, string> = {
  note: 'Nota comercial', ownerName: 'Responsable comercial', ownerId: 'Responsable (ID)',
  name: 'Nombre', address: 'Dirección', company: 'Empresa', projectId: 'Código de propuesta', province: 'Provincia', email: 'Correo electrónico', phone: 'Teléfono',
  hasBattery: 'Baterías', systemLosses: 'Pérdidas del sistema',
  energyCostPerKWh: 'Precio de energía', distributor: 'Distribuidora', tariffCode: 'Tarifa', currency: 'Moneda', exchangeRate: 'Tasa de cambio',
  annualConsumption: 'Consumo anual', applyLey5707: 'Incentivos Ley 57-07',
  customITBISSavedUSD: 'ITBIS exonerado personalizado (USD)', customLey5707CreditUSD: 'Crédito fiscal personalizado (USD)', customCostUSD: 'Inversión personalizada (USD)',
  applyITBISExemption: 'Exoneración ITBIS', monthlyConsumption: 'Consumo mensual', isDeleted: 'En papelera', status: 'Estado', folderId: 'Carpeta', clientId: 'Cliente vinculado', companyProfileId: 'Empresa emisora',
};
/** Campos de los grupos de equipos, por tipo: el cambio se nombra con el grupo («Cantidad de módulos · modelo 2»). */
const GROUP_LABELS: Record<string, [string, Record<string, string>]> = {
  panels: ['módulo', { count: 'Cantidad de módulos', powerW: 'Potencia del módulo (W)', brandModel: 'Modelo de módulo', unitPriceUSD: 'Precio del módulo (USD)' }],
  inverters: ['inversor', { count: 'Cantidad de inversores', powerKW: 'Potencia del inversor (kW)', brandModel: 'Modelo de inversor', unitPriceUSD: 'Precio del inversor (USD)' }],
  batteries: ['batería', { count: 'Cantidad de baterías', capacityKWh: 'Capacidad de baterías (kWh)', brandModel: 'Modelo de batería', unitPriceUSD: 'Precio de la batería (USD)', dodPct: 'DOD de la batería (%)', efficiencyPct: 'Eficiencia de la batería (%)' }],
};
function groupLabel(path: string[]): string | undefined {
  const [section, list, index, field] = path;
  const group = section === 'specs' ? GROUP_LABELS[list] : undefined;
  if (!group || !field || !group[1][field]) return undefined;
  return `${group[1][field]} · modelo ${index}`;
}
/** Equipos de las specs solo como grupos: el formato heredado y el nuevo se comparan por igual. */
const withGroups = (project: ProjectSimulation): ProjectSimulation => (project.specs ? { ...project, specs: migrateLegacySpecs(project.specs) } : project);
function format(value: unknown): string {
  if (value === undefined || value === null) return 'Sin valor';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 6 }).format(value);
  if (typeof value === 'string') return value.startsWith('data:') || value.length > 1000 ? 'Archivo o contenido adjunto' : value || 'Vacío';
  if (Array.isArray(value)) return `${value.length} elementos`;
  return 'Configuración modificada';
}
/** Compare editable fields, excluding transport versions and local UI metadata. */
export function projectDifferences(serverProject: ProjectSimulation, localProject: ProjectSimulation): DiffFieldChange[] {
  const server = withGroups(serverProject);
  const local = withGroups(localProject);
  const differences: DiffFieldChange[] = [];
  const visit = (before: unknown, after: unknown, path: string[], section: string) => {
    if (contentEqual(before, after)) return;
    const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
    if (Array.isArray(before) && Array.isArray(after)) {
      for (let index = 0; index < Math.max(before.length, after.length); index++) visit(before[index], after[index], [...path, String(index + 1)], section);
    } else if (object(before) && object(after)) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) visit(before[key], after[key], [...path, key], section);
    } else {
      const key = path.at(-1)!;
      differences.push({ field: section === 'Consumo mensual' ? `Consumo de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][Number(key) - 1] || key} (kWh)` : groupLabel(path) || labels[key] || path.join(' · '), section, oldValue: before, newValue: after, formattedOld: format(before), formattedNew: format(after) });
    }
  };
  for (const [key, section] of Object.entries(sections)) {
    const field = key as keyof ProjectSimulation;
    if (key === 'commercial') { visit(commercialContent(commercialState(server)), commercialContent(commercialState(local)), ['commercial'], section); continue; }
    visit(key === 'isDeleted' ? server.isDeleted === true : server[field], key === 'isDeleted' ? local.isDeleted === true : local[field], [key], section);
  }
  return differences;
}
