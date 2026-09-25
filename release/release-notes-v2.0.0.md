# ☀️ SolarSim Pro v2.0.0 — Major Release Notes

¡Nos enorgullece presentar **SolarSim Pro v2.0.0**! Esta es la actualización más ambiciosa en la historia de la plataforma, marcando el salto a una suite de ingeniería solar integral de grado empresarial para República Dominicana.

---

## 🌟 Novedades y Capacidades Principales

### 1. 🗑️ Papelera de Reciclaje (Recycle Bin) & Modo Solo Lectura
* **Borrado Suave (*Soft-Delete*) con Retención de 30 Días**: Protección absoluta contra eliminaciones accidentales. Los proyectos eliminados conservan sus metadatos de auditoría (`deletedAt`, `deletedBy`) durante 30 días antes de su purga física.
* **Modo Solo Lectura con Protección de Estado**: Los proyectos en papelera pueden abrirse y explorarse tanto en el Simulador como en el Visor PDF en modo lectura protegida, con un banner ámbar superior que impide modificaciones involuntarias.
* **Restauración y Vaciado Masivo**: Acciones directas para restaurar proyectos individuales al catálogo activo, realizar eliminación definitiva física o vaciar la papelera por completo.
* **Acceso Dual & Drag-and-Drop**: Acceso instantáneo desde el nuevo botón con badge reactivo en el Dock vertical y como carpeta especial en el árbol lateral del Dashboard con soporte para arrastrar y soltar proyectos.
* **Sincronización Transparente en la Nube**: Endpoints dedicados (`POST /api/projects/:id/restore`, `DELETE /api/trash`) integrados con PostgreSQL.

---

### 2. 🤖 Hub Unificado de IA & Google Gemini Familia 3
* **Dock AI Hub**: Acceso centralizado desde la barra vertical a las 3 herramientas multimodales de inteligencia artificial:
  1. *Smart Proposal Studio / Escáner de Facturas EDE*.
  2. *Escáner de Fichas Técnicas (Datasheets)*.
  3. *Escáner de Listas de Precios de Proveedores con Smart Fuzzy Matching*.
* **Selector Dinámico de Modelos**: Configuración flexible en Ajustes con soporte para la Familia 3 de Gemini (`gemini-3.8-flash-high`, `gemini-3.7-flash`, etc.).
* **Cascada de Respaldo Anti-503**: Arquitectura de resiliencia con degradación elegante automática y notificación activa al usuario cuando la API de Google experimenta sobrecarga temporal.

---

### 3. ⚡ Despacho Físico de Baterías BESS & Partición de Carga Diurna
* **Partición Diurna Semi-Automática**: Inferencia física inteligente de la curva de demanda según la tarifa dominicana:
  * Residencial (`BTS1`, `BTS2`): **35% diurno** / 65% nocturno.
  * Comercial (`BTD`): **75% diurno** / 25% nocturno.
  * Industrial (`MTD1`, `MTD2`): **90% diurno** / 10% nocturno.
  * Slider interactivo manual para ajuste fino (15% a 95%).
* **Física Real de Almacenamiento BESS**: Simulación de ciclado diario útil ($E_{bat, util} = \text{Capacidad} \times \text{DoD} \times \eta$), absorbiendo excedentes solares diurnos para mitigar la demanda nocturna sin saturaciones irreales al 100%.
* **Desglose Transparente & Modo Clásico (Legacy Toggle)**: Separación visual de Autoconsumo en Sitio, Inyección a Red (bruta y neta acreditada al 75% bajo SIE-007) y Ahorro Facturable, con conmutador interactivo para alternar entre el modo detallado (7 columnas) y el modo clásico tradicional (5 columnas).

---

### 4. 💰 Descuentos Comerciales & Recálculo de Rentabilidad Real
* **Deducciones Individuales en Categoría 5**: Posibilidad de añadir descuentos por monto fijo ($ USD) o porcentaje (%), con notas y motivos comerciales.
* **Recálculo Financiero Instantáneo**: Ajuste automático de ganancia neta real, markup sobre costo y margen sobre venta, manteniendo inalterado el costo de adquisición mayorista de los equipos.
* **Selector de Destino Tributario DGII**:
  * *Descuento General*: Mantiene la base de equipos de Ley 57-07 al 100%.
  * *Descuento Imputado a Equipos*: Reduce la base elegible del 40% ISR para garantizar estricto cumplimiento ante la DGII (no se admiten créditos fiscales sobre montos no pagados).
* **Flujo de Caja Año 0 Sincronizado**: Desembolso inicial real con TIR, Payback y VAN perfectamente alineados.

---

### 5. 📄 Dossier Ejecutivo PDF Modular & Reorganización Drag-and-Drop
* **Página de Cuadro Resumen Ejecutivo**: Nueva hoja ejecutiva de alto impacto ubicada tras el índice con KPIs clave, desglose técnico de módulos, inversores y BESS, divisas y desembolso neto con Ley 57-07.
* **Reorganización Dinámica de Páginas y Anexos**: Arrastre y suelte interactivo para reordenar las secciones del dossier PDF y los documentos anexos adjuntos, sincronizando automáticamente los números de página y el Índice de Contenido (*Table of Contents*).
* **Previsualización Real de Anexos**: Renderizado canvas de la primera página de archivos PDF externos adjuntos mediante `pdfjs-dist 4.4`.

---

### 6. 🌐 Propuestas Web Cloudflare Workers (`propuesta.electsun.net`)
* **Sincronización de Descuentos en Vivo**: Reflejo exacto en tiempo real de los precios de lista, retenciones de ITBIS, filas de descuento y total con Ley 57-07.
* **Historial de Propuestas en Ajustes**: Panel gráfico con estado de vigencia, cuenta regresiva, tiempo restante, códigos QR interactivos y acciones de rehidratación remota.

---

## 📦 Binarios y Paquetes de Instalación Oficiales (v2.0.0)

| Plataforma | Formato de Paquete | Nombre del Archivo |
| :--- | :--- | :--- |
| **Windows** | Instalador Guiado NSIS (x64) | `SolarSim-Pro-Setup-2.0.0.exe` |
| **Windows** | Portable / Sin Instalación (x64) | `SolarSim-Pro-2.0.0.exe` |
| **Linux (Universal)** | AppImage Autoejecutable (x64) | `SolarSim-Pro-2.0.0.AppImage` |
| **Linux (Arch / Manjaro / CachyOS)** | Paquete Nativo Pacman | `solarsim-pro-2.0.0.pacman` |
| **Linux (Debian / Ubuntu / Mint)** | Paquete Nativo DEB | `solarsim-pro_2.0.0_amd64.deb` |
| **Linux (Genérico)** | Tarball Comprimido | `solarsim-pro-2.0.0.tar.gz` |

---
*Clave pública GPG para verificación de firmas en `solarsim-public-key.asc`.*
