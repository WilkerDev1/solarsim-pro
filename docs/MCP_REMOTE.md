# Servidor MCP remoto

Permite conectar SolarSim con proveedores de IA que no corren en el equipo del usuario: conectores de ChatGPT y Claude.ai, agentes en la nube y clientes MCP de terminal en otro equipo. Trabaja sobre los **datos sincronizados** de la organización en la API, con los permisos actuales de la cuenta, y no necesita la app de escritorio abierta. Está **desactivado por defecto**. Para clientes en el mismo equipo sigue existiendo el [servidor MCP local](MCP_LOCAL.md); el contrato común de herramientas está en [AGENT_TOOLS.md](AGENT_TOOLS.md).

## Arquitectura

```
ChatGPT / Claude.ai / agente ──HTTPS──▶ mcp-remote (CT propio) ──HTTP interno──▶ API Hono ──▶ PostgreSQL
            │  Bearer ssm_…                 sin estado, sin secretos           │  rutas permitidas, alcance, rol,
            │                                                                  │  CAS, versión mínima, actividad
            └──── OAuth 2.1 (navegador del usuario) ───────────────────────────┘  /oauth/* y /.well-known en la API
```

| Pieza | Ubicación | Función |
| --- | --- | --- |
| Servicio MCP | `mcp-remote/` (paquete propio, `Dockerfile`) | Streamable HTTP sin estado con respuestas JSON; `initialize`, `ping`, `tools/list`, `tools/call`. Reenvía el token del agente a la API; no guarda datos ni credenciales |
| Herramientas | `mcp-remote/src/tools.ts` | Subconjunto del registro compartido (`shared/agentTools/definitions.ts`) con los mismos nombres, títulos, esquemas y envoltura `{status, data…}` |
| Tokens de agente | `server/src/modules/agentAccess/` | Accesos (`agent_grants`) y hashes de tokens (`agent_tokens`), compuerta de rutas, actividad, gestión desde la app |
| Servidor de autorización | `server/src/modules/agentAccess/oauth.ts` | OAuth 2.1 en la API: metadatos RFC 8414, registro dinámico RFC 7591, código + PKCE S256, `iss` (RFC 9207), refresco rotativo, revocación RFC 7009 |
| Contrato común | `shared/agentAccess.ts` | Alcances, prefijos, rutas permitidas, cabeceras de actividad y tipos de la interfaz |
| Interfaz | Ajustes → Agentes e IA → **Acceso remoto (MCP)** | Tokens personales, conexiones OAuth, revocación, actividad y fragmentos de configuración |

### Por qué un servicio aparte que habla con la API

Se evaluaron tres opciones:

1. **Módulo MCP dentro de la API.** Menos piezas, pero el proceso con credenciales de PostgreSQL y `JWT_SECRET` atendería directamente a un protocolo nuevo, expuesto a Internet y cambiante (la revisión 2026-07-28 de MCP rehízo el transporte). Tampoco encaja con el CT dedicado a servidores MCP.
2. **Túnel o relevo hacia la app de escritorio** (como el MCP local, pero alcanzable desde fuera). Descartado: solo funciona con la app abierta, la ventana y la sesión correctas; el renderer ejecutaría órdenes llegadas de Internet; los túneles de los proveedores (OpenAI *Secure MCP Tunnel*, Claude *MCP tunnels*) son de nivel empresa, exigen OAuth igualmente y no sustituyen al servidor de autorización.
3. **Servicio MCP independiente como cliente de la API** (elegida). La API sigue siendo la única que decide: autenticación, lista de rutas, alcance, rol actual, CAS con `baseVersion`, papelera de solo lectura, versión mínima de cliente y registro de actividad. El servicio MCP no tiene credenciales de PostgreSQL ni `JWT_SECRET`: si se compromete, solo ve tokens de agente en tránsito, que ya están acotados. Se despliega, escala y revierte sin tocar la API.

