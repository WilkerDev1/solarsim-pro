import { StoredProposal } from './types';
import { ELECTSUN_LOGO_COLOR_BASE64 } from './electsunLogo';

function formatMarkdown(text?: string | null, boldClass = 'font-bold text-slate-950'): string {
  if (!text) return '';
  return text.replace(/\*\*([^*]+)\*\*/g, `<strong class="${boldClass}">$1</strong>`);
}

export function renderExpiredPage(companyName = 'electsun', companyPhone = '+1 (809) 378-6590'): string {
  return `<!DOCTYPE html>
<html lang="es" class="h-full bg-slate-100 text-slate-900">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Propuesta No Disponible | ${companyName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
  </style>
</head>
<body class="h-full flex items-center justify-center p-4 bg-[#f0f7fc]">
  <div class="max-w-md w-full bg-white border border-sky-200 rounded-3xl p-8 text-center shadow-xl relative overflow-hidden">
    <div class="mb-6 flex justify-center">
      <img src="${ELECTSUN_LOGO_COLOR_BASE64}" alt="${companyName}" class="h-16 max-h-[68px] w-auto object-contain drop-shadow-sm" />
    </div>
    <div class="w-12 h-12 bg-orange-50 border border-orange-200 rounded-2xl flex items-center justify-center mx-auto mb-4 text-orange-500">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <h1 class="text-2xl font-black text-slate-900 mb-2">Propuesta Vencida o No Disponible</h1>
    <p class="text-slate-600 text-sm mb-6 leading-relaxed">
      Este enlace temporal ha expirado o el documento ya no se encuentra accesible en la nube.
    </p>
    <div class="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 mb-6 text-xs text-slate-700 text-left space-y-2">
      <div class="flex justify-between"><span class="text-slate-500 font-semibold">Empresa:</span> <span class="font-bold text-sky-900">${companyName}</span></div>
      ${companyPhone ? `<div class="flex justify-between"><span class="text-slate-500 font-semibold">Teléfono:</span> <span class="font-bold text-orange-600">${companyPhone}</span></div>` : ''}
      <div class="flex justify-between"><span class="text-slate-500 font-semibold">Seguridad:</span> <span class="text-slate-600">Expiración Automática</span></div>
    </div>
    ${companyPhone ? `
    <a href="https://wa.me/${companyPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hola, estaba intentando ver una propuesta solar que ha expirado y me gustaría solicitar una actualización.')}" target="_blank" class="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-sm shadow-lg shadow-orange-500/20 transition-all active:scale-98">
      <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
      Solicitar Propuesta Actualizada
    </a>` : ''}
  </div>
</body>
</html>`;
}

