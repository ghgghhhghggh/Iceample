// export-canvas.js — Shared PNG / GIF / WebM export panel

function injectExportStyles() {
  if (document.getElementById('ec-styles')) return
  const s = document.createElement('style'); s.id = 'ec-styles'
  s.textContent = `
.ec-overlay{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(2px)}
.ec-panel{background:var(--surface);border:1px solid var(--win-border);border-radius:10px;padding:18px;width:300px;display:flex;flex-direction:column;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.5)}
.ec-title{font-size:13px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:7px}
.ec-title i{color:var(--color-active)}
.ec-tabs{display:flex;gap:4px}
.ec-tab{flex:1;padding:6px 0;border:1px solid var(--win-border-in);border-radius:6px;background:none;color:var(--text-secondary);font-size:11px;cursor:pointer;font-family:inherit;transition:all .12s}
.ec-tab:hover{color:var(--text-primary);border-color:var(--win-border)}
.ec-tab.sel{background:color-mix(in srgb,var(--color-active) 15%,transparent);border-color:var(--color-active);color:var(--color-active)}
.ec-fields{display:flex;flex-direction:column;gap:8px}
.ec-row{display:flex;align-items:center;gap:8px}
.ec-row label{width:70px;font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.3px;flex-shrink:0}
.ec-inp{flex:1;padding:4px 8px;background:color-mix(in srgb,var(--surface) 70%,#000);border:1px solid var(--win-border-in);border-radius:5px;color:var(--text-primary);font-size:12px;font-family:inherit;outline:none}
.ec-inp:focus{border-color:var(--color-active)}
.ec-note{font-size:10px;color:var(--text-secondary);opacity:.75;line-height:1.5}
.ec-progress{height:4px;background:var(--win-border-in);border-radius:2px;overflow:hidden;display:none}
.ec-bar{height:100%;background:var(--color-active);width:0%;transition:width .1s linear;border-radius:2px}
.ec-actions{display:flex;gap:6px;margin-top:2px}
.ec-btn{flex:1;padding:8px;border:1px solid var(--win-border-in);border-radius:6px;background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));color:var(--text-secondary);font-size:11px;cursor:pointer;font-family:inherit;transition:all .1s}
.ec-btn:hover{color:var(--text-primary)}
.ec-btn.primary{background:var(--color-active);border-color:var(--color-active);color:#fff;font-weight:600}
.ec-btn.primary:hover{opacity:.88}
.ec-btn:disabled{opacity:.4;pointer-events:none}
.ec-status{font-size:11px;color:var(--color-active);text-align:center;min-height:16px}
`
  document.head.appendChild(s)
}

// ── Minimal GIF encoder ───────────────────────────────────────────────────────

function quantize(rgba) {
  // Uniform 6×6×6 = 216-color palette (fast, zero dependencies)
  const L = 6, S = 255 / (L - 1)
  const pal = new Uint8Array(256 * 3)
  let pi = 0
  for (let r = 0; r < L; r++) for (let g = 0; g < L; g++) for (let b = 0; b < L; b++) {
    pal[pi*3] = Math.round(r*S); pal[pi*3+1] = Math.round(g*S); pal[pi*3+2] = Math.round(b*S); pi++
  }
  const idx = new Uint8Array(rgba.length >> 2)
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    idx[p] = Math.round(rgba[i]/S) * L*L + Math.round(rgba[i+1]/S) * L + Math.round(rgba[i+2]/S)
  }
  return { pal, idx }
}

function lzwEncode(idx, minCode) {
  const CLEAR = 1 << minCode, EOF = CLEAR + 1
  let cs = minCode + 1, nc = EOF + 1, mx = 1 << cs
  const tbl = new Map(), bits = [], b = { v: 0, n: 0 }

  const emit = code => {
    b.v |= code << b.n; b.n += cs
    while (b.n >= 8) { bits.push(b.v & 255); b.v >>= 8; b.n -= 8 }
  }
  const reset = () => { tbl.clear(); cs = minCode+1; nc = EOF+1; mx = 1<<cs }

  emit(CLEAR); reset()
  let p = idx[0]
  for (let i = 1; i < idx.length; i++) {
    const c = idx[i], k = p * 256 + c
    if (tbl.has(k)) { p = tbl.get(k) }
    else {
      emit(p)
      if (nc <= 4095) { tbl.set(k, nc++); if (nc > mx && cs < 12) { cs++; mx <<= 1 } }
      else { emit(CLEAR); reset() }
      p = c
    }
  }
  emit(p); emit(EOF)
  if (b.n) bits.push(b.v & 255)

  const out = [minCode]
  for (let i = 0; i < bits.length; ) {
    const n = Math.min(255, bits.length - i)
    out.push(n, ...bits.slice(i, i+n)); i += n
  }
  return [...out, 0]
}

