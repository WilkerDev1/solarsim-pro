/** Stop incomplete releases before any draft/assets are published. */
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {verifyPackageHash} from '../../electron/updater/releaseVerification';
// js-yaml is pinned in the packager/updater dependency tree used by npm ci.
const {load}=createRequire(import.meta.url)('js-yaml');
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
for(const [filename,primary,allowed] of [
  ['latest.yml',manifest.downloads.windows.installer,[manifest.downloads.windows.installer]],
  ['latest-linux.yml',manifest.downloads.linux.appimage,Object.values(manifest.downloads.linux)],
] as const) {
  const metadata=load(await readFile(path.join('release',filename),'utf8'));
  assert.equal(metadata.version,pkg.version,`${filename}: stale updater version`);
  assert.equal(metadata.path,primary.fileName,`${filename}: incorrect primary package`);
  assert.equal(metadata.sha512,primary.sha512,`${filename}: primary digest mismatch`);
  assert.ok(Array.isArray(metadata.files)&&metadata.files.length>0,`${filename}: missing files`);
  const seen=new Set<string>();
  for(const entry of metadata.files) {
    assert.equal(typeof entry.url,'string');
    assert.ok(!seen.has(entry.url),`${filename}: duplicate package`);
    seen.add(entry.url);
    const descriptor=(allowed as any[]).find(item=>item.fileName===entry.url);
    assert.ok(descriptor,`${filename}: unexpected package ${entry.url}`);
    assert.equal(entry.size,descriptor.size,`${filename}: incorrect size`);
    const digest=createHash('sha512').update(await readFile(path.join('release',entry.url))).digest('base64');
    assert.equal(entry.sha512,digest,`${filename}: incorrect SHA512`);
  }
  assert.ok(seen.has(primary.fileName),`${filename}: missing primary package entry`);
}
const alias=`solarsim-pro_${pkg.version}_amd64.deb`;
await verifyPackageHash(path.join('release',alias),manifest.downloads.linux.deb.sha256,manifest.downloads.linux.deb.size);
const uploadNames=[...descriptors.map(item=>item!.fileName),alias,'latest.json','update.json','latest.yml','latest-linux.yml',`SolarSim-Pro-Setup-${pkg.version}.exe.blockmap`];
assert.equal(new Set(uploadNames.map(name=>name.toLowerCase())).size,uploadNames.length,'GitHub asset names must be unique ignoring case');
assert.equal(await readFile('release/update.json','utf8'),await readFile('release/latest.json','utf8'));
console.log('PASS: six native packages, hashes/sizes, Windows blockmap and platform-specific updater versions/SHA512.');
