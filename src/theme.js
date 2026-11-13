// theme.js — Theme management: colors, zoom, opacity, presets, background image
//
// Exports: initTheme, applyWbImage, applyZoom, applyOpacity,
//          applyThemeObj, buildThemeExtras, themeMap

import { t } from './i18n.js'
import { getBgConfig, setBgConfig } from './bg-spectrum.js'

// ── Color pickers map: HTML element id → CSS variable ────────────────────────
export const themeMap = {
  'th-workbench-bg':   '--workbench-bg',
  'th-text-primary':   '--text-primary',
  'th-text-secondary': '--text-secondary',
  'th-color-active':   '--color-active',
  'th-color-active-2': '--color-active-2',
  'th-slider-color':   '--slider-color',
  'th-surface':        '--surface',
  'th-win-border':     '--win-border',
  'th-win-border-in':  '--win-border-in',
  'th-btn-primary':    '--btn-primary',
  'th-daw-clip':       '--daw-clip-color',
  'th-master-color':   '--master-color',
  'th-vu-low':         '--vu-color-low',
  'th-vu-mid':         '--vu-color-mid',
  'th-vu-high':        '--vu-color-high',
  'th-surface2':       '--surface2',
  'th-preview-bg':     '--preview-bg',
  'th-on-accent':      '--on-accent',
  'th-danger':         '--danger',
  'th-success':        '--success',
  'th-warning':        '--warning',
}

// Set by presets only (no picker): workbench wall shading, lowered by light themes.
const PRESET_ONLY_VARS = ['--wb-shade']
const ALL_THEME_VARS = () => [...Object.values(themeMap), ...PRESET_ONLY_VARS]

