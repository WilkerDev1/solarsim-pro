import { ExtractedDatasheetData, ExtractedEquipmentVariant, EquipmentType } from '../types/equipment';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const DATASHEET_EXTRACTION_SYSTEM_INSTRUCTION = `Eres un ingeniero eléctrico y fotovoltaico experto en análisis de fichas técnicas (datasheets) de fabricantes de equipos solares (paneles fotovoltaicos, inversores y baterías).
Tu objetivo es analizar minuciosamente el documento PDF o imagen del datasheet provisto y extraer de forma estructurada todas las variantes de potencia y especificaciones técnicas de la familia o serie de productos.

REGLAS DE EXTRACCIÓN CRÍTICAS:
1. DETECCIÓN DE TIPO DE EQUIPO:
   - "panel": Módulos / Paneles solares fotovoltaicos.
   - "inverter": Inversores solares (On-Grid / Red, Híbridos, Off-Grid, Microinversores).
   - "battery": Baterías / Sistemas de almacenamiento (Litio LiFePO4, Alto Voltaje, Bajo Voltaje).

2. MULTI-VARIANTE (MUY IMPORTANTE):
   - Una ficha técnica habitualmente describe 1 FAMILIA de modelos y presenta una TABLA ELÉCTRICA (STC / NOCT o Especificaciones DC/AC) con MÚLTIPLES VARIACIONES DE POTENCIA.
   - Debes IDENTIFICAR Y DESGLOSAR CADA VARIANTE DE POTENCIA COMO UN ELEMENTO SEPARADO en el array "variants".
   - Por ejemplo, si la ficha técnica es de "JA Solar JAM72S30 / MR" y la tabla tiene columnas para 535W, 540W, 545W, 550W, 555W:
     Debes generar 5 variantes individuales, cada una con su código de modelo exacto (ej. JAM72S30-545/MR) y su potencia en Watts (ej. 545).
   - Si la ficha técnica es de inversores "Solis S6-GR1P" con modelos de 2.5kW, 3kW, 3.6kW, 4.2kW, 5kW, 6kW:
     Debes generar cada variante individualmente con su potencia en kW (ej. 5.0).

3. CONSTRUCCIÓN DEL NOMBRE DISPLAY (displayName) ESTANDARIZADO:
   - Para PANELES: Formato estricto -> "Módulos [Marca/Modelo] ([Potencia]W)"
     Ejemplo: "Módulos JAM72S30-550/MR (550W)" o "Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)"
   - Para INVERSORES: Formato estricto -> "Inversor [Marca] [Modelo] ([Potencia]Kw)"
     Ejemplo: "Inversor SOLIS S6-GR1P5K 5K (5.0Kw)" o "Inversor Lux Power LXP-LB-US 8K (8.0Kw)"
   - Para BATERÍAS: Formato estricto -> "Batería [Marca] [Modelo] ([Capacidad]KWh)"
     Ejemplo: "Batería Hinaess 16 KwH-48 vdc."

4. PARÁMETROS TÉCNICOS ESPECÍFICOS:
   - Paneles:
     * powerW: Potencia máxima Pmax en STC (Watts, número).
     * efficiencyPct: Eficiencia del módulo en % (número, ej: 21.3).
     * tempCoeff: Coeficiente de temperatura de Pmax en %/°C (número negativo, ej: -0.35).
     * voc: Voltaje de circuito abierto Voc (V).
     * isc: Corriente de cortocircuito Isc (A).
     * vmp: Voltaje en Pmax Vmp (V).
     * imp: Corriente en Pmax Imp (A).
   - Inversores:
     * powerKW: Potencia nominal de salida AC en kW (número, ej: 5.0).
     * maxAcPowerKW: Potencia máxima aparente / activa AC (kW).
     * voltageMPPT: Rango de tensión MPPT (string, ej: "90-520V").
     * mpptCount: Cantidad de trackers MPPT (número entero).

RESPONDE EXCLUSIVAMENTE CON EL SIGUIENTE OBJETO JSON VÁLIDO (sin bloques de markdown ni texto adicional):
{
  "equipmentType": "panel" | "inverter" | "battery",
  "brand": string,
  "modelSeries": string,
  "documentTitle": string,
  "category": string,
  "specsSummary": string,
  "variants": [
    {
      "modelCode": string,
      "displayName": string,
      "powerW": number,
      "powerKW": number,
      "efficiencyPct": number,
      "tempCoeff": number,
      "voc": number,
      "isc": number,
      "vmp": number,
      "imp": number,
      "maxAcPowerKW": number,
      "voltageMPPT": string,
      "mpptCount": number
    }
  ]
}`;

