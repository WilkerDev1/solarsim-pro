# SolarSim Pro 2.9.2

Mejora del asistente flotante. Las preguntas que implican buscar («¿cuál fue la última propuesta?», «muéstrame los paneles», «¿qué equipos no tienen precio?») ya no llenan el chat de tarjetas. Además, el asistente encuentra la propuesta correcta cuando se le pregunta por la más reciente. La API solo cambia de número de versión: no hay migración nueva y la versión mínima del cliente sigue en 2.9.0.

## Asistente flotante

- **La última propuesta es la última.** La búsqueda de propuestas devolvía los resultados en el orden en que estaban guardados y sin fechas, así que el asistente podía responder con una propuesta antigua. Ahora los ordena de la modificada más recientemente a la más antigua, igual que el servidor, e incluye las fechas de creación y de modificación.
- **Solo las tarjetas que importan.** Antes, cada resultado de una búsqueda se convertía en una tarjeta grande «Abrir propuesta», hasta 12 por respuesta. Ahora una propuesta o un equipo sale como tarjeta solo cuando la respuesta lo nombra: por el código exacto en las propuestas (SP-2026-105 no se confunde con SP-2026-105-V3) y por el modelo en los equipos. Si se nombra una copia o una variante («… (Copia)», «… EU»), sale esa y no la original.
- **Listados compactos para resultados largos.** «Muéstrame mis propuestas» o «los equipos» muestran una lista con una fila por elemento: «Abrir» abre la propuesta y «Ver» despliega la tarjeta del equipo, con su ficha técnica y el acceso al inventario. Se ven seis filas y luego «Ver N más». Cuando la respuesta se centra en una a tres filas, esas salen como tarjetas y el resto queda plegado en «Ver los N resultados de la búsqueda».
- **Equipos sin precio y por tipo.** La auditoría del inventario puede limitarse a un tipo de hallazgo. «¿Qué equipos no tienen precio?» muestra solo esos y la tarjeta indica el filtro. Hasta 60 hallazgos. La búsqueda de equipos también se puede limitar a paneles, inversores o baterías.
- En la auditoría, el botón de cada fila pasa a llamarse «Inventario», para que el texto de la fila tenga más espacio.

## Agentes externos (MCP)

- `search_projects` documenta su orden (de la modificada más recientemente a la más antigua). `search_equipment` acepta `type` (`panel`, `inverter`, `battery`) y `audit_catalog` acepta `codes`, tanto en el MCP local como en el remoto.

## Despliegue

- **API:** solo cambia el número de versión. Sin migración. La variable de entorno `MIN_CLIENT_VERSION` del despliegue no cambia y sigue en 2.9.0.
- **Visor web (Worker):** solo cambia el número de versión.
- **MCP remoto:** acepta el filtro `type` en `search_equipment` y actualiza la descripción de `search_projects`. Redesplegarlo es opcional: sin hacerlo, ese filtro no está disponible por esa vía.
- **Cliente:** publicar el instalador 2.9.2 con el flujo habitual.
