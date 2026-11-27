/**
 * Origen de una cotización armado desde una propuesta (docs/QUOTATION_FROM_PROPOSAL.md). La propuesta no tiene precio
 * unitario por equipo: los importes salen de los resultados del motor (`calculateProjectFinancialSummary`) y de la regla
 * compartida de los ítems extra (`shared/financialRules.ts`), nunca de fórmulas propias de precio.
 *
 * Cuadre: la cotización reproduce al centavo el precio que la propuesta cobra al cliente (`contractPriceUSD`, en la
 * moneda y tasa del documento), su ITBIS y su base gravada. En el motor el ITBIS (el del sistema con la exoneración
 * apagada y el de los extras gravados) no depende del descuento: el descuento rebaja solo la parte sin ITBIS. Por eso la
 * conversión imputa los descuentos a la línea de importe global (sin ITBIS), con una fila descriptiva debajo que los
 * nombra, en vez de pasarlos como descuentos del documento (que la cotización prorratearía también sobre lo gravado).
 * Lo que no cabe en la línea global se imputa a los extras exentos visibles; solo si el descuento supera todas las
 * líneas sin ITBIS, el resto va como descuento del documento y el total difiere en `totalDifferenceCents`.
 *
 * Puro: no lee el store ni relojes (la fecha y el contexto entran como argumento) y no muta la propuesta.
 */
import type { EnergyCalculationMode } from '../../../shared/applicationFeatures';
import { resolveAssumptions } from '../../../shared/assumptions';
import { isAssetRef } from '../../../shared/documentAssets';
import { resolveDocumentText, richTextToPlain } from '../../../shared/documentTexts';
import { ITBIS_RATE, appliesItemMargin, customItemsTaxBreakdown, isItemItbisExonerated } from '../../../shared/financialRules';
import { resolveSaleMarginMultiplier } from '../../../shared/projectDefaults';
import { isItemHiddenInQuotation } from '../../../shared/quotationItems';
import {
  QUOTATION_LIMITS, computeQuotationTotals, formatMoney, formatQuantity, quotationFromProposal, toCents,
  type ProposalQuotationSource, type QuotationContent, type QuotationCurrency, type QuotationLine,
} from '../../../shared/quotations';
import { calculateProjectFinancialSummary } from '../../engine/financeEngine';
import type { CompanyProfile } from '../../types/companyProfile';
import type { CustomQuotationDiscount, FinancialSummaryResult, ProjectSimulation } from '../../types';
import { buildDocumentTextContext } from '../../utils/documentTextContext';
import { getProjectBatteries, getProjectInverters, getProjectPanels } from '../../utils/equipmentSpecsUtils';
import { formatProposalDate, getProposalDateInputValue } from '../../utils/formatDateUtils';
import { cleanInstallationDesc } from '../../utils/installationDescription';
import { annexAssetId } from '../../services/proposalAttachmentResolver';
import { LOGO_REJECTED, issuerFromCompany } from './issuer';

/** Los cinco bloques del diálogo «Crear cotización desde una propuesta». */
export type ConversionBlock = 'client' | 'items' | 'documents' | 'currency' | 'conditions';
export type ConversionBlocks = Record<ConversionBlock, boolean>;

export const ALL_CONVERSION_BLOCKS: Readonly<ConversionBlocks> = { client: true, items: true, documents: true, currency: true, conditions: true };

export const CONVERSION_BLOCKS: readonly { id: ConversionBlock; label: string; description: string }[] = [
  { id: 'client', label: 'Cliente enlazado', description: 'El mismo cliente del directorio y los datos impresos de la propuesta' },
  { id: 'items', label: 'Equipos y materiales', description: 'Paneles, inversores, baterías e ítems extra con sus precios, descuentos e ITBIS' },
  { id: 'documents', label: 'Documentos', description: 'Fichas técnicas de los equipos y anexos de la propuesta, como «Solo relacionado»' },
  { id: 'currency', label: 'Moneda y tasa', description: 'La moneda de la propuesta (US$) y su tasa del dólar; si no, pesos con la tasa de las cotizaciones nuevas' },
  { id: 'conditions', label: 'Condiciones y vigencia', description: 'Forma de pago, garantías, servicios incluidos y fecha de validez' },
];

