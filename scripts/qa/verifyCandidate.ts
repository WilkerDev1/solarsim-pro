/** Verify the actual candidate files with SolarSim's pinned release key. No install/network. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createReleaseVerifier,verifyPackageHash} from '../../electron/updater/releaseVerification';
const temp=await mkdtemp(path.join(os.tmpdir(),'solarsim-signature-qa-'));
try {
 const verify=await createReleaseVerifier(temp);
 const manifestFile=path.resolve('release/latest.json');
 await verify(manifestFile,manifestFile+'.sig');
 const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
 assert.equal(manifest.version,JSON.parse(await readFile('package.json','utf8')).version);
 for(const item of Object.values(manifest.downloads.linux) as Array<{fileName:string;sha256:string;size:number}>) {
  assert.ok(item);
  const file=path.resolve('release',item.fileName);
  await verify(file,file+'.sig');
  await verifyPackageHash(file,item.sha256,item.size);
 }
 for(const item of Object.values(manifest.downloads.windows) as Array<{fileName:string;sha256:string;size:number}>) {
  assert.ok(item);await verifyPackageHash(path.resolve('release',item.fileName),item.sha256,item.size);
 }
 await verify(path.resolve('release/update.json'),path.resolve('release/update.json.sig'));
 console.log('PASS: candidate version, pinned GPG signatures on both manifests and all Linux formats; size/SHA256 for all six packages. Windows hashes do not establish Authenticode signing.');
}finally{await rm(temp,{recursive:true,force:true});}
