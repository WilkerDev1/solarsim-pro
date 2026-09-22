# ☀️ SolarSim Pro — Manual Maestro de Contexto, Arquitectura y Mantenimiento

Este documento sirve como **fuente única de verdad** para desarrolladores y asistentes IA (Antigravity / Gemini) en nuevas sesiones de trabajo. Contiene la explicación exhaustiva de qué es el proyecto, la ubicación de cada componente, las herramientas utilizadas para desarrollo y despliegue, la infraestructura de servidores y las reglas críticas aprendidas.

---

## 1. 📖 ¿Qué es SolarSim Pro?

**SolarSim Pro** es una plataforma de software de escritorio (construida con Electron + React + TypeScript) y backend serverless/auto-hospedado, diseñada para ingenieros, consultores e instaladores de energía solar fotovoltaica en **República Dominicana**.

### Capacidades Principales:
1. **Dimensionamiento Técnico & Solar**:
   - Estimación de irradiación solar ($\text{HSP}$) específica para las 32 provincias de RD (datos satelitales NASA SSE / NREL y soporte para HSP personalizado).
   - Balance de energía horaria y mensual, autoconsumo e inyección bajo el régimen de Medición Neta con las distribuidoras (**EDEESTE, EDESUR, EDENORTE, CEPM**).
   - Cobertura de todas las tarifas dominicanas (**BTS1, BTS2, BTD, MTD1, MTD2, MTH, VMT1, VMT2, VMT3**) y aplicación de retención oficial del 25% de la producción de exportación (Resolución SIE-007-2026-REG).
   - **Despacho Físico de Baterías BESS & Partición de Carga Diurna Semi-Automática**: Simulación de ciclado real de almacenamiento diario (absorción del excedente diurno para suplir demanda nocturna) y partición física de carga diurna (8am-5pm) inferida automáticamente según tarifa dominicana o consumo: **Residencial 35%** (`BTS1`, `BTS2`), **Comercial 75%** (`BTD`), **Industrial 90%** (`MTD`), o slider manual interactivo (15%-95%). Con BESS activo, calcula matemáticamente la energía útil diaria ($E_{bat, util} = \text{Capacidad} \times \text{DoD} \times \eta$), cargando de excedentes y desplazando demanda nocturna real sin saturaciones artificiales al 100%.
   - **Ingeniería Transparente & Gráficos Mixtos (ComposedChart)**: Separación explícita de Autoconsumo en Sitio (100% de tarifa), Inyección a Red (bruta y neta acreditada al 75%) y Ahorro Facturable total en Simulador, PDF y Propuesta Web Cloudflare.
   - Factor de pérdidas del sistema visible y configurable (predeterminado auditado: **25.0%**).
2. **Catálogo Inteligente de Equipos, Almacenamiento (BESS) & Precios por Proveedor**:
   - Base de datos local y sincronizada en la nube con modelos verificados de **Paneles Solares** (Canadian Solar TOPBiHiKu6 TOPCon 590W-620W), **Inversores Híbridos Split Phase** (LuxpowerTek LXP-LB-US 8k/10k) y **Baterías Litio LiFePO4** (HinaESS PowerGem Max 16.08kWh).
   - **Gestión Multi-Proveedor de Precios de Compra**: Cada equipo soporta múltiples ofertas comerciales de distribuidores con precio unitario en USD, moneda original, SKU, fecha de actualización, estado de stock y notas.
   - **Modo Auto-costo desde Proveedores**: Sincronización instantánea de los costos unitarios de compra del proyecto (`panelUnitPriceUSD`, `inverterUnitPriceUSD`, `batteryUnitPriceUSD`) con el mejor precio disponible en el mercado.
   - Selector inteligente con búsqueda en tiempo real, conteo de proveedores cotizando cada equipo y ventana comparativa de ofertas comerciales.
3. **Inteligencia Artificial Multimodal (Gemini Vision) & Smart Proposal Studio**:
   - **Smart Proposal Studio (Automatización al 95%)**: Combina la factura eléctrica EDE (o consumo estimado) con requisitos y alcance del proyecto en texto libre. Realiza grounding estricto en tiempo real contra el catálogo de equipos para seleccionar módulos Tier-1 (Canadian Solar 615W/620W), dimensionar inversores híbridos en paralelo (traduciendo ej: 16 kW a 2x 8 kW split-phase), agregar bancos de almacenamiento BESS (HinaESS 16.08 kWh, Weco), fijar márgenes comerciales (ej: 40% en modo matriz de costos) y sincronizar los precios más competitivos de distribuidores.
   - **Escáner de Facturas EDE**: Extracción automática de NIS/NIC, RNC, cliente, historial de 12 meses de consumo (kWh), tarifa y potencia contratada en kW (`gemini-2.5-flash` / `gemini-3.5-flash-lite`).
   - **Escáner de Fichas Técnicas (Datasheets)**: Extracción instantánea de parámetros de paneles (Wp, eficiencia, coef. temp, degradación), inversores (kW AC, máx DC, MPPTs) y baterías (kWh, Ah, V, DoD %, ciclos, corriente máx).
   - **Escáner de Listas de Precios de Proveedores**: Extracción multimodal de cotizaciones y catálogos comerciales de distribuidores en PDF e imagen, con **Smart Fuzzy Matching** para comparar y emparejar automáticamente los modelos del distribuidor con los equipos del catálogo de referencia.
