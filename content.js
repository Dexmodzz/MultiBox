/*
 * Multi Box Clipboard - content script.
 * Gira in ogni pagina e in ogni frame (all_frames: true).
 *   - Alt+1..6: salva la selezione nel box N, oppure incolla il box N nel campo attivo.
 *   - Alt+M: apre/chiude il pannello; Esc lo chiude.
 *   - Pulsante fisso in alto a destra (solo nel frame principale) in uno Shadow DOM.
 *   - Riceve i comandi del menu contestuale dal service worker.
 */
(() => {
  'use strict';

  if (globalThis.__mbcContentLoaded) return; // evita doppia iniezione
  globalThis.__mbcContentLoaded = true;

  const MBC = globalThis.MBC;
  if (!MBC) return;

  /*
   * SCORCIATOIE: si usa event.code (tasto fisico) così Option+numero funziona
   * anche su Mac, dove event.key restituirebbe simboli come "¡" o "™".
   * Se una combinazione è già usata dal sistema o da un'altra app, cambiala qui
   * (es. 'Digit1' -> 'Numpad1') e ricarica l'estensione.
   * I box possono essere fino a 20: Alt+1..Alt+9 per i box 1-9, Alt+0 per il
   * box 10; i box dall'11 in poi si usano dal pannello e dal menu contestuale.
   */
  const SHORTCUT_CODES = {
    Digit1: 1,
    Digit2: 2,
    Digit3: 3,
    Digit4: 4,
    Digit5: 5,
    Digit6: 6,
    Digit7: 7,
    Digit8: 8,
    Digit9: 9,
    Digit0: 10,
  };
  const PANEL_TOGGLE_CODE = 'KeyM'; // Alt+M

  const isTopFrame = window === window.top;
  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'password', 'email', '']);

  let boxes = MBC.defaultBoxes();

  /* ------------------------------------------------------------------ */
  /* Stato dei box (cache locale, aggiornata in tempo reale)             */
  /* ------------------------------------------------------------------ */

  function contextValid() {
    try {
      return !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  }

  MBC.getBoxes()
    .then((b) => { boxes = b; updateBadge(); })
    .catch(() => {});
  MBC.onBoxesChanged((b) => { boxes = b; updateBadge(); });

  /* ------------------------------------------------------------------ */
  /* Stili per gli Shadow DOM                                            */
  /* ------------------------------------------------------------------ */

  let cssPromise = null;
  function loadCssText() {
    if (!cssPromise) {
      // Legge il file panel.css dal pacchetto dell'estensione (risorsa locale, nessuna rete).
      cssPromise = fetch(chrome.runtime.getURL('panel.css'))
        .then((r) => r.text())
        .catch(() => '');
    }
    return cssPromise;
  }

  async function applyStyles(shadowRoot, hostEl) {
    try {
      const text = await loadCssText();
      if (!text) throw new Error('css vuoto');
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      shadowRoot.adoptedStyleSheets = [sheet];
    } catch (_) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('panel.css');
      shadowRoot.appendChild(link);
    }
    hostEl.style.visibility = 'visible';
  }

  function createHost() {
    const host = document.createElement('div');
    // "all: initial" impedisce agli stili del sito di influenzare l'host.
    host.style.cssText = 'all: initial; position: static; visibility: hidden;';
    host.setAttribute('data-mbc-host', '');
    const shadow = host.attachShadow({ mode: 'closed' });
    return { host, shadow };
  }

  function canInjectUi() {
    return document.documentElement instanceof HTMLElement;
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */

  let toastHost = null;
  let toastEl = null;
  let toastTimer = null;
  let toastDot = null;
  let toastText = null;

  function showToast(message, warn, boxId) {
    if (!canInjectUi() || !contextValid()) return;
    if (!toastHost) {
      const { host, shadow } = createHost();
      toastHost = host;
      toastEl = document.createElement('div');
      toastEl.className = 'mbc-toast';
      toastDot = document.createElement('span');
      toastDot.className = 'mbc-toast-dot';
      toastText = document.createElement('span');
      toastEl.append(toastDot, toastText);
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      shadow.appendChild(toastEl);
      applyStyles(shadow, host);
    }
    if (!toastHost.isConnected) document.documentElement.appendChild(toastHost);
    toastText.textContent = message; // mai innerHTML
    toastDot.replaceChildren(MBC.icon(warn ? 'alert' : 'check'));
    toastEl.style.setProperty('--mbc-hue', boxId ? MBC.boxColor(boxId) : '#6366f1');
    toastEl.classList.toggle('mbc-toast--warn', !!warn);
    // forza il reflow per far ripartire l'animazione
    void toastEl.offsetWidth;
    toastEl.classList.add('mbc-toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('mbc-toast--visible'), 1800);
  }

  /* ------------------------------------------------------------------ */
  /* Selezione e campi modificabili                                      */
  /* ------------------------------------------------------------------ */

  /** Elemento con il focus, attraversando eventuali Shadow DOM aperti del sito. */
  function deepActiveElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  }

  function isTextField(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has((el.getAttribute('type') || '').toLowerCase()) || TEXT_INPUT_TYPES.has(el.type);
    return false;
  }

  function isEditable(el) {
    if (!el) return false;
    if (isTextField(el)) return !el.readOnly && !el.disabled;
    return !!el.isContentEditable;
  }

  function getFieldSelection(el) {
    try {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number') return { start, end };
    } catch (_) { /* es. input type=email non espone la selezione */ }
    return null;
  }

  /** Testo selezionato: prima dentro un input/textarea, poi nella pagina. */
  function getSelectedText() {
    const el = deepActiveElement();
    if (isTextField(el)) {
      const sel = getFieldSelection(el);
      if (sel && sel.start !== sel.end) {
        return el.value.slice(Math.min(sel.start, sel.end), Math.max(sel.start, sel.end));
      }
    }
    const root = el && el.getRootNode && el.getRootNode();
    let text = '';
    if (root && root !== document && typeof root.getSelection === 'function') {
      text = String(root.getSelection() || ''); // Shadow DOM (Chrome)
    }
    if (!text) {
      const sel = window.getSelection();
      text = sel ? sel.toString() : '';
    }
    return text;
  }

  function fireInputEvents(el, text) {
    let inputEvent;
    try {
      inputEvent = new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text });
    } catch (_) {
      inputEvent = new Event('input', { bubbles: true, composed: true });
    }
    el.dispatchEvent(inputEvent);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function insertIntoTextField(el, text) {
    const sel = getFieldSelection(el);
    if (sel && typeof el.setRangeText === 'function') {
      el.setRangeText(text, sel.start, sel.end, 'end');
    } else {
      // Campi senza API di selezione (es. type=email): aggiunge in fondo.
      el.value = el.value + text;
    }
  }

  function buildTextFragment(text) {
    // Gli a-capo diventano <br>, creati come nodi (nessun HTML interpretato).
    const frag = document.createDocumentFragment();
    const lines = text.split(/\r\n|\r|\n/);
    let last = null;
    lines.forEach((line, i) => {
      if (i > 0) {
        last = document.createElement('br');
        frag.appendChild(last);
      }
      if (line) {
        last = document.createTextNode(line);
        frag.appendChild(last);
      }
    });
    return { frag, last };
  }

  function insertIntoContentEditable(el, text) {
    const root = el.getRootNode();
    const sel = (root !== document && typeof root.getSelection === 'function' && root.getSelection()) || window.getSelection();
    let range = null;
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (el.contains(r.commonAncestorContainer)) range = r;
    }
    if (!range) {
      // Nessun cursore valido nel campo: posiziona alla fine.
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.deleteContents();
    const { frag, last } = buildTextFragment(text);
    if (!last) return;
    range.insertNode(frag);
    // Cursore subito dopo il testo inserito.
    const after = document.createRange();
    after.setStartAfter(last);
    after.collapse(true);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(after);
    }
  }

  /** Incolla il box `id` nel campo con il focus. Ritorna {ok, reason}. */
  function pasteFromBox(id) {
    const el = deepActiveElement();
    if (!isEditable(el)) return { ok: false, reason: 'not-editable' };
    const box = boxes[id - 1];
    if (!box) {
      showToast(MBC.t('boxMissing', { n: id }), true);
      return { ok: false, reason: 'missing' };
    }
    if (!box.text) {
      showToast(MBC.t('boxEmpty', { n: id }), true, id);
      return { ok: false, reason: 'empty' };
    }
    if (isTextField(el)) insertIntoTextField(el, box.text);
    else insertIntoContentEditable(el, box.text);
    fireInputEvents(el, box.text);
    showToast(MBC.t('pastedFrom', { n: id }), false, id);
    return { ok: true };
  }

  function saveToBox(id, text) {
    if (id > boxes.length) {
      showToast(MBC.t('boxMissingAdd', { n: id }), true);
      return;
    }
    MBC.setBoxText(id, text)
      .then(() => showToast(MBC.t('savedTo', { n: id }), false, id))
      .catch((err) => showToast(err.message || MBC.t('saveFailed'), true));
  }

  /* ------------------------------------------------------------------ */
  /* Pulsante e pannello (solo frame principale)                         */
  /* ------------------------------------------------------------------ */

  let uiHost = null;
  let fab = null;
  let badge = null;
  let panelWrap = null;
  let panelApi = null;
  let panelOpen = false;

  function ensureUi() {
    if (!isTopFrame || uiHost || !canInjectUi() || !contextValid()) return;
    const { host, shadow } = createHost();
    uiHost = host;

    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'mbc-fab';
    const img = document.createElement('img');
    img.className = 'mbc-fab-icon';
    img.src = chrome.runtime.getURL('icons/icon48.png');
    img.alt = '';
    badge = document.createElement('span');
    badge.className = 'mbc-badge';
    fab.append(img, badge);
    fab.addEventListener('click', togglePanel);

    panelWrap = document.createElement('div');
    panelWrap.className = 'mbc-panel-wrap';
    panelWrap.hidden = true;

    shadow.append(fab, panelWrap);
    applyStyles(shadow, host);
    document.documentElement.appendChild(host);
    applyPageButtonSetting();
    updateBadge();
  }

  /**
   * Impostazione "Pulsante nelle pagine web" (nascosto di default).
   * Anche col pulsante nascosto, Alt+M apre il pannello.
   */
  function applyPageButtonSetting() {
    if (!fab) return;
    const show = !!MBC.getSettings().showPageButton;
    fab.hidden = !show;
    // Senza pulsante il pannello si apre più in alto, al suo posto.
    panelWrap.classList.toggle('mbc-panel-wrap--nofab', !show);
  }

  function updateBadge() {
    if (!badge) return;
    const n = MBC.countFull(boxes);
    badge.textContent = String(n);
    badge.classList.toggle('mbc-badge--zero', n === 0);
    fab.title = MBC.t('fabTitle');
    fab.setAttribute('aria-label', MBC.t('fabAria', { n }));
  }

  function openPanel() {
    ensureUi();
    if (!panelWrap) return;
    if (!uiHost.isConnected) document.documentElement.appendChild(uiHost);
    if (!panelApi) panelApi = MBC.renderPanel(panelWrap, { variant: 'page', onClose: closePanel });
    panelWrap.hidden = false;
    panelApi.refresh();
    fab.classList.add('mbc-fab--open');
    panelOpen = true;
  }

  function closePanel() {
    if (!panelOpen) return;
    if (panelApi) panelApi.flush();
    panelWrap.hidden = true;
    fab.classList.remove('mbc-fab--open');
    panelOpen = false;
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
  }

  function eventInsideUi(event) {
    return !!uiHost && event.composedPath().includes(uiHost);
  }

  /* ------------------------------------------------------------------ */
  /* Tastiera                                                            */
  /* ------------------------------------------------------------------ */

  function onKeyDown(event) {
    if (event.isComposing || !contextValid()) return;

    if (event.key === 'Escape' && panelOpen) {
      closePanel();
      return;
    }

    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    if (event.code === PANEL_TOGGLE_CODE) {
      event.preventDefault();
      event.stopPropagation();
      if (isTopFrame) togglePanel();
      else chrome.runtime.sendMessage({ type: 'togglePanel' }).catch(() => {});
      return;
    }

    const id = SHORTCUT_CODES[event.code];
    if (!id) return;
    if (eventInsideUi(event)) return; // dentro il pannello le scorciatoie sono ignorate

    const selected = getSelectedText();
    if (selected) {
      event.preventDefault();
      event.stopPropagation();
      saveToBox(id, selected);
      return;
    }

    if (isEditable(deepActiveElement())) {
      event.preventDefault();
      event.stopPropagation();
      pasteFromBox(id);
    }
    // Altrimenti: nessuna azione, il tasto prosegue normalmente.
  }

  window.addEventListener('keydown', onKeyDown, true);

  // Click fuori dal pannello: lo chiude.
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (panelOpen && !eventInsideUi(event)) closePanel();
    },
    true
  );

  /* ------------------------------------------------------------------ */
  /* Messaggi dal service worker / popup                                 */
  /* ------------------------------------------------------------------ */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return false;
    switch (msg.type) {
      case 'ping':
        sendResponse({ ok: true, top: isTopFrame });
        return false;
      case 'getSelection':
        sendResponse({ text: getSelectedText() });
        return false;
      case 'toast':
        showToast(String(msg.message || ''), !!msg.warn, Number(msg.boxId) || 0);
        sendResponse({ ok: true });
        return false;
      case 'togglePanel':
        if (isTopFrame) togglePanel();
        sendResponse({ ok: true });
        return false;
      case 'pasteBox':
        // Rilegge i box per avere sempre il valore più recente.
        MBC.getBoxes()
          .then((b) => { boxes = b; })
          .catch(() => {})
          .then(() => sendResponse(pasteFromBox(Number(msg.id))));
        return true; // risposta asincrona
      default:
        return false;
    }
  });

  // Lingua e impostazioni: aggiorna pulsante e testi quando cambiano.
  MBC.onSettingsChanged(() => {
    applyPageButtonSetting();
    updateBadge();
  });

  // Crea l'interfaccia dopo aver letto le impostazioni (lingua, pulsante visibile o no).
  MBC.ready.then(ensureUi);
})();
