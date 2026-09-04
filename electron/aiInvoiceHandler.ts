import { ipcMain } from 'electron';
import https from 'https';

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
   - Tarifa: Código como "BTS1" (residencial simple), "BTS2" (comercial baja tensión), "BTD" (baja tensión con demanda), "MTD" (media tensión con demanda).
   - Voltaje y Fase: "VOLTAJE" (ej. "Baja 120/240 Doble Monofasica", "Baja 120/208 Trifásica", "Monofásica").
   - Periodo de facturación y Días facturados: ej. 31 días.
   - Factor de Potencia / Eficiencia: ej. 0.97 si aplica.

4. DESGLOSE ECONÓMICO Y ESTRUCTURA TARIFARIA:
   - Cargo fijo: Valor en RD$ (ej. 127.83 o 210.15).
   - Estructura de Energía (RD$/kWh):
     * Para tarifa plana (ej. BTD): un solo precio por kWh (ej. RD$ 9.02/kWh).
     * Para tarifa escalonada (ej. BTS1): bloques como 200 kWh x RD$ 6.17, 100 kWh x RD$ 8.71, 373 kWh x RD$ 13.04.
     * En 'energyCostPerKWhDOP', calcula el precio medio efectivo ponderado de la energía (Total RD$ Energía / Total kWh).
     * En 'marginalRateDOP', guarda la tarifa marginal del escalón más alto (ej. 13.04 RD$/kWh).
   - Potencia Máxima (Demanda en kW) y su costo por kW: si aplica para BTD/MTD (ej. 6.266 kW).
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
   a) CLIENTE: Si el texto contiene el nombre del cliente (ej. 'Giovanni Gottardo' o 'Osia Moscoso'), dale prioridad absoluta en 'clientName'.
   b) PANELES FOTOVOLTAICOS:
      - Identifica el modelo y vatios (ej. 'Canadian 615w' -> 'Módulos Canadian Solar CS6.1-72TB-615 (615W)').
      - Identifica la cantidad: matchedPanelCount = 21 (o calcula según kWp: ej. 11000 / 615 = 18 paneles).
      - En 'matchedPanelId' coloca el id exacto del equipo en el catálogo provisto.
      - En 'matchedPanelModel' coloca el displayName del catálogo.
      - En 'matchedPanelWatts' coloca los vatios (ej. 615).
   c) INVERSORES:
      - Identifica el modelo y potencia (ej. '1 inversor lux power de 16 kw' o '1 weco 8 kw').
      - Si se solicitan 16 kW con Lux Power (equipos residenciales split-phase de 8 kW en RD), matchedInverterPowerKW = 8.0 y matchedInverterCount = 2.
      - En 'matchedInverterId' coloca el id del inversor en el catálogo.
      - En 'matchedInverterModel' coloca el displayName del inversor.
   d) BATERÍAS BESS (ALMACENAMIENTO):
      - Si se solicitan baterías (ej. '2 bateria hinaes de 16kw' o '2 bateria de 16k weco'):
        * hasBattery = true
        * matchedBatteryModel = modelo del catálogo (ej. 'Banco de Baterías de Litio HinaESS PowerGem Max 16.08kWh')
        * matchedBatteryId = id del catálogo
        * matchedBatteryCapacityKWh = 16.08 (o la capacidad nominal en kWh)
        * matchedBatteryCount = 2
      - Si no se mencionan baterías: hasBattery = false, matchedBatteryCount = 0.
   e) MARGEN DE VENTA COMERCIAL:
      - Si se especifica 'Porcentaje de venta 40%' o 'Venta 40%' -> targetMarginPct = 40.
   f) NOTAS Y RAZONAMIENTO:
      - 'specialTechnicalNotes': Requisitos especiales como 'Equipos según disponibilidad y diseñado para 40kwh diario'.
      - 'aiReasoningSummary': Resumen claro en español de cómo se interpretó la solicitud y qué equipos se seleccionaron.
   g) SÍNTESIS DE CONSUMO SIN FACTURA:
      - Si no se suministra factura pero el texto dice 'diseñado para 40kwh diario', genera 'monthlyConsumptionKWh' con 12 valores de Math.round(40 * 30.4) = 1216 kWh.
   h) REGLA CRÍTICA DE BREVEDAD Y CONCISIÓN (OBLIGATORIA):
      - Los campos de texto libre como 'specialTechnicalNotes', 'aiReasoningSummary' y 'notes' DEBEN SER MUY BREVES Y CONCISOS (máximo 1 o 2 oraciones, menos de 35 palabras cada uno).
      - ESTRICTAMENTE PROHIBIDO redactar tratados largos de ingeniería eléctrica, memorias de cálculo extensas, especificaciones redundantes o bucles repetitivos de texto.`;

const INVOICE_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    clientName: { type: 'STRING' },
    companyName: { type: 'STRING' },
    nic: { type: 'STRING' },
    nis: { type: 'STRING' },
    circuit: { type: 'STRING' },
    rnc: { type: 'STRING' },
    contractNumber: { type: 'STRING' },
    eNCF: { type: 'STRING' },
    address: { type: 'STRING' },
    province: { type: 'STRING' },
    municipality: { type: 'STRING' },
    phone: { type: 'STRING' },
    email: { type: 'STRING' },
    distributor: {
      type: 'STRING',
      enum: ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'],
    },
    tariffCode: { type: 'STRING' },
    energyCostPerKWhDOP: { type: 'NUMBER' },
    marginalRateDOP: { type: 'NUMBER' },
    fixedChargeDOP: { type: 'NUMBER' },
    peakDemandKW: { type: 'NUMBER' },
    demandCostPerKWDOP: { type: 'NUMBER' },
    meterNumber: { type: 'STRING' },
    voltagePhase: { type: 'STRING' },
    powerFactor: { type: 'NUMBER' },
    billingDays: { type: 'NUMBER' },
    totalBilledAmountDOP: { type: 'NUMBER' },
    totalWithoutSubsidyDOP: { type: 'NUMBER' },
    governmentSubsidyDOP: { type: 'NUMBER' },
    monthlyConsumptionKWh: {
      type: 'ARRAY',
      items: { type: 'NUMBER' },
    },
    annualConsumptionKWh: { type: 'NUMBER' },
    averageMonthlyKWh: { type: 'NUMBER' },
    currentBilledKWh: { type: 'NUMBER' },
    matchedPanelId: { type: 'STRING' },
    matchedPanelModel: { type: 'STRING' },
    matchedPanelWatts: { type: 'NUMBER' },
    matchedPanelCount: { type: 'NUMBER' },
    matchedInverterId: { type: 'STRING' },
    matchedInverterModel: { type: 'STRING' },
    matchedInverterPowerKW: { type: 'NUMBER' },
    matchedInverterCount: { type: 'NUMBER' },
    hasBattery: { type: 'BOOLEAN' },
    matchedBatteryId: { type: 'STRING' },
    matchedBatteryModel: { type: 'STRING' },
    matchedBatteryCapacityKWh: { type: 'NUMBER' },
    matchedBatteryCount: { type: 'NUMBER' },
    targetMarginPct: { type: 'NUMBER' },
    specialTechnicalNotes: { type: 'STRING' },
    aiReasoningSummary: { type: 'STRING' },
    confidenceScore: { type: 'NUMBER' },
    notes: { type: 'STRING' },
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

function httpsPostJson(url: string, data: any, timeoutMs = 50000): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(data);

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(new Error(`Respuesta de Google Gemini no es un JSON válido o fue truncada. Longitud: ${body.length}`));
            }
          } else {
            try {
              const errObj = JSON.parse(body);
              reject(new Error(errObj?.error?.message || `HTTP ${res.statusCode}: ${body}`));
            } catch {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Tiempo de espera agotado (timeout 50s) al conectar con la API de Google Gemini.'));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpsGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        } else {
          try {
            const errObj = JSON.parse(body);
            reject(new Error(errObj?.error?.message || `HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        }
      });
    }).on('error', reject);
  });
}

