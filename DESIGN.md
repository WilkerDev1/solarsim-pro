---
name: SolarSim Pro — Centro empresarial
description: Sistema operativo de formularios y equipos, extendido desde Dashboard y Ajustes; asistente IA, inventario y resumen comercial conservan el mundo heredado.
colors:
  cc-bg: "#f6f8fa"
  cc-panel: "#fff"
  cc-border: "#dce2e8"
  cc-text: "#182230"
  cc-muted: "#536174"
  cc-selected: "#e8f7f0"
  cc-green: "#067451"
  cc-bg-dark: "#141619"
  cc-panel-dark: "#1c1f23"
  cc-border-dark: "#363b43"
  cc-text-dark: "#f1f3f5"
  cc-muted-dark: "#abb4c0"
  cc-selected-dark: "#123d30"
  cc-green-dark: "#6be0b5"
  action-green: "#087b58"
  action-green-hover: "#066344"
  danger: "#c93545"
  danger-dark: "#ff9aaa"
  error-bg: "#fff0f0"
  error-text: "#ad2435"
  error-bg-dark: "#401e25"
  error-text-dark: "#ffc0c9"
  ai-chat-bg: "#121b28"
  ai-chat-panel: "#192536"
  ai-chat-text: "#f1f5fa"
  ai-chat-muted: "#bccbdd"
  ai-chat-border: "#40536b"
  ai-chat-green: "#75e4bc"
  ai-chat-selected: "#163b32"
  ai-chat-control-bg: "#213047"
  ai-chat-control-border: "#597087"
  ai-chat-button-bg: "#253850"
  ai-chat-button-border: "#5b7290"
  assistant-message-bg: "#26374d"
  assistant-muted: "#bac7d8"
  assistant-control-border: "#52647b"
  assistant-focus: "#70dbb4"
typography:
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    letterSpacing: "-.025em"
  shell-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    letterSpacing: "-.025em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 550
  table-label:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  summary-metric:
    fontFamily: "Inter, sans-serif"
    fontSize: "23px"
    fontWeight: 600
    letterSpacing: "-.02em"
  summary-metric-compact:
    fontFamily: "Inter, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-.02em"
rounded:
  control: "8px"
  container: "12px"
spacing:
  control-gap: "8px"
  action-gap: "12px"
  field-gap: "20px"
  section-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action-green}"
    textColor: "{colors.cc-panel}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-primary-hover:
    backgroundColor: "{colors.action-green-hover}"
  button-secondary:
    backgroundColor: "{colors.cc-panel}"
    textColor: "{colors.cc-text}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  form-container:
    backgroundColor: "{colors.cc-panel}"
    textColor: "{colors.cc-text}"
    rounded: "{rounded.container}"
    padding: "28px"
  input:
    backgroundColor: "{colors.cc-panel}"
    textColor: "{colors.cc-text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  navigation-selected:
    backgroundColor: "{colors.cc-selected}"
    textColor: "{colors.cc-green}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  ai-button-primary:
    backgroundColor: "{colors.action-green}"
    textColor: "{colors.cc-panel}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  ai-button-secondary:
    backgroundColor: "{colors.cc-panel}"
    textColor: "{colors.cc-text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  ai-review-input:
    backgroundColor: "{colors.cc-panel}"
    textColor: "{colors.cc-text}"
    rounded: "{rounded.control}"
    padding: "9px 10px"
    height: "40px"
---

# Design System: SolarSim Pro — Centro empresarial

## Overview

**Creative North Star: "Centro de trabajo empresarial"**

El centro empresarial extiende la identidad de SolarSim: Inter, superficies neutras y verde para acciones y selección. Su carácter empresarial procede de la jerarquía de formularios, navegación explícita y tablas de miembros, sin decoración de marketing.

Esta extracción documenta la superficie empresarial implementada, no impone sus valores locales al simulador o al dossier PDF. Los colores `cc-*` pertenecen al ámbito del centro; Dashboard y Ajustes conservan sus propios tokens. La fuente normativa es `src/components/companies/company-center.css`, con tipografía heredada de `src/index.css`.

**Key Characteristics:**
- Formularios por propósito y tablas legibles.
- Tema claro y oscuro mediante roles equivalentes.
- Selección verde, bordes finos y superficies planas.
- Acciones explícitas próximas al contenido que modifican.

### Extensión: asistente IA e inventario

La extensión conserva el mismo mundo Operate. La evidencia normativa adicional es `src/components/common/ai-invoice/proposal-workspace.css`, `AIInvoiceScannerModal.tsx`, `ProposalDraftReview.tsx`, `ProposalConsumptionReview.tsx`, `ProposalCommercialReview.tsx` y `EquipmentManagerSettingsTab.tsx`. Los roles `--pw-*` de la revisión coinciden con los neutros y verdes del centro; la conversación tiene un ámbito azul marino permanente confirmado por el usuario y tokens locales `ai-chat-*`; el catálogo usa clases Tailwind equivalentes, sin convertir esas clases en tokens globales. Esta extracción registra únicamente esas superficies, sin reemplazar el sistema empresarial ni canonizar el PDF. La edición final del catálogo se evidencia además en `common/equipment/EquipmentOffersEditor.tsx`, `EquipmentAssetsEditor.tsx`, `EquipmentImagePreview.tsx` y `AIDatasheetScannerModal.tsx`.

La navegación del asistente reutiliza el dock principal completo, con su estado IA violeta heredado; no contiene una cabecera horizontal exterior. La fuente de ese patrón compartido es `src/components/layout/PrimaryIconDock.tsx`.

### Extensión: resumen de propuesta y seguimiento comercial

El resumen conserva el mundo Operate existente. La fuente adicional es `src/components/hub/project-summary.css`, `ProjectHubView.tsx`, `components/ProposalEnergyOverview.tsx`, `components/ProposalHistory.tsx`, `src/features/proposals/`, las vistas de tarjetas/lista de Dashboard y `common/Header.tsx`. Los roles locales `--ps-*` y `--pc-*` reutilizan los valores de fondo, panel, borde, texto, texto secundario y verde ya registrados; no crean otra identidad. El contrato concreto de esta superficie permanece en `.impeccable/surfaces/proposal-summary.md`.

## Colors

Neutros fríos en claro, grafito en oscuro y un acento verde funcional. El frontmatter registra los valores literales de la implementación; los sufijos `-dark` describen sus equivalentes de tema, no una segunda identidad.

### Primary

El verde de acción se usa en botones primarios y su variante de hover. El verde contextual se usa en selección, foco y estado; aumenta su luminosidad sobre grafito. El fondo seleccionado mantiene una zona verde tenue en ambos temas.

### Neutral

