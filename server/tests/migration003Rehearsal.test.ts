import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { migrateDatabase } from "../src/database/migrations.js";
import { resolveMembership } from "../src/membership.js";

const exec = promisify(execFile);
const container = `solarsim-migration003-rehearsal-${crypto.randomUUID()}`;
let pool: pg.Pool;

before(async () => {
  await exec("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_USER=solarsim_test",
    "--env",
    "POSTGRES_PASSWORD=isolated-test-only",
    "--env",
    "POSTGRES_DB=solarsim_test",
    "postgres:16-alpine",
  ]);

  const portOutput = await exec("docker", ["port", container, "5432/tcp"]);
  const port = Number(portOutput.stdout.trim().split(":").at(-1));

  pool = new pg.Pool({
    host: "127.0.0.1",
    port,
    user: "solarsim_test",
    password: "isolated-test-only",
    database: "solarsim_test",
    connectionTimeoutMillis: 1000,
  });

  // Wait for postgres to accept connections
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch {
      await delay(200);
    }
  }

  // Set up the exact legacy production 2.2.0 schema matching solarsim_prod (NO schema_migrations, NO 002/003 columns)
  await pool.query(`
    CREATE TABLE organizations (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      rnc VARCHAR(32),
      plan VARCHAR(32) DEFAULT 'enterprise',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE users (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'EDITOR',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE projects (
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      deleted_by VARCHAR(255)
    );

    CREATE TABLE equipment_catalog (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE,
      type VARCHAR(32) NOT NULL,
      brand VARCHAR(128) NOT NULL,
      model_series VARCHAR(128) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      power_w NUMERIC,
      power_kw NUMERIC,
      capacity_kwh NUMERIC,
      voltage_v NUMERIC,
      dod_pct NUMERIC,
      efficiency_pct NUMERIC,
      temp_coeff NUMERIC,
      category VARCHAR(32),
      voltage_mppt VARCHAR(64),
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      supplier_prices JSONB DEFAULT '[]'::jsonb
    );

    CREATE TABLE project_version_history (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(128) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      label VARCHAR(255) NOT NULL,
      notes TEXT,
      type VARCHAR(32),
      author_id VARCHAR(64),
      author_name VARCHAR(255) NOT NULL,
      author_email VARCHAR(255),
      system_capacity_kwp NUMERIC,
      net_investment_usd NUMERIC,
      data_json JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE team_notifications (
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE sync_audit_logs (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
      project_id VARCHAR(128),
      action VARCHAR(64) NOT NULL,
      details JSONB,
      ip_address VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE utility_tariffs (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      resolution_code VARCHAR(64) NOT NULL,
      effective_date DATE,
      tariffs_json JSONB NOT NULL,
      updated_by VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Populate synthetic production-like baseline data across ALL 8 tables
  await pool.query(`
    INSERT INTO organizations (id, name, rnc, plan) VALUES 
      ('org-electsun-default', 'Electsun Dominicana', '131-12345-6', 'enterprise'),
      ('org-partner-solar', 'Partner Solar Pro', '101-98765-4', 'enterprise'),
      ('org-commercial-rd', 'Comercial Dominicana Solar', '132-55555-1', 'enterprise');

    INSERT INTO users (id, organization_id, name, email, password_hash, role) VALUES
      ('usr-admin-1', 'org-electsun-default', 'Admin Electsun', 'admin@electsun.invalid', 'hash1', 'ADMIN'),
      ('usr-editor-1', 'org-electsun-default', 'Editor Electsun', 'editor@electsun.invalid', 'hash2', 'EDITOR'),
      ('usr-reader-1', 'org-electsun-default', 'Lector Electsun', 'reader@electsun.invalid', 'hash3', 'LECTOR'),
      ('usr-partner-admin', 'org-partner-solar', 'Admin Partner', 'admin@partner.invalid', 'hash4', 'ADMIN');

    INSERT INTO projects (
      id, organization_id, created_by_id, created_by_name, created_by_email,
      last_modified_by_id, last_modified_by_name, client_name, project_code,
      system_capacity_kwp, version, data_json, is_deleted, deleted_at, deleted_by
    ) VALUES
      (
        'proj-001', 'org-electsun-default', 'usr-editor-1', 'Editor Electsun', 'editor@electsun.invalid',
        'usr-editor-1', 'Editor Electsun', 'Juan Perez', 'SP-2026-001', 12.00, 1,
        '{"client":{"name":"Juan Perez","rnc":"001-11111-1"},"specs":{"panelCount":20,"panelPowerW":600},"financials":{"discount":500,"taxCredit40":true},"monthlyConsumption":[1200,1300,1100,1400,1500,1600,1700,1650,1550,1400,1300,1250]}'::jsonb,
        false, null, null
      ),
      (
        'proj-002', 'org-electsun-default', 'usr-admin-1', 'Admin Electsun', 'admin@electsun.invalid',
        'usr-admin-1', 'Admin Electsun', 'Distribuidora X', 'SP-2026-002', 80.00, 3,
        '{"client":{"name":"Distribuidora X"},"specs":{"panelCount":130,"panelPowerW":615},"financials":{"taxCredit40":true},"monthlyConsumption":[8000,8500,8200,9000,9500,9200,9100,8900,8800,8700,8600,8500]}'::jsonb,
        false, null, null
      ),
      (
        'proj-003', 'org-partner-solar', 'usr-partner-admin', 'Admin Partner', 'admin@partner.invalid',
        'usr-partner-admin', 'Admin Partner', 'Carlos Ruiz', 'SP-2026-003', 25.00, 2,
        '{"client":{"name":"Carlos Ruiz"},"specs":{"panelCount":40,"panelPowerW":625},"monthlyConsumption":[2500,2600,2400,2700,2800,2750,2650,2550,2500,2450,2400,2350]}'::jsonb,
        false, null, null
      ),
      (
        'proj-trash-004', 'org-electsun-default', 'usr-editor-1', 'Editor Electsun', 'editor@electsun.invalid',
        'usr-editor-1', 'Editor Electsun', 'Cliente Eliminado', 'SP-2026-004', 5.00, 1,
        '{"client":{"name":"Cliente Eliminado"},"specs":{"panelCount":8}}'::jsonb,
        true, '2026-10-01T12:00:00Z', 'usr-editor-1'
      );

    INSERT INTO equipment_catalog (
      id, organization_id, type, brand, model_series, display_name, power_w, power_kw, capacity_kwh, details, supplier_prices
    ) VALUES
      (
        'eq-panel-01', 'org-electsun-default', 'panel', 'Canadian Solar', 'TOPBiHiKu6',
        'Canadian Solar 615W TOPCon', 615, 0.615, null,
        '{"voc":46.5,"isc":16.8,"efficiency":22.8}'::jsonb,
        '[{"supplier":"Distribuidor A","priceUSD":92.5,"updatedAt":"2026-10-01"},{"supplier":"Distribuidor B","priceUSD":95.0,"updatedAt":"2026-10-02"}]'::jsonb
      ),
      (
        'eq-inverter-01', 'org-electsun-default', 'inverter', 'LuxpowerTek', 'LXP-LB-US',
        'Luxpower 12kW Split Phase Híbrido', null, 12.0, null,
        '{"mpptCount":3,"maxDcVoltage":600}'::jsonb,
        '[{"supplier":"Mayorista Solar","priceUSD":2450.0}]'::jsonb
      ),
      (
        'eq-battery-01', 'org-electsun-default', 'battery', 'HinaESS', 'PowerGem Max',
        'HinaESS PowerGem Max 16.08kWh LiFePO4', null, null, 16.08,
        '{"dod":0.9,"nominalV":51.2,"capacityAh":314}'::jsonb,
        '[{"supplier":"Almacen Hina","priceUSD":3100.0}]'::jsonb
      );

    INSERT INTO project_version_history (
      id, project_id, version_number, label, notes, type, author_id, author_name, system_capacity_kwp, net_investment_usd, data_json
    ) VALUES
      ('pvh-001', 'proj-002', 1, 'Versión Inicial', 'Diseño preliminar', 'manual', 'usr-admin-1', 'Admin Electsun', 60.0, 45000.0, '{"version":1,"kwp":60}'::jsonb),
      ('pvh-002', 'proj-002', 2, 'Adición Baterías', 'Incorporado banco BESS', 'auto', 'usr-admin-1', 'Admin Electsun', 80.0, 62000.0, '{"version":2,"kwp":80}'::jsonb);

    INSERT INTO team_notifications (
      id, organization_id, user_id, project_id, project_code, client_name, author_name, action, message, read
    ) VALUES
      ('notif-001', 'org-electsun-default', 'usr-admin-1', 'proj-001', 'SP-2026-001', 'Juan Perez', 'Editor Electsun', 'CREATE', 'Propuesta creada', true),
      ('notif-002', 'org-electsun-default', 'usr-editor-1', 'proj-002', 'SP-2026-002', 'Distribuidora X', 'Admin Electsun', 'UPDATE', 'Capacidad actualizada a 80kWp', false);

    INSERT INTO sync_audit_logs (user_id, project_id, action, details, ip_address) VALUES
      ('usr-editor-1', 'proj-001', 'PUSH', '{"version":1,"status":"created"}'::jsonb, '127.0.0.1'),
      ('usr-admin-1', 'proj-002', 'UPDATE', '{"version":3,"status":"updated"}'::jsonb, '127.0.0.1');

    INSERT INTO utility_tariffs (id, organization_id, resolution_code, effective_date, tariffs_json, updated_by) VALUES
      (
        'tariff-sie-2026', 'org-electsun-default', 'SIE-176-2025-TF', '2026-01-01',
        '{"EDEESTE":{"BTS1":{"energy":7.48},"BTS2":{"energy":12.18},"BTD":{"energy":14.22}},"EDESUR":{"BTS1":{"energy":7.48},"BTS2":{"energy":12.18}}}'::jsonb,
        'usr-admin-1'
      );
  `);
});

after(async () => {
  if (pool) await pool.end();
  await exec("docker", ["rm", "-f", container]).catch(() => {});
});

test("Comprehensive Migration 003 rehearsal: preserves all 8 business tables, complex JSON, idempotency and memberships", async () => {
  // 1. Capture comprehensive pre-migration state across all 8 tables
  const countTable = async (table: string) =>
    Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

  const orgCountBefore = await countTable("organizations");
  const userCountBefore = await countTable("users");
  const projectCountBefore = await countTable("projects");
  const equipmentCountBefore = await countTable("equipment_catalog");
  const historyCountBefore = await countTable("project_version_history");
  const notifCountBefore = await countTable("team_notifications");
  const auditCountBefore = await countTable("sync_audit_logs");
  const tariffCountBefore = await countTable("utility_tariffs");

  assert.equal(orgCountBefore, 3);
  assert.equal(userCountBefore, 4);
  assert.equal(projectCountBefore, 4);
  assert.equal(equipmentCountBefore, 3);
  assert.equal(historyCountBefore, 2);
  assert.equal(notifCountBefore, 2);
  assert.equal(auditCountBefore, 2);
  assert.equal(tariffCountBefore, 1);

  // Content fingerprints (JSON + business attributes)
  const projectFingerprintBefore = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || version::text || ':' || client_name || ':' || data_json::text, '|' ORDER BY id)) AS fp FROM projects",
    )
  ).rows[0].fp;

  const equipmentFingerprintBefore = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || brand || ':' || display_name || ':' || supplier_prices::text, '|' ORDER BY id)) AS fp FROM equipment_catalog",
    )
  ).rows[0].fp;

  const historyFingerprintBefore = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || project_id || ':' || version_number::text || ':' || data_json::text, '|' ORDER BY id)) AS fp FROM project_version_history",
    )
  ).rows[0].fp;

  const tariffFingerprintBefore = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || resolution_code || ':' || tariffs_json::text, '|' ORDER BY id)) AS fp FROM utility_tariffs",
    )
  ).rows[0].fp;

  const userFingerprintBefore = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || email || ':' || role || ':' || is_active::text, '|' ORDER BY id)) AS fp FROM users",
    )
  ).rows[0].fp;

  // 2. Execute migration sequence (001 baseline -> 002 feature policy -> 003 company management)
  await migrateDatabase(pool);

  // 3. Verify schema_migrations has recorded all 3 migrations in correct sequence
  const appliedMigrations = (
    await pool.query(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    )
  ).rows;

  assert.deepEqual(appliedMigrations, [
    { version: 1, name: "baseline" },
    { version: 2, name: "feature_policy_and_tombstones" },
    { version: 3, name: "company_management" },
  ]);

  // 4. Verify ZERO data loss: row counts of all 8 tables are strictly preserved
  assert.equal(
    await countTable("organizations"),
    orgCountBefore,
    "organizations count preserved",
  );
  assert.equal(
    await countTable("users"),
    userCountBefore,
    "users count preserved",
  );
  assert.equal(
    await countTable("projects"),
    projectCountBefore,
    "projects count preserved",
  );
  assert.equal(
    await countTable("equipment_catalog"),
    equipmentCountBefore,
    "equipment_catalog count preserved",
  );
  assert.equal(
    await countTable("project_version_history"),
    historyCountBefore,
    "project_version_history count preserved",
  );
  assert.equal(
    await countTable("team_notifications"),
    notifCountBefore,
    "team_notifications count preserved",
  );
  assert.equal(
    await countTable("sync_audit_logs"),
    auditCountBefore,
    "sync_audit_logs count preserved",
  );
  assert.equal(
    await countTable("utility_tariffs"),
    tariffCountBefore,
    "utility_tariffs count preserved",
  );

  // 5. Verify bit-exact preservation of JSON documents and critical relations
  const projectFingerprintAfter = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || version::text || ':' || client_name || ':' || data_json::text, '|' ORDER BY id)) AS fp FROM projects",
    )
  ).rows[0].fp;
  assert.equal(
    projectFingerprintAfter,
    projectFingerprintBefore,
    "Project JSON and metadata intact",
  );

  const equipmentFingerprintAfter = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || brand || ':' || display_name || ':' || supplier_prices::text, '|' ORDER BY id)) AS fp FROM equipment_catalog",
    )
  ).rows[0].fp;
  assert.equal(
    equipmentFingerprintAfter,
    equipmentFingerprintBefore,
    "Equipment specs and supplier prices intact",
  );

  const historyFingerprintAfter = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || project_id || ':' || version_number::text || ':' || data_json::text, '|' ORDER BY id)) AS fp FROM project_version_history",
    )
  ).rows[0].fp;
  assert.equal(
    historyFingerprintAfter,
    historyFingerprintBefore,
    "Version history JSON intact",
  );

  const tariffFingerprintAfter = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || resolution_code || ':' || tariffs_json::text, '|' ORDER BY id)) AS fp FROM utility_tariffs",
    )
  ).rows[0].fp;
  assert.equal(
    tariffFingerprintAfter,
    tariffFingerprintBefore,
    "Utility tariffs JSON intact",
  );

  const userFingerprintAfter = (
    await pool.query(
      "SELECT md5(string_agg(id || ':' || email || ':' || role || ':' || is_active::text, '|' ORDER BY id)) AS fp FROM users",
    )
  ).rows[0].fp;
  assert.equal(
    userFingerprintAfter,
    userFingerprintBefore,
    "User identities and roles intact",
  );

  // 6. Verify newly created columns have defensive, secure defaults
  const orgDefaults = (
    await pool.query(
      "SELECT id, feature_policy_version, feature_settings, profile_version, company_profile FROM organizations ORDER BY id",
    )
  ).rows;

  for (const org of orgDefaults) {
    assert.equal(org.feature_policy_version, 1);
    assert.deepEqual(org.feature_settings, {
      selfConsumptionProjection: false,
    });
    assert.equal(org.profile_version, 1);
    assert.deepEqual(org.company_profile, {});
  }

  const userDefaults = (await pool.query("SELECT id, auth_version FROM users"))
    .rows;
  for (const u of userDefaults) {
    assert.equal(u.auth_version, 0, "Default user auth_version is 0");
  }

  // 7. Verify primary memberships resolve seamlessly without data migration required
  const adminContext = await resolveMembership(
    pool,
    "usr-admin-1",
    "org-electsun-default",
  );
  assert.ok(adminContext);
  assert.equal(adminContext.role, "ADMIN");
  assert.equal(adminContext.organizationName, "Electsun Dominicana");

  const editorContext = await resolveMembership(
    pool,
    "usr-editor-1",
    "org-electsun-default",
  );
  assert.ok(editorContext);
  assert.equal(editorContext.role, "EDITOR");

  const readerContext = await resolveMembership(
    pool,
    "usr-reader-1",
    "org-electsun-default",
  );
  assert.ok(readerContext);
  assert.equal(readerContext.role, "LECTOR");

  // Unauthorized access to another organization must be rejected
  const crossOrgDenied = await resolveMembership(
    pool,
    "usr-editor-1",
    "org-partner-solar",
  );
  assert.equal(
    crossOrgDenied,
    null,
    "Cross-organization access rejected without membership",
  );

  // 8. Verify secondary memberships can be created, honored, and revoked in migration 003 table
  await pool.query(
    "INSERT INTO organization_memberships (organization_id, user_id, role, is_active) VALUES ($1, $2, $3, TRUE)",
    ["org-partner-solar", "usr-editor-1", "EDITOR"],
  );

  const secondaryAccess = await resolveMembership(
    pool,
    "usr-editor-1",
    "org-partner-solar",
  );
  assert.ok(secondaryAccess);
  assert.equal(secondaryAccess.role, "EDITOR");
  assert.equal(secondaryAccess.organizationId, "org-partner-solar");

  // Revoke secondary membership
  await pool.query(
    "UPDATE organization_memberships SET is_active=FALSE WHERE organization_id=$1 AND user_id=$2",
    ["org-partner-solar", "usr-editor-1"],
  );
  const revokedAccess = await resolveMembership(
    pool,
    "usr-editor-1",
    "org-partner-solar",
  );
  assert.equal(revokedAccess, null, "Inactive membership access rejected");

  // Primary membership must remain intact even if secondary is revoked
  const primaryRemains = await resolveMembership(
    pool,
    "usr-editor-1",
    "org-electsun-default",
  );
  assert.ok(primaryRemains);
  assert.equal(primaryRemains.role, "EDITOR");

  // 9. Verify IDEMPOTENCY: Re-running migrateDatabase must produce zero side-effects
  await migrateDatabase(pool);

  const replayedMigrations = (
    await pool.query(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    )
  ).rows;
  assert.deepEqual(
    replayedMigrations,
    appliedMigrations,
    "Replaying migration preserves exact version history",
  );

  // Counts and fingerprints must remain identical after replay
  assert.equal(await countTable("projects"), projectCountBefore);
  assert.equal(
    (
      await pool.query(
        "SELECT md5(string_agg(id || ':' || version::text || ':' || client_name || ':' || data_json::text, '|' ORDER BY id)) AS fp FROM projects",
      )
    ).rows[0].fp,
    projectFingerprintBefore,
  );
});
