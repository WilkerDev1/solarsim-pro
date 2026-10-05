# SolarSim Pro 2.2.1

Actualización del escritorio, sincronización y organización de propuestas. El cálculo histórico permanece predeterminado y el PDF aprobado conserva su diseño.

- Electron 44.5.1 y electron-builder 26.15.3; dependencias compatibles actualizadas con lockfiles reproducibles.
- Conflictos persistentes que se pueden reabrir desde tarjetas y filas, comparación legible y conservación de una copia antes de resolver.
- Recuperación de confirmaciones antiguas de la API sin duplicar propuestas; autor de cambios solo cuando se conoce.
- Menú y Ajustes reorganizados, vista compacta de documentos y proyección física opcional.
- Dependencias Linux de runtime y actualización declaradas por formato; icono de ventana incluido en recursos empaquetados.
- Windows x64: instalador NSIS y portable. Linux x64: AppImage, deb, pacman y tar.gz.

Los binarios se compilan en runners de GitHub. Linux incluye firmas GPG verificables con la clave de confianza de SolarSim y manifiestos con hashes/tamaños. Windows no dispone de Authenticode configurado.

La API y el Worker tienen un despliegue independiente y coordinado. Esta release no actualiza PostgreSQL ni el servidor automáticamente. La API debe migrarse siguiendo docs/BETA_ROLLOUT.md; preservar proyectos offline antes de cambiar clientes y servicios. No ejecutar pruebas contra producción.
