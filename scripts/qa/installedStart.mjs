/** Launch only the candidate installed on an ephemeral runner, with a private profile. */
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
assert.equal(process.env.GITHUB_ACTIONS,'true','Only ephemeral GitHub runners may run this test');
const binary=process.argv[2];
assert.ok(binary && path.isAbsolute(binary),'An absolute installed binary is required');
assert.ok((await stat(binary)).isFile());
const directory=await mkdtemp(path.join(os.tmpdir(),'solarsim-installed-qa-'));
const args=[`--user-data-dir=${directory}`];
if(process.platform==='linux') args.push('--no-sandbox');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(binary,args,{env,stdio:'ignore',detached:process.platform!=='win32'});
let stopped=false;let failure;
child.on('exit',(code,signal)=>{stopped=true;failure=`Installed application exited early (${code}, ${signal})`;});
child.on('error',error=>{stopped=true;failure=error.message;});
try {
  await new Promise(resolve=>setTimeout(resolve,5000));
  assert.equal(stopped,false,failure);
  console.log('PASS: actual installed executable stays running with a fresh disposable profile.');
}finally{
  if(!stopped && child.pid) {
    if(process.platform==='win32') execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});
    else process.kill(-child.pid,'SIGTERM');
  }
  await new Promise(resolve=>setTimeout(resolve,500));
  await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
