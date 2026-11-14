// watermark.js — Ajout de filigrane sur images et vidéos

import { trackRecentFile } from './recent.js'
import { makeSendButton, imageMedia } from './media-bus.js'
import { t } from './i18n.js'
import { ffmpegFontFile, cssFontFor } from './fonts.js'
import { enhanceSidePanel } from './side-panel.js'

const IMG_EXTS = ['jpg','jpeg','png','webp','gif','bmp']
const VID_EXTS = ['mp4','mov','mkv','avi','webm','m4v']
const ENCODABLE = ['png','jpg','jpeg','webp']          // what a canvas can write back
// drawtext needs a font file: one that can draw the text's script, in bold like the preview

// Extension of a path or file name ('' when there is none).
const extOf = p => (String(p || '').split(/[\\/]/).pop().match(/\.([^.]+)$/)?.[1] || '').toLowerCase()
const imgMime = ext => 'image/' + (ext === 'jpg' ? 'jpeg' : ext)
const samePath = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase()

// Resolves with the decoded image, rejects (with nothing) when it can't be decoded.
const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(null)
  img.src = src
})

// drawtext text, escaped for ffmpeg's three parsing levels (same as videorec-render.js):
// drawtext expansion (\ %), option value (\ ' :), filtergraph (\ ' [ ] , ;).
const escapeDrawtext = s => String(s)
  .replace(/[\\%]/g, m => '\\' + m)
  .replace(/[\\':]/g, m => '\\' + m)
  .replace(/[\\'[\],;]/g, m => '\\' + m)

export function initWatermark(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;font-family:inherit;'

  const POSITIONS = [
    ['top-left',t('wm_pos_top_left')], ['top-center',t('wm_pos_top_center')], ['top-right',t('wm_pos_top_right')],
    ['mid-left',t('wm_pos_mid_left')], ['center',t('wm_pos_center')],         ['mid-right',t('wm_pos_mid_right')],
    ['bot-left',t('wm_pos_bot_left')], ['bot-center',t('wm_pos_bot_center')], ['bot-right',t('wm_pos_bot_right')],
  ]

  let state = {
    mode:     'text',     // 'text' | 'image'
    wmText:   t('wm_default_text'),
    wmFont:   '36',
    wmColor:  '#ffffff',
    wmOpacity: 0.5,
    wmPos:    'bot-right',
    wmPadX:  16,
    wmPadY:  16,
    // for image watermark
    wmImgPath: null,
    wmImgW:    120,
    // media
    mediaPath: null,
    mediaType: null,  // 'image' | 'video'
    mediaName: '',
  }

  // Backend errors stay as they are, after a translated label.
  const toastErr = (label, e) => window.toast?.(e ? `${label}: ${e?.message ?? e}` : label, 'error')

  // ── Layout ─────────────────────────────────────────────────────────────────
  const main = document.createElement('div')
  main.style.cssText = 'display:flex;flex:1;overflow:hidden;'

  const leftPanel = document.createElement('div')
  leftPanel.style.cssText = 'width:220px;flex-shrink:0;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--win-border-in,#1e1e1e);background:var(--surface2,#141414);'

  const rightArea = document.createElement('div')
  rightArea.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;'

  const previewBox = document.createElement('div')
  previewBox.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:var(--preview-bg);overflow:hidden;position:relative;'

  const bottomBar = document.createElement('div')
  bottomBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--win-border-in,#1e1e1e);flex-shrink:0;background:var(--surface2,#141414);'

  rightArea.append(previewBox, bottomBar)
  main.append(leftPanel, rightArea)
  enhanceSidePanel(leftPanel, { id: 'watermark', side: 'left' })
  body.append(main)

  // ── Preview canvas ─────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'max-width:100%;max-height:100%;display:none;'

  const dropHint = document.createElement('div')
  dropHint.style.cssText = 'color:color-mix(in srgb, var(--text-secondary) 65%, transparent);text-align:center;pointer-events:none;'
  dropHint.innerHTML = '<i class="fa-solid fa-image" style="font-size:40px;display:block;margin-bottom:8px;"></i>' + t('wm_drop_hint') + '<br><span style="font-size:10px;color:color-mix(in srgb, var(--text-secondary) 50%, transparent);">PNG · JPG · WEBP · MP4 · MOV · MKV · AVI · WEBM</span>'

  previewBox.append(dropHint, canvas)

  // ── Drop zone ──────────────────────────────────────────────────────────────
  // Browser drop (web version): the File has no disk path — register it with the
  // web shim, like the open button's picker does. Elsewhere it can't be read.
  previewBox.addEventListener('dragover', e => { e.preventDefault(); previewBox.style.background = 'color-mix(in srgb, var(--color-active) 12%, var(--preview-bg))' })
  previewBox.addEventListener('dragleave', () => { previewBox.style.background = 'var(--preview-bg)' })
  previewBox.addEventListener('drop', async e => {
    e.preventDefault(); previewBox.style.background = 'var(--preview-bg)'
    const file = e.dataTransfer?.files?.[0]; if (!file) return
    let path = file.path || null
    if (!path && window.__ICEAMPLE_WEB_REGISTER__) path = window.__ICEAMPLE_WEB_REGISTER__(file)
    if (!path) { window.toast?.(t('wm_cant_read'), 'error'); return }
    await loadMedia(path, file.name)
  })

  // Library drag (in-app protocol): the file carries its real path.
  body.addEventListener('iceample-drop', e => {
    const file = e.detail?.file
    if (!file?.path) return
    loadMedia(file.path, file.name || file.path.split(/[\\/]/).pop())
  })

  // OS file drop in the desktop app. onDragDropEvent is webview-GLOBAL: act only
  // while this tool is in the document (and not when the drop lands on another
  // tool), and unlisten at teardown.
  let dead = false
  let dropUnlisten = null
  if (window.__TAURI__) {
    ;(async () => {
      try {
        const wv = window.__TAURI__.webview?.getCurrentWebview?.()
        if (!wv?.onDragDropEvent) return
        dropUnlisten = await wv.onDragDropEvent(e => {
          if (!document.contains(body)) return
          const { type, paths, position } = e.payload || {}
          if (type !== 'drop' || !paths?.length) return
          const x = Number(position?.x), y = Number(position?.y)
          if (Number.isFinite(x) && Number.isFinite(y)) {
            const dpr = window.devicePixelRatio || 1
            const hit = document.elementFromPoint(x / dpr, y / dpr)
            if (hit && !(body.closest('.tool-win') || body).contains(hit)) return
          }
          const path = paths[0], ext = extOf(path)
          if (!IMG_EXTS.includes(ext) && !VID_EXTS.includes(ext)) return
          loadMedia(path, path.split(/[\\/]/).pop())
        })
        if (dead) { dropUnlisten?.(); dropUnlisten = null }   // closed while awaiting
      } catch {}
    })()
  }

  // ── Panel helpers ──────────────────────────────────────────────────────────
  const SEL = 'background:var(--surface,#111);border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-primary,#ddd);border-radius:5px;padding:4px 7px;font-size:11px;font-family:inherit;width:100%;box-sizing:border-box;'
  const INP = SEL

  function pLabel(txt) {
    const d = document.createElement('div')
    d.style.cssText = 'font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;'
    d.textContent = txt; return d
  }

  function rangeCtrl(key, labelText, min, max, step, decimals = 0) {
    const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;'
    const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);'
    const lbl = document.createElement('span'); lbl.textContent = labelText
    const val = document.createElement('span'); val.style.cssText = 'color:var(--text-primary);font-weight:500;'; val.textContent = state[key].toFixed(decimals)
    row.append(lbl, val)
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = state[key]
    inp.style.cssText = 'width:100%;accent-color:var(--slider-color);'
    inp.addEventListener('input', () => { state[key] = parseFloat(inp.value); val.textContent = state[key].toFixed(decimals); updatePreview() })
    wrap.append(row, inp); leftPanel.appendChild(wrap)
    return inp
  }

  // ── Media picker ──────────────────────────────────────────────────────────
  leftPanel.appendChild(pLabel(t('wm_source_file')))
  const pickMediaBtn = document.createElement('button')
  pickMediaBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> ' + t('wm_open_media')
  pickMediaBtn.style.cssText = 'border:1px solid var(--win-border-in,#1e1e1e);border-radius:5px;padding:6px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface,#111);color:var(--text-primary);width:100%;'
  leftPanel.appendChild(pickMediaBtn)

  const mediaNameLbl = document.createElement('div')
  mediaNameLbl.style.cssText = 'font-size:10px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
  leftPanel.appendChild(mediaNameLbl)

  pickMediaBtn.addEventListener('click', async () => {
    if (!window.__TAURI__) return
    try {
      const result = await window.__TAURI__.core.invoke('pick_files_with_filter', {
        filterName: t('wm_filter_media'),
        extensions: ['jpg','jpeg','png','webp','gif','mp4','mov','mkv','avi','webm'],
      })
      const item = Array.isArray(result) ? result[0] : result
      if (!item) return
      const path = typeof item === 'string' ? item : item.path
      const name = typeof item === 'string' ? path.split(/[\\/]/).pop() : item.name
      await loadMedia(path, name)
    } catch (e) { window.toast?.(String(e), 'error') }
  })

  // ── Watermark mode ────────────────────────────────────────────────────────
  leftPanel.appendChild(pLabel(t('wm_type')))
  const modeRow = document.createElement('div'); modeRow.style.cssText = 'display:flex;gap:6px;'
  for (const [id, txt] of [['text',t('wm_text')],['image',t('wm_image')]]) {
    const b = document.createElement('button')
    b.textContent = txt; b.dataset.mode = id
    b.style.cssText = 'flex:1;border-radius:5px;padding:5px;cursor:pointer;font-size:11px;font-family:inherit;border:1px solid var(--win-border-in,#1e1e1e);background:var(--surface,#111);color:var(--text-secondary);'
    b.addEventListener('click', () => { state.mode = id; updateModeUI(); updatePreview() })
    modeRow.appendChild(b)
  }
  leftPanel.appendChild(modeRow)

  // ── Text controls ─────────────────────────────────────────────────────────
  const textGroup = document.createElement('div'); textGroup.style.cssText = 'display:flex;flex-direction:column;gap:6px;'
  textGroup.appendChild(pLabel(t('wm_text')))
  const textInp = document.createElement('input'); textInp.type = 'text'; textInp.value = state.wmText; textInp.style.cssText = INP
  textInp.addEventListener('input', () => { state.wmText = textInp.value; updatePreview() })
  textGroup.appendChild(textInp)

  const fontLabel = document.createElement('div'); fontLabel.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);'
  const fLbl = document.createElement('span'); fLbl.textContent = t('wm_font_size')
  const fVal = document.createElement('span'); fVal.style.cssText = 'color:var(--text-primary);font-weight:500;'; fVal.textContent = state.wmFont
  fontLabel.append(fLbl, fVal)
  const fontRange = document.createElement('input'); fontRange.type = 'range'; fontRange.min = 10; fontRange.max = 120; fontRange.step = 2; fontRange.value = state.wmFont
  fontRange.style.cssText = 'width:100%;accent-color:var(--slider-color);'
  fontRange.addEventListener('input', () => { state.wmFont = fontRange.value; fVal.textContent = fontRange.value; updatePreview() })
  textGroup.append(fontLabel, fontRange)

  const colorRow2 = document.createElement('div'); colorRow2.style.cssText = 'display:flex;align-items:center;gap:8px;'
  const cLbl = document.createElement('span'); cLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);flex:1;'; cLbl.textContent = t('wm_color')
  const colorInp = document.createElement('input'); colorInp.type = 'color'; colorInp.value = state.wmColor
  colorInp.style.cssText = 'width:40px;height:24px;border:1px solid var(--win-border);border-radius:4px;padding:1px;cursor:pointer;background:none;'
  colorInp.addEventListener('input', () => { state.wmColor = colorInp.value; updatePreview() })
  colorRow2.append(cLbl, colorInp)
  textGroup.appendChild(colorRow2)
  leftPanel.appendChild(textGroup)

  // ── Image watermark ────────────────────────────────────────────────────────
  const imgGroup = document.createElement('div'); imgGroup.style.cssText = 'display:none;flex-direction:column;gap:6px;'
  imgGroup.appendChild(pLabel(t('wm_mark_image')))
  const pickWmImgBtn = document.createElement('button')
  pickWmImgBtn.innerHTML = '<i class="fa-solid fa-image"></i> ' + t('wm_pick_image')
  pickWmImgBtn.style.cssText = 'border:1px solid var(--win-border-in,#1e1e1e);border-radius:5px;padding:5px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface,#111);color:var(--text-primary);width:100%;'
  pickWmImgBtn.addEventListener('click', async () => {
    if (!window.__TAURI__) return
    let path
    try {
      const result = await window.__TAURI__.core.invoke('pick_files_with_filter', {
        filterName: t('wm_filter_images'),
        extensions: ['png','jpg','jpeg','webp','gif'],
      })
      const item = Array.isArray(result) ? result[0] : result
      if (!item) return
      path = typeof item === 'string' ? item : item.path
    } catch (e) { window.toast?.(String(e), 'error'); return }
    // Decode it now: a bad file is reported here and never kept.
    const prev = state.wmImgPath
    state.wmImgPath = path
    try { await ensureWmImage() }
    catch (e) { state.wmImgPath = prev; toastErr(t('wm_load_fail'), e); return }
    wmImgLabel.textContent = path.split(/[\\/]/).pop()
    updatePreview()
  })
  const wmImgLabel = document.createElement('div'); wmImgLabel.style.cssText = 'font-size:10px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);'
  imgGroup.append(pickWmImgBtn, wmImgLabel)

  const iwLabel = document.createElement('div'); iwLabel.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);'
  const iwLbl = document.createElement('span'); iwLbl.textContent = t('wm_width_px')
  const iwVal = document.createElement('span'); iwVal.style.cssText = 'color:var(--text-primary);font-weight:500;'; iwVal.textContent = state.wmImgW
  iwLabel.append(iwLbl, iwVal)
  const iwRange = document.createElement('input'); iwRange.type = 'range'; iwRange.min = 20; iwRange.max = 600; iwRange.step = 10; iwRange.value = state.wmImgW
  iwRange.style.cssText = 'width:100%;accent-color:var(--slider-color);'
  iwRange.addEventListener('input', () => { state.wmImgW = parseInt(iwRange.value); iwVal.textContent = iwRange.value; updatePreview() })
  imgGroup.append(iwLabel, iwRange)
  leftPanel.appendChild(imgGroup)

  // ── Shared controls ────────────────────────────────────────────────────────
  leftPanel.appendChild(pLabel(t('wm_opacity')))
  rangeCtrl('wmOpacity', t('wm_opacity'), 0.05, 1, 0.05, 2)

  leftPanel.appendChild(pLabel(t('wm_position')))
  const posGrid = document.createElement('div')
  posGrid.style.cssText = 'direction:ltr;display:grid;grid-template-columns:repeat(3,1fr);gap:3px;'
  for (const [pos, lbl] of POSITIONS) {
    const b = document.createElement('button')
    b.style.cssText = 'border:1px solid var(--win-border-in,#1e1e1e);border-radius:4px;padding:4px 2px;cursor:pointer;font-size:9px;font-family:inherit;background:var(--surface,#111);color:var(--text-secondary);text-align:center;'
    b.textContent = lbl; b.dataset.pos = pos
    b.addEventListener('click', () => { state.wmPos = pos; updatePosUI(); updatePreview() })
    posGrid.appendChild(b)
  }
  leftPanel.appendChild(posGrid)

  leftPanel.appendChild(pLabel(t('wm_margin')))
  rangeCtrl('wmPadX', t('wm_horizontal'), 0, 100, 1)
  rangeCtrl('wmPadY', t('wm_vertical'),   0, 100, 1)

  // ── UI state ───────────────────────────────────────────────────────────────
  function updateModeUI() {
    for (const b of modeRow.children) {
      const active = b.dataset.mode === state.mode
      b.style.background = active ? 'var(--color-active,#4a9eff)' : 'var(--surface,#111)'
      b.style.color = active ? 'var(--on-accent)' : 'var(--text-secondary)'
    }
    textGroup.style.display = state.mode === 'text' ? 'flex' : 'none'
    imgGroup.style.display  = state.mode === 'image' ? 'flex' : 'none'
  }

  function updatePosUI() {
    for (const b of posGrid.children) {
      const active = b.dataset.pos === state.wmPos
      b.style.background = active ? 'var(--color-active,#4a9eff)' : 'var(--surface,#111)'
      b.style.color = active ? 'var(--on-accent)' : 'var(--text-secondary)'
      b.style.border = active ? '1px solid var(--color-active,#4a9eff)' : '1px solid var(--win-border-in,#1e1e1e)'
    }
  }

  updateModeUI(); updatePosUI()

  // ── Media load ─────────────────────────────────────────────────────────────
  let baseImageEl = null
  let loadSeq = 0

  const clearVidInfo = () => { for (const el of previewBox.querySelectorAll('.vid-info')) el.remove() }

  function setMedia(path, name, type) {
    state.mediaPath = path; state.mediaName = name; state.mediaType = type
    mediaNameLbl.textContent = name
  }

  function showImage(img, path, name) {
    baseImageEl = img
    setMedia(path, name, 'image')
    clearVidInfo()
    dropHint.style.display = 'none'
    canvas.style.display = 'block'
    updatePreview()
  }

  async function loadMedia(path, name) {
    if (!path) return
    const fileName = name || path.split(/[\\/]/).pop()
    const ext = extOf(fileName)
    const isImg = IMG_EXTS.includes(ext)
    const isVid = VID_EXTS.includes(ext)
    if (!isImg && !isVid) { window.toast?.(t('wm_unsupported'), 'warn'); return }
    const seq = ++loadSeq

    if (isImg) {
      if (!window.__TAURI__) return
      let img
      try {
        const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
        img = await loadImage(`data:${imgMime(ext)};base64,${b64}`)
      } catch (e) { if (seq === loadSeq) toastErr(t('wm_load_fail'), e); return }
      if (seq !== loadSeq) return          // a newer file was opened meanwhile
      showImage(img, path, fileName)
    } else {
      baseImageEl = null
      setMedia(path, fileName, 'video')
      clearVidInfo()
      dropHint.style.display = 'none'
      canvas.style.display = 'none'
      const vidInfo = document.createElement('div')
      vidInfo.className = 'vid-info'
      vidInfo.style.cssText = 'color:var(--text-secondary);font-size:11px;text-align:center;padding:12px;'
      vidInfo.innerHTML = `<i class="fa-solid fa-film" style="font-size:32px;display:block;margin-bottom:8px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);"></i><span class="vid-name"></span><br><span style="font-size:10px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);">${t('wm_video_no_preview')}<br>${t('wm_video_click_apply')}</span>`
      vidInfo.querySelector('.vid-name').textContent = fileName
      previewBox.appendChild(vidInfo)
    }
  }

  // Media bus: an image sent from another tool becomes the base media (no file
  // on disk — applyImage draws from baseImageEl, so save works too).
  body.addEventListener('iceample-media', async e => {
    const m = e.detail
    if (!m || m.kind !== 'image' || !m.dataUrl) return
    const seq = ++loadSeq
    let img
    try { img = await loadImage(m.dataUrl) }
    catch (err) { if (seq === loadSeq) toastErr(t('wm_load_fail'), err); return }
    if (seq !== loadSeq) return
    const name = (m.name || 'image').replace(/\.[a-z0-9]+$/i, '') + '.png'
    showImage(img, 'bus:' + (m.name || 'image'), name)
  })

  // ── Watermark position calc ────────────────────────────────────────────────
  function getWmPos(cw, ch, wmW, wmH) {
    const px = state.wmPadX; const py = state.wmPadY
    const posMap = {
      'top-left':    { x: px,                y: py },
      'top-center':  { x: (cw - wmW) / 2,    y: py },
      'top-right':   { x: cw - wmW - px,     y: py },
      'mid-left':    { x: px,                y: (ch - wmH) / 2 },
      'center':      { x: (cw - wmW) / 2,    y: (ch - wmH) / 2 },
      'mid-right':   { x: cw - wmW - px,     y: (ch - wmH) / 2 },
      'bot-left':    { x: px,                y: ch - wmH - py },
      'bot-center':  { x: (cw - wmW) / 2,    y: ch - wmH - py },
      'bot-right':   { x: cw - wmW - px,     y: ch - wmH - py },
    }
    return posMap[state.wmPos] || posMap['bot-right']
  }

  // ── Watermark image ────────────────────────────────────────────────────────
  let wmImageEl = null

  // Decoded watermark image (cached per path). Throws if it can't be read/decoded.
  async function ensureWmImage() {
    if (!state.wmImgPath || !window.__TAURI__) return null
    if (wmImageEl && wmImageEl._src === state.wmImgPath) return wmImageEl
    const path = state.wmImgPath
    const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
    const img = await loadImage(`data:${imgMime(extOf(path))};base64,${b64}`)
    img._src = path
    wmImageEl = img
    return img
  }

  // Base image + watermark at full resolution. Synchronous: the watermark image is
  // resolved beforehand, so overlapping previews can't interleave their drawing.
  function renderInto(cv, wmImg) {
    const W = baseImageEl.naturalWidth; const H = baseImageEl.naturalHeight
    cv.width = W; cv.height = H
    const c = cv.getContext('2d')
    c.drawImage(baseImageEl, 0, 0, W, H)
    c.globalAlpha = state.wmOpacity

    if (state.mode === 'text') {
      const fs = parseInt(state.wmFont)
      c.font = `bold ${fs}px ${cssFontFor(state.wmText)}`
      c.fillStyle = state.wmColor
      const metrics = c.measureText(state.wmText)
      const wmW = metrics.width; const wmH = fs
      const { x, y } = getWmPos(W, H, wmW, wmH)
      c.fillText(state.wmText, x, y + wmH)
    } else if (state.mode === 'image' && wmImg) {
      const scale = state.wmImgW / wmImg.naturalWidth
      const wmW = state.wmImgW; const wmH = wmImg.naturalHeight * scale
      const { x, y } = getWmPos(W, H, wmW, wmH)
      c.drawImage(wmImg, x, y, wmW, wmH)
    }

    c.globalAlpha = 1
  }

  // ── Preview update ─────────────────────────────────────────────────────────
  async function updatePreview() {
    if (!baseImageEl || state.mediaType !== 'image') return
    let wmImg = null
    if (state.mode === 'image') { try { wmImg = await ensureWmImage() } catch { wmImg = null } }
    if (!baseImageEl || state.mediaType !== 'image') return
    renderInto(canvas, wmImg)
  }

  // ── Bottom bar: apply & export ─────────────────────────────────────────────
  const BTN2 = (txt, icon, col) => {
    const b = document.createElement('button')
    b.innerHTML = `<i class="fa-solid ${icon}"></i> ${txt}`
    b.style.cssText = `border:none;border-radius:6px;padding:7px 14px;cursor:pointer;font-size:11px;font-family:inherit;background:${col};color:var(--on-accent);`
    return b
  }

  const applyBtn   = BTN2(t('wm_apply_save'), 'fa-wand-magic-sparkles', 'var(--btn-primary)')
  const statusLbl  = document.createElement('span')
  statusLbl.style.cssText = 'font-size:10px;color:var(--text-secondary);margin-left:auto;'
  // "Send to…" — ship the watermarked result (preview canvas is full-res).
  const sendBtn = makeSendButton(async () => {
    if (!baseImageEl || state.mediaType !== 'image') return null
    await updatePreview()
    return imageMedia(canvas, (state.mediaName || 'filigrane').replace(/\.[^.]+$/, ''))
  }, { self: 'watermark', className: '', iconOnly: true })
  sendBtn.style.cssText = 'border:1px solid var(--win-border-in,#1e1e1e);border-radius:6px;padding:7px 10px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface,#111);color:var(--text-primary);'
  bottomBar.append(applyBtn, sendBtn, statusLbl)

  applyBtn.addEventListener('click', async () => {
    if (!state.mediaPath) { window.toast?.(t('wm_open_first'), 'warn'); return }
    if (state.mediaType === 'image') await applyImage()
    else if (state.mediaType === 'video') await applyVideo()
  })

  async function applyImage() {
    if (!window.__TAURI__ || !baseImageEl) return
    // Offer only formats a canvas can encode (a GIF/BMP source defaults to PNG).
    const srcExt = extOf(state.mediaName)
    const ext = ENCODABLE.includes(srcExt) ? srcExt : 'png'
    const defaultName = state.mediaName.replace(/\.[^.]+$/, '') + `_wm.${ext}`
    try {
      const path = await window.__TAURI__.dialog.save({
        defaultPath: defaultName,
        filters: [{ name: t('wm_image'), extensions: [...new Set([ext, 'png', 'jpg'])] }],
      })
      if (!path) return

      let wmImg = null
      if (state.mode === 'image' && state.wmImgPath) {
        try { wmImg = await ensureWmImage() }
        catch (e) { toastErr(t('wm_load_fail'), e); return }
      }
      const off = document.createElement('canvas')
      renderInto(off, wmImg)

      // Encoding follows the file name the user chose, not the source file.
      const outExt = extOf(path)
      const mimeType = outExt === 'jpg' || outExt === 'jpeg' ? 'image/jpeg' : outExt === 'webp' ? 'image/webp' : 'image/png'
      const b64 = off.toDataURL(mimeType).split(',')[1]
      await window.__TAURI__.core.invoke('save_binary_file', { path, base64: b64 })
      trackRecentFile(path, defaultName)
      window.toast?.(t('wm_image_saved') + ' ✓', 'success')
      statusLbl.textContent = '✓ ' + path.split(/[\\/]/).pop()
    } catch (e) { window.toast?.(String(e), 'error') }
  }

  async function applyVideo() {
    if (!window.__TAURI__) return
    if (state.mode === 'text' && !state.wmText.trim()) { window.toast?.(t('wm_enter_text'), 'warn'); return }
    if (state.mode === 'image' && !state.wmImgPath) { window.toast?.(t('wm_select_mark_image'), 'warn'); return }
    const ext = extOf(state.mediaName)
    const defaultName = state.mediaName.replace(/\.[^.]+$/, '') + `_wm.${ext}`
    let path
    try {
      path = await window.__TAURI__.dialog.save({
        defaultPath: defaultName,
        filters: [{ name: t('wm_video'), extensions: [ext] }],
      })
    } catch (e) { window.toast?.(String(e), 'error'); return }
    if (!path) return
    // ffmpeg runs with -y (the save dialog already asked about overwriting), so it
    // must never write over the file it is reading.
    if (samePath(path, state.mediaPath)) { window.toast?.(t('wm_same_file'), 'warn'); return }

    statusLbl.textContent = t('wm_processing'); applyBtn.disabled = true

    try {
      if (state.mode === 'text') {
        // FFmpeg drawtext filter
        const posArgs = ffmpegTextPos()
        const color = state.wmColor.replace('#', '0x') + Math.round(state.wmOpacity * 255).toString(16).padStart(2, '0')
        const filterStr = `drawtext=fontfile='${ffmpegFontFile(state.wmText, { bold: true })}':text=${escapeDrawtext(state.wmText)}:fontsize=${state.wmFont}:fontcolor=${color}:${posArgs}`
        await window.__TAURI__.core.invoke('ffmpeg_run', {
          args: ['-y', '-i', state.mediaPath, '-vf', filterStr, '-c:a', 'copy', path]
        })
      } else {
        // FFmpeg overlay filter
        const overlayExpr = ffmpegOverlayPos()
        const alphaFilter = `[1:v]scale=${state.wmImgW}:-1,format=rgba,colorchannelmixer=aa=${state.wmOpacity}[wm];[0:v][wm]overlay=${overlayExpr}[out]`
        await window.__TAURI__.core.invoke('ffmpeg_run', {
          args: ['-y', '-i', state.mediaPath, '-i', state.wmImgPath, '-filter_complex', alphaFilter, '-map', '[out]', '-map', '0:a?', '-c:a', 'copy', path]
        })
      }
      trackRecentFile(path, defaultName)
      window.toast?.(t('wm_video_done') + ' ✓', 'success')
      statusLbl.textContent = '✓ ' + path.split(/[\\/]/).pop()
    } catch (e) {
      window.toast?.(String(e), 'error')
      statusLbl.textContent = t('wm_error')
    } finally { applyBtn.disabled = false }
  }

  // FFmpeg position expressions
  function ffmpegTextPos() {
    const px = state.wmPadX; const py = state.wmPadY
    const map = {
      'top-left':   `x=${px}:y=${py}`,
      'top-center': `x=(w-text_w)/2:y=${py}`,
      'top-right':  `x=w-text_w-${px}:y=${py}`,
      'mid-left':   `x=${px}:y=(h-text_h)/2`,
      'center':     `x=(w-text_w)/2:y=(h-text_h)/2`,
      'mid-right':  `x=w-text_w-${px}:y=(h-text_h)/2`,
      'bot-left':   `x=${px}:y=h-text_h-${py}`,
      'bot-center': `x=(w-text_w)/2:y=h-text_h-${py}`,
      'bot-right':  `x=w-text_w-${px}:y=h-text_h-${py}`,
    }
    return map[state.wmPos] || map['bot-right']
  }

  function ffmpegOverlayPos() {
    const px = state.wmPadX; const py = state.wmPadY
    const map = {
      'top-left':   `${px}:${py}`,
      'top-center': `(W-overlay_w)/2:${py}`,
      'top-right':  `W-overlay_w-${px}:${py}`,
      'mid-left':   `${px}:(H-overlay_h)/2`,
      'center':     `(W-overlay_w)/2:(H-overlay_h)/2`,
      'mid-right':  `W-overlay_w-${px}:(H-overlay_h)/2`,
      'bot-left':   `${px}:H-overlay_h-${py}`,
      'bot-center': `(W-overlay_w)/2:H-overlay_h-${py}`,
      'bot-right':  `W-overlay_w-${px}:H-overlay_h-${py}`,
    }
    return map[state.wmPos] || map['bot-right']
  }

  // ── Teardown ──────────────────────────────────────────────────────────────
  const cleanObs = new MutationObserver(() => {
    if (document.contains(body)) return
    dead = true
    dropUnlisten?.(); dropUnlisten = null
    cleanObs.disconnect()
  })
  cleanObs.observe(document.body, { childList: true, subtree: true })
}
