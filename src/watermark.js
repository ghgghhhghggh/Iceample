// watermark.js — Ajout de filigrane sur images et vidéos

import { trackRecentFile } from './recent.js'
import { makeSendButton, imageMedia } from './media-bus.js'

export function initWatermark(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;font-family:inherit;'

  const POSITIONS = [
    ['top-left','haut-gauche'], ['top-center','haut-centre'], ['top-right','haut-droite'],
    ['mid-left','milieu-gauche'], ['center','centre'],       ['mid-right','milieu-droite'],
    ['bot-left','bas-gauche'],  ['bot-center','bas-centre'],  ['bot-right','bas-droite'],
  ]

  let state = {
    mode:     'text',     // 'text' | 'image'
    wmText:   'Filigrane',
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

  // ── Layout ─────────────────────────────────────────────────────────────────
  const main = document.createElement('div')
  main.style.cssText = 'display:flex;flex:1;overflow:hidden;'

  const leftPanel = document.createElement('div')
  leftPanel.style.cssText = 'width:220px;flex-shrink:0;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--win-border-in,#1e1e1e);background:var(--surface2,#141414);'

  const rightArea = document.createElement('div')
  rightArea.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;'

  const previewBox = document.createElement('div')
  previewBox.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:#0a0a0a;overflow:hidden;position:relative;'

  const bottomBar = document.createElement('div')
  bottomBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--win-border-in,#1e1e1e);flex-shrink:0;background:var(--surface2,#141414);'

  rightArea.append(previewBox, bottomBar)
  main.append(leftPanel, rightArea)
  body.append(main)

  // ── Preview canvas ─────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'max-width:100%;max-height:100%;display:none;'
  const ctx = canvas.getContext('2d')

  const dropHint = document.createElement('div')
  dropHint.style.cssText = 'color:#444;text-align:center;pointer-events:none;'
  dropHint.innerHTML = '<i class="fa-solid fa-image" style="font-size:40px;display:block;margin-bottom:8px;"></i>Glissez une image ou vidéo ici<br><span style="font-size:10px;color:#333;">PNG · JPG · WEBP · MP4 · MOV · MKV · AVI · WEBM</span>'

  previewBox.append(dropHint, canvas)

  // ── Drop zone ──────────────────────────────────────────────────────────────
  previewBox.addEventListener('dragover', e => { e.preventDefault(); previewBox.style.background = '#111d2a' })
  previewBox.addEventListener('dragleave', () => { previewBox.style.background = '#0a0a0a' })
  previewBox.addEventListener('drop', async e => {
    e.preventDefault(); previewBox.style.background = '#0a0a0a'
    const file = e.dataTransfer?.files?.[0]; if (!file) return
    await loadMedia(file.path || null, file.name)
  })

  // ── Panel helpers ──────────────────────────────────────────────────────────
  const SEL = 'background:var(--surface,#111);border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-primary,#ddd);border-radius:5px;padding:4px 7px;font-size:11px;font-family:inherit;width:100%;box-sizing:border-box;'
  const INP = SEL

  function pLabel(txt) {
    const d = document.createElement('div')
    d.style.cssText = 'font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px;'
    d.textContent = txt; return d
  }

  function rangeCtrl(key, labelText, min, max, step, decimals = 0) {
    const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;'
    const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:#aaa;'
    const lbl = document.createElement('span'); lbl.textContent = labelText
    const val = document.createElement('span'); val.style.cssText = 'color:#ddd;font-weight:500;'; val.textContent = state[key].toFixed(decimals)
    row.append(lbl, val)
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = state[key]
    inp.style.cssText = 'width:100%;accent-color:var(--color-active,#4a9eff);'
    inp.addEventListener('input', () => { state[key] = parseFloat(inp.value); val.textContent = state[key].toFixed(decimals); updatePreview() })
    wrap.append(row, inp); leftPanel.appendChild(wrap)
    return inp
  }

  // ── Media picker ──────────────────────────────────────────────────────────
  leftPanel.appendChild(pLabel('Fichier source'))
  const pickMediaBtn = document.createElement('button')
  pickMediaBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Ouvrir image/vidéo'
  pickMediaBtn.style.cssText = 'border:1px solid var(--win-border-in,#1e1e1e);border-radius:5px;padding:6px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface,#111);color:#ddd;width:100%;'
  leftPanel.appendChild(pickMediaBtn)

  const mediaNameLbl = document.createElement('div')
  mediaNameLbl.style.cssText = 'font-size:10px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
  leftPanel.appendChild(mediaNameLbl)

  pickMediaBtn.addEventListener('click', async () => {
    if (!window.__TAURI__) return
    try {
      const result = await window.__TAURI__.core.invoke('pick_files_with_filter', {
        filterName: 'Images/Vidéos',
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
  leftPanel.appendChild(pLabel('Type de filigrane'))
  const modeRow = document.createElement('div'); modeRow.style.cssText = 'display:flex;gap:6px;'
  for (const [id, txt] of [['text','Texte'],['image','Image']]) {
    const b = document.createElement('button')
    b.textContent = txt; b.dataset.mode = id
    b.style.cssText = 'flex:1;border-radius:5px;padding:5px;cursor:pointer;font-size:11px;font-family:inherit;border:1px solid var(--win-border-in,#1e1e1e);background:var(--surface,#111);color:#aaa;'
    b.addEventListener('click', () => { state.mode = id; updateModeUI(); updatePreview() })
    modeRow.appendChild(b)
  }
  leftPanel.appendChild(modeRow)

  // ── Text controls ─────────────────────────────────────────────────────────
  const textGroup = document.createElement('div'); textGroup.style.cssText = 'display:flex;flex-direction:column;gap:6px;'
  textGroup.appendChild(pLabel('Texte'))
  const textInp = document.createElement('input'); textInp.type = 'text'; textInp.value = state.wmText; textInp.style.cssText = INP
  textInp.addEventListener('input', () => { state.wmText = textInp.value; updatePreview() })
  textGroup.appendChild(textInp)

  const fontLabel = document.createElement('div'); fontLabel.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:#aaa;'
  const fLbl = document.createElement('span'); fLbl.textContent = 'Taille police'
  const fVal = document.createElement('span'); fVal.style.cssText = 'color:#ddd;font-weight:500;'; fVal.textContent = state.wmFont
  fontLabel.append(fLbl, fVal)
  const fontRange = document.createElement('input'); fontRange.type = 'range'; fontRange.min = 10; fontRange.max = 120; fontRange.step = 2; fontRange.value = state.wmFont
  fontRange.style.cssText = 'width:100%;accent-color:var(--color-active,#4a9eff);'
  fontRange.addEventListener('input', () => { state.wmFont = fontRange.value; fVal.textContent = fontRange.value; updatePreview() })
  textGroup.append(fontLabel, fontRange)

  const colorRow2 = document.createElement('div'); colorRow2.style.cssText = 'display:flex;align-items:center;gap:8px;'
  const cLbl = document.createElement('span'); cLbl.style.cssText = 'font-size:11px;color:#aaa;flex:1;'; cLbl.textContent = 'Couleur'
  const colorInp = document.createElement('input'); colorInp.type = 'color'; colorInp.value = state.wmColor
  colorInp.style.cssText = 'width:40px;height:24px;border:1px solid #444;border-radius:4px;padding:1px;cursor:pointer;background:none;'
  colorInp.addEventListener('input', () => { state.wmColor = colorInp.value; updatePreview() })
  colorRow2.append(cLbl, colorInp)
  textGroup.appendChild(colorRow2)
  leftPanel.appendChild(textGroup)

  // ── Image watermark ────────────────────────────────────────────────────────
  const imgGroup = document.createElement('div'); imgGroup.style.cssText = 'display:none;flex-direction:column;gap:6px;'
  imgGroup.appendChild(pLabel('Image du filigrane'))
  const pickWmImgBtn = document.createElement('button')
  pickWmImgBtn.innerHTML = '<i class="fa-solid fa-image"></i> Choisir image'
  pickWmImgBtn.style.cssText = 'border:1px solid var(--win-border-in,#1e1e1e);border-radius:5px;padding:5px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface,#111);color:#ddd;width:100%;'
  pickWmImgBtn.addEventListener('click', async () => {
    if (!window.__TAURI__) return
    const result = await window.__TAURI__.core.invoke('pick_files_with_filter', {
      filterName: 'Images',
      extensions: ['png','jpg','jpeg','webp','gif'],
    })
    const item = Array.isArray(result) ? result[0] : result
    if (!item) return
    state.wmImgPath = typeof item === 'string' ? item : item.path
    wmImgLabel.textContent = state.wmImgPath.split(/[\\/]/).pop()
    updatePreview()
  })
  const wmImgLabel = document.createElement('div'); wmImgLabel.style.cssText = 'font-size:10px;color:#555;'
  imgGroup.append(pickWmImgBtn, wmImgLabel)

  const iwLabel = document.createElement('div'); iwLabel.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:#aaa;'
  const iwLbl = document.createElement('span'); iwLbl.textContent = 'Largeur (px)'
  const iwVal = document.createElement('span'); iwVal.style.cssText = 'color:#ddd;font-weight:500;'; iwVal.textContent = state.wmImgW
  iwLabel.append(iwLbl, iwVal)
  const iwRange = document.createElement('input'); iwRange.type = 'range'; iwRange.min = 20; iwRange.max = 600; iwRange.step = 10; iwRange.value = state.wmImgW
  iwRange.style.cssText = 'width:100%;accent-color:var(--color-active,#4a9eff);'
  iwRange.addEventListener('input', () => { state.wmImgW = parseInt(iwRange.value); iwVal.textContent = iwRange.value; updatePreview() })
  imgGroup.append(iwLabel, iwRange)
  leftPanel.appendChild(imgGroup)

  // ── Shared controls ────────────────────────────────────────────────────────
  leftPanel.appendChild(pLabel('Opacité'))
  rangeCtrl('wmOpacity', 'Opacité', 0.05, 1, 0.05, 2)

  leftPanel.appendChild(pLabel('Position'))
  const posGrid = document.createElement('div')
  posGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:3px;'
  for (const [pos, lbl] of POSITIONS) {
    const b = document.createElement('button')
    b.style.cssText = 'border:1px solid var(--win-border-in,#1e1e1e);border-radius:4px;padding:4px 2px;cursor:pointer;font-size:9px;font-family:inherit;background:var(--surface,#111);color:#aaa;text-align:center;'
    b.textContent = lbl; b.dataset.pos = pos
    b.addEventListener('click', () => { state.wmPos = pos; updatePosUI(); updatePreview() })
    posGrid.appendChild(b)
  }
  leftPanel.appendChild(posGrid)

  leftPanel.appendChild(pLabel('Marge'))
  rangeCtrl('wmPadX', 'Horizontal', 0, 100, 1)
  rangeCtrl('wmPadY', 'Vertical',   0, 100, 1)

  // ── UI state ───────────────────────────────────────────────────────────────
  function updateModeUI() {
    for (const b of modeRow.children) {
      const active = b.dataset.mode === state.mode
      b.style.background = active ? 'var(--color-active,#4a9eff)' : 'var(--surface,#111)'
      b.style.color = active ? '#fff' : '#aaa'
    }
    textGroup.style.display = state.mode === 'text' ? 'flex' : 'none'
    imgGroup.style.display  = state.mode === 'image' ? 'flex' : 'none'
  }

  function updatePosUI() {
    for (const b of posGrid.children) {
      const active = b.dataset.pos === state.wmPos
      b.style.background = active ? 'var(--color-active,#4a9eff)' : 'var(--surface,#111)'
      b.style.color = active ? '#fff' : '#aaa'
      b.style.border = active ? '1px solid var(--color-active,#4a9eff)' : '1px solid var(--win-border-in,#1e1e1e)'
    }
  }

  updateModeUI(); updatePosUI()

  // ── Media load ─────────────────────────────────────────────────────────────
  let baseImageEl = null

  async function loadMedia(path, name) {
    if (!path) return
    const ext = (name || path).split('.').pop().toLowerCase()
    const isImg = ['jpg','jpeg','png','webp','gif','bmp'].includes(ext)
    const isVid = ['mp4','mov','mkv','avi','webm','m4v'].includes(ext)

    state.mediaPath = path; state.mediaName = name || path.split(/[\\/]/).pop()
    state.mediaType = isImg ? 'image' : isVid ? 'video' : null
    mediaNameLbl.textContent = state.mediaName

    if (isImg && window.__TAURI__) {
      try {
        const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
        baseImageEl = new Image()
        baseImageEl.src = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`
        baseImageEl.onload = () => {
          dropHint.style.display = 'none'
          canvas.style.display = 'block'
          updatePreview()
        }
      } catch (e) { window.toast?.(String(e), 'error') }
    } else if (isVid) {
      baseImageEl = null
      dropHint.style.display = 'none'
      canvas.style.display = 'none'
      const vidInfo = document.createElement('div')
      vidInfo.style.cssText = 'color:#888;font-size:11px;text-align:center;padding:12px;'
      vidInfo.innerHTML = `<i class="fa-solid fa-film" style="font-size:32px;display:block;margin-bottom:8px;color:#555;"></i>${state.mediaName}<br><span style="font-size:10px;color:#444;">Aperçu non disponible pour les vidéos.<br>Cliquez sur Appliquer pour traiter.</span>`
      // clear old vid info
      for (const el of previewBox.querySelectorAll('.vid-info')) el.remove()
      vidInfo.className = 'vid-info'
      previewBox.appendChild(vidInfo)
    }
  }

  // Media bus: an image sent from another tool becomes the base media (no file
  // on disk — applyImage draws from baseImageEl, so save works too).
  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (!m || m.kind !== 'image' || !m.dataUrl) return
    baseImageEl = new Image()
    baseImageEl.onload = () => {
      state.mediaPath = 'bus:' + (m.name || 'image')
      state.mediaType = 'image'
      state.mediaName = (m.name || 'image').replace(/\.[a-z0-9]+$/i, '') + '.png'
      mediaNameLbl.textContent = state.mediaName
      for (const el of previewBox.querySelectorAll('.vid-info')) el.remove()
      dropHint.style.display = 'none'
      canvas.style.display = 'block'
      updatePreview()
    }
    baseImageEl.src = m.dataUrl
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

  // ── Preview update ─────────────────────────────────────────────────────────
  let wmImageEl = null

  async function ensureWmImage() {
    if (!state.wmImgPath || !window.__TAURI__) return null
    if (wmImageEl && wmImageEl._src === state.wmImgPath) return wmImageEl
    const ext = state.wmImgPath.split('.').pop().toLowerCase()
    const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path: state.wmImgPath })
    wmImageEl = new Image()
    wmImageEl.src = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`
    wmImageEl._src = state.wmImgPath
    await new Promise(r => { wmImageEl.onload = r })
    return wmImageEl
  }

  async function updatePreview() {
    if (!baseImageEl || state.mediaType !== 'image') return
    const W = baseImageEl.naturalWidth; const H = baseImageEl.naturalHeight
    canvas.width = W; canvas.height = H
    ctx.drawImage(baseImageEl, 0, 0, W, H)

    ctx.globalAlpha = state.wmOpacity

    if (state.mode === 'text') {
      const fs = parseInt(state.wmFont)
      ctx.font = `bold ${fs}px sans-serif`
      ctx.fillStyle = state.wmColor
      const metrics = ctx.measureText(state.wmText)
      const wmW = metrics.width; const wmH = fs
      const { x, y } = getWmPos(W, H, wmW, wmH)
      ctx.fillText(state.wmText, x, y + wmH)
    } else if (state.mode === 'image') {
      const imgEl = await ensureWmImage()
      if (imgEl) {
        const scale = state.wmImgW / imgEl.naturalWidth
        const wmW = state.wmImgW; const wmH = imgEl.naturalHeight * scale
        const { x, y } = getWmPos(W, H, wmW, wmH)
        ctx.drawImage(imgEl, x, y, wmW, wmH)
      }
    }

    ctx.globalAlpha = 1
  }

  // ── Bottom bar: apply & export ─────────────────────────────────────────────
  const BTN2 = (txt, icon, col) => {
    const b = document.createElement('button')
    b.innerHTML = `<i class="fa-solid ${icon}"></i> ${txt}`
    b.style.cssText = `border:none;border-radius:6px;padding:7px 14px;cursor:pointer;font-size:11px;font-family:inherit;background:${col};color:#fff;`
    return b
  }

  const applyBtn   = BTN2('Appliquer et sauvegarder', 'fa-wand-magic-sparkles', 'var(--color-active,#4a9eff)')
  const statusLbl  = document.createElement('span')
  statusLbl.style.cssText = 'font-size:10px;color:#666;margin-left:auto;'
  // "Send to…" — ship the watermarked result (preview canvas is full-res).
  const sendBtn = makeSendButton(async () => {
    if (!baseImageEl || state.mediaType !== 'image') return null
    await updatePreview()
    return imageMedia(canvas, (state.mediaName || 'filigrane').replace(/\.[^.]+$/, ''))
  }, { self: 'watermark', className: '', iconOnly: true })
  sendBtn.style.cssText = 'border:1px solid var(--win-border-in,#1e1e1e);border-radius:6px;padding:7px 10px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface,#111);color:#ddd;'
  bottomBar.append(applyBtn, sendBtn, statusLbl)

  applyBtn.addEventListener('click', async () => {
    if (!state.mediaPath) { window.toast?.('Ouvrez d\'abord un fichier', 'warn'); return }
    if (state.mediaType === 'image') await applyImage()
    else if (state.mediaType === 'video') await applyVideo()
  })

  async function applyImage() {
    if (!window.__TAURI__) return
    const ext = state.mediaName.split('.').pop().toLowerCase()
    const defaultName = state.mediaName.replace(/\.[^.]+$/, `_wm.${ext}`)
    const path = await window.__TAURI__.dialog.save({
      defaultPath: defaultName,
      filters: [{ name: 'Image', extensions: [ext, 'png', 'jpg'] }],
    })
    if (!path) return

    // Draw full-res to offscreen canvas
    const W = baseImageEl.naturalWidth; const H = baseImageEl.naturalHeight
    const off = document.createElement('canvas'); off.width = W; off.height = H
    const oc = off.getContext('2d')
    oc.drawImage(baseImageEl, 0, 0, W, H)
    oc.globalAlpha = state.wmOpacity

    if (state.mode === 'text') {
      const fs = parseInt(state.wmFont)
      oc.font = `bold ${fs}px sans-serif`
      oc.fillStyle = state.wmColor
      const metrics = oc.measureText(state.wmText)
      const wmW = metrics.width; const wmH = fs
      const { x, y } = getWmPos(W, H, wmW, wmH)
      oc.fillText(state.wmText, x, y + wmH)
    } else if (state.mode === 'image') {
      const imgEl = await ensureWmImage()
      if (imgEl) {
        const scale = state.wmImgW / imgEl.naturalWidth
        const wmW = state.wmImgW; const wmH = imgEl.naturalHeight * scale
        const { x, y } = getWmPos(W, H, wmW, wmH)
        oc.drawImage(imgEl, x, y, wmW, wmH)
      }
    }
    oc.globalAlpha = 1

    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
    const b64 = off.toDataURL(mimeType).split(',')[1]
    try {
      await window.__TAURI__.core.invoke('save_binary_file', { path, base64: b64 })
      trackRecentFile(path, defaultName)
      window.toast?.('Image sauvegardée ✓', 'success')
      statusLbl.textContent = '✓ ' + path.split(/[\\/]/).pop()
    } catch (e) { window.toast?.(String(e), 'error') }
  }

  async function applyVideo() {
    if (!window.__TAURI__) return
    const ext = state.mediaName.split('.').pop().toLowerCase()
    const defaultName = state.mediaName.replace(/\.[^.]+$/, `_wm.${ext}`)
    const path = await window.__TAURI__.dialog.save({
      defaultPath: defaultName,
      filters: [{ name: 'Vidéo', extensions: [ext] }],
    })
    if (!path) return

    statusLbl.textContent = 'Traitement…'; applyBtn.disabled = true

    try {
      if (state.mode === 'text') {
        // FFmpeg drawtext filter
        const posArgs = ffmpegTextPos()
        const escaped = state.wmText.replace(/'/g, "\\'").replace(/:/g, '\\:')
        const color = state.wmColor.replace('#', '0x') + Math.round(state.wmOpacity * 255).toString(16).padStart(2, '0')
        const filterStr = `drawtext=text='${escaped}':fontsize=${state.wmFont}:fontcolor=${color}:${posArgs}`
        await window.__TAURI__.core.invoke('ffmpeg_run', {
          args: ['-i', state.mediaPath, '-vf', filterStr, '-c:a', 'copy', path]
        })
      } else if (state.mode === 'image' && state.wmImgPath) {
        // FFmpeg overlay filter
        const overlayExpr = ffmpegOverlayPos()
        const alphaFilter = `[1:v]scale=${state.wmImgW}:-1,format=rgba,colorchannelmixer=aa=${state.wmOpacity}[wm];[0:v][wm]overlay=${overlayExpr}[out]`
        await window.__TAURI__.core.invoke('ffmpeg_run', {
          args: ['-i', state.mediaPath, '-i', state.wmImgPath, '-filter_complex', alphaFilter, '-map', '[out]', '-map', '0:a?', '-c:a', 'copy', path]
        })
      } else {
        window.toast?.('Sélectionnez une image de filigrane', 'warn'); applyBtn.disabled = false; statusLbl.textContent = ''; return
      }
      trackRecentFile(path, defaultName)
      window.toast?.('Vidéo traitée ✓', 'success')
      statusLbl.textContent = '✓ ' + path.split(/[\\/]/).pop()
    } catch (e) {
      window.toast?.(String(e), 'error')
      statusLbl.textContent = 'Erreur'
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
    const W = state.wmImgW
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
}
