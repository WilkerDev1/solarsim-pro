/**
 * SolarSim Pro — Verificador Ejecutable de Compatibilidad Previa al Despliegue.
 *
 * Sondeo de lectura entre Cliente de escritorio, Sync API y Cloudflare Worker:
 *  1. Salud de la API y conectividad con PostgreSQL.
 *  2. Rechazo de acceso anónimo (/api/organization/features, /api/auth/share-authorization, etc.).
 *  3. Salud del Cloudflare Worker y protección de /api/share.
 *  4. Consulta de política con autenticación sintética (opcional mediante flags/env).
 *
 * Salida:
 *  - Exit code 1: Fallos, incompatibilidades o cobertura pendiente.
 *    Este sondeo no acredita despliegue: siempre informa los contratos autenticados
 *    y de escritura omitidos, que deben verificarse en el ensayo aislado de staging.
 */

export interface CompatibilityCheckResult {
  name: string;
  category: 'API_HEALTH' | 'API_ROUTES' | 'WORKER' | 'STAGING_AUTH' | 'SUMMARY';
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: Record<string, unknown>;
}

export interface CompatibilityRunnerOptions {
  apiUrl: string;
  workerUrl: string;
  authToken?: string;
  silent?: boolean;
}

export async function runCompatibilityChecks(
  options: CompatibilityRunnerOptions
): Promise<{ success: boolean; results: CompatibilityCheckResult[] }> {
  const { apiUrl, workerUrl, authToken, silent = false } = options;
  const results: CompatibilityCheckResult[] = [];

  const log = (...msg: unknown[]) => {
    if (!silent) console.log(...msg);
  };

  log('================================================================');
  log('🔍 SolarSim Pro — Verificación Ejecutable de Compatibilidad');
  log(`📡 API Target:    ${apiUrl}`);
  log(`⚡ Worker Target: ${workerUrl}`);
  if (authToken) log('🔑 Token de staging provisto: [PRESENTE - PROTEGIDO]');
  log('================================================================\n');

  // --- 1. API Health & DB Connection ---
  let apiHealthy = false;
  let apiVersion = 'desconocida';
  try {
    const res = await fetch(`${apiUrl}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      results.push({
        name: 'API Health HTTP Status',
        category: 'API_HEALTH',
        status: 'FAIL',
        message: `HTTP ${res.status}: El endpoint /api/health no respondió 200 OK.`,
      });
    } else {
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') {
        results.push({
          name: 'API Health JSON',
          category: 'API_HEALTH',
          status: 'FAIL',
          message: 'La respuesta de /api/health no es un objeto JSON válido.',
        });
      } else if (data.status !== 'ok') {
        results.push({
          name: 'API Health Status Field',
          category: 'API_HEALTH',
          status: 'FAIL',
          message: `El estado reportado no es "ok": ${JSON.stringify(data)}`,
        });
      } else if (data.database !== 'connected') {
        results.push({
          name: 'API Database Connectivity',
          category: 'API_HEALTH',
          status: 'FAIL',
          message: `La base de datos PostgreSQL no está conectada: status="${data.database}".`,
        });
      } else {
        apiVersion = typeof data.version === 'string' ? data.version : 'desconocida';
        const is220 = apiVersion === '2.2.0';
        apiHealthy = true;
        results.push({
          name: 'API Health & Database',
          category: 'API_HEALTH',
          status: is220 ? 'FAIL' : 'PASS',
          message: is220
            ? `Versión reportada es 2.2.0 antigua (incompatible con PR #1 / PR #2 y publicación web). Servicio: ${data.service}`
            : `Versión reportada: ${apiVersion} | DB: conectada | Servicio: ${data.service}`,
          details: data,
        });
      }
    }
  } catch (err) {
    results.push({
      name: 'API Reachability',
      category: 'API_HEALTH',
      status: 'FAIL',
      message: `No se pudo conectar a la API: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- 2. API Routes Presence and Protection ---
  // Authentication middleware can reject even unknown paths. A 401/403 proves
  // anonymous rejection, not that the handler exists or its contract is correct.
  async function testProtectedEndpoint(
    path: string,
    method: 'GET' | 'POST' | 'PATCH',
    requiredFor: string,
    isMandatory = true
  ): Promise<void> {
    try {
      const res = await fetch(`${apiUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'GET' ? '{}' : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
      });

      if (res.status === 404) {
        results.push({
          name: `Ruta API: ${method} ${path}`,
          category: 'API_ROUTES',
          status: isMandatory ? 'FAIL' : 'WARN',
          message: `404 Not Found — La ruta no existe en el backend. Requerida para: ${requiredFor}.`,
        });
      } else if (res.status === 401) {
        // Anonymous rejection only; middleware may run before route matching.
        results.push({
          name: `Ruta API: ${method} ${path}`,
          category: 'API_ROUTES',
          status: 'PASS',
          message: `Acceso anónimo rechazado (HTTP 401). Existencia y esquema del handler no comprobados. Contrato pendiente: ${requiredFor}.`,
        });
      } else if (res.status >= 200 && res.status < 300) {
        results.push({
          name: `Ruta API: ${method} ${path}`,
          category: 'API_ROUTES',
          status: 'FAIL',
          message: `VULNERABILIDAD / PROTECCIÓN INVÁLIDA: Respondió HTTP ${res.status} sin token de autorización.`,
        });
      } else if (res.status === 403) {
        results.push({
          name: `Ruta API: ${method} ${path}`,
          category: 'API_ROUTES',
          status: 'PASS',
          message: `Acceso anónimo restringido (HTTP 403). Existencia y esquema del handler no comprobados. Contrato pendiente: ${requiredFor}.`,
        });
      } else {
        results.push({
          name: `Ruta API: ${method} ${path}`,
          category: 'API_ROUTES',
          status: 'WARN',
          message: `Respuesta inesperada al probar acceso anónimo: HTTP ${res.status}.`,
        });
      }
    } catch (err) {
      results.push({
        name: `Ruta API: ${method} ${path}`,
        category: 'API_ROUTES',
        status: 'FAIL',
        message: `Error al probar ruta: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  if (apiHealthy || apiVersion === '2.2.0') {
    // Critical routes for Web Proposal Sharing & Feature Policy
    await testProtectedEndpoint(
      '/api/organization/features',
      'GET',
      'Confirmación de política de simulación en el cliente antes de publicar',
      true
    );
    await testProtectedEndpoint(
      '/api/auth/share-authorization',
      'POST',
      'Autorización e introspección de tokens desde el Cloudflare Worker',
      true
    );

    // Company Center / Multi-tenant routes (PR #2)
    await testProtectedEndpoint(
      '/api/organization/profile',
      'GET',
      'Perfil de organización compartido con CAS (Company Center)',
      true
    );
    await testProtectedEndpoint(
      '/api/auth/switch-organization',
      'POST',
      'Cambio de organización multi-tenant (Company Center)',
      true
    );
    await testProtectedEndpoint(
      '/api/organizations',
      'GET',
      'Listado de organizaciones a las que pertenece el usuario',
      true
    );
  }

  // --- 3. Cloudflare Worker Health & Contracts ---
  let workerHealthy = false;
  try {
    const res = await fetch(`${workerUrl}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      results.push({
        name: 'Worker Health Endpoint',
        category: 'WORKER',
        status: 'FAIL',
        message: `HTTP ${res.status}: El Worker no respondió 200 OK en /api/health.`,
      });
    } else {
      const data = await res.json().catch(() => null);
      if (!data || data.status !== 'ok') {
        results.push({
          name: 'Worker Health Payload',
          category: 'WORKER',
          status: 'FAIL',
          message: `Respuesta anómala del Worker: ${JSON.stringify(data)}`,
        });
      } else {
        workerHealthy = true;
        results.push({
          name: 'Worker Health',
          category: 'WORKER',
          status: 'PASS',
          message: `Worker en línea: ${data.service || 'SolarSim Pro Share Viewer'} | Timestamp: ${data.timestamp || 'N/A'}`,
          details: data,
        });
      }
    }
  } catch (err) {
    results.push({
      name: 'Worker Reachability',
      category: 'WORKER',
      status: 'FAIL',
      message: `No se pudo conectar al Worker: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (workerHealthy) {
    // Test Worker POST /api/share protection: MUST require Bearer token (401)
    try {
      const res = await fetch(`${workerUrl}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
      });

      if (res.status === 401) {
        results.push({
          name: 'Worker Share Authorization Contract',
          category: 'WORKER',
          status: 'PASS',
          message: 'POST /api/share exige autorización Bearer correctamente (HTTP 401).',
        });
      } else if (res.status === 400) {
        // Prior worker revision that validated body before auth
        results.push({
          name: 'Worker Share Authorization Contract',
          category: 'WORKER',
          status: 'WARN',
          message: 'POST /api/share respondió HTTP 400 ("Project data is required"). Versión anterior del Worker sin autorización previa a la validación de carga.',
        });
      } else if (res.status === 404) {
        results.push({
          name: 'Worker Share Route',
          category: 'WORKER',
          status: 'FAIL',
          message: 'POST /api/share devolvió 404 Not Found. Ruta no encontrada en el Worker.',
        });
      } else {
        results.push({
          name: 'Worker Share Authorization Contract',
          category: 'WORKER',
          status: 'WARN',
          message: `POST /api/share respondió con HTTP ${res.status} ante solicitud anónima.`,
        });
      }
    } catch (err) {
      results.push({
        name: 'Worker Share Contract',
        category: 'WORKER',
        status: 'FAIL',
        message: `Error al verificar POST /api/share: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Test Worker proposal 404 template rendering
    try {
      const res = await fetch(`${workerUrl}/p/test-fallback-non-existent-id`, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 404) {
        const html = await res.text();
        const hasTemplate = html.includes('Propuesta Vencida') || html.includes('SolarSim Pro');
        results.push({
          name: 'Worker Proposal Fallback Template',
          category: 'WORKER',
          status: hasTemplate ? 'PASS' : 'WARN',
          message: hasTemplate
            ? 'Plantilla de propuesta vencida/no disponible renderizada correctamente (HTTP 404).'
            : 'HTTP 404 recibido pero no contiene la plantilla estándar.',
        });
      } else {
        results.push({
          name: 'Worker Proposal Fallback Template',
          category: 'WORKER',
          status: 'WARN',
          message: `Respondió HTTP ${res.status} en lugar de 404 para ID inexistente.`,
        });
      }
    } catch (err) {
      results.push({
        name: 'Worker Proposal Fallback',
        category: 'WORKER',
        status: 'FAIL',
        message: `Error al probar fallback de propuesta: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // --- 4. Staging Authenticated Checks (if token provided) ---
  if (authToken && apiHealthy) {
    try {
      // Test GET /api/organization/features with token
      const res = await fetch(`${apiUrl}/api/organization/features`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const policy = await res.json().catch(() => null);
        if (
          policy &&
          typeof policy.organizationId === 'string' &&
          Number.isSafeInteger(policy.version) &&
          policy.settings &&
          typeof policy.settings.selfConsumptionProjection === 'boolean'
        ) {
          results.push({
            name: 'Staging Feature Policy Schema',
            category: 'STAGING_AUTH',
            status: 'PASS',
            message: `Política de funciones válida confirmada: org=${policy.organizationId}, version=${policy.version}, projection=${policy.settings.selfConsumptionProjection}.`,
            details: policy,
          });
        } else {
          results.push({
            name: 'Staging Feature Policy Schema',
            category: 'STAGING_AUTH',
            status: 'FAIL',
            message: `El esquema de la política de funciones devuelta es inválido: ${JSON.stringify(policy)}`,
          });
        }
      } else {
        results.push({
          name: 'Staging Feature Policy Query',
          category: 'STAGING_AUTH',
          status: 'FAIL',
          message: `Error al consultar política con token: HTTP ${res.status}.`,
        });
      }
    } catch (err) {
      results.push({
        name: 'Staging Feature Policy Query',
        category: 'STAGING_AUTH',
        status: 'FAIL',
        message: `Error en consulta autenticada: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  results.push({
    name: 'Authenticated Contract Coverage',
    category: 'SUMMARY',
    status: 'WARN',
    message: authToken
      ? 'Cobertura parcial: se consulta la política autenticada, pero faltan contratos de perfil, organizaciones, cambio de organización, roles, CAS y publicación real con KV. Ejecutar el ensayo aislado antes de desplegar.'
      : 'Cobertura parcial: sin token no se comprueban existencia ni esquemas de handlers autenticados, roles, CAS o publicación real con KV. Los rechazos 401/403 no demuestran compatibilidad funcional.',
    details: {
      authenticatedPolicyChecked: results.some((result) => result.name === 'Staging Feature Policy Schema' && result.status === 'PASS'),
      endToEndChecked: false,
    },
  });

  // --- 5. Analysis and Summary ---
  log('\n--- RESULTADOS DETALLADOS ---');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌';
    log(`${icon} [${r.category}] ${r.name}: ${r.message}`);
  }

  const failures = results.filter((r) => r.status === 'FAIL');
  const warnings = results.filter((r) => r.status === 'WARN');
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;

  log('\n================================================================');
  log('📊 RESUMEN DE COMPATIBILIDAD');
  log(`Total comprobaciones: ${total} | Aprobadas: ${passed} | Advertencias: ${warnings.length} | Fallos: ${failures.length}`);

  const hasMissingFeatures = results.some(
    (r) => r.name.includes('/api/organization/features') && r.status === 'FAIL'
  );
  const hasMissingShareAuth = results.some(
    (r) => r.name.includes('/api/auth/share-authorization') && r.status === 'FAIL'
  );

  if (failures.length > 0) {
    log('\n🚨 INCOMPATIBILIDADES O FALLOS DETECTADOS:');
    if (hasMissingFeatures) {
      log(' • CLIENTE: GET /api/organization/features no está disponible en la API actual.');
      log('   Causa directa del error: "No se pudo confirmar la configuración de simulación del servidor."');
    }
    if (hasMissingShareAuth) {
      log(' • WORKER: POST /api/auth/share-authorization no está disponible en la API actual.');
      log('   El Cloudflare Worker no puede autenticar la publicación y respondería con HTTP 503.');
    }
    log('\n❌ ESTADO: INCOMPATIBLE. Se requiere actualizar y coordinar los servicios.');
    log('================================================================\n');
    return { success: false, results };
  }

  if (warnings.length > 0) {
    log('\n⚠️  ESTADO: COBERTURA PARCIAL O ADVERTENCIAS. No acredita compatibilidad completa para producción.');
    log('================================================================\n');
    return { success: false, results };
  }

  log('\n✅ ESTADO: COMPROBACIONES EJECUTADAS APROBADAS.');
  log('================================================================\n');
  return { success: true, results };
}

// Standalone CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const isLocal = args.includes('--local');

  function getArgValue(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  }

  const apiUrl = (
    getArgValue('--api') ||
    process.env.API_URL ||
    (isLocal ? 'http://127.0.0.1:3000' : 'https://solarsim.electsun.net')
  ).replace(/\/+$/, '');

  const workerUrl = (
    getArgValue('--worker') ||
    process.env.WORKER_URL ||
    (isLocal ? 'http://127.0.0.1:8788' : 'https://propuesta.electsun.net')
  ).replace(/\/+$/, '');

  const authToken = getArgValue('--token') || process.env.QA_AUTH_TOKEN;

  runCompatibilityChecks({ apiUrl, workerUrl, authToken })
    .then(({ success }) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Error fatal al ejecutar comprobador de compatibilidad:', err);
      process.exit(1);
    });
}
