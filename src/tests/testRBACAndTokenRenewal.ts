// @ts-ignore
import jwt from '../../server/node_modules/jsonwebtoken/index.js';

const BASE_URL = 'https://solarsim.electsun.net';
const JWT_SECRET = 'solarsim_enterprise_jwt_secret_key_2026';

async function runRBACTests() {
  console.log('===============================================================');
  console.log('🧪 SUITE DE PRUEBAS: RBAC, AUDITORÍA DE CUENTAS & AUTO-RENOVACIÓN');
  console.log('===============================================================');

  const timestamp = Date.now();
  const adminEmail = `admin_test_${timestamp}@electsun.test`;
  const editorEmail = `editor_test_${timestamp}@electsun.test`;
  const lectorEmail = `lector_test_${timestamp}@electsun.test`;
  const viewerEmail = `viewer_test_${timestamp}@electsun.test`;

  // 1. Registro de Admin Supremo
  console.log('\n--- 1. Registro de Admin Supremo ---');
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: adminEmail,
      password: 'adminPassword123!',
      name: 'Wilker Capellán (Admin)',
      organizationName: `Electsun Empresa ${timestamp}`,
    }),
  });
  const regData = await regRes.json();
  if (!regRes.ok || !regData.success) {
    throw new Error(`Fallo registro admin: ${JSON.stringify(regData)}`);
  }
  const adminToken = regData.token;
  const adminUser = regData.user;
  console.log('✅ Admin registrado exitosamente:', adminUser.name, '| Rol:', adminUser.role);

  // 2. Prueba de Auto-Renovación con Token Expirado pero Criptográficamente Válido
  console.log('\n--- 2. Prueba de Auto-Renovación con Token Expirado ---');
  // Generar token expirado (hace 5 días)
  const expiredAdminToken = jwt.sign(
    {
      id: adminUser.id,
      email: adminUser.email,
      organizationId: adminUser.organizationId,
      role: adminUser.role,
      name: adminUser.name,
    },
    JWT_SECRET,
    { expiresIn: '-5d' }
  );

  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${expiredAdminToken}` },
  });
  const renewedHeader = meRes.headers.get('x-renewed-token');
  const meData = await meRes.json();
  if (meRes.status !== 200 || !meData.success || !renewedHeader) {
    throw new Error(`Fallo auto-renovación de token expirado: Status ${meRes.status}, Body: ${JSON.stringify(meData)}`);
  }
  console.log('✅ Token expirado detectado y auto-renovado por el servidor');
  console.log('   Cabecera X-Renewed-Token presente:', !!renewedHeader);

  // 3. Admin lista los miembros de la empresa
  console.log('\n--- 3. Listado de Miembros por Admin (GET /api/users) ---');
  const listRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const listData = await listRes.json();
  if (listRes.status !== 200 || !listData.success) {
    throw new Error(`Fallo listado de usuarios: ${JSON.stringify(listData)}`);
  }
  console.log(`✅ Admin obtuvo lista de miembros: ${listData.users.length} miembros encontrados`);

  // 4. Admin crea un Editor
  console.log('\n--- 4. Creación de Usuario EDITOR ---');
  const createEditorRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Ing. Laura Gómez (Editor)',
      email: editorEmail,
      password: 'editorPassword123!',
      role: 'EDITOR',
    }),
  });
  const createEditorData = await createEditorRes.json();
  if (createEditorRes.status !== 200 || !createEditorData.success) {
    throw new Error(`Fallo crear editor: ${JSON.stringify(createEditorData)}`);
  }
  const editorUser = createEditorData.user;
  console.log('✅ Usuario EDITOR creado con éxito:', editorUser.name, '| Rol:', editorUser.role);

  // 5. Admin crea un Lector
  console.log('\n--- 5. Creación de Usuario LECTOR ---');
  const createLectorRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Sr. Roberto Díaz (Lector)',
      email: lectorEmail,
      password: 'lectorPassword123!',
      role: 'LECTOR',
    }),
  });
  const createLectorData = await createLectorRes.json();
  if (createLectorRes.status !== 200 || !createLectorData.success) {
    throw new Error(`Fallo crear lector: ${JSON.stringify(createLectorData)}`);
  }
  const lectorUser = createLectorData.user;
  console.log('✅ Usuario LECTOR creado con éxito:', lectorUser.name, '| Rol:', lectorUser.role);

  // 6. Admin crea un Viewer (verificar normalización a LECTOR)
  console.log('\n--- 6. Creación de Usuario VIEWER (Normalización a LECTOR) ---');
  const createViewerRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Dra. Elena Silva (Viewer)',
      email: viewerEmail,
      password: 'viewerPassword123!',
      role: 'VIEWER',
    }),
  });
  const createViewerData = await createViewerRes.json();
  if (createViewerRes.status !== 200 || !createViewerData.success) {
    throw new Error(`Fallo crear viewer: ${JSON.stringify(createViewerData)}`);
  }
  const viewerUser = createViewerData.user;
  if (viewerUser.role !== 'LECTOR') {
    throw new Error(`Se esperaba rol LECTOR pero se obtuvo: ${viewerUser.role}`);
  }
  console.log('✅ Rol VIEWER normalizado correctamente a LECTOR:', viewerUser.role);

  // 7. Login de Editor y Lector para obtener sus tokens
  const loginEditorRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: editorEmail, password: 'editorPassword123!' }),
  });
  const editorToken = (await loginEditorRes.json()).token;

  const loginLectorRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: lectorEmail, password: 'lectorPassword123!' }),
  });
  const lectorToken = (await loginLectorRes.json()).token;

  // 8. Auditoría RBAC: Editor intentando crear usuarios (Debe fallar con 403)
  console.log('\n--- 8. Verificación de Seguridad: EDITOR intentando crear usuarios ---');
  const editorCreateUserRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
    body: JSON.stringify({
      name: 'Hack User',
      email: `hack_${timestamp}@electsun.test`,
      password: 'hackPassword!',
      role: 'ADMIN',
    }),
  });
  if (editorCreateUserRes.status !== 403) {
    throw new Error(`Seguridad comprometida: EDITOR pudo llamar a POST /api/users! Status: ${editorCreateUserRes.status}`);
  }
  console.log('✅ Acceso denegado correctamente (HTTP 403): Solo ADMIN puede crear usuarios');

  // 9. Auditoría RBAC: LECTOR intentando crear usuarios (Debe fallar con 403)
  console.log('\n--- 9. Verificación de Seguridad: LECTOR intentando crear usuarios ---');
  const lectorCreateUserRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lectorToken}` },
    body: JSON.stringify({
      name: 'Hack User 2',
      email: `hack2_${timestamp}@electsun.test`,
      password: 'hackPassword!',
      role: 'ADMIN',
    }),
  });
  if (lectorCreateUserRes.status !== 403) {
    throw new Error(`Seguridad comprometida: LECTOR pudo llamar a POST /api/users! Status: ${lectorCreateUserRes.status}`);
  }
  console.log('✅ Acceso denegado correctamente (HTTP 403): LECTOR bloqueado para gestionar usuarios');

  // 10. Auditoría RBAC: LECTOR intentando subir proyectos (POST /api/sync/push)
  console.log('\n--- 10. Verificación de Seguridad: LECTOR intentando subir proyectos ---');
  const lectorPushRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lectorToken}` },
    body: JSON.stringify({
      projects: [
        {
          id: `proj-lector-${timestamp}`,
          client: { name: 'Intento Lector' },
          specs: {},
          rates: {},
        },
      ],
    }),
  });
  if (lectorPushRes.status !== 403) {
    throw new Error(`Seguridad comprometida: LECTOR pudo hacer push! Status: ${lectorPushRes.status}`);
  }
  console.log('✅ Acceso denegado correctamente (HTTP 403): LECTOR bloqueado para modificar proyectos en la nube');

  // 11. Auditoría RBAC: EDITOR subiendo proyectos (Debe permitirse)
  console.log('\n--- 11. EDITOR subiendo proyecto legítimo ---');
  const editorPushRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
    body: JSON.stringify({
      projects: [
        {
          id: `proj-editor-${timestamp}`,
          client: {
            name: 'Residencial Cacicazgos',
            projectId: 'SP-2026-0099',
            province: 'Distrito Nacional',
            distributor: 'EDESUR',
            tariffCode: 'BTS1',
          },
          specs: { panelCount: 16, panelPowerW: 620 },
          rates: { targetCoveragePct: 90 },
        },
      ],
    }),
  });
  const editorPushData = await editorPushRes.json();
  if (editorPushRes.status !== 200 || !editorPushData.success) {
    throw new Error(`Fallo push de EDITOR: ${JSON.stringify(editorPushData)}`);
  }
  console.log('✅ EDITOR subió propuesta con éxito (HTTP 200)');

  // 12. Admin actualiza rol de EDITOR a LECTOR
  console.log('\n--- 12. Admin cambia rol de Laura Gómez de EDITOR a LECTOR ---');
  const updateRoleRes = await fetch(`${BASE_URL}/api/users/${editorUser.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ role: 'LECTOR' }),
  });
  const updateRoleData = await updateRoleRes.json();
  if (updateRoleRes.status !== 200 || !updateRoleData.success) {
    throw new Error(`Fallo cambiar rol: ${JSON.stringify(updateRoleData)}`);
  }
  console.log('✅ Rol de usuario actualizado a LECTOR por el Admin');

  // 13. Admin cambia contraseña de usuario
  console.log('\n--- 13. Admin restablece contraseña de usuario ---');
  const updatePwdRes = await fetch(`${BASE_URL}/api/users/${editorUser.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ password: 'newSuperPassword2026!' }),
  });
  if (updatePwdRes.status !== 200) {
    throw new Error(`Fallo restablecer contraseña: Status ${updatePwdRes.status}`);
  }
  // Verificar nuevo login con la nueva contraseña
  const loginNewPwdRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: editorEmail, password: 'newSuperPassword2026!' }),
  });
  if (loginNewPwdRes.status !== 200) {
    throw new Error('Fallo login con la nueva contraseña restablecida');
  }
  console.log('✅ Contraseña restablecida y validada con nuevo login');

  // 14. Admin desactiva usuario (isActive = false)
  console.log('\n--- 14. Admin desactiva cuenta de usuario ---');
  const deactivateRes = await fetch(`${BASE_URL}/api/users/${editorUser.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ isActive: false }),
  });
  if (deactivateRes.status !== 200) {
    throw new Error(`Fallo desactivar usuario: Status ${deactivateRes.status}`);
  }

  // Verificar que el usuario desactivado ya NO puede iniciar sesión
  const loginDeactivatedRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: editorEmail, password: 'newSuperPassword2026!' }),
  });
  const loginDeactivatedData = await loginDeactivatedRes.json();
  if ((loginDeactivatedRes.status !== 403 && loginDeactivatedRes.status !== 401) || !loginDeactivatedData.error?.includes('desactivada')) {
    throw new Error(`Seguridad comprometida: usuario desactivado pudo ingresar! ${JSON.stringify(loginDeactivatedData)}`);
  }
  console.log('✅ Cuenta desactivada bloqueada correctamente al intentar iniciar sesión');

  console.log('\n===============================================================');
  console.log('🎉 AUDITORÍA COMPLETA: TODOS LOS ROLES Y PERMISOS FUNCIONAN AL 100%');
  console.log('===============================================================');
}

runRBACTests().catch((err) => {
  console.error('\n❌ ERROR EN AUDITORÍA RBAC:', err);
  process.exit(1);
});
