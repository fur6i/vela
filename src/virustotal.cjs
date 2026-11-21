const {t,localizedDialog}=require('./i18n.js');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const BASE = 'https://www.virustotal.com/api/v3';
const MAX_FILE = 650 * 1024 * 1024;
function localClipboardPath(value) {
  if (typeof value !== 'string' || value.length > 32768) return null;
  for (let line of value.split(/\r?\n|\0/)) {
    line = line.trim().replace(/^"|"$/g, ''); if (!line || line.startsWith('#')) continue;
    try { if (line.startsWith('file:')) { const url = new URL(line); if(url.hostname && url.hostname !== 'localhost')continue; line = fileURLToPath(url); } } catch { continue; }
    if (path.isAbsolute(line) && !line.startsWith('\\\\') && !line.includes('\0')) return line;
  }
  return null;
}
async function hashFile(file, signal) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { signal })) hash.update(chunk);
  return hash.digest('hex');
}
function summarize(attributes) {
  const raw = attributes.last_analysis_stats || attributes.stats || {};
  const stats = Object.fromEntries(['malicious','suspicious','harmless','undetected','failure','timeout','type-unsupported','confirmed-timeout'].map(key => [key, Number.isSafeInteger(raw[key]) && raw[key] >= 0 ? raw[key] : 0]));
  const engines = Object.entries(attributes.last_analysis_results || attributes.results || {}).filter(([, item]) => ['malicious','suspicious'].includes(item.category)).slice(0, 80).map(([name, item]) => ({ name: String(item.engine_name || name).slice(0, 80), result: String(item.result || item.category).slice(0, 160) }));
  return { stats, total: Object.values(stats).reduce((sum, value) => sum + value, 0), engines, date: attributes.last_analysis_date || attributes.date || null };
}
class VirusTotal {
  constructor({ app, safeStorage, dialog, getWindow, notify, privateMode = false, fetchImpl = fetch, wait = (ms, signal) => delay(ms, undefined, { signal }),getLanguage=()=> 'it' }) {
    Object.assign(this, { app, safeStorage, dialog, getWindow, notify, privateMode, fetchImpl, wait });
    this.dialog=localizedDialog(dialog,getLanguage);this.getLanguage=getLanguage;this.tr=(key,vars)=>t(this.getLanguage(),key,vars);
    this.key = ''; this.generation = 0;
    this.state = { busy: false, name: '', size: 0, hash: '', status: 'empty', message: '', error: '', report: null, analysisId: null, keyStored: false };
    if (!privateMode && safeStorage?.isEncryptionAvailable()) try {
      const file = this.keyFile(); if (fs.statSync(file).size <= 16384) { this.key = safeStorage.decryptString(fs.readFileSync(file)); this.state.keyStored = true; }
    } catch {}
  }
  keyFile() { return path.join(this.app.getPath('userData'), 'virustotal-key.bin'); }
  snapshot() { return { ...this.state,message:this.tr(this.state.message),error:this.tr(this.state.error), keyConfigured: Boolean(this.key) }; }
  update(values, generation = this.generation) { if (generation === this.generation) { Object.assign(this.state, {...values,...(values.message!==undefined?{message:this.tr(values.message)}:{}),...(values.error!==undefined?{error:this.tr(values.error)}:{})}); this.notify(); } }
  assertCurrent(generation) { if (generation !== this.generation || this.controller?.signal.aborted) throw new Error(this.tr("Operazione annullata.")); }
  async saveKey(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(value.trim())) throw new Error(this.tr("Chiave API non valida."));
    this.cancel(); this.key = value.trim(); let stored = false;
    if (!this.privateMode && this.safeStorage?.isEncryptionAvailable()) {
      const file = this.keyFile(); await fs.promises.writeFile(file + '.tmp', this.safeStorage.encryptString(this.key)); await fs.promises.rename(file + '.tmp', file); stored = true;
    }
    this.update({ keyStored: stored, error: '', message: stored ? this.tr("Chiave salvata e cifrata sul dispositivo.") : this.tr("Chiave disponibile solo per questa sessione.") });
  }
  async forgetKey() { this.cancel(); this.key = ''; if (!this.privateMode) await fs.promises.rm(this.keyFile(), { force: true }); this.update({ keyStored: false, message: this.tr("Chiave rimossa.") }); }
  cancel() { const busy=this.state.busy;this.controller?.abort(); this.generation++; this.update({ busy: false,...(busy?{message:this.tr("Operazione annullata."),status:this.state.analysisId?'queued':this.state.hash?'selected':'empty'}:{}) }); }
  async task(work) {
    this.controller?.abort(); const generation = ++this.generation, controller = this.controller = new AbortController();
    this.update({ busy: true, error: '' }, generation);
    try { await work(generation, controller.signal); }
    catch (error) { this.update({ error: controller.signal.aborted ? this.tr("Operazione annullata.") : error.message, message: '' }, generation); }
    finally { this.update({ busy: false }, generation); }
  }
  async api(endpoint, options, signal) {
    if (!this.key) throw new Error(this.tr("Configura la tua chiave API VirusTotal nel pannello."));
    const target = new URL(endpoint.startsWith('https:') ? endpoint : BASE + endpoint);
    if (target.protocol !== 'https:' || !['virustotal.com','www.virustotal.com'].includes(target.hostname) || target.username || target.password) throw new Error(this.tr("Destinazione VirusTotal non valida."));
    let response;
    try { response = await this.fetchImpl(target.href, { ...options, redirect: 'error', headers: { 'x-apikey': this.key, ...(options?.headers || {}) }, signal: AbortSignal.any([signal, AbortSignal.timeout(options?.method === 'POST' ? 300000 : 30000)]) }); }
    catch (error) { if (signal.aborted) throw error; throw new Error(this.tr("VirusTotal non è raggiungibile. Controlla la connessione.")); }
    if (response.status === 404) return null;
    if (response.status === 401 || response.status === 403) throw new Error(this.tr("Chiave API non valida o non autorizzata."));
    if (response.status === 429) throw new Error(this.tr("Limite API VirusTotal raggiunto. Attendi e riprova."));
    if (!response.ok) throw new Error(this.tr("VirusTotal ha risposto con errore {v0}.",{v0:response.status}));
    return response.json();
  }
  async select(file) {
    return this.task(async (generation, signal) => {
      this.file=null;this.update({name:'',size:0,hash:'',report:null,analysisId:null,status:'empty'},generation);
      if (typeof file !== 'string' || file.length > 32768 || !path.isAbsolute(file) || file.startsWith('\\\\')) throw new Error(this.tr("Scegli un file locale."));
      const info = await fs.promises.stat(file).catch(() => null);
      if (!info?.isFile()) throw new Error(this.tr("File non disponibile: potrebbe essere stato spostato o eliminato."));
      if (!info.size || info.size > MAX_FILE) throw new Error(this.tr("Scegli un file non vuoto, fino a 650 MB."));
      this.assertCurrent(generation); this.file = { path: file, size: info.size, mtimeMs: info.mtimeMs };
      this.update({ name: path.basename(file), size: info.size, hash: '', report: null, analysisId: null, status: 'hashing', message: this.tr("Calcolo SHA-256 sul dispositivo…") }, generation);
      const hash = await hashFile(file, signal); this.assertCurrent(generation);
      this.update({ hash, status: 'selected', message: this.tr("Impronta calcolata. Il file non è stato caricato.") }, generation);
      if (this.key) await this.lookup(generation, signal);
    });
  }
  async lookup(generation, signal) {
    if (!this.state.hash) throw new Error(this.tr("Seleziona prima un file."));
    this.update({ message: this.tr("Ricerca del report tramite SHA-256…") }, generation);
    const result = await this.api('/files/' + this.state.hash, {}, signal); this.assertCurrent(generation);
    this.update(result?.data?.attributes ? { report: summarize(result.data.attributes), status: 'report', message: this.tr("Report trovato: nessun nuovo caricamento del file.") } : { report: null, status: 'unknown', message: this.tr("File non presente nel database. Puoi inviarlo per una nuova analisi.") }, generation);
  }
  async refresh() {
    return this.task(async (generation, signal) => {
      if(this.file){
        const info=await fs.promises.stat(this.file.path).catch(()=>null);
        if(!info?.isFile()||!info.size||info.size>MAX_FILE)throw new Error(this.tr("Il file non è più disponibile o supera il limite. Selezionalo di nuovo."));
        const hash=await hashFile(this.file.path,signal);this.assertCurrent(generation);
        this.file={...this.file,size:info.size,mtimeMs:info.mtimeMs};
        if(hash!==this.state.hash)this.update({hash,size:info.size,report:null,analysisId:null,status:'selected'},generation);
      }
      if (this.state.analysisId) await this.poll(generation, signal, false); else await this.lookup(generation, signal);
    });
  }
  async upload() {
    return this.task(async (generation, signal) => {
      if (!this.file || !this.state.hash) throw new Error(this.tr("Seleziona prima un file."));
      if (!this.key) throw new Error(this.tr("Configura prima la chiave API VirusTotal."));
      const selected = { ...this.file }, hash = this.state.hash;
      const approval = await this.dialog.showMessageBox(this.getWindow(), { type: 'warning', title: this.tr("Invia file a VirusTotal"), message: this.tr("Inviare “{v0}” a VirusTotal?",{v0:path.basename(selected.path)}), detail: this.tr("Verrà inviato il contenuto del file. VirusTotal può condividerlo con la comunità e i partner. Non inviare file riservati o contenenti dati personali."), buttons: [this.tr("Annulla"), this.tr("Invia e analizza")], defaultId: 0, cancelId: 0 });
      this.assertCurrent(generation); if (approval.response !== 1) return;
      if (await hashFile(selected.path, signal) !== hash) throw new Error(this.tr("Il file è cambiato. Selezionalo di nuovo prima dell’invio."));
      this.assertCurrent(generation); this.update({ message: this.tr("Caricamento su VirusTotal…"), status: 'uploading' }, generation);
      let endpoint = '/files';
      if (selected.size > 32 * 1024 * 1024) { const result = await this.api('/files/upload_url', {}, signal); endpoint = result?.data; if (typeof endpoint !== 'string') throw new Error(this.tr("URL di caricamento non disponibile.")); }
      const form = new FormData(); form.set('file', await fs.openAsBlob(selected.path, { type: 'application/octet-stream' }), path.basename(selected.path));
      const result = await this.api(endpoint, { method: 'POST', body: form }, signal); this.assertCurrent(generation);
      const id = result?.data?.id; if (typeof id !== 'string' || id.length > 512) throw new Error(this.tr("Identificativo analisi non valido."));
      this.update({ analysisId: id, status: 'queued', message: this.tr("Analisi inviata. Attendo i risultati…") }, generation);
      await this.poll(generation, signal, true);
    });
  }
  async poll(generation, signal, automatic) {
    for (let attempt = 0; attempt < (automatic ? 15 : 1); attempt++) {
      if (automatic) await this.wait(20000,signal); this.assertCurrent(generation);
      const result = await this.api('/analyses/' + encodeURIComponent(this.state.analysisId), {}, signal); this.assertCurrent(generation);
      const attributes = result?.data?.attributes;
      if (!attributes) throw new Error(this.tr("Analisi non disponibile."));
      const done = attributes.status === 'completed';
      this.update({ status: done ? 'report' : 'queued', report: summarize(attributes), message: done ? this.tr("Analisi completata.") : this.tr("Analisi ancora in corso. Puoi aggiornare il risultato.") }, generation);
      if (done) return;
    }
  }
}
module.exports = { VirusTotal, hashFile, summarize, localClipboardPath, MAX_FILE };
