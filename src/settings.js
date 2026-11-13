// settings.js — Settings panel tabs: Audio, Display, Shortcuts, Language
//
// Exports: initSettings, buildAudioTab, buildDisplayTab, buildShortcutsTab,
//          buildLangTab, rebuildDynamicTabs

import { t, getLang, setLang, applyTranslations, LANG_LIST } from './i18n.js'
import {
  getAllShortcuts, setShortcut, resetShortcuts,
  formatBinding, eventToBinding,
} from './shortcuts.js'
import {
  getNamedLayouts, deleteNamedLayout, saveNamedLayout,
} from './layout.js'
import { buildThemeExtras, applyZoom, applyOpacity } from './theme.js'
import { TOOLS, openTools, createToolWindow } from './window-manager.js'
import { setAnnotations } from './annotations.js'

// ── Context injected by main.js ───────────────────────────────────────────────
let _workbench  = null
let _updateDock = () => {}

/** Call once from DOMContentLoaded before opening the settings panel. */
export function initSettings({ workbench, updateDock }) {
  _workbench  = workbench
  _updateDock = updateDock
}

// ── Rebuild all dynamic tabs (called on language change) ──────────────────────
export function rebuildDynamicTabs() {
  buildAudioTab()
  buildDisplayTab()
  buildShortcutsTab()
  buildThemeExtras()
  applyTranslations()
}

// ── Tab: Langue ───────────────────────────────────────────────────────────────
export function buildLangTab() {
  const tab = document.getElementById('tab-langue')
  tab.innerHTML = ''
  const lbl = document.createElement('div')
  lbl.className = 'settings-section-lbl'
  lbl.dataset.i18n = 'lang_label'
  lbl.textContent = t('lang_label')
  tab.appendChild(lbl)

  const grid = document.createElement('div')
  grid.className = 'lang-grid'
  tab.appendChild(grid)

  LANG_LIST.forEach(({ code, name }) => {
    const btn = document.createElement('button')
    btn.className = 'lang-btn' + (code === getLang() ? ' active' : '')
    btn.textContent = name
    btn.addEventListener('click', () => {
      setLang(code)
      document.documentElement.lang = code
      grid.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      rebuildDynamicTabs()
    })
    grid.appendChild(btn)
  })
}

