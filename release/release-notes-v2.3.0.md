# SolarSim Pro 2.3.0

Actualización mayor con Centro Empresarial multi-organización, ciclo de autenticación y sincronización con preservación durable, y mejoras de compatibilidad para propuestas web interactivas.

- **Centro Empresarial y Multi-Organización**: Aislamiento estricto por inquilino, cambio dinámico de organización activa, gestión de miembros del equipo e invitaciones con roles RBAC (ADMIN, EDITOR, VIEWER).
- **Autenticación e Invalidación Segura**: Monotonicidad estricta de `sessionGeneration`/`sessionEpoch`, descarte seguro de peticiones anteriores ante expiración de sesión, protección contra bucles 401, y preservación íntegra de proyectos, borradores, carpetas, catálogos y colas offline. Distinción explícita entre sesión activa e identidad recordada.
- **Visor Web de Propuestas (Cloudflare Worker)**: Desglose financiero transparente, soporte completo para proyectos con equipos multimodelo (paneles e inversores en paralelo), descripción técnica limpia sin textos duplicados y retrocompatibilidad total con propuestas existentes.
- **Dossier Ejecutivo PDF**: Alineación de métricas en la cápsula 02 de inversores y conexión, maquetación A4 estable sin desbordamientos y conservación estricta de los contratos de cálculo fotovoltaico y financiero.
- **Distribución Multi-SO (x64)**:
  - Windows: Instalador NSIS (`SolarSim-Pro-Setup-2.3.0.exe`) y versión Portable (`SolarSim-Pro-2.3.0.exe`).
  - Linux: AppImage (`SolarSim-Pro-2.3.0.AppImage`), paquete Debian/Ubuntu (`SolarSim-Pro-2.3.0.deb`), paquete Arch Linux (`SolarSim-Pro-2.3.0.pacman`) y archivo portable (`SolarSim-Pro-2.3.0.tar.gz`).

Los binarios oficiales se compilan de forma reproducible mediante GitHub Actions en runners nativos de Windows y Linux.
