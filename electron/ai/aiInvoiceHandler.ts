import { ipcMain } from 'electron';
import { INVOICE_EXTRACTION_SYSTEM_INSTRUCTION } from './prompts';
import { INVOICE_JSON_SCHEMA } from './schema';
import { httpsPostJson, httpsGetJson } from './httpClient';
import { processExtractedInvoice } from './invoiceExtractor';
import { AIInvoicePayload } from './types';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Modelos predeterminados de la Familia 3 y alta disponibilidad
const FAMILY_3_FALLBACK_CASCADE = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

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
          const isFamily3 = cleanId.includes('3.7') || cleanId.includes('3.6') || cleanId.includes('3.5') || cleanId.includes('3.8');
          const isFlashLite = cleanId.includes('flash-lite') || cleanId.includes('3.5-flash-lite');
          const isFlash = cleanId.includes('flash');
          return {
            id: cleanId,
            name: displayName,
            description: m.description || `Modelo ${displayName} disponible en tu cuenta.`,
            rateLimitNote: isFlashLite ? '15 RPM / 500 RPD' : isFlash ? '5-15 RPM' : undefined,
            isRecommended: cleanId === 'gemini-3.7-flash' || cleanId === 'gemini-3.6-flash' || cleanId === 'gemini-3.5-flash-lite',
          };
        });

      return { success: true, models: filtered };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error consultando modelos disponibles.' };
    }
  });

  ipcMain.handle('validate-gemini-key', async (_event, apiKey: string, model: string = 'gemini-3.7-flash') => {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: 'API Key vacía.' };
    }
    try {
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
            isRecommended: cleanId === 'gemini-3.7-flash' || cleanId === 'gemini-3.6-flash' || cleanId === 'gemini-3.5-flash-lite',
          };
        });

      const matched = models.find((m) => m.id === model) || models[0];
      return { success: true, modelName: matched?.name || model, models };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error validando API Key' };
    }
  });

  ipcMain.handle('parse-invoice-with-ai', async (_event, payload: AIInvoicePayload) => {
    try {
      const {
        fileBase64,
        mimeType,
        fileName,
        apiKey,
        model = 'gemini-3.7-flash',
        projectRequirementsText,
        equipmentCatalog = [],
        dopExchangeRate = 60.0,
        includeBattery = false,
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
        promptIntro += `9. Si no hay factura pero se menciona consumo energético (ej. '40kwh diario' o '900kw mensuales de consumo' / '1000 kwh/mes'), genera 'monthlyConsumptionKWh' con 12 valores de ese consumo mensual. NUNCA confundas '900kw mensuales de consumo' con potencia fotovoltaica en kWp.\n`;
        promptIntro += `10. CONCISIÓN OBLIGATORIA: 'specialTechnicalNotes', 'aiReasoningSummary' y 'notes' deben ser muy breves (< 350 caracteres). NUNCA listes ni repitas el catálogo dentro de ellos.\n\n`;
      } else {
        promptIntro += `GROUNDING DETERMINISTA OBLIGATORIO CON EL CATÁLOGO OFICIAL:\n`;
        promptIntro += `1. Para los módulos solares, selecciona un panel del CATÁLOGO DE REFERENCIA (ej. Canadian Solar 615W/620W) y asígnalo en 'matchedPanelId', 'matchedPanelModel' y 'matchedPanelWatts'.\n`;
        promptIntro += `2. Para el inversor, DEBES seleccionar un inversor real del CATÁLOGO DE REFERENCIA (ej. Luxpower LXP-LB-US 8k) con su ID exacto en 'matchedInverterId', su displayName en 'matchedInverterModel' y su potencia nominal en 'matchedInverterPowerKW'. PROHIBIDO responder con nombres genéricos como 'Inversor Solar Híbrido'.\n`;
        if (includeBattery) {
          promptIntro += `3. SISTEMA HÍBRIDO BESS: El usuario requiere almacenamiento por baterías. Marca 'hasBattery' = true, selecciona una batería de litio LiFePO4 del CATÁLOGO DE REFERENCIA (ej. HinaESS PowerGem Max 16.08kWh) y asígnala en 'matchedBatteryId', 'matchedBatteryModel', 'matchedBatteryCapacityKWh' y 'matchedBatteryCount' = 1.\n`;
        } else {
          promptIntro += `3. Si no se solicitan baterías explícitamente, fija 'hasBattery' = false y 'matchedBatteryCount' = 0.\n`;
        }
        promptIntro += `\n`;
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

      // El usuario puede elegir gemini-3.8-flash-high u otro: lo respetamos y lo probamos primero.
      const requestedModel = model?.trim() || 'gemini-3.7-flash';
      
      // Cascada de modelos candidatos priorizando Familia 3
      const candidateModels = Array.from(
        new Set([
          requestedModel,
          ...FAMILY_3_FALLBACK_CASCADE,
        ])
      );

      let rawText: string | undefined;
      let lastError: any = null;
      let successfulModel = requestedModel;
      const rejectedAttempts: Array<{ model: string; error: string }> = [];

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const currentModel = candidateModels[mIdx];
        const url = `${GEMINI_API_BASE}/models/${currentModel}:generateContent?key=${apiKey.trim()}`;
        const isThinkingModel = currentModel.includes('thinking') || currentModel.includes('3.7');

        const generationConfig: any = {
          temperature: 0.2,
          maxOutputTokens: 8192,
          response_mime_type: 'application/json',
          response_schema: INVOICE_JSON_SCHEMA,
        };
        if (isThinkingModel) {
          generationConfig.thinkingConfig = { thinkingBudget: 2048 };
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
            successfulModel = currentModel;
            break;
          }
        } catch (err: any) {
          lastError = err;
          rejectedAttempts.push({ model: currentModel, error: err?.message || String(err) });
          console.warn(`[AIInvoiceHandler] Intento fallido con ${currentModel}:`, err?.message);
        }
      }

      if (!rawText) {
        const modelsTriedStr = candidateModels.join(', ');
        return {
          success: false,
          error: `Google AI rechazó las peticiones con los modelos probados (${modelsTriedStr}). Último error: ${lastError?.message || 'Sin capacidad en los servidores de Google'}. Por favor selecciona otro modelo en Ajustes > Integraciones IA.`,
        };
      }

      // Si el modelo exitoso es diferente al solicitado por el usuario (ej. 3.8 tenía 503 y se usó 3.7)
      let modelWarning: string | undefined;
      if (successfulModel !== requestedModel) {
        const initialRejection = rejectedAttempts.find((a) => a.model === requestedModel);
        const reason = initialRejection ? initialRejection.error : 'Sobrecarga o falta de capacidad en servidores de Google (Error 503)';
        modelWarning = `Google reportó saturación en el modelo solicitado "${requestedModel}" (${reason}). Tu propuesta se procesó exitosamente con el modelo de respaldo "${successfulModel}". Puedes ajustar tu modelo en Configuración si esto persiste.`;
        console.info(`[AIInvoiceHandler] Fallback activado: ${modelWarning}`);
      }

      const result = processExtractedInvoice(rawText, payload, {
        modelUsed: successfulModel,
        requestedModel,
        modelWarning,
      });

      return { success: true, data: result };
    } catch (err: any) {
      console.error('Error parsing invoice with AI in main process:', err);
      return { success: false, error: err?.message || 'Error analizando factura con IA.' };
    }
  });
}
