# Capturas del centro empresarial

Capturadas con CUA desde Vite local, 2026-10-05. Datos y roles sintéticos definidos en `scripts/qa/fixtures/companyCenter.tsx`. La fixture usa almacenamiento separado y transporte simulado; estas imágenes prueban presentación, no conectividad de producción. El backend se verifica por integración contra PostgreSQL Docker efímero.

Matriz: perfil y equipo, claro/oscuro, 1024×700 y 1920×978; invitación y rol lector adicionales. No son imágenes generadas ni assets de producto. Origen: captura del código de esta rama. PDF aprobado sin rediseño.

Cierre de revisión: capturas adicionales de perfil compartido y consultor con borradores, y error de invitaciones con reintento. La prueba de recarga del perfil compartido disparó confirmación; al cancelarla el borrador permaneció. Salir del consultor también disparó confirmación.

Gates: lint, 25 suites de cliente, build web/Electron, 24 integraciones API sobre PostgreSQL efímero, formato/build API y test/build Worker aprobados. Build web conserva advertencias de tamaño de chunks. Sin validación ni despliegue contra producción en esta tarea.

Revisiones independientes: backend (permisos/identidad), cliente (migración/aislamiento) y acabado Impeccable. Hallazgos corregidos y cierres confirmados; veredicto visual final `ship`, sin pendientes en las correcciones puntuadas. Contexto Repomix generado; su detector excluye el test de integridad del updater, fuera de esta modificación.
