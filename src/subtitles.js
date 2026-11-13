// subtitles.js — Éditeur de sous-titres animés avec timeline

import { trackRecentFile } from './recent.js'
import { t } from './i18n.js'
import { registerTool } from './project.js'
import { themeColor } from './theme.js'

let _uid = 0
function uid() { return ++_uid }

// Relative luminance of a '#rrggbb[aa]' block drawn over the '#rrggbb' bg (-1 if unparsable).
function blockLum(fill, bg) {
  const p = h => { const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(h)); return m ? [...m[1].match(/../g).map(x => parseInt(x, 16)), m[2] ? parseInt(m[2], 16) / 255 : 1] : null }
  const f = p(fill), b = p(bg)
  if (!f || !b) return -1
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const [r, g, bl] = [0, 1, 2].map(i => lin(f[i] * f[3] + b[i] * (1 - f[3])))
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}

function msToTime(ms) {
  const cs = Math.round(ms / 10)
  const h = Math.floor(cs / 360000); const rest = cs % 360000
  const m = Math.floor(rest / 6000); const r2 = rest % 6000
  const s = Math.floor(r2 / 100); const c = r2 % 100
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(c).padStart(2,'0')}0`
}
function msToVTT(ms) { return msToTime(ms).replace(',', '.') }

// ASS format: H:MM:SS.cc (single-digit hours, centiseconds)
function msToASS(ms) {
  const cs = Math.round(ms / 10)
  const h = Math.floor(cs / 360000); const rest = cs % 360000
  const m = Math.floor(rest / 6000); const r2 = rest % 6000
  const s = Math.floor(r2 / 100); const c = r2 % 100
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(c).padStart(2,'0')}`
}

// '#rrggbb' → ASS '&HAABBGGRR' (alpha 00 = opaque)
function hexToAss(hex, alpha = '00') {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  const rgb = m ? m[1] : 'ffffff'
  return `&H${alpha}${rgb.slice(4,6)}${rgb.slice(2,4)}${rgb.slice(0,2)}`.toUpperCase()
}

function timeToMs(str) {
  // HH:MM:SS,cs or HH:MM:SS.cs
  const m = str.match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  if (!m) return 0
  return (parseInt(m[1])*3600 + parseInt(m[2])*60 + parseInt(m[3])) * 1000 + Math.round(parseInt(m[4].slice(0,3).padEnd(3,'0')))
}

const EFFECTS = [
  { id: 'none',       labelKey: 'sub_fx_none' },
  { id: 'fade',       labelKey: 'sub_fx_fade' },
  { id: 'slide-up',   labelKey: 'sub_fx_slide_up' },
  { id: 'slide-down', labelKey: 'sub_fx_slide_down' },
  { id: 'typewriter', labelKey: 'sub_fx_typewriter' },
  { id: 'bounce',     labelKey: 'sub_fx_bounce' },
  { id: 'rotate',     labelKey: 'sub_fx_rotate' },
]

// Style presets — applied to the live preview AND carried into every export
// (baked into WebM frames, mapped to a [V4+ Styles] line in .ass).
// fill: 'white' = fixed white text, 'cue' = per-cue color. y = default y_pct
// for new cues (cues left at a preset default follow preset switches).
const STYLE_PRESETS = [
  { id: 'classic', labelKey: 'sub_style_classic', weight: 700, sizeMul: 1,    fill: 'white', outline: true,  band: false, glow: false, y: 80, assFont: 'Inter' },
  { id: 'band',    labelKey: 'sub_style_band',    weight: 600, sizeMul: 1,    fill: 'white', outline: false, band: true,  glow: false, y: 80, assFont: 'Inter' },
  { id: 'neon',    labelKey: 'sub_style_neon',    weight: 700, sizeMul: 1,    fill: 'cue',   outline: false, band: false, glow: true,  y: 80, assFont: 'Inter' },
  { id: 'pop',     labelKey: 'sub_style_pop',     weight: 900, sizeMul: 1.3,  fill: 'cue',   outline: true,  band: false, glow: false, y: 80, assFont: 'Inter' },
  { id: 'minimal', labelKey: 'sub_style_minimal', weight: 300, sizeMul: 0.9,  fill: 'white', outline: false, band: false, glow: false, y: 90, assFont: 'Inter' },
  { id: 'journal', labelKey: 'sub_style_journal', weight: 500, sizeMul: 0.75, fill: 'white', outline: true,  band: false, glow: false, y: 10, font: "Georgia, 'Times New Roman', serif", assFont: 'Georgia' },
]

function getSubProgress(t_ms, start, end) {
  // Returns 0..1 progress within subtitle, with ease-in/out
  const raw = (t_ms - start) / Math.max(1, end - start)
  return Math.max(0, Math.min(1, raw))
}

