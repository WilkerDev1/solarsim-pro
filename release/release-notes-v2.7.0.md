# SolarSim Pro 2.7.0

Versión de funciones: nuevo dock de parámetros, directorio de clientes, editor de documentos, asistente con herramientas de agente y servidor MCP local. Incluye una migración aditiva de base de datos (005, clientes) y cambios numéricos en valores por defecto y banco de baterías, descritos abajo.

## Dock de parámetros (variante C)

- Nuevo dock de parámetros con secciones plegables: Proyecto y cliente, Tarifas, Equipamiento y batería, Costos y margen, y Finanzas. Avanzado queda plegado, "Colapsar todo" solo actúa cuando todas las secciones están abiertas y las cantidades son enteras.
- Los equipos se editan con una lista de grupos (varios modelos de panel, inversor y batería).
- Los valores por defecto viven en un solo módulo compartido por el motor, el almacén y la interfaz.
- Las categorías de Ajustes se alinean con las secciones del dock.

## Catálogo de equipos

- Miniaturas de vista previa de fichas en tablas, ofertas y selector, con caché que no genera fallos falsos.
- Identidad de catálogo en cada grupo de equipos y nombres amigables para las fichas.
- Las fichas PDF de los equipos en uso se anexan solas a la propuesta.

## Clientes

- Directorio de clientes por organización (API, almacén con sincronización sin conexión y vista Clientes en el dock) enlazado a las propuestas. No cambia los datos impresos ni el cálculo.
- Resolución de conflictos al editar o borrar clientes desde varios equipos.

## Editor de documentos

- Todos los textos de las 12 páginas, la cabecera y el pie de la propuesta son editables.
- Barra de herramientas tipo Word, texto enriquecido (negrita, cursiva, listas) y exportación sin elementos de edición.
- Dock con Secciones y Diseño; el diseño se guarda con la propuesta.
- La propuesta web publicada muestra los textos editados.

## Asistente y herramientas de agente

- Chat con markdown seguro, tarjetas interactivas y archivos adjuntos.
- Herramientas para crear y gestionar propuestas, auditar el inventario, editar textos y diseño, gestionar anexos y consultar el directorio de clientes.
- Permisos por tipo de herramienta, registro de actividad con deshacer y confirmaciones antes de cambiar precios.
- Las propuestas automáticas usan siempre el modo catálogo y la matriz de costos.

## MCP

- Servidor MCP local en el escritorio (desactivado por defecto, solo 127.0.0.1, con token) para que Claude Code, Codex y otros clientes usen las mismas herramientas.
- Panel de conexión en Ajustes, con token copiable y fragmentos listos para cada cliente.
- Modo `--mcp-stdio` para Claude Desktop.
- Tarjetas MCP Apps para propuesta, auditoría y acción pendiente.

## Rendimiento

- La sincronización en segundo plano ya no reemplaza datos sin cambios ni redibuja toda la aplicación.
- La persistencia local se agrupa y los componentes se suscriben solo al estado que usan.
- La pantalla de carga global ya no aparece al abrir vistas diferidas.

## Propuesta web

- Diagrama animado de flujo energético (híbrido con batería o de inyección sin ella). Es una guía visual aproximada: porcentajes redondeados al 5 %, con "≈", y funciona en enlaces ya publicados. Respeta `prefers-reduced-motion`.

## Valores por defecto y banco de baterías

Correcciones que pueden cambiar resultados visibles:

- Precio directo por defecto: 1.13 $/W en la vista, el motor, proyectos nuevos, importaciones sin precio y ajustes por defecto (antes 1.15 en la vista y 1.05 en proyectos nuevos). Los ajustes ya guardados por el usuario no se tocan; los totales del motor no cambian.
- Eficiencia y DOD de batería por defecto: 90 % en todas partes (antes 95, 92 o 90 según el lugar; el DOD financiero era 80). Los resúmenes de proyectos con batería sin eficiencia guardada pasan de 92 % a 90 % (energía útil -2,2 %, p. ej. 19.4 a 19.0 kWh); el flujo de caja y la inversión no cambian.
- Banco con varios modelos: el DOD y la eficiencia se ponderan por grupo (DOD por capacidad × cantidad; eficiencia conservando la energía útil). Los proyectos con grupos de distinto DOD o eficiencia que el escalar cambian energía útil, autonomía y autoconsumo (p. ej. 19.4 a 22.5 kWh). Los proyectos migrados desde campos sueltos no cambian.
- Pérdidas del sistema: 25 % en modo simple y 14 % en detallado sin pérdidas guardadas, iguales en dock, recomendador y borrador de IA.
- Costo, venta y ganancia por Wp muestran el valor real (o "—") en lugar de cifras inventadas; vaciar DOD o eficiencia ya no salta a 90/95; tasa DOP/USD y multiplicador de margen ≤ 0 usan el valor por defecto.
- Los valores del caso de referencia (DOD 80 %, 1.134971 $/W) ya no se filtran a importaciones, proyectos nuevos ni propuestas de IA.
- Los identificadores de proyecto son únicos aunque se creen en el mismo milisegundo.

## Servidor y compatibilidad

- Migración 005 (`clients`): aditiva (tabla nueva e índices), compatible con clientes 2.6.x, que ignoran las rutas `/api/clients`. Debe aplicarse antes de usar el directorio de clientes.
- API y visor web en versión 2.7.0, compatibles con clientes 2.6.x.

## Distribución

Windows x64: instalador y portable. Linux x64: AppImage, Debian, pacman y tar.gz. Los paquetes Linux y los manifiestos de actualización se firman con la clave GPG fijada de SolarSim. Windows no dispone de firma Authenticode; macOS y ARM no forman parte de esta publicación.
