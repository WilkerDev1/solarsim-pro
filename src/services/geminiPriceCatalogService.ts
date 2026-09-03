import {
  ExtractedPriceCatalogResult,
  ExtractedPriceCatalogItem,
  SolarEquipmentItem,
  EquipmentType,
} from '../types/equipment';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Modelos candidatos en cascada para tolerancia a fallos y alta demanda (503/429)
const FALLBACK_MODELS_CASCADE = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PRICE_CATALOG_SYSTEM_INSTRUCTION = `Eres un auditor comercial e ingeniero fotovoltaico de élite especializado en compras, cotizaciones y listas de precios de distribuidores de equipos solares (paneles fotovoltaicos, inversores y baterías BESS).

Tu misión es analizar minuciosamente el documento provisto (lista de precios, catálogo con precios, cotización o factura de proveedor) y extraer estructuradamente cada equipo con su precio unitario, asociándolo inteligentemente con los equipos del catálogo de referencia existente.

REGLAS DE EXTRACCIÓN Y COMPARACIÓN (MATCHING):
1. IDENTIFICACIÓN DEL PROVEEDOR ("detectedSupplierName"):
   - Busca en el membrete, logo, encabezado, pie de página o firma el nombre de la empresa distribuidora o suplidor (ej: "Enersys RD", "RAAS Solar", "Fersan", "Distribuidora Eléctrica", "Growatt RD", etc.).
   - Si el usuario especificó un proveedor sugerido, dale prioridad o úsalo como valor por defecto si el documento no tiene membrete claro.

2. DETECCIÓN DE MONEDA ("currencyDetected"):
   - Detecta si los precios están expresados en Dólares Estadounidenses ("USD") o Pesos Dominicanos ("DOP").
   - Si están en DOP, indica "DOP" y convierte a "priceUSD" usando la tasa de cambio provista.

3. EXTRACCIÓN DE EQUIPOS Y PRECIOS:
   - Filtra exclusivamente equipos solares relevantes:
     * "panel": Módulos solares fotovoltaicos.
     * "inverter": Inversores On-grid, Híbridos, Off-grid o Microinversores.
     * "battery": Baterías de litio LiFePO4, BESS o bancos de almacenamiento.
   - Extrae el precio unitario neto de compra (antes de ITBIS o impuestos, ya que la Ley 57-07 exonera el ITBIS a equipos solares).
   - Extrae SKU, código de artículo o notas especiales (ej: "Precio por pallet", "En stock", "Sobre pedido").

4. COMPARACIÓN INTELIGENTE (SMART FUZZY MATCHING):
   - Se te provee una lista resumida de equipos existentes en el catálogo de referencia del usuario con su ID, marca, modelo y potencia.
   - Los proveedores frecuentemente escriben los nombres con ligeras variaciones (ej: "Canadian 615W Bifacial TOPCon" en lugar de "Módulos Canadian Solar CS6.1-72TB-615 (615W)" o "Luxpower 12K Híbrido" en lugar de "Inversor LuxpowerTek LXP-LB-US 12k").
   - Evalúa la similitud técnica (Marca + Tipo + Potencia en W/kW/kWh + Serie).
   - Si encuentras un equipo coincidente en el catálogo de referencia con alta certeza (>= 0.70):
     * "matchedEquipmentId": ID del equipo en el catálogo.
     * "matchedDisplayName": displayName del equipo en el catálogo.
     * "matchConfidence": número entre 0.0 y 1.0 (ej: 0.95).
     * "action": "update_price".
   - Si el equipo del documento NO existe en el catálogo de referencia actual:
     * "matchedEquipmentId": null.
     * "matchedDisplayName": null.
     * "matchConfidence": 0.0.
     * "action": "create_new".

RESPONDE EXCLUSIVAMENTE CON UN OBJETO JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA (sin bloques de markdown ni texto extra):
{
  "detectedSupplierName": string,
  "documentDate": string,
  "documentTitle": string,
  "currencyDetected": "USD" | "DOP",
  "items": [
    {
      "extractedModelName": string,
      "brand": string,
      "equipmentType": "panel" | "inverter" | "battery",
      "priceUSD": number,
      "originalCurrency": "USD" | "DOP",
      "originalPrice": number,
      "sku": string,
      "notes": string,
      "matchedEquipmentId": string | null,
      "matchedDisplayName": string | null,
      "matchConfidence": number,
      "action": "update_price" | "create_new" | "ignore"
    }
  ]
}`;

export interface ScanPriceCatalogOptions {
  fileBase64: string;
  mimeType: string;
  fileName: string;
  apiKey: string;
  customModel?: string;
  manualSupplierName?: string;
  currentCatalog: SolarEquipmentItem[];
  dopExchangeRate?: number;
  onProgress?: (status: string) => void;
}

