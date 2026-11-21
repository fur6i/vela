function updatesEnabled({packaged,smoke,privateMode,portable}){return Boolean(packaged&&!smoke&&!privateMode&&!portable);}
function createUpdates({enabled,load,notify,setTimeoutImpl=setTimeout,setIntervalImpl=setInterval,clearTimeoutImpl=clearTimeout,clearIntervalImpl=clearInterval}){
  let updater,ready=null,checking=false,initial,periodic;
  const check=async()=>{if(checking)return;checking=true;try{await updater.checkForUpdates();}catch{}finally{checking=false;}};
  if(enabled){initial=setTimeoutImpl(()=>{try{updater=load();updater.logger=null;updater.autoDownload=true;updater.autoInstallOnAppQuit=false;updater.disableWebInstaller=true;updater.on('error',()=>{});updater.on('update-downloaded',info=>{if(typeof info.version==='string'&&/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(info.version)){ready={version:info.version};notify();}});void check();periodic=setIntervalImpl(()=>void check(),6*60*60*1000);periodic.unref?.();}catch{}},10000);initial.unref?.();}
  return {snapshot:()=>ready,install:()=>{if(enabled&&ready&&updater)updater.quitAndInstall();},close:()=>{clearTimeoutImpl(initial);clearIntervalImpl(periodic);}};
}
module.exports={updatesEnabled,createUpdates};
