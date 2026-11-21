const {t,localeTag,normalizeLanguage}=window.VelaI18n;
let language='it',languageApplied;
const tr=(key,vars)=>t(language,key,vars);
const $ = (id) => document.getElementById(id);
const api = window.vela;
const sidebarSurface = new URLSearchParams(location.search).get('surface') === 'sidebar';
const dockSurface = new URLSearchParams(location.search).get('surface') === 'dock';
document.body.classList.toggle('sidebar-surface', sidebarSurface);
document.body.classList.toggle('dock-surface', dockSurface);
let current, addressFocused = false, panel = null, toastTimer, tabsKey, downloadsKey, historyKey, returnFocus, favoriteManagerKey, colorPreview;
let launcherItems = [], launcherIndex = 0;
let nativeSelection = null, extensionKey, volumeTimer;
let virusDownloadsKey,panicFormKey;
let spaceDraft, spaceDraftId;
let tabPreviews = {};
let remoteSuggestions=[],suggestTimer,suggestGeneration=0;
let dockDrag=null;
function dockRank(id,kind){const index=current?.dockOrder?.[kind]?.indexOf(id)??-1;return index<0?1000:index;}
function arrangeDock(parent,kind){if(dockDrag)return;const nodes=[...parent.querySelectorAll(':scope>[data-dock-id]')].sort((a,b)=>dockRank(a.dataset.dockId,kind)-dockRank(b.dataset.dockId,kind));if(nodes.some((node,index)=>parent.children[index]!==node))parent.append(...nodes);}
function draggableTool(node,kind,id){
  node.draggable=true;node.dataset.dockId=id;node.title=(node.title||node.getAttribute('aria-label')||tr("Estensione"))+tr(" · Trascina per riordinare");
  node.addEventListener('dragstart',event=>{dockDrag={node,kind};event.dataTransfer.setData('text/vela-dock',id);event.dataTransfer.effectAllowed='move';node.classList.add('dock-dragging');});
  node.addEventListener('dragend',()=>{const dropped=dockDrag?.dropped;node.classList.remove('dock-dragging');dockDrag=null;if(!dropped){extensionKey=null;if(current)renderNativeTools(current,current.tabs.find(tab=>tab.id===current.activeId));}});
  node.addEventListener('keydown',event=>{if(!event.shiftKey||event.altKey||event.ctrlKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const parent=node.parentElement,nodes=[...parent.querySelectorAll(':scope>[data-dock-id]')],index=nodes.indexOf(node),other=nodes[index+(event.key==='ArrowLeft'?-1:1)];if(!other)return;parent.insertBefore(node,event.key==='ArrowLeft'?other:other.nextSibling);command('dock-order',{kind,ids:[...parent.children].map(item=>item.dataset.dockId)});});
}
for(const [selector,kind] of [['.native-shelf','native'],['#external-shelf','external']]){
  const parent=document.querySelector(selector);
  parent.addEventListener('dragover',event=>{
    if(!dockDrag||dockDrag.kind!==kind)return;event.preventDefault();event.dataTransfer.dropEffect='move';
    const target=event.target.closest('[data-dock-id]');if(!target||target===dockDrag.node||target.parentElement!==parent)return;
    const before=new Map([...parent.children].map(node=>[node,node.getBoundingClientRect()]));const box=target.getBoundingClientRect();
    parent.insertBefore(dockDrag.node,event.clientX<box.left+box.width/2?target:target.nextSibling);
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches)for(const [node,rect] of before){const next=node.getBoundingClientRect(),dx=rect.left-next.left;if(dx&&node!==dockDrag.node)node.animate([{transform:`translateX(${dx}px)`},{transform:'translateX(0)'}],{duration:160,easing:'ease-out'});}
  });
  parent.addEventListener('drop',event=>{if(!dockDrag||dockDrag.kind!==kind)return;event.preventDefault();const drag=dockDrag;drag.dropped=true;command('dock-order',{kind,ids:[...parent.children].map(node=>node.dataset.dockId)}).finally(()=>{if(dockDrag===drag)dockDrag=null;extensionKey=null;if(current)renderNativeTools(current,current.tabs.find(tab=>tab.id===current.activeId));});});
}
for(const button of document.querySelectorAll('[data-native]'))draggableTool(button,'native',button.dataset.native);
const statuses = {
  loading: tr("Preparazione della protezione…"),
  basic: tr("Protezione essenziale offline. Le liste complete non sono ancora disponibili."),
  cached: tr("Protezione attiva con le ultime liste salvate sul dispositivo."),
  ready: tr("Protezione attiva · liste pubblicitarie e antitracciamento aggiornate.")
};
const command = (name, value) => api.command(name, value).then(render).catch(() => toast(tr("Operazione non riuscita.")));
function toast(message) {
  $('toast').textContent = tr(message); $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}
