import React from "react";
import { Trash2 } from "lucide-react";
import type { SolarEquipmentItem } from "../../../types/equipment";
import { EquipmentPreviewThumb } from "./EquipmentPreviewThumb";
import type { EquipmentSlice } from "../../../store/types";

type EquipmentConflict = EquipmentSlice["equipmentConflicts"][string];

/** One model of the catalog table, plus its sync-conflict row when the server disagrees. */
export function CatalogEquipmentRow({
  item,
  conflict,
  canEdit,
  button,
  handleOpenEdit,
  openSupplierPriceModal,
  setItemToDelete,
  resolveEquipmentConflict,
}: {
  item: SolarEquipmentItem;
  conflict?: EquipmentConflict;
  canEdit: boolean;
  button: string;
  handleOpenEdit: (item: SolarEquipmentItem) => void;
  openSupplierPriceModal: (item: SolarEquipmentItem) => void;
  setItemToDelete: (item: SolarEquipmentItem) => void;
  resolveEquipmentConflict: (
    id: string,
    resolution: "accept_server" | "keep_local" | "fork",
  ) => void;
}) {
  const prices = (item.supplierPrices || []).filter(
    (offer) =>
      Number.isFinite(offer.priceUSD) &&
      offer.priceUSD > 0 &&
      offer.stockStatus !== "out_of_stock",
  );
  const nominal =
    item.type === "panel"
      ? `${item.powerW ?? "—"} Wp`
      : item.type === "inverter"
        ? `${item.powerKW ?? "—"} kW AC`
        : `${item.capacityKWh ?? "—"} kWh`;
  return (
    <>
      <tr className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
        <td className="max-w-sm px-4 py-3">
          <div className="flex items-start gap-3">
            <EquipmentPreviewThumb item={item} />
            <div className="min-w-0">
              <button
                onClick={() => handleOpenEdit(item)}
                className={`text-left font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-emerald-500 text-slate-900 dark:text-zinc-100`}
              >
                {item.displayName}
              </button>
              <p className={`mt-1 text-xs text-slate-600 dark:text-zinc-400`}>
                {item.brand || "Sin marca"} · {item.modelSeries || "Sin modelo"}{" "}
                ·{" "}
                {item.type === "panel"
                  ? "Panel"
                  : item.type === "inverter"
                    ? "Inversor"
                    : "Batería"}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 tabular-nums">
          <span className="font-medium">{nominal}</span>
          <p className={`mt-1 text-xs text-slate-600 dark:text-zinc-400`}>
            {item.type === "panel"
              ? item.efficiencyPct !== undefined
                ? `${item.efficiencyPct}% eficiencia`
                : "Eficiencia sin dato"
              : item.type === "inverter"
                ? item.mpptCount !== undefined
                  ? `${item.mpptCount} MPPT`
                  : "MPPT sin dato"
                : item.dodPct !== undefined
                  ? `${item.dodPct}% DoD`
                  : "DoD sin dato"}
          </p>
        </td>
        <td className="px-4 py-3">
          <button
            className="text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-emerald-500"
            onClick={() => openSupplierPriceModal(item)}
          >
            {prices.length
              ? `$${Math.min(...prices.map((p) => p.priceUSD)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "Sin precio disponible"}
          </button>
          <p className={`mt-1 text-xs text-slate-600 dark:text-zinc-400`}>
            {item.supplierPrices?.length || 0} ofertas registradas
          </p>
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button className={button} onClick={() => handleOpenEdit(item)}>
              {canEdit ? "Editar" : "Consultar"}
            </button>
            <button
              className={button}
              disabled={!canEdit}
              aria-label={`Eliminar ${item.displayName}`}
              onClick={() => setItemToDelete(item)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </td>
      </tr>
      {conflict && (
        <tr>
          <td
            colSpan={4}
            className={`px-4 py-3 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100`}
          >
            <p className="mb-2 text-sm">
              Cambios de este equipo pendientes de resolver con el servidor.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={button}
                disabled={!canEdit || !conflict.serverItem}
                onClick={() =>
                  resolveEquipmentConflict(item.id, "accept_server")
                }
              >
                Usar servidor
              </button>
              <button
                className={button}
                disabled={!canEdit || !conflict.serverItem}
                onClick={() => resolveEquipmentConflict(item.id, "keep_local")}
              >
                Conservar local
              </button>
              <button
                className={button}
                disabled={!canEdit}
                onClick={() => resolveEquipmentConflict(item.id, "fork")}
              >
                Guardar copia
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
