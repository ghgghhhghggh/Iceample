// window-manager.js — Floating tool windows, picker, drag/resize
//
// Exports: TOOLS, openTools, openCtxTools, TOOL_INIT, initWindowManager,
//          focusWin, makeDraggable, makeResizable,
//          createToolWindow, spawnWindow, showPicker, hidePicker

import { t } from './i18n.js'
import { autoSaveLayout, getSavedState } from './layout.js'

// ── Tool definitions ──────────────────────────────────────────────────────────
export const TOOLS = [
  { id: 'daw',       labelKey: 'tool_daw',      icon: 'fa-solid fa-film',                w: 660, h: 320, domain: 'audio' },
  { id: 'mic',       labelKey: 'tool_mic',      icon: 'fa-solid fa-microphone',          w: 580, h: 290, domain: 'audio' },
  { id: 'mixer',     labelKey: 'tool_mixer',    icon: 'fa-solid fa-sliders',             w: 380, h: 300, domain: 'audio' },
  { id: 'sequencer', labelKey: 'tool_seq',      icon: 'fa-solid fa-table-cells',         w: 520, h: 300, domain: 'audio' },
  { id: 'editor',    labelKey: 'tool_editor',   icon: 'fa-solid fa-wand-magic-sparkles', w: 520, h: 560, domain: 'audio' },
  { id: 'piano',     labelKey: 'tool_piano',    icon: 'fa-solid fa-music',               w: 500, h: 330, domain: 'audio' },
  { id: 'eq',        labelKey: 'tool_eq',       icon: 'fa-solid fa-chart-line',          w: 480, h: 310, domain: 'audio' },
  { id: 'library',   labelKey: 'tool_library',  icon: 'fa-solid fa-folder-open',         w: 280, h: 380, domain: 'files' },
]

// Extra tools that live on the workbench. Now surfaced in the (domain-grouped)
// left-click menu too, alongside the audio tools.
export const EXTRA_TOOLS = [
  { id: 'player',    labelKey: 'tool_player',   icon: 'fa-solid fa-play',                w: 280, h: 150, domain: 'audio' },
  { id: 'writer',    labelKey: 'tool_writer',   icon: 'fa-solid fa-pen-nib',             w: 640, h: 520, domain: 'util' },
  { id: 'calc',      labelKey: 'tool_calc',     icon: 'fa-solid fa-calculator',          w: 280, h: 380, domain: 'util' },
  { id: 'units',     labelKey: 'tool_units',    icon: 'fa-solid fa-ruler-combined',      w: 320, h: 420, domain: 'util' },
  { id: 'imgedit',   labelKey: 'tool_imgedit',  icon: 'fa-solid fa-crop-simple',         w: 760, h: 560, domain: 'image' },
  { id: 'tool3d',    labelKey: 'tool_3d',       icon: 'fa-solid fa-cube',                w: 560, h: 440, domain: 'image' },
  { id: 'moodboard', labelKey: 'tool_moodboard',icon: 'fa-solid fa-images',              w: 460, h: 420, domain: 'image' },
  { id: 'palettes',  labelKey: 'tool_palettes', icon: 'fa-solid fa-palette',             w: 440, h: 430, domain: 'image' },
  { id: 'effects',   labelKey: 'tool_effects',  icon: 'fa-solid fa-wand-sparkles',       w: 720, h: 520, domain: 'image' },
  { id: 'textanim',   labelKey: 'tool_textanim',  icon: 'fa-solid fa-text-height',         w: 660, h: 540, domain: 'anim' },
  { id: 'bganim',     labelKey: 'tool_bganim',   icon: 'fa-solid fa-photo-film',          w: 720, h: 520, domain: 'anim' },
  { id: 'subtitles',  labelKey: 'tool_subtitles',icon: 'fa-solid fa-closed-captioning',   w: 900, h: 600, domain: 'anim' },
  { id: 'particles',  labelKey: 'tool_particles',icon: 'fa-solid fa-circle-nodes',        w: 760, h: 540, domain: 'anim' },
  { id: 'patterns',   labelKey: 'tool_patterns', icon: 'fa-solid fa-border-all',          w: 660, h: 480, domain: 'image' },
  { id: 'recent',     labelKey: 'tool_recent',   icon: 'fa-solid fa-clock-rotate-left',   w: 380, h: 480, domain: 'files' },
  { id: 'metadata',   labelKey: 'tool_metadata', icon: 'fa-solid fa-tags',                w: 560, h: 420, domain: 'files' },
  { id: 'converter',  labelKey: 'tool_converter', icon: 'fa-solid fa-rotate',             w: 680, h: 540, domain: 'files' },
  { id: 'pdftool',    labelKey: 'tool_pdftool',   icon: 'fa-solid fa-file-pdf',           w: 640, h: 520, domain: 'files' },
  { id: 'qrcode',     labelKey: 'tool_qrcode',   icon: 'fa-solid fa-qrcode',             w: 540, h: 420, domain: 'util' },
  { id: 'watermark',  labelKey: 'tool_watermark', icon: 'fa-solid fa-droplet',            w: 680, h: 500, domain: 'util' },
  // 'videorec' absorbed the old standalone cutter: it IS the video editor now
  // (timeline + ffmpeg actions), labeled "Montage vidéo". Recording moved out
  // to the dedicated 'recorder' tool.
  { id: 'videorec',   labelKey: 'tool_videocut',  icon: 'fa-solid fa-clapperboard',        w: 960, h: 620, domain: 'video' },
  { id: 'recorder',   labelKey: 'tool_recorder',  icon: 'fa-solid fa-record-vinyl',        w: 540, h: 470, domain: 'video' },
  { id: 'timelapse',  labelKey: 'tool_timelapse', icon: 'fa-solid fa-hourglass-half',      w: 620, h: 520, domain: 'video' },
  { id: 'rawtool',    labelKey: 'tool_rawtool',   icon: 'fa-solid fa-camera-retro',        w: 780, h: 560, domain: 'image' },
]

