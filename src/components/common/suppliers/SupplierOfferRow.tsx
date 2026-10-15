import { useEffect, useRef, useState } from "react";
import { Check, X, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { contentEqual } from "../../../store/sync/projectDifferences";
import type {
  EquipmentSupplierPrice,
  SolarEquipmentItem,
} from "../../../types/equipment";
import {
  STOCK_LABELS,
  type StockStatus,
} from "../../../utils/supplierOfferUpdates";

export function SupplierOfferRow({
  equipment,
  offer,
  selected,
  disabled,
  onSelect,
  onStock,
  onSave,
  onRemove,
}: {
  equipment: SolarEquipmentItem;
  offer: EquipmentSupplierPrice;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onStock: (stock: StockStatus) => EquipmentSupplierPrice | undefined;
  onSave: (
    baseline: EquipmentSupplierPrice,
    price: string,
    sku: string,
    notes: string,
  ) => boolean;
  onRemove: () => void;
}) {
  const [price, setPrice] = useState(String(offer.priceUSD));
  const [sku, setSku] = useState(offer.sku || "");
  const [notes, setNotes] = useState(offer.notes || "");
  const [details, setDetails] = useState(false);
  const baseline = useRef(offer);
  const dirty =
    price.trim() === "" ||
    Number(price) !== baseline.current.priceUSD ||
    sku !== (baseline.current.sku || "") ||
    notes !== (baseline.current.notes || "");
  useEffect(() => {
    if (!dirty) {
      baseline.current = offer;
      setPrice(String(offer.priceUSD));
      setSku(offer.sku || "");
      setNotes(offer.notes || "");
    }
  }, [offer, dirty]);
  const date = new Date(offer.updatedAt);
  return (
    <>
      <tr data-selected={selected || undefined}>
        <td>
          <input
            type="checkbox"
            aria-label={`Seleccionar ${equipment.displayName}`}
            checked={selected}
            disabled={disabled}
            onChange={onSelect}
          />
        </td>
        <td className="supplier-model">
          <strong>{equipment.displayName}</strong>
          <span>
            {equipment.brand || "Sin marca"} ·{" "}
            {equipment.type === "panel"
              ? "Panel"
              : equipment.type === "inverter"
                ? "Inversor"
                : "Batería"}
            {offer.sku ? ` · ${offer.sku}` : ""}
          </span>
          {offer.notes && !details && (
            <span className="supplier-note">{offer.notes}</span>
          )}
        </td>
        <td>
          <select
            aria-label={`Disponibilidad de ${equipment.displayName}`}
            className={`supplier-stock supplier-stock-${offer.stockStatus || "consult"}`}
            value={offer.stockStatus || "consult"}
            disabled={disabled}
            onChange={(event) => {
              const unchanged = contentEqual(offer, baseline.current);
              const saved = onStock(event.target.value as StockStatus);
              // This row's own stock edit may coexist with its unsaved price/SKU draft.
              if (saved && unchanged) baseline.current = saved;
            }}
          >
            {Object.entries(STOCK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </td>
        <td>
          <form
            className="supplier-price"
            onSubmit={(event) => {
              event.preventDefault();
              if (onSave(baseline.current, price, sku, notes)) {
                baseline.current = {
                  ...offer,
                  priceUSD: Number(price),
                  sku: sku.trim(),
                  notes: notes.trim(),
                };
                setPrice(String(Number(price)));
                setSku(sku.trim());
                setNotes(notes.trim());
              }
            }}
          >
            <label>
              <span className="sr-only">
                Precio USD de {equipment.displayName}
              </span>
              <span aria-hidden="true">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                disabled={disabled}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="supplier-icon"
              disabled={disabled || !dirty}
              aria-label={`Guardar oferta de ${equipment.displayName}`}
              title="Guardar precio y detalles"
            >
              <Check size={16} />
            </button>
            <button
              type="button"
              className="supplier-icon"
              disabled={!dirty}
              aria-label={`Descartar cambios de ${equipment.displayName}`}
              onClick={() => {
                baseline.current = offer;
                setPrice(String(offer.priceUSD));
                setSku(offer.sku || "");
                setNotes(offer.notes || "");
              }}
              title="Descartar cambios"
            >
              <X size={14} />
            </button>
          </form>
          {dirty && <span className="supplier-pending">Sin guardar</span>}
          {offer.currency === "DOP" && (
            <span className="supplier-original">
              Original: RD$ {offer.priceDOP?.toLocaleString("es-DO")}
            </span>
          )}
        </td>
        <td className="supplier-date">
          {Number.isNaN(date.getTime())
            ? "Sin fecha"
            : date.toLocaleDateString("es-DO", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
        </td>
        <td>
          <div className="supplier-row-actions">
            <button
              className="supplier-icon"
              type="button"
              onClick={() => setDetails(!details)}
              aria-expanded={details}
              aria-label={`Detalles de ${equipment.displayName}`}
              title="Editar SKU y notas"
            >
              {details ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button
              className="supplier-icon supplier-danger"
              disabled={disabled}
              type="button"
              onClick={onRemove}
              aria-label={`Quitar oferta de ${equipment.displayName}`}
              title="Quitar oferta"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      </tr>
      {details && (
        <tr>
          <td colSpan={6}>
            <div className="supplier-offer-details">
              <label>
                SKU del proveedor
                <input
                  disabled={disabled}
                  value={sku}
                  onChange={(event) => setSku(event.target.value)}
                />
              </label>
              <label>
                Notas de la oferta
                <input
                  disabled={disabled}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <p>
                Guarda los cambios con el botón junto al precio.
                {offer.currency === "DOP"
                  ? " Editar el precio USD sustituye el importe original en DOP."
                  : ""}
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
