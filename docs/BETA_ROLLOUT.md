# Release 2.2.1: preparación y despliegue

Estado al 5 de octubre: PR1 integrado en beta; release de escritorio 2.2.1 publicada y verificada. API/Worker y secretos de producción no desplegados ni rotados. El ensayo2.3.0-beta.1 de abajo es evidencia histórica; la versión oficial solicitada es2.2.1. El PDF con anexos fue aprobado por el usuario y no forma parte del trabajo pendiente. La lista de abajo conserva las tareas operativas abiertas.

## CT app-server: revisión solicitada

- [x] Acceso por SSH a `root@100.73.34.56` (pve01), ejecutando `pct exec 100`; sin SSH directo al CT. La clave funcionó y no se necesitó contraseña.
- [x] Inspección del CT100: Debian13.6, Docker29.7.2, Compose5.5.0, PostgreSQL16.15. API actual2.2.0 con Node20.20.2. Sin reinicios observados; disco50GiB con unos46GiB libres y4GiB RAM sin presión relevante.
- [x] Decidir actualización necesaria: los cambios requieren la imagen API Node24 y el checkout completo con `shared/`. No hay evidencia de necesidad de ampliar CT o cambiar SO/Docker/PostgreSQL para esta versión. No se hizo una auditoría completa de paquetes Debian ni se modificaron servicios de producción.
- [x] En el despliegue coordinado (completado el 6 de octubre 2026): sustitución exitosa de imagen API compilada desde la raíz con shared/ (solarsim-api-api:2.2.1-ac7abbc), migraciones aditivas 001/002/003 aplicadas al arrancar y Worker desplegado en Cloudflare.

Estas versiones y capacidad son una fotografía del 4 de octubre de 2026; repetir health, espacio y backup antes de operar.

## Recuperación demostrada

Respaldo usado: `/mnt/pve/hdd-1tb/dump/vzdump-lxc-100-2026_10_04-02_30_00.tar.zst`, 2,869,997,407bytes, `zstd -t` correcto. Se extrajo únicamente la copia PGDATA en directorios privados; el volumen vivo no se montó ni modificó.

1. PostgreSQL16 arrancó la copia física con `--network none`, completó recuperación WAL y salió de recovery. El archivo `postmaster.pid` archivado se apartó únicamente de la copia.
2. Se generó un dump custom privado, se comprobó `pg_restore --list` y se restauró en otra base nueva sin red, mediante socket Unix privado.
3. `server/tests/backupRehearsal.ts` aplicó migraciones1/2 dos veces y verificó idempotencia, contenido de proyectos, conteos y ausencia de huérfanos. `pg_amcheck --heapallindexed --parent-check` pasó en ambas restauraciones.

| Tabla | Filas preservadas |
| --- | ---: |
| organizations | 13 |
| users | 23 |
| projects | 52 |
| equipment_catalog | 64 |
| project_version_history | 2 |
| team_notifications | 7 |
| sync_audit_logs | 0 |
| utility_tariffs | 2 |

La imagen anterior exacta `sha256:7d5bf277df56ee123a5ef89318434cb1ed36b52cb3353f3e202237bd2f37563e` se exportó por pve01 y arrancó sin red sobre la copia migrada. Health confirmó API2.2.0 y BD conectada; después volvió a pasar la comprobación de contenido/conteos. Esto demuestra arranque de rollback e integridad; no certifica todos los recorridos de clientes antiguos sobre el esquema nuevo.

Los dumps, PGDATA y archivo de imagen contienen información empresarial y permanecen fuera de Git en directorios privados. No publicarlos como artefactos CI ni adjuntarlos a GitHub. Al concluir el ensayo, detener las copias y borrar solamente los temporales identificados del ensayo; conservar un respaldo privado verificado según la política de la empresa.

## Pruebas de staging y credenciales

Solo datos sintéticos: Ana ADMIN, Bruno EDITOR y Vera VIEWER en una organización QA separada, PostgreSQL efímero, API local3101 y Worker local8788 con KV local. Túneles HTTPS temporales transportaron exclusivamente fixtures y tokens QA. No se utilizó la cuenta empresarial ni se escribieron documentos de producción.

`QA_WORKER_URL=https://<tunel-temporal>.trycloudflare.com npx tsx scripts/qa/stagingRehearsal.ts` exige API127.0.0.1 y Worker temporal. Comprueba creación/actualización, dos editores con CAS, rechazo VIEWER, bloqueo del cliente sin baseVersion, publicaciones legacy/físicas con snapshot confirmado, cambio de política y papelera/restauración. Es un ensayo explícito fuera de `npm test`; presupone las cuentas QA provisionadas en la base desechable.

En el navegador de staging se resolvió el conflicto conservando una copia: el original mantuvo40módulos y la copia38; una sincronización posterior confirmó ambos documentos sin conflicto.

