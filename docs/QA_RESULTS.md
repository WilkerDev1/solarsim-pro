# Resultados de la rama de pruebas — actualización 4 octubre 2026

Rama `codex/modular-audit-feature-controls`, desde `beta` en `8cdcfec`. Estos resultados certifican los casos ejecutados en el checkout de la rama; no constituyen un despliegue ni una certificación de producción.

## Gates ejecutados

| Comprobación | Resultado y alcance |
| --- | --- |
| `npm run lint` | Sin errores TypeScript. |
| `npm test` | 24 suites: motores, funciones, persistencia, sincronización, colas de eliminación, catálogo, carpetas, IA, tarifas, PDF y updater. Fetch externo bloqueado por defecto. |
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

El proyecto sintético muestra ahorro de primer año USD 7,059.05 con legacy y USD 6,408.17 con proyección. Simulador, hub y páginas PDF coinciden; al apagar desaparece el perfil diurno y la tabla vuelve a cinco columnas con dos series en gráfica. Los datos experimentales introducidos se conservan. El tooltip clásico se verificó sobre la primera columna: «Consumo» y «Producción FV», sin etiquetas de autoconsumo para esas dos series. Las pruebas de dominio cubren BESS, cero consumo, retención, permisos de política y precedencia local/organización.

El PDF preview presenta 11 páginas. `testPDFExportCompatibility.ts` serializa un dossier raster A4 de 11 páginas con JPEG real, comprueba tamaño/recursos de imagen y fusiona un anexo con pdf-lib (12 páginas). La exportación desde el hub llegó al estado final sin errores de consola, pero la automatización del navegador no entregó el evento/archivo de descarga; no se afirma haber inspeccionado ese PDF descargado. El4 de octubre el usuario aportó y aprobó un PDF real de15páginas con anexos: ese entregable queda aceptado y se excluyó expresamente del trabajo pendiente. Impresión nativa es una operación distinta, sin evidencia de ejecución.

## Revisiones de código y correcciones

Revisores independientes de sincronización, backend, publicación, updater e interfaz inspeccionaron los contratos y reprodujeron fallos. Se corrigieron carreras de último ADMIN, autorización tras esperar bloqueos, comandos de borrado durante uploads, conflictos recuperables de catálogo, respuestas de sesiones anteriores, publicación HTML hostil, créditos fiscales cero y el camino AppImage que podía saltarse la verificación. Las regresiones automatizadas protegen esos casos. La revisión no sustituye pruebas de uso en producción.

## Conflictos, staging y beta — 4 de octubre

La API2.2.0 desplegada confirma creación con id/versión sin documento canónico. El cliente rechazaba ese ACK, conservaba base0 y podía entrar en conflicto al reenviarlo. Además JSONB reordena claves y `JSON.stringify` producía diferencias falsas. El SELECT del backend antiguo omitía el nombre del último autor: «Otro consultor» era un fallback inventado, no prueba de otro usuario.

Ahora el cliente verifica ACK legacy con un full pull; si falla conserva un recibo durable, identidad/base y contenido pendiente sin declarar synced ni reenviar antes de verificar. Comparación semántica excluye metadatos y normaliza papelera. Los conflictos se conservan por servidor/organización y se reabren desde tarjeta/lista incluso después de recargar. El modal muestra campos legibles, autor solo si se conoce, tres decisiones con una confirmación y checkpoint local previo. Tombstone sobre cambios locales preserva copia recuperable; un modal ya abierto sigue el registro vigente.

QA de navegador con usuarios Ana ADMIN y Bruno EDITOR produjo conflicto real base1/nube2; enero4000vs3279 y módulos38vs40. Se probaron cierre/reapertura/recarga, ambos menús, temas,1024×700, Tab/ShiftTab/Escape y foco. La opción Guardar una copia conservó el original de40módulos y creó una propuesta independiente de38; tras Sincronizar ahora ambos quedaron sincronizados. Fixture de componentes separada verifica consulta pendiente y deleted+VIEWER, sin red ni datos empresariales.

![Resolución simplificada, QA sintética](qa/conflict-modal-light.jpg)

![Original y copia sincronizados tras resolver](qa/conflict-fork-synced.jpg)

Prueba HTTP integrada cliente/API/Worker con KV local y HTTPS temporal: creación, CAS multiusuario, VIEWER, rechazo sinbaseVersion, política, snapshots de publicación legacy/físico y papelera/restauración. Detectó y corrigió `redirect:error` incompatible con workerd; ahora se usa manual y se rechazan redirecciones. No se probó contra producción.

Restauración real del respaldo CT y dump lógico, migraciones idempotentes, contenido/conteos y rollback de la imagen anterior: [evidencia y límites](BETA_ROLLOUT.md). La rotación DB/JWT pasó en contenedores efímeros. Producción no fue actualizada.

Electron44.5.1/builder26.15.3 y paquetes2.3.0-beta.1 Linux/Windows generados sin publicar. El harness de ASAR real con perfil privado pasó en Linux: arranque, contexto aislado, renderizador sinNode, IPCversión/plataforma y cleanup de suscripción. CI añade empaquetado, instalación deb y upgrade NSIS2.1.5 a beta en runners efímeros. El harness ejecuta el ASAR instalado mediante Electron de node_modules de la misma versión; no acredita arranque directo del binario instalado ni interacción con SmartScreen/pkexec.

El commit56af783 pasó en GitHub [contratos](https://github.com/WilkerDev1/solarsim-pro/actions/runs/37300154074) e [instalación/empaquetado nativo](https://github.com/WilkerDev1/solarsim-pro/actions/runs/37300154064), Ubuntu y Windows.

## Riesgos y operaciones pendientes

- Despliegue coordinado y rotación de secretos de producción pendientes. No desplegar API aislada mientras clientes antiguos escriban. El volumen PostgreSQL se conserva; no requiere cambio de major/SO según la revisión del CT.
- Las firmas GPG de ambos manifiestos y cuatro formatos Linux se verificaron con la clave fijada; tamaño/SHA256 de los seis paquetes también pasó. Authenticode, SmartScreen e instalación interactiva/pkexec siguen pendientes; AppImage usa sustitución manual. Instalación deb y actualización NSIS desde2.1.5 pasaron en runners efímeros.
- Auditoría npm raíz actual:6 avisos altos en dependencias dev de Tailwind/braces; producción0. No se aplicó upgrade forzado de Tailwind4. Auditorías actuales de backend y Worker:0 avisos. Son resultados de esta ejecución, no garantía permanente.
- Chunks grandes siguen como optimización futura; PDF aprobado sin rediseño. Drag-and-drop real e impresión nativa no acreditados por este ensayo.

Revisiones independientes de sincronización, updater e interfaz cerraron conformes después de corregir los hallazgos y sus regresiones. El revisor operativo detectó una ruta insegura al preparar secretos; el guard corregido se verificó desde repo, subdirectorio, carpeta externa y enlace simbólico.

La entrega sigue siendo PR a beta y paquetes locales, sin merge ni deploy. El plan operativo registra las tareas abiertas con protección del dato y rollback.
