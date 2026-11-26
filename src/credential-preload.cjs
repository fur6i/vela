'use strict';
// Isolated sandbox preload. Nothing is exposed on window or via postMessage.
const {ipcRenderer}=require('electron');
if(process.isMainFrame&&location.protocol==='https:'){
  const documentId=crypto.randomUUID();let field=null,lastGesture=0,request=null,quietUntil=0,lastFocus=0;
  let lastInteraction=0;
  const filledPasswords=new WeakSet();
  function sameOriginAction(action){
    try{return new URL(action,location.href).origin===location.origin;}catch{return false;}
  }
  function allowed(input){
    if(!(input instanceof HTMLInputElement)||!['password','text','email'].includes(input.type)||input.disabled||input.readOnly||input.autocomplete==='new-password'||!input.isConnected)return false;
    const box=input.getBoundingClientRect(),style=getComputedStyle(input);
    if(box.width<8||box.height<8||box.bottom<0||box.top>innerHeight||style.visibility!=='visible'||style.display==='none'||Number(style.opacity)===0)return false;
    const form=input.form;
    if(form&&!sameOriginAction(form.action||location.href))return false;
    return input.type==='password'||input.autocomplete==='username'||!!form?.querySelector('input[type="password"]');
  }
  function focus(input){
    if(Date.now()-lastGesture>1000||Date.now()<quietUntil||!document.hasFocus()||!allowed(input))return;
    if(field===input&&Date.now()-lastFocus<300){lastGesture=0;return;}lastFocus=Date.now();lastGesture=0;
    field=input;request=crypto.randomUUID();const box=field.getBoundingClientRect();
    ipcRenderer.send('vela:credential-focus',{documentId,request,url:location.href,x:box.left,y:box.bottom});
  }
  addEventListener('pointerdown',event=>{if(event.isTrusted){lastInteraction=lastGesture=Date.now();const input=event.target;if(!allowed(input))ipcRenderer.send('vela:credential-dismiss',documentId);setTimeout(()=>{if(document.activeElement===input)focus(input);},0);}},true);
  addEventListener('keydown',event=>{if(event.isTrusted){lastInteraction=lastGesture=Date.now();if(event.key==='Escape')ipcRenderer.send('vela:credential-dismiss',documentId);}},true);
  for(const name of ['scroll','resize'])addEventListener(name,()=>ipcRenderer.send('vela:credential-dismiss',documentId),{capture:true,passive:true});
  addEventListener('focusin',event=>{if(event.isTrusted)focus(event.target);},true);
  addEventListener('input',event=>{if(event.isTrusted){lastInteraction=Date.now();filledPasswords.delete(event.target);}},true);
  function loginFields(form,selected){
    if(!form)return {password:selected?.type==='password'?selected:null,username:selected?.autocomplete==='username'?selected:null};
    const inputs=Array.from(form.elements||form.querySelectorAll('input')).filter(input=>input instanceof HTMLInputElement);
    const passwords=inputs.filter(input=>input.type==='password');
    if(passwords.length>1||passwords.some(input=>input.autocomplete==='new-password'))return {};
    if(form.querySelectorAll('[formaction]').length&&Array.from(form.querySelectorAll('[formaction]')).some(button=>!sameOriginAction(button.formAction)))return {};
    const usernames=inputs.filter(input=>input.type!=='password'&&allowed(input));
    return {password:passwords.find(allowed),username:usernames.find(input=>input.autocomplete==='username')||usernames.find(input=>input.type==='email')||usernames[0]};
  }
  function setValue(input,value){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
  ipcRenderer.on('vela:credential-fill',(_event,data)=>{
    if(data?.documentId!==documentId||data.request!==request||data.origin!==location.origin||!allowed(field))return;
    const form=field.form,{password,username}=loginFields(form,field);
    if(!password&&(!username||field.autocomplete!=='username'))return;
    quietUntil=Date.now()+1200;request=null;
    if(username)setValue(username,data.username);
    if(password&&password.form===form&&allowed(password)){filledPasswords.add(password);setValue(password,data.password);}
    data.password='';(password||username)?.focus();
  });
  ipcRenderer.on('vela:credential-capture',(_event,data)=>{
    if(data?.documentId!==documentId||data.request!==request||data.origin!==location.origin||!allowed(field))return;
    const {password,username}=loginFields(field.form,field);
    ipcRenderer.send('vela:credential-captured',{documentId,request,origin:location.origin,username:username?.value||'',password:password?.value||''});
  });
  addEventListener('submit',event=>{
    if(!event.isTrusted||Date.now()-lastInteraction>1500||!document.hasFocus())return;
    const form=event.target;
    if(!(form instanceof HTMLFormElement)||!sameOriginAction(form.action||location.href))return;
    if(event.submitter?.hasAttribute('formaction')&&!sameOriginAction(event.submitter.formAction))return;
    const {password,username}=loginFields(form);
    if(!password?.value||filledPasswords.has(password)||password.value.length>4096||(username?.value.length||0)>512)return;
    lastInteraction=0;
    ipcRenderer.send('vela:credential-submitted',{origin:location.origin,username:username?.value||'',password:password.value});
  },true);
  addEventListener('pagehide',()=>{field=null;request=null;ipcRenderer.send('vela:credential-dismiss',documentId);},{once:true});
}
