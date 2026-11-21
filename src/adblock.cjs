const { Request } = require('@ghostery/adblocker-electron');
const { isWeb } = require('./navigation.cjs');
function scriptletProgram(scripts) {
  // Isolate declarations, but share pristine built-ins across all scriptlets in this document.
  // Otherwise wrappers can capture previous wrappers and multiply JSON/fetch processing.
  return `let __velaSafeSelf; const __velaGlobals = {}; const __velaErrors = [];\n${scripts.map((script) => `try { (() => {
    var scriptletGlobals = __velaGlobals;
    if (typeof safeSelf === 'function') {
      if (!__velaSafeSelf) __velaSafeSelf = safeSelf();
      safeSelf.safe = __velaSafeSelf;
    }
    ${script}
  })(); } catch (error) { __velaErrors.push(String(error.message)); }`).join('\n')}\nreturn __velaErrors;`;
}
function pageFilters(engine, url, features) {
  if (!engine || !isWeb(url)) return { active: false, scripts: [], styles: '' };
  const request = Request.fromRawDetails({ url, type: 'main_frame' });
  const values = (items) => Array.isArray(items) ? items.filter((item) => typeof item === 'string' && item.length < 256).slice(0, 400) : [];
  return engine.getCosmeticsFilters({ url, hostname: request.hostname, domain: request.domain,
    getBaseRules: !features, getInjectionRules: !features, getExtendedRules: false,
    getRulesFromHostname: !features, getRulesFromDOM: Boolean(features),
    classes: values(features?.classes), ids: values(features?.ids)
  });
}
function validFrame(event, url, session) {
  try {
    return event.sender.session === session && event.senderFrame === event.sender.mainFrame &&
      isWeb(url) && new URL(event.senderFrame.url).origin === new URL(url).origin;
  } catch { return false; }
}
module.exports = { pageFilters, validFrame, scriptletProgram };
