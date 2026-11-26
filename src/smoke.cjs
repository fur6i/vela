const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({ win, createTab, select, closeTab, state, browserSession, app, suspendTab, reopen, blocker, diagnostics, updateSidebarPointer, updatePageScrollbar, sidebarSurface, dockSurface, shortcut,openPrivate,searchSuggestions,credentialMenu }) => {
  const { Request } = require('@ghostery/adblocker-electron');
  const { captureFullPage, convertImage } = require('./native-tools.cjs');
  const { nativeImage, session, WebContentsView, BrowserWindow,net } = require('electron');
  const { ExtensionShelf, storeResponse } = require('./extension-shelf.cjs');
  const started = performance.now();
  let captureStep='initial setup';
  let pageLoads = 0;
  let privacyHeaders={};
  let pageUserAgent;
  const scriptletsAvailable = Boolean(blocker.resources.getScriptlet('set-constant.js'));
  blocker.updateFromDiff({ added: ['127.0.0.1##.vela-ad-fixture', '127.0.0.1##+js(set-constant, velaDocumentStart, true)'] });
  const server = http.createServer((_request, response) => {
    if(_request.url==='/store-redirect'){response.writeHead(302,{Location:'/store-package'});response.end();return;}
    if(_request.url==='/store-package'){response.end('extension fixture');return;}
    if(_request.url.startsWith('/suggest-probe')){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(['how many',['how many countries','how many days']]));return;}
    if(_request.url==='/interrupted-transfer'){response.writeHead(200,{'Content-Type':'text/plain','Content-Length':'1000000'});response.write('partial');setTimeout(()=>response.destroy(),25);return;}
    if(_request.url==='/multipart-probe'){const chunks=[];_request.on('data',chunk=>chunks.push(chunk));_request.on('end',()=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({type:_request.headers['content-type'],body:Buffer.concat(chunks).toString()}));});return;}
    if (_request.url === '/favicon.svg') { response.setHeader('Content-Type','image/svg+xml');response.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ff0000"/></svg>');return; }
    if (_request.url === '/favicon.ico') {response.writeHead(404);response.end();return;}
    if (_request.url === '/favicon.png') { response.setHeader('Content-Type','image/png'); response.end(nativeImage.createFromPath(path.join(__dirname,'../assets/vela.png')).resize({width:32,height:32}).toPNG()); return; }
    if(_request.url==='/download-probe'){response.setHeader('Content-Type','application/octet-stream');response.setHeader('Content-Disposition','attachment; filename="Vela-test.txt"');response.end('Harmless Vela download fixture');return;}
    if(_request.url==='/privacy'){
      privacyHeaders=_request.headers;response.setHeader('Content-Type','text/html');
      response.end('<!doctype html><title>Cookie probe</title><button id="unrelated" onclick="document.body.dataset.unrelated=\'clicked\'">Rifiuta</button><div id="onetrust-banner-sdk"><p>Questo sito usa cookie</p><button id="onetrust-reject-all-handler" onclick="document.body.dataset.rejected=\'yes\';this.parentElement.remove()">Rifiuta tutto</button><button id="accept" onclick="document.body.dataset.accepted=\'yes\'">Accetta tutto</button></div><script src="https://www.google-analytics.com/analytics.js"></script><iframe src="http://localhost:'+server.address().port+'/privacy-third"></iframe>');return;
    }
    if(_request.url==='/privacy-third'){response.setHeader('Content-Type','text/html');response.setHeader('Cache-Control','no-store');response.setHeader('Set-Cookie','third_party_probe=yes; Path=/; SameSite=Lax');response.end('<!doctype html><p>Third party cookie probe</p>');return;}
    if (_request.url === '/broken') { _request.socket.destroy(); return; }
    if (_request.url === '/native-tools') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Native tools fixture</title><div style="height:2600px;background:linear-gradient(#18354b,#86b29c)">Pagina intera</div><audio id="test-audio"></audio>'); return;
    }
    pageLoads++;
    pageUserAgent = _request.headers['user-agent'];
    response.setHeader('Content-Type', 'text/html');
    response.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; script-src 'nonce-dmVsYXRlc3Q=' https://doubleclick.net; style-src 'none'");
    response.end('<!doctype html><title>Vela smoke fixture</title><h1>Pagina di prova</h1><div class="vela-ad-fixture">Pubblicità di prova</div><script nonce="dmVsYXRlc3Q=">window.earlyAtInline = window.velaDocumentStart === true; window.nodeExposed = typeof require !== "undefined";</script><script nonce="dmVsYXRlc3Q=" src="https://doubleclick.net/vela-ad-probe" onload="window.probe=\'allowed\'" onerror="window.probe=\'blocked\'"></script>');
  });
  const portable=Boolean(app.isPackaged&&process.env.PORTABLE_EXECUTABLE_FILE);
  const timeout = setTimeout(() => { console.error('SMOKE FAIL: timeout'); server.close(); app.exit(1); },portable?210000:75000);
  const wait = (ms = 160) => new Promise((resolve) => setTimeout(resolve, ms));
  const captureDock=async()=>{for(let attempt=0;attempt<4;attempt++){try{return await dockSurface.webContents.capturePage();}catch(error){if(!/UnknownVizError/.test(error.message)||attempt===3)throw error;await wait(250);}}};
  const output = (name) => app.isPackaged ? path.join(app.getPath('temp'), `Vela-${name}`) : path.join(__dirname, '..', name);
  try {
    if (process.argv.includes('--online-filters')) assert.equal(state().protection, 'ready', 'scaricamento delle liste complete');
    if(process.argv.includes('--language=en')){assert.equal(state().settings.language,'en');await wait();assert.equal(await win.webContents.executeJavaScript('document.documentElement.lang'),'en');await win.webContents.executeJavaScript('window.vela.command("language","it")');await wait();}

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const storeOrigin = `http://127.0.0.1:${server.address().port}`;
    const storeRedirect = await storeResponse(net, `${storeOrigin}/store-redirect`, { signal: AbortSignal.timeout(5000) });
    assert.equal(storeRedirect.status, 302);
    assert.equal(storeRedirect.headers.get('location'), `${storeOrigin}/store-package`);
    const storePackage = await storeResponse(net, storeRedirect.headers.get('location'), { signal: AbortSignal.timeout(5000) });
    assert.equal(storePackage.ok, true);
    const storeChunks = [];
    for await (const chunk of storePackage.body) storeChunks.push(chunk);
    assert.equal(Buffer.concat(storeChunks).toString(), 'extension fixture');
    for(let attempt=0;attempt<3;attempt++){let rejected=false;try{await(await net.fetch(`http://127.0.0.1:${server.address().port}/interrupted-transfer`)).text();}catch{rejected=true;}assert.equal(rejected,true,'interrupted Chromium transfers must reject without an uncaught parser error');}
    const multipart=new FormData();multipart.set('file',new Blob(['Harmless transport probe']),'probe.txt');
    const transport=await(await net.fetch(`http://127.0.0.1:${server.address().port}/multipart-probe`,{method:'POST',body:multipart})).json();assert.match(transport.type,/multipart\/form-data; boundary=/);assert.match(transport.body,/Harmless transport probe/);
    await wait();
    assert.equal(state().settings.searchEngine, null);
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("search-panel").hidden'), false, 'first launch must ask before using a search engine');
    await win.webContents.executeJavaScript('document.querySelector("[data-engine=brave]").click()'); await wait();
    assert.equal(state().settings.searchEngine, 'brave');
    captureStep='beta vault and migration UI';
    const betaPanels=await win.webContents.executeJavaScript(`(async()=>{document.getElementById('settings-passwords').click();await new Promise(r=>setTimeout(r,100));const vault=!document.getElementById('passwords-panel').hidden&&document.getElementById('vault-form').hidden;document.querySelector('#passwords-panel .close-panel').click();await new Promise(r=>setTimeout(r,100));document.getElementById('settings-arc').click();await new Promise(r=>setTimeout(r,100));const arc=!document.getElementById('arc-panel').hidden;document.querySelector('#arc-panel .close-panel').click();return {vault,arc,bridge:typeof window.VelaVaultUI.lock};})()`);
    assert.equal(betaPanels.vault,true);assert.equal(betaPanels.arc,true);assert.equal(betaPanels.bridge,'function');
    await credentialMenu.show([{label:'vault-fixture.invalid',enabled:false},{label:'smoke-user',click:()=>{}}],{x:260,y:140});await wait();
    assert.equal(credentialMenu.view.getVisible(),true);assert.equal(await credentialMenu.view.webContents.executeJavaScript('typeof window.vela'),'undefined');assert.equal(await credentialMenu.view.webContents.executeJavaScript('document.querySelectorAll("button").length'),1);credentialMenu.hide();
    const saveDecision=credentialMenu.confirmSave({title:'Salvare le credenziali?',origin:'https://vault-fixture.invalid',username:'smoke-user',cancel:'Annulla',save:'Salva',tabId:state().activeId});await wait();
    const savePanel=await credentialMenu.view.webContents.executeJavaScript('({visible:!!document.querySelector(".save-confirmation[role=dialog]"),buttons:[...document.querySelectorAll("button")].map(button=>button.textContent),origin:document.querySelector("strong")?.textContent,focus:document.activeElement?.textContent})');
    assert.deepEqual(savePanel,{visible:true,buttons:['Annulla','Salva'],origin:'https://vault-fixture.invalid',focus:'Annulla'});
    credentialMenu.hide();assert.equal(await saveDecision,false);
    const {PasswordVault}=require('./password-vault.cjs'),{safeStorage}=require('electron');
    const vaultTemp=fs.mkdtempSync(path.join(app.getPath('temp'),'vela-vault-smoke-')),vaultFile=path.join(vaultTemp,'credentials.vault');
    try{const vault=new PasswordVault(vaultFile,safeStorage);assert.equal(await vault.available(),true);await vault.merge([{origin:'https://vault-fixture.invalid',username:'smoke-user',password:'smoke-only-secret'}]);const entry=(await vault.list())[0];assert.equal(entry.password,undefined);assert.equal((await vault.get(entry.id,entry.origin)).password,'smoke-only-secret');assert.ok(!fs.readFileSync(vaultFile,'utf8').includes('smoke-only-secret'));}finally{if(fs.existsSync(vaultFile))fs.unlinkSync(vaultFile);fs.rmdirSync(vaultTemp);}
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("overlay").hidden'), true);
    await win.webContents.executeJavaScript('document.getElementById("extensions-button").click()'); await wait();
    assert.equal(await dockSurface.webContents.executeJavaScript('document.querySelectorAll(".native-shelf [data-native]").length'), 8);
    const initialDock=[...state().dockOrder.native];
    await dockSurface.webContents.executeJavaScript(`(()=>{const source=document.querySelector('[data-native=video]'),target=document.querySelector('[data-native=panic]'),transfer=new DataTransfer(),box=target.getBoundingClientRect();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:box.right-1}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));})()`);await wait();
    assert.equal(state().dockOrder.native.at(-1),'video');
    assert.equal(await dockSurface.webContents.executeJavaScript('document.querySelector(".native-shelf").lastElementChild.dataset.native'),'video');
    await win.webContents.executeJavaScript(`window.vela.command('dock-order',{kind:'native',ids:${JSON.stringify(initialDock)}})`);await wait();
    assert.equal(state().overlay,false,'the dock must not activate the modal overlay');
    assert.equal(state().dockOpen,true);
    const dockFits=()=>dockSurface.webContents.executeJavaScript(`(()=>{
      const note=document.getElementById('extension-note').getBoundingClientRect();
      const store=document.getElementById('extension-store-open').getBoundingClientRect();
      return note.height>0&&note.bottom<=innerHeight&&store.height>0&&store.bottom<=innerHeight;
    })()`);
    assert.equal(await dockFits(),true);
    await dockSurface.webContents.executeJavaScript('document.querySelector("#extensions-panel .close-panel").click()');
    await wait(300);
    await win.webContents.executeJavaScript('document.getElementById("extensions-button").click()');await wait(300);
    assert.equal(await dockFits(),true,'the footer must fit after reopening the dock at the same size');
    await dockSurface.webContents.executeJavaScript('document.querySelector("#extensions-panel .close-panel").click()');
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("app-version").textContent'), `v${app.getVersion()}`);
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("start-copyright").textContent'), '© fur6i');
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("store-listing-button").hidden'), true);
    win.showInactive(); await wait();
    const initialCount = state().tabs.length;
    await win.webContents.executeJavaScript('window.vela.command("new")'); await wait();
    assert.equal(state().tabs.length, initialCount, 'opening the launcher must not allocate an empty tab');
    assert.equal(await win.webContents.executeJavaScript('document.activeElement.id'), 'launcher-query');
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("launcher-panel").hidden'), false);
    const launcherStyle=await win.webContents.executeJavaScript('(()=>{const style=getComputedStyle(document.getElementById("launcher-panel"));return {clip:style.clipPath,gutter:style.scrollbarGutter};})()');
    assert.deepEqual(launcherStyle,{clip:'none',gutter:'auto'},'launcher must retain its own rounded border and shadow without a scrollbar gutter');
    fs.writeFileSync(output('launcher-empty-preview.png'),(await win.webContents.capturePage()).toPNG());
    const fixtureUrl = `http://127.0.0.1:${server.address().port}/`;
    await win.webContents.executeJavaScript(`(() => {
      document.getElementById('launcher-query').value = ${JSON.stringify(fixtureUrl)};
      document.getElementById('launcher-query').dispatchEvent(new Event('input'));
      document.getElementById('launcher-form').requestSubmit();
    })()`); await wait();
    const launched = state().activeId;
    assert.equal(state().tabs.length, initialCount + 1);
    assert.equal(state().tabs.find((item) => item.id === launched).url, fixtureUrl);
    await win.webContents.executeJavaScript('window.vela.command("new")'); await wait();
    const launcherPreview = await win.webContents.capturePage(); fs.writeFileSync(output('launcher-preview.png'), launcherPreview.toPNG());
    await win.webContents.executeJavaScript(`(() => {
      const input = document.getElementById('launcher-query'); input.value = '127.0.0.1'; input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true}));
      document.getElementById('launcher-form').requestSubmit();
    })()`); await wait();
    assert.equal(state().tabs.length, initialCount + 1, 'switch-to-tab must reuse the existing tab');
    assert.equal(state().activeId, launched);
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("overlay").hidden'), true);
    closeTab(launched); await wait();
    const originalId=state().activeId;
    const recent=[0,1,2].map(index=>createTab(`http://127.0.0.1:${server.address().port}/recent-${index}`,{background:true,lazy:true,title:`Recent ${index}`}));
    select(recent[2].id);select(recent[0].id);
    await win.webContents.executeJavaScript('window.vela.command("new")');await wait();
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".launcher-row").length'),2);
    assert.deepEqual(state().recentTabIds,[recent[0].id,recent[2].id]);
    const originalFetch=searchSuggestions.fetch;searchSuggestions.fetch=(_url,options)=>net.fetch(`http://127.0.0.1:${server.address().port}/suggest-probe`,options);
    await win.webContents.executeJavaScript('document.getElementById("launcher-query").value="how many";document.getElementById("launcher-query").dispatchEvent(new Event("input"))');
    for(let attempt=0;attempt<40&&!await win.webContents.executeJavaScript('document.getElementById("launcher-results").textContent.includes("how many countries")');attempt++)await wait(60);
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("launcher-results").textContent.includes("how many countries")'),true);
    searchSuggestions.cancel();searchSuggestions.cache.clear();searchSuggestions.fetch=originalFetch;
    select(originalId);for(const item of recent)closeTab(item.id);await wait();
    await win.webContents.executeJavaScript(`(() => {
      const input = document.getElementById('home-query'); input.focus(); input.value = 'youtube.com';
    })()`);
    assert.equal(await win.webContents.executeJavaScript('document.activeElement.id'), 'home-query', 'the home search must have its own input');
    await win.webContents.executeJavaScript('document.getElementById("start-search").requestSubmit()'); await wait();
    assert.equal(state().tabs.find((item) => item.id === state().activeId).url, 'https://search.brave.com/search?q=youtube.com');
    await win.webContents.executeJavaScript('document.getElementById("home-button").click()'); await wait();
    assert.equal(state().tabs.find(item=>item.id===state().activeId).url,'vela://start');
    await win.webContents.executeJavaScript('window.vela.command("theme", "light")');
    await wait();
    for (const width of [800, 1360, 2560]) {
      win.setContentSize(width, 900); await wait();
      for (let mode = 0; mode < 2; mode++) {
        const offset = await win.webContents.executeJavaScript('(()=>{const r=document.querySelector(".address-wrap").getBoundingClientRect(); return Math.abs(r.left+r.width/2-innerWidth/2)})()');
        assert.ok(offset < 1, `address field must be centered at ${width}px (offset ${offset})`);
        const placement=await win.webContents.executeJavaScript('(()=>{const url=document.querySelector(".address-wrap").getBoundingClientRect(),home=document.getElementById("home-button").getBoundingClientRect(),shield=document.getElementById("protection").getBoundingClientRect();return {left:url.left-home.right,right:shield.left-url.right,homeBefore:home.right<=url.left,shieldAfter:shield.left>=url.right};})()');
        assert.ok(placement.homeBefore&&placement.shieldAfter);assert.ok(Math.abs(placement.left-placement.right)<1,'home and shield must have symmetric spacing');
        assert.equal(await win.webContents.executeJavaScript('(()=>{const copy=document.querySelector(".address-wrap > #copy-address"),address=document.getElementById("address");return !!copy&&copy.getBoundingClientRect().right<=address.getBoundingClientRect().left;})()'),true);
        await win.webContents.executeJavaScript('window.vela.command("sidebar")'); await wait();
      }
    }
    win.setContentSize(1360, 900); await wait();
    assert.equal(await win.webContents.executeJavaScript('typeof window.vela.command'), 'function');
    assert.equal(await win.webContents.executeJavaScript('typeof require'), 'undefined');
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".favorite").length'), 6);
    const originalFavorites = JSON.parse(JSON.stringify(state().pins));
    await win.webContents.executeJavaScript('document.fonts.ready');
    assert.equal(await win.webContents.executeJavaScript('getComputedStyle(document.body).fontFamily.includes("Segoe UI")'), true);
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("greeting") === null'), true);
    assert.equal(state().sidebarMode, 'auto');
    updateSidebarPointer({ x: 5, y: 120 }, 1000);
    assert.equal(state().sidebarPeeking, false, 'brief edge crossings must not open the sidebar');
    updateSidebarPointer({ x: 5, y: 120 }, 1120); await wait();
    assert.equal(state().sidebarPeeking, true);
    updateSidebarPointer({ x: 170, y: 200 }, 1400);
    assert.equal(state().sidebarPeeking, true, 'the rail must stay open while its controls are used');
    updateSidebarPointer({ x: 500, y: 200 }, 1500);
    updateSidebarPointer({ x: 500, y: 200 }, 1900); await wait();
    assert.equal(state().sidebarPeeking, false);
    await win.webContents.executeJavaScript('document.getElementById("edit-favorites").click()'); await wait();
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#favorite-list .overview-row").length'), 6);
    await win.webContents.executeJavaScript(`(() => {
      [...document.querySelectorAll('#favorite-list button')].find(button => button.textContent === 'Modifica').click();
      document.getElementById('favorite-title').value = 'Preferito modificato';
      document.getElementById('favorite-url').value = 'https://example.com/edited';
      document.getElementById('favorite-form').requestSubmit();
    })()`); await wait();
    assert.equal(state().pins[0].title, 'Preferito modificato');
    assert.equal(state().pins[0].url, 'https://example.com/edited');
    await win.webContents.executeJavaScript(`(() => {
      document.getElementById('favorite-title').value = 'Nuovo sito';
      document.getElementById('favorite-url').value = 'https://example.org/';
      document.getElementById('favorite-form').requestSubmit();
    })()`); await wait();
    assert.equal(state().pins.length, 7);
    const added = state().pins[6].url;
    await win.webContents.executeJavaScript(`window.vela.command('favorite-move', {url:${JSON.stringify(added)}, direction:-1})`);
    assert.equal(state().pins[5].url, added);
    await win.webContents.executeJavaScript(`window.vela.command('remove-pin', ${JSON.stringify(added)})`);
    assert.equal(state().pins.length, 6);
    for (const pin of [...state().pins]) await win.webContents.executeJavaScript(`window.vela.command('remove-pin', ${JSON.stringify(pin.url)})`);
    await wait();
    assert.equal(state().pins.length, 0);
    assert.equal(await win.webContents.executeJavaScript('document.querySelector("#favorites .favorite-empty").textContent'), '+ Aggiungi preferito');
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".favorite").length'), 0, 'deleted built-in favorites must not reappear');
    for (const pin of originalFavorites) await win.webContents.executeJavaScript(`window.vela.command('favorite-save', ${JSON.stringify(pin)})`);
    await wait();
    await win.webContents.executeJavaScript('document.querySelector("#favorites-panel .close-panel").click()');
    await win.webContents.executeJavaScript('window.vela.command("background-color", "#000000")'); await wait();
    assert.equal(state().settings.backgroundColor, '#000000');
    assert.equal(await win.webContents.executeJavaScript('document.body.dataset.theme'), 'dark');
    assert.match(await win.webContents.executeJavaScript('getComputedStyle(document.body).backgroundImage'), /radial-gradient/);
    win.showInactive(); await wait();
    const blackPreview = await win.webContents.capturePage(); fs.writeFileSync(output('black-preview.png'), blackPreview.toPNG());
    await win.webContents.executeJavaScript('document.getElementById("settings-button").click()'); await wait();
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#settings-panel [role=tab]").length'),5);
    const settingsAlignment = await win.webContents.executeJavaScript(`(() => {
      const panel = document.getElementById('settings-panel');
      document.getElementById('settings-tab-general').click();
      const outer = panel.getBoundingClientRect();
      const body = panel.querySelector('.settings-body');
      const row = document.querySelector('#settings-general .setting-row').getBoundingClientRect();
      return {
        centered: Math.abs((outer.left + outer.right) / 2 - innerWidth / 2) <= 1,
        fullWidth: Math.abs(body.getBoundingClientRect().width - outer.width) <= 2,
        balance: (row.left + row.right - outer.left - outer.right) / 2
      };
    })()`);
    assert.ok(settingsAlignment.centered && settingsAlignment.fullWidth && Math.abs(settingsAlignment.balance) <= 1, JSON.stringify(settingsAlignment));
    await win.webContents.executeJavaScript('document.getElementById("settings-tab-appearance").click()');
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("settings-appearance").hidden'),false);
    await win.webContents.executeJavaScript(`(() => {
      const input = document.getElementById('background-hex'); input.value = '#dec5a8'; input.dispatchEvent(new Event('change'));
    })()`); await wait();
    assert.equal(state().settings.backgroundColor, '#dec5a8');
    assert.equal(await win.webContents.executeJavaScript('document.body.dataset.theme'), 'light');
    await win.webContents.executeJavaScript('document.getElementById("background-reset").click()'); await wait();
    assert.equal(state().settings.backgroundColor, null);
    await win.webContents.executeJavaScript(`(async()=>{
      const api=window.vela;
      await api.command('remote-suggestions',false);
      if((await api.command('search-suggestions','anything')).length)throw Error('Remote suggestions were not disabled');
      await api.command('remote-suggestions',true);
      document.getElementById('settings-tab-protection').click();
      document.getElementById('settings-tracker-editor').open=true;
      document.getElementById('tracker-list-name').value='Smoke trackers';
      document.getElementById('tracker-list-content').value='||tracking.example.test^';
      document.getElementById('tracker-list-form').requestSubmit();
    })()`);await wait(250);
    assert.equal(state().customTrackers.lists[0].count,1);
    assert.equal(await win.webContents.executeJavaScript('document.querySelector("#settings-tracker-lists strong").textContent'),'Smoke trackers');
    await win.webContents.executeJavaScript('document.querySelector("#settings-panel .close-panel").click()');
    const work = await win.webContents.executeJavaScript('window.vela.command("space", "work")');
    assert.equal(work.space, 'work');
    await wait();assert.equal(state().visibleTabCount,1);assert.equal(await win.webContents.executeJavaScript('document.getElementById("open-tab-count").textContent'),'1 scheda aperta');assert.ok(state().tabs.length>state().visibleTabCount);
    const workId = work.activeId;
    const pinned = await win.webContents.executeJavaScript(`window.vela.command("pin-tab", ${workId})`);
    assert.equal(pinned.tabs.find((tab) => tab.id === workId).pinned, true);
    await win.webContents.executeJavaScript('window.vela.command("space", "personal")');
    await sidebarSurface.webContents.executeJavaScript('document.getElementById("space-personal").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}))'); await wait();
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("spaces-panel").hidden'),false);
    await win.webContents.executeJavaScript(`(() => { document.getElementById('space-name').value='Studio';document.getElementById('space-color').value='#518877';[...document.getElementById('space-emojis').children].find(b=>b.textContent==='🚀').click();document.getElementById('space-form').requestSubmit(); })()`); await wait();
    assert.equal(state().spaces.personal.name,'Studio'); assert.equal(state().spaces.personal.emoji,'🚀'); assert.equal(state().spaces.personal.color,'#518877');
    const spaceImage=nativeImage.createFromPath(path.join(__dirname,'../assets/vela.png')).resize({width:96,height:96}).toDataURL();
    await win.webContents.executeJavaScript(`window.vela.command('space-save',{id:'work',config:{name:'Progetti',emoji:'💼',color:'#947b9c',image:${JSON.stringify(spaceImage)}}})`); await wait();
    const spacesPreview=await win.webContents.capturePage();fs.writeFileSync(output('spaces-preview.png'),spacesPreview.toPNG());
    await win.webContents.executeJavaScript('document.querySelector("#spaces-panel .close-panel").click()');
    await win.webContents.executeJavaScript('window.vela.command("sidebar")');await wait();
    assert.equal(await sidebarSurface.webContents.executeJavaScript('!!document.querySelector("#space-work img")'),true);
    const alignment=await sidebarSurface.webContents.executeJavaScript(`['personal','work'].map(id=>{const button=document.getElementById('space-'+id),icon=button.firstElementChild,b=button.getBoundingClientRect(),i=icon.getBoundingClientRect();return {dx:Math.abs((b.left+b.width/2)-(i.left+i.width/2)),dy:Math.abs((b.top+b.height/2)-(i.top+i.height/2)),padding:getComputedStyle(button).padding,width:i.width};})`);
    for(const icon of alignment){assert.ok(icon.dx<1&&icon.dy<1,'space artwork must be centered');assert.equal(icon.padding,'0px');assert.ok(icon.width>=24,'custom images must fill the selector');}
    await win.webContents.executeJavaScript('window.vela.command("sidebar")');await wait();
    closeTab(workId); await wait();
    win.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const screenshot = await win.webContents.capturePage();
    fs.writeFileSync(output('preview.png'), screenshot.toPNG());
    const before = state().blocked;
    const tab = createTab(`http://127.0.0.1:${server.address().port}`);
    const wc = tab.view.webContents;
    wc.on('console-message', (event) => { if (event.message?.includes('Vela document-start')) console.error(event.message); });
    await new Promise((resolve) => wc.once('did-finish-load', resolve));
    assert.ok(pageUserAgent?.endsWith(` Chrome/${process.versions.chrome} Safari/537.36`), pageUserAgent);
    assert.equal(await wc.executeJavaScript('navigator.userAgent'), pageUserAgent);
    await wc.executeJavaScript(`(() => { const icon=document.createElement('link');icon.rel='icon';icon.href='/favicon.png';document.head.append(icon); })()`);
    for(let attempt=0;attempt<25&&!state().tabs.find(item=>item.id===tab.id).favicon;attempt++)await wait(80);
    assert.match(state().tabs.find(item=>item.id===tab.id).favicon || '', /^data:image\/png;base64,/);
    const pngIcon=state().tabs.find(item=>item.id===tab.id).favicon;
    await win.webContents.executeJavaScript(`window.vela.command('favorite-save',{title:'Icon fixture',url:${JSON.stringify(tab.url)},favicon:${JSON.stringify(state().tabs.find(item=>item.id===tab.id).favicon)}})`);await wait();
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("toolbar-favorite").getAttribute("aria-pressed")'),'true');
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#favorites .favorite img").length'),1,'start-page favorites must render the site icon');
    await win.webContents.executeJavaScript('window.vela.command("sidebar")');await wait();
    assert.equal(await sidebarSurface.webContents.executeJavaScript('document.querySelectorAll("#sidebar-pins .arc-favorite img").length'),1,'sidebar favorites must render the site icon');
    const fixtureState=state();
    const extraSpaces=Object.fromEntries(Array.from({length:2},(_,i)=>['arc-fixture-'+i,{name:'Space '+i,emoji:'🌍',color:'#7686a5'}]));
    const extraPins=Array.from({length:8},(_,i)=>({title:'Example '+i,url:'https://example'+i+'.test/'}));
    const fixtureTabs=[...fixtureState.tabs,{id:999,url:'https://example.test/',title:'Folder fixture',space:fixtureState.space,folder:['Projects','Clients'],pinned:true}];
    sidebarSurface.webContents.send('vela:state',{...fixtureState,spaces:{...fixtureState.spaces,...extraSpaces},pins:[...fixtureState.pins,...extraPins],tabs:fixtureTabs});await wait();
    const sidebarLayout=await sidebarSurface.webContents.executeJavaScript(`(()=>{
      const grid=document.querySelector('.arc-favorites'),spaces=document.querySelector('.space-switch');
      const rows=selector=>new Set([...document.querySelectorAll(selector)].map(item=>Math.round(item.getBoundingClientRect().top))).size;
      return {gridRows:rows('.arc-favorite'),gridHeight:grid.clientHeight,gridOverflow:getComputedStyle(grid).overflowY,
        spaceRows:rows('.space-switch button'),spaceFits:spaces.scrollWidth===spaces.clientWidth,
        icons:grid.querySelectorAll('.favorite-site-icon').length,folders:document.querySelectorAll('.sidebar-folder .sidebar-folder').length};
    })()`);
    assert.ok(sidebarLayout.gridRows>=5&&sidebarLayout.gridHeight>142&&sidebarLayout.gridOverflow==='visible');
    assert.ok(sidebarLayout.spaceRows===1&&sidebarLayout.spaceFits);
    assert.equal(sidebarLayout.icons,fixtureState.pins.length+extraPins.length);
    assert.equal(sidebarLayout.folders,1);
    sidebarSurface.webContents.send('vela:state',fixtureState);await wait();
    assert.equal(await sidebarSurface.webContents.executeJavaScript(`(()=>{document.querySelector('.arc-favorite').focus();return getComputedStyle(document.querySelector('.sidebar-content')).scrollbarWidth;})()`),'none');
    const removedFavorite=state().pins.at(-1);
    await sidebarSurface.webContents.executeJavaScript(`document.querySelector('.arc-favorite:last-child').dispatchEvent(new MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1}))`);await wait();
    assert.ok(!state().pins.some(pin=>pin.url===removedFavorite.url));
    await win.webContents.executeJavaScript(`window.vela.command('favorite-save',${JSON.stringify(removedFavorite)})`);await wait();
    const beforeFolder=await sidebarSurface.webContents.executeJavaScript('Number(document.getElementById("pinned-count").textContent)');
    await sidebarSurface.webContents.executeJavaScript(`(()=>{
      const heading=document.querySelector('.sidebar-section');
      heading.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientY:heading.getBoundingClientRect().top+3}));
      if(document.getElementById('sidebar-folder-menu').hidden)throw Error('Folder menu did not open');
      document.getElementById('sidebar-folder-action').click();
      document.getElementById('sidebar-folder-name').value='Social';
      document.getElementById('sidebar-folder-form').requestSubmit();
    })()`);await wait();
    await sidebarSurface.webContents.executeJavaScript(`(()=>{
      const dataTransfer=new DataTransfer();dataTransfer.setData('text/vela-tab',String(${tab.id}));
      document.querySelector('.sidebar-folder summary').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));
    })()`);await wait();
    assert.deepEqual(state().tabs.find(item=>item.id===tab.id).folder,['Social']);
    assert.equal(state().tabs.find(item=>item.id===tab.id).pinned,true);
    assert.equal(await sidebarSurface.webContents.executeJavaScript('Number(document.getElementById("pinned-count").textContent)'),beforeFolder+1);
    const pinnedRow=`[data-tab-id="${tab.id}"]`;
    assert.equal(await sidebarSurface.webContents.executeJavaScript(`document.querySelector('${pinnedRow} .tab-close').textContent`),'−');
    await sidebarSurface.webContents.executeJavaScript(`document.querySelector('${pinnedRow} .tab-close').click()`);await wait();
    assert.equal(state().tabs.find(item=>item.id===tab.id).pinned,false);
    await sidebarSurface.webContents.executeJavaScript(`window.vela.command('tab-folder',{id:${tab.id},path:['Social']})`);await wait();
    await sidebarSurface.webContents.executeJavaScript(`document.querySelector('${pinnedRow}').dispatchEvent(new MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1}))`);await wait();
    assert.equal(state().tabs.find(item=>item.id===tab.id).pinned,false);
    await sidebarSurface.webContents.executeJavaScript(`window.vela.command('tab-folder',{id:${tab.id},path:['Social']})`);await wait();
    await sidebarSurface.webContents.executeJavaScript(`(()=>{
      document.querySelector('.sidebar-folder summary').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
      document.getElementById('sidebar-folder-action').click();
    })()`);await wait();
    assert.deepEqual(state().tabs.find(item=>item.id===tab.id).folder,[]);
    assert.equal(state().tabs.find(item=>item.id===tab.id).pinned,false);
    assert.equal(state().spaces[state().space].folders.includes('Social'),false);
    await sidebarSurface.webContents.executeJavaScript(`window.vela.command('tab-folder',{id:${tab.id},path:[],pinned:false})`);
    const disposable=createTab(tab.url,{lazy:true,background:true});await wait();
    await sidebarSurface.webContents.executeJavaScript(`document.querySelector('[data-tab-id="${disposable.id}"]').dispatchEvent(new MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1}))`);await wait();
    assert.ok(!state().tabs.some(item=>item.id===disposable.id));
    const originalOrder=state().pins.map(pin=>pin.url);
    const liveOrder=await sidebarSurface.webContents.executeJavaScript(`(()=>{
      const grid=document.getElementById('sidebar-pins'),[first,second]=grid.children;
      const target=second.getBoundingClientRect(),dataTransfer=new DataTransfer();
      const dispatch=(node,type)=>node.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer,clientX:Math.round(target.left+target.width/2),clientY:Math.round(target.top+target.height/2)}));
      dispatch(first,'dragstart');dispatch(grid,'dragover');
      const preview=grid.firstElementChild===second;
      dispatch(first,'dragend');
      const restored=grid.firstElementChild===first;
      dispatch(first,'dragstart');dispatch(grid,'dragover');dispatch(grid,'drop');
      return {preview,restored};
    })()`);await wait();
    assert.deepEqual(liveOrder,{preview:true,restored:true});
    assert.equal(state().pins[0].url,originalOrder[1]);
    await sidebarSurface.webContents.executeJavaScript(`window.vela.command('favorite-move',{url:${JSON.stringify(originalOrder[0])},direction:-1})`);
    await win.webContents.executeJavaScript('window.vela.command("sidebar")');await wait();
    await win.webContents.executeJavaScript('document.getElementById("edit-favorites").click()');await wait();
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#favorite-list .row-monogram img").length'),1);
    await win.webContents.executeJavaScript(`(()=>{
      const dataTransfer=new DataTransfer();dataTransfer.setData('text/vela-favorite',${JSON.stringify(originalOrder[0])});
      document.querySelectorAll('#favorite-list .overview-row')[1].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));
    })()`);await wait();
    assert.equal(state().pins[0].url,originalOrder[1]);
    await win.webContents.executeJavaScript(`window.vela.command('favorite-move',{url:${JSON.stringify(originalOrder[0])},direction:-1})`);
    await win.webContents.executeJavaScript('document.querySelector("#favorites-panel .close-panel").click()');await wait();
    await win.webContents.executeJavaScript(`window.vela.command('remove-pin',${JSON.stringify(tab.url)})`);await wait();
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("toolbar-favorite").getAttribute("aria-pressed")'),'false');

    await wc.executeJavaScript(`document.querySelector('link[rel=icon]').href='/favicon.svg'`);
    for(let attempt=0;attempt<2&&state().tabs.find(item=>item.id===tab.id).favicon===pngIcon;attempt++)await wait(80);
    assert.ok(state().tabs.find(item=>item.id===tab.id).favicon,'unsupported SVG retains a safe native favicon or fallback');
    await wait();
    assert.equal(wc.getTitle(), 'Vela smoke fixture');
    assert.equal(await wc.executeJavaScript('window.nodeExposed'), false);
    const pageWidth = await wc.executeJavaScript('innerWidth');
    await win.webContents.executeJavaScript('window.vela.command("background-color", "#000000")'); await wait();
    const pageBounds=tab.view.getBounds();
    captureStep='page-edge scrollbar';
    const trackPixel=()=>wc.executeJavaScript(`(()=>{
      const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
      ctx.fillStyle=getComputedStyle(document.documentElement,'::-webkit-scrollbar-track').backgroundColor;
      ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data);
    })()`);
    assert.equal((await trackPixel())[3],0);
    assert.equal(updatePageScrollbar({x:pageBounds.x+pageBounds.width-2,y:pageBounds.y+40}),true);await wait(330);
    assert.deepEqual(await trackPixel(),[0,0,0,255]);
    await win.webContents.executeJavaScript('window.vela.command("background-color", "#dec5a8")'); await wait();
    assert.deepEqual(await trackPixel(),[222,197,168,255]);
    assert.equal(updatePageScrollbar({x:pageBounds.x+40,y:pageBounds.y+40}),false);
    for(let attempt=0;attempt<16&&(await trackPixel())[3]!==0;attempt++)await wait(100);
    assert.equal((await trackPixel())[3],0);
    assert.equal(await wc.executeJavaScript('getComputedStyle(document.documentElement,"::-webkit-scrollbar-button").display'), 'none');
    await win.webContents.executeJavaScript('window.vela.command("background-color", null)'); await wait();
    updateSidebarPointer({ x: 5, y: 160 }, 3000); updateSidebarPointer({ x: 5, y: 160 }, 3120); await wait();
    assert.equal(state().sidebarPeeking, true);
    assert.equal(await wc.executeJavaScript('innerWidth'), pageWidth, 'hover reveal must not reflow the website');
    assert.equal(tab.view.getBounds().x, 8, 'the page remains in place underneath the sidebar');
    assert.equal(sidebarSurface.getBounds().width, 256);
    assert.equal(await sidebarSurface.webContents.executeJavaScript('document.body.classList.contains("with-sidebar")'), true);
    assert.equal(await sidebarSurface.webContents.executeJavaScript(`!!document.querySelector('#sidebar-tabs [data-tab-id="${tab.id}"] .tab-mark img')`),true,'reopening the sidebar must render the latest favicon');
    const hoverPreview = await win.webContents.capturePage(); fs.writeFileSync(output('sidebar-preview.png'), hoverPreview.toPNG());
    updateSidebarPointer({ x: 600, y: 200 }, 3400); updateSidebarPointer({ x: 600, y: 200 }, 3800); await wait();
    assert.equal(await wc.executeJavaScript('innerWidth'), pageWidth);
    await wc.loadURL(`http://127.0.0.1:${server.address().port}/broken`).catch(() => {}); await wait();
    assert.ok(state().tabs.find((item) => item.id === tab.id).error, 'a network failure must be visible');
    const recovered = new Promise((resolve) => wc.once('did-finish-load', resolve));
    wc.navigationHistory.goBack(); await recovered; await wait();
    assert.equal(state().tabs.find((item) => item.id === tab.id).error, '');
    assert.equal(tab.view.getVisible(), true, 'successful history navigation must restore the hidden page');
    if (scriptletsAvailable) assert.equal(await wc.executeJavaScript('window.earlyAtInline'), true, 'scriptlets must run before the first inline script, even with strict CSP');
    assert.equal(await wc.executeJavaScript('getComputedStyle(document.querySelector(".vela-ad-fixture")).display'), 'none', 'cosmetic ad filters must apply');
    for (let i = 0; i < 30 && state().blocked === before; i++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(state().blocked > before, 'il motore deve bloccare doubleclick.net');
    assert.equal(await wc.executeJavaScript('Boolean(document.querySelector("script[src]").src)'), true);
    assert.equal(await wc.executeJavaScript('typeof window.vela'), 'undefined');
    assert.equal(await wc.executeJavaScript('typeof process'), 'undefined');
    const pixel = nativeImage.createFromBitmap(Buffer.from([0, 0, 255, 255]), { width: 1, height: 1 }).toDataURL();
    for (const format of ['png', 'jpeg', 'webp']) {
      const data = await convertImage(wc, pixel, format);
      assert.ok(data.startsWith(`data:image/${format};base64,`));
      const width = await wc.executeJavaScriptInIsolatedWorld(1002, [{ code: `(async()=>{const data=${JSON.stringify(data)};const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));const image=await createImageBitmap(new Blob([bytes]));const width=image.width;image.close();return width})()` }]);
      assert.equal(width, 1, `${format} conversion must produce a decodable image even under strict site CSP`);
    }
    const toolsTab = createTab(`http://127.0.0.1:${server.address().port}/native-tools`);
    await new Promise(resolve=>toolsTab.view.webContents.once('did-finish-load',resolve));
    const trackerFixture=state().customTrackers.lists[0];
    const blockedBefore=state().customTrackers.blocked;
    await toolsTab.view.webContents.executeJavaScript('fetch("https://sub.tracking.example.test/probe").catch(()=>null)');
    assert.equal(state().customTrackers.blocked,blockedBefore+1);
    await win.webContents.executeJavaScript(`window.vela.command('tracker-list-toggle',{id:${JSON.stringify(trackerFixture.id)},enabled:false})`);
    assert.equal(state().customTrackers.lists[0].enabled,false);
    await win.webContents.executeJavaScript(`window.vela.command('tracker-list-remove',{id:${JSON.stringify(trackerFixture.id)}})`);
    assert.equal(state().customTrackers.lists.length,0);
    const nativeBounds=toolsTab.view.getBounds(),nativeCount=state().tabs.length;
    await toolsTab.view.webContents.executeJavaScript('window.scrollTo(0,400)');
    await win.webContents.executeJavaScript('document.getElementById("extensions-button").click()'); await wait();
    await dockSurface.webContents.executeJavaScript('document.querySelector("[data-native=volume]").click()'); await wait();
    assert.equal(state().overlay,false);assert.equal(toolsTab.view.getVisible(),true,'opening tools must keep the website visible');
    assert.deepEqual(toolsTab.view.getBounds(),nativeBounds,'opening tools must not resize the site');
    assert.equal(await toolsTab.view.webContents.executeJavaScript('scrollY'),400);
    assert.equal(state().tabs.length,nativeCount,'opening tools must not create a browser tab');
    assert.ok(dockSurface.getBounds().x>win.getContentSize()[0]/2,'the dock must be at the upper right');
    await win.webContents.executeJavaScript('window.vela.command("native-volume", 50)');
    assert.equal(await toolsTab.view.webContents.executeJavaScript('document.getElementById("test-audio").volume'), .5);
    await win.webContents.executeJavaScript('window.vela.command("native-volume", 200)');
    assert.equal(state().tools.volume, 200); assert.equal(toolsTab.view.webContents.isAudioMuted(), true);
    assert.equal(await toolsTab.view.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: 'globalThis.__velaVolume.nodes.get(document.getElementById("test-audio")).gain.value' }]), 2);
    await win.webContents.executeJavaScript('window.vela.command("native-volume", 100)');
    captureStep='full-page screenshot';
    const fullPage = await captureFullPage(toolsTab.view.webContents);
    assert.ok(nativeImage.createFromBuffer(fullPage).getSize().height >= 2600, 'full-page capture must include content below the viewport');
    fs.writeFileSync(output('full-page-preview.png'), fullPage);
    const pdf = await captureFullPage(toolsTab.view.webContents, 'pdf'); assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    const fixtureExtension = path.join(app.getPath('userData'), 'fixture-extension');
    fs.mkdirSync(fixtureExtension, { recursive: true });
    fs.writeFileSync(path.join(fixtureExtension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Vela extension probe', version: '1.0', content_scripts: [{ matches: ['http://127.0.0.1/*'], js: ['probe.js'], run_at: 'document_end' }] }));
    fs.writeFileSync(path.join(fixtureExtension, 'probe.js'), 'document.documentElement.dataset.extensionProbe="ready";');
    const extensionSession = session.fromPartition('persist:vela-extension-test');
    const shelf = new ExtensionShelf({ BrowserWindow, getSession: () => extensionSession, paths: [fixtureExtension], notify: () => {}, save: () => {} });
    await shelf.restore(); assert.equal(shelf.snapshot().items.length, 1, 'an unpacked extension must load in a persistent session');
    const extensionView = new WebContentsView({ webPreferences: { session: extensionSession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    extensionView.webContents.setAudioMuted(true);
    await extensionView.webContents.loadURL(`http://127.0.0.1:${server.address().port}/native-tools`);
    assert.equal(await extensionView.webContents.executeJavaScript('document.documentElement.dataset.extensionProbe'), 'ready');
    await shelf.remove(shelf.snapshot().items[0].id); assert.equal(shelf.snapshot().items.length, 0); extensionView.webContents.close();
    const downloadPath=path.join(app.getPath('userData'),'Vela-test.txt');
    const downloaded=new Promise(resolve=>browserSession.once('will-download',(_event,item)=>{item.setSavePath(downloadPath);item.once('done',(_event,status)=>resolve(status));}));
    toolsTab.view.webContents.downloadURL(`http://127.0.0.1:${server.address().port}/download-probe`);
    assert.equal(await downloaded,'completed');await wait();
    const beforeDownloads=toolsTab.view.getBounds(),downloadTabs=state().tabs.length;
    await win.webContents.executeJavaScript('document.getElementById("downloads-button").click()');await wait(300);
    assert.equal(state().dockMode,'downloads');assert.equal(state().dockOpen,true);assert.equal(state().overlay,false);
    assert.equal(toolsTab.view.getVisible(),true);assert.deepEqual(toolsTab.view.getBounds(),beforeDownloads);assert.equal(state().tabs.length,downloadTabs);
    assert.ok(await dockSurface.webContents.executeJavaScript('document.getElementById("download-list").textContent.includes("Vela-test.txt")'));
    assert.ok(Number(await dockSurface.webContents.executeJavaScript('getComputedStyle(document.getElementById("downloads-panel")).opacity'))>.9);
    captureStep='downloads popup screenshot';
    const downloadPreview=await captureDock();fs.writeFileSync(output('downloads-preview.png'),downloadPreview.toPNG());
    await dockSurface.webContents.executeJavaScript('[...document.querySelectorAll("#download-list button")].find(button=>button.textContent==="VirusTotal").click()');
    for(let i=0;i<100&&!state().virusTotal.hash;i++)await wait(30);
    assert.equal(state().dockTool,'virustotal');assert.equal(state().dockMode,'extensions');assert.equal(state().overlay,false);
    assert.equal(state().virusTotal.name,'Vela-test.txt');assert.match(state().virusTotal.hash,/^[a-f0-9]{64}$/);assert.equal(state().virusTotal.keyConfigured,false);
    assert.equal(state().virusTotal.report,null,'no antivirus verdict may be invented without an API response');
    await wait(220);
    assert.ok(await dockSurface.webContents.executeJavaScript('document.getElementById("vt-file-info").textContent.includes("Vela-test.txt")'));
    captureStep='VirusTotal popup screenshot';
    const vtPreview=await captureDock();fs.writeFileSync(output('virustotal-preview.png'),vtPreview.toPNG());
    await win.webContents.executeJavaScript('document.getElementById("downloads-button").click()');await wait();
    await dockSurface.webContents.executeJavaScript('document.getElementById("downloads-clear").click()');await wait();
    assert.equal(state().downloads.length,0,'clear must remove completed entries');assert.equal(fs.existsSync(downloadPath),true,'clear must never delete the downloaded file');
    await win.webContents.executeJavaScript('document.getElementById("extensions-button").click()');await wait();
    await dockSurface.webContents.executeJavaScript('document.querySelector("[data-native=virustotal]").click()');await wait();
    assert.equal(await dockSurface.webContents.executeJavaScript('document.getElementById("vt-downloads").textContent.includes("Vela-test.txt")'),false,'VirusTotal must share the cleared download library');
    await dockSurface.webContents.executeJavaScript('document.querySelector("[data-native=panic]").click()');await wait();
    const panicUrl=`http://127.0.0.1:${server.address().port}/panic-target`;
    await dockSurface.webContents.executeJavaScript(`(()=>{document.getElementById('panic-combo').value='F8';document.getElementById('panic-url').value=${JSON.stringify(panicUrl)};document.getElementById('panic-enabled').checked=true;document.getElementById('panic-form').requestSubmit()})()`);await wait();
    assert.equal(state().panic.enabled,true);assert.equal(state().panic.shortcut,'F8');assert.equal(state().panic.url,panicUrl);
    const panicId=state().activeId,panicCount=state().tabs.length;
    const panicLoaded=new Promise(resolve=>toolsTab.view.webContents.once('did-finish-load',resolve));
    assert.equal(shortcut({type:'keyDown',key:'F8',control:false,shift:false,alt:false}),true);
    assert.equal(state().panicCover,true);assert.equal(toolsTab.view.getVisible(),false,'panic must immediately hide the previous page while loading the target');
    await panicLoaded;await wait();
    assert.equal(state().activeId,panicId);assert.equal(state().tabs.length,panicCount);assert.equal(state().tabs.find(item=>item.id===panicId).url,panicUrl);
    assert.equal(state().panicCover,false);assert.equal(toolsTab.view.getVisible(),true);assert.equal(toolsTab.view.webContents.isAudioMuted(),true);
    await win.webContents.executeJavaScript(`window.vela.command('panic-save',{enabled:false,shortcut:'F8',url:${JSON.stringify(panicUrl)}})`);
    closeTab(toolsTab.id); select(tab.id);
    await win.webContents.executeJavaScript('document.getElementById("extensions-button").click()'); await wait();
    if(!state().dockOpen)await win.webContents.executeJavaScript('document.getElementById("extensions-button").click()');
    await dockSurface.webContents.executeJavaScript('document.querySelector("[data-native=adblock]").click()');
    await wait(300);
    assert.equal(await dockSurface.webContents.executeJavaScript('document.body.classList.contains("dock-open")'),true);
    assert.ok(Number(await dockSurface.webContents.executeJavaScript('getComputedStyle(document.getElementById("extensions-panel")).opacity'))>.9,'the dock animation must reach the visible state');
    const extensionsPreview = await captureDock(); fs.writeFileSync(output('extensions-preview.png'), extensionsPreview.toPNG());
    const dockPixels=extensionsPreview.toBitmap();let paintedPixels=0;
    for(let i=0;i<dockPixels.length;i+=16)if(dockPixels[i]+dockPixels[i+1]+dockPixels[i+2]>40)paintedPixels++;
    assert.ok(paintedPixels>100,'dock controls must actually paint, not just exist in the DOM');
    assert.equal(state().dockOpen,true);assert.equal(dockSurface.getVisible(),true);
    assert.equal(await dockSurface.webContents.executeJavaScript('getComputedStyle(document.getElementById("extensions-panel")).display'),'flex');
    await dockSurface.webContents.executeJavaScript('document.querySelector("#extensions-panel .close-panel").click()');
    const privacyBefore=state().privacy.blocked,thirdPartyBefore=state().privacy.cookiesPrevented;
    const privacyTab=createTab(`http://127.0.0.1:${server.address().port}/privacy`);
    await new Promise(resolve=>privacyTab.view.webContents.once('did-finish-load',resolve)); await wait(650);
    assert.equal(await privacyTab.view.webContents.executeJavaScript('document.body.dataset.rejected'),'yes','cookie rejection must actually click the rejection action');
    assert.equal(await privacyTab.view.webContents.executeJavaScript('document.body.dataset.accepted'),undefined);
    assert.equal(await privacyTab.view.webContents.executeJavaScript('document.body.dataset.unrelated'),undefined);
    assert.equal(privacyHeaders['sec-gpc'],'1');assert.equal(privacyHeaders.dnt,'1');
    assert.equal(await privacyTab.view.webContents.executeJavaScript('navigator.globalPrivacyControl'),true);
    assert.ok(state().privacy.blocked>privacyBefore,'the dedicated privacy engine must block tracking requests');
    assert.ok(state().privacy.cookiesPrevented>thirdPartyBefore,'third-party Set-Cookie headers must be filtered');
    const privacyReload=new Promise(resolve=>privacyTab.view.webContents.once('did-finish-load',resolve));
    await win.webContents.executeJavaScript('window.vela.command("privacy-site")');await privacyReload;await wait(350);
    assert.equal(await privacyTab.view.webContents.executeJavaScript('document.body.dataset.rejected'),undefined,'site exception must disable automatic cookie actions');
    assert.equal(privacyHeaders['sec-gpc'],undefined);
    assert.equal(await privacyTab.view.webContents.executeJavaScript('navigator.globalPrivacyControl')===true,false);
    const privacyRestore=new Promise(resolve=>privacyTab.view.webContents.once('did-finish-load',resolve));
    await win.webContents.executeJavaScript('window.vela.command("privacy-site")');await privacyRestore;await wait(350);
    assert.equal(await privacyTab.view.webContents.executeJavaScript('document.body.dataset.rejected'),'yes');
    closeTab(privacyTab.id);select(tab.id);
    const offLoaded = new Promise((resolve) => wc.once('did-finish-load', resolve));
    await win.webContents.executeJavaScript('window.vela.command("adblock-enabled", false)'); await offLoaded; await wait();
    assert.equal(state().siteProtection, false);
    assert.notEqual(await wc.executeJavaScript('getComputedStyle(document.querySelector(".vela-ad-fixture")).display'), 'none', 'disabling native adblock must restore cosmetic elements');
    const onLoaded = new Promise((resolve) => wc.once('did-finish-load', resolve));
    await win.webContents.executeJavaScript('window.vela.command("adblock-enabled", true)'); await onLoaded; await wait();
    assert.equal(state().siteProtection, true);
    assert.equal(await wc.executeJavaScript('getComputedStyle(document.querySelector(".vela-ad-fixture")).display'), 'none');
    const tabCount = state().tabs.length;
    await wc.executeJavaScript('window.open("file:///C:/Windows/win.ini"); void 0');
    await wait();
    assert.equal(state().tabs.length, tabCount, 'privileged popups must be rejected');
    const blockedBeforeSpoof = wc.getURL();
    await wc.executeJavaScript('location.href="https://trusted.example@evil.test"; void 0');
    await wait();
    assert.equal(wc.getURL(), blockedBeforeSpoof, 'credential-spoofing navigation must be rejected');
    const loadedBefore = state().liveTabs;
    const requestsBefore = pageLoads;
    const dormant = Array.from({ length: 20 }, (_, index) => createTab(`http://127.0.0.1:${server.address().port}/tab-${index}`, { lazy: true, background: true, title: `Scheda ${index + 1}` }));
    assert.equal(state().liveTabs, loadedBefore, 'restoring background tabs must not allocate page views');
    assert.equal(pageLoads, requestsBefore, 'dormant tabs must not generate network requests');
    const overflowTab = createTab(); await wait();
    await win.webContents.executeJavaScript('window.vela.command("sidebar-mode", "pinned")'); await wait();
    assert.equal(await sidebarSurface.webContents.executeJavaScript('document.querySelector("#sidebar .tab.active").getBoundingClientRect().bottom <= document.getElementById("sidebar").getBoundingClientRect().bottom'), true, 'the selected sidebar tab must stay visible when the list overflows');
    closeTab(overflowTab.id); select(tab.id);
    win.show();win.focus();await wait(350);
    assert.equal(sidebarSurface.getVisible(),true);
    const sidebarTransform=()=>sidebarSurface.webContents.executeJavaScript('getComputedStyle(document.getElementById("sidebar")).transform');
    for(let attempt=0;attempt<10&&(await sidebarTransform())!=='matrix(1, 0, 0, 1, 0, 0)';attempt++)await wait(100);
    assert.equal(await sidebarTransform(),'matrix(1, 0, 0, 1, 0, 0)',JSON.stringify({
      sidebar:state().sidebar,overlay:state().overlay,
      ui:await sidebarSurface.webContents.executeJavaScript(`({className:document.body.className,hidden:document.getElementById('sidebar').hidden,visibility:document.visibilityState,animations:document.getAnimations().map(animation=>animation.currentTime)})`)
    }));
    captureStep='pinned sidebar screenshot';
    let sidebarDetail;
    for(let attempt=0;attempt<4;attempt++){
      try{sidebarDetail=await sidebarSurface.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});break;}
      catch(error){if(!/UnknownVizError|display surface/i.test(error.message)||attempt===3)throw error;await wait(250);}
    }
    fs.writeFileSync(output('sidebar-detail-preview.png'),sidebarDetail.toPNG());
    const liveBefore = state().liveTabs;
    select(dormant[0].id);
    await new Promise((resolve) => dormant[0].view.webContents.once('did-finish-load', resolve));
    assert.equal(state().liveTabs, liveBefore + 1);
    await dormant[0].view.webContents.loadURL(`http://127.0.0.1:${server.address().port}/history-second`);
    assert.equal(dormant[0].view.webContents.navigationHistory.canGoBack(), true);
    select(tab.id);
    assert.equal(suspendTab(dormant[0]), true);
    assert.equal(state().liveTabs, liveBefore);
    assert.equal(dormant[0].view, null);
    select(dormant[0].id);
    await new Promise((resolve) => dormant[0].view.webContents.once('did-finish-load', resolve));
    assert.equal(dormant[0].view.webContents.getTitle(), 'Vela smoke fixture');
    assert.equal(dormant[0].view.webContents.navigationHistory.canGoBack(), true, 'suspension must preserve the navigation stack');
    await win.webContents.executeJavaScript('window.vela.command("zoom", 1)');
    assert.equal(state().zoom, 110);
    await win.webContents.executeJavaScript('window.vela.command("zoom", 0)');
    assert.equal(state().zoom, 100);
    await wait();
    await win.webContents.executeJavaScript('window.__firstTab = document.querySelector(".tab"); void 0');
    const sendsBefore = diagnostics.publishCount;
    for (let i = 0; i < 100; i++) blocker.match(Request.fromRawDetails({ url: `https://doubleclick.net/test-${i}.js`, type: 'script', sourceUrl: 'https://example.com' }));
    await wait();
    assert.ok(diagnostics.publishCount - sendsBefore <= 2, 'ad bursts must be batched into at most two UI updates');
    const updatesForBurst = diagnostics.publishCount - sendsBefore;
    assert.equal(await win.webContents.executeJavaScript('window.__firstTab === document.querySelector(".tab")'), true, 'ad counts must not rebuild tabs');
    select(tab.id);await wait(250);
    await win.webContents.executeJavaScript('document.getElementById("overview").click()');
    for(let attempt=0;attempt<30&&await win.webContents.executeJavaScript('document.getElementById("tabs-panel").hidden');attempt++)await wait(80);
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#overview-list .overview-card").length'), 22);
    assert.equal(await win.webContents.executeJavaScript('getComputedStyle(document.getElementById("overview-list")).display'),'grid');
    assert.equal(await win.webContents.executeJavaScript('!!document.querySelector(".overview-card.active .overview-card-preview>img")'),true);
    const overviewImage = await win.webContents.capturePage(); fs.writeFileSync(output('tabs-preview.png'), overviewImage.toPNG());
    await win.webContents.executeJavaScript('document.getElementById("tab-search").value="/tab-19"; document.getElementById("tab-search").dispatchEvent(new Event("input"));');
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#overview-list .overview-card").length'), 1);
    await win.webContents.executeJavaScript('document.querySelector(".overview-card-preview").dispatchEvent(new MouseEvent("auxclick",{button:1,bubbles:true,cancelable:true}))');
    await wait();
    assert.ok(!state().tabs.some(item => item.id === dormant[19].id), 'middle-click closes the tab represented by the preview');
    assert.equal(state().activeId, tab.id);
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("tabs-panel").hidden'), false);
    await win.webContents.executeJavaScript('document.querySelector("#tabs-panel .close-panel").click()');
    await win.webContents.executeJavaScript('window.vela.command("theme", "dark")');
    await wait();
    assert.equal(await win.webContents.executeJavaScript('document.body.dataset.theme'), 'dark');
    await win.webContents.executeJavaScript('document.getElementById("settings-button").click()');
    await wait();
    const darkImage = await win.webContents.capturePage(); fs.writeFileSync(output('dark-preview.png'), darkImage.toPNG());
    await win.webContents.executeJavaScript('document.querySelector("#settings-panel .close-panel").click()');
    await win.webContents.executeJavaScript('window.vela.command("theme", "light")');
    for (const item of dormant) closeTab(item.id);
    closeTab(tab.id);
    assert.equal(state().tabs.length, 1);
    reopen(); assert.equal(state().tabs.length, 2); closeTab(state().activeId);
    assert.ok(browserSession);
    if (state().privateMode) { assert.equal(state().history.length, 0); assert.equal(browserSession.isPersistent(), false); }
    const metrics = { elapsedMs: Math.round(performance.now() - started), dockKeepsSiteVisible: true, downloadsPopup: true, virusTotalLocalHash: true, panicShortcut: true, privacyProtection: { cookieReject: true, neverAccepts: true, siteException: true, gpc: true, trackerBlocking: true, thirdPartyCookieBlocking: true }, nativeTools: { count: 8, volumeGain200Verified: true, testsMuted: true, imageFormats: ['png', 'jpeg', 'webp'], fullPagePng: true, fullPagePdf: true, globalAdblockToggle: true, unpackedExtensionLoadAndRemove: true }, searchChoiceOnFirstLaunch: true, networkErrorRecovery: true, nativeSidebarOverlay: true, documentStartVerified: scriptletsAvailable, strictCsp: true, cosmeticBlocking: true, centeredWidths: [800, 1360, 2560], hoverSidebar: true, websiteReflowOnPeek: false, favoriteEditor: true, editableBuiltInFavorites: true, customBackgrounds: true, font: 'Segoe UI Variable Text / Segoe UI', sidebarWorkspaces: true, dormantTabsTested: 20, extraPageViewsForDormantTabs: 0, extraRequestsForDormantTabs: 0, adEvents: 100, coalescedUiUpdates: updatesForBurst, privateMode: state().privateMode, chromium: process.versions.chrome, electron: process.versions.electron };
    if(process.argv.includes('--favicon-online')) {
      for(const url of ['https://www.google.com/','https://www.youtube.com/']) {
        const online=createTab(url);await Promise.race([new Promise(resolve=>online.view.webContents.once('did-finish-load',resolve)),wait(18000)]);
        for(let attempt=0;attempt<100&&!state().tabs.find(item=>item.id===online.id)?.favicon;attempt++)await wait(100);
        assert.match(state().tabs.find(item=>item.id===online.id)?.favicon||'',/^data:image\/png;base64,/,`real favicon: ${url}`);
        console.log('FAVICON PASS:',url);closeTab(online.id);
      }
    }
    metrics.sidebarCustomization={favicon:true,nativeFaviconOnly:true,centeredArtwork:true,rename:true,emoji:true,color:true,customImage:true,contextMenu:true,safariOverview:true};
    metrics.toolbarHome=true;metrics.symmetricToolbar=true;metrics.downloadClearKeepsFile=true;metrics.virusTotalDownloadsSynced=true;metrics.nativeDockDragReorder=true;
    metrics.launcherRecentLimit=2;metrics.liveSuggestions=true;metrics.tabCountMatchesActiveSpace=true;

    await win.webContents.executeJavaScript('document.getElementById("settings-button").click()');await wait();
    const namesBefore=Object.fromEntries(Object.entries(state().spaces).map(([id,value])=>[id,value.name]));
    await win.webContents.executeJavaScript('(()=>{const select=document.getElementById("language-select");select.value="en";select.dispatchEvent(new Event("change"));})()');await wait();
    assert.equal(state().settings.language,'en');
    assert.equal(await win.webContents.executeJavaScript('document.documentElement.lang'),'en');
    assert.equal(await win.webContents.executeJavaScript('document.querySelector("#settings-panel h2").textContent'),'Settings');
    assert.equal(await win.webContents.executeJavaScript('document.querySelector(".start-heading h1").textContent'),'Favorites');
    assert.match(await win.webContents.executeJavaScript('document.getElementById("home-query").placeholder'),/^Search with/);
    assert.equal(await sidebarSurface.webContents.executeJavaScript('document.documentElement.lang'),'en');
    assert.equal(await sidebarSurface.webContents.executeJavaScript('document.getElementById("sidebar-fixed").getAttribute("data-empty-label")'),'Drag a tab here');
    assert.equal(await dockSurface.webContents.executeJavaScript('document.documentElement.lang'),'en');
    assert.equal(await dockSurface.webContents.executeJavaScript('document.querySelector(".external-heading h3").textContent'),'Added extensions');
    assert.equal(await dockSurface.webContents.executeJavaScript('document.querySelector("[data-native-view=video]>strong").textContent'),'Media Downloader');
    assert.equal(await dockSurface.webContents.executeJavaScript('document.querySelector("[data-native-view=privacy]>strong").textContent'),'Privacy');
    assert.equal(await dockSurface.webContents.executeJavaScript('document.querySelector("[data-native=video]").title'),'Media Downloader · Drag to reorder');
    await dockSurface.webContents.executeJavaScript('document.getElementById("extension-store-input").value="not-a-store-id";document.getElementById("extension-store-form").onsubmit({preventDefault(){}})');
    assert.equal(await dockSurface.webContents.executeJavaScript('document.getElementById("extension-note").textContent'),'Installation is available in regular windows.');

    for(const [id,name] of Object.entries(namesBefore))if(!['Personale','Personal','Lavoro','Work'].includes(name))assert.equal(state().spaces[id].name,name,'custom space names must not be translated');
    for(const wc of [win.webContents,sidebarSurface.webContents,dockSurface.webContents]){
      const untranslated=await wc.executeJavaScript('(()=>{const {dictionaries}=window.VelaI18n;return [...document.querySelectorAll("[data-i18n]")].flatMap(element=>[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent.trim())).filter(text=>Object.hasOwn(dictionaries.it,text)&&dictionaries.en[text]!==text&&!Object.values(dictionaries.en).includes(text));})()');
      assert.deepEqual(untranslated,[],'all application-owned HTML text must switch to English');
    }

    const englishPrivateToken=require('node:crypto').randomBytes(16).toString('hex'),englishPrivateFile=path.join(app.getPath('temp'),`Vela-private-probe-${englishPrivateToken}.json`);
    openPrivate(englishPrivateToken);
    for(let attempt=0;attempt<(portable?1200:250)&&!fs.existsSync(englishPrivateFile);attempt++)await wait(60);
    assert.ok(fs.existsSync(englishPrivateFile),'English private window must start');
    const englishPrivate=JSON.parse(fs.readFileSync(englishPrivateFile,'utf8'));fs.unlinkSync(englishPrivateFile);assert.equal(englishPrivate.language,'en');assert.equal(englishPrivate.favoriteIconRequests,0,'private startup must not request favorite icons');
    for(let attempt=0;attempt<120&&fs.existsSync(englishPrivate.userData);attempt++){await wait(50);await require('./private-cleanup.cjs').cleanupOrphans(require('node:os').tmpdir());}
    assert.equal(fs.existsSync(englishPrivate.userData),false);

    const duplicateFavorite=state().pins[0];
    await win.webContents.executeJavaScript('document.getElementById("edit-favorites").click()');await wait();
    await win.webContents.executeJavaScript(`document.getElementById('favorite-original').value='';document.getElementById('favorite-title').value='Duplicate test';document.getElementById('favorite-url').value=${JSON.stringify(duplicateFavorite.url)};document.getElementById('favorite-form').requestSubmit();`);await wait();
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("favorite-error").textContent'),'This address is already in your favorites.');
    await win.webContents.executeJavaScript('document.getElementById("settings-button").click()');await wait();
    fs.writeFileSync(output('english-settings-preview.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript('window.vela.command("new")');await wait();
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("launcher-query").placeholder'),'Search or Enter URL…');
    fs.writeFileSync(output('english-launcher-preview.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript('document.getElementById("language-select").value="it";document.getElementById("language-select").dispatchEvent(new Event("change"))');await wait();
    assert.equal(state().settings.language,'it');assert.equal(await win.webContents.executeJavaScript('document.documentElement.lang'),'it');
    assert.equal(await win.webContents.executeJavaScript('document.querySelector("#settings-panel h2").textContent'),'Impostazioni');
    await win.webContents.executeJavaScript('document.getElementById("launcher-query").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');await wait();
    metrics.languages={italian:true,english:true,liveSwitch:true,allSurfaces:true,customNamesPreserved:true};
    const storeId = 'abcdefghijklmnopabcdefghijklmnop';
    await dockSurface.webContents.executeJavaScript('document.getElementById("extension-store-input").value=""');
    const unrelatedStoreTab = createTab(`https://example.test/detail/store-item/${storeId}`, { lazy:true });
    await wait();
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("store-listing-button").hidden'), true);
    const storeTab = createTab(`https://chromewebstore.google.com/detail/store-item/${storeId}`, { lazy:true });
    await wait();
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("store-listing-button").hidden'), false);
    await win.webContents.executeJavaScript('document.getElementById("store-listing-button").click()');
    await wait();
    assert.equal(state().dockMode, 'extensions');
    assert.equal(await dockSurface.webContents.executeJavaScript('document.getElementById("extension-store-input").value'), storeId);
    closeTab(unrelatedStoreTab.id);
    closeTab(storeTab.id);
    await win.webContents.executeJavaScript('window.vela.command("dock-toggle")');
    const privateReports=[];
    for(let index=0;index<(portable?1:2);index++){
      const token=require('node:crypto').randomBytes(16).toString('hex'),file=path.join(app.getPath('temp'),`Vela-private-probe-${token}.json`);
      openPrivate(token);
      for(let attempt=0;attempt<(portable?1200:250)&&!fs.existsSync(file);attempt++)await wait(60);
      assert.ok(fs.existsSync(file),'private child must reach a usable browser session');
      const report=JSON.parse(fs.readFileSync(file,'utf8'));fs.unlinkSync(file);assert.equal(report.privateMode,true);assert.equal(report.visible,true);assert.equal(report.persistent,false);assert.equal(report.cookiesBefore,0);assert.equal(report.cookiesAfter,1);assert.equal(report.history,0);assert.equal(report.profileWritten,false);assert.equal(report.searchEngine,state().settings.searchEngine);assert.equal(report.language,state().settings.language);assert.equal(report.favoriteIconRequests,0,'private startup must not request favorite icons');
      for(let attempt=0;attempt<(portable?1440:120)&&fs.existsSync(report.userData);attempt++){await wait(50);await require('./private-cleanup.cjs').cleanupOrphans(require('node:os').tmpdir());}
      assert.equal(fs.existsSync(report.userData),false,'private temporary profile must be removed on exit');privateReports.push(report.userData);
    }
    if(privateReports.length===2)assert.notEqual(...privateReports);assert.equal((await browserSession.cookies.get({url:'https://vela-private-probe.invalid'})).length,0);
    metrics.privateWindow={launch:true,inMemoryCookies:true,instancesTested:privateReports.length,separateSessions:privateReports.length===2,noProfileSaved:true,temporaryProfileRemoved:true};
    metrics.chromiumNetworkRecovery=true;metrics.multipartTransport=true;
    fs.writeFileSync(output('verification.json'), JSON.stringify(metrics, null, 2));
    console.log('SMOKE PASS: dock visibile senza overlay, Privacy e cookie verificati, 8 strumenti nativi, popup download, selezione VirusTotal e Panic Button, volume 200% silenziato, conversione PNG/JPEG/WebP, pagina intera e PDF, toggle adblock, estensione estratta, sidebar, ricerca e isolamento IPC/Node.');
    clearTimeout(timeout); server.close(); app.exit(0);
  } catch (error) {
    fs.writeFileSync(output('smoke-error.json'),JSON.stringify({stage:captureStep,error:String(error.stack||error)},null,2));
    console.error('SMOKE FAIL:',captureStep,error); clearTimeout(timeout); server.close(); app.exit(1);
  }
};
