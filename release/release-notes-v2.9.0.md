# SolarSim Pro 2.9.0

Versión de catálogo y de tarifas. Cada equipo puede tener un **precio genérico**, que no depende del proveedor, y un **historial de precios** que permite ver cómo cambia con el tiempo y con la época del año. Se agregan opciones de liquidación de la SIE-007 y se corrige el precio por kWp de la matriz de costos. La API aplica la migración 010 y `MIN_CLIENT_VERSION` sube a 2.9.0.

## Precio genérico e historial de precios

- **Precio genérico.** Es el precio de referencia de un equipo cuando no hay oferta de proveedor. Se ve en el inventario del catálogo («Genérico US$ X») y en la cabecera del modal de ofertas, donde se puede asignar, cambiar o quitar. También funciona con los equipos de referencia. Quitarlo devuelve el genérico anterior.
- **Al guardar una oferta** con un precio distinto del genérico, el modal de ofertas, la administración de proveedores y el editor del equipo ofrecen en una línea discreta usar ese precio como genérico o cambiarlo. Cambiar solo el stock, el SKU o las notas no pregunta nada.
- **Importación de catálogos de precios con IA:** la tabla de revisión tiene la columna «Actualizar genérico».
- **En una propuesta**, al escribir a mano el precio de un equipo que no tiene genérico, la app pregunta «¿Usar como precio genérico? Usar · No». La pregunta aparece al pulsar Enter o al salir del campo, no en cada tecla. Ese precio queda en el historial con la propuesta, y cada propuesta guarda un solo registro por equipo.
- **Propuestas con equipos sin oferta.** Al elegir un modelo sin oferta de proveedor, la propuesta toma su precio genérico y lo marca «Genérico». Las ofertas siempre tienen prioridad. Cambiar después el genérico no modifica las propuestas existentes. Elegir un modelo sin oferta ni genérico ya no arrastra el precio del modelo anterior.
- **Propuestas automáticas (IA y agentes):** usan la oferta del proveedor y, si no hay, el precio genérico, con el aviso «Precio genérico (sin proveedor)» en la revisión.
- **Historial** dentro del modal de ofertas:
  - gráfico del precio en el tiempo por fuente, con el genérico como escalón;
  - resumen por mes del año (promedio, mínimo, máximo y cantidad) para ver la estacionalidad;
  - variación a 3, 6 y 12 meses;
  - tabla de registros con «Anular».

  El historial empieza vacío con esta versión: no se crean registros a partir de las ofertas existentes.
- **Agentes:** herramienta de lectura `get_price_history`. `get_equipment` y `search_equipment` muestran `genericPriceUSD` aparte de las ofertas, tanto en la app como en el MCP remoto.
- Los registros se guardan en una tabla aparte por organización (migración 010): no generan conflictos de versión en el catálogo y no hacen crecer su descarga. Sin sesión iniciada, la función está apagada. Decisiones de diseño en el ADR 0006.

## Tarifas (SIE-007)

- **Estimado CNE de la liquidación anual:** RD$5/kWh (rango RD$4–6), elegible desde el menú del campo. El valor de fábrica sigue en 0.
- **Liquidación anual del régimen anterior** (opcional, solo en retención con red): el remanente del año se paga al 75 % del primer bloque BTS-1.
- **Rango del cargo fijo**, calculado sobre la energía retirada (de fábrica) o la neta.

## Matriz de costos

- **«Precio kilos costo» en RD$** usaba un factor fijo de ×800. Ahora todas las filas muestran costo y venta por kWp y por W, en RD$ y en USD.
- **Modo Directo $/W:** la ganancia resta el costo de todo lo vendido, sin el ITBIS de los extras no exonerados.
- Una cotización sin paneles ya no muestra un $/W inventado.

## Despliegue

- **API:** migración 010 (`equipment_price_observations`), aditiva. Se aplica primero, con checkpoint y un ensayo de restauración que debe terminar en `[1..10]`. Después de publicar el escritorio y el visor, `MIN_CLIENT_VERSION` sube a 2.9.0: los clientes anteriores ignoran los campos nuevos de tarifas y mostrarían otras cifras. Para volver atrás hay que restaurar el checkpoint en una base nueva; no se debe poner una API anterior a la 010 sobre la base migrada.
- **Visor web (Worker):** solo cambia el número de versión.
- **MCP remoto:** `get_price_history`, el precio genérico en la consulta de equipos y las instrucciones de precios.
- **Cliente:** el instalador 2.9.0 se publica con el flujo habitual.
