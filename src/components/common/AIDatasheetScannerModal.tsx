import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  FileText,
  Loader2,
  Settings,
  Upload,
  X,
} from "lucide-react";
import { useSimulationStore } from "../../store/useSimulationStore";
import {
  ExtractedDatasheetData,
  ExtractedEquipmentVariant,
} from "../../types/equipment";
import { parseDatasheetWithGemini } from "../../services/geminiDatasheetService";
import { findCatalogMatchForVariant } from "../../utils/equipmentMatchingUtils";
import { planDatasheetImport } from "../../utils/datasheetImport";

const technicalFields = {
  panel: [
    ["powerW", "Potencia (W)"],
    ["efficiencyPct", "Eficiencia (%)"],
    ["tempCoeff", "Coef. temperatura (%/°C)"],
    ["annualDegradation", "Degradación anual (%)"],
    ["voc", "Voc (V)"],
    ["isc", "Isc (A)"],
    ["vmp", "Vmp (V)"],
    ["imp", "Imp (A)"],
  ],
  inverter: [
    ["powerKW", "Potencia AC (kW)"],
    ["maxAcPowerKW", "Máxima AC (kW)"],
    ["maxPvPowerKW", "Máxima FV (kW)"],
    ["maxEfficiencyPct", "Eficiencia (%)"],
    ["mpptCount", "Seguidores MPPT"],
  ],
  battery: [
    ["capacityKWh", "Capacidad (kWh)"],
    ["capacityAh", "Capacidad (Ah)"],
    ["voltageV", "Tensión (V)"],
    ["dodPct", "DoD (%)"],
    ["batteryEfficiencyPct", "Eficiencia (%)"],
    ["cycles", "Ciclos"],
    ["maxChargeCurrentA", "Corriente de carga (A)"],
  ],
} as const;

