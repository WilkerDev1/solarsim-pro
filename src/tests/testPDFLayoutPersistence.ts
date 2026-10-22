import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_LOCAL_COMPANY } from '../types/companyProfile';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { hydrateSimulationStore } from '../store/persistence/hydrateSimulationStore';
import { PDF_COLOR_THEMES } from '../constants/pdfThemes';
import {
  normalizeDocumentLayout,
  resolveSectionVisibility,
  showHeadersFooters,
  withSectionVisible,
} from '../../shared/documentLayout';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const store = () => useSimulationStore.getState();

// Pure rules: everything visible except the confidential cost matrix; only differences are stored.
const defaults = resolveSectionVisibility(undefined);
assert.equal(Object.keys(defaults).length, 12);
assert.equal(defaults.costMatrix, false);
assert.ok(Object.entries(defaults).every(([id, visible]) => id === 'costMatrix' || visible));
let layout = withSectionVisible(undefined, 'aboutUs', false);
assert.deepEqual(layout, { hiddenSections: ['aboutUs'] });
layout = withSectionVisible(layout, 'costMatrix', true);
assert.deepEqual(layout, { hiddenSections: ['aboutUs'], visibleSections: ['costMatrix'] });
assert.deepEqual(resolveSectionVisibility(layout), { ...defaults, aboutUs: false, costMatrix: true });
layout = withSectionVisible(withSectionVisible(layout, 'aboutUs', true), 'costMatrix', false);
assert.deepEqual(layout, {}, 'Volver al valor por defecto no deja rastro');
assert.deepEqual(normalizeDocumentLayout({ hiddenSections: ['aboutUs', 'inexistente', 'aboutUs'], visibleSections: 'x', themeId: 7, showHeadersFooters: 'si' }), { hiddenSections: ['aboutUs'] });
assert.equal(showHeadersFooters(undefined), true);
assert.equal(showHeadersFooters({ showHeadersFooters: false }), false);

// Persisted in the proposal, undoable, read-only in the trash.
useSimulationStore.setState({ companies: [DEFAULT_LOCAL_COMPANY], activeCompanyId: DEFAULT_LOCAL_COMPANY.id, projects: [], activeProjectId: '', documentTemplatesByCompany: {} });
store().createNewProject('Cliente Diseño');
const id = store().activeProjectId;
assert.equal(store().getActiveProject().customization?.layout, undefined, 'Una propuesta nueva no guarda diseño');
store().setActiveProject(id, 'simulator');
await wait(700);
const theme = PDF_COLOR_THEMES[2];
store().setDocumentLayout({ ...withSectionVisible(undefined, 'techIntro', false), themeId: theme.id, showHeadersFooters: false });
assert.deepEqual(store().getActiveProject().customization?.layout, { hiddenSections: ['techIntro'], themeId: theme.id, showHeadersFooters: false });
store().setDocumentLayout({ themeId: PDF_COLOR_THEMES[1].id });
assert.deepEqual(store().getActiveProject().customization?.layout?.hiddenSections, ['techIntro'], 'Un parche conserva el resto del diseño');
await wait(700);
store().undo();
assert.equal(store().getActiveProject().customization?.layout, undefined, 'Deshacer revierte el diseño');
store().redo();
assert.deepEqual(store().getActiveProject().customization?.layout?.hiddenSections, ['techIntro']);

// Survives serialization / hydration (a reopened proposal keeps its sections, theme and header/footer).
const restored = { ...store(), ...JSON.parse(JSON.stringify(serializeSimulationStore(store()))) };
hydrateSimulationStore(restored);
const saved = restored.projects.find((project: { id: string }) => project.id === id)?.customization?.layout;
assert.deepEqual(saved?.hiddenSections, ['techIntro']);
assert.equal(saved?.showHeadersFooters, false);

// Trash: read-only.
const before = structuredClone(store().projects.find((project) => project.id === id)!.customization?.layout);
store().moveToTrash(id);
useSimulationStore.setState({ activeProjectId: id });
store().setDocumentLayout({ themeId: 'otro', showHeadersFooters: true });
assert.deepEqual(store().projects.find((project) => project.id === id)!.customization?.layout, before);

console.log('PASS: document layout rules, persistence, undo and trash guard.');