// ── State ─────────────────────────────────────────────────────────────────────
export const openTools    = new Set()
export const openCtxTools = new Set()

// Populated in DOMContentLoaded once workbench is known
export const TOOL_INIT = {}

// ── Callbacks injected by main.js ─────────────────────────────────────────────
let _updateDock = () => {}
let _lastArrangeSig = ''   // so re-clicking "arrange" gives a different layout

/** Call once from DOMContentLoaded to wire updateDock callback. */
export function initWindowManager({ updateDock }) {
  _updateDock = updateDock
}

// ── Drag / resize helpers ─────────────────────────────────────────────────────
const SNAP_THRESHOLD = 10
// Windows sit exactly flush (no gap, no overlap): each keeps its own border and
// they're glued edge-to-edge — without any content superposition.
const WIN_GAP = 0

function snapValue(val, targets, threshold) {
  for (const target of targets) {
    if (Math.abs(val - target) <= threshold) return target
  }
  return val
}

// ── Bounce physics (inertia on release) ───────────────────────────────────────
const PHYS_FRICTION    = 0.90  // velocity kept per frame (higher = glides longer)
const PHYS_RESTITUTION = 0.5   // bounciness on collision (0 = stop, 1 = perfect)
const PHYS_MIN_V       = 0.5   // px/frame below which motion stops
const PHYS_MAX_V       = 48    // clamp throw speed so it never feels brutal
const PHYS_THROW_MIN   = 1.6   // min release speed to trigger a throw
const PHYS_TRANSFER    = 0.35  // momentum passed to a window we hit
const PHYS_SHOVE_SPEED = 8     // speed given to a window shoved while dragging

/** Are window bounces enabled? (toggle in Settings → Display) */
function bouncesOn() {
  try { return localStorage.getItem('iceample:display:bounce') !== 'false' }
  catch { return true }
}

/** Stop any ongoing inertia on a window. */
function cancelThrow(win) {
  if (win && win._throwRAF) { cancelAnimationFrame(win._throwRAF); win._throwRAF = null }
}

/** Launch a window with velocity (vx,vy); it bounces off the workbench edges
 *  and other windows, losing energy until it settles. Hitting another window
 *  passes it some momentum so they nudge each other. */
