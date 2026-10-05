/** Development-only visual fixture. No authentication, transport or production data. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ConflictResolutionModal} from '../../../src/components/common/ConflictResolutionModal';
import {ProjectActionsMenu} from '../../../src/components/dashboard/ProjectActionsMenu';
import {useSimulationStore} from '../../../src/store/useSimulationStore';
import {BENCHMARK_PROJECT} from '../../../src/engine/referenceCase';
import '../../../src/index.css';
const project={...structuredClone(BENCHMARK_PROJECT),id:'qa-deleted',client:{...BENCHMARK_PROJECT.client,name:'QA — Cambios locales conservados',projectId:'SP-QA-STATE'},organizationId:'qa',syncServerUrl:'https://example.invalid',syncStatus:'conflict' as const};
const conflict={scope:'https://example.invalid|qa',reason:'deleted',projectId:project.id,localVersion:1,serverVersion:0,localProject:project,serverProject:{...project,isDeleted:true},lastModifiedByName:'',lastModifiedAt:'',diffs:[]};
const deleted=new URLSearchParams(location.search).get('state')==='deleted-viewer';
useSimulationStore.setState({sidebarTheme:'light',projects:[project],syncSettings:{serverUrl:'https://example.invalid',authToken:'synthetic-test-only',autoSyncEnabled:false,lastSyncTimestamp:null,currentUser:{id:'qa',organizationId:'qa',name:'QA',email:'qa@example.invalid',role:'VIEWER'}},projectConflicts:{[conflict.scope+'|'+project.id]:conflict},activeConflict:deleted ? conflict : null,openProjectConflict:async()=>{await new Promise(resolve=>setTimeout(resolve,6000));return {success:false,error:'QA: consulta interrumpida; copia local conservada.'};}});
createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-slate-50 p-12 text-slate-900"><h1 className="mb-8 text-xl font-semibold">QA aislada de estados de conflicto</h1><div className="flex max-w-md items-center justify-between rounded-lg border bg-white p-5"><span>{project.client.name}</span><ProjectActionsMenu project={project}/></div><ConflictResolutionModal/></main>);
