// Herramientas de agente sobre registros de precio (ADR 0006 §6). Solo lectura: el historial se pide al servidor
// con la sesión actual y se le suma lo pendiente del usuario; nunca se guarda localmente.
import { PRICE_HISTORY_TOOL_LIMITS, agentPriceHistory } from '../../../shared/agentTools/priceHistory';
import { effectiveGenericPrice, priceFeatureActive } from '../../store/slices/equipmentPriceSlice';
import { SyncService } from '../../services/syncService';
import { mergePriceHistory } from '../equipmentPrices/priceHistory';
import { findVisibleEquipment, store, type NativeHandler } from './nativeTools';

const getPriceHistory: NativeHandler = async (args) => {
  const s = store();
  const { serverUrl, authToken } = s.syncSettings;
  if (!priceFeatureActive(s) || !authToken) throw new Error('El historial de precios requiere una sesión iniciada con el servidor.');
  const item = findVisibleEquipment(String(args.equipmentId));
  const limit = Number.isInteger(args.limit) ? Number(args.limit) : PRICE_HISTORY_TOOL_LIMITS.defaultLimit;
  const result = await SyncService.fetchPriceHistory(serverUrl, authToken, item.id, { limit });
  if (result.status === 'unsupported') throw new Error('El historial de precios no está disponible en este servidor.');
  if (result.status === 'error') throw new Error(`No se pudo leer el historial de precios: ${result.error}`);
  const fresh = store();
  return {
    data: agentPriceHistory({
      equipmentId: item.id,
      equipmentName: item.displayName,
      records: mergePriceHistory(result.observations, fresh, item.id),
      generic: effectiveGenericPrice(fresh, item.id),
      hasMore: result.nextBefore !== null,
    }),
  };
};

export const PRICE_TOOL_HANDLERS: Record<string, NativeHandler> = {
  get_price_history: getPriceHistory,
};
