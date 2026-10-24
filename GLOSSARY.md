# Glosario

Vocabulario del dominio de equipos. Una definición por término; el detalle vive en el [ADR 0001](docs/adr/0001-equipment-model-sin-espejo.md).

- **Grupo de equipos**: un modelo de panel, inversor o batería con su cantidad, potencia o capacidad y precio. Una propuesta tiene una lista de grupos por tipo (`panels`, `inverters`, `batteries`); los grupos son la fuente de verdad.
- **Espejo heredado**: los campos sueltos de un solo modelo (`panelBrandModel`, `panelCount`, `inverterPowerKW`, `batteryDOD`…) que hasta 2.7.0 se escribían como copia del primer grupo. Ya no se persiste.
- **Modelo principal**: el grupo con mayor cantidad × potencia (paneles e inversores) o cantidad × capacidad (baterías); con empate, el primero. Es el que nombran las frases y los resúmenes («Modelo X y 2 modelos más»).
- **EquipmentModel**: el módulo `shared/equipment/` que es el único dueño de los grupos y del espejo heredado: lee, edita, totaliza, describe y migra.
- **Datos heredados**: propuestas guardadas con el espejo y sin grupos (clientes 2.6.0, enlaces publicados en Worker KV, archivos `.json` importados). Solo se leen dentro del módulo (y en la rehidratación y la importación), derivando los grupos; el tipo `SystemSpecs` ya no los declara y los tipa `LegacyProjectSpecs`.