export interface ProposalSourceContext {
  /** 'YYYY-MM-DD' (fecha local de hoy). */
  today: string;
  /** Clientes del directorio: un `clientId` que no esté aquí no se enlaza (misma regla que el store y `invalid_client`). */
  clients: readonly { id: string }[];
  /** Membrete emisor: el de la propuesta o el de las propuestas nuevas. */
  company?: CompanyProfile;
  /** Tasa de las cotizaciones nuevas, usada con «Moneda y tasa» apagado. */
  defaultExchangeRate: number;
  /** Vendedor si la propuesta no tiene responsable comercial. */
  defaultSeller: string;
  calculationMode?: EnergyCalculationMode;
}

export interface OmittedDocument { id: string; title: string; reason: string }

export interface ProposalSourceBuild {
  source: ProposalQuotationSource;
  /** Documentos de la propuesta que no pasan (sin referencia reutilizable). */
  omittedDocuments: OmittedDocument[];
  /** Avisos discretos para el diálogo. */
  notices: string[];
  /** Precio de la propuesta (lo que paga el cliente) en centavos de la moneda de la cotización. */
  proposalTotalCents: number;
  /** ITBIS que la propuesta cobra al cliente, en centavos de la moneda de la cotización. */
  proposalTaxCents: number;
  /**
   * Total del borrador − total de la propuesta, en centavos con signo (0 = cuadra). Solo con «Equipos y materiales»
   * (sin líneas no hay total que comparar). Se muestra en el diálogo fuera de los avisos plegados.
   */
  totalDifferenceCents: number;
  /**
   * Por qué difiere: `residual_discount` (parte del descuento no cabe en las líneas sin ITBIS y, como descuento del
   * documento, rebaja también lo gravado) u `other` (p. ej. extras por encima del precio).
   */
  totalDifferenceReason: 'residual_discount' | 'other' | null;
  /** Descuento que no cabe en ninguna línea sin ITBIS y pasa como descuento del documento (0 casi siempre). */
  residualDiscountCents: number;
}

const DEFAULT_UNIT = 'UD';
const EMPTY_CLIENT = { name: '', attention: '', taxId: '', phone: '', email: '', address: '' };
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const ASSET_ID = /^[A-Za-z0-9:_-]+$/;
/** Carácter nulo o sustituto UTF-16 suelto: la validación compartida los rechaza, así que se quitan. */
const INVALID_TEXT = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
/**
 * Texto recortado a `max` unidades UTF-16 (el límite que mide la validación) sin partir nunca un par sustituto: se
 * recorta por puntos de código y el último que no cabe entero se quita.
 */
export function clip(value: string | undefined | null, max: number): string {
  const text = (value ?? '').replace(INVALID_TEXT, '').trim();
  if (text.length <= max) return text;
  let out = '';
  for (const codePoint of text) {
    if (out.length + codePoint.length > max) break;
    out += codePoint;
  }
  return out.trim();
}
const round2 = (value: number) => Math.round(value * 100) / 100;
/** Base gravada en centavos cuyo ITBIS (redondeado como en `computeQuotationTotals`) es exactamente `taxCents`. */
function taxableBaseForTax(taxCents: number): number {
  return taxCents > 0 ? Math.round(taxCents / ITBIS_RATE) : 0;
}

/** Texto del documento de la propuesta, ya resuelto y en texto plano. */
function documentText(project: ProjectSimulation, ctx: ReturnType<typeof buildDocumentTextContext>, key: string): string {
  try {
    return richTextToPlain(resolveDocumentText(key, { customization: project.customization, client: project.client }, ctx).text).trim();
  } catch {
    return '';
  }
}

/** Precio de la propuesta en la moneda pedida (centavos): lo que muestran el resumen y la lista del diálogo. */
export function proposalPriceCents(summary: Pick<FinancialSummaryResult, 'contractPriceUSD'>, currency: QuotationCurrency, exchangeRate: number): number {
  return toCents(summary.contractPriceUSD * (currency === 'USD' ? 1 : exchangeRate));
}

