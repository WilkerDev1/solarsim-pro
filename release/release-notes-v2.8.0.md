# SolarSim Pro 2.8.0

Medición neta SIE-007-2026 con facturación por bloques, Modo IA renovado (Gemini 4 Hydrogen, edición de textos del documento y escáneres más completos), sistemas aislados con alternativa de suministro, visor web en modo oscuro y acceso remoto para otros asistentes de IA. La API incluye la migración 008. `MIN_CLIENT_VERSION` sube a 2.8.0 al desplegar.

## Medición neta SIE-007-2026 y tarifas (#125, #126, #128, #132, #133, #135, #136, #137, #138, #142)

- **Régimen por propuesta.** Las propuestas nuevas usan el régimen SIE-007-2026: se acredita todo lo que el sistema inyecta y se descuenta el cargo por uso de la red por kWh inyectado, con el valor de fábrica de cada distribuidora. Las propuestas anteriores siguen en el régimen anterior (retención de la exportación) con las mismas cifras de siempre.
- **Facturación por bloques.** Con la tarifa de referencia (BTS-1/BTS-2), el ahorro mensual es la factura sin sistema menos la factura con sistema: energía por bloques (con 701 kWh o más, todos los kWh al cuarto rango), cargo fijo por rango, neteo kWh contra kWh con arrastre del crédito y liquidación anual del crédito sobrante.
- **Desglose en el dock.** La sección de tarifas muestra el método de valoración vigente y la factura mensual promedio sin y con sistema (cargo fijo, energía, cargo por uso de red, total). El precio de liquidación anual del crédito se puede editar.
- **Postura provisional.** Varios supuestos no se han verificado con facturas reales y se muestran como «estimado, no verificado»: son conservadores y configurables. Cuando haya facturas que los confirmen se ajustarán.
- **PDF por bloques.** Con energía facturada por bloques, el cuadro resumen muestra el «Precio medio kWh» con la nota «Según bloques tarifarios». Con precio único el documento no cambia. Los dos textos nuevos se pueden editar en la hoja.
- **Actualizar propuestas antiguas.** En una propuesta del régimen anterior con inyección y tarifa de un solo precio, el dock ofrece «Actualizar a SIE-007-2026» (se puede deshacer). No hay migración automática: decide el usuario. Una insignia «Régimen anterior» marca esas propuestas en tarjetas, lista de inicio y resumen.
- **Tarifas vigentes.** Corrección del código de tarifa, de la matriz SIE-121/147 y de la regla de 701 kWh, con la nota regulatoria. La matriz de fábrica antigua que quedó guardada en una instalación existente se sustituye por la vigente al abrir la app.
- Decisión documentada en el ADR 0005.

## Modo IA (#119, #122, #127, #130, #131, #134, #137, #139, #140, #141)

- **Gemini 4 Hydrogen** es el modelo base, con salida estructurada en los escáneres.
- **Chat y revisión rediseñados.** Interfaz nueva para el asistente de propuestas y para la revisión del borrador. El aviso «Cambió el destino» solo aparece si de verdad se descarta un borrador, y el cuadro de escritura se vacía al enviar.
- **El asistente edita los textos del documento PDF**, en cualquier propuesta editable, con registro transparente: cada cambio muestra la propuesta, el texto, «antes → después» y Deshacer. Si el cambio es en otra propuesta, la tarjeta lo destaca.
- **Emparejador único de equipos** con el catálogo, con resultado explicable y tolerancias por tipo (por ejemplo, la batería de 16 kWh ya se reconoce).
- **Escáner de facturas.** Lee energía retirada e inyectada, crédito acumulado y generación distribuida como datos informativos. Las tarifas escalonadas (BTS-1/BTS-2) se valoran con los bloques oficiales y no con el precio de un solo bloque de la factura, que antes casi duplicaba el ahorro.
- **Escáner de fichas.** Reparte los valores comunes de una familia de modelos y rellena los campos de cada variante (corriente, eficiencia, coeficiente de temperatura, dimensiones, potencia AC máxima, MPPT). La FV máxima publicada como porcentaje se convierte a kW; si la ficha no la publica, ofrece una estimación opcional a partir de MPPT, corriente y tensión, marcada como «estimado».
- **Escáner de tarifas.** Extrae cargo fijo por rango y cargo por uso de red con su resolución de origen. Si el cuadro no cita una resolución, la revisión pide la procedencia (resolución y fecha, o «cuadro de la distribuidora» con mes y año). Rechaza pliegos de otro país y muestra como informativas las tarifas no soportadas. Nada se aplica sin confirmar.

