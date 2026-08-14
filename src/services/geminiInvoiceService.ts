import { ExtractedInvoiceData } from '../types/aiInvoice';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const INVOICE_EXTRACTION_SYSTEM_INSTRUCTION = `Eres un auditor e ingeniero experto en análisis de facturas eléctricas de la República Dominicana (EDES: EDEESTE, EDESUR, EDENORTE y CEPM).
Tu objetivo es analizar minuciosamente la imagen o documento PDF de la factura eléctrica provista y extraer de forma estructurada y con máxima precisión los datos comerciales, técnicos y el historial completo de consumo energético (kWh) de los 12 meses del año (Enero a Diciembre).

INSTRUCCIONES CLAVE DE EXTRACCIÓN PARA REPÚBLICA DOMINICANA:
1. DISTRIBUIDORA: Identifica el logo o texto de la empresa:
   - "EDEESTE" (Empresa Distribuidora de Electricidad del Este)
   - "EDESUR" (Empresa Distribuidora de Electricidad del Sur)
   - "EDENORTE" (Empresa Distribuidora de Electricidad del Norte)
   - "CEPM" (Consorcio Energético Punta Cana - Macao)
2. TARIFA: Identifica el código tarifario oficial (ejemplos comunes: BTS-1 o BTS1 residencial, BTS-2 o BTS2 comercial baja tensión, MTD media tensión con demanda, BTD, etc.). Normalízalo a "BTS1", "BTS2", "MTD", "BTD" u otro.
3. DATOS DEL CLIENTE:
   - Nombre o Razón Social del titular de la cuenta.
   - NIC (Número de Identificación de Contrato o Número de Cliente).
   - RNC o Cédula si figura en el documento.
   - Dirección de suministro completa y provincia (ej. Santo Domingo, Distrito Nacional, Santiago, La Altagracia, San Cristóbal, etc.).
4. HISTORIAL DE CONSUMO (12 MESES: ENERO A DICIEMBRE EN kWh):
   - En las facturas dominicanas siempre existe una sección "Historial de Consumo", "Gráfica de Consumos Anteriores" o una tabla con los últimos 12 meses.
   - Debes mapear los valores de kWh a los 12 meses cronológicos del año natural:
     Índice 0: Enero
     Índice 1: Febrero
     Índice 2: Marzo
     Índice 3: Abril
     Índice 4: Mayo
     Índice 5: Junio
     Índice 6: Julio
     Índice 7: Agosto
     Índice 8: Septiembre
     Índice 9: Octubre
     Índice 10: Noviembre
     Índice 11: Diciembre
   - Si la factura presenta meses del año anterior (ej. facturación rodante de Octubre a Septiembre), mapea cada mes al índice correspondiente de Enero a Diciembre.
   - Si falta algún mes específico o no es legible, interpola el valor usando el promedio de los meses adyacentes para que el vector siempre tenga exactamente 12 números válidos mayores a 0.
5. SUMA Y PROMEDIO:
   - Calcula el total anual de kWh (suma de los 12 meses) y el promedio mensual.
6. NOTAS Y CONFIANZA:
   - Asigna un puntaje de confianza (confidenceScore de 0 a 100) según la legibilidad y claridad de los datos.
   - En 'notes', menciona cualquier detalle relevante (ej. "Historial leído exitosamente de la gráfica de barras de EDEESTE").`;

const INVOICE_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    clientName: { type: 'STRING', description: 'Nombre completo del titular o cliente' },
    companyName: { type: 'STRING', description: 'Razón social de la empresa si aplica' },
    nic: { type: 'STRING', description: 'Número de Identificación de Contrato / NIC / No. Cliente' },
    rnc: { type: 'STRING', description: 'RNC o Cédula si está presente' },
    contractNumber: { type: 'STRING', description: 'Número de contrato o circuito' },
    address: { type: 'STRING', description: 'Dirección del suministro eléctrico' },
    province: { type: 'STRING', description: 'Provincia en República Dominicana' },
    phone: { type: 'STRING', description: 'Teléfono si aparece en la factura' },
    email: { type: 'STRING', description: 'Correo electrónico si aparece' },
    distributor: {
      type: 'STRING',
      enum: ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'],
      description: 'Distribuidora eléctrica dominicana',
    },
    tariffCode: {
      type: 'STRING',
      description: 'Código de tarifa (ej. BTS1, BTS2, MTD, BTD)',
    },
    energyCostPerKWhDOP: {
      type: 'NUMBER',
      description: 'Precio o tarifa promedio en DOP por kWh si figura desglosado',
    },
    meterNumber: { type: 'STRING', description: 'Número de medidor o contador' },
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
      description: 'Consumo facturado en el mes actual',
    },
    confidenceScore: {
      type: 'NUMBER',
      description: 'Nivel de confianza del análisis del 0 al 100',
    },
    notes: {
      type: 'STRING',
      description: 'Observaciones de la extracción',
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
            text: `Analiza esta factura eléctrica dominicana (archivo: "${fileName}") y extrae todos los datos de cliente, distribuidora, tarifa y el vector de 12 meses de consumo en kWh. Responde estrictamente con el JSON estructurado solicitado.`,
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
      temperature: 0.1,
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
    rnc: parsed.rnc || undefined,
    contractNumber: parsed.contractNumber || undefined,
    address: parsed.address || undefined,
    province: parsed.province || 'Santo Domingo',
    phone: parsed.phone || undefined,
    email: parsed.email || undefined,
    distributor: (['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'].includes(parsed.distributor)
      ? parsed.distributor
      : 'EDEESTE') as any,
    tariffCode: parsed.tariffCode || 'BTS1',
    energyCostPerKWhDOP: parsed.energyCostPerKWhDOP || undefined,
    meterNumber: parsed.meterNumber || undefined,
    monthlyConsumptionKWh: monthlyConsumption,
    annualConsumptionKWh: totalAnnual,
    averageMonthlyKWh: avgMonthly,
    currentBilledKWh: parsed.currentBilledKWh || monthlyConsumption[0],
    recommendedCapacityKWp,
    recommendedPanelCount,
    targetCoveragePct: 95,
    confidenceScore: parsed.confidenceScore || 95,
    extractedFromFileName: fileName,
    aiNotes: parsed.notes || undefined,
  };

  return result;
}