export async function parseDatasheetWithGemini(
  fileBase64: string,
  mimeType: string,
  fileName: string,
  customApiKey?: string,
  customModel?: string
): Promise<ExtractedDatasheetData> {
  const apiKey = customApiKey?.trim() || (import.meta.env.VITE_GEMINI_API_KEY as string)?.trim();
  if (!apiKey) {
    throw new Error('No se ha configurado la API Key de Google Gemini. Ve a Ajustes ⚙️ > Inteligencia Artificial (IA) o al modal de IA para configurarla.');
  }

  // Normalizar base64
  let cleanBase64 = fileBase64;
  if (fileBase64.includes('base64,')) {
    cleanBase64 = fileBase64.split('base64,')[1];
  }

  const model = customModel?.trim() || 'gemini-2.0-flash';
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const promptText = `Por favor analiza esta ficha técnica / datasheet solar ("${fileName}") y extrae la información completa del fabricante, serie y todas las variantes de potencia siguiendo estrictamente las instrucciones del sistema y el formato JSON.`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: promptText,
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
    system_instruction: {
      parts: [
        {
          text: DATASHEET_EXTRACTION_SYSTEM_INSTRUCTION,
        },
      ],
    },
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      response_mime_type: 'application/json',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetail = errorText;
    try {
      const errJson = JSON.parse(errorText);
      errorDetail = errJson?.error?.message || errorText;
    } catch {
      // Ignorar parse error
    }
    throw new Error(`Error de Google Gemini (${response.status}): ${errorDetail}`);
  }

  const result = await response.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('La IA no devolvió contenido interpretable para este datasheet. Intenta con otra página o archivo.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch (e: any) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`No se pudo decodificar el formato JSON de la respuesta: ${e.message}`);
    }
  }

  // Normalizar y enriquecer variantes
  const equipmentType: EquipmentType = ['panel', 'inverter', 'battery'].includes(parsed.equipmentType)
    ? parsed.equipmentType
    : 'panel';
  const brand = parsed.brand || 'Fabricante Solar';
  const modelSeries = parsed.modelSeries || parsed.documentTitle || 'Serie';

  const rawVariants: any[] = Array.isArray(parsed.variants) && parsed.variants.length > 0
    ? parsed.variants
    : [parsed];

  const variants: ExtractedEquipmentVariant[] = rawVariants.map((v: any, index: number) => {
    const id = `var-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;
    const modelCode = v.modelCode || `${modelSeries}-${v.powerW || v.powerKW || index + 1}`;
    
    // Potencia y nombre estandarizado
    let powerW = v.powerW ? Number(v.powerW) : undefined;
    let powerKW = v.powerKW ? Number(v.powerKW) : undefined;

    if (equipmentType === 'panel') {
      if (!powerW && powerKW) powerW = Math.round(powerKW * 1000);
      if (!powerW) powerW = 550;
    } else if (equipmentType === 'inverter') {
      if (!powerKW && powerW) powerKW = Math.round((powerW / 1000) * 10) / 10;
      if (!powerKW) powerKW = 5.0;
    }

    let defaultDisplayName = v.displayName;
    if (!defaultDisplayName) {
      if (equipmentType === 'panel') {
        defaultDisplayName = `Módulos ${brand.toUpperCase()} ${modelCode} (${powerW}W)`;
      } else if (equipmentType === 'inverter') {
        defaultDisplayName = `Inversor ${brand.toUpperCase()} ${modelCode} (${powerKW}Kw)`;
      } else {
        defaultDisplayName = `Batería ${brand.toUpperCase()} ${modelCode}`;
      }
    }

    return {
      id,
      modelCode,
      displayName: defaultDisplayName,
      powerW,
      powerKW,
      efficiencyPct: v.efficiencyPct !== undefined ? Number(v.efficiencyPct) : (equipmentType === 'panel' ? 21.5 : undefined),
      tempCoeff: v.tempCoeff !== undefined ? Number(v.tempCoeff) : (equipmentType === 'panel' ? -0.35 : undefined),
      voc: v.voc !== undefined ? Number(v.voc) : undefined,
      isc: v.isc !== undefined ? Number(v.isc) : undefined,
      vmp: v.vmp !== undefined ? Number(v.vmp) : undefined,
      imp: v.imp !== undefined ? Number(v.imp) : undefined,
      maxAcPowerKW: v.maxAcPowerKW !== undefined ? Number(v.maxAcPowerKW) : undefined,
      voltageMPPT: v.voltageMPPT || undefined,
      mpptCount: v.mpptCount ? Number(v.mpptCount) : undefined,
      selected: true, // Seleccionado por defecto
    };
  });

  return {
    equipmentType,
    brand,
    modelSeries,
    documentTitle: parsed.documentTitle || `${brand} ${modelSeries}`,
    category: parsed.category || (equipmentType === 'panel' ? 'Monocristalino N-Type' : 'Inversor String / Híbrido'),
    specsSummary: parsed.specsSummary || undefined,
    variants,
  };
}
