import {mkdtemp,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const asar=path.resolve(process.argv[2] || (process.platform==='win32' ? 'release/win-unpacked/resources/app.asar' : 'release/linux-unpacked/resources/app.asar'));
const directory=await mkdtemp(path.join(os.tmpdir(),'solarsim-runtime-qa-'));
const metadata=JSON.parse(await readFile('package.json','utf8'));
try {
 await writeFile(path.join(directory,'package.json'),JSON.stringify({name:'solarsim-runtime-qa',version:metadata.version,main:'test.cjs'}));
 await copyFile(new URL('electronRuntime.cjs',import.meta.url),path.join(directory,'test.cjs'));
 const env={...process.env,QA_APP_ASAR:asar}; delete env.ELECTRON_RUN_AS_NODE;
 const exitCode=await new Promise((resolve,reject)=>{const child=spawn(require('electron'),[directory, ...(process.env.CI === 'true' && process.platform === 'linux' ? ['--no-sandbox'] : [])],{env,stdio:'inherit',timeout:45000});child.on('error',reject);child.on('exit',code=>resolve(code ?? 1));});
 process.exitCode=exitCode;
} finally { await rm(directory,{recursive:true,force:true}); }