export function registerAIInvoiceHandlers() {
  ipcMain.handle('list-gemini-models', async (_event, apiKey: string) => {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API Key vacía.' };
    }
    try {
      const url = `${GEMINI_API_BASE}/models?key=${apiKey.trim()}`;
      const data = await httpsGetJson(url);
      const rawModels: any[] = Array.isArray(data?.models) ? data.models : [];
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

      return { success: true, models: filtered };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error consultando modelos disponibles.' };
    }
  });

  ipcMain.handle('validate-gemini-key', async (_event, apiKey: string, model: string = 'gemini-3.5-flash-lite') => {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API Key vacía.' };
    }
    try {
      // First try listing all models
      const listUrl = `${GEMINI_API_BASE}/models?key=${apiKey.trim()}`;
      const listData = await httpsGetJson(listUrl);
      const rawModels: any[] = Array.isArray(listData?.models) ? listData.models : [];
      const models = rawModels
        .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent') && !m.name?.includes('embedding'))
        .map((m: any) => {
          const cleanId = m.name?.replace('models/', '') || '';
          return {
            id: cleanId,
            name: m.displayName || cleanId,
            isRecommended: cleanId.includes('3.5-flash-lite') || cleanId === 'gemini-2.0-flash' || cleanId === 'gemini-3.6-flash',
          };
        });

      const matched = models.find((m) => m.id === model) || models[0];
      return { success: true, modelName: matched?.name || model, models };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error validando API Key' };
    }
  });

  ipcMain.handle('parse-invoice-with-ai', async (_event, payload: {
    fileBase64?: string;
    mimeType?: string;
    fileName?: string;
    apiKey?: string;
    model?: string;
    panelPowerW?: number;
    projectRequirementsText?: string;
    equipmentCatalog?: any[];
    dopExchangeRate?: number;
  }) => {
    try {
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
      } = payload;

      if (!apiKey || !apiKey.trim()) {
        return { success: false, error: 'No se configuró ninguna API Key de Google Gemini.' };
      }

      let cleanBase64 = fileBase64 || '';
      if (cleanBase64.includes('base64,')) {
        cleanBase64 = cleanBase64.split('base64,')[1];
      }

      // Preparar catálogo de referencia condensado con mejores precios para grounding
      const referenceCatalogCondensed = equipmentCatalog.map((e) => {
        const prices = e.supplierPrices || [];
        const bestSp = prices.length > 0 ? [...prices].sort((a: any, b: any) => a.priceUSD - b.priceUSD)[0] : undefined;
        return {
          id: e.id,
          type: e.type,
          brand: e.brand,
          displayName: e.displayName,
          modelSeries: e.modelSeries,
          powerW: e.powerW,
          powerKW: e.powerKW,
          capacityKWh: e.capacityKWh,
          bestPriceUSD: bestSp?.priceUSD,
          bestSupplierName: bestSp?.supplierName,
          supplierPriceId: bestSp?.id,
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
        promptIntro += `1. Si el texto indica nombre del cliente (ej. 'Giovanni Gottardo' o 'Osia Moscoso'), dale prioridad absoluta en 'clientName'.\n`;
        promptIntro += `2. Analiza los equipos solicitados (paneles, inversores, baterías) y emparéjalos con los IDs y modelos del CATÁLOGO DE REFERENCIA adjunto.\n`;
        promptIntro += `3. Si se especifica cantidad de paneles o kWp (ej. '21 panel' o '11 kwp paneles'), calcula o asigna la cantidad en 'matchedPanelCount'.\n`;
        promptIntro += `4. Si se especifica inversor (ej. '1 inversor lux power de 16 kw' o '1 weco 8 kw'), identifica el modelo, asigna en 'matchedInverterPowerKW' la potencia unitaria nominal (ej. 8.0 kW para Lux Power 8K) y en 'matchedInverterCount' la cantidad (ej. 2 unidades para 16 kW en paralelo).\n`;
        promptIntro += `5. Si se mencionan baterías (ej. '2 bateria hinaes de 16kw' o '2 bateria de 16k weco'), marca 'hasBattery' = true, empareja 'matchedBatteryModel' y 'matchedBatteryId', asigna 'matchedBatteryCapacityKWh' (ej. 16.08) y 'matchedBatteryCount' (ej. 2).\n`;
        promptIntro += `6. Si se menciona margen comercial (ej. 'Porcentaje de venta 40%' o 'Venta 40%'), asigna 'targetMarginPct' = 40.\n`;
        promptIntro += `7. Si no hay factura pero se menciona 'diseñado para X kwh diario', genera un consumo mensual de Math.round(X * 30.4) para los 12 meses.\n`;
        promptIntro += `8. En 'aiReasoningSummary', resume brevemente en español las decisiones tomadas para asistir al instalador.\n\n`;
      }

      if (referenceCatalogCondensed.length > 0) {
        promptIntro += `CATÁLOGO DE EQUIPOS DISPONIBLES EN EL SISTEMA (Para emparejar exactamente los IDs y modelos solicitados):\n`;
        promptIntro += `${JSON.stringify(referenceCatalogCondensed, null, 2)}\n\n`;
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

      const primaryModel = model?.trim() || 'gemini-2.0-flash';
      const candidateModels = Array.from(
        new Set([primaryModel, 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'])
      ).filter(Boolean);

      let rawText: string | undefined;
      let lastError: any = null;

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const currentModel = candidateModels[mIdx];
        const url = `${GEMINI_API_BASE}/models/${currentModel}:generateContent?key=${apiKey.trim()}`;
        const isThinkingModel = currentModel.includes('3.7') || currentModel.includes('2.5');

        const generationConfig: any = {
          temperature: 0.15,
          maxOutputTokens: 4096,
          response_mime_type: 'application/json',
          response_schema: INVOICE_JSON_SCHEMA,
        };
        if (isThinkingModel) {
          generationConfig.thinkingConfig = { thinkingBudget: 512 };
        }

        const reqBody = {
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

        try {
          const responseJson = await httpsPostJson(url, reqBody, 45000);
          rawText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[AIInvoiceHandler] Intento fallido con ${currentModel}:`, err?.message);
        }
      }

      if (!rawText) {
        return {
          success: false,
          error: lastError?.message || 'La IA no devolvió contenido estructurado o se agotó el tiempo de espera.',
        };
      }

      function safeParseJson(raw: string): any {
        let clean = raw.trim();
        if (clean.startsWith('```json')) {
          clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (clean.startsWith('```')) {
          clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        try {
          return JSON.parse(clean);
        } catch (err: any) {
          const lastBrace = clean.lastIndexOf('}');
          if (lastBrace > 0) {
            try {
              return JSON.parse(clean.slice(0, lastBrace + 1));
            } catch {
              // ignore
            }
          }
          throw new Error(`Error interpretando JSON de la IA: ${err?.message || 'Formato truncado'}`);
        }
      }

      const parsed = safeParseJson(rawText);
      const cleanName = (parsed.clientName || 'Cliente Propuesta Solar').replace(/\?/g, 'Ñ');

      // Normalize 12 months array
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

      const matchBrandFuzzy = (brandA?: string, brandB?: string) => {
        if (!brandA || !brandB) return false;
        const a = brandA.toLowerCase().replace(/[^a-z0-9]/g, '');
        const b = brandB.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (a === b) return true;
        if (a.includes(b) || b.includes(a)) return true;
        if (
          (a.includes('lux') && b.includes('lux')) ||
          (a.includes('weco') && b.includes('weco')) ||
          (a.includes('hina') && b.includes('hina')) ||
          (a.includes('canadian') && b.includes('canadian'))
        ) return true;
        return false;
      };

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
            const matchBrand = reqBrand ? matchBrandFuzzy(e.brand, reqBrand) || reqBrand.includes(e.brand.toLowerCase()) : true;
            return matchPower && matchBrand;
          }) || equipmentCatalog.find((e) => e.type === 'panel' && targetW > 0 && Math.abs((e.powerW || 0) - targetW) <= 15);
        }

        if (panMatch) {
          selectedPanelId = panMatch.id;
          selectedPanelModel = panMatch.displayName;
          selectedPanelWatts = panMatch.powerW || selectedPanelWatts;
        } else {
          selectedPanelModel = parsed.matchedPanelModel;
          selectedPanelWatts = parsed.matchedPanelWatts || selectedPanelWatts;
        }
      }

      const targetCoverage = 0.95;
      const targetAnnualSolarKWh = totalAnnual * targetCoverage;
      const specificYieldKWhPerKWp = 1450;
      const recommendedCapacityKWp = Math.round((targetAnnualSolarKWh / specificYieldKWhPerKWp) * 100) / 100;
      const recommendedPanelCount = Math.max(1, Math.ceil((recommendedCapacityKWp * 1000) / selectedPanelWatts));

      const finalPanelCount = parsed.matchedPanelCount && parsed.matchedPanelCount > 0
        ? parsed.matchedPanelCount
        : recommendedPanelCount;
      const finalCapacityKWp = Math.round(((finalPanelCount * selectedPanelWatts) / 1000) * 100) / 100;

      // Smart Inverter Matching con el Catálogo
      let selectedInverterId: string | undefined;
      let selectedInverterModel: string | undefined;
      let selectedInverterPowerKW: number | undefined;
      let selectedInverterCount: number | undefined;
      let selectedInverterUnitPriceUSD: number | undefined;

      if (parsed.matchedInverterId || parsed.matchedInverterModel || parsed.matchedInverterPowerKW) {
        let invMatch = equipmentCatalog.find(
          (e) => e.type === 'inverter' && (e.id === parsed.matchedInverterId || e.displayName === parsed.matchedInverterModel || e.modelSeries === parsed.matchedInverterModel)
        );
        if (!invMatch) {
          const reqInvStr = `${parsed.matchedInverterModel || ''} ${parsed.aiReasoningSummary || ''}`.toLowerCase();
          const targetKW = parsed.matchedInverterPowerKW || 8.0;
          invMatch = equipmentCatalog.find((e) => {
            if (e.type !== 'inverter') return false;
            const matchBrand = matchBrandFuzzy(e.brand, reqInvStr) || reqInvStr.includes(e.brand.toLowerCase());
            const matchPower = Math.abs((e.powerKW || 0) - targetKW) <= 1.0;
            return matchBrand && matchPower;
          }) || equipmentCatalog.find((e) => {
            if (e.type !== 'inverter') return false;
            return matchBrandFuzzy(e.brand, reqInvStr) || reqInvStr.includes(e.brand.toLowerCase());
          });
        }

        if (invMatch) {
          selectedInverterId = invMatch.id;
          selectedInverterModel = invMatch.displayName;
          selectedInverterPowerKW = invMatch.powerKW || parsed.matchedInverterPowerKW || 8.0;
        } else {
          selectedInverterModel = parsed.matchedInverterModel || 'Inversor Solar Híbrido';
          selectedInverterPowerKW = parsed.matchedInverterPowerKW || 8.0;
        }
        selectedInverterCount = parsed.matchedInverterCount || Math.max(1, Math.ceil(finalCapacityKWp / (selectedInverterPowerKW || 8.0)));
      }

      // Smart BESS Battery Storage Matching con el Catálogo
      let hasBattery = parsed.hasBattery === true;
      let selectedBatteryId: string | undefined;
      let selectedBatteryModel: string | undefined;
      let selectedBatteryCapacityKWh: number | undefined;
      let selectedBatteryCount: number | undefined;
      let selectedBatteryUnitPriceUSD: number | undefined;

      if (hasBattery || parsed.matchedBatteryId || parsed.matchedBatteryModel || (parsed.matchedBatteryCount && parsed.matchedBatteryCount > 0)) {
        hasBattery = true;
        let batMatch = equipmentCatalog.find(
          (e) => e.type === 'battery' && (e.id === parsed.matchedBatteryId || e.displayName === parsed.matchedBatteryModel || e.modelSeries === parsed.matchedBatteryModel)
        );
        if (!batMatch) {
          const reqBatStr = `${parsed.matchedBatteryModel || ''} ${parsed.aiReasoningSummary || ''}`.toLowerCase();
          const targetCap = parsed.matchedBatteryCapacityKWh || 16.08;
          batMatch = equipmentCatalog.find((e) => {
            if (e.type !== 'battery') return false;
            const matchBrand = matchBrandFuzzy(e.brand, reqBatStr) || reqBatStr.includes(e.brand.toLowerCase());
            const matchCap = Math.abs((e.capacityKWh || 0) - targetCap) <= 1.0;
            return matchBrand && matchCap;
          }) || equipmentCatalog.find((e) => {
            if (e.type !== 'battery') return false;
            return matchBrandFuzzy(e.brand, reqBatStr) || reqBatStr.includes(e.brand.toLowerCase());
          });
        }

        if (batMatch) {
          selectedBatteryId = batMatch.id;
          selectedBatteryModel = batMatch.displayName;
          selectedBatteryCapacityKWh = batMatch.capacityKWh || parsed.matchedBatteryCapacityKWh || 16.08;
        } else {
          selectedBatteryModel = parsed.matchedBatteryModel || 'Banco de Baterías de Litio LiFePO4';
          selectedBatteryCapacityKWh = parsed.matchedBatteryCapacityKWh || 16.08;
        }
        selectedBatteryCount = parsed.matchedBatteryCount || 1;
      }

      // Precios de proveedores y auto-pricing
      const selectedSupplierInfo: any = {};
      let autoSupplierPricing = false;

      if (selectedPanelId) {
        const pItem = equipmentCatalog.find((e) => e.id === selectedPanelId);
        if (pItem?.supplierPrices && pItem.supplierPrices.length > 0) {
          const best = [...pItem.supplierPrices].sort((a: any, b: any) => a.priceUSD - b.priceUSD)[0];
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
          const best = [...iItem.supplierPrices].sort((a: any, b: any) => a.priceUSD - b.priceUSD)[0];
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
          const best = [...bItem.supplierPrices].sort((a: any, b: any) => a.priceUSD - b.priceUSD)[0];
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

      const result = {
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
      };

      return { success: true, data: result };
    } catch (err: any) {
      console.error('Error parsing invoice with AI in main process:', err);
      return { success: false, error: err?.message || 'Error analizando factura con IA.' };
    }
  });
}