La integración con el runtime real de Workers detectó `redirect:'error'` no admitido. Se cambió a `manual`, rechazando respuestas3xx sin reenviar el JWT. La regresión protege rechazo de redirecciones; el ensayo real confirma publicación/autorización. Contrato de plataforma: [Request de Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/request/).

`server/tests/containerSmoke.ts` crea sus propios contenedores y ensaya cambio de contraseña DB/JWT: el secreto DB anterior falla al abrir una conexión nueva, la API reconecta con el nuevo, JWT antiguo y refresh reciben401, login nuevo conserva política/datos. **No basta cambiar POSTGRES_PASSWORD en Compose:** una base existente necesita cambiar el rol con ALTER ROLE o `\password`.

- [x] Generador `scripts/qa/prepareRotationSecrets.ts`: candidatos aleatorios, directorio0700 y archivo0600 fuera del checkout; no imprime valores ni conecta a servicios. Rechaza reutilizar directorios.
- [x] Rotación en producción completada (6 de octubre 2026): contraseña del rol PostgreSQL rotada con ALTER ROLE, JWT_SECRET privado seguro generado, variables en .env privados con permisos 0600, recreación de solarsim-api sin caída de volumen de datos ni pérdida de registros.

## Ensayo histórico de paquetes — 4 de octubre

Electron44.5.1, electron-builder26.15.3, Vite7.3.6, pdfjs6.4.299; cliente/API/Worker2.3.0-beta.1. Paquetes Linux AppImage/deb/pacman/tar.gz y Windows NSIS/portable se generan con `--publish never`. El ensayo `node scripts/qa/runElectronRuntime.mjs` usa entrada/main/preload ASAR reales y perfil privado: verifica arranque, aislamiento de Node, IPC de versión/plataforma y eliminación de suscripciones. No reemplaza la instalación del usuario.

