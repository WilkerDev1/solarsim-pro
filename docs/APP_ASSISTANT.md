# Asistente general experimental

El asistente flotante está disponible en Inicio, Hub y Simulador al activar **Funciones de la aplicación → Asistente general de IA · Experimental**. La preferencia es local, persistida y desactivada por defecto. No forma parte de la política energética de organización y no cambia el asistente de creación de propuestas.

## Límites y arquitectura

`src/features/assistant/` contiene tipos, validación de ediciones, herramientas, ciclo Gemini, hook de conversación y componentes de resultados. `App.tsx` monta la interfaz mediante importación diferida. `ChatMessage` y `useResizablePanel` se reutilizan en el editor de propuestas. No se importan capacidades Node desde React ni se exponen funciones arbitrarias del store al modelo.

El editor de propuestas elimina ejemplo y contador de equipos/tarifas. Su conversación admite arrastrar el divisor, o usar izquierda/derecha con el separador enfocado; Inicio recupera el ancho automático. Usuario en burbuja, asistente como texto continuo. Archivos y privacidad pasan a un detalle desplegable. El nuevo chat flotante tiene ampliar/comprimir, cancelar, reiniciar y cerrar.

Herramientas disponibles:

| Herramienta | Efecto |
| --- | --- |
| search_projects / get_project | Buscar y consultar propuestas activas del espacio, sin abrirlas |
| get_simulation | Resultados de los motores actuales, respetando modo clásico/físico |
| search_equipment / get_equipment | Catálogo y ofertas; sin stock confirmado no significa agotado |
| get_tariffs | Referencias con procedencia, sin prometer vigencia |
| propose_project_update | Sugerir campos de cliente, parámetros, tarifas, finanzas, extras/descuentos, doce consumos y grupos del catálogo |
| propose_equipment_update | Sugerir nombre/modelo y especificaciones del catálogo, manteniendo ID, ofertas y adjuntos |

Las consultas usan datos **ya cargados del espacio actual**, no una búsqueda completa de datos que todavía no se han sincronizado. Los resultados de búsqueda se limitan a doce. La conversación usada por Gemini se limita a doce mensajes recientes. Cada envío admite cuatro rondas, cuatro herramientas por ronda y tres sugerencias; los resultados se limitan a 64 KB. Transporte común conserva timeout, cancelación y recuperación acotada de respuestas truncadas. Nada se aplica al generar una respuesta.

## Confirmación y permisos

Cada edición muestra los campos propuestos y requiere confirmar. Se revalidan preferencia experimental, sesión, servidor, organización, rol, destino activo y fingerprint antes de mutar. Una edición concurrente o cambio de contexto invalida la sugerencia. Lectores consultan; ADMIN/EDITOR pueden preparar cambios. Propuestas borradas, equipos eliminados y destinos en conflicto quedan fuera de los cambios. Para editar otra propuesta debe abrirse primero; puede consultarse desde Inicio sin hacerlo.

Los grupos requieren ID real del catálogo, tipo correcto, capacidad válida, cantidad entera y costo unitario USD confirmado. Las especificaciones se toman del catálogo, no del texto generado. Cambios del proyecto se aplican por los métodos existentes del store, registran estado para deshacer y recalculan los motores. Catálogo sigue sus reglas de CAS y sincronización habituales. “Aplicado localmente” no equivale a confirmación de persistencia remota. No se ofrecen borrado, cambios de roles/organizaciones ni acceso arbitrario a recursos.

Texto y resultados de herramientas consultados se envían a Google Gemini; no se incluye la configuración de autenticación. Los adjuntos del catálogo se obtienen con el servicio autenticado existente para la vista previa, no se envían al modelo automáticamente. El texto se escapa como React; no se ejecuta HTML generado. Conversación transitoria: cerrar conserva en el mismo contexto, cambiar proyecto/espacio/sesión o desactivar la función la elimina y cancela solicitudes.

## MCP-UI

Revisión de documentación oficial: [Introducción](https://mcpui.dev/guide/introduction), [cliente](https://mcpui.dev/guide/client/overview) y [AppRenderer](https://mcpui.dev/guide/client/app-renderer).

MCP-UI implementa MCP Apps y ofrece componentes React/TypeScript con recursos `ui://`, metadatos `ui.resourceUri`, comunicación JSON-RPC y sandbox de iframe. Es compatible conceptualmente con React/Vite y Chromium de SolarSim; esto **no es una integración comprobada en Electron**. Su integración requiere cliente MCP, servidor de herramientas/recursos, proxy de sandbox, políticas CSP, validación de mensajes y autorización en cada llamada. Electron debe conservar contextIsolation, ausencia de Node en invitados y validación del origen de mensajes/enlaces.

Esta entrega usa function calling Gemini y tarjetas React propias. No añade SDK MCP-UI ni instala un servidor MCP; no declara interoperabilidad MCP. Las herramientas tipadas permiten un adaptador posterior, manteniendo las mismas validaciones y confirmaciones. Es más simple que cargar HTML remoto para las tarjetas actuales de equipos, imágenes y fichas.

## Evidencia y pendientes

`src/tests/testAppAssistant.ts`: herramientas sintéticas, lectura aislada, scopes de servidor/organización, lectores, flag desactivado, confirmación, replay/staleness, grupos de catálogo, validación financiera y respuestas truncadas. Sin escrituras de producción ni consumo de Gemini real.

`/scripts/qa/fixtures/appAssistant.html`: fixture local con transporte sintético para probar UI, cambios de vista/sesión, consultas y confirmación. `/scripts/qa/fixtures/aiWorkspace.html`: conversación de propuestas y divisor. No requieren claves reales.

El primer intento encontró la pestaña antigua en una página de error. Tras el reintento solicitado por el usuario, una pestaña nueva del navegador interno abrió las fixtures correctamente. QA sintética comprobó: apertura en Inicio/Hub/Simulador, contextos separados, switch que elimina el botón, cobertura 95% sin mutación al sugerir y 90% después de confirmar, búsqueda de catálogo con tarjetas, modo oscuro/ampliado y divisor 360→460→310px por arrastre, 334px por teclado. Escape desde el textarea cierra solo el menú de IA cuando está abierto.

La prueba de adjuntos mostró un iframe PDF en blanco; se cambió por la primera página renderizada con `PDFThumbnailService`/PDF.js y enlace para descargar el documento completo. Imagen y ficha sintéticas verificadas visualmente, con miniatura completa y descarga efectiva del PDF; solo GET a archivos locales, sin servidor empresarial. `?assets=1` activa esta fixture de archivos de QA.

Review visual independiente: `ship` a este alcance, fixtures 1280×720/1286×900 y mínimos 1024×700. Detector: cero hallazgos primarios y 14 advisories de tokens heredados. Revisión funcional corrigió aislamiento por servidor/organización, límites financieros, campos no aplicables y tarjetas obsoletas. No se hicieron llamadas Gemini reales ni pruebas de escritura en producción; el comportamiento con modelo real y los adjuntos empresariales sigue siendo un límite de esta evidencia. La función se mantiene experimental y apagada por defecto.