/** Multiplicador de venta de los ítems extra: el mismo que pasa el motor a `customItemsTaxBreakdown`. */
function extrasMarginMultiplier(project: ProjectSimulation): number {
  const margin = resolveAssumptions({ specs: project.specs, rates: project.rates }).saleMarginMultiplier;
  return resolveSaleMarginMultiplier(margin > 0 ? margin : project.specs.saleMarginMultiplier);
}

/** Reparte `total` entre los pesos por el mayor resto (suma exacta, empates por orden). */
function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (rest <= 0) break; out[i] += 1; rest -= 1; }
  return out;
}

/**
 * Etiqueta de un descuento de la propuesta: motivo, porcentaje y «equipos (Ley 57-07)». La del resto que pasa como
 * descuento fijo del documento no repite el porcentaje (no es ese porcentaje del documento) y acaba en «· resto».
 */
function discountLabel(discount: CustomQuotationDiscount, rest = false): string {
  const target = discount.target === 'equipment' ? ' · equipos (Ley 57-07)' : '';
  const suffix = rest ? `${target} · resto` : target;
  const base = clip(discount.description?.trim() || 'Descuento', QUOTATION_LIMITS.label - 40);
  const pct = discount.type === 'percentage' && !rest ? ` (${Math.max(0, Math.min(100, discount.value || 0))} %)` : '';
  return clip(`${base}${pct}${suffix}`, QUOTATION_LIMITS.label);
}

interface DiscountShare { label: string; value: number }

/**
 * `total` repartido entre los descuentos de la propuesta por el mayor resto, en proporción a lo que vale cada uno (la
 * suma es exacta); sin pesos (datos raros), un único «Descuento».
 */
function discountShares(total: number, customDiscounts: readonly CustomQuotationDiscount[], listGrossUSD: number, rest = false): DiscountShare[] {
  if (total <= 0) return [];
  const weights = customDiscounts.map((d) => (d.type === 'percentage' ? listGrossUSD * (Math.max(0, Math.min(100, d.value || 0)) / 100) : Math.max(0, d.value || 0)));
  const shares = apportion(total, weights).map((value, i) => ({ label: discountLabel(customDiscounts[i], rest), value })).filter((d) => d.value > 0);
  return shares.length ? shares : [{ label: rest ? 'Descuento · resto' : 'Descuento', value: total }];
}

const lineGrossCents = (line: QuotationLine) => computeQuotationTotals({ items: [line], discounts: [] }).subtotalCents;

/**
 * Línea sin ITBIS rebajada exactamente en `amount` centavos: con otro precio unitario si su cantidad permite llegar al
 * neto al centavo; si no (p. ej. 3 UD y un neto que no es múltiplo de 3), un lote por el neto, con la cantidad original
 * en la descripción («Postes (3 UD)»).
 */
function reducedLine(line: QuotationLine, amount: number): QuotationLine {
  const net = lineGrossCents(line) - amount;
  if (net === 0) return { ...line, unitPriceCents: 0 };
  if (line.quantity > 0) {
    const guess = Math.round(net / line.quantity);
    for (const price of [guess, guess - 1, guess + 1]) {
      if (price >= 0 && lineGrossCents({ ...line, unitPriceCents: price }) === net) return { ...line, unitPriceCents: price };
    }
  }
  const original = `${formatQuantity(line.quantity)}${line.unit ? ` ${line.unit}` : ''}`;
  return { ...line, description: `${clip(line.description, QUOTATION_LIMITS.lineDescription - original.length - 3)} (${original})`, quantity: 1, unit: 'lote', unitPriceCents: net };
}

/**
 * Fila descriptiva bajo la línea global con el descuento que ya lleva: «Incluye descuento: Cierre (10 %) −US$ 2,507.84»;
 * con varios, el total y el desglose. Si el desglose no cabe en la descripción, los últimos van juntos («otros N»).
 */
