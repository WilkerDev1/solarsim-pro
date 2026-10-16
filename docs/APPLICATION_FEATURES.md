# Funciones y modos de simulación

La categoría Ajustes → Funciones de la aplicación contiene inicialmente **Proyección de autoconsumo**, experimental, disponible y desactivada por defecto. El registro distingue `stable/beta/experimental`, disponibilidad y visibilidad al desactivarse (`hidden/labelled`). No son banderas intercambiables.

## Cálculo clásico predeterminado

Sea G la producción y C el consumo mensual. Sin batería, autoconsumo=min(C, 0.75G); con batería=min(C, 0.90G). La contribución BESS desglosada es cero: ese modelo histórico no simula despacho horario. El excedente es max(0,G-autoconsumo), o cero en inyección cero. Solo al excedente exportado se aplica la retención configurada. Ahorro energético=autoconsumo+excedente acreditado; ahorro monetario usa la tarifa del proyecto.

Los parámetros de perfil diurno guardados se conservan pero no alteran cálculos clásicos. No se muestran controles de perfil, partición, distribución BESS ni el selector de desglose. La tabla clásica tiene cinco columnas y la gráfica consumo/producción. El consumo mensual explícito de cero se respeta.

## Proyección experimental

Al activar la función, se usa el modelo físico documentado en ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md: carga diurna, solar directo, excedente, carga y descarga diaria de batería, importación/exportación. El ahorro anual alimenta el mismo flujo financiero, VAN, TIR y payback. La opción visual por proyecto puede ocultar el desglose sin cambiar ese modelo físico.

Simulador, hub y PDF usan el selector `useEnergyCalculationMode`; los motores aceptan un argumento explícito y usan legacy si se omite. Las nuevas publicaciones capturan modo, fecha y versión de política en `calculationSnapshot`; el Worker confirma la política con el backend antes de publicar. Un enlace ya publicado conserva su snapshot; cambiar Ajustes no reescribe KV. Enlaces anteriores sin metadatos mantienen su presentación clásica histórica.

## Política y persistencia

Sin cuenta, la elección es local y persistente. Con cuenta, prevalece la política de su organización y servidor. ADMIN guarda mediante PATCH con baseVersion; EDITOR/VIEWER/LECTOR consultan y aplican sin modificar. Sin conexión se conserva la última política confirmada de ese ámbito; no se presentan cambios locales como confirmados. Si no existe política o el servidor es antiguo se usa legacy y se informa la limitación.

Las respuestas de una sesión anterior se descartan aunque se vuelva a iniciar sesión con la misma cuenta. Cambiar de servidor u organización no reutiliza políticas ajenas. La preferencia local sigue disponible al cerrar sesión.

## Explorador y Ajustes

Tarjetas y lista compacta comparten búsqueda, filtros, acciones y arrastre. La preferencia de visualización se persiste. Ajustes muestra una categoría con navegación agrupada y conserva los formularios visitados mientras permanece abierto; Escape vuelve al espacio de trabajo. Verde identifica selección/acción principal; los avisos usan colores de estado.

## Plantillas de propuesta por empresa

El modo edición PDF permite guardar una plantilla local por empresa emisora (`companyProfileId`), dentro del espacio aislado de cada organización. La creación manual y desde factura IA usan esa plantilla después del snapshot del perfil: dirección/pie, teléfono, enlaces y logos guardados no son sobrescritos por los datos del perfil al crear otro documento. Cambios posteriores de perfil o plantilla no reescriben propuestas existentes.

Los datos particulares del cliente, fecha de emisión y anexos/entradas extra de índice no pasan a la plantilla. Portada, cabecera y editor resuelven el mismo logo independientemente del nombre escrito; un logo explícito tiene prioridad y un valor vacío indica ausencia. Si la empresa de una propuesta antigua resulta ambigua o fue eliminada, se rechaza guardar/restablecer su plantilla en otra empresa. La plantilla se conserva al recargar y cambiar de organización; no se publica ni sincroniza como perfil compartido. Los JSON de exportación de propuestas conservan sus snapshots, pero no son un respaldo de estas preferencias locales.

## Asistente IA y catálogo

El asistente admite texto y hasta cuatro archivos (8 MB por archivo) en una entrada conversacional. Produce un borrador editable que permite varios modelos de panel, inversor y batería; la revisión y confirmación del usuario son necesarias antes de crear o actualizar. IDs, cantidades, tarifas y supuestos se validan contra el contexto actual de la app. No se sustituyen equipos solicitados ni se transforma un inversor de 16 kW en dos de 8 kW automáticamente. Una cobertura objetivo del 95% no expresa precisión del asistente.

Datasheets permite actualizar nombre, modelo y especificaciones manteniendo ID/ofertas y valores no extraídos. Los importadores validan lotes y comprueban el efecto de escrituras antes de indicar éxito. Precios DOP se convierten localmente; coincidencias inferidas se revisan antes de aplicar. Las tarifas distinguen datos documentados de referencias históricas y conservan fuente por campo. El pliego base requiere confirmar vigencia y su sincronización todavía carece de CAS multiadministrador.

