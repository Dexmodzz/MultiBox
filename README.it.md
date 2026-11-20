# Multi Box Clipboard

🇬🇧 [English version](README.md)

Estensione per Google Chrome (Manifest V3) con **da 1 a 20 box di appunti persistenti** (6 alla prima installazione).
Copi un testo in un box con `Alt+N` e lo incolli in qualunque campo con la stessa combinazione.
I box restano salvati anche dopo la chiusura del browser.

Tutti i dati restano in `chrome.storage.local`: l'estensione non usa servizi esterni e non invia nulla in rete.

L'interfaccia è disponibile in **inglese** (predefinito) e in **italiano**: la lingua si cambia da ⚙️ **Impostazioni**.
In questo README i nomi di pulsanti e menu sono quelli della versione italiana.

## Installazione

1. **Scarica l'estensione** dalla **[pagina Releases](https://github.com/Dexmodzz/MultiBox/releases/latest)**:\
   scarica il file `MultiBox-<versione>.zip` (es. `MultiBox-1.1.2.zip`).

   Chi sviluppa può anche clonare il repository: `git clone https://github.com/Dexmodzz/MultiBox.git`
   (in quel caso salta il passo 2).
2. **Decomprimi (unzip) il file ZIP.** Il browser non può caricare direttamente il `.zip`: va prima estratto.
   - **Windows**: tasto destro sul file → **Estrai tutto…** → **Estrai**.
   - **macOS**: doppio clic sul file.
   - **Linux**: tasto destro sul file → **Estrai qui**, oppure da terminale `unzip MultiBox-<versione>.zip`.

   Otterrai la cartella `MultiBox-<versione>`, che contiene `manifest.json`.
3. Apri `chrome://extensions` in Chrome (o `brave://extensions` in Brave).
4. Attiva **Modalità sviluppatore** (interruttore in alto a destra).
5. Clicca **Carica estensione non pacchettizzata**.
6. Seleziona la **cartella estratta** (`MultiBox-<versione>`, quella che contiene `manifest.json`), non il file `.zip`.
7. (Facoltativo, per la pagina di test) nei **Dettagli** dell'estensione attiva
   **Consenti l'accesso agli URL dei file**.

