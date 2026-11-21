const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { VirusTotal, hashFile, localClipboardPath } = require('../src/virustotal.cjs');
const key='0123456789abcdef'.repeat(4);
function fixture(t,fetchImpl,approved=1){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vela-vt-test-'));
  t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});
  const file=path.join(root,'test file.txt');fs.writeFileSync(file,'Vela harmless test fixture');
  const dialogs=[];
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value).reverse(),decryptString:value=>Buffer.from(value).reverse().toString()};
  const app={getPath:()=>root};
  const vt=new VirusTotal({app,safeStorage,dialog:{showMessageBox:async(_window,options)=>{dialogs.push(options);return{response:approved};}},getWindow:()=>null,notify:()=>{},fetchImpl,wait:async()=>{}});
  return{root,file,vt,dialogs,app,safeStorage};
}
const response=(attributes,status=200)=>new Response(JSON.stringify({data:{attributes}}),{status,headers:{'content-type':'application/json'}});
test('VirusTotal hashes locally and consults known reports without uploading file bytes',async t=>{
  const calls=[];const {vt,file,root,app,safeStorage}=fixture(t,async(url,options)=>{calls.push({url,options});return response({last_analysis_stats:{malicious:0,suspicious:0,undetected:65},last_analysis_date:1700000000});});
  await vt.saveKey(key);assert.equal(fs.readFileSync(vt.keyFile()).includes(Buffer.from(key)),false);
  const restored=new VirusTotal({app,safeStorage,notify:()=>{}});assert.equal(restored.snapshot().keyConfigured,true);
  await vt.select(file);
  assert.equal(vt.state.hash,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/files/'+vt.state.hash));assert.equal(calls[0].options.method,undefined);
  assert.equal(calls[0].options.headers['x-apikey'],key);assert.equal(calls[0].options.redirect,'error');
  assert.equal(vt.state.report.total,65);assert.equal(vt.state.report.stats.malicious,0);
  assert.equal(JSON.stringify(vt.snapshot()).includes(key),false);assert.equal(JSON.stringify(vt.snapshot()).includes(root),false);
  const oldHash=vt.state.hash;fs.writeFileSync(file,'a new version of the harmless fixture');await vt.refresh();assert.notEqual(vt.state.hash,oldHash);assert.ok(calls.at(-1).url.endsWith('/files/'+vt.state.hash));
  await vt.forgetKey();assert.equal(fs.existsSync(vt.keyFile()),false);
});
test('VirusTotal uploads only after consent, streams a file and polls to completion',async t=>{
  let posts=0,polls=0;const {vt,file,dialogs}=fixture(t,async(url,options)=>{
    if(url.includes('/files/')&&options.method!=='POST')return response(null,404);
    if(options.method==='POST'){posts++;const uploaded=options.body.get('file');assert.equal(uploaded.name,path.basename(file));assert.equal(await uploaded.text(),'Vela harmless test fixture');return new Response(JSON.stringify({data:{id:'test-analysis'}}));}
    polls++;return response({status:polls===1?'queued':'completed',stats:{malicious:2,undetected:60},results:{EngineA:{category:'malicious',result:'test-detection'}}});
  });
  await vt.saveKey(key);await vt.select(file);assert.equal(vt.state.status,'unknown');assert.equal(posts,0);
  await vt.upload();assert.equal(posts,1);assert.equal(dialogs.length,1);assert.match(dialogs[0].detail,/contenuto del file/);
  assert.equal(polls,2);assert.equal(vt.state.status,'report');assert.equal(vt.state.report.stats.malicious,2);
});
test('VirusTotal respects declined upload, rejects modified files and does not leak API keys through redirects',async t=>{
  let posts=0;const network=async(_url,options)=>{if(options.method==='POST')posts++;return response(null,404);};
  const declined=fixture(t,network,0);await declined.vt.saveKey(key);await declined.vt.select(declined.file);await declined.vt.upload();assert.equal(posts,0);
  const changed=fixture(t,network);await changed.vt.saveKey(key);await changed.vt.select(changed.file);fs.writeFileSync(changed.file,'changed');await changed.vt.upload();assert.match(changed.vt.state.error,/cambiato/);assert.equal(posts,0);
  await assert.rejects(()=>changed.vt.api('https://evil.example/upload',{},new AbortController().signal),/Destinazione/);
  await assert.rejects(()=>changed.vt.api('https://fake.virustotal.com/upload',{},new AbortController().signal),/Destinazione/);
});
test('VirusTotal handles missing keys and quota errors without inventing a clean result',async t=>{
  const {vt,file}=fixture(t,async()=>response(null,429));await vt.select(file);assert.equal(vt.state.status,'selected');assert.equal(vt.state.report,null);
  await vt.saveKey(key);await vt.refresh();assert.match(vt.state.error,/Limite API/);assert.equal(vt.state.report,null);
  assert.equal(localClipboardPath(pathToFileURL(file).href),file);
  assert.equal(localClipboardPath('https://example.com/file.exe'),null);assert.equal(localClipboardPath('file://remote-host/share/file.exe'),null);
  assert.equal(await hashFile(file),vt.state.hash);
});
