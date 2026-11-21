const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseShortcut, panicConfig, matchesShortcut } = require('../src/panic.cjs');
test('panic shortcuts reject browser conflicts and dangerous destinations',()=>{
  for(const key of ['Ctrl+T','Ctrl+W','Ctrl+Shift+P','Alt+F4','F5','F11','Ctrl+Ctrl+B','B'])assert.equal(parseShortcut(key),null,key);
  assert.equal(parseShortcut('Shift+Ctrl+Space').shortcut,'Ctrl+Shift+Space');
  assert.ok(parseShortcut('F8'));
  for(const url of ['javascript:alert(1)','file:///C:/private','https://user:pass@example.com'])assert.equal(panicConfig({enabled:true,shortcut:'F8',url}),null);
  assert.deepEqual(panicConfig({enabled:true,shortcut:'F8',url:'example.com'}),{enabled:true,shortcut:'F8',url:'https://example.com/'});
});
test('panic activates only for the exact enabled combination, without key-repeat',()=>{
  const config={enabled:true,shortcut:'Ctrl+Shift+Space'};
  const event={type:'keyDown',key:' ',control:true,shift:true,alt:false};
  assert.equal(matchesShortcut(event,config),true);
  for(const extra of [{shift:false},{alt:true},{isAutoRepeat:true},{type:'keyUp'},{meta:true}])assert.equal(matchesShortcut({...event,...extra},config),false);
  assert.equal(matchesShortcut(event,{...config,enabled:false}),false);
});