// ── Presets ───────────────────────────────────────────────────────────────────
const THEME_PRESETS = {
  'Iceample':  { '--workbench-bg':'#0c0a12','--text-primary':'#f2ecff','--text-secondary':'#8a7ba5','--color-active':'#b23fd6','--color-active-2':'#8ed531','--slider-color':'#b23fd6','--surface':'#16121e','--win-border':'#2c2340','--win-border-in':'#201830','--btn-primary':'#b23fd6','--daw-clip-color':'#8ed531','--master-color':'#ee6a1e','--vu-color-low':'#8ed531','--vu-color-mid':'#ee6a1e','--vu-color-high':'#ff4d6d' },
  'Arctic':    { '--on-accent':'#0b1a22', '--workbench-bg':'#141a20','--text-primary':'#eaf2f8','--text-secondary':'#6a8296','--color-active':'#7ec8e3','--color-active-2':'#a3d9c9','--slider-color':'#7ec8e3','--surface':'#1b232c','--win-border':'#2c3a46','--win-border-in':'#212b34','--btn-primary':'#7ec8e3','--daw-clip-color':'#5e9dc4','--master-color':'#4a7a96','--vu-color-low':'#8fd4a8','--vu-color-mid':'#e9c46a','--vu-color-high':'#e07a5f' },
  'Midnight':  { '--workbench-bg':'#080b16','--text-primary':'#dde4ff','--text-secondary':'#5566a6','--color-active':'#6d8bff','--color-active-2':'#3fd0e0','--slider-color':'#6d8bff','--surface':'#111528','--win-border':'#1c2444','--win-border-in':'#141a30','--btn-primary':'#6d8bff','--daw-clip-color':'#4560e0','--master-color':'#2f47c0','--vu-color-low':'#39d98a','--vu-color-mid':'#e6c34a','--vu-color-high':'#ff5d6c' },
  'Nebula':    { '--workbench-bg':'#0d0818','--text-primary':'#f0e2ff','--text-secondary':'#8b6fb0','--color-active':'#a855f7','--color-active-2':'#ff5db1','--slider-color':'#a855f7','--surface':'#1a1230','--win-border':'#2e1f4a','--win-border-in':'#221636','--btn-primary':'#a855f7','--daw-clip-color':'#7c3aed','--master-color':'#c026d3','--vu-color-low':'#41d99a','--vu-color-mid':'#f0b429','--vu-color-high':'#ff5d8f' },
  'Ember':     { '--workbench-bg':'#140a06','--text-primary':'#ffe9d6','--text-secondary':'#a57a5a','--color-active':'#ff7a30','--color-active-2':'#ffc24b','--slider-color':'#ff7a30','--surface':'#1f130b','--win-border':'#3a2113','--win-border-in':'#2a180d','--btn-primary':'#ff7a30','--daw-clip-color':'#e0641a','--master-color':'#c0410a','--vu-color-low':'#8ed531','--vu-color-mid':'#ff9e40','--vu-color-high':'#ff4d4d' },
  'Crimson':   { '--workbench-bg':'#140809','--text-primary':'#ffe0e4','--text-secondary':'#9c5a63','--color-active':'#ff3b5c','--color-active-2':'#ff8fa3','--slider-color':'#ff3b5c','--surface':'#201014','--win-border':'#3a1620','--win-border-in':'#2a0f18','--btn-primary':'#ff3b5c','--daw-clip-color':'#c81e3c','--master-color':'#961830','--vu-color-low':'#41d99a','--vu-color-mid':'#ffb04a','--vu-color-high':'#ff2d55' },
  'Aurora':    { '--on-accent':'#03140c', '--workbench-bg':'#04120e','--text-primary':'#d6f5e6','--text-secondary':'#5a9a80','--color-active':'#25d97a','--color-active-2':'#37e0d0','--slider-color':'#25d97a','--surface':'#0b2019','--win-border':'#154034','--win-border-in':'#0e2c22','--btn-primary':'#25d97a','--daw-clip-color':'#12a866','--master-color':'#0e7a52','--vu-color-low':'#25d97a','--vu-color-mid':'#e6c34a','--vu-color-high':'#ff5d6c' },
  'Gold':      { '--on-accent':'#1a1400', '--workbench-bg':'#12100a','--text-primary':'#fff4d6','--text-secondary':'#9c8a55','--color-active':'#f0c020','--color-active-2':'#e8894b','--slider-color':'#f0c020','--surface':'#1e1a10','--win-border':'#3a3016','--win-border-in':'#2a220f','--btn-primary':'#f0c020','--daw-clip-color':'#c99a1e','--master-color':'#a06a12','--vu-color-low':'#8ed531','--vu-color-mid':'#f0c020','--vu-color-high':'#ff5d4d' },
  'Neon':      { '--workbench-bg':'#07070d','--text-primary':'#eafcff','--text-secondary':'#5f7f96','--color-active':'#ff2ec4','--color-active-2':'#22e0ff','--slider-color':'#ff2ec4','--surface':'#10101c','--win-border':'#241a3a','--win-border-in':'#181026','--btn-primary':'#ff2ec4','--daw-clip-color':'#b026ff','--master-color':'#00d0ff','--vu-color-low':'#2effc4','--vu-color-mid':'#ffe12e','--vu-color-high':'#ff2e6a' },
  'Mono':      { '--on-accent':'#111114', '--workbench-bg':'#0c0c0e','--text-primary':'#eaeaec','--text-secondary':'#7a7a80','--color-active':'#c8c8d0','--color-active-2':'#9a9aa2','--slider-color':'#c8c8d0','--surface':'#17171a','--win-border':'#2c2c30','--win-border-in':'#202024','--btn-primary':'#c8c8d0','--daw-clip-color':'#6a6a72','--master-color':'#4a4a50','--vu-color-low':'#8ed531','--vu-color-mid':'#e6c34a','--vu-color-high':'#ff5d6c' },
  // Light theme: everything the tools draw now follows these variables.
  'Daylight':  { '--workbench-bg':'#e9e6f0','--text-primary':'#1d1729','--text-secondary':'#655c7a','--color-active':'#8a2bc7','--color-active-2':'#4f9a1a','--slider-color':'#8a2bc7','--surface':'#fbfaff','--surface2':'#efecf5','--win-border':'#cdc5dc','--win-border-in':'#e3dded','--btn-primary':'#8a2bc7','--daw-clip-color':'#79b83a','--master-color':'#d9480f','--vu-color-low':'#2f9e44','--vu-color-mid':'#e8590c','--vu-color-high':'#e03131','--on-accent':'#ffffff','--danger':'#d6334f','--success':'#2b9a5f','--warning':'#c98a06','--preview-bg':'#d9d4e3','--wb-shade':'rgba(60, 40, 90, 0.12)' },
}
const PRESET_COLORS  = { 'Daylight':'#e9e6f0', 'Iceample':'#0c0a12','Arctic':'#141a20','Midnight':'#080b16','Nebula':'#0d0818','Ember':'#140a06','Crimson':'#140809','Aurora':'#04120e','Gold':'#12100a','Neon':'#07070d','Mono':'#0c0c0e' }
const PRESET_ACCENTS = { 'Daylight':'#8a2bc7', 'Iceample':'#b23fd6','Arctic':'#7ec8e3','Midnight':'#6d8bff','Nebula':'#a855f7','Ember':'#ff7a30','Crimson':'#ff3b5c','Aurora':'#25d97a','Gold':'#f0c020','Neon':'#ff2ec4','Mono':'#c8c8d0' }

