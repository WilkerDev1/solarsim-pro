import type { DiffFieldChange, ProjectSimulation } from '../../types';

/** JSON semantics: object order is immaterial; array order is significant. */
export function contentEqual(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
const sections = { client: 'Cliente', specs: 'Equipos', rates: 'Tarifas', financials: 'Finanzas', monthlyConsumption: 'Consumo mensual', customization: 'Documento', status: 'Estado', isDeleted: 'Papelera' };
const labels: Record<string, string> = {
  name: 'Nombre', address: 'Dirección', company: 'Empresa', projectId: 'Código de propuesta', province: 'Provincia', email: 'Correo electrónico', phone: 'Teléfono',
  panelCount: 'Cantidad de módulos', panelPowerW: 'Potencia del módulo (W)', hasBattery: 'Baterías', batteryCapacityKWh: 'Capacidad de baterías (kWh)', systemLosses: 'Pérdidas del sistema',
  energyCostPerKWh: 'Precio de energía', distributor: 'Distribuidora', tariffCode: 'Tarifa', currency: 'Moneda', exchangeRate: 'Tasa de cambio',
  annualConsumption: 'Consumo anual', inverterCount: 'Cantidad de inversores', inverterPowerKW: 'Potencia del inversor (kW)', applyLey5707: 'Incentivos Ley 57-07',
  customITBISSavedUSD: 'ITBIS exonerado personalizado (USD)', customLey5707CreditUSD: 'Crédito fiscal personalizado (USD)', customCostUSD: 'Inversión personalizada (USD)',
  applyITBISExemption: 'Exoneración ITBIS', monthlyConsumption: 'Consumo mensual', isDeleted: 'En papelera', status: 'Estado',
};
function format(value: unknown): string {
  if (value === undefined || value === null) return 'Sin valor';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 6 }).format(value);
  if (typeof value === 'string') return value.startsWith('data:') || value.length > 1000 ? 'Archivo o contenido adjunto' : value || 'Vacío';
  if (Array.isArray(value)) return `${value.length} elementos`;
  return 'Configuración modificada';
}
/** Compare editable fields, excluding transport versions and local UI metadata. */
export function projectDifferences(server: ProjectSimulation, local: ProjectSimulation): DiffFieldChange[] {
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
      differences.push({ field: section === 'Consumo mensual' ? `Consumo de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][Number(key) - 1] || key} (kWh)` : labels[key] || path.join(' · '), section, oldValue: before, newValue: after, formattedOld: format(before), formattedNew: format(after) });
    }
  };
  for (const [key, section] of Object.entries(sections)) {
    const field = key as keyof ProjectSimulation;
    visit(key === 'isDeleted' ? server.isDeleted === true : server[field], key === 'isDeleted' ? local.isDeleted === true : local[field], [key], section);
  }
  return differences;
}
