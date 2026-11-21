const { ipcRenderer, contextBridge, webFrame } = require('electron');
if (/^https?:/.test(location.protocol)) {
  try {
    const enabled = ipcRenderer.sendSync('vela:privacy-start', location.href);
    if (enabled) {
      contextBridge.executeInMainWorld({ func: () => {
        for (const [key, value] of [['globalPrivacyControl', true], ['doNotTrack', '1']]) try { Object.defineProperty(Navigator.prototype,key,{get:()=>value,configurable:false}); } catch {}
      } });
      let lastCount = 0;
      ipcRenderer.on('vela:consent-program', (_event, program) => {
        if (typeof program === 'string' && program.length < 15000) webFrame.executeJavaScriptInIsolatedWorld(1003,[{code:program}]).catch(()=>{});
      });
      ipcRenderer.send('vela:consent-ready', location.href);
      const timer = setInterval(() => {
        webFrame.executeJavaScriptInIsolatedWorld(1003,[{code:'globalThis.__velaRejectedCount||0'}]).then(count => {
          if (count > lastCount && count <= 4) { ipcRenderer.send('vela:cookie-rejected',location.href,count-lastCount); lastCount=count; }
        }).catch(()=>{});
      },1500);
      setTimeout(()=>clearInterval(timer),62000);
      window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
    }
  } catch {}
}
