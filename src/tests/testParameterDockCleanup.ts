import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

// --- El dock no recibe ni lee isDark: el modo oscuro vive en los tokens pd-* ---
{
  const files = [...walk('src/components/simulator/sidebar'), ...walk('src/components/simulator/params')];
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), /isDark/, `${file} sin isDark`);
  const view = readFileSync('src/components/simulator/SimulatorView.tsx', 'utf8');
  assert.doesNotMatch(view, /isDark|sidebarTheme/, 'SimulatorView ya no calcula isDark para el dock');
}

// --- «Categorías de Configuración» usa los mismos nombres, orden e iconos que el dock ---
{
  const panel = readFileSync('src/components/simulator/sidebar/ParameterDockPanel.tsx', 'utf8');
  const dock = [...panel.matchAll(/^\s+\w+: \{ title: '([^']+)', icon: <(\w+) /gm)].map((m) => [m[1], m[2]]);
  assert.equal(dock.length, 5, 'el dock declara 5 secciones');

  const prefs = readFileSync('src/components/settings/sections/SimulationPreferencesSection.tsx', 'utf8');
  const tariffs = readFileSync('src/components/settings/sections/TariffPreferencesPanel.tsx', 'utf8');
  const order = ['Proyecto y cliente', 'Tarifas', 'Equipamiento', 'Costos y margen', 'Finanzas'];
  const icons: Record<string, string> = {
    'Proyecto y cliente': 'User',
    Tarifas: 'Receipt',
    Equipamiento: 'Sun',
    'Costos y margen': 'DollarSign',
    Finanzas: 'Landmark',
  };
  assert.deepEqual(dock.map(([title]) => title), order, 'nombres y orden del dock');
  assert.deepEqual(Object.fromEntries(dock), icons, 'iconos del dock');

  // Tarifas vive en su propio panel; las otras cuatro, en la sección de preferencias.
  assert.match(tariffs, />Tarifas</, 'preferencias: Tarifas');
  assert.match(tariffs, /<Receipt className/, 'icono de preferencias: Tarifas');
  const positions = order.map((t) => (t === 'Tarifas' ? prefs.indexOf('<TariffPreferencesPanel') : prefs.indexOf(`>${t}<`)));
  assert.ok(positions.every((p) => p >= 0), 'las 5 categorías existen en preferencias');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'mismo orden en las preferencias');
  for (const title of order.filter((t) => t !== 'Tarifas')) {
    const at = prefs.indexOf(`>${title}<`);
    assert.match(prefs.slice(Math.max(0, at - 400), at), new RegExp(`<${icons[title]} className`), `icono de preferencias: ${title}`);
  }
}

console.log('testParameterDockCleanup: ok');
