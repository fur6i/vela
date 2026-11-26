<p align="center">
  <img src="assets/vela.png" width="112" alt="Logo Vela">
</p>

<h1 align="center">Vela</h1>

<p align="center">
  Un browser Chromium minimale per Windows, con più spazio per navigare.
</p>

<p align="center">
  <a href="README.md"><kbd>English</kbd></a>
  &nbsp;
  <a href="README.it.md"><kbd>Italiano</kbd></a>
</p>

<p align="center">
  <a href="https://github.com/fur6i/vela/releases">Download</a>
  ·
  <a href="https://github.com/fur6i/vela/issues">Segnala un problema</a>
  ·
  <a href="SECURITY.md">Sicurezza</a>
</p>

---

Vela porta su Windows un’interfaccia Chromium essenziale, con superfici ispirate al vetro. Barra degli indirizzi centrata, sidebar discreta e strumenti compatti lasciano spazio alle pagine.

La direzione visiva prende ispirazione da Safari, mentre la navigazione tra gli spazi riprende alcune idee di Arc. Vela è un progetto indipendente, sviluppato con Electron e Chromium.

## Novità della 0.12.0

- **Panoramica schede:** fai clic con il tasto centrale su un’anteprima per chiudere la scheda corrispondente.
- **Chrome Web Store:** risolto il blocco del download durante il reindirizzamento dello Store. Apri la scheda di un’estensione, scegli **Installa in Vela** e controlla i permessi prima di confermare. L’installazione di Tab Translate 2.0.1 è stata verificata in un profilo di prova. La sua integrazione nel menu contestuale richiede un’API assente in Electron.
- **Interfaccia:** il pannello delle impostazioni è centrato, la barra degli indirizzi ha un pulsante per copiare il link e la pagina iniziale mostra © fur6i nell’angolo in basso a destra.

## Password e migrazione

Vela 0.12.0 usa la stessa identità dell’installer e lo stesso profilo di navigazione di Vela 0.11.0 stabile. I dati delle versioni precedenti di Vela Beta rimangono nel loro profilo separato.

- **Password manager locale cifrato:** apri Impostazioni → Password manager. Il vault cifra nomi utente, origini e password con AES-256-GCM; la chiave casuale è protetta da Windows DPAPI. Lo sblocco dell'elenco, il salvataggio, l'eliminazione e ogni compilazione richiedono una nuova autenticazione dell'account Windows nella finestra di sistema. La password di Windows rimane nel componente nativo temporaneo e non passa a JavaScript, file o log.
- **Compilazione al clic:** clicca un campo nome utente/password di un modulo HTTPS, scegli l'account dal menu controllato da Vela e autenticati con Windows. La corrispondenza dell'origine è esatta, porta inclusa. Vela ricontrolla documento e scheda dopo l'autenticazione, rifiuta moduli diretti a un'altra origine e non invia il modulo. Vela propone di salvare le credenziali quando invii un modulo di accesso supportato. Puoi anche salvarle dal menu del campo o aggiungerle nelle impostazioni. Sono esclusi moduli ambigui, registrazioni/cambi password e frame di altre origini.
- **Importazione da Arc:** esporta **Spazi e schede** da Impostazioni → Avanzate di Arc, poi seleziona **Arc Data Export.md** da Impostazioni → Importa da Arc in Vela. Gli spazi vengono ricreati e i link diventano schede fissate sospese; vengono importati anche i preferiti. Vela conserva le cartelle annidate quando il file ne descrive la struttura. Per correggere un vecchio import, seleziona di nuovo lo stesso Markdown e controlla le schede da spostare. Conferma e deduplicazione precedono l'importazione. Vela mostra fino a quattro spazi. Gli spazi eccedenti diventano cartelle. Si possono importare fino a 80 schede e 256 preferiti.
- **Password da Arc:** se il suo password manager offre l'esportazione CSV, seleziona il CSV insieme al file MD, oppure da solo. Vela accetta le colonne Chromium `url,username,password` e cifra le credenziali HTTPS valide dopo l'autenticazione Windows. Non estrae chiavi di Arc e non decifra il database del suo profilo. Il CSV esportato contiene password in chiaro: proteggilo ed eliminalo quando non serve più. Vela non modifica i file originali.

Sui sistemi Windows 11 compatibili, Vela usa Windows Hello. Se Hello non è disponibile, Vela richiede la password dell'account Windows. Le finestre private non accedono al vault e non importano dati. L'elenco si blocca dopo 60 secondi, chiudendo il pannello e al blocco/sospensione di Windows. Non ci sono cloud sync o recupero remoto: la copia del vault non si sblocca semplicemente con un altro account Windows. Malware con i diritti dello stesso utente, main process compromesso o sito di destinazione compromesso restano fuori da questa protezione. Vedi [SECURITY.md](SECURITY.md).

