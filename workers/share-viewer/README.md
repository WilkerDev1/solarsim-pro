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

La vigencia, la retención de exportación y la tasa de cambio que muestra el visor salen de `shared/assumptions.ts` (`resolveAssumptions`), el mismo módulo que usa la aplicación ([ADR 0003](../../docs/adr/0003-supuestos-resueltos.md)); un dato ausente o fuera de rango toma el valor fijo del sistema, igual en todos los equipos.

Los enlaces existentes sin snapshot conservan la vista clásica y el resumen previamente guardado. Se siguen aceptando sus identificadores cortos para lectura. El vencimiento se comprueba al leer, además del TTL de KV. Las nuevas publicaciones usan UUID aleatorios de 128 bits.

El API backend debe incorporar el endpoint de autorización y la política de organización antes de actualizar el Worker y el escritorio. Este cambio no requiere migrar los valores KV existentes ni tocar la base de datos del visor.

Los logotipos personalizados admiten imágenes PNG, JPEG, WebP o GIF en base64 y URLs HTTPS; no se interpretan logotipos SVG/HTML suministrados por usuarios. Los textos admiten el subconjunto compartido con el editor (`**negrita**`, `*cursiva*`, viñetas con `- ` y párrafos); el HTML suministrado por usuarios se presenta como texto.

Los textos editados en el documento viajan como cadenas `doc:<clave>` dentro de `customization` (solo claves del registro `shared/documentTexts`, hasta 10 000 caracteres). El visor prefiere `doc:<clave>`, luego el campo heredado y por último el texto por defecto compartido, así que los enlaces anteriores siguen renderizándose igual. Ver [docs/PROPOSAL_DOCUMENT_EDITOR.md](../../docs/PROPOSAL_DOCUMENT_EDITOR.md).

## Tema claro y oscuro

`theme.ts` es la única fuente de colores de la propuesta web: cada token tiene valor claro y oscuro. La paleta de Tailwind que usa la plantilla (`slate`, `sky`, `orange`, `amber`, `emerald`, `red`, `rose`, `blue`) se reasigna a variables CSS mediante `tailwind.config`, así que cualquier clase (`text-sky-700`, `bg-orange-50/70`) sigue el tema sin variantes `dark:`. Superficies y cabeceras de tabla usan roles propios (`bg-page`, `bg-surface`, `bg-zebra`, `bg-head`, `text-on-head`, `bg-tile`); no se escriben colores sueltos (`bg-white`, `bg-[#…]`, hex en CSS, SVG o gráficos). Los gráficos leen `--chart-*` y se repintan al cambiar de tema o al imprimir; el diagrama de flujo usa `--ef-*` mediante `PALETTE`, `FLOW_HEX` y sus clases, por lo que un nodo nuevo hereda el tema. Los logotipos nunca se invierten: en oscuro van sobre una placa blanca, porque el encabezado web se prepara sobre fondo blanco.

El tema sigue `prefers-color-scheme`; un botón discreto de la cabecera alterna automático, claro y oscuro y guarda la elección en `localStorage` (con `try/catch`; sin JavaScript no aparece). Un script en `<head>` aplica la elección antes de pintar. La impresión sale siempre en claro. `tests/darkTheme.test.ts` fija los esquemas declarados, la ausencia de colores fijos, el contraste AA del tema oscuro y el conmutador.

Señales para que los navegadores que oscurecen páginas a la fuerza respeten el tema propio:

- `<meta name="color-scheme" content="light dark">`: Chromium (Chrome Android, Edge, Opera, Brave) no aplica su oscurecido automático si la página declara tema oscuro y lo está usando. Mientras se ve el tema claro, `:root` declara `color-scheme: only light`, la exclusión documentada de [Auto Dark Theme](https://developer.chrome.com/blog/auto-dark-theme).
- Samsung Internet admite `prefers-color-scheme` y la meta `color-scheme` desde 13.2 ([blog de Samsung](https://developer.samsung.com/internet/blog/en/2020/12/15/dark-mode-in-samsung-internet)), pero según su [foro de desarrolladores](https://forum.developer.samsung.com/t/websites-dark-mode-gets-overridden-by-samsung-internets-dark-mode/22937) solo la respeta con la opción «Usar el tema oscuro del sitio web» (Labs) activada.
- `<meta name="darkreader-lock">` desactiva Dark Reader en la página ([CONTRIBUTING de Dark Reader](https://github.com/darkreader/darkreader/blob/main/CONTRIBUTING.md)).

Limitación conocida: con el flag de escritorio de Chromium `WebContentsForceDark` y el sistema en claro, el navegador oscurece igualmente el tema claro (ignora `only light`); el lector puede elegir el tema oscuro con el conmutador.

## Verificación local

Desde la raíz del repositorio:

```bash
npm ci --prefix workers/share-viewer
npm test --prefix workers/share-viewer
npm run build --prefix workers/share-viewer
npm audit --prefix workers/share-viewer
```

Las dos suites prueban la aplicación Hono con KV y autorización simulados, y el servicio de publicación del escritorio con sesión/fetch simulados. No contactan la API real, no publican enlaces ni modifican datos de producción. La generación de tipos usa exclusivamente la configuración local.
