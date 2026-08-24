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
├── workers/                                 # ☁️ MICROSERVICIOS SERVERLESS (Cloudflare)
│   └── share-viewer/                        # Cloudflare Worker & Visor Web de Propuestas Temporales
│       ├── wrangler.toml                    # Configuración KV y despliegue del worker
│       ├── package.json                     # Hono framework y dependencias de Cloudflare
│       └── src/                             # API (/api/share) y Plantilla Web (/p/:id)
├── src/
│   ├── main.tsx                             # Punto de entrada de React
│   ├── App.tsx                              # Enrutador y vista principal (Simulador vs Propuesta PDF)
│   ├── index.css                            # Estilos base, scrollbars y regla @page para A4
│   ├── types/
│   │   ├── index.ts                         # Tipos TypeScript de simulación, cliente, finanzas y PDF
│   │   └── defaultDocumentCustomization.ts  # Valores por defecto de personalización empresarial
│   ├── services/
│   │   └── shareProposalService.ts          # Servicio de publicación de propuestas web en Cloudflare
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
│       │   ├── AIInvoiceScannerModal.tsx    # Modal de escáner de facturas con Gemini Vision
│       │   └── ShareProposalModal.tsx       # Modal de compartir propuesta web interactiva y QR
│       ├── simulator/                       # 🎛️ VISTA DEL SIMULADOR INTERACTIVO (Modular)
│       │   ├── SimulatorView.tsx            # Orquestador conciso y limpio (<150 líneas)
│       │   ├── sidebar/                     # 📂 Barra Lateral de Parámetros
│       │   │   ├── ParameterSidebar.tsx     # Contenedor con drawer redimensionable, acordeones y temas
│       │   │   ├── ClientParamsSection.tsx  # Sección 1: Cliente, Provincia, GPS NASA SSE
│       │   │   ├── RatesParamsSection.tsx   # Sección 2: Tarifas, Distribuidora, Inyección Cero, SIE-007
│       │   │   ├── EquipmentParamsSection.tsx# Sección 3: Paneles, Inversores, Baterías y Avanzados
│       │   │   ├── PricingParamsSection.tsx # Sección 4: Precio Directo, Destino Excedente y Margen
│       │   │   └── FinancialsParamsSection.tsx# Sección 5: Financiamiento, ITBIS 100% y Ley 57-07 40%
│       │   └── tabs/                        # 📂 Pestañas de Análisis y Resultados
│       │       ├── EnergyAnalysisTab.tsx    # Pestaña 1: Métricas de Energía, Gráfico y Factura IA
│       │       ├── QuotationEquipmentsTab.tsx# Pestaña 2: Cotización, Equipos y Matriz con Selector USD/DOP
│       │       └── FinancialReturnTab.tsx   # Pestaña 3: KPIs VAN, TIR, Payback y Flujo 25 Años
│       └── pdf/                             # 📄 VISTA Y GENERADOR DE PROPUESTAS PDF
│           ├── PDFProposalView.tsx          # Visor de propuesta con modo edición in-situ y exportación
│           ├── PDFHeaderBanner.tsx          # Cabecera estándar de hojas interiores (76px)
│           ├── PDFFooter.tsx                # Pie de página estándar (42px, centrado, sin truncate)
│           ├── PDFWatermark.tsx             # Marca de agua central vectorial / base64
│           ├── controls/
│           │   ├── PDFSidebarControls.tsx   # Panel de control de páginas, temas y personalización
│           │   └── PDFCustomizationModal.tsx# Modal "Modo Edición" (logos, marcas de agua, anexos)
│           └── pages/                       # 📑 PLANTILLAS DE HOJAS INDIVIDUALES (A4 Con Edición In-Situ)
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
│   ├── CLOUDFLARE_WORKER_GUIDE.md           # Guía de despliegue de Cloudflare Workers & KV
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

# Validar matemáticas del motor financiero contra benchmarks
npx tsx src/engine/testBenchmark.ts

# Compilar frontend y electron para producción
npm run build && npm run build:electron

