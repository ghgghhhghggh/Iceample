// textanim.js — Kinetic typography studio: 10 modern text animation presets
// rendered on canvas, exported as PNG / one-loop WebM or sent over the media bus.
import { t } from './i18n.js'
import { makeSendButton, imageMedia, VIDEO_TARGETS, IMAGE_TARGETS } from './media-bus.js'
import { trackRecentFile } from './recent.js'
import { promptName } from './rename-dialog.js'

const LS_KEY = 'iceample:textanim:cfg'
const LS_USER = 'iceample:textanim:userpresets'
const BASE_MS = 2600          // loop duration at speed 1x
const ENTER_END = 0.72        // entrance presets finish here, rest of the cycle is a hold

function injectStyles() {
  if (document.getElementById('ta-styles')) return
  const s = document.createElement('style'); s.id = 'ta-styles'
  s.textContent = `
.ta-body{display:flex;height:100%;background:var(--surface);color:var(--text-primary);font-family:inherit;font-size:12px}
.ta-main{flex:1;min-width:0;display:flex;flex-direction:column}
.ta-preview{flex:1;position:relative;background:var(--bg);min-height:120px;overflow:hidden}
.ta-preview.checker{background-image:repeating-conic-gradient(color-mix(in srgb,var(--text-primary) 9%,transparent) 0% 25%,transparent 0% 50%);background-size:18px 18px}
.ta-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.ta-presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:6px;padding:10px;border-top:1px solid var(--win-border-in);flex-shrink:0;overflow-y:auto;max-height:150px}
.ta-card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:9px 4px 7px;border-radius:9px;border:1px solid var(--win-border-in);background:color-mix(in srgb,var(--surface2,var(--surface)) 60%,transparent);color:var(--text-secondary);cursor:pointer;font-family:inherit;transition:border-color .12s,background .12s,color .12s,transform .12s}
.ta-card i{font-size:15px;opacity:.85}
.ta-card span{font-size:9px;line-height:1.25;text-align:center}
.ta-card:hover{border-color:var(--win-border);color:var(--text-primary);transform:translateY(-1px)}
.ta-card.sel{border-color:var(--color-active);background:color-mix(in srgb,var(--color-active) 14%,transparent);color:var(--color-active)}
.ta-card .ta-star{position:absolute;top:4px;left:5px;font-size:7px;color:var(--color-active);opacity:.8}
.ta-card.add{border-style:dashed;background:none}
.ta-more{position:absolute;top:2px;right:2px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;border:none;border-radius:4px;background:none;color:var(--text-secondary);cursor:pointer;opacity:0;transition:opacity .12s,background .12s}
.ta-more i{font-size:9px;opacity:1}
.ta-card:hover .ta-more,.ta-more:focus-visible{opacity:1}
.ta-more:hover{background:color-mix(in srgb,var(--text-primary) 14%,transparent);color:var(--text-primary)}
.ta-side{width:196px;flex-shrink:0;display:flex;flex-direction:column;gap:10px;padding:12px;border-left:1px solid var(--win-border-in);overflow-y:auto}
.ta-field{display:flex;flex-direction:column;gap:5px}
.ta-grid{display:grid;grid-template-columns:56px 1fr;gap:8px;align-items:center}
.ta-side label,.ta-sec{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-secondary)}
.ta-sec{border-top:1px solid var(--win-border-in);margin-top:2px;padding-top:9px}
.ta-inp{width:100%;padding:5px 8px;background:color-mix(in srgb,var(--surface2,var(--surface)) 80%,transparent);border:1px solid var(--win-border-in);border-radius:6px;color:var(--text-primary);font-size:12px;font-family:inherit;outline:none;box-sizing:border-box}
.ta-inp:focus{border-color:var(--color-active)}
.ta-textarea{resize:vertical;min-height:52px;line-height:1.4}
.ta-color{width:100%;height:26px;padding:1px;border:1px solid var(--win-border-in);border-radius:6px;cursor:pointer;background:none;box-sizing:border-box}
.ta-slidewrap{display:flex;align-items:center;gap:7px;min-width:0}
.ta-slidewrap input{flex:1;min-width:0}
.ta-sval{font-size:10px;color:var(--color-active);font-variant-numeric:tabular-nums;flex-shrink:0;width:26px;text-align:right}
.ta-bgwrap{display:flex;align-items:center;gap:6px}
.ta-bgwrap .ta-color{flex:1}
.ta-chip{padding:5px 8px;border:1px solid var(--win-border-in);border-radius:6px;background:none;color:var(--text-secondary);font-size:11px;cursor:pointer;font-family:inherit;flex-shrink:0;transition:all .12s}
.ta-chip:hover{color:var(--text-primary);border-color:var(--win-border)}
.ta-chip.on{border-color:var(--color-active);background:color-mix(in srgb,var(--color-active) 15%,transparent);color:var(--color-active)}
.ta-actions{display:flex;gap:6px}
.ta-actions>*{flex:1}
.ta-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 8px;border:1px solid var(--win-border-in);border-radius:7px;background:color-mix(in srgb,var(--text-primary) 6%,var(--surface));color:var(--text-secondary);font-size:11px;cursor:pointer;font-family:inherit;transition:all .12s;white-space:nowrap}
.ta-btn:hover{background:color-mix(in srgb,var(--text-primary) 12%,var(--surface));color:var(--text-primary)}
.ta-btn:disabled{opacity:.45;pointer-events:none}
.ta-btn.primary{border-color:var(--btn-primary);background:color-mix(in srgb,var(--btn-primary) 16%,transparent);color:var(--btn-primary)}
.ta-btn.primary:hover{background:color-mix(in srgb,var(--btn-primary) 26%,transparent)}
.ta-toggle{width:34px;height:18px;border-radius:9px;border:none;cursor:pointer;position:relative;transition:background .15s;justify-self:start}
.ta-toggle.off{background:var(--win-border-in)}
.ta-toggle.on{background:var(--color-active)}
.ta-toggle::after{content:'';position:absolute;top:3px;width:12px;height:12px;border-radius:50%;background:var(--surface);transition:left .15s}
.ta-toggle.off::after{left:3px}
.ta-toggle.on::after{left:19px}
.ta-menu{position:fixed;z-index:10000;min-width:118px;background:var(--surface);border:1px solid var(--win-border-in);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.4);padding:4px;display:flex;flex-direction:column;gap:1px}
.ta-menu-item{display:flex;align-items:center;gap:7px;padding:6px 9px;border:none;background:none;color:var(--text-secondary);font-size:11px;font-family:inherit;border-radius:5px;cursor:pointer;text-align:left}
.ta-menu-item i{font-size:9px;width:11px;text-align:center}
.ta-menu-item:hover{background:color-mix(in srgb,var(--text-primary) 10%,transparent);color:var(--text-primary)}
.ta-menu-item.danger:hover{color:var(--vu-color-high)}
`
  document.head.appendChild(s)
}

