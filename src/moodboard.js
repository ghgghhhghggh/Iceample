// moodboard.js — Boards manager + exclusive full-screen board mode.
// A board fills the workspace with its own animated fond. On it you place media
// (image/gif from file or link) and text, draw with a brush, and move/resize each
// element from any edge or corner (Shift = keep proportions).
import { t } from './i18n.js'
import { showPalPicker } from './palettes.js'
import { promptName } from './rename-dialog.js'
import { registerCommands, unregisterCommandsBy } from './commands.js'
import { themeColor } from './theme.js'

const LS_KEY = 'iceample:moodboards'
const MIN = 40
let boards = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || [] } catch { return [] } })()
let _quotaWarnTs = 0
const persist = () => {
  try {
    const s = JSON.stringify(boards)
    if (s.length >= 9_000_000) throw new Error('quota')
    localStorage.setItem(LS_KEY, s)
  } catch {
    // Storage guard exceeded or setItem threw: warn instead of silently dropping.
    if (Date.now() - _quotaWarnTs > 4000) { _quotaWarnTs = Date.now(); window.toast?.(t('mb_too_big'), 'error', 4000) }
  }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

let _activeId = null
let _activeAdd = null            // wire: add an image to the open board from another tool
let _zoom = 1                    // per-session board zoom (never persisted)
let _dropOver = null, _dropEnd = null, _onResize = null, _onKey = null, _onPaste = null

// Used by other tools (e.g. the 3D editor) to drop an image into the open board.
export function addImageToActiveBoard(src) { if (_activeAdd) { _activeAdd(src); return true } return false }
export function hasActiveBoard() { return !!_activeId }

// Normalize a board to the current model (migrates old `tiles`).
function normalize(b) {
  if (!b.items) {
    b.items = (b.tiles || []).map(ti => ({ id: ti.id || uid(), type: 'image', src: ti.src, x: ti.x, y: ti.y, w: ti.w, h: ti.h || Math.round((ti.w || 180) * 0.66) }))
    delete b.tiles
  }
  if (!b.strokes) b.strokes = []
  return b
}

function injectStyles() {
  if (document.getElementById('mb2-styles')) return
  const s = document.createElement('style')
  s.id = 'mb2-styles'
  s.textContent = `
.mb2-body { display:flex; flex-direction:column; height:100%; background:var(--surface,#141414); }
.mb2-bar { display:flex; align-items:center; gap:6px; padding:7px 9px; border-bottom:1px solid var(--win-border-in,#1e1e1e); flex-shrink:0; }
.mb2-bar .mb2-title { font-size:12px; font-weight:600; color:var(--text-primary,#eee); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mb2-btn { display:flex; align-items:center; gap:6px; height:28px; padding:0 10px; border:1px solid var(--win-border,#2a2a2a);
  background:color-mix(in srgb, var(--text-primary) 7%, var(--surface)); color:var(--text-secondary,#aaa); border-radius:6px; font-family:inherit; font-size:11px; cursor:pointer; transition:background .1s,color .1s; }
.mb2-btn:hover { background:color-mix(in srgb, var(--text-primary) 12%, var(--surface)); color:var(--text-primary,#fff); }
.mb2-btn.on { background:color-mix(in srgb, var(--color-active,#4a9eff) 18%, transparent); color:var(--color-active,#4a9eff); border-color:var(--color-active,#4a9eff); }
.mb2-icon-btn { width:30px; padding:0; justify-content:center; }
.mb2-link { background:var(--surface2, var(--surface)); border:1px solid var(--win-border,#2a2a2a); border-radius:6px;
  color:var(--text-primary,#fff); font-family:inherit; font-size:11px; padding:7px 9px; outline:none; min-width:120px; }
.mb2-link:focus { border-color:var(--color-active,#4a9eff); }
.mb2-color { width:30px; height:28px; padding:0; border:1px solid var(--win-border,#2a2a2a); border-radius:6px; background:none; cursor:pointer; }
.mb2-range { width:74px; }

.mb2-grid { flex:1; overflow-y:auto; padding:12px; display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:12px; align-content:start; }
.mb2-card { position:relative; aspect-ratio:4/3; border-radius:10px; overflow:hidden; cursor:pointer; border:1px solid var(--win-border,#2a2a2a);
  background:var(--surface) center/cover no-repeat; box-shadow:0 4px 14px rgba(0,0,0,0.35); transition:transform .12s, border-color .12s; }
.mb2-card:hover { transform:translateY(-2px); border-color:var(--color-active,#4a9eff); }
.mb2-card.active { border-color:var(--color-active,#4a9eff); box-shadow:0 0 0 2px color-mix(in srgb, var(--color-active,#4a9eff) 40%, transparent); }
.mb2-card-name { position:absolute; left:0; right:0; bottom:0; padding:7px 9px; font-size:11px; color:#fff;
  background:linear-gradient(transparent, rgba(0,0,0,0.78)); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mb2-card-empty { display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-secondary,#444); font-size:24px; }
.mb2-card-x { position:absolute; top:5px; right:5px; width:20px; height:20px; border:none; border-radius:50%; background:rgba(0,0,0,0.6);
  color:#fff; font-size:11px; cursor:pointer; opacity:0; transition:opacity .1s; }
.mb2-card:hover .mb2-card-x { opacity:1; }
.mb2-card-e { position:absolute; top:5px; right:29px; width:20px; height:20px; border:none; border-radius:50%; background:rgba(0,0,0,0.6);
  color:#fff; font-size:9px; cursor:pointer; opacity:0; transition:opacity .1s; }
.mb2-card:hover .mb2-card-e { opacity:1; }
.mb2-new-card { display:flex; align-items:center; justify-content:center; flex-direction:column; gap:6px; color:var(--text-secondary,#888);
  border:1px dashed var(--win-border,#333); background:transparent; }
.mb2-new-card:hover { color:var(--color-active,#4a9eff); }
.mb2-new-card i { font-size:20px; }

/* Exclusive full-screen board mode — its own animated fond, blocks everything else */
#mb-board-layer { position:fixed; inset:0; z-index:9000; overflow:hidden; background:var(--preview-bg); }
#mb-board-layer::before { content:''; position:absolute; inset:-35%; pointer-events:none; z-index:0;
  background:
    radial-gradient(42% 42% at 30% 35%, color-mix(in srgb, var(--color-active,#4a9eff) 16%, transparent), transparent 70%),
    radial-gradient(46% 46% at 72% 66%, color-mix(in srgb, var(--color-active-2,#a64cff) 13%, transparent), transparent 70%);
  animation: mb-fond 32s linear infinite; will-change:transform; }
@keyframes mb-fond { 0%{transform:rotate(0deg) scale(1.05);} 50%{transform:rotate(180deg) scale(1.18);} 100%{transform:rotate(360deg) scale(1.05);} }
html.reduce-motion #mb-board-layer::before { animation:none; }
.mb2-draw { position:absolute; inset:0; z-index:1; pointer-events:none; }
#mb-board-layer.brush .mb2-draw { pointer-events:auto; cursor:crosshair; }
#mb-board-layer.brush .mb2-item { pointer-events:none; }

#mb-board-bar { position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:9001; pointer-events:auto;
  display:flex; align-items:center; gap:7px; padding:6px 8px; background:var(--surface,#141414);
  border:1px solid var(--win-border,#2a2a2a); border-radius:11px; box-shadow:0 10px 30px rgba(0,0,0,0.55); flex-wrap:wrap; max-width:94vw; }
#mb-board-bar .mb2-bname { font-size:12px; font-weight:600; color:var(--text-primary,#eee); padding:0 4px; max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#mb-board-bar .mb2-sep { width:1px; height:20px; background:var(--win-border-in,#1e1e1e); }

.mb2-item { position:absolute; z-index:2; border-radius:8px; border:1px solid var(--win-border,#2a2a2a);
  box-shadow:0 4px 16px rgba(0,0,0,0.45); cursor:grab; user-select:none; pointer-events:auto; }
.mb2-item.drag { cursor:grabbing; box-shadow:0 12px 30px rgba(0,0,0,0.6); z-index:5; }
.mb2-item img { display:block; width:100%; height:100%; object-fit:cover; border-radius:7px; pointer-events:none; -webkit-user-drag:none; }
.mb2-text { width:100%; height:100%; padding:8px 10px; box-sizing:border-box; overflow:hidden; font-family:inherit;
  font-size:20px; line-height:1.25; color:#fff; outline:none; word-break:break-word; }
.mb2-text[contenteditable="true"] { cursor:text; background:rgba(0,0,0,0.25); }
.mb2-item.mb2-textitem { border:none; box-shadow:none; }
.mb2-item.mb2-textitem.bordered { border:1px solid var(--win-border,#2a2a2a); box-shadow:0 4px 16px rgba(0,0,0,0.45); }
#mb2-itemmenu { position:fixed; z-index:9002; background:var(--surface,#141414); border:1px solid var(--win-border,#2a2a2a);
  border-radius:8px; padding:4px; box-shadow:0 10px 28px rgba(0,0,0,0.55); }
.mb2-item-x { position:absolute; top:-9px; right:-9px; width:18px; height:18px; border:none; border-radius:50%; background:var(--surface2);
  color:var(--text-primary); font-size:10px; cursor:pointer; opacity:0; transition:opacity .1s; z-index:3; box-shadow:0 1px 4px rgba(0,0,0,.5); }
.mb2-item:hover .mb2-item-x { opacity:1; }
.mb2-h { position:absolute; width:11px; height:11px; background:var(--color-active,#4a9eff); border:1px solid var(--on-accent);
  border-radius:2px; opacity:0; transition:opacity .1s; z-index:4; }
.mb2-item:hover .mb2-h { opacity:0.95; }
.mb2-h-n  { top:-6px;  left:50%;  transform:translateX(-50%); cursor:ns-resize; }
.mb2-h-s  { bottom:-6px; left:50%; transform:translateX(-50%); cursor:ns-resize; }
.mb2-h-e  { right:-6px; top:50%;   transform:translateY(-50%); cursor:ew-resize; }
.mb2-h-w  { left:-6px;  top:50%;   transform:translateY(-50%); cursor:ew-resize; }
.mb2-h-ne { top:-6px; right:-6px;  cursor:nesw-resize; }
.mb2-h-nw { top:-6px; left:-6px;   cursor:nwse-resize; }
.mb2-h-se { bottom:-6px; right:-6px; cursor:nwse-resize; }
.mb2-h-sw { bottom:-6px; left:-6px;  cursor:nesw-resize; }
.mb2-rot { position:absolute; top:-26px; left:50%; transform:translateX(-50%); width:12px; height:12px; border-radius:50%;
  background:var(--color-active,#4a9eff); border:1px solid var(--on-accent); cursor:grab; opacity:0; transition:opacity .1s; z-index:4; box-shadow:0 1px 4px rgba(0,0,0,.5); }
.mb2-item:hover .mb2-rot { opacity:0.95; }
  `
  document.head.appendChild(s)
}

const HANDLES = [
  ['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0],
  ['ne', 1, -1], ['nw', -1, -1], ['se', 1, 1], ['sw', -1, 1],
]

// Small right-click menus (board elements + board background).
function onItemMenuDoc(e) { if (!e.target.closest('#mb2-itemmenu')) removeItemMenu() }
function removeItemMenu() { document.getElementById('mb2-itemmenu')?.remove(); document.removeEventListener('mousedown', onItemMenuDoc) }
function buildMenu(x, y, entries) {
  removeItemMenu()
  const m = document.createElement('div'); m.id = 'mb2-itemmenu'
  m.style.left = x + 'px'; m.style.top = y + 'px'
  entries.forEach(en => {
    const b = document.createElement('button'); b.className = 'ctx-item'
    b.innerHTML = `<i class="${en.icon}"></i><span></span>`
    b.querySelector('span').textContent = en.label
    b.addEventListener('click', () => { removeItemMenu(); en.fn() })
    m.appendChild(b)
  })
  document.body.appendChild(m)
  const r = m.getBoundingClientRect()
  if (r.right > innerWidth)  m.style.left = (x - r.width) + 'px'
  if (r.bottom > innerHeight) m.style.top = (y - r.height) + 'px'
  setTimeout(() => document.addEventListener('mousedown', onItemMenuDoc), 0)
}
function showItemMenu(x, y, d, el, board, layer) {
  const entries = []
  if (d.type === 'text') entries.push({
    icon: 'fa-solid fa-border-top-left',
    label: d.border ? t('mb_border_remove') : t('mb_border_add'),
    fn: () => { d.border = !d.border; el.classList.toggle('bordered', !!d.border); persist() },
  })
  entries.push({
    icon: 'fa-solid fa-clone',
    label: t('mb_duplicate'),
    fn: () => {
      const nd = JSON.parse(JSON.stringify(d)); nd.id = uid(); nd.x += 14; nd.y += 14
      board.items.push(nd); mountItem(layer, board, nd); persist()
    },
  })
  entries.push({
    icon: 'fa-solid fa-arrow-up',
    label: t('mb_front'),
    fn: () => {
      const i = board.items.indexOf(d)
      if (i >= 0) { board.items.splice(i, 1); board.items.push(d) }
      layer.appendChild(el); persist()
    },
  })
  entries.push({
    icon: 'fa-solid fa-arrow-down',
    label: t('mb_back'),
    fn: () => {
      const i = board.items.indexOf(d)
      if (i >= 0) { board.items.splice(i, 1); board.items.unshift(d) }
      const first = layer.querySelector('.mb2-item')
      if (first && first !== el) layer.insertBefore(el, first)
      persist()
    },
  })
  buildMenu(x, y, entries)
}

// ── Board element (image or text) ─────────────────────────────────────────────
function mountItem(layer, board, d) {
  const el = document.createElement('div')
  el.className = 'mb2-item'
  el.dataset.itemId = d.id
  const apply = () => {
    el.style.left = d.x + 'px'; el.style.top = d.y + 'px'; el.style.width = d.w + 'px'; el.style.height = d.h + 'px'
    el.style.transform = d.rot ? `rotate(${d.rot}deg)` : ''
  }
  apply()

  if (d.type === 'text') {
    el.classList.add('mb2-textitem')
    if (d.border) el.classList.add('bordered')
    const tx = document.createElement('div')
    tx.className = 'mb2-text'; tx.textContent = d.text || ''; tx.style.color = d.color || '#fff'
    el.appendChild(tx)
    el.addEventListener('dblclick', e => {
      e.stopPropagation(); el.dataset.editing = '1'; tx.contentEditable = 'true'; tx.focus()
      const r = document.createRange(); r.selectNodeContents(tx); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
    })
    tx.addEventListener('blur', () => { d.text = tx.textContent; tx.contentEditable = 'false'; delete el.dataset.editing; persist() })
  } else {
    const img = document.createElement('img'); img.src = d.src; img.alt = ''
    el.appendChild(img)
  }

  el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showItemMenu(e.clientX, e.clientY, d, el, board, layer) })

  const x = document.createElement('button'); x.className = 'mb2-item-x'; x.innerHTML = '&times;'
  x.addEventListener('click', e => { e.stopPropagation(); board.items = board.items.filter(i => i.id !== d.id); el.remove(); persist() })
  el.appendChild(x)

  // Move (pointer deltas divided by the board zoom so 1px of mouse = 1px of board)
  el.addEventListener('mousedown', e => {
    if (e.button !== 0 || el.dataset.editing || e.target.closest('.mb2-item-x') || e.target.closest('.mb2-h')) return
    e.preventDefault(); e.stopPropagation(); el.classList.add('drag')
    const sx = e.clientX, sy = e.clientY, ox = d.x, oy = d.y
    const mv = ev => {
      d.x = Math.max(0, Math.min(ox + (ev.clientX - sx) / _zoom, layer.clientWidth  - d.w))
      d.y = Math.max(0, Math.min(oy + (ev.clientY - sy) / _zoom, layer.clientHeight - d.h))
      apply()
    }
    const up = () => { el.classList.remove('drag'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); persist() }
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up)
  })

  // 8-direction resize (Shift = keep proportions). The pointer delta is
  // projected through the item's INVERSE rotation first — otherwise the
  // handles fight the axes on a rotated item — and divided by the board zoom.
  HANDLES.forEach(([name, hx, hy]) => {
    const h = document.createElement('span'); h.className = 'mb2-h mb2-h-' + name
    h.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation()
      const sx = e.clientX, sy = e.clientY, ox = d.x, oy = d.y, ow = d.w, oh = d.h, ar = ow / oh
      const rad = -((d.rot || 0) * Math.PI / 180)
      const cosR = Math.cos(rad), sinR = Math.sin(rad)
      const mv = ev => {
        const dxS = (ev.clientX - sx) / _zoom, dyS = (ev.clientY - sy) / _zoom
        const dx = dxS * cosR - dyS * sinR
        const dy = dxS * sinR + dyS * cosR
        let w = ow + hx * dx
        let h2 = oh + hy * dy
        if (ev.shiftKey && ar > 0) {
          if (hx && hy) h2 = w / ar
          else if (hx)  h2 = w / ar
          else          w  = h2 * ar
        }
        w = Math.max(MIN, w); h2 = Math.max(MIN, h2)
        d.w = w; d.h = h2
        d.x = hx < 0 ? ox + (ow - w)  : ox
        d.y = hy < 0 ? oy + (oh - h2) : oy
        apply()
      }
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); persist() }
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up)
    })
    el.appendChild(h)
  })

  // Rotation handle (Shift = snap to 15°)
  const rot = document.createElement('span'); rot.className = 'mb2-rot'
  rot.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation()
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const startA = Math.atan2(e.clientY - cy, e.clientX - cx), startRot = d.rot || 0
    const mv = ev => {
      let deg = startRot + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - startA) * 180 / Math.PI
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15
      d.rot = Math.round(deg); apply()
    }
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); persist() }
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up)
  })
  el.appendChild(rot)

  layer.appendChild(el)
  return el
}

