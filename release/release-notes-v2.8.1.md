# SolarSim Pro 2.8.1

Parche de escritorio: la app se puede usar en pantalla dividida, junto a un documento u otra aplicación, en Windows y Linux. Solo cambia el cliente; la API, el visor web y el MCP remoto suben de versión para mantenerse alineados, sin cambios funcionales ni migraciones. `MIN_CLIENT_VERSION` sigue en 2.8.0.

## Multitarea en escritorio

- **Pantalla dividida.** La ventana admite ahora 640 × 480 como tamaño mínimo (antes 1024 × 700). Cabe en media pantalla desde monitores de 1280 px y en un cuadrante de 1080p, así que el sistema puede acoplarla a un lado.
- **Atajos de teclado del sistema.** Funcionan los atajos propios de cada escritorio: en Windows, Win + ← / → para acoplar a media pantalla, Win + ↑ / ↓ para cuadrantes y Snap Layouts (Win + Z); en GNOME y KDE, Super + ← / → (y los cuadrantes de KDE con Super + ↑ / ↓ tras acoplar). Antes el tamaño mínimo impedía que el gestor de ventanas encogiera la app.
- **Escalado de pantalla.** Los tamaños se miden en píxeles lógicos. Con escalado alto (por ejemplo, 1080p al 175 % o al 200 %), media pantalla mide menos de 640 px lógicos y el sistema no puede acoplar la app a un lado. En ese caso basta con bajar el escalado o usar un monitor más ancho.
- **Simulador en ventanas estrechas.** El panel de parámetros cede espacio hasta un 40 % del ancho (mínimo 280 px) cuando la ventana es estrecha y conserva el ancho elegido en ventanas amplias. Al arrastrar su borde, este sigue al cursor (antes saltaba el ancho del dock de iconos). Las pestañas usan nombres cortos (Energía, Cotización, Retorno) por debajo de 1280 px, Deshacer y Rehacer quedan siempre visibles y las tarjetas de resumen de Energía, Cotización y Retorno se reparten según el espacio real del panel.
- **Vista PDF.** El panel de exportación cede espacio en ventanas estrechas y la hoja se desplaza horizontalmente sin recortar el borde izquierdo; en ventanas amplias sigue centrada.

## Despliegue

- Cliente: publicar el instalador 2.8.1 (Windows y Linux) con el flujo habitual.
- API, visor web y MCP remoto: solo cambia el número de versión. Se pueden desplegar en el siguiente ciclo o junto con el cliente; ninguno es requisito para usar 2.8.1.
