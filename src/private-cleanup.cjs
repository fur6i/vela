const {t}=require('./i18n.js');
const tr=(key,vars)=>t('it',key,vars);
const path=require('node:path');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
function privateTarget(directory,temporaryRoot){
  if(typeof directory!=='string'||!path.isAbsolute(directory))return null;
  const target=path.resolve(directory),root=path.resolve(temporaryRoot);
  return path.dirname(target).toLowerCase()===root.toLowerCase()&&/^vela-private-[a-zA-Z0-9]{6}$/.test(path.basename(target))?target:null;
}
function deferredCleanup(directory,temporaryRoot,parentPid=process.pid,launch=spawnSync){
  const target=privateTarget(directory,temporaryRoot);if(!target)return false;
  const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const worker='$target=[IO.Path]::GetFullPath($env:VELA_PRIVATE_CLEANUP);$root=[IO.Path]::GetFullPath($env:VELA_PRIVATE_TEMP);if([IO.Path]::GetDirectoryName($target) -ine $root -or [IO.Path]::GetFileName($target) -cnotmatch "^vela-private-[a-zA-Z0-9]{6}$"){exit 1};Wait-Process -Id ([int]$env:VELA_PRIVATE_PID) -ErrorAction SilentlyContinue;for($attempt=0;$attempt -lt 25;$attempt++){try{if(Test-Path -LiteralPath $target){if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){exit 1};Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop};Remove-Item -LiteralPath ([IO.Path]::Combine($root,"."+[IO.Path]::GetFileName($target)+".owner.json")) -Force -ErrorAction SilentlyContinue;exit 0}catch{Start-Sleep -Milliseconds 200}}';
  const encoded=Buffer.from(worker,'utf16le').toString('base64');
  const bootstrap=`Start-Process -FilePath $env:VELA_PRIVATE_POWERSHELL -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand','${encoded}')`;
  const result=launch(executable,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(bootstrap,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore',timeout:5000,env:{...process.env,VELA_PRIVATE_CLEANUP:target,VELA_PRIVATE_TEMP:path.resolve(temporaryRoot),VELA_PRIVATE_PID:String(parentPid),VELA_PRIVATE_POWERSHELL:executable}});
  return result.status===0;
}
function ownerFile(directory,temporaryRoot){const target=privateTarget(directory,temporaryRoot);return target?path.join(temporaryRoot,'.'+path.basename(target)+'.owner.json'):null;}
function registerPrivate(directory,temporaryRoot){const file=ownerFile(directory,temporaryRoot);if(!file)throw Error(tr("Profilo privato non valido."));fs.writeFileSync(file,JSON.stringify({pid:process.pid,name:path.basename(directory)}),{flag:'wx'});}
async function cleanupOrphans(temporaryRoot,alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}){
  const entries=await fs.promises.readdir(temporaryRoot,{withFileTypes:true});
  for(const entry of entries){if(!entry.isFile()||!/^\.vela-private-[a-zA-Z0-9]{6}\.owner\.json$/.test(entry.name))continue;
    try{const marker=path.join(temporaryRoot,entry.name);if((await fs.promises.stat(marker)).size>1024)continue;const owner=JSON.parse(await fs.promises.readFile(marker,'utf8')),target=privateTarget(path.join(temporaryRoot,owner.name||''),temporaryRoot);
      if(!target||ownerFile(target,temporaryRoot)!==marker||!Number.isSafeInteger(owner.pid)||owner.pid<=0||alive(owner.pid))continue;
      try{if((await fs.promises.lstat(target)).isSymbolicLink())continue;}catch(error){if(error.code!=='ENOENT')continue;}
      await fs.promises.rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:100});await fs.promises.unlink(marker);
    }catch{}
  }
}
module.exports={privateTarget,deferredCleanup,registerPrivate,cleanupOrphans,ownerFile};
