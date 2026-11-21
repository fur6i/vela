const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { pageFilters, validFrame, scriptletProgram } = require('../src/adblock.cjs');
test('native cosmetic filters are selected for the actual page hostname', () => {
  const engine = ElectronBlocker.parse('example.com##.ad-slot');
  assert.match(pageFilters(engine, 'https://www.example.com/').styles, /ad-slot/);
  assert.equal(pageFilters(null, 'https://example.com').active, false);
  assert.equal(pageFilters(engine, 'file:///C:/Windows').active, false);
});
test('cosmetic IPC only accepts the browsing session and its actual main-frame origin', () => {
  const session = {}, frame = { url: 'https://www.example.com/page' };
  const event = { sender: { session, mainFrame: frame }, senderFrame: frame };
  assert.equal(validFrame(event, 'https://www.example.com/page', session), true);
  assert.equal(validFrame(event, 'https://evil.test/', session), false);
  assert.equal(validFrame(event, 'https://www.example.com/', {}), false);
  assert.equal(validFrame({ ...event, senderFrame: { url: frame.url } }, frame.url, session), false);
});
test('DOM feature batches are bounded and cannot inject scriptlet requests', () => {
  let request;
  const engine = { getCosmeticsFilters: (options) => { request = options; return options; } };
  pageFilters(engine, 'https://sub.example.co.uk', { classes: Array.from({ length: 900 }, (_, index) => `c${index}`), ids: [null, {}, 'allowed', 'a'.repeat(300)] });
  assert.equal(request.domain, 'example.co.uk');
  assert.equal(request.classes.length, 400);
  assert.deepEqual(request.ids, ['allowed']);
  assert.equal(request.getInjectionRules, false);
  assert.equal(request.getRulesFromDOM, true);
});
test('scriptlets isolate declarations and reuse the original built-ins', () => {
  const vm = require('node:vm');
  const helper = 'function safeSelf(){if(safeSelf.safe)return safeSelf.safe;return safeSelf.safe={ stringify:JSON.stringify };}';
  const program = scriptletProgram([
    `${helper} const JSONPath = 1; globalThis.firstStringify = safeSelf().stringify; JSON.stringify = () => 'wrapped';`,
    `${helper} const JSONPath = 2; globalThis.pristineSnapshotShared = safeSelf().stringify === globalThis.firstStringify;`
  ]);
  const context = {};
  const errors = vm.runInNewContext(`(function(){${program}})()`, context);
  assert.equal(errors.length, 0);
  assert.equal(context.pristineSnapshotShared, true);
});
