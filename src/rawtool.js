// rawtool.js — Photo RAW : visionneuse + développement de fichiers RAW appareil photo
//
// Deux pipelines, jamais confondus :
//   1. `raw_embedded_preview` → le JPEG que l'appareil a lui-même intégré au
//      fichier. Toujours disponible, aucun outil externe, instantané. Ce n'est
//      PAS un développement des données du capteur — le badge le dit.
//   2. `raw_develop` (LibRaw / dcraw_emu) → vrai dématriçage du capteur, avec
//      balance des blancs, exposition, hautes lumières… Passe rapide en `half`
//      d'abord, pleine résolution seulement sur demande.
// Les réglages « locaux » (luminosité/contraste/saturation) sont purement
// canvas : ils se réappliquent sur la source décodée sans relancer le backend.

import { t } from './i18n.js'
import { promptName } from './rename-dialog.js'
import { makeSendButton, imageMedia } from './media-bus.js'
import { trackRecentFile } from './recent.js'

const RAW_EXTS = ['cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'dng', 'srw', 'pef']
const LIBRAW_KEY = 'iceample:libraw:exe'

function libRoot() { return localStorage.getItem('library:root') }
function baseName(p) { return String(p || '').split(/[\\/]/).pop() }
function stripExt(n) { return String(n || '').replace(/\.[^.]+$/, '') }
function extOf(n) { return (String(n || '').split('.').pop() || '').toLowerCase() }
function isRaw(n) { return RAW_EXTS.includes(extOf(n)) }

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('rw-styles')) return
  const s = document.createElement('style'); s.id = 'rw-styles'
  s.textContent = `
.rw-wrap{display:flex;flex-direction:column;height:100%;background:var(--surface);color:var(--text-primary);font-family:inherit;font-size:12px}
.rw-bar{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid var(--win-border-in);flex-shrink:0}
.rw-btn{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;height:27px;border:1px solid var(--win-border);border-radius:7px;background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));color:var(--text-primary);font-size:11px;cursor:pointer;white-space:nowrap;font-family:inherit;transition:background .12s ease,border-color .12s ease,transform .08s ease}
.rw-btn:hover:not(:disabled){background:color-mix(in srgb,var(--text-primary) 13%,var(--surface))}
.rw-btn:active:not(:disabled){transform:translateY(1px)}
.rw-btn:disabled{opacity:.4;cursor:default}
.rw-file{font-size:11px;color:var(--text-secondary);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rw-spacer{flex:1}
.rw-main{display:flex;flex:1;overflow:hidden}
.rw-preview{flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;background:color-mix(in srgb,var(--surface) 45%,#000)}
.rw-canvas{max-width:calc(100% - 32px);max-height:calc(100% - 32px);object-fit:contain;display:none;border-radius:6px;box-shadow:0 14px 36px -14px rgba(0,0,0,.75)}
.rw-empty{display:flex;flex-direction:column;align-items:center;gap:10px;opacity:.45;pointer-events:none;padding:0 24px;text-align:center}
.rw-empty i{font-size:38px}
.rw-empty span{font-size:12px;line-height:1.5}
.rw-panel{width:210px;flex-shrink:0;border-left:1px solid var(--win-border-in);display:flex;flex-direction:column;overflow-y:auto;background:color-mix(in srgb,var(--surface) 85%,#000)}
.rw-sec{padding:9px 10px;border-bottom:1px solid var(--win-border-in);display:flex;flex-direction:column;gap:8px}
.rw-sec-head{font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px}
.rw-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;border:1px solid var(--win-border);background:color-mix(in srgb,var(--text-primary) 6%,var(--surface));color:var(--text-secondary);font-size:10px;font-weight:600;line-height:1.3}
.rw-badge i{font-size:9px;opacity:.8}
.rw-badge.rw-badge-dev{border-color:color-mix(in srgb,var(--color-active) 55%,var(--win-border));background:color-mix(in srgb,var(--color-active) 14%,var(--surface));color:var(--text-primary)}
.rw-field{display:flex;flex-direction:column;gap:3px}
.rw-field label{font-size:10px;color:var(--text-secondary);display:flex;justify-content:space-between;gap:6px}
.rw-field .rw-val{opacity:.75;font-variant-numeric:tabular-nums}
.rw-field input[type=range]{width:100%;accent-color:var(--color-active);margin:0}
.rw-field select{width:100%;background:var(--surface2,var(--surface));border:1px solid var(--win-border-in);color:var(--text-primary);border-radius:5px;padding:4px 6px;font-size:11px;font-family:inherit;outline:none}
.rw-check{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-secondary);cursor:pointer}
.rw-check input{accent-color:var(--color-active);margin:0}
.rw-go{width:100%;justify-content:center;height:30px;border-color:color-mix(in srgb,var(--color-active) 55%,var(--win-border));background:color-mix(in srgb,var(--color-active) 20%,var(--surface));font-weight:600}
.rw-go:hover:not(:disabled){background:color-mix(in srgb,var(--color-active) 30%,var(--surface))}
.rw-res{font-size:10px;color:var(--text-secondary);text-align:center;opacity:.75;font-variant-numeric:tabular-nums;min-height:12px}
.rw-ov{position:absolute;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:40}
.rw-ov-panel{background:var(--surface2,var(--surface));border:1px solid var(--win-border-in);border-radius:10px;padding:14px;width:290px;max-width:85%;display:flex;flex-direction:column;gap:10px;box-shadow:0 10px 28px -10px rgba(0,0,0,.6)}
.rw-ov-head{display:flex;align-items:center;gap:8px}
.rw-ov-title{flex:1;font-size:12px;font-weight:600;color:var(--text-primary)}
.rw-ov-close{border:none;background:none;color:var(--text-secondary);cursor:pointer;font-size:13px;padding:2px 6px}
.rw-ov-desc{font-size:11px;color:var(--text-secondary);line-height:1.5}
.rw-ov-note{font-size:10px;color:var(--text-secondary);opacity:.75;line-height:1.5}
.rw-ov-path{font-size:10px;color:var(--text-secondary);opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rw-tauri{display:flex;align-items:center;justify-content:center;height:100%;padding:0 28px;text-align:center;color:var(--text-secondary);font-size:12px;background:var(--surface)}
`
  document.head.appendChild(s)
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initRawTool(body) {
  injectStyles()

  if (!window.__TAURI__ || window.__ICEAMPLE_WEB__) {
    body.innerHTML = '<div class="rw-tauri"><span></span></div>'
    body.querySelector('span').textContent = t('raw_tauri_only')
    return
  }

  const invoke = window.__TAURI__.core.invoke

  body.innerHTML = `
<div class="rw-wrap">
  <div class="rw-bar">
    <button class="rw-btn" id="rw-open"><i class="fa-solid fa-folder-open"></i> ${t('raw_open')}</button>
    <span class="rw-file" id="rw-file"></span>
    <span class="rw-spacer"></span>
    <span id="rw-send-slot"></span>
    <button class="rw-btn" id="rw-export" disabled><i class="fa-solid fa-download"></i> ${t('raw_export')}</button>
  </div>
  <div class="rw-main">
    <div class="rw-preview" id="rw-preview">
      <div class="rw-empty" id="rw-empty"><i class="fa-solid fa-camera-retro"></i><span id="rw-empty-msg">${t('raw_empty')}</span></div>
      <canvas class="rw-canvas" id="rw-canvas"></canvas>
    </div>
    <div class="rw-panel">
      <div class="rw-sec">
        <span class="rw-badge" id="rw-badge"><i class="fa-solid fa-circle-info"></i><span id="rw-badge-txt">—</span></span>
        <div class="rw-res" id="rw-res"></div>
      </div>
      <div class="rw-sec">
        <div class="rw-sec-head">${t('raw_develop')}</div>
        <div class="rw-field">
          <label><span>${t('raw_exposure')}</span><span class="rw-val" id="rw-exp-val">1.00</span></label>
          <input type="range" id="rw-exp" min="0.1" max="4" step="0.05" value="1" />
        </div>
        <div class="rw-field">
          <label><span>${t('raw_wb')}</span></label>
          <select id="rw-wb">
            <option value="camera">${t('raw_wb_camera')}</option>
            <option value="auto">${t('raw_wb_auto')}</option>
            <option value="none">${t('raw_wb_none')}</option>
          </select>
        </div>
        <div class="rw-field">
          <label><span>${t('raw_highlights')}</span><span class="rw-val" id="rw-hl-val">0</span></label>
          <input type="range" id="rw-hl" min="0" max="9" step="1" value="0" />
        </div>
        <div class="rw-field">
          <label><span>${t('raw_quality')}</span></label>
          <select id="rw-q">
            <option value="0">0 · linear</option>
            <option value="1">1 · VNG</option>
            <option value="2">2 · PPG</option>
            <option value="3" selected>3 · AHD</option>
          </select>
        </div>
        <label class="rw-check"><input type="checkbox" id="rw-nab" /><span>${t('raw_no_autobright')}</span></label>
        <button class="rw-btn rw-go" id="rw-dev" disabled><i class="fa-solid fa-wand-magic-sparkles"></i> <span>${t('raw_develop')}</span></button>
        <button class="rw-btn" id="rw-full" style="display:none;justify-content:center"><i class="fa-solid fa-expand"></i> ${t('raw_full')}</button>
      </div>
      <div class="rw-sec">
        <div class="rw-sec-head">${t('raw_local')}</div>
        <div class="rw-field">
          <label><span>${t('raw_brightness')}</span><span class="rw-val" id="rw-b-val">1.00</span></label>
          <input type="range" id="rw-b" min="0.2" max="2" step="0.01" value="1" />
        </div>
        <div class="rw-field">
          <label><span>${t('raw_contrast')}</span><span class="rw-val" id="rw-c-val">1.00</span></label>
          <input type="range" id="rw-c" min="0.2" max="2" step="0.01" value="1" />
        </div>
        <div class="rw-field">
          <label><span>${t('raw_saturation')}</span><span class="rw-val" id="rw-s-val">1.00</span></label>
          <input type="range" id="rw-s" min="0" max="2" step="0.01" value="1" />
        </div>
        <button class="rw-btn" id="rw-reset" style="justify-content:center">${t('raw_reset')}</button>
      </div>
    </div>
  </div>
</div>`

  const canvas    = body.querySelector('#rw-canvas')
  const emptyEl   = body.querySelector('#rw-empty')
  const emptyMsg  = body.querySelector('#rw-empty-msg')
  const fileEl    = body.querySelector('#rw-file')
  const badgeEl   = body.querySelector('#rw-badge')
  const badgeTxt  = body.querySelector('#rw-badge-txt')
  const resEl     = body.querySelector('#rw-res')
  const devBtn    = body.querySelector('#rw-dev')
  const fullBtn   = body.querySelector('#rw-full')
  const exportBtn = body.querySelector('#rw-export')

  const expInp = body.querySelector('#rw-exp')
  const wbSel  = body.querySelector('#rw-wb')
  const hlInp  = body.querySelector('#rw-hl')
  const qSel   = body.querySelector('#rw-q')
  const nabInp = body.querySelector('#rw-nab')

  const bInp = body.querySelector('#rw-b')
  const cInp = body.querySelector('#rw-c')
  const sInp = body.querySelector('#rw-s')

  // ── State ───────────────────────────────────────────────────────────────────
  let rawPath  = null
  let rawName  = ''
  let srcCanvas = null          // decoded source at native resolution (offscreen)
  let busy = false
  let loadGen = 0               // guards against stale async decodes overwriting newer ones
  const liveUrls = new Set()    // object URLs still in flight — revoked on teardown

  // ── Image helpers ───────────────────────────────────────────────────────────
  function b64ToBlob(b64, mime) {
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return new Blob([arr], { type: mime })
  }

  // base64 → Blob → object URL rather than a data URL: full-res PNGs get large
  // enough that the string form is a real cost.
  function loadImage(b64, mime) {
    return new Promise((resolve, reject) => {
      let url
      try { url = URL.createObjectURL(b64ToBlob(b64, mime)) }
      catch (e) { reject(e); return }
      liveUrls.add(url)
      const img = new Image()
      const release = () => { URL.revokeObjectURL(url); liveUrls.delete(url) }
      img.onload  = () => { release(); resolve(img) }
      img.onerror = () => { release(); reject(new Error('raw-decode:image')) }
      img.src = url
    })
  }

  // ── Local (canvas-only) rendering ───────────────────────────────────────────
  let rafId = null
  function scheduleRender() {
    if (rafId) return
    rafId = requestAnimationFrame(() => { rafId = null; renderCanvas() })
  }
  function renderCanvas() {
    if (!srcCanvas) return
    canvas.width = srcCanvas.width
    canvas.height = srcCanvas.height
    const ctx = canvas.getContext('2d')
    // Resizing the canvas resets ctx state — set the filter *after* sizing.
    ctx.filter = `brightness(${bInp.value}) contrast(${cInp.value}) saturate(${sInp.value})`
    ctx.drawImage(srcCanvas, 0, 0)
    ctx.filter = 'none'
  }

  function setSource(img, mode) {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth || img.width
    c.height = img.naturalHeight || img.height
    c.getContext('2d').drawImage(img, 0, 0)
    srcCanvas = c
    // Honest labelling: 'preview' is the camera's own JPEG, not a development.
    badgeTxt.textContent = mode === 'dev' ? t('raw_mode_dev') : t('raw_mode_preview')
    badgeEl.classList.toggle('rw-badge-dev', mode === 'dev')
    resEl.textContent = c.width + ' × ' + c.height
    emptyEl.style.display = 'none'
    canvas.style.display = 'block'
    exportBtn.disabled = false
    scheduleRender()
  }

  function showEmpty(msg) {
    srcCanvas = null
    canvas.style.display = 'none'
    emptyEl.style.display = 'flex'
    emptyMsg.textContent = msg
    exportBtn.disabled = true
    resEl.textContent = ''
  }

  const syncVal = (inp, out, dec) => { out.textContent = Number(inp.value).toFixed(dec) }

  ;[[bInp, body.querySelector('#rw-b-val')], [cInp, body.querySelector('#rw-c-val')], [sInp, body.querySelector('#rw-s-val')]]
    .forEach(([inp, out]) => {
      inp.addEventListener('input', () => { syncVal(inp, out, 2); scheduleRender() })
    })
  body.querySelector('#rw-reset').addEventListener('click', () => {
    bInp.value = '1'; cInp.value = '1'; sInp.value = '1'
    syncVal(bInp, body.querySelector('#rw-b-val'), 2)
    syncVal(cInp, body.querySelector('#rw-c-val'), 2)
    syncVal(sInp, body.querySelector('#rw-s-val'), 2)
    scheduleRender()
  })

  expInp.addEventListener('input', () => syncVal(expInp, body.querySelector('#rw-exp-val'), 2))
  hlInp.addEventListener('input',  () => syncVal(hlInp,  body.querySelector('#rw-hl-val'),  0))

  // ── Loading a RAW (embedded preview first, never blocking on develop) ───────
  async function loadRaw(path, name) {
    if (!path) return
    rawPath = path
    rawName = name || baseName(path)
    fileEl.textContent = rawName
    fileEl.title = path
    devBtn.disabled = false
    fullBtn.style.display = 'none'
    trackRecentFile(path, rawName)

    const gen = ++loadGen
    showEmpty(t('raw_empty'))
    try {
      const b64 = await invoke('raw_embedded_preview', { path })
      if (gen !== loadGen) return
      const img = await loadImage(b64, 'image/jpeg')
      if (gen !== loadGen) return
      setSource(img, 'preview')
    } catch (e) {
      if (gen !== loadGen) return
      // 'raw-nopreview' / 'raw-read:' — Develop stays available either way.
      showEmpty(t('raw_nopreview'))
    }
  }

  // ── Open ────────────────────────────────────────────────────────────────────
  body.querySelector('#rw-open').addEventListener('click', async () => {
    try {
      const result = await invoke('pick_files_with_filter', {
        filterName: 'RAW',
        extensions: RAW_EXTS,
        multiple: false,
      })
      const item = Array.isArray(result) ? result[0] : result
      if (!item) return
      const path = typeof item === 'string' ? item : item.path
      const name = typeof item === 'string' ? baseName(path) : item.name
      await loadRaw(path, name)
    } catch (e) { window.toast?.(String(e), 'error') }
  })

  // ── LibRaw setup overlay (mirrors the whisper.cpp overlay in subtitles.js) ──
  let setupOverlay = null

  function openLibrawSetup(onReady) {
    if (setupOverlay) { setupOverlay.remove(); setupOverlay = null }
    body.style.position = 'relative'
    const overlay = document.createElement('div')
    overlay.className = 'rw-ov'
    setupOverlay = overlay
    const closeOverlay = () => { overlay.remove(); if (setupOverlay === overlay) setupOverlay = null }

    const panel = document.createElement('div')
    panel.className = 'rw-ov-panel'

    const head = document.createElement('div')
    head.className = 'rw-ov-head'
    const title = document.createElement('div')
    title.className = 'rw-ov-title'
    title.innerHTML = '<i class="fa-solid fa-sliders"></i> <span></span>'
    title.querySelector('span').textContent = t('raw_develop')
    const closeBtn = document.createElement('button')
    closeBtn.className = 'rw-ov-close'
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
    closeBtn.addEventListener('click', closeOverlay)
    head.append(title, closeBtn)

    const desc = document.createElement('div')
    desc.className = 'rw-ov-desc'
    desc.textContent = t('raw_libraw_setup')

    const pickBtn = document.createElement('button')
    pickBtn.className = 'rw-btn'
    pickBtn.style.cssText = 'width:100%;text-align:left'
    pickBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> <span></span>'
    pickBtn.querySelector('span').textContent = t('raw_libraw_pick')

    const pathLbl = document.createElement('div')
    pathLbl.className = 'rw-ov-path'
    pathLbl.textContent = baseName(localStorage.getItem(LIBRAW_KEY)) || '—'

    pickBtn.addEventListener('click', async () => {
      try {
        const result = await invoke('pick_files_with_filter', {
          filterName: 'dcraw_emu',
          extensions: ['exe'],
          multiple: false,
        })
        const item = Array.isArray(result) ? result[0] : result
        if (!item) return
        const exe = typeof item === 'string' ? item : item.path
        localStorage.setItem(LIBRAW_KEY, exe)
        pathLbl.textContent = baseName(exe)
        closeOverlay()
        onReady?.(exe)
      } catch (e) { window.toast?.(String(e), 'error') }
    })

    const note = document.createElement('div')
    note.className = 'rw-ov-note'
    // Plain text on purpose — no hyperlink. The translation already carries
    // "libraw.org — dcraw_emu", so nothing is appended (unlike subtitles.js,
    // whose sub_whisper_where stops before the URL).
    note.textContent = t('raw_libraw_where')

    panel.append(head, desc, pickBtn, pathLbl, note)
    overlay.appendChild(panel)
    body.appendChild(overlay)
  }

  // ── Develop (real demosaic through LibRaw) ─────────────────────────────────
  function currentOpts(half) {
    return {
      half,
      wb: wbSel.value,
      exposure: parseFloat(expInp.value),
      highlights: parseInt(hlInp.value, 10),
      quality: parseInt(qSel.value, 10),
      noAutoBright: nabInp.checked,
    }
  }

  function setBusy(on) {
    busy = on
    devBtn.disabled = on || !rawPath
    fullBtn.disabled = on
    devBtn.innerHTML = on
      ? `<i class="fa-solid fa-spinner fa-spin"></i> <span>${t('raw_develop')}</span>`
      : `<i class="fa-solid fa-wand-magic-sparkles"></i> <span>${t('raw_develop')}</span>`
  }

  async function runDevelop(half) {
    if (busy || !rawPath) return
    const exePath = localStorage.getItem(LIBRAW_KEY)
    if (!exePath) { openLibrawSetup(() => runDevelop(half)); return }

    const gen = ++loadGen
    setBusy(true)
    window.toast?.(t('raw_working'), 'info')
    try {
      const b64 = await invoke('raw_develop', { exePath, rawPath, opts: currentOpts(half) })
      if (gen !== loadGen) return
      const img = await loadImage(b64, 'image/png')
      if (gen !== loadGen) return
      setSource(img, 'dev')
      // The full-res pass is opt-in: only offered once a fast half pass landed.
      fullBtn.style.display = half ? '' : 'none'
    } catch (e) {
      if (gen !== loadGen) return
      const msg = String(e)
      if (msg.startsWith('raw-missing:')) openLibrawSetup(() => runDevelop(half))
      else window.toast?.(msg, 'error')
    } finally {
      // Always unlock: only one develop can be in flight (guarded above), so a
      // stale one finishing after the user opened another file must not wedge
      // the button.
      setBusy(false)
    }
  }

  devBtn.addEventListener('click', () => runDevelop(true))
  fullBtn.addEventListener('click', () => runDevelop(false))

  // ── Export to the library ──────────────────────────────────────────────────
  exportBtn.addEventListener('click', async () => {
    if (!srcCanvas || !canvas.width) return
    const root = libRoot()
    if (!root) { window.toast?.('No library configured', 'error'); return }
    const name = await promptName(stripExt(rawName) || 'raw', { title: t('raw_export') })
    if (!name) return
    const sep = root.includes('\\') ? '\\' : '/'
    const folder = root + sep + 'Images'
    const outPath = folder + sep + name + '.png'
    const b64 = canvas.toDataURL('image/png').split(',')[1]
    try {
      await invoke('save_binary_file', { path: outPath, base64: b64 })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder } }))
      trackRecentFile(outPath, name + '.png')
      window.toast?.(t('raw_export') + ': ' + name + '.png', 'success')
    } catch (e) { window.toast?.(String(e), 'error') }
  })

  // ── Media bus ──────────────────────────────────────────────────────────────
  {
    const sendBtn = makeSendButton(() => {
      if (!srcCanvas || !canvas.width) return null
      return imageMedia(canvas, stripExt(rawName) || 'raw')
    }, { self: 'rawtool', className: 'rw-btn', iconOnly: true })
    body.querySelector('#rw-send-slot').replaceWith(sendBtn)
  }

  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (!m || m.kind !== 'raw' || !m.path) return
    loadRaw(String(m.path), m.name)
  })

  // Drag from the library tool.
  body.addEventListener('iceample-drop', e => {
    const file = e.detail?.file
    if (!file?.path) return
    if (!isRaw(file.name || file.path)) return
    loadRaw(String(file.path), file.name)
  })

  // ── Teardown ───────────────────────────────────────────────────────────────
  new MutationObserver((_, obs) => {
    if (document.contains(body)) return
    loadGen++
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    liveUrls.forEach(u => { try { URL.revokeObjectURL(u) } catch {} })
    liveUrls.clear()
    setupOverlay?.remove(); setupOverlay = null
    srcCanvas = null
    obs.disconnect()
  }).observe(document.body, { childList: true, subtree: true })
}