## Sistemas aislados e inyección cero (#129)

- Un sistema aislado no tiene factura que bajar. El selector «Alternativa de suministro» valora el ahorro con la tarifa de la distribuidora (como antes) o con el costo por kWh de un generador. Sin costo válido del generador, la propuesta queda incompleta y avisa en vez de inventar un ahorro.
- Animación de flujo de energía para sistemas aislados y con inyección cero.

## Visor web (#120)

- Tema oscuro propio para la propuesta web. Los enlaces ya publicados siguen funcionando.

## Dashboard (#121)

- Filtro por decisión comercial en la barra superior.

## Acceso remoto MCP (#124)

- SolarSim se puede conectar a Claude.ai, ChatGPT, Claude Code, Codex y Gemini CLI mediante un servicio MCP remoto (mcp.electsun.net). Está desactivado por defecto.
- En Ajustes, Agentes e IA, «Acceso remoto (MCP)» crea y revoca accesos y copia la configuración. Los tokens `ssm_…` se guardan solo como hash; hay también OAuth 2.1 para los proveedores que lo exigen.
- Los accesos de lectura actúan como LECTOR. Las herramientas que requieren confirmación humana no se exponen en remoto.

## Interfaz (#134, #143)

- Los avisos del dock de tarifas pasan a un ⓘ discreto, sin recuadros ámbar. El tooltip queda siempre visible, se cierra con Escape y se reposiciona al hacer scroll.
- El menú de IA ya no queda tapado por Ajustes.

## Calidad (#117, #118)

- La integración continua corre en trabajos paralelos con un único check requerido (`gates`) y hay una revisión automática consultiva de cada PR.
- Documentación de respaldo diario y conmutación del servidor.

## Compatibilidad

- La política de funciones de la organización pasa a dos claves (`selfConsumptionProjection`, `netMeteringRegimeSelector`). La API entrega la forma de una clave a los clientes anteriores a 2.8.0. Con `MIN_CLIENT_VERSION=2.8.0` esa distinción deja de tener efecto.
- Las propuestas guardadas siguen abriéndose: lo que no tiene el régimen nuevo queda en el régimen anterior con las mismas cifras.

## Notas de despliegue

Pensadas para el operador. No hay migraciones nuevas aparte de la 008 del MCP remoto.

1. **Migraciones.** La 008 (`agent_grants`, `agent_tokens`, tablas OAuth y actividad; aditiva) se aplicó en producción el 16/11/2026 al desplegar el MCP remoto. Comprobar igualmente antes del despliegue que no hay migraciones pendientes (esperado `[1,…,8]`).
2. **Checkpoint y ensayo de restauración** con la imagen candidata, como en cada despliegue.
3. **Worker (visor) 2.8.0** antes de la release de escritorio o junto con ella.
4. **API 2.8.0** junto con el cliente: conserva `maxPvPowerSource` de los equipos (#140), por lo que debe desplegarse a la vez que el cliente nuevo.
5. **Publicar y firmar** la release de escritorio 2.8.0 (borrador, `release:sign`, verificación, subida de assets).
6. **mcp-remote 2.8.0** (imagen del CT dedicado) en la misma versión que la API, **antes** de subir la versión mínima: `mcp-remote` se identifica como `mcp-remote/<versión>` y con la 2.7.4 recibiría 426.
7. **Subir `MIN_CLIENT_VERSION=2.8.0`** en el `.env` de la API y recrear solo la API. La actualización es obligatoria: aprobada por el responsable porque todavía nadie usa la app. `DEFAULT_MIN_CLIENT_VERSION` no cambia en esta versión.

## Distribución

- Windows x64: instalador y portable.
- Linux x64: AppImage, Debian, pacman y tar.gz.
- Los paquetes Linux y los manifiestos de actualización se firman con la clave GPG fijada de SolarSim.
- Windows no tiene firma Authenticode.
- macOS y ARM no forman parte de esta publicación.
