const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({ win, createTab, closeTab, state, app, diagnostics }) => {
  const results = [], failures = [];
  const output = (file) => app.isPackaged ? path.join(app.getPath('temp'), `Vela-${file}`) : path.join(__dirname, '..', file);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const timeout = setTimeout(() => { console.error('YouTube verification timeout'); app.exit(1); }, 180000);
  win.showInactive();
  try {
    const requestedId = process.argv.find((arg) => arg.startsWith('--youtube-id='))?.split('=')[1];
    const ids = requestedId && /^[\w-]{11}$/.test(requestedId) ? [requestedId] : ['jNQXAC9IVRw', 'aqz-KE-bpKQ', 'vDmjw-c_R2k'];
    for (const id of ids) {
      const tab = createTab(`https://www.youtube.com/watch?v=${id}`);
      const wc = tab.view.webContents;
      wc.setAudioMuted(true);
      if (!wc.isAudioMuted()) throw new Error('Video tests must stay muted');
      const errors = [];
      const timeline = [];
      let videoNavigations = 0;
      const recoveriesBefore = diagnostics.mediaRecoveries || 0;
      wc.on('did-navigate', (_event, url) => { try { if (new URL(url).searchParams.get('v') === id) videoNavigations++; } catch {} });
      wc.on('console-message', (event) => { if (event.message?.includes('Vela document-start')) errors.push(event.message); });
      let initialTime = null, progressing = false, adSeen = false, sample = {}, consentRejected = false;
      const started = Date.now();
      for (let step = 0; step < 55; step++) {
        await wait(1000);
        if (wc.isDestroyed()) throw new Error('Video tab destroyed');
        try {
          sample = await wc.executeJavaScript(`(() => {
            const reject = [...document.querySelectorAll('button')].find(button => {
              const rect = button.getBoundingClientRect();
              return button.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && /^(Reject all|Rifiuta tutto)$/i.test(button.innerText.trim());
            });
            if (reject) { reject.click(); return { consentRejected: true, url: location.href }; }
            const v = document.querySelector('video');
            const ad = Boolean(document.querySelector('.html5-video-player.ad-showing,.html5-video-player.ad-interrupting'));
            return { url: location.href, title: document.title, ad, time: v?.currentTime || 0, ready: v?.readyState || 0,
              paused: v?.paused, width: v?.videoWidth || 0, frames: v?.getVideoPlaybackQuality?.().totalVideoFrames || 0,
              mediaError: v?.error?.code || null, playability: window.ytInitialPlayerResponse?.playabilityStatus?.status,
              reason: window.ytInitialPlayerResponse?.playabilityStatus?.reason || null };
          })()`);
        } catch { continue; }
        consentRejected ||= Boolean(sample.consentRejected);
        timeline.push({ elapsedMs: Date.now() - started, time: sample.time, ready: sample.ready, ad: sample.ad, paused: sample.paused, playability: sample.playability });
        adSeen ||= Boolean(sample.ad);
        if (!sample.ad && sample.ready >= 2 && sample.width > 0 && sample.time > 0 && !sample.paused) {
          if (initialTime === null) initialTime = sample.time;
          if (sample.time - initialTime >= 4 && sample.frames > 0) { progressing = true; break; }
        }
        if (sample.playability && !['OK', 'LIVE_STREAM_OFFLINE'].includes(sample.playability)) break;
      }
      const firstFrameMs = timeline.find((frame) => frame.ready >= 2 && frame.time > 0)?.elapsedMs || null;
      const result = { id, firstLoad: videoNavigations <= 1, manualReloads: 0, videoNavigations, firstFrameMs, audioMuted: wc.isAudioMuted(), progressing, adSeen, consentRejected, elapsedMs: Date.now() - started,
        blocked: state().siteBlocked, blockingEnabled: state().siteProtection, mediaRecoveries: (diagnostics.mediaRecoveries || 0) - recoveriesBefore, scriptletErrors: errors, sample, timeline,
        blockedRequests: diagnostics.blockedRequests.filter((request) => request.time >= started),
        mediaRequests: diagnostics.mediaRequests.filter((request) => request.time >= started) };
      results.push(result); console.log(JSON.stringify({ id, progressing, adSeen, blockingEnabled: result.blockingEnabled, firstFrameMs, videoNavigations, audioMuted: result.audioMuted, mediaRecoveries: result.mediaRecoveries, elapsedMs: result.elapsedMs, blocked: result.blocked, scriptletErrors: errors, sample }));
      try { const screenshot = await wc.capturePage(); fs.writeFileSync(output(`youtube-${id}.png`), screenshot.toPNG()); }
      catch (error) { result.screenshotError = error.message; }
      if (!progressing || (adSeen && state().siteProtection) || errors.length || !result.audioMuted) failures.push(id);
      closeTab(tab.id);
    }
    fs.writeFileSync(output(process.argv.includes('--no-block-test') ? 'youtube-control.json' : 'youtube-verification.json'), JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2));
    console.log(failures.length ? `YOUTUBE FAIL: ${failures.join(', ')}` : process.argv.includes('--no-block-test') ? 'YOUTUBE CONTROL: playback with protection disabled.' : 'YOUTUBE PASS: all tested videos play automatically, without observed ads, scriptlet errors, or manual reloads.');
    clearTimeout(timeout); app.exit(failures.length ? 1 : 0);
  } catch (error) { console.error('YOUTUBE FAIL:', error.message); clearTimeout(timeout); app.exit(1); }
};