4. **Ingeniería Financiera & Ley 57-07 (Auditada)**:
   - Exoneración del 100% de ITBIS (18%) y aranceles sobre equipos solares.
   - Crédito fiscal del 40% del costo de inversión en equipos aplicable al Impuesto Sobre la Renta (ISR) amortizable en 3 años fiscales ($13.33\%$ anual).
   - Proyecciones de Flujo de Caja a 25 años, Payback Simple y Descontado, VAN (NPV), TIR (IRR), LCOE y ROI total.
5. **Generador de Propuestas Técnicas y Económicas en PDF**:
   - Dossier ejecutivo modular de 11 a 12 páginas con maquetación de revista (*Executive Pitch Deck*).
   - **Página de Cuadro Resumen Ejecutivo** integrada justo tras el índice con KPIs clave, desglose técnico de módulos, inversores y BESS, divisas y desembolso neto con Ley 57-07.
   - **Reorganización Dinámica Drag-and-Drop**: Posibilidad de reordenar hojas del PDF y anexos PDF externos mediante arrastrar y soltar, sincronizando automáticamente la numeración de páginas y el índice (*Table of Contents*).
   - Personalización multi-empresa (*Document Customization*): logos, lemas, firmas, teléfonos, marcas de agua y paletas de color corporativas.
6. **Sincronización en la Nube & Multi-usuario (RBAC)**:
   - Servidor backend Node.js (`server/`) desplegado en Docker (`solarsim-api` + PostgreSQL) en Proxmox CT 100 (`10.0.0.103`).
   - Autenticación JWT, control de acceso por roles (ADMIN, EDITOR, VIEWER), sincronización delta de proyectos y catálogo global.
   - Publicación de propuestas web interactivas con Cloudflare Workers + KV y códigos QR (con gráfica combinada y desglose transparente).
7. **Papelera de Reciclaje (Recycle Bin / Trash) & Modo Solo Lectura**:
   - Borrado suave (*soft-delete*) con retención automática auditada de **30 días** (`deletedAt`, `deletedBy`).
   - Visualización y exploración de proyectos eliminados en **Modo Solo Lectura** (Simulador y PDF con banner de advertencia ámbar y protección contra mutaciones).
   - Acciones de recuperación: **Restaurar** al catálogo activo, **Eliminación Definitiva Física** individual, o **Vaciar Papelera** completa.
   - Sincronización transparente con PostgreSQL mediante purga automática en el servidor para registros mayores a 30 días (`POST /api/sync/pull`) y endpoints de restauración (`POST /api/projects/:id/restore`) y vaciado (`DELETE /api/trash`).
   - Acceso dual desde el **Dock vertical** (icono `Trash2` con badge reactivo) y la carpeta integrada del **Árbol Lateral** con soporte para **Drag and Drop**.

---

## 2. 🗂️ Mapa del Repositorio: Dónde está Cada Cosa

