# ☀️ SolarSim Pro v1.4.0 — Registro de Novedades y Mejoras

¡Nos complace presentar **SolarSim Pro v1.4.0**! Esta versión introduce una profunda optimización en la ingeniería de costos comerciales, cobertura satelital ampliada a nivel nacional, gestión inteligente de duplicados y refinamientos visuales en las propuestas ejecutivas en PDF.

---

## 🚀 Principales Novedades

### 1. 💰 Rediseño Integral de Costos y Márgenes de Venta
- **Margen Comercial Libre (%)**: Nuevo control numérico libre donde puedes escribir cualquier porcentaje personalizado (ej. `1%`, `7.5%`, `22%`, `70%`, etc.), con botones rápidos de 1-clic `[ 10% ] [ 15% ] [ 20% ] [ 25% ] [ 30% ] [ 35% ]`.
- **Desglose en Vivo de 3 Columnas**:
  - 📦 **Costo Base**: Costo neto de equipos y mano de obra por Wp (`$/Wp`).
  - 💰 **Tu Ganancia**: Utilidad comercial directa por Wp (`+$/Wp`).
  - 🏷️ **Precio Venta Final**: Precio al cliente por Wp con botón de sincronización instantánea.
- **Separación Lógica de Baterías**: El precio de almacenamiento se trasladó exclusivamente a la sección de finanzas y se muestra de forma condicional solo cuando el proyecto incluye almacenamiento.

### 2. 🗺️ Cobertura Satelital Completa: 32 Provincias de República Dominicana
- Base de datos meteorológica y de irradiación solar ($\text{HSP}$ - Horas Sol Pico en $\text{kWh/m}^2/\text{día}$) de la **NASA SSE y NREL** ampliada a **las 31 provincias y el Distrito Nacional**.
- **Reconocimiento Inteligente de Alias y Polos Turísticos**: Detección automática al importar facturas o escribir municipios como *Punta Cana, Bávaro, Cap Cana, Sosúa, Cabarete, Las Terrenas, Jarabacoa, Constanza, Haina, Baní, Cotuí, Moca, Bonao*, etc.

### 3. 🔢 Auto-Secuencia Inteligente de IDs y Resolución de Colisiones
- **IDs y Números de Cotización Consecutivos Automáticos**: Generación limpia `SP-2026-001`, `SP-2026-002`... y `C-0001`, `C-0002`...
- **Gestión de Conflictos al Importar JSON**: Nuevo modal interactivo que detecta colisiones y ofrece 3 opciones rápidas:
  1. *Asignar Nuevo Consecutivo Inteligente*
  2. *Sobrescribir Proyecto Existente*
  3. *Guardar como Copia (-B)*

### 4. 📄 Perfeccionamiento de Propuestas PDF Ejecutivas
- **Página 3 ("¿Quiénes Somos? Y Servicios")**: Inserción del párrafo de transición y alineación vertical compacta con la sección de ventajas competitivas para una diagramación de revista impecable.
- **Editor de Textos en Datos del Documento**: Control total de personalización corporativa multi-empresa.

---

## 📦 Binarios y Descargas Oficiales

### Windows (10 / 11)
- **Instalador NSIS**: `SolarSim Pro Setup 1.4.0.exe` / `SolarSim-Pro-Setup-1.4.0.exe`
- **Versión Portable**: `SolarSim Pro 1.4.0.exe` / `SolarSim-Pro-1.4.0.exe`

### Linux (x86_64 / amd64)
- **AppImage Universal**: `SolarSim Pro-1.4.0.AppImage` / `SolarSim-Pro-1.4.0.AppImage`
- **Debian / Ubuntu**: `solarsim-pro_1.4.0_amd64.deb`
- **Arch Linux / Manjaro / CachyOS**: `solarsim-pro-1.4.0.pacman`
- **Genérico**: `solarsim-pro-1.4.0.tar.gz`

---
*Desarrollado con ❤️ para los profesionales de energía solar de la República Dominicana.*