El workflow histórico `.github/workflows/beta-packages.yml`, retirado y desactivado el5 de octubre, construía los formatos Linux/Windows y comprueba el ASAR instalado mediante Electron de node_modules de la misma versión (no arranca directamente el binario instalado): instalación deb en Ubuntu y NSIS2.1.5 seguido de actualización a la candidata en Windows. Estos ensayos usan runners efímeros, no el equipo del usuario. El [run37300154064](https://github.com/WilkerDev1/solarsim-pro/actions/runs/37300154064) pasó en ambos sistemas para el commit56af783; los artefactos CI expiran a los7días. La instalación interactiva, SmartScreen y pkexec siguen siendo comprobaciones manuales distintas.

- [x] Instalación deb en Ubuntu y NSIS2.1.5 →2.3.0-beta.1 en Windows, en runners efímeros.
- [ ] Comprobar interacción del instalador, SmartScreen y actualización Linux mediante autorización del sistema en un equipo de usuario.
- [x] Paquetes y manifiestos Linux locales firmados con GPG; `npx tsx scripts/qa/verifyCandidate.ts` verificó contra la clave pública fijada ambos manifiestos y los cuatro formatos Linux. También comprobó tamaño/SHA256 de los seis paquetes. Esto no acredita Authenticode en Windows; esa firma sigue pendiente si se requiere para publicar.
- [x] Sustituir la publicación beta por la release oficial2.2.1 solicitada; las betas ahora usan dev/gates sin instaladores. Estables no reciben beta automáticamente; beta admite beta/rc/final y excluye alpha. AppImage indica actualización manual.

Audit del ensayo del4 de octubre:6 avisos altos en dependencias de desarrollo Tailwind3/braces; producción0. Backend/Worker se auditan aparte. No se aplicó `audit fix --force`; pasar a Tailwind4 exige otro cambio de UI. No declarar el proyecto libre de vulnerabilidades. Los chunks grandes del PDF siguen como optimización futura, fuera del PDF aprobado.

## Release oficial 2.2.1 — 5 de octubre

- [Release 2.2.1 publicada](https://github.com/WilkerDev1/solarsim-pro/releases/tag/v2.2.1), con 20 assets verificados por tamaño/SHA256 después de subir las firmas y los YAML correctos. PR1 integrado en beta; main conserva su revisión previa. Tag v2.2.1 en ba97d15: binarios compilados en GitHub, sin compilación de instaladores en la laptop y sin macOS.
- [CI nativa completa](https://github.com/WilkerDev1/solarsim-pro/actions/runs/37315592565) pasó contratos, Windows/Linux y generación del borrador. [Gates beta](https://github.com/WilkerDev1/solarsim-pro/actions/runs/37315413118) pasaron.
- Windows: NSIS2.1.5 →2.2.1, arranque del ejecutable instalado e IPC/ASAR; portable generado y comprobado por hash/tamaño. Linux: instalación deb en Ubuntu, arranque AppImage con extracción sinFUSE, instalación/arranque pacman en Arch aislado e IPC/ASAR; tar.gz generado y comprobado por hash/tamaño.
- `verifyReleaseFiles.ts` comprueba seis paquetes, alias Debian, blockmap, versión/path/SHA512/tamaños de ambos YAML y unicidad de nombres sin distinguir mayúsculas. La regresión rechazó el YAML2.3.0-beta.1 mezclado durante la agregación. Cada runner ahora aporta únicamente el YAML de su plataforma.
- `verifyCandidate.ts` pasó con los binarios reales descargados: firmas fijadas GPG de ambos JSON y los cuatro formatos Linux; seis SHA256/tamaños. Clave privada local, nunca enviada a GitHub. Authenticode/SmartScreen y autorización interactiva Linux no se acreditan.
- Audit npm del5 de octubre: raíz7 altos en dependencias dev (Tailwind3/braces y cadena de Repomix), raíz producción0, backend0 y Worker0. No se forzó Tailwind4.
- Acceso directo SSH a app-server: health API 2.2.0 y BD conectada, solo lectura. El despliegue coordinado y la rotación siguen pendientes; no actualizar el volumen PostgreSQL ni ejecutar pruebas de escritura en producción.

## Release oficial 2.3.0 — 6 de octubre

- **Tag `v2.3.0` generado y compilado en GitHub Actions**: [CI Release 37511270355](https://github.com/WilkerDev1/solarsim-pro/actions/runs/37511270355) completó los 4 jobs (`contracts/verify`, `desktop-win`, `desktop-linux`, `draft`) exitosamente.
- **Borrador de Release Creado**: Tag `v2.3.0` con 12 assets oficiales en GitHub Releases, incluyendo:
  - Windows x64: `SolarSim-Pro-Setup-2.3.0.exe` (136.39 MiB), `SolarSim-Pro-2.3.0.exe` (136.17 MiB) y blockmap.
  - Linux x64: `SolarSim-Pro-2.3.0.AppImage` (161.95 MiB), `SolarSim-Pro-2.3.0.deb` / `solarsim-pro_2.3.0_amd64.deb` (125.25 MiB), `SolarSim-Pro-2.3.0.pacman` (112.23 MiB) y `SolarSim-Pro-2.3.0.tar.gz` (153.47 MiB).
  - Manifiestos de actualización y metadatos: `latest.json`, `update.json`, `latest.yml`, `latest-linux.yml`.
- **Novedades de la versión**:
  - Centro Empresarial y gestión multi-organización con RBAC.
  - Invalidación de sesión completa y segura con monotonicidad estricta y preservación durable offline.
  - Corrección de descripciones técnicas de equipos multimodelo en el visor web (Cloudflare Worker) con retrocompatibilidad.
  - Alineación de KPIs y métricas en la cápsula 02 de inversores del dossier ejecutivo PDF.

## Ventana de despliegue y rollback

1. Aprobar el commit y sus gates; definir clientes que usarán la nueva versión. CAS obligatorio y publicación autenticada hacen incompatible el envío de clientes antiguos: una beta aislada no debe sustituir su API de producción sin coordinación.
2. Capturar backup nuevo antes de la ventana, dump custom privado comprobado/restaurable, imagen exacta anterior y revisión Worker anterior. Registrar checkpoint de configuración sin imprimir secretos. Exportar proyectos locales pendientes desde cada cliente y cerrar escritores; no perder cambios offline.
3. Preparar checkout completo de revisión aprobada en CT y env privados; comprobar la red `solarsim_net`. Construir usando contexto raíz y conservar contenedor/volumen Postgres. Rotar DB/JWT de forma coordinada como arriba.
4. Reemplazar únicamente API (`up -d --no-deps api`), comprobar health/login/roles/política/lectura, desplegar Worker compatible y distribuir cliente beta aprobado. Mantener proyección física apagada inicialmente. No usar `down -v`, no sustituir PGDATA ni restaurar el dump encima del volumen como prueba.
5. Para volver atrás, parar escritores nuevos; guardar dump posterior con las escrituras recientes; activar imagen API anterior y revisión Worker anterior con **los nuevos secretos** y la **misma BD**. Migraciones son aditivas: no borrar tablas/columnas para volver atrás. Las publicaciones nuevas deben conservarse en KV. Conservar exportaciones de documentos pendientes de clientes beta antes de volver al cliente anterior.
6. Si el rollback de aplicación no resuelve un fallo de datos, restaurar a una base nueva, verificarla y reconciliar explícitamente las escrituras posteriores al checkpoint antes de cambiar el destino. Un snapshot CT anterior no es rollback seguro de datos que recibieron escrituras nuevas.

Criterios de abortar: health/BD fallido, migración fallida, permisos incorrectos, pérdida de contenido o recuentos no explicada, clientes antiguos todavía escribiendo, firmas ausentes o fallo de instalación. La actualización de producción sigue pendiente; la rama beta integrada y los paquetes permiten revisar concretamente ese paso.