Per lo sviluppo locale, esegui `npm ci` e `npm start` da questa cartella. Il componente nativo viene compilato su richiesta con il compilatore C# di .NET Framework di Windows; i pacchetti lo compilano una volta tramite `scripts/build-auth.cjs` e lo includono come risorsa. Non vengono cambiate le policy PowerShell. Verifica con `npm run check`, `npm run smoke` e `node scripts/audit-release.cjs`. L'autenticazione riuscita con il tuo account richiede ancora una verifica manuale; i test automatici non chiedono credenziali reali.

Formato di esportazione: [guida ufficiale Arc](https://resources.arc.net/hc/en-us/articles/25583851606039-How-Do-I-Export-My-Data-from-Arc). L'autenticazione usa le API Microsoft [finestra credenziali](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-creduipromptforwindowscredentialsw) e [LogonUser](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-logonuserw). I nomi dei prodotti sono descrittivi; Vela non è affiliato ai rispettivi titolari.

## Funzionalità

- **Interfaccia minimale:** sfumature leggere, sfondo personalizzabile e aspetto chiaro/scuro.
- **Sidebar a comparsa:** avvicina il cursore al bordo sinistro oppure mantienila fissata.
- **Spazi personalizzabili:** organizza le schede in un massimo di quattro spazi con nomi, colori, emoji e immagini modificabili.
- **Gestione flessibile delle schede:** schede fissate e cartelle, riordino tramite trascinamento, duplicazione, silenziamento, riapertura e panoramica visiva.
- **Navigazione rapida:** launcher per nuove schede con suggerimenti di ricerca e accesso alle schede recenti.
- **Motore di ricerca a scelta:** Google, Bing, Brave Search o Ecosia, selezionabili durante la configurazione.
- **Preferiti modificabili:** riordina i collegamenti con le icone dei siti nella barra laterale o nel pannello Preferiti.
- **Liste di tracker personalizzate:** aggiungi domini, file hosts o regole di dominio supportate da Impostazioni → Privacy.
- **Italiano e inglese:** cambia subito la lingua dalle impostazioni. Anche l’installer Windows offre entrambe le lingue.
- **Download compatti:** gestisci i trasferimenti da un popup laterale senza coprire tutta la pagina.

## Strumenti integrati

Gli strumenti si trovano in un dock riordinabile e aprono pannelli compatti accanto alla navigazione.

| Strumento | Funzione |
| --- | --- |
| Media Downloader | Scarica contenuti HTTPS pubblici supportati in MP4, MKV, MP3 o M4A. |
| Ad Blocker | Filtra le pubblicità con controlli globali e per singolo sito. |
| Privacy | Filtra tracker e cookie di terze parti, invia segnali GPC/DNT e rifiuta i banner cookie riconosciuti. |
| Volume | Regola il volume delle singole schede da 0% a 600%, dove la sorgente multimediale consente l’amplificazione. |
| Immagini | Salva le immagini supportate in PNG, JPEG o WebP. |
| Pagina intera | Esporta il contenuto caricato della pagina in PNG, JPEG o PDF. |
| VirusTotal | Cerca report tramite l’impronta dei file scaricati o selezionati; permette l’invio dopo conferma. |
| Panic Button | Apre un sito scelto nella scheda attiva tramite una combinazione di tasti personalizzabile. |

**Media Downloader:** usalo soltanto per contenuti tuoi, autorizzati dal titolare o di pubblico dominio. Rispetta la normativa applicabile e i termini del servizio. Non aggira DRM o autenticazione. I componenti esterni vengono scaricati su richiesta con verifica SHA-256 e mantengono le licenze upstream.

**VirusTotal:** i report nel pannello richiedono una tua chiave API. Il caricamento può condividere il contenuto del file con VirusTotal e i suoi partner. Non inviare file riservati. Un report senza rilevazioni non garantisce la sicurezza del file.

## Estensioni

Usa **Installa in Vela** dalla scheda di un’estensione del Chrome Web Store, incolla un URL o un ID dello Store nel dock estensioni oppure carica una cartella già estratta.

I pacchetti dello Store vengono sottoposti a verifica della firma e dell’identità, estrazione con limiti di sicurezza e conferma dei permessi prima del caricamento. La compatibilità dipende dalle API disponibili in Electron: alcune estensioni possono installarsi senza funzionare completamente.

Le estensioni aggiunte non vengono caricate nelle finestre private. Non è fornita una compatibilità completa con le estensioni Chrome o Manifest V2/V3.

## Prestazioni

Vela cerca di ridurre il lavoro superfluo in background:

- Le schede dei siti ripristinate vengono caricate quando le selezioni.
- Sidebar e dock vengono inizializzati su richiesta.
- Le pagine in background mantengono il throttling standard di Chromium.
- La sospensione manuale può liberare i processi delle pagine inattive.
- Le cache di anteprime e favicon hanno limiti di dimensione.
- Cache dei filtri, aggiornamenti UI raggruppati e polling adattivo della sidebar riducono le operazioni ripetute.

Il consumo di risorse dipende da siti, contenuti multimediali, estensioni e hardware. Non sono state stabilite classifiche comparative con altri browser. [PERFORMANCE.md](PERFORMANCE.md) descrive il metodo di misurazione e distingue i risultati storici.

## Download e aggiornamenti

Richiede **Windows 10 o 11, x64**.

Le build pubblicate sono disponibili nelle [release GitHub](https://github.com/fur6i/vela/releases):

- **Installer:** consigliato per l’uso abituale. Le versioni stabili supportano gli aggiornamenti dalle release GitHub pubblicate.
- **Eseguibile portatile:** funziona senza installazione e si aggiorna manualmente. Il profilo di navigazione resta comunque salvato localmente.

Le versioni installate possono scaricare gli aggiornamenti in background e proporre il riavvio quando sono pronti.

Gli eseguibili attualmente **non sono firmati digitalmente**, quindi Windows SmartScreen può mostrare un avviso. Verifica la provenienza del download. Il repository include un workflow pubblico di release tramite GitHub Actions.

## Compilazione dai sorgenti

Per lo sviluppo servono Node.js e npm. Il workflow di release usa Node.js 24.

```powershell
git clone https://github.com/fur6i/vela.git
cd vela
npm ci
npm start
```

Verifica e creazione dei pacchetti Windows:

```powershell
npm run check
npm run smoke
node scripts/audit-release.cjs
npm run release
```

I pacchetti vengono generati in `release/`. Gli smoke test aprono finestre di prova con audio disattivato.

Per le misurazioni locali delle prestazioni:

```powershell
npm run benchmark
```

## Scorciatoie

| Combinazione | Azione |
| --- | --- |
| Ctrl+T | Apre il launcher nuova scheda |
| Ctrl+L | Seleziona la barra degli indirizzi |
| Ctrl+W | Chiude la scheda corrente |
| Tasto centrale su un’anteprima | Chiude la scheda dalla panoramica |
| Ctrl+Shift+T | Riapre una scheda chiusa |
| Ctrl+Tab / Ctrl+Shift+Tab | Cambia scheda |
| Ctrl+Shift+N | Apre una finestra privata |
| Ctrl+D | Aggiunge o rimuove un preferito |
| Ctrl+F | Cerca nella pagina |
| Ctrl+R | Ricarica |
| Ctrl+P | Stampa |

## Sicurezza e privacy

Vela usa sandbox, isolamento del contesto, IPC limitato, una CSP rigorosa per l’applicazione e impostazioni di packaging rafforzate. Le pagine web non ricevono accesso a Node.js.

Le finestre private utilizzano profili temporanei separati e sessioni di navigazione in memoria. La navigazione privata non fornisce anonimato e i file scaricati rimangono sul disco. Panic Button non cancella la cronologia e non chiude le altre schede.

Vela include un archivio locale cifrato per le password. Sincronizzazione cloud e controlli di reputazione equivalenti a Safe Browsing sono assenti. La compatibilità con siti, estensioni e servizi DRM può variare. L’avviso di compatibilità di Gmail dopo l’accesso resta da risolvere.

Consulta [SECURITY.md](SECURITY.md) per implementazione, limiti e segnalazioni di vulnerabilità.

## Licenza e attribuzioni

Il codice originale di Vela è distribuito sotto [licenza MIT](LICENSE).

Electron, Chromium, Ghostery Adblocker, electron-updater e gli altri componenti mantengono le proprie licenze. Anche le sottoscrizioni dei filtri e gli strumenti multimediali scaricati conservano i termini upstream. Consulta [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) e [assets/licenses](assets/licenses).

Il logo Vela è stato generato con Gemini.

I font vengono forniti dal sistema operativo; non vengono distribuiti font proprietari Apple.

Safari, Arc, Chrome, Chrome Web Store, Gmail, Windows e gli altri nomi di prodotto appartengono ai rispettivi titolari. I riferimenti descrivono soltanto ispirazione o interoperabilità. Vela non è affiliata, approvata o sponsorizzata dai rispettivi titolari.

## Contribuire

Segnalazioni di problemi e pull request mirate sono benvenute. Indica versione di Vela, versione di Windows e passaggi chiari per riprodurre il problema.

Per le segnalazioni di sicurezza segui [SECURITY.md](SECURITY.md). Non allegare chiavi API, cookie o profili personali di navigazione alle issue pubbliche.