// ── Module-level DOM references (set by initTheme) ────────────────────────────
let _wbBgImg = null

// Lighten a #rrggbb toward white by amt (0..1).
function _lighten(hex, amt) {
  const m = (hex || '').replace('#', '')
  if (m.length !== 6) return hex
  const f = v => Math.round(v + (255 - v) * amt).toString(16).padStart(2, '0')
  return '#' + f(parseInt(m.slice(0, 2), 16)) + f(parseInt(m.slice(2, 4), 16)) + f(parseInt(m.slice(4, 6), 16))
}

// ── Theme applier ─────────────────────────────────────────────────────────────
export function applyThemeObj(obj) {
  obj = { ...obj }
  // Presets / imported themes predate these vars → derive sensible values so the
  // secondary accent and panel surface stay coherent.
  if (obj['--color-active'] && !obj['--color-active-2']) obj['--color-active-2'] = obj['--color-active']
  if (obj['--workbench-bg'] && !obj['--surface'])        obj['--surface'] = _lighten(obj['--workbench-bg'], 0.06)
  Object.entries(obj).forEach(([cssVar, val]) => {
    document.documentElement.style.setProperty(cssVar, val)
    try { localStorage.setItem('theme:' + cssVar, val) } catch {}
  })
  // A theme that doesn't set one of the newer colours (older presets, imported
  // files) gets its default back instead of keeping the previous theme's value.
  for (const cssVar of ALL_THEME_VARS()) {
    if (cssVar in obj) continue
    document.documentElement.style.removeProperty(cssVar)
    try { localStorage.removeItem('theme:' + cssVar) } catch {}
  }
  syncThemeInputs()
  notifyThemeChange()
}

/** Remove every colour set in the Theme tab: back to the default theme. */
export function resetThemeColors() {
  for (const cssVar of ALL_THEME_VARS()) {
    document.documentElement.style.removeProperty(cssVar)
    try { localStorage.removeItem('theme:' + cssVar) } catch {}
  }
  syncThemeInputs()
  notifyThemeChange()
}

/** The colour a variable currently resolves to, as #rrggbb (for the pickers;
 *  derived values such as color-mix() are resolved too). */
