# Plan de auditoría y monolito modular

Rama de trabajo: `codex/modular-audit-feature-controls`, creada desde `beta` en `8cdcfec`. Objetivo: estabilizar los contratos del producto, organizar sus módulos y habilitar pruebas antes de incorporar estos cambios a una rama publicada.

## Requisitos y criterios de aceptación

- [ ] Arquitectura modular documentada: dominios, contratos, dependencias permitidas y puntos de entrada pequeños. Mantener Electron, React/Zustand, Hono y PostgreSQL.
- [ ] Auditar y corregir los fallos de autorización, aislamiento de organizaciones, sincronización y persistencia identificados, con pruebas reproducibles que no escriban en producción.
- [ ] Nueva categoría «Funciones de la aplicación» en Ajustes, con catálogo tipado de funciones, clasificación estable/beta/experimental y reglas de disponibilidad/visibilidad independientes.
- [ ] Única función opcional inicial: proyección de autoconsumo. Desactivada por defecto, incluidos datos rehidratados sin una elección explícita.
- [ ] Con autoconsumo desactivado: cálculo legacy, sin perfil de carga ni partición diurna en los parámetros, sin selector que reactive la función, gráficas de consumo/producción y tablas clásicas.
- [ ] Con autoconsumo activado: perfil diurno, BESS y distribución visibles, curvas y desglose habilitados; cálculo de ahorro y proyecciones financieras coherente con el modo elegido.
- [ ] Mismo modo efectivo en simulador, dashboard/hub, PDF y nuevas propuestas web; conservar proyectos y enlaces previos mediante un contrato de compatibilidad explícito.
- [ ] Preferencia local persistente para uso sin conexión. ADMIN puede configurar la política de su organización; EDITOR/LECTOR pueden consultar y aplicar esa política, pero no modificarla. Cambiar de cuenta no reutiliza la política de otra organización.
- [ ] Documentación depurada, con un índice y fuentes canónicas. Eliminar duplicados solo después de trasladar instrucciones vigentes y reparar enlaces.
- [ ] Pruebas actualizadas: conservar regresiones útiles, retirar duplicados/obsoletos, aislar integraciones del servidor real y cubrir persistencia, cuentas, permisos, ambos modos energéticos y UI.
- [ ] Verificación completa: tipos, tests, frontend, Electron, backend, Worker, comportamiento en navegador y snapshot Repomix.
- [ ] Rama publicada en GitHub con commits revisables y PR de pruebas; sin merge ni despliegue a producción.

## Secuencia

1. **Contratos y línea base.** Revisar historial para definir el cálculo clásico, registrar requisitos y separar preferencia funcional de opciones visuales por propuesta.
2. **Funciones configurables.** Crear dominio compartido, slice persistente, selector de modo, categoría de ajustes y política de organización con API/RBAC. Integrar el modo en todos los consumidores de cálculo y presentación.
3. **Monolito modular.** Separar arranque HTTP, configuración, autenticación, módulos del backend y migraciones; extraer rehidratación del store y servicios de sincronización con contratos explícitos. Mantener exports públicos compatibles.
4. **Integridad.** Reparar sincronización/concurrencia, pertenencia de proyectos y catálogo, perfiles/hitos, validación de entrada, consumo cero y publicación HTML. Eliminar secretos predeterminados del código. Documentar la rotación de producción como operación de despliegue aparte.
5. **Pruebas y manuales.** Consolidar la suite por dominios, añadir integraciones locales aisladas y guía de QA; depurar documentos históricos y duplicados tras rescatar contenido vigente.
6. **Validación y entrega.** Ejecutar todos los gates, probar UI en ambos modos/temas y estados de permisos, revisar diff, publicar commits y abrir PR para pruebas.

## Decisiones de compatibilidad

La función experimental cambia el modelo de cálculo, no solo la visibilidad. El modo clásico se recuperará del historial previo a la partición diurna; no se inventará una fórmula fiscal nueva. La opción de mostrar u ocultar el desglose de una propuesta solo podrá operar cuando la función de cálculo esté habilitada. Deshabilitarla no borrará datos de perfil previamente introducidos.

La política de organización tendrá precedencia sobre la preferencia local mientras se trabaje con una cuenta de esa organización. Su última configuración confirmada puede usarse sin conexión con identificación de organización y versión, sin aceptar cambios locales como si hubieran sido guardados en el servidor. Un backend anterior no se confundirá con una configuración organizacional confirmada.

## Evidencia de partida

La auditoría del 3 de octubre verificó compilaciones y 13 suites, además de siete fallos reproducidos con mocks. El código desplegado de API coincidía con la compilación local. La infraestructura se inspeccionó mediante `pve01` y tenía un respaldo de CT del mismo día. Esta información es una línea base, no una certificación de los cambios de esta rama.
