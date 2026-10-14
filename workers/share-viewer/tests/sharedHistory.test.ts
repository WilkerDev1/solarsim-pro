import assert from 'node:assert/strict';
import { createShareViewer } from '../src/index';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { calculateProjectFinancialSummary } from '../../../src/engine/financeEngine';
async function main() {
const rows = new Map<string,string>();
const kv = {
  get: async (key: string) => rows.get(key) ?? null,
  put: async (key: string, value: string) => { rows.set(key,value); },
  list: async ({ prefix,cursor }: { prefix: string;cursor?:string }) => {
    const all = [...rows.keys()].filter(k => k.startsWith(prefix)).sort();
    const offset = cursor ? Number(cursor) : 0;
    const end = Math.min(offset+1,all.length);
    return { keys:all.slice(offset,end).map(name => ({ name })),list_complete:end===all.length,cursor:String(end) };
  },
};
const env: any = { AUTH_API_URL:'https://auth.example.test',PROPOSALS_KV:kv };
let rejectContent = false;
const originalPut = kv.put;
kv.put = async (key, value) => { if (rejectContent && key.startsWith('proposal:')) throw new Error('Synthetic storage failure'); await originalPut(key, value); };
let actor = { userId:'editor-a',userName:'Ana',organizationId:'org-a' };
const app = createShareViewer(async input => {
  assert.ok(String(input).endsWith('share-authorization') || String(input).endsWith('share-history-authorization'));
  return Response.json({ success:true,...actor,authors:[{id:'editor-old',name:'Luis'}],featurePolicy:{version:1,settings:{selfConsumptionProjection:false}} });
});
const request = (path:string, method='GET',body?:unknown) => app.request('https://worker.example.test'+path,{method,headers:{Authorization:'Bearer signed.session.test','Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})},env);
const payload = { project:BENCHMARK_PROJECT,summary:calculateProjectFinancialSummary(BENCHMARK_PROJECT),validityDays:7,calculationSnapshot:{mode:'legacy',organizationId:'org-a',policyVersion:1,capturedAt:new Date().toISOString()} };
rejectContent = true;
assert.equal((await request('/api/share','POST',payload)).status,500);
assert.equal(rows.size,0,'Failed body writes must not leave discoverable history entries');
rejectContent = false;
const published = await request('/api/share','POST',payload); assert.equal(published.status,200);
const link: any = await published.json();
const indexKey = `history:org-a:${link.id}`;
assert.ok(rows.has(indexKey));
// Expiring KV content never removes the shared audit register.
rows.delete(`proposal:${link.id}`);
actor = {userId:'lector-a',userName:'Lector',organizationId:'org-a'};
rows.set('history:org-a:00000000','invalid-json');
const damaged: any = await (await request('/api/share/history')).json(); assert.equal(damaged.success,true);
rows.delete('history:org-a:00000000');
const history: any = await (await request('/api/share/history')).json();
assert.equal(history.proposals[0].createdByName,'Ana');
assert.equal(history.proposals[0].createdById,'editor-a');
actor = {userId:'other',userName:'Otro',organizationId:'org-b'};
const foreign: any = await (await request('/api/share/history')).json(); assert.equal(foreign.proposals.length,0);
// Existing pre-index KV entries recover only with proven stored ownership.
rows.set('proposal:legacy11',JSON.stringify({ id:'legacy11',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),validityDays:1,project:BENCHMARK_PROJECT,summary:payload.summary,publishedBy:{userId:'editor-old',organizationId:'org-a'} }));
rows.set('proposal:unknown1',JSON.stringify({ id:'unknown1',expiresAt:new Date(Date.now()+86400000).toISOString(),project:BENCHMARK_PROJECT }));
actor = {userId:'lector-a',userName:'Lector',organizationId:'org-a'};
const recovered: any = await (await request('/api/share/history-recover')).json(); assert.equal(recovered.proposals[0].createdByName,'Luis');
assert.ok(rows.has('history:org-a:legacy11'));
const page: any = await (await request('/api/share/history?cursor=1')).json(); assert.equal(page.proposals.length,1);
assert.ok(!rows.has('history:org-a:unknown1'));
console.log('PASS: registro compartido, lectores, autor inmutable, expiración, aislamiento y recuperación paginada de enlaces antiguos.');

}
main().catch(error => { console.error(error); process.exitCode=1; });
