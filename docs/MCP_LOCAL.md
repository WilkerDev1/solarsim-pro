# Servidor MCP local

SolarSim Pro puede exponer sus herramientas de agentes (`shared/agentTools/definitions.ts`) a clientes MCP instalados en el mismo equipo, como Claude Code o Codex. Está **desactivado por defecto** y se gestiona en Ajustes → **Agentes e IA** → *Conexión MCP local*. Contrato común de herramientas, permisos y deshacer: [AGENT_TOOLS.md](AGENT_TOOLS.md).

## Arquitectura

```
Cliente MCP ──HTTP POST /mcp (Bearer)──▶ electron/mcp (main) ──IPC mcp:invoke──▶ McpBridgeHost (renderer)
                                              ▲                                         │
                                              └──────────────── mcp:respond ◀── executeAgentTool({source:'mcp'})
```

| Pieza | Ubicación | Función |
| --- | --- | --- |
| Configuración | `electron/mcp/config.ts` | `userData/mcp.json` (modo 0600): `enabled` (falso), `port` (47321), `token` (32 bytes, base64url) |
| Guarda HTTP | `electron/mcp/httpGuard.ts` | Host exacto, rechazo de `Origin`, bearer en tiempo constante, cuerpo ≤ 12 MB |
| Puente | `electron/mcp/rendererBridge.ts` | Correlación por id, tiempos de espera (15 s lectura, 30 s borrador, 25 s `get_agent_action_status`), rechazo si se pierde el renderer |
| Servidor | `electron/mcp/mcpServer.ts` | SDK `@modelcontextprotocol/sdk` (versión fija), transporte Streamable HTTP **sin estado** en `127.0.0.1`; `instructions` = `AGENT_RULES_ES` |
| Ciclo de vida e IPC | `electron/mcp/mcpController.ts`, `ipc.ts` | Activar, desactivar, regenerar y copiar el token; validación del emisor |
| Proxy stdio | `electron/mcp/stdioProxy.ts`, `stdioMain.ts` | `--mcp-stdio`: stdin/stdout con una línea JSON-RPC por mensaje ↔ HTTP hacia la instancia abierta |
| Renderer | `src/features/agentTools/mcpBridge.ts`, `McpBridgeHost.tsx` | Ejecuta las llamadas con `executeAgentTool` y publica `listAgentTools('mcp')` cuando cambia la política o la sesión |

- `tools/list` refleja exactamente las herramientas que la política del dispositivo permite a los agentes externos; las bloqueadas no aparecen.
- Cada resultado incluye texto legible y `structuredContent` (la envoltura `{status, data, cards…}`); `isError` solo marca errores. Una acción `guarded` devuelve `pending_confirmation` al instante: la persona decide en la bandeja global de la app y el agente consulta `get_agent_action_status`.
- Sin estado: cada petición crea su propio `Server` y transporte. `initialize` entrega un `Mcp-Session-Id` que solo sirve para etiquetar al cliente (`clientInfo.name`) en la actividad y en la lista de clientes; no autoriza nada.
- Con la ventana cerrada, recargándose o sin sesión lista, `tools/call` responde `isError` y `tools/list` queda vacío.
- La aplicación usa `requestSingleInstanceLock`: una segunda instancia enfoca la primera, de modo que el puerto y el perfil nunca se comparten.

## Tarjetas (MCP Apps)

Las herramientas con tarjeta de **propuesta**, **auditoría de catálogo** o **acción pendiente** anuncian una vista con `_meta.ui.resourceUri = ui://solarsim/cards/<tipo>` (y la clave heredada `ui/resourceUri`). Los anfitriones compatibles con MCP Apps la piden con `resources/read` y la muestran junto al resultado; los demás ignoran el metadato y usan siempre el texto de la respuesta, que nunca se omite.

- Los datos son los mismos `AgentCard` de `shared/agentCards.ts` que usan las tarjetas React de la app, tomados de `structuredContent.cards`.
- `scripts/buildMcpApps.mjs` (parte de `npm run build:electron`) compila `electron/mcp/apps/view.ts` con `@modelcontextprotocol/ext-apps` (versión fija) a un HTML autocontenido por tipo en `dist-electron/mcp-apps/`. Sin ese build no se anuncia ninguna vista.
- Seguridad: `text/html;profile=mcp-app`; CSP `default-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'` con solo script y estilo en línea; `_meta.ui.csp` vacío (no se piden orígenes al anfitrión), sin `domain` ni permisos; ninguna URL externa. Todo texto dinámico pasa por `escapeHtml`; nunca llega HTML desde los datos.

