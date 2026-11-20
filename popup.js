/*
 * Multi Box Clipboard - popup della toolbar.
 * Riusa MBC.renderPanel (panel.js): stessa lista, stessa logica, stessi dati
 * del pannello nella pagina, sincronizzati via chrome.storage.onChanged.
 */
(() => {
  'use strict';

  const MBC = globalThis.MBC;
  const app = document.getElementById('app');
  const banner = document.getElementById('banner');

  // popup.html#full = stessa interfaccia aperta in una scheda (usata per l'import,
  // perché su alcuni sistemi il selettore file chiude il popup).
  const fullPage = location.hash === '#full';

  MBC.renderPanel(app, {
    variant: fullPage ? 'full' : 'popup',
    onImportClick: fullPage
      ? null
      : () => chrome.tabs.create({ url: chrome.runtime.getURL('popup.html#full') }),
  });

  if (fullPage) {
    document.title = 'Multi Box Clipboard — Box';
    showBanner('Usa "Importa JSON" per ripristinare un backup. Le modifiche sono condivise con popup e pannello.');
    return;
  }

  const RESTRICTED_PREFIXES = [
    'chrome://',
    'chrome-extension://',
    'chrome-untrusted://',
    'chrome-search://',
    'devtools://',
    'edge://',
    'about:',
    'view-source:',
    'https://chrome.google.com/webstore',
    'https://chromewebstore.google.com',
  ];

  function showBanner(text) {
    banner.textContent = text; // mai innerHTML
    banner.hidden = false;
  }

  function isRestricted(url) {
    return RESTRICTED_PREFIXES.some((p) => url.startsWith(p));
  }

  async function checkActiveTab() {
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (_) {
      return;
    }
    if (!tab || tab.id == null) return;
    const url = tab.url || tab.pendingUrl || '';

    if (url && isRestricted(url)) {
      showBanner(
        'Su questa pagina Chrome non permette alle estensioni di funzionare ' +
          '(pagine chrome:// e Chrome Web Store): scorciatoie, pannello e menu ' +
          'contestuale non sono disponibili. Puoi comunque modificare i box qui sotto.'
      );
      return;
    }

    // La pagina è normale: verifichiamo che il content script sia attivo.
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'ping' }, { frameId: 0 });
      return; // tutto ok
    } catch (_) { /* content script assente */ }

    // Pagina aperta prima dell'installazione: proviamo a iniettarlo (permesso activeTab).
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id, allFrames: true }, files: ['panel.css'] }).catch(() => {});
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['panel.js', 'content.js'],
      });
      return;
    } catch (_) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['panel.js', 'content.js'] });
        return;
      } catch (_) { /* non iniettabile */ }
    }

    if (url.startsWith('file://')) {
      showBanner(
        'Per usare le scorciatoie sui file locali abilita "Consenti l\'accesso agli URL dei file" ' +
          'nei dettagli dell\'estensione (chrome://extensions), poi ricarica la pagina.'
      );
    } else {
      showBanner(
        'Le scorciatoie non sono attive su questa pagina (pagina protetta o non ancora caricata). ' +
          'Prova a ricaricarla. Puoi comunque modificare i box qui sotto.'
      );
    }
  }

  checkActiveTab();
})();
