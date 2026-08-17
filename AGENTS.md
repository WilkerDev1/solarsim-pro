# ☀️ SolarSim Pro — Manual Maestro de Contexto, Arquitectura y Mantenimiento

Este documento sirve como **fuente única de verdad** para desarrolladores y asistentes IA (Antigravity / Gemini) en nuevas sesiones de trabajo. Contiene la explicación exhaustiva de qué es el proyecto, la ubicación de cada componente, las herramientas utilizadas para desarrollo y despliegue, y las reglas críticas aprendidas.

---

## 1. 📖 ¿Qué es SolarSim Pro?

**SolarSim Pro** es una plataforma de software de escritorio (construida con Electron + React) diseñada para ingenieros, consultores e instaladores de energía solar fotovoltaica en **República Dominicana**.

### Capacidades Principales:
1. **Dimensionamiento Técnico**:
   - Estimación de irradiación solar ($\text{HSP}$) específica para las 32 provincias de RD (datos satelitales NASA SSE / NREL).
   - Balance de energía horaria y mensual, autoconsumo e inyección bajo el régimen de Medición Neta con las distribuidoras (**EDEESTE, EDESUR, EDENORTE, CEPM**).
2. **Inteligencia Artificial Multimodal (Escáner de Facturas)**:
   - Extracción automática con **Google Gemini Vision** (`gemini-2.0-flash`) de facturas eléctricas en PDF, JPG, PNG y WebP.
   - Detección de NIS/NIC, RNC, cliente, historial de 12 meses de consumo (kWh), tarifa (BTS1, BTS2, MTD1) y potencia en kW.
3. **Ingeniería Financiera & Ley 57-07 (Auditada)**:
   - Exoneración del 100% de ITBIS (18%) y aranceles sobre equipos solares.
   - Crédito fiscal del 40% del costo de inversión en equipos aplicable al Impuesto Sobre la Renta (ISR) amortizable en 3 años fiscales.
   - Proyecciones de Flujo de Caja a 25 años, Payback Simple y Descontado, VAN (NPV), TIR (IRR), LCOE y ROI total.
4. **Generador de Propuestas Técnicas y Económicas en PDF**:
   - Dossier ejecutivo modular de 10 a 11 páginas con maquetación de revista (*Executive Pitch Deck*).
   - Personalización multi-empresa (*Document Customization*): logos, lemas, firmas, teléfonos, marcas de agua y paletas de color corporativas.

---

## 2. 🗂️ Mapa del Repositorio: Dónde está Cada Cosa

