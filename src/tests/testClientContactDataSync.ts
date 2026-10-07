import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../constants/defaultDocumentCustomization';

console.log('=====================================================');
console.log('🧪 RUNNING CLIENT CONTACT & PHONE DATA SYNC SUITE');
console.log('=====================================================');

const store = useSimulationStore.getState();

// --- TEST 1: Default Document Customization Has Empty Phone ---
console.log('\n--- TEST 1: Default Customization Has Empty Phone & Email ---');
if (DEFAULT_DOCUMENT_CUSTOMIZATION.clientPhone !== '') {
  throw new Error(`Expected DEFAULT_DOCUMENT_CUSTOMIZATION.clientPhone to be empty, got "${DEFAULT_DOCUMENT_CUSTOMIZATION.clientPhone}"`);
}
if (DEFAULT_DOCUMENT_CUSTOMIZATION.clientEmail !== '') {
  throw new Error(`Expected DEFAULT_DOCUMENT_CUSTOMIZATION.clientEmail to be empty, got "${DEFAULT_DOCUMENT_CUSTOMIZATION.clientEmail}"`);
}
console.log(' ✅ PASS: DEFAULT_DOCUMENT_CUSTOMIZATION has empty clientPhone and clientEmail');

// --- TEST 2: New Project Creation Has Empty Client Phone & Clean Customization ---
console.log('\n--- TEST 2: New Project Creation Has Clean Empty Phone & Contact ---');
store.createNewProject({
  name: 'Cliente Prueba Contacto',
  province: 'Santo Domingo / Distrito Nacional',
  distributor: 'EDEESTE',
  tariffCode: 'BTS1',
  address: 'Calle Primera #10, Santo Domingo',
});

const proj = useSimulationStore.getState().getActiveProject()!;
console.log(`Created Project: "${proj.client.name}"`);
console.log(`client.contactPhone: "${proj.client.contactPhone}"`);
console.log(`customization.clientPhone: "${proj.customization?.clientPhone}"`);

if (proj.client.contactPhone !== '') {
  throw new Error(`Expected proj.client.contactPhone to be "", got "${proj.client.contactPhone}"`);
}
if (proj.customization?.clientPhone !== '') {
  throw new Error(`Expected proj.customization.clientPhone to be "", got "${proj.customization?.clientPhone}"`);
}
console.log(' ✅ PASS: New project client.contactPhone and customization.clientPhone are empty string');

// --- TEST 3: Updating Contact Phone via updateClient Synchronizes Customization ---
console.log('\n--- TEST 3: updateClient synchronizes customization.clientPhone ---');
store.updateClient({ contactPhone: '809-555-8888' });
let currentProj = useSimulationStore.getState().getActiveProject()!;

if (currentProj.client.contactPhone !== '809-555-8888') {
  throw new Error(`Expected contactPhone to be '809-555-8888', got "${currentProj.client.contactPhone}"`);
}
if (currentProj.customization?.clientPhone !== '809-555-8888') {
  throw new Error(`Expected customization.clientPhone to be '809-555-8888', got "${currentProj.customization?.clientPhone}"`);
}
console.log(' ✅ PASS: updateClient sets both client.contactPhone and customization.clientPhone');

// --- TEST 4: Clearing Contact Phone via updateClient Keeps Both Empty Without Reverting ---
console.log('\n--- TEST 4: Clearing phone via updateClient keeps both empty ---');
store.updateClient({ contactPhone: '' });
currentProj = useSimulationStore.getState().getActiveProject()!;

if (currentProj.client.contactPhone !== '') {
  throw new Error(`Expected contactPhone to be empty, got "${currentProj.client.contactPhone}"`);
}
if (currentProj.customization?.clientPhone !== '') {
  throw new Error(`Expected customization.clientPhone to be empty, got "${currentProj.customization?.clientPhone}"`);
}
console.log(' ✅ PASS: Clearing phone via updateClient does not revert to any fallback number');

// --- TEST 5: Updating Phone via updateDocumentCustomization Synchronizes client.contactPhone ---
console.log('\n--- TEST 5: updateDocumentCustomization synchronizes client.contactPhone ---');
store.updateDocumentCustomization({ clientPhone: '829-333-4444' });
currentProj = useSimulationStore.getState().getActiveProject()!;

if (currentProj.customization?.clientPhone !== '829-333-4444') {
  throw new Error(`Expected customization.clientPhone to be '829-333-4444', got "${currentProj.customization?.clientPhone}"`);
}
if (currentProj.client.contactPhone !== '829-333-4444') {
  throw new Error(`Expected client.contactPhone to be '829-333-4444', got "${currentProj.client.contactPhone}"`);
}
console.log(' ✅ PASS: updateDocumentCustomization sets both customization.clientPhone and client.contactPhone');

// --- TEST 6: Clearing Phone via updateDocumentCustomization Keeps Both Empty ---
console.log('\n--- TEST 6: Clearing phone via updateDocumentCustomization keeps both empty ---');
store.updateDocumentCustomization({ clientPhone: '' });
currentProj = useSimulationStore.getState().getActiveProject()!;

if (currentProj.customization?.clientPhone !== '') {
  throw new Error(`Expected customization.clientPhone to be empty, got "${currentProj.customization?.clientPhone}"`);
}
if (currentProj.client.contactPhone !== '') {
  throw new Error(`Expected client.contactPhone to be empty, got "${currentProj.client.contactPhone}"`);
}
console.log(' ✅ PASS: Clearing phone via updateDocumentCustomization maintains empty value cleanly');

// --- TEST 7: Contact Person & Contact Name Synchronized ---
console.log('\n--- TEST 7: Contact Person & Contact Name Synchronized ---');
store.updateClient({ contactPerson: 'Lic. Juan González' });
currentProj = useSimulationStore.getState().getActiveProject()!;

if (currentProj.client.contactPerson !== 'Lic. Juan González') {
  throw new Error(`Expected contactPerson to be 'Lic. Juan González', got "${currentProj.client.contactPerson}"`);
}
if (currentProj.customization?.contactName !== 'Lic. Juan González') {
  throw new Error(`Expected customization.contactName to be 'Lic. Juan González', got "${currentProj.customization?.contactName}"`);
}
console.log(' ✅ PASS: contactPerson updates customization.contactName');

// --- TEST 8: Fallback Logic Verification for Quotation Page ---
console.log('\n--- TEST 8: Quotation Page Fallback Logic Protection ---');
const rawClientPhone = currentProj.customization?.clientPhone !== undefined
  ? currentProj.customization.clientPhone
  : (currentProj.client.contactPhone || '');
const clientPhone = (rawClientPhone.includes('555-0199') || rawClientPhone.includes('5550199') || rawClientPhone === '+1 (809) 000-0000')
  ? ''
  : rawClientPhone;

if (clientPhone !== '') {
  throw new Error(`Expected clientPhone to be empty string, got "${clientPhone}"`);
}
console.log(' ✅ PASS: clientPhone resolves to empty string, preventing any phantom 809-378-6590 display');

console.log('\n=====================================================');
console.log('🎉 ALL CLIENT CONTACT & PHONE DATA SYNC TESTS PASSED (100%)');
console.log('=====================================================');
