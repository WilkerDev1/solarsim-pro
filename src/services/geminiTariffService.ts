import { GlobalTariffMatrix, UtilityDistributor, TariffCode, UtilityTariffDetails, DistributorTariffSchedule } from '../types/tariffs';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Modelos candidatos en cascada para tolerancia a fallos
const FALLBACK_MODELS_CASCADE = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TARIFF_EXTRACTION_SYSTEM_INSTRUCTION = `Eres un economista y perito regulatorio eléctrico de la República Dominicana, experto en pliegos tarifarios de la Superintendencia de Electricidad (SIE) y concesionarias privadas como CEPM (Consorcio Energético Punta Cana - Macao).

Tu labor es analizar el documento oficial provisto (resolución de la SIE, pliego tarifario mensual, pliego de transición, o tarifario comercial de CEPM) y estructurar con precisión matemática los cargos por energía, potencia y cargos fijos aplicables a las distribuidoras:
1. EDEESTE (Empresa Distribuidora de Electricidad del Este, S.A.)
2. EDESUR (Empresa Distribuidora de Electricidad del Sur, S.A.)
3. EDENORTE (Empresa Distribuidora de Electricidad del Norte, S.A.)
4. CEPM (Consorcio Energético Punta Cana - Macao, S.A. / Bayahíbe)

REGLAS CRÍTICAS DE ESTRUCTURA TARIFARIA DOMINICANA:
1. TARIFAS RESIDENCIALES EN BAJA TENSIÓN (BTS1):
   - Estructura escalonada por bloques de consumo mensual (en DOP):
     * Bloque 1: 0 a 200 kWh (ej: ~6.17 DOP/kWh)
     * Bloque 2: 201 a 300 kWh (ej: ~8.71 DOP/kWh)
     * Bloque 3: 301 a 700 kWh (ej: ~13.04 DOP/kWh)
     * Bloque 4: >700 kWh (ej: ~13.04 DOP/kWh o tarifa no subsidiada)
   - Cargo fijo mensual de cliente (fixedChargeDOP, ej: ~127.83 DOP).
   - Moneda: DOP para EDEs, USD o DOP para CEPM.

2. TARIFAS COMERCIALES MONÓMICAS (BTS2):
   - Tarifa de energía plana base (baseEnergyRateDOP, ej: ~12.80 DOP/kWh).
   - Cargo fijo mensual (fixedChargeDOP, ej: ~210.15 DOP).

3. TARIFAS CON MEDICIÓN DE DEMANDA DE POTENCIA (BTD, MTD1, MTD2):
   - BTD (Baja Tensión con Demanda >10kW): baseEnergyRateDOP (ej: ~9.02 DOP/kWh) + demandChargePerKWDOP (ej: ~650.00 DOP/kW-mes).
   - MTD1 (Media Tensión con Demanda 12.47kV a 34.5kV): baseEnergyRateDOP (ej: ~8.45 DOP/kWh) + demandChargePerKWDOP (ej: ~590.00 DOP/kW-mes).
   - MTD2 (Media Tensión con Demanda Horaria): peakEnergyRateDOP, offPeakEnergyRateDOP + demandChargePerKWDOP.

4. CONCESIÓN PRIVADA CEPM (Punta Cana / Bávaro / Bayahíbe):
   - Habitualmente cotizada en USD o su equivalente en DOP (ej: BTS1 ~$0.225 USD/kWh, BTS2 ~$0.245 USD/kWh, BTD ~$0.195 USD/kWh + $14.50 USD/kW).

5. RETENCIÓN OFICIAL MEDICIÓN NETA (SIE-007):
   - Inyección de excedentes fotovoltaicos retiene un 25.0% oficial (netMeteringRetentionPct: 25.0).

RESPONDE EXCLUSIVAMENTE CON EL SIGUIENTE OBJETO JSON VÁLIDO (sin bloques markdown adicionales ni texto fuera del JSON):
{
  "resolutionCode": "SIE-XXX-XXXX-TF",
  "effectiveDate": "YYYY-MM-DD",
  "publishedBy": "Superintendencia de Electricidad (SIE) o CEPM",
  "notes": "Resumen conciso del pliego tarifario extraído",
  "schedules": {
    "EDEESTE": {
      "distributor": "EDEESTE",
      "fullName": "Empresa Distribuidora de Electricidad del Este, S.A.",
      "region": "Santo Domingo Este, Boca Chica, San Pedro, La Romana, Hato Mayor, El Seibo, Monte Plata",
      "concessionType": "INTERCONECTADO_SENI",
      "tariffs": {
        "BTS1": {
          "code": "BTS1",
          "name": "BTS1 (Residencial Monómica <10kW)",
          "description": "Tarifa residencial en baja tensión con escalones progresivos de consumo.",
          "currency": "DOP",
          "baseEnergyRateDOP": 11.85,
          "fixedChargeDOP": 127.83,
          "blocks": [
            { "minKWh": 0, "maxKWh": 200, "rateDOP": 6.17 },
            { "minKWh": 201, "maxKWh": 300, "rateDOP": 8.71 },
            { "minKWh": 301, "maxKWh": 700, "rateDOP": 13.04 },
            { "minKWh": 701, "maxKWh": 999999, "rateDOP": 13.04 }
          ],
          "netMeteringRetentionPct": 25.0
        },
        "BTS2": {
          "code": "BTS2",
          "name": "BTS2 (Comercial Simple <10kW)",
          "description": "Tarifa comercial simple en baja tensión sin medición de potencia.",
          "currency": "DOP",
          "baseEnergyRateDOP": 12.80,
          "fixedChargeDOP": 210.15,
          "netMeteringRetentionPct": 25.0
        },
        "BTD": {
          "code": "BTD",
          "name": "BTD (Baja Tensión con Demanda >10kW)",
          "description": "Suministro en baja tensión con cargo por potencia de demanda.",
          "currency": "DOP",
          "baseEnergyRateDOP": 9.02,
          "fixedChargeDOP": 450.00,
          "demandChargePerKWDOP": 650.00,
          "netMeteringRetentionPct": 25.0
        },
        "MTD1": {
          "code": "MTD1",
          "name": "MTD1 (Media Tensión con Demanda)",
          "description": "Suministro en media tensión con cargo por potencia.",
          "currency": "DOP",
          "baseEnergyRateDOP": 8.45,
          "fixedChargeDOP": 950.00,
          "demandChargePerKWDOP": 590.00,
          "netMeteringRetentionPct": 25.0
        }
      }
    },
    "EDESUR": { "...": "Misma estructura para EDESUR" },
    "EDENORTE": { "...": "Misma estructura para EDENORTE" },
    "CEPM": { "...": "Misma estructura para CEPM (incluyendo baseEnergyRateUSD y demandChargePerKWUSD)" }
  }
}`;