export const AIDatasheetScannerModal: React.FC = () => {
  const state = useSimulationStore();
  const {
    isAIDatasheetModalOpen: open,
    closeAIDatasheetModal,
    equipmentCatalog,
    geminiApiKey,
    geminiModel,
    sidebarTheme,
  } = state;
  const dark = sidebarTheme === "dark";
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExtractedDatasheetData | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const user = state.syncSettings.currentUser;
  const canEdit = !user || user.role === "ADMIN" || user.role === "EDITOR";
  const control = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${dark ? "bg-[#141619] border-[#363b43] text-zinc-100 placeholder:text-zinc-400" : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"}`;
  const secondary = `rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 ${dark ? "border-[#363b43] hover:bg-zinc-800" : "border-slate-300 hover:bg-slate-100"}`;

  useEffect(() => {
    if (!open) {
      generation.current++;
      abort.current?.abort();
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    setFile(null);
    setBusy(false);
    setData(null);
    setSaved(null);
    setError(null);
    dialog.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeAIDatasheetModal();
      }
      if (event.key === "Tab") {
        const elements = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
          ) || [],
        );
        const first = elements[0],
          last = elements.at(-1);
        if (!first) return;
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => {
      abort.current?.abort();
      generation.current++;
      document.removeEventListener("keydown", keyboard, true);
      previous?.focus();
    };
  }, [open, closeAIDatasheetModal, state.sessionGeneration]);

  if (!open) return null;
  const selectFile = (next?: File) => {
    if (!next || busy) return;
    if (
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
        next.type,
      )
    ) {
      setError("Sube un PDF o una imagen PNG, JPG o WebP.");
      return;
    }
    if (next.size > 20 * 1024 * 1024) {
      setError(
        "El archivo supera 20 MB. Divide el PDF o usa una imagen más pequeña.",
      );
      return;
    }
    setFile(next);
    setData(null);
    setError(null);
    setSaved(null);
  };
  const scan = async () => {
    if (!file || busy) return;
    const request = ++generation.current;
    const session = state.sessionGeneration;
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setError(null);
    setProgress("Preparando documento…");
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
        reader.readAsDataURL(file);
      });
      if (request !== generation.current) return;
      const parsed = await parseDatasheetWithGemini(
        fileBase64,
        file.type,
        file.name,
        geminiApiKey,
        geminiModel,
        (message) => {
          if (request === generation.current) setProgress(message);
        },
        abort.current.signal,
      );
      if (
        request !== generation.current ||
        session !== useSimulationStore.getState().sessionGeneration
      )
        return;
      const catalog = useSimulationStore.getState().equipmentCatalog;
      setData({
        ...parsed,
        variants: parsed.variants.map((variant) => {
          const match = findCatalogMatchForVariant(
            variant,
            parsed.equipmentType,
            parsed.brand,
            catalog,
          );
          return {
            ...variant,
            selected: true,
            action: match && match.score >= 0.95 ? "update" : "create_new",
            ...(match
              ? {
                  matchedEquipmentId: match.matchedItem.id,
                  matchedDisplayName: match.matchedItem.displayName,
                  matchScore: match.score,
                  matchReason: match.reason,
                }
              : {}),
          };
        }),
      });
    } catch (cause) {
      if (request === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo analizar el documento.",
        );
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const edit = (id: string, updates: Partial<ExtractedEquipmentVariant>) => {
    setSaved(null);
    setData((old) =>
      old
        ? {
            ...old,
            variants: old.variants.map((v) =>
              v.id === id ? { ...v, ...updates } : v,
            ),
          }
        : old,
    );
  };
  const save = () => {
    if (!data || !canEdit) return;
    try {
      const live = useSimulationStore.getState();
      const plan = planDatasheetImport(data, live.equipmentCatalog);
      const activeUser = live.syncSettings.currentUser;
      if (activeUser && !["ADMIN", "EDITOR"].includes(activeUser.role))
        throw new Error("Tu cuenta solo puede consultar el catálogo.");
      const server = live.syncSettings.serverUrl.trim().replace(/\/+$/, "");
      for (const update of plan.updates) {
        const target = live.equipmentCatalog.find(
          (item) => item.id === update.id,
        )!;
        if (
          activeUser &&
          ((target.organizationId &&
            target.organizationId !== activeUser.organizationId) ||
            (target.syncServerUrl &&
              target.syncServerUrl.trim().replace(/\/+$/, "") !== server))
        )
          throw new Error(
            "Una coincidencia pertenece a otro ámbito. Guarda un modelo independiente con un nombre diferente.",
          );
      }
      for (const update of plan.updates)
        live.updateEquipmentItem(update.id, update.patch);
      if (plan.creates.length)
        live.addEquipmentBatch(plan.creates.map((entry) => entry.item));
      const fresh = useSimulationStore.getState();
      const changed =
        plan.updates.every((entry) =>
          fresh.equipmentCatalog.some(
            (item) =>
              item.id === entry.id &&
              Object.entries(entry.patch).every(
                ([key, value]) => item[key as keyof typeof item] === value,
              ),
          ),
        ) &&
        plan.creates.every((entry) =>
          fresh.equipmentCatalog.some((item) => item.id === entry.item.id),
        );
      if (!changed)
        throw new Error(
          fresh.equipmentSyncFeedback ||
            "No tienes permisos para modificar estos equipos.",
        );
      setSaved(
        `${plan.updates.length} actualizados y ${plan.creates.length} nuevos. Revisa los modelos y precios en el catálogo.`,
      );
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el catálogo.",
      );
    }
  };
  const count = data?.variants.filter((v) => v.selected).length || 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="datasheet-title"
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl shadow-2xl outline-none ${dark ? "bg-[#1c1f23] text-zinc-100" : "bg-white text-slate-900"}`}
      >
        <header
          className={`flex items-start justify-between gap-4 border-b p-5 ${dark ? "border-[#363b43]" : "border-slate-200"}`}
        >
          <div>
            <h2 id="datasheet-title" className="text-lg font-semibold">
              Importar ficha técnica
            </h2>
            <p
              className={`mt-1 text-sm ${dark ? "text-zinc-400" : "text-slate-600"}`}
            >
              Extrae modelos, revisa sus datos y decide cómo incorporarlos al
              catálogo.
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className={secondary}
              aria-label="Configurar inteligencia artificial"
              onClick={() => state.openSettingsModal("ai")}
            >
              <Settings size={16} />
            </button>
            <button
              type="button"
              className={secondary}
              aria-label="Cerrar ficha técnica"
              onClick={closeAIDatasheetModal}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <main className="flex-1 space-y-5 overflow-y-auto p-5">
          {!geminiApiKey && (
            <p
              className={`rounded-lg p-3 text-sm ${dark ? "bg-amber-950 text-amber-100" : "bg-amber-50 text-amber-900"}`}
            >
              Configura tu clave de Gemini en Ajustes → IA e integraciones antes
              de analizar.
            </p>
          )}
          {!data && (
            <>
              <input
                ref={input}
                type="file"
                className="hidden"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  selectFile(event.dataTransfer.files[0]);
                }}
                className={`flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 focus-visible:ring-2 focus-visible:ring-emerald-500 ${dark ? "border-zinc-600 bg-[#141619]" : "border-slate-300 bg-slate-50"}`}
              >
                {file ? <FileText size={26} /> : <Upload size={26} />}
                <span className="text-sm font-medium">
                  {file ? file.name : "Elige una ficha o arrástrala aquí"}
                </span>
                <span
                  className={`text-sm ${dark ? "text-zinc-400" : "text-slate-600"}`}
                >
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(1)} MB · Cambiar archivo`
                    : "PDF, PNG, JPG o WebP · Hasta 20 MB"}
                </span>
              </button>
              <p
                className={`text-sm ${dark ? "text-zinc-400" : "text-slate-600"}`}
              >
                Los datos desconocidos quedan vacíos. Revisa las variantes antes
                de guardar; importar una ficha no cambia propuestas existentes.
              </p>
            </>
          )}
          {busy && (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-sm"
            >
              <Loader2 size={18} className="animate-spin" />
              {progress}
            </p>
          )}
          {data && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Fabricante
                  <input
                    className={`${control} mt-1`}
                    value={data.brand}
                    onChange={(event) => {
                      setSaved(null);
                      setData({ ...data, brand: event.target.value });
                    }}
                  />
                </label>
                <div className="self-end">
                  <p className="text-sm font-medium">
                    {data.documentTitle ||
                      data.modelSeries ||
                      "Ficha analizada"}
                  </p>
                  <p
                    className={`mt-1 text-sm ${dark ? "text-zinc-400" : "text-slate-600"}`}
                  >
                    {data.equipmentType === "panel"
                      ? "Paneles solares"
                      : data.equipmentType === "inverter"
                        ? "Inversores"
                        : "Baterías"}{" "}
                    · {data.variants.length} variantes
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={count === data.variants.length}
                    onChange={(event) => {
                      setSaved(null);
                      setData({
                        ...data,
                        variants: data.variants.map((v) => ({
                          ...v,
                          selected: event.target.checked,
                        })),
                      });
                    }}
                  />
                  {count} de {data.variants.length} seleccionadas
                </label>
                <button
                  className={secondary}
                  onClick={() => {
                    setData(null);
                    setFile(null);
                    setSaved(null);
                    setError(null);
                  }}
                >
                  Analizar otro documento
                </button>
              </div>
              <div
                className={`divide-y border-y ${dark ? "divide-[#363b43] border-[#363b43]" : "divide-slate-200 border-slate-200"}`}
              >
                {data.variants.map((v, index) => (
                  <section key={v.id} className="space-y-3 py-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${v.displayName || v.modelCode}`}
                        checked={!!v.selected}
                        className="mt-3"
                        onChange={() => edit(v.id, { selected: !v.selected })}
                      />
                      <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_2fr]">
                        <label className="text-sm">
                          Modelo
                          <input
                            className={`${control} mt-1`}
                            value={v.modelCode}
                            onChange={(event) =>
                              edit(v.id, { modelCode: event.target.value })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          Nombre en catálogo
                          <input
                            className={`${control} mt-1`}
                            value={v.displayName}
                            onChange={(event) =>
                              edit(v.id, { displayName: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    </div>
                    <div className="ml-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {technicalFields[data.equipmentType]
                        .slice(0, 4)
                        .map(([key, label]) => (
                          <label key={key} className="text-sm">
                            {label}
                            <input
                              type="number"
                              step="any"
                              value={v[key] ?? ""}
                              placeholder="Sin dato"
                              className={`${control} mt-1`}
                              onChange={(event) =>
                                edit(v.id, {
                                  [key]:
                                    event.target.value === ""
                                      ? undefined
                                      : Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        ))}
                    </div>
                    <details className="ml-7 text-sm">
                      <summary className="cursor-pointer py-1 font-medium focus-visible:ring-2 focus-visible:ring-emerald-500">
                        Más especificaciones
                      </summary>
                      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {technicalFields[data.equipmentType]
                          .slice(4)
                          .map(([key, label]) => (
                            <label key={key}>
                              {label}
                              <input
                                type="number"
                                step="any"
                                value={v[key] ?? ""}
                                placeholder="Sin dato"
                                className={`${control} mt-1`}
                                onChange={(event) =>
                                  edit(v.id, {
                                    [key]:
                                      event.target.value === ""
                                        ? undefined
                                        : Number(event.target.value),
                                  })
                                }
                              />
                            </label>
                          ))}
                        {["dimensions", "voltageMPPT", "chemistry"]
                          .filter(
                            (key) =>
                              key === "dimensions" ||
                              (key === "voltageMPPT"
                                ? data.equipmentType === "inverter"
                                : data.equipmentType === "battery"),
                          )
                          .map((key) => (
                            <label key={key}>
                              {key === "dimensions"
                                ? "Dimensiones"
                                : key === "chemistry"
                                  ? "Química"
                                  : "Rango MPPT"}
                              <input
                                value={String(
                                  v[key as keyof ExtractedEquipmentVariant] ??
                                    "",
                                )}
                                className={`${control} mt-1`}
                                placeholder="Sin dato"
                                onChange={(event) =>
                                  edit(v.id, {
                                    [key]: event.target.value || undefined,
                                  })
                                }
                              />
                            </label>
                          ))}
                      </div>
                    </details>
                    {v.matchedEquipmentId && (
                      <div
                        className={`ml-7 space-y-2 rounded-lg p-3 text-sm ${dark ? "bg-[#30291c] text-amber-100" : "bg-amber-50 text-amber-950"}`}
                      >
                        <p>
                          Posible coincidencia:{" "}
                          <strong>{v.matchedDisplayName}</strong>
                        </p>
                        <p>
                          {v.matchReason}. Revisa el modelo; similitud no
                          implica equivalencia.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {(["update", "create_new"] as const).map((action) => (
                            <label
                              key={action}
                              className="flex cursor-pointer items-center gap-2"
                            >
                              <input
                                type="radio"
                                name={`action-${index}`}
                                checked={v.action === action}
                                onChange={() => edit(v.id, { action })}
                              />
                              {action === "update"
                                ? "Actualizar este equipo"
                                : "Crear modelo independiente"}
                            </label>
                          ))}
                        </div>
                        <p>
                          {v.action === "update"
                            ? "Se actualizan nombre, modelo y datos presentes; se conservan ID, proveedores y precios."
                            : "Usa un nombre diferente si representa otra variante."}
                        </p>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {error && (
            <p
              role="alert"
              className={`flex gap-2 rounded-lg p-3 text-sm ${dark ? "bg-rose-950 text-rose-100" : "bg-rose-50 text-rose-800"}`}
            >
              <AlertCircle size={18} className="shrink-0" />
              {error}
            </p>
          )}
          {saved && (
            <p
              role="status"
              className={`flex gap-2 rounded-lg p-3 text-sm ${dark ? "bg-emerald-950 text-emerald-100" : "bg-emerald-50 text-emerald-900"}`}
            >
              <Check size={18} className="shrink-0" />
              {saved}
            </p>
          )}
          {!canEdit && (
            <p className="text-sm">
              Tu cuenta solo puede consultar el catálogo.
            </p>
          )}
        </main>
        <footer
          className={`flex items-center justify-between gap-3 border-t p-4 ${dark ? "border-[#363b43]" : "border-slate-200"}`}
        >
          <button className={secondary} onClick={closeAIDatasheetModal}>
            {saved ? "Volver al catálogo" : "Cerrar"}
          </button>
          {data ? (
            <button
              type="button"
              onClick={save}
              disabled={!count || !canEdit || !!saved}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
            >
              Guardar {count} variantes
            </button>
          ) : (
            <button
              type="button"
              onClick={scan}
              disabled={!file || busy || !geminiApiKey}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
            >
              {busy ? "Analizando…" : "Analizar ficha"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