```
solarsim/
├── AGENTS.md                                # Este manual maestro para IAs y desarrolladores
├── package.json                             # Configuración del proyecto, dependencias y scripts
├── vite.config.ts                           # Configuración de Vite para React y bundling web
├── tailwind.config.js                       # Configuración de Tailwind CSS y paletas de colores
├── repomix.config.json                      # Configuración de empaquetado de contexto para IA
├── server/                                  # 🖥️ BACKEND NODE.JS + HONO + POSTGRESQL (Sync & Auth API)
│   ├── src/
│   │   ├── index.ts                         # Endpoints REST (/api/auth, /api/projects, /api/equipment, /api/health)
│   │   └── db.ts                            # Pool PostgreSQL e inicialización de tablas (users, projects, equipment)
│   ├── Dockerfile                           # Contenedor de producción para solarsim-api
│   ├── package.json                         # Dependencias del backend (@hono/node-server, pg, bcryptjs, jsonwebtoken)
│   └── tsconfig.json                        # Configuración TypeScript del servidor
├── infra/                                   # 🌐 INFRAESTRUCTURA & SERVIDORES (Docker, Caddy, Postgres)
│   ├── INFRASTRUCTURE.md                    # Mapa maestro de red, host Proxmox, CT 100 y servicios
│   └── services/                            # Composiciones Docker por servicio
│       ├── caddy/                           # Proxy inverso Caddy con SSL automático (puertos 80, 443)
│       ├── database/                        # PostgreSQL 16 Alpine persistente
│       ├── solarsim-api/                    # API de sincronización conectada a solarsim_net
│       └── electsun-web/                    # Landing page corporativa de Electsun
├── electron/                                # 🖥️ RUNTIME DE ESCRITORIO MODULAR (Node.js / Chromium)
│   ├── main.ts                              # Orquestador de ciclo de vida (<40 líneas)
│   ├── preload.ts                           # Puente seguro contextBridge entre Electron y React
│   ├── window/                              # Ventana principal, flags Linux/Wayland y print-to-pdf (windowManager.ts)
│   ├── menu/                                # Menú nativo del sistema operativo (appMenu.ts)
│   ├── updater/                             # Auto-updater y gestor de paquetes Linux .pacman/.deb (autoUpdaterHandler.ts)
│   └── ai/                                  # Motor IA modular (prompts, schema, httpClient, extractor, fallback 503 Familia 3)
├── workers/                                 # ☁️ MICROSERVICIOS SERVERLESS (Cloudflare)
│   └── share-viewer/                        # Cloudflare Worker & Visor Web de Propuestas Temporales
│       ├── wrangler.toml                    # Configuración KV y despliegue del worker
│       ├── package.json                     # Hono framework y dependencias de Cloudflare
│       └── src/                             # API (/api/share) y Plantilla Web (/p/:id)
├── src/
│   ├── main.tsx                             # Punto de entrada de React
│   ├── App.tsx                              # Enrutador y vista principal (Simulador vs Propuesta PDF vs Dashboard)
│   ├── index.css                            # Estilos base, scrollbars y regla @page para A4
│   ├── types/
│   │   ├── index.ts                         # Tipos TypeScript de simulación, cliente, finanzas y PDF
│   │   ├── equipment.ts                     # Tipos del catálogo de paneles, inversores y baterías BESS
│   │   ├── aiInvoice.ts                     # Tipos de escaneo de facturas con Gemini Vision
│   │   └── defaultDocumentCustomization.ts  # Valores por defecto de personalización empresarial
│   ├── services/
│   │   ├── syncService.ts                   # Cliente HTTP de sincronización con solarsim-api
│   │   ├── geminiInvoiceService.ts          # Integración con Google Gemini para facturas
│   │   ├── geminiDatasheetService.ts        # Extracción multimodal de fichas técnicas con Gemini
│   │   ├── geminiPriceCatalogService.ts     # Extracción y matching con IA de listas de precios de proveedores
│   │   └── shareProposalService.ts          # Servicio de publicación de propuestas web en Cloudflare
│   ├── store/                               # 🧠 ESTADO GLOBAL MODULAR ZUSTAND (Slice Pattern)
│   │   ├── useSimulationStore.ts            # Orquestador raíz limpio (<120 líneas) con persistencia
│   │   ├── types.ts                         # Definición de tipos de slices y store compuesto
│   │   ├── initialData.ts                   # Proyectos iniciales y generadores de secuencias (SP-2026, C-0001)
│   │   └── slices/
│   │       ├── projectSlice.ts              # CRUD de proyectos, dimensionamiento y mutación de parámetros
│   │       ├── folderSlice.ts               # CRUD de carpetas personalizadas y asignación drag and drop
│   │       ├── equipmentSlice.ts            # Catálogo de equipos, proveedores, ofertas y sync
│   │       ├── syncAuthSlice.ts             # Autenticación JWT y sincronización con solarsim-api
│   │       ├── importExportSlice.ts         # Importación, exportación JSON y resolución de conflictos
│   │       ├── aiSlice.ts                   # Configuración Gemini API y escáner de facturas
│   │       └── uiSlice.ts                   # Modales, temas claro/oscuro y ancho de sidebar
│   ├── data/
│   │   ├── rdProvinces.ts                   # Datos de irradiación solar (HSP) por provincia de RD
│   │   └── defaultEquipmentCatalog.ts       # Catálogo base oficial verificado (Canadian Solar, Luxpower, HinaESS)
│   ├── engine/                              # 🔬 MOTORES DE CÁLCULO PUROS (Sin UI)
│   │   ├── solarEngine.ts                   # Balance de energía, generación mensual y cobertura
│   │   ├── financeEngine.ts                 # Flujo de caja 25 años, VAN, TIR, Payback, ROI y Ley 57-07
│   │   └── referenceCase.ts                 # Caso de referencia oficial auditado (BENCHMARK_PROJECT)
│   ├── tests/                               # 🧪 SUITES DE PRUEBAS UNITARIAS Y DE REGRESIÓN
│   │   ├── testBenchmark.ts                 # Script de validación de cálculos contra benchmarks
│   │   ├── testFinancialEngineComprehensive.ts # Suite de 9 pruebas unitarias financieras
│   │   ├── testAISmartProposal.ts           # Suite de validación de Smart Proposal IA, cobertura 95% y sanitización
│   │   ├── testEquipmentCatalog.ts          # Suite de validación de catálogo de equipos, CRUD y tombstoning
│   │   ├── testFolderHidingAndSync.ts       # Suite de validación de ocultamiento en carpetas y sincronización
│   │   ├── testTrashAndReadOnly.ts          # Suite de validación de papelera de reciclaje, retención 30 días y solo lectura
│   │   ├── testMultiUserSync.ts             # Prueba de sincronización multi-usuario y resolución de colisiones
│   │   └── testNewProjectModal.ts           # Prueba unitaria de creación de proyectos
│   ├── assets/
│   │   └── pdfGraphicAssets.ts              # Gráficos, renders 3D y diagramas en Base64 para PDF
│   ├── utils/
│   │   └── equipmentBrandUtils.ts           # Normalización de marcas, inferencia heurística y matching tolerante a alias
│   └── components/
│       ├── layout/                          # 🧭 NAVEGACIÓN Y ESTRUCTURA GLOBAL
│       │   └── PrimaryIconDock.tsx          # Dock vertical oscuro estrecho (Tema Sol/Luna, Proyectos, Hub Unificado de IA, Papelera, Ajustes)
│       ├── dashboard/                       # 🗂️ HOME Y EXPLORADOR DE PROPUESTAS
│       │   ├── DashboardView.tsx            # Lienzo principal de proyectos con buscador, filtros avanzados y folders resume
│       │   ├── ProjectCard.tsx              # Tarjeta moderna de proyecto con resumen técnico y drag source
│       │   ├── TrashView.tsx                # Lienzo de papelera con barra de búsqueda, vaciado masivo y retención 30 días
│       │   ├── TrashProjectCard.tsx         # Tarjeta de propuesta en papelera con countdown 30d, restaurar y hard delete
│       │   ├── FoldersResumeGrid.tsx        # Grid inferior de resumen de carpetas con estadísticas
│       │   └── sidebar/                     # Explorador lateral del Dashboard
│       │       ├── SolarCoreTreeSidebar.tsx # Árbol de Projects, Team, Folders y Papelera (drag target)
│       │       └── CreateFolderModal.tsx    # Modal de creación y edición de carpetas (ADMIN)
│       ├── settings/                        # ⚙️ CENTRO DE CONFIGURACIÓN EN PANTALLA COMPLETA
│       │   ├── SettingsModal.tsx            # Orquestador con navegación por tabs, scroll spy y temas
│       │   ├── SettingsSidebar.tsx          # Sidebar de accesos directos (Cuenta, Simulación, IA, Catálogo, RBAC, Respaldo)
│       │   └── sections/                    # Módulos de configuración (Profile, SimulationPreferences, Integrations, Equipment, Organization, Backup)
│       ├── common/                          # Modales, cabeceras y utilidades compartidas
│       │   ├── Header.tsx                   # Barra superior con navegación, estado de sync y botones
│       │   ├── EquipmentManagerSettingsTab.tsx # Administrador de Catálogo con tabla, edición, ofertas y sync en la nube
│       │   ├── ai-invoice/                  # 📁 Módulo desacoplado de Smart Proposal Studio
│       │   │   ├── types.ts                 # Interfaces y constantes de UI
│       │   │   ├── AIInvoiceScannerModal.tsx# Orquestador raíz limpio (~220 líneas)
│       │   │   ├── hooks/useAIInvoiceScanner.ts # Lógica matemática, Gemini, zoom y mes pico
│       │   │   └── components/              # Subcomponentes (Config, Loading, DocViewer, Client, Consumption, Solar, Error)
│       │   ├── AIDatasheetScannerModal.tsx  # Modal de escáner de fichas técnicas de equipos con IA
│       │   ├── AIPriceCatalogScannerModal.tsx # Modal de escaneo de listas de precios con IA y fuzzy matching
│       │   ├── SupplierPricesDetailModal.tsx # Modal de comparativa y selección de ofertas por proveedor
│       │   ├── SupplierManagerSection.tsx   # Panel integral de gestión y edición de distribuidores y precios
│       │   ├── ShareProposalModal.tsx       # Modal de compartir propuesta web interactiva y QR
│       │   ├── ImportConflictModal.tsx      # Modal de resolución de conflictos de importación
│       │   ├── NewProjectModal.tsx          # Modal de creación rápida de proyectos
│       │   └── UpdateModal.tsx              # Modal de actualización de versión de escritorio
│       ├── simulator/                       # 🎛️ VISTA DEL SIMULADOR INTERACTIVO
│       │   ├── SimulatorView.tsx            # Orquestador conciso y limpio (<150 líneas)
│       │   ├── sidebar/                     # Barra Lateral de Parámetros
│       │   │   ├── ParameterSidebar.tsx     # Contenedor con drawer redimensionable, acordeones y temas
│       │   │   ├── ClientParamsSection.tsx  # Sección 1: Cliente, Provincia, GPS NASA SSE
│       │   │   ├── RatesParamsSection.tsx   # Sección 2: Tarifas, Distribuidora, Inyección Cero, SIE-007
│       │   │   ├── EquipmentParamsSection.tsx# Sección 3: Paneles, Inversores, Baterías y Pérdidas del Sistema
│       │   │   ├── PricingParamsSection.tsx # Sección 4: Precio Directo, Destino Excedente y Margen
│       │   │   ├── FinancialsParamsSection.tsx# Sección 5: Financiamiento, ITBIS 100% y Ley 57-07 40%
│       │   │   └── SearchableEquipmentSelect.tsx # Combobox inteligente con búsqueda en tiempo real
│       │   └── tabs/                        # Pestañas de Análisis y Resultados
│       │       ├── EnergyAnalysisTab.tsx    # Pestaña 1: Métricas de Energía, Gráfico y Factura IA
│       │       ├── QuotationEquipmentsTab.tsx# Pestaña 2: Cotización, Equipos y Matriz con Selector USD/DOP
│       │       └── FinancialReturnTab.tsx   # Pestaña 3: KPIs VAN, TIR, Payback y Flujo 25 Años
│       └── pdf/                             # 📄 VISTA Y GENERADOR DE PROPUESTAS PDF (A4)
│           ├── PDFProposalView.tsx          # Visor de propuesta con modo edición in-situ y exportación
│           ├── PDFHeaderBanner.tsx          # Cabecera estándar de hojas interiores (76px)
│           ├── PDFFooter.tsx                # Pie de página estándar (42px, centrado, sin truncate)
│           ├── PDFWatermark.tsx             # Marca de agua central vectorial / base64
│           ├── controls/
│           │   ├── PDFSidebarControls.tsx   # Panel de control de páginas, temas y personalización
│           │   └── PDFCustomizationModal.tsx# Modal "Modo Edición" (logos, marcas de agua, anexos)
│           └── pages/                       # Plantillas de hojas individuales A4 (1 a 11)
├── release/                                 # Binarios generados (.exe, .AppImage, .pacman, .deb)
└── docs/                                    # Documentación técnica y especificaciones
    ├── INFRASTRUCTURE_ARCHITECTURE.md       # Manual maestro de arquitectura de infraestructura, Proxmox, Postgres y API
    ├── DATABASE_AND_API_SPECIFICATION.md    # Manual técnico de BD PostgreSQL, JSONB supplier_prices y APIs REST
    ├── AI_SCANNERS_SPECIFICATION.md         # Manual técnico de motores y escáneres de IA multimodal Gemini Vision
    ├── CLOUDFLARE_WORKER_GUIDE.md           # Guía de despliegue de Cloudflare Workers & KV
    ├── FINANCIAL_ENGINE_SPECIFICATION.md    # Auditoría matemática de fórmulas
    └── MAINTENANCE_AND_UPDATES.md           # Guía de actualizaciones y dependencias
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
npx tsx src/tests/testBenchmark.ts

# Suite integral de 9 pruebas unitarias financieras
npx tsx src/tests/testFinancialEngineComprehensive.ts

# Suite de validación de Smart Proposal IA y dimensionamiento al 95%
npx tsx src/tests/testAISmartProposal.ts

# Suite de validación de catálogo de equipos, CRUD persistente y detección de coincidencias
npx tsx src/tests/testEquipmentCatalog.ts

# Suite de validación de ocultamiento en carpetas y sincronización
npx tsx src/tests/testFolderHidingAndSync.ts

# Suite de validación de papelera de reciclaje, retención de 30 días y solo lectura
npx tsx src/tests/testTrashAndReadOnly.ts

# Suite de validación de tarifas SIE y CEPM
npx tsx src/tests/testTariffEngine.ts

# Suite de validación de modelos Familia 3 y cascada de respaldo 503
npx tsx src/tests/testGeminiFamily3Cascade.ts

# Suite de validación de historial y vigencia de propuestas Cloudflare
npx tsx src/tests/testCloudflareShareHistory.ts

# Suite de validación de multi-equipamiento (inversores, paneles y BESS en paralelo)
npx tsx src/tests/testMultiEquipment.ts

# Suite de validación de reordenación drag-and-drop de secciones y anexos PDF
npx tsx src/tests/testPDFSectionReordering.ts

# Suite de validación de balance de energía, autoconsumo diurno y transparencia BESS
npx tsx src/tests/testEnergyBalanceTransparency.ts

# Ejecutar todas las pruebas en conjunto (12 suites integradas)
npm test

# Compilar frontend y electron para producción
npm run build && npm run build:electron

# Generar snapshot de contexto empaquetado del repositorio para asistentes IA (Repomix)
npm run context:pack
```

