import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { formatMoney } from '../../../../shared/quotations';
import type { SolarEquipmentItem } from '../../../types/equipment';
import { CATALOG_PRICE_NOTICES, catalogItemDescription, catalogSalePrice, type CatalogLineContext } from '../../../features/quotations/catalogLine';

const TYPE_LABELS: Record<SolarEquipmentItem['type'], string> = { panel: 'Panel', inverter: 'Inversor', battery: 'Batería' };
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Selector con búsqueda sobre el catálogo de equipos. Muestra el precio de venta que tendría la línea (oferta con
 * margen, genérico señalado o sin precio) antes de elegir. `contextFor` se evalúa al abrir el selector.
 */
export const CatalogPicker: React.FC<{
  catalog: readonly SolarEquipmentItem[];
  contextFor: (item: SolarEquipmentItem) => CatalogLineContext;
  onPick: (item: SolarEquipmentItem) => void;
  onClose: () => void;
}> = ({ catalog, contextFor, onPick, onClose }) => {
  const id = useId();
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const matches = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return catalog
      .filter((item) => {
        const haystack = normalize([item.displayName, item.brand, item.modelSeries, TYPE_LABELS[item.type]].join(' '));
        return words.every((word) => haystack.includes(word));
      })
      .slice(0, 40)
      .map((item) => ({ item, context: contextFor(item) }))
      .map(({ item, context }) => ({ item, price: catalogSalePrice(item, context), currency: context.currency }));
  }, [catalog, query, contextFor]);
  return (
    <div className="qe-catalog" role="group" aria-labelledby={`${id}-title`} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <div className="qe-catalog-head">
        <h3 id={`${id}-title`}>Del catálogo de equipos</h3>
        <button type="button" className="qe-icon-btn" aria-label="Cerrar el catálogo" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="qe-field">
        <label htmlFor={`${id}-search`} className="sr-only">Buscar equipo</label>
        <span className="qe-search">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input ref={input} id={`${id}-search`} type="search" value={query} placeholder="Buscar por nombre, marca o tipo" autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
        </span>
      </div>
      {catalog.length === 0 ? (
        <p className="qe-muted">El catálogo de equipos está vacío.</p>
      ) : matches.length === 0 ? (
        <p className="qe-muted">Ningún equipo coincide con la búsqueda.</p>
      ) : (
        <ul className="qe-catalog-list" aria-label="Equipos encontrados">
          {matches.map(({ item, price, currency }) => (
            <li key={item.id}>
              <button type="button" onClick={() => onPick(item)}>
                <span className="qe-catalog-name">
                  <span>{catalogItemDescription(item)}</span>
                  <small>{TYPE_LABELS[item.type]}{price.priceSource === 'supplier' && price.supplierName ? ` · ${price.supplierName}` : ''}</small>
                </span>
                <span className="qe-catalog-price">
                  {price.priceSource === 'none' ? <small>Sin precio</small> : <span>{formatMoney(price.cents, currency)}</span>}
                  {price.priceSource === 'generic' && <small>{CATALOG_PRICE_NOTICES.generic}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="qe-field-hint">Precio de venta con el margen de los ajustes, en la moneda y tasa de esta cotización. Paneles e inversores entran sin ITBIS.</p>
    </div>
  );
};
