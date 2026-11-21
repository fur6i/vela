const {t,normalizeLanguage,detectLanguage,localizedDialog,SUPPORTED_LANGUAGES,readInstallerLanguage}=require('./i18n.js');
const { app, BrowserWindow, WebContentsView, ipcMain, session, dialog, Menu, shell, nativeTheme, clipboard, screen, safeStorage, nativeImage, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { ElectronBlocker, Request, adsAndTrackingLists } = require('@ghostery/adblocker-electron');
const { HOME, SEARCH_ENGINES, destination, searchDestination, isWeb, secureTarget } = require('./navigation.cjs');
const { protectSession } = require('./security.cjs');
const { pageFilters, validFrame, scriptletProgram } = require('./adblock.cjs');
const { isYouTubeStreamRejection, playerRecoveryScript } = require('./media.cjs');
const { DEFAULT_FAVORITES, favorite, favoritesFromProfile, color, scrollbarStyles } = require('./preferences.cjs');
const { spawn } = require('node:child_process');
const { NativeTools, setPageVolume } = require('./native-tools.cjs');
const { ExtensionShelf } = require('./extension-shelf.cjs');
const { consentProgram, privacyFrame } = require('./privacy.cjs');
const { VirusTotal, localClipboardPath } = require('./virustotal.cjs');
const { DEFAULT_PANIC, panicConfig, matchesShortcut } = require('./panic.cjs');
const { spacesFromProfile, spaceConfig } = require('./spaces.cjs');
const {privateTarget,deferredCleanup,registerPrivate,cleanupOrphans}=require('./private-cleanup.cjs');
const {ThumbnailCache}=require('./thumbnails.cjs');
const {Favicons}=require('./favicons.cjs');
let favicons;
const {createUpdates,updatesEnabled}=require('./updates.cjs');
const thumbnails=new ThumbnailCache(20);
const {SearchSuggestions,recentTabs}=require('./search-suggestions.cjs');
const searchSuggestions=new SearchSuggestions((...args)=>net.fetch(...args));
let activationClock=Date.now();
function touchTab(tab){tab.lastActive=activationClock=Math.max(Date.now(),activationClock+1);}
let spaces = spacesFromProfile(), spaceEditor = 'personal';
const nativeDockIds=['video','adblock','volume','image','capture','privacy','virustotal','panic'];
let dockOrder={native:[...nativeDockIds],external:[]};
app.enableSandbox();
for (const flag of ['ignore-certificate-errors', 'disable-web-security', 'no-sandbox', 'remote-debugging-port', 'remote-debugging-pipe']) app.commandLine.removeSwitch(flag);
app.commandLine.appendSwitch('site-per-process');
const smoke = process.argv.includes('--smoke-test');
const uiReview = smoke && process.argv.includes('--ui-review');
const privateMode = process.argv.includes('--private');
const privateProbe=privateMode?process.argv.find(arg=>/^--private-probe=[a-f0-9]{32}$/.test(arg))?.split('=')[1]:null;
const normalProfile=app.getPath('userData');
let privateData;
if (privateMode && !smoke) {
  privateData = fs.mkdtempSync(path.join(app.getPath('temp'), 'vela-private-'));
  registerPrivate(privateData,app.getPath('temp'));
  app.setPath('userData', privateData);
}
if (smoke) app.setPath('userData', app.isPackaged ? path.join(app.getPath('temp'), 'vela-smoke-profile') : path.join(__dirname, '..', '.smoke-profile'));
let win, browserSession, blocker, activeId, overlay = false, sidebar = false, protectionReady;
let sidebarPeek = false, edgeSince = null, leaveSince = null;
let sidebarSurface, sidebarHideTimer, pendingSearch;
let hoverWake=()=>{};
let tools, extensionShelf, extensionPaths = [],managedExtensionIds=[],updates;
let dockSurface, dockOpen = false, dockTool = null, dockHideTimer, extensionSurface, extensionPopupId;
let dockHeight = 164;
let dockMode='extensions',virusTotal,panic={...DEFAULT_PANIC},panicRecording=false;
let privacyBlocker, privacyListUpdated = null, privacyBlocked = 0, cookiesRejected = 0, cookiesPrevented = 0;
let privacyDisabledSites = new Set();
let protection = 'loading', blocked = 0, download = '', saveTimer, publishTimer, filterRefresh;
let history = [], recentlyClosed = [], downloads = [], revokePermissions = () => {};
const tr=(key,vars)=>t(settings.language,key,vars);
const appDialog=localizedDialog(dialog,()=>settings.language);
let settings = { language:null, httpsOnly: true, theme: 'system', backgroundColor: null, searchEngine: null, adblockEnabled: true, privacyEnabled: true };
let disabledSites = new Set(), siteBlocked = new Map(), filterUpdated = null, filterError = '';
const downloadItems = new Map();
const diagnostics = { publishCount: 0, blockedRequests: [], mediaRequests: [] };
let tabs = [], nextId = 1;
let selectedSpace = 'personal';
let saved = { tabs: [], pins: DEFAULT_FAVORITES.map((item) => ({ ...item })) };
const profileFile = () => path.join(app.getPath('userData'), 'profile.json');
const active = () => tabs.find((tab) => tab.id === activeId);
const contents = () => active()?.view?.webContents;
async function updatePreview(tab, attempt = 0) {
  if (!tab || tab.error || (tab.url !== HOME && !tab.view)) return;
  try {
    const page = tab.url;
    const image = tab.url === HOME ? await win.webContents.capturePage({x:sidebar?256:8,y:68,width:Math.max(1,win.getContentSize()[0]-(sidebar?264:16)),height:Math.max(1,win.getContentSize()[1]-76)}) : await tab.view.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
    if (tabs.includes(tab)&&tab.url === page && !image.isEmpty()) thumbnails.set(tab,image.resize({width:560}).toJPEG(68).toString('base64'));
  } catch { if(attempt<2){await new Promise(resolve=>setTimeout(resolve,120));await updatePreview(tab,attempt+1);} }
}
async function updateFavicon(tab, candidates = []) {
  const wc = tab.view?.webContents; if (!wc || wc.isDestroyed() || !isWeb(tab.url)) return;
  const page = tab.url;
  if (tab.iconJob === page) { if(candidates.length)tab.pendingIcons=candidates;return; }
  tab.iconJob = page;
  try {
    const discovered = await wc.executeJavaScript('[...document.querySelectorAll("link[rel~=icon],link[rel=apple-touch-icon]")].map(link=>link.href).slice(0,8)').catch(()=>[]);
    const image=await favicons.get(page,[...candidates,...discovered]);
    if(image&&!wc.isDestroyed()&&tab.url===page&&tabs.includes(tab)){
      tab.favicon=image.favicon;tab.faviconSource=image.source;
      for(const pin of saved.pins)if(new URL(pin.url).origin===new URL(page).origin)pin.favicon=image.favicon;
      publish();save();
    }
  } finally { if(tab.iconJob===page){tab.iconJob=null;const pending=tab.pendingIcons;tab.pendingIcons=null;if(pending?.length)void updateFavicon(tab,pending);} }
}

function refreshFavoriteIcons(){
  if(privateMode)return;
  for(const pin of saved.pins){if(pin.favicon||smoke&&!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/.test(pin.url))continue;
    void favicons.get(pin.url).then(image=>{if(!image||!saved.pins.includes(pin))return;pin.favicon=image.favicon;for(const tab of tabs)if(!tab.favicon&&isWeb(tab.url)&&new URL(tab.url).origin===new URL(pin.url).origin)tab.favicon=image.favicon;publish();save();}).catch(()=>{});
  }
}

function writeProfile() {
  if (smoke || privateMode) return;
  try {
    const temporary = `${profileFile()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({
      spaces, dockOrder, tabs: tabs.map(({ url, title, pinned, muted, space, favicon,lastActive }) => ({ url, title, pinned, muted, space, favicon,lastActive })).filter((tab) => tab.url === HOME || isWeb(tab.url)),
      activeIndex: tabs.findIndex((tab) => tab.id === activeId), pins: saved.pins, favoritesVersion: 1, history, settings, panic, downloads:downloads.filter(item=>item.status==='completed' && item.path).map(({id,name,path,total})=>({id,name,path,total})).slice(0,40), extensionPaths,managedExtensionIds, disabledSites: [...disabledSites], privacyDisabledSites: [...privacyDisabledSites], sidebarMode: sidebar ? 'pinned' : 'auto', selectedSpace
    }));
    fs.renameSync(temporary, profileFile());
  } catch (error) { console.error(tr("Salvataggio profilo:"), error.message); }
}
function save() {
  if (smoke || privateMode) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeProfile, 600);
}

function state() {
  return {
    spaces:Object.fromEntries(Object.entries(spaces).map(([id,space])=>[id,{...space,name:(id==='personal'?['Personale','Personal']:['Lavoro','Work']).includes(space.name)?tr(id==='personal'?'Personale':'Lavoro'):space.name}])), spaceEditor, tabs: tabs.map(({ id, title, url, loading, error, pinned, muted, view, space, favicon,lastActive }) => ({ id, title:url===HOME?tr('Pagina iniziale'):title, url, loading, error:tr(error), pinned, muted, space, favicon,lastActive, dormant: !view && url !== HOME, audible: view?.webContents.isCurrentlyAudible() || false })),
    visibleTabCount:tabs.filter(tab=>tab.space===selectedSpace).length,
    recentTabIds:recentTabs(tabs,selectedSpace).map(tab=>tab.id),
    space: selectedSpace, dockOrder,
    activeId, sidebar: sidebar || sidebarPeek, sidebarMode: sidebar ? 'pinned' : 'auto', sidebarPeeking: sidebarPeek,
    pins: saved.pins, protection, blocked, download:tr(download), filterUpdated, filterError:tr(filterError),
    siteProtection: settings.adblockEnabled && (active()?.url !== HOME && isWeb(active()?.url) ? !disabledSites.has(new URL(active().url).hostname) : true),
    tools: tools?.snapshot(), extensions: extensionShelf?.snapshot(),updateReady:updates?.snapshot()||null,
    dockOpen, dockTool, dockMode, extensionPopupId,virusTotal:virusTotal?.snapshot(),panic,panicRecording,panicCover:Boolean(active()?.panicCover),
    privacy: { enabled: privacyForTab(active()), blocked: privacyBlocked, rejected: cookiesRejected, cookiesPrevented, updated: privacyListUpdated },
    siteBlocked: siteBlocked.get(active()?.view?.webContents.id) || 0,
    canBack: contents()?.navigationHistory.canGoBack() || false,
    canForward: contents()?.navigationHistory.canGoForward() || false,
    maximized: win?.isMaximized() || false, privateMode, settings, history, overlay, chromium: process.versions.chrome,
    recentlyClosed: recentlyClosed.length, zoom: Math.round((contents()?.getZoomFactor() || 1) * 100),
    downloads: downloads.map(({ id, name, received, total, status, paused }) => ({ id, name, received, total, status, paused })),
    liveTabs: tabs.filter((tab) => tab.view).length, version: app.getVersion()
  };
}
function publish() {
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    if (win && !win.isDestroyed()) { diagnostics.publishCount++; sendState(); }
  }, 60);
}
function sendState() {
  const snapshot = state();
  for (const wc of [win?.webContents,sidebarSurface?.getVisible()?sidebarSurface.webContents:null,dockSurface?.getVisible()?dockSurface.webContents:null]) if (wc && !wc.isDestroyed()) {wc.send('vela:state', snapshot);diagnostics.uiStatePackets=(diagnostics.uiStatePackets||0)+1;}
}
function loadSurface(surface,name){
  if(!surface.uiLoading)surface.uiLoading=surface.webContents.loadFile(path.join(__dirname,'index.html'),{query:{surface:name}}).then(()=>{if(!surface.webContents.isDestroyed())surface.webContents.send('vela:state',state());});
  return surface.uiLoading;
}
function closeExtensionPopup() {
  if (extensionSurface) { if(win && !win.isDestroyed())win.contentView.removeChildView(extensionSurface); if (!extensionSurface.webContents.isDestroyed()) extensionSurface.webContents.close(); extensionSurface = null; }
  extensionPopupId = null;
}
function layoutDock() {
  if (!dockSurface || !win || win.isDestroyed()) return;
  clearTimeout(dockHideTimer);
  const [width, height] = win.getContentSize();
  dockSurface.setBounds({ x: Math.max(0, width - 458), y: 64, width: Math.min(450, width), height: Math.min(height - 72, dockHeight) });
  if (dockOpen && !overlay) { const opening=!dockSurface.getVisible();void loadSurface(dockSurface,'dock');win.contentView.addChildView(dockSurface); dockSurface.setVisible(true);if(opening&&dockSurface.webContents.getURL())dockSurface.webContents.send('vela:state',state()); }
  else dockHideTimer = setTimeout(() => { if (!dockOpen || overlay) {dockSurface?.setVisible(false);dockTool=null;dockHeight=164;} }, 230);
  if (extensionSurface) {
    extensionSurface.setBounds({ x: Math.max(8, width - 442), y: 218, width: 426, height: Math.max(120, Math.min(400, height - 226)) });
    extensionSurface.setVisible(dockOpen && !overlay);
    if (dockOpen && !overlay) { win.contentView.addChildView(extensionSurface); win.contentView.addChildView(dockSurface); }
  }
}
function setDock(open, mode=dockMode) {
  if(open && (!dockOpen || mode!==dockMode)){panicRecording=false;dockTool=null;dockHeight=mode==='downloads'?430:164;closeExtensionPopup();}
  dockMode=mode;dockOpen = Boolean(open); if (!dockOpen) {closeExtensionPopup();panicRecording=false;}
  layoutDock(); sendState();
}
function showExtensionPopup(target, extension) {
  closeExtensionPopup(); dockTool = null; dockMode='extensions';dockHeight=164;dockOpen = true; extensionPopupId = extension.id;
  extensionSurface = new WebContentsView({ webPreferences: { session: browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false } });
  extensionSurface.setBorderRadius(14); extensionSurface.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  wireKeys(extensionSurface.webContents);
  extensionSurface.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`chrome-extension://${extension.id}/`)) event.preventDefault(); });
  extensionSurface.webContents.loadURL(target.href).catch(() => closeExtensionPopup());
  layoutDock(); sendState();
}
function privacyForTab(tab) {
  return Boolean(settings.privacyEnabled && tab && isWeb(tab.url) && !privacyDisabledSites.has(new URL(tab.url).hostname));
}
function privacyForRequest(details) { return privacyForTab(tabs.find(tab => tab.view?.webContents.id === details.webContentsId)); }
function thirdPartyRequest(details) {
  try {
  const tab = tabs.find(tab => tab.view?.webContents.id === details.webContentsId);
  return Boolean(tab && details.resourceType !== 'mainFrame' && Request.fromRawDetails({ url: details.url, sourceUrl: tab.url, type: details.resourceType }).isThirdParty);
  } catch {return false;}
}
function reloadProtection() {
  for (const tab of tabs) if (tab.view) tab.protectionDirty = true;
  if (active()?.view) { active().protectionDirty = false; contents().reload(); }
}
function layoutSidebar() {
  if (!sidebarSurface || !win || win.isDestroyed()) return;
  clearTimeout(sidebarHideTimer);
  sidebarSurface.setBounds({ x: 0, y: 64, width: 256, height: Math.max(1, win.getContentSize()[1] - 64) });
  if ((sidebar || sidebarPeek) && !overlay) {
    const opening=!sidebarSurface.getVisible();
    void loadSurface(sidebarSurface,'sidebar');
    win.contentView.addChildView(sidebarSurface);
    sidebarSurface.setVisible(true);
    if(opening&&sidebarSurface.webContents.getURL())sidebarSurface.webContents.send('vela:state',state());
  } else if (overlay) sidebarSurface.setVisible(false);
  else sidebarHideTimer = setTimeout(() => { if (sidebarSurface && !sidebar && !sidebarPeek) sidebarSurface.setVisible(false); }, 220);
}
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  for (const tab of tabs) {
    if (!tab.view) continue;
    const visible = tab.id === activeId && tab.url !== HOME && !overlay && !tab.error && !tab.panicCover;
    if(tab.view.getVisible()!==visible)tab.view.setVisible(visible);
    if (tab.id === activeId) {
      const pageWidth = Math.max(1, width - (sidebar ? 264 : 16));
      const pageHeight = Math.max(1, height - 76);
      tab.view.setBounds({ x: sidebar ? 256 : 8, y: 68, width: pageWidth, height: pageHeight });
    }
  }
  layoutSidebar();
  layoutDock();
}
function setSidebarPeek(visible) {
  visible = visible && !sidebar;
  if (sidebarPeek === visible) return;
  sidebarPeek = visible; layoutSidebar(); sendState();
}
function updateSidebarPointer(point, now = Date.now()) {
  if (!win || win.isDestroyed() || sidebar || overlay) return;
  const [width, height] = win.getContentSize();
  const inside = point && point.x >= 0 && point.x < width && point.y >= 64 && point.y < height;
  if (inside && point.x <= 24 && !sidebarPeek) {
    if (edgeSince === null) edgeSince = now;
    if (now - edgeSince >= 60) setSidebarPeek(true);
    leaveSince = null;
  } else {
    edgeSince = null;
    if (sidebarPeek && inside && point.x < 260) leaveSince = null;
    else if (sidebarPeek) {
      if (leaveSince === null) leaveSince = now;
      if (now - leaveSince >= 320) { setSidebarPeek(false); leaveSince = null; }
    }
  }
}
function select(id) {
  if (!tabs.some((tab) => tab.id === id)) return;
  if (activeId !== id && active()?.url !== HOME && !overlay) void updatePreview(active());
  activeId = id; overlay = false;
  touchTab(active());
  selectedSpace = active().space;
  if (!active().view && active().url !== HOME) navigate(active(), active().url);
  else if (active().protectionDirty) { active().protectionDirty = false; contents()?.reload(); }
  layout(); publish(); save();
}
function shortcut(input) {
  if (input.type !== 'keyDown' || !tabs.length) return false;
  const key = input.key.toLowerCase();
  if(matchesShortcut(input,panic)){goPanic();return true;}
  if (key === 'escape' && dockOpen) { setDock(false); return true; }
  if (input.control && !input.alt) {
    if (key === 'l' || key === 'k') { win.webContents.focus(); win.webContents.send('vela:shortcut', 'address'); return true; }
    if (key === 't' && input.shift) { reopen(); return true; }
    if (key === 't') { openNewTab(); return true; }
    if (key === 'n' && input.shift) { openPrivate(); return true; }
    if (key === 'p') { contents()?.print({}); return true; }
    if (['+', '=', '-', '0'].includes(key)) { zoom(key === '-' ? -1 : key === '0' ? 0 : 1); return true; }
    if (/^[1-9]$/.test(key)) { const visible = tabs.filter((tab) => tab.space === selectedSpace); select(visible[key === '9' ? visible.length - 1 : Number(key) - 1]?.id); return true; }
    if (key === 'w') { closeTab(activeId); return true; }
    if (key === 'r') { contents()?.reload(); return true; }
    if (key === 'tab') {
      const visible = tabs.filter((tab) => tab.space === selectedSpace);
      const index = visible.findIndex((tab) => tab.id === activeId);
      if (visible.length) select(visible[(index + (input.shift ? visible.length - 1 : 1)) % visible.length].id); return true;
    }
    if (key === 'd') { pin(); return true; }
    if (key === 'f') { win.webContents.focus(); win.webContents.send('vela:shortcut', 'find'); return true; }
  }
  if (input.alt && key === 'left') { if (contents()?.navigationHistory.canGoBack()) contents().navigationHistory.goBack(); return true; }
  if (input.alt && key === 'right') { if (contents()?.navigationHistory.canGoForward()) contents().navigationHistory.goForward(); return true; }
  return false;
}
function wireKeys(wc) { wc.on('before-input-event', (event, input) => {
  if(panicRecording && wc===dockSurface?.webContents){event.preventDefault();if(input.type==='keyDown')wc.send('vela:panic-key',{key:input.key,control:input.control,alt:input.alt,shift:input.shift});return;}
  if (shortcut(input)) event.preventDefault();
}); }
function goPanic() {
  if(!panic.enabled || !active())return;
  panicRecording=false;sidebarPeek=false;overlay=false;
  const tab=active();tab.panicCover=true;tab.title=tr("Nuova pagina");contents()?.setAudioMuted(true);contents()?.stop();
  navigate(tab,panic.url);setDock(false);publish();
}
function openVirus(file) {
  setDock(true,'extensions');dockTool='virustotal';dockHeight=530;layoutDock();sendState();
  if(file!==undefined)void virusTotal.select(file);
}
async function pastedFile() {
  if(typeof clipboard.readBuffer==='function')try{const file=localClipboardPath(clipboard.readBuffer('FileNameW').toString('utf16le'));if(file)return file;}catch{}
  if(typeof clipboard.readBuffer!=='function')try{for(const item of await clipboard.read())if(item.types.includes('text/uri-list')){const file=localClipboardPath(await(await item.getType('text/uri-list')).text());if(file)return file;}}catch{}
  return localClipboardPath(await clipboard.readText());
}
function openNewTab() {
  overlay = true; layout();
  win.webContents.focus(); win.webContents.send('vela:shortcut', 'new-tab'); publish();
}
async function updateScrollbars(tab) {
  const wc = tab.view?.webContents;
  if (!wc || wc.isDestroyed()) return;
  const generation = tab.scrollbarGeneration = (tab.scrollbarGeneration || 0) + 1;
  try {
    const key = await wc.insertCSS(scrollbarStyles(settings.backgroundColor, nativeTheme.shouldUseDarkColors), { cssOrigin: 'user' });
    if (generation !== tab.scrollbarGeneration) { await wc.removeInsertedCSS(key); return; }
    const previous = tab.scrollbarKey; tab.scrollbarKey = key;
    if (previous) await wc.removeInsertedCSS(previous);
  } catch {}
}

function ensureView(tab) {
  if (tab.view) return;
  tab.view = new WebContentsView({ webPreferences: {
    session: browserSession, nodeIntegration: false, contextIsolation: true, sandbox: true,
    webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
    nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, navigateOnDragDrop: false,
    safeDialogs: true, backgroundThrottling: true, spellcheck: true
  } });
  tab.view.setBorderRadius(14);
  win.contentView.addChildView(tab.view);
  const wc = tab.view.webContents;
  const wcId = wc.id;
  wc.once('destroyed', () => siteBlocked.delete(wcId));
  wc.on('page-favicon-updated', (_event, icons) => { void updateFavicon(tab,icons); });
  wc.on('did-finish-load', () => { void updateFavicon(tab); if(tab.id===activeId)setTimeout(()=>{if(tab.id===activeId&&!overlay)void updatePreview(tab);},500); });
  wc.on('did-start-navigation', (event) => { if (event.isMainFrame && !event.isSameDocument) { siteBlocked.set(wcId, 0); tab.mediaRecoveryUsed = false; publish(); } });
  wireKeys(wc);
  wc.on('before-mouse-event', (_event, mouse) => { if (mouse.type === 'mouseDown' && dockOpen) setDock(false); });
  wc.setAudioMuted(smoke || Boolean(privateProbe) || Boolean(tab.muted) || tab.volume === 0);
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (isWeb(url) && ['foreground-tab', 'background-tab'].includes(disposition)) createTab(url, { background: disposition === 'background-tab' });
    return { action: 'deny' };
  });
  const guard = (event, url) => {
    const target = secureTarget(url, settings.httpsOnly);
    if (!target) event.preventDefault();
    else if (target !== url) { event.preventDefault(); navigate(tab, target); }
  };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  wc.on('will-frame-navigate', (event) => { if (!isWeb(event.url) && !['about:blank', 'about:srcdoc'].includes(event.url) && !event.url.startsWith('blob:')) event.preventDefault(); });
  wc.on('will-attach-webview', (event) => event.preventDefault());
  wc.on('media-started-playing', publish); wc.on('media-paused', publish);
  wc.on('page-title-updated', (_event, title) => { if(tab.panicCover)return;tab.title = title; const entry = history.find((item) => item.url === tab.url); if (entry) entry.title = title; publish(); save(); });
  const navigated = () => {
    if (new URL(tab.url).host !== new URL(wc.getURL()).host) { tab.favicon = null; tab.faviconSource = null; }
    tab.url = wc.getURL(); tab.error = '';
    if (!privateMode && isWeb(tab.url)) history = [{ url: tab.url, title: wc.getTitle() || tab.title, time: Date.now() }, ...history.filter((item) => item.url !== tab.url)].slice(0, 300);
    layout(); publish(); save();
  };
  wc.on('did-navigate', navigated);
  wc.on('did-navigate-in-page', () => {if(tab.panicCover){tab.panicCover=false;wc.setAudioMuted(smoke||Boolean(tab.muted)||tab.volume===0);}navigated();});
  wc.on('dom-ready', () => { if(tab.panicCover){tab.panicCover=false;tab.title=wc.getTitle()||tr("Nuova pagina");wc.setAudioMuted(smoke||Boolean(tab.muted)||tab.volume===0);layout();publish();} tab.scrollbarKey = null; void updateScrollbars(tab); if (tab.volume !== undefined && tab.volume !== 100) void setPageVolume(wc, tab.volume).catch(() => {}); });
  wc.on('did-start-loading', () => { tab.loading = true; publish(); });
  wc.on('did-stop-loading', () => { tab.loading = false; publish(); });
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (code === -3 || !isMainFrame) return;
    tab.error = `${description} (${code})`; tab.url = url; tab.loading = false;tab.panicCover=false; layout(); publish();
  });
  wc.on('render-process-gone', () => { tab.error = tr("La pagina si è arrestata. Premi Ricarica."); layout(); publish(); });
  wc.on('context-menu', (_event, params) => {
    const template = [];
    if (params.mediaType === 'image' && /^(https?:|data:image\/|blob:)/.test(params.srcURL)) {
      tools.selectImage(wc, params.srcURL);
      template.push({ label: tr("Salva immagine come…"), submenu: [['PNG', 'png'], ['JPEG', 'jpeg'], ['WebP', 'webp']].map(([label, format]) => ({ label, click: () => { void tools.operation(() => tools.saveImage(format)); } })) });
    }
    if (isWeb(params.linkURL)) template.push({ label: tr("Apri link in una nuova scheda"), click: () => createTab(params.linkURL, { background: true }) });
    if (params.isEditable) template.push({ role: 'undo',label:tr('Annulla azione') }, { role: 'cut',label:tr('Taglia') }, { role: 'copy',label:tr('Copia') }, { role: 'paste',label:tr('Incolla') });
    else if (params.selectionText) template.push({ role: 'copy',label:tr('Copia') });
    template.push({ label: tr("Ricarica"), click: () => wc.reload() }, { label: tr("Ispeziona elemento"), click: () => wc.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(template).popup({ window: win });
  });
}
function navigate(tab, input) {
  let url = destination(input, settings.searchEngine);
  if (!url && !settings.searchEngine && destination(input, 'google')) {
    pendingSearch = { input }; win.webContents.send('vela:shortcut', 'search'); return;
  }
  if (!url || !tab) return;
  if (url !== HOME) url = secureTarget(url, settings.httpsOnly);
  if (!url) return;
  if (new URL(tab.url).host !== new URL(url).host) { tab.favicon = null; tab.faviconSource = null; }
  tab.error = ''; tab.url = url;
  if (url === HOME) {
    if (tab.view) { win.contentView.removeChildView(tab.view); tab.view.webContents.close(); tab.view = null; }
    tab.title = tr("Pagina iniziale"); tab.loading = false;
  } else {
    ensureView(tab); tab.loading = true;
    if (tab.navigation && tab.navigation.entries[tab.navigation.index]?.url === url) {
      const navigation = tab.navigation; tab.navigation = null;
      tab.view.webContents.navigationHistory.restore(navigation).catch(() => {});
    } else { tab.navigation = null; tab.view.webContents.loadURL(url).catch(() => {}); }
  }
  overlay = false; layout(); publish(); save();
}
function createTab(url = HOME, options = {}) {
  if (tabs.length >= 80) return null;
  const target = destination(url, settings.searchEngine);
  if (!target) return null;
  const tab = { id: nextId++, title: options.title || (target === HOME ? tr("Pagina iniziale") : new URL(target).hostname), url: target, loading: false, error: '', view: null, pinned: Boolean(options.pinned), muted: Boolean(options.muted), space: ['personal', 'work'].includes(options.space) ? options.space : selectedSpace };
  tab.lastActive=Number.isFinite(options.lastActive)&&options.lastActive>0&&options.lastActive<=Date.now()+86400000?options.lastActive:0;
  tab.favicon = typeof options.favicon === 'string' && options.favicon.length < 20000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(options.favicon) ? options.favicon : null;
  tabs.push(tab); tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  if (!options.background || !activeId) { activeId = tab.id; selectedSpace = tab.space;touchTab(tab); }
  if (!options.lazy) navigate(tab, target);
  else { layout(); publish(); save(); }
  return tab;
}
function closeTab(id) {
  thumbnails.delete(id);
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  recentlyClosed.unshift({ url: tab.url, title: tab.title, pinned: tab.pinned, muted: tab.muted, space: tab.space });
  recentlyClosed = recentlyClosed.slice(0, 20);
  if (tab.view) { win.contentView.removeChildView(tab.view); tab.view.webContents.close(); }
  if (!tabs.length) createTab();
  else if (activeId === id) {
    const visible = tabs.filter((item) => item.space === tab.space);
    if (visible.length) select(visible[Math.min(index, visible.length - 1)].id);
    else createTab(HOME, { space: tab.space });
  }
  layout(); publish(); save();
}
function reopen() {
  const tab = recentlyClosed.shift();
  if (tab) createTab(tab.url, tab);
}
function suspendTab(tab) {
  if (!tab?.view || tab.id === activeId || tab.pinned || tab.view.webContents.isCurrentlyAudible()) return false;
  tab.navigation = { entries: tab.view.webContents.navigationHistory.getAllEntries(), index: tab.view.webContents.navigationHistory.getActiveIndex() };
  win.contentView.removeChildView(tab.view); tab.view.webContents.close(); tab.view = null; tab.loading = false;
  publish(); return true;
}
function zoom(direction) {
  const wc = contents(); if (!wc) return;
  wc.setZoomFactor(direction === 0 ? 1 : Math.max(.5, Math.min(2, wc.getZoomFactor() + direction * .1))); publish();
}
function openPrivate(probe) {
  const args = app.isPackaged ? ['--private'] : [app.getAppPath(), '--private'];
  args.push(`--language=${settings.language}`);
  if (settings.searchEngine) args.push(`--search-engine=${settings.searchEngine}`);
  args.push(`--theme=${settings.theme}`);if(settings.backgroundColor)args.push(`--background-color=${settings.backgroundColor}`);
  if(smoke&&typeof probe==='string'&&/^[a-f0-9]{32}$/.test(probe))args.push(`--private-probe=${probe}`);
  const executable=app.isPackaged&&process.env.PORTABLE_EXECUTABLE_FILE?process.env.PORTABLE_EXECUTABLE_FILE:process.execPath;
  const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', (error) => { console.error(tr("Finestra privata:"), error.message); });
  child.unref();
}
function tabMenu(id) {
  const tab = tabs.find((item) => item.id === id); if (!tab) return;
  Menu.buildFromTemplate([
    { label: tab.pinned ? tr("Sblocca scheda") : tr("Fissa scheda"), click: () => { tab.pinned = !tab.pinned; tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned)); publish(); save(); } },
    { label: tr("Duplica scheda"), click: () => createTab(tab.url) },
    { label: tab.muted ? tr("Riattiva audio") : tr("Disattiva audio"), click: () => { tab.muted = !tab.muted; tab.view?.webContents.setAudioMuted(smoke || tab.muted || tab.volume === 0); publish(); save(); } },
    { label: tr("Sospendi scheda (ricarica alla riapertura)"), enabled: tab.id !== activeId && !tab.pinned && !tab.view?.webContents.isCurrentlyAudible(), click: () => suspendTab(tab) },
    { type: 'separator' },
    { label: tr("Chiudi altre schede"), click: () => { select(id); for (const item of [...tabs]) if (item.id !== id && !item.pinned && item.space === tab.space) closeTab(item.id); } },
    { label: tr("Chiudi scheda"), click: () => closeTab(id) },
    { label: tr("Riapri scheda chiusa"), enabled: recentlyClosed.length > 0, click: reopen }
  ]).popup({ window: win });
}
function pin() {
  const tab = active();
  if (!tab || !isWeb(tab.url)) return;
  const index = saved.pins.findIndex((item) => item.url === new URL(tab.url).href);
  if (index >= 0) saved.pins.splice(index, 1);
  else { const item = favorite({ title: tab.title, url: tab.url, favicon:tab.favicon }); if (item && saved.pins.length < 256) saved.pins.push(item); }
  publish(); save();
}

