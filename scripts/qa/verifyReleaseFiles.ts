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
assert.equal(await readFile('release/update.json','utf8'),await readFile('release/latest.json','utf8'));
console.log('PASS: six native packages, hashes/sizes, Windows blockmap and updater metadata.');