function throwWin(win, vx, vy, workbench) {
  cancelThrow(win)
  vx = Math.max(-PHYS_MAX_V, Math.min(PHYS_MAX_V, vx))
  vy = Math.max(-PHYS_MAX_V, Math.min(PHYS_MAX_V, vy))

  const wb = workbench.getBoundingClientRect()
  let x = win.offsetLeft, y = win.offsetTop
  const w = win.offsetWidth, h = win.offsetHeight

  // Cache the obstacle elements once (querySelectorAll per frame is what makes
  // simultaneous throws stutter); we re-read their offsets each frame instead.
  const obstacles = [...workbench.querySelectorAll('.tool-win')].filter(el => el !== win)

  // Windows already overlapping at release are ignored until they separate,
  // so dropping a window ON TOP of another never makes it explode out.
  const ignore = new Set()
  obstacles.forEach(other => {
    const ol = other.offsetLeft, ot = other.offsetTop
    const ow = other.offsetWidth, oh = other.offsetHeight
    if (x < ol + ow && x + w > ol && y < ot + oh && y + h > ot) ignore.add(other)
  })

  function step() {
    if (!win.isConnected) { win._throwRAF = null; return }
    vx *= PHYS_FRICTION; vy *= PHYS_FRICTION
    x += vx; y += vy

    // Workbench edges
    if (x < 0)                  { x = 0;             vx =  Math.abs(vx) * PHYS_RESTITUTION }
    else if (x + w > wb.width)  { x = wb.width  - w; vx = -Math.abs(vx) * PHYS_RESTITUTION }
    if (y < 0)                  { y = 0;             vy =  Math.abs(vy) * PHYS_RESTITUTION }
    else if (y + h > wb.height) { y = wb.height - h; vy = -Math.abs(vy) * PHYS_RESTITUTION }

    // Other windows (axis-aligned bounding boxes)
    obstacles.forEach(other => {
      if (!other.isConnected) return
      const ol = other.offsetLeft, ot = other.offsetTop
      const ow = other.offsetWidth, oh = other.offsetHeight
      const overlap = (x < ol + ow && x + w > ol && y < ot + oh && y + h > ot)
      if (ignore.has(other)) { if (!overlap) ignore.delete(other); return }
      if (overlap) {
        const penL = (ol + ow) - x, penR = (x + w) - ol
        const penT = (ot + oh) - y, penB = (y + h) - ot
        const minH = Math.min(penL, penR), minV = Math.min(penT, penB)
        if (minH < minV) {
          const inVx = vx
          x = (penL < penR) ? ol + ow : ol - w
          vx = -inVx * PHYS_RESTITUTION
          if (!other._throwRAF && Math.abs(inVx) > 1) throwWin(other, inVx * PHYS_TRANSFER, 0, workbench)
        } else {
          const inVy = vy
          y = (penT < penB) ? ot + oh : ot - h
          vy = -inVy * PHYS_RESTITUTION
          if (!other._throwRAF && Math.abs(inVy) > 1) throwWin(other, 0, inVy * PHYS_TRANSFER, workbench)
        }
      }
    })

    // Safety: keep the window fully inside the workbench so its titlebar (and
    // close button) is always reachable — even if it's bigger than the area.
    x = Math.max(0, Math.min(x, Math.max(0, wb.width  - w)))
    y = Math.max(0, Math.min(y, Math.max(0, wb.height - h)))

    win.style.left = x + 'px'
    win.style.top  = y + 'px'

    if (Math.abs(vx) > PHYS_MIN_V || Math.abs(vy) > PHYS_MIN_V) {
      win._throwRAF = requestAnimationFrame(step)
    } else {
      win._throwRAF = null
      autoSaveLayout(workbench)
    }
  }
  win._throwRAF = requestAnimationFrame(step)
}

export function focusWin(win) {
  document.querySelectorAll('.tool-win').forEach(w => w.classList.remove('focused'))
  win.classList.add('focused')
}

// ── Maximize / restore ────────────────────────────────────────────────────────
export function toggleMaximizeWin(win, workbench) {
  if (!win) return
  cancelThrow(win)
  if (win.dataset.maxPrev) {
    const p = JSON.parse(win.dataset.maxPrev)
    win.style.left = p.l; win.style.top = p.t; win.style.width = p.w; win.style.height = p.h
    delete win.dataset.maxPrev
  } else {
    win.dataset.maxPrev = JSON.stringify({ l: win.style.left, t: win.style.top, w: win.style.width, h: win.style.height })
    win.style.left = '0px'; win.style.top = '0px'
    win.style.width = workbench.clientWidth + 'px'; win.style.height = workbench.clientHeight + 'px'
  }
  _syncMaxBtn(win)
  autoSaveLayout(workbench)
}

function _syncMaxBtn(win) {
  const ic = win.querySelector('.tool-win-max i')
  if (ic) ic.className = win.dataset.maxPrev ? 'fa-solid fa-compress' : 'fa-solid fa-expand'
}

