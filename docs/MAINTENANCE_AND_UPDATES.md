# Mantenimiento y releases

Trabajar funcionalidades en beta o rama codex/ desde beta; main recibe publicación aprobada. Esta candidata usa2.3.0-beta.1 y genera paquetes locales sin publicarlos; consultar [plan de beta y rollback](BETA_ROLLOUT.md).

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

Hono/Worker y backend se actualizan con sus pruebas aisladas. jsPDF4.2.1 corrige los avisos críticos de su versión anterior (fuente: https://github.com/parallax/jsPDF/releases/tag/v4.2.1), conservando el flujo de canvas y anexos PDF. Electron44.5.1 y electron-builder26.15.3 ya están actualizados. La matriz CI prueba paquetes/runtime Windows/Linux; instalación interactiva y actualización del SO siguen pendientes. Estables excluyen beta; beta admite beta/rc/final y excluye alpha. npm audit se conserva como evidencia; esta rama no se presenta como libre de toda vulnerabilidad ni certifica todos los formatos de distribución.

Documentos financieros describen contratos de software, no validación jurídica de normativa futura. Revisar cambios legales con fuentes regulatorias antes de modificar fórmulas.
