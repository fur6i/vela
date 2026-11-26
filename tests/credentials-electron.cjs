// Real Chromium/HTTPS preload probe. Run: npx electron tests/credentials-electron.cjs
// Never reads real credentials, opens an OS credential dialog, or changes TLS flags.
const assert=require('node:assert/strict'),path=require('node:path');
const {app,BrowserWindow,session,ipcMain}=require('electron');
app.enableSandbox();app.setPath('userData',path.join(__dirname,'..','.smoke-profile','credential-integration'));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let win,view,captured;
const live=process.argv.includes('--autofill-me');
const origin=live?'https://autofill.me':'https://credential-fixture.invalid';
const timeout=setTimeout(()=>{console.error('CREDENTIAL INTEGRATION FAIL: timeout');app.exit(1);},20000);
app.whenReady().then(async()=>{
  const ses=session.fromPartition('credential-integration');
  if(!live)ses.protocol.handle('https',()=>new Response('<!doctype html><meta charset="utf-8"><form action="https://credential-fixture.invalid/login" style="margin:20px"><label>User<input id="user" autocomplete="username" style="display:block;width:220px;height:30px"></label><label>Password<input id="pass" type="password" autocomplete="current-password" style="display:block;width:220px;height:30px"></label></form>',{headers:{'Content-Type':'text/html'}}));
  ses.registerPreloadScript({type:'frame',filePath:path.join(__dirname,'..','src','credential-preload.cjs')});
  win=new BrowserWindow({width:650,height:420,show:true,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  view={webContents:win.webContents};view.webContents.setAudioMuted(true);
  view.webContents.on('preload-error',(_event,_file,error)=>console.error('Credential preload error:',error.message));
  view.webContents.on('console-message',event=>{if(event.level==='error')console.error('Credential fixture console:',event.message);});
  ipcMain.on('vela:credential-focus',(event,data)=>{if(event.sender===view.webContents)captured=data;});
  await view.webContents.loadURL(origin+(live?'/form/login-simple':'/login'));win.focus();view.webContents.focus();await wait(250);
  if(live)await view.webContents.executeJavaScript(`(()=>{
    const password=document.querySelector('input[type=password]');
    const username=password.form.querySelector('input[autocomplete=username],input[type=email],input[type=text]');
    username.id='user';password.id='pass';
    // The live test only inspects filled fields and never submits them.
    addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
  })()`);
  for(let attempt=0;attempt<20;attempt++){try{await view.webContents.capturePage();break;}catch(error){if(attempt===19)throw error;await wait(250);}}await wait(200);
  const box=await view.webContents.executeJavaScript('document.getElementById("user").getBoundingClientRect().toJSON()');
  const point={x:Math.round(box.x+20),y:Math.round(box.y+10),button:'left',clickCount:1};
  view.webContents.sendInputEvent({type:'mouseMove',...point});await wait(80);view.webContents.sendInputEvent({type:'mouseDown',...point});view.webContents.sendInputEvent({type:'mouseUp',...point});
  await wait(100);
  if(!captured){view.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});view.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});}
  for(let attempt=0;attempt<20&&!captured;attempt++)await wait(100);
  assert.ok(captured,'trusted Chromium input should request suggestions from the isolated preload: '+JSON.stringify(await view.webContents.executeJavaScript('({focused:document.hasFocus(),active:document.activeElement.id,secure:isSecureContext,uuid:typeof crypto.randomUUID})')));
  assert.equal(await view.webContents.executeJavaScript('typeof window.vela+":"+typeof require'),'undefined:undefined');
  const message={...captured,origin,username:'fixture-user',password:'fixture-secret'};
  view.webContents.mainFrame.send('vela:credential-fill',{...message,documentId:'stale'});await wait(80);assert.equal(await view.webContents.executeJavaScript('document.getElementById("pass").value'),'');
  view.webContents.mainFrame.send('vela:credential-fill',message);await wait(80);assert.equal(await view.webContents.executeJavaScript('document.getElementById("user").value'),'fixture-user');assert.equal(await view.webContents.executeJavaScript('document.getElementById("pass").value'),'fixture-secret');
  console.log('CREDENTIAL INTEGRATION PASS: trusted focus, isolated HTTPS preload, stale-document rejection and actual DOM autofill.');
  clearTimeout(timeout);win.destroy();app.exit(0);
}).catch(error=>{clearTimeout(timeout);console.error('CREDENTIAL INTEGRATION FAIL:',error.message);app.exit(1);});
