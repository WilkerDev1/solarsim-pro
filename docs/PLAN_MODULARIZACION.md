# Plan de auditoría y monolito modular

Rama de trabajo: `codex/modular-audit-feature-controls`, creada desde `beta` en `8cdcfec`. Objetivo: estabilizar los contratos del producto, organizar sus módulos y habilitar pruebas antes de incorporar estos cambios a una rama publicada.

## Requisitos y criterios de aceptación

- [x] Arquitectura modular documentada: dominios, contratos, dependencias permitidas y puntos de entrada pequeños. Mantener Electron, React/Zustand, Hono y PostgreSQL.
- [x] Auditar y corregir los fallos de autorización, aislamiento de organizaciones, sincronización y persistencia identificados, con pruebas reproducibles que no escriban en producción.
- [x] Nueva categoría «Funciones de la aplicación» en Ajustes, con catálogo tipado de funciones, clasificación estable/beta/experimental y reglas de disponibilidad/visibilidad independientes.
- [x] Única función opcional inicial: proyección de autoconsumo. Desactivada por defecto, incluidos datos rehidratados sin una elección explícita.
- [x] Con autoconsumo desactivado: cálculo legacy, sin perfil de carga ni partición diurna en los parámetros, sin selector que reactive la función, gráficas de consumo/producción y tablas clásicas.
- [x] Con autoconsumo activado: perfil diurno, BESS y distribución visibles, curvas y desglose habilitados; cálculo de ahorro y proyecciones financieras coherente con el modo elegido.
- [x] Mismo modo efectivo en simulador, dashboard/hub, PDF y nuevas propuestas web; conservar proyectos y enlaces previos mediante un contrato de compatibilidad explícito.
- [x] Preferencia local persistente para uso sin conexión. ADMIN puede configurar la política de su organización; EDITOR/LECTOR pueden consultar y aplicar esa política, pero no modificarla. Cambiar de cuenta no reutiliza la política de otra organización.
- [x] Documentación depurada, con un índice y fuentes canónicas. Eliminar duplicados solo después de trasladar instrucciones vigentes y reparar enlaces.
- [x] Pruebas actualizadas: conservar regresiones útiles, retirar duplicados/obsoletos, aislar integraciones del servidor real y cubrir persistencia, cuentas, permisos, ambos modos energéticos y UI.
- [x] Pulir el dock, la navegación principal y Ajustes con Impeccable: jerarquía empresarial, categorías claras, controles consistentes, estados accesibles y temas claro/oscuro.
- [x] Añadir vista compacta de documentos al menú principal junto a las tarjetas: misma búsqueda, filtros, ordenación, acciones y arrastre a carpetas; guardar la preferencia local.
- [x] Verificación completa: tipos, tests, frontend, Electron, backend, Worker, comportamiento en navegador y snapshot Repomix.
- [ ] Rama publicada en GitHub con commits revisables y PR de pruebas; sin merge ni despliegue a producción.

El usuario autoriza ajustes del backend y del CT cuando sean necesarios. Antes de cualquier cambio en infraestructura se verificará el respaldo recuperable y se probará la migración en una base aislada. No se eliminarán volúmenes, datos ni copias de seguridad de producción. El despliegue no sustituye la revisión de la rama de pruebas.

## Secuencia

1. **Contratos y línea base.** Revisar historial para definir el cálculo clásico, registrar requisitos y separar preferencia funcional de opciones visuales por propuesta.
2. **Interfaz y funciones configurables.** Pulir navegación y Ajustes, sustituir el lienzo continuo de configuración por categorías navegables y añadir la vista compacta de documentos. Crear dominio compartido, slice persistente, selector de modo, categoría de ajustes y política de organización con API/RBAC. Integrar el modo en todos los consumidores de cálculo y presentación.
3. **Monolito modular.** Separar arranque HTTP, configuración, autenticación, módulos del backend y migraciones; extraer rehidratación del store y servicios de sincronización con contratos explícitos. Mantener exports públicos compatibles.
4. **Integridad.** Reparar sincronización/concurrencia, pertenencia de proyectos y catálogo, perfiles/hitos, validación de entrada, consumo cero y publicación HTML. Eliminar secretos predeterminados del código. Documentar la rotación de producción como operación de despliegue aparte.
5. **Pruebas y manuales.** Consolidar la suite por dominios, añadir integraciones locales aisladas y guía de QA; depurar documentos históricos y duplicados tras rescatar contenido vigente.
6. **Validación y entrega.** Ejecutar todos los gates, probar UI en ambos modos/temas y estados de permisos, revisar diff, publicar commits y abrir PR para pruebas.

## Decisiones de compatibilidad

La función experimental cambia el modelo de cálculo, no solo la visibilidad. El modo clásico se recuperará del historial previo a la partición diurna; no se inventará una fórmula fiscal nueva. La opción de mostrar u ocultar el desglose de una propuesta solo podrá operar cuando la función de cálculo esté habilitada. Deshabilitarla no borrará datos de perfil previamente introducidos.

El usuario confirmó el reparto histórico: 75% de la generación para autoconsumo sin baterías y 90% con baterías, limitado por el consumo; retención aplicada solo al excedente exportado. Los parámetros experimentales guardados no alterarán este cálculo mientras la función esté desactivada.

La interfaz conserva la identidad SolarSim y sus datos reales: tipografía de producto, superficies neutras, selección y acción principal en verde, color reservado para estados. Ajustes mostrará una categoría a la vez con navegación agrupada. La vista compacta será una tabla de documentos con nombres legibles, datos técnicos comparables y acciones accesibles; no una reducción de las tarjetas a miniaturas.

La política de organización tendrá precedencia sobre la preferencia local mientras se trabaje con una cuenta de esa organización. Su última configuración confirmada puede usarse sin conexión con identificación de organización y versión, sin aceptar cambios locales como si hubieran sido guardados en el servidor. Un backend anterior no se confundirá con una configuración organizacional confirmada.

## Evidencia de partida

La auditoría del 3 de octubre verificó compilaciones y 13 suites, además de siete fallos reproducidos con mocks. El código desplegado de API coincidía con la compilación local. La infraestructura se inspeccionó mediante `pve01` y tenía un respaldo de CT del mismo día. Esta información es una línea base, no una certificación de los cambios de esta rama.
