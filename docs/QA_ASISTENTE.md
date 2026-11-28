# QA manual del asistente único

Guion de revisión a mano del asistente de IA único (el flotante, con el bucle propio sobre el SDK de Google) para la versión 2.11.0. Lo automático no sustituye a esta guía y esta guía no sustituye a lo automático: ahí se prueba la lógica con un modelo guionizado; aquí se mira lo que solo se ve en la pantalla (scroll, foco, arrastre, colores, ventana de Electron) y, con la clave de quien la ejecuta, lo que hace el modelo real. Los resultados de una ejecución concreta van en el PR o en el commit, no en documentos fechados.

Documentos relacionados: [QA.md](QA.md) (pruebas y guiones por fase), [ADR 0011](adr/0011-sesion-y-bucle-del-asistente.md) (sesión y bucle), [ADR 0012](adr/0012-panel-completo-del-asistente.md) (panel), [ADR 0010](adr/0010-perfil-edicion-en-vivo.md) (edición en vivo), [ADR 0009](adr/0009-fabrica-unica-dimensionado-y-propuesta-incompleta.md) (propuesta incompleta).

## 1. Qué hay automatizado y qué queda para esta guía

| Qué | Dónde | Sin red ni clave |
| --- | --- | --- |
| Escenarios de punta a punta sobre la sesión real y el store real con el modelo guionizado: crear sin datos desde Inicio, editar en vivo cada familia de opciones con su tarjeta y su deshacer, nunca inventar precios, herramienta que falla, escribir mientras trabaja, Stop, «deshaz eso» | `npm test -- testAssistantEvals` | Sí |
| Cada ruta del registro de campos (`src/domain/projectFields.ts`) la escribe `edit_proposal`, o tiene un motivo declarado (el precio directo $/W es del dock) | `npm test -- testAssistantEvalFieldCoverage` | Sí |
| El propio script de evaluación con el modelo real (cada petición aprueba con un modelo correcto y falla con uno que no hace nada; la clave nunca sale) | `npm test -- testAssistantEvalScript` | Sí |
| El recuento de propuestas guardadas que pasarían a «Incompleta» | `npm test -- testCountIncompleteProposals` (la prueba; el recuento real es el script del apartado 9) | Sí |
| Lo que decide el modelo real ante cada petición | `scripts/qa/evalAssistant.ts` (apartado 8) | No: clave propia |
| Aspecto, scroll, foco, arrastre, animaciones, ventana de Electron, instalación | Esta guía (apartados 3 a 7) | — |

Una prueba verde con el modelo guionizado dice que **la maquinaria** hace lo prometido cuando el modelo hace lo correcto. Si el modelo real elige otra herramienta, pide un dato de más o responde largo, eso solo lo ve el apartado 8 o un ensayo a mano.

## 2. Preparación

- **Datos sintéticos.** Nada de clientes reales en las capturas ni en el PR (las capturas se guardan en `docs/qa/`, ignorado por Git). Una propuesta de ejemplo se crea desde Propuestas > Crear Nueva Propuesta o, mejor, pidiéndosela al propio asistente.
- **Dos catálogos.** Uno con ofertas de proveedor (Ajustes > Catálogo: al menos un panel, un inversor y una batería con un precio de proveedor y stock) y otro sin ninguna oferta ni precio genérico (catálogo de fábrica recién instalado, perfil nuevo). Casi todo el apartado 6 se hace con los dos.
- **Cómo arrancar.** Con clave real: `npm run electron:dev` (ventana de Electron) o `npm run dev` (navegador); Ajustes → IA → API Key de Google Gemini. Sin clave y sin red: `npm run dev` y abrir `/scripts/qa/fixtures/appAssistant.html` (modelo falso; las palabras «crea», «90» y «equipo» eligen la herramienta). El asistente viene encendido por defecto; Ajustes → Funciones de la aplicación lo apaga.
- **Modelos.** Repetir los puntos marcados con «(modelo real)» con el modelo base y con el de respaldo de Ajustes → IA. Un modelo distinto cada vez puede dar un camino distinto: lo que se exige es el resultado (la propuesta queda bien), no el orden de las herramientas.

