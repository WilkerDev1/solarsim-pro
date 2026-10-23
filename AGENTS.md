# AGENTS.md

Guía canónica para agentes y desarrolladores. Producto y módulos: [README.md](README.md) y [docs/README.md](docs/README.md). Si un documento contradice el código, manda el código y se corrige el documento.

## Contratos vigentes

- **Modelo energético.** Legacy es el predeterminado: los motores (`src/engine/`) usan `legacy` si no reciben modo. La proyección física de autoconsumo/BESS es opcional: función `selfConsumptionProjection` en `shared/applicationFeatures.ts` con `defaultEnabled: false`, leída mediante el selector `useEnergyCalculationMode` (`src/features/application/`). Cambiar una etiqueta de UI nunca cambia el modelo de cálculo.
- **Funciones nuevas** se registran en `shared/applicationFeatures.ts` (default, etapa, visibilidad, disponibilidad) y se leen con el selector efectivo. Con sesión, la política de la organización (ADMIN mediante PATCH con `baseVersion`) prevalece sobre la preferencia local.
- **Agentes de IA**: toda capacidad para asistentes o agentes externos se declara en `shared/agentTools/definitions.ts` y se ejecuta con `executeAgentTool` (`src/features/agentTools/registry.ts`). Tipos `read`/`draft`/`guarded`: `guarded` requiere confirmación humana salvo el modo bypass explícito (`guarded: 'allow'`; las herramientas sin deshacer siguen confirmándose); las propuestas automáticas usan `AUTOMATED_PRICING`. Ver [docs/AGENT_TOOLS.md](docs/AGENT_TOOLS.md).
- **API** (`server/`): toda mutación usa CAS con `baseVersion` (409 en conflicto) y comprueba los permisos actuales en la base de datos, no solo los claims del JWT. Roles: ADMIN, EDITOR y LECTOR (`VIEWER` se acepta como alias y se normaliza a LECTOR). Migraciones numeradas y aditivas en `server/src/database/`.
- **Registro público** crea siempre una organización nueva con su usuario ADMIN; nunca une a Electsun ni a otra organización existente. Las propuestas locales no se asignan automáticamente a una organización al iniciar sesión.
- **Clientes** ([docs/CLIENTS.md](docs/CLIENTS.md)): `clientId` en la propuesta es un enlace opcional, independiente de los datos impresos (`project.client`); enlazar o borrar un cliente nunca reescribe el documento. Validación en `shared/clients.ts`; escrituras con CAS y borrado lógico que desenlaza. Los clientes locales tampoco se asignan automáticamente a una organización.
- **Pruebas**: ninguna escribe en producción. `scripts/testEnvironment.ts` hace fallar `fetch`; las suites inyectan transporte sintético. Las integraciones de API usan PostgreSQL efímero en Docker.
- **Imagen de la API**: `docker build -f server/Dockerfile .` desde la raíz del repositorio (necesita `shared/`), nunca desde `server/`.
- **Visor (Worker)**: los enlaces publicados conservan su `calculationSnapshot`; los enlaces antiguos sin metadatos deben seguir renderizándose.

## Invariantes

