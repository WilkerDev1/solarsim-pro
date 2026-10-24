# ADR 0004: Edición de proyecto en un solo módulo

Estado: aceptado. Términos en el [glosario](../../GLOSSARY.md). Continúa los ADR [0001](0001-equipment-model-sin-espejo.md), [0002](0002-banco-de-baterias.md) y [0003](0003-supuestos-resueltos.md).

## Contexto

Las reglas para aplicar un cambio a una propuesta estaban repartidas en `projectSlice` y en dos efectos del dock:

- `updateSpecs`, `updateRates`, `updateClient` y los setters de consumo repetían el autodimensionado de paneles (`withRecommendedPanels`) con condiciones distintas; la cobertura se resolvía de tres maneras.
- `updateSpecs` normalizaba equipos y baterías, apagaba el autocálculo con una cantidad manual, soltaba el proveedor del modelo que ya no lo cotiza y limpiaba las sobrescrituras financieras manuales.
- `applySupplierPriceToProject` rodeaba `updateActiveProject`: sin normalización, sin autodimensionado y sin entrada de deshacer, de modo que un precio aplicado con autocálculo activo dejaba la cantidad de paneles desfasada y no se podía deshacer.
- `useCatalogPowerSync` y `useSupplierCleanup` escribían en el proyecto desde un `useEffect` al montar el dock: abrir una propuesta con datos desfasados del catálogo la modificaba, la marcaba para sincronizar y dejaba una entrada de deshacer sin que el usuario hiciera nada.
- La IA y la importación armaban las specs por su cuenta.

## Decisión

1. **Un módulo puro.** `src/domain/projectEdit.ts` expone `applyProjectEdit(proyecto, edición, { equipmentCatalog })` y devuelve el proyecto editado. Sin Zustand, sin temporizadores y sin reloj. La edición es una unión discriminada: `specs`, `rates`, `client`, `consumption` (con `lockAutoPanels`), `financials` y `supplierPrice`.
2. **Todas las reglas viven ahí:** normalización de equipos y de baterías habilitadas, autodimensionado (una sola función; la cobertura sale de `resolveAssumption`), cantidad manual del grupo principal que apaga el autocálculo, proveedor soltado al cambiar de modelo, sobrescrituras financieras (solo sobreviven en `benchmark-centro-medico`) y la reconciliación con el catálogo (punto 4).
3. **Las porciones son adaptadores.** `updateSpecs`, `updateRates`, `updateClient`, los setters de consumo, `updateFinancials` y `applySupplierPriceToProject` llaman a `applyProjectEdit` dentro de `updateActiveProject`. El sello de la mutación (`updatedAt`, autor, estado de sincronización), la sincronización, el deshacer y el mensaje «¡Precio aplicado…!» siguen en el store.
4. **Mirar nunca escribe.** Se eliminaron `useCatalogPowerSync` y `useSupplierCleanup`. Sus reglas pasaron a `applyProjectEdit` como reconciliación con el catálogo y corren en la siguiente edición real (cualquier tipo salvo `financials`):
   - el panel o inversor principal que está en el catálogo (por nombre exacto) toma su potencia unitaria;
   - el proveedor del grupo principal que ningún equipo del mismo tipo cotiza (`supplierQuotesItem`: id de oferta o nombre sin mayúsculas ni espacios) se suelta.

   Lo que la propia edición fijó (una potencia escrita a mano, un proveedor elegido) se respeta. Con el catálogo sin cargar (vacío) no se reconcilia nada: el efecto anterior habría soltado todos los proveedores. Con `autoCalculatePanels` activo, el autodimensionado corre después de reconciliar en todo tipo de edición salvo `financials` (que no toca las specs): se recalcula la cantidad si el cambio lo pide (cobertura, provincia, consumo) o si cambió alguna entrada del dimensionamiento (potencia del panel principal, consumo, provincia, HSP propio, cobertura o pérdidas resueltas), por ejemplo la potencia corregida por el catálogo. Una edición de `specs` con autocálculo siempre recalcula.
   Las acciones del documento que reescriben un espejo de `client` (contacto, teléfono y correo, desde `setDocumentTexts`, `updateDocumentCustomization` y `set_document_text`) enrutan esa parte por `applyDocumentClientEdit`, que es una edición `client` más; la personalización y el texto quedan como los calculó el documento. Una edición del documento que no cambia el cliente (garantía, diseño, anexos) no es una edición de specs y no reconcilia. La herramienta de agente incluye `specs` en lo que deshacer restaura cuando la edición las corrigió.
   No cuentan como ediciones y quedan fuera del módulo: restaurar instantáneas (deshacer/rehacer, historial de versiones, `restore: true` de las herramientas de agente, reconciliación con el servidor), construir proyectos (nuevo, duplicado, importación, borrador de IA) y escrituras que no tocan `client`, `specs` ni `rates` (estado, carpeta, enlace de cliente, anexos, diseño).
5. **El precio de proveedor es una edición más.** Pasa por `updateActiveProject`: se normaliza, recalcula la cantidad de paneles si el autocálculo está activo y la potencia del modelo cambió, sincroniza y se puede deshacer.
6. **Entrada de datos de golpe.** La importación de `.json` y el borrador de IA no autodimensionan: la importación normaliza con `normalizeIncomingSpecs` y la IA sobre una propuesta existente usa `normalizeProjectEquipment`, la misma normalización que una edición. `assumptionFields` y `newProjectSpecs` (ADR 0003) no cambian.
7. **Deshacer sin pasos vacíos.** `recordUndoState` descarta una instantánea idéntica a la última, así que reabrir una propuesta no deja entradas de deshacer.
8. **Guarda.** `testNoProjectEditRulesOutsideModule` falla si `withRecommendedPanels` aparece fuera del módulo, si `calculateRecommendedPanelCount` se llama fuera del motor, del módulo y de la tubería del borrador de IA, si un `useEffect` de `src/components/simulator` llama a un escritor del proyecto, o si una porción del store o una herramienta de agente escribe `client`/`specs`/`rates` directamente desde `updateActiveProject`/`updateProjectById` sin pasar por el módulo (salvo `restore: true`). Es una heurística; el comportamiento lo cubre `testProjectEdit`, que corre la misma matriz de escenarios contra el store y contra el módulo.

## Cambios de comportamiento

- Aplicar un precio de proveedor con autocálculo activo recalcula la cantidad de paneles si el modelo cambió de potencia (antes la dejaba desfasada) y se puede deshacer (antes no dejaba entrada).
- Abrir una propuesta ya no corrige la potencia del modelo principal ni suelta proveedores huérfanos: no hay escrituras, sincronización ni entradas de deshacer al mirar. Esas correcciones ocurren en la siguiente edición real.
- Una potencia corregida por el catálogo recalcula la cantidad de paneles (con autocálculo) en cualquier tipo de edición, y un `customMonthlyHSP` nuevo del cliente también recalcula (antes solo la provincia).
- Con el catálogo vacío no se sueltan proveedores huérfanos (antes, al montar el dock sin catálogo cargado, se soltaban).
- Una importación con baterías habilitadas y cantidad no positiva queda con cantidad 1, como cualquier edición.
- Un consumo mensual negativo existente en otros meses se lleva a 0 al editar un mes (antes solo se limitaba el mes editado).

## Consecuencias

- Una regla nueva de edición se escribe una vez, en `projectEdit.ts`, y se prueba sin Zustand.
- Los consumidores que arman parches (dock, asistente) siguen llamando a `updateSpecs`; no cambia su API.
- Fuera de este ADR: impuestos (#5), esquema de campos del catálogo (#3).
