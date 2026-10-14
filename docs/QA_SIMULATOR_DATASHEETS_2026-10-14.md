# QA del simulador y fichas del catálogo

La fixture `scripts/qa/fixtures/simulatorDatasheets.html` usa una propuesta sintética, servidor deshabilitado y una ficha PDF generada localmente. Ninguna operación toca producción.

Verificado en navegador interno: activar BESS desde cantidad cero muestra y guarda una unidad; costo total cambia de 13252.30 a 15600.50 USD en este caso sintético. Adjuntar QA Panel.pdf deja un único anexo de una página con miniatura, habilitado para fusión. Simular pérdida de bytes locales ofrece Recuperar; volver a descargar conserva exactamente un anexo.

Verificado también en catálogo aislado sin servidor: desmarcar Vincular documento y guardar dos variantes aumenta el catálogo de uno a tres equipos sin error de subida.

Regresiones automatizadas: activar/desactivar conserva bancos existentes; oferta de proveedor actualiza cantidad, precio, capacidad y DoD del grupo e invalida totales manuales antiguos fuera del benchmark; 40% de margen sobre venta difiere de 40% de recargo y cero recargo se conserva. Detección PDF respeta modelos activos, omite baterías deshabilitadas e imágenes, evita coincidencias ambiguas y deduplica fichas compartidas.

Limitación operativa: descargar fichas del servidor exige conectividad y autenticación; una vez descargadas, los bytes del anexo permanecen en IndexedDB para exportación local.
