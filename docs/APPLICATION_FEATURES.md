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

El borrador es transitorio y se invalida al cambiar espacio o sesión. Las preferencias de clave Gemini se guardan localmente sin promesa de cifrado; los adjuntos se envían a Google para analizarlos. [Subsistema IA](AI_SCANNERS_SPECIFICATION.md) detalla comportamiento, pruebas y límites; [Tarifas IA](AI_TARIFF_CONTEXT.md) documenta las fuentes.
