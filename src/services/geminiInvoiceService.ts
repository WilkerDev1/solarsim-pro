import { ExtractedInvoiceData } from '../types/aiInvoice';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const INVOICE_EXTRACTION_SYSTEM_INSTRUCTION = `Eres un auditor e ingeniero eléctrico experto en análisis de facturas eléctricas oficiales de la República Dominicana (EDES: EDESUR Dominicana, EDEESTE, EDENORTE y CEPM).
Tu objetivo es analizar minuciosamente el documento PDF o imagen de la factura provista y extraer de forma estructurada y con máxima precisión matemática los datos comerciales, técnicos, tarifarios y el vector exacto de 12 meses de consumo energético (kWh) de Enero a Diciembre.

REGLAS DE EXTRACCIÓN DETALLADAS PARA FACTURAS DOMINICANAS:

1. DISTRIBUIDORA Y COMPAÑÍA:
   - Identifica el logo o encabezado: "EDESUR", "EDEESTE", "EDENORTE" o "CEPM".
   - Identifica el RNC de la empresa emisora y el número e-NCF (Crédito Fiscal Electrónico, B01, E31...) si existe.

2. DATOS DEL CLIENTE Y SUMINISTRO:
   - Nombre / Titular: Busca "TITULAR DEL CONTRATO", "SRL , ...", "PUNTO DE EMISIÓN" o nombre del cliente.
   - RNC / Cédula: Busca "RNC - CEDULA" o "RNC:" (ej. 130549682).
   - NIC (Número de Identificación de Contrato): Es el identificador principal de contrato (ej. 7333529).
   - NIS: Número de Identificación de Suministro (ej. 4115260).
   - Medidor / Contador: Número de serie del contador (ej. 10295279).
   - Dirección: "DIRECCIÓN DEL SUMINISTRO" (calle, número, piso/depto, sector, municipio y provincia como "DISTRITO NACIONAL", "SANTO DOMINGO", "SANTIAGO", etc.).
   - Teléfono: Teléfono de contacto si figura.

3. DATOS TÉCNICOS Y TARIFARIOS:
   - Tarifa: Código como "BTD", "BTS1", "BTS2", "MTD", "BTD-1", etc.
   - Voltaje y Fase: "VOLTAJE" (ej. "Baja 120/208 Trifásica", "Monofásica 120/240V").
   - Eficiencia / Factor de Potencia: Valor decimal (ej. 0.97).
   - Periodo de facturación y Días facturados: ej. 31 días.

4. DESGLOSE ECONÓMICO (CÁLCULO DE LA FACTURA):
   - Cargo fijo: Valor en RD$ (ej. 210.15).
   - Costo de Energía por kWh: En "Energia: X kWh x RD$ Y/kWh", extrae el valor Y en DOP (ej. 9.02 DOP/kWh).
   - Potencia Máxima Facturada: En kW (ej. 6.266 kW) y su costo por kW (ej. RD$ 1,189.16/kW).
   - Total Facturado: "IMPORTE TOTAL" en RD$ (ej. 17,394.01).
   - Subsidio Gubernamental: "APORTE TOTAL GOBIERNO RD$" si existe (ej. 14,286.18).
   - Importe sin Subsidio: "IMPORTE TOTAL SIN SUBSIDIO RD$" si existe (ej. 31,680.19).

5. HISTÓRICO DE CONSUMOS (TABLA MM/AA Y GRÁFICA DE 12 MESES):
   - Las facturas dominicanas incluyen una tabla "HISTÓRICO DE CONSUMOS" con columnas: "Mes" (formato MM/AA como 05/25, 06/25... 05/26), "Cosm." (Consumo kWh) y "Pot." (kW de potencia).
   - Debes extraer los consumos (kWh) y ordenarlos en un vector de exactamente 12 posiciones correspondiente al año natural (Índices 0 a 11):
     Índice 0: Enero (Mes 01)
     Índice 1: Febrero (Mes 02)
     Índice 2: Marzo (Mes 03)
     Índice 3: Abril (Mes 04)
     Índice 4: Mayo (Mes 05)
     Índice 5: Junio (Mes 06)
     Índice 6: Julio (Mes 07)
     Índice 7: Agosto (Mes 08)
     Índice 8: Septiembre (Mes 09)
     Índice 9: Octubre (Mes 10)
     Índice 10: Noviembre (Mes 11)
     Índice 11: Diciembre (Mes 12)
   - Si la tabla tiene 13 meses (por ejemplo desde Mayo 2025 hasta Mayo 2026), asigna el valor más reciente para el mes repetido.
   - Si algún mes no aparece o la factura tiene menos de 12 meses registrados, calcula el promedio de los meses presentes y rellena los faltantes para que SIEMPRE hayan 12 números válidos mayores a 0.

6. CONFIABILIDAD Y NOTAS:
   - Asigna un puntaje de confianza (0 a 100).
   - En 'notes', resume la extracción (ej. "Extracción exitosa de Edesur: Tarifa BTD trifásica, NIC 7333529, 13 meses de histórico leídos").`;

