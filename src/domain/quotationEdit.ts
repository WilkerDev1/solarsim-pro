/**
 * Edición pura del contenido de una cotización (docs/QUOTATION_EDITOR.md). Cada función recibe un `QuotationContent`
 * y devuelve uno nuevo sin mutar la entrada; si no hay nada que cambiar devuelve la misma referencia. No lee el store
 * ni valida: el store valida con `validateQuotationContent` al guardar (`updateQuotationRecord`). Los ids nuevos
 * salen del generador inyectado (`newId`) para que las pruebas sean deterministas.
 */
import { convertCents, formatExchangeRate } from '../../shared/quotations';
import type {
  QuotationContent, QuotationCurrency, QuotationDiscount, QuotationIssuer, QuotationLine, QuotationPrintedClient,
} from '../../shared/quotations';

export type IdFactory = () => string;

export const DEFAULT_LINE_UNIT = 'UD';

/** Datos del documento que se editan como campos sueltos (el estado nunca: lo cambia `setQuotationStatus`). */
export type QuotationDocumentFields = Pick<QuotationContent, 'issueDate' | 'validUntil' | 'seller' | 'projectLabel' | 'notes' | 'paymentTerms'>;
const DOCUMENT_FIELDS: readonly (keyof QuotationDocumentFields)[] = ['issueDate', 'validUntil', 'seller', 'projectLabel', 'notes', 'paymentTerms'];
const CLIENT_FIELDS: readonly (keyof QuotationPrintedClient)[] = ['name', 'attention', 'taxId', 'phone', 'email', 'address'];

type LineEdit = Partial<Omit<QuotationLine, 'id'>>;

/** Una línea descriptiva nunca tiene precio, descuento ni ITBIS (lo mismo normaliza la validación). */
const normalizeLine = (line: QuotationLine): QuotationLine =>
  line.kind === 'detail' ? { ...line, unitPriceCents: 0, discountPct: 0, taxable: false } : line;

const withItems = (content: QuotationContent, items: QuotationLine[]): QuotationContent => ({ ...content, items });
const withDiscounts = (content: QuotationContent, discounts: QuotationDiscount[]): QuotationContent => ({ ...content, discounts });

export function addItemLine(content: QuotationContent, newId: IdFactory, init: Partial<Omit<QuotationLine, 'id' | 'kind'>> = {}): QuotationContent {
  const line: QuotationLine = { id: newId(), kind: 'item', description: '', quantity: 1, unit: DEFAULT_LINE_UNIT, unitPriceCents: 0, discountPct: 0, taxable: true, ...init };
  return withItems(content, [...content.items, line]);
}

export function addDetailLine(content: QuotationContent, newId: IdFactory, description = ''): QuotationContent {
  const line: QuotationLine = { id: newId(), kind: 'detail', description, quantity: 0, unit: '', unitPriceCents: 0, discountPct: 0, taxable: false };
  return withItems(content, [...content.items, line]);
}

/** Añade una línea ya armada (p. ej. la del catálogo de equipos). */
export function appendLine(content: QuotationContent, line: QuotationLine): QuotationContent {
  return withItems(content, [...content.items, normalizeLine({ ...line })]);
}

export function updateLine(content: QuotationContent, lineId: string, patch: LineEdit): QuotationContent {
  const index = content.items.findIndex((line) => line.id === lineId);
  if (index < 0) return content;
  const { id: _id, ...rest } = patch as LineEdit & { id?: string };
  const items = [...content.items];
  items[index] = normalizeLine({ ...items[index], ...rest, id: lineId });
  return withItems(content, items);
}

export function removeLine(content: QuotationContent, lineId: string): QuotationContent {
  return content.items.some((line) => line.id === lineId) ? withItems(content, content.items.filter((line) => line.id !== lineId)) : content;
}

/** Copia la línea justo debajo de ella, con id nuevo. */
export function duplicateLine(content: QuotationContent, lineId: string, newId: IdFactory): QuotationContent {
  const index = content.items.findIndex((line) => line.id === lineId);
  if (index < 0) return content;
  const items = [...content.items];
  items.splice(index + 1, 0, { ...items[index], id: newId() });
  return withItems(content, items);
}

/** Sube (-1) o baja (+1) una línea; en los extremos no cambia nada. */
export function moveLine(content: QuotationContent, lineId: string, offset: -1 | 1): QuotationContent {
  const index = content.items.findIndex((line) => line.id === lineId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= content.items.length) return content;
  const items = [...content.items];
  [items[index], items[target]] = [items[target], items[index]];
  return withItems(content, items);
}

export function addDiscount(content: QuotationContent, newId: IdFactory, type: QuotationDiscount['type'] = 'percentage'): QuotationContent {
  return withDiscounts(content, [...content.discounts, { id: newId(), label: '', type, value: 0 }]);
}

/** Cambiar el tipo reinicia el valor: un 10 % no son 10 centavos. */
export function updateDiscount(content: QuotationContent, discountId: string, patch: Partial<Omit<QuotationDiscount, 'id'>>): QuotationContent {
  const index = content.discounts.findIndex((discount) => discount.id === discountId);
  if (index < 0) return content;
  const current = content.discounts[index];
  const retyped = patch.type !== undefined && patch.type !== current.type;
  const discounts = [...content.discounts];
  discounts[index] = {
    id: discountId,
    label: patch.label ?? current.label,
    type: patch.type ?? current.type,
    value: retyped ? (patch.value ?? 0) : (patch.value ?? current.value),
  };
  return withDiscounts(content, discounts);
}

