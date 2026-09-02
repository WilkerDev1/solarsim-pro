# ⚡ SolarSim Pro v1.6.0 — Release Notes

¡Nos complace anunciar la versión mayor **v1.6.0** de SolarSim Pro! Esta versión consolida la infraestructura en la nube bajo dominios seguros de producción, potencia las capacidades del Escáner de Facturas Eléctricas EDE con dimensionamiento por mes pico y selector de módulos fotovoltaicos del catálogo en tiempo real, e introduce mejoras ergonómicas en la gestión de proyectos del Dashboard.

---

### 🌟 Novedades y Mejoras Principales

#### 1. 🌐 Infraestructura y Dominio Oficial Central (`solarsim.electsun.net`)
- **Conectividad Segura y Centralizada**: Toda la sincronización de proyectos y catálogo de equipos ahora opera exclusivamente bajo `https://solarsim.electsun.net` mediante Cloudflare Zero Trust Tunnel y Caddy Reverse Proxy.
- **Auto-Migración Transparente**: Detección y migración automática de endpoints locales heredados al rehidratar el almacenamiento local.
- **Monitoreo y Salud del Servicio**: Verificación de conectividad en tiempo real de base de datos PostgreSQL y API REST.

#### 2. ☁️ Propuestas Web Interactivas Oficiales (`propuesta.electsun.net`)
- **Custom Domain en Cloudflare Workers**: Las propuestas compartidas ahora se publican bajo el dominio oficial de marca `https://propuesta.electsun.net/p/:id`.
- **Códigos QR de Alta Definición**: Generación automática de accesos móviles instantáneos con retención configurable de 7 a 90 días en Cloudflare KV.

#### 3. 🤖 Escáner de Facturas EDE con IA — Dimensionamiento Avanzado
- **Dimensionamiento por Mes Pico (Consumo Máximo del Año)**:
  - Detección automática del mes con mayor demanda energética (kWh).
  - Botón interactivo *"Aplicar Mes Pico a Todo el Año"* para nivelar los 12 meses a la máxima exigencia y recalcular al instante la potencia y cantidad de paneles recomendada.
  - Opción de *"Restablecer Historial Real"* con un solo clic.
- **Selector de Módulos Fotovoltaicos del Catálogo**:
  - Desplegable inteligente conectado en vivo a la base de datos de ítems (`equipmentCatalog`), permitiendo comparar y seleccionar módulos como Canadian Solar TOPBiHiKu6 (590W, 615W, 620W) o modelos personalizados.
  - Comparativa técnica instantánea de Potencia Unitaria, Eficiencia STC, Tecnología de Célula y Área Estimada de Techo ($m^2$).
  - Inyección directa del módulo y vataje seleccionado al simulador y al dossier PDF.
- **Estabilidad React**: Corrección del orden de ciclo de vida de los hooks para garantizar una apertura rápida y sin fallos.

#### 4. 🎴 Menú de Acciones Compacto en el Dashboard
- **Menú Flotante de 3 Puntos**: Las tarjetas de proyectos (`ProjectCard`) agrupan elegantemente las acciones de **Compartir propuesta web**, **Duplicar proyecto** y **Eliminar**, maximizando el espacio visual y la limpieza de la interfaz.

---

### 📦 Paquetes y Binarios Disponibles

| Plataforma | Tipo de Paquete | Archivo |
| :--- | :--- | :--- |
| **Windows** | Instalador Automático NSIS | `SolarSim-Pro-Setup-1.6.0.exe` |
| **Windows** | Portable / Sin Instalación | `SolarSim-Pro-1.6.0.exe` |
| **Linux (Universal)** | AppImage (Firmado GPG) | `SolarSim-Pro-1.6.0.AppImage` |
| **Linux (Arch / Manjaro / CachyOS)** | Pacman Package (Firmado GPG) | `solarsim-pro-1.6.0.pacman` |
| **Linux (Debian / Ubuntu / Mint)** | Paquete DEB | `solarsim-pro_1.6.0_amd64.deb` |
| **Linux (Genérico)** | Binario Comprimido Tar.gz | `solarsim-pro-1.6.0.tar.gz` |

---
*Clave pública GPG para validación de paquetes Linux incluida en `solarsim-public-key.asc`.*
