const { test } = require('node:test');
const assert = require('node:assert/strict');
const { destination, searchDestination, HOME } = require('../src/navigation.cjs');
test('indirizzi e ricerca', () => {
  assert.equal(destination('example.com/path'), 'https://example.com/path');
  assert.equal(destination('http://localhost:8000'), 'http://localhost:8000/');
  assert.equal(destination('ciao mondo'), null, 'nessun motore selezionato implicitamente');
  assert.equal(destination('ciao mondo', 'google'), 'https://www.google.com/search?q=ciao%20mondo');
  assert.equal(destination('ciao mondo', 'bing'), 'https://www.bing.com/search?q=ciao%20mondo');
  assert.equal(destination('ciao mondo', 'brave'), 'https://search.brave.com/search?q=ciao%20mondo');
  assert.equal(destination('ciao mondo', 'ecosia'), 'https://www.ecosia.org/search?q=ciao%20mondo');
  assert.equal(destination('ciao mondo', '__proto__'), null);
  assert.equal(destination(''), HOME);
});
test('la ricerca nella pagina iniziale tratta anche gli indirizzi come testo', () => {
  assert.equal(destination('youtube.com', 'google'), 'https://youtube.com/');
  assert.equal(searchDestination('youtube.com', 'google'), 'https://www.google.com/search?q=youtube.com');
  assert.equal(destination('ciao', 'google'), 'https://www.google.com/search?q=ciao');
  assert.equal(searchDestination('ciao', 'google'), destination('ciao', 'google'));
  assert.equal(searchDestination('https://youtube.com/?a=1&b=2', 'google'), 'https://www.google.com/search?q=https%3A%2F%2Fyoutube.com%2F%3Fa%3D1%26b%3D2');
  assert.equal(searchDestination('ciao', 'bing'), 'https://www.bing.com/search?q=ciao');
  assert.equal(searchDestination('   ', 'google'), null);
  assert.equal(searchDestination('ciao'), null);
});
test('blocca protocolli privilegiati e URL non validi', () => {
  for (const input of ['javascript:alert(1)', 'file:///C:/Windows', 'data:text/html,test', 'https://[invalid']) {
    assert.equal(destination(input), null);
  }
});