## 3. Guion por vista

Para cada vista: el botón «Asistente» (abajo a la derecha) existe y abre el panel; escribir «Hola» responde; cerrar y abrir conserva la conversación; el panel se ve bien en claro y en oscuro y a 1024×700.

| Vista | Qué se hace | Qué debe verse |
| --- | --- | --- |
| **Inicio** | «Crea una propuesta» | Pasa al simulador con la propuesta nueva sin tocar nada; el chat sigue abierto con su conversación; texto final con lo que supuso (1.000 kWh/mes estimados, tarifa de referencia) y lo que falta (una factura); tarjeta «Propuesta creada» con equipos y cifras si está completa. Flota siempre (no se acopla). |
| **Simulador** | Editar en vivo (apartado 5), preguntar «¿cuánto cuesta?», «¿cuántos paneles?» | Cada cambio se aplica al momento y el control se destaca unos segundos; las preguntas no modifican nada. Acoplado cuando cabe (apartado 4). |
| **Resumen de la propuesta** | «Súbele el margen al 35 %» | La cifra del resumen cambia sin recargar; acoplado desde 1280 px. |
| **Vista previa del PDF / documento** | «Cambia la garantía de los paneles a 25 años» (textos del documento) | El texto cambia en el documento; la página nunca queda recortada (el panel solo se acopla si cabe la página entera; a 1440 px flota). |
| **Clientes** | «Busca al cliente …» y «Enlaza esta propuesta con …» | Responde con los datos reales; enlazar pide la confirmación de siempre. |
| **Empresas** | «¿Qué puedes hacer desde aquí?» | Responde sin escribir nada y sin inventar capacidades (no hay herramienta de empresas: lo dice y orienta a la vista). |
| **Cotizaciones** | Con la función apagada, el botón no aparece en esas vistas; encendida, «Convierte esta propuesta en cotización» | El asistente no tiene herramienta para convertir: explica el límite y orienta al editor de cotizaciones. Una propuesta incompleta tampoco se convierte desde el botón de la app (motivo en un ⓘ). |

En todas: cambiar de vista con un turno en curso no corta el turno; cerrar el panel no lo cancela (el botón muestra un punto claro que respira y, al terminar, uno ámbar).

## 4. Las tres entradas y acoplado / flotante

**Las tres entradas abren el asistente único** (no el modal antiguo):

1. Menú de IA del dock → «Asistente». Con la papelera abierta, sale de ella y abre el panel.
2. Nueva simulación → escribir un nombre → «Crear con el asistente de IA»: se cierra el modal y el compositor queda con «Crea una propuesta llamada «…»», sin enviarlo.
3. Simulador → Energía → «Autocompletar con factura (asistente)»: se abre el panel con el borrador sugerido y el selector de archivos del sistema.

Con el asistente apagado en Ajustes, cualquiera de las tres lo enciende.

**Acoplado / flotante** (la lógica está probada en `testAssistantFullPanel`; aquí se mira lo visual):

- Simulador a 1440 px o más: columna a la derecha, el contenido se estrecha sin tapar nada y el dock de parámetros no cambia. Arrastrar el borde izquierdo (o Tab hasta él y flechas): entre 280 y 720 px, sin dejar el contenido por debajo de 640 px.
- A 1280 px en el simulador, en pantalla dividida y en Inicio: flotante. En el resumen, acoplado desde 1280 px. En el PDF solo si cabe la página entera.
- Pasar de acoplado a flotante (estrechar la ventana) conserva lo escrito en el compositor y la conversación. Acoplado, Esc no cierra la columna; flotante, Esc la cierra. Esc nunca detiene el turno.
- Con la columna abierta, abrir Nueva simulación o Ajustes y cerrarlos: la columna queda reservada mientras el modal está abierto y el contenido no cambia de ancho.
- Con «reducir movimiento» activado en el sistema, sin pulsos ni animaciones.