export function enterBoard(board) {
  exitBoard()
  normalize(board)
  _activeId = board.id

  const layer = document.createElement('div'); layer.id = 'mb-board-layer'
  document.body.appendChild(layer)

  // Drawing canvas (behind items)
  const draw = document.createElement('canvas'); draw.className = 'mb2-draw'
  layer.appendChild(draw)
  const dctx = draw.getContext('2d')
  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1
    draw.width = Math.round(layer.clientWidth * dpr); draw.height = Math.round(layer.clientHeight * dpr)
    draw.style.width = layer.clientWidth + 'px'; draw.style.height = layer.clientHeight + 'px'
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0); redraw()
  }
  function redraw() {
    dctx.clearRect(0, 0, draw.width, draw.height)
    dctx.lineCap = 'round'; dctx.lineJoin = 'round'
    board.strokes.forEach(st => {
      dctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over'
      dctx.strokeStyle = st.color; dctx.lineWidth = st.size
      dctx.beginPath(); st.pts.forEach((p, i) => i ? dctx.lineTo(p[0], p[1]) : dctx.moveTo(p[0], p[1])); dctx.stroke()
    })
    dctx.globalCompositeOperation = 'source-over'
  }
  sizeCanvas()

  // ── Board zoom (Ctrl+wheel, zoom-in only 1×–2.5×; dblclick background resets).
  // The whole layer is scaled with the origin at the cursor; item drag/resize
  // handlers divide their pointer deltas by _zoom to stay 1:1.
  _zoom = 1
  const applyZoom = (ox, oy) => {
    layer.style.transformOrigin = `${ox}px ${oy}px`
    layer.style.transform = _zoom === 1 ? '' : `scale(${_zoom})`
  }
  layer.addEventListener('wheel', e => {
    if (!e.ctrlKey) return
    e.preventDefault()
    _zoom = Math.max(1, Math.min(2.5, _zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
    applyZoom(e.clientX, e.clientY)
  }, { passive: false })
  layer.addEventListener('dblclick', e => {
    if (e.target !== layer && e.target !== draw) return
    _zoom = 1; applyZoom(0, 0)
  })

  board.items.forEach(d => mountItem(layer, board, d))

  // ── Add helpers ─────────────────────────────────────────────────────────────
  // Default ink = the theme's text colour (white on dark themes, dark on light
  // ones), so new text and strokes are visible on the board until a colour is picked.
  let brushColor = themeColor('--text-primary'), brushSize = 6, brushOn = false, erasing = false
  function placeXY(x, y) {
    const n = board.items.length
    return { x: x != null ? Math.max(0, x) : 40 + (n * 26) % Math.max(40, layer.clientWidth - 260),
             y: y != null ? Math.max(0, y) : 40 + (n * 22) % Math.max(40, layer.clientHeight - 220) }
  }
  function addImage(src, x, y) {
    const d = { id: uid(), type: 'image', src, w: 220, h: 165, ...placeXY(x, y) }
    board.items.push(d)
    const el = mountItem(layer, board, d)
    persist()
    // Once loaded, give the tile its natural aspect ratio (clamped 60..420).
    const img = el.querySelector('img')
    if (img) {
      const fit = () => {
        const nw = img.naturalWidth, nh = img.naturalHeight
        if (!nw || !nh) return
        d.h = Math.max(60, Math.min(420, Math.round(220 * nh / nw)))
        el.style.height = d.h + 'px'
        persist()
      }
      if (img.complete && img.naturalWidth) fit(); else img.addEventListener('load', fit, { once: true })
    }
  }
  function addText() {
    const d = { id: uid(), type: 'text', text: t('mb_text_default'), color: brushColor, w: 200, h: 60, ...placeXY() }
    board.items.push(d); const el = mountItem(layer, board, d); persist()
    setTimeout(() => el.dispatchEvent(new MouseEvent('dblclick')), 0)
  }
  // Downscale imports so their longest side is ≤ 1600px before storing them as
  // data URLs (localStorage quota). PNG/WebP keep transparency, GIFs are kept
  // as-is to preserve animation, everything else becomes JPEG q0.85.
  function importFile(f, cb) {
    const r = new FileReader()
    r.onload = () => {
      if (f.type === 'image/gif') { cb(r.result); return }
      const im = new Image()
      im.onload = () => {
        const long = Math.max(im.naturalWidth, im.naturalHeight)
        if (!long || long <= 1600) { cb(r.result); return }
        const s = 1600 / long
        const c = document.createElement('canvas')
        c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s)
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
        const keepAlpha = f.type === 'image/png' || f.type === 'image/webp'
        cb(keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85))
      }
      im.onerror = () => cb(r.result)
      im.src = r.result
    }
    r.readAsDataURL(f)
  }
  const addFiles = (files, x, y) => [...files].filter(f => f.type.startsWith('image/')).forEach((f, i) => {
    importFile(f, src => addImage(src, x != null ? x + i * 22 : null, y != null ? y + i * 22 : null))
  })

  // ── Control bar ─────────────────────────────────────────────────────────────
  const bar = document.createElement('div'); bar.id = 'mb-board-bar'
  bar.innerHTML = `
    <span class="mb2-bname"><i class="fa-solid fa-images" style="opacity:.6;margin-right:5px;"></i>${board.name}</span>
    <span class="mb2-sep"></span>
    <button class="mb2-btn" id="mbb-add"><i class="fa-solid fa-image"></i> ${t('mb_add')}</button>
    <button class="mb2-btn" id="mbb-text"><i class="fa-solid fa-font"></i> ${t('mb_text')}</button>
    <button class="mb2-btn" id="mbb-brush"><i class="fa-solid fa-paintbrush"></i> ${t('mb_brush')}</button>
    <button class="mb2-btn" id="mbb-erase"><i class="fa-solid fa-eraser"></i> ${t('mb_eraser')}</button>
    <input class="mb2-color" id="mbb-color" type="color" value="${brushColor}" />
    <input class="mb2-range" id="mbb-size" type="range" min="1" max="32" value="6" />
    <input class="mb2-link" id="mbb-link" type="text" placeholder="${t('mb_link_placeholder')}" />
    <span class="mb2-sep"></span>
    <button class="mb2-btn mb2-icon-btn" id="mbb-export" title="${t('mb_export')}"><i class="fa-solid fa-download"></i></button>
    <button class="mb2-btn mb2-icon-btn" id="mbb-exit" title="${t('mb_exit')}"><i class="fa-solid fa-xmark"></i></button>
    <input type="file" id="mbb-file" accept="image/*,image/gif" multiple hidden />`
  document.body.appendChild(bar)

  const fileInp = bar.querySelector('#mbb-file')
  const colorInp = bar.querySelector('#mbb-color')
  const brushBtn = bar.querySelector('#mbb-brush')
  const eraseBtn = bar.querySelector('#mbb-erase')
  const updateDrawMode = () => {
    layer.classList.toggle('brush', brushOn)
    brushBtn.classList.toggle('on', brushOn && !erasing)
    eraseBtn.classList.toggle('on', brushOn && erasing)
  }
  bar.querySelector('#mbb-add').addEventListener('click', () => fileInp.click())
  fileInp.addEventListener('change', () => { addFiles(fileInp.files); fileInp.value = '' })
  bar.querySelector('#mbb-text').addEventListener('click', addText)
  colorInp.addEventListener('input', () => { brushColor = colorInp.value })
  const palBtn = document.createElement('button'); palBtn.className = 'mb2-btn mb2-icon-btn'; palBtn.innerHTML = '<i class="fa-solid fa-palette"></i>'
  palBtn.addEventListener('click', () => showPalPicker(palBtn, c => { brushColor = c; colorInp.value = c }))
  colorInp.insertAdjacentElement('afterend', palBtn)
  bar.querySelector('#mbb-size').addEventListener('input', e => { brushSize = parseInt(e.target.value, 10) })
  brushBtn.addEventListener('click', () => { if (brushOn && !erasing) brushOn = false; else { brushOn = true; erasing = false } updateDrawMode() })
  eraseBtn.addEventListener('click', () => { if (brushOn && erasing) brushOn = false; else { brushOn = true; erasing = true } updateDrawMode() })
  bar.querySelector('#mbb-link').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    const url = e.target.value.trim(); if (!url) return
    addImage(url); e.target.value = ''
  })
  bar.querySelector('#mbb-exit').addEventListener('click', exitBoard)

  // ── Export the board as a PNG into the library ─────────────────────────────
  bar.querySelector('#mbb-export').addEventListener('click', async () => {
    const W = layer.clientWidth, H = layer.clientHeight
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g = c.getContext('2d')
    g.fillStyle = getComputedStyle(layer).backgroundColor || '#0b0c11'
    g.fillRect(0, 0, W, H)
    g.drawImage(draw, 0, 0, W, H)   // strokes sit under the items, as on screen
    board.items.forEach(d => {
      g.save()
      g.translate(d.x + d.w / 2, d.y + d.h / 2)
      if (d.rot) g.rotate(d.rot * Math.PI / 180)
      if (d.type === 'text') {
        g.fillStyle = d.color || '#fff'
        g.font = '15px sans-serif'
        g.textBaseline = 'top'
        const maxW = Math.max(20, d.w - 20)
        const lines = []
        let line = ''
        String(d.text || '').split(/\s+/).filter(Boolean).forEach(word => {
          const cand = line ? line + ' ' + word : word
          if (line && g.measureText(cand).width > maxW) { lines.push(line); line = word } else line = cand
        })
        if (line) lines.push(line)
        lines.forEach((ln, i) => g.fillText(ln, -d.w / 2 + 10, -d.h / 2 + 8 + i * 19))
      } else {
        // Reuse the mounted <img> as draw source (object-fit:cover crop).
        const img = layer.querySelector(`.mb2-item[data-item-id="${d.id}"] img`)
        if (img && img.complete && img.naturalWidth) {
          const s = Math.max(d.w / img.naturalWidth, d.h / img.naturalHeight)
          const cw = d.w / s, ch = d.h / s
          g.drawImage(img, (img.naturalWidth - cw) / 2, (img.naturalHeight - ch) / 2, cw, ch, -d.w / 2, -d.h / 2, d.w, d.h)
        }
      }
      g.restore()
    })
    let url
    try { url = c.toDataURL('image/png') } catch { window.toast?.(t('mb_export_fail'), 'error'); return }
    const base = await promptName(board.name || 'moodboard', { title: t('mb_export') })
    const root = window.__TAURI__ && localStorage.getItem('library:root')
    if (root) {
      const sep = root.includes('\\') ? '\\' : '/'
      try {
        await window.__TAURI__.core.invoke('save_binary_file', { path: root + sep + 'Images' + sep + base + '.png', base64: url.split(',')[1] })
        window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Images' } }))
        window.toast?.(t('mb_exported') + ' : ' + base + '.png', 'success')
      } catch { window.toast?.(t('mb_export_fail'), 'error') }
    } else {
      const a = document.createElement('a'); a.href = url; a.download = base + '.png'; a.click()
    }
  })

  // Right-click on the board background: clear the drawing.
  layer.addEventListener('contextmenu', e => {
    if (e.target.closest('.mb2-item')) return
    e.preventDefault()
    buildMenu(e.clientX, e.clientY, [
      { icon: 'fa-solid fa-broom', label: t('mb_clear'), fn: () => { board.strokes.length = 0; redraw(); persist() } },
    ])
  })

  // ── Brush drawing ───────────────────────────────────────────────────────────
  draw.addEventListener('mousedown', e => {
    if (!brushOn || e.button !== 0) return
    e.preventDefault()
    const r = draw.getBoundingClientRect()
    const st = { color: brushColor, size: brushSize, erase: erasing, pts: [[e.clientX - r.left, e.clientY - r.top]] }
    const mv = ev => {
      st.pts.push([ev.clientX - r.left, ev.clientY - r.top])
      dctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over'
      dctx.strokeStyle = st.color; dctx.lineWidth = st.size; dctx.lineCap = 'round'; dctx.lineJoin = 'round'
      const n = st.pts.length
      dctx.beginPath(); dctx.moveTo(st.pts[n - 2][0], st.pts[n - 2][1]); dctx.lineTo(st.pts[n - 1][0], st.pts[n - 1][1]); dctx.stroke()
    }
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); dctx.globalCompositeOperation = 'source-over'; board.strokes.push(st); persist() }
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up)
  })

  _activeAdd = src => addImage(src)   // wire entry point for other tools

  // Drop image files anywhere while a board is open.
  _dropOver = e => { if (_activeId) e.preventDefault() }
  _dropEnd  = e => { if (!_activeId || !e.dataTransfer?.files?.length) return; e.preventDefault(); const r = layer.getBoundingClientRect(); addFiles(e.dataTransfer.files, e.clientX - r.left, e.clientY - r.top) }
  document.addEventListener('dragover', _dropOver)
  document.addEventListener('drop', _dropEnd)
  _onResize = () => sizeCanvas()
  window.addEventListener('resize', _onResize)

  // Keyboard: Escape exits, Delete removes the hovered item, Ctrl/Cmd+V pastes
  // a clipboard image (paste event, no navigator.clipboard permission needed).
  _onKey = e => {
    if (e.key === 'Escape') {
      if (document.querySelector('.rnd-overlay') || document.getElementById('pal-pp')) return
      if (document.getElementById('mb2-itemmenu')) { removeItemMenu(); return }
      const a = e.target
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) { a.blur(); return }
      e.preventDefault(); e.stopPropagation(); exitBoard()
      return
    }
    if (e.key === 'Delete') {
      const a = e.target
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
      const hov = layer.querySelector('.mb2-item:hover')
      if (!hov) return
      e.preventDefault()
      board.items = board.items.filter(i => i.id !== hov.dataset.itemId)
      hov.remove(); persist()
    }
  }
  document.addEventListener('keydown', _onKey, true)
  _onPaste = e => {
    if (!_activeId) return
    const files = [...(e.clipboardData?.items || [])].filter(it => it.type.startsWith('image/')).map(it => it.getAsFile()).filter(Boolean)
    if (!files.length) return
    e.preventDefault()
    addFiles(files)
  }
  document.addEventListener('paste', _onPaste)

  document.querySelectorAll('.mb2-card').forEach(c => c.classList.toggle('active', c.dataset.boardId === board.id))
}

