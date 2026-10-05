import assert from 'node:assert/strict';
import {mkdtemp,readFile,lstat,symlink,rm,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../',import.meta.url));
const script=path.join(root,'scripts/qa/prepareRotationSecrets.ts');
const temp=await mkdtemp(path.join(os.tmpdir(),'solarsim-secret-guard-qa-'));
const invoke=(cwd,destination)=>spawnSync(process.execPath,['--import',require.resolve('tsx'),script,destination],{cwd,encoding:'utf8'});
try {
 for(const cwd of [root,path.join(root,'server'),temp]) {
  const unsafe=path.join(root,`qa-secret-should-not-exist-${path.basename(temp)}`);
  assert.notEqual(invoke(cwd,unsafe).status,0);
  await assert.rejects(access(unsafe),'Unsafe directories must not be created');
 }
 const linked=path.join(temp,'checkout-link');
 await symlink(root,linked,process.platform==='win32'?'junction':'dir');
 assert.notEqual(invoke(temp,path.join(linked,'unsafe-secret')).status,0);
 await assert.rejects(access(path.join(root,'unsafe-secret')));
 const safe=path.join(temp,'candidate');
 assert.equal(invoke(temp,safe).status,0);
 const contents=await readFile(path.join(safe,'next-secrets.env'),'utf8');
 assert.match(contents,/^JWT_SECRET=[a-f0-9]{96}\nDB_PASSWORD=[a-f0-9]{64}\n$/);
 if(process.platform!=='win32') {
  assert.equal((await lstat(safe)).mode & 0o777,0o700);
  assert.equal((await lstat(path.join(safe,'next-secrets.env'))).mode & 0o777,0o600);
 }
 assert.notEqual(invoke(temp,safe).status,0,'Existing private directories are never reused');
 console.log('Secret generator boundaries passed: checkout/subdirectory/outside cwd, symlinks, private permissions and exclusive creation.');
} finally {await rm(temp,{recursive:true,force:true});}