## 5. Edición en vivo y deshacer

Con una propuesta abierta en el simulador, con clave real (modelo real) o con la fixture. Por cada familia: la petición, el cambio, el control destacado, la tarjeta y el Deshacer. Lo que se espera siempre: se aplica sin pedir confirmación; la tarjeta dice «Cambios aplicados» con antes → después, lo que «se ajustó solo» (reglas y dependencias) y las cifras del motor; el control afectado se destaca unos segundos (si su sección está plegada, un punto «Cambió aquí» en la cabecera; no se abre ni se desplaza nada); «Deshacer» deja la propuesta como estaba y la tarjeta pasa a «Cambio deshecho».

| Familia | Petición de ejemplo | Qué cambia |
| --- | --- | --- |
| Consumo | «El cliente consume 1.500 kWh al mes» | Los doce meses; deja de decir «estimado» (ⓘ «Consumo estimado» de la pestaña Energía); deshacer lo devuelve a estimado |
| Tarifa y distribuidora | «Cambia la distribuidora a EDENORTE con la tarifa BTS1» | Distribuidora, código de tarifa, precio del kWh de referencia y perfil de carga |
| Paneles | «Ponle 20 paneles» / «Cambia el panel por …» | Cantidad o modelo (con su precio de oferta) |
| Inversores | «Ponle dos inversores» | Cantidad o modelo |
| Baterías | «Ponle baterías» / «Quítale las baterías» | Incluye, elige del catálogo, dimensiona y resuelve el precio; o las quita |
| Cobertura | «Sube la cobertura al 90 %» | Cobertura objetivo |
| Margen | «Pon el margen en 35 %» | Factor de venta; el precio de contrato cambia |
| Descuentos | «Hazle un descuento del 5 %» | Un descuento porcentual en Finanzas |
| Extras | «Agrega un extra de transporte por 200 dólares» | Un ítem extra |

Además:

- **Dos cambios en un turno** («margen 30 y cobertura 90»): aparece «Deshacer todo el turno» y revierte los dos.
- **Precios a mano.** Pedirle «pon el panel a 80 dólares» (un costo de equipo escrito a mano, no una oferta del catálogo) deja la tarjeta «Espera tu confirmación»; confirmarla lo aplica.
- **Con «Pedir confirmación».** Ajustes → Agentes → «Cambios dentro de una propuesta (asistente general)» → «Pedir confirmación para precios»: «Margen 30 %» deja la tarjeta con Confirmar y Rechazar, que se pueden pulsar aunque el asistente siga trabajando. Una pendiente de más de 10 minutos pasa sola a «caducada».
- **«Deshaz eso»** (modelo real): revierte lo último que hizo el asistente en la propuesta y la tarjeta original pasa a «Cambio deshecho». Si antes se editó a mano el mismo apartado, no pisa el cambio: dice por qué no se pudo y que hay que usar el historial de versiones.
- **Deshacer y Ctrl+Z.** Deshacer desde la tarjeta y pulsar Ctrl+Z: el cambio del asistente no vuelve; Rehacer sí lo vuelve a aplicar.
- **Editar a mano después.** Cambiar a mano el mismo control y pulsar Deshacer en la tarjeta: la tarjeta dice por qué no se pudo (sin botón).
- **Lo que no debe pasar.** Mirar una propuesta nunca la modifica; editar a mano en el dock nunca destaca nada; el asistente no cambia el precio directo $/W ni el modo manual (son del dock).

## 6. Nunca inventar precios

Con el catálogo **con ofertas**: «Crea una propuesta» → los equipos salen con el precio de la oferta del proveedor, la propuesta nace completa y la tarjeta trae cifras.

Con el catálogo **sin ofertas ni precio genérico**:

