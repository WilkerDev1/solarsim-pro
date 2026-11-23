/** Tipos de hallazgo de la auditoría del inventario (contrato portable: herramientas de agentes y app). */
export const CATALOG_AUDIT_CODES = [
  'missing_price', 'generic_only', 'stale_price', 'missing_datasheet', 'missing_image', 'missing_nominal',
  'duplicate_model', 'no_stock', 'price_outlier', 'unmatched_proposal_equipment',
] as const;
export type CatalogAuditCode = (typeof CATALOG_AUDIT_CODES)[number];

/** Etiqueta breve de cada tipo, para decir en la tarjeta qué filtro muestra. */
export const CATALOG_AUDIT_CODE_LABELS: Record<CatalogAuditCode, string> = {
  missing_price: 'sin precio', generic_only: 'solo precio genérico', stale_price: 'precio vencido', missing_datasheet: 'sin ficha',
  missing_image: 'sin imagen', missing_nominal: 'sin capacidad nominal', duplicate_model: 'duplicados', no_stock: 'sin stock',
  price_outlier: 'precio atípico', unmatched_proposal_equipment: 'fuera del catálogo',
};
