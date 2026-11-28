# ADR 0010: Perfil «edición en vivo» del asistente de la app

Estado: aceptado (F3b del asistente único). Continúa el [conjunto del asistente de la app](../AGENT_TOOLS.md#conjunto-del-asistente-de-la-app-f3a) (F3a) y los ADR [0004](0004-edicion-de-proyecto.md) (edición de proyecto y transacción) y [0009](0009-fabrica-unica-dimensionado-y-propuesta-incompleta.md) (fábrica única y propuesta incompleta). Términos en el [glosario](../../GLOSSARY.md).

## Contexto

Hasta F3a, toda edición de una propuesta que tocara precios (equipos con su precio, margen, extras, descuentos) se trataba entera como `guarded` y, con la política por defecto, esperaba un clic de confirmación, viniera de donde viniera. La decisión del dueño nº 4 del plan fue la contraria para el asistente de la app: margen, descuentos y extras dentro de una propuesta «que se apliquen en vivo y con el destacado»; confirmación solo para lo compartido o sin deshacer.

La revisión del plan (bloqueo B4) descartó las dos formas directas de hacerlo:

- **Cambiar el kind o `touchesPricing`.** El kind es una propiedad de la declaración compartida por el asistente y el MCP local; `touchesPricing` se aplica a todas las fuentes. Los agentes externos (Claude Desktop, Codex…) también editarían precios sin confirmación.
- **Un kind nuevo.** electron/mcp descarta la lista entera ante un kind desconocido.

Además, lo guardado no distingue un `guarded: 'confirm'` de fábrica de uno elegido por el usuario: no se puede reinterpretar ese nivel.

## Decisión

### 1. Una capa de política por superficie, en un solo módulo puro

Los kinds (`read`, `draft`, `guarded`) y `touchesPricing` no cambian. `decideAgentToolPermission` (`src/features/agentTools/permissionProfile.ts`, sin store) decide para cada plan nativo, con la política del dispositivo y el **alcance** del plan:

- `scope: 'proposal'`: el plan solo cambia una propuesta y tiene deshacer. Hoy lo declaran `edit_proposal` (salvo que escriba a mano el costo de un equipo, ver §3) y el `undo_change` cuyos objetivos son **todos** cambios de `edit_proposal` (lista blanca `PROPOSAL_SCOPED_TOOLS` en `handlers.ts`) y ninguno manda a la papelera ni restaura (`toolset.ts`). Deshacer el estado técnico, la decisión comercial, una creación o cualquier herramienta compartida es `shared`: lo que se confirmó al hacerlo se confirma al deshacerlo.
- `scope: 'shared'`: todo lo demás (lo de siempre).

Con el perfil `live-edit` y la fuente `app-assistant`, un plan `proposal` se decide como un borrador aunque su kind efectivo sea `guarded`: se aplica al momento (con «Borradores: aplicar sin preguntar», el valor de fábrica; o, si el kind efectivo es `guarded`, con el bypass explícito de cambios sensibles, para que «en vivo» no sea más estricto que «confirmar» mientras los borradores no estén bloqueados), con su diff por ruta, un paso del diario de deshacer y su entrada de actividad. La actividad conserva el kind efectivo (`guarded`), así se sigue sabiendo que fue un cambio de precios.

La única excepción a esa regla es deliberada: con «Bloquear» en borradores, un plan `proposal` se rechaza con `live-edit` aunque con el perfil `confirm` se aplicaría (bypass de sensibles) o quedaría pendiente. «Bloquear» es la decisión más fuerte del dispositivo y el perfil no la salta (§3); lo fija `testAssistantLiveEditProfile`.

El perfil es un campo nuevo y persistido de la política, `agentPolicy.appAssistantProfile` (`'live-edit' | 'confirm'`). Lo guardado sin el campo es `live-edit`; solo un `confirm` explícito lo apaga. Ninguna otra fuente lo lee.

### 2. Qué se aplica en vivo y qué se confirma

| Operación | Asistente de la app (perfil `live-edit`) | Agentes externos (MCP local; el remoto no expone `guarded`) |
| --- | --- | --- |
| Campos de la propuesta sin precio (consumo, tarifa, cobertura, cliente…) | En vivo | En vivo (borrador, como hoy) |
| Equipos del catálogo con su precio, «ponle baterías», mejor proveedor, margen, extras y descuentos (`edit_proposal`) | **En vivo**, con diff y deshacer | Confirmación (como hoy) |
| Tasa de cambio de la cotización (`specs.dopExchangeRate`) y mano de obra (`specs.installationUnitPriceUSD`) | En vivo (parámetros comerciales que dicta el usuario, ver §3) | Confirmación (como hoy) |
| Costo de un equipo escrito a mano (`set` de `specs.<grupo>[i].unitPriceUSD`, `priceSource`, el grupo entero o `specs.batteryCostUSD`) | Confirmación (el lote entero) | Confirmación |
| Modelo o magnitud de un equipo con precio (`set` de `specs.<grupo>[i].brandModel`, `powerW`, `powerKW` o `capacityKWh`) | Confirmación (el lote entero) | Confirmación |
| Deshacer cambios de `edit_proposal` (`undo_change`) | En vivo | — (no lo declaran) |
| Deshacer el estado técnico, la decisión comercial, una creación u otra herramienta compartida | Confirmación | — |
| `propose_project_update` con precios | Confirmación (camino antiguo, hasta F4) | Confirmación (sin cambios) |
| Catálogo, ofertas y precios genéricos compartidos | Confirmación | Confirmación |
| Estado técnico, decisión y reportes comerciales | Confirmación | Confirmación |
| Papelera (también deshacer una creación), borrados, plantilla de empresa | Confirmación | Confirmación |
| Clientes del directorio | Como hoy: crear y enlazar son borradores; borrar, confirmación | Igual |

«Confirmación» admite el modo sin confirmación (bypass) explícito de siempre, que nunca salta lo que no se puede deshacer (`BYPASS_EXEMPT_TOOLS`).

### 3. Lo que se conserva

- **La política del dispositivo manda sobre el perfil.** «Bloquear» en borradores o en cambios sensibles bloquea también lo que iría en vivo; «Pedir confirmación» en borradores confirma.
- **Permisos de la cuenta, papelera y conflictos en solo lectura**: cada plan los revalida al aplicarse (`requireEditableProject`, `canWriteNow`) y al deshacerse; en vivo no hay atajo.
- **No inventar precios**: en vivo solo van los precios que resuelve la transacción (oferta del proveedor o genérico señalado, reglas de ADR 0006/0009) y los que dicta el usuario como margen, extra o descuento. Un `set` directo sobre el costo o la procedencia de un equipo escribe un número del modelo y deja `priceSource: 'manual'`: lo detecta `operationsSetManualPrice` (`pricingOps.ts`), el lote es `shared` y se confirma también en la app. Igual con un `set` del modelo o la magnitud de un grupo que tiene precio: el equipo deja de ser el de la oferta (pierde `catalogItemId` y `selectedSupplierInfo`, queda `manualModel`) pero conservaría el costo del modelo anterior con su procedencia de proveedor, un precio que ya no corresponde a nada; cambiar solo la cantidad sigue en vivo. Un lote de precios sigue dejando `AUTOMATED_PRICING`. (La mano de obra `specs.installationUnitPriceUSD` y la tasa de cambio `specs.dopExchangeRate` están en `PRICING_FIELDS` porque mueven el precio, pero no son el costo de un equipo: son parámetros comerciales que dicta el usuario, como el margen, y van en vivo con su diff y su deshacer.)
- **Lo que la organización oculta** (el régimen de medición neta con su selector apagado) sigue rechazándose con su motivo.
- **La revalidación al confirmar** (huella del diff mostrado) sigue para el perfil `confirm` y para los agentes externos.

### 4. Encendido del asistente flotante: migración escrita y apagada

`appAssistantEnabled` es `false` de fábrica y se guarda siempre, así que en cada instalación ya está escrito: cambiar el valor de fábrica no enciende a nadie. `migrateAppAssistantEnabled` (`src/store/persistence/appAssistantEnablement.ts`) lo resuelve con dos campos persistidos: `appAssistantEnabledChosenByUser` (el interruptor de Ajustes lo marca desde F3b) y la marca `appAssistantDefaultsVersion`. Con la bandera `APP_ASSISTANT_ON_BY_DEFAULT` encendida, la hidratación enciende **una vez** a quien nunca eligió y estampa la marca; después, un apagado cuenta.

Limitación: quien apagó el asistente **antes** de F3b lo hizo sin el interruptor que registra la elección, así que su `false` no se distingue del de fábrica y se encenderá una vez cuando la bandera se encienda (después, su apagado ya cuenta). F4/F5b debe avisarlo en las notas de la versión.

La hidratación acepta la bandera como opción (`hydrateSimulationStore(state, { appAssistantOnByDefault })`, solo para pruebas) y `testAssistantLiveEditProfile` fija el ciclo completo con ella encendida: guardado antiguo con `false` → encendido y marca → apagado con el interruptor → guardar → rehidratar → sigue apagado.

La bandera queda **apagada** en F3b: encender hoy el asistente expondría a todos al flotante actual (bucle antiguo, `propose_project_update`, sin el panel nuevo). La encienden F4/F5b, junto con el registro del asistente en `shared/applicationFeatures.ts` (mejora M6 de la revisión). Mientras tanto la hidratación hace lo de siempre (solo `true` enciende) y no estampa la marca.

## Consecuencias

- El criterio de aceptación del plan se cumple: la misma llamada `edit_proposal` con un precio se aplica en vivo desde el asistente de la app y queda pendiente desde un agente externo; lo compartido se confirma en ambas; `propose_project_update` y las copias doradas (`AGENT_RULES_ES`, las 12 herramientas remotas) no cambian. Lo fija `testAssistantLiveEditProfile`.
- Hasta F4 nada declara el conjunto nuevo al modelo: el asistente flotante de hoy sigue con `propose_project_update` y confirma precios como siempre.
- Ajustes → Agentes no muestra todavía un selector del perfil: el campo existe y se guarda, y lo expone F5b con el panel nuevo (con su ⓘ). El resaltado en vivo del cambio (F5a) ya está: [docs/QA.md](../QA.md#feedback-en-vivo-del-asistente-f5a).
- Un plan nuevo que solo cambie una propuesta y tenga deshacer puede pasar `scope: 'proposal'` a `runNativeTool`; nada más cambia de decisión sin pasar por `permissionProfile.ts`.