Los roles de fondo, panel, borde, texto y texto secundario distinguen estructura y legibilidad. El fondo de campo coincide con el panel en claro y con el fondo principal en oscuro. No se añade un token duplicado para esa coincidencia.

### Named Rules

**The Estado antes que adorno Rule.** El verde identifica selección, foco, estado o acción; la identidad corporativa cargada por el usuario no recolorea los controles de gestión.

Los rojos registrados corresponden a acciones destructivas y avisos de error, con variantes específicas de fondo y texto por tema; no son acentos decorativos.

### Extensión IA

La revisión usa verde contextual para foco y pestaña activa; preparar/aplicar conserva verde de acción y blanco. El chat mantiene azul marino en ambos temas: fondo, panel de mensaje y campo se separan tonalmente, con texto claro, bordes visibles y controles secundarios de azul más luminoso. Su acción primaria usa verde claro y texto oscuro. Estos roles pertenecen al chat y no recolorean el centro empresarial. Los avisos de revisión usan superficie de fondo y texto secundario; los bloqueadores usan el rol de error. El estado deshabilitado reduce opacidad: no expresa disponibilidad comercial ni resultados del análisis.

### Extensión de catálogo

Los enlaces de ficha e imágenes y la nota de conversión monetaria usan un verde más oscuro sobre blanco y más luminoso sobre grafito. La potencia del inversor conserva la misma equivalencia de contraste. Guardar e importar usan verde de acción con texto blanco y un hover más oscuro. Son variantes locales del catálogo; no sustituyen los roles `cc-*` ni `--pw-*`.

### Extensión de resumen y decisión

Aprobada usa verde contextual sobre fondo seleccionado; rechazada usa los roles de error. En espera y de prueba conservan selector neutro con texto explícito: el color no sustituye la decisión. El consumo del gráfico usa azul grisáceo y la generación verde, con leyenda y tabla mensual. Los literales locales de consumo se mantienen en el componente, sin incorporarlos como un acento global. La interfaz comercial distingue visualmente decisión, permisos y sincronización.

## Typography

**Body Font:** Inter con fallback sans-serif. La misma familia se utiliza en títulos; no hay un display editorial independiente en esta superficie. Los códigos de invitación usan monospace nativo como datos técnicos, no como lenguaje de marca.

### Hierarchy

- **Headline:** título de tarea, con espaciado ligeramente cerrado.
- **Shell title:** título persistente en la cabecera.
- **Title:** encabezados de formulario y sección.
- **Body:** explicación y valores editables en peso regular; los párrafos tienen interlínea (1.6) y ancho máximo (72ch).
- **Label:** etiqueta persistente de campo, en caja natural.
- **Table label:** nombres de columnas y pequeñas acciones de tabla.

### Named Rules

**The Jerarquía de trabajo Rule.** Los títulos identifican la tarea; las etiquetas permanecen en caja natural y los valores editables usan peso regular.

### Extensión IA e inventario

El asistente reutiliza texto operativo de (14px), títulos de sección de (16px), etiquetas de (13px) y contexto/nota de (12px). El encabezado local del modal usa (21px) y no redefine el título de pantalla del centro. Valores de consumo, cantidades y potencia usan numerales tabulares. El inventario mantiene nombre destacado y una línea secundaria de marca/modelo/tipo, sin convertir todo el catálogo en mayúsculas.

### Extensión de cifras de resumen

Las cuatro métricas repiten el rol `summary-metric`, con cifras tabulares, peso seminegrita y unidades subordinadas. El rol `summary-metric-compact` entra hasta (1150px); la defensa bajo (600px) reutiliza el tamaño de título de cabecera. Son roles de cifras del resumen, no nuevos tamaños para campos o navegación. Los títulos de sección conservan (16px/600), las etiquetas y botones (13px/550), las ayudas y cabeceras de tabla (12px). Los datos permanecen separados de sus unidades.

## Layout

La cabecera ocupa (64px); el cuerpo separa navegación lateral y contenido con scroll propio. En escritorio amplio, la navegación mide (264px), el área principal usa padding (36px 40px) y el contenido se limita a (980px), centrado en el espacio disponible. Los formularios agrupan dos columnas iguales con separación de campo; dirección y campos largos pueden abarcar ambas columnas. Las acciones se alinean al final y permiten wrap.

En el breakpoint implementado (1100px), la navegación pasa a (220px), el padding principal a (28px 24px) y el del formulario a (22px). Es una aplicación Electron para Linux y Windows, verificada desde (1024×700). El CSS también contiene una disposición defensiva bajo (760px): navegación superior envolvente y campos de una columna. Esto describe el código existente; no constituye un compromiso de producto móvil.

### Extensión IA e inventario

El asistente ocupa toda la ventana (100vw × 100dvh), sin margen exterior ni ancho máximo. El dock principal compartido ocupa (64px) y toda la altura a la izquierda, sin cabecera horizontal exterior. En el cuerpo restante, conversación/compositor comienza con ancho (360px), ajustable con divisor por puntero o teclado. El ajuste limita el ancho entre (280px) y el menor de (720px) o ventana menos dock (64px) y revisión reservada (400px). Flechas cambian el ancho en (24px); Home recupera el ancho automático, el mayor valor entre (330px) y (30%). La revisión ocupa el espacio restante. Ambas zonas tienen scroll propio; el pie de revisión queda fuera del scroll y la confirmación antecede crear/actualizar. A (1100px), el ancho automático del chat pasa a (300px); un ancho ajustado tiene precedencia y se reducen paddings; la vista principal de referencia es (1280×720) y el mínimo de producto sigue siendo (1024×700). Bajo (760px), el código apila ambas zonas como defensa, sin afirmar soporte de producto móvil.

Los formularios de revisión usan dos columnas con separación de (16px); campos largos abarcan ambas. Los doce consumos editables usan cuatro columnas; el gráfico conserva doce grupos mensuales con dos barras por grupo. Los ítems y descuentos se editan en tres columnas, reducidas a dos a (1100px). Los grupos de equipos alinean modelo, unidades y quitar; las notas de precio tienen su propia línea. El inventario usa una tabla compacta con nombre/modelo, nominal, ofertas y acciones, precedida por búsqueda y filtros. El flujo concreto queda en `.impeccable/surfaces/ai-proposal-inventory.md`, no como composición obligatoria de toda pantalla futura.

### Editor de catálogo e importación de fichas

El editor limita su ancho a (768px) y su altura a (90vh); cabecera, formulario desplazable y pie se distribuyen en columna. El formulario usa padding de (20px) y separación de (16px). El pie queda fuera del scroll, no se contrae y mantiene cancelar/guardar accesibles después de editar especificaciones, ofertas o adjuntos. Ofertas y documentos comparten contenedores de sección con padding de (16px), no modales comerciales adicionales.

