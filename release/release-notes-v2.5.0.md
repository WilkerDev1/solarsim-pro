# SolarSim Pro 2.5.0

Esta versión amplía el trabajo asistido por IA y la colaboración empresarial: permite revisar propuestas con más detalle, consultar la simulación desde un chat flotante y compartir recursos de la organización con mayor control.

## Asistente para crear propuestas

- Texto y documentos en una conversación con memoria mientras preparas el borrador; puedes preguntar, aclarar datos y solicitar cambios antes de crear o actualizar.
- Vista de pantalla completa con el dock principal reutilizado, sin cabecera exterior ni contadores innecesarios. Conversación redimensionable por arrastre o teclado, burbujas de usuario y respuestas del asistente.
- Revisión por pestañas de consumo y diseño, equipos, cotización, cliente y tarifa. Conserva gráficos mensuales, doce consumos editables y dimensionamiento ajustable.
- Selección de varios modelos de paneles, inversores y baterías desde el inventario. Mejor reconocimiento de nombres aproximados de la misma marca y capacidad, sin confundir modelos técnicamente distintos.
- Precios detallados en USD por renglón, costos particulares de la propuesta, mano de obra, utilidad, extras y descuentos. Distingue compra de venta y pide aclaración cuando el documento es ambiguo.
- El consumo teórico igual a la producción puede indicarse explícitamente para propuestas sin factura; queda identificado como temporal y se reemplaza al ingresar consumo real.
- Catálogo y referencias tarifarias forman parte del contexto. Se señalan datos pendientes, precios desconocidos y supuestos que requieren revisión.
- Confirmación antes de aplicar, cancelación del análisis y rechazo de respuestas incompletas. Los documentos informativos no sustituyen las fórmulas del simulador.

## Asistente general de IA — experimental

- Chat flotante en Inicio, Hub y Simulador para consultar propuestas y resultados, buscar equipos y revisar referencias de tarifa.
- Herramientas para preparar cambios de cliente, parámetros, consumos, grupos de equipos y condiciones comerciales de la propuesta abierta; también especificaciones del catálogo.
- Los cambios requieren confirmación y se vuelven a validar si la sesión, los permisos o los datos cambiaron. Después se recalcula la simulación mediante el motor existente.
- Tarjetas de propuestas/equipos, imágenes adjuntas y preview de la primera página de las fichas PDF con descarga del documento completo.
- **Desactivado por defecto.** Se activa en **Configuración → Funciones de la aplicación → Asistente general de IA**. Es una preferencia local y respeta el rol de la cuenta.
- Requiere configurar Gemini. Consulta los datos ya cargados del espacio actual; no es un host MCP ni incorpora MCP-UI en esta versión.

## Inventario y escáneres

- Flujo de revisión unificado para facturas/descripciones y mejoras en la validación de equipos y precios.
- La actualización de una coincidencia de datasheet puede corregir nombre, modelo y especificaciones, conservando el ID, las ofertas y los valores no extraídos.
- Ofertas por proveedor y adjuntos de equipos respaldados por el servidor; las ediciones de una cotización no cambian automáticamente los precios del inventario.

## Colaboración y recursos empresariales

- Carpetas compartidas o privadas, con permisos y sincronización del espacio de organización.
- Historial compartido de propuestas web, con autor, vigencia y recuperación de enlaces anteriores.
- Imágenes y fichas técnicas de equipos almacenadas como recursos autenticados, reutilizables y separados por organización.
- Perfil empresarial compartido para mantener identidad y datos de la empresa coherentes entre miembros.
- Mayor protección frente a cambios concurrentes y respuestas antiguas después de cambiar de sesión o de organización.

## Distribución y compatibilidad

- Windows x64: instalador y versión portable.
- Linux x64: AppImage, Debian/Ubuntu `.deb`, Arch `.pacman` y archivo `.tar.gz`.
- Electron 44.5.1 incluido. Los binarios se construyen y prueban en runners nativos de GitHub Actions; no se incluye macOS ni ARM en esta distribución.
- Linux incluye firmas GPG de paquetes y manifiestos con la clave de confianza de SolarSim. Windows no incorpora firma Authenticode; puede mostrar advertencias del sistema.
- Se conserva el cálculo clásico por defecto. La proyección física de autoconsumo continúa siendo opcional.

## Alcance de la publicación

Esta publicación actualiza la aplicación de escritorio; no despliega automáticamente la API, Cloudflare Worker ni modifica la base de datos empresarial. Las funciones compartidas requieren un backend con los contratos y migraciones correspondientes. El asistente general sigue siendo experimental: la evidencia de esta entrega usa herramientas, archivos y conversaciones sintéticas; no certifica todos los resultados posibles de un modelo de IA.
