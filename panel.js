/*
 * Multi Box Clipboard - logica condivisa.
 *
 * Questo file viene caricato in tre contesti diversi:
 *   - come content script (prima di content.js), dentro ogni pagina/frame;
 *   - come <script> nel popup (popup.html);
 *   - nel service worker tramite importScripts('panel.js').
 * Per questo espone tutto su globalThis.MBC e non tocca window/document
 * al livello superiore (il service worker non li ha).
 *
 * Sicurezza: il DOM viene costruito solo con createElement/textContent/value,
 * mai con innerHTML.
 */
(() => {
  'use strict';

  if (globalThis.MBC) return; // evita doppia inizializzazione (iniezione ripetuta)

  const STORAGE_KEY = 'boxes';
  const SETTINGS_KEY = 'settings';
  const DEFAULT_BOX_COUNT = 6; // box presenti alla prima installazione
  const MIN_BOXES = 1;
  const MAX_BOXES = 20;
  const SAVE_DEBOUNCE_MS = 300;

  /* ------------------------------------------------------------------ */
  /* Traduzioni (inglese / italiano)                                     */
  /* ------------------------------------------------------------------ */

  const LANGUAGES = ['en', 'it'];

  const STRINGS = {
    en: {
      appTitle: 'Multi Box',
      close: 'Close (Esc)',
      closeAria: 'Close',
      settings: 'Settings',
      exportJson: 'Export JSON',
      exportTitle: 'Download a backup of your boxes',
      importJson: 'Import JSON',
      importTitle: 'Restore boxes from a backup',
      addBox: 'Add a box',
      addBoxTitle: 'Add a box ({n}/{max})',
      maxReached: 'You have reached the maximum of {max} boxes',
      togglePanelHint: 'Opens and closes the panel',
      holdToDelete: 'Press and hold for 1 second to delete this box',
      boxTitle: 'Box {n}',
      copyToClipboard: 'Copy to clipboard',
      copied: 'Copied',
      clear: 'Clear',
      deleteBox: 'Delete Box {n}',
      kbdTitle: 'Select some text and press {key} to save it here; with no selection it pastes',
      placeholderKey: 'Empty — select some text and press {key}',
      placeholderNoKey: 'Empty — type here or use the right-click menu',
      textareaAria: 'Text of Box {n}',
      charOne: '1 character',
      charMany: '{n} characters',
      boxesOne: '1 box',
      boxesMany: '{n} boxes',
      summaryEmpty: '{total} · all empty',
      summaryFull: '{full} of {total} full',
      copyFailed: 'Copy failed',
      boxCleared: 'Box {n} cleared',
      atLeastOne: 'At least one box must remain',
      boxDeleted: 'Box {n} deleted',
      boxAdded: 'Added Box {n}',
      backupExported: 'Backup exported',
      exportFailed: 'Export failed: {msg}',
      imported: 'Imported {total} boxes ({full} full)',
      importFailed: 'Import failed: {msg}',
      fileTooBig: 'File too large (max 5 MB).',
      invalidJson: 'The file does not contain valid JSON.',
      unknownFormat: 'Unrecognized format: the "boxes" list is missing.',
      noValidBox: 'No valid box in the file.',
      extReloaded: 'The extension was reloaded: refresh the page.',
      boxMissing: 'Box {n} does not exist',
      boxMissingAdd: 'Box {n} does not exist: add it with + in the panel',
      boxGone: 'Box {n} no longer exists',
      savedTo: 'Saved to Box {n}',
      pastedFrom: 'Pasted from Box {n}',
      boxEmpty: 'Box {n} is empty',
      saveFailed: 'Save failed',
      noField: 'No active text field',
      fabTitle: 'Multi Box Clipboard (Alt+M)',
      fabAria: 'Open Multi Box Clipboard ({n} full boxes)',
      menuCopy: 'Copy to',
      menuPaste: 'Paste from',
      settingsTitle: 'Settings',
      language: 'Language',
      pageButton: 'Button on web pages',
      pageButtonDesc: 'Show the Multi Box button in the top-right corner of web pages. Alt+M always opens the panel.',
      done: 'Done',
      langEn: 'English',
      langIt: 'Italiano',
      bannerRestricted: 'Chrome does not allow extensions to work on this page (chrome:// pages and the Chrome Web Store): shortcuts, the panel and the right-click menu are not available. You can still edit your boxes below.',
      bannerFile: 'To use the shortcuts on local files, turn on "Allow access to file URLs" in the extension details (chrome://extensions), then reload the page.',
      bannerInactive: 'Shortcuts are not active on this page (protected page or still loading). Try reloading it. You can still edit your boxes below.',
      bannerFull: 'Use "Import JSON" to restore a backup. Changes are shared with the popup and the panel.',
      fullPageTitle: 'Multi Box Clipboard — Boxes',
    },
    it: {
      appTitle: 'Multi Box',
      close: 'Chiudi (Esc)',
      closeAria: 'Chiudi',
      settings: 'Impostazioni',
      exportJson: 'Esporta JSON',
      exportTitle: 'Scarica un backup dei box',
      importJson: 'Importa JSON',
      importTitle: 'Ripristina i box da un backup',
      addBox: 'Aggiungi un box',
      addBoxTitle: 'Aggiungi un box ({n}/{max})',
      maxReached: 'Hai raggiunto il massimo di {max} box',
      togglePanelHint: 'Apre e chiude il pannello',
      holdToDelete: 'Tieni premuto per 1 secondo per eliminare il box',
      boxTitle: 'Box {n}',
      copyToClipboard: 'Copia negli appunti',
      copied: 'Copiato',
      clear: 'Svuota',
      deleteBox: 'Elimina il Box {n}',
      kbdTitle: 'Seleziona un testo e premi {key} per salvarlo qui; senza selezione incolla',
      placeholderKey: 'Vuoto — seleziona un testo e premi {key}',
      placeholderNoKey: 'Vuoto — scrivi qui o usa il menu del tasto destro',
      textareaAria: 'Testo del Box {n}',
      charOne: '1 carattere',
      charMany: '{n} caratteri',
      boxesOne: '1 box',
      boxesMany: '{n} box',
      summaryEmpty: '{total} · tutti vuoti',
      summaryFull: '{full} di {total} pieni',
      copyFailed: 'Copia non riuscita',
      boxCleared: 'Box {n} svuotato',
      atLeastOne: 'Deve restare almeno un box',
      boxDeleted: 'Box {n} eliminato',
      boxAdded: 'Aggiunto il Box {n}',
      backupExported: 'Backup esportato',
      exportFailed: 'Esportazione non riuscita: {msg}',
      imported: 'Importati {total} box ({full} pieni)',
      importFailed: 'Importazione non riuscita: {msg}',
      fileTooBig: 'File troppo grande (max 5 MB).',
      invalidJson: 'Il file non contiene JSON valido.',
      unknownFormat: 'Formato non riconosciuto: manca l\'elenco "boxes".',
      noValidBox: 'Nessun box valido nel file.',
      extReloaded: 'L\'estensione è stata ricaricata: aggiorna la pagina.',
      boxMissing: 'Il Box {n} non esiste',
      boxMissingAdd: 'Il Box {n} non esiste: aggiungilo con + nel pannello',
      boxGone: 'Il Box {n} non esiste più',
      savedTo: 'Salvato nel Box {n}',
      pastedFrom: 'Incollato dal Box {n}',
      boxEmpty: 'Box {n} vuoto',
      saveFailed: 'Salvataggio non riuscito',
      noField: 'Nessun campo di testo attivo',
      fabTitle: 'Multi Box Clipboard (Alt+M)',
      fabAria: 'Apri Multi Box Clipboard ({n} box pieni)',
      menuCopy: 'Copia nel',
      menuPaste: 'Incolla da',
      settingsTitle: 'Impostazioni',
      language: 'Lingua',
      pageButton: 'Pulsante nelle pagine web',
      pageButtonDesc: 'Mostra il pulsante Multi Box in alto a destra nelle pagine web. Alt+M apre sempre il pannello.',
      done: 'Fatto',
      langEn: 'English',
      langIt: 'Italiano',
      bannerRestricted: 'Su questa pagina Chrome non permette alle estensioni di funzionare (pagine chrome:// e Chrome Web Store): scorciatoie, pannello e menu del tasto destro non sono disponibili. Puoi comunque modificare i box qui sotto.',
      bannerFile: 'Per usare le scorciatoie sui file locali attiva "Consenti l\'accesso agli URL dei file" nei dettagli dell\'estensione (chrome://extensions), poi ricarica la pagina.',
      bannerInactive: 'Le scorciatoie non sono attive su questa pagina (pagina protetta o non ancora caricata). Prova a ricaricarla. Puoi comunque modificare i box qui sotto.',
      bannerFull: 'Usa "Importa JSON" per ripristinare un backup. Le modifiche sono condivise con popup e pannello.',
      fullPageTitle: 'Multi Box Clipboard — Box',
    },
  };

  /* ------------------------------------------------------------------ */
  /* Impostazioni                                                        */
  /* ------------------------------------------------------------------ */

  const DEFAULT_SETTINGS = Object.freeze({
    language: 'en', // lingua dell'interfaccia: 'en' | 'it'
    showPageButton: false, // pulsante flottante nelle pagine web (nascosto di default)
  });

  function normalizeSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      language: LANGUAGES.includes(s.language) ? s.language : DEFAULT_SETTINGS.language,
      showPageButton: typeof s.showPageButton === 'boolean' ? s.showPageButton : DEFAULT_SETTINGS.showPageButton,
    };
  }

  let currentSettings = normalizeSettings(null);

  function isContextValid() {
    try {
      return !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  async function loadSettings() {
    if (!isContextValid()) return currentSettings;
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    currentSettings = normalizeSettings(data[SETTINGS_KEY]);
    return currentSettings;
  }

  function getSettings() {
    return Object.assign({}, currentSettings);
  }

  /** Testo tradotto nella lingua scelta, con segnaposto {nome}. */
  function t(key, params) {
    const table = STRINGS[currentSettings.language] || STRINGS.en;
    let text = table[key] != null ? table[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
    if (params) {
      text = text.replace(/\{(\w+)\}/g, (m, name) => (params[name] != null ? String(params[name]) : m));
    }
    return text;
  }

  function locale() {
    return currentSettings.language === 'it' ? 'it-IT' : 'en-US';
  }

  // Mantiene le impostazioni aggiornate in questo contesto. È registrato per primo,
  // così chi ascolta dopo (pannello, menu, content script) legge già i valori nuovi.
  if (isContextValid()) {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[SETTINGS_KEY]) {
          currentSettings = normalizeSettings(changes[SETTINGS_KEY].newValue);
        }
      });
    } catch (_) { /* contesto non valido */ }
  }

  /** Promessa risolta quando le impostazioni sono state lette. */
  const ready = loadSettings().catch(() => currentSettings);

  /** Chiama cb(nuove, vecchie) quando cambiano le impostazioni. */
  function onSettingsChanged(cb) {
    if (!isContextValid()) return () => {};
    const listener = (changes, area) => {
      if (area !== 'local' || !changes[SETTINGS_KEY]) return;
      cb(normalizeSettings(changes[SETTINGS_KEY].newValue), normalizeSettings(changes[SETTINGS_KEY].oldValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      try { chrome.storage.onChanged.removeListener(listener); } catch (_) { /* contesto invalido */ }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Modello dei dati                                                    */
  /* ------------------------------------------------------------------ */
  /*
   * I box sono posizionali: l'id coincide sempre con la posizione (1..n).
   * Eliminando un box, quelli successivi scalano di un posto, così
   * "Box N" corrisponde sempre ad Alt+N.
   */

  function defaultBoxes(count = DEFAULT_BOX_COUNT) {
    const boxes = [];
    for (let id = 1; id <= count; id++) boxes.push({ id, text: '' });
    return boxes;
  }

  /** Restituisce da 1 a 20 box {id: 1..n, text: string}, qualunque sia l'input. */
  function normalizeBoxes(raw) {
    if (!Array.isArray(raw)) return defaultBoxes();
    const items = raw
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const id = Number(item.id);
        return {
          order: Number.isFinite(id) ? id : index + 1,
          index,
          text: item.text == null ? '' : String(item.text),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .slice(0, MAX_BOXES);
    if (items.length < MIN_BOXES) return defaultBoxes();
    return items.map((item, i) => ({ id: i + 1, text: item.text }));
  }

  async function getBoxes() {
    if (!isContextValid()) return defaultBoxes();
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeBoxes(data[STORAGE_KEY]);
  }

  // Le scritture dello stesso contesto vengono messe in coda, così due
  // salvataggi ravvicinati (read-modify-write) non si sovrascrivono a vicenda.
  let writeQueue = Promise.resolve();
  function enqueue(task) {
    const run = writeQueue.then(task, task);
    writeQueue = run.catch(() => {});
    return run;
  }

  /**
   * Avvisa il service worker che il menu contestuale va ricostruito (numero di
   * box o lingua cambiati). Un messaggio sveglia sempre il service worker
   * (storage.onChanged da solo non sempre basta). Nel service worker stesso
   * il messaggio non ha destinatari e l'errore viene ignorato.
   */
  function notifyMenusChanged() {
    try {
      const p = chrome.runtime.sendMessage({ type: 'syncMenus' });
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* contesto non valido */ }
  }

  function assertContext() {
    if (!isContextValid()) throw new Error(t('extReloaded'));
  }

  /** Aggiorna le impostazioni (unione con quelle salvate). */
  function setSettings(patch) {
    return enqueue(async () => {
      assertContext();
      const data = await chrome.storage.local.get(SETTINGS_KEY);
      const before = normalizeSettings(data[SETTINGS_KEY]);
      const next = normalizeSettings(Object.assign({}, before, patch));
      await chrome.storage.local.set({ [SETTINGS_KEY]: next });
      currentSettings = next;
      if (next.language !== before.language) notifyMenusChanged();
      return next;
    });
  }

  function setAllBoxes(boxes) {
    return enqueue(async () => {
      assertContext();
      const normalized = normalizeBoxes(boxes);
      await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
      notifyMenusChanged();
      return normalized;
    });
  }

  function setBoxText(id, text) {
    return enqueue(async () => {
      assertContext();
      const n = Number(id);
      const boxes = await getBoxes();
      if (!Number.isInteger(n) || n < 1 || n > boxes.length) throw new Error(t('boxMissing', { n: id }));
      boxes[n - 1].text = text == null ? '' : String(text);
      await chrome.storage.local.set({ [STORAGE_KEY]: boxes });
      return boxes;
    });
  }

  /** Aggiunge un box vuoto in fondo (massimo 20). */
  function addBox() {
    return enqueue(async () => {
      assertContext();
      const boxes = await getBoxes();
      if (boxes.length >= MAX_BOXES) throw new Error(t('maxReached', { max: MAX_BOXES }));
      boxes.push({ id: boxes.length + 1, text: '' });
      await chrome.storage.local.set({ [STORAGE_KEY]: boxes });
      notifyMenusChanged();
      return boxes;
    });
  }

  /** Elimina il box `id`; i successivi scalano di un posto. Ne resta sempre almeno 1. */
  function removeBox(id) {
    return enqueue(async () => {
      assertContext();
      const n = Number(id);
      const boxes = await getBoxes();
      if (boxes.length <= MIN_BOXES) throw new Error(t('atLeastOne'));
      if (!Number.isInteger(n) || n < 1 || n > boxes.length) throw new Error(t('boxMissing', { n: id }));
      boxes.splice(n - 1, 1);
      const renumbered = boxes.map((b, i) => ({ id: i + 1, text: b.text }));
      await chrome.storage.local.set({ [STORAGE_KEY]: renumbered });
      notifyMenusChanged();
      return renumbered;
    });
  }

  /** Chiama cb(boxes) ogni volta che i box cambiano (in qualunque scheda/contesto). */
  function onBoxesChanged(cb) {
    if (!isContextValid()) return () => {};
    const listener = (changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      cb(normalizeBoxes(changes[STORAGE_KEY].newValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      try { chrome.storage.onChanged.removeListener(listener); } catch (_) { /* contesto invalido */ }
    };
  }

  function countFull(boxes) {
    return boxes.filter((b) => b.text.length > 0).length;
  }

  /* ------------------------------------------------------------------ */
  /* Utilità                                                             */
  /* ------------------------------------------------------------------ */

  function debounce(fn, ms) {
    let timer = null;
    let lastArgs = null;
    const debounced = (...args) => {
      lastArgs = args;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn(...lastArgs);
      }, ms);
    };
    debounced.flush = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      fn(...lastArgs);
    };
    debounced.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    debounced.pending = () => timer !== null;
    return debounced;
  }

  /** Copia negli appunti di sistema; fallback a execCommand se l'API asincrona non è disponibile. */
  async function copyToClipboard(text, fallbackParent) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* proviamo il fallback */ }
    const parent = fallbackParent || document.body || document.documentElement;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    parent.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ------------------------------------------------------------------ */
  /* Costruzione del DOM (solo createElement / textContent)              */
  /* ------------------------------------------------------------------ */

  /** Colore distintivo di ogni box (usato da pannello e toast). */
  const BOX_COLORS = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9',
    '#a855f7', '#14b8a6', '#f97316', '#3b82f6', '#84cc16',
  ];

  function boxColor(id) {
    return BOX_COLORS[(Number(id) - 1) % BOX_COLORS.length] || BOX_COLORS[0];
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Icone in stile "outline" (tracciati 24x24), costruite come nodi SVG.
  const ICONS = {
    copy: ['M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
    check: ['M20 6 9 17l-5-5'],
    eraser: ['M7 21h12', 'M5.6 13.4 13.4 5.6a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 18H8.4a2 2 0 0 1-1.4-.6l-1.4-1.4a2 2 0 0 1 0-2.6z', 'm9 10 5 5'],
    trash: ['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
    download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
    upload: ['M12 21V9', 'm7 14 5-5 5 5', 'M5 3h14'],
    close: ['M18 6 6 18', 'M6 6l12 12'],
    plus: ['M12 5v14', 'M5 12h14'],
    settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
    alert: ['M12 8v5', 'M12 16.5v.5', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  };

  function icon(name, className) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'mbc-icon' + (className ? ' ' + className : ''));
    (ICONS[name] || []).forEach((d) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  function button(className, label, iconName, title) {
    const b = el('button', 'mbc-btn ' + (className || ''));
    b.type = 'button';
    if (iconName) b.appendChild(icon(iconName));
    if (label) b.appendChild(el('span', 'mbc-btn-label', label));
    if (title) b.title = title;
    return b;
  }

  function isMac() {
    try {
      const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
      return /mac/i.test(p);
    } catch (_) {
      return false;
    }
  }

  function shortcutLabel(key) {
    return (isMac() ? '⌥' : 'Alt+') + key;
  }

  /** Tasto numerico associato al box: 1..9 -> "1".."9", 10 -> "0", oltre nessuno. */
  function boxShortcutKey(id) {
    if (id >= 1 && id <= 9) return String(id);
    if (id === 10) return '0';
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Bandiere (SVG costruiti come nodi: le emoji delle bandiere non       */
  /* vengono mostrate su tutti i sistemi, es. Linux)                     */
  /* ------------------------------------------------------------------ */

  function svgNode(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    return node;
  }

  function flag(lang) {
    const wrap = el('span', 'mbc-flag');
    wrap.setAttribute('aria-hidden', 'true');
    let svg;
    if (lang === 'it') {
      svg = svgNode('svg', { viewBox: '0 0 3 2', preserveAspectRatio: 'xMidYMid slice' });
      svg.append(
        svgNode('rect', { x: '0', y: '0', width: '1', height: '2', fill: '#009246' }),
        svgNode('rect', { x: '1', y: '0', width: '1', height: '2', fill: '#ffffff' }),
        svgNode('rect', { x: '2', y: '0', width: '1', height: '2', fill: '#ce2b37' }),
      );
    } else {
      // Union Jack (semplificata per le dimensioni ridotte)
      svg = svgNode('svg', { viewBox: '0 0 60 30', preserveAspectRatio: 'xMidYMid slice' });
      svg.append(
        svgNode('rect', { width: '60', height: '30', fill: '#012169' }),
        svgNode('path', { d: 'M0,0 L60,30 M60,0 L0,30', stroke: '#ffffff', 'stroke-width': '6' }),
        svgNode('path', { d: 'M0,0 L60,30 M60,0 L0,30', stroke: '#C8102E', 'stroke-width': '2' }),
        svgNode('path', { d: 'M30,0 V30 M0,15 H60', stroke: '#ffffff', 'stroke-width': '10' }),
        svgNode('path', { d: 'M30,0 V30 M0,15 H60', stroke: '#C8102E', 'stroke-width': '6' }),
      );
    }
    wrap.appendChild(svg);
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Export / Import JSON                                                */
  /* ------------------------------------------------------------------ */

  function buildExport(boxes) {
    let version = '1.0.0';
    try { version = chrome.runtime.getManifest().version; } catch (_) { /* ignora */ }
    return {
      app: 'Multi Box Clipboard',
      version,
      exportedAt: new Date().toISOString(),
      boxes: normalizeBoxes(boxes),
    };
  }

  function parseImport(jsonText) {
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (_) {
      throw new Error(t('invalidJson'));
    }
    const list = Array.isArray(data) ? data : data && data.boxes;
    if (!Array.isArray(list)) throw new Error(t('unknownFormat'));
    const valid = list.some((b) => b && typeof b === 'object' && 'text' in b);
    if (!valid) throw new Error(t('noValidBox'));
    return normalizeBoxes(list);
  }

  function downloadJson(obj, filename, parent) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    parent.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /* ------------------------------------------------------------------ */
  /* Pannello (usato sia nella pagina sia nel popup)                     */
  /* ------------------------------------------------------------------ */

  const LONG_PRESS_MS = 1000; // tenere premuto un box per 1 s mostra il cestino
  const PRESS_INDICATOR_DELAY_MS = 150; // l'indicatore parte dopo un attimo (un click veloce non lo mostra)
  const LONG_PRESS_MOVE_TOLERANCE = 8; // px: oltre, è una selezione/trascinamento
  const DELETE_MODE_TIMEOUT_MS = 6000; // il cestino si nasconde da solo

  /**
   * Costruisce il pannello nella lingua corrente. Usato da renderPanel(),
   * che lo ricostruisce quando cambia la lingua.
   * state.view -> 'list' (default) | 'settings'
   */
  function buildPanel(container, opts, state) {
    const variant = opts.variant || 'page';
    const panel = el('div', 'mbc-panel mbc-panel--' + variant);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Multi Box Clipboard');
    panel.lang = currentSettings.language;
    // Durata dell'animazione di pressione allineata al timer (vedi panel.css).
    panel.style.setProperty('--mbc-press-ms', (LONG_PRESS_MS - PRESS_INDICATOR_DELAY_MS) + 'ms');

    /* ---- Header: logo, titolo, contatore, impostazioni, chiudi ---- */
    const header = el('div', 'mbc-header');
    const logo = document.createElement('img');
    logo.className = 'mbc-logo';
    logo.alt = '';
    try { logo.src = chrome.runtime.getURL('icons/icon48.png'); } catch (_) { /* contesto invalido */ }
    const heading = el('div', 'mbc-heading');
    const title = el('div', 'mbc-title', t('appTitle'));
    const subtitle = el('div', 'mbc-subtitle', '');
    heading.append(title, subtitle);
    const gearBtn = button('mbc-btn--icon mbc-gear', null, 'settings', t('settings'));
    gearBtn.setAttribute('aria-label', t('settings'));
    header.append(logo, heading, gearBtn);
    if (typeof opts.onClose === 'function') {
      const closeBtn = button('mbc-btn--icon mbc-close', null, 'close', t('close'));
      closeBtn.setAttribute('aria-label', t('closeAria'));
      closeBtn.addEventListener('click', () => opts.onClose());
      header.appendChild(closeBtn);
    }
    panel.appendChild(header);

    const progress = el('div', 'mbc-progress');
    progress.setAttribute('aria-hidden', 'true');
    panel.appendChild(progress);

    /* ---- Lista dei box ---- */
    const list = el('div', 'mbc-list');
    panel.appendChild(list);

    /* ---- Vista impostazioni ---- */
    const settingsView = el('div', 'mbc-settings');
    settingsView.hidden = true;
    panel.appendChild(settingsView);

    /* ---- Notifica interna (stato operazioni) ---- */
    const status = el('div', 'mbc-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    panel.appendChild(status);

    let statusTimer = null;
    function setStatus(msg, isError) {
      status.textContent = msg;
      status.classList.toggle('mbc-status--error', !!isError);
      status.classList.add('mbc-status--visible');
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => status.classList.remove('mbc-status--visible'), 2600);
    }

    /* ---- Footer: backup, aggiungi box, scorciatoia ---- */
    const footer = el('div', 'mbc-footer');
    const exportBtn = button('mbc-btn--soft', t('exportJson'), 'download', t('exportTitle'));
    const importBtn = button('mbc-btn--soft', t('importJson'), 'upload', t('importTitle'));
    const addBtn = button('mbc-btn--add', null, 'plus', t('addBox'));
    addBtn.setAttribute('aria-label', t('addBox'));
    const hint = el('span', 'mbc-hint', shortcutLabel('M'));
    hint.title = t('togglePanelHint');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.className = 'mbc-hidden';
    footer.append(exportBtn, importBtn, addBtn, hint, fileInput);
    panel.appendChild(footer);

    /* ---------------------------------------------------------------- */
    /* Impostazioni                                                      */
    /* ---------------------------------------------------------------- */

    const langButtons = {};
    let pageSwitch = null;

    function buildSettings() {
      settingsView.append(el('div', 'mbc-settings-title', t('settingsTitle')));

      // Lingua: due pulsanti con bandiera.
      const langSection = el('div', 'mbc-settings-section');
      langSection.append(el('div', 'mbc-settings-label', t('language')));
      const langRow = el('div', 'mbc-lang-row');
      [['en', t('langEn')], ['it', t('langIt')]].forEach(([code, name]) => {
        const b = el('button', 'mbc-lang');
        b.type = 'button';
        b.append(flag(code), el('span', 'mbc-lang-name', name));
        b.lang = code;
        b.addEventListener('click', () => {
          if (currentSettings.language === code) return;
          setSettings({ language: code }).catch((err) => setStatus(err.message, true));
        });
        langButtons[code] = b;
        langRow.appendChild(b);
      });
      langSection.appendChild(langRow);

      // Pulsante nelle pagine: interruttore.
      const pageSection = el('div', 'mbc-settings-section mbc-setting-row');
      const textWrap = el('div', 'mbc-setting-text');
      const switchLabelId = 'mbc-page-switch-' + Math.random().toString(36).slice(2);
      const label = el('div', 'mbc-settings-label', t('pageButton'));
      label.id = switchLabelId;
      textWrap.append(label, el('div', 'mbc-setting-desc', t('pageButtonDesc')));
      pageSwitch = el('button', 'mbc-switch');
      pageSwitch.type = 'button';
      pageSwitch.setAttribute('role', 'switch');
      pageSwitch.setAttribute('aria-labelledby', switchLabelId);
      pageSwitch.appendChild(el('span', 'mbc-switch-knob'));
      pageSwitch.addEventListener('click', () => {
        setSettings({ showPageButton: !currentSettings.showPageButton })
          .catch((err) => setStatus(err.message, true));
      });
      pageSection.append(textWrap, pageSwitch);

      const doneBtn = button('mbc-btn--primary mbc-settings-done', t('done'), 'check');
      doneBtn.addEventListener('click', () => setView('list'));

      let version = '';
      try { version = 'v' + chrome.runtime.getManifest().version; } catch (_) { /* ignora */ }
      const about = el('div', 'mbc-settings-about', 'Multi Box Clipboard ' + version);

      const bottom = el('div', 'mbc-settings-bottom');
      bottom.append(about, doneBtn);
      settingsView.append(langSection, pageSection, bottom);
      applySettings(currentSettings);
    }

    function applySettings(s) {
      Object.keys(langButtons).forEach((code) => {
        const on = s.language === code;
        langButtons[code].classList.toggle('mbc-lang--on', on);
        langButtons[code].setAttribute('aria-pressed', String(on));
      });
      if (pageSwitch) pageSwitch.setAttribute('aria-checked', String(!!s.showPageButton));
    }

    let view = 'list';
    function setView(next) {
      view = next === 'settings' ? 'settings' : 'list';
      const inSettings = view === 'settings';
      settingsView.hidden = !inSettings;
      list.hidden = inSettings;
      progress.hidden = inSettings;
      footer.hidden = inSettings;
      gearBtn.classList.toggle('mbc-btn--active', inSettings);
      gearBtn.setAttribute('aria-pressed', String(inSettings));
      if (!inSettings) {
        entries.forEach((e) => autoGrow(e.textarea));
        fitLayout(true);
      }
    }

    gearBtn.addEventListener('click', () => setView(view === 'settings' ? 'list' : 'settings'));

    /* ---------------------------------------------------------------- */
    /* Card dei box                                                      */
    /* ---------------------------------------------------------------- */

    const entries = []; // posizionali: entries[i] è il Box i+1

    function createEntry() {
      const row = el('div', 'mbc-row');
      const card = el('div', 'mbc-card');
      card.title = t('holdToDelete');

      const head = el('div', 'mbc-card-head');
      const chip = el('span', 'mbc-chip');
      const cardTitle = el('span', 'mbc-card-title');
      const count = el('span', 'mbc-count', '');
      const kbd = el('kbd', 'mbc-kbd');
      // Versione compatta (popup): copia/svuota come icone nell'intestazione.
      const headActions = el('span', 'mbc-head-actions');
      const headCopyBtn = button('mbc-btn--icon mbc-head-btn', null, 'copy', t('copyToClipboard'));
      headCopyBtn.setAttribute('aria-label', t('copyToClipboard'));
      const headClearBtn = button('mbc-btn--icon mbc-head-btn mbc-btn--danger', null, 'eraser', t('clear'));
      headClearBtn.setAttribute('aria-label', t('clear'));
      headActions.append(headCopyBtn, headClearBtn);
      // Ordine: numero, titolo (occupa lo spazio libero), contatore, icone, scorciatoia sempre a destra.
      head.append(chip, cardTitle, count, headActions, kbd);

      const textarea = document.createElement('textarea');
      textarea.className = 'mbc-textarea';
      textarea.rows = 1;
      textarea.wrap = 'soft';
      textarea.spellcheck = false;

      const actions = el('div', 'mbc-actions');
      const copyBtn = button('mbc-btn--primary', t('copyToClipboard'), 'copy');
      const clearBtn = button('mbc-btn--ghost mbc-btn--danger', t('clear'), 'trash');
      actions.append(copyBtn, clearBtn);
      card.append(head, textarea, actions);

      // Cestino affiancato al box: compare solo dopo la pressione prolungata.
      const trashBtn = button('mbc-trash', null, 'trash');
      trashBtn.tabIndex = -1;

      row.append(card, trashBtn);

      const entry = {
        id: 0, row, card, chip, cardTitle, count, kbd, textarea, copyBtn, clearBtn, trashBtn,
        headCopyBtn, headClearBtn,
        copyTimer: null, pressTimer: null, pressShowTimer: null, deleteTimer: null, pressStart: null,
      };
      entry.save = debounce((value) => {
        setBoxText(entry.id, value).catch((err) => setStatus(err.message, true));
      }, SAVE_DEBOUNCE_MS);

      textarea.addEventListener('input', () => {
        updateCard(entry, textarea.value);
        updateSummary();
        entry.save(textarea.value);
      });
      textarea.addEventListener('blur', () => entry.save.flush());

      async function copyBox() {
        const text = textarea.value;
        if (!text) return;
        const ok = await copyToClipboard(text, panel);
        if (!ok) {
          setStatus(t('copyFailed'), true);
          return;
        }
        // Feedback: spunta verde per 1,5 s (sia sul pulsante sia sull'icona compatta).
        copyBtn.classList.add('mbc-btn--done');
        copyBtn.replaceChildren(icon('check'), el('span', 'mbc-btn-label', t('copied')));
        headCopyBtn.classList.add('mbc-btn--done');
        headCopyBtn.replaceChildren(icon('check'));
        clearTimeout(entry.copyTimer);
        entry.copyTimer = setTimeout(() => {
          copyBtn.classList.remove('mbc-btn--done');
          copyBtn.replaceChildren(icon('copy'), el('span', 'mbc-btn-label', t('copyToClipboard')));
          headCopyBtn.classList.remove('mbc-btn--done');
          headCopyBtn.replaceChildren(icon('copy'));
        }, 1500);
      }

      function clearBox() {
        entry.save.cancel();
        textarea.value = '';
        updateCard(entry, '');
        updateSummary();
        const id = entry.id;
        setBoxText(id, '')
          .then(() => setStatus(t('boxCleared', { n: id })))
          .catch((err) => setStatus(err.message, true));
      }

      copyBtn.addEventListener('click', copyBox);
      headCopyBtn.addEventListener('click', copyBox);
      clearBtn.addEventListener('click', clearBox);
      headClearBtn.addEventListener('click', clearBox);

      /* ---- Pressione prolungata (1 s) per mostrare il cestino ---- */
      card.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        if (event.target.closest && event.target.closest('.mbc-btn')) return;
        startPress(entry, event);
      });
      card.addEventListener('pointermove', (event) => {
        if (!entry.pressStart) return;
        const dx = event.clientX - entry.pressStart.x;
        const dy = event.clientY - entry.pressStart.y;
        if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) cancelPress(entry);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
        card.addEventListener(type, () => cancelPress(entry));
      });

      trashBtn.addEventListener('click', () => deleteEntry(entry));

      entries.push(entry);
      setIdentity(entry, entries.length);
      list.appendChild(row);
      updateCard(entry, '');
      return entry;
    }

    /** Aggiorna numero, colore, titolo e scorciatoia della card (cambiano dopo un'eliminazione). */
    function setIdentity(entry, id) {
      entry.id = id;
      entry.row.style.setProperty('--mbc-hue', boxColor(id));
      entry.card.style.setProperty('--mbc-i', String(Math.min(id - 1, 12)));
      entry.chip.textContent = String(id);
      entry.cardTitle.textContent = t('boxTitle', { n: id });
      const key = boxShortcutKey(id);
      entry.kbd.hidden = !key;
      if (key) {
        entry.kbd.textContent = shortcutLabel(key);
        entry.kbd.title = t('kbdTitle', { key: shortcutLabel(key) });
        entry.textarea.placeholder = t('placeholderKey', { key: shortcutLabel(key) });
      } else {
        entry.textarea.placeholder = t('placeholderNoKey');
      }
      entry.textarea.setAttribute('aria-label', t('textareaAria', { n: id }));
      entry.trashBtn.title = t('deleteBox', { n: id });
      entry.trashBtn.setAttribute('aria-label', t('deleteBox', { n: id }));
    }

    function startPress(entry, event) {
      cancelPress(entry);
      entry.pressStart = { x: event.clientX, y: event.clientY };
      // Dopo un attimo parte l'indicatore (così un semplice click non lo mostra).
      entry.pressShowTimer = setTimeout(() => entry.card.classList.add('mbc-card--pressing'), PRESS_INDICATOR_DELAY_MS);
      entry.pressTimer = setTimeout(() => {
        cancelPress(entry);
        if (entries.length <= MIN_BOXES) {
          setStatus(t('atLeastOne'), true);
          return;
        }
        showDeleteMode(entry);
      }, LONG_PRESS_MS);
    }

    function cancelPress(entry) {
      clearTimeout(entry.pressTimer);
      clearTimeout(entry.pressShowTimer);
      entry.pressTimer = null;
      entry.pressStart = null;
      entry.card.classList.remove('mbc-card--pressing');
    }

    function showDeleteMode(entry) {
      entries.forEach((e) => { if (e !== entry) hideDeleteMode(e); });
      entry.row.classList.add('mbc-row--delete');
      entry.trashBtn.tabIndex = 0;
      clearTimeout(entry.deleteTimer);
      entry.deleteTimer = setTimeout(() => hideDeleteMode(entry), DELETE_MODE_TIMEOUT_MS);
    }

    function hideDeleteMode(entry) {
      clearTimeout(entry.deleteTimer);
      entry.row.classList.remove('mbc-row--delete');
      entry.trashBtn.tabIndex = -1;
    }

    // Click altrove nel pannello: nasconde il cestino.
    panel.addEventListener('pointerdown', (event) => {
      entries.forEach((e) => {
        if (!e.row.classList.contains('mbc-row--delete')) return;
        if (event.composedPath().includes(e.trashBtn)) return;
        hideDeleteMode(e);
      });
    }, true);

    let busy = false;
    async function deleteEntry(entry) {
      if (busy) return;
      if (entries.length <= MIN_BOXES) {
        setStatus(t('atLeastOne'), true);
        return;
      }
      busy = true;
      const id = entry.id;
      entries.forEach((e) => e.save.flush());
      hideDeleteMode(entry);
      entry.row.classList.add('mbc-row--leaving');
      try {
        await removeBox(id);
        // Rimuove la card e rinumera le successive (Box 5 diventa Box 4, ...).
        await new Promise((r) => setTimeout(r, 180));
        destroyEntry(entry);
        entries.forEach((e, i) => setIdentity(e, i + 1));
        updateSummary();
        setStatus(t('boxDeleted', { n: id }));
      } catch (err) {
        entry.row.classList.remove('mbc-row--leaving');
        setStatus(err.message, true);
      } finally {
        busy = false;
        getBoxes().then(applyBoxes).catch(() => {});
      }
    }

    function destroyEntry(entry) {
      entry.save.cancel();
      cancelPress(entry);
      clearTimeout(entry.deleteTimer);
      clearTimeout(entry.copyTimer);
      const idx = entries.indexOf(entry);
      if (idx >= 0) entries.splice(idx, 1);
      entry.row.remove();
    }

    /* ---------------------------------------------------------------- */
    /* Aggiornamento della vista                                         */
    /* ---------------------------------------------------------------- */

    // Altezza massima di una textarea: illimitata nel pannello della pagina,
    // calcolata da fitLayout() nel popup perché tutto stia senza scorrere.
    let textareaMax = Infinity;

    /**
     * Adatta l'altezza della textarea al testo: va a capo da sola e cresce
     * riga per riga fino a `textareaMax`; solo oltre quel limite il testo
     * scorre dentro il box.
     */
    function autoGrow(textarea) {
      if (!textarea.isConnected || list.hidden) return;
      const scrollTop = list.scrollTop; // evita salti della lista durante il ricalcolo
      textarea.style.height = 'auto';
      const needed = textarea.scrollHeight;
      if (needed > textareaMax) {
        textarea.style.height = textareaMax + 'px';
        textarea.style.overflowY = 'auto';
      } else {
        textarea.style.height = needed + 'px';
        textarea.style.overflowY = 'hidden';
      }
      list.scrollTop = scrollTop;
    }

    /*
     * Popup: tutto deve essere visibile senza scorrere. Il popup del browser
     * è alto al massimo ~600 px (e largo al massimo 800), quindi:
     *   - si sceglie il numero di colonne più piccolo (da 1 a 4) con cui
     *     tutti i box entrano in altezza, lasciando ad ognuno almeno ~2 righe;
     *   - lo spazio verticale viene diviso tra le righe di box e ogni textarea
     *     può crescere solo fino alla sua parte (oltre, scorre il singolo box).
     */
    const MAX_COLUMNS = 4;
    const COMFORT_EXTRA_LINE = 18; // px: spazio per una riga in più oltre al minimo
    let lastLayoutCount = -1;
    function fitLayout(force) {
      if (typeof opts.fitHeight !== 'function' || !panel.isConnected || view !== 'list') return;
      const total = entries.length;
      if (!total || (!force && total === lastLayoutCount)) return;
      lastLayoutCount = total;

      const fit = Math.max(200, Math.floor(opts.fitHeight()));
      panel.style.maxHeight = fit + 'px';

      // Misure con le textarea al minimo.
      textareaMax = Infinity;
      entries.forEach((e) => { e.textarea.style.height = ''; });
      const fixed = panel.offsetHeight - list.offsetHeight; // intestazione, barra, footer, bordi
      const ls = getComputedStyle(list);
      const pad = parseFloat(ls.paddingTop) + parseFloat(ls.paddingBottom);
      const gap = parseFloat(ls.rowGap) || 6;
      const first = entries[0];
      const taMin = parseFloat(getComputedStyle(first.textarea).minHeight) || 20;
      const cardChrome = first.card.offsetHeight - first.textarea.offsetHeight;
      const avail = fit - fixed - pad;

      let cols = Math.min(MAX_COLUMNS, total);
      for (let c = 1; c <= Math.min(MAX_COLUMNS, total); c++) {
        const r = Math.ceil(total / c);
        if (r * (cardChrome + taMin + COMFORT_EXTRA_LINE) + gap * (r - 1) <= avail) {
          cols = c;
          break;
        }
      }
      const rows = Math.ceil(total / cols);
      panel.dataset.cols = String(cols);
      panel.style.setProperty('--mbc-cols', String(cols));

      const rowMax = Math.floor((avail - gap * (rows - 1)) / rows);
      // Arrotonda a un numero intero di righe, così il testo non appare tagliato a metà.
      const tcs = getComputedStyle(first.textarea);
      const lineHeight = parseFloat(tcs.lineHeight) || 18;
      const vpad = parseFloat(tcs.paddingTop) + parseFloat(tcs.paddingBottom);
      const lines = Math.max(1, Math.floor((rowMax - cardChrome - vpad) / lineHeight));
      textareaMax = Math.max(taMin, Math.ceil(lines * lineHeight + vpad));
      entries.forEach((e) => autoGrow(e.textarea));
    }

    function updateCard(entry, text) {
      const len = text.length;
      entry.count.textContent = len === 0 ? '' : len === 1
        ? t('charOne')
        : t('charMany', { n: len.toLocaleString(locale()) });
      entry.card.classList.toggle('mbc-card--empty', len === 0);
      entry.copyBtn.disabled = len === 0;
      entry.clearBtn.disabled = len === 0;
      entry.headCopyBtn.disabled = len === 0;
      entry.headClearBtn.disabled = len === 0;
      autoGrow(entry.textarea);
    }

    function updateSummary() {
      const total = entries.length;
      let full = 0;
      while (progress.children.length < total) progress.appendChild(el('span', 'mbc-seg'));
      while (progress.children.length > total) progress.lastChild.remove();
      entries.forEach((e, i) => {
        const isFull = e.textarea.value.length > 0;
        const seg = progress.children[i];
        seg.style.setProperty('--mbc-hue', boxColor(i + 1));
        seg.classList.toggle('mbc-seg--on', isFull);
        if (isFull) full++;
      });
      const label = total === 1 ? t('boxesOne') : t('boxesMany', { n: total });
      subtitle.textContent = full === 0 ? t('summaryEmpty', { total: label }) : t('summaryFull', { full, total: label });
      addBtn.disabled = total >= MAX_BOXES;
      addBtn.title = total >= MAX_BOXES ? t('maxReached', { max: MAX_BOXES }) : t('addBoxTitle', { n: total, max: MAX_BOXES });
      fitLayout(false); // nel popup: riadatta colonne e altezze se è cambiato il numero di box
    }

    function activeElementInRoot() {
      const root = container.getRootNode ? container.getRootNode() : document;
      return root.activeElement || null;
    }

    /** Allinea le card ai box salvati (numero e contenuto). */
    function applyBoxes(boxes) {
      if (busy) return; // un'eliminazione in corso riallinea da sola alla fine
      while (entries.length < boxes.length) createEntry();
      while (entries.length > boxes.length) destroyEntry(entries[entries.length - 1]);
      const active = activeElementInRoot();
      boxes.forEach((box, i) => {
        const entry = entries[i];
        if (entry.id !== i + 1) setIdentity(entry, i + 1);
        // Non toccare la textarea in cui l'utente sta scrivendo.
        if (entry.textarea === active || entry.save.pending()) return;
        if (entry.textarea.value !== box.text) entry.textarea.value = box.text;
        updateCard(entry, box.text);
      });
      updateSummary();
    }

    /* ---------------------------------------------------------------- */
    /* Footer                                                            */
    /* ---------------------------------------------------------------- */

    addBtn.addEventListener('click', async () => {
      if (busy) return;
      try {
        entries.forEach((e) => e.save.flush());
        const boxes = await addBox();
        applyBoxes(boxes);
        const last = entries[entries.length - 1];
        last.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        last.textarea.focus();
        setStatus(t('boxAdded', { n: last.id }));
      } catch (err) {
        setStatus(err.message, true);
      }
    });

    exportBtn.addEventListener('click', async () => {
      try {
        entries.forEach((e) => e.save.flush());
        await writeQueue;
        const boxes = await getBoxes();
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        downloadJson(buildExport(boxes), 'multi-box-clipboard-' + stamp + '.json', panel);
        setStatus(t('backupExported'));
      } catch (err) {
        setStatus(t('exportFailed', { msg: err.message }), true);
      }
    });

    importBtn.addEventListener('click', () => {
      if (typeof opts.onImportClick === 'function') {
        opts.onImportClick();
        return;
      }
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error(t('fileTooBig'));
        const boxes = parseImport(await file.text());
        entries.forEach((e) => e.save.cancel());
        const saved = await setAllBoxes(boxes);
        // Forza l'aggiornamento anche della textarea con il focus.
        const focused = activeElementInRoot();
        if (focused && focused.blur) focused.blur();
        applyBoxes(saved);
        setStatus(t('imported', { total: saved.length, full: countFull(saved) }));
      } catch (err) {
        setStatus(t('importFailed', { msg: err.message }), true);
      }
    });

    buildSettings();
    container.appendChild(panel);
    setView(state && state.view === 'settings' ? 'settings' : 'list');

    // Se la larghezza cambia, cambiano anche gli a-capo: ricalcola le altezze.
    let lastWidth = 0;
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        const w = list.clientWidth;
        if (w && w !== lastWidth) {
          lastWidth = w;
          entries.forEach((e) => autoGrow(e.textarea));
        }
      })
      : null;
    if (resizeObserver) resizeObserver.observe(list);

    getBoxes().then(applyBoxes).catch((err) => setStatus(err.message, true));
    const unsubscribe = onBoxesChanged(applyBoxes);

    const flush = () => entries.forEach((e) => e.save.flush());
    if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);

    return {
      flush,
      getView: () => view,
      applySettings,
      // Ricalcola le altezze quando il pannello torna visibile (da nascosto scrollHeight vale 0).
      refresh: () => {
        entries.forEach((e) => autoGrow(e.textarea));
        fitLayout(true);
      },
      focusFirst: () => entries[0] && entries[0].textarea.focus(),
      destroy: () => {
        flush();
        unsubscribe();
        if (resizeObserver) resizeObserver.disconnect();
        if (typeof window !== 'undefined') window.removeEventListener('pagehide', flush);
        panel.remove();
      },
    };
  }

  /**
   * Disegna il pannello dei box dentro `container` e lo tiene aggiornato:
   * se cambia la lingua lo ricostruisce (restando nella stessa vista).
   * opts.onClose        -> se presente mostra il pulsante di chiusura
   * opts.variant        -> 'page' (default) | 'popup' | 'full'
   * opts.fitHeight      -> (popup) funzione che restituisce l'altezza disponibile
   * opts.onImportClick  -> se presente sostituisce l'apertura del selettore file
   * Ritorna { flush, refresh, destroy, focusFirst }.
   * Chiamarlo dopo `await MBC.ready`, così la lingua è già quella salvata.
   */
  function renderPanel(container, opts = {}) {
    let inner = buildPanel(container, opts, { view: 'list' });
    const unsubscribe = onSettingsChanged((next, prev) => {
      if (next.language !== prev.language) {
        const view = inner.getView();
        inner.destroy();
        inner = buildPanel(container, opts, { view });
        inner.refresh();
      } else {
        inner.applySettings(next);
      }
    });
    return {
      flush: () => inner.flush(),
      refresh: () => inner.refresh(),
      focusFirst: () => inner.focusFirst(),
      destroy: () => {
        unsubscribe();
        inner.destroy();
      },
    };
  }

  globalThis.MBC = Object.freeze({
    STORAGE_KEY,
    SETTINGS_KEY,
    DEFAULT_BOX_COUNT,
    MIN_BOXES,
    MAX_BOXES,
    SAVE_DEBOUNCE_MS,
    DEFAULT_SETTINGS,
    ready,
    t,
    loadSettings,
    getSettings,
    setSettings,
    onSettingsChanged,
    normalizeSettings,
    defaultBoxes,
    normalizeBoxes,
    getBoxes,
    setBoxText,
    setAllBoxes,
    addBox,
    removeBox,
    onBoxesChanged,
    countFull,
    debounce,
    copyToClipboard,
    buildExport,
    parseImport,
    renderPanel,
    boxColor,
    boxShortcutKey,
    icon,
  });
})();
