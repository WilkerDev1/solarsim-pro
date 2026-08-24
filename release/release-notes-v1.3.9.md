# ⚡ SolarSim Pro v1.3.9 — Notas de la Versión

¡Nos complace anunciar el lanzamiento de **SolarSim Pro v1.3.9**! Esta actualización consolida la identidad visual oficial de Electsun, perfecciona la maquetación ejecutiva de exportación a PDF y documenta exhaustivamente la ingeniería técnica y financiera de la plataforma.

---

## 🚀 Novedades y Mejoras Principales

### 1. ☀️ Identidad Oficial Electsun Integrada
- **Nuevo Emblema Oficial Transparente**: Se integró el logotipo oficial transparente de **Electsun** (emblema con la 'E' y patrón solar degradado en tonos cálidos).
- **Consistencia Visual Global**:
  - Encabezado principal de la aplicación (`Header.tsx`).
  - Modal de configuración de nuevo proyecto (`NewProjectModal.tsx`).
  - Ícono nativo de la ventana de escritorio en Electron (`main.ts`).
  - Favicon web y metadatos del documento (`index.html`).

### 2. 📄 Perfeccionamiento de la Portada en Propuestas PDF (A4)
- **Alineación Vertical Milimétrica**: Se homogeneizaron las insignias de contacto en el pie de página de la portada ejecutiva (`PDFCoverPage.tsx`), nivelando el bloque de **Ubicación (`MapPin`)** al mismo plano que teléfono, sitio web e Instagram.
- **Eliminación del Corte de Texto (*html2canvas Bug*)**: Se eliminaron las restricciones de truncamiento (`truncate`) en los descenders de letras, garantizando que la dirección física de la empresa se imprima nítida y completa en cualquier resolución.
- **Micro-estilizado de Badges**: Contenedores de íconos unificados a `w-6 h-6 rounded-md shadow-xs` con tipografía de alta legibilidad `text-[11px] font-bold text-slate-800 whitespace-nowrap leading-none`.

### 3. 📐 Auditoría Matemática y Diccionario de Parámetros
- **Especificación Técnica Completa (`docs/FINANCIAL_ENGINE_SPECIFICATION.md`)**:
  - Formulación matemática rigurosa de balance energético horario y mensual.
  - Régimen de Medición Neta bajo la resolución **SIE-007-2026-REG** (EDEESTE, EDESUR, EDENORTE, CEPM).
  - Tratamiento fiscal auditado de la **Ley 57-07**: Exención del 100% de ITBIS (18%) y crédito fiscal del 40% al ISR amortizable en 3 cuotas anuales iguales (Años 1, 2 y 3).
  - Fórmulas de Flujo de Caja a 25 años, Payback Simple y Descontado, VAN (NPV), TIR (IRR), ROI a 25 años y LCOE.
  - **Diccionario de Parámetros**: Guía explicativa de cada variable técnica, financiera y de almacenamiento en la barra lateral del simulador.

---

## 📦 Binarios e Instaladores Incluidos

| Sistema Operativo | Archivo / Instalador | Formato |
| :--- | :--- | :--- |
| **Windows** | `SolarSim-Pro-Setup-1.3.9.exe` | Instalador NSIS (64-bit) |
| **Windows** | `SolarSim-Pro-1.3.9.exe` | Versión Portable Standalone |
| **Linux** | `SolarSim Pro-1.3.9.AppImage` | AppImage Universal |
| **Linux** | `solarsim-pro_1.3.9_amd64.deb` | Paquete Debian / Ubuntu |
| **Linux** | `solarsim-pro-1.3.9.pacman` | Paquete Arch Linux / Manjaro |
| **Linux** | `solarsim-pro-1.3.9.tar.gz` | Binario comprimido Tarball |

---
*SolarSim Pro — Desarrollado por WilkerDev1 para la comunidad fotovoltaica de la República Dominicana.*
