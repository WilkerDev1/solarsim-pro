<!--
BORRADOR de las notas de la 2.11.0 (F7a). No es la nota de la versión: el release la escribe el mantenedor al cerrar F6 y F7b, copiando
este texto a `release/release-notes-v2.11.0.md` (el nombre que lee `scripts/release.ts` y `release.yml`) y borrando este comentario.
Antes de publicar, confirmar contra el código lo que sigue y decidir lo pendiente:
  - El modal antiguo del asistente de propuestas desaparece en F6: confirmar que ya no existe en la versión que se publica.
  - Margen bruto objetivo: las instalaciones que ya existen conservan guardado 28 % (no se migra). Decisión del dueño: ¿migrar a 40 %? La
    sección «Lo que cambia para quien ya tiene propuestas» cambia según lo que se decida (ADR 0009).
  - Propuestas que pasarán a «Incompleta»: correr `scripts/qa/countIncompleteProposals.ts` con un respaldo real y poner aquí la cifra y,
    si el dueño relaja la regla del 0 heredado o del inversor con cantidad 0, quitar o ajustar el párrafo correspondiente.
  - Despliegue: la 2.11.0 es solo de cliente (docs/AGENT_CONTRACT_FREEZE.md). Si F7b o el dueño tocan `shared/`, la API o el MCP remoto,
    esa sección deja de valer.
No cambiar versiones ni CHANGELOG desde este borrador.
-->
# SolarSim Pro 2.11.0

Versión del asistente único. Antes había dos asistentes de IA, uno que creaba propuestas y otro que conversaba. Ahora hay uno solo: el botón **«Asistente»**, que está en todas las vistas, crea propuestas, las edita en vivo y deshace lo que hizo.

## Un solo asistente

- **Está en todas partes.** El botón «Asistente» (abajo a la derecha) aparece en Inicio, el simulador, el resumen, la vista previa del PDF, Clientes, Empresas y Cotizaciones. Donde cabe, se acopla como una columna a la derecha sin tapar los resultados; si no cabe (ventana estrecha, pantalla dividida, Inicio), flota. Se puede arrastrar su borde para cambiar el ancho.
- **Viene encendido.** Para usarlo hace falta la clave de Google Gemini en Ajustes → IA, como antes. Sin clave no molesta: el panel avisa con discreción y lleva a Ajustes. Se puede apagar en Ajustes → Funciones de la aplicación.
- **Las tres entradas de antes llevan aquí.** El menú de IA, «Crear con el asistente de IA» en Nueva simulación y «Autocompletar con factura» en la pestaña Energía abren el asistente; ya no se abre la ventana antigua.

## Crear una propuesta es pedirla

- Escribe **«Crea una propuesta»** desde Inicio y el asistente la crea, la abre en el simulador y te dice qué supuso. Sin datos, nace con un **consumo de 1.000 kWh al mes marcado como estimado** (lo dice un aviso discreto en la pestaña Energía hasta que escribas un mes real), la tarifa de referencia de la distribuidora, equipos del catálogo con el precio de su oferta y el sistema ya dimensionado.
- **Con una factura.** Adjunta el PDF de la factura en el chat y pide «Crea una propuesta con esta factura»: el asistente la lee, y la propuesta nace con el cliente y los doce consumos de la factura. Si la factura trae menos de doce meses, usa el promedio de los que leyó y te lo avisa; nunca rellena meses.
- **Las propuestas nuevas nacen igual por cualquier camino.** «Nueva simulación» ya no parte del ejemplo del Centro Médico (sin coordenadas, sin empresa «Cliente Comercial» ni equipos de ejemplo): nace con el consumo estimado, la tarifa de la distribuidora y equipos del catálogo, como las que crea el asistente. Los paneles se dimensionan con el mes de mayor consumo, y la batería, si la quieres, para cubrir tres cuartas partes del consumo de un día de ese mes.

## Edita en vivo, con tarjeta y deshacer

