const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('credentialChoices',Object.freeze({
  choose:(generation,index)=>ipcRenderer.send('vela:credential-choice',{generation,index}),
  subscribe:callback=>ipcRenderer.on('vela:credential-choices',(_event,data)=>callback(data))
}));
