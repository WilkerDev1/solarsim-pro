import { ipcMain } from 'electron';
import https from 'https';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const INVOICE_EXTRACTION_SYSTEM_INSTRUCTION = `Eres un auditor e ingeniero experto en análisis de facturas eléctricas de la República Dominicana (EDES: EDEESTE, EDESUR, EDENORTE y CEPM).
Tu objetivo es analizar minuciosamente la imagen o documento PDF de la factura eléctrica provista y extraer de forma estructurada y con máxima precisión los datos comerciales, técnicos y el historial completo de consumo energético (kWh) de los 12 meses del año (Enero a Diciembre).

INSTRUCCIONES CLAVE DE EXTRACCIÓN PARA REPÚBLICA DOMINICANA:
1. DISTRIBUIDORA: Identifica el logo o texto de la empresa:
   - "EDEESTE" (Empresa Distribuidora de Electricidad del Este)
   - "EDESUR" (Empresa Distribuidora de Electricidad del Sur)
   - "EDENORTE" (Empresa Distribuidora de Electricidad del Norte)
   - "CEPM" (Consorcio Energético Punta Cana - Macao)
2. TARIFA: Identifica el código tarifario oficial (ejemplos: BTS-1 o BTS1 residencial, BTS-2 o BTS2 comercial baja tensión, MTD media tensión con demanda, BTD, etc.). Normalízalo a "BTS1", "BTS2", "MTD", "BTD" u otro.
3. DATOS DEL CLIENTE:
   - Nombre o Razón Social del titular de la cuenta.
   - NIC (Número de Identificación de Contrato o Número de Cliente).
   - RNC o Cédula si figura en el documento.
   - Dirección de suministro completa y provincia (ej. Santo Domingo, Distrito Nacional, Santiago, La Altagracia, San Cristóbal, etc.).
4. HISTORIAL DE CONSUMO (12 MESES: ENERO A DICIEMBRE EN kWh):
   - En las facturas dominicanas siempre existe una sección "Historial de Consumo", "Gráfica de Consumos Anteriores" o una tabla con los últimos 12 meses.
   - Debes mapear los valores de kWh a los 12 meses cronológicos del año natural (Ene=0, Feb=1, Mar=2, Abr=3, May=4, Jun=5, Jul=6, Ago=7, Sep=8, Oct=9, Nov=10, Dic=11).
   - Si falta algún mes específico o no es legible, interpola el valor usando el promedio para que el vector siempre tenga exactamente 12 números válidos mayores a 0.
5. SUMA Y PROMEDIO:
   - Calcula el total anual de kWh (suma de los 12 meses) y el promedio mensual.
6. NOTAS Y CONFIANZA:
   - Asigna un puntaje de confianza (confidenceScore de 0 a 100).`;

const INVOICE_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    clientName: { type: 'STRING' },
    companyName: { type: 'STRING' },
    nic: { type: 'STRING' },
    rnc: { type: 'STRING' },
    contractNumber: { type: 'STRING' },
    address: { type: 'STRING' },
    province: { type: 'STRING' },
    phone: { type: 'STRING' },
    email: { type: 'STRING' },
    distributor: {
      type: 'STRING',
      enum: ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'],
    },
    tariffCode: { type: 'STRING' },
    energyCostPerKWhDOP: { type: 'NUMBER' },
    meterNumber: { type: 'STRING' },
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
  ipcMain.handle('validate-gemini-key', async (_event, apiKey: string) => {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API Key vacía.' };
    }
    try {
      const url = `${GEMINI_API_BASE}/models/gemini-2.0-flash?key=${apiKey.trim()}`;
      const data = await httpsGetJson(url);
      return { success: true, modelName: data?.displayName || 'Gemini 2.0 Flash' };
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

      const responseJson = await httpsPostJson(url, reqBody);
      const rawText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        return { success: false, error: 'La IA no devolvió contenido estructurado.' };
      }

      const parsed = JSON.parse(rawText);

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

      return { success: true, data: result };
    } catch (err: any) {
      console.error('Error parsing invoice with AI in main process:', err);
      return { success: false, error: err?.message || 'Error analizando factura con IA.' };
    }
  });
}