El servidor de autorización vive en la API porque necesita las cuentas (contraseñas, membresías, `auth_version`); el servicio MCP lo anuncia en sus metadatos de recurso protegido (RFC 9728) y Claude/ChatGPT aceptan que esté en otro host.

## Autenticación

Dos formas de obtener un token `ssm_…`; ambas crean un **acceso** ligado a una persona, una organización, un alcance y la URL del endpoint MCP (audiencia RFC 8707):

- **Token personal** (`ssm_pat_…`): se crea en Ajustes → Agentes e IA, se muestra una sola vez, caduca a los 30, 90 o 365 días (sin opción «nunca») y se revoca allí. Máximo 20 activos por persona. Para Claude Code, Codex, Gemini CLI, agentes de la API de Anthropic u OpenAI y cualquier cliente que permita una cabecera `Authorization`.
- **OAuth 2.1** (`ssm_at_…` de 1 h y `ssm_rt_…` de 30 días, rotativo): para conectores de ChatGPT y Claude.ai. El cliente se registra solo (registro dinámico, cliente público, sin secreto), el usuario inicia sesión con su correo y contraseña de SolarSim en una página de la API, elige organización si tiene varias y concede «solo consultar» o «consultar y editar».

Reglas comunes, aplicadas por la API en cada petición:

- Solo se aceptan en las rutas de `AGENT_ROUTES` (`shared/agentAccess.ts`): leer propuestas, clientes, catálogo y tarifas; crear o editar clientes; enlazar una propuesta con un cliente. Nunca `/api/auth/*` (un token de agente no puede convertirse en sesión), usuarios, organización, publicación, borrados ni papelera.
- Alcance `read` = LECTOR aunque la cuenta sea EDITOR o ADMIN. Alcance `write` = el rol **actual** de la cuenta (si la degradan a LECTOR, deja de escribir al instante).
- Cambiar la contraseña o desactivar a la persona (sube `auth_version`) invalida todos sus accesos, como una sesión.
- El token solo vale para el `MCP_REMOTE_URL` configurado (audiencia); un token emitido para otro recurso se rechaza.
- En la base solo se guarda el SHA-256 del token.
- Reutilizar un código de autorización o un token de renovación ya usado revoca la conexión entera.

## Herramientas

| Herramienta | Tipo | Notas en remoto |
| --- | --- | --- |
| `search_projects` | read | Datos sincronizados; excluye la papelera; máximo 12 |
| `get_project` | read | `id` obligatorio (no hay «propuesta abierta»); la papelera no es visible para agentes (404, igual que en la búsqueda). Devuelve datos guardados y equipos normalizados; **no ejecuta el motor** (producción, ahorro, retorno se ven en la app) |
| `search_equipment`, `get_equipment`, `list_supplier_offers` | read | Catálogo de la organización y equipos de referencia |
| `get_tariffs` | read | Matriz propia de la organización o `null` (pliego oficial integrado en la app) |
| `search_clients`, `get_client` | read | `get_client` resume hasta 50 propuestas enlazadas |
| `create_client`, `update_client` | draft | CAS: `update_client` envía la versión que leyó; si alguien editó entretanto, `conflict` y no se sobrescribe |
| `link_proposal_to_client` | draft | CAS sobre la propuesta; la papelera es de solo lectura; no cambia los datos impresos; queda un punto del historial de versiones |

