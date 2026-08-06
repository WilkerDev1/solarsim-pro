# PRD — Simulador y Generador de Propuestas Fotovoltaicas
**Versión:** 1.0
**Fecha:** Agosto 2026
**Autor:** Análisis técnico basado en documentación de arquitectura existente

---

## 1. Resumen Ejecutivo

El proyecto busca reemplazar el flujo manual actual (Excel + Word) para generar propuestas comerciales de sistemas fotovoltaicos en República Dominicana, con una aplicación de escritorio (Electron) que permite:

- Simular producción vs. consumo en tiempo real durante reuniones de venta.
- Aplicar automáticamente incentivos fiscales (Ley 57-07) y regulaciones vigentes (Resolución SIE-007-2026-REG).
- Funcionar offline en campo, con sincronización de datos externos (irradiación, clima, geocodificación) cuando hay internet.
- Extraer automáticamente datos de facturas eléctricas (EDEESTE/EDESUR/EDENORTE) vía IA multimodal, reduciendo la digitación manual.
- Exportar un informe ejecutivo en PDF vectorial de alta calidad, con gráficos y fichas técnicas de fabricantes anexadas.

**Lo que este PRD añade sobre la documentación de arquitectura existente:** prioriza el *qué construir primero*, define un MVP realista, secuencia las fases evitando sobre-ingeniería temprana (especialmente en el módulo de IA), y establece lineamientos de UI/UX para lograr una interfaz simple, profesional y altamente personalizable.

---

## 2. Problema y Objetivo

### Problema actual
| Dolor | Impacto |
|---|---|
| Recalcular Excel + editar Word manualmente | Reuniones lentas, sin interactividad comercial en vivo |
| Aplicar Ley 57-07 y SIE-007-2026-REG a mano | Errores de cálculo, riesgo de propuestas no conformes |
| Falta de internet en campo | Bloquea el uso de herramientas 100% cloud |
| Digitación manual de facturas (12 meses de consumo) | Fricción operativa y errores de transcripción |
| Reportes visualmente inconsistentes | Percepción poco profesional ante el cliente |

### Objetivo del producto
Permitir que un vendedor genere una propuesta fotovoltaica completa, financiera y visualmente profesional, **en menos de 5 minutos**, ya sea desde cero o a partir de una factura escaneada, con o sin conexión a internet.

### Objetivos no funcionales clave
- **Simplicidad de interfaz**: un vendedor no técnico debe poder operarla sin capacitación extensa.
- **Personalización**: el catálogo de equipos, plantillas de informe, logo/marca de la empresa instaladora y parámetros regulatorios deben ser configurables sin tocar código.
- **Confiabilidad offline-first**: ningún cálculo crítico depende de una API externa.

---

## 3. Alcance: MVP vs. Fases Posteriores

Un error común en proyectos así es intentar construir "todo el stack" (IA + gráficos + PDF + fusión de datasheets + APIs externas) desde el día uno. Se propone un alcance escalonado:

### MVP (Fase 1) — Núcleo funcional sin IA
El objetivo del MVP es que la app genere una propuesta financieramente correcta y un PDF exportable, sin depender de ningún servicio de IA.

**Incluye:**
- Electron + React + TypeScript + Tailwind + Shadcn/ui (shell base)
- Zustand para estado del formulario/simulador
- Motor de cálculo solar y financiero (JS puro): dimensionamiento, producción mensual, flujo de caja a 25 años, Ley 57-07
- Base de datos SQLite local: clientes, proyectos, y equipos ingresados por proyecto (sin gestor de catálogo maestro — ver sección 5.3)
- Matriz de fallback de HSP por provincia (para operar sin internet)
- Panel lateral interactivo (sliders, switches) con recálculo inmediato, con **modo simple** y **modo detallado**
- Gráficos de consumo vs. producción (Recharts) y flujo de caja
- Exportación a PDF vectorial vía `printToPDF()`
- Integración con PVGIS + Nominatim + Open-Meteo (modo online, con fallback offline)

**Explícitamente fuera del MVP:** el módulo de IA de ingestión de facturas, la fusión automática de datasheets vía `pdf-lib`, y un gestor de catálogo maestro de productos (CRUD de fabricantes/modelos con fichas técnicas). Estas últimas se posponen a Fase 2+ una vez validado que el motor de cálculo y la UI funcionan bien con ingreso directo de specs por proyecto.

### Fase 2 — Fusión de documentos y calidad de informe
- Fusión de fichas técnicas (datasheets) en PDF vía `pdf-lib`
- Plantillas de informe personalizables (branding del instalador, colores, logo)
- Mejoras de UI: modo oscuro, componentes de tabla densos para comparativas
- **Catálogo maestro de productos (opcional/evolutivo)**: una vez validado el ingreso directo por proyecto, se puede añadir un catálogo reutilizable (guardar un modelo de panel/inversor una vez y reutilizarlo entre proyectos) para acelerar la carga de datos en propuestas recurrentes. No es un requisito del MVP.

