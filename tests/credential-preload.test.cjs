const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../src/credential-preload.cjs'),'utf8');
function fixture(){
  const listeners={},messages={},sent=[];
  class Input{constructor(type){Object.assign(this,{type,autocomplete:type==='text'?'username':'current-password',isConnected:true,disabled:false,readOnly:false,_value:'',form:null});}get value(){return this._value;}set value(value){this._value=value;}getBoundingClientRect(){return {width:200,height:30,left:20,top:20,bottom:50};}dispatchEvent(){}focus(){}}
  class Form{}
  const user=new Input('text'),pass=new Input('password'),form=Object.assign(new Form(),{action:'https://example.test/login',querySelector:()=>pass,querySelectorAll:selector=>selector==='input'?[user,pass]:[]});user.form=pass.form=form;
  const context={require:()=>({ipcRenderer:{send:(name,data)=>sent.push({name,data}),on:(name,handler)=>messages[name]=handler}}),process:{isMainFrame:true},location:{protocol:'https:',origin:'https://example.test',href:'https://example.test/login'},crypto,URL,HTMLInputElement:Input,HTMLFormElement:Form,innerHeight:800,document:{hasFocus:()=>true,activeElement:user},getComputedStyle:()=>({visibility:'visible',display:'block',opacity:'1'}),Event:class{},addEventListener:(name,listener)=>listeners[name]=listener,setTimeout:fn=>fn(),Date};
  vm.runInNewContext(source,context);
  return {context,listeners,messages,sent,user,pass,form,focus:()=>listeners.pointerdown({isTrusted:true,target:user})};
}
test('isolated credential agent requires real interaction and matching document/request/origin before filling',()=>{
  const f=fixture();f.listeners.focusin({isTrusted:false,target:f.user});assert.equal(f.sent.length,0);f.focus();assert.equal(f.sent[0].name,'vela:credential-focus');
  f.listeners.focusin({isTrusted:true,target:f.user});assert.equal(f.sent.length,1,'focus restored from an OS prompt must not replace the pending request');
  const data={...f.sent[0].data,origin:'https://example.test',username:'fixture-user',password:'fixture-pass'};
  f.messages['vela:credential-fill']({}, {...data,request:'wrong'});assert.equal(f.pass.value,'');
  f.messages['vela:credential-fill']({}, {...data,origin:'https://other.test'});assert.equal(f.pass.value,'');
  f.messages['vela:credential-fill']({},data);assert.equal(f.pass.value,'fixture-pass');assert.equal(f.user.value,'fixture-user');assert.equal(data.password,'');
  assert.equal(f.context.window,undefined);
});
test('credential agent refuses changed form destinations and hidden fields after authentication',()=>{
  const f=fixture();f.focus();const data={...f.sent[0].data,origin:'https://example.test',username:'user',password:'fixture'};f.form.action='https://phishing.test/';f.messages['vela:credential-fill']({},data);assert.equal(f.pass.value,'');
  f.form.action='https://example.test/login';f.pass.readOnly=true;f.messages['vela:credential-fill']({},data);assert.equal(f.pass.value,'');
});
test('username-first forms can fill the account without injecting a password',()=>{
  const f=fixture();f.form.querySelectorAll=selector=>selector==='input'?[f.user]:[];f.focus();
  const data={...f.sent[0].data,origin:'https://example.test',username:'fixture-user',password:'fixture-secret'};f.messages['vela:credential-fill']({},data);assert.equal(f.user.value,'fixture-user');assert.equal(f.pass.value,'');assert.equal(data.password,'');
});
test('save on submit needs a recent gesture and rejects cross-origin form actions',()=>{
  const f=fixture();f.user.value='demo';f.pass.value='fixture';
  const submit={isTrusted:true,target:f.form};f.listeners.submit(submit);assert.equal(f.sent.length,0);
  f.focus();f.listeners.submit({...submit,submitter:{hasAttribute:()=>true,formAction:'https://other.test/'}});assert.equal(f.sent.length,1);
  f.listeners.submit(submit);assert.equal(f.sent.at(-1).name,'vela:credential-submitted');assert.equal(f.sent.at(-1).data.username,'demo');
});
