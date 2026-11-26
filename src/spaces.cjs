const DEFAULT_SPACES = { personal: { name: 'Personale', emoji: '🏠', color: '#7686a5', image: null }, work: { name: 'Lavoro', emoji: '💼', color: '#947b9c', image: null } };
const EMOJIS = ['🏠','💼','🌍','🚀','🎮','🎨','🎵','📚','💻','🌙','☀️','🌿','🐱','🦊','⭐','❤️','🧠','☕','🏖️','🔬','📷','⚽','🍀','🪐'];
const MAX_SPACES=4;
function spaceConfig(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 40 || !EMOJIS.includes(value.emoji) || !/^#[a-f0-9]{6}$/i.test(value.color || '')) return null;
  const image = typeof value.image === 'string' && value.image.length < 120000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.image) ? value.image : null;
  return { name: value.name.trim(), emoji: value.emoji, color: value.color.toLowerCase(), image };
}
function spacesFromProfile(value,explicit=false) {
  const result=explicit?{}:Object.fromEntries(Object.entries(DEFAULT_SPACES).map(([id, fallback]) => [id, spaceConfig(value?.[id]) || { ...fallback }]));
  for(const [id,config] of Object.entries(value||{})){
    if(Object.keys(result).length>=20)break;
    if(!/^(?:personal|work|(?:arc|space)-[a-f0-9]{12})$/.test(id))continue;
    const validated=spaceConfig(config);
    if(validated){
      if(Array.isArray(config.folders))validated.folders=[...new Set(config.folders.filter(name=>typeof name==='string'&&name.trim()&&name.length<=80).map(name=>name.trim()))].slice(0,64);
      result[id]=validated;
    }
  }
  return Object.keys(result).length?result:spacesFromProfile();
}
function foldSpace(spaces,tabs,id,destination){
  const name=spaces[id].name;
  const target=spaces[destination];
  target.folders=[...new Set([...(target.folders||[]),name])].slice(0,64);
  for(const tab of tabs){
    if(tab.space!==id)continue;
    tab.space=destination;
    if(tab.url==='vela://start')continue;
    tab.folder=[name,...(Array.isArray(tab.folder)?tab.folder:[])].slice(0,12);
    tab.pinned=true;
  }
  delete spaces[id];
}
function limitSpaces(spaces,tabs){
  const ids=Object.keys(spaces);
  for(const id of ids.slice(MAX_SPACES))foldSpace(spaces,tabs,id,ids[0]);
}
module.exports = { DEFAULT_SPACES, EMOJIS, MAX_SPACES, spaceConfig, spacesFromProfile, foldSpace, limitSpaces };
