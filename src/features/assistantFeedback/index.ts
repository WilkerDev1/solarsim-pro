/**
 * Feedback en vivo del asistente (F5a): lo que F5b monta en el panel nuevo.
 *
 * - Tarjeta de cambio: `ChangeCard` (presentación) + `changeCardInputFromResponse` (de la respuesta de una herramienta o del
 *   evento `tool_call_finished` a la entrada de la tarjeta; `null` = no hay tarjeta) + `buildChangeCardView` / `formatFieldValue`
 *   (formateo puro).
 * - Resaltado del dock: no hay nada que montar. Se dispara solo cuando `commitProjectEdits` recibe `source: 'assistant'`
 *   (`dockHighlightStore.publish`); `publishAssistantHighlight` es para lo que no pasa por un lote por ruta (p. ej. destacar
 *   las secciones que llenó una propuesta recién creada).
 * - Anclas: `anchorForPath` (src/domain/fieldAnchors.ts) dice dónde se ve cada ruta del registro.
 */
import { dockHighlightStore } from '../../store/dockHighlightStore';
import type { HighlightedChange } from '../../domain/dockHighlight';

export { ChangeCard, type ChangeCardProps } from './ChangeCard';
export {
  CARD_MAX_ROWS, buildChangeCardView, changeCardInputFromResponse, formatFieldValue,
  type ChangeCardInput, type ChangeCardStatus, type ChangeCardView, type ChangeRowView, type ResultsView,
} from './changeCardModel';
export { anchorForPath, type FieldAnchor } from '../../domain/fieldAnchors';
export { dockHighlightStore } from '../../store/dockHighlightStore';
export { HIGHLIGHT_TTL_MS, type HighlightedChange } from '../../domain/dockHighlight';

/** Destaca en el dock lo que cambió fuera de un lote por ruta (el diff de una creación, de un deshacer del asistente…). */
export const publishAssistantHighlight = (projectId: string, changes: readonly HighlightedChange[]): void => dockHighlightStore.publish(projectId, changes);
