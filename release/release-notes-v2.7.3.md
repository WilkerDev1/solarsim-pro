# SolarSim Pro 2.7.3

Corrección menor del dock de parámetros y actualización de dependencias. No hay migración de datos ni cambio de versión mínima: los clientes 2.7.1 o posteriores siguen sincronizando con la API 2.7.3.

## Precio kWh (#107)

- El precio de la factura se ve completo. Antes, el aviso «Oficial $0.104» ocupaba casi todo el campo y un valor como 0.2213 quedaba recortado en «0.», como si la IA no lo hubiera aplicado.
- Se puede escribir el precio a mano: al borrar el campo ya no reaparece el 0 delante (antes «0.185» quedaba «00.185»). La corrección vale para todos los campos numéricos del dock.
- La tarifa oficial pasa a un desplegable dentro del mismo campo: la flecha (con punto ámbar si el precio difiere) abre «Aplicar tarifa oficial» con su valor, y muestra «✓ Tarifa oficial aplicada» cuando ya coincide. Funciona con ratón y con teclado.

## Dependencias

- Electron 44.9.3 (último parche de la rama 44), electron-builder 26.18, electron-updater 6.8.11 y SDK de MCP 1.32.2.
- API y visor: hono 4.13.14 y wrangler 4.153; tipos de Cloudflare al día.
- La API se construye sobre Node 24 LTS (24.22). No hay cambios de versión mayor.

## Repositorio

- README nuevo y descripción del repositorio (#105).
- Las direcciones y el acceso SSH de producción salen de los archivos versionados (#106).

## Compatibilidad

- No hay migración de datos. `MIN_CLIENT_VERSION` sigue en 2.7.1.
- La API 2.7.3 y el visor 2.7.3 solo cambian el número de versión y sus dependencias.

## Despliegue

1. Checkpoint de producción y ensayo de restauración con la imagen candidata (migraciones `[1,2,3,4,5,6]`, mismos conteos).
2. Worker 2.7.3 (visor).
3. API 2.7.3 (Node 24 LTS), sin migración.
4. Imagen de `cloudflared` actualizada.
5. Publicar el cliente 2.7.3 firmado.

## Distribución

Windows x64: instalador y portable. Linux x64: AppImage, Debian, pacman y tar.gz. Los paquetes Linux y los manifiestos de actualización se firman con la clave GPG fijada de SolarSim. Windows no dispone de firma Authenticode; macOS y ARM no forman parte de esta publicación.