export class GeminiPriceCatalogService {
  static async scanAndMatchPriceCatalog(options: ScanPriceCatalogOptions): Promise<ExtractedPriceCatalogResult> {
    const {
      fileBase64,
      mimeType,
      fileName,
      apiKey,
      customModel,
      manualSupplierName,
      currentCatalog,
      dopExchangeRate = 60.0,
      onProgress,
    } = options;

    if (!apiKey) {
      throw new Error('No se ha configurado la clave API de Google Gemini en Ajustes.');
    }

    // Normalizar base64
    let cleanBase64 = fileBase64;
    if (fileBase64.includes('base64,')) {
      cleanBase64 = fileBase64.split('base64,')[1];
    }

    const primaryModel = customModel?.trim() || 'gemini-2.0-flash';
    const candidateModels = Array.from(new Set([primaryModel, ...FALLBACK_MODELS_CASCADE])).filter(Boolean);

    // Preparar catálogo de referencia condensado para el prompt
    const referenceCatalogCondensed = currentCatalog.map((e) => ({
      id: e.id,
      type: e.type,
      brand: e.brand,
      displayName: e.displayName,
      modelSeries: e.modelSeries,
      powerW: e.powerW,
      powerKW: e.powerKW,
      capacityKWh: e.capacityKWh,
    }));

    const promptText = `Por favor analiza esta lista de precios / catálogo comercial de equipos fotovoltaicos ("${fileName}").
${manualSupplierName ? `PROVEEDOR DECLARADO POR EL USUARIO: "${manualSupplierName}". Si el documento no especifica otro suplidor claramente, asigna este proveedor.` : ''}
TASA DE CAMBIO DE REFERENCIA: 1 USD = ${dopExchangeRate} DOP. (Si los precios están en DOP, conviértelos a USD dividiendo entre ${dopExchangeRate}).

CATÁLOGO DE REFERENCIA EXISTENTE EN EL SISTEMA (Para comparar y vincular coincidencias):
${JSON.stringify(referenceCatalogCondensed, null, 2)}

Extrae todos los modelos de paneles, inversores y baterías con sus precios unitarios de compra, y vincula cada modelo extraído con el ID del catálogo existente según corresponda.`;

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
            text: PRICE_CATALOG_SYSTEM_INSTRUCTION,
          },
        ],
      },
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        response_mime_type: 'application/json',
      },
    };

    let lastError: any = null;

    // Probar modelos en cascada
    for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
      const currentModel = candidateModels[mIdx];
      const url = `${GEMINI_API_BASE}/models/${currentModel}:generateContent?key=${apiKey}`;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (mIdx > 0 || attempt > 1) {
            onProgress?.(
              attempt > 1
                ? `Reintentando con ${currentModel} (intento ${attempt}/2)...`
                : `Conectando con modelo de respaldo ${currentModel}...`
            );
          } else {
            onProgress?.(`Analizando lista de precios con ${currentModel}...`);
          }

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          if (response.ok) {
            const result = await response.json();
            const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!rawText) {
              throw new Error('La IA no devolvió contenido interpretable para esta lista de precios.');
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

            const supplierName =
              manualSupplierName?.trim() ||
              parsed.detectedSupplierName ||
              'Proveedor Fotovoltaico';

            const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : [];

            const items: ExtractedPriceCatalogItem[] = rawItems.map((raw, idx) => {
              const eqType: EquipmentType = ['panel', 'inverter', 'battery'].includes(raw.equipmentType)
                ? raw.equipmentType
                : 'panel';

              // Fallback match local si la IA no vinculó pero hay coincidencia exacta de ID o displayName
              let matchedId = raw.matchedEquipmentId || undefined;
              let matchedName = raw.matchedDisplayName || undefined;
              let confidence = typeof raw.matchConfidence === 'number' ? raw.matchConfidence : 0;

              if (!matchedId) {
                const exactMatch = currentCatalog.find(
                  (c) =>
                    c.type === eqType &&
                    (c.displayName.toLowerCase().includes(raw.extractedModelName.toLowerCase()) ||
                      raw.extractedModelName.toLowerCase().includes(c.displayName.toLowerCase()) ||
                      (raw.sku && c.modelSeries.toLowerCase().includes(raw.sku.toLowerCase())))
                );
                if (exactMatch) {
                  matchedId = exactMatch.id;
                  matchedName = exactMatch.displayName;
                  confidence = 0.85;
                }
              }

              const priceUSD = typeof raw.priceUSD === 'number' && !isNaN(raw.priceUSD) && raw.priceUSD > 0
                ? Math.round(raw.priceUSD * 100) / 100
                : raw.originalPrice && raw.originalCurrency === 'DOP'
                ? Math.round((raw.originalPrice / dopExchangeRate) * 100) / 100
                : 0;

              return {
                id: `extracted-${idx}-${Date.now()}`,
                extractedModelName: raw.extractedModelName || `Equipo #${idx + 1}`,
                brand: raw.brand || 'Fabricante',
                equipmentType: eqType,
                priceUSD,
                originalCurrency: raw.originalCurrency || 'USD',
                originalPrice: raw.originalPrice || priceUSD,
                sku: raw.sku || undefined,
                notes: raw.notes || undefined,
                matchedEquipmentId: matchedId,
                matchedDisplayName: matchedName,
                matchConfidence: confidence,
                action: matchedId ? 'update_price' : 'create_new',
                selected: true, // Seleccionado por defecto para aplicar
              };
            });

            return {
              detectedSupplierName: supplierName,
              documentDate: parsed.documentDate || new Date().toISOString().split('T')[0],
              documentTitle: parsed.documentTitle || fileName,
              currencyDetected: parsed.currencyDetected || 'USD',
              items,
            };
          }

          if (response.status === 429 || response.status === 503) {
            lastError = new Error(`Servicio de Google Gemini ocupado temporalmente (${response.status})`);
            await sleep(1500 * attempt);
            continue;
          }

          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody?.error?.message || `Error HTTP ${response.status} en la API de Gemini`);
        } catch (err: any) {
          lastError = err;
          if (attempt === 2) break;
        }
      }
    }

    throw lastError || new Error('No se pudo procesar la lista de precios con los modelos disponibles.');
  }
}
