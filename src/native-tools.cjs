const {t,localizedDialog}=require('./i18n.js');
const fs = require('node:fs');
const path = require('node:path');
const { mediaUrl, videoArgs, run, ensureVideoTools } = require('./video-tools.cjs');
const {publicAddresses,mediaProxy}=require('./public-media.cjs');

function volumeProgram(percent,language='it') {
  const tr=(key,vars)=>t(language,key,vars);
  if (!Number.isInteger(percent) || percent < 0 || percent > 600) throw new Error(tr("Volume non valido."));
  return `(() => {
    const level = ${percent} / 100;
    let state = globalThis.__velaVolume;
    if (!state) {
      state = globalThis.__velaVolume = { level, nodes: new WeakMap(), context: null, unavailable: 0 };
      state.apply = (element) => {
        if (!(element instanceof HTMLMediaElement)) return;
        const node = state.nodes.get(element);
        if (node) { node.gain.setTargetAtTime(state.level, state.context.currentTime, .025); return; }
        if (state.level <= 1) { element.volume = state.level; return; }
        let eligible = false;
        try { const url = new URL(element.currentSrc || element.src, location.href); eligible = url.protocol === 'blob:' || url.protocol === 'data:' || url.origin === location.origin || Boolean(element.crossOrigin); } catch {}
        if (!eligible) { state.unavailable++; return; }
        try {
          state.context ||= new AudioContext();
          const gain = state.context.createGain(), source = state.context.createMediaElementSource(element);
          element.volume = 1; gain.gain.value = state.level;
          source.connect(gain); gain.connect(state.context.destination); state.nodes.set(element, gain);
          state.context.resume().catch(() => {});
        } catch { state.unavailable++; }
      };
      const applyTree = (root) => { if (root.nodeType !== 1) return; state.apply(root); for (const element of root.querySelectorAll('audio,video')) state.apply(element); };
      new MutationObserver((records) => { for (const record of records) for (const node of record.addedNodes) applyTree(node); }).observe(document, {childList:true, subtree:true});
      document.addEventListener('loadedmetadata', (event) => state.apply(event.target), true);
    }
    state.level = level; state.unavailable = 0;
    for (const element of document.querySelectorAll('audio,video')) state.apply(element);
    if (state.context) state.context.resume().catch(() => {});
    return { unavailable: state.unavailable };
  })()`;
}
async function setPageVolume(wc, percent) {
  const result = await wc.executeJavaScriptInIsolatedWorld(1001, [{ code: volumeProgram(percent) }], true);
  for (const frame of wc.mainFrame.framesInSubtree) {
    if (frame !== wc.mainFrame) try { frame.send('vela:volume', volumeProgram(percent)); } catch {}
  }
  return result?.unavailable || 0;
}
async function captureFullPage(wc, format = 'png',language='it') {
  const tr=(key,vars)=>t(language,key,vars);
  if (!['png', 'jpeg', 'pdf'].includes(format)) throw new Error(tr("Formato non valido."));
  if (wc.debugger.isAttached()) throw new Error(tr("Chiudi gli strumenti di sviluppo prima di catturare la pagina."));
  wc.debugger.attach('1.3');
  try {
    const { cssContentSize: size } = await wc.debugger.sendCommand('Page.getLayoutMetrics');
    const width = Math.ceil(size.width), height = Math.ceil(size.height);
    if (width < 1 || height < 1 || width > 16384 || height > 60000 || width * height > 100000000) throw new Error(tr("Pagina troppo grande per una singola immagine."));
    if (format === 'pdf') return wc.printToPDF({ printBackground: true, pageSize: { width: width / 96, height: Math.min(height, 19000) / 96 }, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    const result = await wc.debugger.sendCommand('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 95 } : {}), captureBeyondViewport: true, fromSurface: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
    return Buffer.from(result.data, 'base64');
  } finally { if (!wc.isDestroyed() && wc.debugger.isAttached()) wc.debugger.detach(); }
}
async function convertImage(wc, source, format,language='it') {
  const tr=(key,vars)=>t(language,key,vars);
  if (!['png', 'jpeg', 'webp'].includes(format) || typeof source !== 'string' || source.length > 40 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp|gif|avif|bmp);base64,/i.test(source)) throw new Error(tr("Immagine o formato non valido."));
  return wc.executeJavaScriptInIsolatedWorld(1002, [{ code: `(async () => {
    const source = ${JSON.stringify(source)}, bytes = Uint8Array.from(atob(source.split(',')[1]), value => value.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], {type:source.slice(5,source.indexOf(';'))}));
    if (!image.width || image.width * image.height > 50000000) { image.close(); throw new Error(${JSON.stringify(tr('Immagine troppo grande'))}); }
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    ${format === 'jpeg' ? "context.fillStyle = '#ffffff'; context.fillRect(0,0,canvas.width,canvas.height);" : ''}
    context.drawImage(image, 0, 0); image.close(); return canvas.toDataURL('image/${format}', .95);
  })()` }]);
}
class NativeTools {
  constructor({ app, dialog, getWindow, getContents, getSession, getTab, notify, saved,fetchImpl=fetch,getLanguage=()=>'it' }) {
    Object.assign(this, { app, dialog, getWindow, getContents, getSession, getTab, notify, saved,fetchImpl });
    this.dialog=localizedDialog(dialog,getLanguage);this.getLanguage=getLanguage;this.tr=(key,vars)=>t(this.getLanguage(),key,vars);
    this.root = path.join(app.getPath('userData'), 'video-tools');
    this.state = { busy: false, message: '', error: '', progress: 0, video: null, lastFile: '', selectedImage: false, volumeUnavailable: false };
  }
  snapshot() { return { ...this.state,message:this.tr(this.state.message),error:this.tr(this.state.error), video: this.video?.url === mediaUrl(this.getTab()?.url || '') ? this.video : null, selectedImage: Boolean(this.image && !this.image.wc.isDestroyed()), toolsReady: ['yt-dlp.exe', 'ffmpeg.exe', 'ffprobe.exe', 'deno.exe'].every((name) => fs.existsSync(path.join(this.root, name))), canDownloadVideo: Boolean(mediaUrl(this.getTab()?.url || '')), volume: this.getTab()?.volume ?? 100 }; }
  update(values) { Object.assign(this.state, {...values,...(values.message!==undefined?{message:this.tr(values.message)}:{}),...(values.error!==undefined?{error:this.tr(values.error)}:{})}); this.notify(); }
  async operation(task) {
    if (this.state.busy) return;
    this.controller = new AbortController();
    this.update({ busy: true, error: '', progress: 0 });
    try { return await task(this.controller.signal); }
    catch (error) { this.update({ error: this.controller.signal.aborted ? this.tr("Operazione annullata.") : error.message, message: '' }); }
    finally { this.update({ busy: false }); this.controller = null; }
  }
  async ready(signal, update = false) {
    await ensureVideoTools(this.root, (message, progress) => this.update({ message, progress }), signal, update,this.fetchImpl,this.getLanguage);
  }
  async runMedia(url,args,options){
    await publicAddresses(new URL(url).hostname.replace(/^\[|\]$/g,''),undefined,this.getLanguage);const proxy=await mediaProxy(options.signal);
    try{return await run(path.join(this.root,'yt-dlp.exe'),['--proxy',proxy.url,...args],{...options,language:this.getLanguage(),env:{...process.env,HTTP_PROXY:proxy.url,HTTPS_PROXY:proxy.url,ALL_PROXY:proxy.url,NO_PROXY:'',http_proxy:proxy.url,https_proxy:proxy.url,all_proxy:proxy.url,no_proxy:''}});}finally{proxy.close();}
  }
  async inspect(signal) {
    const url = mediaUrl(this.getTab()?.url || '');
    if (!url) throw new Error(this.tr("Apri un URL HTTPS pubblico supportato da yt-dlp."));
    await this.ready(signal); this.update({ message: this.tr("Lettura dei formati disponibili…"), progress: 0 });
    const raw = await this.runMedia(url,videoArgs(this.root, url, 'mp4',undefined,this.getLanguage()), { signal });
    const info = JSON.parse(raw);
    if (info.is_live || info.live_status === 'is_live') throw new Error(this.tr("Il download delle dirette in corso non è supportato."));
    const formats = (info.formats || []).filter((item) => !item.has_drm && item.vcodec && item.vcodec !== 'none');
    if (!formats.length) throw new Error(this.tr("Non sono disponibili formati video pubblici."));
    this.video = { url, title: String(info.title || this.tr("Video")), height: Math.max(...formats.map((item) => item.height || 0)) };
    this.update({ video: this.video, message: this.tr("Formati pronti."), progress: 0 });
  }
  async downloadVideo(format, signal) {
    if (!['mp4', 'mkv', 'mp3', 'm4a'].includes(format)) throw new Error(this.tr("Formato non valido."));
    if (!this.video || this.video.url !== mediaUrl(this.getTab()?.url || '')) await this.inspect(signal);
    const video = this.video;
    const result = await this.dialog.showSaveDialog(this.getWindow(), { title: this.tr("Salva video"), defaultPath: path.join(this.app.getPath('downloads'), cleanName(video.title) + '.' + format), filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (result.canceled || !result.filePath) return;
    if (signal.aborted) return;
    if (path.extname(result.filePath).toLowerCase() !== '.' + format) throw new Error(this.tr("Usa l’estensione .{v0} per questo formato.",{v0:format}));
    const parent = path.dirname(result.filePath), staging = await fs.promises.mkdtemp(path.join(parent, '.vela-video-'));
    const output = path.join(staging, 'video').replace(/%/g, '%%') + '.%(ext)s';
    this.update({ message: this.tr("Download alla massima qualità disponibile…"), progress: 0 });
    try {
    await this.runMedia(video.url, videoArgs(this.root, video.url, format, output,this.getLanguage()), { signal, onLine: (line) => {
      const progress = /vela:\s*([\d.]+)%/.exec(line);
      if (progress) this.update({ progress: Number(progress[1]), message: Number(progress[1]) >= 100 ? this.tr("Unione e conversione…") : this.tr("Download in corso…") });
    } });
    const file = path.join(staging, `video.${format}`);
    if (!fs.existsSync(file)) throw new Error(this.tr("Il convertitore non ha prodotto il formato richiesto."));
    if (signal.aborted) throw new Error(this.tr("Operazione annullata."));
    await fs.promises.rename(file, result.filePath); this.complete(result.filePath);
    } finally {
      if (path.dirname(path.resolve(staging)) === path.resolve(parent) && path.basename(staging).startsWith('.vela-video-')) await fs.promises.rm(staging, { recursive: true, force: true });
    }
  }
  complete(file) { this.update({ lastFile: file, progress: 100, message: this.tr("File salvato.") }); this.saved(file); }
  selectImage(wc, source) { this.image = { wc, source }; this.update({ selectedImage: true }); }
  async saveImage(format) {
    const image = this.image;
    if (!image || image.wc.isDestroyed()) throw new Error(this.tr("Tasto destro su un’immagine → Salva immagine come."));
    let source = image.source;
    if (/^https?:/.test(source)) {
      const response = await this.getSession().fetch(source, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '')) throw new Error(this.tr("Impossibile leggere questa immagine."));
      const reader = response.body.getReader(); const chunks = []; let length = 0;
      try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 25 * 1024 * 1024) throw new Error(this.tr("Immagine troppo grande.")); chunks.push(Buffer.from(value)); } }
      finally { await reader.cancel(); }
      source = `data:${response.headers.get('content-type').split(';')[0]};base64,${Buffer.concat(chunks).toString('base64')}`;
    } else if (source.startsWith('blob:')) {
      let found;
      for (const frame of image.wc.mainFrame.framesInSubtree) {
        try { found = await frame.executeJavaScript(`(async()=>{const i=[...document.images].find(i=>i.currentSrc===${JSON.stringify(source)});if(!i)return null;await i.decode();if(i.naturalWidth*i.naturalHeight>50000000)throw Error();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext('2d').drawImage(i,0,0);return c.toDataURL('image/png')})()`); if (found) break; } catch {}
      }
      source = found;
    }
    const converted = await convertImage(image.wc, source, format,this.getLanguage());
    if (!converted.startsWith(`data:image/${format};base64,`)) throw new Error(this.tr("Formato immagine non supportato."));
    const extension = format === 'jpeg' ? 'jpg' : format;
    const result = await this.dialog.showSaveDialog(this.getWindow(), { title: this.tr("Salva immagine"), defaultPath: path.join(this.app.getPath('downloads'), this.tr("Immagine.{v0}",{v0:extension})), filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    if (!result.canceled && result.filePath) { await fs.promises.writeFile(result.filePath, Buffer.from(converted.split(',')[1], 'base64')); this.complete(result.filePath); }
  }
  async screenshot(format) {
    const wc = this.getContents();
    if (!wc || !/^https?:/.test(wc.getURL())) throw new Error(this.tr("Apri una pagina web per catturarla."));
    const extension = format === 'jpeg' ? 'jpg' : format;
    const result = await this.dialog.showSaveDialog(this.getWindow(), { title: this.tr("Salva pagina intera"), defaultPath: path.join(this.app.getPath('downloads'), cleanName(wc.getTitle()) + '.' + extension), filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    if (result.canceled || !result.filePath) return;
    this.update({ message: this.tr("Cattura della pagina intera…") });
    const data = await captureFullPage(wc, format,this.getLanguage());
    await fs.promises.writeFile(result.filePath, data); this.complete(result.filePath);
  }
}
function cleanName(value) { return String(value || 'Vela').replace(/[<>:"/\\|?*\x00-\x1f%]/g, '_').replace(/[. ]+$/, '').slice(0, 120) || 'Vela'; }
module.exports = { NativeTools, volumeProgram, setPageVolume, captureFullPage, convertImage, cleanName };
