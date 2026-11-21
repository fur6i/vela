const REJECT = /^(rifiuta(?: (?:tutti|tutto|i cookie))?|nega(?: tutto)?|solo (?:cookie )?necessari|accetta solo (?:i )?(?:cookie )?necessari|continua senza accettare|reject(?: all| all cookies)?|decline(?: all| all cookies)?|deny(?: all)?|(?:use |allow |accept )?only (?:necessary|essential)(?: cookies)?|necessary (?:cookies )?only|tout refuser|refuser(?: tout)?|rechazar(?: todo| todos| todas)?|solo necesarias|alle ablehnen|ablehnen|nur notwendige(?: cookies)?|alles weigeren|weigeren)$/i;
const CONTAINERS = '#onetrust-banner-sdk,#onetrust-consent-sdk,#CybotCookiebotDialog,#didomi-host,.iubenda-cs-container,[id*="cookie" i],[class*="cookie-banner" i],[class*="consent-banner" i],[role="dialog"],[aria-modal="true"]';
function rejectionLabel(value) { return REJECT.test(String(value || '').replace(/\s+/g, ' ').trim()); }
function consentProgram() {
  return `(() => {
    const reject = ${REJECT.toString()}, containers = ${JSON.stringify(CONTAINERS)};
    const clicked = new WeakSet(), roots = new Set([document]);
    let timer, attempts = 0, stopped = false, lastScan = 0;
    const visible = element => !element.disabled && element.getAttribute('aria-disabled') !== 'true' && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    const observer = new MutationObserver(() => { if (!timer && !stopped) timer = setTimeout(scan, Math.max(180,1000-(Date.now()-lastScan))); });
    function scan() {
      timer = null; if (stopped || attempts >= 4) return; lastScan=Date.now();
      for (const root of [...roots]) {
        const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);let element,visited=0;
        while(visited++<1200 && (element=walker.nextNode())) if (element.shadowRoot && !roots.has(element.shadowRoot) && roots.size < 30) { roots.add(element.shadowRoot); observer.observe(element.shadowRoot,{childList:true,subtree:true}); }
        for (const box of [...root.querySelectorAll(containers)].slice(0, 50)) {
          if (!/cookie|cookies|keks|biscotti/i.test(box.textContent.slice(0, 6000))) continue;
          for (const button of [...box.querySelectorAll('button,[role="button"],input[type="button"]')].slice(0, 80)) {
            const label = (button.getAttribute('aria-label') || button.textContent || button.value || '').replace(/\\s+/g,' ').trim();
            if (!reject.test(label) || clicked.has(button) || !visible(button)) continue;
            clicked.add(button); attempts++; button.click(); if(attempts>=4)observer.disconnect(); return true;
          }
        }
      }
      return false;
    }
    observer.observe(document,{childList:true,subtree:true});
    const tick = () => scan();
    // Keep notification in this isolated world; websites receive no app bridge.
    const originalScan = scan;
    scan = function(){ const result = originalScan(); if(result) globalThis.__velaRejectedCount=(globalThis.__velaRejectedCount||0)+1; return result; };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',tick,{once:true}); else tick();
    const deadline=setTimeout(()=>{stopped=true;observer.disconnect();clearTimeout(timer)},60000);
    window.addEventListener('pagehide',()=>{stopped=true;observer.disconnect();clearTimeout(timer);clearTimeout(deadline)},{once:true});
  })()`;
}
function privacyFrame(event, url, ses, tabs) {
  try {
    return Boolean(event.sender?.session === ses && !event.sender.isDestroyed() && event.senderFrame && event.senderFrame.url === url && /^https?:/.test(url) && tabs.some(tab => tab.view?.webContents.id === event.sender.id));
  } catch { return false; }
}
module.exports = { rejectionLabel, consentProgram, privacyFrame };
