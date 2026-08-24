## ⚡ SolarSim Pro v1.3.8 - Pantalla de Carga Electsun Software Team, Renovación Visual del Dossier PDF & Mantenimiento Integral

¡Nos complace anunciar el lanzamiento de **SolarSim Pro v1.3.8**! Esta versión introduce una nueva pantalla de inicio profesional para el departamento de desarrollo de software (**Electsun Software Team**), perfecciona la maquetación de todas las hojas del dossier PDF, elimina definitivamente cualquier defecto de recorte en pies de página y consolida la documentación de arquitectura.

---

### 🚀 Novedades y Mejoras Principales:

#### 1. 🖥️ Nueva Pantalla de Carga Profesional (*Electsun Software Team*):
* **Identidad de Software**: Integración del logotipo oficial rediseñado para la división de ingeniería y desarrollo de software (*Electsun Software Team*).
* **Diseño Plano y Minimalista**: Fondo gris oscuro plano (`#18181b`) con el logotipo en gran formato y una barra de carga sobria y elegante con contador porcentual.
* **Transición Fluida**: Animación de arranque de ~2.4 segundos con desvanecimiento limpio (*fade-out*) directo a la plataforma de simulación.

---

#### 2. 📑 Renovación de Composición en Páginas Explicativas (Páginas 2 a 6):
* **Página 3 (Quiénes Somos & Servicios)**:
  * 4 Tarjetas de Servicios Principales ampliadas con padding generoso, iconos más grandes y listados de ingeniería estructurados.
  * 3 Tarjetas de Propuesta de Valor destacadas con tipografía optimizada y balance visual.
* **Página 4 (Beneficios Solares & Ley 57-07)**:
  * Fotografía de tejado solar residencial a sangre completa (`h-64`) con 4 pilares de beneficio directo (Ahorro, Plusvalía, Independencia, Sostenibilidad).
  * 4 Tarjetas de la Ley 57-07 ampliadas para una presentación ejecutiva impecable.
* **Página 5 (Introducción Técnica & Diagrama de Flujo)**:
  * Render 3D del tejado fotovoltaico y Diagrama de Flujo del sistema aumentados a 208px (`h-52` / `max-h-[190px]`) con máxima nitidez.
* **Página 6 (Descripción del Proyecto & Normativa SIE/EDES)**:
  * Métricas técnicas clave (Potencia DC, Cobertura Solar, Generación Anual) en tarjetas amplias con números grandes.
  * Cuadro de condiciones regulatorias SIE / EDES en formato destacado.

---

#### 3. 🛡️ Solución Definitiva al Recorte de Pies de Página (`html2canvas`):
* **Identificación Causa-Raíz**:
  * Se eliminó el uso de `truncate` (`overflow: hidden`) en etiquetas de texto de pie de página, el cual forzaba a `html2canvas` a recortar los trazos inferiores (*descenders*) de las letras.
* **Alineación Perfecta**:
  * Altura compacta estandarizada a 42px con `items-center` y tipografía equilibrada (Gris Slate 500 para la dirección corporativa y Slate 900 para la numeración de páginas).
* **Control de Desbordamiento Vertical**:
  * Eliminación de paddings residuales (`pb-14` $\rightarrow$ `pb-3`) garantizando que ninguna página exceda el límite de corte de 1,202px.

---

#### 4. 🎨 Portada Limpia y Profesional:
* Remoción de cajas oscuras redundantes en el banner de la portada (`PDFCoverPage.tsx`), conservando la tipografía limpia sobre la fotografía del atardecer solar.

---

#### 5. 📚 Documentación de Mantenimiento & Reglas de Desarrollo:
* Publicación del **Manual Maestro de Contexto, Arquitectura y Mantenimiento** (`AGENTS.md` y `docs/MAINTENANCE_AND_UPDATES.md`) con el mapa integral de componentes, comandos de compilación, gestión de releases y reglas del workspace.

---

### 📦 Archivos de Instalación:

#### 🪟 Windows:
* **`SolarSim-Pro-Setup-1.3.8.exe`** — Instalador oficial NSIS para Windows x64.
* **`SolarSim-Pro-1.3.8.exe`** — Versión portable ejecutable.

#### 🐧 Linux:
* **`SolarSim-Pro-1.3.8.AppImage`** — Paquete ejecutable universal para cualquier distribución Linux.
* **`solarsim-pro-1.3.8.pacman`** — Paquete nativo para Arch Linux / Manjaro / CachyOS.
* **`solarsim-pro_1.3.8_amd64.deb`** — Paquete para Debian / Ubuntu / Linux Mint.
* **`solarsim-pro-1.3.8.tar.gz`** — Binarios comprimidos.
