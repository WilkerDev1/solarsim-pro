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

`POST /api/share` requiere un JWT vigente de un usuario ADMIN o EDITOR. El Worker verifica cada publicación mediante `POST {AUTH_API_URL}/api/auth/share-authorization`. La URL es configuración del operador y debe utilizar HTTPS; nunca procede del contenido de la propuesta. No contiene una clave de firma compartida con el frontend.

La API devuelve `{ success, userId, organizationId, featurePolicy: { version, settings } }`. Una política de otra organización, una versión antigua o un modo incompatible producen HTTP 409 antes de escribir en KV. Si la API no está disponible, el Worker no publica. No es posible publicar anónimamente ni con una cuenta de lectura.

Cada publicación nueva incluye `calculationSnapshot: { mode, capturedAt, organizationId, policyVersion }`. El servicio de escritorio confirma la política y calcula el resumen con ese modo en la misma operación. El modo `legacy` conserva cinco columnas y dos barras; `self_consumption` admite autoconsumo, crédito neto, aporte de baterías y curva adicional. La preferencia visual de la propuesta puede ocultar estos detalles sin cambiar el cálculo guardado.

Los enlaces existentes sin snapshot conservan la vista clásica y el resumen previamente guardado. Se siguen aceptando sus identificadores cortos para lectura. El vencimiento se comprueba al leer, además del TTL de KV. Las nuevas publicaciones usan UUID aleatorios de 128 bits.

El API backend debe incorporar el endpoint de autorización y la política de organización antes de actualizar el Worker y el escritorio. Este cambio no requiere migrar los valores KV existentes ni tocar la base de datos del visor.

Los logotipos personalizados admiten imágenes PNG, JPEG, WebP o GIF en base64 y URLs HTTPS; no se interpretan logotipos SVG/HTML suministrados por usuarios. Los textos permiten únicamente énfasis `**en negrita**`; el HTML suministrado por usuarios se presenta como texto.

## Verificación local

Desde la raíz del repositorio:

```bash
npm ci --prefix workers/share-viewer
npm test --prefix workers/share-viewer
npm run build --prefix workers/share-viewer
npm audit --prefix workers/share-viewer
```

Las dos suites prueban la aplicación Hono con KV y autorización simulados, y el servicio de publicación del escritorio con sesión/fetch simulados. No contactan la API real, no publican enlaces ni modifican datos de producción. La generación de tipos usa exclusivamente la configuración local.
