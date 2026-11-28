/**
 * Puertos que F4 conecta (F3a deja el contrato): la lectura de una factura con visión (`extract_invoice`) y la navegación
 * (`open_proposal`). Sin puerto, la herramienta responde `not_available` y no hace nada: el bucle y el panel nuevos son de
 * F4/F5, y hoy nada declara estas herramientas al modelo.
 *
 * Las extracciones se guardan aquí en memoria (no se persisten ni se sincronizan) y se pasan POR REFERENCIA: `extract_invoice`
 * devuelve un `extractionId` que `create_proposal` acepta, así los doce consumos no pasan por el modelo.
 */
export interface InvoiceExtraction {
  clientName?: string;
  company?: string;
  province?: string;
  address?: string;
  distributor?: string;
  tariffCode?: string;
  /** Doce consumos de enero a diciembre (kWh). */
  monthlyConsumptionKWh?: number[];
  averageMonthlyKWh?: number;
  /** Lo que la lectura no pudo confirmar, en español. */
  issues?: string[];
}

export type ProposalView = 'simulator' | 'project-hub' | 'pdf-preview';

export interface AssistantToolPorts {
  /** Lee la factura adjunta en el chat (`fileId`) con un esquema fijo y devuelve los datos normalizados. */
  extractInvoice?(input: { fileId: string; signal?: AbortSignal }): Promise<InvoiceExtraction>;
  /** Abre la propuesta en la vista pedida (solo el asistente de la app navega). */
  openProposal?(input: { proposalId: string; view: ProposalView }): void | Promise<void>;
}

let ports: AssistantToolPorts = {};
export const assistantToolPorts = (): AssistantToolPorts => ports;
export function setAssistantToolPorts(next: AssistantToolPorts): void {
  ports = { ...ports, ...next };
}
/** Sin puertos y sin extracciones guardadas (pruebas y cierre de sesión). */
export function resetAssistantToolPorts(): void {
  ports = {};
  extractions.clear();
}

const MAX_EXTRACTIONS = 20;
const extractions = new Map<string, { owner: string; data: InvoiceExtraction }>();
let sequence = 0;

/** Guarda una extracción para el espacio/sesión `owner` y devuelve su referencia. */
export function rememberInvoiceExtraction(owner: string, data: InvoiceExtraction): string {
  const id = `inv-${Date.now().toString(36)}-${(sequence++).toString(36)}`;
  extractions.set(id, { owner, data: structuredClone(data) });
  while (extractions.size > MAX_EXTRACTIONS) extractions.delete(extractions.keys().next().value!);
  return id;
}

/** La extracción `id` del mismo espacio/sesión, o nada (otra sesión nunca la ve). */
export function findInvoiceExtraction(owner: string, id: string): InvoiceExtraction | undefined {
  const entry = extractions.get(id);
  return entry && entry.owner === owner ? structuredClone(entry.data) : undefined;
}