// ── Edge snapping (drag against a border → half / full workbench) ─────────────
// A translucent accent overlay previews the target zone while dragging; on
// release the window adopts it. Its pre-snap size is kept in dataset.snapPrev
// so grabbing it again pops it back to its natural size under the cursor.
const SNAP_EDGE = 12   // px from a workbench edge that arms the snap zones

function _snapPreviewEl(workbench) {
  let el = workbench.querySelector('#snap-preview')
  if (!el) {
    el = document.createElement('div')
    el.id = 'snap-preview'
    workbench.appendChild(el)
  }
  return el
}

// Which zone is the pointer in? left/right halves, top = maximize.
function _snapZone(px, py, wb) {
  if (px <= SNAP_EDGE)             return 'left'
  if (px >= wb.width - SNAP_EDGE)  return 'right'
  if (py <= SNAP_EDGE)             return 'max'
  return null
}

function _snapRect(zone, wb) {
  if (zone === 'left')  return { x: 0, y: 0, w: Math.round(wb.width / 2), h: wb.height }
  if (zone === 'right') return { x: Math.round(wb.width / 2), y: 0, w: wb.width - Math.round(wb.width / 2), h: wb.height }
  return { x: 0, y: 0, w: wb.width, h: wb.height }   // 'max'
}

export function makeDraggable(win, handle, workbench) {
  let ox, oy, startX, startY
  handle.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    if (e.target.closest('.tool-win-close') || e.target.closest('.tool-win-max')) return
    e.preventDefault()
    focusWin(win)
    cancelThrow(win)                    // grabbing stops any inertia
    const bounce = bouncesOn()
    startX = e.clientX; startY = e.clientY

    // Grabbing a maximized/snapped window un-snaps it: back to its natural
    // size, re-centred under the cursor (same feel as Windows).
    for (const key of ['maxPrev', 'snapPrev']) {
      if (!win.dataset[key]) continue
      const p = JSON.parse(win.dataset[key])
      delete win.dataset[key]
      const w = parseFloat(p.w) || win.offsetWidth
      const relX = (e.clientX - win.getBoundingClientRect().left) / win.offsetWidth
      win.style.width = p.w; win.style.height = p.h
      win.style.left = Math.round(e.clientX - workbench.getBoundingClientRect().left - w * relX) + 'px'
      _syncMaxBtn(win)
    }

    ox = win.offsetLeft;  oy = win.offsetTop
    const wb = workbench.getBoundingClientRect()
    // Cache the other windows once for the whole drag (no per-move DOM queries).
    const otherWins = [...workbench.querySelectorAll('.tool-win')].filter(el => el !== win)

    let velX = 0, velY = 0              // smoothed pointer velocity (px/frame)
    let prevX = e.clientX, prevY = e.clientY
    let snapZone = null
    const snapPrev = _snapPreviewEl(workbench)

    function onMove(e) {
      const dx = e.clientX - startX, dy = e.clientY - startY
      let nx = Math.max(0, Math.min(ox + dx, wb.width  - win.offsetWidth))
      let ny = Math.max(0, Math.min(oy + dy, wb.height - win.offsetHeight))

      // Edge snap zones follow the raw pointer, not the clamped window.
      const zone = _snapZone(e.clientX - wb.left, e.clientY - wb.top, wb)
      if (zone !== snapZone) {
        snapZone = zone
        if (zone) {
          const r = _snapRect(zone, wb)
          snapPrev.style.left = r.x + 'px'; snapPrev.style.top = r.y + 'px'
          snapPrev.style.width = r.w + 'px'; snapPrev.style.height = r.h + 'px'
          snapPrev.classList.add('show')
        } else {
          snapPrev.classList.remove('show')
        }
      }

      // Magnetic snap — collect edges of other windows
      const snapX = [0, wb.width - win.offsetWidth]
      const snapY = [0, wb.height - win.offsetHeight]
      otherWins.forEach(other => {
        if (!other.isConnected) return
        const ol = other.offsetLeft, ot = other.offsetTop
        const or = ol + other.offsetWidth, ob = ot + other.offsetHeight
        snapX.push(ol, or - win.offsetWidth, or + WIN_GAP, ol - win.offsetWidth - WIN_GAP)
        snapY.push(ot, ob - win.offsetHeight, ob + WIN_GAP, ot - win.offsetHeight - WIN_GAP)
      })
      nx = snapValue(nx, snapX, SNAP_THRESHOLD)
      ny = snapValue(ny, snapY, SNAP_THRESHOLD)

      win.style.left = nx + 'px'
      win.style.top  = ny + 'px'

      // Bounce while dragging: shove away any window we run into.
      if (bounce) {
        const ww = win.offsetWidth, wh = win.offsetHeight
        const cx = nx + ww / 2, cy = ny + wh / 2
        otherWins.forEach(other => {
          if (other._throwRAF || !other.isConnected) return
          const ol = other.offsetLeft, ot = other.offsetTop
          const ow = other.offsetWidth, oh = other.offsetHeight
          // Real overlap only (tolerance T): a shared 1px border must not shove.
          const T = 4
          if (nx < ol + ow - T && nx + ww > ol + T && ny < ot + oh - T && ny + wh > ot + T) {
            let dx = (ol + ow / 2) - cx, dy = (ot + oh / 2) - cy
            if (dx === 0 && dy === 0) dx = 1
            const len = Math.hypot(dx, dy) || 1
            throwWin(other, (dx / len) * PHYS_SHOVE_SPEED, (dy / len) * PHYS_SHOVE_SPEED, workbench)
          }
        })
      }

      // Track release velocity from raw pointer movement (exp. moving average)
      velX = velX * 0.6 + (e.clientX - prevX) * 0.4
      velY = velY * 0.6 + (e.clientY - prevY) * 0.4
      prevX = e.clientX; prevY = e.clientY
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      snapPrev.classList.remove('show')
      // Dropped on a snap zone → adopt it (skip any throw).
      if (snapZone) {
        if (snapZone === 'max') {
          if (!win.dataset.maxPrev) toggleMaximizeWin(win, workbench)
        } else {
          if (!win.dataset.snapPrev) {
            win.dataset.snapPrev = JSON.stringify({ w: win.style.width, h: win.style.height })
          }
          const r = _snapRect(snapZone, wb)
          win.style.left = r.x + 'px'; win.style.top = r.y + 'px'
          win.style.width = r.w + 'px'; win.style.height = r.h + 'px'
        }
        autoSaveLayout(workbench)
        return
      }
      // Flick the window if released while moving; otherwise just settle.
      if (bounce && (Math.abs(velX) > PHYS_THROW_MIN || Math.abs(velY) > PHYS_THROW_MIN)) {
        throwWin(win, velX, velY, workbench)
      } else {
        autoSaveLayout(workbench)
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  })
}

