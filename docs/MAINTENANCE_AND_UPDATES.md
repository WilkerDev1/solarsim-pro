# Mantenimiento y releases

Procedimiento vigente para ramas, verificación, publicación de escritorio y actualizaciones firmadas. El historial de cada versión vive en GitHub Releases, en `release/release-notes-vX.Y.Z.md` y en el historial de Git. El despliegue de API y base de datos está en [INFRASTRUCTURE_ARCHITECTURE.md](INFRASTRUCTURE_ARCHITECTURE.md); la release de escritorio no despliega API, Worker ni modifica la base de producción.

## Ramas

`beta` es la rama de desarrollo; las funcionalidades se trabajan en ramas desde `beta` (por ejemplo `codex/...`). `main` recibe solo publicaciones aprobadas (merge de `beta` y hotfixes). Commits con Conventional Commits. Las betas se prueban con `npm run dev` y los gates; no se generan instaladores beta.

## Gates

Node 24 y Docker. Mismos pasos que `.github/workflows/verify.yml`:

```bash
npm ci
npm --prefix server ci
npm --prefix workers/share-viewer ci
node scripts/qa/validatePackager.mjs
node scripts/qa/devSmoke.mjs
npm run lint
npm test
node scripts/qa/testPrepareSecrets.mjs
npm run build
npm run build:electron
npm --prefix server test
npm --prefix server run format:check
npm --prefix server run build
docker build -f server/Dockerfile -t solarsim-api:qa-modular .
npx tsx server/tests/containerSmoke.ts
npm --prefix workers/share-viewer test
npm --prefix workers/share-viewer run build
```

Si cambia la estructura del repositorio, regenerar el snapshot con `npm run context:pack` (se mantiene fuera de Git). Las pruebas de cliente bloquean `fetch` real; ninguna prueba escribe en `solarsim.electsun.net` ni en `app-server`. Detalle en [QA.md](QA.md).

`verify.yml` se ejecuta en PRs y en pushes a `beta`/`main`; no empaqueta sistemas operativos.

## Publicar una versión de escritorio

1. En `beta`: `npm run release:bump -- X.Y.Z` (sincroniza versión en `package.json`, servicios y lockfiles) y escribir `release/release-notes-vX.Y.Z.md`. Integrar en `main` tras aprobar los gates.
2. Crear y empujar el tag `vX.Y.Z`; debe coincidir con `package.json`. `release.yml` ejecuta los contratos de `verify.yml`, empaqueta en runners nativos (Windows: instalador NSIS y portable; Linux: AppImage, `.deb`, `.pacman`, `.tar.gz`, todos x64), prueba instalación/arranque y crea una release **borrador** con hashes verificados (`verifyReleaseFiles.ts`). No publica nada sin firma. Los artefactos temporales de Actions expiran a los 7 días; los assets de una release permanecen.
3. En el equipo del firmante (la clave privada GPG no sale de él): descargar los assets del borrador en `release/`, ejecutar `npm run release:sign` y `npx tsx scripts/qa/verifyCandidate.ts`. Ningún binario se compila en este paso.
4. Subir paquetes y sus `.sig`, `latest.json`/`latest.json.sig`, `update.json`/`update.json.sig`, la metadata YAML y blockmaps que requiere electron-updater y la clave pública. Comprobar que los assets remotos coinciden en tamaño y SHA256 con los locales y que ningún artefacto anunciado en `release/*.json` falta. Después publicar el borrador: un tag solo no es una release disponible.

No reutilizar un tag ni sustituir silenciosamente binarios de una release existente: corregir con una versión nueva. No regenerar manifiestos después de firmarlos. Windows no dispone de Authenticode; macOS y ARM no son formatos mantenidos.

### Recuperar un runner de release

Si una dependencia del runner se bloquea, cancelar esa ejecución y lanzar `gh workflow run release.yml --ref main -f tag=vX.Y.Z`. El modo manual obtiene explícitamente `refs/tags/vX.Y.Z` y exige coincidencia con `package.json`; Linux usa el mirror oficial de Ubuntu por HTTPS con tiempos APT limitados. No reescribir el tag ni subir paquetes de otra revisión. El resultado sigue siendo un borrador que debe firmarse y verificarse.

## Versión mínima de cliente

La API puede exigir una versión mínima de cliente para que un equipo desactualizado no escriba datos que ya no entiende (por ejemplo, propuestas sin el espejo de equipos de [ADR 0001](adr/0001-equipment-model-sin-espejo.md)).

