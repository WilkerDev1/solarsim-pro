## ⚡ SolarSim Pro v1.3.5 - Escáner Inteligente de Facturas con IA (Gemini Vision), Motor Financiero Auditado & Precios Reactivos

¡Nos complace anunciar el lanzamiento de **SolarSim Pro v1.3.5**! Esta versión representa un salto generacional en la plataforma, introduciendo inteligencia artificial multimodal para digitalizar facturas eléctricas de República Dominicana, un motor financiero y regulatorio 100% auditado y sincronización dinámica de precios por Watt.

---

### 🚀 Novedades y Mejoras Principales:

#### 1. 🤖 Escáner de Facturas Eléctricas Asistido por IA (Vision-to-JSON):
* **Extracción Multimodal de Facturas EDES (PDF / PNG / JPG / WebP)**:
  * Sube la factura eléctrica de cualquier distribuidora (**EDEESTE, EDESUR, EDENORTE, CEPM**) y la IA extraerá de forma automática todos los datos clave en segundos.
* **Soporte de Modelos Google Gemini**:
  * Integración con la API de Google AI Studio con soporte para **Gemini 2.0 Flash**, **Gemini 1.5 Flash** y **Gemini Flash Lite**.
* **Detección Automática de Campos**:
  * **Datos del Cliente**: Nombre/Razón Social, NIC / NIS / Contrato, Cédula / RNC, dirección de suministro y distribuidora.
  * **Historial de Consumo Mes a Mes**: Extracción tabular de consumos de los últimos 12 meses, cálculo de consumo promedio mensual (kWh) y gasto promedio en RD$.
  * **Información Tarifaria & Potencia**: Tarifa eléctrica (BTS1, BTS2, MTD1, MTD2, etc.), potencia contratada / leída en kW y factor de potencia.
* **Modal Interactivo Human-in-the-Loop**:
  * Visualiza los datos extraídos en una interfaz clara y moderna, edita cualquier campo si es necesario y aplica los datos al simulador con un solo clic.

---

#### 2. 📊 Motor Financiero y Regulatorio Auditado (Ley 57-07):
* **Cálculo Exacto de Incentivos Fiscales**:
  * **Exoneración de ITBIS (18%)**: Aplicado al costo de equipos y servicios según el marco de la CNE/DGII.
  * **Crédito Fiscal de ISR (40%)**: Deducción fiscal del 40% de la inversión neta, amortizable en 3 años fiscales.
  * Fórmula de Inversión Neta verificada: $\text{netInvestmentUSD} = \text{grossInvestmentUSD} - \text{itbisSavedUSD} - \text{ley5707CreditUSD}$.
* **Proyección de Flujo de Caja a 25 Años**:
  * Amortización fiscal en Años 1 a 3, degradación anual de paneles (0.5%/año), escalada de tarifas (4.0%/año) y provisión de reemplazo de baterías en el Año 10.
  * Métricas de alta precisión para **VAN (NPV)**, **TIR (IRR)**, **Payback simple** y **ROI a 25 años**.
* **Documentación Oficial de Auditoría**:
  * Especificación técnica completa disponible en [`docs/FINANCIAL_ENGINE_SPECIFICATION.md`](docs/FINANCIAL_ENGINE_SPECIFICATION.md) con el caso de referencia *Centro Médico Hispánico*.

---

#### 3. 🎯 Precios por Watt Reactivos & Sincronización con Matriz de Costos:
* **Desglose Comercial Alineado con la Industria**:
  * El precio por Watt ahora reacciona dinámicamente a la adición o remoción de bancos de baterías y al factor de margen de venta.
* **Sincronización `Auto` en 1 Clic**:
  * Nuevo control en la barra lateral con cálculo automático en tiempo real y opción de ajuste manual flexible.
* **Factura y Tarjeta de Cotización Coherentes**:
  * Eliminación de discrepancias entre el desglose de cotización, la barra de parámetros y las páginas PDF generadas.

---

#### 4. 🔐 Seguridad Criptográfica & Auto-Updates:
* Binarios de Linux firmados con clave **GPG RSA 4096** (`WilkerDev1 <capellancoronadowilker@gmail.com>`).
* Manifiestos de actualización `latest.yml` y `latest-linux.yml` listos para distribución automática.

---

### 📦 Archivos de Instalación:

#### 🪟 Windows:
* **`SolarSim-Pro-Setup-1.3.5.exe`** — Instalador oficial NSIS (con soporte para auto-updates).
* **`SolarSim-Pro-1.3.5.exe`** — Versión portable ejecutable sin instalación.

#### 🐧 Linux:
* **`solarsim-pro-1.3.5.pacman`** — Paquete para Arch Linux / Manjaro / CachyOS (`sudo pacman -U solarsim-pro-1.3.5.pacman`).
* **`SolarSim-Pro-1.3.5.AppImage`** — Paquete ejecutable universal firmado.
* **`solarsim-pro_1.3.5_amd64.deb`** — Paquete para Debian / Ubuntu / Linux Mint.
* **`solarsim-pro-1.3.5.tar.gz`** — Archivo comprimido con binarios ejecutables.
* **`solarsim-public-key.asc`** — Clave pública GPG oficial para verificación de firmas.
