# Asistente conversacional y revisión del PR — 12 de octubre de 2026

Base d9b5940 en codex/ai-workspace-refactor, PR #5 hacia beta. Se conservaron carpetas/historial/adjuntos/membretes del otro chat. La CI 38193364956 fallaba por formato en auth.ts y companies.ts; sólo se aplicó Prettier a esos módulos. Revisión independiente: API: 32 pruebas/build, Worker: 3 suites/build y regresiones compartidas aprobadas.

## Salud observada, sólo lectura

app-server accesible. API 2.3.2-shared20261008 y PostgreSQL 16 saludables, cero reinicios; API/Worker health 200, endpoints protegidos 401 sin credenciales y CORS válido. Hashes de módulos de carpetas/adjuntos/catálogo y migración 004 corresponden al código desplegado. Sin errores API detectados en últimas 24 h. CT: 11% disco, 368 MB de 4 GB RAM. No se desplegó ni cambió producción en esta revisión; el aviso de actualización cloudflared no se ejecutó.

## Asistente

Ventana completa, chat permanente oscuro en ambos temas y tabla USD editable por grupo. Mensajes de atención actualizados en el chat. Borrador/conversación conservados al cerrar/reabrir; cambiar ámbito o destino los limpia. Discussion responde sin sustituir borrador; apply conserva trabajo si el store rechaza. Costos de cualquier documento, no valores/fórmulas específicos de la ficha ilustrativa. Totales extraídos son sólo referencias. Motor financiero intacto; el motor solar comparte factores sin redondeo, sin cambiar su fórmula.

Dos solicitudes reales pequeñas a Gemini 3.8 con datos sintéticos y cuatro equipos de QA: extracción de cantidades/costos/tasa/factor/instalación y consulta posterior recargo-versus-margen. Aprobadas: USD 100.80 / 2700 / 1335 / 1685, cantidades 156 / 1 / 6 / 6, FX 60, recargo 35%, instalación 170 USD/kWp, procedencia teórica; respuesta posterior discussion sin cambio solicitado. No se enviaron la imagen privada ni su nombre de cliente; la clave estuvo sólo en memoria de proceso, fuera de repositorio/archivos/logs.

Pruebas deterministas: nombres genéricos/unidades/códigos específicos, costos y tasas documentales, ambigüedad sostenida al validar dos veces, aplicación real del store, catálogo intacto, consumo mensual igual a producción real en varias provincias/pérdidas/HSP, referencias tarifarias recalculadas al editar y tasas manuales preservadas. La hoja ilustrativa sólo es un caso de regresión: el simulador no utiliza sus cifras como constantes.

Navegador con transporte sintético y componentes reales: tabla edita/recalcula, discussion mantiene precios, close/reopen conserva conversación/costo, selector teórico muestra 100% energía y aviso, creación local confirma Propuestas QA: 1. A 1024×700 dialog ocupa 0,0–1024,700, scrollWidth 1024; sin overflow horizontal. Capturas válidas: [costos claro](qa/ai-conversation-2026-10-12/commercial-table-light.jpg), [teórico claro](qa/ai-conversation-2026-10-12/theoretical-light.jpg), [mínimo oscuro](qa/ai-conversation-2026-10-12/commercial-minimum-dark.jpg). La barra inferior QA no es parte del producto.

## Límites

El modelo sigue necesitando revisión: costos de venta no se convierten silenciosamente en compra, y compatibilidad eléctrica no se acredita por similitud de nombres. Los consumos teóricos aplicados son una referencia temporal guardada; modificar después el diseño requiere revisarlos, y reemplazar consumos termina esa etiqueta. No se alteran publicaciones anteriores ni políticas de cálculo. Chat sólo en memoria, últimos 20 mensajes acotados enviados con borrador actual; no es un historial durable. Validación de navegador no equivale a instalación Electron empaquetada. Esta entrega no publica binarios.

## Cierre de revisión y gates

Revisión funcional independiente cerrada: aplicación real, consumo igual a producción, aislamiento de destino, nombres genéricos/códigos específicos y referencias de tarifa. Finish reviewer nuevo: fidelidad/legibilidad válidas en las tres capturas; pidió únicamente actualizar persistencia de diseño. El documenter actualizó sistema/sidecar/brief y el veredicto puntuó ese hallazgo resuelto (`ship` a ese alcance). Detector: 15 advisories de tokens/rampa, cero hallazgos primarios.

Lint, 42 suites de aplicación, builds frontend/Electron, 32 pruebas de API, format:check/build de servidor y test/build Worker aprobados localmente. Repomix se regenera después de los documentos finales, manteniendo el filtro de seguridad. GitHub CI se comprueba por commit; no se confunde éxito local con estado remoto.
