import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { FinancialSummaryResult } from "../../../types";
import { useSimulationStore } from "../../../store/useSimulationStore";
export function ProposalEnergyOverview({
  summary,
}: {
  summary: FinancialSummaryResult;
}) {
  const dark = useSimulationStore((state) => state.sidebarTheme === "dark");
  const number = (v: number) => Math.round(v).toLocaleString("es-DO");
  return (
    <section className="summary-section">
      <header>
        <h2>Balance energético</h2>
        <p>Consumo y generación estimados durante el primer año.</p>
      </header>
      <dl className="summary-energy-totals">
        <div>
          <dt>Producción solar</dt>
          <dd>{number(summary.annualProductionKWh)} kWh/año</dd>
        </div>
        <div>
          <dt>Consumo eléctrico</dt>
          <dd>{number(summary.annualConsumptionKWh)} kWh/año</dd>
        </div>
        <div>
          <dt>Cobertura energética</dt>
          <dd>{summary.energyCoveragePct.toFixed(1)}%</dd>
        </div>
      </dl>
      <div
        className="summary-chart"
        role="img"
        aria-label={`Producción anual ${number(summary.annualProductionKWh)} kWh, consumo ${number(summary.annualConsumptionKWh)} kWh. Tabla mensual disponible debajo.`}
      >
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={summary.monthlyBreakdown}
            margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={dark ? "#363b43" : "#dce2e8"}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: dark ? "#abb4c0" : "#536174" }}
              tickFormatter={(v) => String(v).slice(0, 3)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={48}
              tick={{ fontSize: 11, fill: dark ? "#abb4c0" : "#536174" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: dark ? "#1c1f23" : "#fff",
                borderColor: dark ? "#363b43" : "#dce2e8",
                color: dark ? "#f1f3f5" : "#182230",
                fontSize: 12,
              }}
              cursor={{ fill: dark ? "#2a3037" : "#f6f8fa" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="consumptionKWh"
              name="Consumo (kWh)"
              fill={dark ? "#8ba6c3" : "#647f9d"}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="productionKWh"
              name="Producción (kWh)"
              fill={dark ? "#6be0b5" : "#087b58"}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary>Ver datos mensuales</summary>
        <div className="summary-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Consumo (kWh)</th>
                <th>Producción (kWh)</th>
              </tr>
            </thead>
            <tbody>
              {summary.monthlyBreakdown.map((month) => (
                <tr key={month.month}>
                  <td>{month.month}</td>
                  <td>{number(month.consumptionKWh)}</td>
                  <td>{number(month.productionKWh)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
