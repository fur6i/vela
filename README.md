<p align="center">
  <img src="assets/vela.png" width="112" alt="Vela logo">
</p>

<h1 align="center">Vela</h1>

<p align="center">
  A quiet, minimal Chromium browser for Windows.
</p>

<p align="center">
  <a href="README.md"><kbd>English</kbd></a>
  &nbsp;
  <a href="README.it.md"><kbd>Italiano</kbd></a>
</p>

<p align="center">
  <a href="https://github.com/fur6i/vela/releases">Downloads</a>
  ·
  <a href="https://github.com/fur6i/vela/issues">Report a bug</a>
  ·
  <a href="SECURITY.md">Security</a>
</p>

---

Vela brings a restrained, glass-inspired interface to Chromium browsing on Windows. A centered address bar, an unobtrusive sidebar and compact tools keep your pages in focus.

Its visual direction draws inspiration from Safari, while its workspace navigation takes cues from Arc. Vela is an independent project built with Electron and Chromium.

## What's new in 0.12.0

- **Tab Overview:** middle-click any tab preview to close that tab.
- **Chrome Web Store:** fixed downloads that stopped at the Store's redirect. Open an extension listing, choose **Install in Vela**, then review the permissions before confirming. Installation of Tab Translate 2.0.1 was verified in a test profile. Its context-menu integration requires an API unavailable in Electron.
- **Browser interface:** the settings panel is centered, the address bar has a copy-link button, and the start page shows © fur6i in the bottom-right corner.

## Passwords and migration

Vela 0.12.0 uses the same installer identity and browsing profile as stable Vela 0.11.0. Data from the earlier Vela Beta builds remains in its separate profile.

- **Encrypted local password manager:** open Settings → Password manager. The vault encrypts usernames, origins and passwords with AES-256-GCM; its random key is protected by Windows DPAPI. Unlocking the list, saving/deleting credentials and every fill require fresh Windows account authentication through the system credential dialog. Your Windows password stays in a short-lived native helper and is never sent to JavaScript, files or logs.
- **Click-to-fill:** click a username/password field on an HTTPS login form, choose the account from Vela's browser-owned menu, then authenticate with Windows. Matching is exact by origin, including the port. Vela checks the document and selected tab again after authentication, refuses cross-origin form actions and does not submit the form. Vela offers to save credentials after you submit a supported sign-in form. You can also save from the field menu or add credentials in Settings. Registration/change-password forms, cross-origin frames and ambiguous forms are intentionally excluded.
- **Import from Arc:** export **Spaces and tabs** in Arc Settings → Advanced, then select **Arc Data Export.md** in Vela Settings → Import from Arc. Spaces and links are recreated as dormant pinned tabs; favorites are imported too. Vela preserves folder nesting where the export identifies it. To repair a previous import, select the same Markdown file again and review the proposed tab moves. History, cookies, signed-in sessions and extensions are outside the import. A confirmation summarizes the import; existing entries are deduplicated. Vela displays up to four spaces. Extra spaces become folders. The import allows up to 80 tabs and 256 favorites.
- **Passwords from Arc:** if its password manager offers CSV export, select that CSV together with the MD file, or separately. Vela accepts Chromium-style `url,username,password` columns and encrypts accepted HTTPS credentials after Windows authentication. It does not extract Arc encryption keys or decrypt its profile database. The exported CSV is plaintext: protect it and delete it yourself once no longer needed. Vela leaves the source files unchanged.

On supported Windows 11 systems, Vela uses Windows Hello. If Hello is unavailable, Vela requests the Windows account password. Private windows cannot access the vault or import data. The manager list locks after 60 seconds, on closing its panel, and when Windows locks/suspends. It has no cloud sync or recovery service: a copied vault cannot simply be unlocked with another Windows account. Malware running as the same Windows user, a compromised main process or a compromised destination website remain outside this protection boundary. See [SECURITY.md](SECURITY.md).

For local development, run `npm ci` and `npm start` from this folder. The native helper compiles on demand with the Windows .NET Framework C# compiler; packaged builds compile it once through `scripts/build-auth.cjs` and include it as a resource. No PowerShell execution-policy changes are required. Verify with `npm run check`, `npm run smoke`, and `node scripts/audit-release.cjs`. Successful OS authentication still requires a manual check with your own account; automated tests never request real credentials.