- **Encabezado.** Cada cliente envía `X-SolarSim-Client: <nombre>/<versión>`: `desktop/<versión>` (aplicación, versión de `package.json` en la compilación) y `share-viewer/<versión>` (Worker, en cada autorización contra la API); por ejemplo `desktop/2.7.2`. El servidor MCP local no llama a la API.
- **Rechazo.** Sin encabezado, malformado o con versión menor que `MIN_CLIENT_VERSION`, toda ruta de datos responde **426 Upgrade Required** con `{ "error": "client_outdated", "minVersion", "message" }`. Quedan abiertas `/api/health`, inicio de sesión, renovación de token, `/api/auth/me` y los `OPTIONS` de CORS. Contrato completo en [API y base de datos](DATABASE_AND_API_SPECIFICATION.md#versión-mínima-de-cliente).
- **Qué ve el usuario.** El cliente 2.7.1+ deja de reintentar la sincronización, sigue guardando su trabajo en el equipo y muestra «Actualiza SolarSim para seguir sincronizando» con la versión mínima y un botón que abre el actualizador. Un cliente anterior (sin el encabezado) solo ve errores de sincronización: por eso se avisa al equipo antes.
- **Cómo subir el mínimo**, siempre en este orden:
  1. Publicar y firmar la release de escritorio con la versión nueva (ver arriba) y desplegar el Worker con esa versión.
  2. Avisar al equipo (con la fecha) y confirmar que quienes sincronizan ya actualizaron; las propuestas pendientes de un equipo atrasado se sincronizan al actualizar.
  3. Subir `MIN_CLIENT_VERSION` (por ejemplo `2.8.0`) en el `.env` de `~/servicios/solarsim-api/` del CT y recrear solo la API (`docker compose up -d --no-deps --no-build api`). Debe ser `major.minor.patch`; un valor inválido impide arrancar. La variable por defecto en la composición y en `shared/clientVersion.ts` es `2.7.1` (la primera versión sin espejo heredado); un mantenimiento sin cambio de contrato, como la 2.7.2, no la sube.
  4. Comprobar con `curl -s -o /dev/null -w '%{http_code}' -X POST https://solarsim.electsun.net/api/sync/pull` (426 sin encabezado) y con un cliente actualizado (sincroniza). Para volver atrás basta bajar la variable y recrear la API; los clientes bloqueados recuperan la sincronización al reiniciar la aplicación.
- Subirla antes de publicar el cliente, o sin avisar, deja a todo el equipo sin sincronizar. Un prelanzamiento (`2.7.1-beta.1`) es menor que su versión final.

## Actualizaciones firmadas

`.pacman` y `.deb` se instalan solo tras verificar `latest.json.sig`, versión superior a la instalada, descriptor de formato/archivo/origen, firma del paquete, SHA256 y tamaño. La clave pública fijada está en `electron/updater/trustedReleaseKey.ts`; sin GPG/GPGV o con firmas inválidas se bloquea la instalación. Las descargas usan HTTPS con hosts permitidos, límites, timeout y temporales privados que se eliminan al terminar o fallar; `pkexec` recibe argumentos por `execFile`, sin cadena de shell.

AppImage no se actualiza automáticamente: se sustituye a mano desde la release tras verificar su `.sig`. Windows usa electron-updater; la garantía GPG corresponde a los paquetes Linux. Un hash por sí solo no autentica al autor.

`npm run release:manifests` genera manifiestos sin firmar solo para inspección; no habilita la instalación en Linux. `npm run release:sign` genera los manifiestos y firma paquetes Linux, `latest.json` y `update.json` con la clave privada correspondiente a la huella fijada.

Canales: las versiones estables no reciben betas; el canal beta admite beta/rc/final y excluye alpha.

## Dependencias y límites

Hono, backend y Worker se actualizan con sus pruebas aisladas. No afirmar que el proyecto está libre de vulnerabilidades sin un `npm audit` actual (raíz, `server/` y `workers/share-viewer/`). Instalación interactiva, SmartScreen y autorización `pkexec` en un equipo real son comprobaciones manuales distintas de CI.

Los documentos financieros describen el contrato del software, no una validación jurídica de normativa futura. Revisar cambios legales con fuentes regulatorias antes de modificar fórmulas.
