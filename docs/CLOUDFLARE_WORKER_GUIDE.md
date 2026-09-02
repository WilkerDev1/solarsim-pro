# ☁️ Guía de Despliegue: Propuestas Web Interactivas con Cloudflare Workers & KV

Esta guía detalla los pasos para desplegar y conectar el microservicio de **Propuestas Web Temporales** de SolarSim Pro en tu cuenta de Cloudflare.

---

## 🏗️ Arquitectura del Servicio

- **Tecnología**: [Cloudflare Workers](https://workers.cloudflare.com/) + [Hono](https://hono.dev/) (TypeScript).
- **Almacenamiento**: Cloudflare Workers KV (`PROPOSALS_KV`) con TTL de expiración automática configurable (3, 7, 15, 30 días).
- **Frontend Interactivo**: Plantilla web responsiva y optimizada para dispositivos móviles y escritorio con:
  - Gráficas en vivo (Chart.js) de balance energético mensual y flujo de caja a 25 años.
  - Cobertura solar real exacta sin topes artificiales.
  - Desglose detallado de ingeniería y Ley 57-07 (exoneración de ITBIS e incentivo fiscal del 40% ISR).
  - Cotización con soporte para ítems estándar y renglones personalizados con régimen de ITBIS.
  - Narrativa técnica y resumen ejecutivo sincronizados dinámicamente.
  - Botón directo de contacto vía WhatsApp e interfaces limpias.
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

### 4. Configurar Dominio Personalizado (Custom Domain Oficial)
Para que las propuestas compartidas utilicen el dominio corporativo de tu empresa:
1. En el panel de Cloudflare, ve a **Workers & Pages** ➔ **`solarsim-share-viewer`**.
2. Ve a la pestaña **Settings** ➔ **Domains & Routes** ➔ **Add** ➔ **Custom Domain**.
3. Escribe **`propuesta.electsun.net`** y haz clic en **Add Custom Domain**.

---

## ⚙️ Conexión Predeterminada en SolarSim Pro

SolarSim Pro viene preconfigurado con **`https://propuesta.electsun.net`** como endpoint oficial por defecto:
1. Al hacer clic en **"Compartir Propuesta Web"** en cualquier simulación, el sistema publicará automáticamente la propuesta en `https://propuesta.electsun.net/p/:id`.
2. El código QR incrustado en el PDF y el botón para compartir por WhatsApp utilizarán automáticamente tu dominio corporativo con SSL.

---

## 🔒 Privacidad y Expiración

- Cada propuesta compartida se almacena con un `expirationTtl` exacto según los días elegidos por el usuario.
- Una vez expirado el plazo, Cloudflare KV elimina el registro permanentemente.
- Si un cliente intenta abrir un enlace caducado, verá una pantalla indicando que la propuesta ha vencido con un botón para contactar a tu empresa vía WhatsApp.
