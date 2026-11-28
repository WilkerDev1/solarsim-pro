# Verificación

## Pruebas automatizadas

`npm test` ejecuta cada `src/tests/test*.ts`, la prueba del updater (`electron/updater/tests/updaterIntegrity.test.ts`) y las de `electron/mcp/tests/*.test.ts`, cada una en su propio proceso, mediante `scripts/test.ts`. Para una sola suite: `npm test -- <filtro>`; para una de n partes disjuntas (lo usa CI): `npm test -- --shard=i/n`. El runner siempre carga `scripts/testEnvironment.ts`, que sustituye `fetch` por uno que falla: una prueba que necesite HTTP debe inyectar un transporte sintético. Ninguna prueba escribe en servidores reales ni usa secretos de producción.

- Guardas por búsqueda de texto (fallan ante una regresión de arquitectura, no de comportamiento): `testNoEquipmentMirrorAccess` (nadie lee el espejo heredado fuera de `shared/equipment`, la hidratación y la importación), `testNoBatteryFormulaCopies` (la conversión `dodPct / 100` o `eficiencia / 100` solo vive en `shared/equipment/battery.ts`), `testNoAssumptionDefaultLiterals` (ningún literal de supuesto como `|| 3.5` fuera de `shared/assumptions.ts`) y `testNoProjectEditRulesOutsideModule` (reglas de edición solo en `src/domain/projectEdit.ts`; ningún `useEffect` del simulador escribe el proyecto; `commitProjectEdits` solo escribe lo que devuelve `applyProjectEdits`). Son heurísticas con excepciones justificadas en cada prueba.
- Módulos nuevos: `testBatteryBankModule` y `testBatteryBankDefaults` (banco de baterías, [ADR 0002](adr/0002-banco-de-baterias.md)); `testResolvedAssumptions`, `testAssumptionsFactory` y `testDockEffectiveAssumptions` (supuestos, [ADR 0003](adr/0003-supuestos-resueltos.md)); `testProjectEdit` (la misma matriz de escenarios contra el store, contra `applyProjectEdit` y contra la transacción, [ADR 0004](adr/0004-edicion-de-proyecto.md)); `testProjectEditTransaction` (el mismo lote en cualquier orden da el mismo proyecto, todo o nada, motor igual a la caracterización de F0, deshacer con derivadas, idempotencia y el dock por la transacción) y `testProjectFieldRegistry` (cada ruta del registro se lee, se escribe y respeta su rango; cada control del dock tiene entrada o motivo); `testClientVersion` y `testClientVersionGate` (versión mínima de cliente); `testAssistantLoop` (el bucle del asistente con ScriptedLlm: turnos cerrados sin `functionCall` huérfanos, contexto vivo en `functionResponse.response`, declaraciones fijas, respaldo solo antes de la primera respuesta, Stop sin reenvío, límite de pasos, llamadas en orden) y `testAssistantSession` (la sesión fuera de React con el store y el conjunto de F3a: «crea una propuesta» desde Inicio abre el simulador, herramienta que falla, Stop, confirmación pendiente, sin clave, cambio de vista y de espacio), [ADR 0011](adr/0011-sesion-y-bucle-del-asistente.md).
- API: `npm --prefix server test` (node:test). Las integraciones (`server/tests/*.test.ts`) arrancan PostgreSQL en un contenedor Docker desechable.
- Worker: `npm --prefix workers/share-viewer test`, con KV y autorización simulados.
- MCP remoto: `npm --prefix mcp-remote test` (protocolo con API sintética y extremo a extremo con PostgreSQL efímero y el SDK oficial de MCP) y `npx tsx mcp-remote/tests/containerSmoke.ts` con las imágenes construidas.
- `server/tests/containerSmoke.ts`: construye su propia imagen/contenedores y ensaya proceso sin root, health con base, CAS y rotación de secretos.

