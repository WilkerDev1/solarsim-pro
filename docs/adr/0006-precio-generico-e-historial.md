# ADR 0006: Precio genérico de equipos e historial de precios

Estado: aceptado (2026-11-21). Términos en el [glosario](../../GLOSSARY.md). Continúa los ADR [0001](0001-equipment-model-sin-espejo.md) y [0004](0004-edicion-de-proyecto.md).

## Contexto

Un equipo del catálogo solo tiene precio a través de sus ofertas de proveedor (`supplierPrices`, una por proveedor, que se sobrescribe al cambiar). No hay forma de guardar «lo que suele costar» un equipo sin atarlo a un proveedor, ni de ver cómo cambió su precio con el tiempo, y los precios escritos a mano en una propuesta se pierden para el catálogo.

Restricciones del código (mapeadas y revisadas el 2026-11-21):

- `GET /api/equipment` descarga el catálogo completo en cada sincronización, sin cursor. Un historial dentro de cada equipo crecería en cada descarga (misma clase de fallo que el incidente del 2026-11-20).
- `POST /api/equipment/batch` reemplaza la fila entera con control de versión: cada precio registrado chocaría (`version_conflict`) con quien edite el mismo equipo, y la resolución de conflictos no une arreglos.
- Los 10 equipos de referencia (`REFERENCE_EQUIPMENT_IDS`, de `org-electsun-default`) no los puede escribir otra organización y sus ofertas son privadas.
- El store se persiste entero como JSON en `localStorage`, con cuota (commit d029af2), junto con los espacios archivados de otras organizaciones.
- El campo de precio de la propuesta (`NumberField`) escribe en cada tecla y un campo vacío vale 0.
- `resolveProjectEquipment` es aproximado (termina en «el primer equipo del tipo»); no sirve para decidir a qué equipo se acredita un precio. `resolveGroupCatalogItem` es el estricto.
- Deshacer solo restaura la propuesta, nunca el catálogo.
- `normalizeProposalDraft` trata como manual todo precio que no sea de proveedor y corre en cada render de la revisión.

## Decisión

### 1. Registros de precio, fuera del equipo

Tabla nueva por organización, solo de inserciones: `equipment_price_observations` (migración 010). Cada fila es un **registro de precio**.

| Columna | Notas |
|---|---|
| `organization_id`, `id` | clave primaria compuesta; `id` lo genera el cliente (`po-<uuid>`, `^po-[0-9a-f-]{36}$`), idempotente; FK a `organizations` con borrado en cascada |
| `seq` | `bigserial`, orden de inserción en el servidor |
| `equipment_id` | equipo propio o de referencia; sin FK (el equipo puede crearse sin conexión o borrarse después) |
| `kind` | `observation` (un precio visto) o `generic` (fija el precio genérico) |
| `price_usd` | `numeric`, ≥ 0; > 0 si `kind = 'generic'` |
| `original_currency`, `original_price` | moneda y monto cotizados (DOP o USD), para no confundir el tipo de cambio con estacionalidad |
| `source` | `supplier_offer`, `ai_scan`, `proposal`, `manual`, `agent` |
| `supplier_name`, `supplier_offer_id` | copia del nombre al momento (renombrar un proveedor no reescribe el historial) |
| `project_id` | solo para `proposal`. **Sin nombre de proyecto ni de cliente**: el nombre se resuelve al leer y, si la propuesta ya no existe, se muestra «Propuesta eliminada» |
| `derived_from_id` | en un `generic`, el registro del que salió (si salió de uno) |
| `observed_at` | fecha del precio; el servidor guarda `LEAST(valor, clock_timestamp())` y rechaza fechas antes de 2020 |
| `created_by_id`, `created_at` | servidor |
| `voided_at`, `voided_by_id` | anulación (la fila no se borra); los pone el servidor |

- **Precio genérico** de un equipo = el registro `generic` no anulado con mayor `seq`. El orden lo da el servidor, nunca el reloj del cliente. Anular el registro vigente devuelve el precio genérico al anterior: es su «deshacer».
- No vive en `equipment_catalog`: no hay conflictos de versión, funciona con los equipos de referencia y no se filtra entre organizaciones.
- Las funciones puras viven en `shared/equipmentPrices.ts`: validación, `currentGenericPrice`, `genericPriceDecision` (tolerancia ±0,005; ≤ 0 nunca), `offerObservations(antes, después)` (empareja ofertas por id o nombre normalizado y compara solo `priceUSD`: stock, SKU, notas, renombrar y borrar no generan nada), `usableOffers`/`resolveAutoPrice(item, genérico)` y las estadísticas del historial.

### 2. API

Todas pasan por el control de versión mínima y la sesión como el resto de `/api/*`.