function shortAddress(url) {
  if (!url || url === 'vela://start') return '';
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}
async function setPanel(name) {
  if(dockSurface){if(!name)command('dock-close');return;}
  if(name==='extensions'){command('dock-toggle');return;}
  if(name==='downloads'){command('downloads-toggle');return;}
  if (sidebarSurface) { if (name) command('show-panel', name); return; }
  if (current && !current.settings.searchEngine) name = 'search';
  if(panel==='launcher'&&name!=='launcher'){clearTimeout(suggestTimer);suggestGeneration++;remoteSuggestions=[];api.command('suggest-cancel').catch(()=>{});}
  if (name === 'tabs' && panel !== 'tabs') tabPreviews = await api.command('tab-previews');
  if (name && !panel) returnFocus = document.activeElement;
  panel = name;
  document.body.classList.toggle('tab-overview', name === 'tabs');
  $('overlay').hidden = !name;
  for (const candidate of ['privacy', 'tabs', 'downloads', 'history', 'settings', 'favorites', 'search', 'launcher', 'extensions', 'spaces']) $(`${candidate}-panel`).hidden = name !== candidate;
  if (name === 'spaces') { spaceDraftId = null; renderSpaceEditor(); }
  command('overlay', Boolean(name));
  if (name) {
    document.querySelector(`#${name}-panel input:not([type=checkbox]), #${name}-panel .close-panel`)?.focus();
    renderLibrary();
    if (name === 'launcher') renderLauncher();
  } else returnFocus?.focus();
}
function openAddress() {
  if (sidebarSurface) { command('show-panel', 'address'); return; }
  $('address').focus(); $('address').select();
}
function nativeToolTitle(button){const label=button.querySelector('span');return tr(button.dataset.native==='video'?'Media Downloader':label.getAttribute('data-i18n')||label.textContent)+tr(' · Trascina per riordinare');}
function renderNativeTools(state, tab) {
  const tools = state.tools; if (!tools) return;
  arrangeDock(document.querySelector('.native-shelf'),'native');
  const web = /^https?:/.test(tab.url);
  nativeSelection=state.dockTool;
  $('extensions-button').setAttribute('aria-expanded',String(state.dockOpen && state.dockMode==='extensions'));
  $('downloads-button').setAttribute('aria-expanded',String(state.dockOpen && state.dockMode==='downloads'));
  if(!dockSurface)return;
  document.body.classList.toggle('downloads-surface',state.dockMode==='downloads');
  document.body.classList.toggle('dock-open',state.dockOpen && !state.overlay);
  if(dockSurface){$('extensions-panel').hidden=false;$('downloads-panel').hidden=state.dockMode!=='downloads';}
  $('native-popover').hidden=!nativeSelection;
  for (const button of document.querySelectorAll('[data-native]')) {button.setAttribute('aria-selected', String(button.dataset.native === nativeSelection));button.title=nativeToolTitle(button);}
  for (const detail of document.querySelectorAll('[data-native-view]')) detail.hidden = detail.dataset.nativeView !== nativeSelection;
  $('native-adblock').checked = state.settings.adblockEnabled;
  $('native-privacy').checked=state.settings.privacyEnabled;
  $('native-site-privacy').checked=state.privacy?.enabled || false;
  $('native-site-privacy').disabled=!web || !state.settings.privacyEnabled;
  $('native-privacy-stats').textContent=[[state.privacy?.blocked||0,'richiesta tracker bloccata','richieste tracker bloccate'],[state.privacy?.rejected||0,'banner rifiutato','banner rifiutati'],[state.privacy?.cookiesPrevented||0,'tentativo di cookie terzi filtrato','tentativi di cookie terzi filtrati']].map(([count,one,many])=>count.toLocaleString(localeTag(language))+' '+tr(count===1?one:many)).join(' · ');
  $('native-site-adblock').checked = state.siteProtection;
  $('native-site-adblock').disabled = !web || !state.settings.adblockEnabled;
  $('native-adblock-note').textContent = state.settings.adblockEnabled ? (state.blocked===1?tr('1 richiesta bloccata in questa sessione.'):tr("{v0} richieste bloccate in questa sessione.",{v0:state.blocked.toLocaleString(localeTag(language))})) : tr("Disattivato. Riattivalo qui quando vuoi.");
  if (document.activeElement !== $('native-volume')) $('native-volume').value = tools.volume;
  $('native-volume').disabled = !web;
  $('native-volume-value').textContent = `${tools.volume}%`;
  $('native-volume-note').textContent = tools.volumeUnavailable ? tr("Il boost non è disponibile per alcuni media esterni senza autorizzazione CORS. Gli altri continuano a funzionare.") : tr("Da 0% a 600%. Il livello si applica a questa scheda.");
  $('native-video-info').textContent = tools.video ? tr("{v0} · fino a {v1}p",{v0:tools.video.title,v1:tools.video.height}) : tools.canDownloadVideo ? tr("URL pubblico aperto. Leggi i formati disponibili.") : tr("Apri un URL HTTPS pubblico supportato da yt-dlp.");
  $('native-inspect').disabled = tools.busy || !tools.canDownloadVideo;
  $('native-video-save').disabled = tools.busy || !tools.canDownloadVideo;
  $('native-update').disabled = tools.busy;
  $('native-image-save').disabled = tools.busy || !tools.selectedImage;
  $('native-capture-save').disabled = tools.busy || !web;
  $('native-job').hidden = !tools.message && !tools.busy;
  $('native-message').textContent = tools.message || tr("Preparazione…");
  $('native-progress').value = tools.progress;
  $('native-progress').hidden = !tools.busy;
  $('native-cancel').hidden = !tools.busy || !['video'].includes(nativeSelection);
  $('native-error').hidden = !tools.error; $('native-error').textContent = tools.error;
  $('native-show-file').hidden = !tools.lastFile;
  renderVirusTotal(state);
  const panicKey=JSON.stringify(state.panic);
  if(panicKey!==panicFormKey){panicFormKey=panicKey;$('panic-combo').value=state.panic?.shortcut||'';$('panic-url').value=state.panic?.url||'';$('panic-enabled').checked=Boolean(state.panic?.enabled);}
  $('panic-record').textContent=state.panicRecording?tr("Annulla"):tr("Registra");
  $('panic-combo').classList.toggle('recording',state.panicRecording);
  $('panic-go').disabled=!state.panic?.enabled;
  $('extension-add').disabled = !state.extensions?.available;
  $('extension-store-install').disabled=!state.extensions?.available||state.extensions?.installing;
  $('extension-store-input').disabled=!state.extensions?.available||state.extensions?.installing;
  $('extension-note').textContent = state.extensions?.error || (state.extensions?.available ? tr("Compatibilità limitata alle API estensioni supportate da Electron.") : tr("Le estensioni aggiunte sono disponibili nelle finestre normali."));
  const key = JSON.stringify([state.extensions?.items || [],state.dockOrder?.external]);
  if (key !== extensionKey && dockDrag?.kind!=='external') {
    extensionKey = key;
    const items = [...(state.extensions?.items || [])].sort((a,b)=>dockRank(a.id,'external')-dockRank(b.id,'external'));
    $('external-shelf').replaceChildren(...items.map((item) => {
      const tile = document.createElement('div'); tile.className = 'external-extension';
      const open = document.createElement('button'); open.className = 'external-open'; open.title = `${item.name} ${item.version}`; open.textContent = item.name; open.onclick = () => command('extension-open', item.id);
      const remove = document.createElement('button'); remove.className = 'external-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', tr("Rimuovi {v0}",{v0:item.name})); remove.onclick = () => command('extension-remove', item.id);
      tile.append(open, remove);draggableTool(tile,'external',item.id);return tile;
    }));
    if (!items.length) { const empty = document.createElement('span'); empty.className = 'extension-empty'; empty.textContent = tr("Nessuna estensione aggiunta"); $('external-shelf').append(empty); }
  }
}
function renderVirusTotal(state){
  const vt=state.virusTotal;if(!vt)return;
  $('vt-key-status').textContent=vt.keyConfigured?(vt.keyStored?tr("Chiave API configurata e cifrata"):tr("Chiave API attiva per questa sessione")):tr("Configura chiave API personale");
  $('vt-key-forget').disabled=!vt.keyConfigured||vt.busy;
  $('vt-key').disabled=vt.busy;
  $('vt-file-info').textContent=vt.name?`${vt.name} · ${(vt.size/1024/1024).toLocaleString(localeTag(language),{minimumFractionDigits:2,maximumFractionDigits:2})} MB${vt.hash?' · SHA-256 '+vt.hash.slice(0,12)+'…':''}`:'';
  $('vt-file-info').title=vt.hash||'';
  $('vt-message').textContent=vt.message;
  $('vt-error').hidden=!vt.error;$('vt-error').textContent=vt.error;
  $('vt-check').disabled=vt.busy||!vt.hash||!vt.keyConfigured;
  $('vt-upload').hidden=!['unknown','selected'].includes(vt.status);$('vt-upload').disabled=vt.busy||!vt.keyConfigured||!vt.hash;
  $('vt-report').disabled=!vt.hash;
  $('vt-cancel').hidden=!vt.busy;
  $('vt-result').hidden=!vt.report;
  if(vt.report){
    const detected=vt.report.stats.malicious+vt.report.stats.suspicious;
    $('vt-verdict').textContent=tr('{v0} {v1} su {v2} {v3}',{v0:detected.toLocaleString(localeTag(language)),v1:tr(detected===1?'rilevazione':'rilevazioni'),v2:vt.report.total.toLocaleString(localeTag(language)),v3:tr(vt.report.total===1?'risultato':'risultati')});
    $('vt-verdict').classList.toggle('detected',detected>0);
    $('vt-date').textContent=vt.report.date?new Date(vt.report.date*1000).toLocaleString(localeTag(language)):'';
    $('vt-engines').replaceChildren(...vt.report.engines.map(item=>{const row=document.createElement('div');row.textContent=`${item.name}: ${item.result}`;return row;}));
  }
  const completed=state.downloads.filter(item=>item.status==='completed');
  const key=JSON.stringify(completed.map(({id,name})=>({id,name})));
  if(key!==virusDownloadsKey){virusDownloadsKey=key;
    $('vt-downloads').replaceChildren(...completed.slice(0,12).map(item=>{const button=document.createElement('button');button.textContent='↓ '+item.name;button.title=tr("Analizza questo download con VirusTotal");button.onclick=()=>command('vt-download',item.id);return button;}));
    if(!completed.length){const hint=document.createElement('span');hint.textContent=tr("I download completati compariranno qui.");$('vt-downloads').append(hint);}
  }
}
async function acceptVirusFile(file){try{render(await api.virusFile(file));}catch{toast(tr("Scegli un file locale copiato da Esplora file."));}}
for(const target of [$('vt-dropzone'),document.querySelector('[data-native=virustotal]')]){
  target.ondragover=event=>{if([...event.dataTransfer.types].includes('Files')){event.preventDefault();target.classList.add('file-over');}};
  target.ondragleave=()=>target.classList.remove('file-over');
  target.ondrop=event=>{event.preventDefault();target.classList.remove('file-over');const file=event.dataTransfer.files[0];if(file)acceptVirusFile(file);};
}
$('vt-dropzone').onpaste=event=>{event.preventDefault();const file=event.clipboardData.files[0];if(file)acceptVirusFile(file);else command('vt-paste');};
document.addEventListener('paste',event=>{if(dockSurface&&current?.dockMode==='extensions'&&current?.dockTool==='virustotal'&&!event.defaultPrevented&&!event.target.closest('input,textarea,select')){event.preventDefault();const file=event.clipboardData.files[0];if(file)acceptVirusFile(file);else command('vt-paste');}});
document.addEventListener('keydown',event=>{if(dockSurface&&current?.dockTool==='virustotal'&&event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='v'&&!event.target.closest('input,textarea,select')){event.preventDefault();command('vt-paste');}});
$('extensions-button').ondragenter=event=>{if([...event.dataTransfer.types].includes('Files')&&(!current?.dockOpen||current.dockMode!=='extensions'))command('dock-toggle');};
$('vt-dropzone').onkeydown=event=>{if(event.key==='Enter'&&event.target===$('vt-dropzone')){event.preventDefault();command('vt-pick');}};
$('vt-paste').onclick=()=>command('vt-paste');$('vt-pick').onclick=()=>command('vt-pick');
$('vt-key-form').onsubmit=async event=>{event.preventDefault();await command('vt-key-save',$('vt-key').value);$('vt-key').value='';};
$('vt-key-forget').onclick=()=>command('vt-key-forget');
$('vt-check').onclick=()=>command('vt-check');$('vt-upload').onclick=()=>command('vt-upload');$('vt-report').onclick=()=>command('vt-report');$('vt-cancel').onclick=()=>command('vt-cancel');
$('panic-form').onsubmit=async event=>{event.preventDefault();try{render(await api.command('panic-save',{shortcut:$('panic-combo').value,url:$('panic-url').value,enabled:$('panic-enabled').checked}));$('panic-message').textContent=tr("Configurazione salvata.");}catch{$('panic-message').textContent=tr("Scegli un indirizzo valido e una combinazione libera: Ctrl/Alt + tasto, oppure F8. Evita i comandi standard del browser.");}};
$('panic-record').onclick=()=>{const recording=!current?.panicRecording;command('panic-record',recording);if(recording){$('panic-combo').focus();$('panic-message').textContent=tr("Premi la combinazione. Esc annulla.");}};
$('panic-go').onclick=()=>command('panic-go');
api.panicKey(input=>{
  if(!dockSurface)return;
  if(input.key==='Escape'){command('panic-record',false);$('panic-message').textContent=tr("Registrazione annullata.");return;}
  if(['Control','Alt','Shift','Meta'].includes(input.key))return;
  if(!input.control&&!input.alt&&!/^F\d+$/.test(input.key)){$('panic-message').textContent=tr("Usa Ctrl o Alt insieme a un tasto, oppure un tasto funzione.");return;}
  const key=input.key===' '?'Space':input.key.length===1?input.key.toUpperCase():input.key;
  $('panic-combo').value=[input.control&&'Ctrl',input.alt&&'Alt',input.shift&&'Shift',key].filter(Boolean).join('+');
  command('panic-record',false);$('panic-message').textContent=tr("Combinazione scelta. Premi Salva per applicarla.");
});
for (const button of document.querySelectorAll('[data-native]')) button.onclick = () => {
  command('dock-tool',button.dataset.native);
};
$('native-privacy').onchange=()=>command('privacy-enabled',$('native-privacy').checked);
$('native-site-privacy').onchange=()=>command('privacy-site');
$('native-adblock').onchange = () => command('adblock-enabled', $('native-adblock').checked);
$('native-site-adblock').onchange = () => command('site-protection');
$('native-volume').oninput = () => {
  clearTimeout(volumeTimer); const value = Number($('native-volume').value); $('native-volume-value').textContent = `${value}%`;
  volumeTimer = setTimeout(() => command('native-volume', value), 70);
};
$('native-volume').onchange = () => { clearTimeout(volumeTimer); command('native-volume', Number($('native-volume').value)); };
$('native-volume-reset').onclick = () => command('native-volume', 100);
$('native-inspect').onclick = () => command('native-inspect');
$('native-video-save').onclick = () => command('native-video', $('native-video-format').value);
$('native-update').onclick = () => command('native-update');
$('native-image-save').onclick = () => command('native-image', $('native-image-format').value);
$('native-capture-save').onclick = () => command('native-capture', $('native-capture-format').value);
$('native-cancel').onclick = () => command('native-cancel');
$('native-show-file').onclick = () => command('native-show-file');
$('extension-add').onclick = () => command('extension-add');
$('extension-store-open').onclick=()=>command('extension-store-open');
$('extension-store-form').onsubmit=async event=>{event.preventDefault();try{render(await api.command('extension-store-install',$('extension-store-input').value));$('extension-store-input').value='';}catch(error){$('extension-note').textContent=tr(String(error.message).replace(/^Error invoking remote method (?:'[^']*'|"[^"]*"|[^:]+):\s*(?:Error:\s*)?/,''));}};
function renderLauncher(reset = true) {
  if (!current || panel !== 'launcher') return;
  const query = $('launcher-query').value.trim(), match = query.toLocaleLowerCase();
  const matches = (item) => !match || `${item.title} ${item.url}`.toLocaleLowerCase().includes(match);
  const selected=reset?null:launcherItems[launcherIndex];
  const open = (query?current.tabs.filter(tab=>tab.space===current.space&&tab.url!=='vela://start'&&matches(tab)).sort((a,b)=>(b.lastActive||0)-(a.lastActive||0)||b.id-a.id).slice(0,2):current.recentTabIds.map(id=>current.tabs.find(tab=>tab.id===id)).filter(Boolean));
  const seen = new Set(open.map((tab) => tab.url));
  const seenTitles=new Set(open.map(tab=>tab.title.trim().toLocaleLowerCase()));
  const saved = (query?[...current.pins, ...current.history]:[]).filter((item) => {
    const title=String(item.title||'').trim().toLocaleLowerCase();
    if (seen.has(item.url) || seenTitles.has(title) || !matches(item)) return false;
    seen.add(item.url);seenTitles.add(title);return true;
  });
  launcherItems = [
    ...(query ? [{ title: query, url: query, action: 'new-target', value: query, hint: /^(https?:\/\/|localhost|[\w-]+\.)/i.test(query) ? tr("Apri indirizzo") : tr("Cerca sul web"), mark: '⌕' }] : []),
    ...remoteSuggestions.filter(item=>item.toLocaleLowerCase()!==match).slice(0,4).map(item=>({title:item,url:'',action:'new-search',value:item,hint:tr("Suggerimento di ricerca"),mark:'⌕'})),
    ...open.map((tab) => ({ ...tab, action: 'select', value: tab.id, hint: tr("Passa alla scheda"), mark: '◇' })),
    ...saved.map((item) => ({ ...item, action: 'new-target', value: item.url, hint: tr("Apri in nuova scheda"), mark: item.letter || item.title.charAt(0) }))
  ].slice(0, 8);
  const previousIndex=selected?launcherItems.findIndex(item=>item.action===selected.action&&item.value===selected.value):-1;
  launcherIndex = reset ? 0 : previousIndex>=0?previousIndex:Math.min(launcherIndex, Math.max(0, launcherItems.length - 1));
  $('launcher-results').replaceChildren(...launcherItems.map((item, index) => {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'launcher-row'; row.id = `launcher-option-${index}`;
    row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(index === launcherIndex));
    const icon = document.createElement('span'); icon.className = 'launcher-mark'; icon.textContent = item.mark;
    const title = document.createElement('span'); title.className = 'launcher-title'; title.textContent = item.title;
    const hint = document.createElement('span'); hint.className = 'launcher-hint'; hint.textContent = `${item.hint}  →`;
    if(item.favicon){icon.textContent='';const image=document.createElement('img');image.src=item.favicon;image.alt='';image.onerror=()=>{icon.textContent=item.mark;};icon.append(image);}
    row.append(icon, title, hint); row.onmousedown = (event) => event.preventDefault();
    row.onclick = () => command(item.action, item.value); return row;
  }));
  $('launcher-query').setAttribute('aria-activedescendant', launcherItems.length ? `launcher-option-${launcherIndex}` : '');
}
$('launcher-query').setAttribute('role', 'combobox');
$('launcher-query').setAttribute('aria-controls', 'launcher-results');
$('launcher-query').setAttribute('aria-expanded', 'true');
$('launcher-query').oninput = () => {
  clearTimeout(suggestTimer);const generation=++suggestGeneration,query=$('launcher-query').value.trim();remoteSuggestions=[];renderLauncher();
  if(query.length<2||current?.privateMode)return;
  suggestTimer=setTimeout(async()=>{try{const items=await api.command('search-suggestions',query);if(generation===suggestGeneration&&panel==='launcher'&&$('launcher-query').value.trim()===query){remoteSuggestions=items;renderLauncher(false);}}catch{}},180);
};
$('launcher-query').onkeydown = (event) => {
  if (['ArrowDown', 'ArrowUp'].includes(event.key) && launcherItems.length) {
    event.preventDefault(); launcherIndex = (launcherIndex + (event.key === 'ArrowDown' ? 1 : launcherItems.length - 1)) % launcherItems.length; renderLauncher(false);
  }
};
$('launcher-form').onsubmit = (event) => {
  event.preventDefault(); const item = launcherItems[launcherIndex];
  if (item) command(item.action, item.value);
};
function render(state) {
  if (!state) return;
  const previousDownload = current?.download;
  applyLanguage(state.settings.language);
  current = state;
  if (panel && state.overlay === false) {
    panel = null; $('overlay').hidden = true;
    for (const section of document.querySelectorAll('#overlay>section')) section.hidden = true;
  }
  const tab = state.tabs.find((item) => item.id === state.activeId);
  if (!tab) return;
  if(dockSurface){applyAppearance(state.settings.backgroundColor);$('downloads-clear').disabled=!state.downloads.some(item=>item.status!=='progressing');renderLibrary();renderNativeTools(state,tab);if(state.download&&state.download!==previousDownload)toast(state.download);return;}
  document.title = `${tab.title} — Vela`;
  $('update-banner').hidden=!state.updateReady;$('settings-button').classList.toggle('update-pending',Boolean(state.updateReady));
  if(state.updateReady)$('update-message').textContent=tr("Aggiornamento v{v0} pronto",{v0:state.updateReady.version});
  if (!addressFocused) $('address').value = shortAddress(tab.url);
  $('back').disabled = !state.canBack; $('forward').disabled = !state.canForward;
  $('loading-line').classList.toggle('busy', tab.loading);
  $('reload').title = tab.loading ? tr("Interrompi caricamento") : tr("Ricarica (Ctrl+R)");
  $('reload').dataset.command = tab.loading ? 'stop' : 'reload';
  $('security-icon').hidden = !tab.url.startsWith('https://');
  $('start').hidden = tab.url !== 'vela://start' || Boolean(tab.error);
  $('error').hidden = !tab.error;
  $('error-detail').textContent = tab.error || '';
  $('panic-cover').hidden=!state.panicCover;
  $('sidebar').hidden = sidebarSurface ? false : !state.sidebar;
  $('sidebar').inert = !state.sidebar;
  $('sidebar').setAttribute('aria-hidden', String(!state.sidebar));
  document.body.classList.toggle('with-sidebar', state.sidebar);
  document.body.classList.toggle('sidebar-peeking', state.sidebarPeeking);
  document.body.classList.toggle('sidebar-pinned', state.sidebarMode === 'pinned');
  $('sidebar-mode').value = state.sidebarMode;
  for (const button of document.querySelectorAll('.sidebar-button')) {
    button.setAttribute('aria-pressed', state.sidebarMode === 'pinned');
    button.title = state.sidebarMode === 'pinned' ? tr("Mostra la barra al passaggio del cursore") : tr("Fissa barra laterale");
    button.setAttribute('aria-label', button.title);
  }
  $('protection').classList.toggle('ready', state.protection === 'ready' || state.protection === 'cached');
  $('protection').classList.toggle('disabled-site', !state.siteProtection);
  $('protection').title = state.siteProtection ? (state.siteBlocked===1?tr('Protezione nativa · 1 richiesta bloccata su questa pagina'):tr("Protezione nativa · {v0} richieste bloccate su questa pagina",{v0:state.siteBlocked.toLocaleString(localeTag(language))})) : tr("Protezione disattivata per questo sito");
  $('site-protection-switch').checked = state.siteProtection;
  $('site-protection-switch').disabled = tab.url === 'vela://start' || !state.settings.adblockEnabled;
  $('protection-host').textContent = shortAddress(tab.url) || tr("Nuova scheda");
  $('site-blocked').textContent = state.siteBlocked===1?tr('1 richiesta bloccata su questa pagina'):tr("{v0} richieste bloccate su questa pagina",{v0:state.siteBlocked.toLocaleString(localeTag(language))});
  $('filter-error').hidden = !state.filterError;
  $('filter-error').textContent = state.filterError;
  $('blocked-count').textContent = state.blocked.toLocaleString(localeTag(language));
  $('panel-count').textContent = state.blocked.toLocaleString(localeTag(language));
  $('filter-status').textContent = `${tr(statuses[state.protection])}${state.filterUpdated ? tr(" Ultimo aggiornamento: {v0}.",{v0:new Date(state.filterUpdated).toLocaleString(localeTag(language), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}) : ''}`;
  $('privacy-summary').textContent = state.protection === 'basic' ? tr("Protezione essenziale offline. In attesa delle liste complete.") : tr("Protezione integrata durante la navigazione.");
  if (!state.settings.adblockEnabled) $('privacy-summary').textContent = tr("Protezione disattivata nelle estensioni native.");
  document.body.classList.toggle('private', state.privateMode);
  applyAppearance(colorPreview === undefined ? state.settings.backgroundColor : colorPreview);
  if (colorPreview === undefined) {
    $('background-color').value = state.settings.backgroundColor || '#d9e4ef';
    if (document.activeElement !== $('background-hex')) $('background-hex').value = state.settings.backgroundColor || '';
  }
  $('theme-select').value = state.settings.theme;
  $('search-engine').value = state.settings.searchEngine || '';
  const engineNames = { google: 'Google', bing: 'Bing', brave: 'Brave Search', ecosia: 'Ecosia' };
  $('home-query').placeholder = tr("Cerca con {v0}",{v0:engineNames[state.settings.searchEngine] || tr("il tuo motore")});
  $('app-version').textContent = `v${state.version}`;
  $('https-switch').checked = state.settings.httpsOnly;
  $('zoom-value').textContent = `${state.zoom}%`;
  $('zoom-reset').textContent = `${state.zoom}%`;
  $('sidebar-memory').textContent = tr("{v0} {v1} · {v2} senza processo pagina",{v0:state.liveTabs,v1:state.liveTabs === 1 ? tr("pagina attiva") : tr("pagine attive"),v2:state.tabs.length - state.liveTabs});
  $('memory-status').textContent = state.liveTabs===1?tr('1 pagina caricata. Le altre si aprono quando le selezioni.'):tr("{v0} pagine caricate. Le altre si aprono quando le selezioni.",{v0:state.liveTabs.toLocaleString(localeTag(language))});
  $('open-tab-count').textContent = `${state.visibleTabCount} ${state.visibleTabCount === 1 ? tr("scheda aperta") : tr("schede aperte")}`;
  $('version-note').textContent = `Vela ${state.version} · Chromium ${state.chromium || ''}. ${state.privateMode ? tr("Finestra privata: cronologia e cookie non vengono conservati.") : tr("Le liste si aggiornano automaticamente. Il motore richiede nuove versioni dell’app.")}`;
  $('space-title').textContent = state.spaces[state.space].name;
  for (const id of ['personal','work']) {
    const config = state.spaces[id], button = $(`space-${id}`);
    button.title = tr("{v0} · Personalizza",{v0:config.name}); button.setAttribute('aria-label', config.name); button.style.setProperty('--space-color', config.color);
    spaceIcon(button, config);
  }
  $('sidebar').style.setProperty('--space-color', state.spaces[state.space].color);
  if (panel === 'spaces') renderSpaceEditor();
  $('space-personal').setAttribute('aria-pressed', state.space === 'personal');
  $('space-work').setAttribute('aria-pressed', state.space === 'work');
  $('history-button').disabled = state.privateMode;
  $('downloads-button').querySelector('.download-dot').hidden = !state.downloads.some((item) => item.status === 'progressing');
  $('downloads-clear').disabled=!state.downloads.some(item=>item.status!=='progressing');
  renderTabs(state);
  renderPins(state);
  renderLibrary();
  renderNativeTools(state, tab);
  if (panel === 'launcher') renderLauncher(false);
  if (state.download && state.download !== previousDownload) toast(state.download);
  if (!sidebarSurface && !dockSurface && !state.settings.searchEngine && panel !== 'search') setPanel('search');
}
function renderTabs(state) {
  if(dockSurface)return;
  const key = JSON.stringify([state.activeId, state.tabs, state.space]);
  if (key === tabsKey) return;
  tabsKey = key;
  const focusId = document.activeElement?.dataset.tabId;
  const visible = state.tabs.filter((tab) => tab.space === state.space);
  const makeTab = (tab) => {
    const element = document.createElement('div'); element.className = `tab${tab.id === state.activeId ? ' active' : ''}`;
    element.setAttribute('role', 'tab'); element.setAttribute('aria-selected', tab.id === state.activeId); element.tabIndex = tab.id === state.activeId ? 0 : -1; element.dataset.tabId = tab.id;
    element.classList.toggle('pinned', tab.pinned); element.classList.toggle('sleeping', tab.dormant);
    element.draggable = true;
    element.title = tab.title;
    const close = document.createElement('button'); close.className = 'tab-close'; close.textContent = '×'; close.setAttribute('aria-label', tr("Chiudi {v0}",{v0:tab.title}));
    close.onclick = (event) => { event.stopPropagation(); command('close', tab.id); };
    const mark = document.createElement('span'); mark.className = 'tab-mark';
    if (tab.favicon || tab.url === 'vela://start') {
      const image = document.createElement('img'); image.src = tab.favicon || '../assets/vela.png'; image.alt = ''; image.onerror = () => { mark.textContent = tab.title.charAt(0).toUpperCase(); }; mark.append(image);
    } else mark.textContent = shortAddress(tab.url).replace(/^www\./,'').charAt(0).toUpperCase() || 'V';
    mark.classList.toggle('loading', tab.loading);
    const title = document.createElement('span'); title.className = 'tab-title'; title.textContent = tab.title;
    element.append(close, mark, title);
    if (tab.audible || tab.muted) { const audio = document.createElement('span'); audio.className = 'tab-audio'; audio.textContent = tab.muted ? '♩̸' : '♪'; audio.title = tab.muted ? tr("Audio disattivato") : tr("Audio in riproduzione"); element.append(audio); }
    element.onclick = () => { setPanel(null); command('select', tab.id); };
    element.onkeydown = (event) => {
      if (event.target !== element) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); element.click(); }
      const index = state.tabs.findIndex((item) => item.id === tab.id);
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); command('select', state.tabs[(index + (event.key === 'ArrowRight' ? 1 : state.tabs.length - 1)) % state.tabs.length].id);
      }
    };
    element.onauxclick = (event) => { if (event.button === 1) command('close', tab.id); };
    element.oncontextmenu = (event) => { event.preventDefault(); command('tab-menu', tab.id); };
    element.ondragstart = (event) => { event.dataTransfer.setData('text/vela-tab', String(tab.id)); event.dataTransfer.effectAllowed = 'move'; };
    element.ondragover = (event) => { if (event.dataTransfer.types.includes('text/vela-tab')) { event.preventDefault(); element.classList.add('drag-over'); } };
    element.ondragleave = () => element.classList.remove('drag-over');
    element.ondrop = (event) => { event.preventDefault(); element.classList.remove('drag-over'); const id = Number(event.dataTransfer.getData('text/vela-tab')); if (id !== tab.id) command('move-tab', { id, beforeId: tab.id }); };
    return element;
  };
  const list = sidebarSurface?[]:visible.map(makeTab);
  const add = document.createElement('button'); add.className = 'tab-add'; add.textContent = '+'; add.title = tr("Nuova scheda"); add.onclick = () => command('new');
  if(!sidebarSurface)$('tabs').replaceChildren(...list, add);
  if(sidebarSurface){$('sidebar-fixed').replaceChildren(...visible.filter((tab) => tab.pinned).map(makeTab));$('sidebar-tabs').replaceChildren(...visible.filter((tab) => !tab.pinned).map(makeTab));}
  $('pinned-count').textContent = visible.filter((tab) => tab.pinned).length || '';
  if (focusId) list.find((node) => node.dataset.tabId === focusId)?.focus();
  const selected = sidebarSurface ? document.querySelector('#sidebar .tab.active') : list.find((node) => Number(node.dataset.tabId) === state.activeId);
  if (sidebarSurface && selected) {
    const scroller = selected.parentElement, row = selected.getBoundingClientRect(), area = scroller.getBoundingClientRect();
    if (row.bottom > area.bottom) scroller.scrollTop += row.bottom - area.bottom;
    else if (row.top < area.top) scroller.scrollTop -= area.top - row.top;
  } else selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (panel === 'tabs') renderOverview();
}
function empty(message) { const node = document.createElement('div'); node.className = 'empty-state'; node.textContent = message; return node; }
function libraryRow(title, subtitle, monogram = '◇') {
  const row = document.createElement('div'); row.className = 'overview-row';
  const icon = document.createElement('span'); icon.className = 'row-monogram'; icon.textContent = monogram;
  const content = document.createElement('div'); content.className = 'row-content';
  const name = document.createElement('strong'); name.textContent = title;
  const detail = document.createElement('small'); detail.textContent = subtitle;
  content.append(name, detail); row.append(icon, content); return row;
}
function makeActivatable(row, callback) {
  row.tabIndex = 0; row.setAttribute('role', 'button'); row.onclick = callback;
  row.onkeydown = (event) => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); callback(); } };
}
function renderOverview() {
  if (!current) return;
  const query = $('tab-search').value.trim().toLocaleLowerCase();
  const matches = current.tabs.filter((tab) => tab.space === current.space && `${tab.title} ${tab.url}`.toLocaleLowerCase().includes(query));
  $('overview-list').replaceChildren(...(matches.length ? matches.map((tab) => {
    const row = document.createElement('div'); row.className='overview-card';
    const header=document.createElement('div');header.className='overview-card-header';
    const icon=document.createElement('span');icon.className='tab-mark';
    if(tab.favicon || tab.url==='vela://start'){const image=document.createElement('img');image.src=tab.favicon||'../assets/vela.png';image.alt='';icon.append(image);}else icon.textContent=shortAddress(tab.url).charAt(0).toUpperCase();
    const title=document.createElement('span');title.className='overview-card-title';title.textContent=tab.title;header.append(icon,title);row.append(header);
    const preview=document.createElement('div');preview.className='overview-card-preview';
    if(tabPreviews[tab.id]){const image=document.createElement('img');image.src=tabPreviews[tab.id];image.alt=tr("Anteprima di {v0}",{v0:tab.title});preview.append(image);}
    else { const mark=icon.cloneNode(true);mark.className='overview-placeholder-icon';const label=document.createElement('span');label.textContent=tab.url==='vela://start'?tr("Pagina iniziale"):shortAddress(tab.url);const hint=document.createElement('small');hint.textContent=tab.dormant?tr("Scheda in riposo"):tr("Anteprima disponibile dopo la visualizzazione");preview.append(mark,label,hint); }
    row.append(preview);row.title=tab.url;
    row.classList.toggle('active', tab.id === current.activeId);
    makeActivatable(row, () => { setPanel(null); command('select', tab.id); });
    const close = document.createElement('button'); close.className = 'row-close'; close.textContent = '×'; close.setAttribute('aria-label', tr("Chiudi {v0}",{v0:tab.title}));
    close.onclick = (event) => { event.stopPropagation(); command('close', tab.id); }; header.prepend(close); return row;
  }) : [empty(tr("Nessuna scheda corrispondente."))]));
}
function renderLibrary() {
  if (!current) return;
  if (panel === 'favorites') renderFavoriteManager();
  if (panel === 'tabs') renderOverview();
  if (panel === 'history') {
    const query = $('history-search').value.toLocaleLowerCase();
    const key = JSON.stringify([query, current.history, current.privateMode]);
    if (key !== historyKey) {
      historyKey = key;
      const items = current.privateMode ? [] : current.history.filter((item) => `${item.title} ${item.url}`.toLocaleLowerCase().includes(query)).slice(0, 100);
      $('history-list').replaceChildren(...(items.length ? items.map((item) => {
        const row = libraryRow(item.title || shortAddress(item.url), `${shortAddress(item.url)} · ${new Date(item.time).toLocaleDateString(localeTag(language))}`, '◷');
        makeActivatable(row, () => { setPanel(null); command('navigate', item.url); }); return row;
      }) : [empty(current.privateMode ? tr("La navigazione privata non conserva la cronologia.") : tr("Le pagine visitate compariranno qui."))]));
    }
  }
  if (panel === 'downloads' || (dockSurface && current.dockMode==='downloads')) {
    const key = JSON.stringify(current.downloads);
    if (key === downloadsKey) return; downloadsKey = key;
    const size = (bytes) => bytes < 1024 ? `${bytes} B` : bytes > 1048576 ? `${(bytes / 1048576).toLocaleString(localeTag(language),{minimumFractionDigits:1,maximumFractionDigits:1})} MB` : `${Math.round(bytes / 1024)} KB`;
    $('download-list').replaceChildren(...(current.downloads.length ? current.downloads.map((item) => {
      const labels = { completed: tr("Completato"), cancelled: tr("Annullato"), interrupted: tr("Interrotto"), progressing: item.paused ? tr("In pausa") : tr("Download in corso") };
      const row = libraryRow(item.name, `${labels[item.status] || item.status} · ${size(item.received)}${item.total ? ` / ${size(item.total)}` : ''}`, '↓'); row.className = 'download-row';
      const content = row.querySelector('.row-content');
      if (item.status === 'progressing') { const progress = document.createElement('progress'); progress.max = item.total || 1; if (item.total) progress.value = item.received; progress.setAttribute('aria-label', tr("Avanzamento {v0}",{v0:item.name})); content.append(progress); }
      const actions = document.createElement('div'); actions.className = 'download-actions';
      if(item.status==='completed'){const scan=document.createElement('button');scan.textContent='VirusTotal';scan.title=tr("Controlla questo file con VirusTotal");scan.onclick=()=>command('vt-download',item.id);actions.append(scan);}
      for (const [action, label] of item.status === 'completed' ? [['show', tr("Mostra nella cartella")]] : item.status === 'progressing' ? [[item.paused ? 'resume' : 'pause', item.paused ? tr("Riprendi") : tr("Pausa")], ['cancel', tr("Annulla")]] : []) {
        const button = document.createElement('button'); button.textContent = label; button.onclick = () => command('download-action', { id: item.id, action }); actions.append(button);
      }
      row.append(actions); return row;
    }) : [empty(tr("I tuoi download compariranno qui."))]));
  }
}
let pinsKey;
function renderPins(state) {
  const key = JSON.stringify(state.pins);
  if (key === pinsKey) return; pinsKey = key;
  const pins = state.pins;
  if(!sidebarSurface)$('favorites').replaceChildren(...pins.map((pin) => {
    const button = document.createElement('button'); button.className = 'favorite'; button.title = pin.url;
    const tile = document.createElement('span'); tile.className = 'favorite-tile';
    const letter = document.createElement('span'); letter.className = 'favorite-letter'; letter.textContent = pin.letter || pin.title.charAt(0).toUpperCase();
    if(pin.favicon){const image=document.createElement('img');image.src=pin.favicon;image.alt='';image.onerror=()=>{letter.textContent=pin.letter||pin.title.charAt(0).toUpperCase();};letter.replaceChildren(image);}
    const label = document.createElement('span'); label.className = 'favorite-label'; label.textContent = pin.title;
    tile.append(letter); button.append(tile, label); button.onclick = () => command('navigate', pin.url);
    button.oncontextmenu = (event) => { event.preventDefault(); setPanel('favorites'); editFavorite(pin); };
    return button;
  }));
  if(!sidebarSurface&&!pins.length){const add=document.createElement('button');add.className='favorite-empty';add.textContent=tr("+ Aggiungi preferito");add.onclick=()=>{setPanel('favorites');editFavorite(null);};$('favorites').append(add);}
  if(sidebarSurface)$('sidebar-pins').replaceChildren(...pins.map((pin) => {
    const button = document.createElement('button'); button.className = 'arc-favorite'; button.title = pin.title;
    button.textContent = pin.letter || pin.title.charAt(0).toUpperCase();
    if(pin.favicon){const image=document.createElement('img');image.src=pin.favicon;image.alt='';image.onerror=()=>{button.textContent=pin.letter||pin.title.charAt(0).toUpperCase();};button.replaceChildren(image);}
    button.setAttribute('aria-label', pin.title); button.onclick = () => command('navigate', pin.url);
    button.oncontextmenu = (event) => { event.preventDefault(); setPanel('favorites'); editFavorite(pin); }; return button;
  }));
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-command]');
  if (button) { if (panel && button.dataset.command !== 'new') setPanel(null); command(button.dataset.command); }
});
$('address').addEventListener('focus', () => {
  addressFocused = true;
  const tab = current?.tabs.find((item) => item.id === current.activeId);
  $('address').value = tab?.url === 'vela://start' ? '' : tab?.url || '';
  $('address').select();
});
$('address').addEventListener('blur', () => { addressFocused = false; if (current) render(current); });
$('address').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const value = $('address').value; $('address').blur(); setPanel(null); command('navigate', value);
  } else if (event.key === 'Escape') { $('address').blur(); command('overlay', Boolean(panel)); }
});
$('protection').onclick = () => setPanel(panel === 'privacy' ? null : 'privacy');
$('privacy-card').onclick = () => setPanel('privacy');
$('overview').onclick = () => setPanel(panel === 'tabs' ? null : 'tabs');
for (const button of document.querySelectorAll('.close-panel')) button.onclick = () => setPanel(null);
$('overlay').onclick = (event) => { if (event.target === $('overlay')) setPanel(null); };
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { setPanel(null); closeFind(); }
  if (event.key === 'Tab' && panel) {
    const focusable = [...$(`${panel}-panel`).querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')].filter((node) => !node.hidden);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
$('refresh-filters').onclick = async () => {
  $('refresh-filters').disabled = true; $('refresh-filters').textContent = tr("Aggiornamento…");
  await command('refresh-filters');
  $('refresh-filters').disabled = false; $('refresh-filters').textContent = tr("Aggiorna liste");
};
$('share').onclick = async () => {
  const url = current?.tabs.find((tab) => tab.id === current.activeId)?.url;
  if (url && url !== 'vela://start') {
    await command('copy-url'); toast(tr("Indirizzo copiato"));
  }
};
function closeFind() { $('find-bar').hidden = true; command('find', ''); }
$('close-find').onclick = closeFind;
$('find-input').oninput = () => command('find', $('find-input').value);
$('find-input').onkeydown = (event) => { if (event.key === 'Enter') command('find', $('find-input').value); };
api.subscribe(render);
api.shortcut((name) => {
  if (name === 'new-tab') { clearTimeout(suggestTimer);suggestGeneration++;remoteSuggestions=[];$('launcher-query').value = ''; launcherIndex = 0; setPanel('launcher'); }
  if (name.startsWith('panel:')) setPanel(name.slice(6));
  if (name === 'search') setPanel('search');
  if (name === 'address') openAddress();
  if (name === 'find') { $('find-bar').hidden = false; $('find-input').focus(); }
});
$('downloads-button').onclick = () => command('downloads-toggle');
$('extensions-button').onpointerenter=()=>api.command('dock-prewarm').catch(()=>{});
$('downloads-clear').onclick = () => command('downloads-clear');
$('extensions-button').onclick = () => command('dock-toggle');
$('settings-button').onclick = () => setPanel(panel === 'settings' ? null : 'settings');
$('history-button').onclick = () => setPanel('history');
$('settings-history').onclick = () => setPanel('history');
$('start-settings').onclick = () => setPanel('settings');
$('start-tabs').onclick = () => setPanel('tabs');
$('start-search').onsubmit = (event) => {
  event.preventDefault();
  const query = $('home-query').value.trim();
  if (query) { $('home-query').blur(); command('search', query); }
};
$('tab-search').oninput = renderOverview;
$('history-search').oninput = renderLibrary;
$('theme-select').onchange = () => command('theme', $('theme-select').value);
$('search-engine').onchange = () => command('search-engine', $('search-engine').value);
for (const button of document.querySelectorAll('[data-engine]')) button.onclick = async () => {
  await command('search-engine', button.dataset.engine); setPanel(null);
};
$('https-switch').onchange = () => command('https-only', $('https-switch').checked);
$('site-protection-switch').onchange = () => command('site-protection');
$('sidebar-search').onclick = openAddress;
for (const [lane, pinned] of [['sidebar-fixed', true], ['sidebar-tabs', false]]) {
  $(lane).ondragover = (event) => { if (event.dataTransfer.types.includes('text/vela-tab')) event.preventDefault(); };
  $(lane).ondrop = (event) => {
    const id = Number(event.dataTransfer.getData('text/vela-tab'));
    const tab = current?.tabs.find((tab) => tab.id === id);
    if (tab && tab.pinned !== pinned) { event.preventDefault(); command('pin-tab', id); }
  };
}
for (const id of ['personal','work']) {
  $(`space-${id}`).onclick = async () => { await command('space', id); command('space-edit', id); };
  $(`space-${id}`).oncontextmenu = event => { event.preventDefault(); command('space-edit', id); };
}
$('space-settings').onclick = () => command('space-edit', current.space);
$('zoom-out').onclick = () => command('zoom', -1);
$('zoom-in').onclick = () => command('zoom', 1);
$('zoom-reset').onclick = () => command('zoom', 0);
function applyAppearance(selected) {
  const isCustom = /^#[\da-f]{6}$/i.test(selected || '');
  document.body.dataset.background = isCustom ? 'custom' : 'auto';
  if (isCustom) {
    document.body.style.setProperty('--custom-color', selected);
    const channels = [1, 3, 5].map((index) => parseInt(selected.slice(index, index + 2), 16) / 255)
      .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    document.body.dataset.theme = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 < .179 ? 'dark' : 'light';
  } else {
    document.body.style.removeProperty('--custom-color');
    document.body.dataset.theme = current?.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light') : current?.settings.theme || 'light';
  }
}
function selectedColor(value) {
  let hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) hex = [...hex].map((char) => char + char).join('');
  return /^[\da-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}
async function saveBackground(value) {
  const selected = value === null ? null : selectedColor(value);
  if (value !== null && !selected) { $('background-error').hidden = false; return; }
  $('background-error').hidden = true; colorPreview = selected; applyAppearance(selected);
  await command('background-color', selected); colorPreview = undefined; if (current) render(current);
}
$('background-color').oninput = () => { colorPreview = $('background-color').value; applyAppearance(colorPreview); };
$('background-color').onchange = () => saveBackground($('background-color').value);
$('background-hex').onchange = () => saveBackground($('background-hex').value);
$('background-hex').onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); saveBackground($('background-hex').value); } };
for (const button of document.querySelectorAll('[data-color]')) button.onclick = () => saveBackground(button.dataset.color);
$('background-reset').onclick = () => saveBackground(null);
$('sidebar-mode').onchange = () => command('sidebar-mode', $('sidebar-mode').value);
function editFavorite(pin) {
  $('favorite-original').value = pin?.url || '';
  $('favorite-title').value = pin?.title || ''; $('favorite-url').value = pin?.url || '';
  $('favorite-form-title').textContent = pin ? tr("Modifica preferito") : tr("Aggiungi preferito");
  $('favorite-cancel').hidden = !pin; $('favorite-error').hidden = true;
  if (pin) $('favorite-title').focus();
}
function renderFavoriteManager() {
  const key = JSON.stringify(current.pins);
  if (key === favoriteManagerKey) return; favoriteManagerKey = key;
  $('favorite-list').replaceChildren(...(current.pins.length ? current.pins.map((pin, index) => {
    const row = libraryRow(pin.title, pin.url, pin.letter || pin.title.charAt(0).toUpperCase());
    const actions = document.createElement('div'); actions.className = 'favorite-actions';
    for (const [label, action, disabled] of [
      ['↑', () => command('favorite-move', { url: pin.url, direction: -1 }), index === 0],
      ['↓', () => command('favorite-move', { url: pin.url, direction: 1 }), index === current.pins.length - 1],
      [tr("Modifica"), () => editFavorite(pin), false],
      [tr("Elimina"), () => command('remove-pin', pin.url), false]
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = disabled;
      button.setAttribute('aria-label', `${label === '↑' ? tr("Sposta su") : label === '↓' ? tr("Sposta giù") : label} ${pin.title}`); button.onclick = action; actions.append(button);
    }
    row.append(actions); return row;
  }) : [empty(tr("Nessun preferito. Aggiungine uno qui sotto."))]));
}
$('favorite-form').onsubmit = async (event) => {
  event.preventDefault();
  const title = $('favorite-title').value.trim(), url = $('favorite-url').value.trim();
  $('favorite-error').hidden = true;
  try {
    const result = await api.command('favorite-save', { title, url, originalUrl: $('favorite-original').value });
    render(result); editFavorite(null); toast(tr("Preferito salvato"));
  } catch (error) {
    $('favorite-error').textContent = error.message.includes(tr("Indirizzo già presente nei preferiti")) ? tr("Questo indirizzo è già nei preferiti.") : tr("Inserisci un nome e un indirizzo HTTP/HTTPS valido.");
    $('favorite-error').hidden = false;
  }
};
$('favorite-cancel').onclick = () => editFavorite(null);
for (const id of ['edit-favorites', 'sidebar-edit-favorites', 'settings-favorites']) $(id).onclick = () => setPanel('favorites');
function spaceIcon(target, config) {
  const key = config.image || config.emoji;
  if (target.dataset.icon === key) return;
  target.dataset.icon = key; target.replaceChildren();
  if (config.image) { const image = document.createElement('img'); image.src = config.image; image.alt = ''; target.append(image); }
  else {const emoji=document.createElement('span');emoji.className='space-emoji';emoji.textContent=config.emoji;target.append(emoji);}
}
function previewSpace() {
  if (!spaceDraft) return;
  $('space-preview').style.setProperty('--space-color', $('space-color').value); spaceIcon($('space-preview'), spaceDraft);
  for (const button of $('space-emojis').children) button.setAttribute('aria-pressed', String(!spaceDraft.image && button.textContent === spaceDraft.emoji));
  $('space-image-remove').disabled = !spaceDraft.image;
  $('space-save-status').textContent = '';
}
function renderSpaceEditor() {
  if (!current || spaceDraftId === current.spaceEditor) return;
  spaceDraftId = current.spaceEditor; spaceDraft = { ...current.spaces[spaceDraftId] };
  $('space-name').value = spaceDraft.name; $('space-color').value = spaceDraft.color; previewSpace();
}
for (const emoji of ['🏠','💼','🌍','🚀','🎮','🎨','🎵','📚','💻','🌙','☀️','🌿','🐱','🦊','⭐','❤️','🧠','☕','🏖️','🔬','📷','⚽','🍀','🪐']) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = emoji; button.setAttribute('aria-label', emoji);
  button.onclick = () => { spaceDraft.emoji = emoji; spaceDraft.image = null; previewSpace(); }; $('space-emojis').append(button);
}
for (const color of ['#7686a5','#947b9c','#518877','#d09a5c','#bb7485','#4383bd','#45464d','#ba664e']) {
  const button = document.createElement('button'); button.type = 'button'; button.style.backgroundColor = color; button.setAttribute('aria-label', color);
  button.onclick = () => { $('space-color').value = color; previewSpace(); }; $('space-colors').append(button);
}
$('space-color').oninput = previewSpace;
$('space-image').onclick = async () => { try { const result = await api.command('space-image', spaceDraftId); render(result); spaceDraft.image = result.spaces[spaceDraftId].image; previewSpace(); } catch { $('space-save-status').textContent = tr("Scegli un’immagine valida fino a 5 MB."); } };
$('space-image-remove').onclick = () => { spaceDraft.image = null; previewSpace(); };
$('space-form').onsubmit = async event => {
  event.preventDefault();
  await command('space-save', { id: spaceDraftId, config: { ...spaceDraft, name: $('space-name').value, color: $('space-color').value } });
  $('space-save-status').textContent = tr("Spazio salvato");
};
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => { if (current) render(current); });
command('state');
if(dockSurface){
  let reportedHeight=0;
  const observer=new ResizeObserver(()=>{const target=current?.dockMode==='downloads'?'downloads-panel':'extensions-panel';const height=Math.max(120,Math.min(550,$(target).offsetHeight+16));if(height!==reportedHeight){reportedHeight=height;api.command('dock-size',height).catch(()=>{});}});observer.observe($('extensions-panel'));observer.observe($('downloads-panel'));
}

