'use strict';
const fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process');
async function compileAuth(directory){
  if(process.platform!=='win32')throw Error('Windows authentication requires Windows');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const source=path.join(directory,'windows-auth.cs'),output=path.join(directory,'vela-auth.exe');
  fs.copyFileSync(path.join(__dirname,'windows-auth.cs'),source);
  const root=process.env.SystemRoot||'C:\\Windows';
  const compiler=['Framework64','Framework'].map(folder=>path.join(root,'Microsoft.NET',folder,'v4.0.30319','csc.exe')).find(file=>fs.existsSync(file));
  if(!compiler)throw Error('Windows authentication compiler unavailable');
  await new Promise((resolve,reject)=>execFile(compiler,['/nologo','/target:winexe','/optimize+','/platform:anycpu','/out:'+output,source],{windowsHide:true,timeout:30000,maxBuffer:4096},error=>error?reject(Error('Windows authentication helper could not be built')):resolve()));
  return output;
}
module.exports={compileAuth};
