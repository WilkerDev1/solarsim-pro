# 🚀 Protocolo y Reglas de Despliegue en Servidor (`app-server`)

Este documento establece las reglas obligatorias y protocolos de actuación de **Antigravity** al interactuar con el servidor de aplicaciones (`app-server`).

---

## 1. 🛡️ Principios y Restricciones de Seguridad

1. **Aislamiento de Red**:
   - Ningún contenedor de base de datos o API interna debe exponer puertos directamente al host sin pasar por el proxy inverso **Caddy**.
   - Toda comunicación entre contenedores debe transcurrir dentro de la red Docker compartida `solarsim_net`.
2. **Permisos y Privilegios**:
   - Las operaciones se realizan con el usuario `agente` (miembro del grupo `docker`).
   - Nunca intentar ejecutar comandos `sudo` ni modificar la configuración base del sistema operativo del contenedor LXC a menos que el usuario lo solicite explícitamente.
3. **Credenciales y Secretos**:
   - Nunca hardcodear contraseñas de PostgreSQL, claves secretas JWT o API keys en archivos `docker-compose.yml` o código fuente.
   - Utilizar siempre archivos `.env` locales en el servidor con permisos restrictivos (`600`).

---

## 2. 📋 Protocolo de Despliegue Paso a Paso

Cada vez que se prepare o actualice un servicio en el servidor:

### A. Pre-Despliegue (Local)
1. **Validación de Sintaxis**:
   - Validar la sintaxis de los archivos `docker-compose.yml`, `Dockerfile` y `Caddyfile`.
   - Comprobar que no existan colisiones de nombres de contenedores, redes o volúmenes.

### B. Ejecución de Despliegue (Remoto vía SSH)
1. **Transferencia de Archivos**:
   - Sincronizar los manifiestos y código fuente hacia `/home/agente/servicios/<nombre-servicio>/` utilizando `rsync` o `scp`.
2. **Construcción y Lanzamiento**:
   - Ejecutar remotamente:
     ```bash
     ssh app-server "cd /home/agente/servicios/<nombre-servicio> && docker compose up -d --build"
     ```

### C. Verificación Posterior (Health Check)
1. **Comprobación de Estado**:
   - Ejecutar `docker compose ps` y verificar que los contenedores estén en estado `Up` o `healthy`.
2. **Inspección de Logs**:
   - Revisar logs iniciales para descartar excepciones o fallas de conexión a la base de datos:
     ```bash
     ssh app-server "cd /home/agente/servicios/<nombre-servicio> && docker compose logs --tail=50"
     ```
3. **Validación HTTP / Red**:
   - Ejecutar `curl -I http://10.0.0.103/<ruta>` o mediante el dominio configurado en Caddy para comprobar código de respuesta HTTP exitoso (`200` o `204`).

---

## 3. 🔄 Gestión de Caddy Proxy y Dominios

Para añadir o modificar rutas en el proxy inverso:
1. Editar `/home/agente/servicios/caddy/Caddyfile`.
2. Validar la sintaxis con:
   ```bash
   ssh app-server "docker exec caddy-proxy caddy validate --config /etc/caddy/Caddyfile"
   ```
3. Recargar Caddy sin pérdida de conexiones activas:
   ```bash
   ssh app-server "docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile"
   ```
