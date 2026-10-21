# SolarSim Pro

Simulador técnico-económico de escritorio para diseñar y cotizar sistemas fotovoltaicos con almacenamiento (BESS) en República Dominicana: producción por provincia, balance energético con medición neta, tarifas de las distribuidoras, finanzas con Ley 57-07 (VAN, TIR, payback, flujo a 25 años), propuestas PDF y web, catálogo de equipos y trabajo colaborativo por organización.

## Componentes

- **Aplicación de escritorio** (`src/`, `electron/`): React 18, TypeScript, Zustand, Tailwind y Electron 44. Funciona sin conexión; el trabajo local se conserva. Actualizaciones firmadas para Linux y electron-updater en Windows.
- **API de sincronización** (`server/`): Hono + PostgreSQL 16 en Docker. Autenticación JWT, organizaciones con roles ADMIN/EDITOR/LECTOR, sincronización con control de versiones (CAS) y migraciones aditivas.
- **Visor de propuestas** (`workers/share-viewer/`): Cloudflare Worker + KV que publica copias inmutables de propuestas con enlace y QR.
- **Asistente IA**: lectura de facturas, fichas técnicas y listas de precios, y borradores de propuesta con Google Gemini (clave del usuario). Todo borrador requiere revisión antes de aplicarse.
- **Contratos compartidos** (`shared/`): tipos y normalizadores usados por app, API y Worker.

## Requisitos

- Node.js 24 o superior (`engines` en `package.json`) y npm.
- Docker, para las pruebas de integración de la API.

## Comandos

```bash
npm ci
npm run dev               # aplicación web en Vite
npm run electron:dev      # aplicación de escritorio en desarrollo
npm run lint              # verificación de tipos
npm test                  # suites del cliente (una suite: npm test -- <filtro>)
npm run build && npm run build:electron
npm --prefix server ci && npm --prefix server test
npm --prefix workers/share-viewer ci && npm --prefix workers/share-viewer test
```

Los instaladores oficiales se compilan en GitHub Actions al publicar un tag; `npm run build:win` y `npm run build:linux` generan paquetes locales. El procedimiento completo de verificación y publicación está en [docs/MAINTENANCE_AND_UPDATES.md](docs/MAINTENANCE_AND_UPDATES.md).

## Documentación

- [docs/README.md](docs/README.md): índice de la documentación.
- [AGENTS.md](AGENTS.md): contratos, invariantes y gates para contribuir.

## Licencia

Desarrollado por WilkerDev1. Todos los derechos reservados.