### Comandos de Servidor & Backend (`solarsim-api`):
```bash
# Comprobar estado de servicios en app-server
ssh app-server "docker ps"

# Ver logs de la API de sincronización
ssh app-server "cd /home/agente/servicios/solarsim-api && docker compose logs --tail=50 -f"

# Desplegar / actualizar solarsim-api
ssh app-server "cd /home/agente/servicios/solarsim-api && docker compose up -d --build"
```

### Herramientas de Control de Versiones y Repositorio:
* **Estrategia de Ramas Dual (`main` vs `beta`)**:
  - `main`: **Rama Estable / Producción**. Contiene las versiones publicadas a los clientes. Solo recibe parches de estabilidad críticos (hotfixes) y merges finales de `beta`.
  - `beta`: **Rama de Desarrollo Activo / Nuevas Funciones**. Aquí se implementan todas las nuevas características, mejoras visuales y refactorizaciones antes de ser publicadas en producción.
* **Git**:
  - `git status` / `git diff`: Inspección de cambios.
  - `git add . && git commit -m "tipo(alcance): Mensaje descriptivo"`: Conventional Commits (`fix`, `feat`, `docs`, `refactor`).
  - `git push origin beta` o `git push origin main`: Envío a la rama correspondiente.

---

## 4. 🔀 Flujo de Trabajo en Paralelo & Ciclo Obligatorio de Verificación

