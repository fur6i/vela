const DEFAULT_SPACES = { personal: { name: 'Personale', emoji: '🏠', color: '#7686a5', image: null }, work: { name: 'Lavoro', emoji: '💼', color: '#947b9c', image: null } };
const EMOJIS = ['🏠','💼','🌍','🚀','🎮','🎨','🎵','📚','💻','🌙','☀️','🌿','🐱','🦊','⭐','❤️','🧠','☕','🏖️','🔬','📷','⚽','🍀','🪐'];
function spaceConfig(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 40 || !EMOJIS.includes(value.emoji) || !/^#[a-f0-9]{6}$/i.test(value.color || '')) return null;
  const image = typeof value.image === 'string' && value.image.length < 120000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.image) ? value.image : null;
  return { name: value.name.trim(), emoji: value.emoji, color: value.color.toLowerCase(), image };
}
function spacesFromProfile(value) { return Object.fromEntries(Object.entries(DEFAULT_SPACES).map(([id, fallback]) => [id, spaceConfig(value?.[id]) || { ...fallback }])); }
module.exports = { DEFAULT_SPACES, EMOJIS, spaceConfig, spacesFromProfile };
