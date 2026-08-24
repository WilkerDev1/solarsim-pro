# ⚡ SolarSim Pro v1.4.1 — Auditoría Integral, Seguridad IPC, Repomix y Perfeccionamiento Financiero

Esta versión incorpora el **Informe Maestro de Auditoría de Código y Arquitectura**, refuerzos críticos de seguridad en el puente IPC de Electron, integración de **Repomix** para gobernanza de contexto, optimización de memoria en exportaciones PDF y la deducción rigurosa de mano de obra en el crédito fiscal de la **Ley 57-07**.

---

## 🚀 Principales Novedades y Mejoras

### 1. 🛡️ Auditoría Integral del Código y Remediaciones de Seguridad
* **Informe Maestro**: Generado y documentado en `docs/CODEBASE_AUDIT_REPORT.md` cubriendo las 5 dimensiones arquitectónicas del sistema.
* **Sanitización en Electron IPC (`pkexec`)**: Validación estricta y saneamiento de versiones y tipos de paquetes en `install-linux-package` para prevenir vulnerabilidades de inyección en comandos con privilegios elevados.
* **Tipado Estricto**: Eliminación de tipos `any` en `window.electronAPI` y reemplazo por interfaces fuertemente tipadas (`ExtractedInvoiceData`, `GeminiModelInfo`, `UpdateInfo`).

### 2. 🏛️ Deducción de Mano de Obra en Ley 57-07 (Crédito Fiscal 40% ISR)
* **Base Estricta de Equipos Renovables**: El crédito fiscal del 40% sobre el Impuesto Sobre la Renta (ISR) ahora aplica exclusivamente sobre el valor de los equipos fotovoltaicos y de almacenamiento (paneles, inversores y baterías), deduciendo formalmente el costo de mano de obra y materiales.
* Reflejado de forma consistente en el **Simulador Interactivo**, **Generador de Propuestas PDF** y el **Visor Web de Propuestas en Cloudflare Workers**.

### 3. 📄 Versionado Inteligente de Proyectos Duplicados (`-V2`, `-V3`)
* Al clonar o duplicar proyectos para clientes con variantes de sistemas (ej. on-grid vs híbrido con baterías), el nombre del cliente se mantiene 100% formal y limpio en todas las portadas y encabezados.
* El sufijo de versión se traslada automáticamente al **ID de Proyecto** (`SP-2026-001-V2`) y al **N° de Cotización** (`C-0001-V2`).
* Rutina automática de saneamiento que limpia sufijos `(Copia)` legados.

### 4. 📦 Gobernanza y Empaquetado de Contexto con Repomix
* Configuración de `repomix.config.json` y comando `npm run context:pack` para capturar el 100% de la lógica y especificaciones técnicas en un snapshot XML optimizado.

### 5. ⚡ Rendimiento y Liberación de Memoria
* **Canvas Garbage Collection**: Liberación explícita de buffers de píxeles (`canvas.width = 0; canvas.height = 0;`) tras el renderizado de cada hoja A4 en exportaciones multi-página.
* **Modo Desarrollo Limpio**: Supresión de advertencias innecesarias de `electron-updater` durante la ejecución en desarrollo.

---

## 📦 Paquetes y Binarios Disponibles

### 🪟 Windows:
- **Instalador NSIS**: `SolarSim Pro Setup 1.4.1.exe`
- **Portable**: `SolarSim Pro 1.4.1.exe`
- **Delta Blockmap**: `SolarSim Pro Setup 1.4.1.exe.blockmap`

### 🐧 Linux:
- **AppImage**: `SolarSim-Pro-1.4.1.AppImage` (con firma `.sig`)
- **Arch / CachyOS / Manjaro**: `solarsim-pro-1.4.1.pacman` (con firma `.sig`)
- **Debian / Ubuntu**: `solarsim-pro_1.4.1_amd64.deb`
- **Genérico / Tarball**: `solarsim-pro-1.4.1.tar.gz` (con firma `.sig`)
- **Clave Pública GPG**: `solarsim-public-key.asc`