La lista completa de gates está en [MAINTENANCE_AND_UPDATES.md](MAINTENANCE_AND_UPDATES.md#gates). Una build correcta no equivale a instalación probada en cada sistema operativo.

### Copias doradas y caracterización del asistente

Red de seguridad de la unificación de los asistentes de IA: fija el comportamiento actual para que cualquier cambio posterior sea una decisión visible en el diff y no un accidente.

- **Copias doradas («golden»)** en `src/tests/golden/` (raíz) y `mcp-remote/tests/golden/` (servicio remoto), comparadas byte a byte. Raíz (`testAgentContractGolden`): `AGENT_RULES_ES`, `ASSISTANT_SYSTEM_PROMPT`, la lista de herramientas de cada superficie (`mcp`, `app-assistant`, `proposal-assistant`) con su `kind` y el `tools/list` completo del MCP local. Remoto (`mcp-remote/tests/contractGolden.test.ts`): `REMOTE_INSTRUCTIONS` y las 12 herramientas remotas (nombre, título, descripción e `inputSchema`). F3c añadió la instantánea de las instrucciones del asistente de la app en tres capas (`app-assistant-system-instruction.txt`, `testAssistantInstructions`) y la guarda del [contrato congelado](AGENT_CONTRACT_FREEZE.md) (`testFrozenAgentContract`), que importa el código de `mcp-remote` desde el cliente y fija huellas SHA-256 que `UPDATE_GOLDEN` no regenera.
- **Si una falla**, el mensaje dice el fichero, la línea y el carácter donde cambió el texto, y los tamaños. Cambiar a propósito lo que ven los clientes MCP o el modelo exige regenerar la copia y justificar el diff en el PR; un cambio de las reglas, del prompt o de las 12 herramientas remotas llega a los clientes remotos solo al redesplegar `mcp-remote`.
- **Regenerar**: `UPDATE_GOLDEN=1 npm test -- Golden` (raíz; las instrucciones del asistente, `UPDATE_GOLDEN=1 npm test -- AssistantInstructions`) y `UPDATE_GOLDEN=1 npm --prefix mcp-remote test` (remoto). Sin la variable, una copia ausente también falla: nunca se crea sola.
- **Caracterización** (`testAssistantEditCharacterization`, `testAssistantUndoCharacterization`, `testProposalCreationDefaultsCharacterization`, `testAssistantPanelKey`): fijan escrituras al store, llamadas a `triggerAutoSync`, resultado del motor, los dos deshacer (el de la actividad del agente y Ctrl+Z) y los valores con los que nace una propuesta por cada camino. Las aserciones marcadas «F5b» (las de F2a1 y F2b ya se invirtieron y dicen «invertida en F2a1» o «invertida en F2b»; la de `create_proposal` sin argumentos queda «pendiente de F3a» porque su esquema es compartido) describen un comportamiento que esa fase cambia a propósito: se corrigen en el mismo PR que lo cambia. `src/tests/support/` (sondas del store, copias doradas) no se ejecuta como suite.
- **Suites `testLegacyProposalAssistant*`**: lo que prueba código del asistente de propuestas que se elimina en F6 (modal `ai-invoice`, `electron/ai`, `parseProposalWithAI`, `apply_proposal_draft`, `applyExtractedInvoice`). Llevan la cabecera `LEGADO` y se borran enteras con ese código; la lógica que sobrevive (normalización determinista, motor, dominio) sigue en las suites de origen. Las suites que sobreviven construyen el proyecto con `buildProjectFromDraft` y no llaman a `applyExtractedInvoice`; `testSurvivingSuitesAvoidLegacyEntryPoints` lo vigila (con las dos caracterizaciones declaradas como excepción), y la guarda `testNoProjectEditRulesOutsideModule` falla cuando F6 borre los archivos de `LEGACY_DRAFT_PIPELINE`, para que se quite la constante.

## Integración continua

| Workflow | Cuándo | Qué hace | ¿Bloquea? |
| --- | --- | --- | --- |
| `verify.yml` | Todo PR, push a `beta`/`main` y `workflow_call` desde `release.yml` | Gates de AGENTS.md en trabajos paralelos; `gates` agrega el resultado | Sí: `gates` es el único check requerido |
| `release.yml` | Tag `vX.Y.Z` o manual | Llama a `verify.yml`, empaqueta y crea la release borrador ([releases](MAINTENANCE_AND_UPDATES.md#publicar-una-versión-de-escritorio)) | — |
| `claude-review.yml` | PR hacia `beta`/`main` (no borradores) | Revisión consultiva con Claude ([abajo](#revisión-con-claude)) | No |
| `claude.yml` | Comentario con `@claude` del propietario o colaboradores | Claude bajo demanda en el issue o PR | No |
| `audit.yml` | Lunes, manual y PR que cambian un `package-lock.json` | `npm audit --audit-level=high` en raíz, `server/` y visor | No (informativo) |

Trabajos de `verify.yml` (en paralelo tras `changes`):

- `client`: `npm ci`, `validatePackager`, `devSmoke`, `lint`, `testPrepareSecrets`, `scripts/qa/tests`, `build` y `build:electron`.
- `client-tests (1..3/3)`: `npm test -- --shard=i/3`; cada parte instala solo la raíz.
- `server`: `format:check`, `build`, pruebas con PostgreSQL en Docker, imagen y `containerSmoke`. Si falla, sube como artefacto (7 días) `docker ps -a`, los logs de los contenedores de prueba (datos sintéticos) y los logs de npm.
- `viewer`: pruebas y build del Worker.
- `gates`: falla si algún trabajo falló o se canceló.

Reglas: un PR que solo toca Markdown o `docs/` omite builds y pruebas y `gates` informa éxito (por eso el check requerido es el agregador y no los trabajos sueltos); push, tags y `workflow_call` verifican siempre todo. Solo se cancelan ejecuciones obsoletas de un mismo PR. Acciones fijadas por SHA con la versión en comentario y permisos mínimos; Dependabot (`.github/dependabot.yml`) propone cada semana las acciones y cada mes npm (menores agrupadas, mayores en PR propios) contra `beta`. La imagen Docker no usa caché de buildx: hoy tarda unos 10 s y no compensa. Referencia antes del reparto: el job único tardaba 5–6 min, de los que `npm test` eran ~3,5.

`audit.yml` no sustituye un `npm audit` actual antes de afirmar algo sobre vulnerabilidades (AGENTS.md); en un repositorio público GitHub desactiva los workflows programados tras 60 días sin actividad.

## Ensayos fuera de `npm test`

- **Staging con runtime real**: `QA_CLOUDFLARED=/ruta/al/cloudflared npx tsx scripts/qa/runRuntimeStaging.ts`. Levanta PostgreSQL desechable, API HTTP real, Wrangler local (workerd y KV privados) y túneles HTTPS temporales; rechaza destinos de producción, aprovisiona usuarios sintéticos `@staging.example.invalid` (Ana ADMIN, Bruno EDITOR, Vera lector y una cuenta de otra organización) y ejecuta `scripts/qa/stagingRehearsal.ts` (CAS entre editores, rechazo del lector y de clientes sin `baseVersion`, snapshots de publicación, papelera). `Ctrl+C` limpia procesos, contenedor, KV y túneles.
- **Aplicación completa contra ese staging**: en otra terminal `npm run dev` y abrir `/scripts/qa/fixtures/runtimeFlow.html` sobre el origen de Vite.
- **Fixtures de componentes**: `scripts/qa/fixtures/*.html` montan vistas reales con transporte simulado (catálogo, asistente, centro empresarial, clientes, conflictos, borradores, simulador, fichas y editor del documento: `documentEditor.html`). Acreditan el comportamiento de UI, no la API.
- **Electron empaquetado**: `node scripts/qa/runElectronRuntime.mjs [ruta/app.asar]` arranca el ASAR con perfil privado y comprueba aislamiento del renderer e IPC. `release.yml` lo usa tras instalar los paquetes.
- **Declaraciones de herramientas contra la API real de Gemini**: `GEMINI_API_KEY=… npx tsx scripts/qa/checkToolDeclarations.ts --model gemini-4-hydrogen --model gemini-3.8-flash` envía todas las declaraciones de `shared/agentTools/definitions.ts` por el puerto `LlmClient` ([ADR 0008](adr/0008-puerto-llm-y-sdk-google-genai.md)), primero en un lote y, si falla o con `--each`, una a una, e informa cuáles acepta y cuáles rechaza cada modelo con el mensaje del servidor. `--surface app-assistant` limita a una superficie y `--mode` elige el modo de llamada (por defecto `validated`). Factura peticiones con tu clave, que solo se lee de la variable de entorno; nunca ejecuta herramientas. Solo un 400 cuenta como rechazo: ante clave inválida, cuota, 403 de permiso, modelo inexistente, 5xx o red aborta sin probar una a una. Sale con 1 si hay rechazos y con 3 si la prueba no se pudo hacer. `--toolset app-assistant` envía en su lugar el conjunto del asistente de la app (F3a, `src/features/agentTools/appAssistant/definitions.ts`) y `--prompts` añade tres peticiones mínimas en modo `any` («ponle baterías», «crea una propuesta», «¿cuántos paneles…?») e informa a qué herramienta llamó cada modelo (otra distinta de la esperada es un aviso, no un rechazo); se ejecuta a mano (desde F4 el flotante declara ese conjunto) y el resultado se pega en el PR.
- **Esquemas de los escáneres contra la API real de Gemini**: `GEMINI_API_KEY=… npx tsx scripts/qa/checkScannerSchemas.ts --model gemini-4-hydrogen --model gemini-3.8-flash` envía los esquemas de salida de tarifas, fichas y precios (JSON Schema por `responseJsonSchema`) con una petición mínima sin documento y dice si cada modelo los admite. Factura peticiones con tu clave, que solo se lee de la variable de entorno. Solo un 400 cuenta como rechazo; sale con 1 si hay rechazos y con 3 si la prueba no se pudo hacer. Ninguna prueba de CI puede detectar un 400 de la API (todas usan `fetch` sintético): ejecútalo, y haz un escaneo real de un pliego, una ficha y una lista de precios, antes de fusionar un cambio de esquemas o de modelo; si un modelo rechaza un esquema se simplifica (p. ej. sin `additionalProperties` en `tariffs`).
- **Respaldo**: `scripts/qa/restoreBackupRehearsal.py` (ver [infraestructura](INFRASTRUCTURE_ARCHITECTURE.md#despliegue-de-la-api)).

Las capturas de QA se guardan localmente en `docs/qa/` (ignorado por Git) y contienen solo datos sintéticos; nunca credenciales, tokens, URLs privadas ni datos de clientes.

## Matriz de revisión manual

- Catálogo con vistas previas (`/scripts/qa/fixtures/equipmentCatalog.html?assets=1`, también `&suppliers=1` y `&theme=dark`): miniaturas en la tabla, en las ofertas por proveedor y en el selector del simulador (imagen, primera página de la ficha o icono); el diálogo muestra galería, páginas y descarga, y cerrarlo con el fondo no selecciona la opción ni cierra el selector.
- Fichas automáticas (`/scripts/qa/fixtures/simulatorDatasheets.html?assets=1`, `&reader=1` para un lector): el anexo aparece con insignia «Automática» y su número de páginas; quitarlo muestra «Restaurar fichas»; añadir o quitar equipos añade o retira anexos; un lector no modifica nada. Exportar con un anexo sin archivo pide confirmación.
- Menú con tarjetas y lista: búsqueda/filtros, nombres largos, acciones por teclado y arrastre a carpeta; la preferencia persiste al recargar. Claro/oscuro a tamaño normal y mínimo Electron 1024×700.
- Ajustes: navegación por categorías, título/foco, Escape, borradores al cambiar de categoría y fondo inerte para accesibilidad.
- Sin cuenta, proyección desactivada: tabla de 5 columnas, gráfica de 2 series, sin perfil diurno. Al activarla aparecen controles y desglose y cambian ahorro/VAN; al desactivarla vuelve el cálculo clásico y se conservan los datos introducidos. Revisar PDF y hub.
- ADMIN cambia la política con CAS; EDITOR y LECTOR solo la aplican; sin conexión se mantiene la última confirmada; otra organización no hereda el modo. Un backend antiguo muestra la limitación y no confirma un guardado.
- Dos escritores con el mismo `baseVersion`: un ACK y un conflicto; una edición durante el push sigue pendiente con la nueva base confirmada. Un fallo de pull/push/catálogo no adelanta el timestamp.
- Papelera: propuesta nueva sin conexión, eliminación suave en vuelo y física posterior; copia recuperable ante conflictos; el tombstone impide resurrección.
- Catálogo: lectores descargan, solo se envían ítems modificados, precios concurrentes producen conflicto y borrar el último equipo no reinyecta defaults.
- Publicación: snapshot de modo/versión; HTML hostil no ejecuta scripts; crédito fiscal desactivado permanece en cero; un enlace antiguo conserva su presentación.

### Asistente: «crea una propuesta» (F4)

Guion manual del criterio de aceptación de F4 ([ADR 0011](adr/0011-sesion-y-bucle-del-asistente.md)). Sin clave, con la fixture: `npm run dev` y abrir `/scripts/qa/fixtures/appAssistant.html` (modelo falso en el puerto, sin red; las palabras clave «crea», «90» y «equipo» eligen la herramienta). Con clave real, en la app (`npm run electron:dev` o `npm run dev`): Ajustes → IA con tu API Key; Ajustes → Funciones de la aplicación → encender el asistente (sigue apagado por defecto).

1. En **Inicio**, abrir el asistente («Asistente», abajo a la derecha) y escribir «Crea una propuesta». Mientras trabaja se ve «Pensando…» y luego el paso «Crear propuesta».
2. Sin tocar nada, la app pasa al **simulador** con la propuesta nueva (código y cliente en la cabecera del chat) y el chat sigue abierto con su conversación.
3. El turno termina con texto visible (lo que supuso: 1.000 kWh/mes estimados, tarifa de referencia; lo que falta: una factura) y, debajo, la lista de cambios y, si el turno deja la propuesta incompleta, «Propuesta incompleta ⓘ» con lo que falta. Un turno posterior que no cambia lo que falta (p. ej. «cobertura 90») no repite esa marca. El botón vuelve a «Enviar».
4. Cambiar a **Inicio** y volver, cerrar y abrir el panel: la conversación sigue entera.
5. Escribir «Ponle baterías» (con clave real) o «cobertura 90» (fixture): el cambio se aplica al momento y aparece «Deshacer …»; pulsarlo revierte. Con Ajustes → Agentes e IA en «confirmar», el cambio queda como tarjeta con Confirmar/Descartar y el turno termina igual.
6. **Detener**: enviar un mensaje y pulsar el cuadrado mientras trabaja. El turno se cierra («Detenido…»), no se reenvía nada y el siguiente mensaje funciona.
7. **Sin clave** (borrarla en Ajustes → IA): el compositor avisa «Configura Gemini para conversar» con el botón a Ajustes. Escribir «crea una propuesta» y pulsar Enter: el hilo muestra el mensaje del usuario y la respuesta de error «Configura una API Key de Google Gemini en Ajustes → IA…» con el botón a Ajustes; no se llama al modelo ni queda ningún turno colgado.
8. Con clave real, adjuntar una factura PDF y pedir «Crea una propuesta con esta factura»: el modelo llama a «Leer factura» y luego a «Crear propuesta» con la referencia; la propuesta nace con el cliente y el consumo de la factura (o su promedio, avisado).

Los resultados de una ejecución concreta se registran en el PR o commit correspondiente, no en documentos fechados.

## Revisión de PR

Qué se revisa está en [REVIEW.md](../REVIEW.md) (lo usan el revisor automático, las revisiones locales y la manual). Flujo:

1. Una sesión de Claude Code abre el PR hacia `beta` con la [plantilla](../.github/pull_request_template.md): qué cambia, qué prueba se escribió primero, contratos tocados, gates y evidencia (la evidencia vive en el PR, no en documentos).
2. CI ejecuta `verify.yml` (`gates`) y `claude-review.yml` deja comentarios en línea y un resumen.
3. La sesión que abrió el PR (con Auto-fix) atiende los hallazgos: los **Importantes** se corrigen con un commit nuevo o se responden justificando por qué no aplican; los demás, a criterio. Un push nuevo vuelve a revisarse (salvo `CLAUDE_REVIEW_ON_PUSH=false`).
4. Se fusiona a `beta` solo con `gates` en verde, los hallazgos importantes resueltos y el cambio verificado en su rama. Si se activa auto-merge, hacerlo cuando la revisión de Claude ya haya terminado: no es un check requerido y el merge no la espera.
5. El PR de release `beta`→`main` no se revisa con Claude (sus cambios ya se revisaron uno a uno); pasa `gates` y el procedimiento de [releases](MAINTENANCE_AND_UPDATES.md#publicar-una-versión-de-escritorio).

En local: `/revisar-pr <número>` en Claude Code muestra la misma revisión en la terminal sin publicar nada (`--comment` publica en el PR).

No hay `CODEOWNERS`: con un único mantenedor solo pediría revisión a quien ya abre los PR, y exigir su aprobación bloquearía los PR propios (GitHub no permite aprobar un PR propio).

### Protección de ramas (la configura el mantenedor)

En *Settings → Rules → Rulesets*, crear:

- **`beta`** (rama de desarrollo): exigir PR antes de fusionar con 0 aprobaciones; exigir el check `gates` (sin «branches up to date», para no relanzar CI en PR apilados); bloquear force push y borrado. Sin historial lineal (se usan merge commits).
- **`main`** (releases): lo mismo que `beta` y además «branches up to date» y permitir bypass solo al administrador para hotfixes de emergencia.
- **Tags `v*`**: bloquear actualización y borrado (un tag de release no se reutiliza).

En *Settings → Actions → General*: «Require approval for all external contributors» para PR de forks, permisos del `GITHUB_TOKEN` en solo lectura por defecto y sin permitir que Actions cree o apruebe PR. En *Settings → Advanced Security*: alertas y actualizaciones de seguridad de Dependabot, y escaneo de secretos con protección de push.

Cuando el revisor de Claude lleve un tiempo sin falsos positivos molestos, se puede decidir exigir el check `claude-review` (solo garantiza que la revisión terminó; no bloquea por hallazgos).

## Revisión con Claude

`claude-review.yml` ejecuta [claude-code-action](https://github.com/anthropics/claude-code-action) (v1, fijada por SHA) en cada PR hacia `beta`/`main`: abierto, reabierto, marcado listo y cada push. Omite borradores, forks (GitHub no les da secretos), bots y el PR de release desde `beta`. Un push nuevo cancela la revisión en curso del mismo PR.

- **Qué hace**: invoca la skill del repositorio [`revisar-pr`](../.claude/skills/revisar-pr/SKILL.md), que lee `AGENTS.md` y `REVIEW.md` **de la rama base** (un PR no puede cambiar sus propias reglas de revisión), lee el diff y el código cercano, verifica cada hallazgo y publica comentarios en línea más un resumen que se actualiza en cada push. Los comentarios los firma la GitHub App de Claude.
- **Qué no puede hacer**: lista cerrada de herramientas en modo `default` (leer, `gh pr view/diff/comment`, `git show/log/diff/fetch` y el comentario en línea); no edita, no ejecuta código del PR, no empuja, no aprueba ni bloquea. El `GITHUB_TOKEN` del trabajo es de solo lectura; no se usa `pull_request_target`.
- **Consultiva**: no es un check requerido. Bloquear por la opinión de un modelo daría falsos bloqueos y dependería de cuota o de la API; `gates` sigue siendo la única puerta.
- **Configuración opcional** (variables del repositorio): `CLAUDE_REVIEW_MODEL` (por defecto `claude-opus-5-5`; `claude-sonnet-5-5` cuesta aproximadamente la mitad), `CLAUDE_REVIEW_MAX_TURNS` (40), `CLAUDE_REVIEW_ON_PUSH=false` para revisar solo al abrir o marcar listo; para `claude.yml`, `CLAUDE_MODEL` y `CLAUDE_MAX_TURNS`.
- **`@claude` bajo demanda** (`claude.yml`): una mención en un comentario o revisión de issue/PR del propietario o un colaborador lanza Claude en modo interactivo (responde en el hilo y puede empujar commits a la rama del PR o a una rama nueva; nunca abre ni fusiona PR). Útil para preguntas o arreglos pequeños sin abrir sesión local; consume la misma credencial. Nunca corre sobre PR de forks: las revisiones se filtran por el repositorio de cabecera y, en un comentario de PR, un paso previo lo consulta con `gh api` y omite la ejecución con un aviso.

#### Contenido no confiable y riesgo residual de `@claude`

Lo que ya trae la acción (según su [documentación de seguridad](https://github.com/anthropics/claude-code-action/blob/f3b070c88125d33dbae5653df5f143101d4ea9dc/docs/security.md) en la versión fijada): solo la lanzan usuarios con escritura y nunca bots no listados; el texto de otra persona no se convierte en orden por el hecho de lanzar una ejecución; se eliminan comentarios HTML, caracteres invisibles, atributos ocultos y texto alternativo de imágenes; en los PR se restauran `.claude/`, `CLAUDE.md` y otras rutas de configuración desde la rama base; en PR de autores sin escritura (`restrict_untrusted_prs`, activo por defecto) se deniegan gestores de paquetes, ejecutores de pruebas e intérpretes; y el token es de corta duración y limitado a este repositorio. Además, `claude.yml` pasa a Claude solo los comentarios del propietario (`include_comments_by_actor`).

Lo que queda: si mencionas `@claude` en un **issue abierto por un tercero**, Claude lee el título y el cuerpo del issue (no son comentarios, así que el filtro no los quita) en un trabajo con `contents: write`, `pull-requests: write` y el secreto. Un texto preparado podría intentar que edite archivos, empuje una rama o filtre información a un comentario. La sanitización y el modo automático de permisos reducen el riesgo, pero la propia acción advierte que no son una frontera. Las ramas protegidas quedan a salvo (Claude no fusiona ni abre PR, y `beta`/`main` exigen PR y `gates`) y el token de GitHub caduca al terminar el trabajo, pero conviene: leer el texto crudo del issue antes de mencionar `@claude`, pedir tareas concretas («explica», «propón un parche en una rama») y revisar cualquier rama o commit que deje antes de usarlo.

### Autenticación: suscripción o créditos de API

El workflow usa `CLAUDE_CODE_OAUTH_TOKEN` si existe y, si no, `ANTHROPIC_API_KEY`. Si no hay ninguno, la revisión se omite con un aviso (no falla).

| | Suscripción (`CLAUDE_CODE_OAUTH_TOKEN`) | Créditos de API (`ANTHROPIC_API_KEY`) |
| --- | --- | --- |
| Requisito | Plan Pro, Max, Ultra, Team o Enterprise; token de `claude setup-token` | Clave de la [Claude Console](https://platform.claude.com) |
| Coste por revisión | Sin cargo adicional: consume los límites de uso del plan | Por tokens, a precio de lista |
| Límites | Los mismos límites (ventanas de 5 h y semanales) que tus sesiones de Claude Code: revisiones y sesiones compiten | Límites de la organización de la Console; se puede fijar un tope de gasto |
| Caducidad | Un año; renovarlo antes con `claude setup-token` | No caduca; revocable en la Console |
| Condiciones | Ligado a tu cuenta; la documentación lo ofrece para CI de tus propios repositorios. Uso «ordinario e individual»: no compartirlo ni usarlo para servir a terceros | Uso comercial normal; recomendado si el volumen crece o se comparte con otras personas |

Coste orientativo con clave de API (estimación a confirmar con el paso «Coste y turnos» del resumen de cada ejecución, que muestra el importe a precio de lista incluso con suscripción): una revisión de un PR mediano con `claude-opus-5-5` (4 $/20 $ por millón de tokens de entrada/salida, 0,20 $ la lectura de caché) ronda 1–3 USD, y hasta ~5 USD en PR grandes; con `claude-sonnet-5-5` (2 $/10 $), aproximadamente la mitad. Con revisión en cada push, un mes como los recientes (decenas de pushes a PR) puede sumar varias decenas de USD con Opus; `CLAUDE_REVIEW_ON_PUSH=false` lo reduce a una revisión por PR. Los minutos de Actions son gratuitos en este repositorio público.

La revisión gestionada «Claude Code Review» (sin workflow, en la infraestructura de Anthropic) existe solo para planes Team y Enterprise y se factura aparte por créditos de uso; con un plan individual, la opción es este workflow.

### Pasos manuales (una vez)

1. **Instalar la GitHub App de Claude** solo en este repositorio: <https://github.com/apps/claude> → *Configure* → *Only select repositories* → `solarsim-pro`. (Alternativa: `/install-github-app` en Claude Code y elegir *Skip for now* tras instalar la app, porque los workflows ya están en el repositorio.)
2. **Crear el secreto** (uno de los dos):
   - Suscripción: en tu equipo, `claude setup-token`, autorizar en el navegador y copiar el token; después `gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo WilkerDev1/solarsim-pro` y pegarlo cuando lo pida (no pasarlo como argumento para que no quede en el historial de la shell).
   - API: crear una clave en la Console (mejor en un workspace con límite de gasto) y `gh secret set ANTHROPIC_API_KEY --repo WilkerDev1/solarsim-pro`.
   - Se pueden crear ambos: se usa el de suscripción; borrarlo hace que se use la clave de API.
3. Opcional: `gh variable set CLAUDE_REVIEW_MODEL --body claude-sonnet-5-5` o `gh variable set CLAUDE_REVIEW_ON_PUSH --body false`.
4. Fusionar en `beta` el PR que añade estos archivos: la skill debe existir en la rama base, así que la primera revisión llega en el siguiente PR hacia `beta` (y hacia `main` tras la próxima release).
5. Aplicar la [protección de ramas](#protección-de-ramas-la-configura-el-mantenedor) con `gates` como check requerido (después de que `verify.yml` haya corrido al menos una vez con el nombre nuevo).
6. Anotar la renovación anual del token. Si se filtra, generar otro, sustituir el secreto y revocar el anterior desde la cuenta de Claude.
