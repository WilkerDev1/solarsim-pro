# Reglas Críticas para Generación y Exportación a PDF con `html2canvas` y `jsPDF`

Esta guía establece los estándares obligatorios de diseño, maquetación y exportación de documentos PDF en SolarSim Pro para garantizar cero recortes tipográficos, proporciones de imagen exactas y exportación fluida.

---

## 1. Tipografía y Prevención de Letras Recortadas
- **NUNCA usar `truncate` ni `overflow: hidden` en textos de PDF**: `html2canvas` calcula la caja de recorte (*clipping box*) sin considerar los trazos descendentes (*descenders* de letras como 'p', 'g', 'q', 'y'). Aplicar `overflow: hidden` o `truncate` corta físicamente la mitad inferior de los textos.
- **Estructura Segura para Textos y Pies de Página (`PDFFooter.tsx`)**:
  - Usar `whitespace-nowrap font-bold` directamente sobre contenedores sin `truncate`.
  - Usar `items-center` con `lineHeight: '1.2'` o `leading-normal` (evitar `leading-none` / `line-height: 1`).
  - Altura recomendada de pie de página: `40px` a `42px` (`height: 42px; minHeight: 42px; maxHeight: 42px`).

---

## 2. Proporciones de Imágenes y Gráficos (Evitar Aplastamiento)
- `html2canvas` **ignora** la propiedad CSS `object-fit: contain` o `cover` en etiquetas `<img>`.
- Si se usa `w-full h-full object-contain` dentro de un contenedor fijo, `html2canvas` estirará la imagen a todo el ancho y alto del contenedor, aplastándola o distorsionándola.
- **Patrón Obligatorio para Imágenes Proporcionales**:
  ```tsx
  <img
    src={ASSET_BASE64}
    alt="Descripción"
    className="max-h-[160px] max-w-[95%] w-auto h-auto mx-auto block object-contain"
  />
  ```
  Al usar `w-auto h-auto` con `max-h` y `max-w`, el elemento `<img>` adquiere sus dimensiones intrínsecas reales en el DOM, garantizando renderizado 100% fiel y sin distorsión geométrica en el PDF.

---

## 3. Estructura de Hoja A4 y Control de Desbordamiento (Overflow)
- **Dimensiones Estándar A4**: `width: 850px; height: 1202px; max-height: 1202px; overflow: hidden;`.
- **Estructura Flexbox**:
  - `Header`: 76px de altura fija.
  - `Cuerpo Principal`: `<div className="px-10 pt-3 pb-3 flex-1 flex flex-col justify-between min-h-0">`.
  - **Prohibido `pb-14` / `pb-20` en el cuerpo**: Los paddings inferiores excesivos dentro del cuerpo sumados al `mt-auto` del footer empujan el footer fuera de los 1,202px y provocan que se corte por la mitad.
  - `Footer`: 42px de altura fija (`mt-auto`).

---

## 4. Sandbox de Captura en `handleExportPDF`
- Clonar cada página en un contenedor sandbox aislado:
  ```ts
  const sandbox = document.createElement('div');
  sandbox.style.position = 'fixed';
  sandbox.style.top = '0px';
  sandbox.style.left = '0px';
  sandbox.style.width = '850px';
  sandbox.style.height = '1202px';
  sandbox.style.overflow = 'hidden';
  sandbox.style.zIndex = '-9999'; // 100% invisible para evitar parpadeo en UI
  sandbox.style.backgroundColor = '#ffffff';
  sandbox.style.pointerEvents = 'none';
  ```
- Asignar al clon `clone.style.flexDirection = 'column'` y `clone.style.justifyContent = 'space-between'`.
- Añadir retardo de estabilización de ~100ms antes de llamar a `html2canvas` para garantizar carga completa de fuentes y gráficos base64.
