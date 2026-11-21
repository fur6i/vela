const { isWeb } = require('./navigation.cjs');
const DEFAULT_PANIC = { enabled: false, shortcut: 'Ctrl+Shift+Space', url: 'https://www.google.com/' };
function parseShortcut(value) {
  if (typeof value !== 'string' || value.length > 60) return null;
  const parts = value.split('+'); const rawKey = parts.pop();
  if (!rawKey || new Set(parts).size !== parts.length || parts.some(part => !['Ctrl', 'Alt', 'Shift'].includes(part))) return null;
  const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  if (!/^(?:[A-Z0-9]|Space|F[1-9]|F1[0-2])$/.test(key)) return null;
  const ctrl = parts.includes('Ctrl'), alt = parts.includes('Alt'), shift = parts.includes('Shift');
  if (!ctrl && !alt && !/^F\d+$/.test(key)) return null;
  if ((!ctrl && !alt && ['F5','F11','F12'].includes(key)) || (alt && key === 'F4')) return null;
  if (ctrl && !alt && /^[A-Z0-9]$/.test(key) && 'LKTNPRDWFCVXZASQ0123456789'.includes(key)) return null;
  return { ctrl, alt, shift, key, shortcut: [ctrl && 'Ctrl', alt && 'Alt', shift && 'Shift', key].filter(Boolean).join('+') };
}
function panicConfig(value) {
  const combo = parseShortcut(value?.shortcut);
  if (!combo || typeof value?.url !== 'string' || value.url.length > 4096) return null;
  const raw = value.url.trim();
  if(/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw) && !/^[\w.-]+:\d+(\/|$)/.test(raw))return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (!isWeb(url)) return null;
  return { enabled: value.enabled === true, shortcut: combo.shortcut, url: new URL(url).href };
}
function matchesShortcut(input, config) {
  if (!config?.enabled || input.type !== 'keyDown' || typeof input.key!=='string' || input.isAutoRepeat || input.meta) return false;
  const combo = parseShortcut(config.shortcut); if (!combo) return false;
  const key = input.key === ' ' ? 'Space' : input.key.length === 1 ? input.key.toUpperCase() : input.key;
  return combo.key === key && combo.ctrl === Boolean(input.control) && combo.alt === Boolean(input.alt) && combo.shift === Boolean(input.shift);
}
module.exports = { DEFAULT_PANIC, parseShortcut, panicConfig, matchesShortcut };