### 🔄 Ciclo Obligatorio de Verificación (Verification Loop):
**NO dar ninguna tarea por completada sin ejecutar previamente:**
1. **Verificación de Tipos**: `npm run lint` (`npx tsc --noEmit` — Cero errores de tipo).
2. **Validación de Motores Matemáticos, Catálogo, Carpetas, IA, Papelera y Balance**: `npm test` (ejecuta las 12 suites: benchmarks, finanzas integrales, smart proposal IA, catálogo, carpetas ocultas, papelera de reciclaje, tarifas SIE/CEPM, cascada 503 Familia 3, historial Cloudflare, multi-equipos, reordenación PDF y transparencia de energía).
3. **Build de Producción**: `npm run build` (confirmar bundling sin fallos).
4. **Snapshot de Contexto**: Si se introducen nuevos módulos, refactorizaciones grandes o cambios estructurales, regenerar el contexto empaquetado con `npm run context:pack`.

---

## 5. ⚠️ Invariantes Críticas y Reglas Inquebrantables

### 🧠 Arquitectura de Estado Modular (Zustand Slices):
1. **Separación Estricta de Slices**:
   - Cada slice (`projectSlice`, `equipmentSlice`, `syncAuthSlice`, `importExportSlice`, `aiSlice`, `uiSlice`) maneja su propio dominio de estado.
   - El store raíz `useSimulationStore.ts` solo debe combinar los slices y configurar la persistencia/rehidratación en `localStorage`.
2. **Cero Cambios Rompientes en la API del Store**:
   - Todos los tipos y helpers exportados originalmente (`NewProjectPayload`, `generateNextProjectSequence`, `findDuplicateProjectInfo`) deben mantenerse exportados desde `useSimulationStore.ts`.

### 🔋 Catálogo de Equipos, Baterías BESS & Prevención de Resurrección (Tombstoning):
1. **Modelos Verificados Oficiales**:
   - El catálogo base (`src/data/defaultEquipmentCatalog.ts`) solo debe contener equipos con especificaciones técnicas verificadas mediante fichas técnicas oficiales (Canadian Solar TOPBiHiKu6, LuxpowerTek LXP-LB-US, HinaESS PowerGem Max / 16.08kWh).
   - Prohibido reinyectar duplicados o alias del mismo equipo con IDs diferentes.
