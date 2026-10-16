# SolarSim Pro 2.6.0 — publicación y API

Versión coordinada de escritorio, API y visor web. Cambios funcionales y límites en [notas de versión](../release/release-notes-v2.6.0.md) y [seguimiento comercial](PROPOSAL_COMMERCIAL_TRACKING.md).

## Integración y compilación

- [PR #9](https://github.com/WilkerDev1/solarsim-pro/pull/9): desarrollo integrado en `beta`, commit `cdc3772820e88003ffed3a4076ecd69166307bae`, tras aprobar contratos.
- [PR #10](https://github.com/WilkerDev1/solarsim-pro/pull/10): `beta` integrada en `main`, commit `ce9a97203b034b8308c805bda8f2ad43380a3418`. Se conserva `beta` y la rama `codex/simulator-datasheet-workflow`.
- Tag inmutable `v2.6.0`: commit `cdc3772820e88003ffed3a4076ecd69166307bae`. Su código coincide con la revisión integrada en main.
- [GitHub Actions 38913577753](https://github.com/WilkerDev1/solarsim-pro/actions/runs/38913577753): contratos, compilación nativa Windows/Linux, instalación/arranque de formatos mantenidos y creación de borrador aprobados.
- Validación local: lint, 50 suites cliente, compilaciones web/Electron, 39 pruebas API en PostgreSQL efímero, formato/build API, tres suites del visor, build del visor y contexto. No se ejecutaron pruebas de escritura en producción.

## API y visor desplegados el 16 de octubre de 2026

Imagen `solarsim-api-api:2.6.0-4d51c99`, revisión de fuente `4d51c9982b8b4b784c5e83bf1f72841e43c97208`, idéntica al código de servidor del tag. El contexto raíz incluye `server/` y `shared/` en `/home/agente/servicios/solarsim-build-2.6.0-4d51c99`.

Checkpoint privado: `/home/agente/backups/solarsim-2.6.0-20261016T140527Z`, con dump custom, listado, configuración e imagen anteriores. El respaldo se restauró en PostgreSQL efímero sin red; contenido de proyectos y conteos coincidieron (55 propuestas, 25 usuarios y 2 carpetas), y `pg_amcheck` pasó. El contenedor de ensayo fue eliminado; no se restauró sobre producción.

Se reemplazó solo API mediante `docker compose up -d --no-deps --no-build api`. PostgreSQL conservó contenedor, volumen y fecha de inicio (`2026-10-05T14:00:23Z`). Sin nuevas migraciones ni rotación de credenciales. Tras desplegar, `/api/health` local y público confirmó versión 2.6.0 y base conectada; autenticación sin token devolvió 401 y CORS 204.

Visor Cloudflare desplegado: versión `a64ff1c5-93eb-4b19-bdab-3409de640769`, revisión anterior `b9590385-fbd3-4bdd-a9cd-1bec384db7ee`. Health público correcto; los enlaces y snapshots existentes se conservan.

### Incidencia de conectividad posterior

Al reanudar a las 20:24 UTC, el acceso público a API devolvió HTTP 530 / Cloudflare 1033. `pve01` figuraba desconectado en Tailscale, con última presencia `2026-10-16T14:32:43Z`, y SSH agotó el tiempo de conexión. La API había quedado desplegada y saludable en 2.6.0; su disponibilidad actual requiere recuperar conectividad del host y repetir health/auth/CORS. El visor Cloudflare continúa saludable. No se atribuye esta indisponibilidad a un fallo de la aplicación sin acceso al host.

## Rollback

La composición e imagen anteriores (API 2.5.1) están en el checkpoint privado. Coordinar escritores/clientes antes de volver a una versión anterior; restaurar la composición y recrear únicamente API, manteniendo la base y las escrituras posteriores al respaldo. No borrar volúmenes ni restaurar el dump sobre la base viva.

## Distribución

[Release 2.6.0](https://github.com/WilkerDev1/solarsim-pro/releases/tag/v2.6.0) publicada como estable Latest el 16 de octubre de 2026 a las 20:28:04 UTC, sin estado draft ni prerelease. Incluye los seis formatos x64: instalador y portable Windows; AppImage, Debian, pacman y tar.gz Linux.

`verifyReleaseFiles.ts` pasó antes y después del firmado. `release:sign` firmó los paquetes Linux y los dos manifiestos de actualización con la clave fijada; `verifyCandidate.ts` confirmó firmas, tamaños y hashes. Tras subirlos, los 20 assets de GitHub coincidieron con los archivos locales por tamaño y SHA256, incluidos ambos YAML y blockmap Windows. La clave privada no salió del equipo. Windows no dispone de Authenticode; macOS y ARM no son formatos mantenidos.
