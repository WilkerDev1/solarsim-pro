# Directorio de clientes

Registro de clientes por organización (o por equipo, en modo local) al que se enlazan las propuestas. **El cliente enlazado es independiente de los datos impresos en la propuesta** (`ProjectSimulation.client`): enlazar, cambiar o borrar un cliente nunca reescribe el nombre, el teléfono ni la dirección del documento.

## Modelo

| Pieza | Ubicación | Contrato |
| --- | --- | --- |
| Validación y normalización | `shared/clients.ts` | `validateClientInput` acepta solo `kind` `persona`/`empresa`. El nombre es obligatorio (máx. 255); el resto de campos son opcionales y se guardan como `''`. `normalizeTaxId` quita espacios, puntos, guiones y barras y pasa a mayúsculas (`1-31-12345-6` → `131123456`). |
| Duplicados | `shared/clients.ts` | `findDuplicateClients` avisa si coincide el RNC/cédula o el nombre normalizado (`clientNameKey`: sin mayúsculas, acentos, puntuación ni sufijo legal SRL/SAS/EIRL/SA). Es un aviso y nunca bloquea. |
| Enlace | `ProjectSimulation.clientId?` | Opcional. Una propuesta puede no tener cliente. |
| Tabla | `clients` (migración 005) | PK `(organization_id, id)`, `version`, `created_by_*`, marcas de tiempo y `deleted_at` (borrado lógico). |

## API

`GET /api/clients` devuelve `{clients, deletedIds}` de la organización activa; los lectores también pueden consultarlo.

`PUT /api/clients/:id` crea o edita con CAS: `baseVersion` 0 crea y la última versión confirmada edita.
- En conflicto responde 409 con el registro actual, o `client: null` si está borrado.
- Un id borrado nunca se revive.
- Requiere rol escritor (`isWriterRole`); `lockCurrentMembership` revalida el permiso en la base de datos.

`DELETE /api/clients/:id?baseVersion=N` hace un borrado lógico.
- En la misma transacción quita `clientId` de las propuestas enlazadas y sube su versión.
- Toma el bloqueo de proyectos (`lockOrganization`) antes del de membresía, igual que carpetas.

En el push de propuestas, un `clientId` malformado, de otra organización o borrado produce el conflicto `invalid_client`. Los ids desconocidos se aceptan: son clientes creados sin conexión que aún no se han publicado.

Restaurar una versión del historial conserva el `clientId` actual, igual que el seguimiento comercial: el historial no revive enlaces borrados.

## Store y sincronización

`src/store/slices/clientSlice.ts` ofrece una API pura, llamable fuera de React, que usarán las herramientas de agentes:

- `createClientRecord(input)` y `updateClientRecord(id, updates)` → `{ok:true, client}` o `{ok:false, error}`;
- `deleteClientRecord(id)` → `boolean`;
- `linkProposalToClient(projectId, clientId | null)` → `{ok}`; rechaza propuestas en papelera, de otro espacio de trabajo o clientes inexistentes;
- `resolveClientConflict(id, 'accept_server' | 'keep_local')` y `syncClientsWithServer()`.

Las escrituras van a `clientChanges` (revisión + `baseVersion`) y los borrados a `clientDeletionQueue`. Reglas de la sincronización:
- Un recibo perdido solo se da por bueno si el contenido del servidor es idéntico.
- Un borrado obsoleto (409) devuelve el registro del servidor para revisarlo.
- Los borradores nunca publicados se eliminan sin petición.

`syncProjectsWithServer` sincroniza los clientes justo después de las carpetas. Como el push acepta ids desconocidos, un fallo de clientes no bloquea las propuestas: el mensaje final indica «clientes pendientes». Los `deletedIds` del servidor desenlazan también las copias locales.

El transporte HTTP (`src/services/clientSyncService.ts`) es inyectable (`ClientSyncService.setTransportFactory`). Las pruebas no tocan la red.

Los clientes forman parte del espacio de trabajo (`organizationWorkspace`). Los creados en modo local permanecen en el espacio local y **nunca se asignan automáticamente** a una organización al iniciar sesión.

## Interfaz

- **Dock → Clientes** (`clients-hub`, `src/components/clients/ClientsHubView.tsx`):
  - búsqueda por nombre, RNC, teléfono o correo y filtro por tipo;
  - `ClientDetailPanel` con datos opcionales, propuestas enlazadas (estado documental Borrador/Final/Archivada y decisión comercial) y resumen: conteos y monto aprobado según `salesPerformance`, sin pruebas ni papelera (`src/utils/clientSummary.ts`).
- **Propuestas**:
  - insignia «Cliente: …» en la tarjeta;
  - «Enlazar/Cambiar cliente» en el menú de acciones;
  - sección Cliente en el resumen de la propuesta, con «Usar datos en el documento», que copia explícitamente los datos del cliente a los datos impresos tras confirmar.
- **Nueva simulación**: selector opcional que solo pre-llena los datos impresos (editables después) y, si se marca la casilla, enlaza la propuesta.
- Lectores: consulta sin acciones de escritura.

## Pruebas

- `server/tests/clients.test.ts`: PostgreSQL efímero.
- `src/tests/testClientsStore.ts`, `testOfflineClientSync.ts` y `testClientSummary.ts`.
- Fixture visual: `scripts/qa/fixtures/clientsHub.html`, con las variantes `?theme=dark`, `?role=lector`, `?empty=1&feedback=1`, `?view=cards`, `?view=proposal` y `?client=<id>`.
