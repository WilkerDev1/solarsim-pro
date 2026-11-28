/**
 * Encendido del asistente flotante (F3b, ADR 0010). Puro.
 *
 * Hoy `appAssistantEnabled` es `false` de fábrica y se guarda SIEMPRE (serializeSimulationStore), así que en cada
 * instalación ese `false` ya está escrito: cambiar el valor de fábrica no enciende a nadie, y un `false` guardado no dice si
 * el usuario lo apagó o nunca lo tocó. Por eso:
 *
 * - Desde F3b el interruptor de Ajustes registra la elección (`appAssistantEnabledChosenByUser`), y la marca
 *   `appAssistantDefaultsVersion` dice que la migración ya corrió en esta instalación.
 * - Con `APP_ASSISTANT_ON_BY_DEFAULT` encendida, la migración enciende UNA vez a quien nunca eligió (lo ausente o el `false`
 *   heredado) y estampa la marca; después de la marca, o con una elección registrada, manda lo guardado (un apagado cuenta).
 * - Con la bandera apagada (F3b) se comporta como siempre (solo `true` enciende) y NO estampa la marca, para que la
 *   migración corra cuando la bandera se encienda.
 *
 * La bandera sigue apagada en F3b a propósito: encender el asistente antes de F4 (bucle nuevo) y F5b (panel) expondría a
 * todos al asistente de hoy, a medias. La enciende F4/F5b, junto con su registro en `shared/applicationFeatures.ts` (M6).
 */

/** La enciende F4/F5b. Mientras sea `false`, nadie se enciende solo. */
export const APP_ASSISTANT_ON_BY_DEFAULT = false;
/** Versión de la migración del encendido; la marca guardada `appAssistantDefaultsVersion` la iguala al correr. */
export const APP_ASSISTANT_DEFAULTS_VERSION = 1;

export interface AppAssistantEnablement {
  appAssistantEnabled: boolean;
  appAssistantEnabledChosenByUser: boolean;
  appAssistantDefaultsVersion: number;
}

export function migrateAppAssistantEnabled(
  stored: { appAssistantEnabled?: unknown; appAssistantEnabledChosenByUser?: unknown; appAssistantDefaultsVersion?: unknown },
  options: { onByDefault?: boolean } = {},
): AppAssistantEnablement {
  const enabled = stored.appAssistantEnabled === true;
  const chosenByUser = stored.appAssistantEnabledChosenByUser === true;
  const rawVersion = stored.appAssistantDefaultsVersion;
  const version = typeof rawVersion === 'number' && Number.isInteger(rawVersion) && rawVersion > 0 ? rawVersion : 0;
  const onByDefault = options.onByDefault ?? APP_ASSISTANT_ON_BY_DEFAULT;
  if (!onByDefault || version >= APP_ASSISTANT_DEFAULTS_VERSION || chosenByUser)
    return { appAssistantEnabled: enabled, appAssistantEnabledChosenByUser: chosenByUser, appAssistantDefaultsVersion: onByDefault ? Math.max(version, APP_ASSISTANT_DEFAULTS_VERSION) : version };
  // Nunca eligió y la migración no ha corrido: se enciende una sola vez.
  return { appAssistantEnabled: true, appAssistantEnabledChosenByUser: false, appAssistantDefaultsVersion: APP_ASSISTANT_DEFAULTS_VERSION };
}