El importador de fichas limita su ancho a (896px) y su altura a (92vh); cabecera y pie rodean el contenido desplazable. Las variantes se separan con divisores, nombre y modelo se alinean en dos columnas y las especificaciones principales en cuatro columnas; la disposición defensiva reduce estas a dos. Más especificaciones se abre mediante un control de detalle. Estas dimensiones describen los diálogos locales y no amplían el mínimo de producto.

### Resumen de propuesta y lista de inicio

El resumen ocupa el espacio restante del shell y tiene scroll vertical propio, padding (28px 32px) y columnas de contenido flexible más seguimiento comercial (340px), con separación (24px). Las secciones usan padding (24px). Hasta (1150px), el padding general pasa a (24px), el panel lateral a (300px), la separación a (16px) y las secciones a (20px). Hasta (1000px), las columnas se apilan y seguimiento aparece primero; los campos de estado/responsable se alinean en dos columnas y la nota/acciones abarcan el ancho. Las cuatro métricas pasan a dos columnas. Bajo (600px), campos y datos descriptivos pasan a una columna; las pestañas permiten scroll horizontal. A partir de (1700px), el padding lateral crece alrededor de un contenido de referencia de (1500px). Estas defensas no amplían el mínimo Electron de (1024×700).

Tarjetas y lista mantienen el selector comercial cerca de la identidad. El selector rápido reserva ancho entre (210px) y (230px), con altura mínima (36px); en lista, su celda reserva al menos (244px). La tabla admite desplazamiento horizontal y conserva ancho mínimo (760px), aumentado a (1120px) en el breakpoint `xl` de Tailwind (1280px). Bajo ese breakpoint, distribuidora/tipo/fecha aparecen bajo el documento en vez de ocupar columnas independientes. La decisión y sus acciones permanecen disponibles.

## Elevation & Depth

La superficie empresarial usa capas tonales, bordes de un píxel y espacio. No hay sombras en sus formularios, controles o navegación. El foco es una señal de interacción: contorno de dos píxeles en verde contextual y offset de tres píxeles. No es elevación ornamental.

### Named Rules

**The Superficie plana Rule.** La separación ordinaria se construye con fondo, borde y espacio; los formularios y tablas del centro no requieren sombras.

### Extensión modal IA

El asistente de ventana completa no tiene sombra exterior. Cabecera, pestañas, secciones y pie se separan con divisores de dos píxeles; filas de tabla y mensajes mantienen bordes de un píxel. La conversación usa capas tonales y mensajes delimitados. No se trasladan esas dimensiones de divisor a formularios del centro ni a filas de inventario. El punto de actividad pulsa únicamente durante una solicitud y pierde animación con `prefers-reduced-motion`; no es un acento decorativo persistente.

### Extensión de catálogo

**The Ofertas en contexto Rule.** Las ofertas de un modelo se editan en su misma sección, separadas por divisores horizontales; el contenedor agrupa la tarea sin añadir una tarjeta elevada por proveedor. El importador también separa variantes con divisores y reserva el fondo de aviso para coincidencias o resultados. La sombra pertenece al diálogo completo.

### Extensión de resumen

Las secciones técnicas, energéticas y comerciales permanecen planas, con borde fino y capas tonales. El foco visible usa contorno de dos píxeles con offset de dos; no expresa guardado ni sincronización. La cabecera compartida conserva su sombra tenue heredada para la vista activa; esa excepción de navegación no convierte los paneles del resumen en tarjetas elevadas.

## Shapes

Los controles, avisos y elementos seleccionados usan esquinas de control; los formularios usan esquinas de contenedor. La tabla mantiene filas rectangulares separadas por líneas horizontales, sin cápsulas por celda. El contrato inicial hablaba de formas de 12px; el código final distingue deliberadamente contenedores de 12px y controles de 8px.

La extensión IA usa una envolvente de ventana completa sin redondeo, controles y avisos de (8px), mensajes de conversación de (10px) y filas rectangulares con divisores. El inventario conserva filas de tabla; no añade cápsulas por modelo o métricas decorativas.

El resumen conserva contenedores de (12px), controles de (8px), filas rectangulares y divisores horizontales. Sus pestañas redondean sólo las esquinas superiores; las barras energéticas tienen un pequeño remate superior propio del gráfico, no una nueva escala de contenedores.

## Components

### Buttons

Botones de texto con iconos SVG cuando ayudan a identificar la acción. Altura mínima (38px), peso (550), borde fino y separación interna (8px). El botón secundario usa panel y borde del tema; el primario conserva verde de acción y texto blanco en ambos temas. Hover secundario usa fondo seleccionado. Disabled reduce opacidad a (0.5). Las variantes destructivas cambian el color del texto, sin convertirlas en acción principal.

### Cards / Containers

El formulario agrupa identidad, recursos o tarea de gestión. Fondo de panel, borde fino y padding de contenedor; no sombra. Las subsecciones usan un divisor superior y separación vertical, evitando anidar tarjetas para cada campo.

### Inputs / Fields

Etiqueta encima del campo con separación (8px). Altura mínima (42px), borde fino y fondo de campo por tema. Los valores se leen en peso regular; campos de solo lectura y placeholders usan texto secundario. Textareas permiten resize vertical y altura mínima (90px). El foco conserva el mismo contorno que los botones.

### Navigation

La navegación lateral usa botones de ancho disponible y altura mínima (44px), alineados a la izquierda. El estado `aria-current=page` se refleja con fondo seleccionado y texto verde contextual. Las subsecciones de organización se muestran como botones agrupados sobre un divisor, con el mismo tratamiento activo.

El asistente reutiliza `PrimaryIconDock` completo, con tema, proyectos, simulador, herramientas IA, nueva simulación, papelera, actualizaciones y ajustes. `assistantActive` marca IA como página actual con el tratamiento violeta heredado y evita marcar el proyecto o simulador de fondo. `beforeNavigate` llama al cierre del asistente antes de cambiar de destino; ese cierre cancela el análisis en curso. Los estilos de campos y botones del asistente se limitan al cuerpo de propuesta, de modo que el dock conserva sus clases y estados compartidos.

### Member table

Cabeceras pequeñas en texto secundario; filas con padding (14px 12px), borde inferior y acciones cerca del miembro. El contenedor permite scroll cuando la tabla lo necesita; no se ocultan acciones para simular una densidad menor.

### Notices

El aviso contextual usa fondo seleccionado, esquinas de control y padding (13px 16px). La variante de error usa los roles rojos por tema. La presencia de un componente no sustituye el contenido: los mensajes deben comunicar resultado o siguiente paso. La variante de error conserva su distinción de estado frente al aviso contextual.

### Asistente IA: compositor y revisión

