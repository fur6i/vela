const HOME = 'vela://start';
const SEARCH_ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' }
};
function searchDestination(input, engine) {
  const value = String(input || '').trim();
  return value && Object.hasOwn(SEARCH_ENGINES, engine || '') ? SEARCH_ENGINES[engine].url + encodeURIComponent(value) : null;
}
function destination(input, engine) {
  const value = String(input || '').trim();
  if (!value || value === HOME) return HOME;
  if (/^https?:\/\//i.test(value)) {
    try { const url = new URL(value); return url.username || url.password ? null : url.href; } catch { return null; }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[\w.-]+:\d+(\/|$)/.test(value)) return null;
  if (/^(localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?([/?#]|$)/i.test(value)) {
    try { return new URL(`https://${value}`).href; } catch { return null; }
  }
  return searchDestination(value, engine);
}
function isWeb(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function secureTarget(value, httpsOnly = true) {
  if (!isWeb(value)) return null;
  const url = new URL(value);
  if (httpsOnly && url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) url.protocol = 'https:';
  return url.href;
}
module.exports = { HOME, SEARCH_ENGINES, destination, searchDestination, isWeb, secureTarget };