// ── Tab: Audio ────────────────────────────────────────────────────────────────
export function buildAudioTab() {
  const tab = document.getElementById('tab-audio')
  tab.innerHTML = ''

  function audioRow(labelKey, control) {
    const row = document.createElement('div')
    row.className = 'audio-row'
    const lbl = document.createElement('label')
    lbl.className = 'audio-label'
    lbl.dataset.i18n = labelKey
    lbl.textContent = t(labelKey)
    row.appendChild(lbl)
    row.appendChild(control)
    return row
  }

  function makeSelect(storageKey, options, defaultVal) {
    const sel = document.createElement('select')
    sel.className = 'audio-select'
    options.forEach(([val, text]) => {
      const opt = document.createElement('option')
      opt.value = val; opt.textContent = text
      sel.appendChild(opt)
    })
    try { sel.value = localStorage.getItem(storageKey) || defaultVal } catch { sel.value = defaultVal }
    sel.addEventListener('change', () => { try { localStorage.setItem(storageKey, sel.value) } catch {} })
    return sel
  }

  function makeNumber(storageKey, min, max, defaultVal) {
    const inp = document.createElement('input')
    inp.type = 'number'; inp.className = 'audio-number'
    inp.min = min; inp.max = max
    try { inp.value = localStorage.getItem(storageKey) || defaultVal } catch { inp.value = defaultVal }
    inp.addEventListener('change', () => { try { localStorage.setItem(storageKey, inp.value) } catch {} })
    return inp
  }

  function makeToggle(storageKey, defaultVal) {
    const btn = document.createElement('button')
    let val, active
    try { val = localStorage.getItem(storageKey) } catch { val = null }
    active = val === null ? defaultVal : val === 'true'
    btn.className = 'seq-btn' + (active ? ' active' : '')
    btn.innerHTML = active ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>'
    btn.addEventListener('click', () => {
      const now = !btn.classList.contains('active')
      btn.classList.toggle('active', now)
      btn.innerHTML = now ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>'
      try { localStorage.setItem(storageKey, now) } catch {}
    })
    return btn
  }

  const srSel = makeSelect('iceample:audio:sampleRate',
    [['0','— auto —'],['44100','44 100 Hz'],['48000','48 000 Hz'],['96000','96 000 Hz'],['192000','192 000 Hz']], '0')
  tab.appendChild(audioRow('audio_sample_rate', srSel))

  const srNote = document.createElement('div')
  srNote.className = 'settings-note'
  srNote.style.cssText = 'display:flex;align-items:center;gap:8px;'
  const srNoteText = document.createElement('span')
  srNoteText.dataset.i18n = 'audio_restart_note'
  srNoteText.textContent = t('audio_restart_note')
  srNoteText.style.flex = '1'
  const srRestartBtn = document.createElement('button')
  srRestartBtn.className = 'sc-cap-btn'
  srRestartBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>'
  srRestartBtn.title = t('restart')
  srRestartBtn.style.cssText = 'width:auto;padding:0 8px;font-size:11px;gap:4px;'
  srRestartBtn.addEventListener('click', () => location.reload())
  srNote.appendChild(srNoteText)
  srNote.appendChild(srRestartBtn)
  tab.appendChild(srNote)

  tab.appendChild(audioRow('audio_buffer_size', makeSelect('iceample:audio:bufferSize',
    [['64','64'],['128','128'],['256','256'],['512','512'],['1024','1024'],['2048','2048']], '256')))

  tab.appendChild(audioRow('audio_latency_hint', makeSelect('iceample:audio:latencyHint',
    [['interactive', t('audio_latency_low')],
     ['balanced',    t('audio_latency_balanced')],
     ['playback',    t('audio_latency_high')]], 'interactive')))

  tab.appendChild(audioRow('audio_default_bpm',   makeNumber('iceample:audio:defaultBpm',  40, 300, 120)))
  tab.appendChild(audioRow('audio_default_steps', makeSelect('iceample:audio:defaultSteps',
    [['8','8'],['16','16'],['32','32']], '16')))
  tab.appendChild(audioRow('audio_midi_channel',  makeSelect('iceample:audio:midiChannel',
    [['0','0 (all / tous)'],['1','1'],['2','2'],['3','3'],['4','4'],['5','5'],['6','6'],['7','7'],
     ['8','8'],['9','9'],['10','10'],['11','11'],['12','12'],['13','13'],['14','14'],['15','15'],['16','16']], '0')))
  tab.appendChild(audioRow('audio_midi_transpose', makeNumber('iceample:audio:midiTranspose', -24, 24, 0)))
  tab.appendChild(audioRow('audio_autosave', makeToggle('iceample:audio:autosave', false)))

  // ── Piano key remapping ───────────────────────────────────────────────────────
  const keymapSep = document.createElement('div')
  keymapSep.style.cssText = 'margin:10px 0 6px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--dim);display:flex;align-items:center;justify-content:space-between;'
  const keymapTitle = document.createElement('span'); keymapTitle.textContent = t('audio_piano_keymap')
  const keymapReset = document.createElement('button')
  keymapReset.className = 'sc-cap-btn'
  keymapReset.innerHTML = '<i class="fa-solid fa-rotate-left"></i>'
  keymapReset.title = t('reset')
  keymapReset.addEventListener('click', () => {
    try { localStorage.removeItem('iceample:piano:keymap') } catch {}
    buildKeymapGrid()
    window.toast(t('audio_keymap_reset_toast'), 'success')
  })
  keymapSep.append(keymapTitle, keymapReset)
  tab.appendChild(keymapSep)

  const DEFAULT_KEYMAP = {
    'z':0,'s':1,'x':2,'d':3,'c':4,'v':5,'g':6,
    'b':7,'h':8,'n':9,'j':10,'m':11,
    'q':12,'2':13,'w':14,'3':15,'e':16,'r':17,'5':18,
    't':19,'6':20,'y':21,'7':22,'u':23,
  }
  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

  const keymapGrid = document.createElement('div')
  keymapGrid.className = 'keymap-grid'
  tab.appendChild(keymapGrid)

  let keymapCapturing = null

  function buildKeymapGrid() {
    keymapGrid.innerHTML = ''
    let stored
    try { stored = JSON.parse(localStorage.getItem('iceample:piano:keymap') || 'null') } catch { stored = null }
    stored = stored || DEFAULT_KEYMAP
    Object.entries(stored).forEach(([key, semi]) => {
      const cell = document.createElement('div')
      cell.className = 'keymap-cell'
      cell.dataset.semi = semi
      const keyEl  = document.createElement('span'); keyEl.className  = 'keymap-key';  keyEl.textContent  = key.toUpperCase()
      const noteEl = document.createElement('span'); noteEl.className = 'keymap-note'; noteEl.textContent = NOTE_NAMES[semi % 12]
      cell.append(keyEl, noteEl)
      cell.title = `${key.toUpperCase()} → ${NOTE_NAMES[semi % 12]} (clic pour remapper)`
      cell.addEventListener('click', () => {
        if (keymapCapturing) { keymapCapturing.classList.remove('capturing'); keymapCapturing = null }
        cell.classList.add('capturing')
        keymapCapturing = cell
      })
      keymapGrid.appendChild(cell)
    })
  }

  document.addEventListener('keydown', e => {
    if (!keymapCapturing) return
    e.preventDefault(); e.stopPropagation()
    const semi = parseInt(keymapCapturing.dataset.semi)
    let stored
    try { stored = JSON.parse(localStorage.getItem('iceample:piano:keymap') || 'null') } catch { stored = null }
    stored = stored ? { ...stored } : { ...DEFAULT_KEYMAP }
    Object.keys(stored).forEach(k => { if (stored[k] === semi) delete stored[k] })
    stored[e.key.toLowerCase()] = semi
    try { localStorage.setItem('iceample:piano:keymap', JSON.stringify(stored)) } catch {}
    keymapCapturing.classList.remove('capturing')
    keymapCapturing = null
    buildKeymapGrid()
  }, true)

  buildKeymapGrid()
}

