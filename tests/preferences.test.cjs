const { test } = require('node:test');
const assert = require('node:assert/strict');
const { favorite, favoritesFromProfile, color, darkBackground } = require('../src/preferences.cjs');
test('legacy favorites migrate once; an explicitly empty edited list stays empty', () => {
  const migrated = favoritesFromProfile({ pins: [{ title: 'Mio sito', url: 'https://example.com' }] });
  assert.equal(migrated.length, 7);
  assert.equal(migrated[6].url, 'https://example.com/');
  assert.deepEqual(favoritesFromProfile({ favoritesVersion: 1, pins: [] }), []);
  const edited = { favoritesVersion: 1, pins: [{ title: 'Solo questo', url: 'https://example.com/' }] };
  assert.deepEqual(favoritesFromProfile(JSON.parse(JSON.stringify(edited))), edited.pins);
});
test('favorite editor accepts web addresses and rejects executable or credential URLs', () => {
  assert.deepEqual(favorite({ title: '  Sito  ', url: 'example.com/path' }), { title: 'Sito', url: 'https://example.com/path' });
  for (const url of ['javascript:alert(1)', 'file:///C:/Windows', 'https://user:password@example.com', 'https://[invalid']) assert.equal(favorite({ title: 'Sito', url }), null);
  assert.equal(favorite({ title: '', url: 'https://example.com' }), null);
});
test('custom colors normalize safely and choose a legible light/dark treatment', () => {
  assert.equal(color('#ABC'), '#aabbcc');
  assert.equal(color('1234FF'), '#1234ff');
  for (const value of ['red;display:none', '#00000000', 'url(example)', null]) assert.equal(color(value), null);
  assert.equal(darkBackground('#000000'), true);
  assert.equal(darkBackground('#ffffff'), false);
});
