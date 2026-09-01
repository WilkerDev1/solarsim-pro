import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, initDatabase } from './db.js';

const app = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || 'solarsim_enterprise_jwt_secret_key_2026';
const PORT = parseInt(process.env.PORT || '3000');

// Middlewares
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}));

// Helper: Extraer y validar token JWT
async function authenticate(c: any): Promise<{ id: string; name: string; email: string; role: string; organizationId: string } | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload;
  } catch (err) {
    return null;
  }
}

// ----------------------------------------------------
// 1. Health Check
// ----------------------------------------------------
app.get('/api/health', async (c) => {
  try {
    const dbRes = await pool.query('SELECT 1 as healthy');
    return c.json({
      status: 'ok',
      service: 'SolarSim Pro Enterprise Sync Engine',
      version: '1.5.0',
      database: dbRes.rows[0].healthy === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return c.json({
      status: 'error',
      service: 'SolarSim Pro Enterprise Sync Engine',
      database: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// ----------------------------------------------------
// 2. Auth: Registro Inicial / Autenticación
// ----------------------------------------------------
app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json();
    const { name, email, password, organizationName, organizationRnc } = body;

    if (!name || !email || !password) {
      return c.json({ error: 'Nombre, correo electrónico y contraseña son obligatorios' }, 400);
    }

    const client = await pool.connect();
    try {
      // Verificar si ya existe el correo
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
      if (existing.rows.length > 0) {
        return c.json({ error: 'El correo electrónico ya está registrado en el sistema' }, 409);
      }

      let orgId = 'org-electsun-default';
      let role = 'ADMIN';
      if (organizationName) {
        orgId = `org-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await client.query(
          'INSERT INTO organizations (id, name, rnc, plan) VALUES ($1, $2, $3, $4)',
          [orgId, organizationName, organizationRnc || null, 'enterprise']
        );
      } else {
        const orgUsers = await client.query('SELECT COUNT(*) FROM users WHERE organization_id = $1', [orgId]);
        role = parseInt(orgUsers.rows[0].count) === 0 ? 'ADMIN' : 'EDITOR';
      }

      const userId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const passwordHash = await bcrypt.hash(password, 10);

      await client.query(
        `INSERT INTO users (id, organization_id, name, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [userId, orgId, name.trim(), email.toLowerCase().trim(), passwordHash, role]
      );

      const token = jwt.sign(
        { id: userId, name: name.trim(), email: email.toLowerCase().trim(), role, organizationId: orgId },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return c.json({
        success: true,
        message: 'Usuario registrado exitosamente',
        token,
        user: {
          id: userId,
          name: name.trim(),
          email: email.toLowerCase().trim(),
          role,
          organizationId: orgId,
        }
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error en register:', error);
    return c.json({ error: error.message || 'Error interno del servidor' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Correo y contraseña requeridos' }, 400);
    }

    const res = await pool.query(
      `SELECT u.id, u.organization_id, u.name, u.email, u.password_hash, u.role, u.is_active, o.name as org_name
       FROM users u
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (res.rows.length === 0) {
      return c.json({ error: 'Credenciales inválidas' }, 401);
    }

    const user = res.rows[0];
    if (!user.is_active) {
      return c.json({ error: 'Esta cuenta ha sido desactivada por el administrador' }, 403);
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return c.json({ error: 'Credenciales inválidas' }, 401);
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organization_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organization_id,
        organizationName: user.org_name
      }
    });
  } catch (error: any) {
    console.error('Error en login:', error);
    return c.json({ error: error.message || 'Error en inicio de sesión' }, 500);
  }
});

app.get('/api/auth/me', async (c) => {
  const authUser = await authenticate(c);
  if (!authUser) {
    return c.json({ error: 'No autorizado / Token inválido o expirado' }, 401);
  }

  const res = await pool.query(
    `SELECT u.id, u.organization_id, u.name, u.email, u.role, u.is_active, o.name as org_name
     FROM users u
     JOIN organizations o ON u.organization_id = o.id
     WHERE u.id = $1`,
    [authUser.id]
  );

  if (res.rows.length === 0 || !res.rows[0].is_active) {
    return c.json({ error: 'Usuario no encontrado o inactivo' }, 404);
  }

  const user = res.rows[0];
  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      organizationName: user.org_name
    }
  });
});

// ----------------------------------------------------
// 3. Gestión de Usuarios (RBAC - Solo ADMIN)
// ----------------------------------------------------
app.get('/api/users', async (c) => {
  const authUser = await authenticate(c);
  if (!authUser) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  const res = await pool.query(
    `SELECT id, name, email, role, is_active, created_at
     FROM users
     WHERE organization_id = $1
     ORDER BY created_at ASC`,
    [authUser.organizationId]
  );

  return c.json({ users: res.rows });
});

app.post('/api/users', async (c) => {
  const authUser = await authenticate(c);
  if (!authUser) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  if (authUser.role !== 'ADMIN') {
    return c.json({ error: 'Permisos insuficientes: solo un Administrador puede crear usuarios' }, 403);
  }

  const { name, email, password, role } = await c.req.json();
  if (!name || !email || !password) {
    return c.json({ error: 'Nombre, correo y contraseña son obligatorios' }, 400);
  }

  const validRole = ['ADMIN', 'EDITOR', 'LECTOR'].includes(role) ? role : 'EDITOR';

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing.rows.length > 0) {
    return c.json({ error: 'El correo electrónico ya está registrado' }, 409);
  }

  const userId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (id, organization_id, name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
    [userId, authUser.organizationId, name.trim(), email.toLowerCase().trim(), passwordHash, validRole]
  );

  return c.json({
    success: true,
    message: 'Usuario creado exitosamente',
    user: {
      id: userId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role: validRole,
      isActive: true
    }
  });
});

app.patch('/api/users/:id', async (c) => {
  const authUser = await authenticate(c);
  if (!authUser) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  if (authUser.role !== 'ADMIN') {
    return c.json({ error: 'Permisos insuficientes: solo un Administrador puede editar usuarios' }, 403);
  }

  const targetId = c.req.param('id');
  const body = await c.req.json();
  const { role, isActive, password } = body;

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (role && ['ADMIN', 'EDITOR', 'LECTOR'].includes(role)) {
    updates.push(`role = $${idx++}`);
    values.push(role);
  }
  if (typeof isActive === 'boolean') {
    updates.push(`is_active = $${idx++}`);
    values.push(isActive);
  }
  if (password && password.length >= 6) {
    const passwordHash = await bcrypt.hash(password, 10);
    updates.push(`password_hash = $${idx++}`);
    values.push(passwordHash);
  }

  if (updates.length === 0) {
    return c.json({ error: 'No se enviaron campos válidos para actualizar' }, 400);
  }

  updates.push(`updated_at = NOW()`);
  values.push(targetId);
  values.push(authUser.organizationId);

  await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx}`,
    values
  );

  return c.json({ success: true, message: 'Usuario actualizado exitosamente' });
});

// ----------------------------------------------------
// 4. Sincronización Delta-Sync (Offline-First)
// ----------------------------------------------------

interface ProjectRow {
  id: string;
  organization_id: string;
  created_by_id: string;
  created_by_name: string;
  created_by_email: string;
  last_modified_by_name: string;
  client_name: string;
  project_code: string;
  system_capacity_kwp: number;
  version: number;
  data_json: any;
  is_deleted: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

// Pull: Descargar proyectos de la organización (modelo colaborativo / servidor como fuente de verdad)
app.post('/api/sync/pull', async (c) => {
  const authUser = await authenticate(c);
  if (!authUser) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const lastSyncTimestamp = body.lastSyncTimestamp;

  // Si se pasa lastSyncTimestamp, filtra por cambios recientes; de lo contrario retorna el catálogo completo de la empresa
  let query = `
    SELECT id, organization_id, created_by_id, created_by_name, created_by_email,
           last_modified_by_id, last_modified_by_name, client_name, project_code, system_capacity_kwp,
           version, data_json, is_deleted, created_at, updated_at
    FROM projects
    WHERE organization_id = $1 AND is_deleted = FALSE
  `;
  const params: any[] = [authUser.organizationId];

  if (lastSyncTimestamp && lastSyncTimestamp !== '1970-01-01T00:00:00.000Z') {
    query += ` AND updated_at > $2`;
    params.push(lastSyncTimestamp);
  }

  query += ` ORDER BY updated_at DESC`;

  const res = await pool.query<ProjectRow>(query, params);

  const projects = res.rows.map((row: ProjectRow) => {
    const data = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json;
    const updatedAtIso = row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString();
    const createdAtIso = row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString();
    return {
      ...data,
      id: row.id,
      version: row.version,
      authorId: row.created_by_id,
      authorName: row.created_by_name,
      authorEmail: row.created_by_email,
      lastModifiedBy: row.last_modified_by_name,
      lastModifiedAt: updatedAtIso,
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
      syncStatus: 'synced',
      isDeleted: row.is_deleted,
    };
  });

  return c.json({
    success: true,
    serverTimestamp: new Date().toISOString(),
    projects,
    count: projects.length
  });
});

// Push: Subir cambios locales hacia el servidor con resolución inteligente de colisiones (V2, V3, V4...)
app.post('/api/sync/push', async (c) => {
  const authUser = await authenticate(c);
  if (!authUser) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  if (authUser.role === 'LECTOR') {
    return c.json({ error: 'Permisos insuficientes: los usuarios con rol Lector no pueden sincronizar cambios' }, 403);
  }

  const body = await c.req.json();
  const { projects } = body; // Array de proyectos modificados localmente

  if (!Array.isArray(projects) || projects.length === 0) {
    return c.json({ success: true, message: 'No hay proyectos para sincronizar', syncedCount: 0 });
  }

  const client = await pool.connect();
  const results: any[] = [];

  try {
    await client.query('BEGIN');

    for (const proj of projects) {
      const originalProjId = proj.id;
      let finalProjId = originalProjId;
      const clientName = proj.client?.name || 'Cliente';
      const projectCode = proj.client?.projectId || 'PRJ';
      const capacity = ((proj.specs?.panelPowerW || 0) * (proj.specs?.panelCount || 0)) / 1000;
      const isDeleted = proj.isDeleted || false;

      // Buscar si el ID de proyecto ya existe globalmente en PostgreSQL
      const existingRes = await client.query(
        'SELECT id, organization_id, version, updated_at, created_by_id, created_by_name, created_by_email, data_json FROM projects WHERE id = $1',
        [finalProjId]
      );

      if (existingRes.rows.length === 0) {
        // ID libre: Nuevo proyecto creado en el servidor
        const newVersion = 1;
        const authorId = proj.authorId || authUser.id;
        const authorName = proj.authorName || authUser.name;
        const authorEmail = proj.authorEmail || authUser.email;
        const dataJson = {
          ...proj,
          id: finalProjId,
          version: newVersion,
          authorId,
          authorName,
          authorEmail,
          lastModifiedBy: authUser.name,
          lastModifiedAt: new Date().toISOString(),
          syncStatus: 'synced',
        };

        await client.query(
          `INSERT INTO projects (
            id, organization_id, created_by_id, created_by_name, created_by_email,
            last_modified_by_id, last_modified_by_name, client_name, project_code,
            system_capacity_kwp, version, data_json, is_deleted, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
          [
            finalProjId, authUser.organizationId, authorId, authorName, authorEmail,
            authUser.id, authUser.name, clientName, projectCode, capacity,
            newVersion, JSON.stringify(dataJson), isDeleted
          ]
        );

        results.push({ id: finalProjId, originalId: originalProjId, status: 'created', version: newVersion });
      } else {
        const existing = existingRes.rows[0];
        const isSameOrg = existing.organization_id === authUser.organizationId;

        // Si se solicita forzar nueva versión o si el ID pertenece a otra organización:
        if (proj.forceNewVersion || !isSameOrg) {
          let vNum = 2;
          let candidateId = `${originalProjId}-v${vNum}`;
          while (true) {
            const checkRes = await client.query('SELECT id FROM projects WHERE id = $1', [candidateId]);
            if (checkRes.rows.length === 0) break;
            vNum++;
            candidateId = `${originalProjId}-v${vNum}`;
          }

          finalProjId = candidateId;
          const forkedCode = `${projectCode}-V${vNum}`;
          const forkedName = `${clientName} (V${vNum})`;
          const forkedData = {
            ...proj,
            id: finalProjId,
            version: 1,
            authorId: authUser.id,
            authorName: authUser.name,
            authorEmail: authUser.email,
            lastModifiedBy: authUser.name,
            lastModifiedAt: new Date().toISOString(),
            syncStatus: 'synced',
            client: {
              ...proj.client,
              name: forkedName,
              projectId: forkedCode,
            },
          };

          await client.query(
            `INSERT INTO projects (
              id, organization_id, created_by_id, created_by_name, created_by_email,
              last_modified_by_id, last_modified_by_name, client_name, project_code,
              system_capacity_kwp, version, data_json, is_deleted, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
            [
              finalProjId, authUser.organizationId, authUser.id, authUser.name, authUser.email,
              authUser.id, authUser.name, forkedName, forkedCode, capacity,
              1, JSON.stringify(forkedData), isDeleted
            ]
          );

          results.push({ id: finalProjId, originalId: originalProjId, status: 'forked', version: 1 });
        } else {
          // Actualización normal del proyecto existente dentro de la misma organización
          const newVersion = (existing.version || 1) + 1;
          const updatedData = {
            ...proj,
            id: finalProjId,
            version: newVersion,
            lastModifiedBy: authUser.name,
            lastModifiedAt: new Date().toISOString(),
            syncStatus: 'synced',
          };

          await client.query(
            `UPDATE projects SET
              last_modified_by_id = $1,
              last_modified_by_name = $2,
              client_name = $3,
              project_code = $4,
              system_capacity_kwp = $5,
              version = $6,
              data_json = $7,
              is_deleted = $8,
              updated_at = NOW()
            WHERE id = $9 AND organization_id = $10`,
            [
              authUser.id, authUser.name, clientName, projectCode, capacity,
              newVersion, JSON.stringify(updatedData), isDeleted, finalProjId, authUser.organizationId
            ]
          );

          results.push({ id: finalProjId, originalId: originalProjId, status: 'updated', version: newVersion });
        }
      }
    }

    await client.query('COMMIT');

    return c.json({
      success: true,
      message: `${results.length} propuesta(s) sincronizada(s) exitosamente`,
      serverTimestamp: new Date().toISOString(),
      results
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error en push sync:', error);
    return c.json({ error: error.message || 'Error al sincronizar proyectos' }, 500);
  } finally {
    client.release();
  }
});

// ----------------------------------------------------
// 5.1 Eliminar Proyecto Específico (Soft-Delete)
// ----------------------------------------------------
app.delete('/api/projects/:id', async (c) => {
  const authUser = await authenticate(c);
  if (!authUser) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  const id = c.req.param('id');
  const client = await pool.connect();
  try {
    const res = await client.query(
      `UPDATE projects
       SET is_deleted = TRUE,
           last_modified_by_id = $1,
           last_modified_by_name = $2,
           updated_at = NOW()
       WHERE id = $3 AND organization_id = $4
       RETURNING id`,
      [authUser.id, authUser.name, id, authUser.organizationId]
    );

    if (res.rows.length === 0) {
      return c.json({ error: 'Proyecto no encontrado' }, 404);
    }

    return c.json({ success: true, message: 'Proyecto marcado como eliminado' });
  } catch (error: any) {
    console.error('Error al eliminar proyecto:', error);
    return c.json({ error: error.message || 'Error en el servidor' }, 500);
  } finally {
    client.release();
  }
});

// ----------------------------------------------------
// 6. Equipos Fotovoltaicos: Catálogo Sincronizado
// ----------------------------------------------------
app.get('/api/equipment', async (c) => {
  const authUser = await authenticate(c);
  if (!authUser) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, type, brand, model_series as "modelSeries", display_name as "displayName",
              power_w as "powerW", power_kw as "powerKW", capacity_kwh as "capacityKWh",
              voltage_v as "voltageV", dod_pct as "dodPct", efficiency_pct as "efficiencyPct",
              temp_coeff as "tempCoeff", category, voltage_mppt as "voltageMPPT",
              details, created_at as "createdAt", updated_at as "updatedAt"
       FROM equipment_catalog
       WHERE organization_id = $1 OR organization_id = 'org-electsun-default'
       ORDER BY display_name ASC`,
      [authUser.organizationId]
    );

    return c.json({
      success: true,
      items: res.rows.map((row) => ({
        ...row,
        powerW: row.powerW ? parseFloat(row.powerW) : undefined,
        powerKW: row.powerKW ? parseFloat(row.powerKW) : undefined,
        capacityKWh: row.capacityKWh ? parseFloat(row.capacityKWh) : undefined,
        voltageV: row.voltageV ? parseFloat(row.voltageV) : undefined,
        dodPct: row.dodPct ? parseFloat(row.dodPct) : undefined,
        efficiencyPct: row.efficiencyPct ? parseFloat(row.efficiencyPct) : undefined,
        tempCoeff: row.tempCoeff ? parseFloat(row.tempCoeff) : undefined,
        ...(row.details || {}),
      })),
    });
  } catch (error: any) {
    console.error('Error al obtener catálogo de equipos:', error);
    return c.json({ error: error.message || 'Error al consultar equipos' }, 500);
  } finally {
    client.release();
  }
});

app.post('/api/equipment/batch', async (c) => {
  const authUser = await authenticate(c);
  if (!authUser) {
    return c.json({ error: 'No autorizado' }, 401);
  }

  const body = await c.req.json();
  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return c.json({ success: true, count: 0 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      const id = item.id || `eq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const type = item.type || 'panel';
      const brand = item.brand || 'Fabricante';
      const modelSeries = item.modelSeries || 'Modelo';
      const displayName = item.displayName || `${brand} ${modelSeries}`;
      const powerW = item.powerW || null;
      const powerKW = item.powerKW || null;
      const capacityKWh = item.capacityKWh || null;
      const voltageV = item.voltageV || null;
      const dodPct = item.dodPct || null;
      const efficiencyPct = item.efficiencyPct || null;
      const tempCoeff = item.tempCoeff || null;
      const category = item.category || null;
      const voltageMPPT = item.voltageMPPT || null;
      const details = JSON.stringify({
        voc: item.voc,
        isc: item.isc,
        vmp: item.vmp,
        imp: item.imp,
        annualDegradation: item.annualDegradation,
        cellType: item.cellType,
        bifacialityPct: item.bifacialityPct,
        maxAcPowerKW: item.maxAcPowerKW,
        maxPvPowerKW: item.maxPvPowerKW,
        maxEfficiencyPct: item.maxEfficiencyPct,
        mpptCount: item.mpptCount,
        capacityAh: item.capacityAh,
        batteryEfficiencyPct: item.batteryEfficiencyPct,
        cycles: item.cycles,
        chemistry: item.chemistry,
        maxChargeCurrentA: item.maxChargeCurrentA,
        maxDischargeCurrentA: item.maxDischargeCurrentA,
        dimensions: item.dimensions,
        weightKg: item.weightKg,
        isCustom: item.isCustom,
      });

      await client.query(
        `INSERT INTO equipment_catalog
          (id, organization_id, type, brand, model_series, display_name, power_w, power_kw, capacity_kwh, voltage_v, dod_pct, efficiency_pct, temp_coeff, category, voltage_mppt, details, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
         ON CONFLICT (id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          brand = EXCLUDED.brand,
          model_series = EXCLUDED.model_series,
          display_name = EXCLUDED.display_name,
          power_w = EXCLUDED.power_w,
          power_kw = EXCLUDED.power_kw,
          capacity_kwh = EXCLUDED.capacity_kwh,
          voltage_v = EXCLUDED.voltage_v,
          dod_pct = EXCLUDED.dod_pct,
          efficiency_pct = EXCLUDED.efficiency_pct,
          temp_coeff = EXCLUDED.temp_coeff,
          category = EXCLUDED.category,
          voltage_mppt = EXCLUDED.voltage_mppt,
          details = EXCLUDED.details,
          updated_at = NOW()`,
        [id, authUser.organizationId, type, brand, modelSeries, displayName, powerW, powerKW, capacityKWh, voltageV, dodPct, efficiencyPct, tempCoeff, category, voltageMPPT, details]
      );
    }

    await client.query('COMMIT');

    return c.json({
      success: true,
      message: `${items.length} equipos sincronizados en la nube`,
      count: items.length,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error al guardar equipos en la nube:', error);
    return c.json({ error: error.message || 'Error al guardar catálogo de equipos' }, 500);
  } finally {
    client.release();
  }
});

// Iniciar servidor HTTP
initDatabase()
  .then(() => {
    console.log(`🚀 SolarSim Pro Sync API corriendo en http://0.0.0.0:${PORT}`);
    serve({
      fetch: app.fetch,
      port: PORT,
      hostname: '0.0.0.0'
    });
  })
  .catch((err) => {
    console.error('❌ Error fatal al arrancar Sync API:', err);
  });