// ── Tab: Affichage ────────────────────────────────────────────────────────────
export function buildDisplayTab() {
  const tab = document.getElementById('tab-affichage')
  tab.innerHTML = ''

  function dispRow(labelKey, control) {
    const row = document.createElement('div')
    row.className = 'audio-row'
    const lbl = document.createElement('label')
    lbl.className = 'audio-label'
    lbl.dataset.i18n = labelKey
    lbl.textContent = t(labelKey)
    row.appendChild(lbl)
    row.appendChild(control)
    return row
  }

  function makeToggle(storageKey, defaultVal) {
    const btn = document.createElement('button')
    let val
    try { val = localStorage.getItem(storageKey) } catch { val = null }
    const active = val === null ? defaultVal : val !== 'false'
    btn.className = 'seq-btn' + (active ? ' active' : '')
    btn.innerHTML = active ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>'
    btn.addEventListener('click', () => {
      const now = !btn.classList.contains('active')
      btn.classList.toggle('active', now)
      btn.innerHTML = now ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>'
      try { localStorage.setItem(storageKey, now) } catch {}
    })
    return btn
  }

  const fpsSel = document.createElement('select')
  fpsSel.className = 'audio-select'
  const fpsOpts = [['0', t('display_fps_unlimited')], ['30','30'], ['60','60'], ['90','90'], ['120','120']]
  fpsOpts.forEach(([val, text]) => {
    const opt = document.createElement('option')
    opt.value = val; opt.textContent = text
    fpsSel.appendChild(opt)
  })
  try { fpsSel.value = localStorage.getItem('iceample:display:spectrumFps') || '0' } catch {}
  fpsSel.addEventListener('change', () => { try { localStorage.setItem('iceample:display:spectrumFps', fpsSel.value) } catch {} })
  tab.appendChild(dispRow('display_spectrum_fps', fpsSel))
  tab.appendChild(dispRow('display_splash', makeToggle('iceample:display:splash', true)))

  // Dock toggle
  const dockToggle = makeToggle('iceample:display:dock', true)
  dockToggle.addEventListener('click', () => { setTimeout(() => _updateDock(), 50) })
  tab.appendChild(dispRow('display_dock', dockToggle))

  // Window-bounce toggle
  tab.appendChild(dispRow('display_bounce', makeToggle('iceample:display:bounce', true)))

  // Annotations (button hint tooltips) toggle — applies live.
  const hintsToggle = makeToggle('iceample:display:hints', true)
  hintsToggle.addEventListener('click', () => setAnnotations(hintsToggle.classList.contains('active')))
  tab.appendChild(dispRow('display_hints', hintsToggle))

  // Slider helper (range + live value), applies + persists via the callback.
  function makeSlider(min, max, step, value, fmt, onInput) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;'
    const sl = document.createElement('input')
    sl.type = 'range'; sl.min = min; sl.max = max; sl.step = step; sl.value = value
    sl.className = 'audio-select'; sl.style.cssText = 'width:110px;padding:0;'
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:10px;color:var(--text-primary);min-width:34px;text-align:right;font-variant-numeric:tabular-nums;'
    lbl.textContent = fmt(parseFloat(value))
    sl.addEventListener('input', () => { const v = parseFloat(sl.value); onInput(v); lbl.textContent = fmt(v) })
    wrap.append(sl, lbl)
    return wrap
  }

  // UI scale (zoom)
  let zoom0 = 100; try { zoom0 = parseFloat(localStorage.getItem('theme:--font-size-base') || '100') } catch {}
  tab.appendChild(dispRow('th_zoom_ui', makeSlider(70, 130, 5, zoom0, v => v + '%', v => applyZoom(v))))

  // Window opacity (blur is derived from it)
  let op0 = 1; try { op0 = parseFloat(localStorage.getItem('theme:--win-opacity') || '1') } catch {}
  tab.appendChild(dispRow('th_win_opacity', makeSlider(0.15, 1, 0.05, op0, v => Math.round(v * 100) + '%', v => applyOpacity(v))))

  // Reduce motion — disable animations/transitions.
  const motionToggle = makeToggle('iceample:display:reducemotion', false)
  motionToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('reduce-motion', motionToggle.classList.contains('active'))
  })
  tab.appendChild(dispRow('display_reduce_motion', motionToggle))

  // Focus mode — hide the corner bars + dock for a clean canvas.
  const focusToggle = makeToggle('iceample:display:focus', false)
  focusToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('focus-mode', focusToggle.classList.contains('active'))
  })
  tab.appendChild(dispRow('display_focus_mode', focusToggle))

  // Window glow — animated accent border on windows & menus (rb-effects).
  const glowToggle = makeToggle('iceample:display:winglow', true)
  glowToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('win-glow', glowToggle.classList.contains('active'))
  })
  tab.appendChild(dispRow('display_window_glow', glowToggle))

  // ── Named layouts ──────────────────────────────────────────────────────────
  const layoutSep = document.createElement('div')
  layoutSep.style.cssText = 'margin:10px 0 6px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--dim);'
  layoutSep.textContent = t('display_layouts')
  tab.appendChild(layoutSep)

  function refreshLayoutList() {
    const list = tab.querySelector('#layout-list')
    if (!list) return
    list.innerHTML = ''
    const presets = getNamedLayouts()
    if (!Object.keys(presets).length) {
      const empty = document.createElement('div')
      empty.style.cssText = 'font-size:11px;color:var(--dim);padding:4px 0;'
      empty.textContent = t('display_no_layout')
      list.appendChild(empty)
      return
    }
    Object.keys(presets).forEach(name => {
      const row = document.createElement('div')
      row.className = 'layout-row'
      const lbl = document.createElement('span')
      lbl.className = 'layout-name'; lbl.textContent = name
      const loadBtn = document.createElement('button')
      loadBtn.className = 'layout-load-btn'
      loadBtn.innerHTML = `<i class="fa-solid fa-upload"></i> ${t('display_load')}`
      loadBtn.addEventListener('click', () => {
        const wins = presets[name]
        _workbench.querySelectorAll('.tool-win').forEach(w => w.remove())
        openTools.clear()
        wins.forEach(entry => {
          const tool = TOOLS.find(t => t.id === entry.id)
          if (!tool) return
          openTools.add(tool.id)
          const win = createToolWindow(tool, entry.x, entry.y, _workbench)
          win.style.width  = entry.w + 'px'
          win.style.height = entry.h + 'px'
        })
        _updateDock()
      })
      const delBtn = document.createElement('button')
      delBtn.className = 'layout-del-btn'
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>'
      delBtn.addEventListener('click', () => {
        deleteNamedLayout(name)
        refreshLayoutList()
      })
      row.append(lbl, loadBtn, delBtn)
      list.appendChild(row)
    })
  }

  const layoutList = document.createElement('div')
  layoutList.id = 'layout-list'
  tab.appendChild(layoutList)
  refreshLayoutList()

  const saveForm = document.createElement('div')
  saveForm.className = 'layout-save-form'
  const saveInput = document.createElement('input')
  saveInput.className = 'layout-save-input'
  saveInput.placeholder = t('display_layout_placeholder')
  const saveBtn = document.createElement('button')
  saveBtn.className = 'layout-save-btn'
  saveBtn.textContent = t('display_save')
  saveBtn.addEventListener('click', () => {
    const name = saveInput.value.trim()
    if (!name) return
    saveNamedLayout(name, _workbench)
    saveInput.value = ''
    refreshLayoutList()
    window.toast(t('display_layout_saved').replace('{name}', name), 'success')
  })
  saveForm.append(saveInput, saveBtn)
  tab.appendChild(saveForm)
}