El compositor compartido (`ChatComposer`, usado por el asistente de propuestas y el asistente general) es una caja única de radio (16px) sobre azul marino: fichas de adjuntos dentro de la caja, textarea sin tirador que crece con el contenido hasta (220px) y luego desplaza, adjuntar como icono circular de (34px) y enviar como botón circular de (36px) verde claro con flecha. Enter envía, Shift+Enter salta línea (Ctrl/Cmd+Enter también envía; nunca durante composición IME). Junto a los botones, una pista visible explica el atajo o, si no se puede enviar, el motivo (sin clave, sin texto); el botón deshabilitado cambia a azul apagado sin depender de opacidad. Durante el análisis el botón se convierte en detener. Se aceptan archivos arrastrados a la caja. El foco de la caja usa borde y halo verdes. Errores y ajustes pendientes aparecen como avisos sobre la caja.

La conversación usa `ChatMessage` compartido: usuario en burbuja alineada a la derecha, ancho máximo (85%), padding (10px 14px), esquinas (18px 18px 4px 18px), con fichas de los archivos enviados; asistente como texto continuo sin tarjeta, con marca circular de (26px) y autor «SolarSim IA»; los errores del análisis usan la misma columna con marca y etiqueta «No se completó» en roles de bloqueo. El markdown seguro compone párrafos, títulos de (15px), listas con viñeta verde y negritas. «Pensando» muestra puntos animados, estado, segundos transcurridos y, en el asistente general, los pasos de herramienta (título declarado en `shared/agentTools/definitions.ts`). El desplazamiento sigue los mensajes nuevos mientras se está al final; si se sube a leer, aparece «Ir al final». El estado vacío ofrece sugerencias que rellenan el mensaje sin enviarlo. Límites de archivos y privacidad se consultan en un detalle desplegable.

Los avisos del borrador («Revisemos estos detalles») se agrupan por gravedad en secciones plegables con contador: «Bloquean la creación» (errores de validación, abierta), «Por confirmar» (advertencias que piden una decisión, abierta) e «Informativos» (procedencia de datos y conciliación con la ficha, plegada). Cada aviso con campo asociado lleva un botón que cambia de pestaña, desplaza, enfoca y resalta el campo. La gravedad visible y el vínculo se derivan en presentación (`reviewIssues.ts`) a partir de código y severidad del aviso.

La revisión empieza con un resumen (cliente, potencia DC, equipos, total a pagar o «Pendiente») y una franja de estado con los puntos por revisar y cuántos bloquean, que lleva al primero. Se organiza en cuatro pestañas en forma de píldora: consumo y diseño, equipos, cotización, cliente y tarifa; cada una muestra un contador de pendientes en rojo (bloqueo) o ámbar (confirmar) con texto accesible. La fila de pestañas permanece visible en el scroll; selección usa relleno verde contextual y texto del color del panel, con foco por teclado y navegación por flechas, Home y End. Los campos que la IA no pudo confirmar llevan borde de estado y, debajo, el aviso con icono y prefijo textual («Bloquea:», «Confirmar:», «Nota:»), `aria-describedby` y `aria-invalid` en bloqueos. Las filas de equipos son fichas con borde lateral de estado; el modelo no confirmado se explica en la ficha («Solicitado … · En el borrador …») junto a «Confirmar el modelo seleccionado» en ámbar sólido. Acciones secundarias («Usar oferta del inventario», «Añadir modelo», «Empezar de nuevo») usan estilo contorno.

El pie es el paso final: rótulo «Paso final», casilla de revisión como tarjeta que se vuelve verde al marcarla, estado en vivo (bloqueos por resolver, confirmar, listo) y acción primaria verde de (46px) de alto y (220px) de ancho mínimo; deshabilitada usa fondo neutro y texto secundario. Actualizar una propuesta abierta añade confirmación contextual. Errores y carga tienen semántica `alert`/`status`; el diálogo conserva foco y Escape. Con el panel de revisión estrecho (consulta de contenedor) el resumen pasa a dos columnas, los campos a una y el pie se apila. Las advertencias de referencia histórica, consumo estimado y falta de ofertas se presentan como contenido operativo, no como garantía de precisión.

Roles de estado de la revisión por tema: confirmar `#7a4b00` sobre `#fff6e0` y `#ffd88a` sobre `#3a2d12`; bloqueo `#ad2435` sobre `#fff0f0` y `#ffc0c9` sobre `#401e25`; informativo `#2c4a6e` sobre `#eef4fb` y `#c3d9f1` sobre `#1d2a38`. En el chat azul marino: bloqueo `#ffc9d0`/`#3b202d`, confirmar `#ffe2a3`/`#3a2d12`, informativo `#cfe0f3`/`#1b2a3d`.

### Asistente IA: ajustes de contraste y jerarquía (ronda 2)

Revisión. Los campos usan `--pw-field-border` (`#7a8799` claro, 3.65:1 sobre `#fff`; `#6f7885` oscuro, 3.70:1 sobre el panel y 4.06:1 sobre el campo hundido `#141619`); en oscuro el fondo del campo es `--pw-bg`. `--pw-border` queda para divisores. La acción principal usa `#087b58` en ambos temas (blanco 5.27:1; el `#0b8a63` oscuro anterior daba 4.35:1). El color fuerte de gravedad sólo aparece en el campo o fila donde se actúa; la franja, el pie y el chat usan superficie neutra con icono o borde de color. Una franja pegajosa única reúne las pestañas en una fila (etiquetas cortas bajo 760 px de contenedor), el total y el botón «N por revisar», que lleva al primer bloqueo y, si no hay, al primer punto por confirmar. Insignias sólidas con icono (bloqueo `#fff` sobre `#ad2435`, 6.82:1, y `#401e25` sobre `#ff9aaa`, 7.31:1; confirmar `#fff` sobre `#7a4b00`, 7.41:1, y `#3a2d12` sobre `#ffd88a`, 9.87:1) con anillo del color del panel frente al relleno verde de la pestaña activa; sin pendientes, check verde. El resumen es una fila de cuatro fichas (sin línea secundaria bajo 900 px). El pie es una fila: casilla compacta, estado neutro con icono de gravedad y principal de 42 px. Con bloqueos el principal dice «Resolver N bloqueos →», lleva al primero y queda `aria-disabled` con contorno verde y relleno suave (`#065a40` sobre `#d6ede5`, 6.72:1; oscuro `#c9f5e5` sobre `#123d30`); sin la casilla, enfoca la casilla; sólo con la guarda del hook (`canApply`) crea. Las filas de equipo son una cuadrícula Modelo · Unidades · Costo unit. · Total · Quitar, con el origen del costo como ficha y «Usar oferta del inventario» terciario sólo si el costo es particular; el modelo no confirmado se presenta como «La IA pidió / Seleccionado» con «Confirmar este modelo» y «Cambiar modelo». La tabla de costos usa «—» en celdas sin dato, una ficha «Falta costo» por fila, «Subtotal provisional» y cabecera pegajosa bajo la franja. El esqueleto de carga reproduce resumen, pestañas y campos con contraste visible. «Empezar de nuevo» es terciario y pide confirmación en línea si hay borrador.