1. «Crea una propuesta»: nace **Incompleta** (ⓘ con lo que falta: «Falta el precio de …»). Ninguna cifra, ni un cero: en la tarjeta «Propuesta incompleta: sin resultados todavía»; en el simulador «—» en lo calculado y «Resultados pendientes» en Cotización y Retorno; en el dock, «—» en las franjas de cifras.
2. «¿Cuánto cuesta?»: el asistente explica que aún no hay precio y qué falta; **no da una cifra**.
3. Exportar el PDF, compartir y convertir a cotización están bloqueados con el motivo.
4. «Cambia el panel por …» con un modelo sin precio: avisa que queda sin precio; no escribe 0.
5. Escribir el costo a mano en el dock (o pedirlo y confirmar) la completa.

Con **precio genérico** del catálogo (sesión de organización) y sin oferta: el equipo se usa con el aviso «Precio genérico, sin proveedor … Confírmalo con una oferta de proveedor antes de enviar»; nunca se presenta como oferta.

## 7. Escribir mientras trabaja, Stop, fallos y sin clave

1. **Escribir mientras trabaja.** Pedir «Ponle baterías» y, mientras trabaja, escribir «y la cobertura al 90 %» y Enter: el campo no se bloquea, aparece «En cola, al terminar el paso: …» con «Editar»; al terminar el paso en curso el turno se cierra («Pausé aquí para leer tu mensaje…») y el mensaje se entrega como turno nuevo. «Editar» devuelve el texto al compositor sin detener el turno.
2. **Detener.** El cuadrado (aparte del botón de enviar) cierra el turno («Detenido…»), no reenvía nada y devuelve lo encolado al compositor; lo que ya se aplicó se conserva y se puede deshacer; el siguiente mensaje funciona. Con tres PDF en un mensaje encolado y dos más en el compositor, Detener los devuelve todos («quita 2 para enviar»).
3. **Una herramienta que falla no bloquea.** Pedir «Pon el margen al 30 % en la propuesta zzz-no-existe» (modelo real): el asistente responde que no la encuentra, sin cuelgues ni botones muertos. Con un valor fuera de rango («cobertura al 900 %»), el error nombra la ruta y el modelo corrige o lo explica.
4. **Factura (modelo real).** Adjuntar un PDF de factura sintética y «Crea una propuesta con esta factura»: lee la factura (paso «Leer factura») y crea con el cliente y el consumo leídos (o su promedio, avisado). Con una factura ilegible, lo dice y no inventa consumos.
5. **Sin clave.** Borrar la clave en Ajustes → IA: el compositor avisa «Configura Gemini para conversar» con el botón a Ajustes; Enter muestra en el hilo «Configura una API Key de Google Gemini en Ajustes → IA…» sin llamar al modelo ni dejar un turno colgado.
6. **Clave inválida, cuota o sin conexión.** Una clave incorrecta, el límite de uso o desconectar la red: el hilo muestra un mensaje claro (revisa la clave / espera un momento / revisa la conexión), el turno se cierra y el siguiente funciona; si el modelo base no responde, el turno usa el de respaldo con un aviso discreto.
7. **Apagar el asistente a mitad de turno** (Ajustes → Funciones): el turno se detiene sin más escrituras ni navegación.

## 8. Evaluación con el modelo real (clave propia, fuera de CI)

`scripts/qa/evalAssistant.ts` monta la sesión real sobre un almacén **en memoria** con un catálogo sintético (sin tocar datos del usuario ni la red de SolarSim; la única red es la API de Gemini) y corre una lista de peticiones en español contra los modelos que indiques. Por petición dice las herramientas llamadas (con su estado), si el estado final cumple su aserción, los pasos (llamadas al modelo) y la duración. La clave solo se lee de `GEMINI_API_KEY` y nunca se imprime. **Factura peticiones reales con tu clave.**