export function makeResizable(win) {
  const dirs = ['n','s','e','w','nw','ne','sw','se']
  dirs.forEach(dir => {
    const h = document.createElement('div')
    h.className = `rz rz-${dir}`
    h.dataset.dir = dir
    win.appendChild(h)

    h.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      focusWin(win)
      cancelThrow(win)

      const startX = e.clientX, startY = e.clientY
      const startW = win.offsetWidth,  startH = win.offsetHeight
      const startL = win.offsetLeft,   startT = win.offsetTop

      function onMove(e) {
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        let w = startW, h = startH, l = startL, top = startT

        if (dir.includes('e')) w = Math.max(220, startW + dx)
        if (dir.includes('s')) h = Math.max(140, startH + dy)
        if (dir.includes('w')) { w = Math.max(220, startW - dx); l = startL + (startW - w) }
        if (dir.includes('n')) { h = Math.max(140, startH - dy); top = startT + (startH - h) }

        win.style.width  = w + 'px'
        win.style.height = h + 'px'
        win.style.left   = l + 'px'
        win.style.top    = top + 'px'
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup',   onUp)
        autoSaveLayout(win.closest('#workbench') ?? win.parentElement)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup',   onUp)
    })
  })
}

// ── Find a free, edge/neighbour-connected slot (no overlap) ───────────────────
// Packs windows top-left first, snapping each new one against the workbench
// border or an existing window's edge, so they tile without ever overlapping.
function findFreeSpot(w, h, workbench, prefX = 0, prefY = 0, ignoreEl = null) {
  const wb = workbench.getBoundingClientRect()
  const rects = [...workbench.querySelectorAll('.tool-win')]
    .filter(el => el !== ignoreEl)
    .map(el => ({
      l: el.offsetLeft, t: el.offsetTop,
      r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight,
    }))
  const clampX = x => Math.max(0, Math.min(x, Math.max(0, wb.width  - w)))
  const clampY = y => Math.max(0, Math.min(y, Math.max(0, wb.height - h)))
  const px = clampX(prefX), py = clampY(prefY)
  // Candidate anchors: preferred point, origin, window edges (aligned), and
  // positions just beside a window leaving WIN_GAP so borders never touch.
  const xs = new Set([px, 0]); const ys = new Set([py, 0])
  rects.forEach(r => {
    xs.add(r.l); xs.add(r.r - w); xs.add(r.r + WIN_GAP); xs.add(r.l - w - WIN_GAP)
    ys.add(r.t); ys.add(r.b - h); ys.add(r.b + WIN_GAP); ys.add(r.t - h - WIN_GAP)
  })
  const xList = [...new Set([...xs].map(clampX))]
  const yList = [...new Set([...ys].map(clampY))]
  // Keep at least WIN_GAP from every other window (inflate their boxes).
  const free = (x, y) => !rects.some(r =>
    x < r.r + WIN_GAP && x + w > r.l - WIN_GAP && y < r.b + WIN_GAP && y + h > r.t - WIN_GAP)
  // Pick the free slot closest to the preferred point.
  let best = null, bestD = Infinity
  for (const y of yList) for (const x of xList) {
    if (!free(x, y)) continue
    const dx = x - px, dy = y - py, d = dx * dx + dy * dy
    if (d < bestD) { bestD = d; best = { x, y } }
  }
  return best || { x: px, y: py }
}

