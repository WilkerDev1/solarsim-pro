## Qué cambia y por qué

<!-- 2–5 frases. Título en Conventional Commits, p. ej. `fix(api): ...`. Enlaza issue/ADR si existe. -->

## Pruebas primero

<!-- Qué prueba se escribió antes del cambio (o de caracterización en un refactor), qué fallaba sin él y qué demuestra ahora. -->

- Prueba(s):
- Falla sin el cambio: sí / no aplica (motivo)

## Contratos e invariantes tocados

<!-- Marca solo lo que aplica y explica en una línea cómo se respeta (AGENTS.md, REVIEW.md). -->

- [ ] API: CAS con `baseVersion`, permisos comprobados en BD, aislamiento por organización
- [ ] Migración nueva (numerada, compatible con filas legadas) o `MIN_CLIENT_VERSION`
- [ ] Motor financiero/energético (especificación actualizada en este PR)
- [ ] Equipos, supuestos o edición de proyecto (`shared/equipment`, `resolveAssumptions`, `applyProjectEdit`)
- [ ] PDF o textos del documento (reglas html2canvas, `shared/documentTexts/`)
- [ ] Visor / enlaces publicados (snapshot y enlaces antiguos)
- [ ] Electron/IPC, secretos, CI o infraestructura
- [ ] Ninguno de los anteriores

## Gates

<!-- CI (`gates`) los ejecuta todos; marca lo que ejecutaste en local y pega la salida relevante abajo si algo no es obvio. -->

- [ ] `npm run lint` y `npm test` (o las suites afectadas: `npm test -- <filtro>`)
- [ ] `npm run build` y `npm run build:electron`
- [ ] API: `npm --prefix server test`, `format:check`, `build`, imagen Docker y `containerSmoke`
- [ ] Visor: `npm --prefix workers/share-viewer test` y `run build`
- [ ] `npm run context:pack` si cambió la estructura del repositorio
- [ ] Documentación canónica actualizada (sin documentos fechados ni bitácoras)

## Evidencia

<!-- Salidas, capturas con datos sintéticos (nunca credenciales, URLs privadas ni datos de clientes) y revisión manual hecha (matriz de docs/QA.md). -->

## Riesgos y despliegue

<!-- Qué podría romperse, cómo se revierte, si requiere despliegue de API/Worker o subir versión. Nada se despliega a producción desde este PR sin petición explícita. -->
