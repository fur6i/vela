const {t,localizedDialog}=require('./i18n.js');
const { isWeb } = require('./navigation.cjs');
function origin(value) { try { return new URL(value).origin; } catch { return null; } }
function trustedPermission(wc, requestingUrl, isMainFrame) {
  return Boolean(wc && !wc.isDestroyed() && isMainFrame && isWeb(requestingUrl) &&
    requestingUrl.startsWith('https://') && origin(requestingUrl) === origin(wc.getURL()));
}
function protectSession(ses, getWindow, getActiveContents, dialog,getLanguage=()=>'it') {
  const tr=(key,vars)=>t(getLanguage(),key,vars);
  dialog=localizedDialog(dialog,getLanguage);
  const grants = new Set(), pending = new Set();
  const key = (wc, url, permission) => `${wc.id}:${origin(url)}:${permission}`;
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) =>
    Boolean(wc && !wc.isDestroyed() && origin(requestingOrigin) === origin(wc.getURL()) && grants.has(key(wc, requestingOrigin, permission))));
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    const url = details.requestingUrl || wc?.getURL();
    if (!['media', 'geolocation', 'notifications'].includes(permission) || wc !== getActiveContents() ||
      !trustedPermission(wc, url, details.isMainFrame) || pending.has(wc.id)) return callback(false);
    const requestKey = key(wc, url, permission);
    if (grants.has(requestKey)) return callback(true);
    pending.add(wc.id);
    try {
      const labels = { media: tr("fotocamera / microfono"), geolocation: tr('posizione'), notifications: tr('notifiche') };
      const result = await dialog.showMessageBox(getWindow(), { type: 'question', buttons: [tr("Nega"), tr("Consenti per questa pagina")],
        defaultId: 0, cancelId: 0, title: tr("Permesso del sito"), message: tr("{v0} richiede accesso a {v1}.",{v0:origin(url),v1:labels[permission]}) });
      const allowed = result.response === 1 && wc === getActiveContents() && trustedPermission(wc, url, true);
      if (allowed) {
        grants.add(requestKey);
        const revoke = () => grants.delete(requestKey);
        wc.once('did-start-navigation', revoke); wc.once('destroyed', revoke);
      }
      callback(allowed);
    } catch { callback(false); } finally { pending.delete(wc.id); }
  });
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((_request, callback) => callback(null));
  ses.on('will-download', (_event, item) => {
    const dangerous = /\.(exe|msi|msix|bat|cmd|ps1|vbs|js|scr|lnk|com|hta|reg)$/i.test(item.getFilename());
    if (dangerous) {
      const result = dialog.showMessageBoxSync(getWindow(), { type: 'warning', title: tr("File eseguibile"),
        message: tr("“{v0}” può eseguire codice sul computer. Vuoi scaricarlo?",{v0:item.getFilename()}),
        buttons: [tr("Annulla download"), tr("Scarica comunque")], defaultId: 0, cancelId: 0 });
      if (result !== 1) item.cancel();
    }
  });
  return () => grants.clear();
}
module.exports = { origin, trustedPermission, protectSession };
