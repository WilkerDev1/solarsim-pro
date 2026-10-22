# Verificación

## Pruebas automatizadas

`npm test` ejecuta cada `src/tests/test*.ts` y la prueba del updater (`electron/updater/tests/updaterIntegrity.test.ts`), cada una en su propio proceso, mediante `scripts/test.ts`. Para una sola suite: `npm test -- <filtro>`. El runner siempre carga `scripts/testEnvironment.ts`, que sustituye `fetch` por uno que falla: una prueba que necesite HTTP debe inyectar un transporte sintético. Ninguna prueba escribe en servidores reales ni usa secretos de producción.

- API: `npm --prefix server test` (node:test). Las integraciones (`server/tests/*.test.ts`) arrancan PostgreSQL en un contenedor Docker desechable.
- Worker: `npm --prefix workers/share-viewer test`, con KV y autorización simulados.
- `server/tests/containerSmoke.ts`: construye su propia imagen/contenedores y ensaya proceso sin root, health con base, CAS y rotación de secretos.

La lista completa de gates está en [MAINTENANCE_AND_UPDATES.md](MAINTENANCE_AND_UPDATES.md#gates). Una build correcta no equivale a instalación probada en cada sistema operativo.

## Ensayos fuera de `npm test`

- **Staging con runtime real**: `QA_CLOUDFLARED=/ruta/al/cloudflared npx tsx scripts/qa/runRuntimeStaging.ts`. Levanta PostgreSQL desechable, API HTTP real, Wrangler local (workerd y KV privados) y túneles HTTPS temporales; rechaza destinos de producción, aprovisiona usuarios sintéticos `@staging.example.invalid` (Ana ADMIN, Bruno EDITOR, Vera lector y una cuenta de otra organización) y ejecuta `scripts/qa/stagingRehearsal.ts` (CAS entre editores, rechazo del lector y de clientes sin `baseVersion`, snapshots de publicación, papelera). `Ctrl+C` limpia procesos, contenedor, KV y túneles.
- **Aplicación completa contra ese staging**: en otra terminal `npm run dev` y abrir `/scripts/qa/fixtures/runtimeFlow.html` sobre el origen de Vite.
- **Fixtures de componentes**: `scripts/qa/fixtures/*.html` montan vistas reales con transporte simulado (catálogo, asistente, centro empresarial, conflictos, borradores, simulador, fichas y editor del documento: `documentEditor.html`). Acreditan el comportamiento de UI, no la API.
- **Electron empaquetado**: `node scripts/qa/runElectronRuntime.mjs [ruta/app.asar]` arranca el ASAR con perfil privado y comprueba aislamiento del renderer e IPC. `release.yml` lo usa tras instalar los paquetes.
- **Respaldo**: `scripts/qa/restoreBackupRehearsal.py` (ver [infraestructura](INFRASTRUCTURE_ARCHITECTURE.md#despliegue-de-la-api)).

Las capturas de QA se guardan localmente en `docs/qa/` (ignorado por Git) y contienen solo datos sintéticos; nunca credenciales, tokens, URLs privadas ni datos de clientes.

## Matriz de revisión manual

- Menú con tarjetas y lista: búsqueda/filtros, nombres largos, acciones por teclado y arrastre a carpeta; la preferencia persiste al recargar. Claro/oscuro a tamaño normal y mínimo Electron 1024×700.
- Ajustes: navegación por categorías, título/foco, Escape, borradores al cambiar de categoría y fondo inerte para accesibilidad.
- Sin cuenta, proyección desactivada: tabla de 5 columnas, gráfica de 2 series, sin perfil diurno. Al activarla aparecen controles y desglose y cambian ahorro/VAN; al desactivarla vuelve el cálculo clásico y se conservan los datos introducidos. Revisar PDF y hub.
- ADMIN cambia la política con CAS; EDITOR y LECTOR solo la aplican; sin conexión se mantiene la última confirmada; otra organización no hereda el modo. Un backend antiguo muestra la limitación y no confirma un guardado.
- Dos escritores con el mismo `baseVersion`: un ACK y un conflicto; una edición durante el push sigue pendiente con la nueva base confirmada. Un fallo de pull/push/catálogo no adelanta el timestamp.
- Papelera: propuesta nueva sin conexión, eliminación suave en vuelo y física posterior; copia recuperable ante conflictos; el tombstone impide resurrección.
- Catálogo: lectores descargan, solo se envían ítems modificados, precios concurrentes producen conflicto y borrar el último equipo no reinyecta defaults.
- Publicación: snapshot de modo/versión; HTML hostil no ejecuta scripts; crédito fiscal desactivado permanece en cero; un enlace antiguo conserva su presentación.

Los resultados de una ejecución concreta se registran en el PR o commit correspondiente, no en documentos fechados.
