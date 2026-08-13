import React, { useRef, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { ArrowLeft, Printer, Download, RefreshCw, Leaf, ShieldCheck, FileText, CheckCircle2, PackageCheck, Wrench, Building2, Check, Palette } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

declare global {
  interface Window {
    electronAPI?: {
      printToPDF: () => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>;
    };
  }
}

export interface PDFColorTheme {
  id: string;
  name: string;
  primary: string;       // Header & Table headers background
  secondary: string;     // Sub-banner background
  accent: string;        // Text highlights
  accentDark: string;    // Dark accent text
  accentLightBg: string; // Highlight cards background
  accentBorder: string;  // Highlight border
  barColor: string;      // Production chart bar color
}

export const PDF_COLOR_THEMES: PDFColorTheme[] = [
  {
    id: 'emerald',
    name: 'Verde Esmeralda (Clásico)',
    primary: '#14532d',
    secondary: '#1e6a3b',
    accent: '#16a34a',
    accentDark: '#14532d',
    accentLightBg: 'bg-emerald-50/80',
    accentBorder: 'border-emerald-200',
    barColor: '#22c55e',
  },
  {
    id: 'navy',
    name: 'Azul Marino Corporativo',
    primary: '#1e3a8a',
    secondary: '#1d4ed8',
    accent: '#2563eb',
    accentDark: '#1e3a8a',
    accentLightBg: 'bg-blue-50/80',
    accentBorder: 'border-blue-200',
    barColor: '#3b82f6',
  },
  {
    id: 'slate',
    name: 'Gris Grafito Platinum',
    primary: '#0f172a',
    secondary: '#334155',
    accent: '#475569',
    accentDark: '#0f172a',
    accentLightBg: 'bg-slate-100/80',
    accentBorder: 'border-slate-300',
    barColor: '#64748b',
  },
  {
    id: 'amber',
    name: 'Ámbar Bronce Solar',
    primary: '#78350f',
    secondary: '#92400e',
    accent: '#d97706',
    accentDark: '#78350f',
    accentLightBg: 'bg-amber-50/80',
    accentBorder: 'border-amber-200',
    barColor: '#f59e0b',
  },
  {
    id: 'indigo',
    name: 'Índigo Moderno',
    primary: '#312e81',
    secondary: '#3730a3',
    accent: '#4f46e5',
    accentDark: '#312e81',
    accentLightBg: 'bg-indigo-50/80',
    accentBorder: 'border-indigo-200',
    barColor: '#6366f1',
  },
];

export const PDFProposalView: React.FC = () => {
  const { getActiveProject, getFinancialSummary, setActiveView, updateClient, updateSpecs } = useSimulationStore();
  const project = getActiveProject();
  const summary = getFinancialSummary();
  const pdfRef = useRef<HTMLDivElement>(null);

  // Document Toggles (4 pages)
  const [showPage1, setShowPage1] = useState(true); // Pág 1: Análisis de Energía
  const [showPageQuotation, setShowPageQuotation] = useState(true); // Pág 2: Cotización de Sistema Fotovoltaico
  const [showPage2, setShowPage2] = useState(true); // Pág 3: Retorno de Inversión - Resumen
  const [showPage3, setShowPage3] = useState(true); // Pág 4: Flujo de Caja 25 Años
  const [showHeadersFooters, setShowHeadersFooters] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Active Color Theme
  const [activeTheme, setActiveTheme] = useState<PDFColorTheme>(PDF_COLOR_THEMES[0]);

  // Active Tab in Sidebar (Secciones vs Editar Cotización)
  const [sidebarTab, setSidebarTab] = useState<'sections' | 'edit'>('sections');

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    if (!pdfRef.current) return;
    setIsExporting(true);

    try {
      const pageElements = pdfRef.current.querySelectorAll<HTMLElement>('.pdf-page');
      if (!pageElements || pageElements.length === 0) {
        setIsExporting(false);
        return;
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i];

        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 1200,
        });

        const imgData = canvas.toDataURL('image/png');
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        if (i > 0) {
          pdf.addPage();
        }

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, imgHeight));
      }

      pdf.save(`Propuesta_SolarSim_${project.client.name.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Error generating multi-page PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const currentDateStr = new Date().toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'numeric',
    year: 'numeric',
  });

  // Calculate total pages for footer dynamically
  const activePagesCount =
    (showPage1 ? 1 : 0) +
    (showPageQuotation ? 1 : 0) +
    (showPage2 ? 1 : 0) +
    (showPage3 ? 1 : 0);

  let page1Num = 0;
  let pageQuotNum = 0;
  let page2Num = 0;
  let page3Num = 0;
  let currentNum = 0;

  if (showPage1) { currentNum++; page1Num = currentNum; }
  if (showPageQuotation) { currentNum++; pageQuotNum = currentNum; }
  if (showPage2) { currentNum++; page2Num = currentNum; }
  if (showPage3) { currentNum++; page3Num = currentNum; }

  // Calculate equivalent trees planted (~16 trees per Ton CO2/yr)
  const treesPlanted = Math.round(summary.co2AvoidedTonsPerYear * 16);

  // Prepare data for Beneficio Acumulado chart (Year 0 to 25)
  const cf25 = summary.cashFlow25Years;
  const cumulativeChartData = [
    { yearLabel: '0', year: 0, cumulative: -summary.grossInvestmentUSD },
    ...cf25.map((c) => ({
      yearLabel: `${c.year}`,
      year: c.year,
      cumulative: c.cumulativeCashFlowUSD,
    })),
  ];

  // Totals for monthly energy table
  const totalConsumptionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.consumptionKWh, 0);
  const totalProductionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.productionKWh, 0);
  const totalSavingsKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.solarSelfConsumedKWh, 0);

  // Key milestones for Page 3
  const paybackYearObj = cf25.find((c) => c.year === Math.ceil(summary.paybackYears)) || cf25[2] || cf25[0];
  const year1Obj = cf25[0];
  const year10Obj = cf25[9] || cf25[0];
  const year25Obj = cf25[cf25.length - 1] || cf25[0];

  // Common Header Banner Component for clean consistency across all PDF pages
  const renderHeaderBanner = (pageTitle: string) => (
    <>
      <div style={{ backgroundColor: activeTheme.primary }} className="text-white px-10 py-5 flex justify-between items-center transition-colors">
        <div>
          <h2 className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">
            PROPUESTA TÉCNICA Y ECONÓMICA • ID: {project.client.projectId || 'SP-2024-089'}
          </h2>
          <h1 className="text-xl font-bold uppercase tracking-tight text-white mt-0.5">
            {project.client.name} — {summary.systemCapacityKWp.toFixed(2)}kWp
          </h1>
          <p className="text-[11px] text-white/80 mt-0.5">
            Ubicación: <span className="font-semibold text-white">{project.client.province || project.client.location}</span> | Fecha: <span className="font-semibold text-white">{currentDateStr}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5 justify-end">
            <span className="w-3.5 h-3.5 bg-white/90 rounded-full inline-block"></span> electsun
          </div>
          <p className="text-[10px] text-white/80 tracking-wider font-semibold">EL SOL A TU FAVOR</p>
        </div>
      </div>
      <div style={{ backgroundColor: activeTheme.secondary }} className="text-center text-white py-1.5 font-bold text-xs uppercase tracking-wider transition-colors">
        {pageTitle}
      </div>
    </>
  );

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-slate-200">
      {/* Top Bar Navigation */}
      <header className="bg-white border-b border-slate-300 px-6 h-16 w-full flex justify-between items-center shrink-0 z-50 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveView('simulator')}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer text-slate-600"
            title="Volver al Simulador"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="font-bold text-xl text-[#2D5A27] tracking-tight">SolarSim Pro</div>
          <div className="h-6 w-px bg-slate-300 mx-1"></div>
          <h1 className="text-xs font-semibold text-slate-600">
            {project.client.name} — Vista Previa de Propuesta PDF
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            Imprimir
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white rounded-lg transition-colors shadow-xs cursor-pointer"
            style={{ backgroundColor: activeTheme.primary }}
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Generando PDF...' : 'Descargar PDF'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Side Controls Toolbar */}
        <aside className="w-[300px] bg-white border-r border-slate-300 flex flex-col h-full shrink-0 shadow-xs">
          {/* Tab Switcher */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            <button
              onClick={() => setSidebarTab('sections')}
              className={`flex-1 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                sidebarTab === 'sections'
                  ? 'border-slate-900 text-slate-900 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Páginas ({activePagesCount})
            </button>
            <button
              onClick={() => setSidebarTab('edit')}
              className={`flex-1 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                sidebarTab === 'edit'
                  ? 'border-slate-900 text-slate-900 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Datos Cotización
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-5">
            {sidebarTab === 'sections' ? (
              <>
                {/* Palette Switcher */}
                <div className="space-y-3">
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-slate-700" /> Paleta de Colores PDF
                  </h3>
                  <div className="grid grid-cols-5 gap-2">
                    {PDF_COLOR_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => setActiveTheme(theme)}
                        title={theme.name}
                        className={`h-9 rounded-lg flex flex-col overflow-hidden border-2 transition-all cursor-pointer ${
                          activeTheme.id === theme.id ? 'border-slate-900 ring-2 ring-slate-400 scale-105' : 'border-transparent opacity-75 hover:opacity-100'
                        }`}
                      >
                        <span className="h-1/2 w-full" style={{ backgroundColor: theme.primary }}></span>
                        <span className="h-1/2 w-full" style={{ backgroundColor: theme.barColor }}></span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-700 text-center">{activeTheme.name}</p>
                </div>

                <div className="h-px w-full bg-slate-200"></div>

                <div className="space-y-3">
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Secciones Incluidas</h3>

                  <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-semibold text-slate-800">Pág 1: Análisis de Energía</span>
                    <input
                      type="checkbox"
                      checked={showPage1}
                      onChange={(e) => setShowPage1(e.target.checked)}
                      className="rounded focus:ring-0 cursor-pointer"
                      style={{ color: activeTheme.primary }}
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-semibold text-slate-800">Pág 2: Cotización de Sistema</span>
                    <input
                      type="checkbox"
                      checked={showPageQuotation}
                      onChange={(e) => setShowPageQuotation(e.target.checked)}
                      className="rounded focus:ring-0 cursor-pointer"
                      style={{ color: activeTheme.primary }}
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-semibold text-slate-800">Pág 3: Retorno de Inversión</span>
                    <input
                      type="checkbox"
                      checked={showPage2}
                      onChange={(e) => setShowPage2(e.target.checked)}
                      className="rounded focus:ring-0 cursor-pointer"
                      style={{ color: activeTheme.primary }}
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-semibold text-slate-800">Pág 4: Flujo de Caja 25 Años</span>
                    <input
                      type="checkbox"
                      checked={showPage3}
                      onChange={(e) => setShowPage3(e.target.checked)}
                      className="rounded focus:ring-0 cursor-pointer"
                      style={{ color: activeTheme.primary }}
                    />
                  </label>
                </div>

                <div className="h-px w-full bg-slate-200"></div>

                <div className="space-y-3">
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Opciones de Formato</h3>
                  <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-semibold text-slate-800">Mostrar Encabezados y Pies</span>
                    <input
                      type="checkbox"
                      checked={showHeadersFooters}
                      onChange={(e) => setShowHeadersFooters(e.target.checked)}
                      className="rounded focus:ring-0 cursor-pointer"
                      style={{ color: activeTheme.primary }}
                    />
                  </label>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Detalles de la Cotización</h3>
                
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">N° Cotización</label>
                  <input
                    type="text"
                    value={project.client.quoteNumber || 'C-0030'}
                    onChange={(e) => updateClient({ quoteNumber: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md outline-none font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Válido por (Días)</label>
                  <input
                    type="number"
                    value={project.client.quoteValidityDays || 7}
                    onChange={(e) => updateClient({ quoteValidityDays: Number(e.target.value) })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md outline-none font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Dirección del Cliente</label>
                  <textarea
                    rows={2}
                    value={project.client.address || 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.'}
                    onChange={(e) => updateClient({ address: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md outline-none"
                  />
                </div>

                <div className="h-px w-full bg-slate-200"></div>

                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Modelos de Equipos</h3>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Módulos Solares (Descripción)</label>
                  <input
                    type="text"
                    value={project.specs.panelBrandModel || 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)'}
                    onChange={(e) => updateSpecs({ panelBrandModel: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Modelo Inversor</label>
                    <input
                      type="text"
                      value={project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}
                      onChange={(e) => updateSpecs({ inverterBrandModel: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-300 rounded-md outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Cant.</label>
                    <input
                      type="number"
                      value={project.specs.inverterCount || 2}
                      onChange={(e) => updateSpecs({ inverterCount: Number(e.target.value) })}
                      className="w-full text-xs p-2 border border-slate-300 rounded-md outline-none font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Modelo Batería</label>
                    <input
                      type="text"
                      value={project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}
                      onChange={(e) => updateSpecs({ batteryBrandModel: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-300 rounded-md outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Cant.</label>
                    <input
                      type="number"
                      value={project.specs.batteryCount || 3}
                      onChange={(e) => updateSpecs({ batteryCount: Number(e.target.value) })}
                      className="w-full text-xs p-2 border border-slate-300 rounded-md outline-none font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Servicios e Instalación</label>
                  <textarea
                    rows={2}
                    value={project.specs.installationServicesDesc || 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).'}
                    onChange={(e) => updateSpecs({ installationServicesDesc: e.target.value })}
                    className="w-full text-xs p-2 border border-slate-300 rounded-md outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <button
              onClick={() => {
                useSimulationStore.setState({ activeProjectId: project.id });
              }}
              className="w-full py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualizar Vista Previa
            </button>
          </div>
        </aside>

        {/* PDF Page Canvas */}
        <main className="flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8 bg-slate-300/80">
          <div ref={pdfRef} className="flex flex-col gap-8 print:gap-0">
            
            {/* ---------------------------------------------------- */}
            {/* PÁGINA 1: ANÁLISIS DE ENERGÍA */}
            {/* ---------------------------------------------------- */}
            {showPage1 && (
              <div className="pdf-page w-[850px] bg-white shadow-xl flex flex-col shrink-0 min-h-[1100px] relative font-sans print:shadow-none print:w-full print:min-h-screen">
                {/* Header Electsun Banner */}
                {renderHeaderBanner('ANÁLISIS DE ENERGÍA Y CONSUMO')}

                {/* Body */}
                <div className="px-10 py-6 flex-1 flex flex-col gap-6">
                  {/* Chart Section */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <h2 className="text-base font-bold text-gray-800 uppercase tracking-wider">
                        Evolución Mensual de Energía
                      </h2>
                      <div className="flex items-center gap-4 text-xs font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs" style={{ backgroundColor: activeTheme.primary }}></span>
                          <span className="text-slate-700">Consumo (kWh)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs" style={{ backgroundColor: activeTheme.barColor }}></span>
                          <span className="text-slate-700">Producción Solar (kWh)</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full bg-gray-50/70 border border-gray-200 rounded-xl p-4 h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={summary.monthlyBreakdown} margin={{ top: 20, right: 10, left: 0, bottom: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#475569', fontWeight: 'bold' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#475569', fontWeight: 'bold' }} />
                          <Tooltip formatter={(val: number) => [`${Math.round(val).toLocaleString()} kWh`, '']} />
                          
                          <Bar dataKey="consumptionKWh" name="Consumo (kWh)" fill={activeTheme.primary} radius={[3, 3, 0, 0]}>
                            <LabelList dataKey="consumptionKWh" position="top" style={{ fontSize: '8px', fill: activeTheme.primary, fontWeight: 'bold' }} formatter={(val: number) => Math.round(val)} />
                          </Bar>
                          <Bar dataKey="productionKWh" name="Producción Solar (kWh)" fill={activeTheme.barColor} radius={[3, 3, 0, 0]}>
                            <LabelList dataKey="productionKWh" position="top" style={{ fontSize: '8px', fill: activeTheme.secondary, fontWeight: 'bold' }} formatter={(val: number) => Math.round(val)} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Table Section */}
                  <div className="space-y-3">
                    <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-2 uppercase tracking-wider">
                      Resumen Mensual de Energía
                    </h2>
                    <div className="border border-gray-200 rounded-lg overflow-hidden shadow-xs">
                      <table className="w-full text-xs text-left">
                        <thead className="text-white uppercase font-bold" style={{ backgroundColor: activeTheme.primary }}>
                          <tr>
                            <th className="px-4 py-2.5">Mes</th>
                            <th className="px-4 py-2.5 text-right">Consumo (kWh)</th>
                            <th className="px-4 py-2.5 text-right">Producción (kWh)</th>
                            <th className="px-4 py-2.5 text-right">Ahorro Energ. (kWh)</th>
                            <th className="px-4 py-2.5 text-right">%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 font-semibold text-gray-700">
                          {summary.monthlyBreakdown.map((row, idx) => {
                            const monthCoverage = row.consumptionKWh > 0
                              ? Math.min(100, (row.productionKWh / row.consumptionKWh) * 100)
                              : 0;
                            return (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                                <td className="px-4 py-2 font-bold text-gray-800">{row.month}</td>
                                <td className="px-4 py-2 text-right font-medium">{row.consumptionKWh.toLocaleString()}</td>
                                <td className="px-4 py-2 text-right font-medium">{row.productionKWh.toFixed(1)}</td>
                                <td className="px-4 py-2 text-right font-medium">{row.solarSelfConsumedKWh.toFixed(1)}</td>
                                <td className="px-4 py-2 text-right font-bold" style={{ color: activeTheme.secondary }}>
                                  {monthCoverage.toFixed(2)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="font-bold bg-gray-100 text-gray-900 border-t-2 border-gray-300 text-xs">
                          <tr>
                            <td className="px-4 py-2.5 uppercase font-extrabold">TOTAL</td>
                            <td className="px-4 py-2.5 text-right">{totalConsumptionKWh.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right">{totalProductionKWh.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right">{totalSavingsKWh.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-extrabold" style={{ color: activeTheme.primary }}>{summary.energyCoveragePct.toFixed(2)}%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Impact Section */}
                  <div className={`mt-auto border rounded-xl p-4 flex gap-4 items-center ${activeTheme.accentLightBg} ${activeTheme.accentBorder}`}>
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xs shrink-0" style={{ color: activeTheme.primary }}>
                      <Leaf className="w-5 h-5" />
                    </div>
                    <div className="text-xs">
                      <h3 className="font-bold text-sm mb-0.5" style={{ color: activeTheme.primary }}>Impacto Ambiental</h3>
                      <p className="text-slate-800">
                        Reducción estimada de CO₂: <span className="font-bold">{summary.co2AvoidedTonsPerYear} Toneladas/año</span>. Esto equivale a plantar aproximadamente <span className="font-bold">{treesPlanted} árboles</span> anuales.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                {showHeadersFooters && (
                  <div className="px-10 py-4 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500 mt-auto font-semibold">
                    <span>Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do</span>
                    <span className="font-bold text-gray-700">Página {page1Num} de {activePagesCount}</span>
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* PÁGINA 2: COTIZACIÓN DE SISTEMA FOTOVOLTAICO */}
            {/* ---------------------------------------------------- */}
            {showPageQuotation && (
              <div className="pdf-page w-[850px] bg-white shadow-xl flex flex-col shrink-0 min-h-[1100px] relative font-sans print:shadow-none print:w-full print:min-h-screen">
                {/* Header Electsun Banner */}
                {renderHeaderBanner('COTIZACIÓN DE SISTEMA FOTOVOLTAICO')}

                {/* Body */}
                <div className="px-10 py-6 flex-1 flex flex-col gap-5 text-xs text-slate-800 font-sans">
                  {/* DATOS DEL CLIENTE */}
                  <div>
                    <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase border-l-4 mb-2" style={{ color: activeTheme.primary, borderColor: activeTheme.primary }}>
                      DATOS DEL CLIENTE :
                    </h3>
                    <div className="grid grid-cols-2 gap-4 px-2 text-[11px]">
                      <div className="space-y-1">
                        <div><span className="font-bold text-slate-600">Cliente:</span> <span className="font-bold text-slate-900">{project.client.name}</span></div>
                        <div><span className="font-bold text-slate-600">Contacto:</span> {project.client.company || project.client.name}</div>
                        <div><span className="font-bold text-slate-600">Teléfono:</span> {project.client.contactPhone || '809-555-0199'}</div>
                        <div><span className="font-bold text-slate-600">Dirección:</span> {project.client.address || 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.'}</div>
                      </div>
                      <div className="space-y-1 text-right">
                        <div><span className="font-bold text-slate-600">N° Cotización:</span> <span className="font-bold text-slate-900">{project.client.quoteNumber || 'C-0030'}</span></div>
                        <div><span className="font-bold text-slate-600">Fecha:</span> <span className="font-semibold text-slate-800">{currentDateStr}</span></div>
                        <div><span className="font-bold text-slate-600">Válido por:</span> <span className="font-bold" style={{ color: activeTheme.secondary }}>{project.client.quoteValidityDays || 7} Días</span></div>
                      </div>
                    </div>
                  </div>

                  {/* ESPECIFICACIONES DEL SISTEMA */}
                  <div>
                    <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase border-l-4 mb-2" style={{ color: activeTheme.primary, borderColor: activeTheme.primary }}>
                      ESPECIFICACIONES DEL SISTEMA
                    </h3>
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
                      <div>
                        <div><span className="font-bold text-slate-700">Potencia (kW-dc):</span> <span className="font-bold text-slate-900">{summary.systemCapacityKWp.toFixed(2)}</span></div>
                        <div><span className="font-bold text-slate-700">Tipo de instalación:</span> Fotovoltaica</div>
                      </div>
                      <div className="text-right">
                        <div><span className="font-bold text-slate-700">Consumo mensual estimado (kWh):</span> <span className="font-bold text-slate-900">{Math.round(summary.annualConsumptionKWh / 12).toLocaleString()}</span></div>
                        <div><span className="font-bold text-slate-700">EDES / Distribuidor:</span> <span className="font-bold" style={{ color: activeTheme.primary }}>{project.client.distributor || 'EDEESTE'}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* EQUIPOS Y MATERIALES */}
                  <div>
                    <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase border-l-4 mb-2" style={{ color: activeTheme.primary, borderColor: activeTheme.primary }}>
                      EQUIPOS Y MATERIALES
                    </h3>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead className="text-white font-bold text-[10px] uppercase" style={{ backgroundColor: activeTheme.primary }}>
                          <tr>
                            <th className="px-3 py-2">DESCRIPCION</th>
                            <th className="px-3 py-2 text-center w-20">CANT.</th>
                            <th className="px-3 py-2 text-center w-20">UNIDAD</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-[11px] text-slate-800 font-semibold">
                          <tr className="bg-white">
                            <td className="px-3 py-2">{project.specs.panelBrandModel || 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)'}</td>
                            <td className="px-3 py-2 text-center font-bold">{project.specs.panelCount}</td>
                            <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                          </tr>
                          <tr className="bg-slate-50/60">
                            <td className="px-3 py-2">{project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}</td>
                            <td className="px-3 py-2 text-center font-bold">{project.specs.inverterCount || 2}</td>
                            <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                          </tr>
                          {project.specs.hasBattery && (
                            <tr className="bg-white">
                              <td className="px-3 py-2">{project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}</td>
                              <td className="px-3 py-2 text-center font-bold">{project.specs.batteryCount || 3}</td>
                              <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                            </tr>
                          )}
                          <tr className="bg-slate-50/60">
                            <td className="px-3 py-2">{project.specs.installationServicesDesc || 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).'}</td>
                            <td className="px-3 py-2 text-center font-bold">1</td>
                            <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* DESGLOSE FINANCIERO RIGHT ALIGNED */}
                  <div className="flex justify-end">
                    <div className="w-[380px] bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-[11px]">
                      <div className="flex justify-between text-slate-700">
                        <span className="font-semibold">SUB-TOTAL (USD) SIN ITBIS :</span>
                        <span className="font-bold">${(summary.grossInvestmentUSD / 1.18).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-slate-900 bg-slate-200/80 px-2 py-1 rounded font-bold">
                        <span>TOTAL GENERAL (USD) :</span>
                        <span>${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-semibold" style={{ color: activeTheme.secondary }}>
                        <span>ITBIS A DESCONTAR POR LEY 57-07 US$ :</span>
                        <span className="font-bold">${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-white px-2 py-1 rounded font-bold" style={{ backgroundColor: activeTheme.primary }}>
                        <span>TOTAL GENERAL (USD) LEY 57-07 :</span>
                        <span>${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-slate-800 pt-1 border-t border-slate-300">
                        <span className="font-bold">PRECIO POR WATT (USD/W):</span>
                        <span className="font-bold" style={{ color: activeTheme.primary }}>${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD || 1.13).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* INCENTIVOS DE LEY 57-07 */}
                  <div>
                    <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase border-l-4 mb-1" style={{ color: activeTheme.primary, borderColor: activeTheme.primary }}>
                      INCENTIVOS DE LEY 57-07
                    </h3>
                    <p className="text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1 rounded mb-2">
                      (Descuento de 40% para equipos energía renovables: Paneles solares, inversores y baterías)
                    </p>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead className="text-white font-bold text-[10px] uppercase" style={{ backgroundColor: activeTheme.primary }}>
                          <tr>
                            <th className="px-3 py-1.5">CONCEPTO</th>
                            <th className="px-3 py-1.5 text-right">VALOR US $</th>
                            <th className="px-3 py-1.5 text-right w-20">%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-[11px] text-slate-800 font-semibold">
                          <tr className="bg-white font-bold">
                            <td className="px-3 py-1.5">TOTAL EQUIPOS ENERGIAS RENOVABLES (PANELES-INVERSORES-BATERIAS)</td>
                            <td className="px-3 py-1.5 text-right">${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-1.5 text-right">100%</td>
                          </tr>
                          <tr className="bg-slate-50/60">
                            <td className="px-3 py-1.5">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 1ER AÑO</td>
                            <td className="px-3 py-1.5 text-right" style={{ color: activeTheme.secondary }}>${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-1.5 text-right" style={{ color: activeTheme.secondary }}>13.33%</td>
                          </tr>
                          <tr className="bg-white">
                            <td className="px-3 py-1.5">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 2DO AÑO</td>
                            <td className="px-3 py-1.5 text-right" style={{ color: activeTheme.secondary }}>${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-1.5 text-right" style={{ color: activeTheme.secondary }}>13.33%</td>
                          </tr>
                          <tr className="bg-slate-50/60">
                            <td className="px-3 py-1.5">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 3ER AÑO</td>
                            <td className="px-3 py-1.5 text-right" style={{ color: activeTheme.secondary }}>${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-1.5 text-right" style={{ color: activeTheme.secondary }}>13.33%</td>
                          </tr>
                          <tr className={`font-bold ${activeTheme.accentLightBg}`} style={{ color: activeTheme.primary }}>
                            <td className="px-3 py-1.5">TOTAL A DESCONTAR POR LA LEY 57-07 (40% DEL TOTAL)</td>
                            <td className="px-3 py-1.5 text-right" style={{ color: activeTheme.primary }}>${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-1.5 text-right" style={{ color: activeTheme.primary }}>40.00%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* GARANTÍAS Y NOS ENCARGAMOS DE GESTIONAR GRID */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-[11px]">
                      <h4 className="font-bold border-b border-slate-200 pb-1 mb-1 uppercase tracking-wider flex items-center gap-1.5" style={{ color: activeTheme.primary }}>
                        <ShieldCheck className="w-3.5 h-3.5" /> GARANTÍAS
                      </h4>
                      <div>• <span className="font-bold">Paneles Solares:</span> 25 años (80.7% potencia mínima garantizada)</div>
                      <div>• <span className="font-bold">Inversor:</span> 5 años</div>
                      <div>• <span className="font-bold">Estructura de montaje:</span> 10 años</div>
                      <div>• <span className="font-bold">Batería:</span> 10 años</div>
                      <div>• <span className="font-bold">Mano de obra:</span> 1 año</div>
                    </div>

                    <div className={`border rounded-lg p-3 space-y-1 text-[11px] ${activeTheme.accentLightBg} ${activeTheme.accentBorder}`}>
                      <h4 className="font-bold border-b pb-1 mb-1 uppercase tracking-wider flex items-center gap-1.5" style={{ color: activeTheme.primary, borderColor: activeTheme.primary }}>
                        <CheckCircle2 className="w-3.5 h-3.5" style={{ color: activeTheme.primary }} /> NOS ENCARGAMOS DE GESTIONAR
                      </h4>
                      <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: activeTheme.primary }} /> <span>Instalación del contador bidireccional en las EDES</span></div>
                      <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: activeTheme.primary }} /> <span>Aprobación de crédito fiscal (CNE) y el Ministerio de Hacienda</span></div>
                      <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: activeTheme.primary }} /> <span>Trámites completos ante organismos reguladores</span></div>
                    </div>
                  </div>

                  {/* LEGAL SUBTEXT BETWEEN ASTERISKS */}
                  <div className="text-center text-[10px] text-slate-500 font-semibold italic pt-1">
                    * Equipos según disponibilidad de inventario | * Propuesta válida por {project.client.quoteValidityDays || 7} días | * Precios en USD *
                  </div>
                </div>

                {/* Footer Electsun */}
                {showHeadersFooters && (
                  <div className="px-10 py-3 bg-slate-100 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-600 font-semibold mt-auto">
                    <div>Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do</div>
                    <div className="font-bold text-slate-800">Página {pageQuotNum} de {activePagesCount}</div>
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* PÁGINA 3: RETORNO DE INVERSIÓN - RESUMEN */}
            {/* ---------------------------------------------------- */}
            {showPage2 && (
              <div className="pdf-page w-[850px] bg-white shadow-xl flex flex-col shrink-0 min-h-[1100px] relative font-sans print:shadow-none print:w-full print:min-h-screen">
                {/* Header Electsun Banner */}
                {renderHeaderBanner('RETORNO DE INVERSIÓN - RESUMEN')}

                {/* Body */}
                <div className="px-10 py-8 flex-1 flex flex-col gap-8">
                  {/* Financial Indicators Grid */}
                  <div className="space-y-4">
                    <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-2 uppercase tracking-wider">
                      Indicadores Financieros
                    </h2>
                    <div className="grid grid-cols-5 gap-3">
                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Payback</p>
                        <p className="text-xl font-bold text-gray-900">
                          {summary.paybackYears} <span className="text-xs font-medium text-gray-500">Años</span>
                        </p>
                      </div>

                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">TIR</p>
                        <p className="text-xl font-bold" style={{ color: activeTheme.primary }}>{summary.irrPct}%</p>
                      </div>

                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">VAN (10%)</p>
                        <p className="text-base font-bold text-gray-900">
                          ${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>

                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Ahorro 25 Años</p>
                        <p className="text-base font-bold text-green-700">
                          ${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>

                      <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3.5 text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">ROI</p>
                        <p className="text-xl font-bold text-gray-900">{summary.roi25YrPct}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Parameters Table */}
                  <div className="space-y-4">
                    <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-2 uppercase tracking-wider">
                      Cálculo de Ahorro y Retorno de Inversión
                    </h2>
                    <div className="border border-gray-200 rounded-lg overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <tbody className="divide-y divide-gray-200 text-gray-700 font-semibold">
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 text-gray-800 w-1/2">Cliente</td>
                            <td className="px-4 py-2.5 text-right font-bold uppercase text-gray-900">{project.client.name}</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2.5 text-gray-800">Potencia Instalada (kWp)</td>
                            <td className="px-4 py-2.5 text-right font-bold">{summary.systemCapacityKWp.toFixed(2)} kWp</td>
                          </tr>
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 text-gray-800">Inversión Inicial</td>
                            <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                              ${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2.5 text-gray-800">Incentivo Fiscal Estimado (Ley 57-07)</td>
                            <td className="px-4 py-2.5 text-right font-bold text-green-700">
                              -${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 text-gray-800">Inversión Neta</td>
                            <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                              ${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Milestones Table */}
                  <div className="space-y-4">
                    <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-2 uppercase tracking-wider">
                      Resumen de Ahorro Anual y Retorno de Inversión
                    </h2>
                    <div className="border border-gray-200 rounded-lg overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="text-white uppercase font-bold" style={{ backgroundColor: activeTheme.primary }}>
                          <tr>
                            <th className="px-4 py-2.5">Año</th>
                            <th className="px-4 py-2.5 text-right">Ahorro Energético (USD)</th>
                            <th className="px-4 py-2.5 text-right">Beneficio Acumulado (USD)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-gray-700 font-semibold">
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 font-bold">Año 1</td>
                            <td className="px-4 py-2.5 text-right">${year1Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right text-red-600 font-bold">
                              ${year1Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className={`font-bold ${activeTheme.accentLightBg}`}>
                            <td className="px-4 py-2.5" style={{ color: activeTheme.primary }}>Año {paybackYearObj.year} (Payback)</td>
                            <td className="px-4 py-2.5 text-right">${paybackYearObj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right font-bold" style={{ color: activeTheme.primary }}>
                              ${paybackYearObj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="bg-gray-50/60">
                            <td className="px-4 py-2.5 font-bold">Año 10</td>
                            <td className="px-4 py-2.5 text-right">${year10Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right text-green-700 font-bold">
                              ${year10Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="font-bold">
                            <td className="px-4 py-2.5 font-bold">Año 25</td>
                            <td className="px-4 py-2.5 text-right">${year25Obj.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2.5 text-right font-bold" style={{ color: activeTheme.primary }}>
                              ${year25Obj.cumulativeCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Accumulated Benefit Chart */}
                  <div className="space-y-3 mt-auto">
                    <h2 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-2 uppercase tracking-wider">
                      Beneficio Acumulado (25 Años)
                    </h2>
                    <div className="h-[200px] w-full bg-gray-50/70 border border-gray-200 rounded-xl p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={cumulativeChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="yearLabel" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} />
                          <YAxis
                            tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }}
                            tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
                          />
                          <Tooltip formatter={(val: number) => [`$${val.toLocaleString()} USD`, 'Beneficio Acumulado']} />
                          <Bar dataKey="cumulative" radius={[2, 2, 0, 0]}>
                            {cumulativeChartData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.cumulative < 0 ? '#ef4444' : activeTheme.barColor}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                {showHeadersFooters && (
                  <div className="px-10 py-4 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500 font-semibold mt-auto">
                    <span>Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do</span>
                    <span className="font-bold text-gray-700">Página {page2Num} de {activePagesCount}</span>
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* PÁGINA 4: FLUJO DE CAJA Y BENEFICIOS ACUMULADOS (25 AÑOS) */}
            {/* ---------------------------------------------------- */}
            {showPage3 && (
              <div className="pdf-page w-[850px] bg-white shadow-xl flex flex-col shrink-0 min-h-[1100px] relative font-sans print:shadow-none print:w-full print:min-h-screen">
                {/* Header Electsun Banner */}
                {renderHeaderBanner('FLUJO DE CAJA Y BENEFICIOS ACUMULADOS (25 AÑOS)')}

                {/* Body */}
                <div className="px-10 py-6 flex-1 flex flex-col justify-between gap-6">
                  {/* Detailed Cash Flow Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs text-xs flex-1 flex flex-col">
                    <table className="w-full text-left border-collapse flex-1">
                      <thead className="text-white font-bold uppercase tracking-wider text-[11px] shrink-0" style={{ backgroundColor: activeTheme.primary }}>
                        <tr>
                          <th className="px-4 py-2.5 w-12 text-center">Año</th>
                          <th className="px-4 py-2.5 text-right">Energía Generada (kWh)</th>
                          <th className="px-4 py-2.5 text-right">Ahorro (USD)</th>
                          <th className="px-4 py-2.5 text-right">Incentivo (USD)</th>
                          <th className="px-4 py-2.5 text-right">Flujo de Caja (USD)</th>
                          <th className="px-4 py-2.5 text-right font-bold">Beneficio Acumulado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
                        {/* Year 0 Row */}
                        <tr className="bg-red-50/70 text-red-700 font-bold">
                          <td className="px-4 py-2 text-center">0</td>
                          <td className="px-4 py-2 text-right text-slate-400">-</td>
                          <td className="px-4 py-2 text-right text-slate-400">-</td>
                          <td className="px-4 py-2 text-right text-slate-400">-</td>
                          <td className="px-4 py-2 text-right text-slate-400">-</td>
                          <td className="px-4 py-2 text-right text-red-600">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2 text-right text-red-600 font-extrabold">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>

                        {/* Years 1 to 25 */}
                        {cf25.map((row) => {
                          const isPaybackYear = row.year === Math.ceil(summary.paybackYears);
                          const isCumulativeNegative = row.cumulativeCashFlowUSD < 0;

                          return (
                            <tr
                              key={row.year}
                              className={
                                isPaybackYear
                                  ? `${activeTheme.accentLightBg} font-bold border-y border-slate-300`
                                  : row.year % 2 === 0
                                  ? 'bg-slate-50/60'
                                  : 'bg-white'
                              }
                            >
                              <td className="px-4 py-1.5 text-center font-bold">{row.year}</td>
                              <td className="px-4 py-1.5 text-right font-medium">{row.productionKWh.toLocaleString()}</td>
                              <td className="px-4 py-1.5 text-right font-medium">${row.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="px-4 py-1.5 text-right font-semibold" style={{ color: activeTheme.secondary }}>
                                {row.taxCreditUSD > 0 ? `$${row.taxCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
                              </td>
                              <td className="px-4 py-1.5 text-right font-semibold">${row.netCashFlowUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td
                                className={`px-4 py-1.5 text-right font-bold`}
                                style={{ color: isCumulativeNegative ? '#dc2626' : activeTheme.primary }}
                              >
                                {isCumulativeNegative ? '-' : ''}${Math.abs(row.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Restored Full Summary Indicators Box */}
                  <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 shrink-0">
                    <h3 className="text-slate-800 font-bold text-xs mb-2.5 border-b border-slate-200 pb-1.5 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" style={{ color: activeTheme.primary }} /> Indicadores Financieros del Proyecto
                    </h3>
                    <div className="grid grid-cols-4 gap-y-2.5 gap-x-4 text-xs">
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold mb-0.5">Payback</p>
                        <p className="font-bold text-slate-900">{summary.paybackYears} años</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold mb-0.5">TIR</p>
                        <p className="font-bold" style={{ color: activeTheme.primary }}>{summary.irrPct}%</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold mb-0.5">VAN (10%)</p>
                        <p className="font-bold text-slate-900">${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold mb-0.5">Ahorro Total 25 Años</p>
                        <p className="font-bold" style={{ color: activeTheme.primary }}>${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold mb-0.5">ROI Total</p>
                        <p className="font-bold" style={{ color: activeTheme.primary }}>{summary.roi25YrPct}%</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold mb-0.5">Reducción CO2</p>
                        <p className="font-bold text-slate-900">{(summary.co2AvoidedTonsPerYear * 25).toFixed(1)} Ton</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold mb-0.5">Precio por Watt</p>
                        <p className="font-bold text-slate-900">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD).toFixed(3)} USD/W</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold mb-0.5">Capacidad DC</p>
                        <p className="font-bold text-slate-900">{summary.systemCapacityKWp.toFixed(2)} kWp</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                {showHeadersFooters && (
                  <div className="px-10 py-4 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500 font-semibold mt-auto">
                    <span>Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do</span>
                    <span className="font-bold text-gray-700">Página {page3Num} de {activePagesCount}</span>
                  </div>
                )}
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
};
