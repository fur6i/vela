const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const {privateTarget,deferredCleanup,registerPrivate,cleanupOrphans,ownerFile}=require('../src/private-cleanup.cjs');
test('private cleanup only accepts app-created direct temporary children',()=>{
 const root=os.tmpdir(),valid=path.join(root,'vela-private-Ab123x');assert.equal(privateTarget(valid,root),path.resolve(valid));for(const value of [root,path.dirname(root),path.join(root,'other'),path.join(root,'vela-private-'),path.join(root,'nested','vela-private-Ab123x'),'relative'])assert.equal(privateTarget(value,root),null);
});
test('locked private cleanup uses hidden PowerShell, verified paths and no Electron worker',()=>{
 const root=os.tmpdir(),target=path.join(root,'vela-private-Ab123x');let call;assert.equal(deferredCleanup(target,root,1234,(...args)=>{call=args;return {status:0};}),true);assert.match(call[0],/powershell\.exe$/);assert.equal(call[2].windowsHide,true);assert.equal(call[2].env.VELA_PRIVATE_CLEANUP,target);assert.equal(call[2].env.VELA_PRIVATE_PID,'1234');assert.ok(call[1].includes('-NonInteractive'));assert.ok(call[1].includes('Hidden'));assert.match(Buffer.from(call[1].at(-1),'base64').toString('utf16le'),/Start-Process/);assert.equal(deferredCleanup(root,root,1234,()=>{throw Error('must not spawn');}),false);
});
test('orphan cleanup removes owned dead profiles and preserves live or unknown directories',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vela-cleanup-test-'));try{
  const dead=path.join(root,'vela-private-Ab123x'),live=path.join(root,'vela-private-Cd456y'),unknown=path.join(root,'vela-private-Ef789z');for(const dir of [dead,live,unknown])fs.mkdirSync(dir);
  registerPrivate(dead,root);registerPrivate(live,root);fs.writeFileSync(ownerFile(dead,root),JSON.stringify({pid:999999,name:path.basename(dead)}));await cleanupOrphans(root,pid=>pid===process.pid);assert.equal(fs.existsSync(dead),false);assert.equal(fs.existsSync(ownerFile(dead,root)),false);assert.equal(fs.existsSync(live),true);assert.equal(fs.existsSync(unknown),true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