### Fase 3 — Módulo de IA (ingestión de facturas)
- Integración con Gemini API (visión + JSON Schema estricto)
- Modal de "Propuesta Asistida por IA"
- Sintetizador que combina el JSON extraído con preferencias del usuario
- Manejo de errores de extracción (validación humana antes de guardar)

### Fase 4 — Robustez y escalabilidad
- Actualización de tarifas/regulaciones sin recompilar la app (archivo de configuración versionado)
- Multi-usuario / multi-instalador (si aplica a nivel de negocio)
- Backups automáticos de la base SQLite

**Razón para este orden:** el motor de cálculo y el PDF son el corazón del valor del producto y son 100% deterministas — se pueden probar y confiar rápido. La IA introduce variabilidad (facturas mal escaneadas, formatos distintos por distribuidora) y conviene construirla sobre una base ya estable, no en paralelo.

---

## 4. Usuarios y Casos de Uso

| Usuario | Caso de uso principal |
|---|---|
| Vendedor/Asesor comercial | Genera y ajusta propuestas en vivo frente al cliente, incluso sin internet en campo |
| Ingeniero/Diseñador técnico | Define catálogo de equipos, valida dimensionamiento, ajusta parámetros regulatorios |
| Administrador de la empresa instaladora | Configura plantilla de marca, catálogo de productos, tarifas vigentes |
| Cliente final (receptor) | Recibe el PDF con el análisis financiero y técnico |

---

## 5. Requisitos Funcionales

### 5.1 Simulador interactivo
- RF-01: El usuario debe poder ingresar consumo mensual (manual o histórico de 12 meses).
- RF-02: El usuario debe poder seleccionar ubicación (buscador de texto vía Nominatim o clic en mapa) para obtener HSP/irradiación.
- RF-03: Ante ausencia de internet, el sistema debe usar la matriz de fallback HSP por provincia sin bloquear al usuario ni mostrar errores técnicos.
- RF-04: Cambios en potencia de panel, modelo de inversor, % de pérdidas o inclinación deben recalcular producción y financieros en <300ms.
- RF-05: El sistema debe permitir simular con y sin baterías, mostrando el impacto de la Resolución SIE-007-2026-REG (cargo del 25% sobre energía exportada en BTS1/BTS2).

### 5.2 Motor financiero y regulatorio
- RF-06: Cálculo automático del 40% de crédito fiscal ISR (Ley 57-07), diferido a 3 años.
- RF-07: Exoneración del 100% de ITBIS sobre equipos, reflejada en el desglose de inversión.
- RF-08: Cálculo de Payback, TIR, VAN (con tasa de descuento configurable), ROI a 25 años y reducción estimada de CO₂ (factor de emisión configurable, no hardcodeado).
- RF-09: Proyección a 25 años con degradación anual de paneles configurable por fabricante.

### 5.3 Ingreso de equipo: Modo Simple y Modo Detallado (sin catálogo maestro en MVP)

En vez de un gestor de catálogo (CRUD de fabricantes/modelos), el MVP permite **ingresar directamente en el proyecto** las especificaciones del equipo que se va a instalar. Esto reduce fricción de setup inicial y evita construir infraestructura de catálogo antes de validar el motor de cálculo.

- **RF-10a (Modo Simple):** El usuario ingresa solo lo esencial para dimensionar: potencia del panel (W), cantidad de paneles, potencia del inversor (kW), y si incluye baterías (sí/no + capacidad kWh). El sistema aplica valores por defecto razonables de eficiencia (~), coeficiente de temperatura y pérdidas del sistema (basados en promedios de la industria), sin pedírselos al usuario.
- **RF-10b (Modo Detallado):** El mismo formulario expone campos adicionales opcionales para quien quiera precisión: eficiencia del panel (%), coeficiente de temperatura (%/°C), degradación anual (%/año), % de pérdidas del sistema (cableado, suciedad, sombreado, inversor), y eficiencia/profundidad de descarga de la batería si aplica.
- **RF-10c:** El cambio entre Modo Simple ↔ Modo Detallado debe ser un toggle explícito en la misma vista (no una pantalla separada), y los valores por defecto del modo simple deben quedar visibles/editables al pasar a detallado (nunca se pierden datos ya ingresados).
- **RF-10d:** Las specs de equipo ingresadas quedan guardadas **por proyecto** (no en una tabla de catálogo global) — es decir, cada propuesta almacena su propia configuración de panel/inversor/batería tal como se usó al momento de generarla.
- RF-11: Plantilla de informe personalizable: logo, colores de marca, datos de la empresa instaladora.
- RF-12: Parámetros regulatorios (tarifas, %ITBIS, %crédito fiscal, factor de emisión CO₂) editables desde un panel de configuración, no hardcodeados en el motor de cálculo.