Arc export format reference: [Arc Help Center](https://resources.arc.net/hc/en-us/articles/25583851606039-How-Do-I-Export-My-Data-from-Arc). System authentication uses Microsoft's [credential dialog](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-creduipromptforwindowscredentialsw) and [LogonUser](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-logonuserw) APIs. These product names are descriptive; Vela is not affiliated with their owners.

## Features

- **Minimal glass interface:** subtle gradients, customizable background colors and light/dark appearance.
- **Sidebar on demand:** reveal it from the left edge or keep it pinned.
- **Customizable spaces:** organize your tabs in up to four spaces with editable names, colors, emoji and images.
- **Flexible tab management:** pinned tabs and folders, drag-to-reorder, duplication, muting, reopening and a visual tab overview.
- **Quick navigation:** a new-tab launcher with search suggestions and shortcuts to recently used tabs.
- **Your search engine:** choose Google, Bing, Brave Search or Ecosia during setup.
- **Editable favorites:** reorder shortcuts with website icons in the sidebar or favorites editor.
- **Custom tracker lists:** add domains, hosts files or supported domain rules in Settings → Privacy.
- **Italian and English:** switch the interface language instantly in Settings. The Windows installer also offers both languages.
- **Compact downloads:** manage transfers in a side popup without covering the whole page.

## Built-in tools

Tools live in a reorderable dock and open compact panels alongside your browsing.

| Tool | What it does |
| --- | --- |
| Media Downloader | Download supported public HTTPS media as MP4, MKV, MP3 or M4A. |
| Ad Blocker | Built-in ad filtering with global and per-site controls. |
| Privacy | Tracker filtering, third-party cookie controls, GPC/DNT signals and rejection of recognized cookie banners. |
| Volume | Adjust individual tabs from 0% to 600%, where the media source supports amplification. |
| Images | Save supported images as PNG, JPEG or WebP. |
| Full Page Capture | Export loaded page content as PNG, JPEG or PDF. |
| VirusTotal | Look up downloaded or selected files by hash; optionally submit files after confirmation. |
| Panic Button | Open a chosen website in the active tab using a configurable keyboard shortcut. |

**Media Downloader:** use it only for content you own, have permission to download, or that is in the public domain. Respect applicable law and service terms. It does not bypass DRM or authentication. Helper binaries are downloaded on demand with SHA-256 verification and retain their upstream licenses.

**VirusTotal:** in-app reports require your own API key. Uploading a file may share its contents with VirusTotal and its partners. Do not submit confidential files. A clean report does not guarantee safety.

## Extensions

Use **Install in Vela** on a Chrome Web Store listing, paste a Store URL or ID into the extensions dock, or load an unpacked extension folder.

Store packages undergo signature and identity verification, bounded extraction and a permission confirmation before loading. Compatibility depends on the extension APIs supported by Electron: some extensions may install but not work fully.

Added extensions are not loaded in private windows. Full Chrome extension or Manifest V2/V3 compatibility is not provided.

## Performance

Vela aims to reduce unnecessary background work:

- Restored website tabs load when selected.
- Sidebar and dock surfaces are initialized on demand.
- Background pages retain Chromium’s standard throttling.
- Manual tab suspension can release inactive page processes.
- Preview and favicon caches are bounded.
- Filter caching, batched UI updates and adaptive sidebar polling reduce repeated work.

Resource use depends on websites, media, extensions and hardware. Comparative performance rankings have not been established. See [PERFORMANCE.md](PERFORMANCE.md) for the measurement method and clearly labeled historical results.

## Download and updates

Requires **Windows 10 or 11, x64**.

Published builds are available from [GitHub Releases](https://github.com/fur6i/vela/releases):

- **Installer:** recommended for regular use. Stable builds support updates from published GitHub releases.
- **Portable executable:** runs without installation and is updated manually. Its browsing profile is still stored locally.

Installed builds can download updates in the background and offer to restart when an update is ready.

The executables are currently **unsigned**, so Windows SmartScreen may display a warning. Verify the download source. The repository includes a public GitHub Actions release workflow.

## Build from source

Development requires Node.js and npm. The release workflow uses Node.js 24.

```powershell
git clone https://github.com/fur6i/vela.git
cd vela
npm ci
npm start
```

Validation and Windows packaging:

```powershell
npm run check
npm run smoke
node scripts/audit-release.cjs
npm run release
```

Build outputs are written to `release/`. Smoke tests open test windows with audio muted.

For local performance measurements:

```powershell
npm run benchmark
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+T | Open the new-tab launcher |
| Ctrl+L | Focus the address bar |
| Ctrl+W | Close the current tab |
| Middle-click a tab preview | Close that tab from Tab Overview |
| Ctrl+Shift+T | Reopen a closed tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Switch tabs |
| Ctrl+Shift+N | Open a private window |
| Ctrl+D | Toggle a favorite |
| Ctrl+F | Find in page |
| Ctrl+R | Reload |
| Ctrl+P | Print |

## Security and privacy

Vela uses sandboxing, context isolation, restricted IPC, a strict application CSP and hardened packaging settings. Website pages do not receive Node.js access.

Private windows use separate temporary profiles and in-memory browsing sessions. Private browsing does not provide anonymity, and files you download remain on disk. Panic Button does not erase history or close other tabs.

Vela includes a local encrypted password vault. Cloud synchronization and Safe Browsing-style reputation checks are unavailable. Website, extension and DRM compatibility can vary. Gmail's browser warning after sign-in remains unresolved.

Read [SECURITY.md](SECURITY.md) for implementation details, limitations and vulnerability reporting.

## License and acknowledgments

Vela’s original code is released under the [MIT License](LICENSE).

Electron, Chromium, Ghostery Adblocker, electron-updater and other components retain their own licenses. Filter subscriptions and downloaded media tools also retain their upstream terms. See [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) and [assets/licenses](assets/licenses).

The Vela logo was generated using Gemini.

Fonts are supplied by the operating system; proprietary Apple fonts are not bundled.

Safari, Arc, Chrome, Chrome Web Store, Gmail, Windows and other product names belong to their respective owners. References describe inspiration or interoperability only. Vela is not affiliated with, endorsed by or sponsored by those owners.

## Contributing

Bug reports and focused pull requests are welcome. Include your Vela version, Windows version and clear reproduction steps.

Follow [SECURITY.md](SECURITY.md) for security reports. Never attach API keys, cookies or personal browsing profiles to public issues.
