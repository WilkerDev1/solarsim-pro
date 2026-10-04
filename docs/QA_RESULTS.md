# Resultados de la rama de pruebas — 3 octubre 2026

Rama `codex/modular-audit-feature-controls`, desde `beta` en `8cdcfec`. Estos resultados certifican los casos ejecutados en el checkout de la rama; no constituyen un despliegue ni una certificación de producción.

## Gates ejecutados

| Comprobación | Resultado y alcance |
| --- | --- |
| `npm run lint` | Sin errores TypeScript. |
| `npm test` | 23 suites: motores, funciones, persistencia, sincronización, colas de eliminación, catálogo, carpetas, IA, tarifas, PDF y updater. Fetch externo bloqueado por defecto. |
| `npm run build` | Frontend correcto. Queda advertencia de chunks grandes, especialmente assets del PDF; no se oculta. Vistas pesadas cargadas con lazy/Suspense. |
| `npm run build:electron` | Main/preload compilados. No se instaló un paquete nuevo sobre la aplicación del usuario. |
| Backend `test`, `format:check`, `build` | 17 pruebas con PostgreSQL 16 efímero: RBAC, organizaciones, JWT vigente, migraciones, CAS, conflictos, trash, snapshots, política y JSON inválido. |
| Imagen Docker Node 24 | Build y `server/tests/containerSmoke.ts` correctos: proceso no root, health con BD, alta sintética y lectura/actualización CAS de funciones. El smoke corrigió un fallo ESM de contratos compartidos invisible en el build local. |
| Worker `test`, `build` | Dos suites, tipos y bundling correctos; KV y autoridad simulados, sin publicación empresarial. |
| Repomix | Regenerado con dominios nuevos, docs y scripts. Excluye binarios, secretos y archivos sospechosos; no se versiona el snapshot generado. |
| `git diff --check` | Sin errores de whitespace. |

## Navegador y revisión visual

QA local con propuesta sintética «QA local — Oficina y almacén», 23.56 kWp, 38 módulos, sin cuenta empresarial. Se comprobaron tarjetas/lista y persistencia de la elección, temas claro/oscuro, categorías de Ajustes, aislamiento accesible del fondo, y tamaño mínimo Electron 1024×700 con acciones de la tabla visibles. El refinamiento conserva SolarSim y el documento PDF existente.

La revisión independiente Impeccable cerró con `ship` tras corregir el registro de contexto PRODUCT.md, el contorno del interruptor apagado y el contraste del placeholder. Las capturas finales muestran el contenido realmente seleccionado, sin datos de clientes:

![Lista compacta de propuestas](qa/proposals-list.png)
![Funciones de la aplicación, apagada por defecto](qa/features-light.png)

## Coherencia de cálculo y exportación

El proyecto sintético muestra ahorro de primer año USD 7,059.05 con legacy y USD 6,408.17 con proyección. Simulador, hub y páginas PDF coinciden; al apagar desaparece el perfil diurno y la tabla vuelve a cinco columnas con dos series en gráfica. Los datos experimentales introducidos se conservan. Las pruebas de dominio cubren BESS, cero consumo, retención, permisos de política y precedencia local/organización.

El PDF preview presenta 11 páginas. `testPDFExportCompatibility.ts` serializa un dossier raster A4 de 11 páginas con JPEG real, comprueba tamaño/recursos de imagen y fusiona un anexo con pdf-lib (12 páginas). La exportación desde el hub llegó al estado final sin errores de consola, pero la automatización del navegador no entregó el evento/archivo de descarga; no se afirma haber inspeccionado ese PDF descargado. Queda en el recorrido manual de QA verificar descarga, render visual y anexos en Electron instalado, junto con impresión nativa.

## Revisiones de código y correcciones

Revisores independientes de sincronización, backend, publicación, updater e interfaz inspeccionaron los contratos y reprodujeron fallos. Se corrigieron carreras de último ADMIN, autorización tras esperar bloqueos, comandos de borrado durante uploads, conflictos recuperables de catálogo, respuestas de sesiones anteriores, publicación HTML hostil, créditos fiscales cero y el camino AppImage que podía saltarse la verificación. Las regresiones automatizadas protegen esos casos. La revisión no sustituye pruebas de uso en producción.

## Riesgos y trabajo previo al despliegue

- Producción, CT y volúmenes no fueron modificados. La existencia del respaldo empresarial se verificó durante la auditoría inicial; no se ensayó su restauración. Las migraciones se probaron contra bases aisladas.
- Rotar JWT y contraseña DB expuestos, ensayar restauración, probar staging y coordinar clientes/API/Worker antes de desplegar. CAS obligatorio y publicación autenticada cambian contratos de clientes antiguos; no desplegar la API de forma aislada.
- Auditoría npm raíz: 23 avisos (1 moderado, 21 altos y 1 crítico), principalmente Electron/empaquetado heredado. Backend y Worker: cero avisos en la verificación de esta sesión. Se aplicaron parches compatibles y jsPDF 4.2.1; no se ejecutó `audit fix --force`. La actualización mayor de Electron/packager necesita instalaciones Linux/Windows reales y pruebas de actualización.
- El updater verificó firmas/hashes y rechazo de downgrade con pruebas aisladas; no instaló paquetes ni publicó una release. AppImage Linux usa actualización manual hasta tener una distribución verificable.
- No se probó drag-and-drop real con dispositivos de entrada, impresión nativa ni instalación Windows. Sus contratos existentes se conservan y figuran en [QA](QA.md).

La entrega es un PR de pruebas a `beta`, sin merge ni deploy. La lista anterior permite revisar el cambio con límites explícitos y preparar la puesta en producción por separado.
