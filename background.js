/*
 * Multi Box Clipboard - service worker.
 *   - Crea il menu contestuale "Multi Box" (Copia nel Box N / Incolla dal Box N).
 *   - Inoltra i comandi al content script del frame corretto (info.frameId).
 * Nessun dato lascia il browser: tutto resta in chrome.storage.local.
 */
'use strict';

importScripts('panel.js'); // MBC: getBoxes, setBoxText, ...

const MBC = globalThis.MBC;
const PARENT_ID = 'mbc-parent';
const COPY_MENU_ID = 'mbc-copy';
const PASTE_MENU_ID = 'mbc-paste';

/* -------------------------------------------------------------------- */
/* Menu contestuale                                                      */
/* -------------------------------------------------------------------- */

function createMenu(props) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(props, () => {
      void chrome.runtime.lastError; // es. id duplicato: ignorato
      resolve();
    });
  });
}

let menuBuild = Promise.resolve();

/**
 * Ricrea il menu (removeAll prima di create). Struttura:
 *
 *   Multi Box
 *   ├─ Copia nel   (solo con testo selezionato)
 *   │   ├─ Box 1 … Box N
 *   └─ Incolla da  (solo in un campo modificabile)
 *       ├─ Box 1 … Box N
 *
 * N è il numero di box esistenti (da 1 a 20): il menu si allunga o si
 * accorcia quando aggiungi o elimini box dal pannello o dal popup.
 * Le ricostruzioni vengono messe in coda per non sovrapporsi.
 */
let rebuildPending = false;

function buildMenus() {
  if (rebuildPending) return menuBuild; // una ricostruzione è già in coda
  rebuildPending = true;
  menuBuild = menuBuild.then(async () => {
    rebuildPending = false;
    const boxes = await MBC.getBoxes();
    await chrome.contextMenus.removeAll();
    await createMenu({ id: PARENT_ID, title: 'Multi Box', contexts: ['selection', 'editable'] });
    await createMenu({ id: COPY_MENU_ID, parentId: PARENT_ID, title: 'Copia nel', contexts: ['selection'] });
    await createMenu({ id: PASTE_MENU_ID, parentId: PARENT_ID, title: 'Incolla da', contexts: ['editable'] });
    for (const box of boxes) {
      await createMenu({ id: 'copy-' + box.id, parentId: COPY_MENU_ID, title: 'Box ' + box.id, contexts: ['selection'] });
    }
    for (const box of boxes) {
      await createMenu({ id: 'paste-' + box.id, parentId: PASTE_MENU_ID, title: 'Box ' + box.id, contexts: ['editable'] });
    }
  }).catch((err) => console.error('[Multi Box] creazione menu non riuscita', err));
  return menuBuild;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  // Prima installazione: inizializza i 6 box vuoti (senza toccare dati esistenti).
  if (details.reason === 'install') {
    const data = await chrome.storage.local.get(MBC.STORAGE_KEY);
    if (!Array.isArray(data[MBC.STORAGE_KEY])) {
      await chrome.storage.local.set({ [MBC.STORAGE_KEY]: MBC.defaultBoxes() });
    }
  }
  buildMenus();
});

chrome.runtime.onStartup.addListener(buildMenus);

// A ogni avvio del service worker il menu viene riallineato ai box salvati:
// il browser può aver ripristinato un menu vecchio della sessione precedente.
buildMenus();

// Box aggiunti o eliminati: il menu segue il nuovo numero di box.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[MBC.STORAGE_KEY]) return;
  const count = MBC.normalizeBoxes(changes[MBC.STORAGE_KEY].newValue).length;
  const oldValue = changes[MBC.STORAGE_KEY].oldValue;
  const oldCount = Array.isArray(oldValue) ? MBC.normalizeBoxes(oldValue).length : -1;
  if (count !== oldCount) buildMenus();
});

/* -------------------------------------------------------------------- */
/* Comunicazione con i content script                                    */
/* -------------------------------------------------------------------- */

function sendToFrame(tabId, message, frameId) {
  return chrome.tabs.sendMessage(tabId, message, { frameId: frameId || 0 });
}

/** Inietta i content script in un frame (pagine aperte prima dell'installazione). */
async function injectIntoFrame(tabId, frameId) {
  const target = { tabId, frameIds: [frameId || 0] };
  await chrome.scripting.insertCSS({ target, files: ['panel.css'] }).catch(() => {});
  await chrome.scripting.executeScript({ target, files: ['panel.js', 'content.js'] });
}

/** Invia un messaggio; se il content script non risponde lo inietta e riprova. */
async function sendWithInjection(tabId, message, frameId) {
  try {
    return await sendToFrame(tabId, message, frameId);
  } catch (_) {
    await injectIntoFrame(tabId, frameId);
    return sendToFrame(tabId, message, frameId);
  }
}

function toast(tabId, frameId, message, warn, boxId) {
  sendToFrame(tabId, { type: 'toast', message, warn: !!warn, boxId: boxId || 0 }, frameId).catch(() => {});
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const match = /^(copy|paste)-(\d+)$/.exec(String(info.menuItemId));
  if (!match) return;
  const action = match[1];
  const id = Number(match[2]);
  const tabId = tab && tab.id;
  const frameId = typeof info.frameId === 'number' ? info.frameId : 0;

  // Voce di un box che non esiste più (menu non aggiornato): correggi il menu.
  const current = await MBC.getBoxes();
  if (id > current.length) {
    buildMenus();
    if (tabId != null && tabId >= 0) toast(tabId, frameId, 'Il Box ' + id + ' non esiste più', true);
    return;
  }

  if (action === 'copy') {
    // info.selectionText può perdere gli a-capo: se possibile chiediamo
    // al content script il testo esatto selezionato nel frame.
    let text = info.selectionText || '';
    if (tabId != null && tabId >= 0) {
      try {
        const res = await sendToFrame(tabId, { type: 'getSelection' }, frameId);
        if (res && typeof res.text === 'string' && res.text) text = res.text;
      } catch (_) { /* content script assente: usiamo selectionText */ }
    }
    if (!text) return;
    try {
      await MBC.setBoxText(id, text);
      if (tabId != null && tabId >= 0) toast(tabId, frameId, 'Salvato nel Box ' + id, false, id);
    } catch (err) {
      console.error('[Multi Box] salvataggio non riuscito', err);
    }
    return;
  }

  // action === 'paste'
  if (tabId == null || tabId < 0) return;
  try {
    const res = await sendWithInjection(tabId, { type: 'pasteBox', id }, frameId);
    if (res && !res.ok && res.reason === 'not-editable') {
      toast(tabId, frameId, 'Nessun campo di testo attivo', true);
    }
  } catch (err) {
    console.warn('[Multi Box] impossibile incollare in questo frame:', err && err.message);
  }
});

/* -------------------------------------------------------------------- */
/* Messaggi dai content script                                           */
/* -------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Alt+M premuto dentro un iframe: il pannello vive nel frame principale.
  if (msg && msg.type === 'togglePanel' && sender.tab && sender.tab.id != null) {
    sendToFrame(sender.tab.id, { type: 'togglePanel' }, 0).catch(() => {});
  }
  // Box aggiunti/eliminati/importati dal pannello o dal popup.
  if (msg && msg.type === 'syncMenus') buildMenus();
  return false;
});