function buildGIF(frames, W, H, delayCs, loop) {
  const u16 = n => [n & 255, n >> 8 & 255]
  const str = s => [...s].map(c => c.charCodeAt(0))
  const out = [...str('GIF89a'), ...u16(W), ...u16(H), 0xF7, 0, 0]

  // Global color table (from first frame)
  const { pal: pal0, idx: idx0 } = quantize(frames[0].data)
  out.push(...pal0)

  // Netscape loop block
  if (loop) out.push(0x21, 0xFF, 0x0B, ...str('NETSCAPE2.0'), 3, 1, ...u16(0), 0)

  frames.forEach((f, fi) => {
    const { pal, idx } = fi === 0 ? { pal: pal0, idx: idx0 } : quantize(f.data)
    // Graphic Control Extension
    out.push(0x21, 0xF9, 0x04, 0x04, ...u16(delayCs), 0, 0)
    // Image Descriptor
    out.push(0x2C, ...u16(0), ...u16(0), ...u16(W), ...u16(H), fi > 0 ? 0x87 : 0x00)
    if (fi > 0) out.push(...pal)
    for (const b of lzwEncode(idx, 8)) out.push(b)   // no spread: a large frame exceeds the argument limit
  })

  out.push(0x3B)
  return new Uint8Array(out)
}

// ── Save via Tauri ────────────────────────────────────────────────────────────

async function saveBinary(data, defaultName, ext, filterName) {
  const invoke = window.__TAURI__?.core?.invoke
  const dialog = window.__TAURI__?.dialog
  if (!invoke) { console.warn('Tauri not available'); return false }

  let path
  try {
    path = await dialog.save({ defaultPath: defaultName, filters: [{ name: filterName, extensions: [ext] }] })
  } catch { path = null }
  if (!path) return false

  // Chunked: spreading the whole file as call arguments (fromCharCode(...data))
  // throws past ~100 KB, so GIF/WebM saves used to fail.
  let bin = ''
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000))
  await invoke('save_binary_file', { path, base64: btoa(bin) })
  return true
}

// ── Capture helpers ───────────────────────────────────────────────────────────

function getActiveCanvas(body) {
  // Returns the visible canvas in the tool body (works for Canvas 2D and WebGL with preserveDrawingBuffer)
  return body.querySelector('canvas')
}

async function captureFrames(body, getCanvas, durationMs, fps, onProgress, onPlay) {
  return new Promise(resolve => {
    const frames = []
    const interval = 1000 / fps
    let elapsed = 0

    onPlay?.()

    const timer = setInterval(() => {
      const canvas = getCanvas()
      if (canvas) {
        const tmp = document.createElement('canvas')
        tmp.width = canvas.width; tmp.height = canvas.height
        tmp.getContext('2d').drawImage(canvas, 0, 0)
        frames.push(tmp.getContext('2d').getImageData(0, 0, tmp.width, tmp.height))
      }
      elapsed += interval
      onProgress?.(Math.min(1, elapsed / durationMs))
      if (elapsed >= durationMs) { clearInterval(timer); resolve(frames) }
    }, interval)
  })
}

// ── Public export functions ───────────────────────────────────────────────────

async function exportPNG(getCanvas) {
  const canvas = getCanvas()
  if (!canvas) return false
  const tmp = document.createElement('canvas')
  tmp.width = canvas.width; tmp.height = canvas.height
  tmp.getContext('2d').drawImage(canvas, 0, 0)
  const dataUrl = tmp.toDataURL('image/png')
  const b64 = dataUrl.split(',')[1]
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  return saveBinary(bytes, 'export.png', 'png', 'PNG Image')
}

async function exportGIF(getCanvas, durationMs, fps, loop, onProgress, onPlay) {
  const canvas = getCanvas()
  if (!canvas) return false
  const W = canvas.width, H = canvas.height
  const frames = await captureFrames(null, getCanvas, durationMs, fps, onProgress, onPlay)
  if (!frames.length) return false
  onProgress?.(0.95)
  const gif = buildGIF(frames, W, H, Math.round(100 / fps), loop)
  return saveBinary(gif, 'animation.gif', 'gif', 'GIF Animation')
}

// `audio` is a MediaStream, or { stream, release } when the caller must free
// what feeds it (e.g. a tap on the app's mix) once the recording ends.
async function exportWebM(getCanvas, durationMs, audio, onProgress, onPlay) {
  const canvas = getCanvas()
  const audioStream = audio instanceof MediaStream ? audio : audio?.stream
  const release = () => {
    try { audioStream?.getTracks().forEach(t => t.stop()) } catch {}
    try { audio?.release?.() } catch {}
  }
  if (!canvas) { release(); return false }

  return new Promise(resolve => {
    const stream = canvas.captureStream(30)
    if (audioStream) audioStream.getAudioTracks().forEach(t => stream.addTrack(t))

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks = []

    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    recorder.onstop = async () => {
      stream.getVideoTracks().forEach(t => t.stop())
      release()
      onProgress?.(0.95)
      try {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const buf = await blob.arrayBuffer()
        resolve(await saveBinary(new Uint8Array(buf), 'animation.webm', 'webm', 'WebM Video'))
      } catch (e) { console.error('[export] WebM save failed:', e); resolve(false) }
    }

    onPlay?.()
    recorder.start(200)

    let elapsed = 0
    const tick = setInterval(() => {
      elapsed += 200
      onProgress?.(Math.min(0.9, elapsed / durationMs))
      if (elapsed >= durationMs) { clearInterval(tick); recorder.stop() }
    }, 200)
  })
}

