/** Isolated runtime integration test: actual ASAR entry/preload, read-only DOM/IPC. */
const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const asar = process.env.QA_APP_ASAR;
if (!asar || !path.isAbsolute(asar) || !asar.endsWith('app.asar')) throw new Error('An absolute built app.asar is required.');
app.setPath('userData', path.join(__dirname,'private-profile'));
// Exercise the production file-loading path while using a disposable harness package.
Object.defineProperty(app,'isPackaged',{value:true});
const timeout = setTimeout(()=>{ console.error('Runtime QA timed out'); app.exit(1); },30000);
app.on('browser-window-created',(_event,window)=>{
  window.hide();
  window.webContents.on('did-finish-load',async()=>{
    try {
      const prefs=window.webContents.getLastWebPreferences();
      assert.equal(prefs.contextIsolation,true);
      assert.equal(prefs.nodeIntegration,false);
      let state;
      for(let attempt=0;attempt<100;attempt++) {
        state=await window.webContents.executeJavaScript(`(async()=>({title:document.title,heading:document.querySelector('h1')?.textContent,nodeRequire:typeof window.require,nodeProcess:typeof window.process,bridge:typeof window.electronAPI,version:await window.electronAPI.getAppVersion(),platform:await window.electronAPI.getPlatformInfo()}))()`);
        if(state.heading)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.ok(['Propuestas','SolarSim Pro'].includes(state.heading),'Built application renders its local entry screen');
      assert.equal(state.nodeRequire,'undefined');
      assert.equal(state.nodeProcess,'undefined');
      assert.equal(state.bridge,'object');
      assert.equal(state.version,app.getVersion());
      assert.equal(state.platform.platform,process.platform);
      const unsubscribes=await window.webContents.executeJavaScript(`(()=>{const cleanup=window.electronAPI.onUpdateStatus(()=>{});const valid=typeof cleanup==='function';cleanup();return valid})()`);
      assert.equal(unsubscribes,true);
      console.log(JSON.stringify({result:'pass',version:app.getVersion(),electron:process.versions.electron,node:process.versions.node,platform:process.platform,asarEntry:true,preload:true,contextIsolation:true,rendererNodeAccess:false,ipcVersion:true,ipcPlatform:true,listenerCleanup:true}));
      clearTimeout(timeout); app.exit(0);
    }catch(error){console.error(error.message);clearTimeout(timeout);app.exit(1);}
  });
});
require(path.join(asar,'dist-electron','main.cjs'));
