// imageeditor.js — Layer-based image editor (foundation), multi-document.
// Each document is a tab (new blank file or a loaded image / 3D render). Open
// images (file / library), stack layers, adjust (brightness/contrast/saturation/
// hue/opacity/scale/rotation), crop, and export back to the library. Closing a
// tab or the window prompts to save any unsaved document. Canvas 2D, no deps.
import { t } from './i18n.js'
import { promptName, confirmUnsaved } from './rename-dialog.js'
import { getShortcut } from './shortcuts.js'
import { showPalPicker } from './palettes.js'
import { makeSendButton, imageMedia } from './media-bus.js'
import { registerTool, toDataURLAsync } from './project.js'

function injectStyles() {
  if (document.getElementById('ie-styles')) return
  const s = document.createElement('style'); s.id = 'ie-styles'
  s.textContent = `
.ie-body { display:flex; flex-direction:column; height:100%; background:var(--surface); padding:0; overflow:hidden; }
.ie-sec-tog { cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none; }
.ie-sec-tog i { font-size:9px; width:9px; transition:transform .12s ease; }
.ie-sec-tog:hover span { color:var(--text-primary,#fff); }
.ie-bar { display:flex; align-items:center; gap:5px; padding:7px 9px; border-bottom:1px solid var(--win-border-in,#1e1e1e); flex-shrink:0; flex-wrap:wrap; }
.ie-btn { display:flex; align-items:center; gap:6px; height:28px; padding:0 10px; border:1px solid var(--win-border,#2a2a2a);
  background:color-mix(in srgb,var(--text-primary) 7%,var(--surface)); color:var(--text-secondary,#aaa); border-radius:6px; font-family:inherit; font-size:11px; cursor:pointer; transition:background .12s ease,color .12s ease,border-color .12s ease; }
.ie-btn:hover { background:color-mix(in srgb,var(--text-primary) 13%,var(--surface)); color:var(--text-primary,#fff); }
.ie-btn:active { transform:translateY(1px); }
.ie-btn.on { background:color-mix(in srgb, var(--color-active,#4a9eff) 18%, transparent); color:var(--color-active,#4a9eff); border-color:var(--color-active,#4a9eff); }
.ie-sep { width:1px; height:20px; background:var(--win-border-in,#1e1e1e); }
.ie-tabs { display:flex; align-items:stretch; gap:4px; padding:5px 8px 0; border-bottom:1px solid var(--win-border-in,#1e1e1e); flex-shrink:0; overflow-x:auto; }
.ie-tab { display:flex; align-items:center; gap:7px; padding:5px 9px; border:1px solid var(--win-border-in,#1e1e1e); border-bottom:none;
  border-radius:6px 6px 0 0; background:color-mix(in srgb,var(--text-primary) 5%,var(--surface)); color:var(--text-secondary,#9a9aa3); font-size:11px; cursor:pointer; white-space:nowrap; transition:background .12s ease,color .12s ease; }
.ie-tab:hover { color:var(--text-primary,#fff); }
.ie-tab.sel { background:color-mix(in srgb,var(--surface) 55%,#000); color:var(--text-primary,#fff); border-color:var(--win-border,#2c2c2e); box-shadow:inset 0 2px 0 var(--color-active,#4a9eff); }
.ie-tab .dot { width:6px; height:6px; border-radius:50%; background:var(--color-active,#4a9eff); flex-shrink:0; }
.ie-tab .x { opacity:.5; font-size:11px; }
.ie-tab .x:hover { opacity:1; color:#ff6a6a; }
.ie-tab-new { padding:5px 10px; background:none; border:none; color:var(--text-secondary,#9a9aa3); cursor:pointer; font-size:13px; }
.ie-tab-new:hover { color:var(--color-active,#4a9eff); }
.ie-main { flex:1; display:flex; min-height:0; }
.ie-wrap { flex:1; position:relative; overflow:hidden; min-width:0; background:color-mix(in srgb,var(--surface) 55%,#000); }
.ie-wrap canvas { display:block; width:100%; height:100%; }
.ie-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#5f6068; font-size:12px; pointer-events:none; }
.ie-empty .ie-btn { pointer-events:auto; }
.ie-panel { width:23%; min-width:192px; max-width:310px; flex-shrink:0; display:flex; flex-direction:column; overflow-y:auto; overflow-x:hidden;
  background:color-mix(in srgb,var(--surface) 80%,#000); border-left:1px solid var(--win-border-in,#1e1e1e); padding:12px 12px 16px; box-shadow:inset 8px 0 16px -16px #000; }
.ie-tools { display:flex; flex-direction:column; gap:6px; margin-bottom:8px; }
.ie-tbtn { width:100%; height:32px; display:flex; align-items:center; gap:9px; padding:0 11px; border:1px solid var(--win-border,#2a2a2a); background:color-mix(in srgb,var(--text-primary) 7%,var(--surface)); color:var(--text-secondary,#aaa); border-radius:7px; cursor:pointer; font-size:12px; font-family:inherit; transition:background .12s ease,color .12s ease,border-color .12s ease,transform .08s ease; }
.ie-tbtn i { width:15px; text-align:center; font-size:13px; }
.ie-tbtn:hover { background:color-mix(in srgb,var(--text-primary) 13%,var(--surface)); color:var(--text-primary,#fff); }
.ie-tbtn:active { transform:scale(.98); }
.ie-tbtn.on { background:color-mix(in srgb, var(--color-active,#4a9eff) 20%, transparent); color:var(--color-active,#4a9eff); border-color:var(--color-active,#4a9eff); box-shadow:0 0 0 1px color-mix(in srgb, var(--color-active,#4a9eff) 30%, transparent); }
.ie-brush-ctl { margin-top:-2px; padding:10px 10px 9px; border:1px solid color-mix(in srgb, var(--color-active,#4a9eff) 30%, transparent); border-radius:7px;
  background:color-mix(in srgb, var(--color-active,#4a9eff) 8%, #141419); box-shadow:0 2px 8px -4px rgba(0,0,0,.5); animation:ie-ctl-in .12s ease; }
@keyframes ie-ctl-in { from{opacity:0;transform:translateY(-3px)} to{opacity:1;transform:translateY(0)} }
.ie-brush-ctl .ie-field:last-child { margin-bottom:0; }
.ie-sec-h { font-size:9.5px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:#7d7f88; margin:15px 0 8px; padding-bottom:6px; border-bottom:1px solid var(--win-border-in,#1e1e1e); }
.ie-sec-h:first-child { margin-top:0; }
.ie-layer { position:relative; display:flex; align-items:center; gap:7px; padding:6px 7px 6px 10px; border-radius:6px; cursor:pointer; font-size:11px; color:var(--text-secondary,#9a9aa3); border:1px solid transparent; transition:background .12s ease,color .12s ease; }
.ie-layer:hover { background:color-mix(in srgb,var(--text-primary) 8%,var(--surface)); }
.ie-layer.sel { background:color-mix(in srgb, var(--color-active,#4a9eff) 16%, transparent); color:var(--color-active,#4a9eff); border-color:color-mix(in srgb, var(--color-active,#4a9eff) 35%, transparent); }
.ie-layer.sel::before { content:''; position:absolute; left:0; top:4px; bottom:4px; width:3px; border-radius:2px; background:var(--color-active,#4a9eff); }
.ie-layer .nm { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ie-layer .act { opacity:.5; cursor:pointer; font-size:11px; width:14px; text-align:center; transition:opacity .1s ease,color .1s ease; }
.ie-layer .act:hover { opacity:1; }
.ie-layer .act.del:hover { color:#ff6a6a; }
.ie-layer-rename { flex:1; min-width:0; background:color-mix(in srgb,var(--surface) 60%,#000); border:1px solid var(--color-active,#4a9eff); border-radius:4px; color:var(--text-primary,#fff); font-family:inherit; font-size:11px; padding:1px 4px; outline:none; }
.ie-field { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.ie-field > label { font-size:11px; color:var(--text-secondary,#9a9aa3); width:66px; flex-shrink:0; }
.ie-field input[type=range] { flex:1; min-width:0; accent-color:var(--color-active,#4a9eff); }
.ie-field .v { font-size:10px; color:#9a9aa3; width:34px; text-align:right; flex-shrink:0; font-variant-numeric:tabular-nums; }
.ie-noadj { font-size:11px; color:#5f6068; text-align:center; padding:16px 6px; }
.ie-num { flex:1; min-width:0; background:color-mix(in srgb,var(--surface) 70%,#000); border:1px solid var(--win-border,#2a2a2a); border-radius:5px; color:var(--text-primary,#eee); font-family:inherit; font-size:12px; padding:5px 8px; outline:none; }
.ie-num:focus { border-color:var(--color-active,#4a9eff); }
.ie-reset { width:100%; justify-content:center; margin-top:6px; }
.ie-adjbox { border:1px solid var(--win-border-in,#1e1e1e); border-radius:9px; padding:10px 10px 6px; background:color-mix(in srgb,var(--surface) 75%,#000); box-shadow:0 2px 10px -6px rgba(0,0,0,.6); }
.ie-lib-ov { position:absolute; inset:0; z-index:20; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; }
.ie-lib-card { width:80%; max-width:520px; max-height:80%; overflow:auto; background:var(--surface,#16161a); border:1px solid var(--win-border,#2c2c2e); border-radius:10px; padding:12px; }
.ie-lib-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(90px,1fr)); gap:8px; margin-top:8px; }
.ie-lib-item { border:1px solid var(--win-border,#2a2a2a); border-radius:6px; overflow:hidden; cursor:pointer; background:color-mix(in srgb,var(--surface) 75%,#000); transition:border-color .12s ease; }
.ie-lib-item:hover { border-color:var(--color-active,#4a9eff); }
.ie-lib-item img { width:100%; height:70px; object-fit:cover; display:block; }
.ie-lib-item span { display:block; font-size:9px; color:#9a9aa3; padding:3px 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ie-drop-ov { position:absolute; inset:3px; z-index:30; display:flex; align-items:center; justify-content:center; background:color-mix(in srgb, var(--color-active,#4a9eff) 10%, transparent); border:2px dashed var(--color-active,#4a9eff); border-radius:6px; pointer-events:none; color:var(--color-active,#4a9eff); font-size:32px; }
.ie-recover { position:absolute; top:10px; left:50%; transform:translateX(-50%); z-index:25; display:flex; align-items:center; gap:8px; padding:7px 10px;
  background:var(--surface,#16161a); border:1px solid var(--win-border,#2c2c2e); border-radius:8px; font-size:11px; color:var(--text-secondary,#9a9aa3); box-shadow:0 6px 18px -8px rgba(0,0,0,.7); animation:ie-ctl-in .12s ease; }
`
  document.head.appendChild(s)
}

