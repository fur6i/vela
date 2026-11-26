const {test}=require('node:test'),assert=require('node:assert/strict');
const {CredentialController}=require('../src/credential-controller.cjs');
function fixture(authenticate=async()=>true){let active;const sent=[],frame={url:'https://example.test/login',send:(name,data)=>sent.push({name,data})};
  const wc={mainFrame:frame,getURL:()=>frame.url,isDestroyed:()=>false,isFocused:()=>true,getOwnerBrowserWindow:()=>({getContentBounds:()=>({width:1000,height:800})})};active=wc;
  const win={isVisible:()=>true,isFocused:()=>true};let read=0,merged=0;
  const vault={available:()=>true,list:()=>[{id:'id',origin:'https://example.test',username:'user'}],get:()=>{read++;return {username:'user',password:'fixture-secret'};},merge:()=>{merged++;}};
  const controller=new CredentialController({vault,authenticate,getWindow:()=>win,getActive:()=>active,Menu:{buildFromTemplate:()=>({popup(){},closePopup(){}})},confirmSave:async()=>true,translate:x=>x,onError(){throw Error('Unexpected error');}});
  const event={sender:wc,senderFrame:frame},data={documentId:'11111111-1111-4111-8111-111111111111',request:'22222222-2222-4222-8222-222222222222',url:frame.url};
  return {controller,event,data,sent,frame,setActive:value=>active=value,reads:()=>read,merged:()=>merged};
}
test('credential fill requires OS success and sends only the chosen origin-bound secret to its frame',async()=>{
  const f=fixture();await f.controller.focus(f.event,f.data);assert.equal(await f.controller.fill(f.controller.pending,'id'),true);assert.equal(f.reads(),1);assert.equal(f.sent[0].name,'vela:credential-fill');assert.equal(f.sent[0].data.origin,'https://example.test');assert.equal(f.controller.pending,null);
  const denied=fixture(async()=>false);let notice;denied.controller.onError=message=>{notice=message;};
  await denied.controller.focus(denied.event,denied.data);assert.equal(await denied.controller.fill(denied.controller.pending,'id'),false);assert.equal(denied.reads(),0);assert.deepEqual(denied.sent,[]);assert.match(notice,/annullata/);
});
test('submitted credentials require matching origin, explicit approval and Windows authentication',async()=>{
  const item={origin:'https://example.test',username:'demo',password:'fixture'};
  const f=fixture();assert.equal(await f.controller.submitted(f.event,{...item,origin:'https://other.test'}),false);
  f.controller.confirmSave=async()=>false;
  assert.equal(await f.controller.submitted(f.event,item),false);assert.equal(f.merged(),0);
  f.controller.confirmSave=async options=>{assert.equal(options.origin,item.origin);assert.equal(Object.hasOwn(options,'password'),false);return true;};
  assert.equal(await f.controller.submitted(f.event,item),true);assert.equal(f.merged(),1);
});
test('navigation, switching tabs and document invalidation while authenticating block autofill',async()=>{
  for(const change of [f=>f.frame.url='https://phishing.test/',f=>f.setActive({}),f=>f.controller.clear()]){
    let allow;const f=fixture(()=>new Promise(resolve=>allow=resolve));await f.controller.focus(f.event,f.data);const work=f.controller.fill(f.controller.pending,'id');await new Promise(resolve=>setImmediate(resolve));change(f);allow(true);assert.equal(await work,false);assert.equal(f.reads(),0);assert.deepEqual(f.sent,[]);
  }
});
test('subframes, unowned contents, insecure origins and private mode never get a vault menu',async()=>{
  const f=fixture();await f.controller.focus({...f.event,senderFrame:{url:f.data.url}},f.data);assert.equal(f.controller.pending,null);await f.controller.focus({...f.event,sender:{}},f.data);assert.equal(f.controller.pending,null);
  f.frame.url='http://example.test/';await f.controller.focus(f.event,{...f.data,url:f.frame.url});assert.equal(f.controller.pending,null);
  f.frame.url=f.data.url;f.controller.enabled=false;await f.controller.focus(f.event,f.data);assert.equal(f.controller.pending,null);
});
test('saving a captured form requires a browser-issued capture request and native confirmation plus auth',async()=>{
  const f=fixture();await f.controller.focus(f.event,f.data);const captured={...f.data,origin:'https://example.test',username:'user',password:'fixture'};
  assert.equal(await f.controller.captured(f.event,captured),false);assert.equal(f.merged(),0);
  f.controller.pending.capture=true;assert.equal(await f.controller.captured(f.event,captured),true);assert.equal(f.merged(),1);
});
test('document navigation during asynchronous vault decryption also blocks secret release',async()=>{
  const f=fixture();let finish;f.controller.vault.get=()=>new Promise(resolve=>finish=resolve);await f.controller.focus(f.event,f.data);
  const fill=f.controller.fill(f.controller.pending,'id');await new Promise(resolve=>setImmediate(resolve));f.frame.url='https://other.test/';finish({username:'user',password:'fixture'});assert.equal(await fill,false);assert.deepEqual(f.sent,[]);
});
