# Importador sin API empresarial — 13 de octubre de 2026

## Causa y corrección

El modal esperaba la subida autenticada del documento antes de incorporar modelos. Con la API apagada, la excepción impedía guardar el catálogo. `datasheetImportService.ts` separa el guardado local síncrono de la subida opcional: el store conserva modelos e intención de sincronización antes de cualquier upload. El modal muestra el resultado local y permite reintentar solo el adjunto; no recrea modelos. La subida tiene un límite de 12 segundos y revalida sesión, rol, organización, servidor y referencias antes y después de la respuesta. Los avisos quedan fuera del área desplazable de variantes.

Los bytes de la ficha no se encolan localmente. Si se cierra el modal con la subida pendiente, se vuelve a seleccionar el documento desde la edición del equipo. El análisis Gemini necesita internet, pero guardar sus resultados revisados no necesita la API empresarial.

## Evidencia

- `testDatasheetOfflineSave.ts`: nueve variantes sintéticas de inversor, API inaccesible, persistencia y rehidratación de equipos/cola, reintento sin duplicados, una ficha compartida, conservación de ofertas y adjunto anterior al actualizar, rechazo de respuesta de otra sesión y de escritura por lector/otro ámbito.
- Navegador interno con `equipmentCatalog.html?offline=1`: extracción interceptada, guardar dos variantes con subida fallida, reintentar adjunto y volver a catálogo. El conteo pasa de uno a tres y permanece en tres tras reintentar. No se usaron datos ni escrituras de producción.
- Revisión independiente de código: sin bloqueantes; guardas de adjuntos y reconciliación por revisión comprobadas estáticamente.
- Cliente: lint, 44 suites, build frontend y build Electron aprobados; Repomix regenerado.
- API: 32 pruebas y build aprobados en entorno efímero. Worker: sus tres suites y build aprobados.

## Consolidación de desarrollo

Se comprobó que `codex/company-center` (`6299625`), `codex/modular-audit-feature-controls` (`f2744a3`) y `codex/pdf-template-fix` (`80ed8eb`) ya son ancestros de beta. La integración pendiente corresponde a PR #5, `codex/ai-workspace-refactor`, que reúne IA, recursos compartidos y este arreglo. La consolidación conserva todos los commits; main debe permanecer en `9db70292f98fec2848dd69e67da6ba533886dd3e`. No se reemplazan los binarios publicados de 2.5.0 ni se despliega el servidor.