function includedDiscountNote(shares: readonly DiscountShare[], currency: QuotationCurrency): string {
  const max = QUOTATION_LIMITS.lineDescription;
  const minus = (value: number) => `−${formatMoney(value, currency)}`;
  const item = (share: DiscountShare) => `${share.label} ${minus(share.value)}`;
  if (shares.length === 1) return clip(`Incluye descuento: ${item(shares[0])}`, max);
  const total = shares.reduce((sum, d) => sum + d.value, 0);
  const head = `Incluye descuentos por ${minus(total)}`;
  for (let kept = shares.length; kept > 0; kept--) {
    const rest = shares.slice(kept);
    const parts = shares.slice(0, kept).map(item);
    if (rest.length) parts.push(`otros ${rest.length} ${minus(rest.reduce((sum, d) => sum + d.value, 0))}`);
    const text = `${head}: ${parts.join('; ')}`;
    if (text.length <= max) return text;
  }
  return clip(`Incluye ${shares.length} descuentos por ${minus(total)}`, max);
}

/** Etiqueta del proyecto: potencia y, si la hay, capacidad de baterías. */
function projectLabel(summary: FinancialSummaryResult, project: ProjectSimulation): string {
  const storage = project.specs.hasBattery ? getProjectBatteries(project.specs).reduce((sum, b) => sum + (b.capacityKWh || 0) * (b.count || 0), 0) : 0;
  return clip(`Sistema fotovoltaico ${summary.systemCapacityKWp.toFixed(2)} kWp${storage > 0 ? ` con ${round2(storage)} kWh de baterías` : ''}`, QUOTATION_LIMITS.label);
}

