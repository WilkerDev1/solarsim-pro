# Infraestructura y despliegue protegido

Topología verificada en la auditoría de 2026-10-03: host Proxmox pve01, CT100 app-server (10.0.0.103), Docker con solarsim-api, PostgreSQL16, Caddy, Cloudflare Tunnel y web corporativa. app-server no tiene Tailscale propio; el acceso autorizado pasa por pve01. No confundir este CT con electsun-core. No se ha modificado producción en esta rama.

El CT dispone de 6 cores, 4GiB y disco50GiB. La carga observada no justificó ampliar recursos ni actualizar el sistema operativo. Estos datos son una fotografía de la auditoría, no estado garantizado futuro. Antes de operar, comprobar CT activo y contenedores desde el nodo; no insistir con SSH directo si está desconectado.

## Protección y orden de despliegue

1. Guardar dump PostgreSQL custom con permisos0600 en ubicación privada y comprobar `pg_restore --list`. Guardar configuración/imagen actual y snapshot CT recuperable; no imprimir `.env` ni secretos.
2. Restaurar el dump en PostgreSQL efímero y comprobar tablas/conteos/integridad. Aplicar migraciones de esta rama allí. Un listado de backup o snapshot existente no constituye prueba de restauración.
3. Probar cliente/API/Worker en staging con datos sintéticos y la matriz de QA. La API nueva exige baseVersion y publicaciones JWT: clientes antiguos necesitan actualización coordinada. No sustituir automáticamente producción por esta rama.
4. Rotar los secretos públicos confirmados en la auditoría: JWT invalida sesiones anteriores; contraseña BD necesita ALTER ROLE y actualización de todos los consumidores, porque cambiar POSTGRES_PASSWORD en compose **no cambia** la contraseña de una base existente.
5. Preparar checkout completo de la revisión aprobada. Compose API ahora construye con contexto raíz del repo e incluye shared/: no copiar solo server/ a la antigua carpeta de servicio. Usar env privado, red Docker existente y conservar el volumen PostgreSQL.
6. Desplegar API, comprobar health/login/roles/política, después Worker y cliente compatibles. Mantener rollback de imagen y respaldos. Las migraciones aditivas evitan borrar datos; la compatibilidad de rollback requiere comprobar el contrato de clientes.

```bash
# Desde checkout de la revisión aprobada, con .env privado ya preparado:
docker compose --env-file /ruta/privada/solarsim.env -f infra/services/solarsim-api/docker-compose.yml build
docker compose --env-file /ruta/privada/solarsim.env -f infra/services/solarsim-api/docker-compose.yml up -d --no-deps api
```

Nunca ejecutar `down -v`, eliminar directorios de datos, restaurar encima de producción como prueba ni enviar dumps a GitHub. PostgreSQL mantiene almacenamiento existente y no publica puerto al host. El Dockerfile de API usa Node24, usuario sin privilegios y healthcheck; health comprueba disponibilidad real de BD.

La rotación y el despliegue quedan como operaciones separadas de la PR de pruebas. Los contenedores locales de integración no demuestran que producción haya sido actualizada.