export function exitBoard() {
  _activeId = null; _activeAdd = null; _zoom = 1
  removeItemMenu()
  document.getElementById('mb-board-layer')?.remove()
  document.getElementById('mb-board-bar')?.remove()
  if (_dropOver) document.removeEventListener('dragover', _dropOver)
  if (_dropEnd)  document.removeEventListener('drop', _dropEnd)
  if (_onResize) window.removeEventListener('resize', _onResize)
  if (_onKey)    document.removeEventListener('keydown', _onKey, true)
  if (_onPaste)  document.removeEventListener('paste', _onPaste)
  _dropOver = _dropEnd = _onResize = _onKey = _onPaste = null
  document.querySelectorAll('.mb2-card.active').forEach(c => c.classList.remove('active'))
}

// ── Boards manager window ─────────────────────────────────────────────────────
export function initMoodboard(body) {
  injectStyles()
  body.classList.add('mb2-body')

  function render() {
    body.innerHTML = `
      <div class="mb2-bar"><span class="mb2-title">${t('tool_moodboard')}</span></div>
      <div class="mb2-grid" id="mb2-grid"></div>`
    const grid = body.querySelector('#mb2-grid')
    boards.forEach(b => {
      normalize(b)
      const card = document.createElement('div')
      card.className = 'mb2-card' + (b.id === _activeId ? ' active' : '')
      card.dataset.boardId = b.id
      const cover = b.items?.find(i => i.type === 'image' && i.src)?.src
      if (cover) card.style.backgroundImage = `url(${cover})`
      else card.innerHTML = '<div class="mb2-card-empty"><i class="fa-solid fa-image"></i></div>'
      card.insertAdjacentHTML('beforeend', `<span class="mb2-card-name">${b.name}</span><button class="mb2-card-e" title="${t('mb_rename')}"><i class="fa-solid fa-pen"></i></button><button class="mb2-card-x" title="${t('mb_delete')}">&times;</button>`)
      card.addEventListener('click', e => { if (!e.target.closest('.mb2-card-x') && !e.target.closest('.mb2-card-e')) enterBoard(b) })
      card.querySelector('.mb2-card-e').addEventListener('click', async e => {
        e.stopPropagation()
        const n = await promptName(b.name, { title: t('mb_rename') })
        if (n != null) { b.name = n; persist(); render() }
      })
      // Two-click delete: first click arms the X (turns into a check), a second
      // click within 2s confirms.
      const xBtn = card.querySelector('.mb2-card-x')
      xBtn.addEventListener('click', e => {
        e.stopPropagation()
        if (!xBtn.dataset.arm) {
          xBtn.dataset.arm = '1'
          xBtn.innerHTML = '<i class="fa-solid fa-check"></i>'
          xBtn.style.background = 'var(--danger)'; xBtn.style.opacity = '1'
          setTimeout(() => {
            if (!xBtn.isConnected || !xBtn.dataset.arm) return
            delete xBtn.dataset.arm
            xBtn.innerHTML = '&times;'
            xBtn.style.background = ''; xBtn.style.opacity = ''
          }, 2000)
          return
        }
        if (b.id === _activeId) exitBoard()
        boards = boards.filter(x => x.id !== b.id); persist(); render()
      })
      grid.appendChild(card)
    })
    const add = document.createElement('button')
    add.className = 'mb2-card mb2-new-card'
    add.innerHTML = `<i class="fa-solid fa-plus"></i><span>${t('mb_new_board')}</span>`
    add.addEventListener('click', newBoard)
    grid.appendChild(add)
  }

  async function newBoard() {
    const name = await promptName(t('mb_board_default') + ' ' + (boards.length + 1), { title: t('mb_new_board') })
    const b = { id: uid(), name, items: [], strokes: [] }
    boards.push(b); persist(); render(); enterBoard(b)
  }

  render()

  // Media bus: an image sent here lands on the open board — or the most recent
  // one (created on the fly if none exists), which gets opened first.
  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (!m || m.kind !== 'image' || !m.dataUrl) return
    if (addImageToActiveBoard(m.dataUrl)) return
    let b = boards[boards.length - 1]
    if (!b) { b = { id: uid(), name: t('mb_board_default') + ' 1', items: [], strokes: [] }; boards.push(b); persist() }
    render(); enterBoard(b)
    addImageToActiveBoard(m.dataUrl)
  })

  registerCommands([
    { id: 'moodboard:new-board', titleKey: 'mb_new_board', icon: 'fa-solid fa-plus',  category: 'tool_moodboard', run: () => newBoard() },
    { id: 'moodboard:exit',      titleKey: 'mb_exit',      icon: 'fa-solid fa-xmark', category: 'tool_moodboard', run: () => exitBoard() },
  ])
  new MutationObserver((_, obs) => {
    if (!document.contains(body)) { exitBoard(); unregisterCommandsBy(c => c.id.startsWith('moodboard:')); obs.disconnect() }
  }).observe(document.body, { childList: true, subtree: true })
}
