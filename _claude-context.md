# Contexte projet — Iceample v2 (pour Claude)

Colle ce fichier en début de conversation quand le contexte se réinitialise.

---

## Identité du projet

- **App** : Iceample — logiciel de création musicale (sampler, séquenceur, piste audio, éditeur image, ...)
- **Version** : v2.1 — Tauri Edition (`src-tauri/tauri.conf.json` → `"version": "2.1.0"`, identifier `com.soaho.iceample`)
- **Stack** : Tauri v2 + WebView2 (Windows), frontend vanilla JS (zéro dépendance UI), Rust backend
- **Config Tauri** : `"withGlobalTauri": true` → toutes les APIs Tauri accessibles via `window.__TAURI__`
- **Drag-drop OS** : sur Tauri v2/WebView2 les events HTML5 `dragover`/`drop` ne se déclenchent PAS pour les fichiers venant de l'OS. Il faut utiliser `window.__TAURI__.webview.getCurrentWebview().onDragDropEvent()` ou `window.__TAURI__.event.listen('tauri://drag-drop', ...)`.
- **Dev** : pas de bundler visible, les fichiers `src/*.js` sont servis directement.

---

## Internationalisation — `src/i18n.js`

- **12 langues** dans l'ordre : EN, FR, ES, DE, IT, PT, RU, ZH, JA, KO, NL, AR
- Toutes dans un seul fichier. Chaque bloc langue fait ~535 lignes.
- Accès runtime : `import { t } from './i18n.js'` → `t('ma_cle')`
- **Règle** : quand on ajoute une clé, il FAUT l'ajouter dans les 12 blocs langue.
- **Repère pratique** : grepper une clé existante proche pour trouver la ligne dans chaque langue, puis faire les 12 edits.
- Convention de nommage : `ie_` pour l'éditeur image, `sc_` pour les labels de raccourcis, etc.

### Langues + traductions utiles de référence

| Clé            | EN       | FR         | ES          | DE          | IT          | PT          | RU          | ZH    | JA       | KO     | NL          | AR      |
|----------------|----------|------------|-------------|-------------|-------------|-------------|-------------|-------|----------|--------|-------------|---------|
| `ie_tool_brush`| Brush    | Pinceau    | Pincel      | Pinsel      | Pennello    | Pincel      | Кисть       | 画笔  | ブラシ    | 브러시  | Penseel     | فرشاة  |
| `ie_tool_eraser`| Eraser  | Gomme      | Borrador    | Radierer    | Gomma       | Borracha    | Ластик      | 橡皮擦| 消しゴム  | 지우개  | Gum         | ممحاة  |
| `ie_tool_move` | Move     | Déplacer   | Mover       | Bewegen     | Sposta      | Mover       | Переместить | 移动  | 移動      | 이동   | Verplaatsen | تحريك  |
| `ie_tool_lasso`| Selection| Sélection  | Selección   | Auswahl     | Selezione   | Seleção     | Выделение   | 选区  | 選択範囲  | 선택   | Selectie    | تحديد  |

---

## Raccourcis — `src/shortcuts.js`

### API publique
```js
import { getShortcut, setShortcut, matchesShortcut, keyEventMatches, eventToBinding, formatBinding, getAllShortcuts, resetShortcuts } from './shortcuts.js'

// Vérifier un raccourci dans un keydown :
if (matchesShortcut('mon-action', e)) { ... }

// Obtenir le binding actuel (string, ex: "ctrl+z") :
const binding = getShortcut('mon-action')

// Convertir un KeyboardEvent en binding string :
const b = eventToBinding(e)  // retourne null si touche seule de modificateur

// Afficher un binding de façon lisible :
formatBinding('ctrl+shift+z')  // → "Ctrl + Shift + Z"
```

### Format d'un binding
`"ctrl+shift+z"` — parties séparées par `+`, modificateurs en minuscules (`ctrl`, `shift`, `alt`), touche principale en dernier (`e.key` exact ou casse ignorée).

### Ajouter un raccourci
1. Dans `src/shortcuts.js` → `DEFAULT_SHORTCUTS` :
```js
'mon-id': { key: 'ctrl+k', label_key: 'sc_mon_id' },
```
2. Ajouter `sc_mon_id` dans les 12 langues de `src/i18n.js`.
3. Le groupe affiché dans l'UI raccourcis est déterminé par `scGroupOf(id)` dans `src/settings.js` :
   - `ed-` ou `ie-` → groupe **Éditeur** (`scg_editor`)
   - `win-` → Fenêtres
   - `seq-` → Séquenceur
   - `mute-`/`solo-`/`master-` → Mixer
   - Sets `SC_TRANSPORT`, `SC_CLIPS`, `SC_WINDOWS` → groupes respectifs
   - Tout le reste → `scg_general`

---

## Rust / Tauri — `src-tauri/src/lib.rs`

Commandes Rust disponibles (invoke depuis le JS) :
- `read_file_base64({ path: String })` → `String` (base64 du fichier)
- Autres commandes audio/MIDI internes (ne pas toucher sans contexte spécifique)

---

## Structure `src/` (modules principaux)

| Fichier | Rôle |
|---|---|
| `main.js` | Point d'entrée, raccourcis globaux (40+), init fenêtres |
| `imageeditor.js` | Éditeur image couches (le gros du travail récent) |
| `shortcuts.js` | Registre raccourcis + API (getShortcut, matchesShortcut…) |
| `settings.js` | Panneau Paramètres + onglet Raccourcis (buildShortcutsTab) |
| `i18n.js` | Toutes les traductions, 12 langues, ~6200 lignes |
| `daw.js` | DAW / arrangeur de clips |
| `mixer.js` | Mixeur |
| `editor.js` | Éditeur audio destructif |
| `library.js` | Bibliothèque de samples |
| `theme.js` | Gestion des thèmes CSS |
| `rename-dialog.js` | Dialogues modaux réutilisables (`promptName`, `confirmUnsaved`) |
| `window-manager.js` | Gestion des panneaux flottants |

---

## Conventions de code

- Vanilla JS ES modules, zéro framework
- Pas de commentaires sauf si WHY non-évident
- Fonctions courtes, logique inline quand ça tient sur une ligne
- `el(tag, cls, html)` = helper pour créer des éléments DOM
- `uid()` = `Math.random().toString(36).slice(2, 8)` pour les IDs
- Les tests sont faits manuellement dans l'app (pas de suite de tests automatisés visible)
