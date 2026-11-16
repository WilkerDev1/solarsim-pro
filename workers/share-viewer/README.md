# Visor de propuestas

El Worker publica copias inmutables de propuestas y las entrega mediante enlaces temporales. No consulta PostgreSQL ni recalcula simulaciones al abrir un enlace.

## Límites del módulo

- `index.ts`: aplicación Hono y contrato HTTP; `createShareViewer()` admite una implementación de `fetch` para pruebas aisladas.
- `publicationAuthorization.ts`: autorización mediante la API de identidad configurada en `AUTH_API_URL`.
- `validation.ts`: JSON limitado a 2 MiB, validación de estructura, métricas, vigencia y snapshot.
- `proposalRepository.ts`: identificadores criptográficos, almacenamiento KV, vencimiento y metadatos.
- `template.ts` y `escaping.ts`: presentación y codificación independiente para HTML, atributos, Markdown restringido y JSON dentro de scripts.
- `types.ts`: contratos de propuestas; `bindings.ts`: bindings generados por Wrangler, separados de los contratos utilizados en escritorio.

## Autorización y compatibilidad

`POST /api/share` requiere un JWT vigente de un usuario ADMIN o EDITOR. El Worker verifica cada publicación mediante `POST {AUTH_API_URL}/api/auth/share-authorization`. La URL es configuración del operador y debe utilizar HTTPS; nunca procede del contenido de la propuesta. No contiene una clave de firma compartida con el frontend. En cada autorización envía `X-SolarSim-Client: share-viewer/<versión de package.json>`; con una versión mínima activa en la API, un Worker atrasado recibe 426 y la publicación responde 503 (ver [versión mínima de cliente](../../docs/DATABASE_AND_API_SPECIFICATION.md#versión-mínima-de-cliente)).

La API devuelve `{ success, userId, organizationId, featurePolicy: { version, settings } }`. Una política de otra organización, una versión antigua o un modo incompatible producen HTTP 409 antes de escribir en KV. Si la API no está disponible, el Worker no publica. No es posible publicar anónimamente ni con una cuenta de lectura.

Cada publicación nueva incluye `calculationSnapshot: { mode, capturedAt, organizationId, policyVersion }`. El servicio de escritorio confirma la política y calcula el resumen con ese modo en la misma operación. El modo `legacy` conserva cinco columnas y dos barras; `self_consumption` admite autoconsumo, crédito neto, aporte de baterías y curva adicional. La preferencia visual de la propuesta puede ocultar estos detalles sin cambiar el cálculo guardado.

El escritorio publica `rates.gridConnection` explícito y coherente con `isZeroExport` (`shared/gridConnection.ts`); la validación rechaza un valor desconocido. El visor lo lee con `resolveGridConnection`, así que un enlace antiguo con solo `isZeroExport` se sigue viendo como inyección cero o con red. Con `off_grid` el diagrama de flujo muestra la red como «Sin conexión a la red» y usa escenarios propios: híbrido aislado (de día cargando la batería con el excedente recortado, batería llena, de noche con batería y batería agotada con carga sin servir) o aislado sin baterías (de día solo con sol y aviso; de noche sin suministro). El balance de energía añade la energía no servida (`summary.annualUnservedKWh`) y los textos no hablan de medición neta ni de inyección. Un Worker anterior a este cambio trata un enlace aislado como inyección cero. La alternativa de suministro de un sistema aislado (`rates.supplyAlternative`, `rates.generatorCostPerKWh`; `shared/offGridSupply.ts`) es opcional: la validación rechaza una alternativa desconocida o un costo que no sea un número ≥ 0, y el visor la lee con `resolveSavingsBasis`, así que un enlace sin el campo (o con red) se ve igual que siempre. Con `no_comparison`, o con `generator` sin costo, el visor omite las secciones de retorno (payback, TIR, VAN, ahorro a 25 años y su gráfica) y de flujo de caja, rotula «Energía servida» la columna de ahorro de la tabla mensual y muestra en su lugar inversión, energía entregada, energía no servida y autonomía; con `generator` y costo, la nota regulatoria compara con el costo de generación propia indicado.

La vigencia, la retención de exportación y la tasa de cambio que muestra el visor salen de `shared/assumptions.ts` (`resolveAssumptions`), el mismo módulo que usa la aplicación ([ADR 0003](../../docs/adr/0003-supuestos-resueltos.md)); un dato ausente o fuera de rango toma el valor fijo del sistema, igual en todos los equipos.

Los enlaces existentes sin snapshot conservan la vista clásica y el resumen previamente guardado. Se siguen aceptando sus identificadores cortos para lectura. El vencimiento se comprueba al leer, además del TTL de KV. Las nuevas publicaciones usan UUID aleatorios de 128 bits.

El API backend debe incorporar el endpoint de autorización y la política de organización antes de actualizar el Worker y el escritorio. Este cambio no requiere migrar los valores KV existentes ni tocar la base de datos del visor.

Los logotipos personalizados admiten imágenes PNG, JPEG, WebP o GIF en base64 y URLs HTTPS; no se interpretan logotipos SVG/HTML suministrados por usuarios. Los textos admiten el subconjunto compartido con el editor (`**negrita**`, `*cursiva*`, viñetas con `- ` y párrafos); el HTML suministrado por usuarios se presenta como texto.

Los textos editados en el documento viajan como cadenas `doc:<clave>` dentro de `customization` (solo claves del registro `shared/documentTexts`, hasta 10 000 caracteres). El visor prefiere `doc:<clave>`, luego el campo heredado y por último el texto por defecto compartido, así que los enlaces anteriores siguen renderizándose igual. Ver [docs/PROPOSAL_DOCUMENT_EDITOR.md](../../docs/PROPOSAL_DOCUMENT_EDITOR.md).

## Verificación local

Desde la raíz del repositorio:

```bash
npm ci --prefix workers/share-viewer
npm test --prefix workers/share-viewer
npm run build --prefix workers/share-viewer
npm audit --prefix workers/share-viewer
```

Las dos suites prueban la aplicación Hono con KV y autorización simulados, y el servicio de publicación del escritorio con sesión/fetch simulados. No contactan la API real, no publican enlaces ni modifican datos de producción. La generación de tipos usa exclusivamente la configuración local.
