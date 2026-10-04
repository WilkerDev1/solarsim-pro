# Monolito modular

SolarSim conserva React, Zustand, Electron y Hono/PostgreSQL. El producto de escritorio agrupa dominios; la API y el visor Cloudflare tienen procesos y ciclos de despliegue propios. No se introducen microservicios por dominio.

```mermaid
flowchart LR
  UI[React: vistas por dominio] --> S[Zustand: slices]
  S --> E[Motores puros]
  S --> H[Servicios HTTP]
  UI --> P[Preload IPC]
  P --> N[Electron: IA, ventana, updater]
  H --> A[Hono: composición y módulos]
  A --> D[(PostgreSQL)]
  H --> W[Worker: autorización, validación, plantilla]
  W --> K[(KV)]
  C[shared: contratos puros] --> S
  C --> A
  C --> W
```

## Dependencias permitidas

- `shared/`: contratos TypeScript puros. Sin React, Electron, acceso a red ni base de datos.
- `src/engine/`: cálculos puros con argumentos explícitos. No importa el store ni decide permisos.
- `src/features/application/`: selección del modo efectivo; adapta política del store al motor.
- `src/services/`: transporte, validación de respuestas y publicación. Sin componentes de UI.
- `src/store/slices/`: estado y operaciones del dominio. La composición raíz conserva todos sus exports públicos.
- `src/store/sync/`: reconciliación pura, pertenencia, mutaciones y comandos de eliminación. No confunde versión local con versión confirmada.
- `src/store/persistence/`: serialización durable y migración/rehidratación. Solicitudes, flags de carga y generación de sesión son transitorios.
- `src/components/`: presentación y eventos. Las vistas grandes se cargan bajo demanda en App; las decisiones matemáticas pertenecen al motor.
- `electron/`: única frontera con módulos nativos y ejecución del SO, expuesta por el preload aislado.
- `server/src/index.ts`: arranque. `app.ts`: composición inyectable. `modules/`: auth, usuarios, organización, proyectos, equipos, tarifas y notificaciones. `database/`: migraciones aditivas y acceso común.
- `workers/share-viewer/`: validación, autorización de publicación, repositorio KV, escaping y presentación separados.

## Extensión

Una nueva función se registra en `shared/applicationFeatures.ts`, define su default/etapa/visibilidad/disponibilidad y usa el selector efectivo. Cambiar solo una etiqueta de UI nunca cambia el modelo de cálculo. Una nueva ruta registra su módulo desde app y usa la autorización actual en BD. Las migraciones se numeran y no se ejecutan desde el renderizador.

Los perfiles de empresa locales personalizan documentos; las organizaciones autenticadas delimitan autorización y sincronización. Son conceptos distintos. No se adjudican automáticamente propuestas locales o de otra organización al iniciar sesión: para mover contenido se exporta/importa una copia de forma explícita.
