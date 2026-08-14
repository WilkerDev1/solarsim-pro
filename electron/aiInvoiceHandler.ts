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
   - En 'notes', resume la extracción detallando distribuidora, NIC, tarifa y desglose.`;

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

function httpsPostJson(url: string, data: any): Promise<any> {
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
      },
      (res) => {
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
              reject(new Error(errObj?.error?.message || `HTTP ${res.statusCode}: ${body}`));
            } catch {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          }
        });
      }
    );

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
    fileBase64: string;
    mimeType: string;
    fileName: string;
    apiKey?: string;
    model?: string;
    panelPowerW?: number;
  }) => {
    try {
      const {
        fileBase64,
        mimeType,
        fileName,
        apiKey,
        model = 'gemini-2.0-flash',
        panelPowerW = 620,
      } = payload;

      if (!apiKey || !apiKey.trim()) {
        return { success: false, error: 'No se configuró ninguna API Key de Google Gemini.' };
      }

      let cleanBase64 = fileBase64;
      if (cleanBase64.includes('base64,')) {
        cleanBase64 = cleanBase64.split('base64,')[1];
      }

      const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey.trim()}`;
      const reqBody = {
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

      const responseJson = await httpsPostJson(url, reqBody);
      const rawText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        return { success: false, error: 'La IA no devolvió contenido estructurado.' };
      }

      const parsed = JSON.parse(rawText);
      const cleanName = (parsed.clientName || 'Cliente Factura EDE').replace(/\?/g, 'Ñ');

      // Normalize 12 months array
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

      const targetCoverage = 0.95;
      const targetAnnualSolarKWh = totalAnnual * targetCoverage;
      const specificYieldKWhPerKWp = 1450;
      const recommendedCapacityKWp = Math.round((targetAnnualSolarKWh / specificYieldKWhPerKWp) * 100) / 100;
      const panelWatts = panelPowerW > 0 ? panelPowerW : 620;
      const recommendedPanelCount = Math.max(1, Math.ceil((recommendedCapacityKWp * 1000) / panelWatts));

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
        recommendedCapacityKWp,
        recommendedPanelCount,
        targetCoveragePct: 95,
        confidenceScore: parsed.confidenceScore || 98,
        extractedFromFileName: fileName,
        aiNotes: parsed.notes || undefined,
      };

      return { success: true, data: result };
    } catch (err: any) {
      console.error('Error parsing invoice with AI in main process:', err);
      return { success: false, error: err?.message || 'Error analizando factura con IA.' };
    }
  });
}
