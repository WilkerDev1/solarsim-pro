# Documentación de SolarSim Pro

Documentos canónicos y vigentes. No se mantienen documentos fechados: el historial vive en Git, en los PR y en `release/release-notes-vX.Y.Z.md`. Para contribuir, empezar por [AGENTS.md](../AGENTS.md).

## Arquitectura y contratos

- [Arquitectura modular](ARCHITECTURE.md): límites, dependencias permitidas y puntos de entrada.
- [Decisiones de arquitectura (ADR)](adr/0001-equipment-model-sin-espejo.md): EquipmentModel sin espejo heredado; [banco de baterías](adr/0002-banco-de-baterias.md): un solo módulo para energía útil y autonomía; [supuestos resueltos](adr/0003-supuestos-resueltos.md): un solo módulo para los supuestos efectivos de la propuesta; [edición de proyecto](adr/0004-edicion-de-proyecto.md): un solo módulo puro para aplicar una edición, y mirar nunca escribe. Vocabulario en el [glosario](../GLOSSARY.md).
- [Funciones y modos de cálculo](APPLICATION_FEATURES.md): legacy predeterminado, proyección experimental, política de organización y compatibilidad.
- [Motor financiero](FINANCIAL_ENGINE_SPECIFICATION.md): matriz de costos, Ley 57-07, flujo de caja e indicadores.
- [Balance energético físico](ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md): autoconsumo y despacho BESS del modelo opcional.
- [API y base de datos](DATABASE_AND_API_SPECIFICATION.md): autenticación, versiones, sincronización y migraciones.
- [Recursos compartidos](SHARED_RESOURCES.md): carpetas, registro de propuestas web, ofertas y adjuntos.
- [Catálogo de equipos](EQUIPMENT_CATALOG.md): modelos, ofertas de proveedores, fichas, vistas previas y anexos automáticos.
- [Centro empresarial](COMPANY_CENTER.md): organizaciones, equipos, membretes y aislamiento.
- [Editor del documento de propuesta](PROPOSAL_DOCUMENT_EDITOR.md): textos editables en la hoja, registro de textos, plantillas, diseño y propuesta web.
- [Seguimiento comercial](PROPOSAL_COMMERCIAL_TRACKING.md): decisiones del cliente, responsables y reportes.
- [Directorio de clientes](CLIENTS.md): clientes por organización, enlace opcional con propuestas y resumen de estados.
- [Subsistema IA](AI_SCANNERS_SPECIFICATION.md) y [tarifas en el flujo IA](AI_TARIFF_CONTEXT.md).
- [Agentes y herramientas de IA](AGENT_TOOLS.md): registro común, permisos, actividad y deshacer, precios automáticos.
- [Servidor MCP local](MCP_LOCAL.md): conexión de Claude Code y Codex, token, guardas y modelo de amenazas.
- [Visor de propuestas (Worker)](../workers/share-viewer/README.md).
- Reglas de exportación PDF: [.agents/rules/html2canvas_pdf_export_rules.md](../.agents/rules/html2canvas_pdf_export_rules.md).

## Operaciones

- [Verificación y QA](QA.md): pruebas automatizadas, ensayos de staging y matriz manual.
- [Mantenimiento y releases](MAINTENANCE_AND_UPDATES.md): ramas, gates, publicación firmada y actualizaciones.
- [Infraestructura y despliegue](INFRASTRUCTURE_ARCHITECTURE.md): topología, despliegue protegido de la API, rollback, recuperación de respaldos y rotación de secretos.

## Producto y diseño

- [PRODUCT.md](../PRODUCT.md): contexto de producto y criterios de calidad de interfaz.
- [DESIGN.md](../DESIGN.md): sistema de diseño.