```bash
npx tsx scripts/qa/evalAssistant.ts --list                      # las peticiones y su aserción (no necesita clave)
GEMINI_API_KEY=… npx tsx scripts/qa/evalAssistant.ts --model gemini-4-hydrogen --model gemini-3.8-flash
GEMINI_API_KEY=… npx tsx scripts/qa/evalAssistant.ts --only crea-propuesta,deshaz-eso --timeout 120 --json
```

Salida: 0 todas las aserciones se cumplen; 1 alguna no; 2 argumento inválido o falta la clave; 3 alguna petición no se pudo evaluar (clave inválida, cuota, red o plazo: no es un fallo del asistente). Un modelo da resultados distintos cada vez: repetir antes de concluir y mirar la respuesta de las que fallan. Pegar el resumen en el PR.

## 9. Recuento de propuestas que pasarían a «Incompleta»

Decisión abierta del [ADR 0009](adr/0009-fabrica-unica-dimensionado-y-propuesta-incompleta.md): antes de publicar hay que saber cuántas propuestas guardadas pasan a «Incompleta» con las reglas de F2b y por qué. `scripts/qa/countIncompleteProposals.ts` es de **solo lectura** (no escribe, no abre la app, no usa la red). Archivo de entrada: el respaldo de Ajustes → «Respaldo & Exportación» → «Descargar Respaldo JSON» o el estado guardado local (clave `solarsim-pro-storage`; trae también los ajustes).

```bash
npx tsx scripts/qa/countIncompleteProposals.ts respaldo.json --margin 28
npx tsx scripts/qa/countIncompleteProposals.ts equipo-a.json equipo-b.json --detail
```

Cuenta incompletas por motivo, desglosa el precio de equipo (un 0 heredado sin procedencia frente a un equipo sin precio, y cuántos ceros se guardaron antes del 2026-11-21), las que se arreglarían relajando solo la regla del 0 heredado, el inversor con cantidad 0, la decisión comercial y cuántas instalaciones conservan el margen de 28 % (un archivo por instalación; el respaldo de proyectos no lleva los ajustes: lee el valor en Ajustes → Costos y margen y pásalo con `--margin`). El informe agregado no imprime nombres de clientes; `--detail` lista el código de cada propuesta incompleta.

## 10. Electron: qué mirar

El instalador se prueba con el flujo de [MAINTENANCE_AND_UPDATES.md](MAINTENANCE_AND_UPDATES.md); además de `npm run electron:dev`:

- **Ventana mínima 1024×700 y pantalla dividida:** el panel flota, no tapa el compositor ni los botones del dock, y se puede arrastrar y cerrar.
- **Red:** las llamadas a Gemini salen de la ventana (no del proceso principal). Con la clave correcta y red, responde; detrás de un proxy o cortafuegos que bloquee `generativelanguage.googleapis.com`, el mensaje es el de red, no un panel colgado.
- **Clave:** se guarda en el perfil local de la ventana (no se sincroniza). Cerrar y abrir la aplicación la conserva; «Nueva conversación» no la borra. Ninguna petición ni mensaje de error la muestra.
- **Entradas y modales:** las tres entradas con la papelera y Ajustes abiertos; el selector de archivos del sistema se abre con «Autocompletar con factura».
- **PDF y vista previa:** exportar con el panel acoplado o flotante abierto no cambia el PDF; en la vista previa la página no se recorta.
- **Cerrar la ventana con un turno en curso** y volver a abrir: sin errores en la consola, sin propuestas a medias (el turno entra al historial solo cerrado).
- **Consola de desarrollo (`electron:dev`):** sin errores rojos al abrir el panel, enviar, detener y cambiar de vista. El gancho de QA `solarsimFeedbackQA` (solo en desarrollo) permite probar el resaltado del dock sin el modelo ([QA.md](QA.md#feedback-en-vivo-del-asistente-f5a)).
- **Actualización:** desde la versión anterior con propuestas guardadas, el asistente aparece encendido una vez (quien lo apague después se queda apagado) y las propuestas incompletas se ven como «Incompleta» en el listado.