export function renderProposalPage(stored: StoredProposal): string {
  const { project, summary, expiresAt } = stored;
  const client = project.client || {};
  const specs = project.specs || {};
  const rates = project.rates || {};
  const financials = project.financials || {};
  const custom = project.customization || {};

  const companyName = custom.companyName || 'electsun';
  const companySlogan = custom.companySlogan || 'El sol a tu favor';
  const rawCompanyPhone = custom.companyPhone || '+1 (809) 378-6590';
  const companyPhone = (rawCompanyPhone.includes('555-0199') || rawCompanyPhone.includes('5550199')) ? '+1 (809) 378-6590' : rawCompanyPhone;
  const companyEmail = custom.companyEmail || 'info@electsun.com.do';
  const companyRnc = custom.companyRnc || '';
  const companyWebsite = custom.companyWebsite || 'electsun.com.do';
  const contactName = custom.contactName || client.name || 'Contacto';
  const rawClientPhone = custom.clientPhone || client.contactPhone || '809-378-6590';
  const clientPhone = (rawClientPhone.includes('555-0199') || rawClientPhone.includes('5550199')) ? '809-378-6590' : rawClientPhone;

  const logoBase64 = custom.headerLogoBase64 || custom.coverLogoBase64 || ELECTSUN_LOGO_COLOR_BASE64;

  const rawClientName = client.name || 'Cliente Estimado';
  const clientName = rawClientName.replace(/\s*\((?:Copia|Copia Importada|COPIA|V\d+|C\d+)\)\s*/gi, '').trim();
  const projectId = client.projectId || 'SP-2026-001';
  const quoteNumber = client.quoteNumber || 'C-0001';
  const quoteValidityDays = client.quoteValidityDays || stored.validityDays || 7;
  const province = client.province || client.location || 'Santo Domingo';
  const clientAddress = client.address || `${province}, República Dominicana`;
  const distributor = rates.distributor || client.distributor || 'EDEESTE';
  const tariffCode = rates.tariffCode || client.tariffCode || 'BTS2';
  const isZeroExport = !!rates.isZeroExport;
  const exportFee = rates.gridExportFeePct ?? 25;

  const systemCapacityKWp = Number(summary?.systemCapacityKWp || ((specs.panelCount || 0) * (specs.panelPowerW || 0)) / 1000).toFixed(2);
  const panelCount = specs.panelCount || 0;
  const panelPowerW = specs.panelPowerW || 0;
  const panelBrandModel = specs.panelBrandModel || 'Módulos Monocristalinos Tier-1 TOPCon';
  const inverterBrandModel = specs.inverterBrandModel || 'Inversor Solar On-Grid / Híbrido';
  const inverterCount = specs.inverterCount || 1;
  const inverterPowerKW = specs.inverterPowerKW || (Number(systemCapacityKWp) * 0.9).toFixed(1);
  const hasBattery = specs.hasBattery || false;
  const batteryCapacityKWh = specs.batteryCapacityKWh || 0;
  const batteryCount = specs.batteryCount || 1;
  const batteryBrandModel = specs.batteryBrandModel || 'Banco de Baterías Litio LiFePO4';
  const installationServicesDesc = specs.installationServicesDesc || 'Instalación y Accesorios (Estructura de montaje en aluminio anodizado, cableado fotovoltaico resistente a rayos UV, protecciones en CC/CA, interruptores de desconexión y puesta en marcha).';

  const annualProductionKWh = Number(summary?.annualProductionKWh || 0);
  const annualConsumptionKWh = Number(summary?.annualConsumptionKWh || 0);
  const coveragePct = Number(summary?.energyCoveragePct || 0);
  const monthlyAvgConsumption = Math.round(annualConsumptionKWh / 12);

  const grossInvestmentUSD = Number(summary?.grossInvestmentUSD || 0);
  const laborPortionUSD = Number(summary?.laborPortionUSD || summary?.costMatrix?.laborVentaUSD || 0);
  const equipmentPortionUSD = Number(summary?.equipmentPortionUSD || summary?.costMatrix?.equipmentVentaUSD || Math.max(0, grossInvestmentUSD - laborPortionUSD) || grossInvestmentUSD);
  const itbisSavedUSD = Number(summary?.itbisSavedUSD || 0);
  const ley5707CreditUSD = Number(summary?.ley5707CreditUSD || (equipmentPortionUSD * 0.40));
  const subTotalSinITBIS = Number(summary?.costMatrix?.precioNetoUSD || (grossInvestmentUSD - itbisSavedUSD));
  const pricePerWattUSD = Number(specs.pricePerWattUSD || financials.pricePerWattUSD || (grossInvestmentUSD / (Number(systemCapacityKWp) * 1000)) || 1.13).toFixed(2);

  const paybackYears = Number(summary?.paybackYears || 0).toFixed(1);
  const irrPct = Number(summary?.irrPct || 0).toFixed(1);
  const npvUSD = Number(summary?.npvUSD || 0);
  const roi25YrPct = Number(summary?.roi25YrPct || 0).toFixed(1);
  const total25YearSavingsUSD = Number(summary?.total25YearSavingsUSD || 0);
  const co2AvoidedTonsPerYear = Number(summary?.co2AvoidedTonsPerYear || 0);
  const treesPlanted = Math.round(co2AvoidedTonsPerYear * 16);

  // Monthly Breakdown
  const monthlyData = summary?.monthlyBreakdown || [];
  const monthLabels = JSON.stringify(monthlyData.map((m: any) => m.month || ''));
  const monthConsumption = JSON.stringify(monthlyData.map((m: any) => Math.round(m.consumptionKWh || 0)));
  const monthProduction = JSON.stringify(monthlyData.map((m: any) => Math.round(m.productionKWh || 0)));

  // Cashflow 25 Years
  const cf25 = summary?.cashFlow25Years || [];
  const initialOutflowUSD = grossInvestmentUSD - itbisSavedUSD;
  const cumulativeChartData = [
    { year: 0, cumulative: -initialOutflowUSD },
    ...cf25.map((c: any) => ({
      year: c.year,
      cumulative: c.cumulativeCashFlowUSD,
    })),
  ];
  const cumulativeYears = JSON.stringify(cumulativeChartData.map((c) => `Año ${c.year}`));
  const cumulativeValues = JSON.stringify(cumulativeChartData.map((c) => Math.round(c.cumulative)));

  const year1Obj = cf25[0] || { savingsUSD: 0, cumulativeCashFlowUSD: -initialOutflowUSD };
  const paybackCeil = Math.ceil(Number(paybackYears)) || 3;
  const paybackYearObj = cf25.find((c: any) => c.year === paybackCeil) || cf25[2] || year1Obj;
  const year10Obj = cf25[9] || year1Obj;
  const year25Obj = cf25[cf25.length - 1] || year1Obj;

  const panelWarranty = custom.panelWarrantyText || '25 Años';
  const inverterWarranty = custom.inverterWarrantyText || '5 a 10 Años';
  const batteryWarranty = custom.batteryWarrantyText || '5 a 10 Años';
  const workmanshipWarranty = custom.workmanshipWarrantyText || '1 Año';
  const servicesText = custom.servicesIncludedText || 'Instalación del contador bidireccional en las EDES, Aprobación de crédito fiscal (CNE) y el Ministerio de Hacienda, Trámites completos ante organismos reguladores';
  const serviceItems = servicesText.split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
  const validityNote = custom.validityNote || `* Equipos según disponibilidad de inventario | * Propuesta válida por ${quoteValidityDays} días | * Precios en USD *`;

  // Dynamic Regulatory text
  const isMonomic = tariffCode === 'BTS1' || tariffCode === 'BTS2';
  const regP1 = isZeroExport
    ? 'El sistema fotovoltaico operará bajo la modalidad de Inyección Cero (Zero-Export con limitador antivertido), suministrando energía prioritariamente a los consumos internos del inmueble y evitando cualquier inyección de excedentes hacia la red eléctrica de distribución.'
    : 'La energía generada mensualmente se descontará del consumo tomado de la red pública (EDES) o de la planta eléctrica. Cuando la producción supere el consumo, el excedente se acreditará como descuento en su factura eléctrica bajo el régimen de Medición Neta.';
  const regP2 = 'La presente propuesta ha sido elaborada conforme a la Resolución SIE-007-2026-REG y se basa en criterios técnicos y el historial de consumo del cliente.';
  const regP3 = 'Los ahorros indicados son estimados y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.';
  const regP4 = isZeroExport
    ? `Al operar con limitador antivertido (inyección cero)${hasBattery ? ' y almacenamiento en baterías de litio' : ''}, la totalidad de la energía solar se aprovecha internamente, por lo que el proyecto no genera cargos por derecho de uso de la red bajo la normativa vigente.`
    : isMonomic
    ? `Para los clientes con tarifas ${tariffCode}, el análisis económico considera el cargo por derecho de uso de la red, equivalente al ${exportFee}% del valor de la energía excedente exportada, conforme a la normativa vigente (Resolución SIE-007-2026-REG). Por esta razón, el sistema se diseña para maximizar el autoconsumo y minimizar la exportación de energía.${hasBattery ? '' : ' Cuando resulte conveniente, se recomendará la incorporación de baterías de litio para incrementar el aprovechamiento de la energía generada.'}`
    : `Para clientes con tarifa binómica (${tariffCode}), el análisis económico contempla el régimen de Medición Neta con compensación 1:1 de energía activa, no aplicando retención por uso de red conforme a la regulación vigente.`;

  // Custom Executive Summary & Page 6 fields
  const projectSummarySubtitle = custom.projectSummarySubtitle && custom.projectSummarySubtitle.trim()
    ? custom.projectSummarySubtitle.trim()
    : `Criterios de dimensionamiento técnico y solar para ${clientName}`;

  const customP1 = custom.customProjectSummaryParagraph1 && custom.customProjectSummaryParagraph1.trim()
    ? custom.customProjectSummaryParagraph1.trim()
    : '';

  const customP2 = custom.customProjectSummaryParagraph2 && custom.customProjectSummaryParagraph2.trim()
    ? custom.customProjectSummaryParagraph2.trim()
    : '';

  const engineeringScopeText = custom.projectEngineeringScopeText !== undefined && custom.projectEngineeringScopeText.trim() !== ''
    ? custom.projectEngineeringScopeText.trim()
    : (specs.installationServicesDesc || 'junto con todos los componentes de ingeniería complementarios (estructuras de montaje en aluminio anodizado de alta resistencia, cableado fotovoltaico resistente a rayos UV, protecciones en CC/CA, interruptores de desconexión y supresores de sobretensión) para garantizar un funcionamiento seguro, eficiente y duradero del sistema.');

  const customRegNote = custom.regulatoryNote;
  const regParagraphs: string[] = (customRegNote && customRegNote.trim() !== '')
    ? customRegNote.split('\n\n').filter(Boolean)
    : [regP1, regP2, regP3, regP4];

  const cleanPhone = companyPhone.replace(/[^0-9]/g, '');
  const whatsappMessage = encodeURIComponent(
    `☀️ *Propuesta Solar Fotovoltaica (${systemCapacityKWp} kWp)*\n` +
    `Estimado equipo de *${companyName}*, he revisado la propuesta web oficial para *${clientName}* (Cotización #${quoteNumber}) y deseo coordinar la visita técnica y siguientes pasos.`
  );

  return `<!DOCTYPE html>
<html lang="es" class="h-full bg-slate-100 text-slate-800 antialiased selection:bg-orange-500 selection:text-white">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Propuesta Solar ${clientName} | ${companyName}</title>
  <meta name="description" content="Propuesta técnica y económica oficial de energía solar fotovoltaica para ${clientName} por ${companyName}.">
  
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Chart.js CDN -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  
  <!-- Google Fonts: Plus Jakarta Sans & JetBrains Mono -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
  
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    
    /* Electsun Corporate Color Accents */
    :root {
      --solar-orange: #ff7a00;
      --solar-orange-dark: #ea580c;
      --sky-blue: #0284c7;
      --sky-blue-light: #38bdf8;
      --sky-blue-bg: #f0f7fc;
    }

    @media print {
      body { background-color: #ffffff !important; }
      .no-print { display: none !important; }
      .page-break { page-break-after: always; }
      .shadow-xl, .shadow-md, .shadow-sm { box-shadow: none !important; }
    }
  </style>
</head>
<body class="min-h-full flex flex-col pb-28 bg-[#f0f7fc] text-slate-800">

  <!-- Document Master Container (Executive Dossier Layout) -->
  <div class="max-w-4xl mx-auto w-full px-4 sm:px-6 pt-6 space-y-6">

    <!-- 1. OFFICIAL COMPANY HEADER & DOCUMENT BANNER -->
    <header class="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
      <!-- Decorative Brand Top Border Strip -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-500 via-orange-500 to-amber-400"></div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-100">
        <!-- Company Identity & Official Logo -->
        <div class="flex items-center">
          <img src="${logoBase64}" alt="${companyName}" class="h-16 sm:h-20 max-h-[85px] w-auto max-w-[320px] object-contain drop-shadow-sm" />
        </div>

        <!-- Validity & Quick Print Action -->
        <div class="flex items-center gap-3 self-start sm:self-auto">
          <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-50 border border-sky-200 text-sky-800 text-xs font-bold">
            <span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
            <span>Válido por ${quoteValidityDays} Días</span>
          </div>
          <button onclick="window.print()" class="no-print p-2 rounded-xl border border-sky-200 bg-sky-50/60 hover:bg-sky-100 text-sky-700 transition-all shadow-xs" title="Imprimir o Guardar PDF">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          </button>
        </div>
      </div>

      <!-- Project Metadata Grid (Dual Column Corporate Format) -->
      <div class="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700">
        <div class="space-y-1.5">
          <div class="text-[11px] font-black uppercase text-sky-700 tracking-wider flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Datos del Cliente
          </div>
          <div><span class="font-bold text-slate-500">Cliente:</span> <span class="font-black text-slate-950 text-sm">${clientName}</span></div>
          <div><span class="font-bold text-slate-500">Contacto:</span> <span class="font-semibold text-slate-800">${contactName}</span></div>
          <div><span class="font-bold text-slate-500">Teléfono:</span> <span class="font-semibold text-slate-800">${clientPhone}</span></div>
          <div><span class="font-bold text-slate-500">Ubicación:</span> <span class="font-semibold text-slate-800">${clientAddress}</span></div>
        </div>
        <div class="space-y-1.5 md:text-right">
          <div class="text-[11px] font-black uppercase text-orange-600 tracking-wider flex items-center justify-start md:justify-end gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span> Detalles de la Cotización</div>
          <div><span class="font-bold text-slate-500">N° Cotización:</span> <span class="font-mono font-bold text-slate-950">${quoteNumber}</span></div>
          <div><span class="font-bold text-slate-500">ID Proyecto:</span> <span class="font-mono font-bold text-slate-950">${projectId}</span></div>
          <div><span class="font-bold text-slate-500">Distribuidora / Tarifa:</span> <span class="font-bold text-sky-900">${distributor} • ${tariffCode}</span></div>
          <div><span class="font-bold text-slate-500">Fecha de Emisión:</span> <span class="font-semibold text-slate-800">${new Date().toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
        </div>
      </div>
    </header>

    <section class="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div class="border-b border-slate-100 pb-3 flex items-center justify-between">
        <div>
          <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-sm bg-orange-500"></span>
            1. Resumen Ejecutivo de la Solución Propuesta
          </h2>
          <p class="text-xs text-slate-500 font-medium">${formatMarkdown(projectSummarySubtitle, 'font-bold text-slate-700')}</p>
        </div>
        <span class="hidden sm:inline-block px-3 py-1 rounded-full bg-sky-50 text-sky-800 text-[10px] font-bold uppercase tracking-wider border border-sky-200">Ingeniería Certificada</span>
      </div>

      <div class="space-y-3.5 text-xs text-slate-700 leading-relaxed text-justify">
        ${customP1 ? `
        <p class="whitespace-pre-line">${formatMarkdown(customP1)}</p>
        ` : `
        <p>
          El consumo promedio anual de <strong class="text-slate-950 font-bold">${clientName}</strong> es de <strong class="text-slate-950 font-mono font-bold">${annualConsumptionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh</strong> (aprox. ${monthlyAvgConsumption.toLocaleString()} kWh/mes), por lo que se le propone la instalación de <strong class="font-bold text-slate-950">${panelCount} ${panelBrandModel} (${panelPowerW}W)</strong>, alcanzando una potencia DC instalada de <strong class="font-black font-mono text-orange-600">${systemCapacityKWp} kWp</strong>. La producción energética estimada para este sistema es de <strong class="font-bold font-mono text-slate-950">${annualProductionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh anuales</strong>, representando el <strong class="font-black text-sky-700">${coveragePct.toFixed(1)}%</strong> de cobertura del consumo total.
        </p>
        `}
        ${customP2 ? `
        <p class="whitespace-pre-line">${formatMarkdown(customP2)}</p>
        ` : `
        <p>
          Adicionalmente, se contempla la instalación de <strong class="text-slate-950 font-bold">${inverterCount} ${inverterBrandModel} (${inverterPowerKW} kW)</strong>${hasBattery && batteryCapacityKWh > 0 ? ` y <strong class="text-slate-950 font-bold">${batteryCount} ${batteryBrandModel} (${batteryCapacityKWh} kWh)</strong>` : ''}, ${formatMarkdown(engineeringScopeText)}.
        </p>
        `}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
        <div class="bg-orange-50/70 border border-orange-200/90 rounded-2xl p-4 flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-orange-500/20 shrink-0">⚡</div>
          <div>
            <span class="text-[10px] uppercase font-bold text-orange-800 block">Potencia DC</span>
            <span class="text-base font-black font-mono text-slate-900">${systemCapacityKWp} kWp</span>
          </div>
        </div>
        <div class="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-2xl bg-sky-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-sky-600/20 shrink-0">📈</div>
          <div>
            <span class="text-[10px] uppercase font-bold text-sky-800 block">Cobertura Solar</span>
            <span class="text-base font-black font-mono text-sky-700">${coveragePct.toFixed(1)}% Anual</span>
          </div>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-bold text-lg shadow-md shrink-0">☀️</div>
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-500 block">Generación Anual</span>
            <span class="text-base font-black font-mono text-slate-900">${Math.round(annualProductionKWh).toLocaleString()} kWh</span>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border-2 border-orange-200 bg-orange-50/90 p-4 space-y-2 text-xs text-orange-950">
        <div class="font-black uppercase tracking-wider text-[11px] flex items-center gap-2 text-orange-900">
          <svg class="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          Marco Regulatorio y Condiciones de Operación (SIE / EDES)
        </div>
        <div class="space-y-1.5 text-[11px] leading-relaxed text-justify">
          ${regParagraphs.map((p) => `<p>${formatMarkdown(p, 'font-bold text-orange-950')}</p>`).join('\n')}
        </div>
      </div>
    </section>

    <!-- 3. ANÁLISIS DE ENERGÍA Y BALANCE MENSUAL -->
    <section class="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
        <div>
          <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-sm bg-sky-600"></span>
            2. Análisis de Energía y Balance Mensual
          </h2>
          <p class="text-xs text-slate-500 font-medium">Comparativa de consumo histórico vs generación solar estimada</p>
        </div>
        <div class="flex items-center gap-4 text-xs font-bold">
          <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-xs bg-sky-700"></span> <span>Consumo (kWh)</span></div>
          <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-xs bg-orange-500"></span> <span>Generación Solar (kWh)</span></div>
        </div>
      </div>

      <!-- Chart.js Canvas -->
      <div class="w-full h-72 bg-sky-50/40 border border-sky-100 rounded-2xl p-3">
        <canvas id="energyChart"></canvas>
      </div>

      <!-- Full 12-Month Table (Identical to PDF Page 1) -->
      <div class="border border-slate-200 rounded-2xl overflow-hidden text-xs">
        <table class="w-full text-left">
          <thead class="bg-slate-900 text-white uppercase font-bold text-[10px]">
            <tr>
              <th class="px-4 py-2">Mes</th>
              <th class="px-4 py-2 text-right">Consumo (kWh)</th>
              <th class="px-4 py-2 text-right">Producción Solar (kWh)</th>
              <th class="px-4 py-2 text-right">Ahorro Autoconsumo (kWh)</th>
              <th class="px-4 py-2 text-right">% Cobertura</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 text-[11px] font-semibold text-slate-700">
            ${monthlyData.map((row: any, idx: number) => {
              const rowCoverage = row.consumptionKWh > 0 ? Math.min(100, (row.productionKWh / row.consumptionKWh) * 100) : 0;
              return `
              <tr class="${idx % 2 === 0 ? 'bg-sky-50/30' : 'bg-white'}">
                <td class="px-4 py-1.5 font-bold text-slate-900">${row.month}</td>
                <td class="px-4 py-1.5 text-right font-medium font-mono">${Math.round(row.consumptionKWh).toLocaleString()}</td>
                <td class="px-4 py-1.5 text-right font-medium font-mono">${Number(row.productionKWh).toFixed(1)}</td>
                <td class="px-4 py-1.5 text-right font-medium font-mono">${Number(row.solarSelfConsumedKWh || row.productionKWh).toFixed(1)}</td>
                <td class="px-4 py-1.5 text-right font-bold text-orange-600 font-mono">${rowCoverage.toFixed(1)}%</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot class="font-bold bg-slate-100 text-slate-900 border-t-2 border-slate-300 text-xs">
            <tr>
              <td class="px-4 py-2 uppercase font-black">TOTAL ANUAL</td>
              <td class="px-4 py-2 text-right font-mono font-bold">${Math.round(annualConsumptionKWh).toLocaleString()}</td>
              <td class="px-4 py-2 text-right font-mono font-bold">${Math.round(annualProductionKWh).toLocaleString()}</td>
              <td class="px-4 py-2 text-right font-mono font-bold">${Math.round(monthlyData.reduce((s: number, m: any) => s + (m.solarSelfConsumedKWh || m.productionKWh), 0)).toLocaleString()}</td>
              <td class="px-4 py-2 text-right font-mono font-black text-orange-600">${coveragePct.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Environmental Impact Callout (Sky Blue Accent) -->
      <div class="border border-sky-200 bg-sky-50/70 rounded-2xl p-4 flex items-center gap-4 text-xs text-sky-950">
        <div class="w-10 h-10 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-lg shrink-0">🌱</div>
        <div>
          <h4 class="font-bold text-sky-900 text-xs mb-0.5">Impacto Ambiental y Reducción de Emisiones</h4>
          <p class="text-[11px] leading-relaxed">
            Reducción estimada de CO₂: <strong class="font-bold text-sky-950 font-mono">${co2AvoidedTonsPerYear.toFixed(1)} Toneladas/año</strong>. Esto equivale a la siembra y preservación de <strong class="font-bold text-orange-600 font-mono">${treesPlanted} árboles</strong> anuales en República Dominicana.
          </p>
        </div>
      </div>
    </section>

    <!-- 4. COTIZACIÓN DE SISTEMA FOTOVOLTAICO & LEY 57-07 -->
    <section class="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div class="border-b border-slate-100 pb-3">
        <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-sm bg-orange-500"></span>
          3. Cotización Oficial de Equipos e Ingeniería
        </h2>
        <p class="text-xs text-slate-500 font-medium">Presupuesto detallado con deducciones tributarias auditadas</p>
      </div>

      <!-- Equipment Table -->
      <div class="border border-slate-200 rounded-2xl overflow-hidden text-xs">
        <table class="w-full text-left">
          <thead class="bg-slate-900 text-white uppercase font-bold text-[10px]">
            <tr>
              <th class="px-4 py-2">Descripción del Equipo / Servicio</th>
              <th class="px-4 py-2 text-center w-24">Cantidad</th>
              <th class="px-4 py-2 text-center w-24">Unidad</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 text-[11px] font-semibold text-slate-800">
            <tr class="bg-white">
              <td class="px-4 py-2 font-bold">${panelBrandModel}</td>
              <td class="px-4 py-2 text-center font-mono font-bold">${panelCount}</td>
              <td class="px-4 py-2 text-center text-slate-500 font-normal">UD</td>
            </tr>
            <tr class="bg-sky-50/30">
              <td class="px-4 py-2 font-bold">${inverterBrandModel}</td>
              <td class="px-4 py-2 text-center font-mono font-bold">${inverterCount}</td>
              <td class="px-4 py-2 text-center text-slate-500 font-normal">UD</td>
            </tr>
            ${hasBattery ? `
            <tr class="bg-white">
              <td class="px-4 py-2 font-bold">${batteryBrandModel} (${batteryCapacityKWh} kWh)</td>
              <td class="px-4 py-2 text-center font-mono font-bold">${batteryCount}</td>
              <td class="px-4 py-2 text-center text-slate-500 font-normal">UD</td>
            </tr>` : ''}
            <tr class="bg-sky-50/30">
              <td class="px-4 py-2">${installationServicesDesc}</td>
              <td class="px-4 py-2 text-center font-mono font-bold">1</td>
              <td class="px-4 py-2 text-center text-slate-500 font-normal">UD</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Financial Breakdown Box (Right-aligned) -->
      <div class="flex justify-end">
        <div class="w-full sm:w-96 bg-sky-50/60 border border-sky-200 rounded-2xl p-4 space-y-2 text-xs">
          <div class="flex justify-between text-slate-600 font-medium">
            <span>SUB-TOTAL (USD) SIN ITBIS:</span>
            <span class="font-mono font-bold text-slate-900">US$ ${subTotalSinITBIS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="flex justify-between text-slate-900 bg-sky-200/50 px-2.5 py-1 rounded-lg font-bold">
            <span>TOTAL GENERAL (USD):</span>
            <span class="font-mono font-bold">US$ ${(grossInvestmentUSD + (financials.applyITBISExemption ? itbisSavedUSD : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="flex justify-between text-sky-800 font-semibold text-[11px]">
            <span>ITBIS A DESCONTAR LEY 57-07:</span>
            <span class="font-mono font-bold text-sky-700">- US$ ${itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="flex justify-between text-white bg-slate-900 px-3 py-1.5 rounded-xl font-bold">
            <span>TOTAL GENERAL (CON LEY 57-07):</span>
            <span class="font-mono font-black text-orange-400">US$ ${grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="flex justify-between text-slate-700 pt-1 border-t border-sky-200 text-[11px]">
            <span class="font-bold">PRECIO POR WATT INSTALADO:</span>
            <span class="font-mono font-black text-orange-600">US$ ${pricePerWattUSD} / W</span>
          </div>
        </div>
      </div>

      <!-- Ley 57-07 Tax Deduction Schedule Table -->
      <div class="space-y-2">
        <div class="text-[11px] font-black uppercase text-orange-600 tracking-wider flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Incentivos Fiscales Ley 57-07 (Crédito 40% al ISR)
        </div>
        <div class="border border-slate-200 rounded-2xl overflow-hidden text-xs">
          <table class="w-full text-left">
            <thead class="bg-slate-900 text-white uppercase font-bold text-[10px]">
              <tr>
                <th class="px-4 py-2">Concepto Tributario</th>
                <th class="px-4 py-2 text-right">Monto US$</th>
                <th class="px-4 py-2 text-right w-24">% Crédito</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 text-[11px] font-semibold text-slate-800">
              <tr class="bg-white font-bold">
                <td class="px-4 py-1.5">Inversión Elegible en Equipos Renovables (Paneles-Inversores-Baterías)</td>
                <td class="px-4 py-1.5 text-right font-mono font-bold">US$ ${equipmentPortionUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-1.5 text-right font-mono">100%</td>
              </tr>
              <tr class="bg-sky-50/30">
                <td class="px-4 py-1.5">Crédito Fiscal ISR — Año 1 (DGII)</td>
                <td class="px-4 py-1.5 text-right font-mono text-sky-700 font-bold">US$ ${(ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-1.5 text-right font-mono text-sky-700">13.33%</td>
              </tr>
              <tr class="bg-white">
                <td class="px-4 py-1.5">Crédito Fiscal ISR — Año 2 (DGII)</td>
                <td class="px-4 py-1.5 text-right font-mono text-sky-700 font-bold">US$ ${(ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-1.5 text-right font-mono text-sky-700">13.33%</td>
              </tr>
              <tr class="bg-sky-50/30">
                <td class="px-4 py-1.5">Crédito Fiscal ISR — Año 3 (DGII)</td>
                <td class="px-4 py-1.5 text-right font-mono text-sky-700 font-bold">US$ ${(ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-1.5 text-right font-mono text-sky-700">13.33%</td>
              </tr>
              <tr class="bg-orange-50 text-orange-950 font-bold border-t-2 border-orange-300">
                <td class="px-4 py-2 font-black">TOTAL CRÉDITO FISCAL LEY 57-07 (40%)</td>
                <td class="px-4 py-2 text-right font-mono font-black text-orange-700">US$ ${ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-2 text-right font-mono font-black text-orange-700">40.00%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Warranties & Turnkey Management Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div class="bg-sky-50/50 border border-sky-200 rounded-2xl p-4 space-y-1.5 text-xs">
          <h4 class="font-black uppercase tracking-wider text-sky-950 border-b border-sky-200 pb-1 flex items-center gap-1.5">
            🛡️ Garantías Oficiales
          </h4>
          <div>• <span class="font-bold text-slate-600">Paneles Solares:</span> <span class="font-bold text-slate-900">${panelWarranty}</span></div>
          <div>• <span class="font-bold text-slate-600">Inversor Solar:</span> <span class="font-bold text-slate-900">${inverterWarranty}</span></div>
          <div>• <span class="font-bold text-slate-600">Batería de Respaldo:</span> <span class="font-bold text-slate-900">${batteryWarranty}</span></div>
          <div>• <span class="font-bold text-slate-600">Instalación y Mano de Obra:</span> <span class="font-bold text-slate-900">${workmanshipWarranty}</span></div>
        </div>

        <div class="bg-orange-50/60 border border-orange-200 rounded-2xl p-4 space-y-1.5 text-xs">
          <h4 class="font-black uppercase tracking-wider text-orange-950 border-b border-orange-200 pb-1 flex items-center gap-1.5">
            ✅ Gestión Llave en Mano Incluida
          </h4>
          ${serviceItems.map((item: string) => `
            <div class="flex items-start gap-1.5 text-orange-950 font-medium">
              <span class="text-orange-600 font-bold shrink-0">✓</span>
              <span>${item}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="text-center text-[10px] text-slate-500 font-semibold italic">
        ${validityNote}
      </div>
    </section>

    <!-- 5. RETORNO DE INVERSIÓN (ROI, TIR & VAN) -->
    <section class="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div class="border-b border-slate-100 pb-3">
        <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-sm bg-sky-600"></span>
          4. Retorno de Inversión y Métricas Financieras
        </h2>
        <p class="text-xs text-slate-500 font-medium">Indicadores de rentabilidad y amortización del capital</p>
      </div>

      <!-- 5 High-Impact Metric Cards (Sky Blue + Solar Orange) -->
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div class="bg-orange-50/70 border border-orange-200 rounded-2xl p-3 text-center">
          <p class="text-[9.5px] uppercase font-bold text-orange-700 mb-0.5">Payback</p>
          <p class="text-xl font-black font-mono text-orange-600">${paybackYears} <span class="text-xs font-sans text-slate-500">años</span></p>
        </div>

        <div class="bg-sky-50/70 border border-sky-200 rounded-2xl p-3 text-center">
          <p class="text-[9.5px] uppercase font-bold text-sky-700 mb-0.5">TIR</p>
          <p class="text-xl font-black font-mono text-sky-700">${irrPct}%</p>
        </div>

        <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
          <p class="text-[9.5px] uppercase font-bold text-slate-400 mb-0.5">VAN (10%)</p>
          <p class="text-sm font-black font-mono text-slate-900">US$ ${Math.round(npvUSD).toLocaleString()}</p>
        </div>

        <div class="bg-orange-50/70 border border-orange-200 rounded-2xl p-3 text-center col-span-2 sm:col-span-1">
          <p class="text-[9.5px] uppercase font-bold text-orange-700 mb-0.5">Ahorro 25 Años</p>
          <p class="text-sm font-black font-mono text-orange-600">US$ ${Math.round(total25YearSavingsUSD).toLocaleString()}</p>
        </div>

        <div class="bg-sky-50/70 border border-sky-200 rounded-2xl p-3 text-center col-span-2 sm:col-span-1">
          <p class="text-[9.5px] uppercase font-bold text-sky-700 mb-0.5">ROI Total</p>
          <p class="text-xl font-black font-mono text-sky-700">${roi25YrPct}%</p>
        </div>
      </div>

      <!-- Financial Milestones Table -->
      <div class="space-y-2">
        <div class="text-[11px] font-black uppercase text-sky-700 tracking-wider flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Hitos de Recuperación y Flujo Acumulado
        </div>
        <div class="border border-slate-200 rounded-2xl overflow-hidden text-xs">
          <table class="w-full text-left">
            <thead class="bg-slate-900 text-white uppercase font-bold text-[10px]">
              <tr>
                <th class="px-4 py-2">Hito Financiero</th>
                <th class="px-4 py-2 text-right">Ahorro Energético Anual</th>
                <th class="px-4 py-2 text-right">Beneficio Acumulado (USD)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 text-[11px] font-semibold text-slate-800">
              <tr class="bg-white">
                <td class="px-4 py-2 font-bold">Año 1 (Inicio de Ahorros)</td>
                <td class="px-4 py-2 text-right font-mono font-bold">US$ ${Number(year1Obj.savingsUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-2 text-right font-mono text-red-600 font-bold">US$ ${Number(year1Obj.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr class="bg-orange-50 text-orange-950 font-bold border-y border-orange-200">
                <td class="px-4 py-2 font-black flex items-center gap-1.5">
                  <span>⭐ Año ${paybackYearObj.year} (Punto de Retorno / Payback)</span>
                </td>
                <td class="px-4 py-2 text-right font-mono font-black">US$ ${Number(paybackYearObj.savingsUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-2 text-right font-mono font-black text-sky-700">US$ ${Number(paybackYearObj.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr class="bg-white">
                <td class="px-4 py-2 font-bold">Año 10 (Consolidación)</td>
                <td class="px-4 py-2 text-right font-mono font-bold">US$ ${Number(year10Obj.savingsUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-2 text-right font-mono text-sky-700 font-bold">US$ ${Number(year10Obj.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr class="bg-sky-50/40 font-bold text-slate-950">
                <td class="px-4 py-2 font-black">Año 25 (Fin de Vida Útil Garantizada)</td>
                <td class="px-4 py-2 text-right font-mono font-black">US$ ${Number(year25Obj.savingsUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-4 py-2 text-right font-mono font-black text-sky-700">US$ ${Number(year25Obj.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Accumulated Benefit 25 Years Chart -->
      <div class="space-y-2">
        <div class="text-[11px] font-black uppercase text-orange-600 tracking-wider flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span> Evolución de Beneficio Acumulado a 25 Años
        </div>
        <div class="w-full h-64 bg-sky-50/40 border border-sky-100 rounded-2xl p-3">
          <canvas id="cumulativeChart"></canvas>
        </div>
      </div>
    </section>

    <!-- 6. TABLA COMPLETA DE FLUJO DE CAJA (25 AÑOS) -->
    <section class="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div class="border-b border-slate-100 pb-3">
        <h2 class="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-sm bg-orange-500"></span>
          5. Flujo de Caja y Beneficios Acumulados a 25 Años
        </h2>
        <p class="text-xs text-slate-500 font-medium">Proyección contable completa considerando degradación de paneles e inflación tarifaria</p>
      </div>

      <!-- 25 Years Table (Identical to PDF Page 4) -->
      <div class="border border-slate-200 rounded-2xl overflow-x-auto text-xs">
        <table class="w-full text-left min-w-[700px]">
          <thead class="bg-slate-900 text-white uppercase font-bold text-[9px]">
            <tr>
              <th class="px-3 py-2 text-center w-12">Año</th>
              <th class="px-3 py-2 text-right">Energía (kWh)</th>
              <th class="px-3 py-2 text-right">Ahorro Energía</th>
              <th class="px-3 py-2 text-right">Incentivo Ley 57-07</th>
              <th class="px-3 py-2 text-right">Ahorro Total</th>
              <th class="px-3 py-2 text-right">Cash Flow Neto</th>
              <th class="px-3 py-2 text-right font-black">Beneficio Acumulado</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-[10.5px] font-semibold text-slate-700">
            <!-- Year 0 Outflow -->
            <tr class="bg-red-50 text-red-700 font-bold">
              <td class="px-3 py-1.5 text-center">0</td>
              <td class="px-3 py-1.5 text-right font-mono text-slate-400">-</td>
              <td class="px-3 py-1.5 text-right font-mono text-slate-400">-</td>
              <td class="px-3 py-1.5 text-right font-mono text-slate-400">-</td>
              <td class="px-3 py-1.5 text-right font-mono text-slate-400">-</td>
              <td class="px-3 py-1.5 text-right font-mono text-red-600">-US$ ${initialOutflowUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td class="px-3 py-1.5 text-right font-mono font-black text-red-600">-US$ ${initialOutflowUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>

            <!-- Years 1 to 25 -->
            ${cf25.map((row: any) => {
              const isPayback = row.year === paybackCeil;
              const cumulative = Number(row.cumulativeCashFlowUSD || 0);
              const isNegative = cumulative < 0;
              const savings = Number(row.savingsUSD || 0);
              const taxCredit = Number(row.taxCreditUSD || 0);
              const netCashFlow = Number(row.netCashFlowUSD || (savings + taxCredit));
              const totalAnnualSavings = savings + taxCredit;
              const prod = Number(row.productionKWh || 0);

              return `
              <tr class="${isPayback ? 'bg-orange-100 text-orange-950 font-bold border-y-2 border-orange-300' : row.year % 2 === 0 ? 'bg-sky-50/30' : 'bg-white'}">
                <td class="px-3 py-1 text-center font-bold font-mono">${row.year} ${isPayback ? '⭐' : ''}</td>
                <td class="px-3 py-1 text-right font-mono font-medium">${Math.round(prod).toLocaleString()}</td>
                <td class="px-3 py-1 text-right font-mono font-medium">US$ ${savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-3 py-1 text-right font-mono ${taxCredit > 0 ? 'text-sky-700 font-bold' : 'text-slate-400'}">${taxCredit > 0 ? 'US$ ' + taxCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00'}</td>
                <td class="px-3 py-1 text-right font-mono font-bold text-slate-900">US$ ${totalAnnualSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-3 py-1 text-right font-mono font-bold text-orange-600">US$ ${netCashFlow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-3 py-1 text-right font-mono font-black ${isNegative ? 'text-red-600' : 'text-sky-700'}">
                  ${isNegative ? '-' : ''}US$ ${Math.abs(cumulative).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <!-- FOOTER OFFICIAL INFORMATION -->
    <footer class="text-center text-xs text-slate-500 space-y-1.5 pt-4 pb-8 border-t border-sky-200">
      <p class="font-bold text-slate-700">${companyName} — ${companySlogan}</p>
      <p>${custom.companyFooterText || `${province}, República Dominicana | ${companyWebsite}`}</p>
      ${companyRnc ? `<p>RNC: ${companyRnc}</p>` : ''}
      <p class="text-[11px] text-slate-400 pt-2 font-mono">
        Esta propuesta digital expira el: <span class="font-bold text-slate-600">${new Date(expiresAt).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
      </p>
    </footer>
  </div>

  <!-- FIXED FLOATING CALL-TO-ACTION BAR (WhatsApp & Call) -->
  <div class="fixed bottom-0 left-0 right-0 z-50 bg-white/95 border-t border-sky-200 backdrop-blur-md p-3.5 shadow-2xl no-print">
    <div class="max-w-4xl mx-auto flex items-center justify-between gap-4">
      <div class="hidden sm:block">
        <span class="text-xs text-slate-500 font-medium block">¿Desea dar el siguiente paso hacia el ahorro solar?</span>
        <span class="text-sm font-bold text-slate-900">${companyName} está a su disposición para coordinar la visita técnica</span>
      </div>

      <div class="flex items-center gap-3 w-full sm:w-auto">
        ${cleanPhone ? `
        <a href="tel:${cleanPhone}" class="px-4 py-3 rounded-2xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0">
          <svg class="w-4 h-4 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          <span>Llamar</span>
        </a>` : ''}

        <a href="https://wa.me/${cleanPhone}?text=${whatsappMessage}" target="_blank" class="flex-1 sm:flex-initial px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 active:scale-98">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
          <span>Contactar por WhatsApp</span>
        </a>
      </div>
    </div>
  </div>

  <!-- Initialize Charts (Energy Balance & Cumulative ROI with Brand Colors) -->
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      // 1. Energy Balance Bar Chart (Sky Blue for Consumption, Solar Orange for Generation)
      const energyCtx = document.getElementById('energyChart');
      if (energyCtx) {
        new Chart(energyCtx, {
          type: 'bar',
          data: {
            labels: ${monthLabels},
            datasets: [
              {
                label: 'Consumo (kWh)',
                data: ${monthConsumption},
                backgroundColor: '#0284c7', // Sky Blue
                borderRadius: 4,
              },
              {
                label: 'Producción Solar (kWh)',
                data: ${monthProduction},
                backgroundColor: '#ff7a00', // Solar Orange
                borderRadius: 4,
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#0f172a',
                padding: 10,
                boxPadding: 4,
                titleFont: { family: 'Plus Jakarta Sans', weight: 'bold' },
                bodyFont: { family: 'JetBrains Mono' },
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans', size: 10, weight: 'bold' } }
              },
              y: {
                grid: { color: '#e0f2fe' },
                ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
              }
            }
          }
        });
      }

      // 2. Cumulative ROI 25 Years Bar Chart (Rose for Recovery Years, Sky Blue for Net Profit)
      const cumCtx = document.getElementById('cumulativeChart');
      if (cumCtx) {
        const cumValues = ${cumulativeValues};
        const cumColors = cumValues.map(v => v < 0 ? '#ef4444' : '#0284c7');

        new Chart(cumCtx, {
          type: 'bar',
          data: {
            labels: ${cumulativeYears},
            datasets: [
              {
                label: 'Beneficio Acumulado (USD)',
                data: cumValues,
                backgroundColor: cumColors,
                borderRadius: 3,
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#0f172a',
                padding: 10,
                boxPadding: 4,
                callbacks: {
                  label: function(context) {
                    return 'Beneficio: US$ ' + context.parsed.y.toLocaleString();
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#64748b', font: { family: 'Plus Jakarta Sans', size: 9 }, maxTicksLimit: 14 }
              },
              y: {
                grid: { color: '#e0f2fe' },
                ticks: {
                  color: '#64748b',
                  font: { family: 'JetBrains Mono', size: 10 },
                  callback: function(value) {
                    return '$' + (value / 1000).toFixed(0) + 'k';
                  }
                }
              }
            }
          }
        });
      }
    });
  </script>
</body>
</html>`;
}