Chat. El digest de avisos va dentro del último turno del asistente: cabecera con fichas por gravedad y barra de progreso «N de M resueltos»; filas compactas sobre el panel con borde izquierdo de gravedad (`#ff8e9c` 7.06:1, `#f0b85a` 8.61:1 sobre `#192536`), texto a dos líneas y destino como enlace (a la derecha desde 520 px de ancho); tres filas por grupo y «Ver N más»; «Por confirmar» cerrado mientras haya bloqueos. Cada turno del asistente tiene copiar y, en el último, reintentar (reutiliza el envío existente); el del usuario, «volver a escribir». Un error es un turno con titular legible, «Detalles técnicos» plegado, «Reintentar» y, si falta la clave, «Abrir ajustes de IA». El registro y el digest tienen `aria-live="off"`; una región `status` persistente anuncia «Pensando…», «Respuesta lista: N puntos pendientes» o «La respuesta no se completó». Durante la respuesta el campo es `readOnly` con `aria-busy` (conserva el foco, Esc detiene) y el envío sigue bloqueado. Una respuesta más alta que la vista se ancla por su inicio; «Ir al final» flota dentro del registro con un fundido inferior. El avatar va en la línea del autor y la cabecera ocupa una línea; el texto se limita a 68ch y las barras de desplazamiento son finas (`#6b7f99`, 4.22:1). En reposo el compositor muestra un placeholder corto, sin ayuda visible (el motivo de deshabilitado queda para lectores de pantalla) y la ayuda de teclado sólo con texto y foco; enviar deshabilitado usa `#a9b9cc` sobre `#2b3b52` (5.67:1). El estado vacío ofrece «Adjuntar factura (PDF o foto)» como acción y, sin clave, el aviso de configuración en lugar de las sugerencias.

### Asistente IA: consumo y dimensionamiento

El resumen usa cuatro métricas en dos columnas, etiquetas pequeñas y valores tabulares; distingue datos observados, estimados y pendientes. El gráfico mensual compara consumo gris y generación verde, con leyenda explícita y doce grupos sobre una base común. La tabla editable siguiente mantiene etiquetas de mes y unidades; no completa huecos visualmente con valores inventados. Cambiar datos comerciales no elimina el análisis energético disponible.

La meta de cobertura y el modelo a dimensionar se muestran como campos ordinarios. El resultado explica potencia objetivo e instalada antes de una acción explícita para aplicar la cantidad sugerida al grupo seleccionado. Otros grupos y equipos permanecen visibles y se conservan. El mes pico requiere confirmación y queda identificado como estimación. La procedencia visible distingue historial observado, estimado, del proyecto y consumo teórico temporal igual a producción. La opción teórica queda etiquetada como «sin factura» y conserva la explicación de que la demanda deriva de equipos; el dimensionamiento contra esa misma producción se deshabilita. Producción/consumo describe energía, no promete ahorro facturable.

### Asistente IA: cotización revisable

La tabla de costos detalla componente, cantidad, unitario USD, total USD e ITBIS USD; cantidad y costo se editan en la fila, con origen debajo del modelo: costo particular del borrador, oferta del inventario o «Precio genérico (sin proveedor)». Las cabeceras usan fondo tonal y divisor de dos píxeles; los modelos largos se envuelven, sin truncamiento. El documento distingue costos de compra, precios de venta por aclarar y base pendiente. Los totales documentados se concilian en USD con el cálculo y las diferencias se señalan como revisión, sin sumarlas como extras. Mano de obra, recargo sobre costo o margen sobre venta se editan con etiquetas y unidades explícitas. Los costos particulares de la cotización se distinguen de las ofertas del inventario y del precio genérico; restaurar una oferta es una acción visible. Ítems adicionales y descuentos usan filas de formulario separadas por divisores, con añadir/quitar próximos a su lista. Las opciones de exoneración y destino del descuento acompañan los importes, sin esconder su efecto fiscal.

Los números de la tabla se alinean a la derecha con numerales tabulares; los importes pendientes son una ficha ámbar «Pendiente» y la fila sin precio lleva marca lateral ámbar. Un pie de tabla suma el total de equipos con precio (y lo nombra así si faltan costos). La conciliación con la ficha es una tabla ficha/cálculo/diferencia. El resumen calculado encabeza la pestaña con fondo tonal y cuatro pares etiqueta/valor; «Total a pagar» se destaca con borde verde y valor de (22px). Cuando faltan costos se denomina subtotal provisional; no trata ausencia de precio como oferta gratuita. La revisión conserva confirmación humana y no modifica el catálogo al editar una cotización.

### Inventario: modelos y ofertas

Nombre completo clicable, potencia/capacidad con unidad, especificación secundaria y ofertas junto a editar/eliminar. Sin precio disponible es un estado visible, no un importe cero inventado. Con sesión, el precio genérico del modelo va en una línea gris de (12px) bajo las ofertas («Genérico US$ X»); sin genérico no se añade línea. Acciones de importar ficha, importar precios y nuevo equipo preceden búsqueda/filtros. Los modelos usan contraste equivalente claro/oscuro y acciones de icono con nombre accesible.

### Inventario: edición de ofertas y adjuntos

La sección de precios mantiene proveedor y SKU en dos columnas; moneda, precio unitario y existencias en tres. Notas y quitar cierran cada fila. Añadir oferta permanece junto al título de sección y el estado vacío explica el siguiente paso. Campos operativos usan texto de (14px) y etiquetas/contexto de (12px), con bordes y superficies equivalentes por tema. La conversión DOP muestra la tasa editable y el importe almacenado en USD en su propia línea, sin esconderlo en un tooltip. Las ofertas quedan en el formulario hasta confirmar el equipo. El precio genérico aparece encima de las ofertas como texto gris de solo lectura, con la pista de que se cambia desde las ofertas del equipo.

Ficha e imágenes se agrupan después de ofertas: selección de archivo, nombre descargable y desvincular quedan próximos. Las imágenes usan miniaturas contenidas de (64px), con nombre alternativo y reserva neutra cuando la vista previa no está disponible. La interfaz distingue catálogo local de adjuntos del servidor, informa el requisito de sesión y muestra procesamiento/error junto a la tarea. Guardar queda deshabilitado mientras se procesa un adjunto; el pie visible conserva cancelar.

### Inventario: revisión de ficha importada

