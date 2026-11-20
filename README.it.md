# Multi Box Clipboard

🇬🇧 [English version](README.md)

Estensione per Google Chrome (Manifest V3) con **da 1 a 20 box di appunti persistenti** (6 alla prima installazione).
Copi un testo in un box con `Alt+N` e lo incolli in qualunque campo con la stessa combinazione.
I box restano salvati anche dopo la chiusura del browser.

Tutti i dati restano in `chrome.storage.local`: l'estensione non usa servizi esterni e non invia nulla in rete.

## Installazione

1. **Scarica l'estensione** dalla **[pagina Releases](https://github.com/Dexmodzz/MultiBox/releases/latest)**:
   scarica il file `MultiBox-<versione>.zip` (es. `MultiBox-1.1.1.zip`) ed estrailo
   (otterrai la cartella `MultiBox-<versione>`).

   Chi sviluppa può anche clonare il repository: `git clone https://github.com/Dexmodzz/MultiBox.git`
2. Apri `chrome://extensions` in Chrome (o `brave://extensions` in Brave).
3. Attiva **Modalità sviluppatore** (interruttore in alto a destra).
4. Clicca **Carica estensione non pacchettizzata**.
5. Seleziona la cartella estratta (`MultiBox-<versione>`, quella che contiene `manifest.json`).
6. (Facoltativo, per la pagina di test) nei **Dettagli** dell'estensione attiva
   **Consenti l'accesso agli URL dei file**.

Non spostare né cancellare la cartella: Chrome carica l'estensione da lì a ogni avvio.
Per aggiornarla, scarica il nuovo ZIP dalla [pagina Releases](https://github.com/Dexmodzz/MultiBox/releases/latest),
sostituisci il contenuto della cartella e premi **↻ (Ricarica)** in `chrome://extensions`.

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
Il menu viene inoltre ricreato a ogni avvio del browser.

## Pannello e popup

- In alto a destra di ogni pagina compare un piccolo pulsante con l'icona e un badge con il numero di box pieni.
  Click sul pulsante (o `Alt+M`) apre il pannello; `Esc` o un click fuori lo chiude.
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
- Il popup della toolbar mostra la stessa lista. Sulle pagine `chrome://` e nel Chrome Web Store
  Chrome non permette alle estensioni di agire sulla pagina: il popup lo segnala con un messaggio,
  ma i box restano modificabili.

## Test manuale

Apri `test/test.html` (trascinalo in Chrome; serve l'accesso agli URL dei file, vedi Installazione).

1. **Copia con la scorciatoia**: seleziona il primo paragrafo e premi `Alt+1` → toast "Salvato nel Box 1",
   il badge del pulsante passa a 1.
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
9. **Pannello**: clicca il pulsante in alto a destra (o `Alt+M`), modifica il testo del Box 1 e verifica
   che l'altra scheda / il popup si aggiornino; prova **Copia negli appunti**, **Svuota**, `Esc`.
10. **Aggiungi/elimina**: premi **+** fino a 20 box (poi il pulsante si disattiva); tieni premuto un box
    per 1 secondo, clicca il cestino e verifica che i box successivi vengano rinumerati e che il menu
    contestuale si aggiorni. Con un solo box il cestino non compare.
11. **Backup**: **Esporta JSON**, svuota un box, **Importa JSON** con il file scaricato.
12. **Pagine protette**: apri `chrome://extensions` e clicca l'icona dell'estensione → il popup
    mostra il messaggio che la pagina non è supportata.
13. **Persistenza**: chiudi completamente Chrome, riaprilo e verifica (badge, pannello o popup)
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
| `README.md` | Versione inglese di questo README |

## Formato del backup

```json
{
  "app": "Multi Box Clipboard",
  "version": "1.1.1",
  "exportedAt": "2026-01-01T12:00:00.000Z",
  "boxes": [{ "id": 1, "text": "..." }, { "id": 2, "text": "" }]
}
```