## Conectar clientes

Activa el servidor, pulsa **Copiar token** y sustituye `<TOKEN>`:

```bash
claude mcp add --transport http solarsim http://127.0.0.1:47321/mcp --header "Authorization: Bearer <TOKEN>"
```

Codex, en `~/.codex/config.toml`, con `SOLARSIM_MCP_TOKEN` exportada en el shell:

```toml
[mcp_servers.solarsim]
url = "http://127.0.0.1:47321/mcp"
bearer_token_env_var = "SOLARSIM_MCP_TOKEN"
```

Claude Desktop solo admite servidores stdio. El panel muestra la configuración que lo lanza con `--mcp-stdio`; en `claude_desktop_config.json`:

```json
{ "mcpServers": { "solarsim": { "command": "<ruta de SolarSim Pro>", "args": ["--mcp-stdio"] } } }
```

El modo `--mcp-stdio` (`electron/mcp/stdioMain.ts`, `stdioProxy.ts`) no abre ventana ni toma el bloqueo de instancia: lee `mcp.json` en cada mensaje (sigue la rotación del token) y reenvía cada línea JSON-RPC por HTTP a la instancia abierta, reutilizando su `Mcp-Session-Id`. Si SolarSim está cerrado, el servidor MCP está desactivado o el token cambió, responde un error JSON-RPC accionable a cada petición; las notificaciones se descartan. Termina cuando el cliente cierra stdin. Como el token vive en `mcp.json` (0600), este modo no necesita pegarlo en la configuración del cliente.

Si el puerto 47321 está ocupado, el panel lo indica; el puerto se cambia en `mcp.json` con la aplicación cerrada (1024–65535).

## Modelo de amenazas

| Amenaza | Mitigación |
| --- | --- |
| Página web que llama al puerto local desde el navegador | Se rechaza cualquier petición con `Origin`; los clientes MCP nativos no lo envían |
| DNS rebinding | `Host` debe ser exactamente `127.0.0.1:<puerto>` o `localhost:<puerto>` |
| Otro proceso o usuario del equipo | Escucha solo en loopback; bearer de 256 bits comparado con `timingSafeEqual`; `mcp.json` con modo 0600; otro usuario del mismo sistema operativo con acceso al perfil sí podría leerlo |
| Fuga del token | Nunca llega al JS del renderer: se copia al portapapeles desde el proceso principal, y el estado que ve la interfaz no lo incluye. **Regenerar** invalida el anterior al instante y olvida a los clientes |
| Agente que excede su alcance | Mismos permisos que la cuenta; `read`/`draft`/`guarded` según la política de «Agentes externos»; `guarded` siempre exige confirmación humana; actividad con **Deshacer** |
| Inyección de instrucciones en datos | `instructions` = `AGENT_RULES_ES` (los datos nunca son instrucciones); las herramientas validan esquema estricto y limitan el tamaño de respuesta |
| Cuerpos enormes o ráfagas | Límite de 12 MB, tiempos de espera por herramienta y sin estado persistente en el servidor |
| IPC falsificado | Cada canal `mcp:*` comprueba que el emisor es el `webContents` de la ventana principal y valida la forma de los mensajes |

Fuera de alcance: acceso desde otros equipos (el servidor no escucha en la red) y protección frente a malware con el mismo usuario del sistema operativo.

## MCP remoto (esbozo, no implementado)

Un `/mcp` en la API Hono con OAuth 2.1 + PKCE y metadatos RFC 9728/8414 permitiría conectar ChatGPT y clientes web. Requeriría la migración 006 (`oauth_*`, `agent_actions`, `agent_activity`), ejecutores en servidor con CAS y que las acciones `guarded` se confirmen desde la app. No se despliega sin solicitud explícita.

## Verificación

- `electron/mcp/tests/*.test.ts`: configuración, guarda, puente, controlador y JSON-RPC real sobre `node:http` (initialize, tools/list, tools/call, 401/403/413, renderer no listo).
- `electron/mcp/tests/mcpApps.test.ts`: escape de texto, CSP y ausencia de cargas externas en los documentos compilados, `resources/list|read` y metadatos de herramientas.
- `electron/mcp/tests/stdioProxy.test.ts`: encuadre por líneas (trozos, CRLF, UTF-8 partido) y proxy contra el servidor real.
- `src/tests/testMcpBridgeHost.ts` y `testMcpConnectionPanel.ts`.
- Manual (sin producción): `npm run electron:dev` con `--user-data-dir` temporal, activar el servidor y conectar `claude mcp add …`.