Cada variante ofrece selección explícita, nombre/modelo editables y campos con unidades; los valores ausentes muestran «Sin dato». Las especificaciones adicionales se despliegan debajo de la misma variante. Una posible coincidencia usa aviso ámbar con explicación y opciones visibles para actualizar el equipo o crear un modelo independiente. La selección y el resultado no se comunican sólo por color. El pie mantiene analizar/importar próximos al estado y permite cerrar; errores y resultados usan semántica de alerta/estado.

### Asistente general experimental

La misma conversación se reutiliza en un panel flotante local, desactivado por defecto y disponible en Inicio, Hub y Simulador. El control de apertura aparece abajo a la derecha, a (24px) de ambos bordes. El panel usa ancho (390px), ampliable a (580px), con límite de ancho de ventana menos (90px); altura normal hasta (660px) y ampliada hasta (800px), limitadas por viewport. Bajo (760px), el margen pasa a (12px) y el límite de ancho a ventana menos (24px). Cabecera, log desplazable y compositor permanecen en columna. La superficie azul marino usa radio (16px), borde fino y sombra ambiental; esta elevación pertenece al panel flotante, no a las tablas de gestión.

La cabecera conserva el estilo operativo existente: padding (14px 16px), divisor inferior, título (14px/600), contexto secundario y controles de icono (32px), sin introducir una nueva rampa global. Ofrece reiniciar, ampliar/comprimir y cerrar; durante consulta el envío pasa a cancelar. El textarea tiene altura (64–160px), radio (12px) y foco visible. Contexto y privacidad se presentan en un detalle desplegable. Resultados y sugerencias usan tarjetas React propias con divisor perimetral, radio (10px) y padding (12px); títulos, detalle y acciones se leen en orden. Las sugerencias muestran campos y requieren confirmar o descartar. Las vistas previas pertenecen a esas tarjetas: las imágenes conservan proporción con object-fit contain y altura máxima (220px). La ficha PDF muestra su primera página renderizada con `PDFThumbnailService`/PDF.js y ofrece «Descargar ficha completa» mediante enlace subrayado con foco visible. Si no se genera la miniatura, se mantiene una explicación y la descarga. La vista PDF en iframe fue retirada tras observarse en blanco. Este registro deriva de `src/features/assistant/chat.css`, `ChatMessage.tsx`, `AppAssistant.tsx`, `AssistantResultCard.tsx` y `useResizablePanel.ts`; no declara integración MCP-UI.

La estructura y valores anteriores se contrastaron con código y fixtures locales. El finish reviewer emitió `ship` sobre cinco capturas a resolución nativa (1280×720, 1286×900 y mínimo 1024×700): `confirmed-light.jpg`, `equipment-dark-expanded.jpg`, `proposal-chat-light.jpg`, `proposal-minimum-dark.jpg` y `global-minimum-dark.jpg`, en `/tmp/solarsim-global-qa/`. `assets-preview.jpg` documenta además imagen y primera página PDF sintéticas después de corregir el iframe. La evidencia cubre esas superficies y estados de QA; solo se hicieron GET a archivos del servidor local, sin llamadas Gemini ni escrituras en producción. Las capturas son evidencia de prueba, no recursos del producto; los adjuntos empresariales y el modelo real quedan fuera de esta verificación.

### Navegación de propuesta y secciones del resumen

La cabecera compartida ofrece Resumen, Simulador y Propuesta PDF sobre la misma propuesta activa, con `aria-current=page`, texto y SVG. El resumen contiene su navegación local Vista general, Finanzas e Historial y versiones; fondo seleccionado y verde contextual identifican la sección activa. Finanzas presenta sus paneles y el seguimiento comercial explícito, sin repetir el selector segmentado del simulador. Ver documento y compartir quedan como acciones próximas a la identidad; las herramientas de edición/exportación PDF conservan su vista propia.

### Resumen técnico, energía y finanzas

Las cifras principales separan potencia instalada, precio cotizado, ahorro estimado del primer año y retorno simple estimado. El sistema propuesto usa tabla de modelo, cantidad y nominal unitario, con tipo subordinado. Balance energético combina totales anuales, gráfica de (240px), leyenda y detalle mensual desplegable; consumo y producción tienen nombre y unidades. Un texto accesible resume el gráfico. No se presenta cobertura energética como ahorro monetario. Finanzas usa pares etiqueta/valor y separa precio pagable, ITBIS, crédito fiscal e inversión neta; la aclaración fiscal acompaña los importes. Los cálculos vienen del motor y del modo energético efectivo.

### Seguimiento comercial y resultados de inicio

El selector rápido compartido entre tarjeta y lista cambia sólo la decisión; detener propagación evita abrir o arrastrar la propuesta al operarlo. Su nombre accesible identifica la propuesta y los errores aparecen junto al campo con semántica de alerta. El panel detallado separa el estado actual del registro de reportes. El selector actual sigue siendo independiente; cada reporte conserva estado, responsable, autor, fecha, identificador y nota propios. El formulario de nuevo reporte mantiene etiquetas visibles, separación de campos (16px), textarea redimensionable de al menos (100px), guardar y cancelar. La casilla explícita permite actualizar también el estado y responsable actuales; registrar un reporte no reescribe los anteriores. Los controles deshabilitados comunican solo lectura, conflicto o falta de permiso.

**The Decisión independiente Rule.** Estado comercial, estado documental y sincronización se muestran por separado. Guardar un reporte confirma el equipo local y anuncia envío posterior al sincronizar; no presenta esa operación como confirmación del servidor. Las cifras aprobadas describen cotizaciones actuales y conservan esa aclaración junto a los resultados.

Inicio filtra la decisión comercial con un selector compacto en la barra superior, junto al buscador y con el mismo borde, altura y fondo; cada opción muestra su contador y el estado activo usa el verde de selección. Bajo la barra, una línea secundaria de (11px) resume en espera, aprobadas, rechazadas y de prueba; «Por responsable» abre bajo demanda un panel flotante (Escape o clic fuera lo cierran y el foco vuelve al botón) con tabla compacta de números tabulares y scroll horizontal. El popover «Filtros» ya no repite el estado. Su texto aclara el ámbito de búsqueda/carpeta, la exclusión de pruebas y papelera y el denominador de aprobación. Las propuestas de prueba conservan contador/filtro, pero no entran en la comparación comercial.

### Historial local y límites de evidencia

El historial se denomina local y separa las versiones con divisores, autor/fecha y acciones próximas: guardar, comparar y restaurar contenido. La comparación usa tabla con valores guardados y actuales; restaurar pide confirmación y explica que conserva el seguimiento comercial. Cambiar proyecto, espacio o sesión reinicia el ámbito de edición/comparación mediante claves de propietario; la documentación visual no sustituye las comprobaciones de permiso del store/API.

