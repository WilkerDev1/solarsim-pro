import { useMemo } from "react";
import type { ProjectSimulation } from "../../types";
import { PROPOSAL_DECISIONS } from "../../../shared/proposalCommercial";
import { calculateProjectFinancialSummary } from "../../engine/financeEngine";
import { useEnergyCalculationMode } from "../application/useApplicationFeatures";
import { salesPerformance } from "./commercial";
export function ProposalSalesSummary({
  projects,
  value,
  onChange,
}: {
  projects: ProjectSimulation[];
  value: string;
  onChange: (status: string) => void;
}) {
  const mode = useEnergyCalculationMode();
  const { counts, sellers } = useMemo(
    () =>
      salesPerformance(
        projects,
        (p) => calculateProjectFinancialSummary(p, mode).contractPriceUSD,
      ),
    [projects, mode],
  );
  return (
    <section
      className="mb-5 rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900"
      aria-label="Seguimiento de propuestas"
    >
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filtrar por estado comercial"
      >
        {[["All", "Todas"], ...Object.entries(PROPOSAL_DECISIONS)].map(
          ([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={value === key}
              onClick={() => onChange(key)}
              className={`min-h-9 rounded-lg px-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${value === key ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "text-slate-600 hover:bg-slate-50 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
            >
              {label}{" "}
              <strong className="ml-1 tabular-nums">
                {key === "All"
                  ? Object.values(counts).reduce((a, b) => a + b, 0)
                  : counts[key as keyof typeof counts]}
              </strong>
            </button>
          ),
        )}
      </div>
      <details className="mt-3 border-t border-slate-100 pt-3 dark:border-zinc-800">
        <summary className="cursor-pointer text-xs font-medium text-slate-700 dark:text-zinc-200">
          Resultados por responsable comercial
        </summary>
        <p className="my-3 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
          Dentro de la búsqueda y carpeta actuales. Excluye pruebas y papelera.
          El importe aprobado es el valor cotizado actual en USD, no un ingreso
          cobrado. Propuestas antiguas usan su autor como responsable inicial.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
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
                  <th key={label} className="px-3 py-2 font-medium">
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
                  <td className="px-3 py-3">{row.name}</td>
                  <td className="px-3 py-3 tabular-nums">{row.approved}</td>
                  <td className="px-3 py-3 tabular-nums">{row.rejected}</td>
                  <td className="px-3 py-3 tabular-nums">{row.pending}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {row.approved + row.rejected
                      ? `${Math.round((row.approved / (row.approved + row.rejected)) * 100)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
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
        <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
          ¹ Aprobadas / (aprobadas + rechazadas). No cuenta propuestas aún
          pendientes.
        </p>
      </details>
    </section>
  );
}
