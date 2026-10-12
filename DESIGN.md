---
name: SolarSim Pro — Centro empresarial
description: Sistema operativo de formularios y equipos, extendido desde Dashboard y Ajustes; asistente IA e inventario conservan el mundo heredado.
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

## Layout

La cabecera ocupa (64px); el cuerpo separa navegación lateral y contenido con scroll propio. En escritorio amplio, la navegación mide (264px), el área principal usa padding (36px 40px) y el contenido se limita a (980px), centrado en el espacio disponible. Los formularios agrupan dos columnas iguales con separación de campo; dirección y campos largos pueden abarcar ambas columnas. Las acciones se alinean al final y permiten wrap.

En el breakpoint implementado (1100px), la navegación pasa a (220px), el padding principal a (28px 24px) y el del formulario a (22px). Es una aplicación Electron para Linux y Windows, verificada desde (1024×700). El CSS también contiene una disposición defensiva bajo (760px): navegación superior envolvente y campos de una columna. Esto describe el código existente; no constituye un compromiso de producto móvil.

### Extensión IA e inventario

El asistente ocupa toda la ventana (100vw × 100dvh), sin margen exterior ni ancho máximo. El dock principal compartido ocupa (64px) y toda la altura a la izquierda, sin cabecera horizontal exterior. En el cuerpo restante, conversación/compositor ocupa el mayor valor entre (330px) y (30%) y la revisión el espacio restante. Ambas zonas tienen scroll propio; el pie de revisión queda fuera del scroll y la confirmación antecede crear/actualizar. A (1100px), conversación pasa a (300px) y se reducen paddings; la vista principal de referencia es (1280×720) y el mínimo de producto sigue siendo (1024×700). Bajo (760px), el código apila ambas zonas como defensa, sin afirmar soporte de producto móvil.

Los formularios de revisión usan dos columnas con separación de (16px); campos largos abarcan ambas. Los doce consumos editables usan cuatro columnas; el gráfico conserva doce grupos mensuales con dos barras por grupo. Los ítems y descuentos se editan en tres columnas, reducidas a dos a (1100px). Los grupos de equipos alinean modelo, unidades y quitar; las notas de precio tienen su propia línea. El inventario usa una tabla compacta con nombre/modelo, nominal, ofertas y acciones, precedida por búsqueda y filtros. El flujo concreto queda en `.impeccable/surfaces/ai-proposal-inventory.md`, no como composición obligatoria de toda pantalla futura.

### Editor de catálogo e importación de fichas

El editor limita su ancho a (768px) y su altura a (90vh); cabecera, formulario desplazable y pie se distribuyen en columna. El formulario usa padding de (20px) y separación de (16px). El pie queda fuera del scroll, no se contrae y mantiene cancelar/guardar accesibles después de editar especificaciones, ofertas o adjuntos. Ofertas y documentos comparten contenedores de sección con padding de (16px), no modales comerciales adicionales.

El importador de fichas limita su ancho a (896px) y su altura a (92vh); cabecera y pie rodean el contenido desplazable. Las variantes se separan con divisores, nombre y modelo se alinean en dos columnas y las especificaciones principales en cuatro columnas; la disposición defensiva reduce estas a dos. Más especificaciones se abre mediante un control de detalle. Estas dimensiones describen los diálogos locales y no amplían el mínimo de producto.

## Elevation & Depth

La superficie empresarial usa capas tonales, bordes de un píxel y espacio. No hay sombras en sus formularios, controles o navegación. El foco es una señal de interacción: contorno de dos píxeles en verde contextual y offset de tres píxeles. No es elevación ornamental.

### Named Rules

**The Superficie plana Rule.** La separación ordinaria se construye con fondo, borde y espacio; los formularios y tablas del centro no requieren sombras.

### Extensión modal IA

El asistente de ventana completa no tiene sombra exterior. Cabecera, pestañas, secciones y pie se separan con divisores de dos píxeles; filas de tabla y mensajes mantienen bordes de un píxel. La conversación usa capas tonales y mensajes delimitados. No se trasladan esas dimensiones de divisor a formularios del centro ni a filas de inventario. El punto de actividad pulsa únicamente durante una solicitud y pierde animación con `prefers-reduced-motion`; no es un acento decorativo persistente.

### Extensión de catálogo

**The Ofertas en contexto Rule.** Las ofertas de un modelo se editan en su misma sección, separadas por divisores horizontales; el contenedor agrupa la tarea sin añadir una tarjeta elevada por proveedor. El importador también separa variantes con divisores y reserva el fondo de aviso para coincidencias o resultados. La sombra pertenece al diálogo completo.

## Shapes

Los controles, avisos y elementos seleccionados usan esquinas de control; los formularios usan esquinas de contenedor. La tabla mantiene filas rectangulares separadas por líneas horizontales, sin cápsulas por celda. El contrato inicial hablaba de formas de 12px; el código final distingue deliberadamente contenedores de 12px y controles de 8px.

La extensión IA usa una envolvente de ventana completa sin redondeo, controles y avisos de (8px), mensajes de conversación de (10px) y filas rectangulares con divisores. El inventario conserva filas de tabla; no añade cápsulas por modelo o métricas decorativas.

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

