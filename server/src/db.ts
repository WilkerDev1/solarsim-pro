import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'solarsim-db',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'solarsim_user',
  password: process.env.DB_PASSWORD || 'solarsim_secret_2026',
  database: process.env.DB_NAME || 'solarsim_prod',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initDatabase(): Promise<void> {
  console.log('🔄 Verificando y creando esquemas de base de datos PostgreSQL...');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Tabla de Organizaciones (Empresas)
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        rnc VARCHAR(32),
        plan VARCHAR(32) DEFAULT 'enterprise',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Insertar organización por defecto si no existe
    await client.query(`
      INSERT INTO organizations (id, name, rnc, plan)
      VALUES ('org-electsun-default', 'Electsun Dominicana', '1-31-12345-6', 'enterprise')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Tabla de Usuarios
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'EDITOR', -- 'ADMIN', 'EDITOR', 'LECTOR'
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 3. Tabla de Proyectos Fotovoltaicos Versionados
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(128) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        created_by_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        created_by_name VARCHAR(255) NOT NULL,
        created_by_email VARCHAR(255),
        last_modified_by_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        last_modified_by_name VARCHAR(255) NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        project_code VARCHAR(64),
        system_capacity_kwp NUMERIC(10, 2) DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        data_json JSONB NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Índices de búsqueda y sincronización rápida
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_org_updated ON projects(organization_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_projects_client_name ON projects(client_name);
      CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // 4. Tabla de Auditoría de Sincronización
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_audit_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        project_id VARCHAR(128),
        action VARCHAR(64) NOT NULL, -- 'PUSH', 'PULL', 'CREATE', 'UPDATE', 'DELETE', 'CONFLICT'
        details JSONB,
        ip_address VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 5. Tabla de Catálogo Global de Equipos Fotovoltaicos (Paneles, Inversores, Baterías)
    await client.query(`
      CREATE TABLE IF NOT EXISTS equipment_catalog (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE,
        type VARCHAR(32) NOT NULL,
        brand VARCHAR(128) NOT NULL,
        model_series VARCHAR(128) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        power_w NUMERIC(10, 2),
        power_kw NUMERIC(10, 2),
        capacity_kwh NUMERIC(10, 2),
        voltage_v NUMERIC(8, 2),
        dod_pct NUMERIC(5, 2),
        efficiency_pct NUMERIC(5, 2),
        temp_coeff NUMERIC(5, 4),
        category VARCHAR(64),
        voltage_mppt VARCHAR(64),
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_equipment_org_type ON equipment_catalog(organization_id, type);
      CREATE INDEX IF NOT EXISTS idx_equipment_display ON equipment_catalog(display_name);
    `);

    await client.query('COMMIT');
    console.log('✅ Esquemas de base de datos PostgreSQL inicializados con éxito.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al inicializar tablas en PostgreSQL:', error);
    throw error;
  } finally {
    client.release();
  }
}