Guardar variantes de una ficha funciona con la API empresarial apagada: primero persiste modelos y cambios pendientes, luego intenta adjuntar el documento. Un error de subida distingue el guardado local exitoso del adjunto pendiente y permite reintentar solo ese archivo mientras el modal permanece abierto. Cambiar de sesión, borrar un modelo o reemplazar su adjunto invalida ese reintento.

El borrador es transitorio y se invalida al cambiar espacio o sesión. Las preferencias de clave Gemini se guardan localmente sin promesa de cifrado; los adjuntos se envían a Google para analizarlos. [Subsistema IA](AI_SCANNERS_SPECIFICATION.md) detalla comportamiento, pruebas y límites; [Tarifas IA](AI_TARIFF_CONTEXT.md) documenta las fuentes.

El borrador IA incorpora gráfica mensual y tabla editable, meta de generación y cálculo aplicable por grupo sin alterar otros modelos. La pestaña Cotización admite mano de obra, recargo o margen sobre venta, extras y descuentos con resumen del motor financiero. Equipos permite cambiar modelos, cantidades y costos particulares sin editar ofertas del inventario. Chat puede preparar esas mismas condiciones; cualquier edición requiere confirmar nuevamente antes de aplicar. MAX_TOKENS dispone de una sola recuperación acotada; no se aplican respuestas truncadas.

El asistente ocupa la ventana completa, con conversación oscura independiente del tema y revisión por pestañas. Las consultas pueden responderse sin modificar el borrador. Memoria de conversación/borrador conserva cerrar/reabrir en el mismo espacio; se limpia al aplicar, reiniciar o cambiar contexto/destino. Cotización permite editar renglones USD de equipos, distingue compra/venta y concilia totales informativos de cualquier documento. El consumo teórico igual a producción es explícito y temporal, con procedencia visible y sin dimensionamiento circular. No altera fórmulas, política legacy ni documentos ya publicados.

El asistente general flotante es una función experimental local y apagada por defecto en Funciones de la aplicación; sus permisos siguen siendo los de la cuenta. Está disponible en Inicio, Hub y Simulador, con consultas al espacio cargado y cambios confirmados antes de recalcular. No forma parte de la política energética de organización. [Contrato y límites](APP_ASSISTANT.md).

### BESS y fichas técnicas en propuestas (2026-10-14)

Activar almacenamiento confirma al menos una unidad real; conserva cantidades positivas previas. La cantidad del editor refleja el estado usado por el motor. Aplicar ofertas actualiza también el grupo principal de equipos cuando hay múltiples modelos. Cambiar ofertas invalida los totales financieros manuales antiguos fuera del benchmark, igual que editar parámetros. El cálculo financiero y la diferencia entre recargo sobre costo y margen sobre venta conservan sus contratos.

El importador permite elegir si vincular el documento escaneado a los equipos creados/actualizados. Guardar el catálogo sigue siendo local primero; vincular requiere cuenta y conexión, con reintento del adjunto independiente. En anexos PDF se detectan coincidencias exactas del catálogo entre equipos activos, se deduplican documentos y se ofrece adjuntarlos. Las fichas de imagen no se añaden como PDF. Un segundo dispositivo puede recuperar el binario sin duplicar la metadata. Cambiar de propuesta o sesión durante una descarga impide aplicar su resultado.

### Resumen y seguimiento comercial (2026-10-15)

Resumen, Simulador y Propuesta PDF comparten navegación sobre la propuesta activa. El estado comercial (en espera, aprobada, rechazada o de prueba) es independiente del estado documental y de la sincronización. Se modifica directamente en tarjetas/lista; el resumen y su sección Finanzas permiten guardar responsable y nota interna. Inicio filtra por decisión y compara propuestas aprobadas por responsable, excluyendo pruebas y papelera. Los importes son cotizaciones actuales, no ingresos cobrados. [Contrato de seguimiento y compatibilidad API](PROPOSAL_COMMERCIAL_TRACKING.md).

### Ofertas, logotipos y propuestas relacionadas (2026-10-15)

Ofertas de un equipo usa un diálogo con lista o formulario, sin superponer un aviso vacío al editor. Permite seleccionar un proveedor existente, registrar precio USD, disponibilidad, SKU y notas; comprueba cambios concurrentes y muestra el resultado local del guardado. Los controles respetan permisos y conflictos.

El dock PDF separa logotipo de encabezado PDF y web. El primero puede ser blanco sobre fondo oscuro; el segundo a color sobre fondo blanco. Tienen carga/restauración independientes y pasan a la plantilla y snapshot del documento. Publicaciones nuevas nunca toman el logo del encabezado PDF como respaldo web: usan el web específico, el de portada o el predeterminado a color. Los enlaces ya publicados conservan su snapshot. La API/Worker de esta revisión debe desplegarse antes de usar todas las protecciones nuevas.

Inicio conserva familias de propuestas independientes con línea de color y sangría; clic derecho/Shift+F10 abre su organización. Enlazar por arrastre requiere mantener y soltar sobre la propuesta destino. El seguimiento conserva un estado actual y múltiples reportes históricos fechados; el más reciente queda abierto y los anteriores se expanden por separado. No se añadieron métricas ni filtros históricos futuros. [Contrato](PROPOSAL_COMMERCIAL_TRACKING.md).
