# Documentación de SolarSim Pro

Documentos canónicos y vigentes. No se mantienen documentos fechados: el historial vive en Git, en los PR y en `release/release-notes-vX.Y.Z.md`. Para contribuir, empezar por [AGENTS.md](../AGENTS.md).

## Arquitectura y contratos

- [Arquitectura modular](ARCHITECTURE.md): límites, dependencias permitidas y puntos de entrada.
- [Decisiones de arquitectura (ADR)](adr/0001-equipment-model-sin-espejo.md): EquipmentModel sin espejo heredado; [banco de baterías](adr/0002-banco-de-baterias.md): un solo módulo para energía útil y autonomía; [supuestos resueltos](adr/0003-supuestos-resueltos.md): un solo módulo para los supuestos efectivos de la propuesta; [edición de proyecto](adr/0004-edicion-de-proyecto.md): un solo módulo puro para aplicar una edición, y mirar nunca escribe; [régimen de medición neta](adr/0005-regimen-medicion-neta-sie007.md): `legacy_retention` y `sie007_2026`, postura provisional; [precio genérico e historial de precios](adr/0006-precio-generico-e-historial.md): registros de precio fuera del equipo; [cotizaciones](adr/0007-cotizaciones-entidad-propia.md): entidad propia con dominio puro compartido. Vocabulario en el [glosario](../GLOSSARY.md).
- [Funciones y modos de cálculo](APPLICATION_FEATURES.md): legacy predeterminado, proyección experimental, política de organización, supuestos y edición de propuestas.
- [Motor financiero](FINANCIAL_ENGINE_SPECIFICATION.md): supuestos efectivos y sus defaults, matriz de costos, Ley 57-07, flujo de caja e indicadores.
- [Balance energético físico](ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md): autoconsumo y despacho BESS del modelo opcional (energía útil del banco).
- [API y base de datos](DATABASE_AND_API_SPECIFICATION.md): autenticación, versiones, sincronización y migraciones.
- [Recursos compartidos](SHARED_RESOURCES.md): carpetas, registro de propuestas web, ofertas y adjuntos.
- [Catálogo de equipos](EQUIPMENT_CATALOG.md): modelos, ofertas de proveedores, fichas, vistas previas, anexos automáticos y reconciliación con propuestas.
- [Centro empresarial](COMPANY_CENTER.md): organizaciones, equipos, membretes y aislamiento.
- [Editor del documento de propuesta](PROPOSAL_DOCUMENT_EDITOR.md): textos editables en la hoja, registro de textos, plantillas, diseño y propuesta web.
- [Seguimiento comercial](PROPOSAL_COMMERCIAL_TRACKING.md): decisiones del cliente, responsables y reportes.
- [Directorio de clientes](CLIENTS.md): clientes por organización, enlace opcional con propuestas y resumen de estados.
- [Cotizaciones](QUOTATIONS.md): dominio puro compartido (`shared/quotations/`): tipos, totales en centavos con ITBIS sobre la base gravada, estados, numeración, validación y conversión desde propuesta; plantillas, firmas y sellos, su store y sincronización, estado del módulo y qué exige el release 2.10.0.
- [Editor de cotizaciones](QUOTATION_EDITOR.md): editor con vista previa en vivo, edición pura, línea del catálogo y su precio, pestañas «Plantilla y firmas» y «Adjuntos», gestor de plantillas, firmas y sellos, hoja A4 y paginación, exportación a PDF con adjuntos y vista previa del correo (`mailto:`, sin envío desde la app).
- [Cotización desde una propuesta](QUOTATION_FROM_PROPOSAL.md): diálogo de conversión con sus cinco bloques, de dónde salen los importes y cómo cuadran con la propuesta, documentos que pasan, listas enlazadas y propuesta de origen en el editor.
- [Subsistema IA](AI_SCANNERS_SPECIFICATION.md) y [tarifas en el flujo IA](AI_TARIFF_CONTEXT.md).
- [Agentes y herramientas de IA](AGENT_TOOLS.md): registro común, permisos, actividad y deshacer, precios automáticos.
- [Servidor MCP local](MCP_LOCAL.md): conexión de Claude Code y Codex, token, guardas y modelo de amenazas.
- [Servidor MCP remoto](MCP_REMOTE.md): servicio `mcp-remote` sobre la API para ChatGPT, Claude.ai y agentes en la nube; tokens personales, OAuth 2.1, herramientas, amenazas y despliegue en el CT dedicado.
- [Visor de propuestas (Worker)](../workers/share-viewer/README.md).
- Reglas de exportación PDF: [.agents/rules/html2canvas_pdf_export_rules.md](../.agents/rules/html2canvas_pdf_export_rules.md).

## Operaciones

- [Verificación y QA](QA.md): pruebas automatizadas y guardas de arquitectura, integración continua, ensayos de staging, matriz manual, proceso de revisión de PR y revisión con Claude (suscripción o API).
- [Guía de revisión](../REVIEW.md): qué comprobar en cada PR (contratos, API, motor financiero, PDF, pruebas sin producción); la usan el revisor automático y la revisión manual.
- [Mantenimiento y releases](MAINTENANCE_AND_UPDATES.md): ramas, gates, versión mínima de cliente, publicación firmada y actualizaciones.
- [Infraestructura y despliegue](INFRASTRUCTURE_ARCHITECTURE.md): topología, despliegue protegido de la API, rollback, recuperación de respaldos, rotación de secretos, respaldo diario con aviso de caída y conmutación a naski.

## Producto y diseño

- [PRODUCT.md](../PRODUCT.md): contexto de producto y criterios de calidad de interfaz.
- [DESIGN.md](../DESIGN.md): sistema de diseño.