- Pídele cambios en lenguaje normal: **«ponle baterías», «sube la cobertura al 90 %», «cambia la distribuidora a EDENORTE», «pon el margen en 35 %», «hazle un descuento del 5 %», «agrega un extra de transporte»**. Puede cambiar todo lo que se edita en el simulador: consumo, tarifa y distribuidora, paneles, inversores, baterías, cobertura, margen, descuentos y extras.
- **Se aplica al momento**, sin pedir permiso, y se ve: el control que cambió se destaca unos segundos en el simulador (sin abrir secciones ni mover la pantalla) y el chat muestra una **tarjeta** con lo que había y lo que hay ahora, lo que se ajustó solo y los resultados antes y después (potencia, precio de contrato, ahorro, retorno).
- **Todo se puede deshacer.** «Deshacer» en la tarjeta, «Deshacer todo el turno» cuando hubo varios cambios, o simplemente «deshaz eso». Si cambiaste algo a mano después, no te lo pisa: te dice por qué no puede deshacerlo.
- **Una excepción:** poner a mano el costo de un equipo (en lugar de elegir una oferta del catálogo) te pide confirmarlo en la tarjeta. Si prefieres confirmar también los demás cambios con precio, en Ajustes → Agentes puedes elegir «Pedir confirmación para precios».
- **Escribir mientras trabaja.** No hace falta esperar: tu mensaje queda en cola y el asistente lo atiende al terminar el paso que está haciendo. El botón **Detener** corta el turno sin dejar cambios a medias; lo ya aplicado se queda y se puede deshacer.
- Cerrar el panel no cancela lo que está haciendo: el botón «Asistente» muestra un punto mientras trabaja y otro cuando hay una respuesta sin leer.

## Nunca inventa precios

- Si un equipo no tiene oferta de proveedor, el asistente usa el **precio genérico** del catálogo y lo señala como «precio genérico, sin proveedor»: confírmalo con una oferta antes de enviar.
- Si no hay ni oferta ni precio genérico, el equipo queda **sin precio** y la propuesta queda **«Incompleta»**: en lugar de ceros o cifras inventadas se ve «—» y «Resultados pendientes» con lo que falta, y el asistente te lo dice cuando le preguntas «¿cuánto cuesta?». Una propuesta incompleta no se exporta a PDF, no se comparte ni se convierte en cotización hasta completarla (el motivo aparece en un ⓘ). Con el costo puesto, todo vuelve a la normalidad.
- Un costo de **0 escrito a propósito** (el cliente aporta el equipo, una cortesía) es un precio válido: se escribe en el dock o se confirma en la tarjeta.

## Lo que cambia para quien ya tiene propuestas

- **Algunas propuestas guardadas pueden pasar a «Incompleta»** al actualizar, si les falta un mínimo para calcular (consumo, panel o inversor, precio de la energía o el precio de un equipo). Es lo esperable con un equipo guardado con costo 0 sin haberlo confirmado a mano, por ejemplo desde un catálogo sin precios. No se pierde nada: se ve «Incompleta» en el listado, con el motivo, y basta escribir el dato que falta (o, si el 0 era a propósito, borrar el campo y escribir 0 de nuevo). Las propuestas ya aprobadas o rechazadas siguen sumando en los totales de ventas.
- **Margen bruto objetivo.** El valor de fábrica pasa de 28 % a 40 %. En las instalaciones que ya existen, el ajuste ya estaba guardado en 28 %: **no cambia solo**; las propuestas nuevas siguen naciendo con 28 % hasta que lo cambies en Ajustes → Costos y margen.

## Para quien usa agentes externos

- Sin cambios: Claude Code, Codex, Claude Desktop, ChatGPT y Claude.ai conectados por el MCP local o el remoto ven exactamente las mismas herramientas e instrucciones que antes.

## Despliegue

- **Solo cliente.** No hay migración, la API no cambia y `MIN_CLIENT_VERSION` sigue en 2.9.0; el visor web (Worker) y el MCP remoto no se redespliegan. Publicar el instalador 2.11.0 con el flujo habitual.
- **Volver atrás.** Los dos campos nuevos de la propuesta (la marca de consumo estimado y la base de dimensionado) son opcionales y el estado «Incompleta» es derivado y no se guarda, así que el instalador anterior abre las mismas propuestas; ensayarlo con una copia antes de publicar.