```
solarsim/
├── AGENTS.md                                # Este manual maestro para IAs y desarrolladores
├── package.json                             # Configuración del proyecto, dependencias y scripts
├── vite.config.ts                           # Configuración de Vite para React y bundling web
├── tailwind.config.js                       # Configuración de Tailwind CSS y paletas de colores
├── electron/                                # Runtime de Escritorio (Node / Chromium)
│   ├── main.ts                              # Proceso principal de Electron, IPC handlers, auto-updater
│   └── preload.ts                           # Puente seguro contextBridge entre Electron y React
├── src/
│   ├── main.tsx                             # Punto de entrada de React
│   ├── App.tsx                              # Enrutador y vista principal (Simulador vs Propuesta PDF)
│   ├── index.css                            # Estilos base, scrollbars y regla @page para A4
│   ├── types/
│   │   ├── index.ts                         # Tipos TypeScript de simulación, cliente, finanzas y PDF
│   │   └── defaultDocumentCustomization.ts  # Valores por defecto de personalización empresarial
│   ├── store/
│   │   └── useSimulationStore.ts            # Estado global Zustand con persistencia en localStorage
│   ├── data/
│   │   ├── rdProvinces.ts                   # Datos de irradiación solar (HSP) por provincia de RD
│   │   └── defaultPanelsInverters.ts        # Catálogo de paneles Tier-1, inversores y baterías
│   ├── engine/                              # 🧠 MOTORES DE CÁLCULO PUROS (Sin UI)
│   │   ├── solarEngine.ts                   # Balance de energía, generación mensual y cobertura
│   │   ├── financialEngine.ts               # Flujo de caja 25 años, VAN, TIR, Payback y ROI
│   │   ├── ley5707.ts                       # Deducciones fiscales y exenciones Ley 57-07
│   │   └── testBenchmark.ts                 # Script de validación de cálculos contra benchmarks
│   ├── assets/
│   │   └── pdfGraphicAssets.ts              # Gráficos, renders 3D y diagramas en Base64 para PDF
│   └── components/
│       ├── common/                          # Modales, cabeceras y utilidades compartidas
│       │   ├── Header.tsx                   # Barra superior de la app con navegación y botones
│       │   └── AIInvoiceScannerModal.tsx    # Modal de escáner de facturas con Gemini Vision
│       ├── simulator/                       # 🎛️ VISTA DEL SIMULADOR INTERACTIVO
│       │   ├── SimulatorView.tsx            # Vista unificada del simulador
│       │   ├── ParameterSidebar.tsx         # Barra lateral de parámetros técnicos y financieros
│       │   ├── EnergyBalanceCard.tsx        # Gráfico de generación vs consumo (Recharts)
│       │   └── FinancialSummaryCard.tsx     # Tarjetas de VAN, TIR, Payback e inversión
│       └── pdf/                             # 📄 VISTA Y GENERADOR DE PROPUESTAS PDF
│           ├── PDFProposalView.tsx          # Visor de propuesta con renderizado y botón de exportar
│           ├── PDFHeaderBanner.tsx          # Cabecera estándar de hojas interiores (76px)
│           ├── PDFFooter.tsx                # Pie de página estándar (42px, centrado, sin truncate)
│           ├── PDFWatermark.tsx             # Marca de agua central vectorial / base64
│           ├── controls/
│           │   ├── PDFSidebarControls.tsx   # Panel de control de páginas, temas y personalización
│           │   └── PDFCustomizationModal.tsx# Modal "Datos del Documento" (logos, lemas, firmas)
│           └── pages/                       # 📑 PLANTILLAS DE HOJAS INDIVIDUALES (A4)
│               ├── PDFCoverPage.tsx         # Hoja 1: Portada ejecutiva con diseño geométrico
│               ├── PDFTableOfContents.tsx   # Hoja 2: Índice de contenido dinámico con badges
│               ├── PDFAboutUsPage.tsx       # Hoja 3: 1. ¿Quiénes Somos? & Servicios Principales
│               ├── PDFSolarBenefitsPage.tsx # Hoja 4: 2. Beneficios Solares & Ley 57-07
│               ├── PDFTechnicalIntroPage.tsx# Hoja 5: 3. ¿Qué es un Sistema FV? & Diagrama de Flujo
│               ├── PDFProjectDescriptionPage.tsx # Hoja 6: 4. Descripción del Proyecto & Normativa SIE
│               ├── PDFPage1Energy.tsx       # Hoja 7: 5. Análisis de Energía y Balance
│               ├── PDFPage2Quotation.tsx    # Hoja 8: 6. Cotización y Presupuesto
│               ├── PDFPage3ROI.tsx          # Hoja 9: 7. Retorno de Inversión (ROI & TIR)
│               ├── PDFPage4CashFlow.tsx     # Hoja 10: 8. Flujo de Caja a 25 Años
│               └── PDFPage5CostMatrix.tsx   # Hoja 11: 9. Matriz de Costos Interna (Confidencial)
├── release/                                 # Binarios generados (.exe, .AppImage, .pacman, .deb)
├── docs/                                    # Documentación técnica y especificaciones
│   ├── FINANCIAL_ENGINE_SPECIFICATION.md    # Auditoría matemática de fórmulas
│   └── MAINTENANCE_AND_UPDATES.md           # Guía de actualizaciones y dependencias
└── .agents/rules/                           # 🛡️ REGLAS DEL WORKSPACE
    └── html2canvas_pdf_export_rules.md      # Reglas críticas para exportación a PDF
```

---

## 3. 🛠️ Herramientas y Comandos de Trabajo

### Comandos de Desarrollo Diario:
```bash
# Iniciar frontend en navegador
npm run dev

# Iniciar aplicación de escritorio en modo Electron Dev (Vite + Electron)
npm run electron:dev

# Comprobación de tipos TypeScript (sin emitir código)
npm run lint

# Validar matemáticas del motor financiero
npx tsx src/engine/testBenchmark.ts

# Compilar frontend y electron para producción
npm run build && npm run build:electron
```

