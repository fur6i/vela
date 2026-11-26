'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {execFile}=require('node:child_process');
const {compileAuth}=require('./windows-auth-build.cjs');
// No environment flag, renderer-provided command, or password fallback can skip
// this gate. Tests inject authentication into the controller, not this function.
async function windowsAuthenticate(win,language='it'){
  if(process.platform!=='win32'||!win||win.isDestroyed())return Promise.resolve(false);
  const handle=win.getNativeWindowHandle(),hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());
  const {app}=require('electron');let directory;
  try{
    const executable=app.isPackaged?path.join(process.resourcesPath,'windows','vela-auth.exe'):await (async()=>{const base=path.join(app.getPath('userData'),'auth-helper');fs.mkdirSync(base,{recursive:true,mode:0o700});directory=fs.mkdtempSync(path.join(base,'build-'));return compileAuth(directory);})();
    return await new Promise(resolve=>execFile(executable,[hwnd,language==='en'?'en':'it'],{windowsHide:true,timeout:120000,maxBuffer:1024},error=>resolve(!error)));
  }catch{return false;}finally{if(directory){for(const file of ['vela-auth.exe','windows-auth.cs'])try{fs.unlinkSync(path.join(directory,file));}catch{}try{fs.rmdirSync(directory);}catch{}}}
}
module.exports={windowsAuthenticate};