// ── Easing / helpers ──────────────────────────────────────────────────────────
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v
const easeOutQuint = t0 => 1 - (1 - t0) ** 5
const easeInOutCubic = t0 => t0 < 0.5 ? 4 * t0 * t0 * t0 : 1 - (-2 * t0 + 2) ** 3 / 2
const easeOutBack = t0 => { const c = 2.2, u = t0 - 1; return 1 + u * u * ((c + 1) * u + c) }
function easeOutBounce(t0) {
  const n1 = 7.5625, d1 = 2.75
  if (t0 < 1 / d1) return n1 * t0 * t0
  if (t0 < 2 / d1) return n1 * (t0 -= 1.5 / d1) * t0 + 0.75
  if (t0 < 2.5 / d1) return n1 * (t0 -= 2.25 / d1) * t0 + 0.9375
  return n1 * (t0 -= 2.625 / d1) * t0 + 0.984375
}
// staggered per-item progress: item i of n starts at (i/(n-1))*span of the entrance
const stag = (p, i, n, span) => clamp01((p - (n > 1 ? i / (n - 1) : 0) * span) / (1 - span))
// deterministic pseudo-random (loop-stable, export-stable)
const rnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

function fillAll(tctx, lay, dx = 0, dy = 0) {
  for (const L of lay.lines) for (const c of L.chars) tctx.fillText(c.ch, c.x + dx, L.y + dy)
}

// ── Preset renderers ──────────────────────────────────────────────────────────
// Each draw(f) gets f = { ctx, W, H, o, lay, q (0..1 loop phase), p (entrance
// progress with end hold), t (phase ms), dpr, scratch() }. Entrance presets use
// p, continuous presets use q and are built to loop seamlessly.

function drawTypewriter(f) {
  const { ctx, o, lay } = f
  const shown = Math.floor(f.p * lay.total + 1e-4)
  ctx.fillStyle = o.color
  let n = 0, cx = null, cy = null
  for (const L of lay.lines) {
    if (cx === null && L.chars.length) { cx = L.x0; cy = L.y }
    for (const c of L.chars) {
      if (n >= shown) break
      ctx.fillText(c.ch, c.x, L.y)
      cx = c.x + c.w; cy = L.y
      n++
    }
    if (n >= shown) break
  }
  if (cx === null) return
  const on = f.p < 1 || Math.floor(f.t / 420) % 2 === 0
  if (on) {
    ctx.fillStyle = o.accent
    ctx.fillRect(cx + o.size * 0.06, cy - o.size * 0.5, Math.max(2, o.size * 0.07), o.size)
  }
}

function drawBounce(f) {
  const { ctx, o, lay } = f
  ctx.fillStyle = o.color
  let i = 0
  for (const L of lay.lines) for (const c of L.chars) {
    const lp = stag(f.p, i++, lay.total, 0.55)
    if (lp <= 0) continue
    ctx.globalAlpha = clamp01(lp * 5)
    ctx.fillText(c.ch, c.x, L.y - (1 - easeOutBounce(lp)) * o.size * 2.2)
  }
  ctx.globalAlpha = 1
}

function drawWave(f) {
  const { ctx, o, lay } = f
  const ph = f.q * Math.PI * 4   // two full periods per loop → seamless
  ctx.fillStyle = o.color
  let i = 0
  for (const L of lay.lines) for (const c of L.chars) {
    const a = ph + i * 0.52
    ctx.save()
    ctx.translate(c.x + c.w / 2, L.y + Math.sin(a) * o.size * 0.2)
    ctx.rotate(Math.sin(a + 0.6) * 0.07)
    ctx.fillText(c.ch, -c.w / 2, 0)
    ctx.restore()
    i++
  }
}

function drawGlitch(f) {
  const { ctx, o, lay, H } = f
  const step = Math.floor(f.q * 30)
  const burst = rnd(step * 7.31) < 0.38
  const s = f.scratch()
  const sx = s.x
  sx.save()
  sx.setTransform(1, 0, 0, 1, 0, 0)
  sx.clearRect(0, 0, s.c.width, s.c.height)
  sx.restore()
  sx.setTransform(ctx.getTransform())
  sx.font = ctx.font
  sx.textAlign = 'left'
  sx.textBaseline = 'middle'
  if (burst) {
    // RGB split ghosts (canvas content colors, not UI)
    const mag = Math.max(2, o.size * 0.09) * (0.6 + rnd(step * 1.7))
    sx.globalAlpha = 0.55
    sx.fillStyle = '#ff2d55'
    fillAll(sx, lay, -mag, 0)
    sx.fillStyle = '#00e5ff'
    fillAll(sx, lay, mag, 0)
    sx.globalAlpha = 1
  }
  sx.fillStyle = o.color
  fillAll(sx, lay)
  const m = ctx.getTransform()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const blit = (sy, sh, dx) => {
    if (sh <= 0) return
    ctx.drawImage(s.c, 0, sy * f.dpr, s.c.width, sh * f.dpr, dx * f.dpr, sy * f.dpr, s.c.width, sh * f.dpr)
  }
  if (burst) {
    // horizontal slice jitter, deterministic per step
    const cuts = []
    for (let k = 0; k < 3; k++) {
      cuts.push({
        sy: rnd(step * 3.7 + k * 13.1) * H,
        sh: 5 + rnd(step * 9.1 + k * 5.7) * 16,
        dx: (rnd(step * 5.3 + k * 3.3) - 0.5) * o.size * 1.1
      })
    }
    cuts.sort((a, b) => a.sy - b.sy)
    let cur = 0
    for (const cu of cuts) {
      const top = Math.max(cur, cu.sy)
      if (top > cur) blit(cur, top - cur, 0)
      blit(top, cu.sh, cu.dx)
      cur = Math.max(cur, top + cu.sh)
    }
    blit(cur, H - cur, 0)
  } else {
    ctx.drawImage(s.c, 0, 0)
  }
  ctx.setTransform(m)
}