Non spostare né cancellare la cartella: Chrome carica l'estensione da lì a ogni avvio.
Per aggiornarla, scarica il nuovo ZIP dalla [pagina Releases](https://github.com/Dexmodzz/MultiBox/releases/latest),
decomprimilo, sostituisci il contenuto della cartella con i file estratti e premi **↻ (Ricarica)** in `chrome://extensions`.

Le schede già aperte prima dell'installazione vanno ricaricate (oppure basta aprire il popup
dell'estensione su quella scheda: prova a attivarla automaticamente).

### Se modifichi il codice

Dopo una modifica a `background.js` o `panel.js` premi **↻ (Ricarica)** sull'estensione in
`chrome://extensions` (o `brave://extensions`) e ricarica le pagine aperte. Alcuni browser basati su
Chromium (es. Brave) possono continuare a eseguire la vecchia versione del service worker: se il menu
contestuale non riflette le modifiche, aumenta `version` in `manifest.json` oppure rimuovi e ricarica
l'estensione.

## Scorciatoie da tastiera

| Combinazione | Azione |
|---|---|
| `Alt+1` … `Alt+9`, `Alt+0` (Box 10) con testo selezionato | Salva la selezione nel Box N (sovrascrive). Toast: "Salvato nel Box N" |
| `Alt+1` … `Alt+9`, `Alt+0` senza selezione, con il cursore in un campo di testo | Incolla il Box N nel punto del cursore. Toast: "Incollato dal Box N" |
| `Alt+N` con Box N vuoto | Nessun incolla, toast "Box N vuoto" |
| `Alt+N` per un box che non esiste | Toast "Il Box N non esiste" |
| `Alt+M` | Apre/chiude il pannello |
| `Esc` | Chiude il pannello |

- I box dall'11 al 20 non hanno scorciatoia: si usano dal pannello e dal menu contestuale.
- Su Mac usa `Option` al posto di `Alt` (l'estensione legge il tasto fisico tramite `event.code`).
- La selezione vale sia nella pagina sia dentro input/textarea.
- Campi supportati per l'incolla: `textarea`, `input` testuali (text, search, url, tel, password, email)
  ed elementi `contenteditable` (inserimento alla posizione del cursore con Range/Selection API).
  Dopo l'inserimento vengono lanciati gli eventi `input` e `change`.
- Se non c'è selezione e il focus non è in un campo modificabile, il tasto non fa nulla.
- Le scorciatoie sono ignorate quando il focus è dentro il pannello dell'estensione.
- Funzionano anche dentro gli iframe (agiscono nel frame che ha il focus).

### Nota per Windows e Linux

Alcune combinazioni `Alt+numero` possono essere già usate dal sistema, dal window manager o da altre
applicazioni (ad esempio per cambiare scheda o area di lavoro). In quel caso puoi cambiarle
modificando la costante `SHORTCUT_CODES` (e `PANEL_TOGGLE_CODE` per `Alt+M`) all'inizio di `content.js`,
ad esempio usando `Numpad1` … `Numpad6`, e poi ricaricando l'estensione da `chrome://extensions`.

## Menu contestuale

Clic destro → **Multi Box**:

```
Multi Box
├─ Copia nel   (compare con un testo selezionato)
│   ├─ Box 1
│   ├─ …
│   └─ Box N  → salva la selezione nel box
└─ Incolla da  (compare in un campo modificabile)
    ├─ Box 1
    ├─ …
    └─ Box N  → inserisce il testo nel campo attivo del frame in cui hai cliccato
```

N è il numero di box esistenti: i sottomenu **Copia nel** e **Incolla da** si allungano o si accorciano
automaticamente quando aggiungi (+) o elimini box dal pannello o dal popup.
Il menu viene inoltre ricreato a ogni avvio del browser e segue la lingua scelta nelle Impostazioni
(in inglese: **Copy to** / **Paste from**).

## Pannello e popup

- `Alt+M` apre il pannello su qualsiasi pagina; `Esc` o un click fuori lo chiude.
- Facoltativamente, in alto a destra di ogni pagina può comparire un piccolo pulsante con l'icona e un badge
  con il numero di box pieni (**nascosto di default**, vedi [Impostazioni](#impostazioni)). Anche il click
  sul pulsante apre il pannello.
- Il pannello (circa 340 px, altezza massima 80% dello schermo) mostra tutti i box: ogni card ha il titolo,
  una textarea modificabile e i pulsanti **Copia negli appunti** e **Svuota**.
- Ogni box va a capo da solo e si ingrandisce con il testo; se i box non entrano, scorre la lista.
- **Aggiungere un box**: pulsante **+** nel footer, tra "Importa JSON" e `Alt+M` (massimo 20).
- **Eliminare un box**: tieni premuto il box con il tasto sinistro del mouse per **1 secondo**
  (una barra rossa in basso mostra l'avanzamento; se muovi il mouse si annulla). Accanto al box compare
  il **cestino**: cliccalo per eliminarlo. Il cestino sparisce da solo dopo 6 secondi o cliccando altrove.
  Deve restare almeno 1 box; i box successivi scalano di un posto (il Box 5 diventa Box 4, e così via).
- Le modifiche vengono salvate subito (300 ms dopo l'ultima digitazione) e si aggiornano in tempo reale
  in tutte le schede aperte e nel popup.
- **Esporta JSON** scarica un backup; **Importa JSON** ripristina un backup
  (dal popup apre l'interfaccia in una scheda, perché il selettore file chiuderebbe il popup).
- Il popup della toolbar mostra gli stessi box e sta sempre tutto nella finestra senza scorrere: in base
  al numero di box usa da 1 a 4 colonne, e **Copia negli appunti** / **Svuota** diventano due piccole icone
  accanto al titolo di ogni box. Sulle pagine `chrome://` e nel Chrome Web Store Chrome non permette alle
  estensioni di agire sulla pagina: il popup lo segnala con un messaggio, ma i box restano modificabili.

## Impostazioni

Clicca l'icona ⚙️ a ingranaggio nel popup o nel pannello:

- **Lingua**: 🇬🇧 English oppure 🇮🇹 Italiano. Tutta l'interfaccia cambia subito (popup, pannello,
  messaggi e menu del tasto destro). Predefinita: inglese.
- **Pulsante nelle pagine web**: mostra o nasconde il pulsante Multi Box in alto a destra nelle pagine.
  È **nascosto di default**; `Alt+M` apre comunque sempre il pannello.

Le impostazioni sono salvate in `chrome.storage.local` insieme ai box.

## Test manuale

Apri `test/test.html` (trascinalo in Chrome; serve l'accesso agli URL dei file, vedi Installazione).

1. **Copia con la scorciatoia**: seleziona il primo paragrafo e premi `Alt+1` → toast "Salvato nel Box 1"
   (se il pulsante nelle pagine è attivo, il suo badge passa a 1).
2. **Incolla con la scorciatoia**: clicca in *Textarea 2* e premi `Alt+1` → il testo appare, toast
   "Incollato dal Box 1", nel log compaiono gli eventi `input` e `change`.
3. **Selezione in un campo**: seleziona una parte di *Textarea 1* e premi `Alt+4` → salvata nel Box 4.
4. **Box vuoto**: clicca in *Textarea 3* e premi `Alt+6` (box vuoto) → toast "Box 6 vuoto", nessun incolla.
5. **Contenteditable**: clicca a metà della frase del riquadro *Contenteditable* e premi `Alt+1`
   → il testo compare nel punto del cursore, non alla fine.
6. **Input**: posiziona il cursore nell'input e premi `Alt+1`.
7. **Iframe**: seleziona il testo dentro l'iframe e premi `Alt+3`, poi clicca nella textarea
   dell'iframe e premi `Alt+3`.
8. **Menu contestuale**: seleziona il secondo paragrafo → tasto destro → Multi Box → Copia nel → Box 2;
   poi tasto destro in *Textarea 5* → Multi Box → Incolla da → Box 2 (gli a-capo vengono mantenuti).
9. **Pannello**: premi `Alt+M` (o clicca il pulsante nella pagina, se attivo), modifica il testo del Box 1 e verifica
   che l'altra scheda / il popup si aggiornino; prova **Copia negli appunti**, **Svuota**, `Esc`.
10. **Aggiungi/elimina**: premi **+** fino a 20 box (poi il pulsante si disattiva); tieni premuto un box
    per 1 secondo, clicca il cestino e verifica che i box successivi vengano rinumerati e che il menu
    contestuale si aggiorni. Con un solo box il cestino non compare.
11. **Backup**: **Esporta JSON**, svuota un box, **Importa JSON** con il file scaricato.
12. **Impostazioni**: apri ⚙️, passa a 🇬🇧 English e verifica che popup, pannello, toast e menu del tasto
    destro cambino lingua; attiva "Pulsante nelle pagine web" e verifica che il pulsante compaia nelle pagine aperte.
13. **Pagine protette**: apri `chrome://extensions` e clicca l'icona dell'estensione → il popup
    mostra il messaggio che la pagina non è supportata.
14. **Persistenza**: chiudi completamente Chrome, riaprilo e verifica (badge, pannello o popup)
    che i box siano ancora pieni.

## File

| File | Contenuto |
|---|---|
| `manifest.json` | Configurazione Manifest V3 |
| `background.js` | Service worker: menu contestuale e inoltro comandi ai frame |
| `content.js` | Scorciatoie, incolla/salvataggio, pulsante, pannello e toast nella pagina |
| `panel.js` | Logica condivisa: dati, salvataggio con debounce, pannello, export/import |
| `panel.css` | Stili di pulsante, pannello, toast e popup |
| `popup.html`, `popup.js` | Popup della toolbar (riusa `panel.js`) |
| `icons/` | Icone 16, 48, 128 px |
| `test/test.html` | Pagina per i test manuali |
| `_locales/` | Nome e descrizione dell'estensione in inglese e italiano |
| `README.md` | Versione inglese di questo README |

## Formato del backup

```json
{
  "app": "Multi Box Clipboard",
  "version": "1.1.2",
  "exportedAt": "2026-01-01T12:00:00.000Z",
  "boxes": [{ "id": 1, "text": "..." }, { "id": 2, "text": "" }]
}
```