2. **Eliminación Persistente y Prevención de Resurrección (`deletedEquipmentIds`)**:
   - Cuando el usuario elimina un equipo en `removeEquipmentItem(id)`, el ID se registra en el arreglo persistente `deletedEquipmentIds` y se propaga al backend con `DELETE /api/equipment/:id`.
   - `onRehydrateStorage` y `syncEquipmentWithServer` respetan estrictamente `deletedEquipmentIds`: ningún equipo borrado intencionalmente puede volver a insertarse ni por rehidratación de defaults ni por sincronización con la nube.
3. **Detección Inteligente de Coincidencias en Escáner de Datasheets**:
   - El escáner de fichas técnicas (`AIDatasheetScannerModal.tsx`) compara cada variante extraída contra el catálogo existente (`findCatalogMatchForVariant`). Si detecta coincidencia por marca y especificaciones técnicas (potencia/capacidad), alerta al usuario con el porcentaje de certeza y ofrece dos opciones:
     - **🔄 Actualizar Existente**: Actualiza las especificaciones técnicas del equipo existente preservando su ID y cotizaciones de proveedores.
     - **➕ Guardar como Nuevo**: Permite crear un equipo independiente con ID propio para versiones, revisiones o variantes diferentes.
4. **Extracción Multimodal con IA**:
   - Los datos extraídos de datasheets deben normalizar automáticamente unidades (ej. $\text{W}$ para paneles, $\text{kW}$ para inversores, $\text{kWh}$ y $\text{Ah}$ para baterías).
