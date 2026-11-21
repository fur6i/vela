const {t}=require('./i18n.js');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable, Transform } = require('node:stream');
const {mediaUrl}=require('./public-media.cjs');

function videoArgs(root, url, format, output,language='it') {
  const tr=(key,vars)=>t(language,key,vars);
  if (!mediaUrl(url) || !['mp4', 'mkv', 'mp3', 'm4a'].includes(format)) throw new Error(tr("URL pubblico HTTPS o formato non valido."));
  const common = ['--ignore-config', '--no-plugin-dirs', '--no-playlist', '--no-cache-dir', '--no-warnings', '--no-color', '--newline', '--no-overwrites', '--socket-timeout', '25', '--ffmpeg-location', root, '--js-runtimes', `deno:${path.join(root, 'deno.exe')}`];
  return [...common, ...(output ? ['-o', output, '--progress', '--progress-template', 'download:vela:%(progress._percent_str)s', ...(format === 'mp3' || format === 'm4a' ? ['-f', 'bestaudio/best', '-x', '--audio-format', format, '--audio-quality', '0'] : ['-f', 'bestvideo*+bestaudio/best', '--merge-output-format', format, '--remux-video', format])] : ['--dump-single-json', '--skip-download']), '--', mediaUrl(url)];
}
function run(executable, args, { signal, onLine, maxOutput = 8 * 1024 * 1024, env,language='it' } = {}) {
  const tr=(key,vars)=>t(language,key,vars);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error(tr("Operazione annullata.")));
    const child = spawn(executable, args, { windowsHide: true, shell: false, env: env || process.env });
    const killTree = () => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
        killer.on('error', () => {});
      } else child.kill();
    };
    signal?.addEventListener('abort', killTree, { once: true });
    let output = '', errors = '', pending = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString(); if (output.length > maxOutput) { child.kill(); reject(new Error(tr("Risposta troppo grande."))); return; }
      pending += chunk.toString(); const lines = pending.split(/\r?\n/); pending = lines.pop(); for (const line of lines) onLine?.(line);
    });
    child.stderr.on('data', (chunk) => { errors = (errors + chunk.toString()).slice(-5000); });
    child.once('error', reject);
    child.once('close', (code) => { signal?.removeEventListener('abort', killTree); code === 0 ? resolve(output) : reject(new Error(signal?.aborted ? tr("Operazione annullata.") : errors.trim().slice(-1200) || tr("Operazione non riuscita ({v0}).",{v0:code}))); });
  });
}
async function ensureVideoTools(root, notify = () => {}, signal, update = false,fetchImpl=fetch,getLanguage=()=> 'it') {
  const tr=(key,vars)=>t(getLanguage(),key,vars);
  const names = ['yt-dlp.exe', 'ffmpeg.exe', 'ffprobe.exe', 'deno.exe'];
  if (!update && names.every((name) => fs.existsSync(path.join(root, name)))) return root;
  await fs.promises.mkdir(root, { recursive: true });
  const staging = await fs.promises.mkdtemp(path.join(root, '.prepare-'));
  const sources = [
    ['yt-dlp/yt-dlp', 'yt-dlp.exe', 'SHA2-256SUMS'],
    ['yt-dlp/FFmpeg-Builds', 'ffmpeg-master-latest-win64-gpl.zip', 'checksums.sha256'],
    ['denoland/deno', 'deno-x86_64-pc-windows-msvc.zip', 'deno-x86_64-pc-windows-msvc.zip.sha256sum']
  ];
  const versions = {};
  try {
  for (const [repo, assetName, checksumName] of sources) {
    notify(tr("Preparazione {v0}…",{v0:repo.split('/')[1]}), 0);
    const headers = { 'User-Agent': 'Vela-browser', Accept: 'application/vnd.github+json' };
    const releaseResponse = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, { headers, signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(30000)]),credentials:'omit' });
    if (!releaseResponse.ok) throw new Error(tr("Componenti non disponibili: HTTP {v0}.",{v0:releaseResponse.status}));
    const release = await releaseResponse.json();
    const asset = release.assets.find((item) => item.name === assetName), checksum = release.assets.find((item) => item.name === checksumName);
    if (!asset || !checksum) throw new Error(tr("Pacchetto ufficiale o checksum non disponibile."));
    for (const item of [asset, checksum]) if (!item.browser_download_url.startsWith(`https://github.com/${repo}/releases/download/`)) throw new Error(tr("Origine dei componenti non valida."));
    const sumResponse = await fetchImpl(checksum.browser_download_url, { signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(30000)]),credentials:'omit' });
    if (!sumResponse.ok) throw new Error(tr("Checksum non disponibile."));
    const sums = await sumResponse.text();
    const expected = (sums.split(/\r?\n/).find((line) => line.includes(assetName))?.match(/^[a-f\d]{64}/i)?.[0] || (repo === 'denoland/deno' && sums.includes(assetName) ? /Hash\s*:\s*([a-f\d]{64})/i.exec(sums)?.[1] : null))?.toLowerCase();
    if (!expected) throw new Error(tr("Checksum ufficiale non riconosciuto."));
    const response = await fetchImpl(asset.browser_download_url, { signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(300000)]),credentials:'omit' });
    if (!response.ok || !response.body) throw new Error(tr("Download dei componenti non riuscito."));
    let received = 0, lastUpdate = 0; const hash = crypto.createHash('sha256');
    const meter = new Transform({ transform(chunk, _encoding, done) {
      received += chunk.length; hash.update(chunk);
      if (received > 350 * 1024 * 1024) return done(new Error(tr("Pacchetto troppo grande.")));
      if (Date.now() - lastUpdate > 400) { lastUpdate = Date.now(); notify(tr("Preparazione {v0}…",{v0:repo.split('/')[1]}), Math.min(100, Math.round(received / asset.size * 100))); }
      done(null, chunk);
    } });
    const target = path.join(staging, assetName);
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(target), { signal });
    if (hash.digest('hex') !== expected) throw new Error(tr("Verifica del componente fallita. Il file non verrà eseguito."));
    versions[repo] = release.tag_name;
    if (assetName.endsWith('.zip')) {
      // Extract only the known executables, never archive-provided paths.
      const script = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead($env:VELA_ARCHIVE); try { foreach($n in $env:VELA_NAMES.Split(',')) { $e=@($z.Entries | Where-Object { $_.Name -ceq $n }); if($e.Count -ne 1){throw 'Invalid archive'}; $s=$e[0].Open(); $d=[IO.File]::Create([IO.Path]::Combine($env:VELA_STAGING,$n)); try{$s.CopyTo($d)}finally{$s.Dispose();$d.Dispose()} } }finally{$z.Dispose()}`;
      await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { signal, env: { ...process.env, VELA_ARCHIVE: target, VELA_STAGING: staging, VELA_NAMES: repo.startsWith('denoland') ? 'deno.exe' : 'ffmpeg.exe,ffprobe.exe' } });
    }
  }
  for (const name of names) await fs.promises.rename(path.join(staging, name), path.join(root, name));
  await fs.promises.writeFile(path.join(root, 'versions.json'), JSON.stringify(versions, null, 2));
  return root;
  } finally {
    if (path.dirname(path.resolve(staging)) === path.resolve(root) && path.basename(staging).startsWith('.prepare-')) await fs.promises.rm(staging, { recursive: true, force: true });
  }
}
module.exports = { mediaUrl, videoArgs, run, ensureVideoTools };
