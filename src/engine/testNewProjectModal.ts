import { useSimulationStore } from '../store/useSimulationStore';

console.log('=== RUNNING NEW PROJECT MODAL & STORE TEST ===');

// 1. Initial state
const store = useSimulationStore.getState();
const initialCount = store.projects.length;
console.log(`Initial projects count: ${initialCount}`);

// 2. Open Modal
store.openNewProjectModal();
console.log(`Modal open state: ${useSimulationStore.getState().isNewProjectModalOpen}`);
if (!useSimulationStore.getState().isNewProjectModalOpen) {
  throw new Error('openNewProjectModal failed to set isNewProjectModalOpen to true');
}

// 3. Create Project with Name Only
const testName = 'Proyecto Solar Test 2026';
store.createNewProject({
  name: testName,
  province: 'Santo Domingo / Distrito Nacional',
  distributor: 'EDEESTE',
  tariffCode: 'BTS2',
  address: 'Santo Domingo, República Dominicana',
});

const updatedStore = useSimulationStore.getState();
const newCount = updatedStore.projects.length;
console.log(`Updated projects count: ${newCount}`);
if (newCount !== initialCount + 1) {
  throw new Error(`Expected ${initialCount + 1} projects, found ${newCount}`);
}

const activeProj = updatedStore.getActiveProject();
console.log(`Active Project Name: "${activeProj?.client.name}"`);
if (activeProj?.client.name !== testName) {
  throw new Error(`Expected active project name to be "${testName}", got "${activeProj?.client.name}"`);
}

// 4. Verify Financial Summary calculations for new project
const summary = updatedStore.getFinancialSummary();
console.log(`New Project DC Capacity: ${summary.systemCapacityKWp} kWp`);
console.log(`New Project Payback: ${summary.paybackYears} years`);
console.log(`New Project NPV: $${summary.npvUSD}`);
console.log(`New Project IRR: ${summary.irrPct}%`);

if (summary.systemCapacityKWp <= 0 || isNaN(summary.paybackYears)) {
  throw new Error('Financial summary calculation failed for new project');
}

console.log('=== TEST COMPLETED SUCCESSFULLY ✅ ===');
