/*
 * Multi Box Clipboard - popup della toolbar.
 * Riusa MBC.renderPanel (panel.js): stessa lista, stessa logica, stessi dati
 * del pannello nella pagina, sincronizzati via chrome.storage.onChanged.
 */
(async () => {
  'use strict';

  const MBC = globalThis.MBC;
  const app = document.getElementById('app');
  const banner = document.getElementById('banner');

  // Lingua e impostazioni salvate prima di disegnare qualsiasi testo.
  await MBC.ready;

  // popup.html#full = stessa interfaccia aperta in una scheda (usata per l'import,
  // perché su alcuni sistemi il selettore file chiude il popup).
  const fullPage = location.hash === '#full';

  // Il popup del browser è alto al massimo 600 px: il pannello deve starci
  // tutto senza scorrere (margini del body e avviso esclusi).
  const POPUP_MAX_HEIGHT = 600;
  function fitHeight() {
    const bodyStyle = getComputedStyle(document.body);
    const bodyPad = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
    const bs = getComputedStyle(banner);
    const bannerSpace = banner.hidden
      ? 0
      : banner.offsetHeight + (parseFloat(bs.marginTop) || 0) + (parseFloat(bs.marginBottom) || 0);
    return POPUP_MAX_HEIGHT - bodyPad - bannerSpace;
  }

  const panelApi = MBC.renderPanel(app, {
    variant: fullPage ? 'full' : 'popup',
    fitHeight: fullPage ? null : fitHeight,
    onImportClick: fullPage
      ? null
      : () => chrome.tabs.create({ url: chrome.runtime.getURL('popup.html#full') }),
  });

  // Avviso in cima: si ricorda la chiave, così cambia lingua insieme al resto.
  let bannerKey = null;
  function showBanner(key) {
    bannerKey = key;
    banner.textContent = MBC.t(key); // mai innerHTML
    banner.hidden = false;
    // L'avviso occupa spazio: ricalcola il layout perché tutto resti visibile.
    requestAnimationFrame(() => panelApi.refresh());
  }

  function applyLanguage() {
    document.documentElement.lang = MBC.getSettings().language;
    if (fullPage) document.title = MBC.t('fullPageTitle');
    if (bannerKey) showBanner(bannerKey);
  }

  MBC.onSettingsChanged((next, prev) => {
    if (next.language !== prev.language) applyLanguage();
  });
  applyLanguage();

  if (fullPage) {
    showBanner('bannerFull');
    return;
  }

  const RESTRICTED_PREFIXES = [
    'chrome://',
    'chrome-extension://',
    'chrome-untrusted://',
    'chrome-search://',
    'devtools://',
    'edge://',
    'brave://',
    'about:',
    'view-source:',
    'https://chrome.google.com/webstore',
    'https://chromewebstore.google.com',
  ];

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
      showBanner('bannerRestricted');
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

    showBanner(url.startsWith('file://') ? 'bannerFile' : 'bannerInactive');
  }

  checkActiveTab();
})();