### 5.4 Reportes
- RF-13: Exportación a PDF vectorial con: tabla mensual consumo/producción/ahorro, gráfico de evolución mensual, resumen de ahorro anual (Año 1 / 5 / 10 / 25 años), indicadores financieros, nota de impacto ambiental.
- RF-14 (Fase 2): Anexo automático de datasheets de fabricantes al final del PDF.

### 5.5 Módulo IA (Fase 3)
- RF-15: Ingesta de factura (PDF/imagen) y extracción estructurada (cliente, distribuidora, tarifa, consumo histórico de 12 meses).
- RF-16: El usuario debe poder revisar/corregir los datos extraídos por IA antes de guardarlos (nunca auto-guardar sin confirmación).
- RF-17: Ante fallo de extracción o falta de conexión, el sistema debe permitir continuar con ingreso manual sin fricción.

---

## 6. Requisitos No Funcionales

| Categoría | Requisito |
|---|---|
| Rendimiento | Recalculo del simulador <300ms ante cualquier cambio de parámetro |
| Disponibilidad offline | 100% de las funciones del MVP deben operar sin internet, salvo geocodificación/irradiación en vivo (con fallback) |
| Portabilidad | Debe correr en Windows y Linux sin cambios de código |
| Seguridad | IPC bridge (`contextIsolation` + `preload`) sin exponer Node.js directamente al renderer |
| Datos | La base SQLite es local; no debe requerir servidor ni cuenta en la nube para operar |
| Mantenibilidad | Parámetros regulatorios y fiscales deben vivir en configuración, no en código, ante cambios normativos futuros |
| UI/UX | Interfaz clara, sin sobrecarga visual, con jerarquía tipográfica consistente y modo de personalización de marca |

---

## 7. Lineamientos de UI/UX (simple, profesional, personalizable)

Dado que la prioridad explícita es una interfaz **simple, profesional y adaptable**, se recomienda:

1. **Estructura de 2 paneles**: panel lateral de parámetros (colapsable) + área principal de visualización (gráficos + tabla + preview del informe). Este patrón ya está contemplado en el stack (Shadcn/ui) y es el más usado en dashboards financieros/técnicos porque separa "control" de "resultado".
2. **Sistema de diseño basado en tokens** (colores, tipografía, espaciado) en vez de estilos hardcodeados por componente — esto es lo que permite personalización de marca sin reescribir vistas.
3. **Modo "vista cliente" vs. "vista técnica"**: durante la reunión comercial, ocultar la complejidad técnica (coeficientes, pérdidas) y mostrar solo lo relevante para el cliente (ahorro, retorno, impacto ambiental); un toggle revela el detalle técnico para el vendedor/ingeniero.
4. **Plantillas de informe intercambiables**: al menos una plantilla "ejecutiva" (para clientes) y una "técnica" (para ingeniería), ambas alimentadas por el mismo motor de datos.
5. **Estados vacíos y offline explícitos**: si no hay internet, decirlo claramente ("Usando datos de irradiación estimados por región") en vez de fallar silenciosamente — esto genera confianza en campo.

---

## 8. Modelo de Datos (alto nivel)

Entidades principales en SQLite:

- **Cliente**: nombre, RNC/cédula, dirección, distribuidora, tarifa
- **Proyecto/Propuesta**: cliente asociado, ubicación (lat/lng), parámetros de simulación (JSON), resultados calculados (JSON), estado (borrador/final)
- **Equipo_Proyecto** (columna JSON dentro de Proyecto, no tabla de catálogo aparte): potencia panel, cantidad, potencia inversor, batería (sí/no + capacidad), y — si se usó modo detallado — eficiencia, coeficiente de temperatura, degradación anual, % pérdidas del sistema. Guardado tal cual se usó al generar la propuesta (inmutable históricamente).
- **Configuración_Regulatoria**: versión de tarifas, %ITBIS, %crédito fiscal, factor CO₂, vigente desde/hasta (para permitir cambios normativos sin perder histórico de propuestas ya generadas)
- **Historial_Consumo**: 12 valores mensuales por proyecto (manual o extraído por IA)

> Nota: la tabla `Catálogo_Panel/Inversor/Batería` mencionada como evolución en Fase 2 (sección 3) solo se introduce si se detecta que los vendedores repiten mucho los mismos modelos entre propuestas y vale la pena reutilizar datos en vez de reingresarlos.

Nota: guardar `Configuración_Regulatoria` versionada es importante — si la Resolución SIE-007-2026-REG cambia, las propuestas ya generadas no deben recalcularse retroactivamente con los nuevos valores.

---

## 9. Datos de Ejemplo Usados como Referencia (validación del motor de cálculo)

