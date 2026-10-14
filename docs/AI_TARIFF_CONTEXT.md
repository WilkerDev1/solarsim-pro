# Tarifas en el flujo IA

## Fuentes y vigencia

La matriz local (`src/data/rdTariffs.ts`) es una referencia histórica del producto; la configuración de cada espacio organizacional puede reemplazarla. Una fecha de inicio no prueba que el pliego siga vigente. La [resolución SIE-176-2025-TF](https://sie.gob.do/wp-content/uploads/2025/12/176.pdf) declara el trimestre enero-marzo de 2026. Por eso el contexto IA advierte después del 31 de marzo para esas filas de las EDEs. No se han sustituido sus importes ni se ha certificado vigencia para octubre.

La [página oficial de CEPM](https://cepm.com.do/tarifa-electrica/) consultada el 7 de octubre de 2026 publica RBT-1 de RD$22.90/kWh y RBT-2/ESTRBT-2 de RD$14.1278/kWh, con potencia de RD$2,342.83/kW. Esa página no acredita todos los cargos fijos ni RMT-1 que contiene el catálogo histórico. Tampoco permite atribuirles la resolución SIE de las EDEs. El usuario debe contrastar las filas/cargos restantes con su factura o documento aplicable; esta revisión no inventa una actualización regulatoria.

## Propuestas y extracción

`buildAITariffContext(matrix, now?)` entrega únicamente códigos, monedas, cargos, bloques y fuente, ordenados; omite descripciones extensas y aliases duplicados. `resolveAITariffSelection` acepta una fila disponible o devuelve `null`: una distribuidora o código desconocido no se convierte silenciosamente en BTS2. Los aliases CEPM históricos se resuelven explícitamente.

La IA extrae la distribuidora y el código desde los datos. Las tasas documentadas de factura y las tasas de referencia se distinguen durante la revisión. El total de factura incluye cargos distintos de energía: dividirlo por consumo no demuestra el precio de energía. El motor existente calcula el promedio por bloques y convierte DOP a USD usando la tasa del proyecto. Se corrigió la anchura continua de bloques impresos inclusivos (por ejemplo, 0–100 y 101–200) y la resolución de aliases CEPM sobre la fila canónica actual; no se añadió ahorro automático sobre cargo fijo o potencia.

Las propuestas conservan sus importes escalares; cambiar el pliego no reescribe propuestas existentes. La matriz global es una ayuda de referencia para crear/revisar la propuesta, no un reemplazo de los datos históricos del documento.

El escáner de resoluciones usa un borrador **parcial**. Exige resolución, fecha válida, emisor, moneda y cargos de energía/fijo explícitos. Rechaza números negativos/no finitos, porcentajes fuera de rango y bloques con huecos/superposición o sin último tramo abierto. Solo se actualizan las filas presentes, sobre la matriz actual del usuario. Las demás retienen su fuente individual `UtilityTariffDetails.source`. En una fila actualizada parcialmente, demanda, bloques y cargos omitidos permanecen con su procedencia anterior en `source.fieldSources`; los campos leídos reciben la procedencia nueva. Esa distinción se conserva tras JSON y extracciones posteriores. Para una fila extraída, `source.fields` indica los campos efectivamente documentados; una retención omitida conserva la política configurada, no se atribuye al nuevo pliego como un dato extraído. Cargos opcionales ausentes no se inventan ni se copian de otra moneda.

El modal requiere contraste explícito con el documento antes de aplicar. Cambiar archivo/cerrar/cambiar sesión cancela o descarta la extracción anterior; aplicar un borrador sobre un pliego local modificado exige volver a escanear. Sincronización usa el transporte de sesión ya existente y descarta respuestas de otra generación/organización; una descarga no pisa modificaciones locales que ocurrieron durante la solicitud.

## Transporte y persistencia

El escáner comparte `shared/geminiTransport.ts`: clave por `x-goog-api-key`, identificador de modelo validado, timeout/AbortSignal y como máximo dos intentos solo ante errores transitorios; no encadena peticiones con 401/403/429. Modelos y deprecaciones se contrastan con [Google](https://ai.google.dev/gemini-api/docs/deprecations/); se retiró la cascada antigua 1.5/2.0 de este servicio.

JSON transforma `Infinity` en `null`; `normalizeStoredTariffMatrix` restaura exclusivamente el bloque final sin límite con validación. Hidratación y descarga usan ese adaptador para conservar cálculos de consumos superiores a 700 kWh. Una matriz local inválida se conserva con aviso para revisión, sin borrar silenciosamente personalizaciones. El cero explícito se respeta al resolver la tasa de referencia. Las etiquetas de tarifas no incluyen precios estáticos que contradigan una matriz actualizada.

## Verificación

`src/tests/testAITariffSafety.ts` cubre extracción parcial, procedencia de filas conservadas, moneda/fecha/bloques inválidos, retención y tasas cero, contexto determinista sin duplicados, round-trip real serialización/hidratación con 2,000 kWh, key fuera de URL, rechazo sin cascada de credenciales inválidas, parse de respuesta Gemini, descarga contra edición concurrente y descarte por cambio de sesión. Todo usa datos sintéticos y red simulada; no escribe en producción ni consume llamadas Gemini.

Queda como límite del backend actual el reemplazo de la matriz por organización mediante `/api/tariffs/sync`: no tiene control CAS de esa matriz. La validación y preservación del cliente no equivalen a control concurrente entre administradores distintos. La revisión de contrato/migración del backend debe ser una entrega coordinada con todos los clientes antes de volverlo obligatorio.
