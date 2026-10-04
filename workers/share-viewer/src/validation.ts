import type { ShareProposalPayload } from './types';
export const MAX_SHARE_BYTES = 2 * 1024 * 1024;
export class RequestValidationError extends Error {
  constructor(message: string, public readonly status: 400 | 413 = 400) { super(message); }
}
export async function readBoundedJson(request: Pick<Request, 'headers' | 'body'>, limit = MAX_SHARE_BYTES): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new RequestValidationError('Se requiere contenido JSON.');
  const contentLength = Number(request.headers.get('content-length'));
  if (contentLength > limit) throw new RequestValidationError('La propuesta excede el tamaño permitido.', 413);
  if (!request.body) throw new RequestValidationError('El cuerpo de la solicitud está vacío.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestValidationError('La propuesta excede el tamaño permitido.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { throw new RequestValidationError('El contenido JSON no es válido.'); }
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new RequestValidationError(`${path} debe ser un objeto.`);
  return value;
}
function validateTree(value: unknown, depth = 0): void {
  if (depth > 12) throw new RequestValidationError('La estructura es demasiado profunda.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'string' && value.length <= MAX_SHARE_BYTES) return;
  if (Array.isArray(value) && value.length <= 120) { for (const item of value) validateTree(item, depth + 1); return; }
  if (isRecord(value) && Object.keys(value).length <= 160) {
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new RequestValidationError('La estructura contiene una clave no permitida.');
      validateTree(item, depth + 1);
    }
    return;
  }
  throw new RequestValidationError('La estructura contiene valores no permitidos.');
}
function textFields(record: Record<string, unknown>, fields: string[], maxLength = 30000): void {
  for (const field of fields) {
    const value = record[field];
    if (value !== undefined && (typeof value !== 'string' || value.length > maxLength)) throw new RequestValidationError(`${field} debe ser texto de hasta ${maxLength} caracteres.`);
  }
}
export function parseSharePayload(value: unknown): ShareProposalPayload {
  validateTree(value);
  const body = requireRecord(value, 'La propuesta');
  const project = requireRecord(body.project, 'project');
  if (typeof project.id !== 'string' || project.id.length < 1 || project.id.length > 160) throw new RequestValidationError('El identificador del proyecto no es válido.');
  const client = requireRecord(project.client, 'client');
  const specs = requireRecord(project.specs, 'specs');
  const rates = requireRecord(project.rates, 'rates');
  const financials = requireRecord(project.financials, 'financials');
  textFields(client, ['name','projectId','quoteNumber','province','location','address','contactPhone','solarSourceMode','coordinates','distributor','tariffCode'], 1000);
  textFields(specs, ['panelBrandModel','inverterBrandModel','batteryBrandModel','installationServicesDesc']);
  textFields(rates, ['distributor','tariffCode']);
  for (const record of [client, specs, rates]) {
    for (const field of ['quoteValidityDays','panelCount','panelPowerW','inverterCount','inverterPowerKW','batteryCount','batteryCapacityKWh','gridExportFeePct']) {
      if (record[field] !== undefined && (typeof record[field] !== 'number' || !Number.isFinite(record[field]) || (record[field] as number) < 0)) throw new RequestValidationError(`${field} debe ser un número positivo.`);
    }
  }
  for (const [record, fields] of [[specs, ['hasBattery','showSelfConsumptionBreakdown']], [rates, ['isZeroExport']], [financials, ['applyITBISExemption','applyLey5707']]] as const) {
    for (const field of fields) if (record[field] !== undefined && typeof record[field] !== 'boolean') throw new RequestValidationError(`${field} debe ser booleano.`);
  }
  const custom = project.customization === undefined ? {} : requireRecord(project.customization, 'customization');
  for (const [key, item] of Object.entries(custom)) {
    if (key === 'showSelfConsumptionInProposal') { if (typeof item !== 'boolean') throw new RequestValidationError('El desglose debe ser booleano.'); }
    else if (typeof item !== 'string' || item.length > (key.endsWith('LogoBase64') ? MAX_SHARE_BYTES : 30000)) throw new RequestValidationError('La personalización contiene un valor no válido.');
  }
  for (const field of ['panels', 'inverters', 'batteries']) {
    if (specs[field] === undefined) continue;
    if (!Array.isArray(specs[field]) || specs[field].length > 50) throw new RequestValidationError('La lista de equipos no es válida.');
    for (const item of specs[field]) textFields(requireRecord(item, field), ['brandModel'], 1000);
  }
  if (financials.customItems !== undefined) {
    if (!Array.isArray(financials.customItems)) throw new RequestValidationError('Los ítems no son válidos.');
    for (const item of financials.customItems) textFields(requireRecord(item, 'customItems'), ['description','unit'], 1000);
  }
  if (financials.customDiscounts !== undefined) {
    if (!Array.isArray(financials.customDiscounts)) throw new RequestValidationError('Los descuentos no son válidos.');
    for (const item of financials.customDiscounts) {
      const discount = requireRecord(item, 'customDiscounts');
      if (!['fixed','percentage'].includes(String(discount.type)) || typeof discount.value !== 'number' || discount.value < 0) throw new RequestValidationError('El descuento no es válido.');
    }
  }
  const summary = requireRecord(body.summary, 'summary');
  for (const [key, item] of Object.entries(summary)) {
    if (typeof item === 'string' || typeof item === 'boolean') throw new RequestValidationError(`La métrica ${key} debe ser numérica.`);
  }
  if (!Array.isArray(summary.monthlyBreakdown) || summary.monthlyBreakdown.length !== 12) throw new RequestValidationError('El resumen debe incluir doce meses.');
  for (const month of summary.monthlyBreakdown) {
    const row = requireRecord(month, 'month');
    textFields(row, ['month'], 80);
    for (const field of ['consumptionKWh','productionKWh','effectiveSavedKWh','solarSelfConsumedKWh','gridExportKWh','batteryContributionKWh','netExportCreditKWh']) {
      if (row[field] !== undefined && (typeof row[field] !== 'number' || !Number.isFinite(row[field]) || (row[field] as number) < 0)) throw new RequestValidationError('Las métricas mensuales deben ser números positivos.');
    }
    if (typeof row.consumptionKWh !== 'number' || typeof row.productionKWh !== 'number') throw new RequestValidationError('Faltan las métricas de energía.');
  }
  if (!Array.isArray(summary.cashFlow25Years) || summary.cashFlow25Years.length > 100) throw new RequestValidationError('El flujo de caja no es válido.');
  for (const year of summary.cashFlow25Years) {
    const row = requireRecord(year, 'cashFlow');
    for (const item of Object.values(row)) if (typeof item !== 'number' || !Number.isFinite(item)) throw new RequestValidationError('Las métricas de flujo de caja deben ser numéricas.');
  }
  const snapshot = requireRecord(body.calculationSnapshot, 'calculationSnapshot');
  if (snapshot.mode !== 'legacy' && snapshot.mode !== 'self_consumption') throw new RequestValidationError('El modo de cálculo no es válido.');
  if (typeof snapshot.capturedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.capturedAt))) throw new RequestValidationError('La fecha de cálculo no es válida.');
  if (typeof snapshot.organizationId !== 'string' || snapshot.organizationId.length > 160) throw new RequestValidationError('La organización del cálculo no es válida.');
  if (!Number.isSafeInteger(snapshot.policyVersion) || (snapshot.policyVersion as number) < 0) throw new RequestValidationError('La versión de la política no es válida.');
  if (!Number.isInteger(body.validityDays) || (body.validityDays as number) < 1 || (body.validityDays as number) > 90) throw new RequestValidationError('La vigencia debe estar entre 1 y 90 días.');
  return value as ShareProposalPayload;
}
export function validProposalId(value: unknown): value is string {
  // Seven-character IDs remain readable for previously published proposals.
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{7,64}$/.test(value);
}