- `src/store/useSimulationStore.ts` solo compone `slices/` y persistencia; conservar todos sus exports públicos (p. ej. `NewProjectPayload`, `generateNextProjectSequence`, `findDuplicateProjectInfo`) y la API de cada slice.
- El renderer (`src/`) no importa módulos de Node; el acceso al sistema pasa por `electron/preload.ts` → `window.electronAPI`.
- `shared/` es TypeScript puro (excepción: `geminiTransport.ts`, fetch inyectable). `src/engine/` son funciones puras: no importan el store ni deciden permisos.
- Ley 57-07: crédito del 40% solo sobre equipos (paneles, inversores, baterías), aplicado en 3 cuotas anuales; inversión neta = precio de contrato − crédito. La retención de exportación (25% por defecto) se aplica solo al excedente exportado. Antes de tocar fórmulas leer [docs/FINANCIAL_ENGINE_SPECIFICATION.md](docs/FINANCIAL_ENGINE_SPECIFICATION.md) y [docs/ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md](docs/ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md).
- Impuestos por ítem: `shared/financialRules.ts` es la única regla (`isItemItbisExonerated`, `appliesItemMargin`: margen activado salvo `applyMargin === false`, `customItemsTaxBreakdown`), usada por motor, interfaz y visor. Paneles e inversores nunca llevan ITBIS.
- Equipos: usar `shared/equipment` (`readEquipment`, `editEquipment`, `equipmentTotals`, `describeEquipment`, `migrateLegacySpecs`; `applyLegacyEquipmentPatch` solo traduce parches con campos sueltos) y nunca los campos sueltos del espejo (`panelBrandModel`, `panelCount`…); ver [ADR 0001](docs/adr/0001-equipment-model-sin-espejo.md) y el [glosario](GLOSSARY.md). Motor, store, historial, importación y dock leen y escriben solo grupos; la aplicación ya no escribe el espejo. Al hidratar, importar y restaurar versiones se ejecuta `migrateLegacySpecs` (invariante, idempotente). DOD y eficiencia de batería son solo por grupo. `editEquipmentGroup`/`normalizeEquipmentEdit` (`src/utils/equipmentGroups.ts`) son compuertas de compatibilidad sobre el módulo para armar parches de `updateSpecs`; las retira la oleada 5.
- Equipos: `panels[]`/`inverters[]`/`batteries[]` son la fuente. Cada grupo recuerda su equipo del catálogo en `catalogItemId` (`selectCatalogEquipment`, `resolveGroupCatalogItem`); con él `ProposalAnnexSync` anexa solas las fichas PDF de los equipos en uso y la exportación consulta `proposalAttachmentResolver`; un grupo reescrito a mano (`manualModel`) o sin referencia al catálogo no cuenta como pendiente; con el catálogo sin cargar (vacío) y algún grupo en uso sin resolver se conservan todos los anexos automáticos, y con el catálogo cargado solo el de los ids a los que apuntan los grupos sin resolver (`catalogItemId`/`id`) ([docs/EQUIPMENT_CATALOG.md](docs/EQUIPMENT_CATALOG.md#fichas-anexadas-automáticamente)).
- Permisos: usar `shared/permissions.ts` (`canWrite`, `canAdminister`, `isWriterRole`…); una prueba falla ante comprobaciones de rol en línea. Las propuestas en papelera son de solo lectura en el store.
- PDF: seguir [.agents/rules/html2canvas_pdf_export_rules.md](.agents/rules/html2canvas_pdf_export_rules.md) (sin `truncate`/`overflow:hidden` en texto, imágenes con `max-h-[..] max-w-[..] w-auto h-auto`, A4 de 850×1202 px con cabecera de 76 px y pie de 42 px). Todo texto del documento se declara en `shared/documentTexts/` y se edita en la hoja con `<EditableText k="…">` (ver [docs/PROPOSAL_DOCUMENT_EDITOR.md](docs/PROPOSAL_DOCUMENT_EDITOR.md)); el cromo de edición lleva `data-pdf-chrome` y nunca entra en el PDF; la propuesta web recibe los textos como `doc:<clave>`.
- Producción: no desplegar ni tocar `app-server` sin solicitud explícita; procedimiento en [docs/INFRASTRUCTURE_ARCHITECTURE.md](docs/INFRASTRUCTURE_ARCHITECTURE.md) (acceso por LAN o, desde fuera, `ssh -J root@100.73.34.56 agente@10.0.0.103` vía Tailscale; checkpoint, ensayo, imagen etiquetada `<versión>-<sha>`, Worker con `wrangler` y rollback).

## Gates antes de dar un trabajo por terminado

Los mismos de `.github/workflows/verify.yml`:

```bash
npm run lint
npm test                      # una suite: npm test -- <filtro>
npm run build
npm run build:electron
npm --prefix server test
npm --prefix server run format:check
npm --prefix server run build
docker build -f server/Dockerfile -t solarsim-api:qa-modular .
npx tsx server/tests/containerSmoke.ts
npm --prefix workers/share-viewer test
npm --prefix workers/share-viewer run build
```

CI también ejecuta `node scripts/qa/validatePackager.mjs`, `node scripts/qa/devSmoke.mjs`, `node scripts/qa/testPrepareSecrets.mjs` y `npx tsx --test scripts/qa/tests/*.test.ts`. Escribir la prueba antes del cambio (en refactors, una prueba de caracterización que fije el comportamiento actual). Si cambia la estructura del repositorio, ejecutar `npm run context:pack`. No afirmar ausencia de vulnerabilidades sin un `npm audit` actual.

## Flujo de trabajo

`beta` es desarrollo; `main` recibe releases estables (merge de `beta` y hotfixes). Conventional Commits (`feat(scope): ...`). Releases: [docs/MAINTENANCE_AND_UPDATES.md](docs/MAINTENANCE_AND_UPDATES.md). Documentación y textos de UI en español; no crear documentos fechados ni bitácoras: la evidencia va en el PR o commit.