- `POST /api/equipment-prices/batch` `{ observations: [...], voids: [{ id }] }`, máximo 200 + 200. EDITOR o superior (LECTOR 403). Toma `lockCurrentMembership(client, user, true)` (nunca el bloqueo de proyectos). Procesa primero los registros y después las anulaciones. Estado por elemento:
  - `created`; `duplicate` (mismo id, mismo contenido); `conflict` (mismo id, contenido distinto);
  - `rejected` (permanente: datos inválidos, o equipo de otra organización que no es de referencia);
  - anulación: `voided`, `already_voided`, `not_found` (el cliente reintenta: el registro puede venir en camino).
  - No se exige que el equipo exista: un equipo creado sin conexión sube después que sus precios o puede quedar en conflicto. Los lectores ocultan registros de equipos que no existen u ocultos.
- `GET /api/equipment-prices?equipmentId=<id>&limit=<n≤500>&before=<seq>` devuelve el historial de un equipo (más recientes primero, paginado por `seq`), con el nombre de la propuesta resuelto si existe.
- `GET /api/equipment-prices/generic` devuelve `{ prices: { [equipmentId]: { priceUSD, observedAt, observationId } } }`, sin equipos ocultos por la organización. Una entrada por equipo: tamaño acotado.
- Las dos rutas GET se añaden a `AGENT_ROUTES` con alcance de lectura (el MCP remoto las usa); el POST no. Las lecturas no toman bloqueos.
- Cambio aditivo: no sube `MIN_CLIENT_VERSION`. Un cliente nuevo contra una API vieja recibe 404: se trata como «no disponible», sin mensajes, y la cola local se conserva.

### 3. Cliente

- Porción nueva `equipmentPriceSlice`. Persiste solo lo acotado:
  - `genericPrices`: el mapa de `/generic` (por espacio de trabajo);
  - `pricePending`: registros y anulaciones en cola, cada uno con `{ scope, userId }`.
  - El historial **no** se guarda localmente: la vista lo pide al abrirse y le suma lo pendiente.
- El precio genérico efectivo = mapa del servidor con lo pendiente aplicado encima (un `generic` en cola gana; una anulación en cola del vigente lo quita hasta la siguiente descarga).
- Sincronización: paso propio de `syncAll`, **después** del catálogo y sin bloquear nunca el resto (como los clientes). Solo envía lo de `scope` y `userId` actuales y con permiso de escritura; quita de la cola por `id` lo que el servidor confirmó (`created`, `duplicate`, `rejected`, `conflict`, `voided`, `already_voided`); `not_found` sigue en cola. Lotes de 200 + 200. Usa la guarda de sesión (`ensureSession`/`sessionGeneration`).
- Espacios de trabajo: las claves nuevas van en `keys` y `OptionalWorkspaceKey` de `organizationWorkspace.ts`, con valores vacíos en `emptyWorkspace`.
- **Sin sesión (modo local) la función está apagada**: ni registros ni preguntas ni etiqueta «Genérico». Los datos locales nunca se suben al iniciar sesión (AGENTS.md).
- LECTOR ve el precio genérico pero no registra ni ve preguntas.
- Hidratar, descargar, resolver conflictos o restablecer el catálogo nunca crean registros.

### 4. Cuándo se registra y cuándo se pregunta

| Evento | Registro | Pregunta |
|---|---|---|
| Oferta nueva o con `priceUSD` distinto en el modal de ofertas, la administración de proveedores o el editor del equipo | `observation` `supplier_offer` | Regla 1 |
| Importación de catálogo de precios con IA | `observation` `ai_scan` por oferta nueva o cambiada | columna «Actualizar genérico» en la tabla de revisión (sin diálogo extra) |
| Herramienta de agente `update_supplier_price` | `observation` `agent` | nunca (puede correr sin nadie); el resultado dice si difiere del genérico; deshacer anula el registro |
| Stock, SKU o notas; renombrar o borrar proveedor | ninguno | — |
| Precio escrito a mano en la fila de costo unitario de una propuesta, al confirmar | `observation` `proposal` (siempre, decisión del usuario) | Regla 2 |
| «Mejor proveedor», «Usar precio» de una oferta, elegir un modelo, precio genérico aplicado | ninguno | — |
| Revisión de borradores de IA, `propose_project_update` del asistente | ninguno | — |
| Precio genérico fijado a mano (control del modal de ofertas) | `generic` `manual` | — |

**Regla 1 (oferta de proveedor):** tras guardar con éxito, si el precio es > 0 y distinto del genérico vigente, se ofrece en el área de mensajes de esa pantalla (no un diálogo bloqueante): «Oferta guardada · Sin precio genérico → Usar US$ X como genérico» o «Oferta guardada · Genérico US$ A → Cambiar a US$ B». En el editor del equipo, si cambiaron varias ofertas, se ofrece una sola vez (la oferta más baja de las cambiadas). «Sí» crea un registro `generic` con `derived_from_id`.