// ── Tidy: re-tile every open window edge-to-edge, no overlap ──────────────────
// Gap-minimising "skyline" packing for one window order: each window goes to
// the topmost-leftmost free spot (uses the real sizes → shorter windows fill
// the gaps next to taller ones).
function _packWins(order, wb, GAP) {
  const placed = [], targets = []
  for (const w of order) {
    const ww = w.offsetWidth, hh = w.offsetHeight
    const xs = new Set([0]); const ys = new Set([0])
    placed.forEach(r => { xs.add(r.l); xs.add(r.r + GAP); ys.add(r.t); ys.add(r.b + GAP) })
    const xList = [...xs].filter(x => x >= 0 && x + ww <= wb.width  + 0.5).sort((a, b) => a - b)
    const yList = [...ys].filter(y => y >= 0 && y + hh <= wb.height + 0.5).sort((a, b) => a - b)
    const free = (x, y) => !placed.some(r => x < r.r + GAP && x + ww > r.l - GAP && y < r.b + GAP && y + hh > r.t - GAP)
    let pos = null
    for (const y of yList) { for (const x of xList) { if (free(x, y)) { pos = { x, y }; break } } if (pos) break }
    if (!pos) { const n = placed.length; pos = { x: Math.max(0, Math.min(n * 28, wb.width - ww)), y: Math.max(0, Math.min(n * 28, wb.height - hh)) } }
    placed.push({ l: pos.x, t: pos.y, r: pos.x + ww, b: pos.y + hh })
    targets.push([w, pos])
  }
  return { targets, blockW: Math.max(...placed.map(r => r.r)), blockH: Math.max(...placed.map(r => r.b)) }
}

export function arrangeWindows(workbench) {
  const wb = workbench.getBoundingClientRect()
  const wins = [...workbench.querySelectorAll('.tool-win')]
  if (!wins.length) return
  wins.forEach(cancelThrow)

  const GAP = 10
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]] } return a }
  const sig = c => { const m = new Map(c.targets); return wins.map(w => { const p = m.get(w); return p ? p.x + ',' + p.y : '' }).join('|') }

  // Try several random orders, keep the most compact — and prefer a layout that
  // differs from the previous one so re-clicking proposes a new arrangement.
  const cands = []
  for (let k = 0; k < 6; k++) cands.push(_packWins(shuffle(wins), wb, GAP))
  cands.sort((a, b) => (a.blockH - b.blockH) || (a.blockW - b.blockW))
  const chosen = cands.find(c => sig(c) !== _lastArrangeSig) || cands[0]
  _lastArrangeSig = sig(chosen)

  // Centre the packed cluster on the workspace (not jammed top-left).
  const offX = Math.max(0, Math.round((wb.width  - chosen.blockW) / 2))
  const offY = Math.max(0, Math.round((wb.height - chosen.blockH) / 2))
  chosen.targets.forEach(([w, pos]) => {
    w.classList.add('arranging')
    w.style.left = (pos.x + offX) + 'px'
    w.style.top  = (pos.y + offY) + 'px'
    setTimeout(() => w.classList.remove('arranging'), 340)
  })
  autoSaveLayout(workbench)
}