function addDays(iso: string, days: number): string | null {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

/**
 * `ProposalQuotationSource` de una propuesta con los bloques elegidos. Siempre enlaza la propuesta (`projectId`) y su
 * etiqueta; cada bloque apagado deja su parte vacía (o, la moneda, en pesos con la tasa de las cotizaciones nuevas).
 */
export function buildProposalQuotationSource(project: ProjectSimulation, blocks: ConversionBlocks, context: ProposalSourceContext): ProposalSourceBuild {
  const notices: string[] = [];
  const omittedDocuments: OmittedDocument[] = [];
  const summary = calculateProjectFinancialSummary(project, context.calculationMode);
  const assumptions = resolveAssumptions(project);
  const currency: QuotationCurrency = blocks.currency ? 'USD' : 'DOP';
  const exchangeRate = blocks.currency ? assumptions.dopExchangeRate : context.defaultExchangeRate;
  const rate = currency === 'USD' ? 1 : exchangeRate;
  const cents = (usd: number) => toCents(usd * rate);
  const textCtx = buildDocumentTextContext(project, summary, {
    currentDateStr: formatProposalDate(project.client?.quoteDate || project.customization?.quoteDate),
    company: context.company,
  });

  // --- Importes del motor (en la moneda del documento) ---
  const proposalTotalCents = proposalPriceCents(summary, currency, exchangeRate);
  // ITBIS no exonerado del sistema (solo con la exoneración apagada): contrato − inversión bruta.
  const baseItbisUSD = Math.max(0, round2(summary.contractPriceUSD - summary.grossInvestmentUSD));
  // Con precio manual el ITBIS de los extras ya va dentro del precio: solo cuenta el del sistema.
  const manualPrice = (project.financials.customCostUSD ?? 0) > 0;
  const proposalTaxCents = cents(baseItbisUSD + (manualPrice ? 0 : summary.customItemsNonExoneratedITBISUSD));
  // Descuento que la propuesta resta: lista − bruta (con precio manual no resta ninguno).
  const discountCents = Math.max(0, cents(summary.listGrossInvestmentUSD - summary.grossInvestmentUSD));
  const customDiscounts = project.financials.customDiscounts ?? [];
  if (customDiscounts.length && discountCents === 0 && manualPrice) {
    notices.push('La propuesta tiene un precio manual: sus descuentos no se restan de su total y no pasan a la cotización.');
  }

  const pricedLines: ProposalQuotationSource['pricedLines'] = [];
  const detailLines: ProposalQuotationSource['detailLines'] = [];
  const discounts: ProposalQuotationSource['discounts'] = [];
  let totalDifferenceCents = 0;
  let totalDifferenceReason: ProposalSourceBuild['totalDifferenceReason'] = null;
  let residualDiscountCents = 0;

  if (blocks.items) {
    const multiplier = extrasMarginMultiplier(project);
    const extras = project.financials.customItems ?? [];
    const visible: QuotationLine[] = [];
    const extraDetails: ProposalQuotationSource['detailLines'] = [];
    let hiddenTaxableCents = 0;
    extras.forEach((item, index) => {
      const taxable = !isItemItbisExonerated(item);
      const name = clip(item.description || `Ítem Adicional #${index + 1}`, QUOTATION_LIMITS.lineDescription);
      // Sin cantidad o sin precio (datos antiguos) cuentan como 0, como en el motor.
      const quantity = item.quantity ?? 0;
      const unitPriceUSD = item.unitPriceUSD ?? 0;
      const unitPriceCents = cents((unitPriceUSD || 0) * (appliesItemMargin(item) ? multiplier : 1));
      const hidden = isItemHiddenInQuotation(item);
      // Fuera de rango (cantidad negativa, enorme o no numérica; precio negativo o no numérico): no bloquea, se omite.
      const outOfRange = !Number.isFinite(quantity) || quantity < 0 || quantity > QUOTATION_LIMITS.maxQuantity
        || !Number.isFinite(unitPriceUSD) || unitPriceUSD < 0 || !Number.isFinite(unitPriceCents) || unitPriceCents > QUOTATION_LIMITS.maxUnitPriceCents;
      if (outOfRange) {
        notices.push(`«${name}» se omite: su cantidad o su precio están fuera de rango. Su importe, si la propuesta lo cobra, queda en la línea global.`);
        return;
      }
      if (manualPrice) {
        // Precio manual: el precio ya lo incluye todo; los extras visibles se listan sin precio.
        if (!hidden) extraDetails.push({ description: name, quantity, unit: clip(item.unit || DEFAULT_UNIT, QUOTATION_LIMITS.unit) });
        return;
      }
      if (quantity === 0) {
        // El motor la cuenta como 1 en la matriz y como 0 en su ITBIS: no hay una línea coherente con ambos.
        notices.push(`«${name}» tiene cantidad 0: no se lista. Su importe, si la propuesta lo cobra, queda en la línea global sin ITBIS.`);
        return;
      }
      if (hidden) {
        // Se cobra pero no se lista: su venta va al importe global (gravado o no).
        if (taxable) hiddenTaxableCents += cents(customItemsTaxBreakdown([item], multiplier).saleTotalUSD);
        return;
      }
      visible.push({
        id: `extra-${index}`, kind: 'item', description: name, quantity, unit: clip(item.unit || DEFAULT_UNIT, QUOTATION_LIMITS.unit),
        unitPriceCents, discountPct: 0, taxable,
      });
    });
    // Parte gravada del sistema (ITBIS no exonerado y extras gravados ocultos). Con ella la base gravada del borrador es
    // exactamente la de la propuesta: la base en centavos cuyo 18 % es su ITBIS (`taxableBaseForTax`); esta línea
    // absorbe el redondeo de los extras gravados visibles. Sin ella (todo exonerado salvo extras visibles) la base es la
    // suma de esas líneas, y el ITBIS, el de su precio unitario redondeado al centavo.
    const visibleTaxableCents = computeQuotationTotals({ items: visible.filter((line) => line.taxable), discounts: [] }).subtotalCents;
    const approxTaxablePartCents = cents(baseItbisUSD / ITBIS_RATE) + hiddenTaxableCents;
    const exactTaxablePartCents = taxableBaseForTax(proposalTaxCents) - visibleTaxableCents;
    // Si la base exacta no deja nada para esta línea (un extra gravado oculto diminuto), no se pone: su importe va a la
    // línea global y la base es la de los extras visibles.
    const taxablePartCents = approxTaxablePartCents > 0 ? Math.max(0, exactTaxablePartCents) : 0;
    const taxablePart: QuotationLine[] = taxablePartCents > 0
      ? [{ id: 'taxable-part', kind: 'item', description: 'Parte del sistema con ITBIS (no exonerada)', quantity: 1, unit: DEFAULT_UNIT, unitPriceCents: taxablePartCents, discountPct: 0, taxable: true }]
      : [];
    const fixed = [...taxablePart, ...visible];
    const fixedTotals = computeQuotationTotals({ items: fixed, discounts: [] });
    // Línea de importe global, sin ITBIS: lo que la propuesta cobra menos las demás líneas y su ITBIS (así el total
    // cuadra al centavo). Antes del descuento vale eso más el descuento, que la propuesta resta de esta parte sin ITBIS.
    const netGlobalCents = proposalTotalCents - fixedTotals.taxCents - fixedTotals.subtotalCents;
    const listGlobalCents = netGlobalCents + discountCents;
    if (listGlobalCents < 0) notices.push('Los ítems extra superan el precio de la propuesta: revisa los importes del borrador.');
    // Lo que cabe en la línea global va incluido en ella (visible en la fila de debajo). Lo que no (raro: precio por Wp
    // bajo con extras caros), en los extras exentos visibles, en orden, cada uno con su fila; y solo lo que tampoco cabe
    // en ninguna línea sin ITBIS, como descuento del documento.
    const includedDiscountCents = Math.min(discountCents, Math.max(0, listGlobalCents));
    const globalCents = Math.max(0, listGlobalCents) - includedDiscountCents;
    const shareNote = (amount: number) => includedDiscountNote(discountShares(amount, customDiscounts, summary.listGrossInvestmentUSD), currency);
    const lineNotes = new Map<number, string>();
    residualDiscountCents = discountCents - includedDiscountCents;
    fixed.forEach((line, index) => {
      if (residualDiscountCents <= 0 || line.taxable) return;
      const take = Math.min(residualDiscountCents, lineGrossCents(line));
      if (take <= 0) return;
      fixed[index] = reducedLine(line, take);
      lineNotes.set(index, shareNote(take));
      residualDiscountCents -= take;
    });
    const kWp = summary.systemCapacityKWp.toFixed(2);
    const storage = project.specs.hasBattery && getProjectBatteries(project.specs).some((b) => (b.count || 0) > 0) ? ', almacenamiento' : '';
    if (globalCents > 0 || includedDiscountCents > 0) {
      const note = includedDiscountCents > 0 ? shareNote(includedDiscountCents) : '';
      pricedLines.push({
        description: `Sistema fotovoltaico ${kWp} kWp llave en mano (equipos${storage}, instalación y puesta en marcha)`, quantity: 1, unit: DEFAULT_UNIT, unitPriceCents: globalCents, taxable: false,
        ...(note ? { note } : {}),
      });
    }
    fixed.forEach((line, index) => {
      const note = lineNotes.get(index);
      pricedLines.push({ description: line.description, quantity: line.quantity, unit: line.unit, unitPriceCents: line.unitPriceCents, taxable: line.taxable, ...(note ? { note } : {}) });
    });

    // Equipos de la propuesta, sin precio (la propuesta no tiene precio por equipo).
    const catalogRef = (id?: string) => (id && id.length <= QUOTATION_LIMITS.id ? { catalogItemId: id } : {});
    for (const panel of getProjectPanels(project.specs)) {
      if ((panel.count || 0) <= 0) continue;
      detailLines.push({ description: clip(panel.brandModel || `Módulos Monocristalinos Tier-1 (${panel.powerW}W)`, QUOTATION_LIMITS.lineDescription), quantity: panel.count, unit: DEFAULT_UNIT, ...catalogRef(panel.catalogItemId) });
    }
    for (const inverter of getProjectInverters(project.specs)) {
      const count = inverter.count || 1;
      detailLines.push({ description: clip(inverter.brandModel || 'Inversor Solar On-Grid / Híbrido', QUOTATION_LIMITS.lineDescription), quantity: count, unit: DEFAULT_UNIT, ...catalogRef(inverter.catalogItemId) });
    }
    if (project.specs.hasBattery) {
      for (const battery of getProjectBatteries(project.specs)) {
        const count = battery.count || 1;
        detailLines.push({ description: clip(battery.brandModel || 'Banco de Baterías de Litio', QUOTATION_LIMITS.lineDescription), quantity: count, unit: DEFAULT_UNIT, ...catalogRef(battery.catalogItemId) });
      }
    }
    detailLines.push({ description: clip(cleanInstallationDesc(project.specs.installationServicesDesc), QUOTATION_LIMITS.lineDescription), quantity: 1, unit: DEFAULT_UNIT });
    detailLines.push(...extraDetails);

    // Resto que no cabe en ninguna línea sin ITBIS: descuentos fijos del documento («<motivo> · resto») que suman
    // exactamente ese resto. La cotización admite hasta `maxDiscounts`: los sobrantes van en un último «Otros descuentos».
    if (residualDiscountCents > 0) {
      const amounts = discountShares(residualDiscountCents, customDiscounts, summary.listGrossInvestmentUSD, true);
      const max = QUOTATION_LIMITS.maxDiscounts;
      const kept = amounts.length > max ? amounts.slice(0, max - 1) : amounts;
      const rest = amounts.slice(kept.length);
      for (const d of kept) discounts.push({ label: d.label, type: 'fixed', value: d.value });
      if (rest.length) discounts.push({ label: `Otros descuentos (${rest.length}) · resto`, type: 'fixed', value: rest.reduce((sum, d) => sum + d.value, 0) });
    }
    const quotationTotals = computeQuotationTotals({
      items: pricedLines.map((line, i) => ({ id: `p-${i}`, kind: 'item' as const, discountPct: 0, ...line })),
      discounts: discounts.map((d, i) => ({ id: `d-${i}`, ...d })),
    });
    totalDifferenceCents = quotationTotals.totalCents - proposalTotalCents;
    if (totalDifferenceCents !== 0) totalDifferenceReason = residualDiscountCents > 0 && listGlobalCents >= 0 && fixed.some((line) => line.taxable) ? 'residual_discount' : 'other';
  }

  // --- Cliente ---
  let clientId: string | undefined;
  let client = { ...EMPTY_CLIENT };
  if (blocks.client) {
    if (project.clientId) {
      if (context.clients.some((c) => c.id === project.clientId)) clientId = project.clientId;
      else notices.push('El cliente enlazado a la propuesta ya no está en el directorio: el borrador lleva sus datos impresos sin enlace.');
    }
    client = {
      name: clip(documentText(project, textCtx, 'client.name') || project.client.name, QUOTATION_LIMITS.label),
      attention: clip(documentText(project, textCtx, 'client.contact'), QUOTATION_LIMITS.label),
      taxId: clip(project.client.rnc, QUOTATION_LIMITS.taxId),
      phone: clip(documentText(project, textCtx, 'client.phone'), QUOTATION_LIMITS.phone),
      email: clip(documentText(project, textCtx, 'client.email'), QUOTATION_LIMITS.label),
      address: clip(project.client.address || '', QUOTATION_LIMITS.address),
    };
  }

  // --- Condiciones y vigencia ---
  let notes = '';
  let paymentTerms = '';
  let validUntil: string | null = null;
  if (blocks.conditions) {
    const warranty = (labelKey: string, key: string) => {
      const value = documentText(project, textCtx, key);
      return value ? `${documentText(project, textCtx, labelKey)} ${value}`.trim() : '';
    };
    const warranties = [
      warranty('quotation.warranty.panelLabel', 'quotation.warranty.panel'),
      warranty('quotation.warranty.inverterLabel', 'quotation.warranty.inverter'),
      project.specs.hasBattery ? warranty('quotation.warranty.batteryLabel', 'quotation.warranty.battery') : '',
      warranty('quotation.warranty.workmanshipLabel', 'quotation.warranty.workmanship'),
    ].filter(Boolean);
    const services = documentText(project, textCtx, 'quotation.servicesIncluded');
    const exemption = project.financials.applyITBISExemption && summary.itbisSavedUSD > 0 ? 'Equipos exonerados de ITBIS según la Ley 57-07.' : '';
    notes = clip([
      warranties.length ? `Garantías:\n${warranties.join('\n')}` : '',
      services ? `Servicios incluidos: ${services}` : '',
      exemption,
    ].filter(Boolean).join('\n\n'), QUOTATION_LIMITS.notes);
    paymentTerms = clip([context.company?.defaultPaymentTerms?.trim() ?? '', documentText(project, textCtx, 'quotation.validityNote')].filter(Boolean).join('\n'), QUOTATION_LIMITS.paymentTerms);
    const rawDate = project.client?.quoteDate || project.customization?.quoteDate;
    const start = (rawDate && getProposalDateInputValue(rawDate)) || context.today;
    validUntil = /^\d{4}-\d{2}-\d{2}$/.test(start) ? addDays(start, assumptions.quoteValidityDays) : null;
  }

  // --- Documentos: solo los que tienen una referencia reutilizable (sin copiar binarios) ---
  const attachments: ProposalQuotationSource['attachments'] = [];
  if (blocks.documents) {
    for (const annex of project.customization?.attachedPdfs ?? []) {
      if (!annex.enabled) continue;
      const assetId = annexAssetId(annex);
      if (!assetId || assetId.length > QUOTATION_LIMITS.assetId || !ASSET_ID.test(assetId)) {
        omittedDocuments.push({ id: annex.id, title: annex.title || annex.fileName, reason: 'Está solo en este equipo: no tiene un archivo guardado que la cotización pueda enlazar.' });
        continue;
      }
      if (attachments.length >= QUOTATION_LIMITS.maxAttachments) {
        omittedDocuments.push({ id: annex.id, title: annex.title || annex.fileName, reason: `La cotización admite hasta ${QUOTATION_LIMITS.maxAttachments} documentos.` });
        continue;
      }
      const thumb = annex.thumbnailDataUrl;
      const thumbnailOk = typeof thumb === 'string' && thumb.length <= QUOTATION_LIMITS.thumbnailDataUrl && (isAssetRef(thumb) || IMAGE_DATA_URL.test(thumb));
      attachments.push({
        id: clip(annex.id, QUOTATION_LIMITS.id),
        fileName: clip(annex.fileName, QUOTATION_LIMITS.fileName),
        fileSize: Number.isSafeInteger(annex.fileSize) && annex.fileSize >= 0 ? annex.fileSize : 0,
        pageCount: Number.isSafeInteger(annex.pageCount) && annex.pageCount >= 0 ? annex.pageCount : 0,
        title: clip(annex.title || annex.fileName, QUOTATION_LIMITS.label),
        uploadedAt: clip(annex.uploadedAt, QUOTATION_LIMITS.timestamp),
        assetId,
        origin: annex.origin === 'catalog' ? 'catalog' : 'proposal',
        ...(annex.catalogItemId && annex.catalogItemId.length <= QUOTATION_LIMITS.id ? { catalogItemId: annex.catalogItemId } : {}),
        ...(thumbnailOk ? { thumbnailDataUrl: thumb } : {}),
      });
    }
  }

  const issuer = issuerFromCompany(context.company);
  const source: ProposalQuotationSource = {
    projectId: project.id,
    ...(clientId ? { clientId } : {}),
    client,
    projectLabel: projectLabel(summary, project),
    currency,
    exchangeRate,
    seller: clip(project.commercial?.ownerName || context.defaultSeller, QUOTATION_LIMITS.label),
    detailLines,
    pricedLines,
    discounts,
    paymentTerms,
    notes,
    validUntil,
    attachments,
    issuer,
  };
  return { source, omittedDocuments, notices, proposalTotalCents, proposalTaxCents, totalDifferenceCents, totalDifferenceReason, residualDiscountCents };
}

export type ProposalConversion =
  | { ok: true; value: QuotationContent; build: ProposalSourceBuild }
  | { ok: false; error: string; build: ProposalSourceBuild };

/**
 * Contenido del borrador (`quotationFromProposal`, ya validado). Un logo del membrete que la cotización no admite
 * (p. ej. SVG) se omite: el membrete nunca impide convertir.
 */
export function convertProposalToQuotation(
  project: ProjectSimulation, blocks: ConversionBlocks, context: ProposalSourceContext, newId: () => string,
): ProposalConversion {
  const build = buildProposalQuotationSource(project, blocks, context);
  let result = quotationFromProposal(build.source, { today: context.today, newId });
  if (!result.ok && build.source.issuer.logo && result.error.startsWith(LOGO_REJECTED)) {
    result = quotationFromProposal({ ...build.source, issuer: { ...build.source.issuer, logo: '' } }, { today: context.today, newId });
  }
  return result.ok ? { ok: true, value: result.value, build } : { ok: false, error: result.error, build };
}
