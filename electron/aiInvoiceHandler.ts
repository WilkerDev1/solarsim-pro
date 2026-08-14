import { ipcMain } from 'electron';
import https from 'https';

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
   - En 'notes', resume la extracción.`;

const INVOICE_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    clientName: { type: 'STRING' },
    companyName: { type: 'STRING' },
    nic: { type: 'STRING' },
    nis: { type: 'STRING' },
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

      return { success: true, data: result };
    } catch (err: any) {
      console.error('Error parsing invoice with AI in main process:', err);
      return { success: false, error: err?.message || 'Error analizando factura con IA.' };
    }
  });
}
