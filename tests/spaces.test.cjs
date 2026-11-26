const test = require('node:test');
const assert = require('node:assert/strict');
const { spaceConfig, spacesFromProfile } = require('../src/spaces.cjs');
test('the four-space limit and deletion retain tabs in folders and never recreate deleted defaults',()=>{
  const {limitSpaces,foldSpace}=require('../src/spaces.cjs');
  const spaces=spacesFromProfile();
  for(let i=0;i<4;i++)spaces['space-'+String(i).padStart(12,'0')]={name:'Group '+i,emoji:'🌍',color:'#7686a5'};
  const tabs=[{id:1,url:'https://example.test/',space:'space-000000000003',folder:['Nested'],pinned:false}];
  limitSpaces(spaces,tabs);
  assert.equal(Object.keys(spaces).length,4);
  assert.deepEqual(tabs[0],{id:1,url:'https://example.test/',space:'personal',folder:['Group 3','Nested'],pinned:true});
  foldSpace(spaces,tabs,'personal','work');
  assert.deepEqual(tabs[0].folder,['Personale','Group 3','Nested']);
  assert.equal(spacesFromProfile(spaces,true).personal,undefined);
});
test('spaces migrate independently and retain custom names, emoji, color and embedded image', () => {
  assert.equal(spacesFromProfile().personal.name, 'Personale');
  const custom = { name: '  Studio  ', emoji: '🎨', color: '#AABBCC', image: 'data:image/png;base64,YWJj' };
  const restored = spacesFromProfile({ personal: custom, work: { name: '' } });
  assert.deepEqual(restored.personal, { ...custom, name: 'Studio', color: '#aabbcc' });
  assert.equal(restored.work.name, 'Lavoro');
});
test('spaces reject invalid names/colors and never accept external or executable images', () => {
  const config = spacesFromProfile().personal;
  for (const value of [{ ...config, name: ' ' }, { ...config, name: 'a'.repeat(41) }, { ...config, emoji: '<script>' }, { ...config, color: 'red;display:none' }]) assert.equal(spaceConfig(value), null);
  for (const image of ['https://tracker.example/icon.png', 'file:///secret.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,' + 'a'.repeat(120000)]) assert.equal(spaceConfig({ ...config, image }).image, null);
});
