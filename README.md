# Multi Box Clipboard

🇮🇹 [Versione italiana](README.it.md)

Multi Box Clipboard is a Chrome and Brave extension that gives you up to 20 saved clipboard slots:
copy and paste with Alt+number shortcuts, from the right-click menu or from a panel, and your text
stays saved even after you close the browser.

- Manifest V3, **1 to 20 persistent boxes** (6 on first install).
- Copy text into a box with `Alt+N` and paste it into any field with the same shortcut.
- All data stays in `chrome.storage.local`: the extension uses no external services and sends nothing over the network.

- The interface is available in **English** (default) and **Italian**: switch language from ⚙️ **Settings**.

## Installation

1. **Download the extension** from the **[Releases page](https://github.com/Dexmodzz/MultiBox/releases/latest)**:\
   download the `MultiBox-<version>.zip` file (e.g. `MultiBox-1.1.2.zip`) and extract it
   (you'll get a `MultiBox-<version>` folder).

   Developers can also clone the repository: `git clone https://github.com/Dexmodzz/MultiBox.git`
2. Open `chrome://extensions` (or `brave://extensions`).
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the extracted folder (`MultiBox-<version>`, the one that contains `manifest.json`).
6. (Optional, for the test page) in the extension's **Details**, turn on **Allow access to file URLs**.

Keep the folder where it is: Chrome loads the extension from it every time it starts.
To update, download the new ZIP from the [Releases page](https://github.com/Dexmodzz/MultiBox/releases/latest),
replace the folder's contents and click **↻ (Reload)** in `chrome://extensions`.

Tabs that were already open before installation need to be reloaded. Opening the extension popup
on such a tab also tries to activate it automatically.

### If you change the code

After editing `background.js` or `panel.js`, click **↻ (Reload)** on the extension in
`chrome://extensions` (or `brave://extensions`) and reload any open pages. Some Chromium-based
browsers (e.g. Brave) may keep running the old version of the service worker: if the context menu
doesn't reflect your changes, bump `version` in `manifest.json`, or remove and re-load the extension.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+1` … `Alt+9`, `Alt+0` (Box 10) with text selected | Saves the selection into Box N (overwrites it). Toast: "Saved to Box N" |
| `Alt+1` … `Alt+9`, `Alt+0` with no selection, cursor in a text field | Pastes Box N at the cursor position. Toast: "Pasted from Box N" |
| `Alt+N` when Box N is empty | Nothing is pasted, toast "Box N is empty" |
| `Alt+N` for a box that doesn't exist | Toast "Box N does not exist" |
| `Alt+M` | Opens/closes the panel |
| `Esc` | Closes the panel |

- Boxes 11 to 20 have no shortcut: use them from the panel and the context menu.
- On Mac, use `Option` instead of `Alt` (the extension reads the physical key via `event.code`).
- Selections work both on the page and inside inputs/textareas.
- Supported paste targets: `textarea`, text `input`s (text, search, url, tel, password, email)
  and `contenteditable` elements (text is inserted at the cursor using the Range/Selection API).
  The `input` and `change` events are fired after insertion.
- If there is no selection and the focus isn't in an editable field, the shortcut does nothing.
- Shortcuts are ignored while the focus is inside the extension's panel.
- Shortcuts also work inside iframes (they act on the focused frame).

### Note for Windows and Linux

Some `Alt+number` combinations may already be used by the system, the window manager or other
applications (for example to switch tabs or workspaces). In that case you can change them by editing
the `SHORTCUT_CODES` constant (and `PANEL_TOGGLE_CODE` for `Alt+M`) at the top of `content.js`,
for example using `Numpad1` … `Numpad6`, then reload the extension from `chrome://extensions`.

## Context menu

Right-click → **Multi Box**:

```
Multi Box
├─ Copy to      shown when text is selected
│   ├─ Box 1
│   ├─ …
│   └─ Box N  → saves the selection into the box
└─ Paste from   shown in an editable field
    ├─ Box 1
    ├─ …
    └─ Box N  → inserts the text into the active field of the frame you clicked in
```

N is the number of existing boxes: the **Copy to** and **Paste from** submenus grow or shrink
automatically when you add (+) or delete boxes from the panel or the popup.
The menu is also rebuilt every time the browser starts, and it follows the language chosen in Settings
(Italian: **Copia nel** / **Incolla da**).

## Panel and popup

- `Alt+M` opens the panel on any page; `Esc` or a click outside closes it.
- Optionally, a small button with the app icon and a badge showing the number of filled boxes can be shown
  in the top-right corner of every page (**hidden by default**, see [Settings](#settings)). Clicking it also
  opens the panel.
- The panel (about 340 px wide, at most 80% of the screen height) shows all boxes: each card has a
  title, an editable textarea and the **Copy to clipboard** and **Clear** buttons.
- Each box wraps text automatically and grows with its content; if the boxes don't fit, the list scrolls.
- **Add a box**: the **+** button in the footer, between "Import JSON" and `Alt+M` (maximum 20).
- **Delete a box**: press and hold the box with the left mouse button for **1 second**
  (a red bar at the bottom shows the progress; moving the mouse cancels it). A **trash** button appears
  next to the box: click it to delete the box. The trash button hides itself after 6 seconds or when
  you click elsewhere. At least 1 box must remain; the following boxes move up one place
  (Box 5 becomes Box 4, and so on).
- Changes are saved immediately (300 ms after you stop typing) and update in real time in every
  open tab and in the popup.
- **Export JSON** downloads a backup; **Import JSON** restores a backup
  (from the popup it opens the interface in a tab, because the file picker would close the popup).
- The toolbar popup shows the same boxes and always fits without scrolling: depending on how many boxes
  you have it uses 1 to 4 columns, and **Copy to clipboard** / **Clear** become two small icons next to
  each box title. On `chrome://` pages and in the Chrome Web Store, Chrome doesn't let extensions act on
  the page: the popup shows a message, but the boxes remain editable.

## Settings

Click the ⚙️ gear icon in the popup or in the panel:

- **Language**: 🇬🇧 English or 🇮🇹 Italiano. The whole interface switches immediately (popup, panel,
  messages and right-click menu). Default: English.
- **Button on web pages**: shows or hides the Multi Box button in the top-right corner of web pages.
  It is **hidden by default**; `Alt+M` always opens the panel anyway.

Settings are saved in `chrome.storage.local` together with the boxes.

## Manual testing

Open `test/test.html` (drag it into Chrome; it needs access to file URLs, see Installation).

1. **Copy with the shortcut**: select the first paragraph and press `Alt+1` → toast "Saved to Box 1"
   (if the page button is enabled, its badge goes to 1).
2. **Paste with the shortcut**: click in *Textarea 2* and press `Alt+1` → the text appears, toast
   "Pasted from Box 1", and the `input` and `change` events show up in the log.
3. **Selection inside a field**: select part of *Textarea 1* and press `Alt+4` → saved to Box 4.
4. **Empty box**: click in *Textarea 3* and press `Alt+6` (empty box) → toast "Box 6 is empty", nothing is pasted.
5. **Contenteditable**: click in the middle of the sentence in the *Contenteditable* area and press `Alt+1`
   → the text appears at the cursor, not at the end.
6. **Input**: place the cursor in the input and press `Alt+1`.
7. **Iframe**: select the text inside the iframe and press `Alt+3`, then click in the iframe's
   textarea and press `Alt+3`.
8. **Context menu**: select the second paragraph → right-click → Multi Box → Copy to → Box 2;
   then right-click in *Textarea 5* → Multi Box → Paste from → Box 2 (line breaks are preserved).
9. **Panel**: press `Alt+M` (or click the page button, if enabled), edit the text of Box 1 and check
   that the other tab / the popup update; try **Copy to clipboard**, **Clear**, `Esc`.
10. **Add/delete**: press **+** up to 20 boxes (then the button is disabled); hold a box for
    1 second, click the trash button and check that the following boxes are renumbered and that the
    context menu updates. With only one box the trash button doesn't appear.
11. **Backup**: **Export JSON**, clear a box, **Import JSON** with the downloaded file.
12. **Settings**: open ⚙️, switch to 🇮🇹 Italiano and check that popup, panel, toasts and the right-click
    menu change language; turn on "Button on web pages" and check that the button appears on open pages.
13. **Protected pages**: open `chrome://extensions` and click the extension icon → the popup
    shows a message saying the page isn't supported.
14. **Persistence**: fully close Chrome, reopen it and check (badge, panel or popup) that the
    boxes are still filled.

## Files

| File | Contents |
|---|---|
| `manifest.json` | Manifest V3 configuration |
| `background.js` | Service worker: context menu and forwarding commands to frames |
| `content.js` | Shortcuts, paste/save, button, panel and toasts in the page |
| `panel.js` | Shared logic: data, debounced saving, panel, export/import |
| `panel.css` | Styles for the button, panel, toasts and popup |
| `popup.html`, `popup.js` | Toolbar popup (reuses `panel.js`) |
| `icons/` | 16, 48 and 128 px icons |
| `test/test.html` | Page for manual testing |
| `_locales/` | Extension name and description in English and Italian |
| `README.it.md` | Italian version of this README |

## Backup format

```json
{
  "app": "Multi Box Clipboard",
  "version": "1.1.2",
  "exportedAt": "2026-01-01T12:00:00.000Z",
  "boxes": [{ "id": 1, "text": "..." }, { "id": 2, "text": "" }]
}
```
