# ADR 0001: EquipmentModel sin espejo heredado

Estado: aceptado. Términos en el [glosario](../../GLOSSARY.md).

## Contexto

Cada propuesta guarda sus equipos dos veces: los grupos (`specs.panels`, `inverters`, `batteries`), que son la fuente, y los campos sueltos de un solo modelo, escritos como espejo del primer grupo por `src/utils/equipmentGroups.ts`. Unos 40 archivos leen el espejo directamente (visor Worker, `projectSlice`, `versionHistorySlice`, `proposalDraftProject`, `documentTextContext`…). Cada lector decide por su cuenta qué hacer con varios modelos, y casi todos acaban describiendo solo el primero.

## Decisión

1. **El espejo deja de persistirse.** Solo se guardan grupos. Los datos viejos se leen derivando los grupos desde los campos heredados únicamente dentro del módulo, y el espejo no se vuelve a escribir.
2. **Migración completa más adelante**: migración 006 en la API y rehidratación local en el cliente, ambas con `migrateLegacySpecs`. La lectura heredada se conserva solo para propuestas publicadas (Worker KV) y archivos `.json` importados.
3. **Versión mínima del cliente en la API**: la API exigirá cliente 426 con `MIN_CLIENT_VERSION=2.7.1` en una oleada posterior. No forma parte de la oleada 1.
4. **Nombrar equipos en textos**: en frases y resúmenes, el modelo principal + «y N modelo(s) más» cuando hay otros; las tablas listan todos los modelos. Nombres de reserva unificados: «Módulos Monocristalinos Tier-1 TOPCon», «Inversor Solar On-Grid / Híbrido», «Banco de Baterías de Litio LiFePO4».
5. **Parámetros de sistema** que no son identidad del equipo (degradación, vida útil…) se quedan donde están. DOD y eficiencia de batería pasan a ser solo por grupo (el motor ya los pondera por grupo).

El módulo `shared/equipment/` (portable: cliente, API y Worker) expone `readEquipment`, `editEquipment`, `equipmentTotals`, `describeEquipment` y `migrateLegacySpecs`. Es el único lugar que lee los campos heredados.

Decisiones de diseño de la oleada 1:

- `editEquipment` migra la propuesta antes de editar, nunca escribe el espejo y lo borra si existía; devuelve las specs completas.
- `migrateLegacySpecs` traslada al primer grupo precio, peso y proveedor que solo tenía el espejo; no hereda DOD ni eficiencia (el motor los ignora cuando hay grupos); con `hasBattery` falso conserva en un grupo los datos de batería para no perderlos al reactivarla.
- `describeEquipment` cuenta modelos distintos por nombre; sin grupos devuelve texto vacío.
- La energía útil del banco queda fuera (candidato #1 del informe de arquitectura): `equipmentTotals` solo da capacidad nominal.

## Consecuencias

- La oleada 1 es aditiva: crea el módulo, hace que `getProject*` y `DEFAULT_UNIT_PRICE_USD` salgan de él y no cambia ningún comportamiento. Las oleadas 2 a 5 migran a los llamadores, luego la persistencia y retiran `editEquipmentGroup`/`normalizeEquipmentEdit`.
- Código nuevo usa `shared/equipment`, no los campos heredados.
- Mientras `SystemSpecs` declare obligatorios algunos campos sueltos, un resultado migrado puede carecer de ellos; se vuelven opcionales y luego se eliminan en las oleadas siguientes.
- Clientes 2.6.0 dejarán de funcionar con datos migrados; por eso la decisión 3.

## Alternativas rechazadas

- **Mantener el espejo en cada escritura**: es el estado actual; duplica la fuente de verdad y obliga a cada lector a elegir qué modelo describir.
- **Migrar a mano caso por caso en cada llamador**: reparte la lógica heredada en 40 sitios y la deja viva para siempre.
- **Migrar solo al hidratar, sin módulo común**: sin un único lector, el Worker y los `.json` importados seguirían con su propia interpretación.
- **Heredar DOD/eficiencia al grupo**: cambiaría resultados del motor, que ya ignora el escalar cuando hay grupos.
- **Imponer ya la versión mínima de la API**: rompería a clientes en uso antes de que la migración exista.
