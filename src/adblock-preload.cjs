const { ipcRenderer, contextBridge, webFrame } = require('electron');
ipcRenderer.on('vela:volume', (_event, program) => {
  if (typeof program === 'string' && program.length < 10000) webFrame.executeJavaScriptInIsolatedWorld(1001, [{ code: program }], true).catch(() => {});
});
// No bridge is exposed to websites. Scriptlets execute synchronously before page scripts.
if (process.isMainFrame && /^https?:/.test(location.protocol)) {
  try {
    const payload = ipcRenderer.sendSync('vela:document-start', location.href);
    if (payload?.program) {
      const errors = contextBridge.executeInMainWorld({ func: new Function(payload.program) });
      for (const error of errors || []) console.error('Vela document-start scriptlet:', error);
    }
    if (payload?.styles) webFrame.insertCSS(payload.styles, { cssOrigin: 'user' });
    if (payload?.active) {
      const classes = new Set(), ids = new Set();
      let timer;
      const collect = (element) => {
        if (element.nodeType !== 1) return;
        if (element.id && ids.size < 400) ids.add(element.id);
        for (const value of element.classList) if (classes.size < 400) classes.add(value);
      };
      const flush = () => {
        timer = null;
        if (!classes.size && !ids.size) return;
        const features = { classes: [...classes], ids: [...ids] }; classes.clear(); ids.clear();
        ipcRenderer.invoke('vela:cosmetic-styles', location.href, features).then((styles) => {
          if (styles) webFrame.insertCSS(styles, { cssOrigin: 'user' });
        }).catch(() => {});
      };
      window.addEventListener('DOMContentLoaded', () => {
        for (const element of [...document.querySelectorAll('[class],[id]')].slice(0, 2000)) collect(element);
        flush();
        const observer = new MutationObserver((mutations) => {
          let visited = 0;
          for (const mutation of mutations) {
            if (mutation.type === 'attributes') collect(mutation.target);
            for (const node of mutation.addedNodes) {
            if (++visited > 200) break;
            collect(node);
            if (node.querySelectorAll) for (const child of [...node.querySelectorAll('[class],[id]')].slice(0, 50)) collect(child);
            }
          }
          if (!timer && (classes.size || ids.size)) timer = setTimeout(flush, 500);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id'] });
        window.addEventListener('pagehide', () => { observer.disconnect(); clearTimeout(timer); }, { once: true });
      }, { once: true });
    }
  } catch (error) { console.error('Vela document-start:', error.message); }
}
