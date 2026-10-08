# Revisión del subsistema IA — 8 de octubre de 2026

Rama `codex/ai-workspace-refactor`, base estable 2.3.2. Refactor de cliente y runtime Electron; no despliega ni modifica PostgreSQL/API/Worker de producción. Se mantiene legacy como cálculo predeterminado.

## Evidencia

- Dos llamadas reales de propuesta con Gemini: selección de dos modelos de panel, dos modelos de inversor y BESS, seguida de corrección de una cantidad conservando los otros grupos y consumo. Aprobadas.
- Ficha de fabricante Luxpower de Descargas: extracción real de variantes LXP-LB-US 8k y 10k, nominales 8 y 10 kW. Aprobada. No se enviaron facturas privadas. Se repitió una vez por una equivocación de acceso a campo en el script de comprobación, no por un error del escáner.
- Fixture `scripts/qa/fixtures/aiWorkspace.html`: componentes reales con transporte IPC simulado y clave sintética; sin llamadas externas. Verificada preparación de borrador, revisión obligatoria, invalidación de confirmación al editar, creación local, carga de un PDF real y ausencia de desbordamiento horizontal a 1024 × 700. No equivale a un recorrido completo de Electron instalado.
- Revisión independiente encontró y motivó correcciones de permisos de lector sin token, cancelación IPC, rendimiento por provincia, precio directo, datos perdidos, modelos sustituidos, BESS, importaciones duplicadas, tarifas parciales y corte de mensajes largos.

## Gates

`npm run lint`, `npm test` (36 suites), `npm run build`, `npm run build:electron`, pruebas y compilación de `server` y `workers/share-viewer`: aprobados. Los gates de tipos y build se repitieron después del ajuste final de cancelación; la prueba manual comprobó directamente ese control. `npm run context:pack` ejecutado; Repomix excluye una prueba de updater por su fixture criptográfico detectado como sospechoso, sin desactivar el filtro de seguridad.

## Límites

La IA prepara un borrador, no acredita compatibilidad eléctrica ni garantiza extracción exacta. Los modelos disponibles dependen de la cuenta de Google; no se prometen cuotas ni una cascada silenciosa. Se señaliza el pliego histórico y la procedencia por campo, sin inventar precios o tarifas actuales. El backend de tarifas todavía carece de CAS para reemplazos entre administradores; requiere una entrega coordinada distinta. Las claves de usuario siguen en almacenamiento local del cliente, sin promesa de cifrado del sistema operativo. No se realizó instalación Windows ni prueba de Electron empaquetado para esta rama.

## Cierre funcional y visual

Las 36 suites pasaron nuevamente tras los ajustes de precios y notas; compilaciones/tipos aprobados. Una ejecución intermedia del runner terminó con SIGTERM sin fallo de aserción; la repetición completa concluyó con salida 0.

La revisión visual equivalente a Impeccable terminó con `ship` para asistente/catalogo en ambos temas y mínimo 1024 × 700. Se utilizó un agente existente porque el harness rechazó crear otro reviewer por límite de threads. La primera evidencia se rechazó correctamente: capturas del tab de fondo eran borrosas y `clip` produjo frames incorrectos. Capturas posteriores de la pestaña visible, sin recorte, permitieron la revisión. El modal completo de datasheets y los estados inferiores no tienen aprobación visual exhaustiva.

La prueba lenta del navegador encontró un fallo de activación nativa: reutilizar el mismo botón React para cancelar y enviar permitía que cancelar provocara otro submit. Se separaron sus identidades y se previno esa acción por defecto. Prueba posterior: compositor habilitado y cero solicitudes en curso tras cancelar. Cambiar sesión durante otra solicitud dejó cero borradores/cero solicitudes activas; las respuestas tardías se descartan. La fixture elimina su root al recargar módulos para evitar listeners duplicados de QA.

El diseño se documentó desde el código final en DESIGN.md y el brief de superficie; no se convirtieron los tamaños diminutos del editor heredado en reglas para nuevas interfaces.

Capturas aprobadas: [asistente claro](qa/ai-refactor-2026-10-08/proposal-light-valid.jpg), [asistente oscuro](qa/ai-refactor-2026-10-08/proposal-dark-valid.jpg), [mínimo de escritorio](qa/ai-refactor-2026-10-08/proposal-minimum-valid.jpg), [catálogo claro](qa/ai-refactor-2026-10-08/inventory-light-valid.jpg) y [catálogo oscuro](qa/ai-refactor-2026-10-08/inventory-dark-valid.jpg).
