import { ExtractedInvoiceData, GeminiModelInfo } from '../types/aiInvoice';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const INVOICE_EXTRACTION_SYSTEM_INSTRUCTION = `Eres un auditor e ingeniero eléctrico experto en análisis de facturas eléctricas oficiales de la República Dominicana (EDES: EDEESTE, EDESUR Dominicana, EDENORTE y CEPM).
Tu objetivo es analizar minuciosamente el documento PDF o imagen de la factura provista y extraer de forma estructurada y con máxima precisión matemática los datos comerciales, técnicos, tarifarios y el vector exacto de 12 meses de consumo energético (kWh) de Enero a Diciembre.

REGLAS DE EXTRACCIÓN DETALLADAS PARA FACTURAS DOMINICANAS (EDEESTE, EDESUR, EDENORTE, CEPM):

1. DISTRIBUIDORA Y COMPAÑÍA:
   - Identifica el logo o texto: "EDEESTE" (Empresa Distribuidora de Electricidad del Este), "EDESUR", "EDENORTE" o "CEPM".
   - Identifica el RNC emisor (ej. 1-01-82021-7 para Edeeste, 1-01-82124-8 para Edesur) y el comprobante fiscal NCF / e-NCF (ej. E320012796466, E310000696268, B01, B02).

2. DATOS DEL CLIENTE Y SUMINISTRO:
   - Nombre / Titular: Busca "TITULAR DEL CONTRATO", "SRL , ...", "PUNTO DE EMISIÓN" o nombre del cliente. Corrige signos de interrogación por caracteres correctos (ej. "NU?EZ, MARINO RAMON" -> "NUÑEZ, MARINO RAMON").
   - NIC (Número de Identificación de Contrato): Es el código numérico destacado en recuadro amarillo o azul (ej. 2250790, 7333529).
   - Circuito: Si figura (ej. "Circuito: INVI03").
   - NIS: Número de Identificación de Suministro si existe (ej. 4115260).
   - RNC / Cédula del cliente: Busca "RNC - CEDULA" o "RNC:" si está presente.
   - Medidor / No. Contador: ej. 21002764, 10295279.
   - Dirección: "DIRECCIÓN DEL SUMINISTRO" (calle, número, sector/localidad, municipio y provincia como "SANTO DOMINGO ESTE", "DISTRITO NACIONAL", "SANTO DOMINGO", "SANTIAGO", etc.).
   - Teléfono / Referencia de Pago: ej. "2250790189-15".

3. DATOS TÉCNICOS Y TARIFARIOS:
   - Tarifa: Código como "BTS1" (residencial simple), "BTS2" (comercial baja tensión), "BTD" (baja tensión con demanda), "BTH" (baja tensión horaria), "MTD1" (media tensión con demanda 1), "MTD2" (media tensión con demanda 2 horaria), "MTH", "ATD" (alta tensión).
   - Voltaje y Fase: "VOLTAJE" (ej. "Baja 120/240 Doble Monofasica", "Baja 120/208 Trifásica", "Monofásica").
   - Periodo de facturación y Días facturados: ej. 31 días.
   - Factor de Potencia / Eficiencia: ej. 0.97 si aplica.

4. DESGLOSE ECONÓMICO Y ESTRUCTURA TARIFARIA:
   - Cargo fijo: Valor en RD$ (ej. 127.83 o 210.15).
   - Estructura de Energía (RD$/kWh):
     * Para tarifa plana (ej. BTD, MTD1): un solo precio por kWh (ej. RD$ 9.02/kWh).
     * Para tarifa escalonada (ej. BTS1): bloques como 200 kWh x RD$ 6.17, 100 kWh x RD$ 8.71, 373 kWh x RD$ 13.04.
     * En 'energyCostPerKWhDOP', calcula el precio medio efectivo ponderado de la energía (Total RD$ Energía / Total kWh).
     * En 'marginalRateDOP', guarda la tarifa marginal del escalón más alto (ej. 13.04 RD$/kWh).
   - Potencia Máxima (Demanda en kW) y su costo por kW: si aplica para BTD/MTD1/MTD2 (ej. 6.266 kW).
   - Importe Total: "VALOR TOTAL A PAGAR EN RD$" o "IMPORTE TOTAL" (ej. 7,096.75 o 17,394.01).
   - Subsidio Estatal: "IMPORTE SUBSIDIADO EN RD$" o "APORTE TOTAL GOBIERNO RD$" (ej. 3,736.69 o 14,286.18).
   - Importe sin Subsidio: "IMPORTE SIN SUBSIDIO EN RD$" (ej. 10,833.44 o 31,680.19).

5. HISTÓRICO DE CONSUMOS (TABLA MM/AA O MM/AAAA Y GRÁFICA DE 12 MESES):
   - En la tabla "HISTÓRICO DE CONSUMOS", los meses pueden venir en formato MM/AAAA (ej. 04/2025... 04/2026 en Edeeste) o MM/AA (ej. 04/25... 04/26 en Edesur).
   - Debes extraer los consumos (kWh) de cada mes y asignarlos exactamente al orden cronológico del año natural (Enero a Diciembre):
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
   - Si la tabla contiene 13 meses (por ejemplo de Abril 2025 a Abril 2026), toma el valor del año más reciente para el mes repetido.
   - El vector resultante 'monthlyConsumptionKWh' debe tener EXACTAMENTE 12 números válidos mayores a 0.

6. CONFIABILIDAD Y NOTAS:
   - Asigna un puntaje de confianza (0 a 100).
   - En 'notes', resume la extracción detallando distribuidora, NIC, tarifa y desglose.`;

