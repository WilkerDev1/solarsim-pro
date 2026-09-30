import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../constants/defaultDocumentCustomization';

console.log('=== RUNNING PERMANENT PDF TEMPLATE & INLINE EDITING TEST ===');

const store = useSimulationStore.getState();

// 1. Initial State Check
console.log('1. Checking initial defaultDocumentCustomization state...');
const initialDefaultDoc = store.defaultDocumentCustomization;
if (!initialDefaultDoc) {
  throw new Error('defaultDocumentCustomization is missing in store initial state');
}
console.log(`Initial companyName: "${initialDefaultDoc.companyName}"`);

// 2. Test updateDefaultDocumentCustomization
console.log('2. Updating defaultDocumentCustomization directly...');
const customSlogan = 'Energía Solar de Alta Gama 2026';
const customWarranty = '30 Años de Rendimiento Garantizado';
store.updateDefaultDocumentCustomization({
  companySlogan: customSlogan,
  panelWarrantyText: customWarranty,
});

const updatedDefaults = useSimulationStore.getState().defaultDocumentCustomization;
if (updatedDefaults.companySlogan !== customSlogan) {
  throw new Error(`Expected companySlogan to be "${customSlogan}", got "${updatedDefaults.companySlogan}"`);
}
if (updatedDefaults.panelWarrantyText !== customWarranty) {
  throw new Error(`Expected panelWarrantyText to be "${customWarranty}", got "${updatedDefaults.panelWarrantyText}"`);
}
console.log('Direct updateDefaultDocumentCustomization works! ✅');

// 3. Test that createNewProject inherits the new permanent default template
console.log('3. Testing createNewProject inherits permanent customization...');
store.createNewProject({
  name: 'Empresa Test Plantilla Permanente',
  province: 'Santiago',
  distributor: 'EDENORTE',
  tariffCode: 'BTD',
});

const activeProj = useSimulationStore.getState().getActiveProject();
if (!activeProj.customization) {
  throw new Error('Active project customization is undefined');
}
if (activeProj.customization.companySlogan !== customSlogan) {
  throw new Error(`Expected new project to have companySlogan "${customSlogan}", got "${activeProj.customization.companySlogan}"`);
}
if (activeProj.customization.panelWarrantyText !== customWarranty) {
  throw new Error(`Expected new project to have panelWarrantyText "${customWarranty}", got "${activeProj.customization.panelWarrantyText}"`);
}
console.log('New project successfully inherited permanent template customizations! ✅');

// 4. Test saveCurrentProjectAsDefaultDocumentTemplate
console.log('4. Testing saveCurrentProjectAsDefaultDocumentTemplate...');
// Modify the active project's customization
const customAboutUs = 'Somos pioneros en energía fotovoltaica e híbrida BESS en el Caribe.';
store.updateDocumentCustomization({
  aboutUsIntroText: customAboutUs,
  inverterWarrantyText: '12 Años de Garantía de Fábrica',
});

// Save active project as template
store.saveCurrentProjectAsDefaultDocumentTemplate();

const savedTemplate = useSimulationStore.getState().defaultDocumentCustomization;
if (savedTemplate.aboutUsIntroText !== customAboutUs) {
  throw new Error(`Expected saved template aboutUsIntroText to be "${customAboutUs}", got "${savedTemplate.aboutUsIntroText}"`);
}
if (savedTemplate.inverterWarrantyText !== '12 Años de Garantía de Fábrica') {
  throw new Error(`Expected saved template inverterWarrantyText to be "12 Años de Garantía de Fábrica", got "${savedTemplate.inverterWarrantyText}"`);
}
console.log('saveCurrentProjectAsDefaultDocumentTemplate works! ✅');

// 5. Test create another project and check it gets the updated template
console.log('5. Creating second project to verify inheritance...');
store.createNewProject({
  name: 'Segundo Cliente Nuevo',
  province: 'La Altagracia (Punta Cana / Higüey)',
  distributor: 'CEPM',
  tariffCode: 'MTD1',
});

const secondProj = useSimulationStore.getState().getActiveProject();
if (secondProj.customization?.aboutUsIntroText !== customAboutUs) {
  throw new Error(`Expected second project aboutUsIntroText to be "${customAboutUs}", got "${secondProj.customization?.aboutUsIntroText}"`);
}
console.log('Second project inherited the saved template! ✅');

// 6. Test resetDefaultDocumentCustomization
console.log('6. Testing resetDefaultDocumentCustomization...');
store.resetDefaultDocumentCustomization();
const resetDefaults = useSimulationStore.getState().defaultDocumentCustomization;
if (resetDefaults.companySlogan !== DEFAULT_DOCUMENT_CUSTOMIZATION.companySlogan) {
  throw new Error(`Expected reset companySlogan to be "${DEFAULT_DOCUMENT_CUSTOMIZATION.companySlogan}", got "${resetDefaults.companySlogan}"`);
}
console.log('resetDefaultDocumentCustomization restored factory defaults! ✅');

console.log('=== ALL PERMANENT PDF TEMPLATE TESTS PASSED SUCCESSFULLY! 🏆 ===');
