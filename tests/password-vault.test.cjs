const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {PasswordVault,loginOrigin,MAX_BYTES}=require('../src/password-vault.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vela-vault-unit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'vault','credentials.vault');
  // Test double for the OS wrapping layer; production uses only safeStorage.
  const wrappingKey=crypto.randomBytes(32);
  const storage={isAsyncEncryptionAvailable:()=>true,encryptStringAsync:s=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',wrappingKey,iv);const data=Buffer.concat([cipher.update(s),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]);},decryptStringAsync:b=>{const d=crypto.createDecipheriv('aes-256-gcm',wrappingKey,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return {result:Buffer.concat([d.update(b.subarray(28)),d.final()]).toString()};}};
  return {file,storage,vault:new PasswordVault(file,storage)};}
test('vault encrypts both metadata and secrets, authenticates changes, deduplicates and deletes',async t=>{
  const {file,vault}=fixture(t),item={origin:'https://example.test/login',username:'fixture-user',password:'test-only-credential'};
  assert.deepEqual(await vault.merge([item]),{added:1,updated:0});const disk=fs.readFileSync(file,'utf8');assert.ok(!disk.includes(item.password)&&!disk.includes(item.username)&&!disk.includes('example.test'));
  const [entry]=await vault.list('https://example.test');assert.equal(entry.password,undefined);assert.equal((await vault.get(entry.id,entry.origin)).password,item.password);assert.equal(await vault.get(entry.id,'https://other.test'),undefined);
  assert.deepEqual(await vault.merge([{...item,password:'updated-fixture'}]),{added:0,updated:1});assert.equal((await vault.list()).length,1);
  const good=fs.readFileSync(file),bad=JSON.parse(good);bad.tag=crypto.randomBytes(16).toString('base64');fs.writeFileSync(file,JSON.stringify(bad));await assert.rejects(()=>vault.read(),/decrypted/);fs.writeFileSync(file,good);
  await vault.remove(entry.id);assert.deepEqual(await vault.list(),[]);
});
test('vault fails closed without OS encryption, for invalid input and oversized files',async t=>{
  const {file,vault,storage}=fixture(t);for(const url of ['http://example.test','javascript:alert(1)','https://user:pass@example.test','file:///secret'])assert.throws(()=>loginOrigin(url));
  assert.equal(loginOrigin('https://EXAMPLE.test:443/path?q=1'),'https://example.test');
  await assert.rejects(()=>vault.merge([{origin:'https://example.test',username:'x',password:''}]));
  await vault.merge([{origin:'https://example.test',username:'x',password:'fixture'}]);fs.writeFileSync(file,Buffer.alloc(MAX_BYTES+1));await assert.rejects(()=>vault.read(),/Invalid vault/);
  storage.isAsyncEncryptionAvailable=()=>false;await assert.rejects(()=>vault.read(),/unavailable/);await assert.rejects(()=>vault.merge([]),/unavailable/);
});
test('vault cannot be opened with a different Windows wrapping identity',async t=>{
  const {file,vault}=fixture(t);await vault.merge([{origin:'https://example.test',username:'x',password:'fixture'}]);
  const stranger=new PasswordVault(file,{isAsyncEncryptionAvailable:()=>true,decryptStringAsync:()=>crypto.randomBytes(32).toString('base64')});await assert.rejects(()=>stranger.list(),/decrypted/);
});
test('concurrent vault mutations are serialized without losing credentials',async t=>{
  const {vault}=fixture(t);await Promise.all([vault.merge([{origin:'https://one.test',username:'one',password:'fixture'}]),vault.merge([{origin:'https://two.test',username:'two',password:'fixture'}])]);assert.equal((await vault.list()).length,2);
});
