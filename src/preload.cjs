const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('vela', {
  command: (name, value) => ipcRenderer.invoke('vela:command', name, value),
  virusFile: (file) => ipcRenderer.invoke('vela:command','vt-file',webUtils.getPathForFile(file)),
  panicKey: (callback) => ipcRenderer.on('vela:panic-key',(_event,key)=>callback(key)),
  subscribe: (callback) => ipcRenderer.on('vela:state', (_event, state) => callback(state)),
  shortcut: (callback) => ipcRenderer.on('vela:shortcut', (_event, name) => callback(name))
});