export interface ExtractTariffResolutionParams {
  fileBase64: string;
  mimeType: string;
  userPromptNotes?: string;
  apiKey: string;
  preferredModel?: string;
}

export class GeminiTariffService {
  /**
   * Extrae la matriz tarifaria completa desde una resolución o pliego tarifario (PDF o Imagen).
   */
  static async extractTariffMatrixFromDocument(
    params: ExtractTariffResolutionParams
  ): Promise<GlobalTariffMatrix> {
    const { fileBase64, mimeType, userPromptNotes, apiKey, preferredModel } = params;

    if (!apiKey) {
      throw new Error('Se requiere una clave API de Google Gemini para procesar pliegos tarifarios.');
    }

    const modelsToTry = preferredModel
      ? [preferredModel, ...FALLBACK_MODELS_CASCADE.filter((m) => m !== preferredModel)]
      : FALLBACK_MODELS_CASCADE;

    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const result = await this.callGeminiModel(model, apiKey, fileBase64, mimeType, userPromptNotes);
        if (result && result.schedules) {
          return this.sanitizeAndMergeTariffMatrix(result);
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[GeminiTariffService] Intento fallido con modelo ${model}:`, err.message);
        await sleep(1000);
      }
    }

    throw new Error(
      lastError?.message || 'No se pudo extraer el pliego tarifario del documento tras consultar los modelos de IA disponibles.'
    );
  }

  private static async callGeminiModel(
    model: string,
    apiKey: string,
    fileBase64: string,
    mimeType: string,
    userPromptNotes?: string
  ): Promise<any> {
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

    const promptText = userPromptNotes
      ? `Analiza este pliego tarifario / resolución oficial. Consideraciones adicionales del usuario: "${userPromptNotes}". Extrae las tarifas de todas las distribuidoras indicadas.`
      : `Analiza este documento oficial de pliego tarifario y extrae con precisión todas las tarifas para EDEESTE, EDESUR, EDENORTE y CEPM.`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'application/pdf',
                data: fileBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: TARIFF_EXTRACTION_SYSTEM_INSTRUCTION,
          },
        ],
      },
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('Respuesta vacía recibida de la API de Gemini.');
    }

    // Limpiar markdown residual si existiera
    const cleanedText = candidateText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    return JSON.parse(cleanedText);
  }

  /**
   * Sanitiza y fusiona los datos extraídos con la matriz base predeterminada
   * para garantizar que ningún campo o distribuidora quede indefinido.
   */
  public static sanitizeAndMergeTariffMatrix(rawExtracted: any): GlobalTariffMatrix {
    const base = DEFAULT_RD_TARIFF_MATRIX;

    const resolutionCode = (rawExtracted.resolutionCode || base.resolutionCode || 'SIE-VIGENTE').trim();
    const effectiveDate = (rawExtracted.effectiveDate || base.effectiveDate || new Date().toISOString().split('T')[0]).trim();
    const publishedBy = (rawExtracted.publishedBy || base.publishedBy || 'Superintendencia de Electricidad (SIE)').trim();
    const notes = (rawExtracted.notes || base.notes || '').trim();

    const mergedSchedules: Record<UtilityDistributor, DistributorTariffSchedule> = { ...base.schedules };

    const distributors: UtilityDistributor[] = ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'];

    for (const dist of distributors) {
      const extractedDist = rawExtracted.schedules?.[dist];
      if (extractedDist && extractedDist.tariffs) {
        const baseTariffs = base.schedules[dist]?.tariffs || {};
        const updatedTariffs: Record<string, UtilityTariffDetails> = { ...baseTariffs };

        for (const [code, details] of Object.entries(extractedDist.tariffs as Record<string, any>)) {
          if (!details) continue;

          const baseDetail = baseTariffs[code] || {
            code: code as TariffCode,
            name: `${code} ${dist}`,
            description: `Tarifa ${code} para ${dist}`,
            currency: dist === 'CEPM' ? 'USD' : 'DOP',
            baseEnergyRateDOP: 11.0,
            fixedChargeDOP: 150.0,
            netMeteringRetentionPct: 25.0,
          };

          const sanitizedBlocks = Array.isArray(details.blocks) && details.blocks.length > 0
            ? details.blocks.map((b: any) => ({
                minKWh: typeof b.minKWh === 'number' ? b.minKWh : 0,
                maxKWh: typeof b.maxKWh === 'number' && b.maxKWh < 999999 ? b.maxKWh : Infinity,
                rateDOP: typeof b.rateDOP === 'number' ? b.rateDOP : 11.0,
              }))
            : baseDetail.blocks;

          updatedTariffs[code] = {
            ...baseDetail,
            ...details,
            code: (code || baseDetail.code) as TariffCode,
            currency: (details.currency || baseDetail.currency) as 'DOP' | 'USD',
            baseEnergyRateDOP: typeof details.baseEnergyRateDOP === 'number' ? details.baseEnergyRateDOP : baseDetail.baseEnergyRateDOP,
            baseEnergyRateUSD: typeof details.baseEnergyRateUSD === 'number' ? details.baseEnergyRateUSD : baseDetail.baseEnergyRateUSD,
            fixedChargeDOP: typeof details.fixedChargeDOP === 'number' ? details.fixedChargeDOP : baseDetail.fixedChargeDOP,
            fixedChargeUSD: typeof details.fixedChargeUSD === 'number' ? details.fixedChargeUSD : baseDetail.fixedChargeUSD,
            demandChargePerKWDOP: typeof details.demandChargePerKWDOP === 'number' ? details.demandChargePerKWDOP : baseDetail.demandChargePerKWDOP,
            demandChargePerKWUSD: typeof details.demandChargePerKWUSD === 'number' ? details.demandChargePerKWUSD : baseDetail.demandChargePerKWUSD,
            peakEnergyRateDOP: typeof details.peakEnergyRateDOP === 'number' ? details.peakEnergyRateDOP : baseDetail.peakEnergyRateDOP,
            offPeakEnergyRateDOP: typeof details.offPeakEnergyRateDOP === 'number' ? details.offPeakEnergyRateDOP : baseDetail.offPeakEnergyRateDOP,
            netMeteringRetentionPct: typeof details.netMeteringRetentionPct === 'number' ? details.netMeteringRetentionPct : 25.0,
            blocks: sanitizedBlocks,
          };
        }

        mergedSchedules[dist] = {
          ...base.schedules[dist],
          ...extractedDist,
          distributor: dist,
          tariffs: updatedTariffs,
        };
      }
    }

    return {
      resolutionCode,
      effectiveDate,
      lastUpdatedAt: new Date().toISOString(),
      publishedBy,
      notes,
      schedules: mergedSchedules,
    };
  }
}