const INVOICE_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    clientName: { type: 'STRING', description: 'Nombre completo del titular o cliente/empresa' },
    companyName: { type: 'STRING', description: 'Razón social de la empresa si aplica' },
    nic: { type: 'STRING', description: 'Número de Identificación de Contrato / NIC' },
    nis: { type: 'STRING', description: 'Número de Identificación de Suministro / NIS' },
    rnc: { type: 'STRING', description: 'RNC o Cédula' },
    contractNumber: { type: 'STRING', description: 'Número de contrato o referencia de pago' },
    eNCF: { type: 'STRING', description: 'Comprobante fiscal electrónico e-NCF' },
    address: { type: 'STRING', description: 'Dirección del suministro eléctrico' },
    province: { type: 'STRING', description: 'Provincia (ej. Distrito Nacional, Santo Domingo, Santiago)' },
    municipality: { type: 'STRING', description: 'Municipio (ej. Santo Domingo de Guzmán)' },
    phone: { type: 'STRING', description: 'Teléfono si aparece' },
    email: { type: 'STRING', description: 'Correo electrónico si aparece' },
    distributor: {
      type: 'STRING',
      enum: ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'],
      description: 'Distribuidora eléctrica dominicana',
    },
    tariffCode: {
      type: 'STRING',
      description: 'Código de tarifa (ej. BTD, BTS1, BTS2, MTD)',
    },
    energyCostPerKWhDOP: {
      type: 'NUMBER',
      description: 'Precio de energía en RD$/kWh (ej. 9.02)',
    },
    fixedChargeDOP: {
      type: 'NUMBER',
      description: 'Cargo fijo en RD$ (ej. 210.15)',
    },
    peakDemandKW: {
      type: 'NUMBER',
      description: 'Potencia máxima o demanda registrada en kW (ej. 6.266)',
    },
    demandCostPerKWDOP: {
      type: 'NUMBER',
      description: 'Costo por kW de potencia máxima en RD$ (ej. 1189.16)',
    },
    meterNumber: { type: 'STRING', description: 'Número de medidor / contador (ej. 10295279)' },
    voltagePhase: { type: 'STRING', description: 'Voltaje y fases (ej. Baja 120/208 Trifásica)' },
    powerFactor: { type: 'NUMBER', description: 'Factor de potencia o eficiencia (ej. 0.97)' },
    billingDays: { type: 'NUMBER', description: 'Días del periodo de facturación (ej. 31)' },
    totalBilledAmountDOP: { type: 'NUMBER', description: 'Importe Total a pagar en RD$ (ej. 17394.01)' },
    totalWithoutSubsidyDOP: { type: 'NUMBER', description: 'Importe Total sin subsidio en RD$ (ej. 31680.19)' },
    governmentSubsidyDOP: { type: 'NUMBER', description: 'Aporte total del gobierno / subsidio en RD$ (ej. 14286.18)' },
    monthlyConsumptionKWh: {
      type: 'ARRAY',
      items: { type: 'NUMBER' },
      description: 'Array de exactamente 12 números con el consumo en kWh de Enero a Diciembre',
    },
    annualConsumptionKWh: {
      type: 'NUMBER',
      description: 'Consumo anual total en kWh (suma de los 12 meses)',
    },
    averageMonthlyKWh: {
      type: 'NUMBER',
      description: 'Consumo promedio mensual en kWh',
    },
    currentBilledKWh: {
      type: 'NUMBER',
      description: 'Consumo facturado en el mes actual en kWh (ej. 1079)',
    },
    confidenceScore: {
      type: 'NUMBER',
      description: 'Nivel de confianza del análisis del 0 al 100',
    },
    notes: {
      type: 'STRING',
      description: 'Observaciones y resumen de la extracción',
    },
  },
  required: [
    'clientName',
    'distributor',
    'tariffCode',
    'monthlyConsumptionKWh',
    'annualConsumptionKWh',
    'averageMonthlyKWh',
    'confidenceScore',
  ],
};

