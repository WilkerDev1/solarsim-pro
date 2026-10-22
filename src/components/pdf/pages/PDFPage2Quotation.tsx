import { PDFPageShell } from '../PDFPageShell';
import { getTariffDisplayName } from '../../../../shared/proposalPresentation';
import React from 'react';
import { ShieldCheck, CheckCircle2, Check } from 'lucide-react';
import { ProjectSimulation, FinancialSummaryResult } from '../../../types';
import { PDFColorTheme } from '../../../constants/pdfThemes';
import { PDFHeaderBanner } from '../PDFHeaderBanner';
import { PDFFooter } from '../PDFFooter';
import { PDFWatermark } from '../PDFWatermark';
import { EditableText } from '../editor/EditableText';
import { OptionalTextRow } from '../editor/OptionalTextRow';
import { getProjectPanels, getProjectInverters, getProjectBatteries } from '../../../utils/equipmentSpecsUtils';

interface PDFPage2QuotationProps {
  project: ProjectSimulation;
  summary: FinancialSummaryResult;
  activeTheme: PDFColorTheme;
  showHeadersFooters: boolean;
  currentDateStr: string;
  pageNum: number;
  totalPages: number;
}

const cleanInstallationDesc = (desc?: string): string => {
  const defaultDesc = 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).';
  if (!desc || typeof desc !== 'string' || !desc.trim()) return defaultDesc;
  if (desc.includes('Notas del Sistema:')) {
    const base = desc.split('Notas del Sistema:')[0].trim().replace(/\.\s*$/, '');
    return base ? `${base}.` : defaultDesc;
  }
  return desc;
};

