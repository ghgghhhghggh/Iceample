// particles.js — "Particules": real-time particle systems (pooled engine, preset cards, export + media bus)
import { t } from './i18n.js'
import { makeSendButton, imageMedia, IMAGE_TARGETS, VIDEO_TARGETS } from './media-bus.js'
import { promptName } from './rename-dialog.js'

export function initParticles(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;font-family:inherit;'

  const TAU = Math.PI * 2
  const DEG = Math.PI / 180

  // ── Presets ────────────────────────────────────────────────────────────────
  // rate: particles/s · life/speed/size: [min,max] · gravity/wind: px/s² ·
  // wobble: lateral drift px/s · flicker: Hz · grow: size gain over life ·
  // trail: points kept · blend: canvas composite op for the whole system.
  const PRESETS = {
    neige: {
      key: 'pt_p_snow', rate: 80, life: [6, 10], speed: [16, 42], angle: 90, spread: 24,
      gravity: 8, wind: 0, size: [1.4, 3.4], shape: 'circle', emitter: 'top',
      wobble: 16, wobFreq: 1.2, opacity: 0.9,
      colors: ['#ffffff', '#dcebff', '#b9d6ff'],
    },
    pluie: {
      key: 'pt_p_rain', rate: 240, life: [1, 1.7], speed: [380, 540], angle: 84, spread: 4,
      gravity: 140, wind: 0, size: [0.8, 1.5], shape: 'streak', emitter: 'top',
      alignVel: true, opacity: 0.5,
      colors: ['#9db8e8', '#7e9fd8', '#c5d8f5'],
    },
    lucioles: {
      key: 'pt_p_fireflies', rate: 24, life: [4, 9], speed: [8, 22], angle: 0, spread: 360,
      gravity: 0, wind: 0, size: [1.5, 3], shape: 'glow', emitter: 'area',
      wobble: 26, wobFreq: 0.5, flicker: 1.6, blend: 'lighter', opacity: 0.95,
      colors: ['#ffe66d', '#c8f27a', '#ffd23f'],
    },
    etincelles: {
      key: 'pt_p_sparks', rate: 130, life: [0.7, 1.6], speed: [130, 330], angle: 270, spread: 55,
      gravity: 340, wind: 0, size: [1, 2.2], shape: 'glow', emitter: 'bottom-center',
      blend: 'lighter', trail: 6, opacity: 1,
      colors: ['#ffb347', '#ff8c1a', '#ffe08a', '#ff6b35'],
    },
    fumee: {
      key: 'pt_p_smoke', rate: 32, life: [3, 6], speed: [28, 58], angle: 270, spread: 20,
      gravity: -16, wind: 0, size: [8, 18], shape: 'circle', emitter: 'bottom-center',
      grow: 2.4, opacity: 0.16, wobble: 12, wobFreq: 0.45,
      colors: ['#9a9a9a', '#b5b5b5', '#7c7c7c'],
    },
    confettis: {
      key: 'pt_p_confetti', rate: 90, life: [2.6, 4.4], speed: [40, 120], angle: 90, spread: 60,
      gravity: 110, wind: 0, size: [3, 5.5], shape: 'rect', emitter: 'top',
      rotV: 3, wobble: 12, wobFreq: 1.6, opacity: 0.95,
      colors: ['#ff4488', '#44aaff', '#ffcc00', '#44dd88', '#cc44ff', '#ff8844'],
    },
    bulles: {
      key: 'pt_p_bubbles', rate: 38, life: [4, 8], speed: [30, 70], angle: 270, spread: 18,
      gravity: -26, wind: 0, size: [3, 8], shape: 'ring', emitter: 'bottom',
      wobble: 20, wobFreq: 1.1, opacity: 0.5,
      colors: ['#6cc6ff', '#9adcff', '#c9edff'],
    },
    petales: {
      key: 'pt_p_petals', rate: 42, life: [5, 9], speed: [20, 48], angle: 90, spread: 30,
      gravity: 14, wind: 0, size: [3.5, 6.5], shape: 'petal', emitter: 'top',
      rotV: 1.4, wobble: 28, wobFreq: 0.7, opacity: 0.9,
      colors: ['#ffb7c5', '#ff8fab', '#ffd3da', '#f472b6'],
    },
  }

  // ── State (+ persistence) ──────────────────────────────────────────────────
  let state = {
    preset: 'neige', density: 1, speed: 1, size: 1, wind: 0, gravity: 0,
    colorMode: 'preset', customColor: '', bgColor: '#101014', transparent: false, recSec: 5,
    userPreset: '', sprite: '', spriteTint: false, emitterPoint: null,
  }
  const STATE_LS = 'iceample:particles:state'
  const STATE_KEYS = Object.keys(state)
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_LS))
    if (saved && typeof saved === 'object') for (const k of STATE_KEYS) if (saved[k] !== undefined) state[k] = saved[k]
  } catch {}
  if (!PRESETS[state.preset]) state.preset = 'neige'
  if (typeof state.sprite !== 'string' || !state.sprite.startsWith('data:image/')) state.sprite = ''
  // click-to-place emitter: {x,y} as fractions of the canvas (0..1) or null (preset default)
  const sanePoint = ep => ep && typeof ep === 'object' && Number.isFinite(ep.x) && Number.isFinite(ep.y)
    ? { x: Math.min(1, Math.max(0, ep.x)), y: Math.min(1, Math.max(0, ep.y)) } : null
  state.emitterPoint = sanePoint(state.emitterPoint)
  let lsWarned = false
  let saveT = 0
  function saveState() {
    if (saveT) { clearTimeout(saveT); saveT = 0 }
    const out = {}
    for (const k of STATE_KEYS) out[k] = state[k]
    try {
      localStorage.setItem(STATE_LS, JSON.stringify(out))
      lsWarned = false
    } catch {
      // quota hit (a stored sprite makes this plausible) — warn once, keep running
      if (!lsWarned) { lsWarned = true; window.toast?.(t('pt_preset_store_fail'), 'error') }
    }
  }
  // continuous `input` handlers fire 60-120×/s and the payload embeds the sprite
  // dataURL — coalesce so one drag costs one stringify + setItem, not hundreds.
  // Flushed on teardown and when the page hides. Discrete events save at once.
  function saveStateSoon() {
    if (saveT) clearTimeout(saveT)
    saveT = setTimeout(saveState, 250)
  }

  // ── User presets — saved snapshots applied over a base preset ──────────────
  const UP_LS = 'iceample:particles:userpresets'
  const UP_PARAMS = ['density', 'speed', 'size', 'wind', 'gravity', 'colorMode', 'customColor', 'bgColor', 'transparent', 'spriteTint', 'emitterPoint']
  let userPresets = []
  try {
    const arr = JSON.parse(localStorage.getItem(UP_LS) || '[]')
    if (Array.isArray(arr)) userPresets = arr.filter(u => u && typeof u.id === 'string' && typeof u.name === 'string' && PRESETS[u.base])
  } catch {}
  if (state.userPreset && !userPresets.some(u => u.id === state.userPreset)) state.userPreset = ''
  function persistUserPresets() {
    try { localStorage.setItem(UP_LS, JSON.stringify(userPresets)); return true }
    catch { window.toast?.(t('pt_preset_store_fail'), 'error'); return false }
  }

  // ── Colors (preset palette / theme accent / custom) ────────────────────────
  const normCtx = document.createElement('canvas').getContext('2d')
  const isHex = c => /^#[0-9a-f]{6}$/i.test(c)
  function mixHex(hex, target, k) {
    if (!isHex(hex)) return hex
    const n = parseInt(hex.slice(1), 16)
    const ch = sh => { const v = (n >> sh) & 255; return Math.round(v + (target - v) * k) }
    return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')
  }
  function resolveAccent() {
    const raw = (getComputedStyle(document.documentElement).getPropertyValue('--color-active') || '').trim()
    if (!raw) return '#8ab4ff' // content fallback when the token is absent (particle color, not UI)
    normCtx.fillStyle = '#000'
    try { normCtx.fillStyle = raw } catch {}
    return normCtx.fillStyle
  }
  if (!state.customColor) state.customColor = isHex(resolveAccent()) ? resolveAccent() : '#8ab4ff'

  let themeHexCache = ''
  function computePalette() {
    if (state.colorMode === 'theme') {
      const b = themeHexCache = resolveAccent()
      return isHex(b) ? [mixHex(b, 255, 0.3), b, mixHex(b, 0, 0.22)] : [b]
    }
    if (state.colorMode === 'custom') {
      const b = state.customColor
      return isHex(b) ? [mixHex(b, 255, 0.28), b, mixHex(b, 0, 0.2)] : [b]
    }
    return PRESETS[state.preset].colors
  }
  let palette = computePalette()
  function recomputePalette() {
    palette = computePalette()
    for (let i = 0; i < alive; i++) pool[i].color = palette[(Math.random() * palette.length) | 0]
    rebuildTints()
    if (!playing) render()
  }

  // ── Particle pool (no per-frame allocation, hard cap) ──────────────────────
  const MAX = 1500
  const TRAIL_PTS = 10
  const pool = new Array(MAX)
  for (let i = 0; i < MAX; i++) {
    pool[i] = {
      x: 0, y: 0, vx: 0, vy: 0, size: 1, age: 0, life: 1, color: '#fff',
      rot: 0, rotV: 0, phase: 0, trail: new Float32Array(TRAIL_PTS * 2), tHead: 0, tLen: 0,
    }
  }
  let alive = 0
  let emitAcc = 0
  let W = 0, H = 0

  const lerp = (r, k) => r[0] + (r[1] - r[0]) * k

  function spawn() {
    const P = PRESETS[state.preset]
    const p = pool[alive++]
    const ep = state.emitterPoint
    if (ep) { p.x = ep.x * W; p.y = ep.y * H }
    else switch (P.emitter) {
      case 'top':           p.x = Math.random() * W; p.y = -8 - Math.random() * 20; break
      case 'bottom':        p.x = Math.random() * W; p.y = H + 6 + Math.random() * 10; break
      case 'bottom-center': p.x = W / 2 + (Math.random() - 0.5) * W * 0.14; p.y = H + 4; break
      case 'area':          p.x = Math.random() * W; p.y = Math.random() * H; break
      default:              p.x = Math.random() * W; p.y = Math.random() * H
    }
    const sp = lerp(P.speed, Math.random())
    const a = (P.angle + (Math.random() - 0.5) * P.spread) * DEG
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.size = lerp(P.size, Math.random())
    p.life = lerp(P.life, Math.random())
    p.age = 0
    p.color = palette[(Math.random() * palette.length) | 0]
    p.rot = Math.random() * TAU
    p.rotV = (Math.random() - 0.5) * 2 * (P.rotV || 0)
    p.phase = Math.random() * TAU
    p.tHead = 0
    p.tLen = 0
  }

  function kill(i) {
    alive--
    const p = pool[i]
    pool[i] = pool[alive]
    pool[alive] = p
  }

  function step(dt) {
    const P = PRESETS[state.preset]
    const gy = P.gravity + state.gravity * 260
    const gx = (P.wind || 0) + state.wind * 140
    const KM = 64
    const trailKeep = P.trail ? Math.min(P.trail, TRAIL_PTS) : 0
    for (let i = alive - 1; i >= 0; i--) {
      const p = pool[i]
      p.age += dt
      if (p.age >= p.life) { kill(i); continue }
      p.vx += gx * dt
      p.vy += gy * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (P.wobble) p.x += Math.sin(p.age * P.wobFreq * TAU + p.phase) * P.wobble * dt
      p.rot = P.alignVel ? Math.atan2(p.vy, p.vx) : p.rot + p.rotV * dt
      if (p.x < -KM || p.x > W + KM || p.y < -KM || p.y > H + KM) { kill(i); continue }
      if (trailKeep) {
        p.trail[p.tHead * 2] = p.x
        p.trail[p.tHead * 2 + 1] = p.y
        p.tHead = (p.tHead + 1) % TRAIL_PTS
        if (p.tLen < trailKeep) p.tLen++
      }
    }
    emitAcc += P.rate * state.density * dt
    let n = Math.floor(emitAcc)
    emitAcc -= n
    while (n-- > 0 && alive < MAX) spawn()
  }

  // Reseed the field and simulate a few seconds so presets show up "already running"
  function prewarm() {
    alive = 0
    emitAcc = 0
    if (!W) return
    for (let k = 0; k < 64; k++) step(0.1)
  }

  // ── Drawing ────────────────────────────────────────────────────────────────
  function paintShape(g, shape, x, y, rot, s) {
    switch (shape) {
      case 'circle':
        g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); break
      case 'glow': {
        const ga = g.globalAlpha
        g.globalAlpha = ga * 0.22
        g.beginPath(); g.arc(x, y, s * 3, 0, TAU); g.fill()
        g.globalAlpha = ga
        g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill()
        break
      }
      case 'ring':
        g.lineWidth = Math.max(1, s * 0.22)
        g.beginPath(); g.arc(x, y, s, 0, TAU); g.stroke()
        g.beginPath(); g.arc(x - s * 0.35, y - s * 0.35, Math.max(0.6, s * 0.16), 0, TAU); g.fill()
        break
      case 'rect':
        g.save(); g.translate(x, y); g.rotate(rot)
        g.fillRect(-s, -s * 0.55, s * 2, s * 1.1)
        g.restore(); break
      case 'petal':
        g.save(); g.translate(x, y); g.rotate(rot)
        g.beginPath()
        g.moveTo(0, -s)
        g.quadraticCurveTo(s * 0.9, -s * 0.3, 0, s)
        g.quadraticCurveTo(-s * 0.9, -s * 0.3, 0, -s)
        g.fill()
        g.restore(); break
      case 'streak':
        g.save(); g.translate(x, y); g.rotate(rot)
        g.lineWidth = Math.max(1, s)
        g.beginPath(); g.moveTo(-s * 7, 0); g.lineTo(0, 0); g.stroke()
        g.restore(); break
    }
  }

  // ── Custom sprite (a user image replaces the drawn shape) ──────────────────
  // Decoded once into an offscreen canvas (max 128px, alpha kept); tinted
  // copies are pre-rendered per palette colour — zero per-frame decodes/allocs.
  let spriteCanvas = null
  let spriteW = 0, spriteH = 0, spriteMax = 1
  let spriteUrl = ''
  const tintMap = new Map()

  function rebuildTints() {
    tintMap.clear()
    if (!spriteCanvas || !state.spriteTint) return
    for (const col of palette) {
      if (tintMap.has(col)) continue
      const c = document.createElement('canvas')
      c.width = spriteW
      c.height = spriteH
      const g = c.getContext('2d')
      g.drawImage(spriteCanvas, 0, 0)
      g.globalCompositeOperation = 'source-atop'
      g.fillStyle = col
      g.fillRect(0, 0, spriteW, spriteH)
      tintMap.set(col, c)
    }
  }

  function setSprite(dataUrl) {
    if (!dataUrl) {
      spriteCanvas = null
      spriteUrl = ''
      state.sprite = ''
      tintMap.clear()
      updateSpriteUI()
      if (!playing) render()
      return Promise.resolve()
    }
    if (dataUrl === spriteUrl && spriteCanvas) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const k = Math.min(1, 128 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
        const w = Math.max(1, Math.round((img.naturalWidth || 1) * k))
        const h = Math.max(1, Math.round((img.naturalHeight || 1) * k))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        spriteCanvas = c
        spriteW = w
        spriteH = h
        spriteMax = Math.max(w, h)
        // ≤128px re-encode so the dataURL stays compact enough for localStorage
        spriteUrl = k < 1 ? c.toDataURL('image/png') : dataUrl
        state.sprite = spriteUrl
        rebuildTints()
        updateSpriteUI()
        if (!playing) render()
        resolve()
      }
      img.onerror = () => reject(new Error(t('pt_sprite_err')))
      img.src = dataUrl
    })
  }

  function render() {
    if (!W) return
    const P = PRESETS[state.preset]
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    if (state.transparent) {
      ctx.clearRect(0, 0, W, H)
    } else {
      ctx.fillStyle = state.bgColor
      ctx.fillRect(0, 0, W, H)
    }
    ctx.globalCompositeOperation = P.blend || 'source-over'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    const baseOp = P.opacity ?? 0.9
    const szMul = state.size
    for (let i = 0; i < alive; i++) {
      const p = pool[i]
      const prog = p.age / p.life
      let a = baseOp
      if (prog < 0.12) a *= prog / 0.12
      else if (prog > 0.75) a *= (1 - prog) / 0.25
      if (P.flicker) a *= 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(p.age * P.flicker * TAU + p.phase * 3))
      if (a <= 0.004) continue
      const s = p.size * szMul * (P.grow ? 1 + prog * P.grow : 1)
      ctx.fillStyle = p.color
      ctx.strokeStyle = p.color
      if (p.tLen > 1) {
        ctx.globalAlpha = a * 0.45
        ctx.lineWidth = Math.max(1, s * 0.7)
        ctx.beginPath()
        for (let k = 0; k < p.tLen; k++) {
          const idx = ((p.tHead - p.tLen + k + TRAIL_PTS) % TRAIL_PTS) * 2
          if (k === 0) ctx.moveTo(p.trail[idx], p.trail[idx + 1])
          else ctx.lineTo(p.trail[idx], p.trail[idx + 1])
        }
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
      ctx.globalAlpha = a
      if (spriteCanvas) {
        const img = state.spriteTint && tintMap.get(p.color) || spriteCanvas
        const sk = (s * 2) / spriteMax
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.drawImage(img, spriteW * sk * -0.5, spriteH * sk * -0.5, spriteW * sk, spriteH * sk)
        ctx.restore()
      } else {
        paintShape(ctx, P.shape, p.x, p.y, p.rot, s)
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  const topBar = document.createElement('div')
  topBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--win-border-in,#1e1e1e);flex-shrink:0;flex-wrap:wrap;'

  const main = document.createElement('div')
  main.style.cssText = 'display:flex;flex:1;overflow:hidden;'

  const canvasWrap = document.createElement('div')
  canvasWrap.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg,#0a0a0a);min-width:0;position:relative;overflow:hidden;'

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;cursor:crosshair;'
  const ctx = canvas.getContext('2d')
  canvasWrap.appendChild(canvas)

  const CHECKER = 'repeating-conic-gradient(color-mix(in srgb,var(--text-primary) 13%,transparent) 0% 25%, color-mix(in srgb,var(--text-primary) 4.5%,transparent) 0% 50%) 0 0 / 16px 16px'
  const updateChecker = () => { canvas.style.background = state.transparent ? CHECKER : 'none' }

  // ── Click-to-place emitter (pin overlay + reset chip, % positioned) ────────
  const pin = document.createElement('div')
  pin.style.cssText = 'position:absolute;width:7px;height:7px;border-radius:50%;background:var(--color-active);box-shadow:0 0 0 3px color-mix(in srgb,var(--color-active) 25%,transparent);opacity:0.35;transform:translate(-50%,-50%);pointer-events:none;display:none;'
  const pinClearBtn = document.createElement('button')
  pinClearBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
  pinClearBtn.title = t('pt_emit_reset')
  pinClearBtn.style.cssText = 'position:absolute;top:8px;left:8px;display:none;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border-radius:99px;border:1px solid var(--win-border-in,#1e1e1e);background:color-mix(in srgb,var(--surface) 82%,transparent);color:var(--text-secondary,#888);font-size:10px;cursor:pointer;'
  canvasWrap.append(pin, pinClearBtn)

  function updatePin() {
    const ep = state.emitterPoint
    pin.style.display = ep ? 'block' : 'none'
    pinClearBtn.style.display = ep ? 'inline-flex' : 'none'
    if (!ep) return
    pin.style.left = ep.x * 100 + '%'
    pin.style.top = ep.y * 100 + '%'
  }
  updatePin()

  // only a plain click places the point (≤3px between down and up, primary button)
  let downX = -1, downY = -1
  canvas.addEventListener('pointerdown', e => { if (e.button === 0) { downX = e.clientX; downY = e.clientY } })
  canvas.addEventListener('click', e => {
    if (downX < 0 || Math.abs(e.clientX - downX) > 3 || Math.abs(e.clientY - downY) > 3) return
    downX = -1
    if (!W) return
    const r = canvas.getBoundingClientRect()
    if (!r.width || !r.height) return
    state.emitterPoint = sanePoint({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
    updatePin()
    saveState()
    if (!playing) render()
  })
  pinClearBtn.addEventListener('click', () => {
    state.emitterPoint = null
    updatePin()
    saveState()
    if (!playing) render()
  })

  const panel = document.createElement('div')
  panel.style.cssText = 'width:232px;flex-shrink:0;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-left:1px solid var(--win-border-in,#1e1e1e);background:var(--surface2,var(--surface));'

  main.append(canvasWrap, panel)
  body.append(topBar, main)

  // ── Top bar ────────────────────────────────────────────────────────────────
  const BTN = 'border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;font-family:inherit;'
  const GHOST = BTN + 'background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));border:1px solid var(--win-border,#444);color:var(--text-primary,#ddd);'

  const playBtn = document.createElement('button')
  playBtn.style.cssText = GHOST + 'width:30px;'
  const resetBtn = document.createElement('button')
  resetBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>'
  resetBtn.title = t('pt_reset')
  resetBtn.style.cssText = GHOST + 'width:30px;'

  const countBadge = document.createElement('span')
  countBadge.title = t('pt_live_count')
  countBadge.style.cssText = 'font-size:10px;color:var(--text-secondary,#888);padding:2px 8px;border:1px solid var(--win-border-in,#1e1e1e);border-radius:99px;background:color-mix(in srgb,var(--text-primary) 5%,var(--surface));'
  countBadge.innerHTML = '<i class="fa-solid fa-circle-nodes" style="font-size:9px"></i> <span>0</span>'
  const countEl = countBadge.querySelector('span')

  const exportPngBtn = document.createElement('button')
  exportPngBtn.innerHTML = '<i class="fa-solid fa-image"></i> PNG'
  exportPngBtn.title = t('pt_export_png')
  exportPngBtn.style.cssText = GHOST + 'margin-left:auto;'

  const sendBtn = makeSendButton(getSendMedia, { targets: [...IMAGE_TARGETS, ...VIDEO_TARGETS], self: 'particles', iconOnly: true, className: '' })
  sendBtn.style.cssText = GHOST

  const durWrap = document.createElement('label')
  durWrap.title = t('pt_duration_s')
  durWrap.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:10px;color:var(--text-secondary,#888);'
  const durInput = document.createElement('input')
  durInput.type = 'number'; durInput.min = 1; durInput.max = 30; durInput.step = 1
  durInput.value = state.recSec
  durInput.style.cssText = 'width:44px;background:var(--surface2,var(--surface));border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-primary,#ddd);border-radius:5px;padding:3px 4px;font-size:11px;font-family:inherit;'
  durInput.addEventListener('change', () => {
    state.recSec = Math.max(1, Math.min(30, parseInt(durInput.value) || 5))
    durInput.value = state.recSec
    saveState()
  })
  durWrap.append(durInput, document.createTextNode('s'))

  const exportWebmBtn = document.createElement('button')
  const WEBM_LABEL = '<i class="fa-solid fa-video"></i> WebM'
  exportWebmBtn.innerHTML = WEBM_LABEL
  exportWebmBtn.title = t('pt_export_webm')
  exportWebmBtn.style.cssText = BTN + 'background:var(--btn-primary);color:var(--on-accent);'

  topBar.append(playBtn, resetBtn, countBadge, exportPngBtn, sendBtn, durWrap, exportWebmBtn)

  // ── Animation loop: one rAF, paused when hidden/detached/paused ────────────
  let rafId = 0
  let last = 0
  let playing = true
  let statAcc = 0

  function schedule() {
    if (playing && !rafId && !document.hidden && body.isConnected) rafId = requestAnimationFrame(tick)
  }
  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
    last = 0
  }
  function tick(ts) {
    rafId = 0
    if (!last) last = ts
    const raw = Math.min((ts - last) / 1000, 0.05)
    last = ts
    if (W) {
      step(raw * state.speed)
      render()
      statAcc += raw
      if (statAcc > 0.5) {
        statAcc = 0
        countEl.textContent = alive
        // follow live theme edits while in theme colour mode
        if (state.colorMode === 'theme' && resolveAccent() !== themeHexCache) recomputePalette()
      }
    }
    schedule()
  }
  function updatePlayBtn() {
    playBtn.innerHTML = playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'
    playBtn.title = playing ? t('pt_pause') : t('pt_play')
  }
  function setPlaying(v) {
    playing = v
    updatePlayBtn()
    if (v) schedule()
    else stopLoop()
  }
  updatePlayBtn()

  playBtn.addEventListener('click', () => setPlaying(!playing))
  resetBtn.addEventListener('click', () => { prewarm(); if (!playing) render() })

  const onVis = () => {
    if (document.hidden) { stopLoop(); if (saveT) saveState() }
    else schedule()
  }
  document.addEventListener('visibilitychange', onVis)

  // ── Responsive DPR-aware canvas (no restart on resize) ─────────────────────
  let sized = false
  function resize() {
    const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight
    if (!w || !h) return
    const dpr = window.devicePixelRatio || 1
    W = w; H = h
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!sized) { sized = true; prewarm() }
    if (!playing || document.hidden) render()
    schedule() // covers init-before-attach: first layout means we are connected
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvasWrap)

  // ── Panel: preset cards ────────────────────────────────────────────────────
  function pLabel(text) {
    const d = document.createElement('div')
    d.style.cssText = 'font-size:10px;color:var(--text-secondary,#666);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;'
    d.textContent = text
    return d
  }

  if (!document.getElementById('pt-particles-styles')) {
    const st = document.createElement('style')
    st.id = 'pt-particles-styles'
    st.textContent = `
.pt-card{position:relative}
.pt-card-badge{position:absolute;top:8px;left:9px;font-size:7px;color:var(--color-active);pointer-events:none;text-shadow:0 0 3px rgba(0,0,0,.55)}
.pt-card-menu-btn{position:absolute;top:7px;right:7px;width:15px;height:15px;padding:0;border:none;border-radius:4px;background:color-mix(in srgb,var(--surface) 78%,transparent);color:var(--text-primary);font-size:8px;cursor:pointer;display:none;align-items:center;justify-content:center}
.pt-card:hover .pt-card-menu-btn,.pt-card:focus-within .pt-card-menu-btn{display:inline-flex}
.pt-menu{position:fixed;z-index:10000;min-width:118px;background:var(--surface);border:1px solid var(--win-border-in);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.4);padding:4px;display:flex;flex-direction:column;gap:1px}
.pt-menu-item{display:flex;align-items:center;gap:7px;padding:6px 9px;border:none;background:none;color:var(--text-secondary);font-size:11px;font-family:inherit;border-radius:5px;cursor:pointer;text-align:left}
.pt-menu-item i{font-size:9px;width:11px;text-align:center}
.pt-menu-item:hover{background:color-mix(in srgb,var(--text-primary) 10%,transparent);color:var(--text-primary)}
.pt-menu-item.danger:hover{color:var(--danger)}
.pt-star-btn{width:24px;height:20px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--win-border-in);border-radius:5px;background:none;color:var(--text-secondary);cursor:pointer;font-size:9px;transition:all .1s}
.pt-star-btn:hover{border-color:var(--color-active);color:var(--color-active)}
`
    document.head.appendChild(st)
  }

  const presetHead = document.createElement('div')
  presetHead.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;'
  const saveUpBtn = document.createElement('button')
  saveUpBtn.className = 'pt-star-btn'
  saveUpBtn.title = t('pat_preset_save')
  saveUpBtn.innerHTML = '<i class="fa-solid fa-star"></i>'
  presetHead.append(pLabel(t('pat_presets')), saveUpBtn)
  panel.append(presetHead)
  const cardGrid = document.createElement('div')
  cardGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;'
  panel.appendChild(cardGrid)

  const cards = []
  let userCardEls = {}
  function drawThumb(cnv, P) {
    const g = cnv.getContext('2d')
    const w = cnv.width, h = cnv.height
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-over'
    if (state.transparent) g.clearRect(0, 0, w, h)
    else { g.fillStyle = state.bgColor; g.fillRect(0, 0, w, h) }
    g.globalCompositeOperation = P.blend || 'source-over'
    g.lineJoin = 'round'; g.lineCap = 'round'
    let seed = 42
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 16; i++) {
      const s = Math.min(9, lerp(P.size, rnd()) * (P.grow ? 1.5 : 1)) * 1.2
      const col = P.colors[i % P.colors.length]
      g.fillStyle = col
      g.strokeStyle = col
      g.globalAlpha = (P.opacity ?? 0.9) * (0.55 + 0.45 * rnd())
      const rot = P.alignVel ? P.angle * DEG : rnd() * TAU
      paintShape(g, P.shape, rnd() * w, rnd() * h, rot, s)
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }
  function styleCard(btn, lbl, on) {
    btn.style.borderColor = on ? 'var(--color-active)' : 'var(--win-border,#2a2a2a)'
    btn.style.background = on
      ? 'color-mix(in srgb,var(--color-active) 10%,var(--surface))'
      : 'color-mix(in srgb,var(--text-primary) 4%,var(--surface))'
    lbl.style.color = on ? 'var(--text-primary,#ddd)' : 'var(--text-secondary,#888)'
  }
  function updateCards() {
    for (const c of cards) styleCard(c.btn, c.lbl, !state.userPreset && c.id === state.preset)
    for (const [id, c] of Object.entries(userCardEls)) styleCard(c.btn, c.lbl, id === state.userPreset)
  }
  function redrawThumbs() {
    for (const c of cards) drawThumb(c.cnv, PRESETS[c.id])
    for (const c of Object.values(userCardEls)) drawThumb(c.cnv, PRESETS[c.base] || PRESETS.neige)
  }
  // Bumped by every preset application; an async sprite decode that finishes
  // after a newer selection must not clobber it.
  let applySeq = 0
  function selectPreset(id) {
    applySeq++   // cancels a user-preset apply still decoding its sprite
    state.preset = id
    state.userPreset = ''
    state.emitterPoint = null // each preset keeps its designed emitter
    updatePin()
    recomputePalette()
    prewarm()
    updateCards()
    saveState()
    if (!playing) render()
  }
  for (const [id, P] of Object.entries(PRESETS)) {
    const btn = document.createElement('button')
    btn.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding:5px;border-radius:8px;border:1px solid var(--win-border,#2a2a2a);background:color-mix(in srgb,var(--text-primary) 4%,var(--surface));cursor:pointer;font-family:inherit;'
    const cnv = document.createElement('canvas')
    cnv.width = 168; cnv.height = 88
    cnv.style.cssText = 'width:100%;height:44px;border-radius:5px;display:block;'
    const lbl = document.createElement('div')
    lbl.style.cssText = 'font-size:10px;text-align:center;width:100%;'
    lbl.textContent = t(P.key)
    btn.append(cnv, lbl)
    btn.addEventListener('click', () => selectPreset(id))
    cardGrid.appendChild(btn)
    cards.push({ id, btn, cnv, lbl })
  }

  // ── Panel: user preset cards (same grid, star badge + ⋮ menu) ──────────────
  let closeUserMenu = null
  function openUserMenu(anchor, up) {
    closeUserMenu?.()
    const menu = document.createElement('div')
    menu.className = 'pt-menu'
    const onDoc = e => { if (!menu.contains(e.target)) closeMenu() }
    const onKey = e => { if (e.key === 'Escape') closeMenu() }
    function closeMenu() {
      menu.remove()
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey, true)
      if (closeUserMenu === closeMenu) closeUserMenu = null
    }
    closeUserMenu = closeMenu
    const mkItem = (icon, label, danger, fn) => {
      const b = document.createElement('button')
      b.className = 'pt-menu-item' + (danger ? ' danger' : '')
      b.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`
      b.querySelector('span').textContent = label
      b.addEventListener('click', () => { closeMenu(); fn() })
      menu.appendChild(b)
    }
    mkItem('fa-pen', t('lib_rename_title'), false, async () => {
      const name = (await promptName(up.name, { title: t('lib_rename_title') }) || '').trim()
      if (!name || name === up.name) return
      up.name = name
      if (persistUserPresets()) buildUserCards()
    })
    mkItem('fa-trash', t('lib_delete_title'), true, () => {
      const i = userPresets.indexOf(up)
      if (i < 0) return
      userPresets.splice(i, 1)
      persistUserPresets()
      // deleting the active preset falls back to its base preset
      if (state.userPreset === up.id) selectPreset(PRESETS[up.base] ? up.base : state.preset)
      buildUserCards()
      window.toast?.(`${t('pt_preset_deleted')} — ${up.name}`, 'info')
    })
    document.body.appendChild(menu)
    const r = anchor.getBoundingClientRect()
    menu.style.left = Math.max(6, Math.min(window.innerWidth - menu.offsetWidth - 6, r.left)) + 'px'
    menu.style.top = Math.max(6, Math.min(window.innerHeight - menu.offsetHeight - 6, r.bottom + 4)) + 'px'
    // attach next tick so the opening click can't instantly close the menu
    setTimeout(() => {
      document.addEventListener('mousedown', onDoc, true)
      document.addEventListener('keydown', onKey, true)
    }, 0)
  }

  function buildUserCards() {
    for (const c of Object.values(userCardEls)) c.wrap.remove()
    userCardEls = {}
    for (const up of userPresets) {
      const wrap = document.createElement('div')
      wrap.className = 'pt-card'
      const btn = document.createElement('button')
      btn.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding:5px;border-radius:8px;border:1px solid var(--win-border,#2a2a2a);background:color-mix(in srgb,var(--text-primary) 4%,var(--surface));cursor:pointer;font-family:inherit;width:100%;'
      const cnv = document.createElement('canvas')
      cnv.width = 168
      cnv.height = 88
      cnv.style.cssText = 'width:100%;height:44px;border-radius:5px;display:block;'
      const lbl = document.createElement('div')
      lbl.style.cssText = 'font-size:10px;text-align:center;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
      lbl.textContent = up.name
      btn.title = up.name
      btn.append(cnv, lbl)
      btn.addEventListener('click', () => applyUserPreset(up))
      const badge = document.createElement('i')
      badge.className = 'fa-solid fa-star pt-card-badge'
      const menuBtn = document.createElement('button')
      menuBtn.className = 'pt-card-menu-btn'
      menuBtn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>'
      menuBtn.addEventListener('click', () => openUserMenu(menuBtn, up))
      wrap.append(btn, badge, menuBtn)
      cardGrid.appendChild(wrap)
      userCardEls[up.id] = { wrap, btn, cnv, lbl, base: up.base }
      drawThumb(cnv, PRESETS[up.base] || PRESETS.neige)
    }
    updateCards()
  }

  async function applyUserPreset(up) {
    const seq = ++applySeq   // a newer apply must win: sprite decode is async
    state.preset = PRESETS[up.base] ? up.base : 'neige'
    state.emitterPoint = null // presets saved before emitter points keep their base emitter
    for (const k of UP_PARAMS) if (up[k] !== undefined) state[k] = up[k]
    state.emitterPoint = sanePoint(state.emitterPoint)
    updatePin()
    state.userPreset = up.id
    try { await setSprite(up.sprite || '') }
    catch { if (seq === applySeq) { setSprite(''); window.toast?.(t('pt_sprite_err'), 'error') } }
    if (seq !== applySeq) return   // superseded while the image decoded
    recomputePalette()
    prewarm()
    syncControls()
    updateCards()
    redrawThumbs()
    saveState()
    if (!playing) render()
  }

  function syncControls() {
    for (const s of sliderRefs) {
      s.inp.value = state[s.key]
      s.val.textContent = s.fmt(state[s.key])
    }
    updateSegs()
    customInp.value = isHex(state.customColor) ? state.customColor : '#8ab4ff'
    bgInp.value = isHex(state.bgColor) ? state.bgColor : '#101014'
    trCb.checked = state.transparent
    bgRow.style.display = state.transparent ? 'none' : 'flex'
    updateChecker()
    updateSpriteUI()
  }

  saveUpBtn.addEventListener('click', async () => {
    const name = (await promptName(t(PRESETS[state.preset].key), { title: t('pat_preset_save'), cancelable: true }) || '').trim()
    if (!name) return
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'preset'
    const up = { id: slug + '-' + Date.now(), name, base: state.preset }
    for (const k of UP_PARAMS) up[k] = state[k]
    if (state.sprite) up.sprite = state.sprite
    userPresets.push(up)
    if (!persistUserPresets()) { userPresets.pop(); return }
    state.userPreset = up.id
    saveState()
    buildUserCards()
    window.toast?.(t('pt_preset_saved'), 'success')
  })

  // ── Panel: sliders ─────────────────────────────────────────────────────────
  const fmtMul = v => '×' + v.toFixed(2)
  const fmtNum = v => v.toFixed(2)
  const sliderRefs = []
  function sliderCtrl(key, label, min, max, step2, fmt) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;'
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary,#aaa);'
    const lbl = document.createElement('span'); lbl.textContent = label
    const val = document.createElement('span')
    val.style.cssText = 'color:var(--text-primary,#ddd);font-weight:500;'
    val.textContent = fmt(state[key])
    row.append(lbl, val)
    const inp = document.createElement('input')
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step2; inp.value = state[key]
    inp.style.cssText = 'width:100%;accent-color:var(--slider-color);'
    inp.addEventListener('input', () => {
      state[key] = parseFloat(inp.value)
      val.textContent = fmt(state[key])
      saveStateSoon()
      if (!playing) render()
    })
    wrap.append(row, inp)
    panel.appendChild(wrap)
    sliderRefs.push({ key, inp, val, fmt })
  }

  panel.append(pLabel(t('pt_settings')))
  sliderCtrl('density', t('pt_density'), 0.2, 3, 0.05, fmtMul)
  sliderCtrl('speed',   t('pt_speed'),   0.2, 3, 0.05, fmtMul)
  sliderCtrl('size',    t('pt_size'),    0.3, 3, 0.05, fmtMul)
  sliderCtrl('wind',    t('pt_wind'),    -1,  1, 0.05, fmtNum)
  sliderCtrl('gravity', t('pt_gravity'), -1,  1, 0.05, fmtNum)

  // ── Panel: colour source (preset palette / theme accent / custom) ──────────
  panel.append(pLabel(t('pt_colors')))
  const segRow = document.createElement('div')
  segRow.style.cssText = 'display:flex;gap:4px;'
  const segs = []
  function updateSegs() {
    for (const s of segs) {
      const on = s.mode === state.colorMode
      s.btn.style.background = on ? 'color-mix(in srgb,var(--color-active) 18%,var(--surface))' : 'none'
      s.btn.style.color = on ? 'var(--text-primary,#ddd)' : 'var(--text-secondary,#888)'
      s.btn.style.borderColor = on ? 'var(--color-active)' : 'var(--win-border,#2a2a2a)'
    }
    customRow.style.display = state.colorMode === 'custom' ? 'flex' : 'none'
  }
  for (const [mode, key] of [['preset', 'pt_col_preset'], ['theme', 'pt_col_theme'], ['custom', 'pt_col_custom']]) {
    const btn = document.createElement('button')
    btn.textContent = t(key)
    btn.style.cssText = 'flex:1;padding:4px 0;font-size:10px;border-radius:6px;border:1px solid var(--win-border,#2a2a2a);background:none;color:var(--text-secondary,#888);cursor:pointer;font-family:inherit;'
    btn.addEventListener('click', () => {
      state.colorMode = mode
      recomputePalette()
      updateSegs()
      saveState()
    })
    segRow.appendChild(btn)
    segs.push({ mode, btn })
  }
  panel.appendChild(segRow)

  const customRow = document.createElement('div')
  customRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;'
  const customLbl = document.createElement('span')
  customLbl.style.cssText = 'font-size:11px;color:var(--text-secondary,#aaa);'
  customLbl.textContent = t('ie_color')
  const customInp = document.createElement('input')
  customInp.type = 'color'
  customInp.value = isHex(state.customColor) ? state.customColor : '#8ab4ff'
  customInp.style.cssText = 'width:40px;height:24px;border:1px solid var(--win-border,#444);border-radius:4px;padding:1px;cursor:pointer;background:none;'
  customInp.addEventListener('input', () => {
    state.customColor = customInp.value
    recomputePalette()
    saveStateSoon()
  })
  customRow.append(customLbl, customInp)
  panel.appendChild(customRow)
  updateSegs()

  // ── Panel: custom sprite (image replaces the drawn shape) ──────────────────
  panel.append(pLabel(t('pt_sprite_lbl')))
  const spriteRow = document.createElement('div')
  spriteRow.style.cssText = 'display:flex;align-items:center;gap:6px;'
  const spritePickBtn = document.createElement('button')
  spritePickBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:6px;flex:1;min-width:0;padding:5px 8px;background:var(--surface,#111);border:1px solid var(--win-border-in,#1e1e1e);border-radius:6px;color:var(--text-primary,#ddd);font-size:11px;font-family:inherit;cursor:pointer;'
  spritePickBtn.innerHTML = '<i class="fa-solid fa-image"></i><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></span>'
  spritePickBtn.querySelector('span').textContent = t('pt_sprite_pick')
  const spritePrev = document.createElement('canvas')
  spritePrev.width = 48
  spritePrev.height = 48
  spritePrev.style.cssText = 'width:24px;height:24px;flex-shrink:0;border:1px solid var(--win-border-in,#1e1e1e);border-radius:4px;display:none;background:' + CHECKER + ';'
  const spriteClearBtn = document.createElement('button')
  spriteClearBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
  spriteClearBtn.title = t('pt_sprite_clear')
  spriteClearBtn.style.cssText = GHOST + 'width:24px;padding:4px 0;display:none;flex-shrink:0;'
  spriteRow.append(spritePickBtn, spritePrev, spriteClearBtn)
  panel.appendChild(spriteRow)

  const tintWrap = document.createElement('label')
  tintWrap.style.cssText = 'display:none;align-items:center;gap:7px;font-size:11px;color:var(--text-secondary,#aaa);cursor:pointer;'
  const tintCb = document.createElement('input')
  tintCb.type = 'checkbox'
  tintCb.checked = state.spriteTint
  tintCb.style.cssText = 'accent-color:var(--color-active);margin:0;'
  const tintLbl = document.createElement('span')
  tintLbl.textContent = t('pt_sprite_tint')
  tintWrap.append(tintCb, tintLbl)
  panel.appendChild(tintWrap)

  function updateSpriteUI() {
    const has = !!spriteCanvas
    spritePrev.style.display = has ? 'block' : 'none'
    spriteClearBtn.style.display = has ? '' : 'none'
    tintWrap.style.display = has ? 'flex' : 'none'
    tintCb.checked = state.spriteTint
    if (!has) return
    const g = spritePrev.getContext('2d')
    g.clearRect(0, 0, spritePrev.width, spritePrev.height)
    const k = Math.min(spritePrev.width / spriteW, spritePrev.height / spriteH)
    g.drawImage(spriteCanvas, (spritePrev.width - spriteW * k) / 2, (spritePrev.height - spriteH * k) / 2, spriteW * k, spriteH * k)
  }

  async function pickSpriteFile() {
    if (window.__TAURI__) {
      const res = await window.__TAURI__.core.invoke('pick_files_with_filter', { filterName: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] })
      const item = Array.isArray(res) ? res[0] : res
      if (!item) return ''
      const path = typeof item === 'string' ? item : item.path
      const ext = path.split('.').pop().toLowerCase()
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
      return 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + b64
    }
    return new Promise(resolve => {
      const inp = document.createElement('input')
      inp.type = 'file'
      inp.accept = 'image/png,image/jpeg,image/webp'
      // 'cancel' fires on OS-dialog dismiss (Chromium 113+) — without it the
      // promise never settles and the awaiting click handler hangs.
      inp.addEventListener('cancel', () => resolve(''))
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0]
        if (!f) { resolve(''); return }
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result || ''))
        fr.onerror = () => resolve('')
        fr.readAsDataURL(f)
      })
      inp.click()
    })
  }

  spritePickBtn.addEventListener('click', async () => {
    try {
      const dataUrl = await pickSpriteFile()
      if (!dataUrl) return
      await setSprite(dataUrl)
      saveState()
    } catch (e) { window.toast?.(String(e && e.message || e), 'error') }
  })
  spriteClearBtn.addEventListener('click', () => {
    setSprite('')
    saveState()
  })
  tintCb.addEventListener('change', () => {
    state.spriteTint = tintCb.checked
    rebuildTints()
    saveState()
    if (!playing) render()
  })

  // ── Panel: background ──────────────────────────────────────────────────────
  panel.append(pLabel(t('ie_bg')))
  const trWrap = document.createElement('label')
  trWrap.style.cssText = 'display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text-secondary,#aaa);cursor:pointer;'
  const trCb = document.createElement('input')
  trCb.type = 'checkbox'
  trCb.checked = state.transparent
  trCb.style.cssText = 'accent-color:var(--color-active);margin:0;'
  const trLbl = document.createElement('span'); trLbl.textContent = t('pat_transparent')
  trWrap.append(trCb, trLbl)
  panel.appendChild(trWrap)

  const bgRow = document.createElement('div')
  bgRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;'
  const bgLbl = document.createElement('span')
  bgLbl.style.cssText = 'font-size:11px;color:var(--text-secondary,#aaa);'
  bgLbl.textContent = t('ie_color')
  const bgInp = document.createElement('input')
  bgInp.type = 'color'
  bgInp.value = isHex(state.bgColor) ? state.bgColor : '#101014'
  bgInp.style.cssText = 'width:40px;height:24px;border:1px solid var(--win-border,#444);border-radius:4px;padding:1px;cursor:pointer;background:none;'
  bgInp.addEventListener('input', () => {
    state.bgColor = bgInp.value
    redrawThumbs()
    saveStateSoon()
    if (!playing) render()
  })
  bgRow.append(bgLbl, bgInp)
  panel.appendChild(bgRow)

  trCb.addEventListener('change', () => {
    state.transparent = trCb.checked
    bgRow.style.display = state.transparent ? 'none' : 'flex'
    updateChecker()
    redrawThumbs()
    saveState()
    if (!playing) render()
  })
  bgRow.style.display = state.transparent ? 'none' : 'flex'
  updateChecker()

  updateCards()
  redrawThumbs()
  buildUserCards()

  // ── Recording (shared by WebM export and video send) ───────────────────────
  let recording = false
  let curRec = null   // outer handle so teardown can abort an in-flight capture
  let torn = false
  function pickMime() {
    const list = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    return list.find(m => window.MediaRecorder?.isTypeSupported?.(m)) || ''
  }
  function recordWebm(ms) {
    return new Promise((resolve, reject) => {
      if (!window.MediaRecorder) { reject(new Error(t('pt_norec'))); return }
      recording = true
      const wasPlaying = playing
      if (!playing) setPlaying(true)
      let stream
      try { stream = canvas.captureStream(30) }
      catch (e) { recording = false; if (!wasPlaying) setPlaying(false); reject(e); return }
      const mime = pickMime()
      let rec
      try {
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      } catch (e) {
        recording = false
        if (!wasPlaying) setPlaying(false)
        reject(e)
        return
      }
      curRec = rec
      const chunks = []
      // Stop the capture track on every exit — a live CanvasCaptureTrack keeps
      // copying frames off the canvas on each paint until GC.
      const done = fn => {
        recording = false
        curRec = null
        stream.getTracks().forEach(tr => tr.stop())
        if (!wasPlaying) setPlaying(false)
        fn()
      }
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = () => done(() => resolve(new Blob(chunks, { type: 'video/webm' })))
      rec.onerror = e => done(() => reject(e.error || new Error('MediaRecorder')))
      try { rec.start(120) }
      catch (e) { done(() => reject(e)); return }
      setTimeout(() => { try { if (rec.state !== 'inactive') rec.stop() } catch {} }, ms)
    })
  }
  function bufToB64(buf) {
    const u8 = new Uint8Array(buf)
    let s = ''
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
    return btoa(s)
  }

  // ── Media bus: snapshot → image targets, recording → video targets ─────────
  async function getSendMedia(targetId) {
    if (VIDEO_TARGETS.some(v => v.id === targetId)) {
      if (recording) return null
      const ms = state.recSec * 1000
      window.toast?.(t('pt_recording'), 'info', ms)
      const blob = await recordWebm(ms)
      if (torn) return null   // window closed mid-capture: nothing to hand the bus
      // the receiver owns this blob URL — never revoke it here
      return { kind: 'video', blobUrl: URL.createObjectURL(blob), name: 'particules-' + state.preset + '.webm' }
    }
    if (!playing) render()
    return imageMedia(canvas, 'particules-' + state.preset)
  }

  // ── Export: PNG ────────────────────────────────────────────────────────────
  exportPngBtn.addEventListener('click', async () => {
    if (!W) return
    if (!playing) render()
    const url = canvas.toDataURL('image/png')
    if (window.__TAURI__) {
      try {
        const path = await window.__TAURI__.dialog.save({
          defaultPath: 'particules-' + state.preset + '.png',
          filters: [{ name: 'PNG', extensions: ['png'] }],
        })
        if (!path) return
        await window.__TAURI__.core.invoke('save_binary_file', { path, base64: url.split(',')[1] })
        window.toast?.(t('pt_png_ok'), 'success')
      } catch (e) { window.toast?.(String(e), 'error') }
    } else {
      const a = document.createElement('a')
      a.href = url; a.download = 'particules-' + state.preset + '.png'; a.click()
    }
  })

  // ── Export: WebM ───────────────────────────────────────────────────────────
  exportWebmBtn.addEventListener('click', async () => {
    if (recording || !W) return
    if (!window.MediaRecorder) { window.toast?.(t('pt_norec'), 'error'); return }
    const ms = state.recSec * 1000
    exportWebmBtn.disabled = true
    exportWebmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'
    window.toast?.(t('pt_recording'), 'info', ms)
    try {
      const blob = await recordWebm(ms)
      if (torn) return   // window closed mid-capture: no save dialog for a dead tool
      if (window.__TAURI__) {
        const path = await window.__TAURI__.dialog.save({
          defaultPath: 'particules-' + state.preset + '.webm',
          filters: [{ name: 'WebM', extensions: ['webm'] }],
        })
        if (path) {
          await window.__TAURI__.core.invoke('save_binary_file', { path, base64: bufToB64(await blob.arrayBuffer()) })
          window.toast?.(t('pt_webm_ok'), 'success')
        }
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob); a.download = 'particules-' + state.preset + '.webm'; a.click()
      }
    } catch (e) { window.toast?.(String(e), 'error') }
    exportWebmBtn.disabled = false
    exportWebmBtn.innerHTML = WEBM_LABEL
  })

  // ── Kickoff + teardown ─────────────────────────────────────────────────────
  schedule()
  // restore a persisted sprite (decoded once; a bad dataURL falls back to shapes);
  // re-save so an oversized legacy dataURL is persisted in its ≤128px form
  if (state.sprite) setSprite(state.sprite).then(() => saveState()).catch(() => { setSprite(''); saveState() })

  const mo = new MutationObserver(() => {
    if (body.isConnected) return
    torn = true
    // a live MediaRecorder + captureStream track keep running (and pop a save
    // dialog when the timer fires) long after the window is gone
    try { if (curRec && curRec.state !== 'inactive') curRec.stop() } catch {}
    if (saveT) saveState()
    stopLoop()
    closeUserMenu?.()
    ro.disconnect()
    document.removeEventListener('visibilitychange', onVis)
    mo.disconnect()
  })
  mo.observe(document.body, { childList: true, subtree: true })
}