function applyLanguage(value){
  const next=normalizeLanguage(value)||'it';if(languageApplied===next)return;language=next;languageApplied=next;document.documentElement.lang=next;
  for(const element of document.querySelectorAll('[data-i18n]')){
    const key=element.getAttribute('data-i18n'),node=[...element.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
    if(node){const before=node.textContent.match(/^\s*/)[0],after=node.textContent.match(/\s*$/)[0];node.textContent=before+tr(key)+after;}
  }
  for(const attribute of ['placeholder','title','aria-label'])for(const element of document.querySelectorAll('[data-i18n-'+attribute+']'))element.setAttribute(attribute,tr(element.getAttribute('data-i18n-'+attribute)));
  $('language-select').value=next;$('sidebar-fixed').setAttribute('data-empty-label',tr('Trascina qui una scheda'));
  tabsKey=downloadsKey=historyKey=extensionKey=virusDownloadsKey=favoriteManagerKey=pinsKey=undefined;
  for(const id of ['toast','panic-message','favorite-error','space-save-status','native-message','native-error','vt-message','vt-error','background-error','filter-error','error-detail'])$(id).textContent=tr($(id).textContent);
  $('favorite-form-title').textContent=tr($('favorite-original').value?'Modifica preferito':'Aggiungi preferito');
  for(const button of document.querySelectorAll('[data-native]'))button.title=nativeToolTitle(button);
}
$('language-select').onchange=event=>command('language',event.target.value);
