# ☀️ SolarSim Pro v2.1.5 — Release Notes

Nos complace presentar **SolarSim Pro v2.1.5**, una versión enfocada en la precisión de datos del cliente, edición in-situ sobre las propuestas PDF, sincronización bidireccional en tiempo real y optimización del pipeline multiplataforma.

---

## 🌟 Novedades y Mejoras en v2.1.5

### 1. 📞 Corrección de Datos de Contacto y Teléfono del Cliente
* **Eliminación Definitiva de Números Fantasma**: Se erradicó por completo el fallback forzado al número institucional (`809-378-6590`) y números ficticios base (`+1 (809) 000-0000` / `809-555-0199`).
* **Comportamiento Vacío Garantizado**: Al crear un nuevo proyecto o borrar el teléfono del cliente, el campo se mantiene estrictamente vacío de forma permanente en lugar de restaurar números automáticos.
* **Sincronización Bidireccional Automática**: Modificar el teléfono o la persona de contacto en cualquier sección (Simulador, Modal de Datos o Preview interactiva) sincroniza al instante el modelo de datos de simulación (`client`) y la personalización del documento (`customization`).

---

### 2. 🎛️ Campos de Contacto Integrados en el Sidebar del Simulador
* **Sección 1 (Proyecto y Cliente)**: Nuevos campos nativos para:
  * **Teléfono del Cliente** (`contactPhone`): Con placeholder `"Ej: 809-000-0000"` y valor vacío por defecto.
  * **Atención / Contacto** (`contactPerson`): Permite especificar la persona, departamento o representante del cliente receptor de la cotización.
* **Dirección Flexible**: Removido el fallback forzado a la dirección de prueba de Santo Domingo, permitiendo vaciar o personalizar la dirección libremente.

---

### 3. ✏️ Modo Edición In-Situ en la Hoja A4 de Cotización (Preview PDF)
* **Edición Visual Directa**: Toda la sección **DATOS DEL CLIENTE** de la Página 2 (Cotización) ahora cuenta con edición en vivo mediante `InlineEditableText`:
  * `Cliente`: Edición directa con actualización reactiva en el proyecto.
  * `Contacto (Atención a)`: Con soporte para aplicar como plantilla permanente o restablecer a redacción predeterminada.
  * `Teléfono`: En modo edición muestra el indicador `(Agregar teléfono)` con lápiz flotante; en modo lectura y exportación final se renderiza limpio.
  * `Dirección`: Edición rápida de la ubicación geográfica.
  * `N° Cotización` y `Válido por`: Ajuste in-situ manteniendo las fuentes mono y negrita correspondientes.

---

### 4. ⚡ Soporte Multi-Equipo (Paneles, Inversores y Baterías BESS)
* **Inversores Híbridos en Paralelo**: Soporte para combinar múltiples inversores (ej. 2x 8kW o sistemas mixtos) con cálculo de potencia AC total y MPPTs.
* **Módulos Fotovoltaicos Mixtos**: Agrupación de diferentes tecnologías y potencias con cálculo exacto de degradación y generación solar.
* **Bancos de Baterías BESS Modular**: Ciclado de almacenamiento y despacho físico diario con múltiples unidades y capacidades nominales.

---

### 5. 📦 Nomenclatura Canónica & Empaquetado Multiplataforma
* **Binarios Estandarizados**: Todos los ejecutables se generan con nomenclatura unificada sin espacios (`SolarSim-Pro-Setup-2.1.5.exe`, `solarsim-pro-2.1.5.pacman`, `solarsim-pro_2.1.5_amd64.deb`, `SolarSim-Pro-2.1.5.AppImage`, `solarsim-pro-2.1.5.tar.gz`).
* **Manifiestos y Firmas Criptográficas**: Cálculo instantáneo de hashes SHA-256 y SHA-512 en `latest.json` y `update.json`, junto con firmas `.sig` con GPG para distribuciones Linux.

---

## 📦 Binarios y Paquetes de Instalación Oficiales (v2.1.5)

| Plataforma | Formato de Paquete | Nombre del Archivo | Tamaño | Integridad / Firma |
| :--- | :--- | :--- | :--- | :--- |
| **Windows** | Instalador Guiado NSIS | `SolarSim-Pro-Setup-2.1.5.exe` | 94.81 MB | SHA-256 verificado en manifiesto |
| **Windows** | Portable / Sin Instalación | `SolarSim-Pro-2.1.5.exe` | 94.59 MB | SHA-256 verificado en manifiesto |
| **Linux (Universal)** | AppImage Autoejecutable | `SolarSim-Pro-2.1.5.AppImage` | 131.80 MB | Firma GPG (`.sig`) adjunta |
| **Linux (Arch / Manjaro / CachyOS)** | Paquete Nativo Pacman | `solarsim-pro-2.1.5.pacman` / `SolarSim-Pro-2.1.5.pacman` | 83.12 MB | Firma GPG (`.sig`) adjunta |
| **Linux (Debian / Ubuntu / Mint)** | Paquete Nativo DEB | `solarsim-pro_2.1.5_amd64.deb` / `SolarSim-Pro-2.1.5.deb` | 83.14 MB | Firma GPG (`.sig`) adjunta |
| **Linux (Genérico)** | Tarball Comprimido | `solarsim-pro-2.1.5.tar.gz` / `SolarSim-Pro-2.1.5.tar.gz` | 124.63 MB | Firma GPG (`.sig`) adjunta |

---

*Clave pública GPG para verificación de firmas disponible en `solarsim-public-key.asc`.*

