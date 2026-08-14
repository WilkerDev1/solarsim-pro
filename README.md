# ☀️ SolarSim Pro

**Simulador Fotovoltaico Técnico-Económico Profesional** diseñado para ingenieros, instaladores y consultorías de energía solar fotovoltaica.

---

## 🚀 Características Principales

* ⚡ **Dimensionamiento Técnico Preciso**:
  * Simulación de producción anual con irradiación solar por provincias de la República Dominicana.
  * Análisis de demanda energética horaria y mensual vs curva de generación solar.
  * Cobertura de autoconsumo e inyección de excedentes a la red bajo el esquema de Medición Neta (**EDES**).
* 💰 **Ingeniería Financiera & Ley 57-07**:
  * Cálculo de incentivos fiscales (crédito fiscal del 40% del costo de inversión, 0% ITBIS y aranceles 0%).
  * Métricas avanzadas de retorno de inversión: **Payback Simple y Descontado**, **VAN (NPV)**, **TIR (IRR)**, **ROI a 25 Años** y **LCOE**.
  * Proyección de Flujo de Caja detallado a 25 años considerando degradación de paneles e inflación tarifaria.
* 📄 **Suite Modular de Propuestas PDF Ejecutivas**:
  * **Portada Ejecutiva Moderna** con renderizado de logotipos transparentes y tipografía complementaria.
  * **Índice de Contenido Dinámico** con sincronización de páginas en tiempo real.
  * **1. ¿Quiénes Somos? & Pilares de Servicio**.
  * **2. Beneficios de la Energía Solar & Ley 57-07** (con render 3D arquitectónico).
  * **3. ¿Qué es un Sistema FV? & Flujo Técnico** (render frontal 3D de techo y diagrama energético).
  * **4. Descripción del Proyecto & Normativa SIE** (Resolución SIE-007-2026-REG y tarifas BTS1/BTS2).
  * **5. Análisis de Energía y Balance**.
  * **6. Cotización y Presupuesto de Módulos Tier-1**.
  * **7. Retorno de Inversión y Métricas Financieras**.
  * **8. Flujo de Caja a 25 Años**.
  * **9. Matriz de Costos Internos (Confidencial)** con cálculo de margen comercial y proveedores.
* 🏢 **Panel Multi-Empresa ("Datos del Documento")**:
  * Personalización instantánea de nombre, eslogan, redes, teléfonos, garantías y notas regulatorias.
  * Subida independiente de **Logotipo de Portada**, **Logotipo de Cabecera** y **Marca de Agua Central** con control de opacidad.
* 🔄 **Actualizador Automático Integrado**:
  * Detección y descarga en 1-clic de nuevas versiones en Windows y Linux.

---

## 🛠️ Tecnologías Utilizadas

* **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide React, Recharts, Zustand.
* **Desktop Runtime**: Electron 31 + esbuild (compilación ultrarrápida del main y preload).
* **Exportación Documental**: jsPDF + html2canvas con activos Base64 embebidos.
* **Empaquetado & Distribución**: electron-builder + electron-updater + GitHub Releases.

---

## 💻 Instalación y Desarrollo Local

### Requisitos Previos:
* Node.js v18 o superior
* npm v9 o superior

### Clonar e Instalar Dependencias:
```bash
git clone https://github.com/WilkerDev1/solarsim-pro.git
cd solarsim-pro
npm install
```

### Comandos de Desarrollo:
```bash
# Iniciar servidor de desarrollo en navegador
npm run dev

# Iniciar aplicación de escritorio en modo desarrollo
npm run electron:dev

# Ejecutar verificación de tipos TypeScript
npm run lint

# Ejecutar validación de cálculos matemáticos del motor
npx tsx src/engine/testBenchmark.ts

# Compilar bundles para producción
npm run build && npm run build:electron
```

### Compilar Instaladores de Escritorio:
```bash
# Compilar instalador de Windows (.exe / portable)
npm run build:win

# Compilar paquetes de Linux (.pacman / .AppImage / .deb / .tar.gz)
npm run build:linux
```

---

## 📖 Documentación de Mantenimiento & Releases

Para detalles sobre políticas de dependencias, firmas criptográficas GPG, configuración del auto-updater y la guía paso a paso para publicar nuevas versiones, consulta:

👉 **[Guía de Mantenimiento & Updates](file:///home/ishiro/Proyectos/1_Principales/solarsim/docs/MAINTENANCE_AND_UPDATES.md)**

---

## 📄 Licencia

Desarrollado por **WilkerDev1** — Todos los derechos reservados.
