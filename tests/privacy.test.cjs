const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { rejectionLabel, consentProgram, privacyFrame } = require('../src/privacy.cjs');
test('consent automation recognizes rejection and never acceptance or ambiguous actions', () => {
  for (const label of ['Rifiuta tutto','Continua senza accettare','Reject all','Only necessary cookies','Tout refuser','Alle ablehnen']) assert.equal(rejectionLabel(label),true,label);
  for (const label of ['Accetta tutto','Accept all','Accept and subscribe','Continua','Rifiuta pagamento','Manage account']) assert.equal(rejectionLabel(label),false,label);
  assert.doesNotThrow(()=>new vm.Script(consentProgram()));
});
test('privacy preload messages must come from a real frame in an owned browsing tab',()=>{
  const ses={},sender={id:3,session:ses,isDestroyed:()=>false},senderFrame={url:'https://cmp.example/cookies'};
  const tabs=[{view:{webContents:{id:3}}}];
  assert.equal(privacyFrame({sender,senderFrame},senderFrame.url,ses,tabs),true);
  assert.equal(privacyFrame({sender,senderFrame},'https://spoof.example',ses,tabs),false);
  assert.equal(privacyFrame({sender,senderFrame},senderFrame.url,{},tabs),false);
  assert.equal(privacyFrame({sender,senderFrame},senderFrame.url,ses,[]),false);
});
