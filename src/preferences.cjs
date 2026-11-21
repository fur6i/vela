const { isWeb } = require('./navigation.cjs');
const DEFAULT_FAVORITES = [
  { title: 'Apple', url: 'https://www.apple.com/', letter: 'a' },
  { title: 'Wikipedia', url: 'https://it.wikipedia.org/', letter: 'W' },
  { title: 'YouTube', url: 'https://www.youtube.com/', letter: '▶' },
  { title: 'GitHub', url: 'https://github.com/', letter: 'G' },
  { title: 'Reddit', url: 'https://www.reddit.com/', letter: 'r' },
  { title: 'MDN', url: 'https://developer.mozilla.org/', letter: 'M' }
];
function favorite(value) {
  if (!value || typeof value.title !== 'string' || typeof value.url !== 'string') return null;
  const title = value.title.trim(), raw = value.url.trim();
  if (!title || title.length > 80 || !raw || raw.length > 4096) return null;
  const url = /^[a-z][\w+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  if (!isWeb(url)) return null;
  const result = { title, url: new URL(url).href };
  if (typeof value.letter === 'string' && value.letter.length <= 2) result.letter = value.letter;
  if(typeof value.favicon==='string'&&value.favicon.length<20000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.favicon))result.favicon=value.favicon;
  return result;
}
function favoritesFromProfile(data) {
  const source = data.favoritesVersion === 1 ? data.pins : [...DEFAULT_FAVORITES, ...(Array.isArray(data.pins) ? data.pins : [])];
  const seen = new Set();
  return (Array.isArray(source) ? source : []).map(favorite).filter((item) => {
    if (!item || seen.has(item.url)) return false;
    seen.add(item.url); return true;
  }).slice(0, 256);
}
function color(value) {
  if (typeof value !== 'string') return null;
  let hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) hex = [...hex].map((char) => char + char).join('');
  return /^[\da-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}
function darkBackground(value) {
  const hex = color(value);
  if (!hex) return false;
  const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < .179;
}
function scrollbarStyles(background, dark) {
  const base = color(background) || (dark ? '#252c3e' : '#d9e4ef');
  const tint = darkBackground(base) ? 255 : 0;
  const mix = (ratio) => '#' + [1, 3, 5].map((index) => Math.round(parseInt(base.slice(index, index + 2), 16) * (1 - ratio) + tint * ratio).toString(16).padStart(2, '0')).join('');
  return `::-webkit-scrollbar{width:10px!important;height:10px!important}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:${base}!important}::-webkit-scrollbar-thumb{background:${mix(.32)}!important;border:2px solid ${base}!important;border-radius:12px!important}::-webkit-scrollbar-thumb:hover{background:${mix(.48)}!important}::-webkit-scrollbar-button{display:none!important;width:0!important;height:0!important}*{scrollbar-width:auto!important;scrollbar-color:auto!important}`;
}
module.exports = { DEFAULT_FAVORITES, favorite, favoritesFromProfile, color, darkBackground, scrollbarStyles };
