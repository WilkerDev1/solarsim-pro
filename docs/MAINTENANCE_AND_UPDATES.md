# Mantenimiento y releases

Trabajar funcionalidades en beta o rama codex/ desde beta; main recibe publicación aprobada. La versión oficial se consulta en GitHub Releases; el parche 2.3.1 incorpora las correcciones auditadas del 7 de octubre; las betas se prueban con npm run dev y los gates de código, sin generar instaladores automáticamente; consultar [plan de beta y rollback](BETA_ROLLOUT.md).

## Publicación 2.6.0

[2.6.0](https://github.com/WilkerDev1/solarsim-pro/releases/tag/v2.6.0) es la versión estable Latest. El tag fija `cdc3772820e88003ffed3a4076ecd69166307bae`; [Actions 38913577753](https://github.com/WilkerDev1/solarsim-pro/actions/runs/38913577753) aprobó contratos, compilación e instalación/arranque nativos Windows/Linux. Los paquetes Linux y manifiestos están firmados con la clave GPG fijada, y los 20 assets remotos se verificaron por tamaño y SHA256 antes de publicar.

Desarrollo integrado en beta (PR #9) y beta en main (PR #10), conservando las ramas. API desplegada en 2.6.0 y visor actualizado tras ensayo de respaldo/restauración aislado. [Entrega y estado operativo](RELEASE_2_6_0.md) registra la pérdida posterior de conectividad de pve01 y su cierre el 19 de octubre: API 2.6.0 y PostgreSQL saludables, health público, autenticación y CORS verificados sin nuevo despliegue. [Notas](../release/release-notes-v2.6.0.md) detallan proveedores, familias de propuestas, reportes comerciales, logos independientes y correcciones de sincronización/importación.

## Publicación 2.5.1

[2.5.1](https://github.com/WilkerDev1/solarsim-pro/releases/tag/v2.5.1) es una versión estable anterior. El tag fija `3e2e441a6c6a4817deab8a4326f7b169f0201aee`; [Actions 38599799763](https://github.com/WilkerDev1/solarsim-pro/actions/runs/38599799763) aprobó contratos y empaquetado/pruebas nativas Windows/Linux. Se verificaron firmas fijadas GPG, hashes y tamaños; los 20 assets remotos coincidieron con los archivos locales antes de publicar.

Beta se integró en main sin eliminar beta. La API de app-server se alineó a 2.5.1 tras restaurar un dump reciente en PostgreSQL aislado y verificar integridad/conteos; solo se reemplazó API. [Entrega y rollback](RELEASE_2_5_1.md) registra la revisión, el checkpoint privado, evidencias y límites. [Notas](../release/release-notes-v2.5.1.md) describen BESS/costos, catálogo/datasheets y sincronización offline. Windows sigue sin Authenticode.

## Publicación 2.5.0

[SolarSim Pro 2.5.0](https://github.com/WilkerDev1/solarsim-pro/releases/tag/v2.5.0) se publicó como versión estable anterior. El tag conserva la revisión `7947070c6ab214f59dcab62edd83a58ca1196907`; [GitHub Actions 38313219525](https://github.com/WilkerDev1/solarsim-pro/actions/runs/38313219525) aprobó contratos, empaquetado nativo Windows/Linux y creación del borrador.

Los seis formatos x64 son instalador y portable Windows, y AppImage, `.deb`, `.pacman` y `.tar.gz` Linux. Se comprobó el arranque del instalador Windows y de `.deb`, AppImage y `.pacman`; portable y `.tar.gz` recibieron verificación de archivos y hashes. No se compiló macOS ni ARM. Los binarios se construyeron exclusivamente en GitHub; la firma se realizó localmente con la clave GPG fijada, sin exportar la clave privada.

`verifyReleaseFiles.ts` y `verifyCandidate.ts` aprobaron tamaños, hashes, metadata del updater y firmas de ambos manifiestos y paquetes Linux. Los 20 assets remotos coincidieron con los tamaños y SHA256 locales antes de publicar. Windows no tiene Authenticode. Las [notas de versión](../release/release-notes-v2.5.0.md) describen las novedades y límites del asistente experimental. Esta publicación no desplegó API, Worker ni cambios de base de datos, y no integró PR #5 en beta/main.

```bash
npm ci
npm run lint
npm test
npm run build
npm run build:electron
npm --prefix server ci
npm --prefix server test
npm --prefix server run build
npm --prefix workers/share-viewer ci
npm --prefix workers/share-viewer test
npm --prefix workers/share-viewer run build
npm run context:pack
```

Node24 y Docker permiten reproducir integración. Tests de cliente bloquean transporte real por defecto; las suites reemplazan fetch cuando prueban HTTP. No ejecutar pruebas contra solarsim.electsun.net ni app-server. Consultar QA.md.

## Actualizaciones firmadas

`.pacman` y `.deb` se instalan solo tras verificar latest.json.sig, versión superior a la instalada, descriptor de formato/archivo/origen, firma del paquete, SHA256 y tamaño. Clave pública fijada en `electron/updater/trustedReleaseKey.ts`; GPG/GPGV ausentes o firmas inválidas bloquean instalación. Descargas HTTPS usan hosts permitidos, límites, timeout y archivos temporales privados. pkexec recibe argumentos mediante execFile; no cadena de shell. Archivos temporales se eliminan al terminar o fallar.

AppImage ya no utiliza descarga/instalación automática sin firma: se sustituye manualmente desde la release tras verificar su .sig. Windows conserva electron-updater y su flujo de plataforma; la garantía GPG descrita aquí corresponde a paquetes Linux. No asumir que un hash por sí solo autentica al autor.

```bash
npm run release:bump -- X.Y.Z
npm run build:win
npm run build:linux
npx tsx scripts/release.ts --sign
```

`--manifests` genera hashes sin firmar y sirve para inspección; **no habilita** instalación Linux. `--sign` genera manifiestos, firma todos los paquetes anunciados y latest.json/update.json con la clave privada correspondiente a la clave pública fijada. No se guarda clave privada en repo. Publicar paquetes y sus .sig, latest.json y latest.json.sig, update.json y update.json.sig, metadata YAML/blockmaps requeridos por electron-updater y clave pública. Inspeccionar `release/*.json` antes de publicar: ningún artefacto anunciado debe faltar. Crear una GitHub Release; un tag solo no es una release disponible.

## Dependencias y límites

Hono/Worker y backend se actualizan con sus pruebas aisladas. jsPDF4.2.1 corrige los avisos críticos de su versión anterior (fuente: https://github.com/parallax/jsPDF/releases/tag/v4.2.1), conservando el flujo de canvas y anexos PDF. Electron44.5.1 y electron-builder26.15.3 ya están actualizados. La matriz de releases compila y prueba ASAR nativo Linux y Windows; instalación interactiva y actualización del SO siguen pendientes. Estables excluyen beta; beta admite beta/rc/final y excluye alpha. npm audit se conserva como evidencia; esta rama no se presenta como libre de toda vulnerabilidad ni certifica todos los formatos de distribución.

Documentos financieros describen contratos de software, no validación jurídica de normativa futura. Revisar cambios legales con fuentes regulatorias antes de modificar fórmulas.

## Compilación oficial en GitHub

`verify.yml` comprueba PRs y ramas beta/main sin empaquetar sistemas operativos. Las ramas codex no disparan además otro push check: se evita la duplicación observada en PR1. `npm run dev` se comprueba con un puerto aislado y sin autenticar ni escribir datos.

`release.yml` se ejecuta al publicar un tag vX.Y.Z cuya versión coincide con package.json. Ejecuta primero los contratos y después dos runners nativos. Genera seis archivos (Windows2 y Linux4) y crea una release **borrador**, con tamaños/hashes verificados. No publica automáticamente archivos sin firma Linux. Los artefactos temporales expiran a los7días; los assets de una release permanecen.

La clave privada GPG se conserva en el equipo del firmante. Descargar los assets del borrador, copiarlos a release/, ejecutar `npm run release:sign` y `npx tsx scripts/qa/verifyCandidate.ts`, subir manifiestos/firmas y publicar el borrador. Ninguna compilación de binarios ocurre en ese paso local. Windows no dispone de Authenticode; macOS no forma parte de los formatos mantenidos. Los runners prueban el ejecutable instalado con un perfil nuevo, además del ASAR/IPC. El icono de ventana se incluye como recurso del paquete.

No repetir un tag/release existente para sustituir silenciosamente sus binarios. Corregir mediante una versión nueva. La release de escritorio no despliega API, Worker ni modifica la base empresarial.

### Recuperar un runner de release

Si una dependencia del runner se bloquea, cancelar esa ejecución y usar `gh workflow run release.yml --ref main -f tag=vX.Y.Z`. El modo manual obtiene explícitamente `refs/tags/vX.Y.Z` en contratos, empaquetado y manifiestos; exige coincidencia con package.json. No reescribir el tag ni subir paquetes de otra revisión. Linux usa el mirror oficial Ubuntu HTTPS con tiempos APT limitados. Los contratos del tag tienen un grupo de concurrencia separado de la CI de main/beta. El resultado sigue siendo un borrador que debe firmarse/verificarse antes de publicar.