// ── Tab: Raccourcis ───────────────────────────────────────────────────────────
// Section ordering + classification for the shortcuts tab.
const SC_ORDER = ['scg_transport', 'scg_clips', 'scg_windows', 'scg_mixer', 'scg_sequencer', 'scg_editor', 'scg_general']
const SC_TRANSPORT = new Set(['play-pause', 'transport-stop', 'play-from-start', 'play-loop', 'go-to-start', 'playhead-left', 'playhead-right', 'tempo-up', 'tempo-down', 'count-in', 'metronome', 'metro-tap', 'record'])
const SC_CLIPS = new Set(['clip-delete', 'clip-split', 'clip-duplicate', 'select-all', 'marquee-clear', 'marquee-cut', 'loop-toggle', 'clip-nudge-left', 'clip-nudge-right', 'nudge-fine-left', 'nudge-fine-right', 'new-track', 'zoom-in', 'zoom-out', 'zoom-reset'])
const SC_WINDOWS = new Set(['arrange-windows', 'focus-next-win', 'focus-prev-win', 'toggle-dock', 'close-all'])
function scGroupOf(id) {
  if (id.startsWith('win-')) return 'scg_windows'
  if (id.startsWith('ed-') || id.startsWith('ie-')) return 'scg_editor'
  if (id.startsWith('seq-')) return 'scg_sequencer'
  if (id.startsWith('mute-') || id.startsWith('solo-') || id.startsWith('master-') || id === 'mixdown') return 'scg_mixer'
  if (SC_TRANSPORT.has(id)) return 'scg_transport'
  if (SC_CLIPS.has(id)) return 'scg_clips'
  if (SC_WINDOWS.has(id)) return 'scg_windows'
  return 'scg_general'
}
function injectShortcutTabStyles() {
  if (document.getElementById('sc-extra-styles')) return
  const s = document.createElement('style')
  s.id = 'sc-extra-styles'
  s.textContent = `
.sc-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.sc-search {
  flex: 1; background: #161616; border: 1px solid var(--win-border, #2a2a2a);
  border-radius: 6px; color: var(--text-primary, #fff); font-family: inherit;
  font-size: 12px; padding: 7px 10px; outline: none;
}
.sc-search:focus { border-color: var(--color-active, #4a9eff); }
.sc-group-hdr {
  font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--color-active, #4a9eff); opacity: 0.85;
  margin: 14px 2px 6px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.07);
}
.sc-empty { font-size: 11px; color: #666; padding: 16px 4px; text-align: center; }
  `
  document.head.appendChild(s)
}