# Generar snapshot de contexto empaquetado del repositorio para asistentes IA (Repomix)
npm run context:pack
```

### Herramientas de Control de Versiones y Repositorio:
* **Estrategia de Ramas Dual (`main` vs `beta`)**:
  - `main`: **Rama Estable / Producción**. Contiene las versiones publicadas a los clientes. Solo recibe parches de estabilidad críticos (hotfixes) y merges finales de `beta`.
  - `beta`: **Rama de Desarrollo Activo / Nuevas Funciones**. Aquí se implementan todas las nuevas características, mejoras visuales y refactorizaciones antes de ser publicadas en producción.
* **Git**:
  - `git status` / `git diff`: Inspección de cambios.
  - `git add . && git commit -m "tipo(alcance): Mensaje descriptivo"`: Confirmación de cambios estructurados (siguiendo Conventional Commits: `fix`, `feat`, `docs`, `refactor`).
  - `git push origin beta` o `git push origin main`: Envío a la rama correspondiente.
* **GitHub CLI (`gh`)**:
  - Para crear y publicar releases con binarios adjuntos:
    ```bash
    gh release create v1.X.X release/* --title "SolarSim Pro v1.X.X - Título" --notes-file release/release-notes-v1.X.X.md
    ```

---

## 4. 🔀 Flujo de Trabajo en Paralelo & Ciclo Obligatorio de Verificación

### 🔄 Ciclo Obligatorio de Verificación (Verification Loop):
**NO dar ninguna tarea por completada sin ejecutar previamente:**
1. **Verificación de Tipos**: `npm run lint` (`npx tsc --noEmit` — Cero errores de tipo).
2. **Validación de Motores Matemáticos**: `npx tsx src/engine/testBenchmark.ts` y `npx tsx src/engine/testFinancialEngineComprehensive.ts`.
3. **Build de Producción**: `npm run build` (confirmar bundling sin fallos).
4. **Snapshot de Contexto**: Si se introducen nuevos módulos, refactorizaciones grandes o cambios estructurales, regenerar el contexto empaquetado con `npm run context:pack`.

---

### A. Desarrollo de Nuevas Funciones (En rama `beta`):
1. Todo nuevo desarrollo se realiza en `beta`:
   ```bash
   git checkout beta && git pull origin beta
   ```
2. Desarrollar la funcionalidad y validar el Ciclo de Verificación:
   ```bash
   npm run lint && npx tsx src/engine/testBenchmark.ts && npm run build
   ```
3. Confirmar cambios con commits semánticos y subir:
   ```bash
   git add . && git commit -m "feat(modulo): Descripción de la nueva función"
   git push origin beta
   ```

### B. Parches Críticos / Hotfixes en Producción (En rama `main`):
1. Si surge un bug urgente en producción, cambiar a `main`:
   ```bash
   git checkout main && git pull origin main
   ```
2. Aplicar la corrección y validar con el Ciclo de Verificación.
3. Crear el release de parche (ej. `v1.3.10`) siguiendo el protocolo de la Sección 5.
4. **Sincronizar hacia `beta`** inmediatamente para que desarrollo no pierda el arreglo:
   ```bash
   git checkout beta
   git merge main
   git push origin beta
   ```

### C. Fusión / Merge de Beta hacia Main (Cierre de Versión):
Cuando un conjunto de funciones en `beta` esté completamente listo y probado para salir al público:
1. Validar suite completa en `beta`:
   ```bash
   npm run lint && npx tsx src/engine/testBenchmark.ts && npm run build
   ```
2. Fusionar `beta` en `main`:
   ```bash
   git checkout main
   git merge beta
   ```
3. Ejecutar el **Protocolo de Lanzamiento de Release (Sección 5)** para compilar y publicar la nueva versión mayor/menor (ej. `v1.4.0`).
4. Sincronizar de vuelta a `beta`:
   ```bash
   git checkout beta
   git merge main
   git push origin beta
   ```

---

## 5. 🚀 Protocolo Maestro de Lanzamiento de Releases (Release Runbook)

Este es el procedimiento exacto que ejecuto cuando solicitas publicar una actualización (ya sea un hotfix o una nueva versión estable):

### Paso 1: Actualizar la versión en `package.json`
Modificar `"version"` (ejemplo: `"1.4.0"` o `"1.3.10"`).

### Paso 2: Validación de Tipos y Motores
```bash
npm run lint                  # tsc --noEmit (Cero errores)
npx tsx src/engine/testBenchmark.ts   # Validación matemática de Ley 57-07, VAN, TIR, Payback
```

### Paso 3: Compilación del Frontend y Runtime de Electron
```bash
npm run build && npm run build:electron
```

### Paso 4: Empaquetar Binarios para Windows y Linux
```bash
npx electron-builder --win --linux
```
*(Genera `.exe`, `.AppImage`, `.pacman`, `.deb`, `.tar.gz`, `latest.yml` y `latest-linux.yml` en la carpeta `release/`).*

### Paso 5: Preparación de Nombres y Firmas Criptográficas GPG (Linux)
```bash
python3 -c "
import shutil, os, subprocess

v = '1.4.0' # Versión a lanzar

# Copias de compatibilidad para electron-updater
shutil.copyfile(f'release/SolarSim Pro Setup {v}.exe', f'release/SolarSim-Pro-Setup-{v}.exe')
shutil.copyfile(f'release/SolarSim Pro Setup {v}.exe.blockmap', f'release/SolarSim-Pro-Setup-{v}.exe.blockmap')
shutil.copyfile(f'release/SolarSim Pro {v}.exe', f'release/SolarSim-Pro-{v}.exe')
shutil.copyfile(f'release/SolarSim Pro-{v}.AppImage', f'release/SolarSim-Pro-{v}.AppImage')

# Exportar clave pública GPG
subprocess.run(['gpg', '--armor', '--export', 'C22D550C3A2C8FAF'], stdout=open('release/solarsim-public-key.asc', 'w'), check=True)

# Firmar paquetes de Linux
for target in [f'release/solarsim-pro-{v}.pacman', f'release/solarsim-pro-{v}.tar.gz', f'release/SolarSim-Pro-{v}.AppImage']:
    sig = target + '.sig'
    if os.path.exists(sig):
        os.remove(sig)
    subprocess.run(['gpg', '--detach-sign', '--yes', target], check=True)
"
```

### Paso 6: Crear Notas de la Versión
Crear el archivo `release/release-notes-v1.4.0.md` detallando las novedades y mejoras.

### Paso 7: Commit, Tag y Push a GitHub
```bash
git add .
git commit -m "chore(release): Bump version to 1.4.0 and generate binaries"
git tag v1.4.0
git push origin main --tags
```

### Paso 8: Publicar la Release Oficial en GitHub vía CLI (`gh`)
```bash
gh release create v1.4.0 release/SolarSim* release/solarsim* release/latest* \
  --title "⚡ SolarSim Pro v1.4.0" \
  --notes-file release/release-notes-v1.4.0.md
```

---

## 6. ⚠️ Invariantes Críticas y Reglas Inquebrantables

### 🖥️ Arquitectura y Seguridad en Electron (Aislamiento de Procesos):
1. **Aislamiento Estricto del Renderizador (`src/`)**:
   - El código en `src/` corre en el contexto de Chromium y **NUNCA** debe importar módulos nativos de Node.js (`fs`, `path`, `child_process`, `os`, etc.).
2. **Puente Seguro IPC**:
   - Toda comunicación entre la interfaz (React) y las capacidades del sistema operativo (guardar archivos, auto-actualizaciones, diálogos nativos) debe realizarse **exclusivamente** a través de la API segura expuesta en `electron/preload.ts` (`window.electronAPI`) y manejada en `electron/main.ts` con `ipcMain.handle`.

### 🧠 Integridad del Motor Financiero y Solar:
1. **Contrato de Fórmulas Oficiales**:
   - Antes de modificar o refactorizar cálculos solares o financieros, es obligatorio consultar `docs/FINANCIAL_ENGINE_SPECIFICATION.md`.
2. **Inversión Neta y Deducción Ley 57-07**:
   $$\text{netInvestmentUSD} = \text{grossInvestmentUSD} - \text{itbisSavedUSD} - \text{ley5707CreditUSD}$$
   - **Base Estricta de Equipos**: El crédito fiscal del 40% para el ISR aplica **exclusivamente sobre equipos fotovoltaicos y de almacenamiento** (paneles, inversores y baterías), deduciendo la mano de obra del cálculo.
3. **Amortización Fiscal Ley 57-07**:
   - El crédito fiscal del 40% se divide estrictamente en 3 cuotas anuales iguales (Años 1, 2 y 3: $13.33\%$ anual).
4. **Parámetros Estándar Auditados**:
   - Degradación de paneles: 0.5% anual.
   - Aumento tarifario eléctrico: 4.0% anual.
   - Costo O&M: 1.0% anual de la inversión inicial con inflación del 3.0%.
   - Provisión de reemplazo de baterías: Año 10 (50% del costo inicial de baterías).

### 📄 Exportación a PDF con `html2canvas` & `jsPDF`:
1. **Reglas del Workspace**: Consultar `.agents/rules/html2canvas_pdf_export_rules.md` antes de crear o editar hojas del PDF.
2. **NUNCA usar `truncate` o `overflow: hidden` en etiquetas de texto**:
   - `html2canvas` recorta los trazos inferiores (*descenders*) de letras como 'p', 'g', 'q', 'y' cuando hay `overflow: hidden` en un elemento de texto. Usar `whitespace-nowrap font-bold` sin truncate.
3. **Dimensionamiento de Imágenes**:
   - `html2canvas` ignora `object-fit: contain/cover` en `<img>` si se coloca `w-full h-full`. Usar siempre dimensionamiento intrínseco auto-proporcional: `className="max-h-[Xpx] max-w-[Y%] w-auto h-auto mx-auto block object-contain"`.
4. **Presupuesto de Altura A4 ($850\text{px} \times 1202\text{px}$)**:
   - Header: 76px. Footer: 42px (`items-center`).
   - Cuerpo de la página: `<div className="px-10 pt-3 pb-3 flex-1 flex flex-col justify-between min-h-0">`.
   - **Prohibido `pb-14`**: Cualquier padding inferior grande empuja el footer por debajo de los 1,202px causando que se corte.
5. **Sandbox de Captura**:
   - En `PDFProposalView.tsx`, el sandbox debe tener `position: fixed; zIndex: -9999; pointerEvents: none; background: #ffffff;` para evitar parpadeos visuales al exportar.

### 📦 Sistema de Empaquetado de Contexto (Repomix):
- La configuración reside en `repomix.config.json`.
- El comando `npm run context:pack` empaqueta toda la arquitectura de código y documentación en un snapshot XML optimizado (`repomix-output.xml`) excluyendo binarios, imágenes y dependencias pesadas.

---
*Este documento garantiza continuidad total de desarrollo, gobernanza y consistencia técnica en cualquier sesión futura.*