// ── Close every open window at once ───────────────────────────────────────────
export function closeAllWindows(workbench) {
  workbench.querySelectorAll('.tool-win').forEach(w => { cancelThrow(w); w.remove() })
  openTools.clear()
  openCtxTools.clear()
  autoSaveLayout(workbench)
  _updateDock()
}

// ── Build a floating tool window ──────────────────────────────────────────────
export function createToolWindow(tool, rawX, rawY, workbench, exact = false) {
  const wb  = workbench.getBoundingClientRect()

  // Restore saved size if available, clamped to the workbench.
  const saved = getSavedState(tool.id)
  let w = Math.min(saved ? (saved.w || tool.w) : tool.w, wb.width)
  let h = Math.min(saved ? (saved.h || tool.h) : tool.h, wb.height)

  // exact=true: place at the given coords directly (used for layout restore).
  // Otherwise shift to the nearest free slot so it never overlaps.
  const spot = exact
    ? { x: Math.max(0, Math.min(rawX, wb.width  - w)),
        y: Math.max(0, Math.min(rawY, wb.height - h)) }
    : findFreeSpot(w, h, workbench, rawX, rawY)
  const x = spot.x, y = spot.y

  // Entrance bounce based on which border the window landed against.
  const hitLeft   = x <= 2
  const hitRight  = x + w >= wb.width  - 2
  const hitTop    = y <= 2
  const hitBottom = y + h >= wb.height - 2

  const win = document.createElement('div')
  win.className = 'tool-win focused'
  win.style.left   = x + 'px'
  win.style.top    = y + 'px'
  win.style.width  = w + 'px'
  win.style.height = h + 'px'

  const BCLASSES = ['bounce-left','bounce-right','bounce-top','bounce-bottom']
  if (hitLeft)   win.classList.add('bounce-left')
  if (hitRight)  win.classList.add('bounce-right')
  if (hitTop)    win.classList.add('bounce-top')
  if (hitBottom) win.classList.add('bounce-bottom')
  const bounced = hitLeft || hitRight || hitTop || hitBottom
  if (!bounced) win.classList.add('win-enter')
  win.addEventListener('animationend', () => win.classList.remove(...BCLASSES, 'win-enter'), { once: true })
  win.dataset.toolId = tool.id

  const label = t(tool.labelKey)
  win.innerHTML = `
    <div class="tool-win-titlebar">
      <i class="${tool.icon}"></i>
      <span class="tool-win-title" data-i18n="${tool.labelKey}">${label}</span>
      <button class="tool-win-max" title="${t('sc_win_maximize')}" data-i18n-title="sc_win_maximize"><i class="fa-solid fa-expand"></i></button>
      <button class="tool-win-close" title="${t('close')}" data-i18n-title="close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="tool-win-body"></div>
  `

  // Strip focus from the others BEFORE appending, so the new window keeps its
  // own 'focused' class (spawnWindow already does it in this order).
  document.querySelectorAll('.tool-win').forEach(w => w.classList.remove('focused'))
  workbench.appendChild(win)

  const titlebar = win.querySelector('.tool-win-titlebar')
  makeDraggable(win, titlebar, workbench)
  makeResizable(win)
  win.querySelector('.tool-win-max').addEventListener('click', () => toggleMaximizeWin(win, workbench))
  titlebar.addEventListener('dblclick', e => {
    if (e.target.closest('button')) return
    toggleMaximizeWin(win, workbench)
  })

  // Init tool-specific content
  const initFn = TOOL_INIT[tool.id]
  if (initFn) initFn(win.querySelector('.tool-win-body'))

  win.dataset.toolId = tool.id
  win.querySelector('.tool-win-close').addEventListener('click', () => {
    const doClose = () => {
      openTools.delete(tool.id)
      win.remove()
      autoSaveLayout(workbench)
      _updateDock()
    }
    // A tool may register win._beforeClose(doClose) to confirm/cleanup first;
    // it then decides whether to call doClose() (e.g. after an unsaved-changes prompt).
    if (typeof win._beforeClose === 'function') win._beforeClose(doClose)
    else doClose()
  })

  win.addEventListener('mousedown', () => focusWin(win))

  return win
}