### Herramientas de Control de Versiones y Repositorio:
* **Git**:
  - `git status` / `git diff`: Inspección de cambios.
  - `git add . && git commit -m "tipo(alcance): Mensaje descriptivo"`: Confirmación de cambios estructurados (siguiendo Conventional Commits: `fix`, `feat`, `docs`, `refactor`).
  - `git push origin main`: Envío directo a la rama principal de GitHub (`WilkerDev1/solarsim-pro`).
* **GitHub CLI (`gh`)**:
  - Para crear y publicar releases con binarios adjuntos:
    ```bash
    gh release create v1.X.X release/* --title "SolarSim Pro v1.X.X - Título" --notes-file release/release-notes-v1.X.X.md
    ```

---

## 4. 🚀 Flujo Paso a Paso para Lanzar una Nueva Versión (Release)

Cuando el usuario pida lanzar una nueva versión (ej. `v1.3.8`):

1. **Actualizar la versión en `package.json`**:
   - Cambiar `"version": "1.3.8"`.
2. **Compilar los instaladores de escritorio**:
   - Para Linux: `npm run build:linux` (genera `.AppImage`, `.pacman`, `.deb`, `.tar.gz` en `release/`).
   - Para Windows: `npm run build:win` (genera instalador `.exe` NSIS y portable en `release/`).
3. **Crear notas de la versión**:
   - Crear el archivo `release/release-notes-v1.3.8.md` detallando las novedades.
4. **Confirmar cambios y crear Tag en Git**:
   ```bash
   git add .
   git commit -m "chore(release): Bump version to 1.3.8 and generate binaries"
   git tag v1.3.8
   git push origin main --tags
   ```
5. **Crear la Release en GitHub con `gh`**:
   ```bash
   gh release create v1.3.8 release/SolarSim* release/solarsim* release/latest* \
     --title "⚡ SolarSim Pro v1.3.8" \
     --notes-file release/release-notes-v1.3.8.md
   ```

---

## 5. ⚠️ Invariantes Críticas y Reglas Inquebrantables

### 📄 Exportación a PDF con `html2canvas` & `jsPDF`:
1. **NUNCA usar `truncate` o `overflow: hidden` en etiquetas de texto**:
   - `html2canvas` recorta los trazos inferiores (*descenders*) de letras como 'p', 'g', 'q', 'y' cuando hay `overflow: hidden` en un elemento de texto. Usar `whitespace-nowrap font-bold` sin truncate.
2. **Dimensionamiento de Imágenes**:
   - `html2canvas` ignora `object-fit: contain/cover` en `<img>` si se coloca `w-full h-full`.
   - **Regla**: Usar siempre dimensionamiento intrínseco auto-proporcional: `className="max-h-[Xpx] max-w-[Y%] w-auto h-auto mx-auto block object-contain"`.
3. **Presupuesto de Altura A4 ($850\text{px} \times 1202\text{px}$)**:
   - Header: 76px. Footer: 42px (`items-center`).
   - Cuerpo de la página: `<div className="px-10 pt-3 pb-3 flex-1 flex flex-col justify-between min-h-0">`.
   - **Prohibido `pb-14`**: Cualquier padding inferior grande empuja el footer por debajo de los 1,202px causando que se corte.
4. **Sandbox de Captura**:
   - En `PDFProposalView.tsx`, el sandbox debe tener `position: fixed; zIndex: -9999; pointerEvents: none; background: #ffffff;` para evitar parpadeos visuales al exportar.

### 💰 Motor Financiero y Ley 57-07:
1. **Inversión Neta**:
   $$\text{netInvestmentUSD} = \text{grossInvestmentUSD} - \text{itbisSavedUSD} - \text{ley5707CreditUSD}$$
2. **Amortización Fiscal Ley 57-07**:
   - El crédito fiscal del 40% se divide estrictamente en 3 cuotas anuales iguales (Años 1, 2 y 3).
3. **Parámetros Estándar**:
   - Degradación de paneles: 0.5% anual.
   - Aumento tarifario eléctrico: 4.0% anual.
   - Costo O&M: 1.0% anual de la inversión inicial con inflación del 3.0%.
   - Provisión de reemplazo de baterías: Año 10 (50% del costo inicial de baterías).

---
*Este documento garantiza continuidad total de desarrollo y consistencia técnica en cualquier sesión futura.*
