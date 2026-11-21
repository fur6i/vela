const {t,localizedDialog}=require('./i18n.js');
const fs = require('node:fs');
const path = require('node:path');
const {extensionId,crxPayload,extractZip,manifestInfo,MAX_CRX}=require('./extension-package.cjs');
class ExtensionShelf {
  constructor({ BrowserWindow, dialog, getWindow, getSession, paths, save, notify, openPopup,storeRoot,managedIds=[],fetchImpl,getLanguage=()=> 'it' }) {
    Object.assign(this, { BrowserWindow, dialog, getWindow, getSession, paths, save, notify, openPopup,storeRoot,managedIds,fetchImpl });
    this.dialog=localizedDialog(dialog,getLanguage);this.getLanguage=getLanguage;this.tr=(key,vars)=>t(this.getLanguage(),key,vars);
    this.error = ''; this.windows = new Set();
    this.installing=false;
  }
  snapshot() {
    return { available: this.getSession()?.isPersistent() || false, error: this.tr(this.error),installing:this.installing,
      items: (this.getSession()?.extensions.getAllExtensions() || []).map((item) => ({ id: item.id, name: item.name, version: item.version, popup: Boolean(item.manifest.action?.default_popup || item.manifest.browser_action?.default_popup) })) };
  }
  async restore() {
    if (!this.getSession().isPersistent()) return;
    for (const directory of this.paths.slice(0, 24)) try { await this.getSession().extensions.loadExtension(directory, { allowFileAccess: false }); } catch { this.error = this.tr("Una delle estensioni salvate non è più disponibile."); }
    this.notify();
  }
  async add() {
    if (!this.getSession().isPersistent()) throw new Error(this.tr("Le estensioni aggiunte sono disponibili nelle finestre normali."));
    const result = await this.dialog.showOpenDialog(this.getWindow(), { title: this.tr("Scegli la cartella dell’estensione estratta"), properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return;
    if (this.paths.length >= 24) throw new Error(this.tr("Limite di estensioni raggiunto."));
    const directory = result.filePaths[0], file = path.join(directory, 'manifest.json');
    if (fs.statSync(file).size > 1024 * 1024) throw new Error(this.tr("Manifest non valido."));
    const manifest = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    const info=manifestInfo(manifest,this.getLanguage()),permissions=info.permissions;
    const approved = await this.dialog.showMessageBox(this.getWindow(), { type: 'question', title: this.tr("Aggiungi estensione"), message: this.tr("Aggiungere {v0}?",{v0:info.name}), detail: this.tr("Autorizzazioni richieste: {v0}\nCompatibilità limitata alle API supportate da Vela/Electron.",{v0:permissions || this.tr("nessuna")}), buttons: [this.tr("Annulla"), this.tr("Aggiungi")], defaultId: 0, cancelId: 0 });
    if (approved.response !== 1) return;
    const extension = await this.getSession().extensions.loadExtension(directory, { allowFileAccess: false });
    if (!this.paths.includes(extension.path)) this.paths.push(extension.path);
    this.error = ''; this.save(); this.notify();
  }
  async install(value){
    if(!this.getSession().isPersistent())throw Error(this.tr("Installazione disponibile nelle finestre normali."));
    const id=extensionId(value);if(!id)throw Error(this.tr("Inserisci un URL del Chrome Web Store o un ID valido."));
    if(this.installing)throw Error(this.tr("Attendi il completamento dell’installazione."));if(this.paths.length>=24)throw Error(this.tr("Limite di estensioni raggiunto."));
    if(this.getSession().extensions.getExtension(id))throw Error(this.tr("Estensione già installata."));
    this.installing=true;this.error='';this.notify();let staging,installed=false;
    try{
      await fs.promises.mkdir(this.storeRoot,{recursive:true});if((await fs.promises.lstat(this.storeRoot)).isSymbolicLink())throw Error(this.tr("Directory estensioni non valida."));
      staging=await fs.promises.mkdtemp(path.join(this.storeRoot,'.staging-'));
      let url=`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${encodeURIComponent(process.versions.chrome)}&acceptformat=crx2,crx3&x=${encodeURIComponent('id='+id+'&uc')}`,response;
      for(let hop=0;hop<6;hop++){
        const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password||target.port||!['google.com','googleusercontent.com','gvt1.com','gvt2.com'].some(host=>target.hostname===host||target.hostname.endsWith('.'+host)))throw Error(this.tr("Redirect Store non consentito."));
        response=await this.fetchImpl(url,{redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(30000)});
        if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error(this.tr("Redirect Store mancante."));url=new URL(location,url).href;continue;}break;
      }
      if(!response?.ok||!response.body)throw Error(this.tr("Pacchetto non disponibile dal Chrome Web Store."));
      const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>MAX_CRX)throw Error(this.tr("Pacchetto superiore a 50 MB."));chunks.push(Buffer.from(chunk));}
      const crx=crxPayload(Buffer.concat(chunks),id,this.getLanguage());await extractZip(crx.zip,staging,this.getLanguage());
      const manifestPath=path.join(staging,'manifest.json'),stat=await fs.promises.stat(manifestPath);if(stat.size>=1024*1024)throw Error(this.tr("Manifest troppo grande."));
      const manifest=JSON.parse(await fs.promises.readFile(manifestPath,'utf8'));let info=manifestInfo(manifest,this.getLanguage());
      if(/^__MSG_[\w@]+__$/.test(info.name)&&/^[\w-]{1,40}$/.test(manifest.default_locale||'')){
        const messagesFile=path.join(staging,'_locales',manifest.default_locale,'messages.json');if((await fs.promises.stat(messagesFile)).size>=1024*1024)throw Error(this.tr("Localizzazione troppo grande."));
        const messages=JSON.parse(await fs.promises.readFile(messagesFile,'utf8')),message=messages[info.name.slice(6,-2)]?.message;if(typeof message==='string')info=manifestInfo({...manifest,name:message},this.getLanguage());
      }
      const approved=await this.dialog.showMessageBox(this.getWindow(),{type:'question',title:this.tr("Installa estensione"),message:this.tr("Installare {v0}?",{v0:info.name}),detail:this.tr("ID: {v0}\nAutorizzazioni richieste: {v1}\nCompatibilità limitata alle API supportate da Electron; alcune estensioni potrebbero non funzionare.",{v0:id,v1:info.permissions||this.tr("nessuna")}),buttons:[this.tr("Annulla"),this.tr("Installa")],defaultId:0,cancelId:0});
      if(approved.response!==1)return;
      manifest.key=crx.key;await fs.promises.writeFile(manifestPath,JSON.stringify(manifest));
      const destination=path.join(this.storeRoot,id);if(fs.existsSync(destination))throw Error(this.tr("Cartella estensione già presente."));
      await fs.promises.rename(staging,destination);staging=null;
      try{const extension=await this.getSession().extensions.loadExtension(destination,{allowFileAccess:false});if(extension.id!==id){this.getSession().extensions.removeExtension(extension.id);throw Error(this.tr("ID caricato non corrispondente."));}this.paths.push(destination);this.managedIds.push(id);installed=true;this.save();}
      finally{if(!installed)await fs.promises.rm(destination,{recursive:true,force:true});}
    }catch(error){error.message=this.tr(error.message);this.error=error.message;throw error;}finally{if(staging&&path.dirname(path.resolve(staging))===path.resolve(this.storeRoot)&&path.basename(staging).startsWith('.staging-'))await fs.promises.rm(staging,{recursive:true,force:true});this.installing=false;this.notify();}
  }
  async remove(id) {
    const extension = this.getSession().extensions.getExtension(id); if (!extension) return;
    this.getSession().extensions.removeExtension(id);
    const index = this.paths.indexOf(extension.path); if (index >= 0) this.paths.splice(index, 1);
    for (const popup of this.windows) if (popup.extensionId === id) popup.close();
    try{if(this.storeRoot&&this.managedIds.includes(id)&&/^[a-p]{32}$/.test(id)&&path.resolve(extension.path)===path.resolve(this.storeRoot,id)){
      const directory=path.resolve(this.storeRoot,id);if(path.dirname(directory)!==path.resolve(this.storeRoot)||(await fs.promises.lstat(this.storeRoot)).isSymbolicLink()||(await fs.promises.lstat(directory)).isSymbolicLink())throw Error(this.tr("Cartella gestita non valida."));await fs.promises.rm(directory,{recursive:true,force:true});this.managedIds.splice(this.managedIds.indexOf(id),1);
    }}finally{this.save();this.notify();}
  }
  open(id) {
    const extension = this.getSession().extensions.getExtension(id);
    if (!extension) return;
    const popup = extension.manifest.action?.default_popup || extension.manifest.browser_action?.default_popup;
    if (!popup) throw new Error(this.tr("Questa estensione lavora sulle pagine e non ha un pannello."));
    const target = new URL(popup, extension.url);
    if (target.protocol !== 'chrome-extension:' || target.hostname !== id) throw new Error(this.tr("Pannello non valido."));
    if (this.openPopup) { this.openPopup(target,extension); return; }
    const window = new this.BrowserWindow({ width: 400, height: 540, parent: this.getWindow(), autoHideMenuBar: true, title: extension.name,
      webPreferences: { session: this.getSession(), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false } });
    window.extensionId = id; this.windows.add(window); window.once('closed', () => this.windows.delete(window));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`chrome-extension://${id}/`)) event.preventDefault(); });
    window.loadURL(target.href).catch(() => window.close());
  }
  close() { for (const window of this.windows) window.close(); }
}
module.exports = { ExtensionShelf };
