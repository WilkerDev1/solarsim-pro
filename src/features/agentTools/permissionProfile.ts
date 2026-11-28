/**
 * Perfil de permisos por superficie (F3b, [ADR 0010](../../../docs/adr/0010-perfil-edicion-en-vivo.md)). Puro: sin store.
 *
 * Los kinds (`read`, `draft`, `guarded`) NO cambian: son propiedad de la declaración compartida con el MCP local y el remoto,
 * y un kind nuevo haría que electron/mcp descartara la lista entera. Encima de ellos, esta capa decide por superficie:
 *
 * - Asistente de la app (`app-assistant`) con el perfil `live-edit` (el de fábrica): lo que ocurre DENTRO de una propuesta
 *   y tiene deshacer (`scope: 'proposal'`: campos, equipos, precios, margen, descuentos y extras de `edit_proposal`, y su
 *   deshacer) se aplica al momento, con diff y deshacer, sin tarjeta de confirmación.
 * - Todo lo demás, en cualquier superficie, sigue la política de hoy: lo compartido o sin deshacer (catálogo, ofertas y
 *   precios genéricos, clientes, estado y decisión comercial, papelera, borrados, compartir) pide confirmación salvo el modo
 *   sin confirmación explícito (bypass), que nunca salta lo que no se deshace.
 * - Agentes externos (`mcp`) y el asistente de propuestas (`proposal-assistant`) nunca leen el perfil.
 *
 * La política del dispositivo manda sobre el perfil: «Bloquear» bloquea y «Pedir confirmación» en borradores confirma.
 * Los permisos de la cuenta, la papelera, los conflictos y lo que oculta la organización NO se deciden aquí: los revalida
 * cada plan al aplicarse y al deshacerse (`requireEditableProject`, `canWriteNow`, las reglas de la transacción).
 */
import type { AgentSource, AgentToolKind } from '../../../shared/agentTools/types';
import type { AgentPolicy } from '../../store/slices/agentSlice';

/** `proposal`: solo dentro de una propuesta y con deshacer. `shared`: cualquier otra cosa (la de siempre). */
export type AgentToolScope = 'proposal' | 'shared';
export type AgentPermissionDecision = 'apply' | 'confirm' | 'deny';

export interface AgentPermissionRequest {
  source: AgentSource;
  /** Kind EFECTIVO: un lote que toca precios ya llega como `guarded`. */
  kind: AgentToolKind;
  scope: AgentToolScope;
  /** `false` para lo que la actividad no puede deshacer (BYPASS_EXEMPT_TOOLS): nunca se aplica sin confirmación. */
  undoable: boolean;
}

/** ¿Aplica la edición en vivo a esta petición? Solo el asistente de la app, con el perfil, dentro de una propuesta. */
export function liveEditApplies(policy: AgentPolicy, request: AgentPermissionRequest): boolean {
  return request.source === 'app-assistant' && policy.appAssistantProfile === 'live-edit' && request.scope === 'proposal' && request.undoable;
}

/** La decisión: aplicar ya, encolar para confirmación o rechazar. */
export function decideAgentToolPermission(policy: AgentPolicy, request: AgentPermissionRequest): AgentPermissionDecision {
  const levels = policy[request.source === 'mcp' ? 'external' : 'internal'];
  if (levels[request.kind] === 'deny') return 'deny';
  if (request.kind === 'read') return 'apply';
  if (liveEditApplies(policy, request)) {
    // Dentro de una propuesta el cambio se trata como un borrador (diff y deshacer): manda el nivel de borradores.
    if (levels.draft === 'deny') return 'deny';
    return levels.draft === 'allow' ? 'apply' : 'confirm';
  }
  if (request.kind === 'draft') {
    if (levels.draft === 'allow') return 'apply';
    // En el asistente de propuestas el usuario ya revisó y pulsó «Aplicar»: ese clic es la confirmación.
    return request.source === 'proposal-assistant' && levels.draft === 'confirm' ? 'apply' : 'confirm';
  }
  // Protegida: solo el modo sin confirmación explícito la aplica, y nunca lo que no se puede deshacer.
  return levels.guarded === 'allow' && request.undoable ? 'apply' : 'confirm';
}
