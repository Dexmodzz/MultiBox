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
  const DEFAULT_BOX_COUNT = 6; // box presenti alla prima installazione
  const MIN_BOXES = 1;
  const MAX_BOXES = 20;
  const SAVE_DEBOUNCE_MS = 300;

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

  function isContextValid() {
    try {
      return !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
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
   * Avvisa il service worker che il numero di box è cambiato, così ricostruisce
   * subito il menu contestuale. Un messaggio sveglia sempre il service worker
   * (storage.onChanged da solo non sempre basta). Nel service worker stesso
   * il messaggio non ha destinatari e l'errore viene ignorato.
   */
  function notifyBoxCountChanged() {
    try {
      const p = chrome.runtime.sendMessage({ type: 'syncMenus' });
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* contesto non valido */ }
  }

  function assertContext() {
    if (!isContextValid()) throw new Error('Estensione ricaricata: aggiorna la pagina.');
  }

  function setAllBoxes(boxes) {
    return enqueue(async () => {
      assertContext();
      const normalized = normalizeBoxes(boxes);
      await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
      notifyBoxCountChanged();
      return normalized;
    });
  }

  function setBoxText(id, text) {
    return enqueue(async () => {
      assertContext();
      const n = Number(id);
      const boxes = await getBoxes();
      if (!Number.isInteger(n) || n < 1 || n > boxes.length) throw new Error('Il Box ' + id + ' non esiste');
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
      if (boxes.length >= MAX_BOXES) throw new Error('Hai raggiunto il massimo di ' + MAX_BOXES + ' box');
      boxes.push({ id: boxes.length + 1, text: '' });
      await chrome.storage.local.set({ [STORAGE_KEY]: boxes });
      notifyBoxCountChanged();
      return boxes;
    });
  }

  /** Elimina il box `id`; i successivi scalano di un posto. Ne resta sempre almeno 1. */
  function removeBox(id) {
    return enqueue(async () => {
      assertContext();
      const n = Number(id);
      const boxes = await getBoxes();
      if (boxes.length <= MIN_BOXES) throw new Error('Deve restare almeno un box');
      if (!Number.isInteger(n) || n < 1 || n > boxes.length) throw new Error('Il Box ' + id + ' non esiste');
      boxes.splice(n - 1, 1);
      const renumbered = boxes.map((b, i) => ({ id: i + 1, text: b.text }));
      await chrome.storage.local.set({ [STORAGE_KEY]: renumbered });
      notifyBoxCountChanged();
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
    trash: ['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
    download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
    upload: ['M12 21V9', 'm7 14 5-5 5 5', 'M5 3h14'],
    close: ['M18 6 6 18', 'M6 6l12 12'],
    plus: ['M12 5v14', 'M5 12h14'],
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
      throw new Error('Il file non contiene JSON valido.');
    }
    const list = Array.isArray(data) ? data : data && data.boxes;
    if (!Array.isArray(list)) throw new Error('Formato non riconosciuto: manca l\'elenco "boxes".');
    const valid = list.some((b) => b && typeof b === 'object' && 'text' in b);
    if (!valid) throw new Error('Nessun box valido nel file.');
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
   * Disegna il pannello dei box dentro `container`.
   * opts.onClose        -> se presente mostra il pulsante di chiusura
   * opts.variant        -> 'page' (default) | 'popup' | 'full'
   * opts.onImportClick  -> se presente sostituisce l'apertura del selettore file
   * Ritorna { flush, refresh, destroy, focusFirst }.
   */
  function renderPanel(container, opts = {}) {
    const variant = opts.variant || 'page';
    const panel = el('div', 'mbc-panel mbc-panel--' + variant);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Multi Box Clipboard');
    // Durata dell'animazione di pressione allineata al timer (vedi panel.css).
    panel.style.setProperty('--mbc-press-ms', (LONG_PRESS_MS - PRESS_INDICATOR_DELAY_MS) + 'ms');

    /* ---- Header: logo, titolo, contatore, barra di avanzamento ---- */
    const header = el('div', 'mbc-header');
    const logo = document.createElement('img');
    logo.className = 'mbc-logo';
    logo.alt = '';
    try { logo.src = chrome.runtime.getURL('icons/icon48.png'); } catch (_) { /* contesto invalido */ }
    const heading = el('div', 'mbc-heading');
    const title = el('div', 'mbc-title', 'Multi Box');
    const subtitle = el('div', 'mbc-subtitle', '');
    heading.append(title, subtitle);
    header.append(logo, heading);
    if (typeof opts.onClose === 'function') {
      const closeBtn = button('mbc-btn--icon mbc-close', null, 'close', 'Chiudi (Esc)');
      closeBtn.setAttribute('aria-label', 'Chiudi');
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
    const exportBtn = button('mbc-btn--soft', 'Esporta JSON', 'download', 'Scarica un backup dei box');
    const importBtn = button('mbc-btn--soft', 'Importa JSON', 'upload', 'Ripristina i box da un backup');
    const addBtn = button('mbc-btn--add', null, 'plus', 'Aggiungi un box (massimo ' + MAX_BOXES + ')');
    addBtn.setAttribute('aria-label', 'Aggiungi un box');
    const hint = el('span', 'mbc-hint', shortcutLabel('M'));
    hint.title = 'Apre e chiude il pannello';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.className = 'mbc-hidden';
    footer.append(exportBtn, importBtn, addBtn, hint, fileInput);
    panel.appendChild(footer);

    /* ---------------------------------------------------------------- */
    /* Card dei box                                                      */
    /* ---------------------------------------------------------------- */

    const entries = []; // posizionali: entries[i] è il Box i+1

    function createEntry() {
      const row = el('div', 'mbc-row');
      const card = el('div', 'mbc-card');
      card.title = 'Tieni premuto per 1 secondo per eliminare il box';

      const head = el('div', 'mbc-card-head');
      const chip = el('span', 'mbc-chip');
      const cardTitle = el('span', 'mbc-card-title');
      const count = el('span', 'mbc-count', '');
      const kbd = el('kbd', 'mbc-kbd');
      head.append(chip, cardTitle, count, kbd);

      const textarea = document.createElement('textarea');
      textarea.className = 'mbc-textarea';
      textarea.rows = 1;
      textarea.wrap = 'soft';
      textarea.spellcheck = false;

      const actions = el('div', 'mbc-actions');
      const copyBtn = button('mbc-btn--primary', 'Copia negli appunti', 'copy');
      const clearBtn = button('mbc-btn--ghost mbc-btn--danger', 'Svuota', 'trash');
      actions.append(copyBtn, clearBtn);
      card.append(head, textarea, actions);

      // Cestino affiancato al box: compare solo dopo la pressione prolungata.
      const trashBtn = button('mbc-trash', null, 'trash');
      trashBtn.tabIndex = -1;

      row.append(card, trashBtn);

      const entry = {
        id: 0, row, card, chip, cardTitle, count, kbd, textarea, copyBtn, clearBtn, trashBtn,
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

      copyBtn.addEventListener('click', async () => {
        const text = textarea.value;
        if (!text) return;
        const ok = await copyToClipboard(text, panel);
        if (!ok) {
          setStatus('Copia non riuscita', true);
          return;
        }
        copyBtn.classList.add('mbc-btn--done');
        copyBtn.replaceChildren(icon('check'), el('span', 'mbc-btn-label', 'Copiato'));
        clearTimeout(entry.copyTimer);
        entry.copyTimer = setTimeout(() => {
          copyBtn.classList.remove('mbc-btn--done');
          copyBtn.replaceChildren(icon('copy'), el('span', 'mbc-btn-label', 'Copia negli appunti'));
        }, 1500);
      });

      clearBtn.addEventListener('click', () => {
        entry.save.cancel();
        textarea.value = '';
        updateCard(entry, '');
        updateSummary();
        const id = entry.id;
        setBoxText(id, '')
          .then(() => setStatus('Box ' + id + ' svuotato'))
          .catch((err) => setStatus(err.message, true));
      });

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
      entry.cardTitle.textContent = 'Box ' + id;
      const key = boxShortcutKey(id);
      entry.kbd.hidden = !key;
      if (key) {
        entry.kbd.textContent = shortcutLabel(key);
        entry.kbd.title = 'Seleziona un testo e premi ' + shortcutLabel(key) + ' per salvarlo; senza selezione incolla';
        entry.textarea.placeholder = 'Vuoto — seleziona un testo e premi ' + shortcutLabel(key);
      } else {
        entry.textarea.placeholder = 'Vuoto — scrivi qui o usa il menu contestuale';
      }
      entry.textarea.setAttribute('aria-label', 'Testo del Box ' + id);
      entry.trashBtn.title = 'Elimina il Box ' + id;
      entry.trashBtn.setAttribute('aria-label', 'Elimina il Box ' + id);
    }

    function startPress(entry, event) {
      cancelPress(entry);
      entry.pressStart = { x: event.clientX, y: event.clientY };
      // Dopo un attimo parte l'indicatore (così un semplice click non lo mostra).
      entry.pressShowTimer = setTimeout(() => entry.card.classList.add('mbc-card--pressing'), PRESS_INDICATOR_DELAY_MS);
      entry.pressTimer = setTimeout(() => {
        cancelPress(entry);
        if (entries.length <= MIN_BOXES) {
          setStatus('Deve restare almeno un box', true);
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
        setStatus('Deve restare almeno un box', true);
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
        setStatus('Box ' + id + ' eliminato');
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

    /**
     * Adatta l'altezza della textarea al testo: va a capo da sola e cresce
     * riga per riga (nessun limite; se serve scorre la lista dei box).
     */
    function autoGrow(textarea) {
      if (!textarea.isConnected) return;
      const scrollTop = list.scrollTop; // evita salti della lista durante il ricalcolo
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      list.scrollTop = scrollTop;
    }

    function updateCard(entry, text) {
      const len = text.length;
      entry.count.textContent = len ? len.toLocaleString('it-IT') + (len === 1 ? ' carattere' : ' caratteri') : '';
      entry.card.classList.toggle('mbc-card--empty', len === 0);
      entry.copyBtn.disabled = len === 0;
      entry.clearBtn.disabled = len === 0;
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
      const label = total === 1 ? '1 box' : total + ' box';
      subtitle.textContent = full === 0 ? label + ' · tutti vuoti' : full + ' di ' + label + ' pieni';
      addBtn.disabled = total >= MAX_BOXES;
      addBtn.title = total >= MAX_BOXES
        ? 'Hai raggiunto il massimo di ' + MAX_BOXES + ' box'
        : 'Aggiungi un box (' + total + '/' + MAX_BOXES + ')';
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
        setStatus('Aggiunto il Box ' + last.id);
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
        setStatus('Backup esportato');
      } catch (err) {
        setStatus('Esportazione non riuscita: ' + err.message, true);
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
        if (file.size > 5 * 1024 * 1024) throw new Error('File troppo grande (max 5 MB).');
        const boxes = parseImport(await file.text());
        entries.forEach((e) => e.save.cancel());
        const saved = await setAllBoxes(boxes);
        // Forza l'aggiornamento anche della textarea con il focus.
        const focused = activeElementInRoot();
        if (focused && focused.blur) focused.blur();
        applyBoxes(saved);
        setStatus('Importati ' + saved.length + ' box (' + countFull(saved) + ' pieni)');
      } catch (err) {
        setStatus('Importazione non riuscita: ' + err.message, true);
      }
    });

    container.appendChild(panel);

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
      // Ricalcola le altezze quando il pannello torna visibile (da nascosto scrollHeight vale 0).
      refresh: () => entries.forEach((e) => autoGrow(e.textarea)),
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

  globalThis.MBC = Object.freeze({
    STORAGE_KEY,
    DEFAULT_BOX_COUNT,
    MIN_BOXES,
    MAX_BOXES,
    SAVE_DEBOUNCE_MS,
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
