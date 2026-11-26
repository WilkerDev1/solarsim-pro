import { CheckCircle2, Clock3, PencilLine, Send } from 'lucide-react';
import { formatMoney } from '../../../../shared/quotations';
import type { QuotationKpi } from '../../../utils/quotationSummary';

const ICONS: Record<QuotationKpi['id'], typeof Send> = { draft: PencilLine, issued: Send, accepted: CheckCircle2, expired: Clock3 };

/** Cuatro indicadores con el importe en RD$ (cada cotización convertida con su propia tasa) y el número de cotizaciones. */
export function QuotationsKpis({ kpis }: { kpis: readonly QuotationKpi[] }) {
  return (
    <section aria-label="Indicadores">
      <ul className="qh-kpis">
        {kpis.map((kpi) => {
          const Icon = ICONS[kpi.id];
          return (
            <li key={kpi.id} className="qh-kpi" data-kpi={kpi.id}>
              <span className="qh-kpi-icon" aria-hidden="true"><Icon className="h-5 w-5" /></span>
              <div className="qh-kpi-body">
                <span className="qh-kpi-label">{kpi.label}</span>
                <span className="qh-kpi-amount">{formatMoney(kpi.amountDopCents, 'DOP')}</span>
                <span className="qh-kpi-count">{kpi.count === 1 ? '1 cotización' : `${kpi.count} cotizaciones`}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
