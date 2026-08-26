# ⚡ SolarSim Pro v1.5.0 — Release Notes

¡Nos complace anunciar la versión mayor **v1.5.0** de SolarSim Pro! Esta actualización introduce una arquitectura modularizada en el simulador, soporte completo para ítems personalizados con exoneración de ITBIS (Ley 57-07), restauración y pulido de la cotización ejecutiva en PDF, reporte de coberturas solares reales sin límites artificiales, y sincronización dinámica e instantánea de especificaciones técnicas en todas las narrativas.

---

### 🌟 Novedades y Mejoras Principales

#### 1. 🏗️ Arquitectura Modular del Simulador
- **Desacoplamiento Completo**: Reescritura y modularización de la barra lateral de parámetros y el panel de pestañas de análisis en componentes independientes y de alto rendimiento:
  - `ClientParamsSection`, `RatesParamsSection`, `EquipmentParamsSection`, `PricingParamsSection`, `FinancialsParamsSection`.
  - `EnergyAnalysisTab`, `QuotationEquipmentsTab`, `FinancialReturnTab`.
- **Rendimiento React**: Eliminación de re-renderizados innecesarios y optimización de estado global Zustand.

#### 2. 📋 Ítems Personalizados en Cotización y Toggle "Exonerar ITBIS"
- **Renglones Adicionales Personalizados**: Posibilidad de agregar ítems extraordinarios con cantidad, unidad y costo personalizado en la categoría de finanzas.
- **Régimen Ley 57-07 / ITBIS**: Toggle interactivo **`Exonerar ITBIS (18%)`** que calcula automáticamente si el impuesto se suma al ahorro fiscal exonerado de la Ley 57-07 o se factura al cliente final.
- **Sincronización Total**: Reflejado en tiempo real en la matriz de costos interna, propuesta PDF y visor web interactivo en Cloudflare Workers.

#### 3. 📄 Perfeccionamiento de la Cotización en PDF (Página 8)
- **Recuadro de Desglose Financiero**: Reincorporación del panel flotante de precios con colores de marca y métricas de inversión neta.
- **Especificaciones del Sistema**: Bloque de especificaciones técnicas (potencia kWp, tipo de montaje, consumo y distribuidora).
- **Diseño A4 Equilibrado**: Optimización de márgenes y descripciones concisas sin solapamiento con el pie de página.

#### 4. ☀️ Reporte Físico y Real de Cobertura Energética
- **Sin Topes Artificiales**: Eliminada la restricción que forzaba 100.0% en sistemas con sobreproducción.
- **Porcentajes Reales**: Visualización del promedio exacto tanto en tablas mensuales como en métricas globales anuales (ej. 104.0%, 125.1%).

#### 5. 🔄 Sincronización Dinámica de Parámetros en Resumen Ejecutivo (Página 4 del PDF y Web)
- **Resolución Inteligente de Variables**: Los párrafos ejecutivos de la solución técnica ahora sincronizan automáticamente la cantidad de módulos, potencia kWp, generación anual estimada, cobertura y equipos (inversores y baterías) con el simulador, evitando discrepancias incluso si el usuario había editado el texto.

---

### 📦 Paquetes y Binarios Disponibles

| Plataforma | Tipo de Paquete | Archivo |
| :--- | :--- | :--- |
| **Windows** | Instalador Automático NSIS | `SolarSim-Pro-Setup-1.5.0.exe` |
| **Windows** | Portable / Sin Instalación | `SolarSim-Pro-1.5.0.exe` |
| **Linux (Universal)** | AppImage (Firmado GPG) | `SolarSim-Pro-1.5.0.AppImage` |
| **Linux (Arch / Manjaro / CachyOS)** | Pacman Package (Firmado GPG) | `solarsim-pro-1.5.0.pacman` |
| **Linux (Debian / Ubuntu / Mint)** | Paquete DEB | `solarsim-pro_1.5.0_amd64.deb` |
| **Linux (Genérico)** | Binario Comprimido Tar.gz | `solarsim-pro-1.5.0.tar.gz` |

---
*Clave pública GPG para validación de paquetes Linux incluida en `solarsim-public-key.asc`.*