function attachBlocker(engine) {
  blocker = engine;
  const enabled = (details) => {
    const tab = tabs.find((tab) => tab.view?.webContents.id === details.webContentsId);
    return settings.adblockEnabled && (!tab || !isWeb(tab.url) || !disabledSites.has(new URL(tab.url).hostname));
  };
  browserSession.webRequest.onBeforeRequest((details, callback) => {
    if (smoke && details.url.includes('.googlevideo.com/')) {
      const url = new URL(details.url);
      diagnostics.mediaRequests.push({ phase: 'start', time: Date.now(), host: url.hostname, path: url.pathname, source: url.searchParams.get('source'), type: details.resourceType });
    }
    const ads = () => enabled(details) ? blocker.onBeforeRequest(details, callback) : callback({});
    if (privacyForRequest(details) && privacyBlocker) return privacyBlocker.onBeforeRequest(details, result => result.cancel || result.redirectURL ? callback(result) : ads());
    return ads();
  });
  browserSession.webRequest.onHeadersReceived((details, callback) => {
    const finish = (result) => {
      if (privacyForRequest(details) && thirdPartyRequest(details)) {
        const headers = { ...(result.responseHeaders || details.responseHeaders) };
        for (const key of Object.keys(headers)) if (key.toLowerCase() === 'set-cookie') { delete headers[key]; cookiesPrevented++; publish(); }
        return callback({ ...result, responseHeaders: headers });
      }
      callback(result);
    };
    return enabled(details) ? blocker.onHeadersReceived(details, finish) : finish({});
  });
  const prevented = (request) => {
    blocked++;
    if (smoke && request?.url) { const url = new URL(request.url); diagnostics.blockedRequests.push({ time: Date.now(), host: url.hostname, path: url.pathname, type: request.type }); }
    if (request?.tabId) siteBlocked.set(request.tabId, (siteBlocked.get(request.tabId) || 0) + 1); publish();
  };
  blocker.on('request-blocked', prevented);
  blocker.on('request-redirected', prevented);
}
async function refreshFilters() {
  if (filterRefresh) return filterRefresh;
  filterRefresh = Promise.all([updateFilters(), updatePrivacyFilters()]).finally(() => { filterRefresh = null; });
  return filterRefresh;
}
async function updateFilters() {
  const cache = path.join(app.getPath('userData'), 'filters-v3.bin');
  try {
    const signal = AbortSignal.timeout(20000);
    const sources = adsAndTrackingLists.map((url) => url.endsWith('/quick-fixes.txt') ? 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt' : url);
    const engine = await ElectronBlocker.fromLists(async (url, options) => {
      const response = await net.fetch(url, { ...options, signal,credentials:'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    }, sources);
    if (!win || win.isDestroyed()) return;
    attachBlocker(engine); protection = 'ready'; filterUpdated = Date.now(); filterError = '';
    await fs.promises.writeFile(`${cache}.tmp`, engine.serialize());
    await fs.promises.rename(`${cache}.tmp`, cache);
  } catch (error) { filterError = tr("Aggiornamento non riuscito. Restano attivi i filtri disponibili."); console.error(tr("Aggiornamento filtri:"), error.message); }
  publish();
}
function bindPrivacy(engine) {
  privacyBlocker = engine;
  engine.on('request-blocked', request => {
    privacyBlocked++; blocked++;
    if (request?.tabId) siteBlocked.set(request.tabId,(siteBlocked.get(request.tabId)||0)+1);
    publish();
  });
}
async function updatePrivacyFilters() {
  try {
    const engine = await ElectronBlocker.fromLists(async (url, options) => {
      const response = await net.fetch(url,{...options,signal:AbortSignal.timeout(20000),credentials:'omit'}); if(!response.ok)throw Error('Privacy list unavailable'); return response;
    },['https://easylist.to/easylist/easyprivacy.txt']);
    if (!win || win.isDestroyed()) return;
    bindPrivacy(engine); privacyListUpdated=Date.now();
    const file=path.join(app.getPath('userData'),'privacy-v1.bin'); await fs.promises.writeFile(file+'.tmp',engine.serialize()); await fs.promises.rename(file+'.tmp',file); publish();
  } catch { /* Keep cached or offline tracking protection. */ }
}
async function initProtection() {
  const cacheRoot=privateMode?normalProfile:app.getPath('userData');
  const privacyCache=path.join(cacheRoot,'privacy-v1.bin');
  try { bindPrivacy(ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(privacyCache)))); privacyListUpdated=fs.statSync(privacyCache).mtimeMs; }
  catch { bindPrivacy(ElectronBlocker.parse(fs.readFileSync(path.join(__dirname,'..','assets','privacy-trackers.txt'),'utf8'))); }
  const cache = path.join(cacheRoot, 'filters-v3.bin');
  try { attachBlocker(ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(cache)))); protection = 'cached'; filterUpdated = fs.statSync(cache).mtimeMs; }
  catch { attachBlocker(ElectronBlocker.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fallback.txt'), 'utf8'))); protection = 'basic'; }
  publish();
  if (!smoke && !privateProbe) {
    if (!filterUpdated || !privacyListUpdated || Date.now()-Math.min(filterUpdated,privacyListUpdated)>=8*60*60*1000) void refreshFilters();
    setInterval(() => void refreshFilters(), 8 * 60 * 60 * 1000).unref();
  }
}

app.whenReady().then(async () => {
  if (!smoke && !privateMode && !app.requestSingleInstanceLock()) { app.quit(); return; }
  if(!smoke&&!privateMode)void cleanupOrphans(app.getPath('temp')).catch(()=>{});
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  if (!smoke && !privateMode) {
    try {
      const data = JSON.parse(fs.readFileSync(profileFile(), 'utf8'));
      spaces = spacesFromProfile(data.spaces);
      const native=Array.isArray(data.dockOrder?.native)?data.dockOrder.native.filter(id=>nativeDockIds.includes(id)):[];
      dockOrder={native:[...new Set([...native,...nativeDockIds])],external:Array.isArray(data.dockOrder?.external)?[...new Set(data.dockOrder.external.filter(id=>typeof id==='string'&&/^[a-p]{32}$/.test(id)))].slice(0,24):[]};
      saved = { tabs: Array.isArray(data.tabs) ? data.tabs.map((tab) => typeof tab === 'string' ? { url: tab } : tab).filter((tab) => tab && (tab.url === HOME || isWeb(tab.url))).slice(0, 80) : [],
        pins: favoritesFromProfile(data), activeIndex: data.activeIndex };
      history = Array.isArray(data.history) ? data.history.filter((item) => item && isWeb(item.url) && typeof item.title === 'string').slice(0, 300) : [];
      settings = { language:normalizeLanguage(data.settings?.language), httpsOnly: data.settings?.httpsOnly !== false, theme: ['system', 'light', 'dark'].includes(data.settings?.theme) ? data.settings.theme : 'system', backgroundColor: color(data.settings?.backgroundColor), searchEngine: Object.hasOwn(SEARCH_ENGINES, data.settings?.searchEngine || '') ? data.settings.searchEngine : null, adblockEnabled: data.settings?.adblockEnabled !== false };
      extensionPaths = Array.isArray(data.extensionPaths) ? data.extensionPaths.filter((value) => typeof value === 'string' && path.isAbsolute(value)).slice(0, 24) : [];
      managedExtensionIds=Array.isArray(data.managedExtensionIds)?data.managedExtensionIds.filter(id=>typeof id==='string'&&/^[a-p]{32}$/.test(id)).slice(0,24):[];
      panic=panicConfig(data.panic)||{...DEFAULT_PANIC};
      downloads=Array.isArray(data.downloads)?data.downloads.filter(item=>item&&typeof item.name==='string'&&typeof item.path==='string'&&item.path.length<=32768&&path.isAbsolute(item.path)).slice(0,40).map((item,index)=>({id:Number.isFinite(item.id)?item.id:Date.now()+index,name:item.name.slice(0,512),path:item.path,total:Number.isFinite(item.total)?item.total:0,received:Number.isFinite(item.total)?item.total:0,status:'completed',paused:false})):[];
      settings.privacyEnabled = data.settings?.privacyEnabled !== false;
      privacyDisabledSites = new Set(Array.isArray(data.privacyDisabledSites) ? data.privacyDisabledSites.filter(value => typeof value==='string' && /^[\w.-]+$/.test(value)) : []);
      disabledSites = new Set(Array.isArray(data.disabledSites) ? data.disabledSites.filter((host) => typeof host === 'string' && /^[\w.-]+$/.test(host)) : []);
      sidebar = data.sidebarMode === 'pinned';
      selectedSpace = data.selectedSpace === 'work' ? 'work' : 'personal';
    } catch {}
  }
  if (privateMode) {
    const engine = process.argv.find((arg) => arg.startsWith('--search-engine='))?.split('=')[1];
    if (Object.hasOwn(SEARCH_ENGINES, engine || '')) settings.searchEngine = engine;
    const theme=process.argv.find(arg=>arg.startsWith('--theme='))?.split('=')[1];if(['system','light','dark'].includes(theme))settings.theme=theme;
    settings.backgroundColor=color(process.argv.find(arg=>arg.startsWith('--background-color='))?.split('=')[1]);
  }
  const cliLanguage=process.argv.find(value=>/^--language=(it|en)$/.test(value))?.slice(11);
  let installerLanguage;
  if(!smoke&&!privateMode&&!settings.language)for(const file of [path.join(app.getPath('userData'),'installer-language.txt'),path.join(app.getPath('appData'),'Vela','installer-language.txt')]){installerLanguage=readInstallerLanguage(file,fs);if(installerLanguage)break;}
  settings.language=detectLanguage({saved:settings.language,cli:cliLanguage,installer:installerLanguage,systemLocale:app.getLocale(),smoke});
  nativeTheme.themeSource = settings.theme;
  nativeTheme.on('updated', () => { for (const tab of tabs) void updateScrollbars(tab); });
  browserSession = session.fromPartition(smoke ? 'smoke' : privateMode ? 'private' : 'persist:vela');
  favicons=new Favicons((...args)=>browserSession.fetch(...args),nativeImage);
  // Keep the actual Chromium version while omitting shell-specific compatibility tokens.
  browserSession.setUserAgent(browserSession.getUserAgent().replace(/\sElectron\/[\d.]+/g, '').replace(/\svela-browser\/[\d.]+/gi, ''));
  if (smoke && process.argv.includes('--no-block-test')) disabledSites.add('www.youtube.com');
  if (smoke) {
    const mediaResult = (details) => { if (details.url.includes('.googlevideo.com/')) { const url = new URL(details.url); diagnostics.mediaRequests.push({ phase: 'end', time: Date.now(), host: url.hostname, path: url.pathname, status: details.statusCode, error: details.error || null }); } };
    browserSession.webRequest.onErrorOccurred(mediaResult);
  }
  browserSession.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'adblock-preload.cjs') });
  browserSession.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'privacy-preload.cjs') });
  browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (privacyForRequest(details)) {
      for (const key of Object.keys(headers)) if (['sec-gpc','dnt'].includes(key.toLowerCase()) || (key.toLowerCase()==='cookie' && thirdPartyRequest(details))) { if(key.toLowerCase()==='cookie')cookiesPrevented++; delete headers[key]; }
      headers['Sec-GPC']='1'; headers.DNT='1';
    }
    callback({requestHeaders:headers});
  });
  ipcMain.on('vela:privacy-start',(event,url)=>{event.returnValue=privacyFrame(event,url,browserSession,tabs) && privacyForTab(tabs.find(tab=>tab.view?.webContents.id===event.sender.id));});
  ipcMain.on('vela:consent-ready',(event,url)=>{ if(privacyFrame(event,url,browserSession,tabs) && privacyForTab(tabs.find(tab=>tab.view?.webContents.id===event.sender.id))) event.senderFrame.send('vela:consent-program',consentProgram()); });
  ipcMain.on('vela:cookie-rejected',(event,url,count)=>{if(privacyFrame(event,url,browserSession,tabs) && privacyForTab(tabs.find(tab=>tab.view?.webContents.id===event.sender.id)) && Number.isInteger(count) && count>0 && count<=4){cookiesRejected+=count;publish();}});
  // A rejected initial stream can leave YouTube waiting through a long retry backoff.
  // Reinitialize only the stalled player once; preserve the document and all filters.
  browserSession.webRequest.onCompleted((details) => {
    if (smoke && details.url.includes('.googlevideo.com/')) {
      const url = new URL(details.url);
      diagnostics.mediaRequests.push({ phase: 'end', time: Date.now(), host: url.hostname, path: url.pathname, status: details.statusCode, error: details.error || null });
    }
    if (details.statusCode !== 403) return;
    const tab = tabs.find((item) => item.view?.webContents.id === details.webContentsId);
    if (!tab || tab.mediaRecoveryUsed || !isYouTubeStreamRejection(details, tab.url)) return;
    const page = new URL(tab.url), videoId = page.searchParams.get('v');
    if (page.hostname !== 'www.youtube.com' || !/^[\w-]{11}$/.test(videoId || '')) return;
    tab.mediaRecoveryUsed = true;
    const wc = tab.view.webContents;
    setTimeout(() => {
      if (wc.isDestroyed() || wc.getURL() !== tab.url) return;
      wc.executeJavaScript(playerRecoveryScript(videoId)).then((recovered) => { if (smoke && recovered) diagnostics.mediaRecoveries = (diagnostics.mediaRecoveries || 0) + 1; }).catch(() => {});
    }, 200);
  });
  const cosmetics = (event, url, features) => {
    if (!settings.adblockEnabled || !validFrame(event, url, browserSession) || disabledSites.has(new URL(url).hostname)) return { active: false, scripts: [], styles: '' };
    return pageFilters(blocker, url, features);
  };
  ipcMain.on('vela:document-start', (event, url) => {
    try { const { active, scripts, styles } = cosmetics(event, url); event.returnValue = { active, program: scripts.length ? scriptletProgram(scripts) : '', styles }; }
    catch { event.returnValue = { active: false, scripts: [], styles: '' }; }
  });
  ipcMain.handle('vela:cosmetic-styles', (event, url, features) => cosmetics(event, url, features || {}).styles);
  revokePermissions = protectSession(browserSession, () => win, contents, dialog,()=>settings.language);
  browserSession.on('will-download', (_event, item) => {
    download = tr("Download: {v0}",{v0:item.getFilename()}); publish();
    const entry = { id: Date.now() + Math.random(), name: item.getFilename(), received: 0, total: item.getTotalBytes(), status: 'progressing', paused: false, path: '' };
    downloads.unshift(entry); downloads = downloads.slice(0, 40); downloadItems.set(entry.id, item);
    item.on('updated', (_e, status) => { entry.received = item.getReceivedBytes(); entry.total = item.getTotalBytes(); entry.status = status; entry.paused = item.isPaused(); publish(); });
    item.once('done', (_e, result) => {
      entry.status = result; entry.received = item.getReceivedBytes(); entry.path = item.getSavePath(); downloadItems.delete(entry.id);
      download = result === 'completed' ? tr("Scaricato: {v0}",{v0:item.getFilename()}) : tr("Download: {v0}",{v0:tr(result==='cancelled'?'Annullato':result==='interrupted'?'Interrotto':result)}); publish();save();
    });
  });
  win = new BrowserWindow({ width: 1360, height: 900, minWidth: 800, minHeight: 560, frame: false, icon: path.join(__dirname, '..', 'assets', 'vela.png'), backgroundColor: '#ece9e8', show: !smoke,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false, navigateOnDragDrop: false } });
  if (process.platform === 'win32') { try { win.setBackgroundMaterial('mica'); } catch {} }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  wireKeys(win.webContents);
  tools = new NativeTools({ app, dialog, getWindow: () => win, getContents: contents, getSession: () => browserSession, getTab: active,getLanguage:()=>settings.language, notify: publish,fetchImpl:(...args)=>net.fetch(...args), saved: (file) => { download = tr("Salvato: {v0}",{v0:path.basename(file)}); downloads.unshift({ id: Date.now(), name: path.basename(file), received: fs.statSync(file).size, total: fs.statSync(file).size, status: 'completed', paused: false, path: file }); downloads = downloads.slice(0, 40); publish(); save(); } });
  virusTotal=new VirusTotal({app,safeStorage,dialog,getLanguage:()=>settings.language,getWindow:()=>win,notify:publish,privateMode:privateMode||smoke,fetchImpl:(...args)=>net.fetch(...args)});
  extensionShelf = new ExtensionShelf({ BrowserWindow, dialog,getLanguage:()=>settings.language, getWindow: () => win, getSession: () => browserSession, paths: extensionPaths, save, notify: publish, openPopup: showExtensionPopup,storeRoot:path.join(app.getPath('userData'),'extensions'),managedIds:managedExtensionIds,fetchImpl:(...args)=>net.fetch(...args) });
  updates=createUpdates({enabled:updatesEnabled({packaged:app.isPackaged,smoke,privateMode,portable:Boolean(process.env.PORTABLE_EXECUTABLE_FILE)}),load:()=>require('electron-updater').autoUpdater,notify:publish});
  await extensionShelf.restore();
  sidebarSurface = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false, navigateOnDragDrop: false } });
  sidebarSurface.setBackgroundColor('#00000000');
  sidebarSurface.setVisible(false);
  win.contentView.addChildView(sidebarSurface);
  sidebarSurface.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  sidebarSurface.webContents.on('will-navigate', (event) => event.preventDefault());
  wireKeys(sidebarSurface.webContents);
  dockSurface = new WebContentsView({ webPreferences: { preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false,navigateOnDragDrop:false } });
  dockSurface.setBackgroundColor('#00000000'); dockSurface.setVisible(false); win.contentView.addChildView(dockSurface);
  dockSurface.webContents.setWindowOpenHandler(()=>({action:'deny'})); dockSurface.webContents.on('will-navigate',event=>event.preventDefault()); wireKeys(dockSurface.webContents);
  win.on('resize', () => { layout(); publish(); });
  win.on('maximize', publish); win.on('unmaximize', publish);
  if (!smoke || uiReview) {
    let hoverTimer;
    const poll=()=>{
      clearTimeout(hoverTimer);
      if (!win || win.isDestroyed() || win.isMinimized() || sidebar || overlay || !(win.isFocused() || contents()?.isFocused() || sidebarSurface.webContents.isFocused())) {
        edgeSince = null; leaveSince = null; setSidebarPeek(false);hoverTimer=setTimeout(poll,250);hoverTimer.unref();return;
      }
      const cursor = screen.getCursorScreenPoint(), bounds = win.getContentBounds();
      if(cursor.x-bounds.x<96&&cursor.x>=bounds.x&&cursor.y-bounds.y>=64)void loadSurface(sidebarSurface,'sidebar');
      updateSidebarPointer({ x: cursor.x - bounds.x, y: cursor.y - bounds.y });
      hoverTimer=setTimeout(poll,!sidebarPeek&&cursor.x-bounds.x>300?120:32);hoverTimer.unref();
    };
    hoverWake=poll;win.on('focus',poll);win.on('restore',poll);poll();
    win.once('closed',()=>{clearTimeout(hoverTimer);hoverWake=()=>{};});
  }
  win.on('close', () => { clearTimeout(saveTimer); writeProfile(); });
  win.on('closed', () => {
    searchSuggestions.cancel();
    virusTotal.cancel();
    clearTimeout(dockHideTimer); closeExtensionPopup(); if(!dockSurface.webContents.isDestroyed())dockSurface.webContents.close(); dockSurface=null;
    tools.controller?.abort(); extensionShelf.close();
    clearTimeout(sidebarHideTimer);
    if (!sidebarSurface.webContents.isDestroyed()) sidebarSurface.webContents.close();
    sidebarSurface = null;
    for (const tab of tabs) if (tab.view && !tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    win = null;
  });
  ipcMain.handle('vela:command', async (event, command, value) => {
    if (![win?.webContents, sidebarSurface?.webContents, dockSurface?.webContents].includes(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error(tr("Mittente non autorizzato"));
    if (['navigate', 'new', 'select'].includes(command)) await protectionReady;
    try{switch (command) {
      case 'language': {
        if(!SUPPORTED_LANGUAGES.includes(value))throw new Error(tr('Lingua non valida'));
        settings.language=value;save();const snapshot=state();
        for(const wc of [win?.webContents,sidebarSurface?.uiLoading?sidebarSurface.webContents:null,dockSurface?.uiLoading?dockSurface.webContents:null])if(wc&&!wc.isDestroyed())wc.send('vela:state',snapshot);
        break;
      }
      case 'state': return state();
      case 'search-suggestions': return searchSuggestions.get(value,settings.searchEngine,privateMode);
      case 'suggest-cancel': searchSuggestions.cancel();return [];
      case 'dock-prewarm': await loadSurface(dockSurface,'dock');break;
      case 'dock-toggle': await loadSurface(dockSurface,'dock');setDock(!(dockOpen&&dockMode==='extensions'),'extensions'); break;
      case 'downloads-toggle': await loadSurface(dockSurface,'dock');setDock(!(dockOpen&&dockMode==='downloads'),'downloads'); break;
      case 'downloads-clear': downloads=downloads.filter(item=>item.status==='progressing');download='';save();sendState();break;
      case 'dock-order': {
        if(!value||!['native','external'].includes(value.kind)||!Array.isArray(value.ids))break;
        const allowed=value.kind==='native'?nativeDockIds:extensionShelf.snapshot().items.map(item=>item.id);
        if(value.ids.length===allowed.length&&new Set(value.ids).size===allowed.length&&value.ids.every(id=>allowed.includes(id))){dockOrder[value.kind]=[...value.ids];save();sendState();}
        break;
      }
      case 'dock-close': setDock(false); break;
      case 'dock-tool': if(['video','adblock','volume','image','capture','privacy','virustotal','panic'].includes(value)){panicRecording=false;closeExtensionPopup();dockMode='extensions';dockTool=dockTool===value?null:value;dockHeight=dockTool?530:164;dockOpen=true;layoutDock();sendState();} break;
      case 'vt-file': if(typeof value==='string')openVirus(value); break;
      case 'vt-download': {const item=downloads.find(item=>item.id===value&&item.status==='completed');if(item?.path)openVirus(item.path);else virusTotal.update({error:tr("Download non disponibile.")});break;}
      case 'vt-pick': {const result=await appDialog.showOpenDialog(win,{title:tr("Scegli file da analizzare con VirusTotal"),defaultPath:app.getPath('downloads'),properties:['openFile']});if(!result.canceled&&result.filePaths[0])openVirus(result.filePaths[0]);break;}
      case 'vt-paste': {const file=await pastedFile();if(file)openVirus(file);else virusTotal.update({error:tr("Copia un file locale da Esplora file, poi incollalo qui.")});break;}
      case 'vt-key-save': try{await virusTotal.saveKey(value);if(virusTotal.state.hash)void virusTotal.refresh();}catch(error){virusTotal.update({error:error.message});}break;
      case 'vt-key-forget': await virusTotal.forgetKey();break;
      case 'vt-check': void virusTotal.refresh();break;
      case 'vt-upload': void virusTotal.upload();break;
      case 'vt-cancel': virusTotal.cancel();break;
      case 'vt-report': if(/^[a-f0-9]{64}$/.test(virusTotal.state.hash))createTab(`https://www.virustotal.com/gui/file/${virusTotal.state.hash}/detection`);break;
      case 'panic-save': {const config=panicConfig(value);if(!config)throw Error(tr("Scegli una combinazione libera e un indirizzo web valido."));panic=config;panicRecording=false;save();publish();break;}
      case 'panic-record': if(event.sender===dockSurface?.webContents){panicRecording=value===true;publish();}break;
      case 'panic-go': goPanic();break;
      case 'dock-size': if(event.sender===dockSurface?.webContents && Number.isInteger(value) && value>=120 && value<=550 && value!==dockHeight && dockOpen){dockHeight=value;layoutDock();} break;
      case 'privacy-enabled': if(typeof value==='boolean'){settings.privacyEnabled=value;reloadProtection();save();publish();} break;
      case 'privacy-site': if(isWeb(active()?.url)){const host=new URL(active().url).hostname;privacyDisabledSites.has(host)?privacyDisabledSites.delete(host):privacyDisabledSites.add(host);reloadProtection();save();publish();} break;
      case 'show-panel':
        if (['privacy', 'tabs', 'downloads', 'history', 'settings', 'favorites', 'search', 'address', 'extensions'].includes(value)) {
          win.webContents.focus(); win.webContents.send('vela:shortcut', value === 'address' ? 'address' : `panel:${value}`);
        }
        break;
      case 'search-engine':
        if (Object.hasOwn(SEARCH_ENGINES, value || '')) {
          settings.searchEngine = value; save(); publish();
          if (pendingSearch) { const query = pendingSearch; pendingSearch = null; navigate(active(), query.searchOnly ? searchDestination(query.input, value) : query.input); }
        }
        break;
      case 'navigate': if (typeof value === 'string' && value.length < 16000) navigate(active(), value); break;
      case 'native-volume': {
        if (!Number.isInteger(value) || value < 0 || value > 600 || !contents()) break;
        const tab = active(), wc = contents(); tab.volume = value; wc.setAudioMuted(smoke || Boolean(tab.muted) || value === 0);
        tools.update({ volumeUnavailable: Boolean(await setPageVolume(wc, value)) }); publish(); break;
      }
      case 'native-inspect': void tools.operation((signal) => tools.inspect(signal)); break;
      case 'native-video': void tools.operation((signal) => tools.downloadVideo(value, signal)); break;
      case 'native-update': void tools.operation(async (signal) => { await tools.ready(signal, true); tools.update({ message: tr("Componenti aggiornati."), progress: 100 }); }); break;
      case 'native-cancel': tools.controller?.abort(); break;
      case 'native-image': void tools.operation(() => tools.saveImage(value)); break;
      case 'native-capture': if (['png', 'jpeg', 'pdf'].includes(value)) void tools.operation(() => tools.screenshot(value)); break;
      case 'native-show-file': if (tools.state.lastFile && fs.existsSync(tools.state.lastFile)) shell.showItemInFolder(tools.state.lastFile); break;
      case 'extension-add': await extensionShelf.add(); break;
      case 'extension-remove': if (typeof value === 'string') { if(extensionPopupId===value)closeExtensionPopup(); await extensionShelf.remove(value); } break;
      case 'extension-store-install': await extensionShelf.install(value);break;
      case 'extension-store-open': createTab('https://chromewebstore.google.com/');break;
      case 'install-update': updates?.install();break;
      case 'extension-open': if (typeof value === 'string') {if(extensionPopupId===value){closeExtensionPopup();layoutDock();sendState();}else extensionShelf.open(value);} break;
      case 'adblock-enabled':
        if (typeof value === 'boolean') {
          settings.adblockEnabled = value;
          for (const tab of tabs) if (tab.view) tab.protectionDirty = true;
          if (active()?.view) { active().protectionDirty = false; contents().reload(); }
          save(); publish();
        }
        break;
      case 'search':
        if (typeof value === 'string' && value.trim() && value.length < 16000) {
          const target = searchDestination(value, settings.searchEngine);
          if (target) navigate(active(), target);
          else { pendingSearch = { input: value, searchOnly: true }; win.webContents.send('vela:shortcut', 'search'); }
        }
        break;
      case 'new': if (typeof value === 'string') createTab(value); else openNewTab(); break;
      case 'new-target': if (typeof value === 'string' && value.trim() && value.length < 16000) createTab(value); break;
      case 'new-search': if(typeof value==='string'&&value.trim()&&value.length<=160){const url=searchDestination(value,settings.searchEngine);if(url)createTab(url);}break;
      case 'select': select(value); break;
      case 'close': closeTab(value); break;
      case 'reopen': reopen(); break;
      case 'tab-menu': if (Number.isSafeInteger(value)) tabMenu(value); break;
      case 'move-tab': {
        if (!value || !Number.isSafeInteger(value.id) || !Number.isSafeInteger(value.beforeId)) break;
        const from = tabs.findIndex((tab) => tab.id === value.id), before = tabs.find((tab) => tab.id === value.beforeId);
        if (from < 0 || !before || value.id === value.beforeId || tabs[from].pinned !== before.pinned || tabs[from].space !== before.space) break;
        const [moved] = tabs.splice(from, 1); tabs.splice(tabs.indexOf(before), 0, moved); publish(); save(); break;
      }
      case 'duplicate': if (active()) createTab(active().url); break;
      case 'private': openPrivate(); break;
      case 'zoom': if ([-1, 0, 1].includes(value)) zoom(value); break;
      case 'print': contents()?.print({}); break;
      case 'copy-url': if (isWeb(active()?.url)) clipboard.writeText(active().url); break;
      case 'sleep-tabs': {
        const result = await appDialog.showMessageBox(win, { type: 'question', title: tr("Risparmia memoria"),
          message: tr("Sospendere le schede in background? Verranno ricaricate alla selezione. I moduli non salvati possono andare persi. Le schede fissate o con audio restano aperte."),
          buttons: [tr("Annulla"), tr("Sospendi")], defaultId: 0, cancelId: 0 });
        if (result.response === 1) for (const tab of tabs) suspendTab(tab);
        break;
      }
      case 'theme': if (['system', 'light', 'dark'].includes(value)) { settings.theme = value; nativeTheme.themeSource = value; for (const tab of tabs) void updateScrollbars(tab); save(); publish(); } break;
      case 'background-color': {
        const selected = color(value);
        if (value !== null && !selected) throw new Error(tr("Colore non valido"));
        settings.backgroundColor = selected; for (const tab of tabs) void updateScrollbars(tab); save(); publish(); break;
      }
      case 'favorite-save': {
        const item = favorite(value);
        if (!item) throw new Error(tr("Nome o indirizzo non valido"));
        const index = saved.pins.findIndex((pin) => pin.url === value.originalUrl);
        if (saved.pins.some((pin, position) => pin.url === item.url && position !== index)) throw new Error(tr("Indirizzo già presente nei preferiti"));
        if (index >= 0) saved.pins[index] = item;
        else if (saved.pins.length < 256) saved.pins.push(item);
        else throw new Error(tr("Limite preferiti raggiunto"));
        refreshFavoriteIcons();save(); publish(); break;
      }
      case 'favorite-move': {
        if (!value || ![-1, 1].includes(value.direction)) break;
        const index = saved.pins.findIndex((pin) => pin.url === value.url), target = index + value.direction;
        if (index >= 0 && target >= 0 && target < saved.pins.length) { const [item] = saved.pins.splice(index, 1); saved.pins.splice(target, 0, item); save(); publish(); }
        break;
      }
      case 'https-only': if (typeof value === 'boolean') { settings.httpsOnly = value; save(); publish(); } break;
      case 'download-action': {
        if (!value || !['pause', 'resume', 'cancel', 'show'].includes(value.action)) break;
        const item = downloadItems.get(value.id), entry = downloads.find((entry) => entry.id === value.id);
        if (value.action === 'show' && entry?.status === 'completed' && entry.path) shell.showItemInFolder(entry.path);
        else if (item && value.action === 'pause') item.pause();
        else if (item && value.action === 'resume') item.resume();
        else if (item && value.action === 'cancel') item.cancel();
        publish(); break;
      }
      case 'clear-data': {
        const result = await appDialog.showMessageBox(win, { type: 'warning', title: tr("Cancella dati di navigazione"), message: tr("Chiudere le pagine e cancellare cookie, cache e cronologia? Verranno disconnessi gli account sui siti."), buttons: [tr("Annulla"), tr("Cancella dati")], defaultId: 0, cancelId: 0 });
        if (result.response === 1) {
          const previous = [...tabs]; createTab(); for (const tab of previous) closeTab(tab.id);
          recentlyClosed = []; history = []; revokePermissions();
          await browserSession.clearStorageData(); await browserSession.clearCache(); await browserSession.clearAuthCache();
          save(); publish();
        }
        break;
      }
      case 'back': if (contents()?.navigationHistory.canGoBack()) contents().navigationHistory.goBack(); break;
      case 'forward': if (contents()?.navigationHistory.canGoForward()) contents().navigationHistory.goForward(); break;
      case 'reload': if (active()?.error) navigate(active(), active().url); else contents()?.reload(); break;
      case 'stop': contents()?.stop(); break;
      case 'home': navigate(active(), HOME); break;
      case 'sidebar': await loadSurface(sidebarSurface,'sidebar');sidebar = !sidebar; sidebarPeek = false; edgeSince = null; leaveSince = null; layout();hoverWake();publish(); save(); break;
      case 'sidebar-mode': if (['auto', 'pinned'].includes(value)) { if(value==='pinned')await loadSurface(sidebarSurface,'sidebar');sidebar = value === 'pinned'; sidebarPeek = false; edgeSince = null; leaveSince = null; layout();hoverWake();publish(); save(); } break;
      case 'tab-previews': {
        await updatePreview(active());
        return Object.fromEntries(tabs.filter(tab=>tab.thumbnail).map(tab=>[tab.id,`data:image/jpeg;base64,${tab.thumbnail}`]));
      }
      case 'space': {
        if (!['personal', 'work'].includes(value)) break;
        selectedSpace = value;
        const tab = tabs.find((tab) => tab.space === value);
        if (tab) select(tab.id); else createTab();
        break;
      }
      case 'space-edit': {
        if (!Object.hasOwn(spaces, value)) break;
        spaceEditor = value; sendState(); win.webContents.focus(); win.webContents.send('vela:shortcut', 'panel:spaces'); break;
      }
      case 'space-save': {
        const config = spaceConfig(value?.config);
        if (Object.hasOwn(spaces, value?.id || '') && config) { spaces[value.id] = config; save(); publish(); }
        break;
      }
      case 'space-image': {
        if (!Object.hasOwn(spaces, value)) break;
        const selected = await appDialog.showOpenDialog(win, { title: tr("Immagine dello spazio"), properties: ['openFile'], filters: [{ name: tr("Immagini"), extensions: ['png','jpg','jpeg','webp','ico'] }] });
        if (!selected.canceled && selected.filePaths[0]) {
          try {
            const file = selected.filePaths[0]; if (fs.statSync(file).size > 5 * 1024 * 1024) throw Error(tr("Scegli un’immagine fino a 5 MB."));
            const image = nativeImage.createFromPath(file); if (image.isEmpty()) throw Error(tr("Formato immagine non supportato."));
            const {width,height}=image.getSize(),size=Math.min(width,height);
            spaces[value].image = image.crop({x:Math.floor((width-size)/2),y:Math.floor((height-size)/2),width:size,height:size}).resize({width:96,height:96}).toDataURL(); save(); publish();
          } catch (error) { throw Error(error.message); }
        }
        break;
      }
      case 'site-protection': {
        if (!isWeb(active()?.url)) break;
        const host = new URL(active().url).hostname;
        if (disabledSites.has(host)) disabledSites.delete(host); else disabledSites.add(host);
        contents()?.reload(); save(); publish(); break;
      }
      case 'pin-tab': {
        const tab = tabs.find((item) => item.id === value); if (!tab) break;
        tab.pinned = !tab.pinned; tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned)); save(); publish(); break;
      }
      case 'overlay': overlay = value === true; if(overlay && dockOpen)setDock(false); layout();hoverWake();break;
      case 'pin': pin(); break;
      case 'remove-pin': saved.pins = saved.pins.filter((item) => item.url !== value); save(); publish(); break;
      case 'refresh-filters': await refreshFilters(); break;
      case 'find': if (typeof value === 'string' && value) contents()?.findInPage(value); else contents()?.stopFindInPage('clearSelection'); break;
      case 'minimize': win.minimize(); break;
      case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
      case 'quit': win.close(); break;
    }
    return state();}catch(error){error.message=tr(error.message);throw error;}
  });
  protectionReady = initProtection();
  await win.loadFile(path.join(__dirname, 'index.html'));
  await protectionReady;
  if (smoke && process.argv.includes('--online-filters')) await refreshFilters();
  for (const item of saved.tabs.length ? saved.tabs : [{ url: HOME }]) createTab(item.url, { ...item, title: typeof item.title === 'string' ? item.title : undefined, lazy: true, background: true });
  select(tabs[saved.activeIndex]?.id || tabs[0].id);
  refreshFavoriteIcons();
  publish();
  if(privateMode){win.show();if(!privateProbe)win.focus();}
  if(privateProbe){
    const cookieUrl='https://vela-private-probe.invalid';
    const before=await browserSession.cookies.get({url:cookieUrl});
    await browserSession.cookies.set({url:cookieUrl,name:'private_probe',value:privateProbe});
    fs.writeFileSync(path.join(app.getPath('temp'),`Vela-private-probe-${privateProbe}.json`),JSON.stringify({privateMode,language:settings.language,favoriteIconRequests:favicons.cache.size+favicons.pending.size,visible:win.isVisible(),persistent:browserSession.isPersistent(),cookiesBefore:before.length,cookiesAfter:(await browserSession.cookies.get({url:cookieUrl})).length,userData:app.getPath('userData'),history:history.length,profileWritten:fs.existsSync(profileFile()),searchEngine:settings.searchEngine}));
    app.quit();return;
  }
  if (uiReview) {
    win.on('page-title-updated', (event) => { event.preventDefault(); win.setTitle(tr("Vela - Verifica UI")); });
    win.setTitle(tr("Vela - Verifica UI")); win.showInactive();
  } else if (smoke) require(process.argv.includes('--performance-test') ? './performance-smoke.cjs' : process.argv.includes('--youtube-test') ? './youtube-smoke.cjs' : './smoke.cjs')({ win, createTab, select, closeTab, state, blocker, browserSession, layout, app, suspendTab, reopen, diagnostics, updateSidebarPointer, sidebarSurface, dockSurface, shortcut,openPrivate,searchSuggestions });
}).catch((error) => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('quit', () => {
  updates?.close();
  if (!privateData) return;
  const temporaryRoot=app.getPath('temp'),target=privateTarget(privateData,temporaryRoot);
  if(target){
    try{fs.rmSync(target,{recursive:true,force:true});}catch(error){if(process.platform==='win32'&&['EBUSY','EPERM','EACCES','ENOTEMPTY'].includes(error.code))deferredCleanup(target,temporaryRoot);}
  }
});
