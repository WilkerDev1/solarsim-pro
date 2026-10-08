import assert from 'node:assert/strict';
import {proposalFileType, aiWorkspaceKey} from '../components/common/ai-invoice/workspace';
import {useSimulationStore} from '../store/useSimulationStore';
const state=useSimulationStore.getState();
assert.equal(proposalFileType({name:'invoice.pdf',type:'',size:100}),'application/pdf');
assert.throws(()=>proposalFileType({name:'invoice.pdf',type:'image/png',size:100}),/coincidentes/);
assert.throws(()=>proposalFileType({name:'invoice.exe',type:'application/pdf',size:100}),/coincidentes/);
assert.throws(()=>proposalFileType({name:'invoice.pdf',type:'application/pdf',size:9*1024*1024}),/8 MB/);
assert.throws(()=>proposalFileType({name:'invoice.pdf',type:'application/pdf',size:0}),/vacío/);
const key=aiWorkspaceKey(state);
assert.notEqual(aiWorkspaceKey({...state,sessionGeneration:state.sessionGeneration+1}),key);
assert.notEqual(aiWorkspaceKey({...state,syncSettings:{...state.syncSettings,serverUrl:'https://other.example'}}),key);
// Refreshing the token alone must not discard an in-progress draft in the same session.
assert.equal(aiWorkspaceKey({...state,syncSettings:{...state.syncSettings,authToken:'renewed-synthetic'}}),key);
console.log('PASS: attachment metadata boundaries and workspace session invalidation.');
