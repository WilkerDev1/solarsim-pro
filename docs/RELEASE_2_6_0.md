# SolarSim Pro 2.6.0 — publicación y API

Versión coordinada de escritorio, API y visor web. Cambios funcionales y límites en [notas de versión](../release/release-notes-v2.6.0.md) y [seguimiento comercial](PROPOSAL_COMMERCIAL_TRACKING.md).

La integración conserva `beta` y la rama `codex/simulator-datasheet-workflow`. Los binarios de Windows/Linux se construyen en GitHub Actions desde el tag; antes de publicar se verifican archivos, firmas y metadatos. La versión del paquete y `/api/health` es 2.6.0.

## Despliegue protegido

La actualización de API requiere respaldo privado reciente, ensayo de restauración en PostgreSQL aislado, comprobación de integridad y conservación de la imagen/composición anteriores. Se reemplaza únicamente API, manteniendo base, contenedor PostgreSQL y volumen. No se ejecutan pruebas de escritura en producción ni se restaura sobre su base. Las validaciones de permisos, reportes, responsables y relaciones se ejecutan sobre PostgreSQL efímero.

## Estado

Preparación en curso. Este documento se actualizará con revisiones, resultados de CI, despliegue y publicación verificados; no acredita todavía publicación ni despliegue.
