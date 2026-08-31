import { ExtractedDatasheetData, ExtractedEquipmentVariant, EquipmentType } from '../types/equipment';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const DATASHEET_EXTRACTION_SYSTEM_INSTRUCTION = `Eres un ingeniero eléctrico y fotovoltaico de élite, experto en análisis de fichas técnicas (datasheets) de fabricantes de equipos solares y almacenamiento (paneles fotovoltaicos, inversores y baterías BESS).
Tu objetivo es analizar minuciosamente el documento PDF o imagen provisto y extraer de forma estructurada todas las variantes de modelos y especificaciones técnicas de la familia o serie de productos.

REGLAS DE EXTRACCIÓN CRÍTICAS:
1. DETECCIÓN DE TIPO DE EQUIPO ("equipmentType"):
   - "panel": Módulos / Paneles solares fotovoltaicos (Monocristalino, Bifacial TOPCon, PERC, Heterounión HJT).
   - "inverter": Inversores solares (On-Grid / Conexión a red, Híbridos Split Phase, Off-Grid, Microinversores).
   - "battery": Baterías / Sistemas de almacenamiento de energía BESS (LiFePO4 / LFP, Módulos 48V/51.2V, Gabinetes de Alto Voltaje HV).

2. MULTI-VARIANTE (MUY IMPORTANTE):
   - Una ficha técnica habitualmente describe 1 FAMILIA de modelos y presenta una TABLA ELÉCTRICA (STC / NOCT o Especificaciones DC/AC o Batería) con MÚLTIPLES VARIACIONES DE POTENCIA O CAPACIDAD.
   - Debes IDENTIFICAR Y DESGLOSAR CADA VARIANTE COMO UN ELEMENTO INDIVIDUAL en el array "variants".
   - Ejemplos:
     * Para paneles "Canadian Solar TOPBiHiKu6 CS6.1-72TB": generar variantes individuales para 590W, 595W, 600W, 605W, 610W y 615W.
     * Para inversores "LuxpowerTek LXP-LB-US 8-10k": generar variantes para "LXP-LB-US 8k" (8.0 kW) y "LXP-LB-US 10k" (10.0 kW).
     * Para baterías "HinaESS PowerGem": generar cada modelo con su capacidad en kWh (ej. PowerGem Max 16.08kWh, PowerGem Plus 14.34kWh).

3. CONSTRUCCIÓN DEL NOMBRE DISPLAY (displayName) ESTANDARIZADO:
   - Para PANELES: Formato estricto -> "Módulos [Marca] [Modelo] ([Potencia]W)"
     Ejemplo: "Módulos Canadian Solar CS6.1-72TB-600 (600W)" o "Módulos JA Solar JAM72S30-550/MR (550W)"
   - Para INVERSORES: Formato estricto -> "Inversor [Marca] [Modelo] ([Potencia]Kw)"
     Ejemplo: "Inversor LuxpowerTek LXP-LB-US 8k (8.0Kw)" o "Inversor SOLIS S6-GR1P5K 5K (5.0Kw)"
   - Para BATERÍAS: Formato estricto -> "Batería [Marca] [Modelo] ([Capacidad]kWh)"
     Ejemplo: "Batería HinaESS PowerGem Max (16.08kWh)" o "Batería Dyness Powerbox Pro (10.24kWh)"

4. PARÁMETROS TÉCNICOS ESPECÍFICOS SEGÚN EL TIPO:
   - Paneles:
     * powerW: Potencia máxima nominal Pmax en STC (Watts, número ej: 600).
     * efficiencyPct: Eficiencia del módulo en % (número ej: 22.2).
     * tempCoeff: Coeficiente de temperatura de Pmax en %/°C (número negativo ej: -0.29).
     * annualDegradation: Degradación lineal anual garantizada en % (número ej: 0.4).
     * voc: Voltaje de circuito abierto Voc (V ej: 51.8).
     * isc: Corriente de cortocircuito Isc (A ej: 14.60).
     * vmp: Voltaje en Pmax Vmp (V ej: 44.0).
     * imp: Corriente en Pmax Imp (A ej: 13.64).
   - Inversores:
     * powerKW: Potencia nominal de salida AC en kW (número ej: 8.0).
     * maxAcPowerKW: Potencia máxima aparente / activa AC (kW ej: 8.0).
     * maxPvPowerKW: Potencia máxima de entrada DC fotovoltaica (kW ej: 12.0).
     * maxEfficiencyPct: Eficiencia máxima en % (número ej: 97.5).
     * voltageMPPT: Rango de tensión MPPT (string ej: "120-500V").
     * mpptCount: Cantidad de seguidores MPPT (número entero ej: 2).
   - Baterías (Almacenamiento):
     * capacityKWh: Capacidad nominal o energía utilizable en kWh (número ej: 16.08).
     * capacityAh: Capacidad en Amperios-hora (número ej: 314).
     * voltageV: Voltaje nominal de la batería en V (número ej: 51.2 o 48).
     * dodPct: Profundidad de descarga recomendada / DoD en % (número ej: 90 o 95).
     * batteryEfficiencyPct: Eficiencia de carga/descarga en % (número ej: 95).
     * cycles: Ciclos de vida garantizados (número ej: 8000 o 6000).
     * chemistry: Química de celdas (string ej: "LFP (LiFePO4)").
     * maxChargeCurrentA: Corriente máxima de carga continua (A ej: 165).

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
      "annualDegradation": number,
      "voc": number,
      "isc": number,
      "vmp": number,
      "imp": number,
      "maxAcPowerKW": number,
      "maxPvPowerKW": number,
      "maxEfficiencyPct": number,
      "voltageMPPT": string,
      "mpptCount": number,
      "capacityKWh": number,
      "capacityAh": number,
      "voltageV": number,
      "dodPct": number,
      "batteryEfficiencyPct": number,
      "cycles": number,
      "chemistry": string,
      "maxChargeCurrentA": number,
      "dimensions": string,
      "weightKg": number
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
    throw new Error('No se ha configurado la API Key de Google Gemini. Ve a Ajustes ⚙️ > Inteligencia Artificial (IA) para configurarla.');
  }

  // Normalizar base64
  let cleanBase64 = fileBase64;
  if (fileBase64.includes('base64,')) {
    cleanBase64 = fileBase64.split('base64,')[1];
  }

  const model = customModel?.trim() || 'gemini-2.0-flash';
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const promptText = `Por favor analiza esta ficha técnica / datasheet ("${fileName}") y extrae la información completa del fabricante, serie y todas las variantes de modelos y potencia/capacidad siguiendo estrictamente las instrucciones del sistema y el formato JSON.`;

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
    const modelCode = v.modelCode || `${modelSeries}-${v.powerW || v.powerKW || v.capacityKWh || index + 1}`;
    
    // Potencia y nombre estandarizado
    let powerW = v.powerW ? Number(v.powerW) : undefined;
    let powerKW = v.powerKW ? Number(v.powerKW) : undefined;
    let capacityKWh = v.capacityKWh ? Number(v.capacityKWh) : undefined;

    if (equipmentType === 'panel') {
      if (!powerW && powerKW) powerW = Math.round(powerKW * 1000);
      if (!powerW) powerW = 550;
    } else if (equipmentType === 'inverter') {
      if (!powerKW && powerW) powerKW = Math.round((powerW / 1000) * 10) / 10;
      if (!powerKW) powerKW = 5.0;
    } else if (equipmentType === 'battery') {
      if (!capacityKWh && v.capacityAh && v.voltageV) {
        capacityKWh = Math.round(((Number(v.capacityAh) * Number(v.voltageV)) / 1000) * 100) / 100;
      }
      if (!capacityKWh) capacityKWh = 10.0;
    }

    let defaultDisplayName = v.displayName;
    if (!defaultDisplayName) {
      if (equipmentType === 'panel') {
        defaultDisplayName = `Módulos ${brand} ${modelCode} (${powerW}W)`;
      } else if (equipmentType === 'inverter') {
        defaultDisplayName = `Inversor ${brand} ${modelCode} (${powerKW}Kw)`;
      } else {
        defaultDisplayName = `Batería ${brand} ${modelCode} (${capacityKWh}kWh)`;
      }
    }

    return {
      id,
      modelCode,
      displayName: defaultDisplayName,
      powerW,
      powerKW,
      capacityKWh,
      capacityAh: v.capacityAh ? Number(v.capacityAh) : undefined,
      voltageV: v.voltageV ? Number(v.voltageV) : (equipmentType === 'battery' ? 51.2 : undefined),
      dodPct: v.dodPct !== undefined ? Number(v.dodPct) : (equipmentType === 'battery' ? 90 : undefined),
      batteryEfficiencyPct: v.batteryEfficiencyPct !== undefined ? Number(v.batteryEfficiencyPct) : (equipmentType === 'battery' ? 95 : undefined),
      cycles: v.cycles ? Number(v.cycles) : (equipmentType === 'battery' ? 8000 : undefined),
      chemistry: v.chemistry || (equipmentType === 'battery' ? 'LFP (LiFePO4)' : undefined),
      maxChargeCurrentA: v.maxChargeCurrentA ? Number(v.maxChargeCurrentA) : undefined,
      efficiencyPct: v.efficiencyPct !== undefined ? Number(v.efficiencyPct) : (equipmentType === 'panel' ? 22.0 : undefined),
      tempCoeff: v.tempCoeff !== undefined ? Number(v.tempCoeff) : (equipmentType === 'panel' ? -0.29 : undefined),
      annualDegradation: v.annualDegradation !== undefined ? Number(v.annualDegradation) : (equipmentType === 'panel' ? 0.4 : undefined),
      voc: v.voc !== undefined ? Number(v.voc) : undefined,
      isc: v.isc !== undefined ? Number(v.isc) : undefined,
      vmp: v.vmp !== undefined ? Number(v.vmp) : undefined,
      imp: v.imp !== undefined ? Number(v.imp) : undefined,
      maxAcPowerKW: v.maxAcPowerKW !== undefined ? Number(v.maxAcPowerKW) : undefined,
      maxPvPowerKW: v.maxPvPowerKW !== undefined ? Number(v.maxPvPowerKW) : undefined,
      maxEfficiencyPct: v.maxEfficiencyPct !== undefined ? Number(v.maxEfficiencyPct) : undefined,
      voltageMPPT: v.voltageMPPT || undefined,
      mpptCount: v.mpptCount ? Number(v.mpptCount) : undefined,
      dimensions: v.dimensions || undefined,
      weightKg: v.weightKg ? Number(v.weightKg) : undefined,
      selected: true, // Seleccionado por defecto para guardado masivo
    };
  });

  let defaultCategory = 'Módulos Fotovoltaicos';
  if (equipmentType === 'inverter') defaultCategory = 'Inversor Híbrido / String';
  if (equipmentType === 'battery') defaultCategory = 'Batería de Litio LiFePO4';

  return {
    equipmentType,
    brand,
    modelSeries,
    documentTitle: parsed.documentTitle || `${brand} ${modelSeries}`,
    category: parsed.category || defaultCategory,
    specsSummary: parsed.specsSummary || undefined,
    variants,
  };
}