5. **Normalización y Filtrado por Marca (`brand`)**:
   - Todo equipo fotovoltaico posee obligatoriamente el campo `brand` normalizado mediante [`src/utils/equipmentBrandUtils.ts`](file:///home/ishiro/Proyectos/1_Principales/solarsim/src/utils/equipmentBrandUtils.ts).
   - El escáner de fichas técnicas (`AIDatasheetScannerModal.tsx`) compara marcas resolviendo alias comunes (`Luxpower` <=> `LuxpowerTek`, `Canadian` <=> `Canadian Solar`, etc.) e infiere marcas desde el nombre comercial para actualizar equipos preexistentes que carecían de marca asignada.
   - El Administrador de Catálogo, el Gestor de Proveedores y el Selector del Simulador incorporan filtros reactivos mediante píldoras dinámicas por marca.

### 🖥️ Arquitectura y Seguridad en Electron (Aislamiento de Procesos):
1. **Aislamiento Estricto del Renderizador (`src/`)**:
   - El código en `src/` corre en el contexto de Chromium y **NUNCA** debe importar módulos nativos de Node.js (`fs`, `path`, `child_process`, `os`, etc.).
2. **Puente Seguro IPC**:
   - Toda comunicación entre la interfaz (React) y las capacidades del sistema operativo debe realizarse a través de la API en `electron/preload.ts` (`window.electronAPI`) y manejada en `electron/main.ts`.

### 🧠 Integridad del Motor Financiero y Solar:
1. **Contrato de Fórmulas Oficiales**:
   - Antes de modificar cálculos solares o financieros, es obligatorio consultar `docs/FINANCIAL_ENGINE_SPECIFICATION.md`.
2. **Inversión Neta y Deducción Ley 57-07**:
   $$\text{netInvestmentUSD} = \text{grossInvestmentUSD} - \text{itbisSavedUSD} - \text{ley5707CreditUSD}$$
   - **Base Estricta de Equipos**: El crédito fiscal del 40% para el ISR aplica **exclusivamente sobre equipos fotovoltaicos y de almacenamiento** (paneles, inversores y baterías), deduciendo la mano de obra del cálculo.
3. **Amortización Fiscal Ley 57-07**:
   - El crédito fiscal del 40% se divide estrictamente en 3 cuotas anuales iguales (Años 1, 2 y 3: $13.33\%$ anual).

### 🤖 Smart Proposal Studio & Integridad de Cotización:
1. **Cobertura Meta Predeterminada (95%)**:
   - El dimensionamiento asistido por IA calcula la capacidad y cantidad de módulos fotovoltaicos para alcanzar una **cobertura meta base del 95%** (`targetCoveragePct = 95`). Los módulos siempre se redondean al entero superior, resultando en una cobertura real cercana al 98%-100%.
2. **Invariante de Descripción de Mano de Obra e Instalación (`installationServicesDesc`)**:
   - La celda de instalación y mano de obra en la tabla de cotización del simulador y en la propuesta PDF debe ser siempre concisa y profesional (`Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).`).
   - **PROHIBIDO** concatenar notas del sistema (`specialTechnicalNotes`) dentro de `installationServicesDesc`. Dichas notas se reservan exclusivamente para la pestaña técnica y la síntesis de razonamiento de la IA.
3. **Precedencia Absoluta de Potencia Fotovoltaica Explícita (kWp o Módulos)**:
   - Si el usuario especifica una potencia en kWp (ej. `11 kwp paneles Canadian 615w`), se calcula de inmediato $\lceil 11,000 / 615 \rceil = 18\text{ paneles}$ y se le otorga **prioridad absoluta**. Los cálculos genéricos por consumo histórico o autonomía no deben sobrescribir este valor.
4. **Detección Contextualizada y Selección Exacta de Variantes de Inversores**:
   - La extracción de potencia del inversor opera estrictamente dentro del contexto de la palabra *"inversor"* o de la marca detectada (`weco`, `luxpower`, `solis`, etc.), evitando colisiones con valores de baterías (kWh) o paneles (kWp).
   - Cuando existen múltiples variantes de la misma marca (ej: `WeCo XT-6K`, `XT-8K` y `XT-10K`), se selecciona la variante con la menor diferencia de potencia y se prioriza el código del modelo (`8K`, `8.0Kw`).
   - Si se solicita una cantidad explícita (`1 inversor weco`), se respeta como 1 unidad, impidiendo que el dimensionamiento fotovoltaico configure 2 unidades en paralelo innecesariamente.
5. **Equipos Pendientes de Cotizar (`DISPONIBLE_SIN_PRECIO`) y Cero Falsas Sustituciones**:
   - Si un equipo solicitado existe en el catálogo pero aún no tiene ofertas de proveedores asignadas (`priceStatus: 'DISPONIBLE_SIN_PRECIO'`), se selecciona obligatoriamente con su ID oficial. La frase *"Equipos según disponibilidad"* da prioridad máxima a los modelos existentes en la base de datos y jamás dispara falsas sustituciones.
6. **Controles Interactivos en la Pestaña 3 (Propuesta Solar)**:
   - Los bloques de **Módulo Fotovoltaico**, **Inversor Solar** y **Banco de Baterías (BESS)** cuentan con menús desplegables (`<select>`) para cambiar de equipo en cualquier momento, controles de cantidad (unidades en paralelo y número de baterías) y cálculo instantáneo de capacidad total AC (kW) y almacenamiento (kWh) en tiempo real con contraste óptimo en Modo Claro y Oscuro.
7. **Hub Unificado de IA & Detección Dinámica de Modelos en Configuración**:
    - En el Dock principal (`PrimaryIconDock.tsx`), todos los accesos de IA (Facturas EDE, Datasheets de Equipos y Listas de Precios de Distribuidores) están unificados en el botón de la estrella morada (`Sparkles`) con un menú selector emergente interactivo.
    - En el panel de Ajustes (`IntegrationsSection.tsx`), se incorpora la función para auto-detectar en tiempo real todos los modelos de la API de Google Gemini asociados a la API Key y seleccionarlos mediante un menú desplegable `<select>` completo con detalles técnicos y atajos recomendados.

### 📁 Organización de Carpetas y Ocultamiento de la Vista General (`hideFromGeneral`):
1. **Filtrado Exclusivo en Modo Oculto**:
   - Las carpetas soportan la propiedad booleana `hideFromGeneral?: boolean`.
   - Cuando `hideFromGeneral: true`, los proyectos contenidos se **ocultan completamente del menú principal (Dashboard general cuando `activeFolderId === null`) y de la sección 1 "Projects" del árbol lateral**.
   - Dichas propuestas **solo aparecen al ingresar o seleccionar la carpeta asignada** (`activeFolderId === folder.id`).
   - Tanto el modal de creación como el de edición (`CreateFolderModal.tsx`) incluyen un control interactivo (switch/toggle) con icono `EyeOff` para activar o desactivar esta función.
   - Se muestran distintivos `EyeOff` en `SolarCoreTreeSidebar` y `FoldersResumeGrid` para identificar de inmediato las carpetas en modo privado/oculto.

### 🔄 Sincronización en la Nube y Prevención de Resurrección de Proyectos:
1. **Prevención de Resurrección tras Borrado (`confirmedDeletedIds`)**:
   - Durante la sincronización en `syncAuthSlice.ts`, cuando el push confirma la eliminación de un proyecto (`p.isDeleted && resultsMap.has(p.id)`), su ID se registra en `confirmedDeletedIds` y se elimina de la memoria local sin posibilidad de re-inyección en el ciclo de merge.
2. **Metadatos y Auto-Sync en Creación/Importación con IA**:
   - Toda propuesta generada mediante el Smart Proposal Studio (`applyExtractedInvoice`) o importada desde JSON (`importProjectJSON` / `resolveImportConflict`) asigna obligatoriamente `authorId`, `authorName`, `authorEmail`, `version: 1` y `syncStatus: currentUser ? 'pending' : 'local_only'`, disparando de inmediato `triggerAutoSync(true)` si la sincronización en la nube está activa.

### 🗑️ Papelera de Reciclaje (Trash), Retención de 30 Días y Modo Solo Lectura:
1. **Borrado Suave (*Soft-Delete*)**:
   - Eliminar una propuesta (`moveToTrash(id)`) no borra el registro de la base de datos de inmediato; establece `isDeleted = true`, `deletedAt = NOW()` y `deletedBy = currentUser.name`.
2. **Ventana de Retención Automática de 30 Días**:
   - Tanto el servidor en `POST /api/sync/pull` como el cliente local en `onRehydrateStorage` ejecutan una purga permanente automática de proyectos cuyo `deletedAt` sea anterior a 30 días (`deleted_at < NOW() - INTERVAL '30 days'`).
3. **Modo Solo Lectura (Read-Only)**:
   - Al abrir un proyecto que está en la papelera (en el Simulador o en la vista de Propuesta PDF), se despliega un banner ámbar/rojo de alerta fija (*"Propuesta en Papelera (Modo Solo Lectura)"*).
   - Se bloquean y resguardan todas las mutaciones sobre los parámetros del proyecto mientras esté en papelera.
4. **Acciones de Recuperación y Purga**:
   - **Restaurar**: Restaura la propuesta (`restoreProject`), restablece `isDeleted = false`, limpia `deletedAt` y reactiva la edición completa.
   - **Eliminar Definitivamente**: Elimina físicamente el proyecto (`hardDeleteProject` con `DELETE /api/projects/:id?permanent=true`).
   - **Vaciar Papelera**: Purga masiva de todas las propuestas eliminadas de la organización (`emptyTrash` con `DELETE /api/trash`).
5. **Navegación Limpia y Aislamiento de Hooks**:
   - La alternancia entre la vista del catálogo (`DashboardView`) y la papelera (`TrashView`) se gestiona condicionalmente en `App.tsx` (`isTrashActive ? <TrashView /> : <DashboardView />`), garantizando el respeto absoluto a las reglas de hooks de React y evitando retornos tempranos dentro de los componentes.

### ⚡ Balance Energético, Despacho Físico BESS & Ingeniería Transparente:
1. **Transparencia Total de Flujos de Energía**:
   - El sistema separa explícitamente tres componentes fundamentales del balance energético:
     - **Autoconsumo en Sitio ($E_{auto}$)**: Energía consumida instantáneamente en el inmueble (solar directa + despacho de baterías). Tiene un valor económico del **100% de la tarifa eléctrica**.
     - **Inyección a Red Bruta ($E_{exp}$)**: Excedente que sale hacia la red de distribución.
     - **Inyección Neta Acreditada ($E_{net\_credit}$)**: Excedente reconocido al cliente tras deducir la **retención oficial del 25%** por peaje de red bajo la Resolución SIE-007-2026-REG ($E_{net\_credit} = E_{exp} \times 0.75$).
     - **Ahorro Facturable Total ($E_{saved}$)**: $E_{saved} = E_{auto} + E_{net\_credit}$.
   - El ahorro monetario anual y mensual cumple estrictamente: $\text{savingsUSD} = E_{saved} \times T_{kwh}$.
2. **Modelo Físico de Baterías BESS & Partición Diurna (Sin Abstracciones Cegas al 100%)**:
   - La demanda del cliente se divide en diurna (8am-5pm) y nocturna según el perfil tarifario (`BTS1`/`BTS2` 35%, `BTD` 75%, `MTD` 90%, o manual).
   - Autoconsumo solar directo instantáneo: $E_{solar\_directo, diario} = \min(P_{diario}, L_{dia})$.
   - Capacidad útil diaria de la batería: $E_{bat, util} = \text{Capacidad Nominal} \times (\text{DoD}/100) \times (\eta/100)$.
   - La batería absorbe el excedente diurno real ($E_{bat\_carga} = \min(P_{diario} - E_{solar\_directo}, E_{bat, util})$) y lo descarga cubriendo demanda nocturna ($E_{bat\_descarga} = \min(E_{bat\_carga}, L_{noche})$).
   - Autoconsumo total en sitio: $E_{auto, diario} = E_{solar\_directo, diario} + E_{bat\_descarga, diario}$, evitando saturaciones planas irreales al 100% (ej. para 853 kWh con 5.12 kWh BESS, el autoconsumo físico real es ~423 kWh/mes / 49.6%).
3. **Gráficas Mixtas (ComposedChart)**:
   - Tanto en el Simulador (`EnergyAnalysisTab.tsx`) como en la Propuesta PDF (`PDFPage1Energy.tsx`) y el Visor Web de Cloudflare (`template.ts`), la gráfica de energía es un gráfico compuesto:
     - Barras para **Consumo** y **Producción FV**.
     - Línea superpuesta azul (`#2563eb`) para **Autoconsumo en Sitio**.

### 📑 Personalización de Propuesta PDF & Reordenación Modular:
1. **Página de Cuadro Resumen Ejecutivo (`PDFPageExecutiveSummary.tsx`)**:
   - Hoja ejecutiva maquetada al estilo *Executive Pitch Deck* ubicada inmediatamente tras el índice (hoja 2 por defecto).
   - Sintetiza 5 cápsulas clave: (01) Capacidad y Módulos, (02) Conversión AC, (03) Parámetros Comerciales & Divisas, (04) Incentivos Ley 57-07, (05) Desembolso Real y Recuperación.
2. **Reorganización Dinámica Drag-and-Drop de Secciones y Anexos**:
   - El modal de personalización (`PDFCustomizationModal.tsx`) permite reordenar tanto las secciones internas de la propuesta como los documentos PDF externos anexados mediante arrastrar y soltar.
   - El orden se persiste en `project.customization.sectionOrder` y `project.customization.attachedPdfs`.
   - La numeración de páginas (`# de ##`) y la Tabla de Contenidos (`PDFPage0TableOfContents.tsx`) son 100% dinámicas y se recalculan automáticamente según el orden definido por el usuario.

### ☁️ Propuestas Web Compartidas (Cloudflare Workers & KV):
1. **Microservicio Serverless (`workers/share-viewer`)**:
   - Construido con Hono y desplegado en Cloudflare Workers con KV (`propuesta.electsun.net`).
   - Genera enlaces web compartibles con expiración automática (TTL) y códigos QR para el cliente.
2. **Sincronización de Datos y Compatibilidad Retroactiva**:
   - El visor web incorpora la gráfica Chart.js mixta (barras de consumo/producción + línea de autoconsumo) y la tabla transparente de 7 columnas.
   - Posee *fallbacks* matemáticos automáticos para asegurar que los enlaces generados previamente continúen funcionando sin errores.

### 📄 Exportación a PDF con `html2canvas` & `jsPDF`:
1. **Reglas del Workspace**: Consultar `.agents/rules/html2canvas_pdf_export_rules.md`.
2. **NUNCA usar `truncate` o `overflow: hidden` en etiquetas de texto**.
3. **Dimensionamiento de Imágenes**: Usar `className="max-h-[Xpx] max-w-[Y%] w-auto h-auto mx-auto block object-contain"`.
4. **Presupuesto de Altura A4 ($850\text{px} \times 1202\text{px}$)**: Header: 76px. Footer: 42px. Prohibido `pb-14`.

---
*Este documento garantiza continuidad total de desarrollo, gobernanza y consistencia técnica en cualquier sesión futura.*
