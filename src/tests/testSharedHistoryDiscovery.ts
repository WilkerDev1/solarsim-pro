import assert from 'node:assert/strict';
const { useSimulationStore } = await import('../store/useSimulationStore');
const { ShareProposalService } = await import('../services/shareProposalService');
const realFetch = globalThis.fetch;
const initial = useSimulationStore.getState();
const session = { ...initial.syncSettings,serverUrl:'https://api.example.test',authToken:'test.jwt.token',autoSyncEnabled:false,currentUser:{ id:'reader',name:'Lector',email:'reader@example.test',role:'LECTOR' as const,organizationId:'org-team' } };
useSimulationStore.setState({ syncSettings:session,sessionGeneration:1 });
const entry = {id:'linked123',organizationId:'org-team',projectId:'project1',projectCode:'SP-1',quoteNumber:'C-1',clientName:'Cliente equipo',systemKWp:5,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),validityDays:1,createdById:'editor',createdByName:'Ana'};
try {
  let calls = 0;
  globalThis.fetch = async (_input,init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer test.jwt.token');calls++;
    return Response.json({ success:true,proposals:calls===1 ? [entry,{...entry,id:'foreign12',organizationId:'org-other'}] : [{...entry,id:'linked456'}],cursor:calls===1 ? 'next' : null });
  };
  const result = await ShareProposalService.syncSharedHistory();
  assert.equal(result.errors,0);assert.equal(calls,2);
  assert.equal(ShareProposalService.getSharedHistory().length,2);
  assert.equal(ShareProposalService.getSharedHistory()[0].createdByName,'Ana');
  ShareProposalService.deleteSharedRecord('linked123');
  calls=0;await ShareProposalService.syncSharedHistory();
  assert.ok(!ShareProposalService.getSharedHistory().some(r => r.id==='linked123'));
  // A Worker 401 renews on the API origin, then retries using its new token.
  let renewed = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://api.example.test/api/auth/refresh') {
      renewed = true;
      return Response.json({ success:true, token:'new.jwt.token' });
    }
    assert.ok(url.startsWith('https://propuesta.electsun.net/api/share/history'));
    if (new Headers(init?.headers).get('Authorization') === 'Bearer test.jwt.token') return Response.json({error:'Expired token'},{status:401});
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer new.jwt.token');
    return Response.json({success:true,proposals:[],cursor:null});
  };
  const refreshed = await ShareProposalService.syncSharedHistory();
  assert.equal(refreshed.errors,0); assert.equal(renewed,true);
  assert.equal(useSimulationStore.getState().syncSettings.authToken,'new.jwt.token');
  // Storage failures must not be reported as successfully discovered links.
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Synthetic quota exceeded'); };
  globalThis.fetch = async () => Response.json({success:true,proposals:[{...entry,id:'quota123'}],cursor:null});
  const quota = await ShareProposalService.syncSharedHistory();
  assert.equal(quota.errors,1); assert.equal(quota.updatedCount,0);
  localStorage.setItem = originalSetItem;
  // A response from the old identity must not contaminate another organization.
  globalThis.fetch = async () => { useSimulationStore.setState({ sessionGeneration:2,syncSettings:{...session,currentUser:{...session.currentUser,organizationId:'other'}} });return Response.json({success:true,proposals:[entry]}); };
  const stale = await ShareProposalService.syncSharedHistory();assert.equal(stale.updatedCount,0);assert.equal(ShareProposalService.getSharedHistory().length,0);
  console.log('PASS: descubrimiento compartido paginado, lector, autor, ámbito, ocultamiento local y respuestas tardías.');
} finally { globalThis.fetch=realFetch;useSimulationStore.setState(initial); }