La evidencia de acabado aportada para esta extensión está en `.impeccable/review/hub-{light,dark}-{1400,1024}.png`, `hub-finance.png`, `dashboard-cards.png`, `dashboard-list.png` y `dashboard-list-1024.png`. El revisor cerró en `ship` tras resolver anchura del selector/lista y selector duplicado de Finanzas. Este registro se contrastó con las fuentes construidas; no verifica un despliegue de servidor ni sincronización entre dispositivos y no amplía la evidencia a otros estados o al PDF.

### Ofertas de un equipo: lista y editor excluyentes

`SupplierPricesDetailModal.tsx` y `suppliers/equipment-offers.css` mantienen un diálogo nativo con los roles `--sp-*` de proveedores. Lista y editor ocupan alternativamente el mismo cuerpo; editar no abre otro modal ni deja una segunda lista debajo. La cabecera identifica equipo y precio de compra unitario USD; las filas separadas por divisores mantienen proveedor, importe, stock y acciones próximas. El formulario usa dos columnas, separación (20px), campos de al menos (40px) y notas a ancho completo. Volver a ofertas y cancelar protegen cambios sin guardar. Proveedor, precio positivo, duplicados y cambios concurrentes se validan antes de indicar guardado; el mensaje distingue persistencia local de sincronización pendiente.

Con sesión, la cabecera añade una línea gris «Genérico US$ X · fecha» (o «Sin precio genérico») con «Cambiar»/«Asignar» y «Quitar» como enlaces verdes; cambiar edita el importe en la misma línea (campo de 120px, Guardar/Cancelar compactos) y quitar pide confirmación. Tras guardar una oferta, la sugerencia de precio genérico ocupa el lugar del mensaje de guardado: una línea gris con un botón de contorno compacto y descartar; no es un diálogo ni un aviso de color. La misma línea se usa en la administración de proveedores y bajo el mensaje del catálogo tras guardar el editor del equipo. En el importador de precios, cada fila no omitida lleva bajo el precio la casilla «Actualizar genérico» en texto de (10px).

El diálogo mide hasta (720px), limitado al viewport menos (32px), con altura máxima (90vh), cabecera y pie propios y cuerpo desplazable. Bajo (600px), formulario y filas pasan a una columna. Los roles claros/oscuros equivalen a los neutros existentes; el pie usa la capa tenue de proveedores. Ofertas y organización de propuestas comparten sombra modal (`0 20px 64px #0004`) y backdrop (`#0008`); su radio local de (14px) no amplía la escala global de contenedores.

### Logotipos de encabezado por destino

`PDFDocumentDataEditor.tsx` conserva dos controles independientes: encabezado PDF, con vista previa sobre fondo oscuro, y encabezado web, con vista previa blanca para la versión a color. Ambos mantienen selección de archivo, cambiar y restaurar próximos a su vista previa, con nombres accesibles propios. La miniatura web contenida mide (96×48px). El texto explica que su cambio se aplica al publicar un enlace nuevo. Estos controles no extienden su tipografía compacta heredada ni rediseñan las páginas PDF.

### Familias de propuestas y menú contextual

`ProposalGroupControls.tsx`, `proposalGroups.ts` y `proposal-groups.css` reutilizan los neutros y el verde del mundo Operate. El menú se abre mediante clic derecho, gesto contextual del trackpad, tecla de menú o Shift+F10; dirige el foco a su acción y se descarta con Escape, Tab, clic exterior, scroll o cambio de tamaño. El diálogo ofrece principal, color editable y guardar/cancelar, con foco visible y errores próximos. Elegir otro principal muestra el color del destino; guardar ese enlace no cambia el color del grupo salvo una edición explícita del color.

**The Familia visible Rule.** La línea de color de (3px) identifica parentesco entre propuestas y está solicitada expresamente; no es un adorno de selección ni un patrón para formularios ajenos. La lista añade sangría de (20px) por nivel, limitada a seis niveles; las tarjetas conservan el desplazamiento local de (16px) para vinculadas. Texto e icono distinguen Principal, Vinculada y Principal no disponible. Los colores editables de familia pertenecen al contenido organizado, no recolorean navegación o acciones. La jerarquía conserva los filtros: ordena coincidencias por familias sin reinsertar antecesores ocultos y mantiene el orden visible de las vinculadas.

El arrastre espera (850ms) sobre destino antes de activar contorno, fondo contextual y «Soltar para enlazar»; sólo soltar después confirma el enlace. Salir del destino, Escape, fin del arrastre o perder foco cancela la preparación. El feedback permanece textual; hover y color no equivalen a un enlace guardado.

### Reportes comerciales conservados

`ProposalCommercialPanel.tsx` y `proposal-commercial.css` muestran primero el estado actual y después Reportes con contador y Nuevo reporte. El último reporte permanece abierto; los anteriores se consultan mediante detalles desplegables, con estado y fecha en el resumen. Nota preserva saltos de línea; responsable, autor e ID quedan en el cuerpo. Divisores finos y espaciado separan registros sin tarjetas anidadas. El formulario asigna ID y fecha al guardar; cancelar pide descartar si hay nota escrita. Una nota anterior se presenta como registro compatible cuando aún no existe colección de reportes. La colección persistida admite hasta (500); alcanzar ese límite deshabilita añadir, sin presentar los registros como actividad de servidor verificada.

Esta actualización documental se basa en las fuentes construidas citadas. No atribuye revisión visual a las capturas nuevas de `.impeccable/review/four-updates/`, que no se abrieron en este registro, ni confirma despliegue o sincronización entre dispositivos. No añade seguimiento comercial a Finanzas del simulador.

## Dock de parámetros (variante C)

El dock de parámetros del simulador (`src/components/simulator/sidebar/` y `params/`) usa un sistema plano propio, independiente de los roles `cc-*` del centro empresarial. Los colores son variables CSS `--pd-*` en `src/index.css`: los valores claros van en `:root` y los oscuros en `.dark`. Se registran como `pd-*` en `tailwind.config.js` (`theme.extend.colors`) y se consumen por clase (`bg-pd-panel`, `text-pd-muted`, `border-pd-border`). El modo oscuro vive en los tokens: ningún componente del dock lee `isDark` ni escribe un color suelto de Tailwind (`emerald-*`, `slate-*`, `amber-*`).