const INVOICE_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    clientName: { type: 'STRING', description: 'Nombre completo del titular o empresa' },
    companyName: { type: 'STRING', description: 'Razón social si aplica' },
    nic: { type: 'STRING', description: 'Número de Identificación de Contrato / NIC' },
    nis: { type: 'STRING', description: 'Número de Identificación de Suministro / NIS' },
    circuit: { type: 'STRING', description: 'Nombre o código del circuito eléctrico' },
    rnc: { type: 'STRING', description: 'RNC o Cédula' },
    contractNumber: { type: 'STRING', description: 'Número de contrato o referencia de pago' },
    eNCF: { type: 'STRING', description: 'Comprobante fiscal NCF o e-NCF' },
    address: { type: 'STRING', description: 'Dirección del suministro eléctrico' },
    province: { type: 'STRING', description: 'Provincia en República Dominicana' },
    municipality: { type: 'STRING', description: 'Municipio' },
    phone: { type: 'STRING', description: 'Teléfono si aparece' },
    email: { type: 'STRING', description: 'Correo electrónico si aparece' },
    distributor: {
      type: 'STRING',
      enum: ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'],
      description: 'Distribuidora eléctrica dominicana',
    },
    tariffCode: {
      type: 'STRING',
      description: 'Código de tarifa (ej. BTS1, BTS2, BTD, BTH, MTD1, MTD2, MTH, ATD)',
    },
    energyCostPerKWhDOP: {
      type: 'NUMBER',
      description: 'Precio medio efectivo de la energía en RD$/kWh',
    },
    marginalRateDOP: {
      type: 'NUMBER',
      description: 'Tarifa del bloque superior en RD$/kWh para BTS1',
    },
    fixedChargeDOP: {
      type: 'NUMBER',
      description: 'Cargo fijo en RD$',
    },
    peakDemandKW: {
      type: 'NUMBER',
      description: 'Potencia máxima o demanda registrada en kW',
    },
    demandCostPerKWDOP: {
      type: 'NUMBER',
      description: 'Costo por kW de potencia máxima en RD$',
    },
    meterNumber: { type: 'STRING', description: 'Número de medidor o contador' },
    voltagePhase: { type: 'STRING', description: 'Voltaje y fases (ej. Doble Monofasica 120/240V, Trifasica 120/208V)' },
    powerFactor: { type: 'NUMBER', description: 'Factor de potencia o eficiencia' },
    billingDays: { type: 'NUMBER', description: 'Días del periodo facturado' },
    totalBilledAmountDOP: { type: 'NUMBER', description: 'Importe Total a pagar en RD$' },
    totalWithoutSubsidyDOP: { type: 'NUMBER', description: 'Importe Total sin subsidio en RD$' },
    governmentSubsidyDOP: { type: 'NUMBER', description: 'Monto subsidiado / aporte del gobierno en RD$' },
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
      description: 'Consumo facturado en el mes actual en kWh',
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

export const DEFAULT_POPULAR_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    description: 'Mayor límite de solicitudes gratuitas en Google AI Studio (500 por día / 15 RPM). Extremadamente veloz.',
    rateLimitNote: '15 RPM / 500 RPD',
    isRecommended: true,
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    description: 'Nueva generación con razonamiento avanzado para tablas y tipografías complejas.',
    rateLimitNote: '5 RPM / 20 RPD',
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    description: 'Modelo de vanguardia con máxima fidelidad en visión multimodal.',
    rateLimitNote: '5 RPM / 20 RPD',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Modelo estándar de alta velocidad y consistencia en extracción de JSON estructurado.',
    rateLimitNote: '15 RPM / 1,500 RPD',
    isRecommended: true,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Modelo clásico ligero de Google con amplia disponibilidad de cuotas.',
    rateLimitNote: '15 RPM / 1,500 RPD',
  },
];

