/** Stop incomplete releases before any draft/assets are published. */
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {verifyPackageHash} from '../../electron/updater/releaseVerification';
const pkg=JSON.parse(await readFile('package.json','utf8'));
const manifest=JSON.parse(await readFile('release/latest.json','utf8'));
assert.equal(manifest.version,pkg.version);
const descriptors=[...Object.values(manifest.downloads.windows),...Object.values(manifest.downloads.linux)] as Array<{fileName:string;sha256:string;size:number}|null>;
assert.equal(descriptors.length,6);
for(const item of descriptors) {
  assert.ok(item,'All six OS packages are required for an official release');
  assert.equal(path.basename(item.fileName),item.fileName);
  await verifyPackageHash(path.join('release',item.fileName),item.sha256,item.size);
}
for(const file of ['latest.yml','latest-linux.yml',`SolarSim-Pro-Setup-${pkg.version}.exe.blockmap`]) assert.ok((await stat(path.join('release',file))).size>0);
const alias=`solarsim-pro_${pkg.version}_amd64.deb`;
await verifyPackageHash(path.join('release',alias),manifest.downloads.linux.deb.sha256,manifest.downloads.linux.deb.size);
const uploadNames=[...descriptors.map(item=>item!.fileName),alias,'latest.json','update.json','latest.yml','latest-linux.yml',`SolarSim-Pro-Setup-${pkg.version}.exe.blockmap`];
assert.equal(new Set(uploadNames.map(name=>name.toLowerCase())).size,uploadNames.length,'GitHub asset names must be unique ignoring case');
assert.equal(await readFile('release/update.json','utf8'),await readFile('release/latest.json','utf8'));
console.log('PASS: six native packages, hashes/sizes, Windows blockmap and updater metadata.');
