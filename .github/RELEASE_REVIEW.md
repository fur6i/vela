# Verifica sorgenti per il push pubblico

Data: 21 novembre 2026. Versione: 0.11.0.

## Modifiche incluse

- Fix mirati pre-release: modulo i18n.js caricato come script JavaScript, pattern generico escluso dalla traduzione automatica, errori Store senza prefisso IPC, tooltip riordinabili completi e stati download localizzati. Nessun caricamento automatico delle favicon dei preferiti nelle finestre private.
- Gli aggiornamenti silenziosi non riscrivono installer-language.txt. Il PNG sorgente del logo resta nel repository ma e escluso dai pacchetti. Il workflow pubblico esegue check e audit; gli smoke test grafici restano locali.

- Supporto Italiano / English centralizzato, cambio immediato nelle tre superfici e lingua ereditata dalle finestre private. Menu, conferme, strumenti e messaggi dell’app sono localizzati; numeri e date usano la lingua selezionata.
- Installer NSIS con selezione English/Italiano e un semplice file di preferenza iniziale. La lingua salvata nel profilo ha priorità; non viene modificato profile.json dall’installer. Gli elementi interni dei selettori file Windows restano nella lingua di Windows.

- Correzione del ritaglio del launcher: bordi e ombra restano integri.
- Favicon ICO/PNG nelle schede e nei preferiti; il logo Vela fornito dall'autore e generato con Gemini resta incluso.
- Lettura ICO limitata a 256 KiB e 256 px per fotogramma; controllo delle dimensioni PNG/JPEG prima del decoder nativo, massimo 1024 px per lato. Le risposte vengono normalizzate a PNG 32 x 32.
- Cache favicon limitata a 128 siti, massimo tre trasferimenti concorrenti, credenziali omesse; nessuna rasterizzazione SVG nella UI privilegiata.

## npm run check

60 test superati, zero fallimenti.

## npm run smoke

Superato con audio silenziato. Controlla anche isolamento Node/IPC, sessioni private, launcher, immagini dei preferiti, passaggio italiano/inglese sulle tre superfici, conservazione dei nomi personalizzati e lingua delle finestre private. La pagina locale `/broken` interrompe intenzionalmente la connessione: il relativo avviso ERR_EMPTY_RESPONSE fa parte della verifica del recupero dagli errori. Il test del preferito duplicato provoca inoltre una rejection IPC intenzionale per verificare il messaggio inglese corretto; non e un errore non gestito dell’app.

## Dipendenze e controlli di sicurezza

- Audit npm delle dipendenze runtime: zero vulnerabilita note segnalate al momento della verifica. Il risultato non copre ogni possibile vulnerabilita del runtime Chromium o del codice applicativo.
- Sandbox globale, WebContentsView, isolamento del contesto, controlli del mittente IPC, CSP e configurazione dei fuses mantenuti.
- Nessuna nuova dipendenza runtime introdotta dalle correzioni o dalla localizzazione. Il catalogo di traduzione è incluso nei sorgenti; nessun servizio di traduzione esterno viene contattato.
- Le indicazioni upstream di sicurezza Electron restano un riferimento di manutenzione: https://www.electronjs.org/docs/latest/tutorial/security

## Licenze e provenienza

- LICENSE MIT del codice Vela e THIRD_PARTY_NOTICES.txt presenti; testi delle licenze disponibili per tutte le 40 voci dell'inventario npm conservato in assets/licenses/inventory.json.
- Le licenze di terze parti, compresa MPL-2.0 dei componenti Ghostery, rimangono separate dalla MIT di Vela.
- Nessun font proprietario distribuito. Nessun pacchetto di estensioni, binario del downloader o cache di filtri incluso nei sorgenti per il push.
- Le favicon effettive dei siti non sono asset distribuiti nel repository: vengono caricate durante l'uso e conservate nel profilo dell'utente. I test del repository costruiscono immagini sintetiche.
- Provenienza del logo dichiarata dall'autore: immagine generata con Gemini. I termini generali Google consultati indicano che Google non rivendica la proprieta sui contenuti originali generati; questo non dimostra esclusivita, tutelabilita o assenza di diritti di terzi sull'immagine. Fonte: https://policies.google.com/terms (sezione Your content). Le condizioni applicabili al singolo account o servizio non sono state certificate.
- I riferimenti ai prodotti di terzi restano descrittivi e accompagnati dal disclaimer di non affiliazione.

## Cartella per il push e limiti

Conservare solo i file elencati in SOURCE_MANIFEST.txt. Profili, cronologia, cookie, chiavi API, download personali, cache, log, dipendenze installate e build restano esclusi. Il lock file viene conservato per npm ci, senza ispezione manuale, secondo le istruzioni del repository.

Questa e una verifica tecnica con documentazione delle licenze, non un penetration test indipendente, una ricerca di anteriorita sui marchi o un parere legale. Non certifica sicurezza o assenza di rischi legali al 100%. Restano documentati in SECURITY.md gli installer non firmati, la compatibilita parziale delle estensioni e la necessita della prima release pubblicata per verificare la consegna completa degli aggiornamenti.

## Installer bilingue

Configurazione NSIS compilata con entrambe le lingue, macro customInstall e fuses esistenti. Il selettore lingua standard NSIS viene omesso in modalità silenziosa; l’aggiornamento non sostituisce la lingua già salvata nel profilo. L’app legge il suggerimento solo se è un file regolare non simbolico, lungo al massimo 16 byte e contenente it oppure en. La procedura completa di aggiornamento tramite una release GitHub pubblicata resta soggetta al limite già documentato in SECURITY.md.