export function removeDiscount(content: QuotationContent, discountId: string): QuotationContent {
  return content.discounts.some((d) => d.id === discountId) ? withDiscounts(content, content.discounts.filter((d) => d.id !== discountId)) : content;
}

/** Fechas, vendedor, proyecto, notas y condiciones; ignora cualquier otra clave (el estado, los importes…). */
export function setDocumentFields(content: QuotationContent, patch: Partial<QuotationDocumentFields>): QuotationContent {
  const next = { ...content };
  let changed = false;
  for (const key of DOCUMENT_FIELDS) {
    if (!(key in patch) || patch[key] === undefined || patch[key] === content[key]) continue;
    (next as Record<string, unknown>)[key] = patch[key];
    changed = true;
  }
  return changed ? next : content;
}

/** Datos del cliente tal como se imprimen. Nunca toca el enlace `clientId`. */
export function setPrintedClient(content: QuotationContent, patch: Partial<QuotationPrintedClient>): QuotationContent {
  const client = { ...content.client };
  let changed = false;
  for (const key of CLIENT_FIELDS) {
    const value = patch[key];
    if (value === undefined || value === client[key]) continue;
    client[key] = value;
    changed = true;
  }
  return changed ? { ...content, client } : content;
}

/** Copia explícita de un cliente del directorio a los datos impresos (docs/CLIENTS.md); la atención queda vacía. */
export function printedClientFromDirectory(client: { name: string; taxId?: string; phone?: string; email?: string; address?: string }): QuotationPrintedClient {
  return { name: client.name ?? '', attention: '', taxId: client.taxId ?? '', phone: client.phone ?? '', email: client.email ?? '', address: client.address ?? '' };
}

/**
 * Cambia la moneda del documento convirtiendo precios unitarios y descuentos fijos con la tasa del documento
 * (`convertCents`, half-up). Los porcentajes no cambian. DOP→USD redondea a centavos de dólar, así que volver a DOP
 * puede diferir hasta media tasa en centavos; USD→DOP→USD es exacto.
 */
export function changeCurrency(content: QuotationContent, currency: QuotationCurrency): QuotationContent {
  if (content.currency === currency) return content;
  const convert = (cents: number) => convertCents(cents, content.currency, currency, content.exchangeRate);
  return {
    ...content,
    currency,
    items: content.items.map((line) => (line.kind === 'item' ? { ...line, unitPriceCents: convert(line.unitPriceCents) } : line)),
    discounts: content.discounts.map((discount) => (discount.type === 'fixed' ? { ...discount, value: convert(discount.value) } : discount)),
  };
}

const CURRENCY_LABELS: Record<QuotationCurrency, string> = { DOP: 'pesos dominicanos (RD$)', USD: 'dólares (US$)' };

/**
 * Qué supone cambiar a `currency`: hay que confirmarlo si hay importes que convertir (líneas con precio o descuentos
 * fijos); el mensaje dice a qué moneda, con qué tasa y que los importes se convierten y redondean a centavos.
 */
export function currencyChangeSummary(content: QuotationContent, currency: QuotationCurrency): { needsConfirmation: boolean; message: string } {
  const priced = content.items.filter((line) => line.kind === 'item' && line.unitPriceCents > 0).length;
  const fixed = content.discounts.filter((discount) => discount.type === 'fixed' && discount.value > 0).length;
  const parts = [priced ? `${priced} ${priced === 1 ? 'precio' : 'precios'}` : '', fixed ? `${fixed} ${fixed === 1 ? 'descuento fijo' : 'descuentos fijos'}` : ''].filter(Boolean);
  return {
    needsConfirmation: parts.length > 0,
    message: `La cotización pasará a ${CURRENCY_LABELS[currency]}. Se convertirán ${parts.join(' y ') || 'los importes'} con la tasa del documento (US$ 1 = RD$ ${formatExchangeRate(content.exchangeRate)}) y se redondearán a centavos; volver a la moneda anterior puede no dar los mismos importes.`,
  };
}

/** Reemplaza los datos impresos del emisor (p. ej. «Actualizar desde el membrete»). */
export function setIssuer(content: QuotationContent, issuer: QuotationIssuer): QuotationContent {
  return { ...content, issuer: { ...issuer } };
}

/** Cambia la tasa (DOP por USD) sin tocar importes. */
export function setExchangeRate(content: QuotationContent, exchangeRate: number): QuotationContent {
  return content.exchangeRate === exchangeRate ? content : { ...content, exchangeRate };
}

/** Claves de nivel superior que cambiaron (por referencia): el parche que se envía a `updateQuotationRecord`. */
export function contentPatch(previous: QuotationContent, next: QuotationContent): Partial<QuotationContent> {
  const patch: Partial<QuotationContent> = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)] as (keyof QuotationContent)[]);
  for (const key of keys) if (previous[key] !== next[key]) (patch as Record<string, unknown>)[key] = next[key];
  return patch;
}

const GROUPED = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const PLAIN = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Número escrito por el usuario en unidades (p. ej. '39.20', '6,000.00', 'RD$ 1,234.5'): punto decimal y coma de
 * miles en grupos de tres. Devuelve `null` si no es un número inequívoco.
 */
export function parseDecimalInput(text: string): number | null {
  const clean = text.replace(/(?:RD|US)?\$/gi, '').replace(/[\s %]/g, '');
  if (!clean || !(GROUPED.test(clean) || PLAIN.test(clean))) return null;
  const value = Number(clean.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}