// ── UI panel ──────────────────────────────────────────────────────────────────

export function showExportPanel(body, getCanvas, opts = {}) {
  // opts: { getAudioStream, getDuration, getFps, loop, onPlay }
  injectExportStyles()

  const overlay = document.createElement('div')
  overlay.className = 'ec-overlay'

  const getDur  = opts.getDuration ?? (() => 3000)
  const getFps  = opts.getFps      ?? (() => 15)
  const getLoop = opts.getLoop     ?? (() => false)

  let fmt = 'png'

  overlay.innerHTML = `
<div class="ec-panel">
  <div class="ec-title"><i class="fa-solid fa-file-export"></i> Exporter</div>
  <div class="ec-tabs">
    <button class="ec-tab sel" data-fmt="png">PNG</button>
    <button class="ec-tab" data-fmt="gif">GIF animé</button>
    <button class="ec-tab" data-fmt="webm">WebM</button>
  </div>
  <div class="ec-fields" id="ec-fields">
    <div class="ec-note" id="ec-note">Exporte la frame courante en image PNG.</div>
    <div class="ec-row" id="ec-dur-row" style="display:none">
      <label>Durée</label>
      <input class="ec-inp" id="ec-dur" type="number" min="0.5" max="30" step="0.5" value="${(getDur()/1000).toFixed(1)}"> s
    </div>
    <div class="ec-row" id="ec-fps-row" style="display:none">
      <label>FPS</label>
      <input class="ec-inp" id="ec-fps" type="number" min="5" max="30" step="1" value="${getFps()}">
    </div>
  </div>
  <div class="ec-progress" id="ec-prog"><div class="ec-bar" id="ec-bar"></div></div>
  <div class="ec-status" id="ec-status"></div>
  <div class="ec-actions">
    <button class="ec-btn" id="ec-cancel">Annuler</button>
    <button class="ec-btn primary" id="ec-go"><i class="fa-solid fa-download"></i> Exporter</button>
  </div>
</div>`

  body.appendChild(overlay)

  const tabs   = overlay.querySelectorAll('.ec-tab')
  const note   = overlay.querySelector('#ec-note')
  const durRow = overlay.querySelector('#ec-dur-row')
  const fpsRow = overlay.querySelector('#ec-fps-row')
  const durInp = overlay.querySelector('#ec-dur')
  const fpsInp = overlay.querySelector('#ec-fps')
  const prog   = overlay.querySelector('#ec-prog')
  const bar    = overlay.querySelector('#ec-bar')
  const status = overlay.querySelector('#ec-status')
  const goBtn  = overlay.querySelector('#ec-go')
  const cancel = overlay.querySelector('#ec-cancel')

  const NOTES = {
    png:  'Exporte la frame courante en image PNG.',
    gif:  'Enregistre l\'animation complète en GIF (256 couleurs).',
    webm: 'Enregistre l\'animation en vidéo WebM haute qualité.'
  }

  tabs.forEach(tab => tab.addEventListener('click', () => {
    fmt = tab.dataset.fmt
    tabs.forEach(t => t.classList.toggle('sel', t === tab))
    note.textContent = NOTES[fmt]
    durRow.style.display = fmt !== 'png' ? '' : 'none'
    fpsRow.style.display = fmt === 'gif' ? '' : 'none'
  }))

  function setProgress(p) {
    prog.style.display = 'block'
    bar.style.width = (p * 100).toFixed(1) + '%'
  }

  cancel.addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })

  goBtn.addEventListener('click', async () => {
    goBtn.disabled = true; cancel.disabled = true
    status.textContent = 'Enregistrement…'
    const dur = parseFloat(durInp.value) * 1000 || getDur()
    const fps = parseInt(fpsInp.value) || 15
    const loop = getLoop()

    try {
      let ok = false
      if (fmt === 'png') {
        ok = await exportPNG(getCanvas)
      } else if (fmt === 'gif') {
        ok = await exportGIF(getCanvas, dur, fps, loop, setProgress, opts.onPlay)
      } else {
        const audioStream = opts.getAudioStream?.()
        ok = await exportWebM(getCanvas, dur, audioStream, setProgress, opts.onPlay)
      }
      if (ok) {
        status.textContent = '✓ Fichier sauvegardé'
        setTimeout(() => overlay.remove(), 1200)
      } else {
        status.textContent = 'Annulé.'
        goBtn.disabled = false; cancel.disabled = false
        prog.style.display = 'none'
      }
    } catch (e) {
      status.textContent = 'Erreur : ' + (e?.message ?? e)
      goBtn.disabled = false; cancel.disabled = false
    }
  })
}
