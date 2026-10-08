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

La extensión conserva el mismo mundo Operate. La evidencia normativa adicional es `src/components/common/ai-invoice/proposal-workspace.css`, `AIInvoiceScannerModal.tsx`, `ProposalDraftReview.tsx` y `EquipmentManagerSettingsTab.tsx`. Los roles `--pw-*` coinciden con los neutros y verdes del centro; el catálogo usa clases Tailwind equivalentes, sin convertir esas clases en tokens globales. Esta extracción registra únicamente esas superficies, sin reemplazar el sistema empresarial ni canonizar el PDF.

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

Conversación propia y foco usan verde contextual; el botón de preparar/aplicar conserva verde de acción y blanco. Los avisos de revisión usan superficie de fondo y texto secundario; los bloqueadores usan el rol de error. El estado deshabilitado reduce opacidad: no expresa disponibilidad comercial ni resultados del análisis.

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

El modal se limita a (1220px) y separa conversación/compositor de revisión mediante una columna de (360px) y otra flexible. Ambas zonas tienen scroll propio; el pie de revisión permanece visible y la confirmación antecede crear/actualizar. Su altura es el menor valor entre (900px) y (94vh). A (1100px), conversación pasa a (320px) y se reducen paddings; el mínimo de producto sigue siendo (1024×700). Bajo (760px), el código apila ambas zonas como defensa, sin afirmar soporte de producto móvil.

Los formularios de revisión usan dos columnas con separación de (16px); campos largos abarcan ambas. Los consumos usan seis columnas y cuatro en el breakpoint compacto. Los grupos de equipos alinean modelo, unidades y quitar; las notas de precio tienen su propia línea. El inventario usa una tabla compacta con nombre/modelo, nominal, ofertas y acciones, precedida por búsqueda y filtros. El flujo concreto queda en `.impeccable/surfaces/ai-proposal-inventory.md`, no como composición obligatoria de toda pantalla futura.

## Elevation & Depth

La superficie empresarial usa capas tonales, bordes de un píxel y espacio. No hay sombras en sus formularios, controles o navegación. El foco es una señal de interacción: contorno de dos píxeles en verde contextual y offset de tres píxeles. No es elevación ornamental.

### Named Rules

**The Superficie plana Rule.** La separación ordinaria se construye con fondo, borde y espacio; los formularios y tablas del centro no requieren sombras.

### Extensión modal IA

El asistente usa una sombra ambiental sólo para separar el modal del trabajo subyacente; el interior conserva divisores y capas tonales. La sombra no se traslada a filas de inventario ni a formularios del centro. El punto de actividad pulsa únicamente durante una solicitud y pierde animación con `prefers-reduced-motion`; no es un acento decorativo persistente.

## Shapes

Los controles, avisos y elementos seleccionados usan esquinas de control; los formularios usan esquinas de contenedor. La tabla mantiene filas rectangulares separadas por líneas horizontales, sin cápsulas por celda. El contrato inicial hablaba de formas de 12px; el código final distingue deliberadamente contenedores de 12px y controles de 8px.

La extensión IA mantiene contenedor de (12px), controles y avisos de (8px) y filas rectangulares con divisores. El inventario conserva filas de tabla; no añade cápsulas por modelo o métricas decorativas.

## Components

### Buttons

Botones de texto con iconos SVG cuando ayudan a identificar la acción. Altura mínima (38px), peso (550), borde fino y separación interna (8px). El botón secundario usa panel y borde del tema; el primario conserva verde de acción y texto blanco en ambos temas. Hover secundario usa fondo seleccionado. Disabled reduce opacidad a (0.5). Las variantes destructivas cambian el color del texto, sin convertirlas en acción principal.

### Cards / Containers

El formulario agrupa identidad, recursos o tarea de gestión. Fondo de panel, borde fino y padding de contenedor; no sombra. Las subsecciones usan un divisor superior y separación vertical, evitando anidar tarjetas para cada campo.

### Inputs / Fields

Etiqueta encima del campo con separación (8px). Altura mínima (42px), borde fino y fondo de campo por tema. Los valores se leen en peso regular; campos de solo lectura y placeholders usan texto secundario. Textareas permiten resize vertical y altura mínima (90px). El foco conserva el mismo contorno que los botones.

### Navigation

La navegación lateral usa botones de ancho disponible y altura mínima (44px), alineados a la izquierda. El estado `aria-current=page` se refleja con fondo seleccionado y texto verde contextual. Las subsecciones de organización se muestran como botones agrupados sobre un divisor, con el mismo tratamiento activo.

### Member table

Cabeceras pequeñas en texto secundario; filas con padding (14px 12px), borde inferior y acciones cerca del miembro. El contenedor permite scroll cuando la tabla lo necesita; no se ocultan acciones para simular una densidad menor.

### Notices

El aviso contextual usa fondo seleccionado, esquinas de control y padding (13px 16px). La variante de error usa los roles rojos por tema. La presencia de un componente no sustituye el contenido: los mensajes deben comunicar resultado o siguiente paso. La variante de error conserva su distinción de estado frente al aviso contextual.

### Asistente IA: compositor y revisión

El compositor reúne adjuntos, texto y preparar/refinar; durante análisis ofrece cancelar y comunica que no modifica propuestas. Botones locales tienen altura mínima (36px), padding (8px 12px), foco de dos píxeles con offset de dos y opacidad deshabilitada (0.48). Campos de revisión tienen altura mínima (40px), padding (9px 10px) y etiqueta permanente. Textareas son redimensionables verticalmente. Selección, caret y scrollbar interno siguen los roles del tema.

El pie pide confirmación explícita de datos, equipos, precios y supuestos. Actualizar una propuesta abierta añade confirmación contextual. Errores y carga tienen semántica `alert`/`status`; el diálogo conserva foco y Escape. Las advertencias de referencia histórica, consumo estimado y falta de ofertas se presentan como contenido operativo, no como garantía de precisión.

### Inventario: modelos y ofertas

Nombre completo clicable, potencia/capacidad con unidad, especificación secundaria y ofertas junto a editar/eliminar. Sin precio disponible es un estado visible, no un importe cero inventado. Acciones de importar ficha, importar precios y nuevo equipo preceden búsqueda/filtros. Los modelos usan contraste equivalente claro/oscuro y acciones de icono con nombre accesible.

## Do's and Don'ts

### Do:

- **Do** usar los roles del tema para texto, bordes y superficies.
- **Do** conservar etiquetas visibles, foco por teclado y acciones de guardar y descartar.
- **Do** reservar el verde de selección para el ámbito activo y las acciones pertinentes.
- **Do** mantener la lectura compacta de miembros con divisores horizontales y nombres completos.

### Don't:

- **Don't** reutilizar valores oscuros fijos para una superficie que cambia de tema.
- **Don't** trasladar la paleta de una empresa al sistema de navegación.
- **Don't** convertir una captura de QA o su contenido sintético en un recurso del producto.
- **Don't** extender estas dimensiones del centro al PDF aprobado.


No canonizado: las etiquetas nativas del selector de archivos en inglés, visibles en las capturas de QA, son una limitación de localización del artefacto, no una regla visual para nuevas superficies. Las capturas de QA no son assets de distribución.

No canonizado en la extensión IA: 10/11px del editor de equipos heredado, observados por detector como tamaños fuera de rampa; no se convierten en pasos aprobados para nuevas pantallas. Tampoco se canonizan contenido ni controles de fixtures QA.
