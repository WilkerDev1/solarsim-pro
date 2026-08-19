# ☁️ Guía de Despliegue: Propuestas Web Interactivas con Cloudflare Workers & KV

Esta guía detalla los pasos para desplegar y conectar el microservicio de **Propuestas Web Temporales** de SolarSim Pro en tu cuenta de Cloudflare.

---

## 🏗️ Arquitectura del Servicio

- **Tecnología**: [Cloudflare Workers](https://workers.cloudflare.com/) + [Hono](https://hono.dev/) (TypeScript).
- **Almacenamiento**: Cloudflare Workers KV (`PROPOSALS_KV`) con TTL de expiración automática configurable (3, 7, 15, 30 días).
- **Frontend Interactivo**: Plantilla web responsiva y optimizada para dispositivos móviles y escritorio con gráficas en vivo (Chart.js), desglose de ingeniería Ley 57-07, contadores de ROI y botón directo a WhatsApp.
- **Ubicación del Código**: `workers/share-viewer/`.

---

## 🚀 Pasos de Despliegue (Única Vez)

### 1. Iniciar sesión en Cloudflare
Abre tu terminal en la carpeta del worker:
```bash
cd workers/share-viewer
npx wrangler login
```
*(Se abrirá tu navegador para autorizar la CLI de Cloudflare con tu cuenta).*

---

### 2. Crear el Namespace de KV en Cloudflare
Ejecuta el siguiente comando para aprovisionar el almacenamiento KV:
```bash
npx wrangler kv namespace create PROPOSALS_KV
```

La terminal imprimirá una salida similar a esta:
```toml
[[kv_namespaces]]
binding = "PROPOSALS_KV"
id = "a1b2c3d4e5f678901234567890abcdef"
```

Copia ese `id` y pégalo en el archivo `workers/share-viewer/wrangler.toml`:
```toml
name = "solarsim-share-viewer"
main = "src/index.ts"
compatibility_date = "2024-08-15"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "PROPOSALS_KV"
id = "a1b2c3d4e5f678901234567890abcdef"  # <-- Coloca aquí el ID generado
```

---

### 3. Desplegar el Worker
Ejecuta:
```bash
npm run deploy
```
O directamente:
```bash
npx wrangler deploy
```

Al finalizar, Cloudflare te dará la URL pública de tu Worker (por ejemplo: `https://solarsim-share-viewer.<tu-subdominio>.workers.dev`).

---

## ⚙️ Conectar la URL en SolarSim Pro Desktop

1. Abre **SolarSim Pro**.
2. En la vista de **Propuesta PDF** o en la barra superior, haz clic en **"Compartir Propuesta Web"** (o en el botón de la cabecera).
3. En la ventana emergente, haz clic en el ícono de **Configuración ⚙️** (esquina superior derecha del modal).
4. Pega la URL de tu Worker (ej. `https://solarsim-share-viewer.<tu-subdominio>.workers.dev`) y presiona **Guardar**.
5. ¡Listo! Al hacer clic en **"Generar Enlace Web y Código QR"**, la propuesta se publicará inmediatamente en la nube con su enlace temporal y código QR para WhatsApp.

---

## 🔒 Privacidad y Expiración

- Cada propuesta compartida se almacena con un `expirationTtl` exacto según los días elegidos por el usuario.
- Una vez expirado el plazo, Cloudflare KV elimina el registro permanentemente.
- Si un cliente intenta abrir un enlace caducado, verá una pantalla indicando que la propuesta ha vencido con un botón para contactar a tu empresa vía WhatsApp.
