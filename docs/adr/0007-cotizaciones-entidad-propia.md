# ADR 0007: Cotizaciones como entidad propia con dominio puro compartido

Estado: aceptado (2026-11-26). Términos en el [glosario](../../GLOSSARY.md). Contrato vigente en [QUOTATIONS.md](../QUOTATIONS.md).

## Contexto

SolarSim necesita emitir **cotizaciones**: un documento comercial simple (líneas, descuentos, ITBIS y total) que hoy se arma a mano fuera de la aplicación. No es una factura fiscal (no lleva NCF) y no es una propuesta.

- La propuesta (`ProjectSimulation`) modela un sistema solar: equipos con cantidad, tarifas, consumo, motor financiero, Ley 57-07 y retorno. Sus precios son agregados (precio de contrato, margen, instalación): **no hay precio unitario por equipo**. Su ciclo de vida (versiones, papelera, enlace publicado, seguimiento comercial) es el de un proyecto.
- Una cotización tiene líneas libres con precio unitario, descuentos por línea y globales, ITBIS por línea, numeración correlativa y estados propios (emitida, aceptada, rechazada, anulada). Se emite sin simulación y también desde una propuesta.
- El mismo cálculo lo necesitan la interfaz (React/Zustand), la API (Hono, que importa `shared/` en compilación NodeNext) y el PDF. Un total que difiera entre ellos es un defecto comercial.

## Decisión

1. **Entidad propia.** `Quotation` es un registro independiente de la propuesta. Referencia opcionalmente a una propuesta (`sourceProjectId`), a un cliente (`clientId`) y a una carpeta (`folderId`), igual que el enlace de clientes ([CLIENTS.md](../CLIENTS.md)): los datos impresos viven en la cotización y no se reescriben al cambiar el registro enlazado.
2. **Dominio puro en `shared/quotations/`.** Tipos, dinero, totales, estados, numeración, validación y conversión desde propuesta son TypeScript puro: sin `src/`, `server/`, `electron/`, Node ni terceros; imports relativos con extensión `.js`. Fechas e ids entran como argumentos (`today`, `newId`): `shared/` no lee relojes ni genera ids. Lo guarda `testQuotationSharedPurity`.
3. **Importes en centavos enteros.** Ninguna suma de decimales en coma flotante; el redondeo es half-up y se hace en aritmética entera (`shared/quotations/money.ts`). La tasa de cambio es DOP por 1 USD.
4. **ITBIS sobre la base gravada del documento.** Los descuentos globales se prorratean entre las líneas por el método del mayor resto (la suma asignada es exacta) y el ITBIS se calcula una sola vez sobre la base gravada ya descontada, no línea a línea. La tasa sale de `ITBIS_RATE` (`shared/financialRules.ts`), la única regla de ITBIS.
5. **«Vencida» es un estado derivado.** No se guarda: es una emitida cuya vigencia es anterior a hoy (`effectiveQuotationStatus`). Así no hay tareas que cambien estados ni estados desfasados.
6. **El número lo asigna la API.** `number` es `null` hasta que el servidor lo asigna (`COT-AAAA-NNNN`, secuencia por organización y año de la fecha de emisión); este ADR solo fija el formato y su lectura estricta. La asignación llega con la API en una fase posterior.
7. **La conversión desde propuesta recibe datos ya calculados.** Como la propuesta no tiene precio unitario por equipo, `quotationFromProposal` recibe una estructura armada por quien llama (líneas con precio, filas descriptivas sin precio, descuentos, anexos) y solo la ordena y la normaliza. Armarla corresponde al código de `src/`, donde vive el motor.
8. **Validación en el borde.** `validateQuotationContent` (patrón de `validateClientInput`) normaliza y rechaza con mensajes en español; descarta claves desconocidas. La API y el cliente usan la misma función.

## Alternativas descartadas

- **Reutilizar `ProjectSimulation`.** Obligaría a inventar precios unitarios por equipo que el motor no tiene, a cargar una cotización con energía, tarifas y financiamiento que no usa, y a atar su numeración, estados y papelera a los de una propuesta.
- **Incrustar un sistema externo (Odoo, Invoice Ninja, InvoiceShelf).** Otro stack (Python/PHP) o licencia AGPL, otra base de datos y otro modelo de usuarios y permisos que duplicar; el catálogo, los clientes, las plantillas de PDF y los anexos de SolarSim quedarían fuera. El alcance (cotización simple, sin facturación fiscal) no justifica esa operación.

## Consecuencias

- Cliente, API y PDF comparten una sola implementación de totales, estados, numeración y validación; las pruebas de `src/tests/testQuotation*.ts` fijan el contrato.
- Esta fase no añade API, migraciones, almacén ni interfaz: son fases siguientes y deberán consumir `shared/quotations` sin reimplementar sus reglas.
- Los importes ya guardados no cambian si se ajusta una regla de presentación; sí cambiarían si se tocara el algoritmo de totales (cambio de contrato, requiere nuevo ADR).
- Si la tasa de ITBIS cambia, solo cambia `ITBIS_RATE`.
