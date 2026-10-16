import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Search,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  Package,
} from "lucide-react";
import { useSimulationStore } from "../../store/useSimulationStore";
import type {
  EquipmentSupplierPrice,
  SolarEquipmentItem,
} from "../../types/equipment";
import { contentEqual } from "../../store/sync/projectDifferences";
import {
  STOCK_LABELS,
  offerKey,
  planSupplierOfferUpdates,
  type OfferReference,
  type StockStatus,
} from "../../utils/supplierOfferUpdates";
import { SupplierOfferRow } from "./suppliers/SupplierOfferRow";
import "./suppliers/suppliers.css";

type Props = { isDark: boolean };
type Offer = { equipment: SolarEquipmentItem; price: EquipmentSupplierPrice };
const normalized = (name: string) => name.trim().toLocaleLowerCase("es");
function writable(item?: SolarEquipmentItem) {
  const { syncSettings } = useSimulationStore.getState();
  const user = syncSettings.currentUser;
  return (
    (!user || ["ADMIN", "EDITOR"].includes(user.role)) &&
    (!item ||
      !user ||
      ((!item.organizationId || item.organizationId === user.organizationId) &&
        (!item.syncServerUrl ||
          item.syncServerUrl.replace(/\/+$/, "") ===
            syncSettings.serverUrl.replace(/\/+$/, ""))))
  );
}
export function SupplierManagerSection(props: Props) {
  const { workspaceScope, sessionGeneration, syncSettings } =
    useSimulationStore();
  return (
    <SupplierWorkspace
      key={`${workspaceScope}|${sessionGeneration}|${syncSettings.currentUser?.id || "local"}`}
      {...props}
    />
  );
}
function SupplierWorkspace({ isDark }: Props) {
  const { equipmentCatalog, equipmentChanges } = useSimulationStore();
  const [supplier, setSupplier] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [type, setType] = useState("all");
  const [stock, setStock] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStock, setBulkStock] = useState<StockStatus>("in_stock");
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [form, setForm] = useState<"new" | "add" | "rename" | null>(null);
  const [formName, setFormName] = useState("");
  const [formEquipment, setFormEquipment] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formStock, setFormStock] = useState<StockStatus>("in_stock");
  const [formNotes, setFormNotes] = useState("");
  const [confirmation, setConfirmation] = useState<{
    name: string;
    reference?: OfferReference;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; offers: Offer[] }>();
    equipmentCatalog.forEach((equipment) =>
      equipment.supplierPrices?.forEach((price) => {
        const key = normalized(price.supplierName);
        if (!key) return;
        if (!map.has(key))
          map.set(key, { name: price.supplierName.trim(), offers: [] });
        map.get(key)!.offers.push({ equipment, price });
      }),
    );
    return [...map.entries()].sort((a, b) =>
      a[1].name.localeCompare(b[1].name, "es"),
    );
  }, [equipmentCatalog]);
  const activeKey = groups.some(([key]) => key === supplier)
    ? supplier
    : groups[0]?.[0] || "";
  const active = groups.find(([key]) => key === activeKey)?.[1];
  const offers = active?.offers || [];
  const brands = [
    ...new Set(offers.map(({ equipment }) => equipment.brand || "Sin marca")),
  ].sort();
  const visible = offers.filter(
    ({ equipment, price }) =>
      (brand === "all" || (equipment.brand || "Sin marca") === brand) &&
      (type === "all" || equipment.type === type) &&
      (stock === "all" || (price.stockStatus || "consult") === stock) &&
      (!query.trim() ||
        normalized(
          `${equipment.displayName} ${equipment.brand} ${price.sku || ""}`,
        ).includes(normalized(query))),
  );
  const selectable = visible.filter(({ equipment }) => writable(equipment));
  const references = selectable.map(({ equipment, price }) => ({
    equipmentId: equipment.id,
    offerId: price.id,
  }));
  const selectedReferences = references.filter((reference) =>
    selected.has(offerKey(reference)),
  );
  const allSelected =
    references.length > 0 && selectedReferences.length === references.length;
  const canEdit = writable();
  const pending = offers.some(
    ({ equipment }) => equipmentChanges[equipment.id],
  );
  useEffect(() => {
    setSelected(new Set());
  }, [activeKey, query, brand, type, stock]);
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate =
        selectedReferences.length > 0 && !allSelected;
  }, [selectedReferences.length, allSelected]);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);
  const fail = (error: unknown) =>
    setFeedback({
      error: true,
      text:
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los cambios.",
    });
  function apply(
    references: OfferReference[],
    patch: { stockStatus?: StockStatus; priceUSD?: number },
    message: string,
  ) {
    try {
      const current = useSimulationStore.getState();
      if (
        !references.length ||
        references.some(
          (ref) =>
            !writable(
              current.equipmentCatalog.find(
                (item) => item.id === ref.equipmentId,
              ),
            ),
        )
      )
        throw new Error("Tu cuenta no puede modificar estas ofertas.");
      const updates = planSupplierOfferUpdates(
        current.equipmentCatalog,
        references,
        patch,
      );
      current.batchUpdateSupplierPrices(updates);
      const after = useSimulationStore.getState().equipmentCatalog;
      if (
        !updates.every((update) =>
          contentEqual(
            after
              .find((item) => item.id === update.equipmentId)
              ?.supplierPrices?.find(
                (price) => price.id === update.supplierPrice.id,
              ),
            update.supplierPrice,
          ),
        )
      )
        throw new Error(
          "No se confirmó el guardado local. Revisa los permisos y vuelve a intentarlo.",
        );
      setFeedback({
        error: false,
        text: `${message} Guardado en este equipo; la nube se actualizará al sincronizar.`,
      });
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }
  function saveOffer(
    reference: OfferReference,
    baseline: EquipmentSupplierPrice,
    price: string,
    sku: string,
    notes: string,
  ) {
    const current = useSimulationStore.getState();
    const item = current.equipmentCatalog.find(
      (item) => item.id === reference.equipmentId,
    );
    const latest = item?.supplierPrices?.find(
      (offer) => offer.id === reference.offerId,
    );
    try {
      if (!latest || !writable(item))
        throw new Error("La oferta ya no está disponible para editar.");
      if (!contentEqual(latest, baseline))
        throw new Error(
          "La oferta cambió mientras la editabas. Descarta tu borrador con la X y revisa los valores actuales.",
        );
      if (!price.trim() || !Number.isFinite(Number(price)) || Number(price) < 0)
        throw new Error(
          "Introduce un precio USD válido, igual o mayor que cero.",
        );
      const updates = planSupplierOfferUpdates(
        current.equipmentCatalog,
        [reference],
        Number(price) === latest.priceUSD ? {} : { priceUSD: Number(price) },
      );
      updates[0].supplierPrice = {
        ...updates[0].supplierPrice,
        sku: sku.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      current.batchUpdateSupplierPrices(updates);
      const saved = useSimulationStore
        .getState()
        .equipmentCatalog.find((item) => item.id === reference.equipmentId)
        ?.supplierPrices?.find((offer) => offer.id === reference.offerId);
      if (!contentEqual(saved, updates[0].supplierPrice))
        throw new Error("No se confirmó el guardado de la oferta.");
      setFeedback({
        error: false,
        text: "Oferta guardada en este equipo; pendiente de sincronización con la nube.",
      });
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }
  function openForm(mode: "new" | "add" | "rename") {
    setForm(mode);
    setFormName(mode === "rename" ? active?.name || "" : "");
    setFormEquipment("");
    setFormPrice("");
    setFormSku("");
    setFormNotes("");
    setFormStock("in_stock");
    setFeedback(null);
  }
  function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (!writable()) return;
    const current = useSimulationStore.getState();
    if (form === "rename") {
      const next = formName.trim();
      if (!next || !active) return;
      if (
        groups.some(([key]) => key === normalized(next) && key !== activeKey)
      ) {
        fail(
          new Error(
            "Ya existe un proveedor con ese nombre. Elige uno diferente.",
          ),
        );
        return;
      }
      if (offers.some(({ equipment }) => !writable(equipment))) {
        fail(new Error("No puedes renombrar ofertas de otra organización."));
        return;
      }
      current.renameSupplier(active.name, next);
      setSupplier(normalized(next));
    } else {
      const name = form === "new" ? formName.trim() : active?.name || "";
      if (
        !name ||
        !formEquipment ||
        !formPrice.trim() ||
        !Number.isFinite(Number(formPrice)) ||
        Number(formPrice) < 0
      ) {
        fail(new Error("Completa proveedor, equipo y un precio válido."));
        return;
      }
      if (form === "new" && groups.some(([key]) => key === normalized(name))) {
        fail(
          new Error(
            "Ese proveedor ya existe. Selecciónalo y añade una oferta.",
          ),
        );
        return;
      }
      const item = current.equipmentCatalog.find(
        (item) => item.id === formEquipment,
      );
      if (
        !item ||
        !writable(item) ||
        item.supplierPrices?.some(
          (price) => normalized(price.supplierName) === normalized(name),
        )
      ) {
        fail(
          new Error(
            "Ese equipo ya tiene oferta de este proveedor o no permite edición.",
          ),
        );
        return;
      }
      const id = `sp-${crypto.randomUUID()}`;
      current.addOrUpdateSupplierPrice(formEquipment, {
        id,
        supplierName: name,
        priceUSD: Number(formPrice),
        currency: "USD",
        sku: formSku.trim() || undefined,
        stockStatus: formStock,
        notes: formNotes.trim() || undefined,
        source: "manual",
      });
      if (
        !useSimulationStore
          .getState()
          .equipmentCatalog.find((item) => item.id === formEquipment)
          ?.supplierPrices?.some((price) => price.id === id)
      ) {
        fail(new Error("No se pudo guardar la oferta."));
        return;
      }
      setSupplier(normalized(name));
      setQuery("");
      setBrand("all");
      setType("all");
      setStock("all");
    }
    setForm(null);
    setSelected(new Set());
    setFeedback({
      error: false,
      text: "Cambios guardados en este equipo; se enviarán al sincronizar.",
    });
  }
  function confirmRemoval() {
    const current = useSimulationStore.getState();
    if (!confirmation || !writable()) return;
    if (confirmation.reference) {
      const ref = confirmation.reference;
      if (
        !writable(
          current.equipmentCatalog.find((item) => item.id === ref.equipmentId),
        )
      )
        return;
      current.removeSupplierPrice(ref.equipmentId, ref.offerId);
    } else {
      const affected = current.equipmentCatalog.filter((item) =>
        item.supplierPrices?.some(
          (price) =>
            normalized(price.supplierName) === normalized(confirmation.name),
        ),
      );
      if (affected.some((item) => !writable(item))) {
        fail(new Error("No puedes eliminar ofertas de otra organización."));
        setConfirmation(null);
        return;
      }
      current.deleteSupplier(confirmation.name);
    }
    setConfirmation(null);
    setSelected(new Set());
    setFeedback({
      error: false,
      text: "Ofertas retiradas del catálogo local. Los equipos y las propuestas se conservan.",
    });
  }
  const availableEquipment = equipmentCatalog.filter(
    (item) =>
      writable(item) &&
      (form === "new" ||
        !item.supplierPrices?.some(
          (price) => normalized(price.supplierName) === activeKey,
        )),
  );
  return (
    <section
      className="suppliers-workspace"
      data-theme={isDark ? "dark" : "light"}
      aria-label="Administración de proveedores"
    >
      <header className="suppliers-heading">
        <div>
          <h4>Proveedores y ofertas</h4>
          <p>Actualiza precios de compra y disponibilidad por proveedor.</p>
        </div>

      </header>
      {feedback && (
        <div
          className={`supplier-feedback ${feedback.error ? "supplier-error" : ""}`}
          role={feedback.error ? "alert" : "status"}
        >
          <span>{feedback.text}</span>
          <button
            className="supplier-icon"
            aria-label="Cerrar aviso"
            onClick={() => setFeedback(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="suppliers-layout">
        <aside className="supplier-directory" aria-label="Proveedores">
          <div className="supplier-directory-heading">
            <span>
              Proveedores{" "}
              <span className="supplier-count">{groups.length}</span>
            </span>
          </div>
          <label className="supplier-search">
            <Search size={16} />
            <input
              aria-label="Buscar proveedor"
              placeholder="Buscar proveedor…"
              value={supplierQuery}
              onChange={(event) => setSupplierQuery(event.target.value)}
            />
          </label>
          <nav>
            {groups
              .filter(([, group]) =>
                normalized(group.name).includes(normalized(supplierQuery)),
              )
              .map(([key, group]) => (
                <button
                  key={key}
                  className="supplier-directory-item"
                  aria-current={activeKey === key ? "true" : undefined}
                  onClick={() => {
                    setSupplier(key);
                    setForm(null);
                    setBrand("all");
                    setType("all");
                    setStock("all");
                    setQuery("");
                    setFeedback(null);
                  }}
                >
                  <Building2 size={18} />
                  <span>
                    <strong>{group.name}</strong>
                    <small>
                      {group.offers.length}{" "}
                      {group.offers.length === 1
                        ? "equipo cotizado"
                        : "equipos cotizados"}
                    </small>
                  </span>
                </button>
              ))}
          </nav>
          {!groups.length && (
            <p className="supplier-directory-empty">
              Registra un proveedor con su primera oferta.
            </p>
          )}
          {!!groups.length &&
            !groups.some(([, group]) =>
              normalized(group.name).includes(normalized(supplierQuery)),
            ) && (
              <p className="supplier-directory-empty">
                No hay proveedores con ese nombre.
              </p>
            )}
          <button
            className="supplier-button supplier-create"
            disabled={!canEdit}
            onClick={() => openForm("new")}
          >
            <Plus size={16} />
            Nuevo proveedor
          </button>
        </aside>
        <div className="supplier-content">
          {active && (
            <header className="supplier-content-heading">
              <div>
                <h5>{active.name}</h5>
                <p>
                  {offers.length} {offers.length === 1 ? "oferta" : "ofertas"} ·{" "}
                  {
                    offers.filter(
                      ({ price }) => price.stockStatus === "in_stock",
                    ).length
                  }{" "}
                  en stock{pending ? " · Cambios locales pendientes" : ""}
                </p>
              </div>
              <div className="supplier-heading-actions">
                <button
                  className="supplier-icon"
                  disabled={!canEdit}
                  onClick={() => openForm("rename")}
                  aria-label="Renombrar proveedor"
                  title="Renombrar proveedor"
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="supplier-icon supplier-danger"
                  disabled={!canEdit}
                  onClick={() => setConfirmation({ name: active.name })}
                  aria-label="Eliminar proveedor"
                  title="Eliminar proveedor"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  className="supplier-button supplier-primary"
                  disabled={!canEdit}
                  onClick={() => openForm("add")}
                >
                  <Plus size={16} />
                  Añadir oferta
                </button>
              </div>
            </header>
          )}
          {form && (
            <form className="supplier-form" onSubmit={submitForm}>
              <div className="supplier-form-heading">
                <h5>
                  {form === "new"
                    ? "Nuevo proveedor"
                    : form === "rename"
                      ? "Renombrar proveedor"
                      : `Añadir oferta · ${active?.name}`}
                </h5>
                <button
                  type="button"
                  className="supplier-icon"
                  onClick={() => setForm(null)}
                  aria-label="Cerrar formulario"
                >
                  <X size={18} />
                </button>
              </div>
              {form === "new" && (
                <p>El proveedor se registra al guardar su primera oferta.</p>
              )}
              <div className="supplier-form-fields">
                {form !== "add" && (
                  <label>
                    Nombre del proveedor
                    <input
                      autoFocus
                      required
                      maxLength={255}
                      value={formName}
                      onChange={(event) => setFormName(event.target.value)}
                    />
                  </label>
                )}
                {form !== "rename" && (
                  <>
                    <label className="supplier-field-wide">
                      Equipo
                      <select
                        required
                        value={formEquipment}
                        onChange={(event) =>
                          setFormEquipment(event.target.value)
                        }
                      >
                        <option value="">Seleccionar equipo…</option>
                        {availableEquipment.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Precio unitario (USD)
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={formPrice}
                        onChange={(event) => setFormPrice(event.target.value)}
                      />
                    </label>
                    <label>
                      Disponibilidad
                      <select
                        value={formStock}
                        onChange={(event) =>
                          setFormStock(event.target.value as StockStatus)
                        }
                      >
                        {Object.entries(STOCK_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      SKU
                      <input
                        value={formSku}
                        onChange={(event) => setFormSku(event.target.value)}
                      />
                    </label>
                    <label>
                      Notas
                      <input
                        value={formNotes}
                        onChange={(event) => setFormNotes(event.target.value)}
                      />
                    </label>
                  </>
                )}
              </div>
              {form !== "rename" && !availableEquipment.length && (
                <p>
                  No hay equipos disponibles para añadir. Todos tienen una
                  oferta de este proveedor o son de solo lectura.
                </p>
              )}
              <div className="supplier-form-actions">
                <button
                  type="button"
                  className="supplier-button"
                  onClick={() => setForm(null)}
                >
                  Cancelar
                </button>
                <button
                  className="supplier-button supplier-primary"
                  disabled={
                    !canEdit ||
                    (form !== "rename" && !availableEquipment.length)
                  }
                >
                  <Check size={16} />
                  Guardar {form === "rename" ? "nombre" : "oferta"}
                </button>
              </div>
            </form>
          )}
          {active ? (
            <>
              <div className="supplier-filters">
                <label className="supplier-search">
                  <Search size={16} />
                  <input
                    aria-label="Buscar equipos del proveedor"
                    placeholder="Buscar equipo, marca o SKU…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <select
                  aria-label="Filtrar por tipo"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="all">Todos los tipos</option>
                  <option value="panel">Paneles</option>
                  <option value="inverter">Inversores</option>
                  <option value="battery">Baterías</option>
                </select>
                <select
                  aria-label="Filtrar por marca"
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                >
                  <option value="all">Todas las marcas</option>
                  {brands.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar por disponibilidad"
                  value={stock}
                  onChange={(event) => setStock(event.target.value)}
                >
                  <option value="all">Toda disponibilidad</option>
                  {Object.entries(STOCK_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div
                className="supplier-bulk"
                data-active={selectedReferences.length > 0 || undefined}
              >
                {selectedReferences.length ? (
                  <>
                    <strong>
                      {selectedReferences.length}{" "}
                      {selectedReferences.length === 1
                        ? "seleccionado"
                        : "seleccionados"}
                    </strong>
                    <label>
                      <span className="sr-only">
                        Disponibilidad para la selección
                      </span>
                      <select
                        value={bulkStock}
                        onChange={(event) =>
                          setBulkStock(event.target.value as StockStatus)
                        }
                      >
                        {Object.entries(STOCK_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="supplier-button supplier-primary"
                      disabled={!canEdit}
                      onClick={() => {
                        if (
                          apply(
                            selectedReferences,
                            { stockStatus: bulkStock },
                            `Disponibilidad actualizada en ${selectedReferences.length} ofertas.`,
                          )
                        )
                          setSelected(new Set());
                      }}
                    >
                      Aplicar a seleccionados
                    </button>
                    <button
                      className="supplier-button"
                      onClick={() => setSelected(new Set())}
                    >
                      Deseleccionar
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      {visible.length} de {offers.length}{" "}
                      {offers.length === 1 ? "oferta" : "ofertas"}
                    </span>
                    <span>
                      {canEdit
                        ? "Selecciona equipos para cambiar su disponibilidad en lote."
                        : "Ofertas en modo de solo lectura."}
                    </span>
                  </>
                )}
              </div>
              <div className="supplier-table-scroll">
                <table className="supplier-table">
                  <caption className="sr-only">
                    Ofertas de {active.name}. Precios unitarios en USD.
                  </caption>
                  <thead>
                    <tr>
                      <th>
                        <input
                          ref={selectAll}
                          type="checkbox"
                          aria-label="Seleccionar todos los equipos visibles"
                          disabled={!canEdit || !references.length}
                          checked={allSelected}
                          onChange={() =>
                            setSelected(
                              allSelected
                                ? new Set()
                                : new Set(references.map(offerKey)),
                            )
                          }
                        />
                      </th>
                      <th>Equipo</th>
                      <th>Disponibilidad</th>
                      <th>Precio / ud. (USD)</th>
                      <th>Actualización</th>
                      <th>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(({ equipment, price }) => {
                      const reference = {
                        equipmentId: equipment.id,
                        offerId: price.id,
                      };
                      const key = offerKey(reference);
                      return (
                        <SupplierOfferRow
                          key={key}
                          equipment={equipment}
                          offer={price}
                          selected={selected.has(key)}
                          disabled={!writable(equipment)}
                          onSelect={() =>
                            setSelected((previous) => {
                              const next = new Set(previous);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                          onStock={(stockStatus) => {
                            const saved = apply(
                              [reference],
                              { stockStatus },
                              "Disponibilidad actualizada.",
                            );
                            return saved
                              ? useSimulationStore
                                  .getState()
                                  .equipmentCatalog.find(
                                    (item) => item.id === reference.equipmentId,
                                  )
                                  ?.supplierPrices?.find(
                                    (price) => price.id === reference.offerId,
                                  )
                              : undefined;
                          }}
                          onSave={(baseline, price, sku, notes) =>
                            saveOffer(reference, baseline, price, sku, notes)
                          }
                          onRemove={() =>
                            setConfirmation({
                              name: equipment.displayName,
                              reference,
                            })
                          }
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!visible.length && (
                <div className="supplier-empty">
                  <Package size={28} />
                  <h5>No hay ofertas con estos filtros</h5>
                  <p>
                    Prueba otra búsqueda o restablece los filtros del proveedor.
                  </p>
                  <button
                    className="supplier-button"
                    onClick={() => {
                      setQuery("");
                      setBrand("all");
                      setType("all");
                      setStock("all");
                    }}
                  >
                    Restablecer filtros
                  </button>
                </div>
              )}
            </>
          ) : (
            !form && (
              <div className="supplier-empty">
                <Building2 size={32} />
                <h5>Organiza tus ofertas por proveedor</h5>
                <p>
                  Añade la primera oferta para administrar precios y
                  disponibilidad desde aquí.
                </p>
                <button
                  className="supplier-button supplier-primary"
                  disabled={!canEdit}
                  onClick={() => openForm("new")}
                >
                  <Plus size={16} />
                  Crear proveedor
                </button>
              </div>
            )
          )}
        </div>
      </div>
      <dialog
        ref={dialog}
        className="supplier-dialog"
        onCancel={() => setConfirmation(null)}
        onClose={() => setConfirmation(null)}
        aria-labelledby="supplier-removal-title"
      >
        <h4 id="supplier-removal-title">
          {confirmation?.reference
            ? "¿Quitar esta oferta?"
            : "¿Eliminar proveedor?"}
        </h4>
        <p>
          <strong>{confirmation?.name}</strong>
        </p>
        <p>
          {confirmation?.reference
            ? "Se retirará esta oferta del catálogo."
            : "Se retirarán todas las ofertas de este proveedor."}{" "}
          Los equipos y las propuestas existentes se conservan.
        </p>
        <div className="supplier-form-actions">
          <button
            className="supplier-button"
            autoFocus
            onClick={() => setConfirmation(null)}
          >
            Cancelar
          </button>
          <button
            className="supplier-button supplier-delete"
            onClick={confirmRemoval}
          >
            Eliminar {confirmation?.reference ? "oferta" : "proveedor"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