// Paints one line of subtitle text with the preset's treatment (band / glow /
// outline / plain). Colors here are exported content, not UI chrome.
function paintText(ctx, text, x, y, color, size, preset) {
  if (preset.band) {
    const w = ctx.measureText(text).width
    const padX = size * 0.45, padY = size * 0.28
    ctx.save()
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.beginPath()
    ctx.roundRect(x - w / 2 - padX, y - size / 2 - padY, w + padX * 2, size + padY * 2, size * 0.18)
    ctx.fill()
    ctx.restore()
  }
  if (preset.glow) {
    ctx.shadowColor = color
    ctx.shadowBlur = size * 0.6
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
    ctx.fillText(text, x, y) // double pass = stronger glow
    return
  }
  ctx.shadowColor = 'rgba(0,0,0,0.8)'
  ctx.shadowBlur = preset.outline ? 8 : 6
  if (preset.outline) {
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.lineWidth = Math.max(2, size / 10)
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

function drawSubtitle(ctx, W, H, sub, t_ms, preset = STYLE_PRESETS[0]) {
  if (t_ms < sub.start_ms || t_ms > sub.end_ms) return
  const p = getSubProgress(t_ms, sub.start_ms, sub.end_ms)
  const fadeDur = Math.min(0.15, 0.5 / Math.max(1, (sub.end_ms - sub.start_ms) / 1000))

  const size = Math.max(8, Math.round((sub.size || 28) * (preset.sizeMul || 1)))
  ctx.font = `${preset.weight || 700} ${size}px ${preset.font || "'Inter', 'Segoe UI', sans-serif"}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const baseX = W * ((sub.x_pct || 50) / 100)
  const baseY = H * ((sub.y_pct || 80) / 100)
  const color = preset.fill === 'cue' ? (sub.color || '#ffffff') : '#ffffff'

  // Compute alpha
  let alpha = 1
  if (sub.effect === 'fade') {
    if (p < fadeDur) alpha = p / fadeDur
    else if (p > 1 - fadeDur) alpha = (1 - p) / fadeDur
  }

  // Compute offset
  let offY = 0, offX = 0, rot = 0, scale = 1
  switch (sub.effect) {
    case 'slide-up': {
      const ease = p < 0.3 ? 1 - Math.pow(1 - p / 0.3, 3) : 1
      offY = (1 - ease) * 40
      alpha = p < 0.3 ? p / 0.3 : p > 0.85 ? (1 - p) / 0.15 : 1
      break
    }
    case 'slide-down': {
      const ease = p < 0.3 ? 1 - Math.pow(1 - p / 0.3, 3) : 1
      offY = -(1 - ease) * 40
      alpha = p < 0.3 ? p / 0.3 : p > 0.85 ? (1 - p) / 0.15 : 1
      break
    }
    case 'bounce': {
      if (p < 0.25) {
        const t = p / 0.25
        const bounce = Math.sin(t * Math.PI) * 12 * (1 - t * 0.5)
        offY = -bounce
        scale = 1 + (1 - Math.cos(t * Math.PI)) * 0.08
      }
      break
    }
    case 'rotate': {
      if (p < 0.25) rot = (1 - p / 0.25) * -15 * (Math.PI / 180)
      alpha = p < 0.1 ? p / 0.1 : p > 0.9 ? (1 - p) / 0.1 : 1
      break
    }
  }

  const x = baseX + offX
  const y = baseY + offY

  if (sub.effect === 'typewriter') {
    const chars = Math.floor(p * (sub.text.length + 1))
    const visible = sub.text.slice(0, chars)
    ctx.save()
    ctx.globalAlpha = alpha
    paintText(ctx, visible, x, y, color, size, preset)
    ctx.restore()
    return
  }

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.translate(x, y)
  if (rot !== 0) ctx.rotate(rot)
  if (scale !== 1) ctx.scale(scale, scale)
  paintText(ctx, sub.text, 0, 0, color, size, preset)
  ctx.restore()
}

export function initSubtitles(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;overflow:hidden;outline:none;'
  body.tabIndex = -1 // lets Ctrl+Enter work after clicking anywhere in the tool

  const BTN = 'border:none;border-radius:5px;padding:5px 10px;cursor:pointer;font-size:11px;font-family:inherit;'
  const GHOST = BTN + 'background:var(--surface2);border:1px solid var(--win-border-in);color:var(--text-primary);'
  const INP = 'background:var(--surface2);border:1px solid var(--win-border-in);color:var(--text-primary);border-radius:5px;padding:4px 8px;font-size:11px;outline:none;'

  // State
  let subs = []
  let selectedId = null
  let playhead = 0  // ms
  let playing = false
  let raf = null
  let playStart = null
  let playOffset = 0
  let stylePreset = STYLE_PRESETS.find(p => p.id === localStorage.getItem('iceample:subtitles:style')) || STYLE_PRESETS[0]

  // ── Layout ────────────────────────────────────────────────────────────────

  // Top: toolbar
  const toolbar = document.createElement('div')
  toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--win-border-in);flex-shrink:0;'

  const addBtn = document.createElement('button')
  addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span></span>'
  addBtn.querySelector('span').textContent = t('sub_add')
  addBtn.title = t('sub_add_hint')
  addBtn.style.cssText = BTN + 'background:var(--btn-primary);color:var(--on-accent);'

  const autoBtn = document.createElement('button')
  autoBtn.style.cssText = GHOST
  function setAutoBtnLabel(busy) {
    autoBtn.innerHTML = `<i class="fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}"></i> <span></span>`
    autoBtn.querySelector('span').textContent = t('sub_auto')
  }
  setAutoBtnLabel(false)

  const playBtn = document.createElement('button')
  playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'
  playBtn.style.cssText = GHOST + 'min-width:32px;'

  const timeLbl = document.createElement('span')
  timeLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);min-width:90px;font-variant-numeric:tabular-nums;'
  timeLbl.textContent = '00:00:00,000'

  const spacer = document.createElement('div'); spacer.style.flex = '1'

  const exportSrtBtn = document.createElement('button')
  exportSrtBtn.innerHTML = '<i class="fa-solid fa-file-lines"></i> SRT'
  exportSrtBtn.style.cssText = GHOST

  const exportVttBtn = document.createElement('button')
  exportVttBtn.innerHTML = '<i class="fa-solid fa-file-code"></i> VTT'
  exportVttBtn.style.cssText = GHOST

  const exportAssBtn = document.createElement('button')
  exportAssBtn.innerHTML = '<i class="fa-solid fa-closed-captioning"></i> ASS'
  exportAssBtn.style.cssText = GHOST

  const exportWebmBtn = document.createElement('button')
  exportWebmBtn.innerHTML = '<i class="fa-solid fa-video"></i> WebM'
  exportWebmBtn.style.cssText = GHOST

  toolbar.append(addBtn, autoBtn, playBtn, timeLbl, spacer, exportSrtBtn, exportVttBtn, exportAssBtn, exportWebmBtn)

  // Style preset cards — the 'Aa' chips mimic exported content over video,
  // hence the literal colors inside the dark sample chip.
  const styleRow = document.createElement('div')
  styleRow.style.cssText = 'display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid var(--win-border-in);overflow-x:auto;flex-shrink:0;'
  const SAMPLES = {
    classic: 'color:#fff;font-weight:700;font-size:12px;text-shadow:0 0 2px #000,0 1px 2px #000;',
    band:    'color:#fff;font-weight:600;font-size:11px;background:rgba(0,0,0,0.6);padding:0 5px;border-radius:3px;',
    neon:    'color:#4da3ff;font-weight:700;font-size:12px;text-shadow:0 0 6px #4da3ff;',
    pop:     'color:#fff;font-weight:900;font-size:14px;text-shadow:0 0 2px #000;',
    minimal: 'color:#fff;font-weight:300;font-size:11px;',
    journal: "color:#fff;font-family:Georgia,serif;font-size:10px;",
  }
  const styleCards = []
  for (const p of STYLE_PRESETS) {
    const card = document.createElement('button')
    card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px 10px;border-radius:6px;cursor:pointer;background:var(--surface2);border:1px solid var(--win-border-in);flex-shrink:0;font-family:inherit;'
    const chip = document.createElement('span')
    chip.style.cssText = 'display:flex;align-items:center;justify-content:center;width:52px;height:24px;border-radius:4px;background:#0a0a0a;overflow:hidden;'
    const sample = document.createElement('span')
    sample.textContent = 'Aa'
    sample.style.cssText = SAMPLES[p.id] || ''
    chip.appendChild(sample)
    const name = document.createElement('span')
    name.style.cssText = 'font-size:9px;color:var(--text-secondary);white-space:nowrap;'
    name.textContent = t(p.labelKey)
    card.append(chip, name)
    card.addEventListener('click', () => setStylePreset(p))
    styleCards.push({ card, preset: p })
    styleRow.appendChild(card)
  }
  function refreshStyleCards() {
    for (const { card, preset: p } of styleCards) {
      const on = p.id === stylePreset.id
      card.style.borderColor = on ? 'var(--color-active)' : 'var(--win-border-in)'
      card.style.background = on ? 'color-mix(in srgb, var(--color-active) 14%, transparent)' : 'var(--surface2)'
    }
  }
  function setStylePreset(p) {
    const prev = stylePreset
    stylePreset = p
    localStorage.setItem('iceample:subtitles:style', p.id)
    // Cues still sitting at the previous preset's default height follow along;
    // manually positioned cues keep their place.
    for (const s of subs) if (s.y_pct === prev.y) s.y_pct = p.y
    refreshStyleCards()
    buildProps()
    render()
  }
  refreshStyleCards()

  // Middle: preview + props
  const middle = document.createElement('div')
  middle.style.cssText = 'display:flex;flex:1;overflow:hidden;'

  // Canvas preview (letterbox stays dark on every theme, tinted by --bg)
  const canvasWrap = document.createElement('div')
  canvasWrap.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--bg) 30%, #000);position:relative;overflow:hidden;'

  const canvas = document.createElement('canvas')
  canvas.width = 640; canvas.height = 360
  canvas.style.cssText = 'max-width:100%;max-height:100%;display:block;'
  const ctx = canvas.getContext('2d')
  canvasWrap.appendChild(canvas)

  // Props panel
  const props = document.createElement('div')
  props.style.cssText = 'width:220px;flex-shrink:0;border-left:1px solid var(--win-border-in);overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;'

  const propsTitle = document.createElement('div')
  propsTitle.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  propsTitle.textContent = t('sub_select_hint')
  props.appendChild(propsTitle)

  middle.append(canvasWrap, props)

  // Bottom: timeline
  const timelineWrap = document.createElement('div')
  timelineWrap.style.cssText = 'height:100px;flex-shrink:0;border-top:1px solid var(--win-border-in);position:relative;overflow-x:auto;overflow-y:hidden;background:var(--surface2);'

  const PX_PER_MS = 0.05 // 20s = 1000px by default
  let totalDuration = 30000 // ms — grows as subtitles are added

  const timeline = document.createElement('canvas')
  timeline.height = 100
  timeline.style.cssText = 'display:block;cursor:pointer;'
  const tctx = timeline.getContext('2d')
  timelineWrap.appendChild(timeline)

  // Playhead line (overlay)
  const playheadLine = document.createElement('div')
  playheadLine.style.cssText = 'position:absolute;top:0;bottom:0;width:1px;background:var(--color-active);pointer-events:none;z-index:10;'
  timelineWrap.appendChild(playheadLine)

  body.append(toolbar, styleRow, middle, timelineWrap)

  // Focus the tool on interaction so the Ctrl+Enter shortcut is live
  canvasWrap.addEventListener('mousedown', () => body.focus({ preventScroll: true }))
  timelineWrap.addEventListener('mousedown', () => body.focus({ preventScroll: true }))

  // ── Rendering ─────────────────────────────────────────────────────────────

  const COLORS = ['#4da3ff','#52b152','#e09052','#e05252','#9052e0','#52e0e0']
  let colorIdx = 0

  function renderCanvas() {
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)
    if (bgVideo && bgVideo.readyState >= 2) {
      // Video background (media bus): cover-fit the current frame, kept in sync
      // with the playhead by syncBgVideo().
      syncBgVideo()
      const vw = bgVideo.videoWidth || W, vh = bgVideo.videoHeight || H
      const s = Math.max(W / vw, H / vh)
      const dw = vw * s, dh = vh * s
      try { ctx.drawImage(bgVideo, (W - dw) / 2, (H - dh) / 2, dw, dh) } catch {}
    } else {
      // Draw grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let y = H/3; y < H; y += H/3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
      for (let x = W/3; x < W; x += W/3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    }

    for (const sub of subs) {
      drawSubtitle(ctx, W, H, sub, playhead, stylePreset)
    }
  }

  // ── Video background (media bus wire from the recorder & co.) ─────────────
  let bgVideo = null
  let bgVideoPath = null  // kept when the bus media came from a file on disk
  let mediaDurMs = 0      // bg video length — keeps updateTotalDuration from shrinking below it
  function syncBgVideo() {
    if (!bgVideo || !isFinite(bgVideo.duration)) return
    const target = Math.min(playhead / 1000, Math.max(0, bgVideo.duration - 0.001))
    if (Math.abs((bgVideo.currentTime || 0) - target) > 0.08) {
      try { bgVideo.currentTime = target } catch {}
    }
  }
  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (!m || m.kind !== 'video') return
    const src = m.blobUrl || (m.path ? 'file://' + String(m.path).replace(/\\/g, '/') : null)
    if (!src) return
    const v = document.createElement('video')
    v.muted = true; v.preload = 'auto'
    v.addEventListener('loadeddata', () => {
      bgVideo = v
      bgVideoPath = m.path ? String(m.path) : null
      if (isFinite(v.duration)) {
        mediaDurMs = Math.round(v.duration * 1000)
        totalDuration = Math.max(totalDuration, mediaDurMs)
      }
      // A seek finishing means a fresh frame is available — repaint.
      v.addEventListener('seeked', () => renderCanvas())
      render()
    })
    v.addEventListener('error', () => window.toast?.(t('sub_video_error'), 'error'))
    v.src = src
  })

  // Theme tokens as canvas-usable #rrggbb (themeColor resolves color-mix values)
  function themeColors() {
    return {
      surface2: themeColor('--surface2'),
      textSec:  themeColor('--text-secondary'),
      textPri:  themeColor('--text-primary'),
    }
  }

  function renderTimeline() {
    const W = Math.max(timelineWrap.clientWidth, Math.ceil(totalDuration * PX_PER_MS) + 40)
    timeline.width = W
    const H = 100
    tctx.clearRect(0, 0, W, H)
    const th = themeColors()
    const lightBg = blockLum(th.surface2, th.surface2) > 0.5

    // Background
    tctx.fillStyle = th.surface2
    tctx.fillRect(0, 0, W, H)

    // Time markers
    tctx.font = '9px monospace'
    tctx.textAlign = 'center'
    const step = 5000 // every 5s
    for (let t = 0; t <= totalDuration + step; t += step) {
      const x = t * PX_PER_MS
      tctx.save()
      tctx.globalAlpha = 0.25
      tctx.strokeStyle = th.textSec
      tctx.lineWidth = 1
      tctx.beginPath(); tctx.moveTo(x, 18); tctx.lineTo(x, H); tctx.stroke()
      tctx.restore()
      const s = Math.floor(t / 1000)
      tctx.fillStyle = th.textSec
      tctx.fillText(s + 's', x, 12)
    }

    // Subtitle blocks
    const ROW_TOP = 22, ROW_H = 60
    for (const sub of subs) {
      const x = sub.start_ms * PX_PER_MS
      const w = Math.max(4, (sub.end_ms - sub.start_ms) * PX_PER_MS)
      const isSelected = sub.id === selectedId

      const fill = isSelected ? sub.color || COLORS[0] : (sub.color ? sub.color + '99' : COLORS[0] + '88')
      tctx.fillStyle = fill
      tctx.strokeStyle = isSelected ? th.textPri : 'transparent'
      tctx.lineWidth = isSelected ? 1.5 : 0
      tctx.beginPath()
      tctx.roundRect(x + 1, ROW_TOP + 2, w - 2, ROW_H - 4, 4)
      tctx.fill()
      if (isSelected) tctx.stroke()

      // Label (white + shadow for contrast on the colored content blocks;
      // on light themes a light block gets the dark text colour instead)
      if (w > 20) {
        tctx.save()
        if (lightBg && blockLum(fill, th.surface2) > 0.18) tctx.fillStyle = th.textPri
        else {
          tctx.shadowColor = 'rgba(0,0,0,0.6)'
          tctx.shadowBlur = 2
          tctx.fillStyle = '#fff'
        }
        tctx.font = `${Math.min(11, w / 3)}px 'Inter', sans-serif`
        tctx.textAlign = 'left'
        const label = sub.text.length > 20 ? sub.text.slice(0, 20) + '…' : sub.text
        tctx.fillText(label, x + 5, ROW_TOP + ROW_H / 2 + 3)
        tctx.restore()
      }
    }

    // Playhead position
    playheadLine.style.left = (playhead * PX_PER_MS) + 'px'
  }

  function render() { renderCanvas(); renderTimeline() }

  // ── Playback ──────────────────────────────────────────────────────────────

  function updateTimeLbl() {
    const h = Math.floor(playhead / 3600000)
    const m = Math.floor((playhead % 3600000) / 60000)
    const s = Math.floor((playhead % 60000) / 1000)
    const ms = playhead % 1000
    timeLbl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(Math.floor(ms)).padStart(3,'0')}`
  }

  function tick() {
    if (!playing) return
    const now = performance.now()
    playhead = playOffset + (now - playStart)
    if (playhead > totalDuration) {
      playhead = 0; playing = false
      playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'
      playStart = null
    }
    updateTimeLbl()
    render()
    if (playing) raf = requestAnimationFrame(tick)
  }

  function togglePlay() {
    playing = !playing
    if (playing) {
      playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'
      playStart = performance.now()
      playOffset = playhead
      raf = requestAnimationFrame(tick)
    } else {
      playBtn.innerHTML = '<i class="fa-solid fa-play"></i>'
      cancelAnimationFrame(raf)
    }
  }

  playBtn.addEventListener('click', togglePlay)

  function seekTo(ms) {
    playhead = Math.max(0, ms)
    playOffset = playhead
    if (playing) playStart = performance.now()
    updateTimeLbl()
    render()
  }

  // Timeline click = seek
  timeline.addEventListener('click', e => {
    const rect = timeline.getBoundingClientRect()
    const x = e.clientX - rect.left // canvas rect already accounts for wrap scroll
    seekTo(x / PX_PER_MS)
  })

  // ── Subtitle management ───────────────────────────────────────────────────

  function updateTotalDuration() {
    const maxEnd = subs.reduce((m, s) => Math.max(m, s.end_ms), 30000)
    totalDuration = Math.max(30000, maxEnd + 5000, mediaDurMs)
  }

  function selectSub(id) {
    selectedId = id
    buildProps()
    render()
  }

  function addSub(atMs) {
    const start = Math.max(0, Math.round((atMs ?? Math.floor(playhead / 1000) * 1000) / 10) * 10)
    const newSub = {
      id: uid(), text: t('sub_new_text'), start_ms: start, end_ms: start + 3000,
      effect: 'fade', x_pct: 50, y_pct: stylePreset.y, size: 28, color: COLORS[colorIdx % COLORS.length],
    }
    colorIdx++
    subs.push(newSub)
    updateTotalDuration()
    selectSub(newSub.id)
    render()
  }

  function deleteSub(id) {
    subs = subs.filter(s => s.id !== id)
    if (selectedId === id) { selectedId = null; buildProps() }
    updateTotalDuration()
    render()
  }

  function mergeWithNext(id) {
    const sub = subs.find(s => s.id === id)
    if (!sub) return
    const next = subs
      .filter(s => s.id !== id && s.start_ms >= sub.start_ms)
      .sort((a, b) => a.start_ms - b.start_ms)[0]
    if (!next) { window.toast?.(t('sub_merge_none'), 'info'); return }
    sub.text = (sub.text + ' ' + next.text).trim()
    sub.end_ms = Math.max(sub.end_ms, next.end_ms)
    subs = subs.filter(s => s.id !== next.id)
    updateTotalDuration()
    selectSub(sub.id)
  }

  function splitAtPlayhead(id) {
    const sub = subs.find(s => s.id === id)
    if (!sub) return
    const cut = Math.round(playhead / 10) * 10
    if (cut <= sub.start_ms + 50 || cut >= sub.end_ms - 50) {
      window.toast?.(t('sub_split_outside'), 'info')
      return
    }
    // Split the words proportionally to the cut position
    const words = sub.text.split(/\s+/).filter(Boolean)
    let textA = sub.text, textB = sub.text
    if (words.length > 1) {
      const frac = (cut - sub.start_ms) / (sub.end_ms - sub.start_ms)
      const k = Math.max(1, Math.min(words.length - 1, Math.round(words.length * frac)))
      textA = words.slice(0, k).join(' ')
      textB = words.slice(k).join(' ')
    }
    const second = { ...sub, id: uid(), text: textB, start_ms: cut }
    sub.text = textA
    sub.end_ms = cut
    subs.splice(subs.indexOf(sub) + 1, 0, second)
    updateTotalDuration()
    selectSub(sub.id)
  }

  addBtn.addEventListener('click', () => addSub())

  // Ctrl+Enter = add a cue at the exact playhead position
  body.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      addSub(playhead)
    }
  })

  // ── Auto-transcription (whisper.cpp) ──────────────────────────────────────

  function parseSRT(text) {
    const cues = []
    const blocks = String(text).replace(/\r/g, '').split(/\n\n+/)
    for (const block of blocks) {
      const lines = block.split('\n').filter(l => l.trim() !== '')
      const ti = lines.findIndex(l => l.includes('-->'))
      if (ti === -1) continue
      const m = lines[ti].match(/(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)/)
      if (!m) continue
      const txt = lines.slice(ti + 1).join('\n').trim()
      if (!txt) continue
      cues.push({ start: timeToMs(m[1]), end: timeToMs(m[2]), text: txt })
    }
    return cues
  }

  let setupOverlay = null

  function openWhisperSetup(videoPath) {
    if (setupOverlay) { setupOverlay.remove(); setupOverlay = null }
    body.style.position = 'relative'
    const overlay = document.createElement('div')
    setupOverlay = overlay
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:40;'
    const closeOverlay = () => { overlay.remove(); if (setupOverlay === overlay) setupOverlay = null }

    const panel = document.createElement('div')
    panel.style.cssText = 'background:var(--surface2);border:1px solid var(--win-border-in);border-radius:10px;padding:14px;width:280px;max-width:85%;display:flex;flex-direction:column;gap:10px;box-shadow:0 10px 28px -10px rgba(0,0,0,.6);'

    const head = document.createElement('div')
    head.style.cssText = 'display:flex;align-items:center;gap:8px;'
    const title = document.createElement('div')
    title.style.cssText = 'flex:1;font-size:12px;font-weight:600;color:var(--text-primary);'
    title.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> <span></span>'
    title.querySelector('span').textContent = t('sub_auto')
    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
    closeBtn.style.cssText = 'border:none;background:none;color:var(--text-secondary);cursor:pointer;font-size:13px;padding:2px 6px;'
    closeBtn.addEventListener('click', closeOverlay)
    head.append(title, closeBtn)

    const desc = document.createElement('div')
    desc.style.cssText = 'font-size:11px;color:var(--text-secondary);line-height:1.5;'
    desc.textContent = t('sub_whisper_setup')

    const shortName = p => p ? p.split(/[\\/]/).pop() : '—'
    const goBtn = document.createElement('button')

    function refreshGo() {
      const ok = localStorage.getItem('iceample:whisper:exe') && localStorage.getItem('iceample:whisper:model')
      goBtn.disabled = !ok
      goBtn.style.opacity = ok ? '1' : '0.5'
    }

    function pickerRow(labelKey, storageKey, filterName, exts) {
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;'
      const btn = document.createElement('button')
      btn.style.cssText = BTN + 'background:var(--surface);border:1px solid var(--win-border-in);color:var(--text-primary);width:100%;text-align:left;'
      btn.innerHTML = '<i class="fa-solid fa-folder-open"></i> <span></span>'
      btn.querySelector('span').textContent = t(labelKey)
      const lbl = document.createElement('div')
      lbl.style.cssText = 'font-size:10px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
      lbl.textContent = shortName(localStorage.getItem(storageKey))
      btn.addEventListener('click', async () => {
        try {
          const r = await window.__TAURI__.core.invoke('pick_files_with_filter', { filterName, extensions: exts })
          if (r && r.length) {
            localStorage.setItem(storageKey, r[0])
            lbl.textContent = shortName(r[0])
            refreshGo()
          }
        } catch (e) { window.toast?.(String(e), 'error') }
      })
      wrap.append(btn, lbl)
      return wrap
    }

    const exeRow   = pickerRow('sub_whisper_pick_exe', 'iceample:whisper:exe', 'whisper-cli', ['exe'])
    const modelRow = pickerRow('sub_whisper_pick_model', 'iceample:whisper:model', 'GGML', ['bin'])

    const note = document.createElement('div')
    note.style.cssText = 'font-size:10px;color:var(--text-secondary);line-height:1.5;opacity:0.8;'
    note.textContent = t('sub_whisper_where')   // the key's text already carries the URL

    goBtn.style.cssText = BTN + 'background:var(--btn-primary);color:var(--on-accent);'
    goBtn.textContent = t('sub_whisper_ok')
    goBtn.addEventListener('click', () => {
      const exe = localStorage.getItem('iceample:whisper:exe')
      const model = localStorage.getItem('iceample:whisper:model')
      if (!exe || !model) return
      closeOverlay()
      doTranscribe(videoPath, exe, model)
    })
    refreshGo()

    panel.append(head, desc, exeRow, modelRow, note, goBtn)
    overlay.appendChild(panel)
    body.appendChild(overlay)
  }

  async function doTranscribe(videoPath, exePath, modelPath) {
    const invoke = window.__TAURI__.core.invoke
    autoBtn.disabled = true
    setAutoBtnLabel(true)
    window.toast?.(t('sub_working'), 'info')
    try {
      // Predictable wav name next to the video (left on disk on purpose)
      const wavPath = videoPath + '.whisper.wav'
      await invoke('ffmpeg_run', { args: ['-i', videoPath, '-ar', '16000', '-ac', '1', '-y', wavPath] })
      const storedLang = localStorage.getItem('iceample:lang')
      const lang = storedLang ? storedLang.slice(0, 2) : 'auto'
      const srt = await invoke('whisper_transcribe', { exePath, modelPath, audioPath: wavPath, lang })
      const cues = parseSRT(srt)
      const color = COLORS[colorIdx % COLORS.length]
      colorIdx++
      for (const cue of cues) {
        subs.push({
          id: uid(), text: cue.text, start_ms: cue.start, end_ms: cue.end,
          effect: 'fade', x_pct: 50, y_pct: stylePreset.y, size: 28, color,
        })
      }
      updateTotalDuration()
      buildProps()
      render()
      window.toast?.(`${t('sub_done')} (${cues.length})`, 'success')
    } catch (e) {
      const msg = String(e)
      if (msg.startsWith('whisper-missing:')) openWhisperSetup(videoPath)
      else window.toast?.(msg, 'error')
    } finally {
      autoBtn.disabled = false
      setAutoBtnLabel(false)
    }
  }

  async function runAutoTranscribe() {
    if (!window.__TAURI__) { window.toast?.(t('sub_tauri_only'), 'warn'); return }
    let videoPath = bgVideoPath
    if (!videoPath) {
      try {
        const picked = await window.__TAURI__.core.invoke('pick_files_with_filter', {
          filterName: 'Vidéo', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'],
        })
        if (!picked || !picked.length) return
        videoPath = picked[0]
      } catch (e) { window.toast?.(String(e), 'error'); return }
    }
    const exe = localStorage.getItem('iceample:whisper:exe')
    const model = localStorage.getItem('iceample:whisper:model')
    if (!exe || !model) { openWhisperSetup(videoPath); return }
    await doTranscribe(videoPath, exe, model)
  }

  autoBtn.addEventListener('click', runAutoTranscribe)

  // ── Props panel ───────────────────────────────────────────────────────────

  function field(label, inputEl) {
    const wrap = document.createElement('div')
    const lbl = document.createElement('label')
    lbl.style.cssText = 'display:block;font-size:10px;color:var(--text-secondary);margin-bottom:3px;'
    lbl.textContent = label
    wrap.append(lbl, inputEl)
    return wrap
  }

  function buildProps() {
    props.innerHTML = ''
    const sub = subs.find(s => s.id === selectedId)
    if (!sub) {
      const ph = document.createElement('div')
      ph.style.cssText = 'font-size:11px;color:var(--text-secondary);text-align:center;padding:20px;'
      ph.textContent = t('sub_select_hint')
      props.appendChild(ph)
      return
    }

    const NUDGE = 'border:1px solid var(--win-border-in);background:var(--surface2);color:var(--text-secondary);border-radius:5px;padding:4px 0;width:34px;cursor:pointer;font-size:10px;font-family:inherit;flex-shrink:0;'

    // Text
    const textArea = document.createElement('textarea')
    textArea.value = sub.text; textArea.rows = 3
    textArea.style.cssText = INP + 'width:100%;resize:vertical;box-sizing:border-box;'
    textArea.addEventListener('input', () => { sub.text = textArea.value; render() })
    props.appendChild(field(t('sub_text'), textArea))

    // Start / end times with ±0.1s nudge buttons
    function timeField(labelKey, get, set) {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;gap:4px;align-items:center;'
      const inp = document.createElement('input')
      inp.type = 'text'; inp.value = msToTime(get())
      inp.title = 'HH:MM:SS,cs'
      inp.style.cssText = INP + 'flex:1;min-width:0;box-sizing:border-box;'
      function sync() {
        inp.value = msToTime(get())
        updateTotalDuration()
        render()
      }
      inp.addEventListener('change', () => { set(timeToMs(inp.value)); sync() })
      const mk = (txt, d) => {
        const b = document.createElement('button')
        b.textContent = txt
        b.style.cssText = NUDGE
        b.addEventListener('click', () => { set(get() + d); sync() })
        return b
      }
      row.append(mk('−0.1', -100), inp, mk('+0.1', 100))
      return field(t(labelKey), row)
    }
    props.appendChild(timeField('sub_start',
      () => sub.start_ms,
      v => { sub.start_ms = Math.max(0, Math.min(v, sub.end_ms - 100)) }))
    props.appendChild(timeField('sub_end',
      () => sub.end_ms,
      v => { sub.end_ms = Math.max(v, sub.start_ms + 100) }))

    // Effect
    const efxSel = document.createElement('select')
    efxSel.style.cssText = INP + 'width:100%;box-sizing:border-box;'
    for (const e of EFFECTS) {
      const opt = document.createElement('option')
      opt.value = e.id; opt.textContent = t(e.labelKey)
      if (e.id === sub.effect) opt.selected = true
      efxSel.appendChild(opt)
    }
    efxSel.addEventListener('change', () => { sub.effect = efxSel.value; render() })
    props.appendChild(field(t('sub_effect'), efxSel))

    // Position
    const posRow = document.createElement('div')
    posRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;'
    for (const [key, label] of [['x_pct', 'X %'], ['y_pct', 'Y %']]) {
      const inp = document.createElement('input')
      inp.type = 'number'; inp.min = '0'; inp.max = '100'; inp.value = sub[key]
      inp.style.cssText = INP + 'width:100%;box-sizing:border-box;'
      inp.addEventListener('input', () => { sub[key] = parseFloat(inp.value) || 0; render() })
      const fw = field(label, inp)
      posRow.appendChild(fw)
    }
    props.appendChild(posRow)

    // Font size
    const sizeInp = document.createElement('input')
    sizeInp.type = 'number'; sizeInp.min = '10'; sizeInp.max = '80'; sizeInp.value = sub.size || 28
    sizeInp.style.cssText = INP + 'width:100%;box-sizing:border-box;'
    sizeInp.addEventListener('input', () => { sub.size = parseInt(sizeInp.value) || 28; render() })
    props.appendChild(field(t('sub_size'), sizeInp))

    // Color
    const colorInp = document.createElement('input')
    colorInp.type = 'color'; colorInp.value = sub.color || '#ffffff'
    colorInp.style.cssText = 'width:100%;height:30px;border:1px solid var(--win-border-in);border-radius:5px;background:none;cursor:pointer;'
    colorInp.addEventListener('input', () => { sub.color = colorInp.value; render() })
    props.appendChild(field(t('sub_color'), colorInp))

    // Merge with next / split at playhead
    const mergeBtn = document.createElement('button')
    mergeBtn.style.cssText = GHOST + 'width:100%;text-align:left;'
    mergeBtn.innerHTML = '<i class="fa-solid fa-object-group"></i> <span></span>'
    mergeBtn.querySelector('span').textContent = t('sub_merge_next')
    mergeBtn.addEventListener('click', () => mergeWithNext(sub.id))
    props.appendChild(mergeBtn)

    const splitBtn = document.createElement('button')
    splitBtn.style.cssText = GHOST + 'width:100%;text-align:left;'
    splitBtn.innerHTML = '<i class="fa-solid fa-scissors"></i> <span></span>'
    splitBtn.querySelector('span').textContent = t('sub_split_cursor')
    splitBtn.addEventListener('click', () => splitAtPlayhead(sub.id))
    props.appendChild(splitBtn)

    // Delete
    const delBtn = document.createElement('button')
    delBtn.innerHTML = '<i class="fa-solid fa-trash"></i> <span></span>'
    delBtn.querySelector('span').textContent = t('sub_delete')
    delBtn.style.cssText = BTN + 'background:color-mix(in srgb, var(--vu-color-high) 14%, transparent);border:1px solid color-mix(in srgb, var(--vu-color-high) 45%, transparent);color:var(--vu-color-high);width:100%;margin-top:6px;'
    delBtn.addEventListener('click', () => deleteSub(sub.id))
    props.appendChild(delBtn)
  }

  // Click on timeline block to select — selecting also seeks to the cue start
  timeline.addEventListener('click', e => {
    const rect = timeline.getBoundingClientRect()
    const x = e.clientX - rect.left // canvas rect already accounts for wrap scroll
    const y = e.clientY - rect.top
    const ROW_TOP = 22, ROW_H = 60
    if (y < ROW_TOP || y > ROW_TOP + ROW_H) return
    const t = x / PX_PER_MS
    for (let i = subs.length - 1; i >= 0; i--) {
      const s = subs[i]
      if (t >= s.start_ms && t <= s.end_ms) {
        selectSub(s.id)
        seekTo(s.start_ms) // jump the preview (and bg video) to the cue start
        return
      }
    }
    selectSub(null)
  })

  // ── Export ────────────────────────────────────────────────────────────────

  function buildSRT() {
    return subs
      .slice().sort((a, b) => a.start_ms - b.start_ms)
      .map((s, i) => `${i+1}\n${msToTime(s.start_ms)} --> ${msToTime(s.end_ms)}\n${s.text}`)
      .join('\n\n') + '\n'
  }

  function buildVTT() {
    const header = 'WEBVTT\n\n'
    return header + subs
      .slice().sort((a, b) => a.start_ms - b.start_ms)
      .map(s => `${msToVTT(s.start_ms)} --> ${msToVTT(s.end_ms)}\n${s.text}`)
      .join('\n\n') + '\n'
  }

  // .ass with a single [V4+ Styles] line mirroring the selected preset
  function buildASS() {
    const p = stylePreset
    const sorted = subs.slice().sort((a, b) => a.start_ms - b.start_ms)
    const fill = p.fill === 'cue' ? ((sorted[0] && sorted[0].color) || COLORS[0]) : '#ffffff'
    const primary = hexToAss(fill)
    const outlineCol = p.glow ? hexToAss(fill) : hexToAss('#000000')
    const backCol = p.band ? hexToAss('#000000', '66') : hexToAss('#000000')
    const bold = (p.weight || 700) >= 700 ? -1 : 0
    const fontsize = Math.round(28 * (p.sizeMul || 1))
    const borderStyle = p.band ? 3 : 1 // 3 = opaque box behind the text
    const outline = p.band ? 4 : p.outline ? 3 : p.glow ? 2 : 0
    const shadow = p.outline ? 1 : 0
    const top = p.y <= 40
    const alignment = top ? 8 : 2 // 8 = top-center, 2 = bottom-center
    const marginV = Math.max(10, Math.round(360 * (top ? p.y : 100 - p.y) / 100))
    const style = [
      'Iceample', p.assFont || 'Inter', fontsize, primary, primary, outlineCol, backCol,
      bold, 0, 0, 0, 100, 100, 0, 0, borderStyle, outline, shadow, alignment, 20, 20, marginV, 1,
    ].join(',')
    const events = sorted.map(s =>
      `Dialogue: 0,${msToASS(s.start_ms)},${msToASS(s.end_ms)},Iceample,,0,0,0,,${s.text.replace(/\r?\n/g, '\\N')}`
    ).join('\n')
    return [
      '[Script Info]',
      'Title: Iceample subtitles',
      'ScriptType: v4.00+',
      'PlayResX: 640',
      'PlayResY: 360',
      'WrapStyle: 0',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: ' + style,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      events,
    ].join('\n') + '\n'
  }

  async function saveText(content, defaultName, ext) {
    if (!window.__TAURI__) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
      a.download = defaultName; a.click()
      return
    }
    try {
      const path = await window.__TAURI__.dialog.save({
        defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      })
      if (path) {
        await window.__TAURI__.core.invoke('save_text_file', { path, content })
        trackRecentFile(path, path.split(/[\\/]/).pop())
      }
    } catch (e) { window.toast?.(String(e), 'error') }
  }

  exportSrtBtn.addEventListener('click', () => saveText(buildSRT(), 'subtitles.srt', 'srt'))
  exportVttBtn.addEventListener('click', () => saveText(buildVTT(), 'subtitles.vtt', 'vtt'))
  exportAssBtn.addEventListener('click', () => saveText(buildASS(), 'subtitles.ass', 'ass'))

  let exportRec = null  // active MediaRecorder during WebM export (teardown stops it)

  exportWebmBtn.addEventListener('click', async () => {
    if (!window.MediaRecorder) { window.toast?.(t('sub_no_recorder'), 'error'); return }

    // Stop live playback — its tick() rAF would fight the export loop over playhead
    if (playing) togglePlay()
    playBtn.disabled = true

    const durMs = totalDuration
    let recorder
    try {
      const stream = canvas.captureStream(30)
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm'
      recorder = new MediaRecorder(stream, { mimeType: mime })
    } catch (e) {
      // tainted canvas (file:// video frame) or unsupported codec — restore playback and bail
      playBtn.disabled = false
      window.toast?.(t('sub_export_fail') + ': ' + String(e), 'error')
      return
    }
    exportRec = recorder
    const chunks = []
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data)

    let recPlayhead = 0
    const startTime = performance.now()

    exportWebmBtn.disabled = true
    exportWebmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span></span>'
    exportWebmBtn.querySelector('span').textContent = t('sub_recording')

    const recRaf = () => {
      if (!document.body.contains(body)) { try { recorder.stop() } catch {}; return }
      recPlayhead = Math.min(durMs, performance.now() - startTime)
      playhead = recPlayhead
      updateTimeLbl()
      renderCanvas()
      if (recPlayhead < durMs) requestAnimationFrame(recRaf)
      else {
        recorder.stop()
      }
    }

    recorder.onstart = () => requestAnimationFrame(recRaf)
    recorder.onstop = async () => {
      exportRec = null
      playBtn.disabled = false
      exportWebmBtn.disabled = false
      exportWebmBtn.innerHTML = '<i class="fa-solid fa-video"></i> WebM'
      if (!document.body.contains(body)) return // tool closed mid-export — discard
      const blob = new Blob(chunks, { type: 'video/webm' })
      if (window.__TAURI__) {
        try {
          const buf = await blob.arrayBuffer()
          const u8 = new Uint8Array(buf)
          let s = ''
          for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
          const b64 = btoa(s)
          const path = await window.__TAURI__.dialog.save({
            defaultPath: 'subtitles.webm', filters: [{ name: 'WebM', extensions: ['webm'] }]
          })
          if (path) {
            await window.__TAURI__.core.invoke('save_binary_file', { path, base64: b64 })
            trackRecentFile(path, path.split(/[\\/]/).pop())
          }
        } catch (e) { window.toast?.(String(e), 'error') }
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob); a.download = 'subtitles.webm'; a.click()
      }
    }

    recorder.start(100)
  })

  // ── Initial render ────────────────────────────────────────────────────────

  // ResizeObserver to keep canvas sized
  const ro = new ResizeObserver(() => { render() })
  ro.observe(canvasWrap)
  window.addEventListener('iceample-theme-changed', render)   // repaint the themed timeline

  // Teardown: stop the rAF loop and the bg video once the tool is closed
  const mo = new MutationObserver(() => {
    if (document.body.contains(body)) return
    window.removeEventListener('iceample-theme-changed', render)
    playing = false
    if (raf) cancelAnimationFrame(raf)
    try { exportRec?.stop() } catch {} // recRaf/onstop bail once body is detached
    try { bgVideo?.pause() } catch {}
    ro.disconnect()
    mo.disconnect()
  })
  mo.observe(document.body, { childList: true, subtree: true })

  // ── Project registry (cues, style, background video path) ─────────────────
  registerTool('subtitles', {
    el: body,
    getState: () => ({
      style: stylePreset.id,
      video: bgVideoPath,
      subs: subs.map(s => ({ ...s })),
    }),
    setState: (state) => {
      if (!state) return
      if (playing) togglePlay()
      const preset = STYLE_PRESETS.find(p => p.id === state.style)
      if (preset) { stylePreset = preset; refreshStyleCards() }
      if (Array.isArray(state.subs)) {
        subs = state.subs
          .filter(s => s && Number.isFinite(s.start_ms) && Number.isFinite(s.end_ms))
          .map(s => ({ ...s, id: uid() }))
        selectedId = null
        updateTotalDuration()
      }
      // Same path the media bus uses: reloads the background video from disk.
      if (state.video && state.video !== bgVideoPath) {
        body.dispatchEvent(new CustomEvent('iceample-media', { detail: { kind: 'video', path: state.video } }))
      }
      buildProps()
      render()
      updateTimeLbl()
    },
  })

  buildProps()
  render()
  updateTimeLbl()
}
