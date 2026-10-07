# Verificación

`npm test` ejecuta las suites de src/tests y el updater mediante `scripts/test.ts`. El runner carga `scripts/testEnvironment.ts`, que bloquea fetch real: una prueba debe proporcionar un transporte sintético. Los antiguos testMultiUserSync y testRBACAndTokenRenewal escribían en servidores reales y se retiraron; su cobertura se sustituye por `server/tests/api.integration.test.ts` y regresiones de reconciliación local. No usar secretos de producción.

## Gates

Tipos y build frontend/Electron; todas las suites de dominio; integración PostgreSQL efímera del backend; tests del Worker con KV/autoridad simulados; snapshot Repomix. CI reproduce estos gates sin secretos empresariales. Una build correcta no equivale a instalación probada en cada SO.

## Matriz de revisión manual

- Abrir menú con tarjetas y lista, búsqueda/filtros, nombres largos, acciones por teclado y arrastre a carpeta. Recargar y comprobar preferencia. Revisar claro/oscuro a tamaño normal y mínimo Electron1024×700.
- Ajustes: navegación por categorías, título/foco, Escape, borradores al cambiar categoría y ausencia del espacio subyacente en accesibilidad.
- Sin cuenta, proyección off: tabla5columnas, gráfica2series, no perfil diurno. Activar: controles y desglose disponibles, ahorro/VAN cambian; desactivar vuelve al cálculo histórico y conserva datos introducidos. Revisar PDF/hub.
- ADMIN cambia política con CAS; EDITOR/VIEWER solo la aplican; offline mantiene última confirmada; otra organización no hereda modo. Backend antiguo muestra limitación y no confirma un guardado.
- Dos escritores: mismo baseVersion, un ACK y un conflicto; edición durante push sigue pendiente con base confirmada nueva. Falla pull/push/catálogo no adelanta timestamp.
- Papelera: nueva propuesta offline, eliminación suave en vuelo y física posterior; copia recuperable ante conflictos; tombstone impide resurrección.
- Catálogo: lectores descargan, solo items dirty se envían, precios concurrentes producen conflicto, borrar último equipo no reinyecta defaults.
- Publicación: snapshot de modo/version; inputs HTML hostiles no ejecutan scripts; crédito fiscal desactivado permanece cero; enlace antiguo conserva presentación histórica.

Resultados concretos y limitaciones de esta ejecución se registran en QA_RESULTS.md al cerrar. Los datos de pantalla de QA son sintéticos locales.