**Acciones `guarded`** (precios, estados, decisión comercial, papelera, borrar clientes, catálogo, plantillas): no se listan y `tools/call` responde `confirmation_required`. La confirmación de un proveedor (el aviso de ChatGPT antes de una acción de escritura, por ejemplo) no es una confirmación humana dentro de SolarSim, y el modo *bypass* es por dispositivo. La evolución prevista es una cola de acciones pendientes en la API que se confirmen en la bandeja de la app (ver [Pendiente](#pendiente)).

No disponibles en remoto porque dependen del renderer: `get_simulation`, `create_proposal`, `duplicate_proposal`, `propose_project_update`, `open_proposal`, textos y diseño del documento, anexos, `audit_catalog`, `get_agent_action_status`.

Los resultados mantienen la envoltura del registro (`structuredContent` = `{status, data}` o `{status:'error', code, message}`, texto legible siempre presente, 64 KB como máximo). Una escritura responde `applied` con `activityId = remote:<id>`: no hay **Deshacer** automático; las propuestas conservan su historial de versiones y la actividad remota queda registrada.

`tools/list` depende del acceso: con alcance `read` o cuenta LECTOR solo aparecen las de lectura. Anotaciones: `readOnlyHint` para lecturas, `destructiveHint: false` (ninguna remota borra).

## Protocolo

- Streamable HTTP, **sin estado**: un `POST` por mensaje y respuesta `application/json`; `GET`/`DELETE` → 405; notificaciones → 202; sin `Mcp-Session-Id` ni SSE; sin lotes.
- Revisiones admitidas: `2025-11-25`, `2025-06-18`, `2025-03-26` (las que usan hoy los conectores de Claude y ChatGPT y el SDK 1.32). Una petición de la revisión `2026-07-28` (cabecera `MCP-Protocol-Version` o `_meta` por petición) recibe `400` con `UnsupportedProtocolVersionError` (-32022) y la lista anterior: los clientes de doble era vuelven a `initialize`. Implementar la revisión 2026-07-28 (`server/discover`, cabeceras `Mcp-Method`/`Mcp-Name`) queda pendiente.
- `instructions` = `AGENT_RULES_ES` más el aviso de que las acciones confirmadas no están disponibles.
- Sin token, o con uno inválido: `401` con `WWW-Authenticate: Bearer resource_metadata="<origen>/.well-known/oauth-protected-resource/mcp", scope="solarsim:read solarsim:write"` (sin `resource_metadata` si OAuth está apagado). Claude exige ese `401` para iniciar sesión.
- La etiqueta del cliente (`clientInfo.name` del `initialize`) se recuerda por token en memoria solo para la actividad; no autoriza nada.
- `Host` debe ser el host de `MCP_PUBLIC_URL` (o uno de `MCP_ALLOWED_HOSTS`): 403 en otro caso, salvo `/health`. Cloudflare Tunnel conserva el `Host` público.
- Los identificadores que van en una ruta de la API se validan (`pathId`: nunca vacío, `.`, `..`, `/` ni `\`); `arguments` que no sea un objeto es `invalid_input`.

## Modelo de amenazas

| Amenaza | Mitigación |
| --- | --- |
| Token robado | Hash SHA-256 en la base; formato exacto (`ssm_pat_`/`ssm_at_` + 43 caracteres) comprobado antes de consultar la base; caducidad obligatoria; revocación inmediata en la app; audiencia ligada al endpoint; refresco rotativo con detección de reuso; `auth_version` |
| Agente que se excede | Lista cerrada de rutas en la API, alcance ∩ rol actual, `guarded` fuera, CAS, papelera de solo lectura, límites de 12/20/50 resultados y 64 KB |
| Escalada a sesión de escritorio | `/api/auth/*` fuera de la lista: un token de agente nunca obtiene un JWT; las rutas de gestión exigen sesión de escritorio |
| Compromiso del CT del MCP | El servicio no tiene base de datos, `JWT_SECRET` ni secretos propios; solo ve tokens en tránsito, ya acotados. Contenedor sin root |
| Phishing de consentimiento / redirección abierta | Redirecciones registradas: solo `https` o loopback `http` (puerto libre, RFC 8252); coincidencia exacta; un `redirect_uri` desconocido se muestra como error, nunca se sigue; el host de retorno se muestra en grande y se avisa si es loopback; `iss` en la respuesta |
| CSRF de inicio de sesión (conectar el asistente de la víctima a la cuenta del atacante) | Token aleatorio en cookie `HttpOnly; Secure; SameSite=Lax; Path=/oauth/authorize` y en un campo oculto, comparados en tiempo constante antes de leer credenciales; un envío entre sitios no lleva la cookie |
| Clickjacking / inyección en la página de consentimiento | CSP `default-src 'none'; form-action 'self' <origen de retorno>; frame-ancestors 'none'; base-uri 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, todo texto escapado, sin JavaScript. Solo `application/x-www-form-urlencoded` o JSON, cuerpos ≤ 16 KiB, campos repetidos o archivos se descartan |
| Fuerza bruta de contraseñas por la página OAuth | 20 intentos/10 min por IP y 8/15 min por correo, `Retry-After` del límite que rechazó; mismo coste bcrypt exista o no la cuenta. La IP es la del socket salvo detrás de un proxy de confianza configurado (ver [IP del cliente](#ip-del-cliente)): rotar `CF-Connecting-IP` o `X-Forwarded-For` no da cupo nuevo |
| Registro dinámico abusivo | 20 registros/h por IP; los clientes sin uso en 7 días se purgan; solo clientes públicos |
| Interceptación del código | PKCE S256 obligatorio; código de un solo uso, 120 s, ligado a cliente y `redirect_uri` |
| Páginas web contra `/mcp` (DNS rebinding, CSRF) | `Host` canónico obligatorio; `Origin` rechazado salvo `MCP_ALLOWED_ORIGINS`; solo cabecera `Authorization` (nunca tokens en la URL) |
| Ráfagas y tokens inventados | Servicio: 300 req/min por IP, 120 req/min por token, 30 bearer rechazados/10 min por IP (antes de llamar a la API), cuerpo ≤ 256 KB leído por trozos. API: 30 bearer `ssm_` rechazados/10 min por IP antes de consultar la base y 240 req/min por acceso **después** de autenticar. Con el mapa lleno los limitadores desalojan la clave más antigua: llenarlos no bloquea a nadie |
| Inyección de instrucciones en datos | `AGENT_RULES_ES`; esquemas estrictos; las escrituras posibles son acotadas y reversibles a mano |
| Servicio desactualizado frente a la API | Envía `X-SolarSim-Client: mcp-remote/<versión>`; si la API sube `MIN_CLIENT_VERSION`, responde `426` y el agente recibe `service_outdated` |

Riesgos aceptados:

- Los limitadores son por proceso (con varias réplicas se multiplican).
- Tras revocar un token, el servicio puede seguir respondiendo `initialize`, `ping` y `tools/list` con él durante **10 s** como máximo (caché de identidad). No expone datos: cada `tools/call` pasa por la API, que ya lo rechaza.
- Todas las peticiones de agentes llegan a la API desde el servicio MCP. Si la API no lo trata como proxy de confianza, un atacante con muchas IP puede agotar el límite de 30 fallos de la API para la dirección del servicio y dejar sin MCP remoto a todos durante 10 min (la app de escritorio no se ve afectada). El servicio ya frena por IP real antes de reenviar y manda `X-Forwarded-For: <IP del cliente>`; para que la API lo use, ver [IP del cliente](#ip-del-cliente).

## IP del cliente

Los límites por IP usan la dirección del socket (`shared/clientIp.ts`). Las cabeceras de proxy se ignoran salvo que el socket pertenezca a `TRUSTED_PROXIES` (IP o CIDR, coma; vacío por defecto) y `CLIENT_IP_HEADER` diga cuál leer: `cf-connecting-ip` (valor único de Cloudflare) o `x-forwarded-for` (de derecha a izquierda, saltando proxies de confianza). Sin configurar, detrás de Caddy o del túnel todas las peticiones comparten la IP del proxy: los límites siguen funcionando, pero son globales. Valores recomendados en [INFRASTRUCTURE_ARCHITECTURE.md](INFRASTRUCTURE_ARCHITECTURE.md#servidor-mcp-remoto-ct-dedicado).

## Conectar proveedores

En todos los casos, la dirección es la que muestra Ajustes → Agentes e IA → Acceso remoto (por ejemplo `https://mcp.solarsim.electsun.net/mcp`).

- **Claude.ai, Claude Desktop y móvil** (requiere `MCP_OAUTH_ENABLED=true`): Ajustes → Conectores → Añadir conector personalizado → pegar la dirección, sin rellenar las opciones avanzadas. Claude se registra solo (registro dinámico) con la redirección `https://claude.ai/api/mcp/auth_callback` y abre la página de SolarSim para iniciar sesión. En organizaciones Team/Enterprise lo añade quien sea propietario.
- **ChatGPT** (requiere OAuth): con el modo desarrollador activado, *Settings → Apps* → crear app con la dirección y autenticación OAuth. ChatGPT pide confirmación antes de las herramientas sin `readOnlyHint`. Su documentación indica que usa CIMD o registro dinámico «cuando está configurado»; **no se ha probado contra ChatGPT real** (ver Pendiente).
- **Claude Code**: `claude mcp add --transport http solarsim-remoto <URL> --header "Authorization: Bearer <TOKEN>"`, o sin cabecera para usar OAuth (redirección loopback en puerto variable, admitida).
- **Codex**: bloque `[mcp_servers.solarsim-remoto]` con `url` y `bearer_token_env_var = "SOLARSIM_REMOTE_MCP_TOKEN"` (el panel lo copia).
- **Gemini CLI**: `~/.gemini/settings.json` con `httpUrl` y la cabecera `Authorization` (el panel lo copia).
- **Agentes por API** (conector MCP de la API de Anthropic, herramienta MCP remota de OpenAI Responses): URL + token personal como `authorization_token`/cabecera. Crear un token por agente para poder revocarlo por separado.
- **Cabeceras fijas en Claude** (`static_headers`, beta limitada): posible con un token personal, pero ese token sería el de una persona usado por toda la organización de Claude; preferir OAuth.

## Variables

API (`server/`, contenedor de la API):

| Variable | Valor |
| --- | --- |
| `MCP_REMOTE_ENABLED` | `true` para activar tokens de agente y rutas de gestión. Ausente = no existe nada de esto |
| `MCP_REMOTE_URL` | URL canónica del endpoint MCP, p. ej. `https://mcp.solarsim.electsun.net/mcp`. Debe coincidir con `MCP_PUBLIC_URL` del servicio |
| `MCP_OAUTH_ENABLED` | `true` para el servidor de autorización (necesario para ChatGPT y Claude.ai) |
| `API_PUBLIC_URL` | Emisor OAuth: origen público de la API, sin ruta, p. ej. `https://solarsim.electsun.net` |
| `TRUSTED_PROXIES`, `CLIENT_IP_HEADER` | Ver [IP del cliente](#ip-del-cliente); vacíos por defecto |

Servicio (`mcp-remote/`):

| Variable | Valor |
| --- | --- |
| `MCP_PUBLIC_URL` | Igual que `MCP_REMOTE_URL` (con ruta, `https`) |
| `API_INTERNAL_URL` | Dirección de la API desde el CT del MCP (`http://` o `https://`), sin ruta |
| `OAUTH_ISSUER_URL` | Igual que `API_PUBLIC_URL` si OAuth está activo; ausente = solo tokens personales |
| `PORT`, `HOST` | `8787`, `0.0.0.0` por defecto |
| `MCP_ALLOWED_ORIGINS` | Orígenes de navegador permitidos (coma), vacío por defecto |
| `MCP_MAX_BODY_BYTES` | 262144 por defecto |
| `MCP_ALLOWED_HOSTS` | `Host` adicionales aceptados en `/mcp` (coma); por defecto solo el de `MCP_PUBLIC_URL` |
| `TRUSTED_PROXIES`, `CLIENT_IP_HEADER` | Ver [IP del cliente](#ip-del-cliente); detrás de Cloudflare Tunnel: la red Docker del CT y `cf-connecting-ip` |

Una configuración inválida detiene el arranque. `GET /health` responde sin tocar la API; `GET /health?deep=1` comprueba `API_INTERNAL_URL/api/health`. `SIGTERM` termina las peticiones en curso y sale con código 0.

## Despliegue (lo hace el responsable de infraestructura)

Procedimiento en [INFRASTRUCTURE_ARCHITECTURE.md](INFRASTRUCTURE_ARCHITECTURE.md#servidor-mcp-remoto-ct-dedicado). Resumen: migración 008 al desplegar la API (aditiva), variables de la API, imagen `mcp-remote` en el CT dedicado, publicación HTTPS por Cloudflare Tunnel, ruta interna CT MCP → API, y comprobación con un token personal antes de activar OAuth.

## Pendiente

- **Confirmación humana en remoto** para `guarded`: tabla de acciones pendientes en la API, endpoints de confirmar/rechazar con CAS, bandeja en la app y `get_agent_action_status` remoto.
- **CIMD** (Client ID Metadata Documents): no anunciado. Exige que la API descargue documentos de URLs arbitrarias (riesgo SSRF: lista de hosts permitidos, sin redirecciones, tamaño y tiempo limitados, caché). Claude cae a registro dinámico; ChatGPT podría necesitarlo según su configuración.
- **Revisión 2026-07-28** del protocolo y **MCP Apps** (tarjetas) en remoto.
- **Política de organización**: hoy cualquier miembro puede crear accesos cuando el servidor lo permite. Un ADMIN audita la actividad de toda la organización (`?scope=organization`); la API le deja revocar cualquier acceso de su organización, pero la interfaz solo lista los propios, así que para cortar a un miembro hoy se le desactiva o se le cambia la contraseña. Falta un interruptor por organización y una lista de accesos de todos los miembros para ADMIN.
- Prueba real con ChatGPT y Claude.ai contra un entorno de staging (los tests usan el SDK oficial y un flujo OAuth sintético).
- Más herramientas sin motor: crear/duplicar propuestas en servidor exigiría portar la política de precios automáticos y el motor a `shared/`.

## Verificación

- `server/tests/agentAccess.test.ts`: configuración, desactivado por defecto, tokens personales, lista de rutas, alcance y rol, CAS y papelera, actividad, revocación, `auth_version`, audiencia, límite por persona, OAuth (metadatos, registro, consentimiento, PKCE, `iss`, rotación, reuso, revocación, loopback, varias organizaciones que conservan el alcance elegido), CSRF de inicio de sesión, cuerpos raros y tamaño, `nosniff`, IP falsificada y proxies de confianza, formato del token antes de la base, fallos por IP y límite por acceso, carrera de degradación al crear un token y aislamiento entre organizaciones.
- `src/tests/testAgentAccessShared.ts`: limitador (desalojo), IP del cliente y lista de rutas; `src/tests/testPermissions.ts` vigila también `server/src` y `mcp-remote/src` (las comprobaciones de rol en línea heredadas de la API quedan congeladas por archivo).
- `mcp-remote/tests/protocol.test.ts`: transporte, 401 con metadatos, Origin, tamaños, versiones, herramientas por alcance, `guarded`, errores de la API, tasa y salud (API sintética).
- `mcp-remote/tests/endToEnd.test.ts`: API real con PostgreSQL efímero + servicio + cliente del SDK oficial de MCP, y flujo OAuth completo.
- `mcp-remote/tests/containerSmoke.ts`: imágenes empaquetadas de API y servicio en una red Docker aislada (configuración inválida, sin secretos en el contenedor, salud profunda, herramienta real, apagado con código 0).
- `src/tests/testRemoteMcpPanel.ts`: panel y servicio de la app con transporte sintético.
