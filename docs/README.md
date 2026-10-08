# Manuales de SolarSim Pro

Las fuentes canónicas de esta rama son:

- [Arquitectura modular](ARCHITECTURE.md): límites, dependencias y puntos de entrada.
- [Funciones y modos de cálculo](APPLICATION_FEATURES.md): preferencia local, política de organización, compatibilidad y proyección experimental.
- [Centro empresarial](COMPANY_CENTER.md): membretes, organizaciones independientes, equipos, aislamiento y despliegue.
- [API y base de datos](DATABASE_AND_API_SPECIFICATION.md): autenticación, versiones, sincronización y migraciones.
- [Motor financiero](FINANCIAL_ENGINE_SPECIFICATION.md) y [balance físico](ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md): contratos matemáticos existentes; el balance físico requiere activar la función.
- [Subsistema IA](AI_SCANNERS_SPECIFICATION.md): asistente con texto/adjuntos, revisión de borradores multi-modelo, importación de fichas/precios y transporte común.
- [Tarifas en el flujo IA](AI_TARIFF_CONTEXT.md): fuentes históricas, procedencia por campo, persistencia y límites de concurrencia.
- [Infraestructura](INFRASTRUCTURE_ARCHITECTURE.md): topología y despliegue protegido.
- [Mantenimiento y releases](MAINTENANCE_AND_UPDATES.md): comandos, firmas y compatibilidad.
- [Beta, revisión del CT, recuperación y rollback](BETA_ROLLOUT.md): evidencias aisladas y pendientes de puesta en producción.
- [Revisión del 7 de octubre de 2026](REVIEW_2026_10_07.md): hallazgos corregidos, salud observada, recuperación aislada, runtime real y pendientes verificables.
- [QA](QA.md): gates automatizados y recorridos manuales. [Resultados](QA_RESULTS.md): evidencia y límites de esta entrega.
- [Auditoría de partida](ANALISIS_TECNICO_2026-10-03.md) y [plan](PLAN_MODULARIZACION.md): evidencia histórica y alcance de la rama.

Se retiró CODEBASE_AUDIT_REPORT.md porque sus conclusiones y calificaciones precedían la auditoría reproducible actual. El mapa de infra enlaza al único manual operativo; ya no mantiene un segundo contrato de despliegue. Los scripts de pruebas que escribían en servidores reales fueron sustituidos por integraciones efímeras y regresiones de cliente.
