/**
 * Línea de cotización a partir de un equipo del catálogo (docs/QUOTATION_EDITOR.md). Pura: quien llama le pasa el
 * margen de venta de los ajustes y el precio genérico vigente (ADR 0003 y 0006).
 *
 * Precio: el resolvedor único `resolveAutoPrice` (oferta utilizable, la preferida o la más barata → precio genérico →
 * nada) da un costo en USD; se le aplica el multiplicador de margen de venta, se pasa a centavos de USD y se convierte a
 * la moneda del documento con la tasa del documento (`convertCents`). Sin precio, la línea entra en 0 y se indica.
 * Paneles e inversores entran sin ITBIS (`equipmentTypeCarriesItbis`); el resto, gravado.
 */
import { resolveAutoPrice, type GenericPriceInfo } from '../../../shared/equipmentPrices';
import { equipmentTypeCarriesItbis } from '../../../shared/financialRules';
import { QUOTATION_LIMITS, convertCents, toCents, type QuotationCurrency, type QuotationLine } from '../../../shared/quotations';
import type { SolarEquipmentItem } from '../../types/equipment';
import { DEFAULT_LINE_UNIT, type IdFactory } from '../../domain/quotationEdit';

export interface CatalogLineContext {
  currency: QuotationCurrency;
  /** DOP por 1 USD: la tasa del documento. */
  exchangeRate: number;
  /** Multiplicador de margen de venta (1.25 = costo × 1.25), de los ajustes. */
  saleMarginMultiplier: number;
  /** Precio genérico vigente del equipo; `null`/ausente sin sesión (la función está apagada en modo local). */
  genericPrice?: GenericPriceInfo | null;
}

export type CatalogPriceSource = 'supplier' | 'generic' | 'none';

export interface CatalogLineResult {
  line: QuotationLine;
  priceSource: CatalogPriceSource;
  supplierName?: string;
  /** Aviso para el usuario cuando el precio no viene de un proveedor. */
  notice: string | null;
}

export const CATALOG_PRICE_NOTICES = {
  generic: 'precio genérico, sin proveedor',
  none: 'sin precio en el catálogo: la línea entra con precio 0',
} as const;

/** Nombre visible del equipo en el catálogo; sin él, marca y serie. */
export function catalogItemDescription(item: Pick<SolarEquipmentItem, 'displayName' | 'brand' | 'modelSeries'>): string {
  const name = item.displayName?.trim() || [item.brand, item.modelSeries].map((part) => part?.trim()).filter(Boolean).join(' ');
  return name.slice(0, QUOTATION_LIMITS.lineDescription);
}

/** Vista previa del precio de venta en la moneda del documento, sin crear la línea (para el selector). */
export function catalogSalePrice(item: SolarEquipmentItem, context: CatalogLineContext): { cents: number; priceSource: CatalogPriceSource; supplierName?: string } {
  const price = resolveAutoPrice(item, context.genericPrice);
  if (!price) return { cents: 0, priceSource: 'none' };
  const usdCents = toCents(price.priceUSD * context.saleMarginMultiplier);
  const cents = convertCents(usdCents, 'USD', context.currency, context.exchangeRate);
  return price.kind === 'supplier' ? { cents, priceSource: 'supplier', supplierName: price.offer.supplierName } : { cents, priceSource: 'generic' };
}

export function catalogQuotationLine(item: SolarEquipmentItem, context: CatalogLineContext, newId: IdFactory): CatalogLineResult {
  const price = catalogSalePrice(item, context);
  const line: QuotationLine = {
    id: newId(),
    kind: 'item',
    description: catalogItemDescription(item),
    quantity: 1,
    unit: DEFAULT_LINE_UNIT,
    unitPriceCents: price.cents,
    discountPct: 0,
    taxable: equipmentTypeCarriesItbis(item.type),
    catalogItemId: item.id,
  };
  return {
    line,
    priceSource: price.priceSource,
    ...(price.supplierName ? { supplierName: price.supplierName } : {}),
    notice: price.priceSource === 'supplier' ? null : CATALOG_PRICE_NOTICES[price.priceSource],
  };
}
