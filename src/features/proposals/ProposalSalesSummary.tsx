import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Tag } from "lucide-react";
import type { ProjectSimulation } from "../../types";
import { PROPOSAL_DECISIONS, type ProposalDecision } from "../../../shared/proposalCommercial";
import { calculateProjectFinancialSummary } from "../../engine/financeEngine";
import { useEnergyCalculationMode } from "../application/useApplicationFeatures";
import { salesPerformance } from "./commercial";

type SalesPerformance = ReturnType<typeof salesPerformance>;
type SellerRow = SalesPerformance["sellers"][number];

/** Conteos por decisión y desglose por responsable sobre el conjunto visible (sin filtro de decisión). */
export function useSalesPerformance(projects: ProjectSimulation[]) {
  const mode = useEnergyCalculationMode();
  return useMemo(
    () =>
      salesPerformance(
        projects,
        (p) => calculateProjectFinancialSummary(p, mode).contractPriceUSD,
      ),
    [projects, mode],
  );
}

const total = (counts: SalesPerformance["counts"]) =>
  Object.values(counts).reduce((a, b) => a + b, 0);

/** Selector compacto de la barra superior de Inicio: misma altura, borde y fondo que el buscador. */
export function ProposalDecisionFilter({
  counts,
  value,
  onChange,
}: {
  counts: SalesPerformance["counts"];
  value: string;
  onChange: (status: string) => void;
}) {
  const active = value !== "All";
  return (
    <div className="relative w-full sm:w-auto">
      <Tag
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filtrar por decisión comercial"
        title="Decisión comercial"
        className={`w-full cursor-pointer appearance-none rounded-lg border py-2.5 pl-9 pr-9 text-xs font-bold shadow-2xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:w-auto ${
          active
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#272f3e] dark:bg-[#181d27] dark:text-zinc-300 dark:hover:bg-[#202734]"
        }`}
      >
        <option value="All">{`Todas las decisiones · ${total(counts)}`}</option>
        {(Object.keys(PROPOSAL_DECISIONS) as ProposalDecision[]).map((key) => (
          <option key={key} value={key}>
            {`${PROPOSAL_DECISIONS[key]} · ${counts[key]}`}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-zinc-500"
      />
    </div>
  );
}

/** Tabla de resultados por responsable con su ámbito y denominador explicados. */
export function SellerResultsTable({ sellers }: { sellers: SellerRow[] }) {
  return (
    <>
      <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
        Dentro de la búsqueda y carpeta actuales. Excluye pruebas y papelera.
        El importe aprobado es el valor cotizado actual en USD, no un ingreso
        cobrado. Propuestas antiguas usan su autor como responsable inicial.
      </p>
      {sellers.length === 0 ? (
        <p className="py-3 text-xs text-slate-500 dark:text-zinc-400">
          Sin propuestas comerciales en esta vista.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="text-slate-500 dark:text-zinc-400">
              <tr>
                {[
                  "Responsable",
                  "Aprobadas",
                  "Rechazadas",
                  "En espera",
                  "Aprobación¹",
                  "Cotizado aprobado (USD)",
                ].map((label) => (
                  <th key={label} scope="col" className="px-3 py-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sellers.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-100 text-slate-700 dark:border-zinc-800 dark:text-zinc-200"
                >
                  <th scope="row" className="px-3 py-2.5 font-normal">{row.name}</th>
                  <td className="px-3 py-2.5 tabular-nums">{row.approved}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.rejected}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.pending}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {row.approved + row.rejected
                      ? `${Math.round((row.approved / (row.approved + row.rejected)) * 100)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {row.amountUSD.toLocaleString("es-DO", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
        ¹ Aprobadas / (aprobadas + rechazadas). No cuenta propuestas aún
        pendientes.
      </p>
    </>
  );
}

const RESULT_LABELS: [ProposalDecision, string][] = [
  ["pending", "En espera"],
  ["approved", "Aprobadas"],
  ["rejected", "Rechazadas"],
  ["test", "De prueba"],
];

/**
 * Línea secundaria con los resultados comerciales y el desglose por responsable bajo demanda.
 * El panel se posiciona respecto al contenedor `relative` más cercano (la fila de Inicio).
 */
export function ProposalResultsLine({
  counts,
  sellers,
}: {
  counts: SalesPerformance["counts"];
  sellers: SellerRow[];
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={wrapperRef} className="contents">
      <p
        data-commercial-results
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-zinc-400"
      >
        <span className="sr-only">Resultados comerciales: </span>
        {RESULT_LABELS.map(([key, label], index) => (
          <span key={key} className="whitespace-nowrap">
            {index > 0 && (
              <span aria-hidden="true" className="mr-2 text-slate-300 dark:text-zinc-700">·</span>
            )}
            {label} <span className="font-semibold tabular-nums text-slate-600 dark:text-zinc-300">{counts[key]}</span>
          </span>
        ))}
      </p>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="commercial-results-by-owner"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        Por responsable
        <ChevronDown aria-hidden="true" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id="commercial-results-by-owner"
        role="region"
        aria-label="Resultados por responsable comercial"
        hidden={!open}
        className="absolute left-0 top-full z-40 mt-2 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <p className="mb-2 text-xs font-semibold text-slate-800 dark:text-zinc-100">
          Resultados por responsable comercial
        </p>
        <SellerResultsTable sellers={sellers} />
      </div>
    </div>
  );
}
