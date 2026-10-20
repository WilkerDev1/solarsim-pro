import { canWrite } from '../../../shared/permissions';
import { useEffect, useRef, useState } from "react";
import {
  X,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Sparkles,
  Building2,
} from "lucide-react";
import { useSimulationStore } from "../../store/useSimulationStore";
import type {
  EquipmentSupplierPrice,
  SolarEquipmentItem,
} from "../../types/equipment";
import { STOCK_LABELS } from "../../utils/supplierOfferUpdates";
import { canEditCommercial } from "../../features/proposals/commercial";
import { contentEqual } from "../../store/sync/projectDifferences";
import "./suppliers/suppliers.css";
import "./suppliers/equipment-offers.css";
import { confirmAction } from "./confirmAction";

export function SupplierPricesDetailModal() {
  const { supplierPriceModalEquipment, workspaceScope, sessionGeneration } =
    useSimulationStore();
  if (!supplierPriceModalEquipment) return null;
  return (
    <EquipmentOffers
      key={`${workspaceScope}|${sessionGeneration}|${supplierPriceModalEquipment.id}`}
      equipmentId={supplierPriceModalEquipment.id}
    />
  );
}
function EquipmentOffers({ equipmentId }: { equipmentId: string }) {
  const state = useSimulationStore();
  const item = state.equipmentCatalog.find((item) => item.id === equipmentId);
  const dialog = useRef<HTMLDialogElement>(null);
  const [editor, setEditor] = useState<{
    id?: string;
    original?: EquipmentSupplierPrice;
  } | null>(null);
  const [supplier, setSupplier] = useState("");
  const [price, setPrice] = useState("");
  const [sku, setSku] = useState("");
  const [notes, setNotes] = useState("");
  const [stock, setStock] =
    useState<NonNullable<EquipmentSupplierPrice["stockStatus"]>>("in_stock");
  const [feedback, setFeedback] = useState("");
  const user = state.syncSettings.currentUser;
  const writable =
    !!item &&
    !state.equipmentConflicts[equipmentId] &&
    (canWrite(user)) &&
    (!user ||
      ((!item.organizationId || item.organizationId === user.organizationId) &&
        (!item.syncServerUrl ||
          item.syncServerUrl.replace(/\/+$/, "") ===
            state.syncSettings.serverUrl.replace(/\/+$/, ""))));
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const dirty =
    !!editor &&
    (supplier !== (editor.original?.supplierName || "") ||
      price !== (editor.original ? String(editor.original.priceUSD) : "") ||
      sku !== (editor.original?.sku || "") ||
      notes !== (editor.original?.notes || "") ||
      stock !== (editor.original?.stockStatus || "in_stock"));
  const abandon = async () =>
    !dirty || confirmAction({ title: "Descartar oferta", message: "¿Descartar la oferta sin guardar?", confirmLabel: "Descartar", tone: "danger" });
  const close = async () => {
    if (await abandon()) state.closeSupplierPriceModal();
  };
  const open = (offer?: EquipmentSupplierPrice) => {
    setEditor({
      id: offer?.id,
      original: offer ? structuredClone(offer) : undefined,
    });
    setSupplier(offer?.supplierName || "");
    setPrice(offer ? String(offer.priceUSD) : "");
    setSku(offer?.sku || "");
    setNotes(offer?.notes || "");
    setStock(offer?.stockStatus || "in_stock");
    setFeedback("");
  };
  const offers = item?.supplierPrices || [];
  const names = [
    ...new Set(
      state.equipmentCatalog.flatMap(
        (item) => item.supplierPrices?.map((offer) => offer.supplierName) || [],
      ),
    ),
  ].sort();
  const project = state.projects.find(
    (project) => project.id === state.activeProjectId && !project.isDeleted,
  );
  const canApply =
    !!project &&
    state.activeView === "simulator" &&
    !state.isSettingsModalOpen &&
    canEditCommercial(project, state.syncSettings);
  return (
    <dialog
      ref={dialog}
      className="equipment-offers suppliers-workspace"
      data-theme={state.sidebarTheme}
      aria-labelledby="equipment-offers-title"
      onCancel={(event) => {
        event.preventDefault();
        void close();
      }}
    >
      <header className="offers-header">
        <div>
          <h2 id="equipment-offers-title">Ofertas de proveedores</h2>
          <p>{item?.displayName || "Equipo no disponible"}</p>
          <small>{item?.brand} · Precio de compra por unidad · USD</small>
        </div>
        <button
          className="supplier-icon"
          aria-label="Cerrar ofertas"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="offers-body">
        {!item ? (
          <p role="alert">
            Este equipo ya no está en el catálogo. Cierra la ventana y revisa la
            lista actual.
          </p>
        ) : editor ? (
          <form id="equipment-offer-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!writable) return;
              const value = Number(price);
              if (!supplier.trim() || !Number.isFinite(value) || value <= 0) {
                setFeedback("Escribe un proveedor y un precio mayor que cero.");
                return;
              }
              const latest = useSimulationStore
                .getState()
                .equipmentCatalog.find((item) => item.id === equipmentId);
              if (
                !latest ||
                (editor.id &&
                  !contentEqual(
                    latest.supplierPrices?.find(
                      (offer) => offer.id === editor.id,
                    ),
                    editor.original,
                  ))
              ) {
                setFeedback(
                  "La oferta cambió mientras editabas. Vuelve a la lista para cargarla de nuevo.",
                );
                return;
              }
              const duplicate = latest.supplierPrices?.some(
                (offer) =>
                  offer.id !== editor.id &&
                  offer.supplierName.trim().toLocaleLowerCase() ===
                    supplier.trim().toLocaleLowerCase(),
              );
              if (duplicate) {
                setFeedback(
                  "Este proveedor ya tiene una oferta para el equipo. Edita su oferta desde la lista.",
                );
                return;
              }
              state.addOrUpdateSupplierPrice(equipmentId, {
                id: editor.id,
                supplierName: supplier.trim(),
                priceUSD: value,
                sku: sku.trim() || undefined,
                notes: notes.trim() || undefined,
                stockStatus: stock,
                source: "manual",
              });
              const saved = useSimulationStore
                .getState()
                .equipmentCatalog.find((item) => item.id === equipmentId)
                ?.supplierPrices?.find(
                  (offer) => offer.supplierName === supplier.trim(),
                );
              if (
                !saved ||
                saved.priceUSD !== value ||
                saved.stockStatus !== stock
              ) {
                setFeedback(
                  "No se pudo guardar. Revisa tus permisos y vuelve a intentarlo.",
                );
                return;
              }
              setEditor(null);
              setFeedback(
                "Oferta guardada en este equipo. La sincronización del catálogo enviará los cambios pendientes.",
              );
            }}
          >
            <button
              type="button"
              className="offers-back"
              onClick={async () => {
                if (await abandon()) {
                  setEditor(null);
                  setFeedback("");
                }
              }}
            >
              <ArrowLeft size={15} />
              Volver a ofertas
            </button>
            <h3>{editor.id ? "Editar oferta" : "Agregar oferta"}</h3>
            <p className="offers-intro">
              Asocia este equipo a un proveedor y registra sus condiciones de
              compra.
            </p>
            <div className="offers-fields">
              <label>
                Proveedor
                <input
                  autoFocus
                  required
                  maxLength={160}
                  list="equipment-offer-suppliers"
                  value={supplier}
                  disabled={!writable}
                  onChange={(event) => setSupplier(event.target.value)}
                  placeholder="Selecciona o escribe un nombre"
                />
                <datalist id="equipment-offer-suppliers">
                  {names.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
              <label>
                Precio unitario (USD)
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={price}
                  disabled={!writable}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                Disponibilidad
                <select
                  value={stock}
                  disabled={!writable}
                  onChange={(event) =>
                    setStock(event.target.value as typeof stock)
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
                SKU / código <span>Opcional</span>
                <input
                  value={sku}
                  maxLength={160}
                  disabled={!writable}
                  onChange={(event) => setSku(event.target.value)}
                />
              </label>
              <label className="offers-wide">
                Condiciones y notas <span>Opcional</span>
                <textarea
                  rows={3}
                  value={notes}
                  maxLength={2000}
                  disabled={!writable}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Cantidad mínima, plazo de entrega o condiciones del precio"
                />
              </label>
            </div>
            {feedback && (
              <p role="alert" className="offers-feedback">
                {feedback}
              </p>
            )}

          </form>
        ) : (
          <>
            <div className="offers-toolbar">
              <p>
                {offers.length}{" "}
                {offers.length === 1
                  ? "oferta registrada"
                  : "ofertas registradas"}
              </p>
              <button
                className="supplier-button"
                disabled={!writable}
                onClick={() => {
                  state.closeSupplierPriceModal();
                  state.openAIPriceCatalogModal();
                }}
              >
                <Sparkles size={15} />
                Importar precios con IA
              </button>
              {offers.length > 0 && (
                <button
                  className="supplier-button supplier-primary"
                  disabled={!writable}
                  onClick={() => open()}
                >
                  <Plus size={15} />
                  Agregar oferta
                </button>
              )}
            </div>
            {feedback && (
              <p role="status" className="offers-feedback">
                {feedback}
              </p>
            )}
            {!offers.length ? (
              <div className="offers-empty">
                <Building2 size={28} />
                <h3>Este equipo aún no tiene ofertas</h3>
                <p>
                  Agrega un precio de compra para compararlo y usarlo en tus
                  cotizaciones.
                </p>
                <button
                  className="supplier-button supplier-primary"
                  disabled={!writable}
                  onClick={() => open()}
                >
                  <Plus size={16} />
                  Agregar primera oferta
                </button>
              </div>
            ) : (
              <div className="offers-list">
                {[...offers]
                  .sort((a, b) => a.priceUSD - b.priceUSD)
                  .map((offer) => (
                    <article key={offer.id}>
                      <div>
                        <h3>{offer.supplierName}</h3>
                        <p>
                          {STOCK_LABELS[offer.stockStatus || "consult"]} ·{" "}
                          {new Date(offer.updatedAt).toLocaleDateString(
                            "es-DO",
                          )}
                        </p>
                        {offer.sku && <small>SKU: {offer.sku}</small>}
                        {offer.notes && <p>{offer.notes}</p>}
                      </div>
                      <div className="offers-price">
                        <strong>
                          {offer.priceUSD.toLocaleString("es-DO", {
                            style: "currency",
                            currency: "USD",
                          })}
                        </strong>
                        <small>USD / unidad</small>
                        <div className="offers-row-actions">
                          {canApply && (
                            <button
                              className="supplier-button"
                              onClick={() => {
                                state.applySupplierPriceToProject(
                                  item.type,
                                  offer,
                                  item,
                                );
                                setFeedback(
                                  "Precio aplicado a la propuesta activa.",
                                );
                              }}
                            >
                              Usar precio
                            </button>
                          )}
                          <button
                            className="supplier-icon"
                            disabled={!writable}
                            aria-label={`Editar oferta de ${offer.supplierName}`}
                            onClick={() => open(offer)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="supplier-icon"
                            disabled={!writable}
                            aria-label={`Eliminar oferta de ${offer.supplierName}`}
                            onClick={async () => {
                              if (
                                await confirmAction({
                                  title: "Eliminar oferta",
                                  message: `¿Eliminar la oferta de ${offer.supplierName} para este equipo?`,
                                  confirmLabel: "Eliminar",
                                  tone: "danger",
                                })
                              )
                                state.removeSupplierPrice(
                                  equipmentId,
                                  offer.id,
                                );
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            )}
          </>
        )}
        {!writable && (
          <p className="offers-feedback">
            Solo lectura: revisa tus permisos o un conflicto pendiente del
            catálogo.
          </p>
        )}
      </div>
      <footer className="offers-footer">
        <p>
          Los precios se guardan localmente. Se envían al sincronizar el
          catálogo con tu organización.
        </p>
        {editor && (            <div className="offers-actions offers-footer-actions">
              <button
                type="button"
                className="supplier-button"
                onClick={async () => {
                  if (await abandon()) setEditor(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="submit" form="equipment-offer-form"
                className="supplier-button supplier-primary"
                disabled={!writable}
              >
                {editor.id ? "Guardar cambios" : "Guardar oferta"}
              </button>
            </div>)}
        {!editor && (
          <button className="supplier-button" onClick={close}>
            Cerrar
          </button>
        )}
      </footer>
    </dialog>
  );
}