El compositor reúne adjuntos, texto y preparar/refinar; durante análisis ofrece cancelar y comunica que no modifica propuestas. Botones locales tienen altura mínima (36px), padding (8px 12px), foco de dos píxeles con offset de dos y opacidad deshabilitada (0.48) en la revisión, (0.55) en el chat. La conversación conserva campos y botones delimitados sobre azul marino; su acción principal usa texto oscuro sobre verde claro. Campos de revisión tienen altura mínima (40px), padding (9px 10px) y etiqueta permanente. Textareas son redimensionables verticalmente. Selección, caret y scrollbar interno siguen los roles del tema.

La revisión se organiza en cuatro pestañas: consumo y diseño, equipos, cotización, cliente y tarifa. La fila de pestañas permanece visible en el scroll de revisión; selección usa relleno verde contextual y texto del color del panel, con foco por teclado y navegación por flechas, Home y End. Los paneles conservan su estado al cambiar de pestaña.

El pie pide confirmación explícita de datos, equipos, precios y supuestos. Actualizar una propuesta abierta añade confirmación contextual. Errores y carga tienen semántica `alert`/`status`; el diálogo conserva foco y Escape. Las advertencias de referencia histórica, consumo estimado y falta de ofertas se presentan como contenido operativo, no como garantía de precisión. Los pendientes aparecen también en la conversación bajo «Revisemos estos detalles», con divisor fuerte y lista que se actualiza al editar; los bloqueadores tienen tratamiento cálido y texto explícito.

### Asistente IA: consumo y dimensionamiento

El resumen usa cuatro métricas en dos columnas, etiquetas pequeñas y valores tabulares; distingue datos observados, estimados y pendientes. El gráfico mensual compara consumo gris y generación verde, con leyenda explícita y doce grupos sobre una base común. La tabla editable siguiente mantiene etiquetas de mes y unidades; no completa huecos visualmente con valores inventados. Cambiar datos comerciales no elimina el análisis energético disponible.

La meta de cobertura y el modelo a dimensionar se muestran como campos ordinarios. El resultado explica potencia objetivo e instalada antes de una acción explícita para aplicar la cantidad sugerida al grupo seleccionado. Otros grupos y equipos permanecen visibles y se conservan. El mes pico requiere confirmación y queda identificado como estimación. La procedencia visible distingue historial observado, estimado, del proyecto y consumo teórico temporal igual a producción. La opción teórica queda etiquetada como «sin factura» y conserva la explicación de que la demanda deriva de equipos; el dimensionamiento contra esa misma producción se deshabilita. Producción/consumo describe energía, no promete ahorro facturable.

### Asistente IA: cotización revisable

La tabla de costos detalla componente, cantidad, unitario USD, total USD e ITBIS USD; cantidad y costo se editan en la fila, con origen particular del borrador u oferta del inventario debajo del modelo. Las cabeceras usan fondo tonal y divisor de dos píxeles; los modelos largos se envuelven, sin truncamiento. El documento distingue costos de compra, precios de venta por aclarar y base pendiente. Los totales documentados se concilian en USD con el cálculo y las diferencias se señalan como revisión, sin sumarlas como extras. Mano de obra, recargo sobre costo o margen sobre venta se editan con etiquetas y unidades explícitas. Los costos particulares de la cotización se distinguen de las ofertas del inventario; restaurar una oferta es una acción visible. Ítems adicionales y descuentos usan filas de formulario separadas por divisores, con añadir/quitar próximos a su lista. Las opciones de exoneración y destino del descuento acompañan los importes, sin esconder su efecto fiscal.

El resumen calculado reutiliza el fondo tonal y pares etiqueta/valor en dos columnas. Cuando faltan costos se denomina subtotal provisional; no trata ausencia de precio como oferta gratuita. La revisión conserva confirmación humana y no modifica el catálogo al editar una cotización.

### Inventario: modelos y ofertas

Nombre completo clicable, potencia/capacidad con unidad, especificación secundaria y ofertas junto a editar/eliminar. Sin precio disponible es un estado visible, no un importe cero inventado. Acciones de importar ficha, importar precios y nuevo equipo preceden búsqueda/filtros. Los modelos usan contraste equivalente claro/oscuro y acciones de icono con nombre accesible.

### Inventario: edición de ofertas y adjuntos

La sección de precios mantiene proveedor y SKU en dos columnas; moneda, precio unitario y existencias en tres. Notas y quitar cierran cada fila. Añadir oferta permanece junto al título de sección y el estado vacío explica el siguiente paso. Campos operativos usan texto de (14px) y etiquetas/contexto de (12px), con bordes y superficies equivalentes por tema. La conversión DOP muestra la tasa editable y el importe almacenado en USD en su propia línea, sin esconderlo en un tooltip. Las ofertas quedan en el formulario hasta confirmar el equipo.

Ficha e imágenes se agrupan después de ofertas: selección de archivo, nombre descargable y desvincular quedan próximos. Las imágenes usan miniaturas contenidas de (64px), con nombre alternativo y reserva neutra cuando la vista previa no está disponible. La interfaz distingue catálogo local de adjuntos del servidor, informa el requisito de sesión y muestra procesamiento/error junto a la tarea. Guardar queda deshabilitado mientras se procesa un adjunto; el pie visible conserva cancelar.

### Inventario: revisión de ficha importada

Cada variante ofrece selección explícita, nombre/modelo editables y campos con unidades; los valores ausentes muestran «Sin dato». Las especificaciones adicionales se despliegan debajo de la misma variante. Una posible coincidencia usa aviso ámbar con explicación y opciones visibles para actualizar el equipo o crear un modelo independiente. La selección y el resultado no se comunican sólo por color. El pie mantiene analizar/importar próximos al estado y permite cerrar; errores y resultados usan semántica de alerta/estado.

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