export function buildShortcutsTab() {
  const tab = document.getElementById('tab-raccourcis')
  tab.innerHTML = ''
  injectShortcutTabStyles()

  // Toolbar: search + reset
  const toolbar = document.createElement('div')
  toolbar.className = 'sc-toolbar'
  const search = document.createElement('input')
  search.type = 'text'
  search.className = 'sc-search'
  search.placeholder = t('shortcuts_search')
  search.dataset.i18nPlaceholder = 'shortcuts_search'
  const resetBtn = document.createElement('button')
  resetBtn.className = 'device-refresh-btn'
  resetBtn.innerHTML = `<i class="fa-solid fa-rotate-left"></i> <span data-i18n="shortcuts_reset">${t('shortcuts_reset')}</span>`
  resetBtn.addEventListener('click', () => { resetShortcuts(); buildShortcutsTab(); applyTranslations() })
  toolbar.append(search, resetBtn)
  tab.appendChild(toolbar)

  let capturing = null
  function makeRow(id, data) {
    const row = document.createElement('div')
    row.className = 'sc-row'

    const lbl = document.createElement('span')
    lbl.className = 'sc-label'
    lbl.dataset.i18n = data.label_key
    lbl.textContent = t(data.label_key)

    const keyEl = document.createElement('span')
    keyEl.className = 'sc-key'
    keyEl.textContent = formatBinding(data.key)

    const capBtn = document.createElement('button')
    capBtn.className = 'sc-cap-btn'
    capBtn.innerHTML = '<i class="fa-solid fa-pen"></i>'
    capBtn.addEventListener('click', () => {
      if (capturing === id) { stopCapture(); return }
      if (capturing) stopCapture()
      capturing = id
      keyEl.textContent = t('shortcuts_press')
      keyEl.classList.add('capturing')
      capBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'

      const handler = e => {
        e.preventDefault(); e.stopPropagation()
        if (e.key === 'Escape') { stopCapture(); return }
        const binding = eventToBinding(e)
        if (!binding) return
        setShortcut(id, binding)
        keyEl.textContent = formatBinding(binding)
        stopCapture()
      }
      document.addEventListener('keydown', handler, { capture: true })

      function stopCapture() {
        document.removeEventListener('keydown', handler, { capture: true })
        keyEl.classList.remove('capturing')
        keyEl.textContent = formatBinding(getAllShortcuts()[id]?.key)
        capBtn.innerHTML = '<i class="fa-solid fa-pen"></i>'
        capturing = null
      }
    })

    row.append(lbl, keyEl, capBtn)
    return { el: row, text: () => lbl.textContent.toLowerCase() }
  }

  // Classify + render by section.
  const shortcuts = getAllShortcuts()
  const byGroup = {}
  SC_ORDER.forEach(g => { byGroup[g] = [] })
  Object.entries(shortcuts).forEach(([id, data]) => { byGroup[scGroupOf(id)].push([id, data]) })

  const sections = []
  SC_ORDER.forEach(g => {
    const list = byGroup[g]
    if (!list.length) return
    const header = document.createElement('div')
    header.className = 'sc-group-hdr'
    header.dataset.i18n = g
    header.textContent = t(g)
    tab.appendChild(header)
    const rows = list.map(([id, data]) => {
      const r = makeRow(id, data)
      tab.appendChild(r.el)
      return r
    })
    sections.push({ header, rows })
  })

  // No-result line.
  const empty = document.createElement('div')
  empty.className = 'sc-empty'
  empty.dataset.i18n = 'shortcuts_none'
  empty.textContent = t('shortcuts_none')
  empty.style.display = 'none'
  tab.appendChild(empty)

  // Live search filter.
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase()
    let total = 0
    sections.forEach(sec => {
      let any = false
      sec.rows.forEach(r => {
        const m = !q || r.text().includes(q)
        r.el.style.display = m ? '' : 'none'
        if (m) any = true
      })
      sec.header.style.display = any ? '' : 'none'
      if (any) total++
    })
    empty.style.display = total ? 'none' : ''
  })
}