function drawNeon(f) {
  const { ctx, o, lay } = f
  // brief re-strike flicker at loop start, then a slow breathing glow
  const strike = f.q < 0.1 ? (rnd(Math.floor(f.q * 90) * 3.1) < 0.4 ? 0.15 : 1) : 1
  const pulse = 0.62 + 0.38 * (0.5 - 0.5 * Math.cos(f.q * Math.PI * 4))
  ctx.save()
  ctx.globalAlpha = strike
  ctx.shadowColor = o.accent
  ctx.shadowBlur = o.size * 0.7 * pulse * strike
  ctx.fillStyle = o.accent
  fillAll(ctx, lay)
  ctx.shadowBlur = o.size * 0.25 * pulse
  ctx.fillStyle = o.color
  fillAll(ctx, lay)
  ctx.restore()
}

function drawGradientSweep(f) {
  const { ctx, o, lay, W } = f
  // gradient window slides across [-W, +W]; end stops clamp to the base color → seamless
  const off = (f.q * 2 - 1) * W
  const g = ctx.createLinearGradient(off, 0, off + W, 0)
  g.addColorStop(0, o.color)
  g.addColorStop(0.5, o.accent)
  g.addColorStop(1, o.color)
  ctx.fillStyle = g
  fillAll(ctx, lay)
}

function drawWords(f) {
  const { ctx, o, lay } = f
  const total = lay.lines.reduce((a, L) => a + L.words.length, 0)
  ctx.fillStyle = o.color
  let wi = 0
  for (const L of lay.lines) for (const w of L.words) {
    const lp = stag(f.p, wi++, total, 0.6)
    if (lp <= 0) continue
    const e = easeOutQuint(lp)
    ctx.globalAlpha = e
    ctx.fillText(w.text, w.x, L.y + (1 - e) * o.size * 0.55)
  }
  ctx.globalAlpha = 1
}

function drawMask(f) {
  const { ctx, o, lay } = f
  const n = lay.lines.length
  lay.lines.forEach((L, li) => {
    if (!L.chars.length) return
    const lp = stag(f.p, li, n, 0.4)
    if (lp <= 0) return
    const pad = o.size * 0.18
    const bx = L.x0 - pad, bw = L.width + pad * 2
    const top = L.y - lay.lineH * 0.52, bh = lay.lineH * 1.04
    if (lp < 0.5) {
      // accent block sweeps in from the left
      ctx.fillStyle = o.accent
      ctx.fillRect(bx, top, bw * easeInOutCubic(lp * 2), bh)
    } else {
      // block slides out to the right, revealing the text behind it
      const e = easeInOutCubic((lp - 0.5) * 2)
      const edge = bx + bw * e
      ctx.save()
      ctx.beginPath(); ctx.rect(bx, top, edge - bx, bh); ctx.clip()
      ctx.fillStyle = o.color
      for (const c of L.chars) ctx.fillText(c.ch, c.x, L.y)
      ctx.restore()
      if (e < 1) { ctx.fillStyle = o.accent; ctx.fillRect(edge, top, bw - (edge - bx), bh) }
    }
  })
}

