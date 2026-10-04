import type { PoolClient } from "pg";
export async function baselineSchema(client: PoolClient): Promise<void> {
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
      VALUES ('org-electsun-default', 'Electsun Dominicana', NULL, 'enterprise')
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

      -- Soporte de papelera (soft-delete) y retención histórica
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);
      CREATE INDEX IF NOT EXISTS idx_projects_org_deleted ON projects(organization_id, is_deleted, deleted_at);
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

      -- Soporte de ofertas y precios multiproveedor
      ALTER TABLE equipment_catalog ADD COLUMN IF NOT EXISTS supplier_prices JSONB DEFAULT '[]'::jsonb;
      CREATE INDEX IF NOT EXISTS idx_equipment_supplier_prices ON equipment_catalog USING gin (supplier_prices);
      CREATE INDEX IF NOT EXISTS idx_equipment_brand ON equipment_catalog(brand);

      -- Sanitización defensiva de marcas para asegurar que ningún registro histórico carezca de marca
      UPDATE equipment_catalog
      SET brand = CASE
        WHEN display_name ILIKE '%weco%' THEN 'WeCo'
        WHEN display_name ILIKE '%luxpower%' OR display_name ILIKE '%lux power%' THEN 'LuxpowerTek'
        WHEN display_name ILIKE '%canadian%' THEN 'Canadian Solar'
        WHEN display_name ILIKE '%hinaess%' OR display_name ILIKE '%powergem%' THEN 'HinaESS'
        WHEN display_name ILIKE '%solis%' THEN 'Solis'
        WHEN display_name ILIKE '%huawei%' THEN 'Huawei'
        WHEN display_name ILIKE '%ja solar%' OR display_name ILIKE '%jam72%' THEN 'JA Solar'
        WHEN display_name ILIKE '%trina%' THEN 'Trina Solar'
        WHEN display_name ILIKE '%jinko%' THEN 'Jinko Solar'
        WHEN display_name ILIKE '%longi%' THEN 'LONGi Solar'
        WHEN display_name ILIKE '%deye%' THEN 'Deye'
        WHEN display_name ILIKE '%growatt%' THEN 'Growatt'
        WHEN display_name ILIKE '%sungrow%' THEN 'Sungrow'
        WHEN display_name ILIKE '%victron%' THEN 'Victron Energy'
        WHEN display_name ILIKE '%ion energy%' OR display_name ILIKE '%ion-lv%' THEN 'Ion Energy'
        ELSE 'General'
      END
      WHERE brand IS NULL OR brand = '';
    `);

  // 6. Tabla de Pliegos Tarifarios Eléctricos (SIE & CEPM)
  await client.query(`
      CREATE TABLE IF NOT EXISTS utility_tariffs (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        resolution_code VARCHAR(128) NOT NULL,
        effective_date DATE,
        tariffs_json JSONB NOT NULL,
        updated_by VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tariffs_org ON utility_tariffs(organization_id);
    `);

  // 7. Tabla Inmutable de Historial de Versiones Git (project_version_history)
  await client.query(`
      CREATE TABLE IF NOT EXISTS project_version_history (
        id VARCHAR(64) PRIMARY KEY,
        project_id VARCHAR(128) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        label VARCHAR(255) NOT NULL,
        notes TEXT,
        type VARCHAR(32) DEFAULT 'auto',
        author_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        author_name VARCHAR(255) NOT NULL,
        author_email VARCHAR(255),
        system_capacity_kwp NUMERIC(10, 2) DEFAULT 0,
        net_investment_usd NUMERIC(12, 2) DEFAULT 0,
        data_json JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pvh_project_version ON project_version_history(project_id, version_number);
    `);

  // 8. Tabla de Muro de Actividad y Notificaciones de Organización (team_notifications)
  await client.query(`
      CREATE TABLE IF NOT EXISTS team_notifications (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
        project_id VARCHAR(128) REFERENCES projects(id) ON DELETE CASCADE,
        project_code VARCHAR(64),
        client_name VARCHAR(255),
        author_name VARCHAR(255) NOT NULL,
        action VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_team_notif_org ON team_notifications(organization_id, created_at);
    `);
}