export async function validateGeminiApiKey(
  apiKey: string,
  model: string = 'gemini-2.0-flash'
): Promise<{ success: boolean; error?: string; modelName?: string }> {
  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, error: 'API Key inválida o vacía.' };
  }

  try {
    const url = `${GEMINI_API_BASE}/models/${model}?key=${apiKey.trim()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData?.error?.message || `Error HTTP ${response.status}`;
      return { success: false, error: `Google AI: ${msg}` };
    }

    const data = await response.json();
    return { success: true, modelName: data?.displayName || model };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de conexión con Google AI Studio.' };
  }
}

export async function parseInvoiceWithGemini(params: {
  fileBase64: string; // Pure Base64 without data URI header
  mimeType: string;   // e.g. "application/pdf", "image/png", "image/jpeg"
  fileName: string;
  apiKey: string;
  model?: string;
  panelPowerW?: number; // Default 620W for solar estimation
}): Promise<ExtractedInvoiceData> {
  const {
    fileBase64,
    mimeType,
    fileName,
    apiKey,
    model = 'gemini-2.0-flash',
    panelPowerW = 620,
  } = params;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('No se ha configurado la API Key de Google Gemini. Por favor configúrala en Ajustes.');
  }

  // Strip data URL prefix if present
  let cleanBase64 = fileBase64;
  if (cleanBase64.includes('base64,')) {
    cleanBase64 = cleanBase64.split('base64,')[1];
  }

  const endpoint = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey.trim()}`;

  const requestBody = {
    system_instruction: {
      parts: [{ text: INVOICE_EXTRACTION_SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Analiza esta factura eléctrica dominicana (archivo: "${fileName}") y extrae todos los datos de cliente, distribuidora, tarifa, desgloses económicos y el vector cronológico de 12 meses de consumo en kWh (Enero a Diciembre). Responde estrictamente con el JSON estructurado solicitado.`,
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.05,
      response_mime_type: 'application/json',
      response_schema: INVOICE_JSON_SCHEMA,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const errorMsg = errorJson?.error?.message || `Error HTTP ${response.status}`;
    throw new Error(`Google AI API Error: ${errorMsg}`);
  }

  const responseJson = await response.json();
  const rawText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('La IA no devolvió ninguna respuesta estructurada.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch (err: any) {
    throw new Error(`Error al parsear el JSON de la IA: ${err.message}`);
  }

  // Normalize and validate 12-month array
  let monthlyConsumption: number[] = Array.isArray(parsed.monthlyConsumptionKWh)
    ? parsed.monthlyConsumptionKWh.map((n: any) => Math.max(0, Math.round(Number(n) || 0)))
    : [];

  if (monthlyConsumption.length < 12) {
    const avg = parsed.averageMonthlyKWh || 500;
    while (monthlyConsumption.length < 12) {
      monthlyConsumption.push(avg);
    }
  } else if (monthlyConsumption.length > 12) {
    monthlyConsumption = monthlyConsumption.slice(0, 12);
  }

  const totalAnnual = monthlyConsumption.reduce((sum, v) => sum + v, 0);
  const avgMonthly = Math.round(totalAnnual / 12);

  // Solar Dimensioning Suggestion (Dominican average ~4.8 HSP and 80% Performance Ratio -> ~1,400 kWh/year per kWp)
  // Target coverage: 95%
  const targetCoverage = 0.95;
  const targetAnnualSolarKWh = totalAnnual * targetCoverage;
  const specificYieldKWhPerKWp = 1450; // Dominican Republic average annual yield
  const recommendedCapacityKWp = Math.round((targetAnnualSolarKWh / specificYieldKWhPerKWp) * 100) / 100;
  const panelWatts = panelPowerW > 0 ? panelPowerW : 620;
  const recommendedPanelCount = Math.max(1, Math.ceil((recommendedCapacityKWp * 1000) / panelWatts));

  const result: ExtractedInvoiceData = {
    clientName: parsed.clientName || 'Cliente Factura EDE',
    companyName: parsed.companyName || undefined,
    nic: parsed.nic || undefined,
    nis: parsed.nis || undefined,
    rnc: parsed.rnc || undefined,
    contractNumber: parsed.contractNumber || undefined,
    eNCF: parsed.eNCF || undefined,
    address: parsed.address || undefined,
    province: parsed.province || 'Distrito Nacional',
    municipality: parsed.municipality || undefined,
    phone: parsed.phone || undefined,
    email: parsed.email || undefined,
    distributor: (['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'].includes(parsed.distributor)
      ? parsed.distributor
      : 'EDESUR') as any,
    tariffCode: parsed.tariffCode || 'BTD',
    energyCostPerKWhDOP: parsed.energyCostPerKWhDOP || undefined,
    fixedChargeDOP: parsed.fixedChargeDOP || undefined,
    peakDemandKW: parsed.peakDemandKW || undefined,
    demandCostPerKWDOP: parsed.demandCostPerKWDOP || undefined,
    meterNumber: parsed.meterNumber || undefined,
    voltagePhase: parsed.voltagePhase || undefined,
    powerFactor: parsed.powerFactor || undefined,
    billingDays: parsed.billingDays || undefined,
    totalBilledAmountDOP: parsed.totalBilledAmountDOP || undefined,
    totalWithoutSubsidyDOP: parsed.totalWithoutSubsidyDOP || undefined,
    governmentSubsidyDOP: parsed.governmentSubsidyDOP || undefined,
    monthlyConsumptionKWh: monthlyConsumption,
    annualConsumptionKWh: totalAnnual,
    averageMonthlyKWh: avgMonthly,
    currentBilledKWh: parsed.currentBilledKWh || monthlyConsumption[4] || monthlyConsumption[0],
    recommendedCapacityKWp,
    recommendedPanelCount,
    targetCoveragePct: 95,
    confidenceScore: parsed.confidenceScore || 98,
    extractedFromFileName: fileName,
    aiNotes: parsed.notes || undefined,
  };

  return result;
}
