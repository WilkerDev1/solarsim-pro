# SolarSim Pro 2.7.4

Ítems extra que se cobran sin aparecer en la factura, fechas de creación y de actualización por separado, y aviso visible de actualización. La API incluye la migración 7. `MIN_CLIENT_VERSION` sigue en 2.7.1.

## Ítems extra ocultos en la factura (#112)

- Cada ítem extra del simulador tiene un nuevo interruptor, «Oculto en factura». Sirve, por ejemplo, para una comisión.
- Un ítem oculto se sigue cobrando: el subtotal, el ITBIS, el margen, los descuentos, la Ley 57-07, el total y el precio por watt no cambian.
- Lo único que cambia es que el ítem no aparece como fila en «Equipos y materiales», ni en el PDF ni en el visor web compartido.
- La revisión comercial de la IA y la matriz de costos interna siguen mostrando el ítem, con la marca de oculto.
- Si la IA o el agente reescriben la lista de ítems, el ítem sigue oculto. Esto vale también cuando la IA omite el id, siempre que la descripción coincida con un solo ítem.

## Fecha de creación y de última actualización (#113)

- Las propuestas muestran «Creada» y «Actualizada» por separado en el resumen, las tarjetas, la lista de documentos y la ficha del cliente. Antes, una propuesta de hace semanas editada hoy parecía de hoy.
- La app y la API usan la misma regla para decidir si una fecha es válida. Una fecha imposible, por ejemplo 30 de febrero, no se muestra ni se guarda. Una fecha sin hora conserva su día.
- La API guarda la fecha en que se creó la propuesta, también si se creó sin conexión y se sincronizó días después. Una fecha futura se ajusta a la hora del servidor. Una copia (fork) toma la hora en que se hace. Editar la propuesta nunca cambia su fecha de creación.
- La migración 7 corrige las propuestas que se crearon sin conexión antes de esta versión. Si la propuesta se editó después de sincronizarse por primera vez, su fecha original ya no existe y la propuesta conserva la de esa primera sincronización.

## Aviso de actualización (#111)

- El dashboard muestra un aviso visible cuando hay una actualización disponible.
- Si una descarga falla o una búsqueda llega mientras otra está en curso, el estado del actualizador ya no se queda bloqueado.

## Compatibilidad

- `MIN_CLIENT_VERSION` sigue en 2.7.1.
- Un cliente 2.7.3 sincroniza sin problemas, pero en su PDF los ítems ocultos aparecen como visibles. Conviene actualizar todos los equipos.
- La migración 7 solo cambia `created_at`, y solo en las filas que corrige. A esas mismas filas les actualiza `updated_at` para que lleguen a los equipos ya sincronizados. `version` no cambia, así que no hay conflictos.

## Despliegue

1. Checkpoint de producción y ensayo de restauración con la imagen candidata. Migraciones esperadas: `[1,2,3,4,5,6,7]`, con los mismos conteos.
2. Worker 2.7.4 (visor): oculta los ítems marcados.
3. API 2.7.4 con la migración 7.
4. Publicar el cliente 2.7.4 firmado.

## Distribución

- Windows x64: instalador y portable.
- Linux x64: AppImage, Debian, pacman y tar.gz.
- Los paquetes Linux y los manifiestos de actualización se firman con la clave GPG fijada de SolarSim.
- Windows no tiene firma Authenticode.
- macOS y ARM no forman parte de esta publicación.
