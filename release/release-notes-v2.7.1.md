# SolarSim Pro 2.7.1

Versión de arquitectura y compatibilidad: los equipos de cada propuesta se guardan solo como grupos (el espejo de un solo modelo desaparece), la API exige una versión mínima de cliente y el dock estrena menús desplegables propios. **SolarSim 2.6.x y 2.7.0 dejan de sincronizar cuando se actualice la API**: lee la sección «Compatibilidad» antes de actualizar.

## Menús desplegables del dock (#85)

- Los selectores del dock (estilo del dock, tema claro/oscuro, provincia…) usan un menú desplegable propio en lugar del selector nativo del sistema.
- La flecha del campo abre el menú; se maneja con el teclado (flechas, Inicio, Fin, Enter, Esc) y se busca escribiendo las primeras letras.
- Cada provincia muestra su HSP (horas solar pico) a la derecha de su nombre.
- El menú se dibuja sobre el resto de la pantalla, no se corta dentro de las secciones plegables y se voltea hacia arriba si abajo no hay espacio.

## Equipos sin espejo (#89 a #91)

- Cada propuesta guarda sus equipos solo como grupos de paneles, inversores y baterías. El espejo heredado (modelo, cantidad, potencia y precio sueltos del primer grupo) ya no se escribe; el DOD y la eficiencia de la batería son solo por grupo.
- Conversión automática de datos: las propuestas locales, los archivos `.json` importados, las versiones restauradas y las propuestas de la API pasan a grupos sin que cambie ningún resultado (costo, precio, kWp, energía, finanzas ni textos). Una propuesta sin grupos se convierte al abrirla; no hay que hacer nada.
- Nombres en los textos: se nombra el modelo principal y, si hay más, «y N modelo(s) más» (por ejemplo «Panel X y 2 modelos más»). Las tablas siguen listando todos los modelos.
- Nombres de reserva unificados cuando un equipo no tiene nombre: «Módulos Monocristalinos Tier-1 TOPCon», «Inversor Solar On-Grid / Híbrido» y «Banco de Baterías de Litio LiFePO4».
- Etiquetas correctas con paneles mezclados en la portada del PDF y en la pestaña de energía: antes mostraban solo el primer modelo y su cantidad; ahora muestran la configuración real (por ejemplo «20 × 620W + 18 × 610W»).
- La propuesta web, los textos del documento, el asistente y los borradores de IA leen los equipos por el mismo módulo, así que describen igual todos los modelos.

## Servidor (#92)

- Migración 006: convierte los equipos de **todos** los proyectos (también los de la papelera y los de otras organizaciones) a grupos. No cambia los resultados ni las versiones de las propuestas (`version`, `updated_at` y el historial quedan intactos), por lo que no genera conflictos ni descargas completas.
- Versión mínima de cliente: cada cliente envía `X-SolarSim-Client: <nombre>/<versión>` y la API responde 426 (`client_outdated`) en las rutas de datos si falta o es menor que `MIN_CLIENT_VERSION` (por defecto 2.7.1). Salud, inicio de sesión, renovación de sesión, `/api/auth/me` y CORS siguen abiertos. El cliente 2.7.1 muestra «Actualiza SolarSim para seguir sincronizando» con un botón que abre el actualizador.
- Corrección: la capacidad del sistema (`system_capacity_kwp`) se calcula desde los grupos de equipos; antes se leía un campo que ningún cliente guardaba.

## Propuesta web

- Modos interactivos del diagrama de flujo energético (día, noche y apagón), con cambio por flechas o deslizamiento, modo «batería llena» en sistemas híbridos y textos derivados de los flujos modelados. El suministro se limita a la potencia del inversor instalado.

## Tipos y pruebas

- `SystemSpecs` ya no declara el espejo heredado: usarlo fuera de la lectura de datos viejos es un error de compilación, y una prueba lo vigila en todo el código (ADR 0001). No cambia nada visible.

## Compatibilidad

- **SolarSim 2.6.x y 2.7.0 dejan de sincronizar** cuando se actualice la API a 2.7.1: no envían la identidad de cliente y reciben 426. Quien use esas versiones debe actualizar a 2.7.1; al hacerlo, su trabajo pendiente se sincroniza.
- **El trabajo local no se pierde.** Una versión anterior sigue abriendo y guardando propuestas en el equipo; solo se detiene la sincronización con el servidor.
- **Las propuestas ya publicadas siguen abriendo.** El visor web lee los enlaces antiguos (con el formato viejo de equipos) y los nuevos, y conserva su cálculo y sus textos.
- Una propuesta guardada por 2.7.1 ya no debe abrirse ni editarse con 2.6.x o 2.7.0: esas versiones no entienden los equipos sin espejo y mostrarían campos vacíos.
- Los archivos `.json` exportados con versiones anteriores se siguen importando.

## Despliegue

Orden obligatorio (detalle y comandos en `docs/INFRASTRUCTURE_ARCHITECTURE.md`):

1. **Checkpoint** de producción (volcado de PostgreSQL, lista de restauración e imagen en ejecución) y **ensayo de restauración** con la imagen candidata: debe terminar en las migraciones `[1,2,3,4,5,6]` con los mismos conteos que producción.
2. **Worker 2.7.1** (visor). Es compatible con la API anterior y publica propuestas sin el espejo.
3. **Avisar al equipo antes de subir la API**, con fecha y hora: desde ese momento SolarSim 2.6.x y 2.7.0 no sincronizan.
4. **API con la migración 006.** Comprobar la fila `6 | equipment_groups`, el mismo número de proyectos que antes del despliegue y ningún proyecto con el espejo. `MIN_CLIENT_VERSION` queda en 2.7.1 por defecto.
5. **Publicar el cliente 2.7.1** firmado y confirmar que quienes sincronizan actualizaron.

Subir `MIN_CLIENT_VERSION` antes de publicar el cliente, o sin avisar, deja a todo el equipo sin sincronizar. Rollback: la imagen anterior de la API es compatible con los datos migrados; la 006 no se revierte con DDL (restaurar el checkpoint en una base nueva si hiciera falta).

## Distribución

Windows x64: instalador y portable. Linux x64: AppImage, Debian, pacman y tar.gz. Los paquetes Linux y los manifiestos de actualización se firman con la clave GPG fijada de SolarSim. Windows no dispone de firma Authenticode; macOS y ARM no forman parte de esta publicación.
