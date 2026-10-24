# ADR 0001: EquipmentModel sin espejo heredado

Estado: aceptado. Términos en el [glosario](../../GLOSSARY.md).

## Contexto

Cada propuesta guarda sus equipos dos veces: los grupos (`specs.panels`, `inverters`, `batteries`), que son la fuente, y los campos sueltos de un solo modelo, escritos como espejo del primer grupo por `src/utils/equipmentGroups.ts`. Unos 40 archivos leen el espejo directamente (visor Worker, `projectSlice`, `versionHistorySlice`, `proposalDraftProject`, `documentTextContext`…). Cada lector decide por su cuenta qué hacer con varios modelos, y casi todos acaban describiendo solo el primero.

## Decisión

1. **El espejo deja de persistirse.** Solo se guardan grupos. Los datos viejos se leen derivando los grupos desde los campos heredados únicamente dentro del módulo, y el espejo no se vuelve a escribir.
2. **Migración completa más adelante**: migración 006 en la API y rehidratación local en el cliente, ambas con `migrateLegacySpecs`. La lectura heredada se conserva solo para propuestas publicadas (Worker KV) y archivos `.json` importados.
3. **Versión mínima del cliente en la API** (oleada 4): cada cliente envía `X-SolarSim-Client: <nombre>/<versión>` y la API responde 426 `client_outdated` en las rutas de datos si falta o es menor que `MIN_CLIENT_VERSION` (por defecto `2.7.1`). Abiertas: salud, inicio de sesión, renovación, `/api/auth/me` y CORS. Contrato en [API y base de datos](../DATABASE_AND_API_SPECIFICATION.md#versión-mínima-de-cliente); cómo subirla en [Mantenimiento y releases](../MAINTENANCE_AND_UPDATES.md#versión-mínima-de-cliente).
4. **Nombrar equipos en textos**: en frases y resúmenes, el modelo principal + «y N modelo(s) más» cuando hay otros; las tablas listan todos los modelos. Nombres de reserva unificados: «Módulos Monocristalinos Tier-1 TOPCon», «Inversor Solar On-Grid / Híbrido», «Banco de Baterías de Litio LiFePO4».
5. **Parámetros de sistema** que no son identidad del equipo (degradación, vida útil…) se quedan donde están. DOD y eficiencia de batería pasan a ser solo por grupo (el motor ya los pondera por grupo).

El módulo `shared/equipment/` (portable: cliente, API y Worker) expone `readEquipment`, `editEquipment`, `equipmentTotals`, `describeEquipment` y `migrateLegacySpecs`. Es el único lugar que lee los campos heredados.

Decisiones de diseño de la oleada 1:

- `editEquipment` migra la propuesta antes de editar, nunca escribe el espejo y lo borra si existía; devuelve las specs completas.
- **Migración invariante**: una migración de datos no cambia ningún resultado que el usuario ve (costo, precio, kWp, energía, finanzas, textos). `migrateLegacySpecs` con grupos ya guardados solo borra el espejo y no traslada nada a los grupos: ni cantidad, potencia, capacidad, precio, DOD o eficiencia (afectan cálculos; hoy el motor ignora el espejo y un grupo sin precio cuenta 0), ni peso ni proveedor (se ven en la matriz de costos, las fichas y los anexos). Sin grupos, los construye exactamente como `getProject*` los deriva hoy, con `DEFAULT_UNIT_PRICE_USD`. Una prueba de invarianza ejecuta el motor antes y después de migrar.
- Con `hasBattery` falso, la migración conserva en un grupo los datos de batería para no perderlos al reactivarla; `readEquipment` lo oculta mientras esté apagada.
- `describeEquipment` cuenta modelos distintos por nombre; sin grupos devuelve texto vacío.
Decisiones de la oleada 4:

- **Migración 006** aplica `migrateLegacySpecs` a todos los proyectos de la base, también papelera y otras organizaciones. No sube `version` ni `updated_at` (el contenido es equivalente, el cliente también migra al leer y un cambio de `updated_at` forzaría a todos a volver a descargar todo y crearía falsos conflictos de CAS) y no toca `project_version_history` (registro inmutable; sus instantáneas se leen con `readEquipment`).
- **Capacidad al guardar**: `system_capacity_kwp` sale de `equipmentTotals(readEquipment(specs)).capacityKWp`. Antes la API leía `specs.panelGroups`, un campo que ningún cliente guarda.
- **`shared/equipment` declara sus propios tipos** (`PanelItemSpec`, `InverterItemSpec`, `BatteryItemSpec`, `EquipmentSpecs`): la API se compila con `NodeNext` y no puede importar los tipos del renderer. Las funciones son genéricas sobre `EquipmentSpecs` y devuelven el tipo que reciben; `src/tests/testEquipmentTypeParity.ts` hace fallar `npm run lint` si los tipos del renderer divergen. Los imports relativos del módulo llevan `.js`.
- El servidor MCP local no llama a la API (sus herramientas pasan por el renderer, que se presenta como `desktop`), así que no envía el encabezado.

- La energía útil del banco queda fuera (candidato #1 del informe de arquitectura): `equipmentTotals` solo da capacidad nominal.

Decisiones de la oleada 5 (tipos y release 2.7.1):

- **`SystemSpecs` ya no declara el espejo.** Los 17 campos sueltos de `LEGACY_MIRROR_FIELDS` y el `selectedSupplierInfo` por tipo viven en `LegacyEquipmentFields` (`shared/equipment/types.ts`); `LegacySystemSpecs` (grupos + espejo) y, en el renderer, `LegacyProjectSpecs` (`SystemSpecs & LegacyEquipmentFields`) tipan datos VIEJOS. `specs.panelCount` fuera de ellos es un error de `npm run lint`, y `src/tests/testEquipmentTypeParity.ts` falla al compilar si alguien devuelve un campo del espejo a `SystemSpecs`. Los parámetros de sistema que no son identidad del equipo (`panelEfficiency`, `tempCoeff`, `annualDegradation`, `inverterEfficiencyPct`, `batteryLifespanYears`, `batteryReplacementCostUSD`, pérdidas, autoconsumo…) siguen en `SystemSpecs`.
- **Quién puede leer el espejo**: `shared/equipment` (`readEquipment`, `migrateLegacySpecs`, `applyLegacyEquipmentPatch`), la rehidratación local (`hydrateSimulationStore`), la importación de `.json` (`importExportSlice`) y el visor Worker al leer instantáneas viejas (siempre mediante `readEquipment`). Las pruebas que simulan clientes viejos usan `LegacyProjectSpecs` y `src/tests/legacyFixtures.ts`.
- **Guarda por búsqueda de texto** (`src/tests/testNoEquipmentMirrorAccess.ts`): ningún archivo de `src/`, `shared/`, `workers/share-viewer/src`, `server/src` ni `electron/` fuera de esa lista accede a `specs.<campo del espejo>` (cubre `any`, JSON sin tipar y tipos estructurales propios que el compilador no ve). Los totales (`equipmentTotals(...).panelCount`) y los campos del catálogo no son el espejo.
- **Restos que el compilador no veía** y que la guarda encontró: `projectSummary.ts` y `dynamicTexts.ts` (los textos recibían un falso `{ specs: { panelCount… } }`; ahora reciben los totales) y `BankSpecs` de `projectDefaults.ts` (sus escalares `batteryDOD`/`batteryEfficiencyPct` pasan a `dodPct`/`efficiencyPct`: no son campos de la propuesta, los arma `batteryBankSpecs` desde el primer grupo).
- `createNewProject` escribe los defaults en el grupo con `editEquipment` en lugar de pasar por `applyLegacyEquipmentPatch`. `updateSpecs` decide si la cantidad de paneles se editó comparando el primer grupo antes y después, no mirando `panelCount` en el parche: un parche heredado `panelCount` que no cambia ninguna cantidad (p. ej. con varios modelos) ya no apaga el dimensionamiento automático.
- **`editEquipmentGroup`/`normalizeEquipmentEdit` no se retiran en esta oleada**: siguen siendo compuertas finas (una línea sobre `editEquipment`/`applyLegacyEquipmentPatch`) que usan el dock y el asistente; quitarlas no cambia resultados y queda como limpieza posterior.

Hallazgos de la revisión de la release 2.7.1 (todos con prueba):

- **El espejo no sobrevive a ninguna edición ni cruza la frontera de sincronización.** `applyLegacyEquipmentPatch` migra `current` también con un parche sin campos de equipo (una instantánea anterior a 2.7.1 podía conservar el espejo tras editar solo un parámetro de sistema). `SyncService` migra con `migrateLegacySpecs` lo que baja (`pullProjects`, proyectos y `serverProject` de los resultados) y lo que sube (cuerpo de `pushProjects`); la restauración del historial del servidor (`POST /api/projects/:id/history/:versionId/restore`) migra las specs de la instantánea antes de guardarlas, sin reescribir `project_version_history`.
- **Un proyecto nuevo no hereda valores por grupo que le ganen a lo configurado.** El grupo de paneles del caso de referencia trae `annualDegradation: 0.5` y, en modo simple, `resolveAnnualDegradationPct` prioriza el del grupo sobre el del sistema. `createNewProject` y `createAIProposalBase` quitan ese campo de los grupos heredados (`withoutInheritedPanelDegradation`); el caso de referencia, en modo detallado, no cambia.
- **Un borrador de IA con selección escalar que cambia el modelo de un grupo vinculado al catálogo** aplica la regla del dock (`detachedCatalogIdentity`, ahora en `src/utils/equipmentGroups.ts`): nombre exacto y único del catálogo ⇒ se vincula a ese equipo; si no, `manualModel` y sin `catalogItemId`, para no anexar la ficha del equipo anterior.

### Retiro de la lectura heredada

La lectura de datos viejos (`deriveLegacyGroup`, `MIRROR`, `LegacyEquipmentFields`, `LegacyProjectSpecs`, `applyLegacyEquipmentPatch`, la rama heredada de `readEquipment` y la rehidratación) se conserva a propósito y se retira por partes:

- **Worker**: cuando no quede en su KV ninguna instantánea publicada antes de 2.7.1 (una instantánea vieja es la que trae `specs` sin `panels`/`inverters`). Las instantáneas vencen con su vigencia (máximo 90 días); un cliente 2.6.x/2.7.0 aún puede publicar en formato viejo hasta que actualice, así que se comprueba el KV y no la fecha de la release.
- **Archivos `.json` importados y datos locales**: mientras haya copias de seguridad de 2.6.x/2.7.0 en uso. Plazo máximo previsto: **3 años desde 2.7.1** (octubre de 2029); pasado ese plazo se retira la importación heredada, se borra `LegacyEquipmentFields` y `readEquipment` deja de derivar grupos.
- Al retirarla, la guarda `testNoEquipmentMirrorAccess` pasa a prohibir los campos en todas partes y `LEGACY_READERS` queda vacía.

## Consecuencias

- La oleada 1 es aditiva: crea el módulo, hace que `getProject*` y `DEFAULT_UNIT_PRICE_USD` salgan de él y no cambia ningún comportamiento. Las oleadas 2 a 4 migran a los llamadores y la persistencia; la 5 quita el espejo del tipo `SystemSpecs` y prepara la release 2.7.1.
- Código nuevo usa `shared/equipment`, no los campos heredados.
- `SystemSpecs` ya no declara los campos sueltos (oleada 5): un resultado migrado es un `SystemSpecs` válido.
- Clientes 2.6.0 dejarán de funcionar con datos migrados; por eso la decisión 3.

## Alternativas rechazadas

- **Mantener el espejo en cada escritura**: es el estado actual; duplica la fuente de verdad y obliga a cada lector a elegir qué modelo describir.
- **Migrar a mano caso por caso en cada llamador**: reparte la lógica heredada en 40 sitios y la deja viva para siempre.
- **Migrar solo al hidratar, sin módulo común**: sin un único lector, el Worker y los `.json` importados seguirían con su propia interpretación.
- **Heredar DOD/eficiencia al grupo**: cambiaría resultados del motor, que ya ignora el escalar cuando hay grupos.
- **Imponer ya la versión mínima de la API** (oleada 1): rompería a clientes en uso antes de que la migración exista; por eso llega con la oleada 4.
- **Subir `version`/`updated_at` en la migración 006**: sería más «honesto» con el CAS, pero fuerza una descarga completa en todos los clientes y falsos conflictos sobre un cambio sin efecto visible.
- **Migrar `project_version_history`**: reescribe un registro de auditoría sin que ningún lector lo necesite.