function drawElastic(f) {
  const { ctx, o, lay } = f
  ctx.fillStyle = o.color
  let i = 0
  for (const L of lay.lines) for (const c of L.chars) {
    const lp = stag(f.p, i++, lay.total, 0.45)
    if (lp <= 0) continue
    const sc = Math.max(0.001, easeOutBack(lp))
    ctx.save()
    ctx.globalAlpha = clamp01(lp * 4)
    ctx.translate(c.x + c.w / 2, L.y)
    ctx.scale(sc, sc)
    ctx.fillText(c.ch, -c.w / 2, 0)
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

function drawSlice(f) {
  const { ctx, o, lay, W } = f
  ctx.fillStyle = o.color
  let base = 0
  for (const L of lay.lines) {
    const half = lay.lineH * 0.75
    for (const pass of [-1, 1]) {   // -1 = top half from the left, 1 = bottom half from the right
      ctx.save()
      ctx.beginPath()
      if (pass === -1) ctx.rect(-W, L.y - half, W * 3, half + 0.5)
      else ctx.rect(-W, L.y, W * 3, half)
      ctx.clip()
      let i = base
      for (const c of L.chars) {
        const lp = stag(f.p, i++, lay.total, 0.5)
        if (lp <= 0) continue
        const e = easeOutQuint(lp)
        ctx.globalAlpha = clamp01(lp * 3)
        ctx.fillText(c.ch, c.x - pass * (1 - e) * o.size * 2.4, L.y)
      }
      ctx.restore()
    }
    base += L.chars.length
  }
  ctx.globalAlpha = 1
}

const PRESETS = [
  { id: 'typewriter', icon: 'fa-terminal',    key: 'ta_p_typewriter', draw: drawTypewriter },
  { id: 'bounce',     icon: 'fa-circle-dot',  key: 'ta_p_bounce',     draw: drawBounce },
  { id: 'wave',       icon: 'fa-water',       key: 'ta_p_wave',       draw: drawWave },
  { id: 'glitch',     icon: 'fa-bolt',        key: 'ta_p_glitch',     draw: drawGlitch },
  { id: 'neon',       icon: 'fa-lightbulb',   key: 'ta_p_neon',       draw: drawNeon },
  { id: 'gradient',   icon: 'fa-paintbrush',  key: 'ta_p_gradient',   draw: drawGradientSweep },
  { id: 'words',      icon: 'fa-align-left',  key: 'ta_p_words',      draw: drawWords },
  { id: 'mask',       icon: 'fa-highlighter', key: 'ta_p_mask',       draw: drawMask },
  { id: 'elastic',    icon: 'fa-expand',      key: 'ta_p_elastic',    draw: drawElastic },
  { id: 'slice',      icon: 'fa-scissors',    key: 'ta_p_slice',      draw: drawSlice },
]
const PRESET_MAP = Object.fromEntries(PRESETS.map(p0 => [p0.id, p0]))

const FONTS = [
  { id: 'sans',    key: 'ta_font_sans',    weight: 800, stack: "'Inter','Segoe UI',system-ui,sans-serif" },
  { id: 'serif',   key: 'ta_font_serif',   weight: 700, stack: "Georgia,'Times New Roman',serif" },
  { id: 'mono',    key: 'ta_font_mono',    weight: 700, stack: "'Cascadia Code',Consolas,'Courier New',monospace" },
  { id: 'display', key: 'ta_font_display', weight: 900, stack: "'Arial Black','Segoe UI',sans-serif" },
]

// ── Small utilities ───────────────────────────────────────────────────────────
let _cconv = null
function themeHex(varName, fallback) {
  // read a theme token and normalize it to #rrggbb for <input type=color>
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!v) return fallback
  if (!_cconv) _cconv = document.createElement('canvas').getContext('2d')
  try { _cconv.fillStyle = '#000'; _cconv.fillStyle = v } catch { return fallback }
  const out = _cconv.fillStyle
  return /^#[0-9a-f]{6}$/i.test(out) ? out : fallback
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

async function saveBlob(blob, defaultName, ext, filterName) {
  const invoke = window.__TAURI__?.core?.invoke
  const dialog = window.__TAURI__?.dialog
  if (invoke && dialog?.save) {
    let path = null
    try { path = await dialog.save({ defaultPath: defaultName, filters: [{ name: filterName, extensions: [ext] }] }) } catch {}
    if (!path) return false
    await invoke('save_binary_file', { path, base64: await blobToBase64(blob) })
    try { trackRecentFile(path, path.replace(/^.*[\\/]/, '')) } catch {}
    return true
  }
  // browser fallback: plain download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = defaultName
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return true
}

// ── User presets (style only — never the text) ────────────────────────────────
function loadUserPresets() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_USER) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function saveUserPresets(arr) {
  try { localStorage.setItem(LS_USER, JSON.stringify(arr)); return true }
  catch { window.toast?.(t('ta_preset_store_fail'), 'error'); return false }
}

// ── Main init ─────────────────────────────────────────────────────────────────
export function initTextAnim(body) {
  injectStyles()

  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch {}

  const defaults = {
    preset: 'typewriter',
    text: t('ta_default_text'),
    size: 64,
    font: 'sans',
    color: themeHex('--text-primary', '#ffffff'),
    accent: themeHex('--color-active', '#8ab4ff'),
    bg: themeHex('--bg', '#101018'),
    transparent: false,
    speed: 1,
    loop: true
  }
  const cfg = { ...defaults, ...saved }
  if (!PRESET_MAP[cfg.preset]) cfg.preset = defaults.preset
  // 'custom' is only kept when the saved font file can be re-read (Tauri path)
  const canRestoreFont = cfg.font === 'custom' && typeof cfg.fontPath === 'string' && cfg.fontPath && !!window.__TAURI__?.core?.invoke
  if (!FONTS.some(fo => fo.id === cfg.font) && !canRestoreFont) cfg.font = defaults.font

  body.innerHTML = `
<div class="ta-body">
  <div class="ta-main">
    <div class="ta-preview" id="ta-preview"><canvas class="ta-canvas" id="ta-canvas"></canvas></div>
    <div class="ta-presets" id="ta-presets"></div>
  </div>
  <div class="ta-side">
    <div class="ta-field">
      <label for="ta-text"></label>
      <textarea class="ta-inp ta-textarea" id="ta-text" rows="3"></textarea>
    </div>
    <div class="ta-grid">
      <label id="ta-l-size"></label><input class="ta-inp" id="ta-size" type="number" min="10" max="240" step="2">
      <label id="ta-l-font"></label><select class="ta-inp" id="ta-font"></select>
      <label id="ta-l-color"></label><input class="ta-color" id="ta-color" type="color">
      <label id="ta-l-accent"></label><input class="ta-color" id="ta-accent" type="color">
      <label id="ta-l-speed"></label>
      <div class="ta-slidewrap"><input id="ta-speed" type="range" min="0.25" max="3" step="0.25"><span class="ta-sval" id="ta-speed-val"></span></div>
      <label id="ta-l-bg"></label>
      <div class="ta-bgwrap"><input class="ta-color" id="ta-bg" type="color"><button class="ta-chip" id="ta-transp"><i class="fa-solid fa-chess-board"></i></button></div>
      <label id="ta-l-loop"></label><button class="ta-toggle" id="ta-loop"></button>
    </div>
    <div class="ta-actions">
      <button class="ta-btn primary" id="ta-replay"><i class="fa-solid fa-rotate-left"></i> <span></span></button>
    </div>
    <div class="ta-sec" id="ta-l-export"></div>
    <div class="ta-actions">
      <button class="ta-btn" id="ta-png"><i class="fa-solid fa-image"></i> <span></span></button>
      <button class="ta-btn" id="ta-webm"><i class="fa-solid fa-film"></i> <span></span></button>
    </div>
    <div class="ta-actions" id="ta-send-row"></div>
  </div>
</div>`

  const previewEl = body.querySelector('#ta-preview')
  const canvas    = body.querySelector('#ta-canvas')
  const ctx       = canvas.getContext('2d')
  const presetsEl = body.querySelector('#ta-presets')
  const textInp   = body.querySelector('#ta-text')
  const sizeInp   = body.querySelector('#ta-size')
  const fontSel   = body.querySelector('#ta-font')
  const colorInp  = body.querySelector('#ta-color')
  const accentInp = body.querySelector('#ta-accent')
  const speedInp  = body.querySelector('#ta-speed')
  const speedVal  = body.querySelector('#ta-speed-val')
  const bgInp     = body.querySelector('#ta-bg')
  const transpBtn = body.querySelector('#ta-transp')
  const loopBtn   = body.querySelector('#ta-loop')
  const replayBtn = body.querySelector('#ta-replay')
  const pngBtn    = body.querySelector('#ta-png')
  const webmBtn   = body.querySelector('#ta-webm')
  const sendRow   = body.querySelector('#ta-send-row')

  // labels
  body.querySelector('label[for="ta-text"]').textContent = t('ta_text')
  body.querySelector('#ta-l-size').textContent   = t('ta_size')
  body.querySelector('#ta-l-font').textContent   = t('ta_font')
  body.querySelector('#ta-l-color').textContent  = t('ta_color_main')
  body.querySelector('#ta-l-accent').textContent = t('ta_color_accent')
  body.querySelector('#ta-l-speed').textContent  = t('ta_speed')
  body.querySelector('#ta-l-bg').textContent     = t('ta_bg')
  body.querySelector('#ta-l-loop').textContent   = t('ta_loop')
  body.querySelector('#ta-l-export').textContent = t('ta_export')
  replayBtn.querySelector('span').textContent    = t('ta_replay')
  pngBtn.querySelector('span').textContent       = t('ta_export_png')
  webmBtn.querySelector('span').textContent      = t('ta_export_webm')
  transpBtn.title = t('ta_transparent')

  FONTS.forEach(fo => {
    const op = document.createElement('option')
    op.value = fo.id
    op.textContent = t(fo.key)
    fontSel.appendChild(op)
  })
  const customOpt = document.createElement('option')
  customOpt.value = 'custom'
  customOpt.textContent = t('ta_font_custom')
  fontSel.appendChild(customOpt)

  // apply config
  let cur = cfg.preset
  let loop = !!cfg.loop
  let transparent = !!cfg.transparent
  textInp.value = cfg.text
  sizeInp.value = cfg.size
  fontSel.value = cfg.font
  colorInp.value = cfg.color
  accentInp.value = cfg.accent
  bgInp.value = cfg.bg
  speedInp.value = cfg.speed
  loopBtn.className = 'ta-toggle ' + (loop ? 'on' : 'off')
  transpBtn.classList.toggle('on', transparent)
  previewEl.classList.toggle('checker', transparent)
  speedVal.textContent = cfg.speed + '×'

  // ── State ───────────────────────────────────────────────────────────────────
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  let rafId = null, lastTs = null, phaseMs = 0, lastQ = 0
  let recorder = null            // active MediaRecorder while capturing one loop
  let dead = false
  let layoutCache = null, layoutKey = ''
  let scratchC = null, scratchX = null
  let userPresets = loadUserPresets()
  let curUser = typeof cfg.userPreset === 'string' && userPresets.some(u => u.id === cfg.userPreset) ? cfg.userPreset : null
  let customFace = null          // active FontFace added to document.fonts
  let customFont = null          // { name, seq } once a user font is loaded
  let customFontPath = typeof cfg.fontPath === 'string' && cfg.fontPath ? cfg.fontPath : null
  let fontSeq = 0
  let prevFont = FONTS.some(fo => fo.id === cfg.font) ? cfg.font : 'sans'

  function getOpts() {
    const fo = fontSel.value === 'custom' && customFont
      ? { id: 'custom' + customFont.seq, weight: 700, stack: "'IceampleUser','Inter','Segoe UI',system-ui,sans-serif" }
      : FONTS.find(x => x.id === fontSel.value) || FONTS[0]
    return {
      text: textInp.value,
      size: Math.max(8, parseInt(sizeInp.value, 10) || 64),
      font: fo,
      color: colorInp.value,
      accent: accentInp.value,
      bg: bgInp.value,
      transparent,
      speed: parseFloat(speedInp.value) || 1
    }
  }
  const fontStr = o => `${o.font.weight} ${o.size}px ${o.font.stack}`
  const cycleMs = () => Math.round(BASE_MS / (parseFloat(speedInp.value) || 1))

  function getScratch() {
    if (!scratchC || scratchC.width !== canvas.width || scratchC.height !== canvas.height) {
      scratchC = document.createElement('canvas')
      scratchC.width = canvas.width
      scratchC.height = canvas.height
      scratchX = scratchC.getContext('2d')
    }
    return { c: scratchC, x: scratchX }
  }

  // ── Layout (cached: per-char x positions, per-word runs, autofit scale) ─────
  function getLayout(o, W, H) {
    const key = JSON.stringify([o.text, o.font.id, o.size, W, H])
    if (layoutCache && layoutKey === key) return layoutCache
    ctx.font = fontStr(o)
    const lineH = o.size * 1.3
    const lines = []
    let total = 0, maxW = 0
    for (const raw of o.text.split('\n')) {
      const chars = [], words = []
      let x = 0, wText = '', wStart = 0
      for (const ch of Array.from(raw)) {
        const w = ctx.measureText(ch).width
        if (ch === ' ') {
          if (wText) { words.push({ text: wText, x: wStart }); wText = '' }
        } else {
          if (!wText) wStart = x
          wText += ch
          chars.push({ ch, x, w })
        }
        x += w
      }
      if (wText) words.push({ text: wText, x: wStart })
      lines.push({ chars, words, width: x, y: 0, x0: 0 })
      total += chars.length
      maxW = Math.max(maxW, x)
    }
    const totalH = lines.length * lineH
    const y0 = H / 2 - totalH / 2 + lineH / 2
    lines.forEach((L, i) => {
      L.y = y0 + i * lineH
      L.x0 = (W - L.width) / 2
      L.chars.forEach(c => { c.x += L.x0 })
      L.words.forEach(w0 => { w0.x += L.x0 })
    })
    const scale = Math.max(0.05, Math.min(1, (W - 36) / Math.max(1, maxW), (H - 28) / Math.max(1, totalH)))
    layoutCache = { lines, total, lineH, scale }
    layoutKey = key
    return layoutCache
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function renderFrame(q) {
    lastQ = q
    const o = getOpts()
    const W = canvas.width / dpr, H = canvas.height / dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (!o.transparent) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H) }
    const lay = getLayout(o, W, H)
    if (!lay.total) return
    ctx.save()
    if (lay.scale < 1) {
      ctx.translate(W / 2, H / 2)
      ctx.scale(lay.scale, lay.scale)
      ctx.translate(-W / 2, -H / 2)
    }
    ctx.font = fontStr(o)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    PRESET_MAP[cur].draw({ ctx, W, H, o, lay, q, p: clamp01(q / ENTER_END), t: phaseMs, dpr, scratch: getScratch })
    ctx.restore()
  }

  // ── The one rAF loop ────────────────────────────────────────────────────────
  function frame(ts) {
    rafId = null
    if (dead) return
    if (!document.contains(body)) { teardown(); return }
    if (document.hidden) { lastTs = null; return }   // resumed by visibilitychange
    const dt = lastTs == null ? 16.7 : Math.min(100, ts - lastTs)
    lastTs = ts
    phaseMs += dt
    const D = cycleMs()
    let q, more
    if (recorder) { q = Math.min(1, phaseMs / D); more = true }
    else if (loop) { q = (phaseMs % D) / D; more = true }
    else if (phaseMs >= D) { q = 1; more = false }
    else { q = phaseMs / D; more = true }
    if (loop && !recorder && phaseMs > 1e7) phaseMs %= D
    renderFrame(q)
    if (recorder && recorder.state === 'recording' && phaseMs >= D) recorder.stop()
    if (more) rafId = requestAnimationFrame(frame)
  }

  function ensureRunning() {
    if (!dead && rafId == null) { lastTs = null; rafId = requestAnimationFrame(frame) }
  }

  function replay() {
    if (!recorder) { phaseMs = 0; lastTs = null }
    ensureRunning()
  }

  // restart a finished one-shot so control tweaks are always visible
  function poke() {
    if (!recorder && !loop && phaseMs >= cycleMs()) { phaseMs = 0; lastTs = null }
    ensureRunning()
  }

  function saveCfg() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        preset: cur, text: textInp.value, size: parseInt(sizeInp.value, 10) || 64,
        font: fontSel.value, fontPath: customFontPath, userPreset: curUser,
        color: colorInp.value, accent: accentInp.value,
        bg: bgInp.value, transparent, speed: parseFloat(speedInp.value) || 1, loop
      }))
    } catch {}
  }

  // ── Preset cards ────────────────────────────────────────────────────────────
  function updateCardSel() {
    const selId = curUser || cur
    presetsEl.querySelectorAll('.ta-card').forEach(c => c.classList.toggle('sel', !!c.dataset.id && c.dataset.id === selId))
  }

  PRESETS.forEach(p0 => {
    const card = document.createElement('button')
    card.className = 'ta-card' + (p0.id === cur && !curUser ? ' sel' : '')
    card.dataset.id = p0.id
    card.innerHTML = `<i class="fa-solid ${p0.icon}"></i><span></span>`
    card.querySelector('span').textContent = t(p0.key)
    card.addEventListener('click', () => {
      cur = p0.id
      curUser = null
      updateCardSel()
      replay()
      saveCfg()
    })
    presetsEl.appendChild(card)
  })

  // "save as preset" card — always the last card of the grid
  const addCard = document.createElement('button')
  addCard.className = 'ta-card add'
  addCard.innerHTML = `<i class="fa-solid fa-star"></i><span></span>`
  addCard.querySelector('span').textContent = t('pat_preset_save')
  addCard.title = t('pat_preset_save')
  presetsEl.appendChild(addCard)

  // ── User preset cards (style snapshots, rendered after the built-ins) ───────
  function applyUserPreset(up) {
    cur = PRESET_MAP[up.base] ? up.base : PRESETS[0].id
    if (Number.isFinite(up.size)) sizeInp.value = Math.max(10, Math.min(240, Math.round(up.size)))
    if (typeof up.color === 'string') colorInp.value = up.color
    if (typeof up.accent === 'string') accentInp.value = up.accent
    if (typeof up.bg === 'string') bgInp.value = up.bg
    transparent = !!up.transparent
    transpBtn.classList.toggle('on', transparent)
    previewEl.classList.toggle('checker', transparent)
    if (Number.isFinite(up.speed)) speedInp.value = Math.max(0.25, Math.min(3, up.speed))
    speedVal.textContent = (parseFloat(speedInp.value) || 1) + '×'
    loop = up.loop !== false
    loopBtn.className = 'ta-toggle ' + (loop ? 'on' : 'off')
    if (up.font === 'custom') {
      if (up.fontPath && (up.fontPath !== customFontPath || !customFont) && window.__TAURI__?.core?.invoke) {
        fontSel.value = 'custom'
        loadFontFromPath(up.fontPath, false)      // async re-layout once loaded
      } else if (customFont) {
        fontSel.value = 'custom'
      } else {
        fontSel.value = FONTS.some(fo => fo.id === prevFont) ? prevFont : 'sans'
      }
    } else if (FONTS.some(fo => fo.id === up.font)) {
      fontSel.value = up.font
      prevFont = up.font
    }
    curUser = up.id
    updateCardSel()
    replay()
    saveCfg()
  }

  function openUserMenu(anchor, up) {
    document.getElementById('ta-user-menu')?.remove()
    const menu = document.createElement('div')
    menu.id = 'ta-user-menu'
    menu.className = 'ta-menu'
    const onDoc = e => { if (!menu.contains(e.target)) closeMenu() }
    const onKey = e => { if (e.key === 'Escape') closeMenu() }
    function closeMenu() {
      menu.remove()
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey, true)
    }
    const mkItem = (icon, label, danger, fn) => {
      const b = document.createElement('button')
      b.className = 'ta-menu-item' + (danger ? ' danger' : '')
      b.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`
      b.querySelector('span').textContent = label
      b.addEventListener('click', () => { closeMenu(); fn() })
      menu.appendChild(b)
    }
    mkItem('fa-pen', t('lib_rename_title'), false, async () => {
      const name = (await promptName(up.name, { title: t('lib_rename_title') }) || '').trim()
      if (!name || name === up.name) return
      up.name = name
      if (saveUserPresets(userPresets)) buildUserCards()
    })
    mkItem('fa-trash', t('lib_delete_title'), true, () => {
      const i = userPresets.indexOf(up)
      if (i < 0) return
      userPresets.splice(i, 1)
      saveUserPresets(userPresets)
      if (curUser === up.id) { curUser = null; saveCfg() }  // fall back to the base preset
      buildUserCards()
      window.toast?.(`${t('ta_preset_deleted')} — ${up.name}`, 'info')
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

  let userCardEls = {}
  function buildUserCards() {
    Object.values(userCardEls).forEach(el => el.remove())
    userCardEls = {}
    for (const up of userPresets) {
      const base = PRESET_MAP[up.base] || PRESETS[0]
      const card = document.createElement('div')
      card.className = 'ta-card'
      card.tabIndex = 0
      card.dataset.id = up.id
      card.innerHTML = `<i class="fa-solid ${base.icon}"></i><span></span><i class="fa-solid fa-star ta-star"></i><button class="ta-more" type="button"><i class="fa-solid fa-ellipsis-vertical"></i></button>`
      card.querySelector('span').textContent = up.name
      card.title = up.name
      card.addEventListener('click', e => { if (!e.target.closest('.ta-more')) applyUserPreset(up) })
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyUserPreset(up) }
      })
      card.querySelector('.ta-more').addEventListener('click', e => {
        e.stopPropagation()
        openUserMenu(e.currentTarget, up)
      })
      userCardEls[up.id] = card
      presetsEl.insertBefore(card, addCard)
    }
    updateCardSel()
  }
  buildUserCards()

  addCard.addEventListener('click', async () => {
    const name = (await promptName(t(PRESET_MAP[cur].key), { title: t('pat_preset_save'), cancelable: true }) || '').trim()
    if (!name) return
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'preset'
    const up = {
      id: slug + '-' + Date.now(), name, base: cur,
      font: fontSel.value, fontPath: fontSel.value === 'custom' ? customFontPath : null,
      size: parseInt(sizeInp.value, 10) || 64,
      color: colorInp.value, accent: accentInp.value,
      bg: bgInp.value, transparent,
      speed: parseFloat(speedInp.value) || 1, loop
    }
    userPresets.push(up)
    if (!saveUserPresets(userPresets)) { userPresets.pop(); return }
    curUser = up.id
    buildUserCards()
    saveCfg()
    window.toast?.(t('ta_preset_saved'), 'success')
  })

  // ── Custom font (user asset) ────────────────────────────────────────────────
  async function applyFontBuffer(buf, filename, path) {
    const face = new FontFace('IceampleUser', buf)
    await face.load()
    if (dead) return
    // drop any previously registered user face so the new one always wins
    try { document.fonts.forEach(ff => { if ((ff.family || '').replace(/['"]/g, '') === 'IceampleUser') document.fonts.delete(ff) }) } catch {}
    document.fonts.add(face)
    customFace = face
    customFont = { name: filename, seq: ++fontSeq }   // seq feeds the layout key
    customFontPath = path || null
    customOpt.textContent = t('ta_font_custom_prefix') + ' ' + filename
    layoutKey = ''
  }

  async function loadFontFromPath(path, quiet) {
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
      const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer
      await applyFontBuffer(buf, path.replace(/^.*[\\/]/, ''), path)
      if (dead) return true
      poke()
      saveCfg()
      return true
    } catch {
      // quiet = boot restore: missing file falls back to the default stack, no toast
      if (!quiet) window.toast?.(t('ta_font_fail'), 'error')
      if (!customFont && fontSel.value === 'custom') {
        fontSel.value = FONTS.some(fo => fo.id === prevFont) ? prevFont : 'sans'
      }
      return false
    }
  }

  function pickCustomFont() {
    const invoke = window.__TAURI__?.core?.invoke
    if (invoke) {
      return (async () => {
        let path = null
        try {
          const r = await invoke('pick_files_with_filter', { filterName: 'Police', extensions: ['ttf', 'otf', 'woff2'] })
          path = Array.isArray(r) ? r[0] : null
        } catch {}
        if (!path) return false
        return loadFontFromPath(path, false)
      })()
    }
    // browser fallback: session-only, no path to persist
    return new Promise(resolve => {
      const inp = document.createElement('input')
      inp.type = 'file'
      inp.accept = '.ttf,.otf,.woff2'
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0]
        if (!f) { resolve(false); return }
        try {
          await applyFontBuffer(await f.arrayBuffer(), f.name, null)
          poke()
          resolve(true)
        } catch { window.toast?.(t('ta_font_fail'), 'error'); resolve(false) }
      })
      inp.addEventListener('cancel', () => resolve(false))
      inp.click()
    })
  }

  // ── Controls ────────────────────────────────────────────────────────────────
  ;[textInp, sizeInp, colorInp, accentInp, bgInp].forEach(el => {
    el.addEventListener('input', poke)
    el.addEventListener('change', saveCfg)
  })

  fontSel.addEventListener('change', async () => {
    if (fontSel.value !== 'custom') {
      prevFont = fontSel.value
      poke()
      saveCfg()
      return
    }
    // picking the entry (re)opens the picker; cancel keeps an already loaded font
    const ok = await pickCustomFont()
    if (!ok && !customFont) fontSel.value = FONTS.some(fo => fo.id === prevFont) ? prevFont : 'sans'
    poke()
    saveCfg()
  })
  speedInp.addEventListener('input', () => {
    speedVal.textContent = (parseFloat(speedInp.value) || 1) + '×'
    poke()
  })
  speedInp.addEventListener('change', saveCfg)

  loopBtn.addEventListener('click', () => {
    loop = !loop
    loopBtn.className = 'ta-toggle ' + (loop ? 'on' : 'off')
    if (loop) ensureRunning()
    saveCfg()
  })

  transpBtn.addEventListener('click', () => {
    transparent = !transparent
    transpBtn.classList.toggle('on', transparent)
    previewEl.classList.toggle('checker', transparent)
    poke()
    saveCfg()
  })

  replayBtn.addEventListener('click', replay)

  // ── Recording: exactly one loop as WebM ─────────────────────────────────────
  function recordLoop() {
    return new Promise(resolve => {
      if (recorder) { window.toast?.(t('ta_rec_busy'), 'info'); resolve(null); return }
      if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
        window.toast?.(t('ta_webm_unsupported'), 'error'); resolve(null); return
      }
      const stream = canvas.captureStream(60)
      const mimeType = MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
      let rec
      try { rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8e6 }) }
      catch { window.toast?.(t('ta_webm_unsupported'), 'error'); resolve(null); return }
      const chunks = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      // Stop the capture tracks on every exit — a live CanvasCaptureTrack keeps
      // copying frames off the canvas on each paint until GC.
      const release = () => { recorder = null; stream.getTracks().forEach(tr => tr.stop()) }
      rec.onstop = () => { release(); resolve(new Blob(chunks, { type: 'video/webm' })) }
      rec.onerror = () => { release(); window.toast?.(t('ta_export_fail'), 'error'); resolve(null) }
      recorder = rec
      window.toast?.(t('ta_recording'), 'info', Math.min(6000, cycleMs()))
      phaseMs = 0
      lastTs = null
      // start() can throw (dead stream/encoder) — without the reset the busy
      // guard and the frame loop's recorder branch would wedge until reopen.
      try { rec.start(100) }
      catch { recorder = null; stream.getTracks().forEach(tr => tr.stop()); window.toast?.(t('ta_export_fail'), 'error'); resolve(null); return }
      ensureRunning()          // the frame loop stops the recorder after one full cycle
    })
  }

  // ── Export buttons ──────────────────────────────────────────────────────────
  pngBtn.addEventListener('click', () => {
    canvas.toBlob(async blob => {
      if (!blob) { window.toast?.(t('ta_export_fail'), 'error'); return }
      try { if (await saveBlob(blob, 'textanim.png', 'png', 'PNG Image')) window.toast?.(t('ta_saved'), 'success') }
      catch { window.toast?.(t('ta_export_fail'), 'error') }
    }, 'image/png')
  })

  webmBtn.addEventListener('click', async () => {
    webmBtn.disabled = true
    try {
      const blob = await recordLoop()
      if (blob) {
        if (await saveBlob(blob, 'textanim.webm', 'webm', 'WebM Video')) window.toast?.(t('ta_saved'), 'success')
      }
    } catch { window.toast?.(t('ta_export_fail'), 'error') }
    webmBtn.disabled = false
  })

  // ── Media bus senders ───────────────────────────────────────────────────────
  // Video: record one loop lazily on pick, hand over a blob URL (never revoked
  // here — the receiver side owns playback and the bus contract forbids it).
  const sendVid = makeSendButton(async () => {
    const blob = await recordLoop()
    if (!blob) return null
    return { kind: 'video', blobUrl: URL.createObjectURL(blob), name: 'textanim.webm' }
  }, { self: 'textanim', targets: VIDEO_TARGETS, className: 'ta-btn' })
  sendVid.title = t('ta_send_video')
  sendVid.querySelector('span').textContent = t('ta_send_video')
  sendRow.appendChild(sendVid)

  // Image: current frame as dataUrl
  const sendImg = makeSendButton(() => imageMedia(canvas, 'textanim'), { self: 'textanim', targets: IMAGE_TARGETS, className: 'ta-btn' })
  sendImg.title = t('ta_send_image')
  sendImg.querySelector('span').textContent = t('ta_send_image')
  sendRow.appendChild(sendImg)

  // ── Resize / visibility / teardown ──────────────────────────────────────────
  function resizeCanvas() {
    const r = previewEl.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height))
    if (canvas.width === Math.round(w * dpr) && canvas.height === Math.round(h * dpr)) return
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    layoutKey = ''             // canvas size is part of the layout key
    renderFrame(lastQ)         // repaint at the current phase, no restart
  }

  const ro = new ResizeObserver(resizeCanvas)
  ro.observe(previewEl)

  const onVis = () => { if (!document.hidden) ensureRunning() }
  document.addEventListener('visibilitychange', onVis)

  function teardown() {
    if (dead) return
    dead = true
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = null
    try { if (recorder && recorder.state !== 'inactive') recorder.stop() } catch {}
    document.getElementById('ta-user-menu')?.remove()   // menu lives on document.body
    document.removeEventListener('visibilitychange', onVis)
    ro.disconnect()
    mo.disconnect()
  }

  const mo = new MutationObserver(() => { if (!document.contains(body)) teardown() })
  mo.observe(document.body, { childList: true, subtree: true })

  // silently re-load the persisted custom font (Tauri path); missing file →
  // quiet fallback to the default stack, cfg untouched so a returning file heals
  if (canRestoreFont) loadFontFromPath(customFontPath, true)

  resizeCanvas()
  ensureRunning()
}