// ── Spawn an ad-hoc floating window (not tracked in openTools) ────────────────
export function spawnWindow(label, icon, w, h, initBodyFn, workbench, prefX, prefY) {
  const wb = workbench.getBoundingClientRect()
  // Near the requested point (cursor) if given, else centred — and never overlapping.
  const px = prefX != null ? prefX : (wb.width  - w) / 2
  const py = prefY != null ? prefY : (wb.height - h) / 2
  const spot = findFreeSpot(w, h, workbench, px, py)
  const x = spot.x, y = spot.y

  const win = document.createElement('div')
  win.className = 'tool-win focused win-enter'
  win.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`
  win.addEventListener('animationend', () => win.classList.remove('win-enter'), { once: true })

  win.innerHTML = `
    <div class="tool-win-titlebar">
      <i class="${icon}"></i>
      <span class="tool-win-title">${label}</span>
      <button class="tool-win-max" title="${t('sc_win_maximize')}"><i class="fa-solid fa-expand"></i></button>
      <button class="tool-win-close" title="${t('close')}"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="tool-win-body"></div>
  `

  document.querySelectorAll('.tool-win').forEach(w => w.classList.remove('focused'))
  workbench.appendChild(win)
  const sbTitlebar = win.querySelector('.tool-win-titlebar')
  makeDraggable(win, sbTitlebar, workbench)
  makeResizable(win)
  win.querySelector('.tool-win-max').addEventListener('click', () => toggleMaximizeWin(win, workbench))
  sbTitlebar.addEventListener('dblclick', e => {
    if (e.target.closest('button')) return
    toggleMaximizeWin(win, workbench)
  })

  Promise.resolve(initBodyFn(win.querySelector('.tool-win-body'))).catch(() => {})

  win.querySelector('.tool-win-close').addEventListener('click', () => win.remove())
  win.addEventListener('mousedown', () => focusWin(win))
  return win
}

// ── Tool picker ───────────────────────────────────────────────────────────────
export function showPicker(x, y, workbench) {
  const picker = document.getElementById('tool-picker')
  const list   = document.getElementById('tool-picker-list')
  list.innerHTML = ''

  const available = [...TOOLS, ...EXTRA_TOOLS].filter(tool => !openTools.has(tool.id))

  if (available.length === 0) {
    list.innerHTML = `<div id="tool-picker-empty">${t('all_tools_open')}</div>`
  } else {
    const ORDER = ['audio', 'image', 'video', 'files', 'util']
    const LABEL = { audio: 'cmd_dom_audio', image: 'cmd_dom_image', video: 'cmd_dom_video', files: 'cmd_dom_files', util: 'cmd_dom_util' }
    const byDom = {}
    available.forEach(tool => { const d = tool.domain || 'util'; (byDom[d] = byDom[d] || []).push(tool) })
    const order = ORDER.filter(d => byDom[d]).concat(Object.keys(byDom).filter(d => !ORDER.includes(d)))
    order.forEach((dom, di) => {
      const hdr = document.createElement('div')
      hdr.className = 'tool-picker-group'
      hdr.textContent = t(LABEL[dom] || dom)
      hdr.style.cssText = `font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-secondary,#888);opacity:0.7;padding:${di ? '9px' : '2px'} 12px 4px;`
      list.appendChild(hdr)
      const domTools = [...byDom[dom]].sort((a, b) => t(a.labelKey).length - t(b.labelKey).length)
      domTools.forEach(tool => {
        const btn = document.createElement('button')
        btn.className = 'tool-picker-item'
        btn.innerHTML = `<i class="${tool.icon}"></i>${t(tool.labelKey)}`
        btn.addEventListener('click', () => {
          openTools.add(tool.id)
          hidePicker()
          createToolWindow(tool, x, y, workbench)
          autoSaveLayout(workbench)
          _updateDock()
        })
        list.appendChild(btn)
      })
    })
  }

  const wb = workbench.getBoundingClientRect()
  picker.style.left = Math.min(x, wb.width  - 220) + 'px'
  picker.style.top  = Math.min(y, wb.height - 20)  + 'px'
  picker.classList.remove('hidden')
}

export function hidePicker() {
  document.getElementById('tool-picker').classList.add('hidden')
}
