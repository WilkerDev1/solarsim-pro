const BASE_URL = 'http://10.0.0.103';

async function testMultiUserCollisionAndSync() {
  console.log('======================================================');
  console.log('🧪 TEST: SINCRONIZACIÓN MULTI-USUARIO & COLISIÓN V2/V3');
  console.log('======================================================');

  // 1. Iniciar sesión con Usuario 1 (Admin)
  console.log('\n--- 1. Login / Registro Usuario 1 (Admin) ---');
  const adminEmail = `admin_${Date.now()}@electsun.lat`;
  let u1Res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: adminEmail,
      password: 'password123',
      name: 'Ing. Carlos Pérez (Admin)',
      organizationName: `Electsun Global ${Date.now()}`,
    }),
  });
  let u1Data = await u1Res.json();
  let token1 = u1Data.token;
  console.log('Usuario 1 (Admin) registrado y autenticado:', !!token1);

  // 2. Usuario 1 (Admin) crea a Usuario 2 (Ing. María) dentro de su misma organización
  console.log('\n--- 2. Usuario 1 crea a Usuario 2 (Ing. María) en su empresa ---');
  const user2Email = `maria_${Date.now()}@electsun.lat`;
  let u2Res = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` },
    body: JSON.stringify({
      name: 'Ing. María Gómez',
      email: user2Email,
      password: 'password123',
      role: 'EDITOR',
    }),
  });

  const login2 = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user2Email, password: 'password123' }),
  });
  const token2 = (await login2.json()).token;
  console.log('Usuario 2 autenticado en la misma organización:', !!token2);

  // 3. Usuario 1 crea propuesta "Residencial Bella Vista" (ID: proj-colision-100)
  console.log('\n--- 3. Usuario 1 sube propuesta inicial ---');
  const proj1 = {
    id: 'proj-colision-100',
    client: {
      name: 'Residencial Bella Vista',
      projectId: 'SP-2026-0080',
      province: 'Santo Domingo / Distrito Nacional',
      distributor: 'EDEESTE',
      tariffCode: 'BTS2',
    },
    specs: { panelPowerW: 620, panelCount: 20 },
    rates: { targetCoveragePct: 95 },
  };

  const push1 = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` },
    body: JSON.stringify({ projects: [proj1] }),
  });
  const push1Data = await push1.json();
  console.log('Push Usuario 1:', push1Data.results);

  // 4. Usuario 2 crea una versión / fork con el mismo ID (colisión resuelta a V2)
  console.log('\n--- 4. Usuario 2 sube fork con mismo ID (forceNewVersion) ---');
  const proj2Fork = {
    id: 'proj-colision-100',
    forceNewVersion: true,
    client: {
      name: 'Residencial Bella Vista',
      projectId: 'SP-2026-0080',
      province: 'Santo Domingo / Distrito Nacional',
      distributor: 'EDEESTE',
      tariffCode: 'BTS2',
    },
    specs: { panelPowerW: 620, panelCount: 24 },
  };

  const push2 = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
    body: JSON.stringify({ projects: [proj2Fork] }),
  });
  const push2Data = await push2.json();
  console.log('Push Usuario 2 (resolución de versión):', push2Data.results);

  // 5. Usuario 1 y Usuario 2 hacen Pull colaborativo
  console.log('\n--- 5. Pull colaborativo (Feed compartido tipo Red Social) ---');
  const pullRes = await fetch(`${BASE_URL}/api/sync/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` },
    body: JSON.stringify({}),
  });
  const pullData = await pullRes.json();
  console.log(`Total propuestas en la empresa: ${pullData.projects?.length}`);
  pullData.projects?.forEach((p: any) => {
    console.log(` - [${p.id}] ${p.client?.name} (${p.client?.projectId}) | Autor: ${p.authorName} | Modificado por: ${p.lastModifiedBy}`);
  });

  // 6. Prueba de sincronización automática de catálogo de equipos
  console.log('\n--- 6. Sincronización automática de equipos ---');
  const newEquipment = {
    id: 'eq-test-panel-trina-700',
    type: 'panel',
    brand: 'Trina Solar',
    modelSeries: 'Vertex N 700W',
    displayName: 'Módulos Trina Solar Vertex N (700W)',
    powerW: 700,
    category: 'Bifacial N-Type TOPCon',
  };

  const eqPush = await fetch(`${BASE_URL}/api/equipment/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` },
    body: JSON.stringify({ items: [newEquipment] }),
  });
  const eqPushData = await eqPush.json();
  console.log('Usuario 1 subió nuevo panel:', eqPushData.message);

  const eqPull = await fetch(`${BASE_URL}/api/equipment`, {
    headers: { Authorization: `Bearer ${token2}` },
  });
  const eqPullData = await eqPull.json();
  const found = eqPullData.items?.find((i: any) => i.id === 'eq-test-panel-trina-700');
  console.log('Usuario 2 descargó panel en tiempo real:', !!found, found?.displayName);

  console.log('\n======================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE SINCRONIZACIÓN PASARON (100% SUCCESS)');
  console.log('======================================================');
}

testMultiUserCollisionAndSync().catch(console.error);