### Tokens `pd-*`

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `pd-panel` | `#ffffff` | `#18181b` | Fondo del panel del dock |
| `pd-border` | `#e4e4e7` | `#2e2e33` | Bordes y divisores de sección |
| `pd-text` | `#18181b` | `#fafafa` | Títulos y valores |
| `pd-muted` | `#52525b` | `#a1a1aa` | Etiquetas y unidades |
| `pd-strong` | `#3f3f46` | `#d4d4d8` | Encabezado del dock y texto de campos deshabilitados |
| `pd-subtle` | `#71717a` | `#71717a` | Texto terciario e iconos de ayuda |
| `pd-field` | `#f4f4f5` | `#27272a` | Campos, selects y botones inactivos |
| `pd-field-border` | `#e4e4e7` | `#3f3f46` | Borde de campos |
| `pd-field-ro` | `#fafafa` | `#1f1f22` | Fondo de campos de solo lectura |
| `pd-field-ro-border` | `#d4d4d8` | `#3f3f46` | Borde punteado de campos de solo lectura |
| `pd-outline` | `#d4d4d8` | `#3f3f46` | Contorno de botones secundarios |
| `pd-item` | `#fafafa` | `#202023` | Tarjetas de ítem y franjas de indicadores |
| `pd-icon-tile` | `#18181b` | `#27272a` | Fondo del cuadro de icono de sección |
| `pd-icon-tile-border` | `#18181b` | `#3f3f46` | Borde del cuadro de icono |
| `pd-icon-tile-text` | `#ffffff` | `#fafafa` | Icono del cuadro de icono |
| `pd-accent` | `#047857` | `#10b981` | Único acento: selección, interruptor activo, acción principal |
| `pd-on-accent` | `#ffffff` | `#052e1c` | Texto o icono sobre el acento |
| `pd-warn-bg` | `#fef3c7` | `#3a2a0c` | Fondo del chip «valor distinto al oficial» |
| `pd-warn-text` | `#92400e` | `#fcd34d` | Texto del chip de advertencia |
| `pd-negative` | `#be123c` | `#fda4af` | Descuentos y acciones destructivas |
| `pd-switch-off` | `#d4d4d8` | `#3f3f46` | Interruptor apagado |
| `pd-knob` | `#ffffff` | `#fafafa` | Botón interior del interruptor apagado |
| `pd-chip-bg` | `#e4e4e7` | `#3f3f46` | Fondo de chips informativos |
| `pd-chip-text` | `#3f3f46` | `#e4e4e7` | Texto de chips informativos |
| `pd-solar` | `#f59e0b` | `#fbbf24` | Leyenda de energía: solar |
| `pd-grid` | `#a1a1aa` | `#71717a` | Leyenda de energía: red |
| `pd-bess` | `#0891b2` | `#22d3ee` | Leyenda de energía: batería |

### Reglas de uso

- **Un solo acento, solo para estado activo.** `pd-accent` aparece únicamente en la opción seleccionada, el interruptor activo, el margen seleccionado, el precio de venta y el atajo «Hoy». No colorea secciones, encabezados ni decoración.
- **Interruptor cuadrado.** `SquareSwitch` mide 34 × 20 px, con esquinas de 5 px y botón interior de 16 px con esquinas de 3 px y margen de 2 px. Nunca es redondo. Lleva `role="switch"` y `aria-checked`.
- **Campos de solo lectura con borde punteado.** Un valor bloqueado (identificadores) usa `Field` con la variante `locked`: borde punteado `pd-field-ro-border` sobre `pd-field-ro`. El texto deshabilitado sigue legible (`-webkit-text-fill-color` con `pd-strong`).
- **Sin fondos de color por sección, sin emojis ni párrafos explicativos.** Las explicaciones (Ley 57-07, SIE-007, la nota de DGII) van en un `InfoTip` (icono ⓘ con tooltip y `aria-label` con el texto completo).
- **Valor distinto al oficial.** Solo `WarnChip` usa `pd-warn-bg` y `pd-warn-text`. Los descuentos y las acciones destructivas usan `pd-negative`.
- **Leyenda de energía.** `pd-solar`, `pd-grid` y `pd-bess` solo existen en `EnergyLegend`.
- **Forma y tipografía.** Radio de 6 px en campos, botones, interruptor y cuadro de icono; 12 px en el panel. Inter, con valores numéricos e identificadores en `font-mono`. Etiquetas de 13 px en filas y de 12 px sobre campos; subencabezados de 11 px en mayúsculas con espaciado de .08em. Encabezado de sección de 48 px con cuadro de icono de 28 px.
- **Contraste.** Mínimo de 4.5:1 en texto, en ambos modos.
- **Componentes base cerrados.** Viven en `params/ui/`; si una sección necesita algo más, lo crea en su propia carpeta en vez de editarlos.

## Do's and Don'ts

### Do:

- **Do** usar los roles del tema para texto, bordes y superficies.
- **Do** conservar etiquetas visibles, foco por teclado y acciones de guardar y descartar.
- **Do** reservar el verde de selección para el ámbito activo y las acciones pertinentes.
- **Do** mantener la lectura compacta de miembros con divisores horizontales y nombres completos.

### Don't:

- **Don't** reutilizar valores oscuros fijos para una superficie que cambia de tema; la conversación IA constituye el ámbito oscuro permanente confirmado por el usuario.
- **Don't** trasladar la paleta de una empresa al sistema de navegación.
- **Don't** convertir una captura de QA o su contenido sintético en un recurso del producto.
- **Don't** extender estas dimensiones del centro al PDF aprobado.


No canonizado: las etiquetas nativas del selector de archivos en inglés, visibles en las capturas de QA, son una limitación de localización del artefacto, no una regla visual para nuevas superficies. Las capturas de QA no son assets de distribución.

No canonizado en la extensión IA: 10/11px del editor de equipos heredado, observados por detector como tamaños fuera de rampa; no se convierten en pasos aprobados para nuevas pantallas. Las anotaciones de mes del gráfico local usan 11px; ese detalle no amplía la rampa tipográfica global. Tampoco se canonizan contenido ni controles de fixtures QA.

No canonizado en resumen: el texto del selector rápido en tema oscuro (`#d0d7e0`) y la banda de hover del gráfico (`#2a3037`) son variantes locales observadas, no nuevos roles globales; los ticks de (11px) siguen siendo una limitación local de legibilidad del gráfico. Los tamaños de métricas (23px/20px) sí se registran por su uso repetido en cuatro cifras y su adaptación compacta, no para eliminar avisos del detector.

No canonizado en las cuatro extensiones: radios modales locales de (14px), microtexto heredado del editor PDF y el ID de reporte a (11px) no amplían la rampa global. La línea familiar de (3px) es una excepción funcional solicitada expresamente, no un defecto ni una prohibición general.

Las tarjetas de cada familia ocupan una columna y se apilan en orden principal/hijas, sin panel exterior adicional. La sangría permanece en cada hija; familias distintas comparten la cuadrícula existente. El pie del diálogo de ofertas mantiene Cancelar/Guardar visibles mientras se desplazan los campos.
