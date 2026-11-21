const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trustedPermission } = require('../src/security.cjs');
const { isWeb, secureTarget, destination } = require('../src/navigation.cjs');
test('permission requests must come from the secure top-level origin', () => {
  const wc = { isDestroyed: () => false, getURL: () => 'https://example.com/page' };
  assert.equal(trustedPermission(wc, 'https://example.com/other', true), true);
  for (const [url, main] of [['https://evil.test', true], ['https://example.com', false], ['http://example.com', true]]) {
    assert.equal(trustedPermission(wc, url, main), false);
  }
  assert.equal(trustedPermission(null, 'https://example.com', true), false);
});
test('HTTPS upgrades keep local development working and reject credential spoofing', () => {
  assert.equal(secureTarget('http://example.com/path'), 'https://example.com/path');
  assert.equal(secureTarget('http://localhost:8123'), 'http://localhost:8123/');
  assert.equal(secureTarget('http://example.com', false), 'http://example.com/');
  for (const url of ['https://trusted.com@evil.test', 'javascript:alert(1)', 'file:///etc/passwd', 'https://[invalid']) {
    assert.equal(isWeb(url), false);
    assert.equal(secureTarget(url), null);
    assert.equal(destination(url), null);
  }
});