export function resolveVarHex(cssVar) {
  const probe = document.createElement('span')
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;color:var(${cssVar})`
  document.body.appendChild(probe)
  const c = getComputedStyle(probe).color
  probe.remove()
  const n = (c.match(/[\d.]+/g) || []).map(Number)
  if (n.length < 3) return '#000000'
  const scale = c.startsWith('color(') ? 255 : 1   // color(srgb r g b) uses 0–1
  return '#' + n.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(v * scale))).toString(16).padStart(2, '0')).join('')
}

/** Show the colour actually in use in every picker of the Theme tab. */
export function syncThemeInputs() {
  Object.entries(themeMap).forEach(([id, cssVar]) => {
    const inp = document.getElementById(id)
    if (inp) inp.value = resolveVarHex(cssVar)
  })
}

// ── Background image ──────────────────────────────────────────────────────────
export function applyWbImage() {
  if (!_wbBgImg) return
  try {
    const src     = localStorage.getItem('theme:wb-image')
    const fit     = localStorage.getItem('theme:wb-image-fit')     || 'cover'
    const opacity = parseFloat(localStorage.getItem('theme:wb-image-opacity') || '0.4')
    if (src) {
      _wbBgImg.style.backgroundImage    = `url(${src})`
      _wbBgImg.style.backgroundSize     = fit === 'tile' ? 'auto' : fit
      _wbBgImg.style.backgroundRepeat   = fit === 'tile' ? 'repeat' : 'no-repeat'
      _wbBgImg.style.backgroundPosition = 'center'
      _wbBgImg.style.opacity            = opacity
      _wbBgImg.style.display            = 'block'
    } else {
      _wbBgImg.style.display = 'none'
    }
  } catch {}
}

// ── Global zoom (CSS zoom scales full layout in Chromium/Tauri) ───────────────
export function applyZoom(pct) {
  document.body.style.zoom = pct / 100
  try { localStorage.setItem('theme:--font-size-base', pct) } catch {}
}

// ── Window opacity ────────────────────────────────────────────────────────────
export function applyOpacity(val) {
  const blur = ((1 - val) * 22).toFixed(1) + 'px'
  document.documentElement.style.setProperty('--win-opacity', val)
  document.documentElement.style.setProperty('--win-blur', blur)
  try { localStorage.setItem('theme:--win-opacity', val) } catch {}
}

// ── Window corner radius ──────────────────────────────────────────────────────
export function applyRadius(px) {
  document.documentElement.style.setProperty('--win-radius', px + 'px')
  try { localStorage.setItem('theme:--win-radius', px) } catch {}
}

// ── Init: create bg image layer, restore saved theme values ──────────────────
/**
 * Call once from DOMContentLoaded.
 * Creates the wb-bg-img element (appended as first child of workbench),
 * restores saved theme values, and applies initial zoom/opacity.
 */
export function initTheme(workbench) {
  // Background image layer (behind shader canvas, z-index 1)
  _wbBgImg = document.createElement('div')
  _wbBgImg.id = 'workbench-bg-img'
  workbench.appendChild(_wbBgImg)
  applyWbImage()

  // Restore saved colours (pickers and preset-only variables)
  for (const cssVar of ALL_THEME_VARS()) {
    try {
      const saved = localStorage.getItem('theme:' + cssVar)
      if (saved) document.documentElement.style.setProperty(cssVar, saved)
    } catch {}
  }
  syncThemeInputs()

  // Restore font
  try {
    const savedFont = localStorage.getItem('theme:--font-family')
    if (savedFont) document.documentElement.style.setProperty('--font-family', savedFont)
  } catch {}

  // Restore zoom
  try {
    const savedZoom = parseFloat(localStorage.getItem('theme:--font-size-base') || '100')
    applyZoom(savedZoom)
  } catch { applyZoom(100) }

  // Restore opacity
  try {
    const savedOpacity = parseFloat(localStorage.getItem('theme:--win-opacity') || '1')
    applyOpacity(savedOpacity)
  } catch { applyOpacity(1) }

  // Restore window corner radius
  try {
    const savedRadius = parseFloat(localStorage.getItem('theme:--win-radius') || '12')
    applyRadius(savedRadius)
  } catch { applyRadius(12) }
}

// ── Custom theme indicator callback (set by buildThemeExtras) ─────────────────
let _onThemeChange = null

/** Call after any color picker change to keep preset highlight in sync. */
export function notifyThemeChange() {
  _colorCache.clear()
  _onThemeChange?.()
  // Canvas-drawn UI (meters, graphs) listens to this to repaint with the new colours.
  window.dispatchEvent(new CustomEvent('iceample-theme-changed'))
}

// ── Theme colours for canvas drawing ──────────────────────────────────────────
// A canvas can't read CSS variables: themeColor('--surface2') gives the colour
// in use as #rrggbb (cached until the theme changes). Use it for UI drawn on a
// canvas (graph backgrounds, grids, meter wells) — never for user content.
const _colorCache = new Map()
export function themeColor(cssVar) {
  if (!_colorCache.has(cssVar)) _colorCache.set(cssVar, resolveVarHex(cssVar))
  return _colorCache.get(cssVar)
}

// ── Build theme settings tab ──────────────────────────────────────────────────
export function buildThemeExtras() {
  const tab = document.getElementById('tab-theme')
  // Clean previously injected elements (rebuilt on language change)
  tab.querySelector('.theme-presets-row')?.remove()
  tab.querySelector('.theme-io-row')?.remove()
  tab.querySelectorAll('[data-th-extra]').forEach(el => el.remove())
  _onThemeChange = null

  // ── Presets ─────────────────────────────────────────────────────────────────
  const presetsRow = document.createElement('div')
  presetsRow.className = 'theme-presets-row'
  const presetBtns = {}
  Object.entries(THEME_PRESETS).forEach(([name, obj]) => {
    const btn = document.createElement('button')
    btn.className = 'theme-preset-btn'
    btn.textContent = name
    btn.style.background = PRESET_COLORS[name]
    btn.style.color = PRESET_ACCENTS[name]
    btn.style.borderColor = PRESET_ACCENTS[name] + '60'
    btn.title = name
    if (name === 'Gold') { btn.style.flex = '0.72'; btn.style.fontSize = '7.5px'; btn.style.minWidth = '40px' }
    btn.addEventListener('click', () => applyThemeObj(obj))
    presetsRow.appendChild(btn)
    presetBtns[name] = btn
  })

  // "Custom" indicator
  const customLabel = document.createElement('div')
  customLabel.id = 'theme-custom-label'
  customLabel.textContent = t('theme_custom')
  customLabel.style.cssText = `
    flex:0; min-width:0; overflow:hidden; height:24px; border-radius:5px;
    display:flex; align-items:center; justify-content:center;
    font-size:9px; font-weight:700; letter-spacing:0.05em;
    white-space:nowrap; opacity:0;
    transition:flex 0.18s ease, min-width 0.18s ease, opacity 0.18s ease;
  `
  presetsRow.appendChild(customLabel)

  function checkCustomTheme() {
    const style = getComputedStyle(document.documentElement)
    let matchedPreset = null
    for (const [name, obj] of Object.entries(THEME_PRESETS)) {
      const matches = Object.entries(obj).every(([cssVar, val]) =>
        style.getPropertyValue(cssVar).trim().toLowerCase() === val.toLowerCase()
      )
      if (matches) { matchedPreset = name; break }
    }
    Object.entries(presetBtns).forEach(([name, btn]) => {
      btn.classList.toggle('active', name === matchedPreset)
    })
    if (matchedPreset) {
      customLabel.style.flex = '0'
      customLabel.style.minWidth = '0'
      customLabel.style.opacity = '0'
      customLabel.style.border = 'none'
      customLabel.style.background = 'transparent'
    } else {
      customLabel.style.flex = '3'
      customLabel.style.minWidth = '130px'
      customLabel.style.opacity = '1'
      customLabel.style.color = 'var(--color-active)'
      customLabel.style.border = '1px dashed var(--color-active)'
      customLabel.style.background = 'rgba(255,255,255,0.03)'
    }
  }

  _onThemeChange = checkCustomTheme
  checkCustomTheme()
  tab.insertBefore(presetsRow, tab.firstChild)

  // ── Clear-glass (glassmorphism) toggle ──────────────────────────────────────
  const glassRow = document.createElement('label')
  glassRow.className = 'theme-glass-row'; glassRow.setAttribute('data-th-extra', '1')
  const gcb = document.createElement('input'); gcb.type = 'checkbox'
  gcb.checked = document.documentElement.classList.contains('glass')
  gcb.addEventListener('change', () => {
    document.documentElement.classList.toggle('glass', gcb.checked)
    try { localStorage.setItem('theme:glass', gcb.checked ? 'true' : 'false') } catch {}
  })
  const glassTxt = document.createElement('span'); glassTxt.textContent = t('theme_glass')
  glassRow.append(glassTxt, gcb)
  tab.insertBefore(glassRow, presetsRow.nextSibling)

  // ── Export / Import ──────────────────────────────────────────────────────────
  const ioRow = document.createElement('div')
  ioRow.className = 'theme-io-row'

  const exportBtn = document.createElement('button')
  exportBtn.className = 'theme-io-btn'
  exportBtn.innerHTML = `<i class="fa-solid fa-file-export"></i> ${t('theme_export')}`
  exportBtn.addEventListener('click', () => {
    const out = {}
    ALL_THEME_VARS().forEach(cssVar => {
      // Only what is set (by hand or by a preset): derived defaults stay derived.
      const val = document.documentElement.style.getPropertyValue(cssVar).trim()
        || getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
      if (val && !val.startsWith('color-mix')) out[cssVar] = val
    })
    try {
      const ff = localStorage.getItem('theme:--font-family') || ''
      const fs = localStorage.getItem('theme:--font-size-base') || ''
      const wo = localStorage.getItem('theme:--win-opacity') || ''
      const wr = localStorage.getItem('theme:--win-radius') || ''
      if (ff) out['--font-family'] = ff
      if (fs) out['--font-size-base'] = fs
      if (wo) out['--win-opacity'] = wo
      if (wr) out['--win-radius'] = wr
    } catch {}
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'iceample-theme.json' })
    a.click()
  })

  const importBtn = document.createElement('button')
  importBtn.className = 'theme-io-btn'
  importBtn.innerHTML = `<i class="fa-solid fa-file-import"></i> ${t('theme_import')}`
  importBtn.addEventListener('click', () => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = '.json,application/json'
    inp.onchange = () => {
      const file = inp.files[0]; if (!file) return
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const obj = JSON.parse(e.target.result)
          applyThemeObj(obj)
          if (obj['--font-family']) {
            document.documentElement.style.setProperty('--font-family', obj['--font-family'])
            try { localStorage.setItem('theme:--font-family', obj['--font-family']) } catch {}
            const sel = document.getElementById('th-font-family')
            if (sel) sel.value = obj['--font-family']
          }
          if (obj['--font-size-base']) applyZoom(parseFloat(obj['--font-size-base']))
          if (obj['--win-opacity'])    applyOpacity(parseFloat(obj['--win-opacity']))
          if (obj['--win-radius'])     applyRadius(parseFloat(obj['--win-radius']))
          window.toast(t('theme_imported'), 'success')
        } catch { window.toast(t('theme_invalid_json'), 'error') }
      }
      reader.readAsText(file)
    }
    inp.click()
  })

  ioRow.append(exportBtn, importBtn)
  tab.insertBefore(ioRow, presetsRow.nextSibling)

  // ── Typography ───────────────────────────────────────────────────────────────
  const FONTS = [
    ["'Segoe UI', system-ui, sans-serif", 'Segoe UI (défaut)'],
    ["system-ui, sans-serif",             'System UI'],
    ["'Consolas', monospace",             'Consolas (mono)'],
    ["'JetBrains Mono', monospace",       'JetBrains Mono'],
    ["'Georgia', serif",                  'Georgia (serif)'],
  ]
  const fontRow = _makeThemeRow(t('th_font_family'), () => {
    const sel = document.createElement('select')
    sel.id = 'th-font-family'
    sel.className = 'audio-select'
    FONTS.forEach(([val, label]) => {
      const opt = document.createElement('option'); opt.value = val; opt.textContent = label
      sel.appendChild(opt)
    })
    try {
      const saved = localStorage.getItem('theme:--font-family')
      if (saved) sel.value = saved
    } catch {}
    sel.addEventListener('change', () => {
      document.documentElement.style.setProperty('--font-family', sel.value)
      try { localStorage.setItem('theme:--font-family', sel.value) } catch {}
    })
    return sel
  })

  // (UI scale + window opacity sliders moved to the Display tab.)
  fontRow.dataset.thExtra = '1'

  // Window corner radius
  const radiusRow = _makeThemeRow(t('th_win_radius'), () => {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;'
    const sl = document.createElement('input')
    sl.type = 'range'; sl.min = '0'; sl.max = '24'; sl.step = '1'
    sl.style.width = '90px'
    try { sl.value = localStorage.getItem('theme:--win-radius') || '12' } catch { sl.value = '12' }
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:10px;color:var(--text-primary);min-width:34px;text-align:right;'
    lbl.textContent = sl.value + 'px'
    sl.addEventListener('input', () => { applyRadius(parseFloat(sl.value)); lbl.textContent = sl.value + 'px' })
    wrap.append(sl, lbl)
    return wrap
  })
  radiusRow.dataset.thExtra = '1'

  const firstRow = tab.querySelector('.theme-row')
  tab.insertBefore(fontRow, firstRow)
  tab.insertBefore(radiusRow, firstRow)

  // ── Background Image ──────────────────────────────────────────────────────────
  const imgSection = document.createElement('div')
  imgSection.dataset.thExtra = '1'
  imgSection.style.cssText = 'margin-top:10px;'

  const imgTitle = document.createElement('div')
  imgTitle.style.cssText = 'font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.08em;padding:6px 0 4px;border-top:1px solid var(--win-border-in);margin-top:4px;'
  imgTitle.textContent = t('th_bg_image')
  imgSection.appendChild(imgTitle)

  function _imgRow(label, ctrl) {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 0;'
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:10px;color:var(--text-secondary);'
    lbl.textContent = label
    row.append(lbl, ctrl)
    return row
  }

  const imgPickRow = document.createElement('div')
  imgPickRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;'

  const imgThumb = document.createElement('div')
  imgThumb.style.cssText = 'width:44px;height:30px;border-radius:4px;border:1px solid var(--win-border-in);background-size:cover;background-position:center;flex-shrink:0;background-color:var(--win-border-in);'
  try {
    const _storedSrc = localStorage.getItem('theme:wb-image')
    if (_storedSrc) imgThumb.style.backgroundImage = `url(${_storedSrc})`
  } catch {}

  const imgPickBtn = document.createElement('button')
  imgPickBtn.className = 'theme-io-btn'
  imgPickBtn.style.cssText = 'flex:1;font-size:9px;padding:3px 6px;'
  imgPickBtn.textContent = t('th_bg_img_pick')
  imgPickBtn.addEventListener('click', () => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = 'image/*'
    inp.onchange = () => {
      const file = inp.files[0]; if (!file) return
      if (file.size > 3 * 1024 * 1024) { window.toast(t('th_bg_img_too_large'), 'error'); return }
      const reader = new FileReader()
      reader.onload = e => {
        try { localStorage.setItem('theme:wb-image', e.target.result) } catch {}
        applyWbImage()
        imgThumb.style.backgroundImage = `url(${e.target.result})`
      }
      reader.readAsDataURL(file)
    }
    inp.click()
  })

  const imgClearBtn = document.createElement('button')
  imgClearBtn.className = 'theme-io-btn'
  imgClearBtn.style.cssText = 'font-size:9px;padding:3px 6px;'
  imgClearBtn.textContent = t('th_bg_img_clear')
  imgClearBtn.addEventListener('click', () => {
    try { localStorage.removeItem('theme:wb-image') } catch {}
    applyWbImage()
    imgThumb.style.backgroundImage = ''
  })

  imgPickRow.append(imgThumb, imgPickBtn, imgClearBtn)
  imgSection.appendChild(imgPickRow)

  const imgFitSel = document.createElement('select')
  imgFitSel.className = 'audio-select'
  imgFitSel.style.cssText = 'font-size:10px;padding:2px 4px;'
  ;[['cover', t('th_bg_img_cover')], ['contain', t('th_bg_img_contain')], ['tile', t('th_bg_img_tile')]].forEach(([v, l]) => {
    const opt = document.createElement('option'); opt.value = v; opt.textContent = l
    imgFitSel.appendChild(opt)
  })
  try { imgFitSel.value = localStorage.getItem('theme:wb-image-fit') || 'cover' } catch {}
  imgFitSel.addEventListener('change', () => {
    try { localStorage.setItem('theme:wb-image-fit', imgFitSel.value) } catch {}
    applyWbImage()
  })
  imgSection.appendChild(_imgRow(t('th_bg_img_fit'), imgFitSel))

  const imgOpWrap = document.createElement('div')
  imgOpWrap.style.cssText = 'display:flex;align-items:center;gap:6px;'
  const imgOpSl = document.createElement('input')
  imgOpSl.type = 'range'; imgOpSl.min = '0.05'; imgOpSl.max = '1'; imgOpSl.step = '0.05'
  try { imgOpSl.value = localStorage.getItem('theme:wb-image-opacity') || '0.4' } catch { imgOpSl.value = '0.4' }
  imgOpSl.style.width = '70px'
  const imgOpLbl = document.createElement('span')
  imgOpLbl.style.cssText = 'font-size:10px;color:var(--text-primary);min-width:28px;text-align:right;'
  imgOpLbl.textContent = Math.round(parseFloat(imgOpSl.value) * 100) + '%'
  imgOpSl.addEventListener('input', () => {
    try { localStorage.setItem('theme:wb-image-opacity', imgOpSl.value) } catch {}
    applyWbImage()
    imgOpLbl.textContent = Math.round(parseFloat(imgOpSl.value) * 100) + '%'
  })
  imgOpWrap.append(imgOpSl, imgOpLbl)
  imgSection.appendChild(_imgRow(t('bg_spec_opacity'), imgOpWrap))
  tab.appendChild(imgSection)

  // ── Background Shader ─────────────────────────────────────────────────────────
  const bgSection = document.createElement('div')
  bgSection.dataset.thExtra = '1'
  bgSection.style.cssText = 'margin-top:10px;'

  const bgTitle = document.createElement('div')
  bgTitle.style.cssText = 'font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.08em;padding:6px 0 4px;border-top:1px solid var(--win-border-in);margin-top:4px;'
  bgTitle.textContent = t('bg_spec_title')
  bgSection.appendChild(bgTitle)

  function _bgRow(label, control) {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 0;'
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:10px;color:var(--text-secondary);'
    lbl.textContent = label
    row.append(lbl, control)
    return row
  }

  const bgCfg = getBgConfig()

  const enableWrap = document.createElement('label')
  enableWrap.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 0;'
  const enableChk = document.createElement('input')
  enableChk.type = 'checkbox'
  enableChk.checked = bgCfg.enabled
  enableChk.addEventListener('change', () => setBgConfig({ enabled: enableChk.checked }))
  const enableLbl = document.createElement('span')
  enableLbl.style.cssText = 'font-size:10px;color:var(--text-secondary);'
  enableLbl.textContent = t('bg_spec_enable')
  enableWrap.append(enableChk, enableLbl)
  bgSection.appendChild(enableWrap)

  const styleSelect = document.createElement('select')
  styleSelect.className = 'audio-select'
  styleSelect.style.cssText = 'font-size:10px;padding:2px 4px;'
  ;[
    ['cosmos',      t('bg_spec_cosmos')],
    ['particles',   t('bg_spec_particles')],
    ['dither',      t('bg_spec_dither')],
    ['plasma',      t('bg_spec_bars')],
    ['waves',       t('bg_spec_wave')],
    ['stars',       t('bg_spec_radial')],
    ['grid',        t('bg_spec_grid')],
    ['aurora',      t('bg_spec_aurora')],
    ['bg-gradient', '✦ Aurore'],
    ['bg-plasma',   '✦ Plasma'],
    ['bg-geometry', '✦ Géométrie'],
    ['bg-nebula',   '✦ Nébuleuse'],
  ].forEach(([val, label]) => {
    const opt = document.createElement('option'); opt.value = val; opt.textContent = label
    styleSelect.appendChild(opt)
  })
  styleSelect.value = bgCfg.style || 'plasma'
  styleSelect.addEventListener('change', () => setBgConfig({ style: styleSelect.value }))
  bgSection.appendChild(_bgRow(t('bg_spec_style'), styleSelect))

  function _bgSlider(min, max, step, val, fmt, onInput) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;'
    const sl = document.createElement('input')
    sl.type = 'range'; sl.min = min; sl.max = max; sl.step = step
    sl.value = val; sl.style.width = '70px'
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:10px;color:var(--text-primary);min-width:30px;text-align:right;'
    lbl.textContent = fmt(parseFloat(val))
    sl.addEventListener('input', () => { lbl.textContent = fmt(parseFloat(sl.value)); onInput(parseFloat(sl.value)) })
    wrap.append(sl, lbl)
    return wrap
  }

  bgSection.appendChild(_bgRow(t('bg_spec_opacity'),
    _bgSlider('0.05', '1', '0.05', bgCfg.opacity,
      v => Math.round(v * 100) + '%',
      v => setBgConfig({ opacity: v }))))

  bgSection.appendChild(_bgRow(t('bg_spec_speed'),
    _bgSlider('0.1', '3', '0.1', bgCfg.speed ?? 1.0,
      v => v.toFixed(1) + '×',
      v => setBgConfig({ speed: v }))))

  bgSection.appendChild(_bgRow(t('bg_spec_intensity'),
    _bgSlider('0.1', '1', '0.05', bgCfg.intensity ?? 0.7,
      v => Math.round(v * 100) + '%',
      v => setBgConfig({ intensity: v }))))

  bgSection.appendChild(_bgRow(t('bg_spec_density'),
    _bgSlider('0', '1', '0.05', bgCfg.density ?? 0.5,
      v => Math.round(v * 100) + '%',
      v => setBgConfig({ density: v }))))

  function _colorRow(labelKey, cfgKey, defaultVal) {
    const pick = document.createElement('input')
    pick.type = 'color'; pick.value = bgCfg[cfgKey] || defaultVal
    pick.style.cssText = 'width:32px;height:20px;border:none;background:none;cursor:pointer;padding:0;'
    pick.addEventListener('input', () => setBgConfig({ [cfgKey]: pick.value }))
    return _bgRow(t(labelKey), pick)
  }
  bgSection.appendChild(_colorRow('bg_spec_color',  'color',  '#4a9eff'))
  bgSection.appendChild(_colorRow('bg_spec_color2', 'color2', '#ff6030'))
  bgSection.appendChild(_colorRow('bg_spec_color',  'color3', '#3a105a'))

  tab.appendChild(bgSection)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _makeThemeRow(labelText, buildControl) {
  const row = document.createElement('div')
  row.className = 'theme-row'
  const lbl = document.createElement('span')
  lbl.className = 'theme-label'; lbl.textContent = labelText
  row.append(lbl, buildControl())
  return row
}