export async function fetchAvailableGeminiModels(
  apiKey: string
): Promise<{ success: boolean; error?: string; models: GeminiModelInfo[] }> {
  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, error: 'API Key inválida o vacía.', models: DEFAULT_POPULAR_MODELS };
  }

  try {
    const url = `${GEMINI_API_BASE}/models?key=${apiKey.trim()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData?.error?.message || `Error HTTP ${response.status}`;
      return { success: false, error: msg, models: DEFAULT_POPULAR_MODELS };
    }

    const data = await response.json();
    const rawModels: any[] = Array.isArray(data?.models) ? data.models : [];

    // Filter only models that support content generation
    const filtered = rawModels
      .filter((m: any) => {
        const methods: string[] = m.supportedGenerationMethods || [];
        return methods.includes('generateContent') && !m.name?.includes('embedding') && !m.name?.includes('aqa');
      })
      .map((m: any) => {
        const cleanId = m.name?.replace('models/', '') || '';
        const displayName = m.displayName || cleanId;
        const isFlashLite = cleanId.includes('flash-lite') || cleanId.includes('3.5-flash-lite');
        const isFlash = cleanId.includes('flash');
        
        return {
          id: cleanId,
          name: displayName,
          description: m.description || `Modelo ${displayName} disponible en tu cuenta.`,
          rateLimitNote: isFlashLite ? '15 RPM / 500 RPD' : isFlash ? '5-15 RPM' : undefined,
          isRecommended: cleanId.includes('3.5-flash-lite') || cleanId === 'gemini-2.0-flash' || cleanId === 'gemini-3.6-flash',
        };
      });

    // Sort prioritizing recommended and flash models
    filtered.sort((a, b) => {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      success: true,
      models: filtered.length > 0 ? filtered : DEFAULT_POPULAR_MODELS,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Error consultando modelos disponibles.',
      models: DEFAULT_POPULAR_MODELS,
    };
  }
}

export async function validateGeminiApiKey(
  apiKey: string,
  model: string = 'gemini-3.5-flash-lite'
): Promise<{ success: boolean; error?: string; modelName?: string; models?: GeminiModelInfo[] }> {
  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, error: 'API Key inválida o vacía.' };
  }

  try {
    // 1. First fetch available models from account
    const modelsResult = await fetchAvailableGeminiModels(apiKey);
    
    // 2. Validate model access
    const testModel = model || (modelsResult.models[0]?.id || 'gemini-2.0-flash');
    const url = `${GEMINI_API_BASE}/models/${testModel}?key=${apiKey.trim()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      // Fallback test with gemini-2.0-flash or gemini-1.5-flash if specific model endpoint returned error
      const fallbackUrl = `${GEMINI_API_BASE}/models/gemini-2.0-flash?key=${apiKey.trim()}`;
      const fallbackRes = await fetch(fallbackUrl);
      if (!fallbackRes.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData?.error?.message || `Error HTTP ${response.status}`;
        return { success: false, error: `Google AI: ${msg}`, models: modelsResult.models };
      }
    }

    const matched = modelsResult.models.find((m) => m.id === testModel);
    return {
      success: true,
      modelName: matched?.name || testModel,
      models: modelsResult.models,
    };
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

  // Clean corrupted character encodings (e.g. NU?EZ -> NUÑEZ)
  let cleanName = (parsed.clientName || 'Cliente Factura EDE').replace(/\?/g, 'Ñ');

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

  // Solar Dimensioning Suggestion based on local radiation, target coverage (95%), and default system losses (25%)
  const cleanProvince = parsed.province || 'Santo Domingo / Distrito Nacional';
  const targetCoverage = 95;
  const defaultLosses = 25.0;
  const panelWatts = panelPowerW > 0 ? panelPowerW : 620;

  const rec = calculateRecommendedPanelCount(
    cleanProvince,
    monthlyConsumption,
    panelWatts,
    targetCoverage,
    defaultLosses
  );

  const recommendedCapacityKWp = rec.recommendedCapacityKWp;
  const recommendedPanelCount = rec.recommendedPanelCount;

  const result: ExtractedInvoiceData = {
    clientName: cleanName,
    companyName: parsed.companyName || undefined,
    nic: parsed.nic || undefined,
    nis: parsed.nis || undefined,
    circuit: parsed.circuit || undefined,
    rnc: parsed.rnc || undefined,
    contractNumber: parsed.contractNumber || undefined,
    eNCF: parsed.eNCF || undefined,
    address: parsed.address || undefined,
    province: parsed.province || 'Santo Domingo',
    municipality: parsed.municipality || undefined,
    phone: parsed.phone || undefined,
    email: parsed.email || undefined,
    distributor: (['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'].includes(parsed.distributor)
      ? parsed.distributor
      : 'EDEESTE') as any,
    tariffCode: parsed.tariffCode || 'BTS1',
    energyCostPerKWhDOP: parsed.energyCostPerKWhDOP || undefined,
    marginalRateDOP: parsed.marginalRateDOP || undefined,
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
    currentBilledKWh: parsed.currentBilledKWh || monthlyConsumption[0],
    recommendedCapacityKWp,
    recommendedPanelCount,
    targetCoveragePct: 95,
    confidenceScore: parsed.confidenceScore || 98,
    extractedFromFileName: fileName,
    aiNotes: parsed.notes || undefined,
  };

  return result;
}
