const test = require('node:test');
const assert = require('node:assert/strict');
const { spaceConfig, spacesFromProfile } = require('../src/spaces.cjs');
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