**Regla 2 (precio en propuesta):** la fila confirma el precio con Enter o al salir del campo mientras la ventana tiene el foco, y solo si cambió respecto al valor al entrar. Condiciones para registrar: sesión iniciada, permiso de escritura, propuesta de la organización actual, fuera de la papelera, equipo resuelto con `resolveGroupCatalogItem`, precio > 0, distinto del proveedor asignado y del genérico vigente. **Un registro vivo por (propuesta, equipo):** al registrar uno nuevo, el anterior de ese par se anula. Si el equipo **no tiene precio genérico**, la fila muestra una pregunta compacta bajo el precio: «¿Usar como precio genérico? Usar · No». «No» deja de preguntar por ese equipo durante la sesión. Si ya tiene genérico, no se pregunta (las propuestas suelen llevar precios negociados por cliente; el genérico se cambia desde las ofertas). Los datos (propuesta, equipo, precio) se capturan al confirmar, no al responder.

### 5. Uso del precio genérico

Un solo resolvedor compartido, `resolveAutoPrice(item, genérico)`: oferta utilizable (precio > 0, no agotada; la preferida si la hay, si no la más barata) → precio genérico → sin precio.

- **Propuesta manual (dock):** al elegir un modelo (principal, secundarios o «+») se usa el resolvedor. Con genérico, el grupo lleva `unitPriceUSD`, `priceSource: 'generic'` y la copia `genericPriceInfo { priceUSD, observedAt, observationId }`, sin `selectedSupplierInfo`. La fila muestra «Genérico» (con ⓘ y la fecha) solo mientras el precio del grupo sea igual a esa copia y no haya proveedor asignado; editar el precio a mano lo vuelve `manual`. Cambiar el genérico después **no** cambia propuestas existentes (es una copia). Elegir un modelo sin oferta ni genérico ya no arrastra el precio del modelo anterior. «+» usa el genérico antes que la estimación por W/kW/kWh.
- **Propuestas automáticas (IA y agente):** `normalizeProposalDraft` recibe `context.genericPrices` (de los tres llamadores) y usa el resolvedor. `'generic'` se trata como automático (como `'supplier'`): se recalcula en cada normalización y nunca se convierte en manual; `draftForPrompt` no le reenvía al modelo precio ni fuente de los grupos genéricos; el catálogo del prompt marca `priceKind: 'generic'`. Aviso `generic_<tipo>_price` («precio genérico, sin proveedor») en la revisión (etiqueta propia, no «Oferta del inventario»), en `create_proposal` y en el resultado del asistente. `autoSupplierPricing` no se apaga por un grupo genérico. Los precios de contexto de una propuesta existente solo se reutilizan como manuales si eran `manual`.
- **Catálogo:** el modal de ofertas muestra en la cabecera «Genérico US$ X · fecha» con «Cambiar» y «Historial» (funciona también con equipos de referencia); la fila del inventario muestra «Genérico US$ X» bajo el precio de ofertas; el editor del equipo lo muestra solo de lectura. `auditCatalog` recibe los genéricos: un equipo sin ofertas pero con genérico pasa de `missing_price` a `generic_only` (informativo).

### 6. Historial

Vista «Historial» dentro del modal de ofertas (alterna con la lista; no abre otro modal):

- gráfico de línea del precio en el tiempo por fuente, con el precio genérico como escalón;
- resumen por mes del año (promedio, mínimo, máximo, cantidad de registros `observation` con precio > 0) para ver la estacionalidad, y variación a 3, 6 y 12 meses;
- tabla de registros con fuente, proveedor o propuesta, moneda original, autor y «Anular» (pide confirmación);
- sin datos inventados: meses sin registros quedan vacíos; aviso «El historial empieza el <fecha del primer registro>».

El historial empieza vacío (decisión del usuario, 2026-11-21): la migración no crea registros a partir de las ofertas existentes.

`get_price_history` (lectura) se declara en `shared/agentTools/definitions.ts`, con ejecutor en la app y en el MCP remoto.

## Consecuencias

- Una tabla, tres rutas, una porción y una cola local nuevas; los registros nunca chocan entre usuarios ni suben la versión del equipo.
- La descarga del catálogo no crece; la cola y el mapa de genéricos son acotados.
- Los registros de un equipo borrado se quedan y no se muestran mientras el equipo no exista.
- Restaurar la base a un punto anterior a la migración 010 pierde registros ya confirmados a los clientes (anotar en las notas de versión).
- Clientes 2.8.x: ven un grupo `generic` como precio sin proveedor y, si actualizan esa propuesta con IA, lo vuelven manual. No se rompe nada.
- Orden de despliegue: API (migración 010) antes que los clientes con esta función.
- `seq` es una única secuencia para todas las organizaciones y la API lo devuelve (registro y `nextBefore`): comparando sus propios `seq` consecutivos, una organización puede estimar cuántos registros de precio escriben las demás y cuándo. Se acepta: solo revela un volumen agregado, sin datos, equipos ni autores, y el contrato necesita `seq` para ordenar el precio vigente y paginar el historial. Si deja de ser aceptable, se sustituye por un cursor opaco sin cambiar el orden en el servidor.
