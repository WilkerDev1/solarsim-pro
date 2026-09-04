import { ExtractedInvoiceData, GeminiModelInfo } from '../types/aiInvoice';
import { SolarEquipmentItem } from '../types/equipment';
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
   - En 'notes', resume la extracción detallando distribuidora, NIC, tarifa y desglose.

7. SÍNTESIS DE REQUISITOS Y ALCANCE TÉCNICO-COMERCIAL DEL PROYECTO (GROUNDING CON EL CATÁLOGO):
   Si el usuario provee requerimientos en texto libre (ej: "Giovanni Gottardo. 21 panel canadian solar 615w, 1 inversor lux power de 16 kw, 2 bateria hinaes de 16kw, Venta 40%"):
   a) CLIENTE: Si el texto contiene el nombre del cliente (ej. 'Giovanni Gottardo' o 'Osia Moscoso'), dale prioridad a ese nombre sobre el de la factura o úsalo como cliente si no hay factura.
   b) PANELES FOTOVOLTAICOS:
      - Identifica el modelo y vatios solicitados (ej. 'Canadian 615w' -> 'Módulos Canadian Solar CS6.1-72TB-615 (615W)').
      - Identifica la cantidad:
        * Si dice '21 panel' -> matchedPanelCount = 21.
        * Si dice '11 kwp paneles Canadian 615w' -> calcula Math.round(11000 / 615) = 18 paneles.
      - En 'matchedPanelId' coloca el id exacto del equipo en el catálogo provisto.
      - En 'matchedPanelModel' coloca el displayName exacto del catálogo.
      - En 'matchedPanelWatts' coloca los vatios (ej. 615).
   c) INVERSORES:
      - Identifica el modelo y potencia (ej. '1 inversor lux power de 16 kw' o '1 weco 8 kw').
      - Si se solicitan 16 kW con Lux Power (equipos residenciales split-phase típicamente de 8 kW en RD), asigna potencia unitaria matchedInverterPowerKW = 8.0 y matchedInverterCount = 2 (o el inversor unitario de 16 kW si existe en el catálogo).
      - En 'matchedInverterId' coloca el id del inversor en el catálogo provisto.
      - En 'matchedInverterModel' coloca el displayName del inversor.
   d) BATERÍAS BESS (ALMACENAMIENTO):
      - Si se solicitan baterías (ej. '2 bateria hinaes de 16kw' o '2 bateria de 16k weco'):
        * hasBattery = true
        * matchedBatteryModel = modelo del catálogo (ej. 'Batería WeCo 16K0-LV (16.06kWh)' o 'Batería HinaESS PowerGem Max (16.08kWh)')
        * matchedBatteryId = id del catálogo
        * matchedBatteryCapacityKWh = 16.06 (o la capacidad nominal en kWh)
        * matchedBatteryCount = 2
      - Si no se mencionan baterías: hasBattery = false, matchedBatteryCount = 0.
   e) REGLA CRÍTICA DE EQUIPOS SIN PRECIO ASIGNADO ('DISPONIBLE_SIN_PRECIO') Y 'EQUIPOS SEGÚN DISPONIBILIDAD':
       - Si el equipo solicitado existe en el catálogo pero no tiene precios de distribuidores (priceStatus: 'DISPONIBLE_SIN_PRECIO'), DEBES SELECCIONARLO DE TODOS MODOS con su ID y nombre correspondiente. La falta de precio de distribuidor NO impide su selección en la propuesta.
       - La frase 'Equipos según disponibilidad' significa dar prioridad absoluta a los equipos solicitados si existen en el catálogo (estén o no con precio asignado). NUNCA descartes un equipo solicitado para elegir otro solo porque el otro tenga precio.
    f) REGLA DE SUSTITUCIÓN INTELIGENTE (ÚNICAMENTE SI EL EQUIPO NO EXISTE EN LA BASE DE DATOS):
       - SOLO si la marca o potencia solicitada NO existe en absoluto en el catálogo provisto:
         1. Selecciona un sustituto del catálogo con función y potencia/capacidad equivalente más cercana.
         2. Registra la sustitución en 'equipmentSubstitutions' indicando 'type', 'requestedModel', 'selectedModel' y 'reason'.
         3. Explica claramente la sustitución en 'aiReasoningSummary'.
       - Si la marca o modelo solicitado (ej. WeCo, Luxpower, Canadian Solar, HinaESS) SÍ figura en el catálogo, NO generes sustitución; selecciona el equipo de esa marca.
   g) MARGEN DE VENTA COMERCIAL:
      - Si se especifica 'Porcentaje de venta 40%' o 'Venta 40%' -> targetMarginPct = 40.
   h) SÍNTESIS DE CONSUMO SIN FACTURA:
      - Si no se suministra factura pero el texto dice 'diseñado para 40kwh diario', genera 'monthlyConsumptionKWh' con 12 valores de Math.round(40 * 30.4) = 1216 kWh.
   i) DIRECTIVA ESTRICTA DE CONCISIÓN TÉCNICA (MÁXIMO 350 CARACTERES POR CAMPO):
      - 'specialTechnicalNotes': Máximo 2 oraciones (ej. 'Sistema diseñado para 40 kWh/día con acople de baterías y equipos según disponibilidad').
      - 'aiReasoningSummary': Resumen profesional de 2 a 3 oraciones de los equipos seleccionados o sustituidos.
      - 'notes': Resumen breve de la factura o dimensionamiento.
      - PROHIBICIÓN ABSOLUTA: NUNCA copies, listes, repitas ni vuelques el catálogo de equipos dentro de estos campos de texto.`;

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
      description: 'Costo por kW de demanda facturada en RD$/kW',
    },
    meterNumber: { type: 'STRING', description: 'Número de contador o medidor' },
    voltagePhase: { type: 'STRING', description: 'Nivel de voltaje y fases de suministro' },
    powerFactor: { type: 'NUMBER', description: 'Factor de potencia si figura' },
    billingDays: { type: 'NUMBER', description: 'Cantidad de días facturados' },
    totalBilledAmountDOP: { type: 'NUMBER', description: 'Monto Total Facturado a pagar en RD$' },
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
    matchedPanelId: {
      type: 'STRING',
      description: 'ID exacto del módulo solar emparejado en el catálogo de referencia',
    },
    matchedPanelModel: {
      type: 'STRING',
      description: 'Nombre o modelo del panel fotovoltaico seleccionado',
    },
    matchedPanelWatts: {
      type: 'NUMBER',
      description: 'Potencia nominal en vatios del panel (Wp)',
    },
    matchedPanelCount: {
      type: 'NUMBER',
      description: 'Cantidad exacta de paneles fotovoltaicos solicitados o recomendados',
    },
    matchedInverterId: {
      type: 'STRING',
      description: 'ID exacto del inversor emparejado en el catálogo de referencia',
    },
    matchedInverterModel: {
      type: 'STRING',
      description: 'Nombre o modelo del inversor seleccionado',
    },
    matchedInverterPowerKW: {
      type: 'NUMBER',
      description: 'Potencia unitaria nominal del inversor en kW',
    },
    matchedInverterCount: {
      type: 'NUMBER',
      description: 'Cantidad de inversores',
    },
    hasBattery: {
      type: 'BOOLEAN',
      description: 'Indica si el proyecto incluye baterías BESS de almacenamiento',
    },
    matchedBatteryId: {
      type: 'STRING',
      description: 'ID exacto de la batería emparejada en el catálogo de referencia',
    },
    matchedBatteryModel: {
      type: 'STRING',
      description: 'Nombre o modelo del banco de baterías',
    },
    matchedBatteryCapacityKWh: {
      type: 'NUMBER',
      description: 'Capacidad unitaria nominal de la batería en kWh',
    },
    matchedBatteryCount: {
      type: 'NUMBER',
      description: 'Cantidad de baterías BESS',
    },
    targetMarginPct: {
      type: 'NUMBER',
      description: 'Porcentaje de margen de venta comercial solicitado (ej. 40 para 40%)',
    },
    specialTechnicalNotes: {
      type: 'STRING',
      description: 'Requisitos técnicos especiales y condiciones del sistema',
    },
    aiReasoningSummary: {
      type: 'STRING',
      description: 'Explicación del razonamiento de la IA sobre los equipos y decisiones tomadas',
    },
    confidenceScore: {
      type: 'NUMBER',
      description: 'Nivel de confianza del análisis del 0 al 100',
    },
    notes: {
      type: 'STRING',
      description: 'Observaciones y resumen de la extracción',
    },
    equipmentSubstitutions: {
      type: 'ARRAY',
      description: 'Equipos sustitutos seleccionados por la IA si lo solicitado no existía en el catálogo',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['panel', 'inverter', 'battery'] },
          requestedModel: { type: 'STRING' },
          selectedModel: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['type', 'requestedModel', 'selectedModel', 'reason'],
      },
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
  fileBase64?: string; // Pure Base64 without data URI header (opcional si hay projectRequirementsText)
  mimeType?: string;   // e.g. "application/pdf", "image/png", "image/jpeg"
  fileName?: string;
  apiKey: string;
  model?: string;
  panelPowerW?: number; // Default 620W for solar estimation
  projectRequirementsText?: string;
  equipmentCatalog?: SolarEquipmentItem[];
  dopExchangeRate?: number;
  onProgress?: (status: string) => void;
}): Promise<ExtractedInvoiceData> {
  const {
    fileBase64,
    mimeType,
    fileName,
    apiKey,
    model = 'gemini-2.0-flash',
    panelPowerW = 620,
    projectRequirementsText,
    equipmentCatalog = [],
    dopExchangeRate = 60.0,
    onProgress,
  } = params;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('No se ha configurado la API Key de Google Gemini. Por favor configúrala en Ajustes.');
  }

  // Strip data URL prefix if present
  let cleanBase64 = fileBase64 || '';
  if (cleanBase64.includes('base64,')) {
    cleanBase64 = cleanBase64.split('base64,')[1];
  }

  const primaryModel = model?.trim() || 'gemini-2.0-flash';
  const candidateModels = Array.from(
    new Set([primaryModel, 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite'])
  ).filter(Boolean);

  // Preparar catálogo de referencia condensado con mejores precios para grounding
  const referenceCatalogCondensed = equipmentCatalog.map((e) => {
    const prices = e.supplierPrices || [];
    const bestSp = prices.length > 0 ? [...prices].sort((a, b) => a.priceUSD - b.priceUSD)[0] : undefined;
    return {
      id: e.id,
      type: e.type,
      brand: e.brand,
      model: e.displayName,
      powerOrCap: e.type === 'panel' ? `${e.powerW}W` : e.type === 'inverter' ? `${e.powerKW}kW` : `${e.capacityKWh}kWh`,
      priceStatus: bestSp ? `$${bestSp.priceUSD} USD (${bestSp.supplierName})` : 'DISPONIBLE_SIN_PRECIO',
    };
  });

  let promptIntro = '';
  if (cleanBase64 && fileName) {
    promptIntro += `Analiza esta factura eléctrica dominicana (archivo: "${fileName}") y extrae todos los datos de cliente, distribuidora, tarifa, desgloses económicos y el vector cronológico de 12 meses de consumo en kWh (Enero a Diciembre).\n\n`;
  } else {
    promptIntro += `No se ha suministrado un archivo físico de factura, pero se proporcionan requerimientos directos para diseñar y dimensionar la propuesta solar.\n\n`;
  }

  if (projectRequirementsText && projectRequirementsText.trim()) {
    promptIntro += `REQUISITOS Y ESPECIFICACIONES TÉCNICAS DEL PROYECTO:\n"""\n${projectRequirementsText.trim()}\n"""\n\n`;
    promptIntro += `INSTRUCCIONES CLAVE DE SÍNTESIS CON REQUISITOS:\n`;
    promptIntro += `1. Si el texto indica nombre del cliente (ej. 'Josia Moscoso' o 'Giovanni Gottardo'), dale prioridad absoluta en 'clientName'.\n`;
    promptIntro += `2. Analiza los equipos solicitados (paneles, inversores, baterías) y emparéjalos con los IDs y modelos del CATÁLOGO DE REFERENCIA adjunto.\n`;
    promptIntro += `3. Si un equipo del catálogo tiene priceStatus 'DISPONIBLE_SIN_PRECIO', es 100% VÁLIDO y debes seleccionarlo obligatoriamente si coincide con lo solicitado.\n`;
    promptIntro += `4. La frase 'Equipos según disponibilidad' significa dar prioridad a los equipos solicitados si figuran en el catálogo (incluso sin cotización cargada). NUNCA sustituyas si la marca existe en el catálogo.\n`;
    promptIntro += `5. Si se especifica cantidad de paneles o kWp (ej. '11 kwp paneles Canadian 615w' o '21 panel'), TIENE PRIORIDAD ABSOLUTA sobre cualquier cálculo de consumo. Asigna 'matchedPanelCount' = Math.round(11000 / 615) = 18 paneles.\n`;
    promptIntro += `6. Si se especifica inversor (ej. '1 inversor lux power de 16 kw' o '1 weco 8 kw'), identifica el modelo del catálogo, asigna en 'matchedInverterPowerKW' la potencia unitaria nominal y en 'matchedInverterCount' la cantidad.\n`;
    promptIntro += `7. Si se mencionan baterías (ej. '2 bateria hinaes de 16kw' o '2 bateria de 16k weco'), marca 'hasBattery' = true, empareja 'matchedBatteryModel' y 'matchedBatteryId', asigna 'matchedBatteryCapacityKWh' y 'matchedBatteryCount' (ej. 2 baterías).\n`;
    promptIntro += `8. Si se menciona margen comercial (ej. 'Porcentaje de venta 40%' o 'Venta 40%'), asigna 'targetMarginPct' = 40.\n`;
    promptIntro += `9. Si no hay factura pero se menciona 'diseñado para X kwh diario' (ej. 40kwh diario), genera un consumo mensual de Math.round(X * 30.4) para los 12 meses (ej. 1216 kWh).\n`;
    promptIntro += `10. CONCISIÓN OBLIGATORIA: 'specialTechnicalNotes', 'aiReasoningSummary' y 'notes' deben ser muy breves (< 350 caracteres). NUNCA listes ni repitas el catálogo dentro de ellos.\n\n`;
  }

  if (referenceCatalogCondensed.length > 0) {
    promptIntro += `CATÁLOGO DE EQUIPOS DISPONIBLES EN EL SISTEMA (Para emparejar exactamente los IDs y modelos solicitados):\n`;
    promptIntro += referenceCatalogCondensed.map(item => JSON.stringify(item)).join('\n') + '\n\n';
  }

  promptIntro += `TASA DE CAMBIO: 1 USD = ${dopExchangeRate} DOP. Responde estrictamente con el JSON estructurado solicitado.`;

  const userParts: any[] = [{ text: promptIntro }];
  if (cleanBase64 && mimeType) {
    userParts.push({
      inline_data: {
        mime_type: mimeType,
        data: cleanBase64,
      },
    });
  }

  let rawText: string | undefined;
  let lastError: any = null;

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const currentModel = candidateModels[mIdx];
    const endpoint = `${GEMINI_API_BASE}/models/${currentModel}:generateContent?key=${apiKey.trim()}`;
    const isThinkingModel = currentModel.includes('3.7') || currentModel.includes('2.5');

    const generationConfig: any = {
      temperature: 0.2,
      maxOutputTokens: 8192,
      response_mime_type: 'application/json',
      response_schema: INVOICE_JSON_SCHEMA,
    };
    if (isThinkingModel) {
      generationConfig.thinkingConfig = { thinkingBudget: 2048 };
    }

    const requestBody = {
      system_instruction: {
        parts: [{ text: INVOICE_EXTRACTION_SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: 'user',
          parts: userParts,
        },
      ],
      generationConfig,
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (mIdx > 0 || attempt > 1) {
          onProgress?.(
            attempt > 1
              ? `Reintentando con ${currentModel} (intento ${attempt}/2)...`
              : `Google experimenta alta demanda. Conectando con modelo de respaldo ${currentModel}...`
          );
        } else {
          onProgress?.(`Analizando propuesta con ${currentModel}...`);
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          const responseJson = await response.json();
          rawText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            break;
          }
        }

        const errorJson = await response.json().catch(() => ({}));
        const errorMsg = errorJson?.error?.message || `Error HTTP ${response.status}`;

        // Si es API Key no válida, fallar de inmediato
        if (response.status === 400 && errorMsg.toLowerCase().includes('api_key_invalid')) {
          throw new Error(`API Key de Google Gemini inválida: ${errorMsg}`);
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Permisos denegados en Google Gemini (${response.status}): ${errorMsg}`);
        }

        lastError = new Error(`Google AI (${response.status} en ${currentModel}): ${errorMsg}`);

        if (response.status === 503 || response.status === 429) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }

        break;
      } catch (err: any) {
        lastError = err;
        if (err.message?.includes('API Key')) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    if (rawText) {
      break;
    }
  }

  if (!rawText) {
    throw new Error(
      `Los servidores de Google Gemini están experimentando alta demanda momentánea (503). Intentamos con ${candidateModels.join(', ')}. ${lastError?.message || 'Por favor espera unos segundos y vuelve a intentar.'}`
    );
  }

  function robustParseJson(raw: string): any {
    let clean = raw.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    try {
      return JSON.parse(clean);
    } catch (firstErr: any) {
      try {
        let repaired = clean;
        let inString = false;
        let escaped = false;
        const openBrackets: string[] = [];

        for (let i = 0; i < repaired.length; i++) {
          const char = repaired[i];
          if (char === '\\' && inString) {
            escaped = !escaped;
            continue;
          }
          if (char === '"' && !escaped) {
            inString = !inString;
          }
          if (!inString) {
            if (char === '{' || char === '[') {
              openBrackets.push(char);
            } else if (char === '}') {
              if (openBrackets[openBrackets.length - 1] === '{') openBrackets.pop();
            } else if (char === ']') {
              if (openBrackets[openBrackets.length - 1] === '[') openBrackets.pop();
            }
          }
          escaped = false;
        }

        if (inString) {
          repaired += '"';
        }

        repaired = repaired.replace(/,\s*$/, '');

        while (openBrackets.length > 0) {
          const last = openBrackets.pop();
          if (last === '{') repaired += '}';
          else if (last === '[') repaired += ']';
        }

        return JSON.parse(repaired);
      } catch {
        const lastComma = clean.lastIndexOf(',');
        if (lastComma > 0) {
          try {
            return robustParseJson(clean.slice(0, lastComma));
          } catch {
            // ignore
          }
        }
        const lastBrace = clean.lastIndexOf('}');
        if (lastBrace > 0) {
          try {
            return JSON.parse(clean.slice(0, lastBrace + 1));
          } catch {
            // ignore
          }
        }
        throw new Error(`Error interpretando JSON de la IA: ${firstErr?.message || 'Formato truncado'}`);
      }
    }
  }

  const parsed = robustParseJson(rawText);

  // Clean corrupted character encodings (e.g. NU?EZ -> NUÑEZ)
  let cleanName = (parsed.clientName || 'Cliente Propuesta Solar').replace(/\?/g, 'Ñ');

  // Normalize and validate 12-month array
  let monthlyConsumption: number[] = Array.isArray(parsed.monthlyConsumptionKWh)
    ? parsed.monthlyConsumptionKWh.map((n: any) => Math.max(0, Math.round(Number(n) || 0)))
    : [];

  if (monthlyConsumption.length < 12) {
    const avg = parsed.averageMonthlyKWh || 1200;
    while (monthlyConsumption.length < 12) {
      monthlyConsumption.push(avg);
    }
  } else if (monthlyConsumption.length > 12) {
    monthlyConsumption = monthlyConsumption.slice(0, 12);
  }

  const totalAnnual = monthlyConsumption.reduce((sum, v) => sum + v, 0);
  const avgMonthly = Math.round(totalAnnual / 12);

  // Smart Panel Matching con el Catálogo
  let selectedPanelId: string | undefined;
  let selectedPanelModel: string | undefined;
  let selectedPanelWatts: number = panelPowerW > 0 ? panelPowerW : 620;
  let selectedPanelUnitPriceUSD: number | undefined;

  if (parsed.matchedPanelId || parsed.matchedPanelModel || parsed.matchedPanelWatts) {
    let panMatch = equipmentCatalog.find(
      (e) => e.type === 'panel' && (e.id === parsed.matchedPanelId || e.displayName === parsed.matchedPanelModel || e.modelSeries === parsed.matchedPanelModel)
    );
    if (!panMatch) {
      const reqBrand = (parsed.matchedPanelModel || '').toLowerCase();
      const targetW = parsed.matchedPanelWatts || selectedPanelWatts;
      panMatch = equipmentCatalog.find((e) => {
        if (e.type !== 'panel') return false;
        const matchPower = targetW > 0 ? Math.abs((e.powerW || 0) - targetW) <= 10 : true;
        const matchBrand = reqBrand ? e.brand.toLowerCase().includes(reqBrand) || reqBrand.includes(e.brand.toLowerCase()) : true;
        return matchPower && matchBrand;
      }) || equipmentCatalog.find((e) => e.type === 'panel' && targetW > 0 && Math.abs((e.powerW || 0) - targetW) <= 15);
    }

    if (panMatch) {
      selectedPanelId = panMatch.id;
      selectedPanelModel = panMatch.displayName;
      selectedPanelWatts = panMatch.powerW || selectedPanelWatts;
    } else {
      const targetW = parsed.matchedPanelWatts || selectedPanelWatts;
      const sortedPanels = equipmentCatalog
        .filter((e) => e.type === 'panel' && e.powerW)
        .sort((a, b) => Math.abs((a.powerW || 0) - targetW) - Math.abs((b.powerW || 0) - targetW));
      if (sortedPanels.length > 0) {
        selectedPanelId = sortedPanels[0].id;
        selectedPanelModel = sortedPanels[0].displayName;
        selectedPanelWatts = sortedPanels[0].powerW || selectedPanelWatts;
      } else {
        selectedPanelModel = parsed.matchedPanelModel;
        selectedPanelWatts = parsed.matchedPanelWatts || selectedPanelWatts;
      }
    }
  }

  // Solar Dimensioning Suggestion based on local radiation, target coverage (95%), and default system losses (25%)
  const cleanProvince = parsed.province || 'Santo Domingo / Distrito Nacional';
  const targetCoverage = 95;
  const defaultLosses = 25.0;

  const rec = calculateRecommendedPanelCount(
    cleanProvince,
    monthlyConsumption,
    selectedPanelWatts,
    targetCoverage,
    defaultLosses
  );

  // Detección explícita de paneles / potencia solicitada en texto (Prioridad Absoluta)
  if (projectRequirementsText) {
    const kwpMatch = projectRequirementsText.match(/(\d+(?:\.\d+)?)\s*k(?:w|wp)\s*(?:paneles|panel|m[oó]dulos)?/i)
      || projectRequirementsText.match(/(?:paneles|panel|m[oó]dulos)\s*(?:de\s*)?(\d+(?:\.\d+)?)\s*k(?:w|wp)/i);
    const countMatch = projectRequirementsText.match(/(\d+)\s*(?:paneles|panel|m[oó]dulos)/i);

    if (kwpMatch) {
      const explicitKwp = parseFloat(kwpMatch[1]);
      if (explicitKwp > 0) {
        parsed.matchedPanelCount = Math.max(1, Math.round((explicitKwp * 1000) / selectedPanelWatts));
      }
    } else if (countMatch) {
      const explicitCount = parseInt(countMatch[1], 10);
      if (explicitCount > 0) {
        parsed.matchedPanelCount = explicitCount;
      }
    }
  }

  const finalPanelCount = parsed.matchedPanelCount && parsed.matchedPanelCount > 0
    ? parsed.matchedPanelCount
    : rec.recommendedPanelCount;
  const finalCapacityKWp = Math.round(((finalPanelCount * selectedPanelWatts) / 1000) * 100) / 100;

  // Smart Inverter Matching con el Catálogo y Re-Grounding Determinista
  let selectedInverterId: string | undefined;
  let selectedInverterModel: string | undefined;
  let selectedInverterPowerKW: number | undefined;
  let selectedInverterCount: number | undefined;
  let selectedInverterUnitPriceUSD: number | undefined;

  let invMatch: SolarEquipmentItem | undefined;

  if (projectRequirementsText) {
    const reqLower = projectRequirementsText.toLowerCase();
    const knownInvBrands = ['weco', 'lux power', 'luxpower', 'solis', 'huawei', 'growatt', 'deye', 'sma', 'fronius', 'enphase', 'victron'];
    const reqBrand = knownInvBrands.find((b) => reqLower.includes(b));
    if (reqBrand) {
      const cleanBrandKey = reqBrand.replace('luxpower', 'lux');
      const brandInverters = equipmentCatalog.filter(
        (e) => e.type === 'inverter' && (
          e.brand.toLowerCase().includes(cleanBrandKey) ||
          e.displayName.toLowerCase().includes(cleanBrandKey) ||
          e.modelSeries.toLowerCase().includes(cleanBrandKey)
        )
      );
      if (brandInverters.length > 0) {
        // Extraer potencia solicitada en texto si existe (ej. "8 kw", "16 kw")
        const kwMatch = reqLower.match(/(\d+(?:\.\d+)?)\s*(?:kw|k)\b/);
        const targetKW = kwMatch ? parseFloat(kwMatch[1]) : (parsed.matchedInverterPowerKW || 8.0);
        brandInverters.sort((a, b) => Math.abs((a.powerKW || 0) - targetKW) - Math.abs((b.powerKW || 0) - targetKW));
        invMatch = brandInverters[0];
      }
    }

    // Extraer cantidad explícita de inversores si existe (ej. "1 weco 8 kw", "2 inversores")
    const invCountMatch = reqLower.match(/(\d+)\s*(?:inversores?|unidades?\s*de\s*inversor|weco|lux power)/i);
    if (invCountMatch) {
      selectedInverterCount = parseInt(invCountMatch[1], 10);
    }
  }

  if (!invMatch && (parsed.matchedInverterId || parsed.matchedInverterModel || parsed.matchedInverterPowerKW)) {
    invMatch = equipmentCatalog.find(
      (e) => e.type === 'inverter' && (e.id === parsed.matchedInverterId || e.displayName === parsed.matchedInverterModel || e.modelSeries === parsed.matchedInverterModel)
    );
    if (!invMatch) {
      const reqInvStr = `${parsed.matchedInverterModel || ''} ${parsed.aiReasoningSummary || ''}`.toLowerCase();
      const targetKW = parsed.matchedInverterPowerKW || 8.0;
      invMatch = equipmentCatalog.find((e) => {
        if (e.type !== 'inverter') return false;
        const matchBrand = reqInvStr.includes(e.brand.toLowerCase()) || (e.brand.toLowerCase().includes('weco') && reqInvStr.includes('weco')) || (e.brand.toLowerCase().includes('lux') && reqInvStr.includes('lux'));
        const matchPower = Math.abs((e.powerKW || 0) - targetKW) <= 1.0;
        return matchBrand && matchPower;
      }) || equipmentCatalog.find((e) => {
        if (e.type !== 'inverter') return false;
        return reqInvStr.includes(e.brand.toLowerCase()) || (e.brand.toLowerCase().includes('weco') && reqInvStr.includes('weco')) || (e.brand.toLowerCase().includes('lux') && reqInvStr.includes('lux'));
      });
    }

    // Fallback inteligente: si la marca pedida no existe en catálogo, elegir el inversor más cercano en kW
    if (!invMatch) {
      const targetKW = parsed.matchedInverterPowerKW || 8.0;
      const sortedInverters = equipmentCatalog
        .filter((e) => e.type === 'inverter' && e.powerKW)
        .sort((a, b) => Math.abs((a.powerKW || 0) - targetKW) - Math.abs((b.powerKW || 0) - targetKW));
      if (sortedInverters.length > 0) {
        invMatch = sortedInverters[0];
      }
    }
  }

  if (invMatch) {
    selectedInverterId = invMatch.id;
    selectedInverterModel = invMatch.displayName;
    selectedInverterPowerKW = invMatch.powerKW || parsed.matchedInverterPowerKW || 8.0;
  } else {
    selectedInverterModel = parsed.matchedInverterModel || 'Inversor Solar Híbrido';
    selectedInverterPowerKW = parsed.matchedInverterPowerKW || 8.0;
  }
  selectedInverterCount = selectedInverterCount || parsed.matchedInverterCount || Math.max(1, Math.ceil(finalCapacityKWp / (selectedInverterPowerKW || 8.0)));

  // Smart BESS Battery Storage Matching con el Catálogo y Re-Grounding Determinista
  let hasBattery = parsed.hasBattery === true;
  let selectedBatteryId: string | undefined;
  let selectedBatteryModel: string | undefined;
  let selectedBatteryCapacityKWh: number | undefined;
  let selectedBatteryCount: number | undefined;
  let selectedBatteryUnitPriceUSD: number | undefined;

  let batMatch: SolarEquipmentItem | undefined;

  if (projectRequirementsText) {
    const reqLower = projectRequirementsText.toLowerCase();
    const knownBatBrands = ['weco', 'hinaess', 'hina', 'powergem', 'byd', 'tesla', 'pylontech', 'dyness', 'deye', 'felicity'];
    const reqBrand = knownBatBrands.find((b) => reqLower.includes(b));
    if (reqBrand || reqLower.includes('bateria') || reqLower.includes('batería')) {
      hasBattery = true;
      if (reqBrand) {
        const cleanBrandKey = reqBrand === 'powergem' || reqBrand === 'hina' ? 'hina' : reqBrand;
        const brandBatteries = equipmentCatalog.filter(
          (e) => e.type === 'battery' && (
            e.brand.toLowerCase().includes(cleanBrandKey) ||
            e.displayName.toLowerCase().includes(cleanBrandKey) ||
            e.modelSeries.toLowerCase().includes(cleanBrandKey)
          )
        );
        if (brandBatteries.length > 0) {
          const capMatch = reqLower.match(/(\d+(?:\.\d+)?)\s*(?:kwh|k|k\b)/);
          const targetCap = capMatch ? parseFloat(capMatch[1]) : (parsed.matchedBatteryCapacityKWh || 16.0);
          brandBatteries.sort((a, b) => Math.abs((a.capacityKWh || 0) - targetCap) - Math.abs((b.capacityKWh || 0) - targetCap));
          batMatch = brandBatteries[0];
        }
      }

      // Extraer cantidad de baterías explícita (ej. "2 bateria de 16k weco", "2 baterías")
      const batCountMatch = reqLower.match(/(\d+)\s*(?:bater[ií]as?|unidades?\s*de\s*bater[ií]a)/i);
      if (batCountMatch) {
        selectedBatteryCount = parseInt(batCountMatch[1], 10);
      }
    }
  }

  if (!batMatch && (hasBattery || parsed.matchedBatteryId || parsed.matchedBatteryModel || (parsed.matchedBatteryCount && parsed.matchedBatteryCount > 0))) {
    hasBattery = true;
    batMatch = equipmentCatalog.find(
      (e) => e.type === 'battery' && (e.id === parsed.matchedBatteryId || e.displayName === parsed.matchedBatteryModel || e.modelSeries === parsed.matchedBatteryModel)
    );
    if (!batMatch) {
      const req = (parsed.matchedBatteryModel || '').toLowerCase();
      batMatch = equipmentCatalog.find((e) => {
        if (e.type !== 'battery') return false;
        if ((req.includes('hina') || req.includes('powergem')) && e.brand.toLowerCase().includes('hina')) return true;
        if (req.includes('weco') && e.brand.toLowerCase().includes('weco')) return true;
        if (parsed.matchedBatteryCapacityKWh && e.capacityKWh && Math.abs(e.capacityKWh - parsed.matchedBatteryCapacityKWh) <= 0.5) return true;
        return false;
      }) || equipmentCatalog.find((e) => e.type === 'battery');
    }

    // Fallback inteligente: si la marca de batería no existe en catálogo, elegir la batería más cercana en kWh
    if (!batMatch) {
      const targetCap = parsed.matchedBatteryCapacityKWh || 16.08;
      const sortedBatteries = equipmentCatalog
        .filter((e) => e.type === 'battery' && e.capacityKWh)
        .sort((a, b) => Math.abs((a.capacityKWh || 0) - targetCap) - Math.abs((b.capacityKWh || 0) - targetCap));
      if (sortedBatteries.length > 0) {
        batMatch = sortedBatteries[0];
      }
    }
  }

  if (batMatch) {
    selectedBatteryId = batMatch.id;
    selectedBatteryModel = batMatch.displayName;
    selectedBatteryCapacityKWh = batMatch.capacityKWh || parsed.matchedBatteryCapacityKWh || 16.08;
  } else if (hasBattery) {
    selectedBatteryModel = parsed.matchedBatteryModel || 'Batería Hinaess 16 KwH-48 vdc.';
    selectedBatteryCapacityKWh = parsed.matchedBatteryCapacityKWh || 16.08;
  }
  selectedBatteryCount = selectedBatteryCount || parsed.matchedBatteryCount || 1;

  // Detección y consolidación de sustituciones de equipos
  let equipmentSubstitutions: Array<{
    type: 'panel' | 'inverter' | 'battery';
    requestedModel: string;
    selectedModel: string;
    reason: string;
  }> = Array.isArray(parsed.equipmentSubstitutions) ? [...parsed.equipmentSubstitutions] : [];

  if (projectRequirementsText) {
    const reqLower = projectRequirementsText.toLowerCase();

    // Inversor
    if (selectedInverterModel) {
      const knownInvBrands = ['weco', 'lux power', 'luxpower', 'solis', 'huawei', 'growatt', 'deye', 'sma', 'fronius', 'enphase', 'victron'];
      const reqBrand = knownInvBrands.find((b) => reqLower.includes(b));
      if (reqBrand && !selectedInverterModel.toLowerCase().includes(reqBrand.replace('luxpower', 'lux'))) {
        if (!equipmentSubstitutions.some((s) => s.type === 'inverter')) {
          equipmentSubstitutions.push({
            type: 'inverter',
            requestedModel: `Inversor ${reqBrand.toUpperCase()}`,
            selectedModel: selectedInverterModel,
            reason: `Marca ${reqBrand.toUpperCase()} no disponible en catálogo; se seleccionó ${selectedInverterModel} de potencia equivalente (${selectedInverterPowerKW || 8} kW).`,
          });
        }
      }
    }

    // Batería
    if (hasBattery && selectedBatteryModel) {
      const knownBatBrands = ['weco', 'hinaess', 'hina', 'byd', 'tesla', 'pylontech', 'dyness'];
      const reqBrand = knownBatBrands.find((b) => reqLower.includes(b));
      const normalizedReqBrand = reqBrand === 'hina' ? 'hinaess' : reqBrand;
      if (normalizedReqBrand && !selectedBatteryModel.toLowerCase().includes(normalizedReqBrand)) {
        if (!equipmentSubstitutions.some((s) => s.type === 'battery')) {
          equipmentSubstitutions.push({
            type: 'battery',
            requestedModel: `Batería ${normalizedReqBrand.toUpperCase()}`,
            selectedModel: selectedBatteryModel,
            reason: `Marca ${normalizedReqBrand.toUpperCase()} no disponible en catálogo; se seleccionó ${selectedBatteryModel} de capacidad equivalente (${selectedBatteryCapacityKWh || 16.08} kWh).`,
          });
        }
      }
    }
  }

  // Sanitización de sustituciones: si el modelo finalmente seleccionado coincide con la marca solicitada, remover la sustitución
  if (projectRequirementsText) {
    const reqLower = projectRequirementsText.toLowerCase();
    equipmentSubstitutions = equipmentSubstitutions.filter((sub) => {
      if (sub.type === 'inverter' && selectedInverterModel) {
        const invReqBrand = ['weco', 'lux power', 'luxpower', 'solis', 'huawei', 'growatt', 'deye', 'sma', 'fronius', 'victron']
          .find((b) => sub.requestedModel.toLowerCase().includes(b) || reqLower.includes(b));
        if (invReqBrand && selectedInverterModel.toLowerCase().includes(invReqBrand.replace('luxpower', 'lux'))) {
          return false;
        }
      }
      if (sub.type === 'battery' && selectedBatteryModel) {
        const batReqBrand = ['weco', 'hinaess', 'hina', 'powergem', 'byd', 'tesla', 'pylontech', 'dyness', 'deye', 'felicity']
          .find((b) => sub.requestedModel.toLowerCase().includes(b) || reqLower.includes(b));
        const normBrand = batReqBrand === 'powergem' || batReqBrand === 'hina' ? 'hina' : batReqBrand;
        if (normBrand && selectedBatteryModel.toLowerCase().includes(normBrand)) {
          return false;
        }
      }
      return true;
    });
  }

  // Precios de proveedores vinculados y auto-supplier pricing
  const selectedSupplierInfo: any = {};
  let autoSupplierPricing = false;

  if (selectedPanelId) {
    const pItem = equipmentCatalog.find((e) => e.id === selectedPanelId);
    if (pItem?.supplierPrices && pItem.supplierPrices.length > 0) {
      const best = [...pItem.supplierPrices].sort((a, b) => a.priceUSD - b.priceUSD)[0];
      selectedPanelUnitPriceUSD = best.priceUSD;
      selectedSupplierInfo.panel = {
        supplierName: best.supplierName,
        priceUSD: best.priceUSD,
        updatedAt: best.updatedAt,
        supplierPriceId: best.id,
      };
      autoSupplierPricing = true;
    }
  }

  if (selectedInverterId) {
    const iItem = equipmentCatalog.find((e) => e.id === selectedInverterId);
    if (iItem?.supplierPrices && iItem.supplierPrices.length > 0) {
      const best = [...iItem.supplierPrices].sort((a, b) => a.priceUSD - b.priceUSD)[0];
      selectedInverterUnitPriceUSD = best.priceUSD;
      selectedSupplierInfo.inverter = {
        supplierName: best.supplierName,
        priceUSD: best.priceUSD,
        updatedAt: best.updatedAt,
        supplierPriceId: best.id,
      };
      autoSupplierPricing = true;
    }
  }

  if (selectedBatteryId) {
    const bItem = equipmentCatalog.find((e) => e.id === selectedBatteryId);
    if (bItem?.supplierPrices && bItem.supplierPrices.length > 0) {
      const best = [...bItem.supplierPrices].sort((a, b) => a.priceUSD - b.priceUSD)[0];
      selectedBatteryUnitPriceUSD = best.priceUSD;
      selectedSupplierInfo.battery = {
        supplierName: best.supplierName,
        priceUSD: best.priceUSD,
        updatedAt: best.updatedAt,
        supplierPriceId: best.id,
      };
      autoSupplierPricing = true;
    }
  }

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

    // Paneles
    recommendedCapacityKWp: finalCapacityKWp,
    recommendedPanelCount: finalPanelCount,
    selectedPanelId,
    selectedPanelModel,
    selectedPanelWatts,
    selectedPanelUnitPriceUSD,

    // Inversor
    selectedInverterId,
    selectedInverterModel,
    selectedInverterPowerKW,
    selectedInverterCount,
    selectedInverterUnitPriceUSD,

    // Baterías
    hasBattery,
    selectedBatteryId,
    selectedBatteryModel,
    selectedBatteryCapacityKWh,
    selectedBatteryCount,
    selectedBatteryUnitPriceUSD,

    // Estrategia Comercial & Finanzas
    targetMarginPct: parsed.targetMarginPct || undefined,
    pricingMode: parsed.targetMarginPct ? 'cost_matrix' : undefined,
    autoSupplierPricing,
    selectedSupplierInfo: autoSupplierPricing ? selectedSupplierInfo : undefined,

    // Requisitos & Razonamiento IA
    targetCoveragePct: 95,
    confidenceScore: parsed.confidenceScore || 98,
    extractedFromFileName: fileName || 'Requisitos en texto libre',
    projectRequirementsPrompt: projectRequirementsText || undefined,
    aiReasoningSummary: parsed.aiReasoningSummary || undefined,
    specialTechnicalNotes: parsed.specialTechnicalNotes || undefined,
    aiNotes: parsed.notes || undefined,
    equipmentSubstitutions: equipmentSubstitutions.length > 0 ? equipmentSubstitutions : undefined,
  };

  return result;
}