export function initImageEditor(body) {
  injectStyles()
  body.classList.add('ie-body')
  body.innerHTML = `
    <div class="ie-bar">
      <button class="ie-btn" id="ie-open"><i class="fa-solid fa-folder-open"></i> ${t('ie_open')}</button>
      <button class="ie-btn" id="ie-lib"><i class="fa-solid fa-images"></i> ${t('ie_library')}</button>
      <button class="ie-btn" id="ie-add"><i class="fa-solid fa-layer-group"></i> ${t('ie_add_layer')}</button>
      <span class="ie-sep"></span>
      <button class="ie-btn" id="ie-crop"><i class="fa-solid fa-crop-simple"></i> ${t('ie_crop')}</button>
      <span class="ie-sep"></span>
      <button class="ie-btn" id="ie-export"><i class="fa-solid fa-download"></i> ${t('ie_export')}</button>
      <button class="ie-btn" id="ie-saveproj" title="${t('ie_save_proj')}"><i class="fa-solid fa-box-archive"></i></button>
      <span class="ie-sep"></span>
      <button class="ie-btn" id="ie-undo" title="${t('sc_undo')}"><i class="fa-solid fa-rotate-left"></i></button>
      <button class="ie-btn" id="ie-redo" title="${t('sc_redo')}"><i class="fa-solid fa-rotate-right"></i></button>
      <span class="ie-sep"></span>
      <button class="ie-btn" id="ie-zoom-out" title="−"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
      <button class="ie-btn" id="ie-zoom-lbl" title="100%" style="min-width:52px;justify-content:center;font-variant-numeric:tabular-nums">100%</button>
      <button class="ie-btn" id="ie-zoom-in" title="+"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
      <button class="ie-btn" id="ie-zoom-fit" title="${t('ie_zoom_fit')}"><i class="fa-solid fa-arrows-to-dot"></i></button>
      <input type="file" id="ie-file" accept="image/*" hidden />
      <input type="file" id="ie-addfile" accept="image/*" hidden />
    </div>
    <div class="ie-tabs" id="ie-tabs"></div>
    <div class="ie-main">
      <div class="ie-wrap" id="ie-wrap">
        <canvas id="ie-canvas"></canvas>
        <div class="ie-empty" id="ie-empty">
          <i class="fa-solid fa-image" style="font-size:30px;opacity:0.3;"></i>
          <span>${t('ie_empty')}</span>
          <div style="display:flex;gap:6px;">
            <button class="ie-btn" id="ie-open2"><i class="fa-solid fa-folder-open"></i> ${t('ie_open')}</button>
            <button class="ie-btn" id="ie-new2"><i class="fa-solid fa-file"></i> ${t('ie_new')}</button>
            <button class="ie-btn" id="ie-lib2"><i class="fa-solid fa-images"></i> ${t('ie_library')}</button>
          </div>
        </div>
      </div>
      <div class="ie-panel" id="ie-panel"></div>
    </div>`

  const wrap = body.querySelector('#ie-wrap'), canvas = body.querySelector('#ie-canvas'), empty = body.querySelector('#ie-empty'), panel = body.querySelector('#ie-panel'), tabsEl = body.querySelector('#ie-tabs')
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1

  // Media bus: another tool sent us an image → add it as a layer (or open it).
  // Also accepts a .iceimg project reference → opened as a new document tab.
  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (!m) return
    if (m.kind === 'iceimg' && m.path) { openProjectPath(m.path, m.name); return }
    if (m.kind !== 'image' || !m.dataUrl) return
    place(m.dataUrl, m.name || t('ie_pasted'), !!(cur && (cur.docW || cur.infinite)))
  })
  // Library drag protocol: a file dragged out of the library panel and dropped
  // here. Images become layers, .iceimg projects open as a new tab.
  body.addEventListener('iceample-drop', e => {
    const f = e.detail && e.detail.file
    if (f && f.path) dropImg(f.path)
  })

  let docs = [], cur = null
  let stateRev = 0   // bumped on every repaint → tells the project auto-save something may have changed
  let view = { scale: 1, ox: 0, oy: 0 }
  let regionMode = false, regionRect = null, regionStart = null, regionApply = null
  let dragging = null, dragOff = { x: 0, y: 0 }, rz = null, gpush = false
  let tool = 'move', brushColor = '#ff2ec4', brushSize = 12, brushLayer = null, brushLast = null, lassoPts = null
  let eraserSize = 20, eraserLayer = null, eraserLast = null
  let brushAnchor = null, eraserAnchor = null  // last drawn point, persists between strokes for shift+click straight line
  let wandSel = null, fillTolerance = 32       // magic wand pending selection + shared wand/bucket tolerance
  let stampSize = 34, stampStrength = 0.45, stampLayer = null, stampLast = null, stampCarry = null
  let shapeKind = 'rect', shapeFill = '#cccccc', shapeStroke = '#000000', shapeStrokeW = 0, shapeStart = null
  let hoverPt = null, dragLayerIdx = null
  const collapsed = { layers: false, adjust: false, effects: false }

  const uid = () => Math.random().toString(36).slice(2, 8)
  const layerById = id => cur && cur.layers.find(l => l.id === id)
  const filterStr = a => `brightness(${a.b}) contrast(${a.c}) saturate(${a.s}) hue-rotate(${a.h}deg)`
  const LW = L => L.img.width * (L.sx || 1)   // layer display width  (independent X scale)
  const LH = L => L.img.height * (L.sy || 1)  // layer display height (independent Y scale)
  // Rotation-aware coordinate helpers: a layer's x/y/w/h are stored unrotated
  // ("local" space); it's rotated around its own center only at render time.
  // Hit-testing and the resize handles need to go through these so a rotated
  // layer can still be selected/resized where it's actually drawn on screen.
  function toLocal(L, wx, wy) {
    const w = LW(L), h = LH(L), cx = L.x + w / 2, cy = L.y + h / 2
    const rad = -(L.rot || 0) * Math.PI / 180, dx = wx - cx, dy = wy - cy
    const cos = Math.cos(rad), sin = Math.sin(rad)
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  }
  function toWorld(L, lx, ly) {
    const w = LW(L), h = LH(L), cx = L.x + w / 2, cy = L.y + h / 2
    const rad = (L.rot || 0) * Math.PI / 180, dx = lx - cx, dy = ly - cy
    const cos = Math.cos(rad), sin = Math.sin(rad)
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  }
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const normRect = r => ({ x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) })
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex || '')
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 74, g: 158, b: 255 }
  }
  // World/document point → the layer's own unrotated PIXEL space (its raw bitmap).
  function worldToLayerPixel(L, wx, wy) {
    const lp = toLocal(L, wx, wy), kx = L.sx || 1, ky = L.sy || 1
    return { x: Math.floor((lp.x - L.x) / kx), y: Math.floor((lp.y - L.y) / ky) }
  }
  // Flood fill on a layer's own bitmap (shared by the magic wand + paint bucket).
  // `tolerance` is the max per-channel (incl. alpha) difference from the seed
  // pixel, 0-255. Returns null if the seed pixel is outside the bitmap.
  function floodFillMask(L, px, py, tolerance) {
    ensureCanvasLayer(L)
    const w = L.img.width, h = L.img.height
    if (px < 0 || py < 0 || px >= w || py >= h) return null
    const data = L.img.getContext('2d').getImageData(0, 0, w, h).data
    const idx = (x, y) => (y * w + x) * 4
    const si = idx(px, py)
    const sr = data[si], sg = data[si + 1], sb = data[si + 2], sa = data[si + 3]
    const match = i => Math.max(Math.abs(data[i] - sr), Math.abs(data[i + 1] - sg), Math.abs(data[i + 2] - sb), Math.abs(data[i + 3] - sa)) <= tolerance
    const mask = new Uint8Array(w * h)
    const start = py * w + px
    mask[start] = 1
    const stack = [start]
    let minX = px, maxX = px, minY = py, maxY = py
    while (stack.length) {
      const m = stack.pop(), x = m % w, y = (m / w) | 0
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (x + 1 < w && !mask[m + 1] && match(idx(x + 1, y))) { mask[m + 1] = 1; stack.push(m + 1) }
      if (x - 1 >= 0 && !mask[m - 1] && match(idx(x - 1, y))) { mask[m - 1] = 1; stack.push(m - 1) }
      if (y + 1 < h && !mask[m + w] && match(idx(x, y + 1))) { mask[m + w] = 1; stack.push(m + w) }
      if (y - 1 >= 0 && !mask[m - w] && match(idx(x, y - 1))) { mask[m - w] = 1; stack.push(m - w) }
    }
    return { mask, w, h, bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
  }
  function maskToTintCanvas(mask, w, h, rgb, alpha) {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const g = c.getContext('2d'), id = g.createImageData(w, h)
    for (let i = 0; i < mask.length; i++) if (mask[i]) { const o = i * 4; id.data[o] = rgb.r; id.data[o + 1] = rgb.g; id.data[o + 2] = rgb.b; id.data[o + 3] = alpha }
    g.putImageData(id, 0, 0)
    return c
  }

  // ── Text & shape layers ────────────────────────────────────────────────────
  // Both are "live" layer types: their bitmap (L.img) is regenerated from their
  // properties whenever one changes, so the whole existing pipeline (transform,
  // hit-test, resize handles, opacity, adjustments, undo snapshots) applies
  // unchanged — only the bitmap source differs from an image layer.
  function renderTextLayer(L) {
    const size = L.tsize || 64
    const pad = Math.ceil(size * 0.25)
    const font = `${L.titalic ? 'italic ' : ''}${L.tbold ? '700 ' : ''}${size}px ${L.tfont || 'Segoe UI'}`
    const meas = document.createElement('canvas').getContext('2d')
    meas.font = font
    const lines = String(L.text || '').split('\n')
    let w = 1
    for (const ln of lines) w = Math.max(w, meas.measureText(ln).width)
    const lh = Math.ceil(size * 1.25)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.ceil(w) + pad * 2)
    c.height = Math.max(1, lines.length * lh + pad * 2)
    const g = c.getContext('2d')
    g.font = font; g.fillStyle = L.tcolor || '#ffffff'; g.textBaseline = 'top'
    lines.forEach((ln, i) => g.fillText(ln, pad, pad + i * lh))
    L.img = c
  }
  function renderShapeLayer(L, w, h) {
    w = Math.max(1, Math.round(w ?? L.sw ?? 1)); h = Math.max(1, Math.round(h ?? L.sh ?? 1))
    const sw = L.shape === 'line' ? Math.max(2, L.sstrokeW || 0) : (L.sstrokeW || 0)
    const pad = Math.ceil(sw / 2) + 1
    // Keep the shape's visual top-left anchored across regenerations even when
    // the stroke padding changes (thicker stroke = bigger canvas).
    const oldPad = L.spad || 0
    const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2
    const g = c.getContext('2d')
    g.lineWidth = sw; g.strokeStyle = L.sstroke || '#000000'; g.fillStyle = L.sfill || '#cccccc'
    if (L.shape === 'ellipse') {
      g.beginPath(); g.ellipse(pad + w / 2, pad + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      g.fill(); if (sw) g.stroke()
    } else if (L.shape === 'line') {
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(L.sflipX ? w + pad : pad, L.sflipY ? h + pad : pad)
      g.lineTo(L.sflipX ? pad : w + pad, L.sflipY ? pad : h + pad)
      g.stroke()
    } else {
      g.fillRect(pad, pad, w, h); if (sw) g.strokeRect(pad, pad, w, h)
    }
    if (L.img) { L.x += oldPad - pad; L.y += oldPad - pad }
    L.img = c; L.sw = w; L.sh = h; L.spad = pad
  }

  // ── Documents / tabs ───────────────────────────────────────────────────────
  function newDoc(name) {
    const d = { id: uid(), name: name || t('ie_untitled'), layers: [], docW: 0, docH: 0, infinite: false, sel: null, dirty: false, history: [], redo: [] }
    docs.push(d); return d
  }
  // The base background is its own (bottom) layer.
  function addFill(d, color) {
    d.layers.unshift({ id: uid(), type: 'fill', name: t('ie_bg'), color, x: 0, y: 0, sx: 1, sy: 1, rot: 0, opacity: 1, visible: true, adj: { b: 1, c: 1, s: 1, h: 0 } })
  }
  // A "new file" = a white background layer: infinite (grows with the window) or fixed.
  async function newFile() {
    const r = await promptNewFile(); if (!r) return
    const d = newDoc()
    if (r.infinite) d.infinite = true
    else { d.docW = r.w; d.docH = r.h }
    addFill(d, '#ffffff')
    cur = d; render(); renderPanel(); renderTabs()
  }
  function promptNewFile(dw = 1000, dh = 1000) {
    wrap.querySelectorAll('.ie-lib-ov').forEach(o => o.remove())   // never stack overlays
    return new Promise(resolve => {
      const ov = el('div', 'ie-lib-ov'), card = el('div', 'ie-lib-card'); card.style.maxWidth = '320px'
      card.appendChild(el('div', 'ie-sec-h', t('ie_new')))
      let mode = 'infinite'
      const seg = el('div'); seg.style.cssText = 'display:flex;gap:6px;margin-bottom:8px'
      const infB = el('button', 'ie-btn on', `<i class="fa-solid fa-expand"></i> ${t('ie_infinite')}`); infB.style.flex = '1'; infB.style.justifyContent = 'center'
      const dimB = el('button', 'ie-btn', `<i class="fa-solid fa-ruler-combined"></i> ${t('ie_fixed')}`); dimB.style.flex = '1'; dimB.style.justifyContent = 'center'
      seg.append(infB, dimB); card.appendChild(seg)
      const sizeWrap = el('div'); sizeWrap.style.display = 'none'
      const mk = (lab, val) => { const f = el('div', 'ie-field'); f.appendChild(el('label', null, lab)); const i = el('input', 'ie-num'); i.type = 'number'; i.min = 1; i.value = val; f.appendChild(i); sizeWrap.appendChild(f); return i }
      const wI = mk(t('ie_width'), dw), hI = mk(t('ie_height'), dh)
      const pre = el('div'); pre.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin:6px 0'
      ;[['1:1', 1000, 1000], ['1080p', 1920, 1080], ['4:5', 1080, 1350], ['Story', 1080, 1920]].forEach(([lab, w, h]) => { const b = el('button', 'ie-btn', lab); b.addEventListener('click', () => { wI.value = w; hI.value = h }); pre.appendChild(b) })
      sizeWrap.appendChild(pre); card.appendChild(sizeWrap)
      const setMode = m => { mode = m; infB.classList.toggle('on', m === 'infinite'); dimB.classList.toggle('on', m === 'fixed'); sizeWrap.style.display = m === 'fixed' ? 'block' : 'none' }
      infB.addEventListener('click', () => setMode('infinite')); dimB.addEventListener('click', () => setMode('fixed'))
      const acts = el('div'); acts.style.cssText = 'display:flex;gap:6px;margin-top:8px'
      const ok = el('button', 'ie-btn', `<i class="fa-solid fa-check"></i> ${t('ie_create')}`); ok.style.cssText = 'flex:1;justify-content:center'
      const ca = el('button', 'ie-btn', t('ie_crop_cancel')); ca.style.cssText = 'flex:1;justify-content:center'
      acts.append(ok, ca); card.appendChild(acts); ov.appendChild(card); wrap.appendChild(ov)
      let settled = false
      const done = v => { if (settled) return; settled = true; ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v) }
      const confirm = () => done(mode === 'infinite' ? { infinite: true } : { infinite: false, w: Math.max(1, Math.min(8000, parseInt(wI.value) || dw)), h: Math.max(1, Math.min(8000, parseInt(hI.value) || dh)) })
      const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); confirm() } else if (e.key === 'Escape') { e.preventDefault(); done(null) } }
      document.addEventListener('keydown', onKey, true)
      ok.addEventListener('click', confirm); ca.addEventListener('click', () => done(null))
      ov.addEventListener('mousedown', e => { if (e.target === ov) done(null) })
    })
  }
  function switchDoc(id) {
    const d = docs.find(x => x.id === id); if (!d) return
    wrap.querySelectorAll('.ie-lib-ov').forEach(o => o.remove())
    lassoPts = null; brushAnchor = null; eraserAnchor = null; brushLayer = null; eraserLayer = null; wandSel = null
    ;['#ie-la-del', '#ie-la-move', '#ie-la-x', '#ie-wa-del', '#ie-wa-move', '#ie-wa-x'].forEach(s => body.querySelector(s)?.remove())
    cur = d; if (regionMode) endRegion(); render(); renderPanel(); renderTabs()
  }
  function markDirty() { if (cur && !cur.dirty) { cur.dirty = true; renderTabs() } }
  // Undo / redo history (per document).
  const cloneLayer = L => {
    const c = { ...L, adj: L.adj ? { ...L.adj } : undefined }
    if (L.img instanceof HTMLCanvasElement) { const nc = document.createElement('canvas'); nc.width = L.img.width; nc.height = L.img.height; nc.getContext('2d', { willReadFrequently: true }).drawImage(L.img, 0, 0); c.img = nc }
    return c
  }
  const snap = () => ({ layers: cur.layers.map(cloneLayer), docW: cur.docW, docH: cur.docH, infinite: cur.infinite, sel: cur.sel })
  const applySnap = s => { cur.layers = s.layers.map(cloneLayer); cur.docW = s.docW; cur.docH = s.docH; cur.infinite = s.infinite; cur.sel = s.sel }
  function pushHistory() { if (!cur) return; cur.history.push(snap()); if (cur.history.length > 40) cur.history.shift(); cur.redo = [] }
  function undo() { if (!cur || !cur.history.length) return; cur.redo.push(snap()); applySnap(cur.history.pop()); markDirty(); render(); renderPanel() }
  function redo() { if (!cur || !cur.redo.length) return; cur.history.push(snap()); applySnap(cur.redo.pop()); markDirty(); render(); renderPanel() }
  // Whole-document region (for saving on close, non-interactive).
  const wholeRegion = d => d.infinite ? layersBounds(d) : (d.docW ? { x: 0, y: 0, w: d.docW, h: d.docH } : null)
  async function closeDoc(id) {
    const d = docs.find(x => x.id === id); if (!d) return
    if (d.dirty) {
      const choice = await confirmUnsaved({ title: t('ie_unsaved_title'), message: t('ie_unsaved_msg'), saveLabel: t('ie_save') }); if (choice === 'cancel') return
      if (choice === 'save') { const r = wholeRegion(d); if (r) { const ok = await saveRegion(d, r); if (!ok) return } }
    }
    docs = docs.filter(x => x.id !== d.id)
    if (!docs.length) { const nd = newDoc(); nd.infinite = true; addFill(nd, '#ffffff') }   // same shape as the initial doc
    if (cur === d || !docs.includes(cur)) cur = docs[docs.length - 1]
    render(); renderPanel(); renderTabs()
  }
  function renderTabs() {
    stateRev++
    tabsEl.innerHTML = ''
    docs.forEach(d => {
      const tab = el('div', 'ie-tab' + (d === cur ? ' sel' : ''))
      tab.innerHTML = (d.dirty ? '<span class="dot"></span>' : '') + '<span class="nm"></span><i class="fa-solid fa-xmark x"></i>'
      tab.querySelector('.nm').textContent = d.name
      tab.querySelector('.nm').addEventListener('click', () => switchDoc(d.id))
      tab.addEventListener('click', e => { if (!e.target.closest('.x')) switchDoc(d.id) })
      tab.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); closeDoc(d.id) })
      tabsEl.appendChild(tab)
    })
    const add = el('button', 'ie-tab-new', '<i class="fa-solid fa-plus"></i>'); add.title = t('ie_new')
    add.addEventListener('click', () => newFile())
    tabsEl.appendChild(add)
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function drawChecker(g, w, h) {
    const s = 12; g.save()
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { g.fillStyle = ((x / s + y / s) & 1) ? '#191920' : '#111116'; g.fillRect(x, y, s, s) }
    g.restore()
  }
  function drawLayerInto(g, L) {
    if (L.type === 'fill') { g.save(); g.globalAlpha = L.opacity; g.fillStyle = L.color || '#ffffff'; g.fillRect(-100000, -100000, 200000, 200000); g.restore(); return }
    g.save(); g.globalAlpha = L.opacity; g.filter = filterStr(L.adj)
    g.globalCompositeOperation = L.blend || 'source-over'
    const w = LW(L), h = LH(L), cx = L.x + w / 2, cy = L.y + h / 2
    g.translate(cx, cy); g.rotate(L.rot * Math.PI / 180); g.translate(-cx, -cy)
    g.drawImage(L.img, L.x, L.y, w, h); g.restore()
  }
  // Merge layer i down into layer i-1 (both baked with their own transform,
  // opacity, adjustments and blend mode into one flat image layer).
  function mergeDown(i) {
    const top = cur.layers[i], bot = cur.layers[i - 1]
    if (!top || !bot || top.type === 'fill' || bot.type === 'fill') return
    pushHistory()
    const corners = []
    for (const L of [bot, top]) {
      const w = LW(L), h = LH(L)
      ;[[L.x, L.y], [L.x + w, L.y], [L.x + w, L.y + h], [L.x, L.y + h]].forEach(([lx, ly]) => corners.push(toWorld(L, lx, ly)))
    }
    const minX = Math.floor(Math.min(...corners.map(c => c.x))), minY = Math.floor(Math.min(...corners.map(c => c.y)))
    const maxX = Math.ceil(Math.max(...corners.map(c => c.x))), maxY = Math.ceil(Math.max(...corners.map(c => c.y)))
    const oc = document.createElement('canvas'); oc.width = Math.max(1, maxX - minX); oc.height = Math.max(1, maxY - minY)
    const g = oc.getContext('2d', { willReadFrequently: true }); g.translate(-minX, -minY)
    drawLayerInto(g, bot); drawLayerInto(g, top)
    const merged = { id: uid(), type: 'image', name: bot.name, img: oc, x: minX, y: minY, sx: 1, sy: 1, rot: 0, opacity: 1, visible: true, adj: { b: 1, c: 1, s: 1, h: 0 } }
    cur.layers.splice(i - 1, 2, merged); cur.sel = merged.id
    markDirty(); render(); renderPanel()
  }
  // Flatten every visible layer (background fill included) into one image layer.
  function flattenDoc() {
    if (!cur) return
    const r = wholeRegion(cur); if (!r) return
    pushHistory()
    const oc = compositeRegion(cur, r)
    cur.layers = [{ id: uid(), type: 'image', name: t('ie_flatten'), img: oc, x: r.x, y: r.y, sx: 1, sy: 1, rot: 0, opacity: 1, visible: true, adj: { b: 1, c: 1, s: 1, h: 0 } }]
    cur.sel = cur.layers[0].id
    markDirty(); render(); renderPanel()
  }
  // rAF-coalesced: mutations call render() freely (every pointermove during a
  // stroke); at most one real repaint happens per frame.
  let renderRaf = null
  function render() {
    stateRev++
    if (renderRaf) return
    renderRaf = requestAnimationFrame(() => { renderRaf = null; renderNow() })
  }
  function renderNow() {
    const W = wrap.clientWidth || 1, H = wrap.clientHeight || 1
    // Resizing a canvas reallocates + clears its backing store — only do it
    // when the size actually changed (it used to happen on every repaint).
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
    if (!cur || (!cur.docW && !cur.infinite)) { empty.style.display = 'flex'; return }
    empty.style.display = 'none'
    const uv = cur.view || (cur.view = { zoom: 1, panX: 0, panY: 0 })
    if (cur.infinite) {
      // Infinite background: origin top-left, pannable/zoomable viewport.
      view = { scale: uv.zoom, ox: uv.panX, oy: uv.panY }
      ctx.save(); ctx.translate(view.ox, view.oy); ctx.scale(view.scale, view.scale)
      for (const L of cur.layers) if (L.visible) drawLayerInto(ctx, L)
      ctx.restore()
    } else {
      const scale = Math.min(W / cur.docW, H / cur.docH) * 0.92 * uv.zoom
      view = { scale, ox: (W - cur.docW * scale) / 2 + uv.panX, oy: (H - cur.docH * scale) / 2 + uv.panY }
      ctx.save(); ctx.translate(view.ox, view.oy); ctx.scale(scale, scale)
      drawChecker(ctx, cur.docW, cur.docH)
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cur.docW, cur.docH); ctx.clip()
      for (const L of cur.layers) if (L.visible) drawLayerInto(ctx, L)
      ctx.restore()
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1 / scale; ctx.strokeRect(0, 0, cur.docW, cur.docH)
      ctx.restore()
    }
    updateZoomLabel()
    const scale = view.scale
    if (wandSel && cur.layers.includes(wandSel.L)) {
      const wl = wandSel.L, w = LW(wl), h = LH(wl), cx = wl.x + w / 2, cy = wl.y + h / 2
      const scx = view.ox + cx * scale, scy = view.oy + cy * scale
      ctx.save(); ctx.translate(scx, scy); ctx.rotate((wl.rot || 0) * Math.PI / 180)
      ctx.drawImage(wandSel.tint, -w * scale / 2, -h * scale / 2, w * scale, h * scale)
      ctx.restore()
    }
    const L = layerById(cur.sel)
    if (L && L.type !== 'fill' && !regionMode && tool === 'move') {
      const w = LW(L), h = LH(L), cx = L.x + w / 2, cy = L.y + h / 2
      const accent = (getComputedStyle(document.documentElement).getPropertyValue('--color-active') || '#4a9eff').trim()
      const scx = view.ox + cx * scale, scy = view.oy + cy * scale
      // Selection outline: rotate the canvas around the layer's screen-space
      // center so the dashed box matches the rotated image underneath.
      ctx.save(); ctx.translate(scx, scy); ctx.rotate((L.rot || 0) * Math.PI / 180)
      ctx.strokeStyle = accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5
      ctx.strokeRect(-w * scale / 2, -h * scale / 2, w * scale, h * scale)
      ctx.restore()
      // Resize handles: same 8 corner/edge points, mapped through the rotation.
      ctx.save(); ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.strokeStyle = accent; ctx.lineWidth = 1.5
      const corners = [[L.x, L.y], [L.x + w / 2, L.y], [L.x + w, L.y], [L.x + w, L.y + h / 2], [L.x + w, L.y + h], [L.x + w / 2, L.y + h], [L.x, L.y + h], [L.x, L.y + h / 2]]
      for (const [lx, ly] of corners) {
        const wp = toWorld(L, lx, ly)
        const px = view.ox + wp.x * scale, py = view.oy + wp.y * scale
        ctx.beginPath(); ctx.rect(px - 4, py - 4, 8, 8); ctx.fill(); ctx.stroke()
      }
      ctx.restore()
    }
    if (regionMode && regionRect) {
      const r = normRect(regionRect)
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H)
      ctx.save(); ctx.beginPath(); ctx.rect(view.ox + r.x * scale, view.oy + r.y * scale, r.w * scale, r.h * scale); ctx.clip()
      ctx.translate(view.ox, view.oy); ctx.scale(scale, scale)
      for (const L2 of cur.layers) if (L2.visible) drawLayerInto(ctx, L2)
      ctx.restore()
      ctx.strokeStyle = '#fff'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5
      ctx.strokeRect(view.ox + r.x * scale, view.oy + r.y * scale, r.w * scale, r.h * scale); ctx.restore()
    }
    if (lassoPts && lassoPts.length) {
      const accent = (getComputedStyle(document.documentElement).getPropertyValue('--color-active') || '#4a9eff').trim()
      ctx.save(); ctx.strokeStyle = accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.beginPath()
      lassoPts.forEach((p, i) => { const sx = view.ox + p.x * scale, sy = view.oy + p.y * scale; i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy) })
      if (dragging !== 'lasso') ctx.closePath()
      ctx.stroke(); ctx.restore()
    }
    // Brush-size cursor preview (screen-space circle scaled by the view).
    if (hoverPt && ['brush', 'eraser', 'stamp'].includes(tool)) {
      const size = tool === 'brush' ? brushSize : tool === 'eraser' ? eraserSize : stampSize
      const r = Math.max(2, size / 2 * scale)
      ctx.save(); ctx.setLineDash([])
      ctx.beginPath(); ctx.arc(hoverPt.x, hoverPt.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2.5; ctx.stroke()
      ctx.beginPath(); ctx.arc(hoverPt.x, hoverPt.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.restore()
    }
  }

  // ── Loading images ─────────────────────────────────────────────────────────
  function addLayerImg(d, im, name) {
    const cw = d.infinite ? wrap.clientWidth : d.docW, ch = d.infinite ? wrap.clientHeight : d.docH
    const L = { id: uid(), type: 'image', name: name || (t('ie_layer') + ' ' + (d.layers.length + 1)), img: im, x: Math.round((cw - im.width) / 2), y: Math.round((ch - im.height) / 2), sx: 1, sy: 1, rot: 0, opacity: 1, visible: true, adj: { b: 1, c: 1, s: 1, h: 0 } }
    d.layers.push(L); d.sel = L.id
  }
  function place(src, name, asLayer) {
    const im = new Image()
    im.onload = () => {
      if (asLayer && cur && (cur.docW || cur.infinite)) { pushHistory(); addLayerImg(cur, im, name); markDirty() }
      else { const d = newDoc(name); d.docW = im.width; d.docH = im.height; addLayerImg(d, im, name); cur = d }
      switchDoc(cur.id)
    }
    im.onerror = () => window.toast?.(t('ie_load_fail'), 'error')
    im.src = src
  }
  function loadFile(f, asLayer) { if (!f) return; const r = new FileReader(); r.onload = () => place(r.result, f.name.replace(/\.[^.]+$/, ''), asLayer); r.readAsDataURL(f) }

  // ── Effets locaux (photon-rs / imageproc / Real-ESRGAN) ────────────────────
  let fxBusy = false
  function layerPNG(L) {
    const oc = document.createElement('canvas')
    oc.width = L.img.width; oc.height = L.img.height
    oc.getContext('2d').drawImage(L.img, 0, 0)
    return oc.toDataURL('image/png').split(',')[1]
  }
  function replaceLayerImage(L, base64, keepFootprint) {
    return new Promise((resolve, reject) => {
      const im = new Image()
      im.onload = () => {
        if (keepFootprint) { L.sx = (L.sx || 1) * (L.img.width / im.width); L.sy = (L.sy || 1) * (L.img.height / im.height) }
        L.img = im; resolve()
      }
      im.onerror = reject
      im.src = 'data:image/png;base64,' + base64
    })
  }
  async function runFx(cmd, args, keepFootprint) {
    if (fxBusy || !window.__TAURI__) return
    const d = cur   // the doc the fx runs on — `cur` may change during the await (tab switch)
    const L = layerById(d && d.sel)
    if (!L || L.type !== 'image') { window.toast?.(t('ie_select_layer'), 'info', 1200); return }
    fxBusy = true
    try {
      pushHistory()
      const base64 = layerPNG(L)
      const result = await window.__TAURI__.core.invoke(cmd, { base64, ...args })
      await replaceLayerImage(L, result, keepFootprint)
      if (d === cur) { markDirty(); render(); renderPanel() } else d.dirty = true
    } catch (e) { console.error(e); d.history.pop(); window.toast?.(t('ie_fx_fail'), 'error') }
    finally { fxBusy = false }
  }
  const applyPhotonFilter    = filter => runFx('photon_filter', { filter }, false)
  const applyImageprocFilter = (filter, param) => runFx('imageproc_filter', { filter, param }, false)
  const upscaleLayer         = scale => runFx('upscale_image', { scale }, true)

  // ── Panel (layers + adjustments) ───────────────────────────────────────────
  function rng(label, val, min, max, step, fmt, on) {
    const f = el('div', 'ie-field'); f.appendChild(el('label', null, label))
    const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val
    const v = el('span', 'v', fmt(val))
    r.addEventListener('pointerdown', pushHistory)
    r.addEventListener('input', () => { const nv = parseFloat(r.value); v.textContent = fmt(nv); on(nv); markDirty() })
    f.append(r, v); return f
  }
  function secHead(labelKey, key) {
    const h = el('div', 'ie-sec-h ie-sec-tog')
    h.innerHTML = `<i class="fa-solid fa-chevron-${collapsed[key] ? 'right' : 'down'}"></i><span></span>`
    h.querySelector('span').textContent = t(labelKey)
    h.addEventListener('click', () => { collapsed[key] = !collapsed[key]; renderPanel() })
    return h
  }
  // Switching to Move while a lasso selection is still pending used to strand
  // it: the tool-panel button just flips `tool`, unlike the floating "Déplacer"
  // action (finalizeLasso) which actually lifts the traced pixels into a
  // draggable layer. Route through that same finalize step so both paths behave
  // the same and the selection can always be moved once Move is active.
  function setTool(id) {
    if (id === 'move' && lassoPts && lassoPts.length > 2) { finalizeLasso(); return }
    if (id === 'move' && wandSel) { finalizeWand(); return }
    tool = id; canvas.style.cursor = id === 'move' ? 'default' : 'crosshair'; renderPanel()
  }
  function renderPanel() {
    panel.innerHTML = ''
    // Tools (top)
    panel.appendChild(el('div', 'ie-sec-h', t('ie_tools')))
    const tb = el('div', 'ie-tools')
    const mk = (id, icon, lab) => { const b = el('button', 'ie-tbtn' + (tool === id ? ' on' : ''), `<i class="fa-solid ${icon}"></i><span></span>`); b.querySelector('span').textContent = t(lab); b.addEventListener('click', () => setTool(id)); return b }
    tb.appendChild(mk('brush', 'fa-paintbrush', 'ie_tool_brush'))
    if (tool === 'brush') {
      const bc = el('div', 'ie-brush-ctl')
      const cf = el('div', 'ie-field'); cf.appendChild(el('label', null, t('ie_color')))
      const ci = el('input'); ci.type = 'color'; ci.value = brushColor; ci.style.cssText = 'width:40px;height:24px;padding:0;border:1px solid var(--win-border,#2a2a2a);border-radius:5px;background:none;cursor:pointer'
      ci.addEventListener('input', () => { brushColor = ci.value })
      const pb = el('button'); pb.innerHTML = '<i class="fa-solid fa-palette" style="font-size:10px"></i>'; pb.style.cssText = 'width:24px;height:24px;border-radius:5px;border:1px solid var(--win-border,#2a2a2a);background:#1c1c20;color:#aaa;cursor:pointer;padding:0;flex-shrink:0'
      pb.addEventListener('click', () => showPalPicker(pb, c => { brushColor = c; ci.value = c }))
      cf.append(ci, pb); bc.appendChild(cf)
      const sf = el('div', 'ie-field'); sf.style.marginBottom = '0'; sf.appendChild(el('label', null, t('ie_size')))
      const sr = el('input'); sr.type = 'range'; sr.min = 1; sr.max = 120; sr.value = brushSize; sr.style.cssText = 'flex:1;min-width:0'
      const sv = el('span', 'v', Math.round(brushSize) + 'px')
      sr.addEventListener('input', () => { brushSize = +sr.value; sv.textContent = Math.round(brushSize) + 'px' })
      sf.append(sr, sv); bc.appendChild(sf); tb.appendChild(bc)
    }
    tb.appendChild(mk('eraser', 'fa-eraser', 'ie_tool_eraser'))
    if (tool === 'eraser') {
      const ec = el('div', 'ie-brush-ctl')
      const sf = el('div', 'ie-field'); sf.style.marginBottom = '0'; sf.appendChild(el('label', null, t('ie_size')))
      const sr = el('input'); sr.type = 'range'; sr.min = 1; sr.max = 200; sr.value = eraserSize; sr.style.cssText = 'flex:1;min-width:0'
      const sv = el('span', 'v', Math.round(eraserSize) + 'px')
      sr.addEventListener('input', () => { eraserSize = +sr.value; sv.textContent = Math.round(eraserSize) + 'px' })
      sf.append(sr, sv); ec.appendChild(sf); tb.appendChild(ec)
    }
    tb.appendChild(mk('stamp', 'fa-stamp', 'ie_tool_stamp'))
    if (tool === 'stamp') {
      const sc = el('div', 'ie-brush-ctl')
      const sf = el('div', 'ie-field'); sf.appendChild(el('label', null, t('ie_size')))
      const sr = el('input'); sr.type = 'range'; sr.min = 6; sr.max = 150; sr.value = stampSize; sr.style.cssText = 'flex:1;min-width:0'
      const sv = el('span', 'v', Math.round(stampSize) + 'px')
      sr.addEventListener('input', () => { stampSize = +sr.value; sv.textContent = Math.round(stampSize) + 'px' })
      sf.append(sr, sv); sc.appendChild(sf)
      const stf = el('div', 'ie-field'); stf.style.marginBottom = '0'; stf.appendChild(el('label', null, t('ie_strength')))
      const str = el('input'); str.type = 'range'; str.min = 5; str.max = 100; str.value = Math.round(stampStrength * 100); str.style.cssText = 'flex:1;min-width:0'
      const stv = el('span', 'v', Math.round(stampStrength * 100) + '%')
      str.addEventListener('input', () => { stampStrength = +str.value / 100; stv.textContent = str.value + '%' })
      stf.append(str, stv); sc.appendChild(stf); tb.appendChild(sc)
    }
    tb.appendChild(mk('move', 'fa-arrow-pointer', 'ie_tool_move'))
    tb.appendChild(mk('lasso', 'fa-draw-polygon', 'ie_tool_lasso'))
    tb.appendChild(mk('wand', 'fa-wand-magic', 'ie_tool_wand'))
    tb.appendChild(mk('bucket', 'fa-fill-drip', 'ie_tool_bucket'))
    if (tool === 'wand' || tool === 'bucket') {
      const wc = el('div', 'ie-brush-ctl')
      const sf = el('div', 'ie-field'); sf.style.marginBottom = tool === 'bucket' ? '6px' : '0'; sf.appendChild(el('label', null, t('ie_tolerance')))
      const sr = el('input'); sr.type = 'range'; sr.min = 0; sr.max = 128; sr.value = fillTolerance; sr.style.cssText = 'flex:1;min-width:0'
      const sv = el('span', 'v', String(Math.round(fillTolerance)))
      sr.addEventListener('input', () => { fillTolerance = +sr.value; sv.textContent = String(Math.round(fillTolerance)) })
      sf.append(sr, sv); wc.appendChild(sf)
      if (tool === 'bucket') {
        const cf = el('div', 'ie-field'); cf.style.marginBottom = '0'; cf.appendChild(el('label', null, t('ie_color')))
        const ci = el('input'); ci.type = 'color'; ci.value = brushColor; ci.style.cssText = 'width:40px;height:24px;padding:0;border:1px solid var(--win-border,#2a2a2a);border-radius:5px;background:none;cursor:pointer'
        ci.addEventListener('input', () => { brushColor = ci.value })
        cf.appendChild(ci); wc.appendChild(cf)
      }
      tb.appendChild(wc)
    }
    tb.appendChild(mk('text', 'fa-font', 'ie_tool_text'))
    tb.appendChild(mk('shape', 'fa-shapes', 'ie_tool_shape'))
    if (tool === 'shape') {
      const sc = el('div', 'ie-brush-ctl')
      const kf = el('div', 'ie-field'); kf.appendChild(el('label', null, t('ie_tool_shape')))
      const ks = el('select', 'ie-num')
      ;[['rect', t('ie_shape_rect')], ['ellipse', t('ie_shape_ellipse')], ['line', t('ie_shape_line')]].forEach(([v, lab]) => { const o = document.createElement('option'); o.value = v; o.textContent = lab; ks.appendChild(o) })
      ks.value = shapeKind; ks.addEventListener('change', () => { shapeKind = ks.value; renderPanel() })
      kf.appendChild(ks); sc.appendChild(kf)
      if (shapeKind !== 'line') {
        const ff = el('div', 'ie-field'); ff.appendChild(el('label', null, t('ie_fill_color')))
        const fi = el('input'); fi.type = 'color'; fi.value = shapeFill; fi.style.cssText = 'width:40px;height:24px;padding:0;border:1px solid var(--win-border,#2a2a2a);border-radius:5px;background:none;cursor:pointer'
        fi.addEventListener('input', () => { shapeFill = fi.value })
        ff.appendChild(fi); sc.appendChild(ff)
      }
      const stf = el('div', 'ie-field'); stf.appendChild(el('label', null, t('ie_stroke')))
      const sti = el('input'); sti.type = 'color'; sti.value = shapeStroke; sti.style.cssText = 'width:40px;height:24px;padding:0;border:1px solid var(--win-border,#2a2a2a);border-radius:5px;background:none;cursor:pointer'
      sti.addEventListener('input', () => { shapeStroke = sti.value })
      stf.appendChild(sti); sc.appendChild(stf)
      const swf = el('div', 'ie-field'); swf.style.marginBottom = '0'; swf.appendChild(el('label', null, t('ie_stroke_w')))
      const swr = el('input'); swr.type = 'range'; swr.min = 0; swr.max = 40; swr.value = shapeStrokeW; swr.style.cssText = 'flex:1;min-width:0'
      const swv = el('span', 'v', shapeStrokeW + 'px')
      swr.addEventListener('input', () => { shapeStrokeW = +swr.value; swv.textContent = shapeStrokeW + 'px' })
      swf.append(swr, swv); sc.appendChild(swf)
      tb.appendChild(sc)
    }
    panel.appendChild(tb)
    const spacer = el('div'); spacer.style.cssText = 'flex:1;min-height:10px'; panel.appendChild(spacer)
    // Layers + adjustments (bottom)
    panel.appendChild(secHead('ie_layers', 'layers'))
    const L0 = cur ? cur.layers : []
    if (!collapsed.layers) {
      if (!L0.length) panel.appendChild(el('div', 'ie-noadj', t('ie_empty')))
      for (let i = L0.length - 1; i >= 0; i--) {
        const L = L0[i]
        const row = el('div', 'ie-layer' + (L.id === cur.sel ? ' sel' : ''))
        const canMerge = i > 0 && L.type !== 'fill' && L0[i - 1].type !== 'fill'
        row.innerHTML = `<i class="fa-solid fa-${L.visible ? 'eye' : 'eye-slash'} act vis"></i><canvas class="ie-thumb" width="26" height="20"></canvas><span class="nm"></span>`
          + (canMerge ? `<i class="fa-solid fa-turn-down act mrg" title="${t('ie_merge_down')}"></i>` : '')
          + `<i class="fa-solid fa-clone act dup" title="${t('ie_duplicate')}"></i><i class="fa-solid fa-xmark act del"></i>`
        // Mini preview of the layer's content
        {
          const th = row.querySelector('.ie-thumb'), tg = th.getContext('2d')
          if (L.type === 'fill') { tg.fillStyle = L.color || '#ffffff'; tg.fillRect(0, 0, 26, 20) }
          else if (L.img) {
            const s = Math.min(26 / L.img.width, 20 / L.img.height)
            const w = Math.max(1, L.img.width * s), h = Math.max(1, L.img.height * s)
            try { tg.drawImage(L.img, (26 - w) / 2, (20 - h) / 2, w, h) } catch {}
          }
        }
        // Drag to reorder (replaces the old chevron pair)
        row.draggable = true
        row.addEventListener('dragstart', e2 => { dragLayerIdx = i; e2.dataTransfer.effectAllowed = 'move'; row.style.opacity = '.4' })
        row.addEventListener('dragend', () => { row.style.opacity = ''; dragLayerIdx = null })
        row.addEventListener('dragover', e2 => { e2.preventDefault() })
        row.addEventListener('drop', e2 => {
          e2.preventDefault()
          if (dragLayerIdx == null || dragLayerIdx === i) return
          pushHistory()
          const [m] = cur.layers.splice(dragLayerIdx, 1)
          cur.layers.splice(dragLayerIdx < i ? i - 1 : i, 0, m)
          dragLayerIdx = null
          markDirty(); render(); renderPanel()
        })
        row.querySelector('.mrg')?.addEventListener('click', e2 => { e2.stopPropagation(); mergeDown(i) })
        row.querySelector('.nm').textContent = L.name
        row.querySelector('.nm').addEventListener('click', () => { cur.sel = L.id; render(); renderPanel() })
        row.querySelector('.nm').addEventListener('dblclick', e => {
          e.stopPropagation()
          const nm = row.querySelector('.nm')
          const input = document.createElement('input')
          input.className = 'ie-layer-rename'; input.type = 'text'; input.value = L.name
          input.addEventListener('click', ev => ev.stopPropagation())
          input.addEventListener('keydown', ev => { if (ev.key === 'Enter') input.blur(); else if (ev.key === 'Escape') { input.value = L.name; input.blur() } })
          input.addEventListener('blur', () => {
            const v = input.value.trim()
            if (v && v !== L.name) { pushHistory(); L.name = v; markDirty() }
            renderPanel()
          })
          nm.replaceWith(input); input.focus(); input.select()
        })
        row.querySelector('.vis').addEventListener('click', e => { e.stopPropagation(); pushHistory(); L.visible = !L.visible; markDirty(); render(); renderPanel() })
        row.querySelector('.dup').addEventListener('click', e => {
          e.stopPropagation(); pushHistory()
          const copy = cloneLayer(L); copy.id = uid(); copy.name = L.name + ' ' + t('ie_copy_suffix'); copy.x = L.x + 14; copy.y = L.y + 14
          L0.splice(i + 1, 0, copy); cur.sel = copy.id
          markDirty(); render(); renderPanel()
        })
        row.querySelector('.del').addEventListener('click', e => { e.stopPropagation(); pushHistory(); L0.splice(i, 1); if (cur.sel === L.id) cur.sel = L0.length ? L0[L0.length - 1].id : null; markDirty(); render(); renderPanel() })
        panel.appendChild(row)
      }
      if (L0.filter(l => l.visible).length >= 2) {
        const fl = el('button', 'ie-btn', `<i class="fa-solid fa-layer-group"></i> ${t('ie_flatten')}`)
        fl.style.cssText = 'width:100%;justify-content:center;margin-top:6px'
        fl.addEventListener('click', flattenDoc)
        panel.appendChild(fl)
      }
    }
    panel.appendChild(secHead('ie_adjust', 'adjust'))
    if (collapsed.adjust) return
    const L = layerById(cur && cur.sel)
    if (!L) { panel.appendChild(el('div', 'ie-noadj', t('ie_select_layer'))); return }
    const box = el('div', 'ie-adjbox')   // all settings gathered in one block
    box.appendChild(rng(t('ie_opacity'), L.opacity, 0, 1, 0.01, v => Math.round(v * 100) + '%', v => { L.opacity = v; render() }))
    if (L.type === 'fill') {
      const cf = el('div', 'ie-field'); cf.appendChild(el('label', null, t('ie_color')))
      const ci = el('input'); ci.type = 'color'; ci.value = L.color || '#ffffff'; ci.style.cssText = 'width:40px;height:24px;padding:0;border:1px solid var(--win-border,#2a2a2a);border-radius:5px;background:none;cursor:pointer'
      ci.addEventListener('pointerdown', pushHistory)
      ci.addEventListener('input', () => { L.color = ci.value; markDirty(); render() })
      cf.appendChild(ci); box.appendChild(cf); panel.appendChild(box); return
    }
    // Blend mode (names are the canvas composite keywords — kept untranslated,
    // like every mainstream editor's mode list).
    {
      const bf = el('div', 'ie-field'); bf.appendChild(el('label', null, t('ie_blend')))
      const bs = el('select', 'ie-num')
      ;['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'].forEach(m => {
        const o = document.createElement('option'); o.value = m; o.textContent = m === 'source-over' ? 'normal' : m; bs.appendChild(o)
      })
      bs.value = L.blend || 'source-over'
      bs.addEventListener('change', () => { pushHistory(); L.blend = bs.value; markDirty(); render() })
      bf.appendChild(bs); box.appendChild(bf)
    }
    if (L.type === 'text') {
      const tf = el('div', 'ie-field'); tf.appendChild(el('label', null, t('ie_tool_text')))
      const ta = document.createElement('textarea'); ta.className = 'ie-num ie-text-input'; ta.rows = 2; ta.value = L.text || ''
      ta.addEventListener('focus', pushHistory, { once: true })
      ta.addEventListener('input', () => { L.text = ta.value; renderTextLayer(L); markDirty(); render() })
      tf.appendChild(ta); box.appendChild(tf)
      box.appendChild(rng(t('ie_size'), L.tsize || 64, 8, 300, 1, v => Math.round(v) + 'px', v => { L.tsize = v; renderTextLayer(L); render() }))
      const cf = el('div', 'ie-field'); cf.appendChild(el('label', null, t('ie_color')))
      const ci = el('input'); ci.type = 'color'; ci.value = L.tcolor || '#ffffff'; ci.style.cssText = 'width:40px;height:24px;padding:0;border:1px solid var(--win-border,#2a2a2a);border-radius:5px;background:none;cursor:pointer'
      ci.addEventListener('pointerdown', pushHistory)
      ci.addEventListener('input', () => { L.tcolor = ci.value; renderTextLayer(L); markDirty(); render() })
      const bBtn = el('button', 'ie-btn' + (L.tbold ? ' on' : ''), '<b>B</b>'); bBtn.style.cssText = 'width:28px;justify-content:center;padding:0'
      bBtn.addEventListener('click', () => { pushHistory(); L.tbold = !L.tbold; renderTextLayer(L); markDirty(); render(); renderPanel() })
      const iBtn = el('button', 'ie-btn' + (L.titalic ? ' on' : ''), '<i style="font-style:italic;font-family:serif">I</i>'); iBtn.style.cssText = 'width:28px;justify-content:center;padding:0'
      iBtn.addEventListener('click', () => { pushHistory(); L.titalic = !L.titalic; renderTextLayer(L); markDirty(); render(); renderPanel() })
      cf.append(ci, bBtn, iBtn); box.appendChild(cf)
      const ff = el('div', 'ie-field'); ff.appendChild(el('label', null, t('ie_font')))
      const fs = el('select', 'ie-num')
      ;['Segoe UI', 'Arial', 'Georgia', 'Impact', 'Courier New', 'Comic Sans MS', 'Times New Roman', 'Verdana'].forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; fs.appendChild(o) })
      fs.value = L.tfont || 'Segoe UI'
      fs.addEventListener('change', () => { pushHistory(); L.tfont = fs.value; renderTextLayer(L); markDirty(); render() })
      ff.appendChild(fs); box.appendChild(ff)
    }
    if (L.type === 'shape') {
      if (L.shape !== 'line') {
        const ff = el('div', 'ie-field'); ff.appendChild(el('label', null, t('ie_fill_color')))
        const fi = el('input'); fi.type = 'color'; fi.value = L.sfill || '#cccccc'; fi.style.cssText = 'width:40px;height:24px;padding:0;border:1px solid var(--win-border,#2a2a2a);border-radius:5px;background:none;cursor:pointer'
        fi.addEventListener('pointerdown', pushHistory)
        fi.addEventListener('input', () => { L.sfill = fi.value; renderShapeLayer(L); markDirty(); render() })
        ff.appendChild(fi); box.appendChild(ff)
      }
      const sf2 = el('div', 'ie-field'); sf2.appendChild(el('label', null, t('ie_stroke')))
      const si = el('input'); si.type = 'color'; si.value = L.sstroke || '#000000'; si.style.cssText = 'width:40px;height:24px;padding:0;border:1px solid var(--win-border,#2a2a2a);border-radius:5px;background:none;cursor:pointer'
      si.addEventListener('pointerdown', pushHistory)
      si.addEventListener('input', () => { L.sstroke = si.value; renderShapeLayer(L); markDirty(); render() })
      sf2.appendChild(si); box.appendChild(sf2)
      box.appendChild(rng(t('ie_stroke_w'), L.sstrokeW || 0, 0, 40, 1, v => Math.round(v) + 'px', v => { L.sstrokeW = v; renderShapeLayer(L); render() }))
    }
    box.appendChild(rng(t('ie_scale'), L.sx || 1, 0.05, 4, 0.01, v => Math.round(v * 100) + '%', v => { L.sx = v; L.sy = v; render() }))
    box.appendChild(rng(t('ie_rotation'), L.rot, -180, 180, 1, v => Math.round(v) + '°', v => { L.rot = v; render() }))
    box.appendChild(rng(t('ie_brightness'), L.adj.b, 0, 2, 0.01, v => Math.round(v * 100) + '%', v => { L.adj.b = v; render() }))
    box.appendChild(rng(t('ie_contrast'), L.adj.c, 0, 2, 0.01, v => Math.round(v * 100) + '%', v => { L.adj.c = v; render() }))
    box.appendChild(rng(t('ie_saturation'), L.adj.s, 0, 2, 0.01, v => Math.round(v * 100) + '%', v => { L.adj.s = v; render() }))
    box.appendChild(rng(t('ie_hue'), L.adj.h, -180, 180, 1, v => Math.round(v) + '°', v => { L.adj.h = v; render() }))
    const reset = el('button', 'ie-btn ie-reset', `<i class="fa-solid fa-rotate-left"></i> ${t('ie_reset')}`)
    reset.addEventListener('click', () => { pushHistory(); L.opacity = 1; L.sx = 1; L.sy = 1; L.rot = 0; L.adj = { b: 1, c: 1, s: 1, h: 0 }; markDirty(); render(); renderPanel() })
    box.appendChild(reset); panel.appendChild(box)

    // Effets locaux (destructifs, "cuits" dans le calque source) : filtres photon-rs,
    // filtres imageproc, et amélioration IA via Real-ESRGAN (si le sidecar est présent).
    if (window.__TAURI__) {
      panel.appendChild(secHead('ie_effects', 'effects'))
      if (!collapsed.effects) {
        const fx = el('div', 'ie-adjbox')
        const fxBtn = (icon, labKey, run) => {
          const b = el('button', 'ie-btn', `<i class="fa-solid ${icon}"></i> ${t(labKey)}`)
          b.style.cssText = 'flex:1;min-width:calc(50% - 3px);justify-content:center;font-size:10px;padding:0 6px'
          b.addEventListener('click', run)
          return b
        }
        const fxRow = el('div'); fxRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px'
        fxRow.append(
          fxBtn('fa-droplet-slash',        'ie_fx_grayscale', () => applyPhotonFilter('grayscale')),
          fxBtn('fa-swatchbook',           'ie_fx_sepia',      () => applyPhotonFilter('sepia')),
          fxBtn('fa-icicles',              'ie_fx_sharpen',    () => applyPhotonFilter('sharpen')),
          fxBtn('fa-border-all',           'ie_fx_edges',      () => applyPhotonFilter('edges')),
          fxBtn('fa-water',                'ie_fx_blur',       () => applyImageprocFilter('blur', 4)),
          fxBtn('fa-draw-polygon',         'ie_fx_canny',      () => applyImageprocFilter('canny', 50)),
        )
        fx.appendChild(fxRow)
        fx.appendChild(el('label', null, t('ie_fx_upscale')))
        const upRow = el('div'); upRow.style.cssText = 'display:flex;gap:5px;margin-top:5px'
        ;[2, 3, 4].forEach(s => {
          const b = el('button', 'ie-btn', `<i class="fa-solid fa-wand-magic-sparkles"></i> x${s}`)
          b.style.cssText = 'flex:1;justify-content:center;font-size:10px'
          b.addEventListener('click', () => upscaleLayer(s))
          upRow.appendChild(b)
        })
        fx.appendChild(upRow)
        panel.appendChild(fx)
      }
    }
  }

  // ── Zoom / pan ─────────────────────────────────────────────────────────────
  function updateZoomLabel() {
    const lbl = body.querySelector('#ie-zoom-lbl')
    if (lbl) lbl.textContent = Math.round((view.scale || 1) * 100) + '%'
  }
  // Change zoom while keeping the document point under (clientX, clientY) fixed.
  function setZoomAt(clientX, clientY, nz) {
    if (!cur) return
    const uv = cur.view || (cur.view = { zoom: 1, panX: 0, panY: 0 })
    const r = canvas.getBoundingClientRect()
    const mx = clientX - r.left, my = clientY - r.top
    const p = { x: (mx - view.ox) / view.scale, y: (my - view.oy) / view.scale }
    uv.zoom = nz
    const W = wrap.clientWidth || 1, H = wrap.clientHeight || 1
    if (cur.infinite) {
      uv.panX = mx - p.x * nz
      uv.panY = my - p.y * nz
    } else {
      const scale = Math.min(W / cur.docW, H / cur.docH) * 0.92 * nz
      uv.panX = mx - p.x * scale - (W - cur.docW * scale) / 2
      uv.panY = my - p.y * scale - (H - cur.docH * scale) / 2
    }
    render()
  }
  const zoomStep = dir => {
    if (!cur) return
    const uv = cur.view || (cur.view = { zoom: 1, panX: 0, panY: 0 })
    const r = canvas.getBoundingClientRect()
    setZoomAt(r.left + r.width / 2, r.top + r.height / 2, Math.max(0.08, Math.min(16, uv.zoom * (dir > 0 ? 1.25 : 0.8))))
  }
  wrap.addEventListener('wheel', e => {
    if (!cur || (!cur.docW && !cur.infinite)) return
    e.preventDefault()
    const uv = cur.view || (cur.view = { zoom: 1, panX: 0, panY: 0 })
    const nz = Math.max(0.08, Math.min(16, uv.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
    setZoomAt(e.clientX, e.clientY, nz)
  }, { passive: false })
  body.querySelector('#ie-zoom-in').addEventListener('click', () => zoomStep(1))
  body.querySelector('#ie-zoom-out').addEventListener('click', () => zoomStep(-1))
  body.querySelector('#ie-zoom-fit').addEventListener('click', () => { if (cur) { cur.view = { zoom: 1, panX: 0, panY: 0 }; render() } })
  body.querySelector('#ie-zoom-lbl').addEventListener('click', () => {
    // Jump to true 100% (1 document pixel = 1 screen pixel).
    if (!cur) return
    const W = wrap.clientWidth || 1, H = wrap.clientHeight || 1
    const base = cur.infinite ? 1 : Math.min(W / cur.docW, H / cur.docH) * 0.92
    const r = canvas.getBoundingClientRect()
    setZoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / base)
  })
  body.querySelector('#ie-undo').addEventListener('click', () => undo())
  body.querySelector('#ie-redo').addEventListener('click', () => redo())

  // ── Pointer interactions ───────────────────────────────────────────────────
  let panStart = null
  const toDoc = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale } }
  // Point is in world/document space; project it into the layer's own
  // (unrotated) frame before testing the axis-aligned box — otherwise a
  // rotated layer can only be hit where its *unrotated* bounds used to be.
  const hit = (L, p) => { const w = LW(L), h = LH(L); const lp = toLocal(L, p.x, p.y); return lp.x >= L.x && lp.x <= L.x + w && lp.y >= L.y && lp.y <= L.y + h }
  function handleAt(L, e) {
    const r = canvas.getBoundingClientRect(), s = view.scale
    const w = LW(L), h = LH(L)
    const local = { nw: [L.x, L.y], n: [L.x + w / 2, L.y], ne: [L.x + w, L.y], e: [L.x + w, L.y + h / 2], se: [L.x + w, L.y + h], s: [L.x + w / 2, L.y + h], sw: [L.x, L.y + h], w: [L.x, L.y + h / 2] }
    const mx = e.clientX - r.left, my = e.clientY - r.top
    for (const k in local) {
      const wp = toWorld(L, local[k][0], local[k][1])
      const sx = view.ox + wp.x * s, sy = view.oy + wp.y * s
      if (Math.hypot(mx - sx, my - sy) < 10) return k
    }
    return null
  }
  function startResize(L, h) {
    const W = LW(L), H = LH(L)
    const hx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0, hy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0
    rz = { w0: L.img.width, h0: L.img.height, sx0: L.sx || 1, sy0: L.sy || 1, x0: L.x, y0: L.y, hx, hy, ax: hx === -1 ? L.x + W : L.x, ay: hy === -1 ? L.y + H : L.y }
  }
  canvas.addEventListener('pointerdown', e => {
    if (!cur || (!cur.docW && !cur.infinite)) return
    if (e.button === 1) {   // middle-drag = pan (any tool)
      e.preventDefault()
      const uv = cur.view || (cur.view = { zoom: 1, panX: 0, panY: 0 })
      panStart = { x: e.clientX, y: e.clientY, px: uv.panX, py: uv.panY }
      dragging = 'pan'; canvas.style.cursor = 'grabbing'
      try { canvas.setPointerCapture(e.pointerId) } catch {}
      return
    }
    if (e.button !== 0) return
    const p = toDoc(e)
    if (regionMode) { regionStart = p; regionRect = { x: p.x, y: p.y, w: 0, h: 0 }; dragging = 'region'; return }
    if (tool === 'brush') { startBrush(p, e); try { canvas.setPointerCapture(e.pointerId) } catch {} return }
    if (tool === 'eraser') { startEraser(p, e); try { canvas.setPointerCapture(e.pointerId) } catch {} return }
    if (tool === 'lasso') { clearLasso(); lassoPts = [p]; dragging = 'lasso'; try { canvas.setPointerCapture(e.pointerId) } catch {} return }
    if (tool === 'stamp') {
      if (!layerById(cur.sel) || layerById(cur.sel).type === 'fill') { window.toast?.(t('ie_select_layer'), 'info', 1200); return }
      startStamp(p); try { canvas.setPointerCapture(e.pointerId) } catch {} return
    }
    if (tool === 'text') {
      pushHistory()
      const L = { id: uid(), type: 'text', name: t('ie_tool_text'), text: t('ie_text_default'), tsize: 64, tcolor: brushColor, tfont: 'Segoe UI', tbold: false, titalic: false, x: Math.round(p.x), y: Math.round(p.y), sx: 1, sy: 1, rot: 0, opacity: 1, visible: true, adj: { b: 1, c: 1, s: 1, h: 0 } }
      renderTextLayer(L)
      cur.layers.push(L); cur.sel = L.id
      markDirty(); setTool('move'); render(); renderPanel()
      setTimeout(() => { const inp = panel.querySelector('.ie-text-input'); if (inp) { inp.focus(); inp.select() } }, 0)
      return
    }
    if (tool === 'shape') {
      pushHistory()
      const L = { id: uid(), type: 'shape', name: t('ie_tool_shape'), shape: shapeKind, sfill: shapeFill, sstroke: shapeStroke, sstrokeW: shapeStrokeW, sflipX: false, sflipY: false, x: Math.round(p.x), y: Math.round(p.y), sx: 1, sy: 1, rot: 0, opacity: 1, visible: true, adj: { b: 1, c: 1, s: 1, h: 0 } }
      renderShapeLayer(L, 1, 1)
      L.x = Math.round(p.x) - L.spad; L.y = Math.round(p.y) - L.spad
      cur.layers.push(L); cur.sel = L.id
      shapeStart = p; dragging = 'shape-create'
      try { canvas.setPointerCapture(e.pointerId) } catch {}
      markDirty(); render(); renderPanel()
      return
    }
    if (tool === 'wand') {
      clearWand()
      const L = layerById(cur.sel)
      if (!L || L.type === 'fill') { window.toast?.(t('ie_select_layer'), 'info', 1200); return }
      {
        const lpx = worldToLayerPixel(L, p.x, p.y)
        const res = floodFillMask(L, lpx.x, lpx.y, fillTolerance)
        if (res) {
          const accent = (getComputedStyle(document.documentElement).getPropertyValue('--color-active') || '#4a9eff').trim()
          wandSel = { L, mask: res.mask, w: res.w, h: res.h, bbox: res.bbox, tint: maskToTintCanvas(res.mask, res.w, res.h, hexToRgb(accent), 140) }
          render(); showWandActions()
        }
      }
      return
    }
    if (tool === 'bucket') {
      const L = layerById(cur.sel)
      if (!L || L.type === 'fill') { window.toast?.(t('ie_select_layer'), 'info', 1200); return }
      {
        const lpx = worldToLayerPixel(L, p.x, p.y)
        const res = floodFillMask(L, lpx.x, lpx.y, fillTolerance)
        if (res) {
          pushHistory()
          const g = L.img.getContext('2d')
          const id = g.getImageData(0, 0, L.img.width, L.img.height)
          const rgb = hexToRgb(brushColor)
          for (let i = 0; i < res.mask.length; i++) if (res.mask[i]) { const o = i * 4; id.data[o] = rgb.r; id.data[o + 1] = rgb.g; id.data[o + 2] = rgb.b; id.data[o + 3] = 255 }
          g.putImageData(id, 0, 0)
          markDirty(); render()
        }
      }
      return
    }
    const s = layerById(cur.sel)
    if (s && s.type !== 'fill') { const h = handleAt(s, e); if (h) { startResize(s, h); dragging = 'resize'; gpush = true; try { canvas.setPointerCapture(e.pointerId) } catch {} return } }
    for (let i = cur.layers.length - 1; i >= 0; i--) { const L = cur.layers[i]; if (L.visible && L.type !== 'fill' && hit(L, p)) { cur.sel = L.id; dragging = 'move'; gpush = true; dragOff = { x: p.x - L.x, y: p.y - L.y }; try { canvas.setPointerCapture(e.pointerId) } catch {} render(); renderPanel(); return } }
    cur.sel = null; render(); renderPanel()
  })
  const onPointerMove = e => {
    if (!dragging) return
    if (dragging === 'pan') {
      const uv = cur && cur.view; if (!uv) return
      uv.panX = panStart.px + (e.clientX - panStart.x)
      uv.panY = panStart.py + (e.clientY - panStart.y)
      render(); return
    }
    const p = toDoc(e)
    if (dragging === 'region') { regionRect.w = p.x - regionStart.x; regionRect.h = p.y - regionStart.y; render() }
    else if (dragging === 'shape-create') {
      const L = layerById(cur && cur.sel); if (!L || L.type !== 'shape') return
      L.sflipX = p.x < shapeStart.x; L.sflipY = p.y < shapeStart.y
      renderShapeLayer(L, Math.abs(p.x - shapeStart.x), Math.abs(p.y - shapeStart.y))
      L.x = Math.round(Math.min(shapeStart.x, p.x)) - L.spad
      L.y = Math.round(Math.min(shapeStart.y, p.y)) - L.spad
      markDirty(); render()
    }
    else if (dragging === 'brush') { drawBrushSeg(brushLayer, brushLast, p); brushLast = p; markDirty(); render() }
    else if (dragging === 'eraser') { drawEraserSeg(eraserLayer, eraserLast, p); eraserLast = p; markDirty(); render() }
    else if (dragging === 'lasso') { lassoPts.push(p); render() }
    else if (dragging === 'stamp') { drawStampSeg(stampLayer, stampLast, p); stampLast = p; markDirty(); render() }
    else if (dragging === 'move') { const L = layerById(cur.sel); if (L) { if (gpush) { pushHistory(); gpush = false } L.x = Math.round(p.x - dragOff.x); L.y = Math.round(p.y - dragOff.y); markDirty(); render() } }
    else if (dragging === 'resize') {
      const L = layerById(cur.sel); if (!L) return
      if (gpush) { pushHistory(); gpush = false }
      const lp = toLocal(L, p.x, p.y)   // project into the layer's unrotated frame first
      let sxN = rz.sx0, syN = rz.sy0
      if (rz.hx) sxN = Math.max(0.02, Math.abs(lp.x - rz.ax) / rz.w0)
      if (rz.hy) syN = Math.max(0.02, Math.abs(lp.y - rz.ay) / rz.h0)
      if (e.shiftKey) {   // keep proportions
        if (rz.hx && rz.hy) { const s = Math.max(sxN, syN); sxN = s; syN = s }
        else if (rz.hx) syN = sxN * (rz.sy0 / rz.sx0 || 1)
        else if (rz.hy) sxN = syN * (rz.sx0 / rz.sy0 || 1)
      }
      L.sx = sxN; L.sy = syN
      const W2 = rz.w0 * sxN, H2 = rz.h0 * syN
      L.x = Math.round(rz.hx === -1 ? rz.ax - W2 : rz.hx === 1 ? rz.ax : rz.x0)
      L.y = Math.round(rz.hy === -1 ? rz.ay - H2 : rz.hy === 1 ? rz.ay : rz.y0)
      markDirty(); render()
    }
  }
  window.addEventListener('pointermove', onPointerMove)
  // Hover position for the brush-size cursor preview.
  canvas.addEventListener('pointermove', e => {
    if (!['brush', 'eraser', 'stamp'].includes(tool)) { if (hoverPt) { hoverPt = null; render() } return }
    const r = canvas.getBoundingClientRect()
    hoverPt = { x: e.clientX - r.left, y: e.clientY - r.top }
    render()
  })
  canvas.addEventListener('pointerleave', () => { if (hoverPt) { hoverPt = null; render() } })
  // Double-click a text layer (Move tool) → jump to its text box in the panel.
  canvas.addEventListener('dblclick', e => {
    if (tool !== 'move' || !cur) return
    const p = toDoc(e)
    for (let i = cur.layers.length - 1; i >= 0; i--) {
      const L = cur.layers[i]
      if (L.visible && L.type === 'text' && hit(L, p)) {
        cur.sel = L.id; render(); renderPanel()
        const inp = panel.querySelector('.ie-text-input'); if (inp) { inp.focus(); inp.select() }
        return
      }
    }
  })
  const endDrag = () => {
    if (dragging === 'pan') canvas.style.cursor = tool === 'move' ? 'default' : 'crosshair'
    if (dragging === 'shape-create') renderPanel()
    if (dragging === 'lasso') { if (lassoPts && lassoPts.length > 2) showLassoActions(); else { lassoPts = null; render() } }
    if (dragging === 'brush') { brushAnchor = brushLast; renderPanel() }
    if (dragging === 'eraser') { eraserAnchor = eraserLast; renderPanel() }
    if (dragging === 'resize' || dragging === 'move') renderPanel()
    dragging = null; gpush = false
  }
  window.addEventListener('pointerup', endDrag)
  let dragCtr = 0
  const showDropOv = () => { if (!wrap.querySelector('#ie-drop-ov')) { const ov = el('div', 'ie-drop-ov', '<i class="fa-solid fa-file-image"></i>'); ov.id = 'ie-drop-ov'; wrap.appendChild(ov) } }
  const hideDropOv = () => { dragCtr = 0; wrap.querySelector('#ie-drop-ov')?.remove() }
  // HTML5 drag-drop (browser / web context)
  wrap.addEventListener('dragenter', e => { if (!e.dataTransfer?.types.includes('Files')) return; e.preventDefault(); dragCtr++; showDropOv() })
  wrap.addEventListener('dragleave', () => { dragCtr = Math.max(0, dragCtr - 1); if (!dragCtr) wrap.querySelector('#ie-drop-ov')?.remove() })
  wrap.addEventListener('dragover', e => e.preventDefault())
  wrap.addEventListener('drop', e => { e.preventDefault(); hideDropOv(); const f = e.dataTransfer?.files?.[0]; if (f && f.type.startsWith('image/')) loadFile(f, !!(cur && (cur.docW || cur.infinite))) })
  // Open a dropped path: images → layer (or new doc), .iceimg → project tab.
  // Shared by the Tauri OS drag-drop below and the library drag protocol.
  async function dropImg(path) {
    if (!window.__TAURI__) return
    const ext = (path.split('.').pop() || '').toLowerCase()
    if (ext === 'iceimg') { openProjectPath(path); return }
    if (!['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg'
      const name = path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
      place('data:' + mime + ';base64,' + b64, name, !!(cur && (cur.docW || cur.infinite)))
    } catch { window.toast?.(t('ie_load_fail'), 'error') }
  }
  // Tauri OS drag-drop (WebView2 intercepts before HTML5 events fire)
  const tauriUnlistens = []
  if (window.__TAURI__) {
    ;(async () => {
      try {
        // Tauri v2: try the webview onDragDropEvent API first (most reliable)
        const wv = window.__TAURI__.webview?.getCurrentWebview?.()
        if (wv?.onDragDropEvent) {
          const unlisten = await wv.onDragDropEvent(e => {
            if (!document.contains(body)) return
            const { type, paths } = e.payload || {}
            if (type === 'enter' || type === 'over') showDropOv()
            else if (type === 'leave') hideDropOv()
            else if (type === 'drop') { hideDropOv(); if (paths?.length) dropImg(paths[0]) }
          })
          tauriUnlistens.push(unlisten)
        } else if (window.__TAURI__.event?.listen) {
          // Fallback: raw tauri:// events
          tauriUnlistens.push(
            await window.__TAURI__.event.listen('tauri://drag-enter', () => { if (document.contains(body)) showDropOv() }),
            await window.__TAURI__.event.listen('tauri://drag-leave', () => { if (document.contains(body)) hideDropOv() }),
            await window.__TAURI__.event.listen('tauri://drag-drop', async e => {
              if (!document.contains(body)) return
              hideDropOv()
              const paths = e.payload?.paths || []
              if (paths.length) await dropImg(paths[0])
            })
          )
        }
      } catch {}
    })()
  }

  // ── Brush ────────────────────────────────────────────────────────────────
  function newPaintLayer() {
    const w = Math.max(1, cur.infinite ? Math.max(wrap.clientWidth, 1000) : cur.docW)
    const h = Math.max(1, cur.infinite ? Math.max(wrap.clientHeight, 1000) : cur.docH)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d', { willReadFrequently: true })
    const L = { id: uid(), type: 'paint', name: t('ie_drawing'), img: c, x: 0, y: 0, sx: 1, sy: 1, rot: 0, opacity: 1, visible: true, adj: { b: 1, c: 1, s: 1, h: 0 } }
    cur.layers.push(L); cur.sel = L.id; return L
  }
  function drawBrushSeg(L, a, b) {
    if (!L) return
    const g = L.img.getContext('2d')
    const kx = L.sx || 1, ky = L.sy || 1
    // World → the layer's own unrotated pixel space (same fix as erasePoly):
    // painting on a rotated layer must land where the cursor visually is.
    const la = toLocal(L, a.x, a.y), lb = toLocal(L, b.x, b.y)
    g.strokeStyle = brushColor; g.lineWidth = brushSize / ((kx + ky) / 2); g.lineCap = 'round'; g.lineJoin = 'round'
    g.beginPath(); g.moveTo((la.x - L.x) / kx, (la.y - L.y) / ky); g.lineTo((lb.x - L.x) / kx, (lb.y - L.y) / ky); g.stroke()
  }
  function straightModHeld(e) {
    const b = getShortcut('ie-draw-straight'); if (!b) return false
    const pts = b.toLowerCase().split('+')
    return e.shiftKey === pts.includes('shift') && e.ctrlKey === pts.includes('ctrl') && e.altKey === pts.includes('alt')
  }
  function startBrush(p, e) {
    let L = layerById(cur.sel)
    if (!L || L.type !== 'paint') L = newPaintLayer()
    const straight = e && straightModHeld(e) && brushAnchor && brushLayer === L
    pushHistory()
    brushLayer = L; brushLast = p; dragging = 'brush'
    if (straight) drawBrushSeg(L, brushAnchor, p)
    else drawBrushSeg(L, p, p)
    markDirty(); render(); renderPanel()
  }
  function drawEraserSeg(L, a, b) {
    if (!L) return
    const g = L.img.getContext('2d')
    const kx = L.sx || 1, ky = L.sy || 1
    const la = toLocal(L, a.x, a.y), lb = toLocal(L, b.x, b.y)   // rotation-aware
    g.save()
    g.globalCompositeOperation = 'destination-out'
    g.globalAlpha = 1
    g.strokeStyle = '#000'
    g.lineWidth = eraserSize / ((kx + ky) / 2)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo((la.x - L.x) / kx, (la.y - L.y) / ky)
    g.lineTo((lb.x - L.x) / kx, (lb.y - L.y) / ky)
    g.stroke()
    g.restore()
  }
  function startEraser(p, e) {
    const L = layerById(cur.sel)
    if (!L || L.type === 'fill') return
    ensureCanvasLayer(L)
    const straight = e && straightModHeld(e) && eraserAnchor && eraserLayer === L
    pushHistory()
    eraserLayer = L; eraserLast = p; dragging = 'eraser'
    if (straight) drawEraserSeg(L, eraserAnchor, p)
    else drawEraserSeg(L, p, p)
    markDirty(); render()
  }

  // ── Lasso selection: trace around content → lift it into a movable layer ────
  const polyBounds = pts => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of pts) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y) } return { x: Math.round(a), y: Math.round(b), w: Math.round(c - a), h: Math.round(d - b) } }
  function clearLasso() { ;['#ie-la-del', '#ie-la-move', '#ie-la-x'].forEach(s => body.querySelector(s)?.remove()); lassoPts = null; render() }
  function ensureCanvasLayer(L) { if (L.img instanceof HTMLCanvasElement) return; const c = document.createElement('canvas'); c.width = L.img.width; c.height = L.img.height; c.getContext('2d', { willReadFrequently: true }).drawImage(L.img, 0, 0); L.img = c }
  function erasePoly(L, pts) {
    ensureCanvasLayer(L); const g = L.img.getContext('2d'), kx = L.sx || 1, ky = L.sy || 1
    g.save(); g.globalCompositeOperation = 'destination-out'
    // Project each world-space lasso point into the layer's own unrotated
    // pixel space first — otherwise erasing from a rotated layer cuts the
    // wrong spot (same class of bug as the old rotation-unaware hit-test).
    g.beginPath(); pts.forEach((p, i) => { const lp = toLocal(L, p.x, p.y); const x = (lp.x - L.x) / kx, y = (lp.y - L.y) / ky; i ? g.lineTo(x, y) : g.moveTo(x, y) }); g.closePath(); g.fill(); g.restore()
  }
  // On release: cut the traced region out of the content layers into a new layer,
  // select it and switch to Move so it can be dragged straight away.
  function removeLassoBar() { ;['#ie-la-del', '#ie-la-move', '#ie-la-x'].forEach(s => body.querySelector(s)?.remove()) }
  function finalizeLasso() {
    removeLassoBar()
    if (!lassoPts || lassoPts.length < 3) { clearLasso(); return }
    const bb = polyBounds(lassoPts); if (bb.w < 3 || bb.h < 3) { clearLasso(); return }
    pushHistory()
    const oc = document.createElement('canvas'); oc.width = bb.w; oc.height = bb.h; const g = oc.getContext('2d')
    g.save(); g.beginPath(); lassoPts.forEach((p, i) => { const x = p.x - bb.x, y = p.y - bb.y; i ? g.lineTo(x, y) : g.moveTo(x, y) }); g.closePath(); g.clip()
    g.translate(-bb.x, -bb.y)
    for (const L of cur.layers) if (L.visible && L.type !== 'fill') drawLayerInto(g, L)
    g.restore()
    for (const L of [...cur.layers]) if (L.visible && L.type !== 'fill') erasePoly(L, lassoPts)
    cur.layers.push({ id: uid(), type: 'image', name: t('ie_selection'), img: oc, x: bb.x, y: bb.y, sx: 1, sy: 1, rot: 0, opacity: 1, visible: true, adj: { b: 1, c: 1, s: 1, h: 0 } })
    cur.sel = cur.layers[cur.layers.length - 1].id
    markDirty(); lassoPts = null; setTool('move'); render(); renderPanel()
  }
  function deleteLassoRegion() {
    removeLassoBar()
    if (!lassoPts || lassoPts.length < 3) { clearLasso(); return }
    pushHistory()
    for (const L of [...cur.layers]) if (L.visible && L.type !== 'fill') erasePoly(L, lassoPts)
    markDirty(); lassoPts = null; render(); renderPanel()
  }
  function showLassoActions() {
    const bb = polyBounds(lassoPts); if (!bb || bb.w < 3 || bb.h < 3) { clearLasso(); return }
    render()
    const bar = body.querySelector('.ie-bar')
    removeLassoBar()
    const delBtn = el('button', 'ie-btn', `<i class="fa-solid fa-trash"></i> ${t('ie_lasso_delete')}`); delBtn.id = 'ie-la-del'
    const moveBtn = el('button', 'ie-btn', `<i class="fa-solid fa-up-down-left-right"></i> ${t('ie_lasso_move')}`); moveBtn.id = 'ie-la-move'
    const cancelBtn = el('button', 'ie-btn', `<i class="fa-solid fa-xmark"></i> ${t('ie_crop_cancel')}`); cancelBtn.id = 'ie-la-x'
    delBtn.addEventListener('click', deleteLassoRegion)
    moveBtn.addEventListener('click', finalizeLasso)
    cancelBtn.addEventListener('click', () => clearLasso())
    bar.append(delBtn, moveBtn, cancelBtn)
  }

  // ── Magic wand: click → flood-fill a mask by colour similarity, then the
  // same Delete/Move/Cancel flow as the lasso, but over a raster mask instead
  // of a polygon (handles disjoint / non-convex regions the lasso can't).
  function removeWandBar() { ;['#ie-wa-del', '#ie-wa-move', '#ie-wa-x'].forEach(s => body.querySelector(s)?.remove()) }
  function clearWand() { removeWandBar(); wandSel = null; render() }
  function eraseMask(L, mask) {
    ensureCanvasLayer(L)
    const g = L.img.getContext('2d')
    const id = g.getImageData(0, 0, L.img.width, L.img.height)
    for (let i = 0; i < mask.length; i++) if (mask[i]) id.data[i * 4 + 3] = 0
    g.putImageData(id, 0, 0)
  }
  function finalizeWand() {
    removeWandBar()
    if (!wandSel) return
    const { L, mask, w: mw, bbox } = wandSel
    if (bbox.w < 1 || bbox.h < 1) { clearWand(); return }
    pushHistory()
    ensureCanvasLayer(L)
    const src = L.img.getContext('2d').getImageData(0, 0, L.img.width, L.img.height)
    const out = document.createElement('canvas'); out.width = bbox.w; out.height = bbox.h
    const og = out.getContext('2d'), oid = og.createImageData(bbox.w, bbox.h)
    for (let y = 0; y < bbox.h; y++) for (let x = 0; x < bbox.w; x++) {
      const sxp = bbox.x + x, syp = bbox.y + y, mi = syp * mw + sxp
      if (!mask[mi]) continue
      const si = mi * 4, di = (y * bbox.w + x) * 4
      oid.data[di] = src.data[si]; oid.data[di + 1] = src.data[si + 1]; oid.data[di + 2] = src.data[si + 2]; oid.data[di + 3] = src.data[si + 3]
    }
    og.putImageData(oid, 0, 0)
    eraseMask(L, mask)
    // Place the extracted piece by rotating just its centre through the source
    // layer's transform, then sizing the new (unrotated-local) layer around
    // that point — keeps it visually exactly where it was lifted from even if
    // the source layer is rotated.
    const kx = L.sx || 1, ky = L.sy || 1
    const newW = bbox.w * kx, newH = bbox.h * ky
    const localCx = L.x + (bbox.x + bbox.w / 2) * kx, localCy = L.y + (bbox.y + bbox.h / 2) * ky
    const wc = toWorld(L, localCx, localCy)
    cur.layers.push({ id: uid(), type: 'image', name: t('ie_selection'), img: out, x: Math.round(wc.x - newW / 2), y: Math.round(wc.y - newH / 2), sx: kx, sy: ky, rot: L.rot || 0, opacity: 1, visible: true, adj: { b: 1, c: 1, s: 1, h: 0 } })
    cur.sel = cur.layers[cur.layers.length - 1].id
    markDirty(); wandSel = null; setTool('move'); render(); renderPanel()
  }
  function deleteWandRegion() {
    removeWandBar()
    if (!wandSel) return
    pushHistory(); eraseMask(wandSel.L, wandSel.mask)
    markDirty(); wandSel = null; render(); renderPanel()
  }
  function showWandActions() {
    const bar = body.querySelector('.ie-bar')
    removeWandBar()
    const delBtn = el('button', 'ie-btn', `<i class="fa-solid fa-trash"></i> ${t('ie_lasso_delete')}`); delBtn.id = 'ie-wa-del'
    const moveBtn = el('button', 'ie-btn', `<i class="fa-solid fa-up-down-left-right"></i> ${t('ie_lasso_move')}`); moveBtn.id = 'ie-wa-move'
    const cancelBtn = el('button', 'ie-btn', `<i class="fa-solid fa-xmark"></i> ${t('ie_crop_cancel')}`); cancelBtn.id = 'ie-wa-x'
    delBtn.addEventListener('click', deleteWandRegion)
    moveBtn.addEventListener('click', finalizeWand)
    cancelBtn.addEventListener('click', () => clearWand())
    bar.append(delBtn, moveBtn, cancelBtn)
  }

  // ── Stamp (smudge): drag to smear existing colours together, like blending
  // wet paint / an ink stamp, rather than adding or erasing pixels.
  function sampleStampRegion(L, p) {
    const kx = L.sx || 1, ky = L.sy || 1
    const r = Math.max(1, Math.round(stampSize / Math.max(kx, ky) / 2))
    const lp = toLocal(L, p.x, p.y)   // rotation-aware
    const lx = Math.round((lp.x - L.x) / kx), ly = Math.round((lp.y - L.y) / ky)
    const sx = Math.max(0, lx - r), sy = Math.max(0, ly - r)
    const ex = Math.min(L.img.width, lx + r), ey = Math.min(L.img.height, ly + r)
    const w = Math.max(1, ex - sx), h = Math.max(1, ey - sy)
    return { data: L.img.getContext('2d').getImageData(sx, sy, w, h), r }
  }
  function startStamp(p) {
    let L = layerById(cur.sel)
    if (!L || L.type === 'fill') return
    ensureCanvasLayer(L)
    pushHistory()
    stampLayer = L; stampLast = p; dragging = 'stamp'
    stampCarry = sampleStampRegion(L, p)
    markDirty(); render()
  }
  function drawStampSeg(L, from, to) {
    if (!L) return
    const kx = L.sx || 1, ky = L.sy || 1
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const step = Math.max(1, stampSize * 0.35)
    const n = Math.max(1, Math.ceil(dist / step))
    const g = L.img.getContext('2d')
    for (let i = 1; i <= n; i++) {
      const tt = i / n
      const px = from.x + (to.x - from.x) * tt, py = from.y + (to.y - from.y) * tt
      const lp = toLocal(L, px, py)   // rotation-aware
      const lx = Math.round((lp.x - L.x) / kx), ly = Math.round((lp.y - L.y) / ky)
      const r = stampCarry.r
      const dx = Math.max(0, lx - r), dy = Math.max(0, ly - r)
      const dw = Math.min(L.img.width, lx + r) - dx, dh = Math.min(L.img.height, ly + r) - dy
      if (dw <= 0 || dh <= 0) continue
      const dest = g.getImageData(dx, dy, dw, dh)
      const cd = stampCarry.data.data, dd = dest.data
      const cw = stampCarry.data.width, ch = stampCarry.data.height
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        const cxp = Math.min(cw - 1, x), cyp = Math.min(ch - 1, y)
        const ci = (cyp * cw + cxp) * 4, di = (y * dw + x) * 4
        const ddx = (x + dx) - lx, ddy = (y + dy) - ly
        const fall = Math.max(0, 1 - Math.hypot(ddx, ddy) / r)
        const a = stampStrength * fall
        dd[di]     += (cd[ci]     - dd[di])     * a
        dd[di + 1] += (cd[ci + 1] - dd[di + 1]) * a
        dd[di + 2] += (cd[ci + 2] - dd[di + 2]) * a
      }
      g.putImageData(dest, dx, dy)
      stampCarry = { data: g.getImageData(dx, dy, dw, dh), r }
    }
  }

  // ── Copy / paste images (Ctrl+C / Ctrl+V while hovering the editor) ─────────
  function copyCanvas() {
    if (!cur) return null
    const L = layerById(cur.sel)
    if (L) {
      const w = Math.max(1, Math.round(LW(L))), h = Math.max(1, Math.round(LH(L)))
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')
      g.globalAlpha = L.opacity; g.filter = filterStr(L.adj); g.drawImage(L.img, 0, 0, w, h); return c
    }
    const r = wholeRegion(cur); return r ? compositeRegion(cur, r) : null
  }
  function onCopy(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c') return
    if (!editorHasKeys()) return
    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return
    const c = copyCanvas(); if (!c) return
    e.preventDefault()
    c.toBlob(b => { if (b && navigator.clipboard?.write) navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => window.toast?.(t('ie_copied'), 'success', 1000), () => {}) })
  }
  function onPaste(e) {
    if (!editorHasKeys()) return
    const items = e.clipboardData?.items || []
    for (const it of items) if (it.type.startsWith('image/')) {
      const f = it.getAsFile(); if (!f) continue
      e.preventDefault(); const r = new FileReader(); r.onload = () => place(r.result, t('ie_pasted'), !!(cur && (cur.docW || cur.infinite))); r.readAsDataURL(f); return
    }
  }
  // The editor "has the keyboard" when hovered OR focused (a click inside
  // focuses the window). Registered in CAPTURE phase + stopPropagation so the
  // app-level Ctrl+Z (project history in main.js) doesn't ALSO fire — that
  // used to double-undo and toast on every editor undo.
  const editorHasKeys = () => document.contains(body) && (body.matches(':hover') || body.contains(document.activeElement))
  function onKeys(e) {
    if (!editorHasKeys()) return
    const a = document.activeElement
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    const k = e.key.toLowerCase()
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo() }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); e.stopPropagation(); redo() }
      return
    }
    if (e.altKey) return
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation()
      if (regionMode) { endRegion(); render() }
      else if (lassoPts) clearLasso()
      else if (wandSel) clearWand()
      else if (cur && cur.sel) { cur.sel = null; render(); renderPanel() }
      return
    }
    if (e.key === 'Delete') {
      const L = layerById(cur && cur.sel)
      if (L) {
        e.preventDefault(); e.stopPropagation()
        pushHistory()
        cur.layers = cur.layers.filter(x => x !== L)
        cur.sel = cur.layers.length ? cur.layers[cur.layers.length - 1].id : null
        markDirty(); render(); renderPanel()
      }
      return
    }
    const HOTKEYS = { b: 'brush', e: 'eraser', s: 'stamp', v: 'move', l: 'lasso', w: 'wand', g: 'bucket', t: 'text', u: 'shape' }
    if (HOTKEYS[k]) { e.preventDefault(); setTool(HOTKEYS[k]) }
  }
  document.addEventListener('keydown', onCopy)
  document.addEventListener('keydown', onKeys, true)
  document.addEventListener('paste', onPaste)

  // ── Region selection (shared by Crop and "export a zone") ───────────────────
  function endRegion() {
    regionMode = false; regionRect = null; regionApply = null
    body.querySelector('#ie-crop').classList.remove('on')
    body.querySelector('#ie-rg-apply')?.remove(); body.querySelector('#ie-rg-cancel')?.remove()
  }
  function beginRegion(applyKey, onApply, markCrop) {
    regionMode = true; regionRect = null; regionApply = onApply
    body.querySelector('#ie-crop').classList.toggle('on', !!markCrop)
    body.querySelector('#ie-rg-apply')?.remove(); body.querySelector('#ie-rg-cancel')?.remove()
    const bar = body.querySelector('.ie-bar')
    const ap = el('button', 'ie-btn', `<i class="fa-solid fa-check"></i> ${t(applyKey)}`); ap.id = 'ie-rg-apply'
    const ca = el('button', 'ie-btn', `<i class="fa-solid fa-xmark"></i> ${t('ie_crop_cancel')}`); ca.id = 'ie-rg-cancel'
    ap.addEventListener('click', () => {
      const fn = regionApply, rr = regionRect
      if (!rr || !cur) { endRegion(); render(); return }
      const r = normRect(rr); r.x = Math.round(r.x); r.y = Math.round(r.y); r.w = Math.round(r.w); r.h = Math.round(r.h)
      endRegion(); render()
      if (r.w >= 4 && r.h >= 4 && fn) fn(r)
    })
    ca.addEventListener('click', () => { endRegion(); render() })
    bar.append(ap, ca); render()
  }
  function doCrop(r) {
    pushHistory()
    r.x = Math.max(0, r.x); r.y = Math.max(0, r.y)
    cur.layers.forEach(L => { L.x -= r.x; L.y -= r.y }); cur.docW = r.w; cur.docH = r.h; cur.infinite = false
    markDirty(); render()
  }

  // ── Library open / export ──────────────────────────────────────────────────
  const libRoot = () => window.__TAURI__ && localStorage.getItem('library:root')
  async function openLibrary() {
    const root = libRoot(); if (!root) { window.toast?.(t('ie_no_lib'), 'error'); return }
    const sep = root.includes('\\') ? '\\' : '/'
    const { invoke } = window.__TAURI__.core
    let items = []
    for (const folder of ['Images', 'Modifiés', 'Importés']) { try { items = items.concat((await invoke('list_folder_contents', { path: root + sep + folder })) || []) } catch {} }
    items = items.filter(f => !f.is_dir && /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name))
    body.querySelector('.ie-lib-ov')?.remove()
    const ov = el('div', 'ie-lib-ov'); const card = el('div', 'ie-lib-card')
    card.appendChild(el('div', 'ie-sec-h', t('ie_library')))
    if (!items.length) card.appendChild(el('div', 'ie-noadj', t('ie_no_images')))
    const grid = el('div', 'ie-lib-grid')
    items.slice(0, 120).forEach(f => {
      const it = el('div', 'ie-lib-item', `<img loading="lazy"/><span></span>`)
      it.querySelector('span').textContent = f.name
      const mime = /\.png$/i.test(f.name) ? 'image/png' : /\.webp$/i.test(f.name) ? 'image/webp' : /\.gif$/i.test(f.name) ? 'image/gif' : /\.bmp$/i.test(f.name) ? 'image/bmp' : 'image/jpeg'
      ;(async () => { try { const b64 = await invoke('read_file_base64', { path: f.path }); it.querySelector('img').src = 'data:' + mime + ';base64,' + b64 } catch {} })()
      it.addEventListener('click', () => { const src = it.querySelector('img').src; ov.remove(); if (src) place(src, f.name.replace(/\.[^.]+$/, ''), false) })
      grid.appendChild(it)
    })
    card.appendChild(grid); ov.appendChild(card)
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove() })
    wrap.appendChild(ov)
  }
  function compositeRegion(d, r) {
    const oc = document.createElement('canvas'); oc.width = r.w; oc.height = r.h; const g = oc.getContext('2d')
    g.translate(-r.x, -r.y)
    for (const L of d.layers) if (L.visible) drawLayerInto(g, L)
    return oc
  }
  // Bounding box of all visible layers (for auto-saving an infinite canvas).
  function layersBounds(d) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const L of d.layers) { if (!L.visible || L.type === 'fill') continue; const w = LW(L), h = LH(L); minX = Math.min(minX, L.x); minY = Math.min(minY, L.y); maxX = Math.max(maxX, L.x + w); maxY = Math.max(maxY, L.y + h) }
    if (!isFinite(minX)) return null
    const pad = 20
    return { x: Math.round(minX - pad), y: Math.round(minY - pad), w: Math.round(maxX - minX + pad * 2), h: Math.round(maxY - minY + pad * 2) }
  }
  // Compact export-format picker shown right after the name prompt. Dismissing
  // it (Escape / Enter / click outside) keeps the default: PNG.
  function promptFormat() {
    wrap.querySelectorAll('.ie-lib-ov').forEach(o => o.remove())   // never stack overlays
    return new Promise(resolve => {
      const ov = el('div', 'ie-lib-ov'), card = el('div', 'ie-lib-card'); card.style.maxWidth = '280px'
      card.appendChild(el('div', 'ie-sec-h', t('ie_export')))
      const row = el('div'); row.style.cssText = 'display:flex;gap:6px'
      let settled = false
      const done = v => { if (settled) return; settled = true; ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v) }
      const FMTS = [['PNG', { mime: 'image/png', ext: 'png' }], ['JPEG', { mime: 'image/jpeg', ext: 'jpg', q: 0.9 }], ['WebP', { mime: 'image/webp', ext: 'webp', q: 0.9 }]]
      FMTS.forEach(([lab, v], i) => {
        const b = el('button', 'ie-btn' + (i === 0 ? ' on' : ''), lab); b.style.cssText = 'flex:1;justify-content:center'
        b.addEventListener('click', () => done(v))
        row.appendChild(b)
      })
      card.appendChild(row); ov.appendChild(card); wrap.appendChild(ov)
      const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); done(FMTS[0][1]) } }
      document.addEventListener('keydown', onKey, true)
      ov.addEventListener('mousedown', e => { if (e.target === ov) done(FMTS[0][1]) })
    })
  }
  async function saveRegion(d, r) {
    const root = libRoot(); if (!root) { window.toast?.(t('ie_no_lib'), 'error'); return false }
    const base = await promptName(d.name || t('ie_default_name'), { title: t('ie_export') }); if (base == null) return false
    const fmt = await promptFormat()
    const sep = root.includes('\\') ? '\\' : '/'
    const b64 = compositeRegion(d, r).toDataURL(fmt.mime, fmt.q).split(',')[1]
    try {
      await window.__TAURI__.core.invoke('save_binary_file', { path: root + sep + 'Images' + sep + base + '.' + fmt.ext, base64: b64 })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Images' } }))
      window.toast?.(t('ie_exported') + ' : ' + base + '.' + fmt.ext, 'success')
      d.dirty = false; d.name = base; renderTabs()
      return true
    } catch { window.toast?.(t('ie_export_fail'), 'error'); return false }
  }
  // Toolbar export: fixed doc → whole document; infinite → pick a zone to save.
  function exportDoc(d) {
    if (!d) return
    if (d.infinite) {
      switchDoc(d.id)
      beginRegion('ie_export_save', r => saveRegion(d, r))
      return
    }
    if (!d.docW) return
    saveRegion(d, { x: 0, y: 0, w: d.docW, h: d.docH })
  }

  // ── Project format (.iceimg): the full layered document as JSON ────────────
  // Every layer keeps its live props; the bitmap is serialized as a PNG dataURL
  // (the content itself for image/paint layers, a regeneration fallback for
  // text/shape layers, nothing for fills).
  function layerPNGDataUrl(L) {
    const c = document.createElement('canvas'); c.width = L.img.width; c.height = L.img.height
    c.getContext('2d').drawImage(L.img, 0, 0)
    return c.toDataURL('image/png')
  }
  function serializeLayer(L, withImg = true) {
    const o = { id: L.id, type: L.type, name: L.name, x: L.x, y: L.y, sx: L.sx || 1, sy: L.sy || 1, rot: L.rot || 0, opacity: L.opacity, visible: L.visible, blend: L.blend || 'source-over', adj: L.adj ? { ...L.adj } : { b: 1, c: 1, s: 1, h: 0 } }
    if (L.type === 'fill') { o.color = L.color || '#ffffff'; return o }
    if (L.type === 'text') { o.text = L.text || ''; o.tsize = L.tsize || 64; o.tcolor = L.tcolor || '#ffffff'; o.tfont = L.tfont || 'Segoe UI'; o.tbold = !!L.tbold; o.titalic = !!L.titalic }
    if (L.type === 'shape') { o.shape = L.shape || 'rect'; o.sfill = L.sfill || '#cccccc'; o.sstroke = L.sstroke || '#000000'; o.sstrokeW = L.sstrokeW || 0; o.sflipX = !!L.sflipX; o.sflipY = !!L.sflipY; o.sw = L.sw || 1; o.sh = L.sh || 1; o.spad = L.spad || 0 }
    if (withImg && L.img) { try { o.img = layerPNGDataUrl(L) } catch {} }
    return o
  }
  const serializeDoc = d => ({ version: 1, name: d.name, docW: d.docW, docH: d.docH, infinite: d.infinite, sel: d.sel, layers: d.layers.map(L => serializeLayer(L)) })
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src })
  async function deserializeDoc(json, fallbackName) {
    const d = { id: uid(), name: json.name || fallbackName || t('ie_untitled'), layers: [], docW: json.docW || 0, docH: json.docH || 0, infinite: !!json.infinite, sel: json.sel || null, dirty: false, history: [], redo: [] }
    for (const s of (Array.isArray(json.layers) ? json.layers : [])) {
      const L = { id: s.id || uid(), type: s.type || 'image', name: s.name || t('ie_layer'), x: s.x || 0, y: s.y || 0, sx: s.sx || 1, sy: s.sy || 1, rot: s.rot || 0, opacity: s.opacity == null ? 1 : s.opacity, visible: s.visible !== false, adj: { b: 1, c: 1, s: 1, h: 0, ...(s.adj || {}) } }
      if (s.blend && s.blend !== 'source-over') L.blend = s.blend
      if (L.type === 'fill') { L.color = s.color || '#ffffff'; d.layers.push(L); continue }
      if (L.type === 'text') { L.text = s.text || ''; L.tsize = s.tsize || 64; L.tcolor = s.tcolor || '#ffffff'; L.tfont = s.tfont || 'Segoe UI'; L.tbold = !!s.tbold; L.titalic = !!s.titalic }
      if (L.type === 'shape') { L.shape = s.shape || 'rect'; L.sfill = s.sfill || '#cccccc'; L.sstroke = s.sstroke || '#000000'; L.sstrokeW = s.sstrokeW || 0; L.sflipX = !!s.sflipX; L.sflipY = !!s.sflipY; L.sw = s.sw || 1; L.sh = s.sh || 1; L.spad = s.spad || 0 }
      if (L.type === 'text' || L.type === 'shape') {
        // Live layers: regenerate the bitmap from the restored props; fall back
        // to the cached PNG snapshot if regeneration fails. (renderShapeLayer
        // only shifts x/y when L.img already exists, so the saved position
        // survives the regeneration untouched.)
        try { if (L.type === 'text') renderTextLayer(L); else renderShapeLayer(L) } catch {}
        if (!L.img && s.img) { try { L.img = await loadImg(s.img) } catch {} }
        if (L.img) d.layers.push(L)
        continue
      }
      if (!s.img) continue
      try {
        const im = await loadImg(s.img)
        // Paint layers are drawn on directly → they must come back as canvases.
        if (L.type === 'paint') { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0); L.img = c } else L.img = im
        d.layers.push(L)
      } catch {}
    }
    if (d.sel && !d.layers.some(l => l.id === d.sel)) d.sel = d.layers.length ? d.layers[d.layers.length - 1].id : null
    return d
  }
  // Same document format, built without freezing the UI (PNG encoding runs off
  // the main thread, imported images are encoded once). Text/shape layers carry
  // no bitmap: they are regenerated from their props on load.
  async function serializeDocAsync(d) {
    const layers = []
    for (const L of d.layers) {
      const o = serializeLayer(L, false)
      if (L.img && L.type !== 'fill' && L.type !== 'text' && L.type !== 'shape') {
        try { o.img = await toDataURLAsync(L.img) } catch {}
      }
      layers.push(o)
    }
    return { version: 1, name: d.name, docW: d.docW, docH: d.docH, infinite: d.infinite, sel: d.sel, dirty: !!d.dirty, layers }
  }
  async function openProjectData(json, fallbackName) {
    const d = await deserializeDoc(json, fallbackName)
    docs.push(d); cur = d
    switchDoc(d.id)
    return d
  }
  async function readProjectText(path) {
    const { invoke } = window.__TAURI__.core
    try { return await invoke('read_text_file', { path }) }
    catch {
      // Fallback: raw bytes → UTF-8 (read_file_base64 always exists).
      const b64 = await invoke('read_file_base64', { path })
      return new TextDecoder('utf-8').decode(Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)))
    }
  }
  async function openProjectPath(path, name) {
    if (!window.__TAURI__ || !path) return
    try {
      const json = JSON.parse(await readProjectText(path))
      if (!json || !Array.isArray(json.layers)) throw new Error('bad project')
      await openProjectData(json, (name || path.split(/[\\/]/).pop() || '').replace(/\.[^.]+$/, ''))
    } catch { window.toast?.(t('ie_load_fail'), 'error') }
  }
  async function saveProject(d) {
    if (!d) return false
    const root = libRoot(); if (!root) { window.toast?.(t('ie_no_lib'), 'error'); return false }
    const base = await promptName(d.name || t('ie_default_name'), { title: t('ie_save_proj') }); if (base == null) return false
    const sep = root.includes('\\') ? '\\' : '/'
    try {
      await window.__TAURI__.core.invoke('save_text_file', { path: root + sep + 'Pistes' + sep + base + '.iceimg', content: JSON.stringify(serializeDoc(d)) })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Pistes' } }))
      window.toast?.(t('ie_proj_saved') + ' : ' + base + '.iceimg', 'success')
      d.dirty = false; d.name = base; renderTabs()
      return true
    } catch { window.toast?.(t('ie_export_fail'), 'error'); return false }
  }

  // ── Wire toolbar ───────────────────────────────────────────────────────────
  const fileInp = body.querySelector('#ie-file'), addInp = body.querySelector('#ie-addfile')
  body.querySelector('#ie-open').addEventListener('click', () => fileInp.click())
  body.querySelector('#ie-open2').addEventListener('click', () => fileInp.click())
  body.querySelector('#ie-new2').addEventListener('click', () => newFile())
  body.querySelector('#ie-lib2').addEventListener('click', openLibrary)
  fileInp.addEventListener('change', () => { loadFile(fileInp.files[0], false); fileInp.value = '' })
  body.querySelector('#ie-add').addEventListener('click', () => addInp.click())
  addInp.addEventListener('change', () => { loadFile(addInp.files[0], true); addInp.value = '' })
  body.querySelector('#ie-lib').addEventListener('click', openLibrary)
  body.querySelector('#ie-crop').addEventListener('click', () => { if (regionMode) { endRegion(); render() } else beginRegion('ie_crop_apply', doCrop, true) })
  body.querySelector('#ie-export').addEventListener('click', () => exportDoc(cur))
  body.querySelector('#ie-saveproj').addEventListener('click', () => saveProject(cur))
  // "Send to…" — ship the current document (flattened composite) to another tool.
  {
    const sendBtn = makeSendButton(() => {
      if (!cur) return null
      const r = wholeRegion(cur); if (!r) return null
      return imageMedia(compositeRegion(cur, r), cur.name)
    }, { self: 'imgedit', iconOnly: true })
    const exportBtn = body.querySelector('#ie-export')
    exportBtn.parentNode.insertBefore(sendBtn, exportBtn.nextSibling)
  }

  // Closing the window with unsaved documents → classic confirm + offer to save.
  const win = body.closest('.tool-win')
  if (win) win._beforeClose = async (doClose) => {
    const dirty = docs.filter(d => d.dirty)
    if (!dirty.length) { doClose(); return }
    const choice = await confirmUnsaved({ title: t('ie_unsaved_title'), message: t('ie_unsaved_msg'), saveLabel: t('ie_save') }); if (choice === 'cancel') return
    if (choice === 'save') { for (const d of dirty) { const r = wholeRegion(d); if (r) { const ok = await saveRegion(d, r); if (!ok) return } } }
    doClose()
  }

  // ── Project registry (every open document, layers included) ────────────────
  registerTool('imgedit', {
    el: body,
    rev: () => stateRev,
    getState: async () => {
      const list = [...docs], out = []
      for (const d of list) out.push(await serializeDocAsync(d))
      return { cur: Math.max(0, list.indexOf(cur)), docs: out }
    },
    setState: async (state) => {
      if (!state || !Array.isArray(state.docs) || !state.docs.length) return
      const restored = []
      for (const json of state.docs) {
        try { const d = await deserializeDoc(json); d.dirty = !!json.dirty; restored.push(d) } catch {}
      }
      if (!restored.length) return
      docs = restored
      switchDoc((restored[state.cur] || restored[0]).id)
    },
  })

  const ro = new ResizeObserver(render); ro.observe(wrap)
  newDoc(); cur = docs[0]; cur.infinite = true; addFill(cur, '#ffffff')   // start with an infinite white file
  render(); renderPanel(); renderTabs()
  new MutationObserver((_, obs) => { if (!document.contains(body)) { ro.disconnect(); window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', endDrag); document.removeEventListener('keydown', onCopy); document.removeEventListener('keydown', onKeys, true); document.removeEventListener('paste', onPaste); tauriUnlistens.forEach(fn => fn?.()); obs.disconnect() } }).observe(document.body, { childList: true, subtree: true })
}
