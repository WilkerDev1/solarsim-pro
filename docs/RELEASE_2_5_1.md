# SolarSim Pro 2.5.1 — entrega y API

## Código integrado

- PR #7: sincronización offline, reconciliación de conflictos y preparación de versión, integrado en beta tras aprobar contratos.
- PR #8: beta integrada en main tras aprobar contratos. Beta se conserva como rama de desarrollo.
- Tag `v2.5.1`: `3e2e441a6c6a4817deab8a4326f7b169f0201aee`.
- Workflow de binarios: GitHub Actions `38599799763`, compilación nativa x64 Linux/Windows. Workflow completo aprobado: contratos (47 suites cliente y 32 pruebas API), build nativo, instalación/arranque Windows, Debian, AppImage y pacman/Arch, y creación de borrador.

## API desplegada el 14 de octubre de 2026

Imagen `solarsim-api-api:2.5.1-3e2e441`, con etiqueta OCI de revisión igual al tag. La composición usa contexto raíz `solarsim-build-2.5.1-3e2e441` y `server/Dockerfile`. El build incluye `server/` y `shared/` de esa revisión.

Antes del reemplazo se guardaron dump PostgreSQL custom, configuración privada e imagen API anterior. El checkpoint reciente está en `/home/agente/backups/solarsim-2.5.1-20261014T163917Z`, con permisos privados. Su dump se restauró en PostgreSQL efímero sin red: `pg_amcheck` pasó y los conteos de proyectos, usuarios y carpetas coincidieron. El contenedor de ensayo fue eliminado. No se restauró sobre producción.

Se reemplazó únicamente API con `docker compose up -d --no-deps --no-build api`; PostgreSQL conservó contenedor, volumen y fecha de inicio. No hay cambios nuevos de esquema para esta entrega ni rotación de credenciales.

Evidencia posterior: API y BD saludables; GET público `/api/health` informa 2.5.1 y database connected; GET `/api/auth/me` sin token devuelve 401; OPTIONS desde localhost:3000 devuelve 204. No se ejecutaron escrituras de prueba ni recorridos autenticados con cuentas reales en producción. Los contratos de permisos/CAS se validan con los gates en bases efímeras.

## Rollback

Conservar el checkpoint privado y la imagen `solarsim-api-api:2.3.2-shared-20261008`. Para rollback de aplicación, restaurar la composición anterior desde `docker-compose.before.yml` y recrear solo API con `--no-deps --no-build`. Mantener la misma base y credenciales; no restaurar el dump sobre la base viva ni borrar volúmenes. Las escrituras posteriores al checkpoint deben conservarse.

## Binarios y firmas

Publicada como release estable Latest el 14 de octubre de 2026: [SolarSim Pro 2.5.1](https://github.com/WilkerDev1/solarsim-pro/releases/tag/v2.5.1). Se descargaron los seis paquetes y la metadata del borrador. `verifyReleaseFiles.ts` pasó antes y después del firmado; `verifyCandidate.ts` verificó firmas fijadas de ambos manifiestos y los cuatro formatos Linux, además de tamaños/SHA256 de los seis paquetes. Se subieron firmas, manifiestos firmados y clave pública. Los 20 assets remotos coincidieron por tamaño y SHA256 con los archivos locales antes de publicar. Windows no dispone de Authenticode; hashes no equivalen a esa firma. macOS no forma parte de los formatos mantenidos.