export const PDFPage2Quotation: React.FC<PDFPage2QuotationProps> = ({
  project,
  summary,
  activeTheme,
  showHeadersFooters,
  currentDateStr,
  pageNum,
  totalPages,
}) => {
  const customItems = project.financials.customItems || [];

  return (
    <PDFPageShell
      project={project}
      summary={summary}
      activeTheme={activeTheme}
      showHeadersFooters={showHeadersFooters}
      currentDateStr={currentDateStr}
      pageNum={pageNum}
      totalPages={totalPages}
      sectionId="quotation"
    >

      {/* Body */}
      <div className="px-10 pt-2 pb-2 flex-1 flex flex-col justify-between text-xs text-slate-800 font-sans relative z-10 min-h-0">
        {/* 1. DATOS DEL CLIENTE */}
        <div>
          <h3
            className="px-2.5 py-0.5 text-[10.5px] font-bold text-slate-800 uppercase border-l-4 mb-1"
            style={{
              backgroundColor: '#f1f5f9',
              borderLeftColor: activeTheme.primary,
            }}
          >
            <EditableText k="quotation.clientHeading" />
          </h3>
          <div className="grid grid-cols-2 gap-4 px-2 text-[10px]">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 leading-snug">
                <span className="font-bold text-slate-600 shrink-0"><EditableText k="quotation.label.client" /></span>{' '}
                <EditableText k="client.name" className="font-bold text-slate-900 inline-block" boldClassName="font-bold text-slate-950" placeholder="Nombre del cliente" />
              </div>
              <div className="flex items-center gap-1.5 leading-snug">
                <span className="font-bold text-slate-600 shrink-0"><EditableText k="quotation.label.contact" /></span>{' '}
                <EditableText k="client.contact" className="font-medium inline-block text-slate-800" boldClassName="font-bold text-slate-950" placeholder="(Agregar contacto)" />
              </div>
              <div className="flex items-center gap-1.5 leading-snug">
                <span className="font-bold text-slate-600 shrink-0"><EditableText k="quotation.label.phone" /></span>{' '}
                <EditableText k="client.phone" className="font-medium inline-block text-slate-800" boldClassName="font-bold text-slate-950" placeholder="(Agregar teléfono)" />
              </div>
              <OptionalTextRow k="client.email">
                <div className="flex items-center gap-1.5 leading-snug">
                <span className="font-bold text-slate-600 shrink-0"><EditableText k="quotation.label.email" /></span>{' '}
                <EditableText k="client.email" className="font-medium inline-block text-slate-800" boldClassName="font-bold text-slate-950" placeholder="(Agregar correo)" />
              </div>
              </OptionalTextRow>
              <div className="flex items-center gap-1.5 leading-snug">
                <span className="font-bold text-slate-600 shrink-0"><EditableText k="quotation.label.address" /></span>{' '}
                <EditableText k="client.address" className="font-medium inline-block text-slate-800" boldClassName="font-bold text-slate-950" />
              </div>
            </div>
            <div className="space-y-0.5 text-right">
              <div className="flex items-center justify-end gap-1.5 leading-snug">
                <span className="font-bold text-slate-600 shrink-0"><EditableText k="quotation.label.number" /></span>{' '}
                <EditableText k="quote.number" className="font-bold font-mono text-slate-900 inline-block" boldClassName="font-bold font-mono text-slate-950" />
              </div>
              <div className="flex items-center justify-end gap-1.5 leading-snug">
                <span className="font-bold text-slate-600 shrink-0"><EditableText k="quotation.label.date" /></span>{' '}
                <EditableText k="quote.date" className="font-semibold text-slate-800 inline-block" boldClassName="font-semibold text-slate-900" />
              </div>
              <div className="flex items-center justify-end gap-1.5 leading-snug">
                <span className="font-bold text-slate-600 shrink-0"><EditableText k="quotation.label.validity" /></span>{' '}
                <EditableText k="quote.validityDays" className="font-bold text-slate-900 inline-block">{(days) => `${days} Días`}</EditableText>
              </div>
            </div>
          </div>
        </div>

        {/* 2. ESPECIFICACIONES DEL SISTEMA */}
        <div>
          <h3
            className="px-2.5 py-0.5 text-[10.5px] font-bold text-slate-800 uppercase border-l-4 mb-1"
            style={{
              backgroundColor: '#f1f5f9',
              borderLeftColor: activeTheme.primary,
            }}
          >
            <EditableText k="quotation.specsHeading" />
          </h3>
          <div className="grid grid-cols-2 gap-4 bg-slate-50/60 p-2 rounded-lg border border-slate-200 text-[10px]">
            <div className="space-y-0.5">
              <div>
                <span className="font-bold text-slate-700"><EditableText k="quotation.label.power" /></span>{' '}
                <span className="font-bold text-slate-900">{summary.systemCapacityKWp.toFixed(2)} kWp</span>
              </div>
              <div>
                <EditableText k="quotation.label.installType" className="font-bold text-slate-700" /> <EditableText k="quotation.installTypeValue" />
              </div>
            </div>
            <div className="space-y-0.5 text-right">
              <div>
                <span className="font-bold text-slate-700"><EditableText k="quotation.label.monthlyConsumption" /></span>{' '}
                <span className="font-bold text-slate-900">{Math.round(summary.annualConsumptionKWh / 12).toLocaleString()} kWh</span>
              </div>
              <div>
                <span className="font-bold text-slate-700"><EditableText k="quotation.label.tariff" /></span>{' '}
                <span className="font-bold" style={{ color: activeTheme.primary }}>
                  {project.client.distributor || project.rates.distributor || 'EDES'} • {getTariffDisplayName(project.client.distributor || project.rates.distributor, project.rates.tariffCode)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. EQUIPOS Y MATERIALES */}
        <div>
          <h3
            className="px-2.5 py-0.5 text-[10.5px] font-bold text-slate-800 uppercase border-l-4 mb-1"
            style={{
              backgroundColor: '#f1f5f9',
              borderLeftColor: activeTheme.primary,
            }}
          >
            <EditableText k="quotation.equipmentHeading" />
          </h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="text-white font-bold text-[9.5px] uppercase" style={{ backgroundColor: activeTheme.primary }}>
                <tr>
                  <th className="px-3 py-1"><EditableText k="quotation.table.description" /></th>
                  <th className="px-3 py-1 text-center w-20"><EditableText k="quotation.table.quantity" /></th>
                  <th className="px-3 py-1 text-center w-20"><EditableText k="quotation.table.unit" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[10px] text-slate-800 font-semibold">
                {getProjectPanels(project.specs).map((p, idx) => (
                  <tr key={p.id || `panel-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="px-3 py-1 font-medium text-slate-900">
                      {p.brandModel || `Módulos Monocristalinos Tier-1 (${p.powerW}W)`}
                    </td>
                    <td className="px-3 py-1 text-center font-bold font-mono">{p.count}</td>
                    <td className="px-3 py-1 text-center text-slate-500 font-normal"><EditableText k="quotation.table.unitValue" /></td>
                  </tr>
                ))}
                {getProjectInverters(project.specs).map((inv, idx) => (
                  <tr key={inv.id || `inv-${idx}`} className={idx % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}>
                    <td className="px-3 py-1 font-medium text-slate-900">
                      {inv.brandModel || 'Inversor Solar On-Grid / Híbrido'}
                    </td>
                    <td className="px-3 py-1 text-center font-bold font-mono">{inv.count || 1}</td>
                    <td className="px-3 py-1 text-center text-slate-500 font-normal"><EditableText k="quotation.table.unitValue" /></td>
                  </tr>
                ))}
                {project.specs.hasBattery && getProjectBatteries(project.specs).map((bat, idx) => (
                  <tr key={bat.id || `bat-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="px-3 py-1 font-medium text-slate-900">
                      {bat.brandModel || 'Banco de Baterías de Litio'}
                    </td>
                    <td className="px-3 py-1 text-center font-bold font-mono">{bat.count || 1}</td>
                    <td className="px-3 py-1 text-center text-slate-500 font-normal"><EditableText k="quotation.table.unitValue" /></td>
                  </tr>
                ))}
                <tr className={project.specs.hasBattery ? 'bg-slate-50/60' : 'bg-white'}>
                  <td className="px-3 py-1 font-medium text-slate-900">
                    {cleanInstallationDesc(project.specs.installationServicesDesc)}
                  </td>
                  <td className="px-3 py-1 text-center font-bold font-mono">1</td>
                  <td className="px-3 py-1 text-center text-slate-500 font-normal"><EditableText k="quotation.table.unitValue" /></td>
                </tr>
                {customItems.map((cItem, cIdx) => (
                  <tr
                    key={cItem.id || cIdx}
                    className={(cIdx + (project.specs.hasBattery ? 1 : 0)) % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}
                  >
                    <td className="px-3 py-1 font-medium text-slate-900">
                      {cItem.description || `Ítem Adicional #${cIdx + 1}`}
                    </td>
                    <td className="px-3 py-1 text-center font-bold font-mono">{cItem.quantity || 1}</td>
                    <td className="px-3 py-1 text-center text-slate-500 font-normal">{cItem.unit || 'UD'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. RECUADRO DE DESGLOSE FINANCIERO DE PRECIOS */}
        <div className="flex justify-end">
          <div className="w-[380px] bg-slate-50/90 border border-slate-200 rounded-lg p-2 space-y-1 text-[10px]">
            <div className="flex justify-between text-slate-700">
              <span className="font-bold"><EditableText k="quotation.totals.subtotal" /></span>
              <span className="font-bold font-mono">
                ${summary.commercialPreTaxSubtotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-slate-900 bg-slate-200/80 px-2 py-0.5 rounded font-bold">
              <span><EditableText k="quotation.totals.total" /></span>
              <span className="font-mono">
                ${(summary.listGrossInvestmentUSD + (project.financials.applyITBISExemption ? summary.itbisSavedUSD : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between font-bold" style={{ color: activeTheme.secondary }}>
              <span><EditableText k="quotation.totals.itbis" /></span>
              <span className="font-mono">
                ${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {(summary.totalDiscountUSD || 0) > 0 && (
              <div className="flex justify-between text-rose-600 bg-rose-50/80 px-2 py-0.5 rounded font-bold border border-rose-200/70">
                <span className="flex items-center gap-1">
                  DESCUENTO :
                  {summary.equipmentDiscountUSD ? (
                    <span className="text-[9px] font-normal text-amber-700">(Equipos Ley 57-07)</span>
                  ) : null}
                </span>
                <span className="font-mono">
                  -${summary.totalDiscountUSD?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>
            )}
            <div
              className="flex justify-between text-white px-2 py-0.5 rounded font-bold"
              style={{ backgroundColor: activeTheme.primary }}
            >
              <span><EditableText k="quotation.totals.totalLey" /></span>
              <span className="font-mono">
                ${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-slate-800 pt-0.5 border-t border-slate-300">
              <span className="font-bold"><EditableText k="quotation.totals.pricePerWatt" /></span>
              <span className="font-bold font-mono" style={{ color: activeTheme.primary }}>
                ${(summary.salePricePerWattUSD ?? (summary.systemCapacityKWp > 0 ? summary.grossInvestmentUSD / (summary.systemCapacityKWp * 1000) : 0)).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* 5. INCENTIVOS DE LEY 57-07 */}
        <div>
          <h3
            className="px-2.5 py-0.5 text-[10.5px] font-bold text-slate-800 uppercase border-l-4 mb-0.5"
            style={{
              backgroundColor: '#f1f5f9',
              borderLeftColor: activeTheme.primary,
            }}
          >
            <EditableText k="quotation.incentivesHeading" />
          </h3>
          <p className="text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-900 px-2.5 py-0.5 rounded mb-1">
            <EditableText k="quotation.incentivesNote" />
          </p>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="text-white font-bold text-[9.5px] uppercase" style={{ backgroundColor: activeTheme.primary }}>
                <tr>
                  <th className="px-3 py-1"><EditableText k="quotation.incentives.concept" /></th>
                  <th className="px-3 py-1 text-right"><EditableText k="quotation.incentives.value" /></th>
                  <th className="px-3 py-1 text-right w-20">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[10px] text-slate-800 font-semibold">
                <tr className="bg-white font-bold">
                  <td className="px-3 py-1"><EditableText k="quotation.incentives.equipment" /></td>
                  <td className="px-3 py-1 text-right font-mono">${(summary.equipmentPortionUSD || summary.grossInvestmentUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-1 text-right font-mono">100%</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1"><EditableText k="quotation.incentives.year1" /></td>
                  <td className="px-3 py-1 text-right font-mono font-bold" style={{ color: activeTheme.secondary }}>
                    ${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1 text-right font-mono" style={{ color: activeTheme.secondary }}>13.33%</td>
                </tr>
                <tr className="bg-white">
                  <td className="px-3 py-1"><EditableText k="quotation.incentives.year2" /></td>
                  <td className="px-3 py-1 text-right font-mono font-bold" style={{ color: activeTheme.secondary }}>
                    ${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1 text-right font-mono" style={{ color: activeTheme.secondary }}>13.33%</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-3 py-1"><EditableText k="quotation.incentives.year3" /></td>
                  <td className="px-3 py-1 text-right font-mono font-bold" style={{ color: activeTheme.secondary }}>
                    ${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1 text-right font-mono" style={{ color: activeTheme.secondary }}>13.33%</td>
                </tr>
                <tr className={`font-bold ${activeTheme.accentLightBg}`} style={{ color: activeTheme.primary }}>
                  <td className="px-3 py-1"><EditableText k="quotation.incentives.total" /></td>
                  <td className="px-3 py-1 text-right font-mono" style={{ color: activeTheme.primary }}>
                    ${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1 text-right font-mono" style={{ color: activeTheme.primary }}>40.00%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. GARANTÍAS Y NOS ENCARGAMOS DE GESTIONAR GRID */}
        <div className="grid grid-cols-2 gap-3">
          {/* Card Garantías */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5 text-[10px]">
            <h4
              className="font-bold border-b border-slate-200 pb-0.5 mb-0.5 uppercase tracking-wider flex items-center gap-1.5"
              style={{ color: activeTheme.primary }}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> <EditableText k="quotation.warrantiesHeading" />
            </h4>
            <div className="flex items-center gap-1 leading-snug">
              <EditableText k="quotation.warranty.panelLabel" className="font-bold text-slate-800 shrink-0" />
              <EditableText k="quotation.warranty.panel" className="font-medium inline-block" boldClassName="font-bold text-slate-950" />
            </div>
            <div className="flex items-center gap-1 leading-snug">
              <EditableText k="quotation.warranty.inverterLabel" className="font-bold text-slate-800 shrink-0" />
              <EditableText k="quotation.warranty.inverter" className="font-medium inline-block" boldClassName="font-bold text-slate-950" />
            </div>
            {project.specs.hasBattery && (
              <div className="flex items-center gap-1 leading-snug">
                <EditableText k="quotation.warranty.batteryLabel" className="font-bold text-slate-800 shrink-0" />
                <EditableText k="quotation.warranty.battery" className="font-medium inline-block" boldClassName="font-bold text-slate-950" />
              </div>
            )}
            <div className="flex items-center gap-1 leading-snug">
              <EditableText k="quotation.warranty.workmanshipLabel" className="font-bold text-slate-800 shrink-0" />
              <EditableText k="quotation.warranty.workmanship" className="font-medium inline-block" boldClassName="font-bold text-slate-950" />
            </div>
          </div>

          {/* Card Nos Encargamos de Gestionar */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5 text-[10px]">
            <h4
              className="font-bold border-b border-slate-200 pb-0.5 mb-0.5 uppercase tracking-wider flex items-center gap-1.5"
              style={{ color: activeTheme.primary }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: activeTheme.primary }} /> <EditableText k="quotation.servicesHeading" />
            </h4>
            <EditableText k="quotation.servicesIncluded" as="div" className="space-y-0.5 block">
              {(text) => text
                .split(/[,;\n]/)
                .map((item) => item.replace(/^\s*[-•]\s*/, '').replace(/\*/g, '').trim())
                .filter(Boolean)
                .map((item, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 leading-snug">
                    <Check className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="font-medium text-slate-700">{item}</span>
                  </div>
                ))}
            </EditableText>
          </div>
        </div>

        {/* 7. NOTA LEGAL */}
        <div className="text-center text-[9px] text-slate-500 font-semibold italic pt-0.5">
          <EditableText k="quotation.validityNote" className="text-center text-[9px] text-slate-500 font-semibold italic block" boldClassName="font-bold text-slate-700" />
          <div className="mt-0.5 flex items-center justify-center gap-3 not-italic">
            <EditableText k="company.name" className="font-bold" />
            <OptionalTextRow k="company.rnc"><span><EditableText k="quotation.issuerRncLabel" /> <EditableText k="company.rnc" /></span></OptionalTextRow>
            <OptionalTextRow k="company.email"><EditableText k="company.email" /></OptionalTextRow>
          </div>
        </div>
      </div>
    </PDFPageShell>
  );
};