Se usará el caso **CENTRO MÉDICO HISPÁNICO** como caso de prueba de referencia para validar que el motor de cálculo replica estos resultados exactamente antes de considerar el MVP "listo":

- 42 paneles JA Solar 565W → 23.56 kWp DC
- Producción estimada anual: 32,984 kWh/año
- Cobertura de consumo: 95%
- Inversión total: $26,739.92 USD (con Ley 57-07 aplicada)
- Payback: 3 años | TIR: 31.97% | VAN (10%): $43,100.38 | ROI 25 años: 469.53%
- Tabla mensual consumo/producción/ahorro (Enero–Diciembre) con total anual de 39,348 kWh de consumo vs. 36,325 kWh de producción (92.3% de ahorro energético)

Este set de datos servirá como **prueba de regresión** cada vez que se modifique el motor financiero.

---

## 10. Plan de Implementación Realista

Estimación para un equipo pequeño (1–2 desarrolladores full-stack con experiencia en Electron/React).

| Fase | Contenido | Duración estimada |
|---|---|---|
| **0. Setup** | Scaffolding Electron + React + TS + Tailwind + Shadcn, configuración IPC segura, SQLite + ORM | 1 semana |
| **1. MVP — Motor de cálculo** | Motor solar/financiero en JS puro + validación contra caso de referencia (Centro Médico Hispánico) | 2 semanas |
| **1. MVP — UI Simulador** | Panel lateral interactivo, Zustand, gráficos Recharts, recálculo en vivo | 2 semanas |
| **1. MVP — Persistencia y equipo (simple/detallado)** | Formulario de ingreso de equipo con toggle Simple/Detallado, clientes y proyectos en SQLite | 1 semana |
| **1. MVP — Integraciones externas + fallback** | PVGIS, Nominatim, Open-Meteo + matriz de fallback offline | 1 semana |
| **1. MVP — Exportación PDF** | Vista imprimible + `printToPDF()`, ajuste de CSS Print | 1 semana |
| **1. MVP — QA y pulido de UI** | Modo cliente/técnico, estados vacíos, revisión de personalización de marca | 1 semana |
| **→ Entregable: MVP funcional (~9 semanas)** | | |
| **2. Fusión de documentos y plantillas** | `pdf-lib` para anexar datasheets, plantillas de marca personalizables | 2 semanas |
| **3. Módulo de IA** | Integración Gemini, modal de ingestión, flujo de revisión/corrección humana | 2–3 semanas |
| **4. Robustez** | Configuración regulatoria versionada, backups, ajustes multi-usuario si aplica | 1.5–2 semanas |

**Total estimado hasta MVP:** ~9–10 semanas
**Total estimado hasta producto completo (Fases 1–4):** ~16–18 semanas

Este plan asume que el motor de cálculo financiero (Ley 57-07, TIR/VAN/Payback, degradación) se valida primero de forma aislada (sin UI), ya que es la pieza donde un error es más costoso (propuestas incorrectas a clientes).

---

## 11. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambios regulatorios (Ley 57-07, SIE-007-2026-REG) rompen cálculos ya hechos | Versionar la configuración regulatoria; nunca hardcodear en el motor |
| Facturas escaneadas de baja calidad fallan en extracción IA | Flujo de revisión manual obligatorio antes de guardar (RF-16); nunca depender 100% de la IA |
| Sin internet en campo, APIs externas fallan | Fallback offline ya contemplado (matriz HSP regional); debe probarse explícitamente, no solo "en teoría" |
| Sobre-ingeniería del módulo de IA antes de validar el motor base | Orden de fases: motor de cálculo + PDF primero, IA al final (Fase 3) |
| Informe PDF no se ve "profesional" | Validar con al menos 2–3 iteraciones de diseño con usuarios reales (vendedores) antes de cerrar la plantilla |

---

## 12. Criterios de Éxito del MVP

- El motor de cálculo reproduce el caso de referencia (Centro Médico Hispánico) con exactitud (Payback, TIR, VAN, ROI).
- Un vendedor puede generar una propuesta completa desde cero, sin internet, en menos de 5 minutos.
- El PDF exportado es visualmente consistente con la tabla y gráfico de ejemplo mostrados en este documento.
- Un usuario puede generar una propuesta ingresando solo potencia/cantidad de equipo (Modo Simple), y opcionalmente refinar eficiencia/pérdidas específicas (Modo Detallado), sin necesidad de un catálogo preconfigurado.
- La marca del instalador (logo, colores, datos) es configurable sin tocar código.

---

## 13. Siguiente Paso Sugerido

Recomiendo construir primero un **prototipo visual del simulador y del informe** (React, con los datos de ejemplo del Centro Médico Hispánico) para validar la dirección de UI antes de invertir tiempo en el motor de cálculo completo. Puedo construir ese prototipo a continuación si te sirve.
