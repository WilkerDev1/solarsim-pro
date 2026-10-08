/** Synthetic browser fixture: no Gemini or production requests, synthetic key only. */
import {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {AIInvoiceScannerModal} from '../../../src/components/common/ai-invoice/AIInvoiceScannerModal';
import {EquipmentManagerSettingsTab} from '../../../src/components/common/EquipmentManagerSettingsTab';
import {useSimulationStore} from '../../../src/store/useSimulationStore';
import {normalizeProposalDraft} from '../../../shared/aiProposal';
import '../../../src/index.css';
const catalog=useSimulationStore.getState().equipmentCatalog;
const panel=catalog.find(e=>e.type==='panel')!;
const other=catalog.filter(e=>e.type==='panel')[1] || panel;
const inverter=catalog.find(e=>e.type==='inverter')!;
useSimulationStore.setState({projects:[],activeProjectId:'',sidebarTheme:'light',isAIInvoiceModalOpen:true,geminiApiKey:'synthetic-fixture-key',syncSettings:{serverUrl:'https://example.invalid',authToken:null,currentUser:null,autoSyncEnabled:false,lastSyncTimestamp:null}});
const cancelled=new Set<string>();
window.electronAPI={parseInvoiceWithAI:async(payload:any)=>{
 await new Promise(resolve=>setTimeout(resolve,new URLSearchParams(location.search).has("slow") ? 30000 : 350));
 if(cancelled.has(payload.requestId))return {success:false,error:'Cancelado'};
 const raw=payload.context?.currentDraft || {clientName:'Oficina de ejemplo',province:'Santiago',distributor:'EDESUR',tariffCode:'BTD',monthlyConsumptionKWh:[421,352,300,510,639,669,711,663,890,648,528,372],energyCostPerKWhDOP:13.26,panels:[{id:panel.id,count:6,unitPriceUSD:105},{id:other.id,count:4,unitPriceUSD:110}],inverters:[{id:inverter.id,count:1,unitPriceUSD:2300}],commercial:{pricingMode:'cost_matrix',markupPct:40,installationTotalUSD:500,customItems:[{id:'qa-extra',description:'Protecciones y materiales (QA)',quantity:1,unit:'GL',unitPriceUSD:250,applyMargin:true,exonerateITBIS:false}],customDiscounts:[{id:'qa-discount',description:'Cortesía comercial (QA)',type:'fixed',value:100,target:'general'}]},batteries:[],hasBattery:false,aiReasoningSummary:'Borrador sintético: historial, costos y condiciones comerciales de QA.',nic:'QA-123456'};
 return {success:true,data:normalizeProposalDraft(raw,payload.equipmentCatalog,payload.context)};
},cancelAIRequest:async(id:string)=>{cancelled.add(id);return {success:true};}} as any;
function Fixture(){const state=useSimulationStore();useEffect(()=>{document.documentElement.classList.toggle("dark",state.sidebarTheme === "dark");},[state.sidebarTheme]);const inventory=new URLSearchParams(location.search).get('surface')==='inventory';return <div className={state.sidebarTheme==='dark'?'dark':''} style={{minHeight:'100vh',color:state.sidebarTheme==='dark'?'#f4f4f5':'#0b1c30',background:state.sidebarTheme==='dark'?'#17181b':'#f7f8fa',padding:24}}><nav style={{position:'fixed',bottom:0,left:0,zIndex:100,padding:6,background:'#fff',display:'flex',gap:12}}><button onClick={()=>useSimulationStore.setState({sidebarTheme:state.sidebarTheme==='dark'?'light':'dark'})}>Cambiar tema QA</button><button onClick={()=>useSimulationStore.setState({sessionGeneration:state.sessionGeneration+1})}>Cambiar sesión QA</button><button onClick={()=>useSimulationStore.setState({isAIInvoiceModalOpen:true})}>Abrir asistente QA</button><span>Propuestas QA: {state.projects.length}</span></nav>{inventory?<EquipmentManagerSettingsTab isDark={state.sidebarTheme === "dark"}/>:<AIInvoiceScannerModal/>}</div>}
const root=createRoot(document.getElementById('root')!);
root.render(<Fixture/>);
if(import.meta.hot) import.meta.hot.dispose(()=>root.unmount());
