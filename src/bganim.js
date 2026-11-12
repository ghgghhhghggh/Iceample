// bganim.js — Fonds animés : seamless-loop background generator
// 9 canvas presets driven by a phase in [0,1) so frame(1) === frame(0).
// Export: PNG still, WebM of exactly one loop, media-bus send (video + image).
// Default palette derives from the live theme accent (--color-active), overridable.
import { t } from './i18n.js'
import { setBgConfig } from './bg-spectrum.js'
import { makeSendButton, imageMedia, VIDEO_TARGETS, IMAGE_TARGETS } from './media-bus.js'
import { promptName } from './rename-dialog.js'

const TAU = Math.PI * 2

function injectStyles() {
  if (document.getElementById('bga-styles')) return
  const s = document.createElement('style'); s.id = 'bga-styles'
  s.textContent = `
.bga-body{display:flex;height:100%;background:var(--surface);color:var(--text-primary);font-family:inherit;font-size:12px;overflow:hidden}
.bga-main{flex:1;display:flex;flex-direction:column;min-width:0}
.bga-preview{flex:1;position:relative;min-height:0;background:var(--bg);overflow:hidden}
.bga-canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.bga-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;border-top:1px solid var(--win-border-in);flex-shrink:0;flex-wrap:wrap}
.bga-loop{display:inline-flex;align-items:center;gap:5px;font-size:10px;color:var(--text-secondary);font-variant-numeric:tabular-nums;padding:3px 9px;border:1px solid var(--win-border-in);border-radius:20px;white-space:nowrap}
.bga-loop i{color:var(--color-active);font-size:9px}
.bga-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border:1px solid var(--win-border-in);border-radius:6px;background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));color:var(--text-secondary);font-size:11px;cursor:pointer;font-family:inherit;transition:all .1s;flex-shrink:0}
.bga-btn:hover{background:color-mix(in srgb,var(--text-primary) 13%,var(--surface));color:var(--text-primary)}
.bga-btn.active{background:color-mix(in srgb,var(--color-active) 18%,transparent);border-color:var(--color-active);color:var(--color-active)}
.bga-btn:disabled{opacity:.4;pointer-events:none}
.bga-side{width:232px;flex-shrink:0;border-left:1px solid var(--win-border-in);overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding:12px;background:var(--surface2)}
.bga-sec{display:flex;flex-direction:column;gap:7px}
.bga-sec-title{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-secondary)}
.bga-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.bga-card{border:1px solid var(--win-border-in);border-radius:8px;overflow:hidden;cursor:pointer;background:var(--surface);padding:0;display:flex;flex-direction:column;font-family:inherit;transition:border-color .12s,transform .12s}
.bga-card:hover{border-color:var(--win-border);transform:translateY(-1px)}
.bga-card.sel{border-color:var(--color-active);box-shadow:0 0 0 1px var(--color-active)}
.bga-card-thumb{height:38px;width:100%}
.bga-card-name{font-size:8.5px;color:var(--text-secondary);padding:3px 3px 4px;text-align:center;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bga-card.sel .bga-card-name{color:var(--color-active)}
.bga-row{display:flex;align-items:center;gap:8px}
.bga-row label{width:58px;flex-shrink:0;font-size:10px;color:var(--text-secondary)}
.bga-slider{flex:1;min-width:0;height:3px;background:var(--win-border-in);border-radius:2px;outline:none;cursor:pointer;-webkit-appearance:none}
.bga-slider::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:var(--color-active);cursor:pointer;border:2px solid var(--surface)}
.bga-sval{width:22px;font-size:11px;color:var(--color-active);text-align:right;font-variant-numeric:tabular-nums;flex-shrink:0}
.bga-colors{display:flex;gap:6px;align-items:center}
.bga-color{flex:1;height:28px;padding:0;border:1px solid var(--win-border-in);border-radius:6px;cursor:pointer;background:none;min-width:0}
.bga-icon-btn{width:30px;height:28px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--win-border-in);border-radius:6px;background:none;color:var(--text-secondary);cursor:pointer;font-size:11px;transition:all .1s}
.bga-icon-btn:hover{border-color:var(--color-active);color:var(--color-active)}
.bga-select{width:100%;padding:5px 8px;background:var(--surface);border:1px solid var(--win-border-in);border-radius:6px;color:var(--text-primary);font-size:11px;font-family:inherit;outline:none;cursor:pointer}
.bga-select:focus{border-color:var(--color-active)}
.bga-sec-head{display:flex;align-items:center;justify-content:space-between;gap:6px}
.bga-star-btn{width:24px;height:20px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--win-border-in);border-radius:5px;background:none;color:var(--text-secondary);cursor:pointer;font-size:9px;transition:all .1s}
.bga-star-btn:hover{border-color:var(--color-active);color:var(--color-active)}
.bga-card{position:relative}
.bga-card-badge{position:absolute;top:3px;left:3px;font-size:7px;color:var(--color-active);pointer-events:none;text-shadow:0 0 3px rgba(0,0,0,.55)}
.bga-card-menu-btn{position:absolute;top:2px;right:2px;width:15px;height:15px;padding:0;border:none;border-radius:4px;background:color-mix(in srgb,var(--surface) 78%,transparent);color:var(--text-primary);font-size:8px;cursor:pointer;display:none;align-items:center;justify-content:center}
.bga-card:hover .bga-card-menu-btn,.bga-card:focus-within .bga-card-menu-btn{display:inline-flex}
.bga-menu{position:fixed;z-index:10000;min-width:118px;background:var(--surface);border:1px solid var(--win-border-in);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.4);padding:4px;display:flex;flex-direction:column;gap:1px}
.bga-menu-item{display:flex;align-items:center;gap:7px;padding:6px 9px;border:none;background:none;color:var(--text-secondary);font-size:11px;font-family:inherit;border-radius:5px;cursor:pointer;text-align:left}
.bga-menu-item i{font-size:9px;width:11px;text-align:center}
.bga-menu-item:hover{background:color-mix(in srgb,var(--text-primary) 10%,transparent);color:var(--text-primary)}
.bga-menu-item.danger:hover{color:var(--vu-color-high)}
.bga-icon-btn:disabled,.bga-slider:disabled{opacity:.4;pointer-events:none}
`
  document.head.appendChild(s)
}

// ── Deterministic pseudo-random helper ───────────────────────────────────────
function fhash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  n ^= (n >>> 16)
  return (n >>> 0) / 0xFFFFFFFF
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  hex = String(hex).trim()
  if (hex[0] === '#') hex = hex.slice(1)
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  const n = parseInt(hex.slice(0, 6), 16)
  if (Number.isNaN(n)) return [128, 128, 128]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHex(c) {
  return '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}
function mixRgb(a, b, k) { return [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * k) }
function scaleRgb(c, k) { return c.map(v => Math.max(0, Math.min(255, v * k))) }
function rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})` }
function rgbs(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` }

function parseCssColor(str) {
  str = String(str || '').trim()
  if (str[0] === '#') return hexToRgb(str)
  const m = str.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(/[\s,/]+/).map(Number)
    if (p.length >= 3 && p.every(v => !Number.isNaN(v))) return [p[0], p[1], p[2]]
  }
  return null
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  let h
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0))
  else if (mx === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255])
}

// Palette derived from the live theme accent — deep base + accent + shifted companion
function themeDefaults() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-active')
  const acc = parseCssColor(raw) || [178, 63, 214]
  const [h, s] = rgbToHsl(acc)
  return [
    hslToHex(h, Math.min(0.75, Math.max(0.35, s)), 0.09),
    hslToHex(h, Math.max(0.55, s), 0.58),
    hslToHex(h + 70, Math.max(0.5, s * 0.9), 0.55),
  ]
}

// ── Resolutions (canvas internal size; preview scales to fit) ─────────────────
const RES_LIST = [
  { w: 1920, h: 1080, tag: '16:9' },
  { w: 1280, h: 720,  tag: '16:9' },
  { w: 1080, h: 1080, tag: '1:1'  },
  { w: 1080, h: 1920, tag: '9:16', key: 'bga_res_story' },
]

// ── Presets — cycle = base loop length in ms, theme = bg-spectrum style id ────
// thumb(a,b,c) builds a small CSS-gradient preview from the current hex colors
const PRESETS = [
  { id: 'mesh',   labelKey: 'bga_preset_mesh',   cycle: 10000, theme: 'bg-gradient',
    thumb: (a, b, c) => `radial-gradient(circle at 30% 35%, ${b}, transparent 65%), radial-gradient(circle at 72% 70%, ${c}, transparent 60%), ${a}` },
  { id: 'aurora', labelKey: 'bg_spec_aurora',    cycle: 12000, theme: 'aurora',
    thumb: (a, b, c) => `linear-gradient(115deg, transparent 18%, ${b} 45%, ${c} 62%, transparent 86%), ${a}` },
  { id: 'lava',   labelKey: 'bga_preset_lava',   cycle: 14000, theme: 'bg-plasma',
    thumb: (a, b, c) => `radial-gradient(circle at 32% 68%, ${b} 0 20%, transparent 40%), radial-gradient(circle at 66% 28%, ${c} 0 16%, transparent 36%), ${a}` },
  { id: 'waves',  labelKey: 'bga_preset_waves',  cycle: 8000,  theme: 'waves',
    thumb: (a, b, c) => `linear-gradient(180deg, ${a} 38%, ${b} 42% 58%, ${c} 62% 78%, ${a} 82%)` },
  { id: 'grain',  labelKey: 'bga_preset_grain',  cycle: 6000,  theme: 'dither',
    thumb: (a, b, c) => `linear-gradient(160deg, ${a}, ${b} 70%, ${c})` },
  { id: 'stars',  labelKey: 'bga_preset_stars',  cycle: 16000, theme: 'stars',
    thumb: (a, b, c) => `radial-gradient(circle at 25% 30%, #fff 1px, transparent 2px), radial-gradient(circle at 62% 62%, #fff 1px, transparent 2px), radial-gradient(circle at 82% 22%, ${c} 1px, transparent 2px), radial-gradient(circle at 45% 80%, #fff 1px, transparent 2px), ${a}` },
  { id: 'conic',  labelKey: 'bga_preset_conic',  cycle: 8000,  theme: 'plasma',
    thumb: (a, b, c) => `conic-gradient(from 210deg, ${b}, ${c}, ${a}, ${b})` },
  { id: 'rain',   labelKey: 'bga_preset_rain',   cycle: 6000,  theme: 'particles',
    thumb: (a, b, c) => `repeating-linear-gradient(90deg, transparent 0 5px, ${b} 5px 6px, transparent 6px 11px, ${c} 11px 12px), ${a}` },
  { id: 'topo',   labelKey: 'bga_preset_topo',   cycle: 12000, theme: 'grid',
    thumb: (a, b, c) => `repeating-radial-gradient(circle at 65% 35%, transparent 0 4px, ${b} 4px 5px, transparent 5px 9px, ${c} 9px 10px), ${a}` },
]

const LS_KEY = 'iceample:bganim:state'

export function initBgAnim(body) {
  injectStyles()

  body.innerHTML = `
<div class="bga-body">
  <div class="bga-main">
    <div class="bga-preview" id="bga-preview">
      <canvas id="bga-canvas" class="bga-canvas"></canvas>
    </div>
    <div class="bga-bar" id="bga-bar">
      <button class="bga-btn active" id="bga-play"><i class="fa-solid fa-pause"></i> <span></span></button>
      <span class="bga-loop" id="bga-loop" title="${t('bga_loop')}"><i class="fa-solid fa-rotate"></i><span id="bga-loop-val"></span></span>
      <div style="flex:1"></div>
      <button class="bga-btn" id="bga-theme-btn" title="${t('bga_theme_bg')}"><i class="fa-solid fa-swatchbook"></i> <span>${t('bga_theme_bg')}</span></button>
      <button class="bga-btn" id="bga-png-btn" title="${t('bga_export_png')}"><i class="fa-solid fa-image"></i> PNG</button>
      <button class="bga-btn" id="bga-webm-btn" title="${t('bga_export_webm')}"><i class="fa-solid fa-film"></i> WebM</button>
    </div>
  </div>
  <div class="bga-side">
    <div class="bga-sec">
      <div class="bga-sec-head">
        <div class="bga-sec-title">${t('bga_presets')}</div>
        <button class="bga-star-btn" id="bga-preset-save" title="${t('pat_preset_save')}"><i class="fa-solid fa-star"></i></button>
      </div>
      <div class="bga-cards" id="bga-cards"></div>
    </div>
    <div class="bga-sec">
      <div class="bga-sec-title">${t('pat_settings')}</div>
      <div class="bga-row">
        <label>${t('bg_spec_speed')}</label>
        <input class="bga-slider" id="bga-speed" type="range" min="1" max="10" step="1" value="4">
        <span class="bga-sval" id="bga-speed-val">4</span>
      </div>
      <div class="bga-row">
        <label>${t('bg_spec_intensity')}</label>
        <input class="bga-slider" id="bga-inten" type="range" min="1" max="10" step="1" value="5">
        <span class="bga-sval" id="bga-inten-val">5</span>
      </div>
      <div class="bga-row">
        <label>${t('bga_scale')}</label>
        <input class="bga-slider" id="bga-scale" type="range" min="1" max="10" step="1" value="5">
        <span class="bga-sval" id="bga-scale-val">5</span>
      </div>
    </div>
    <div class="bga-sec">
      <div class="bga-sec-title">${t('pat_colors')}</div>
      <div class="bga-colors">
        <input class="bga-color" id="bga-c1" type="color" title="${t('bga_color_bg')}">
        <input class="bga-color" id="bga-c2" type="color" title="${t('bga_color_a1')}">
        <input class="bga-color" id="bga-c3" type="color" title="${t('bga_color_a2')}">
        <button class="bga-icon-btn" id="bga-theme-colors" title="${t('bga_theme_colors')}"><i class="fa-solid fa-arrows-rotate"></i></button>
      </div>
    </div>
    <div class="bga-sec">
      <div class="bga-sec-title">${t('bga_resolution')}</div>
      <select class="bga-select" id="bga-res"></select>
    </div>
    <div class="bga-sec">
      <div class="bga-sec-title">${t('th_bg_image')}</div>
      <div class="bga-row">
        <button class="bga-btn" id="bga-img-pick" title="${t('th_bg_img_pick')}"><i class="fa-regular fa-image"></i> <span>${t('td_image')}…</span></button>
        <input class="bga-slider" id="bga-img-op" type="range" min="10" max="100" step="5" title="${t('pat_opacity')}">
        <button class="bga-icon-btn" id="bga-img-fit"><i class="fa-solid fa-expand"></i></button>
        <button class="bga-icon-btn" id="bga-img-clear" title="${t('th_bg_img_clear')}"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
  </div>
</div>`

  const canvas    = body.querySelector('#bga-canvas')
  const viewCtx   = canvas.getContext('2d')
  // Renderers draw into `ctx`; paint() retargets it to an offscreen layer when
  // a user image sits under the animation, then composites onto the canvas.
  let ctx         = viewCtx
  const preview   = body.querySelector('#bga-preview')
  const cardsEl   = body.querySelector('#bga-cards')
  const playBtn   = body.querySelector('#bga-play')
  const loopVal   = body.querySelector('#bga-loop-val')
  const themeBtn  = body.querySelector('#bga-theme-btn')
  const pngBtn    = body.querySelector('#bga-png-btn')
  const webmBtn   = body.querySelector('#bga-webm-btn')
  const barEl     = body.querySelector('#bga-bar')
  const speedSl   = body.querySelector('#bga-speed')
  const speedVal  = body.querySelector('#bga-speed-val')
  const intenSl   = body.querySelector('#bga-inten')
  const intenVal  = body.querySelector('#bga-inten-val')
  const scaleSl   = body.querySelector('#bga-scale')
  const scaleVal  = body.querySelector('#bga-scale-val')
  const c1Inp     = body.querySelector('#bga-c1')
  const c2Inp     = body.querySelector('#bga-c2')
  const c3Inp     = body.querySelector('#bga-c3')
  const themeCols = body.querySelector('#bga-theme-colors')
  const resSel    = body.querySelector('#bga-res')
  const presetSaveBtn = body.querySelector('#bga-preset-save')
  const imgPickBtn  = body.querySelector('#bga-img-pick')
  const imgOpSl     = body.querySelector('#bga-img-op')
  const imgFitBtn   = body.querySelector('#bga-img-fit')
  const imgClearBtn = body.querySelector('#bga-img-clear')

  // ── State ─────────────────────────────────────────────────────────────────
  let curPreset = 'mesh'
  let resIdx = 0
  let customColors = false
  let playing = true, shown = true, rafId = null, lastTs = 0, phase = 0
  let C1 = [0, 0, 0], C2 = [0, 0, 0], C3 = [0, 0, 0]  // parsed rgb caches
  let recBusy = false, recAcc = null, curRecorder = null
  let curUserId = null                                  // selected user preset id (session only)
  // Image underlay: the Image object stays in memory, only the path persists
  let bgImg = null, bgImgPath = null, imgFit = 'cover', animOp = 70
  let animLayer = null, animLayerCtx = null

  // Restore persisted state
  let st = null
  try { st = JSON.parse(localStorage.getItem(LS_KEY) || 'null') } catch {}
  if (st) {
    if (PRESETS.some(p => p.id === st.preset)) curPreset = st.preset
    if (Number.isInteger(st.res) && st.res >= 0 && st.res < RES_LIST.length) resIdx = st.res
    for (const [sl, v] of [[speedSl, st.speed], [intenSl, st.inten], [scaleSl, st.scale]]) {
      if (Number.isFinite(v)) sl.value = Math.max(1, Math.min(10, Math.round(v)))
    }
    if (st.img) {
      if (st.img.fit === 'contain') imgFit = 'contain'
      if (Number.isFinite(st.img.op)) animOp = Math.max(10, Math.min(100, Math.round(st.img.op)))
      if (typeof st.img.path === 'string' && st.img.path) bgImgPath = st.img.path
    }
  }

  const defaults = themeDefaults()
  if (st?.colors && Array.isArray(st.colors) && st.colors.length === 3) {
    customColors = true
    ;[c1Inp.value, c2Inp.value, c3Inp.value] = st.colors
  } else {
    ;[c1Inp.value, c2Inp.value, c3Inp.value] = defaults
  }

  function refreshColorCache() {
    C1 = hexToRgb(c1Inp.value)
    C2 = hexToRgb(c2Inp.value)
    C3 = hexToRgb(c3Inp.value)
  }
  refreshColorCache()

  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        preset: curPreset, res: resIdx,
        speed: +speedSl.value, inten: +intenSl.value, scale: +scaleSl.value,
        colors: customColors ? [c1Inp.value, c2Inp.value, c3Inp.value] : null,
        img: { path: bgImgPath, fit: imgFit, op: animOp },
      }))
    } catch {}
  }

  function presetMeta() { return PRESETS.find(p => p.id === curPreset) || PRESETS[0] }
  function cycleMs() { return presetMeta().cycle / (+speedSl.value / 4) }
  function params() {
    return { inten: +intenSl.value / 10, scale: +scaleSl.value / 10, c1: C1, c2: C2, c3: C3 }
  }

  // ── Renderers — every time-dependent term is sin/cos(TAU·(k·phase + o))
  //    with INTEGER k, so frame(phase=1) === frame(phase=0) (seamless loop) ──
  const W = () => canvas.width
  const H = () => canvas.height

  function drawMesh(ph, P) {
    const w = W(), h = H()
    ctx.fillStyle = rgbs(scaleRgb(P.c1, 0.35))
    ctx.fillRect(0, 0, w, h)
    const GX = 4, GY = 3
    const amp = 0.08 + P.inten * 0.14
    const R = Math.min(w, h) * (0.42 + P.scale * 0.45)
    ctx.globalCompositeOperation = 'screen'
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const n = j * GX + i
      const kx = 1 + (fhash(n * 7 + 1) > 0.5 ? 1 : 0)
      const ky = 1 + (fhash(n * 11 + 3) > 0.5 ? 1 : 0)
      const x = w * (i / (GX - 1) + Math.sin(TAU * (ph * kx + fhash(n * 5 + 9))) * amp)
      const y = h * (j / (GY - 1) + Math.cos(TAU * (ph * ky + fhash(n * 3 + 4))) * amp)
      const c = [P.c2, P.c3, mixRgb(P.c2, P.c3, 0.5), mixRgb(P.c1, P.c2, 0.4)][n % 4]
      const g = ctx.createRadialGradient(x, y, 0, x, y, R)
      g.addColorStop(0, rgba(c, 0.55))
      g.addColorStop(1, rgba(c, 0))
      ctx.fillStyle = g
      const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R)
      const rw = Math.min(w, x + R) - x0, rh = Math.min(h, y + R) - y0
      if (rw > 0 && rh > 0) ctx.fillRect(x0, y0, rw, rh)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  let auroraOff = null
  function drawAurora(ph, P) {
    const w = W(), h = H()
    const ow = Math.max(2, w >> 2), oh = Math.max(2, h >> 2)
    if (!auroraOff || auroraOff.width !== ow || auroraOff.height !== oh) auroraOff = new OffscreenCanvas(ow, oh)
    const oc = auroraOff.getContext('2d')
    oc.filter = 'none'
    oc.globalCompositeOperation = 'source-over'
    const bg = oc.createLinearGradient(0, 0, 0, oh)
    bg.addColorStop(0, rgbs(scaleRgb(P.c1, 0.30)))
    bg.addColorStop(1, rgbs(scaleRgb(P.c1, 0.06)))
    oc.fillStyle = bg
    oc.fillRect(0, 0, ow, oh)
    oc.globalCompositeOperation = 'screen'
    oc.filter = `blur(${Math.round(4 + P.scale * 8)}px)`
    const cols = [P.c2, P.c3, mixRgb(P.c2, P.c3, 0.5)]
    for (let r = 0; r < 3; r++) {
      const m1 = 1 + (r % 2), m2 = 2 - (r % 2), dir = r % 2 ? -1 : 1
      const topBase = oh * (0.16 + r * 0.15)
      const band = oh * (0.24 + P.scale * 0.26)
      const amp = oh * 0.09 * (0.5 + P.inten)
      const N = 26
      oc.beginPath()
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * 1.1 - 0.05
        const y = topBase + amp * (Math.sin(TAU * (x * 1.2 + dir * ph * m1 + fhash(r * 9 + 1)))
                                 + 0.5 * Math.sin(TAU * (x * 2.3 - dir * ph * m2 + fhash(r * 5 + 3))))
        i === 0 ? oc.moveTo(x * ow, y) : oc.lineTo(x * ow, y)
      }
      for (let i = N; i >= 0; i--) {
        const x = (i / N) * 1.1 - 0.05
        const y = topBase + band + amp * 0.6 * Math.sin(TAU * (x * 1.2 + dir * ph * m1 + fhash(r * 9 + 1)))
        oc.lineTo(x * ow, y)
      }
      oc.closePath()
      const g = oc.createLinearGradient(0, topBase - amp, 0, topBase + band)
      g.addColorStop(0, rgba(cols[r], 0.75 * P.inten + 0.15))
      g.addColorStop(1, rgba(cols[r], 0))
      oc.fillStyle = g
      oc.fill()
    }
    oc.filter = 'none'
    oc.globalCompositeOperation = 'source-over'
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(auroraOff, 0, 0, w, h)
    // faint twinkling stars on top
    for (let i = 0; i < 50; i++) {
      const tw = 2 + Math.floor(fhash(i * 3 + 8) * 3)
      ctx.globalAlpha = 0.35 * Math.max(0, Math.sin(TAU * (ph * tw + fhash(i * 5 + 2)))) ** 2
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(fhash(i * 7 + 1) * w, fhash(i * 13 + 5) * h * 0.7, 1.5, 1.5)
    }
    ctx.globalAlpha = 1
  }

  let lavaOff = null, lavaImg = null
  function drawLava(ph, P) {
    const w = W(), h = H()
    const ow = Math.max(2, Math.ceil(w / 8)), oh = Math.max(2, Math.ceil(h / 8))
    if (!lavaOff || lavaOff.width !== ow || lavaOff.height !== oh) {
      lavaOff = new OffscreenCanvas(ow, oh)
      lavaImg = lavaOff.getContext('2d').createImageData(ow, oh)
    }
    const NB = 4 + Math.round(P.inten * 4)
    const asp = w / h
    const blobs = []
    for (let b = 0; b < NB; b++) {
      const kx = 1 + (b % 2), ky = 1 + ((b + 1) % 2)
      blobs.push({
        cx: 0.5 + 0.34 * Math.sin(TAU * (ph * kx + fhash(b * 13 + 2))),
        cy: 0.5 + 0.36 * Math.cos(TAU * (ph * ky + fhash(b * 17 + 5))),
        r2: ((0.10 + fhash(b * 7 + 11) * 0.10) * (0.7 + P.scale * 0.8)) ** 2,
      })
    }
    const bgc = scaleRgb(P.c1, 0.25)
    const d = lavaImg.data
    for (let y = 0; y < oh; y++) {
      const ny = y / oh
      for (let x = 0; x < ow; x++) {
        const nx = x / ow
        let f = 0
        for (let b = 0; b < NB; b++) {
          const dx = (nx - blobs[b].cx) * asp, dy = ny - blobs[b].cy
          f += blobs[b].r2 / (dx * dx + dy * dy + 1e-4)
        }
        let r, g, bl
        if (f < 1) {
          const glow = f * f * 0.28
          r = bgc[0] + P.c2[0] * glow; g = bgc[1] + P.c2[1] * glow; bl = bgc[2] + P.c2[2] * glow
        } else {
          const k = Math.min(1, (f - 1) / 1.6)
          r = P.c2[0] + (P.c3[0] - P.c2[0]) * k
          g = P.c2[1] + (P.c3[1] - P.c2[1]) * k
          bl = P.c2[2] + (P.c3[2] - P.c2[2]) * k
          if (f > 3.2) { const wht = Math.min(0.55, (f - 3.2) * 0.2); r += (255 - r) * wht; g += (255 - g) * wht; bl += (255 - bl) * wht }
        }
        const ii = (y * ow + x) * 4
        d[ii] = r; d[ii + 1] = g; d[ii + 2] = bl; d[ii + 3] = 255
      }
    }
    lavaOff.getContext('2d').putImageData(lavaImg, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(lavaOff, 0, 0, w, h)
  }

  function drawWaves(ph, P) {
    const w = W(), h = H()
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, rgbs(scaleRgb(P.c1, 0.55)))
    bg.addColorStop(1, rgbs(scaleRgb(P.c1, 0.15)))
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    const L = 4
    for (let l = L - 1; l >= 0; l--) {
      const col = mixRgb(l % 2 ? P.c3 : P.c2, P.c1, l / (L + 1))
      const base = h * (0.42 + ((L - 1 - l) / (L - 1)) * 0.38)
      const amp = h * (0.035 + 0.09 * P.inten) * (0.6 + l * 0.22)
      const dir = l % 2 ? 1 : -1
      const m1 = 1 + (l % 2)
      const sf = (1.1 + l * 0.5) * (0.5 + P.scale)
      const o1 = fhash(l * 11 + 2), o2 = fhash(l * 7 + 6)
      ctx.beginPath()
      ctx.moveTo(0, h)
      const N = 96
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * w
        const u = i / N
        const y = base + amp * (0.62 * Math.sin(TAU * (u * sf + dir * ph * m1 + o1))
                              + 0.38 * Math.sin(TAU * (u * sf * 1.7 - dir * ph * (m1 + 1) + o2)))
        ctx.lineTo(x, y)
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fillStyle = rgba(col, 0.85)
      ctx.fill()
    }
  }

  let grainTiles = null, grainKey = ''
  function drawGrain(ph, P) {
    const w = W(), h = H()
    const gsz = 1 + Math.round(P.scale * 3)
    const key = w + 'x' + h + ':' + gsz
    if (key !== grainKey) {
      grainKey = key
      grainTiles = []
      const tw = Math.max(2, Math.ceil(w / gsz)), th = Math.max(2, Math.ceil(h / gsz))
      for (let n = 0; n < 4; n++) {
        const tile = new OffscreenCanvas(tw, th)
        const tc = tile.getContext('2d')
        const img = tc.createImageData(tw, th)
        const td = img.data
        for (let i = 0; i < td.length; i += 4) {
          const v = (Math.random() * 255) | 0
          td[i] = v; td[i + 1] = v; td[i + 2] = v; td[i + 3] = 255
        }
        tc.putImageData(img, 0, 0)
        grainTiles.push(tile)
      }
    }
    // slowly tilting gradient background (seamless: sin(TAU·phase))
    const tilt = Math.sin(TAU * ph) * 0.30
    const cx = w / 2, cy = h / 2
    const R = Math.max(w, h) * 0.75
    const dx = Math.cos(Math.PI / 3 + tilt) * R, dy = Math.sin(Math.PI / 3 + tilt) * R
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
    g.addColorStop(0, rgbs(scaleRgb(P.c1, 0.6)))
    g.addColorStop(0.55, rgbs(mixRgb(P.c1, P.c2, 0.5)))
    g.addColorStop(1, rgbs(mixRgb(P.c1, P.c3, 0.45)))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // breathing highlight
    const breathe = 0.5 + 0.5 * Math.sin(TAU * ph * 2)
    const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
    hg.addColorStop(0, rgba(P.c2, 0.10 + 0.10 * breathe))
    hg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = hg
    ctx.fillRect(0, 0, w, h)
    // animated grain: 24 flickers per cycle over 4 pre-built tiles (24 % 4 === 0 → seamless)
    const tile = grainTiles[Math.floor(ph * 24) % 4]
    ctx.globalAlpha = 0.10 + P.inten * 0.25
    ctx.globalCompositeOperation = 'overlay'
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tile, 0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  function drawStars(ph, P) {
    const w = W(), h = H()
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
    bg.addColorStop(0, rgbs(scaleRgb(P.c1, 0.5)))
    bg.addColorStop(1, rgbs(scaleRgb(P.c1, 0.12)))
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    // two soft nebula glows drifting gently
    ctx.globalCompositeOperation = 'screen'
    ;[[P.c2, 0.30, 0.40, 1], [P.c3, 0.68, 0.62, 2]].forEach(([c, bx, by, m], i) => {
      const x = w * (bx + 0.05 * Math.sin(TAU * (ph * m + fhash(i * 5 + 1))))
      const y = h * (by + 0.05 * Math.cos(TAU * (ph * m + fhash(i * 7 + 3))))
      const R = Math.min(w, h) * 0.5
      const g = ctx.createRadialGradient(x, y, 0, x, y, R)
      g.addColorStop(0, rgba(c, 0.05 + 0.09 * P.inten))
      g.addColorStop(1, rgba(c, 0))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    })
    ctx.globalCompositeOperation = 'source-over'
    // parallax star layers — horizontal wrap counts are integers → seamless
    const px = Math.min(w, h) / 900
    const layers = [
      { n: 110, sp: 1,  sz: 0.7, base: 1000 },
      { n: 70,  sp: -1, sz: 1.2, base: 2000 },
      { n: 36,  sp: 2,  sz: 1.9, base: 3000 },
    ]
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const b = L.base + i
        const x = ((fhash(b * 7 + 1) + ph * L.sp) % 1 + 1) % 1 * w
        const y = fhash(b * 13 + 5) * h
        const tw = 2 + Math.floor(fhash(b * 3 + 8) * 4)
        const a = (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(TAU * (ph * tw + fhash(b * 5 + 2)))) ** 2) * (0.4 + 0.6 * P.inten)
        const r = (0.5 + fhash(b * 11 + 4) * 1.6) * L.sz * (0.6 + P.scale) * px
        const cs = fhash(b * 17 + 9)
        ctx.globalAlpha = a
        ctx.fillStyle = cs > 0.85 ? rgbs(mixRgb(P.c2, [255, 255, 255], 0.6)) : cs > 0.7 ? rgbs(mixRgb(P.c3, [255, 255, 255], 0.6)) : '#ffffff'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, TAU)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  function drawConic(ph, P) {
    if (!ctx.createConicGradient) return drawMesh(ph, P)
    const w = W(), h = H()
    const cx = w * 0.5, cy = h * (0.35 + P.scale * 0.3)
    // one full rotation per cycle → inherently seamless
    const g = ctx.createConicGradient(TAU * ph, cx, cy)
    g.addColorStop(0, rgbs(P.c2))
    g.addColorStop(0.3, rgbs(P.c3))
    g.addColorStop(0.62, rgbs(mixRgb(P.c1, P.c3, 0.35)))
    g.addColorStop(1, rgbs(P.c2))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // vignette (inversely tied to intensity) + soft core glow
    const R = Math.max(w, h) * 0.85
    const vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, rgba(scaleRgb(P.c1, 0.2), 0.75 - P.inten * 0.5))
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, w, h)
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.22)
    cg.addColorStop(0, rgba(mixRgb(P.c2, [255, 255, 255], 0.65), 0.35))
    cg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = cg
    ctx.fillRect(0, 0, w, h)
  }

  let rainSprites = null, rainKey = ''
  function drawRain(ph, P) {
    const w = W(), h = H()
    const key = c2Inp.value + c3Inp.value
    if (!rainSprites || rainKey !== key) {
      rainKey = key
      rainSprites = [P.c2, P.c3].map(c => {
        const sp = new OffscreenCanvas(16, 96)
        const sc = sp.getContext('2d')
        sc.filter = 'blur(2px)'
        const g = sc.createLinearGradient(0, 0, 0, 96)
        g.addColorStop(0, rgba(c, 0))
        g.addColorStop(0.75, rgba(c, 0.9))
        g.addColorStop(0.92, rgba(mixRgb(c, [255, 255, 255], 0.7), 1))
        g.addColorStop(1, rgba(mixRgb(c, [255, 255, 255], 0.85), 1))
        sc.fillStyle = g
        sc.fillRect(5, 0, 6, 96)
        return sp
      })
    }
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, rgbs(scaleRgb(P.c1, 0.30)))
    bg.addColorStop(1, rgbs(scaleRgb(P.c1, 0.10)))
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    const N = 50 + Math.round(P.inten * 70)
    for (let i = 0; i < N; i++) {
      const k = 1 + (i % 3)  // integer wraps per cycle → seamless
      const len = h * (0.10 + fhash(i * 11 + 1) * 0.15) * (0.5 + P.scale)
      const span = h + 2 * len
      const yn = (fhash(i * 5 + 9) + ph * k) % 1
      const head = yn * span - len
      const sw = (2 + fhash(i * 13 + 4) * 2.5) * (0.6 + P.scale) * (w / 1280)
      ctx.globalAlpha = 0.35 + 0.6 * fhash(i * 17 + 6)
      ctx.drawImage(rainSprites[i % 3 === 0 ? 1 : 0], fhash(i * 7 + 3) * w - sw / 2, head - len, sw, len)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  // marching-squares segment table: idx bit8=TL bit4=TR bit2=BR bit1=BL,
  // edges 0=top 1=right 2=bottom 3=left
  const TOPO_SEG = [
    [], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[0, 1], [3, 2]], [[0, 2]], [[0, 3]],
    [[0, 3]], [[0, 2]], [[0, 1], [3, 2]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], [],
  ]
  let topoF = null, topoCols = 0, topoRows = 0
  function drawTopo(ph, P) {
    const w = W(), h = H()
    const cell = Math.max(6, Math.round(Math.min(w, h) * 0.02))
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell)
    if (!topoF || topoCols !== cols || topoRows !== rows) {
      topoCols = cols; topoRows = rows
      topoF = new Float32Array((cols + 1) * (rows + 1))
    }
    const sf = 1.0 + P.scale * 1.6
    const asp = w / h
    for (let gy = 0; gy <= rows; gy++) {
      const v = gy / rows * sf
      for (let gx = 0; gx <= cols; gx++) {
        const u = gx / cols * sf * asp
        topoF[gy * (cols + 1) + gx] =
          Math.sin(TAU * (u * 0.9 + ph)) * 0.5 +
          Math.sin(TAU * (v * 1.1 - ph) + 1.7) * 0.4 +
          Math.sin(TAU * (u * 0.5 + v * 0.7 + 2 * ph) + 4.1) * 0.35
      }
    }
    ctx.fillStyle = rgbs(scaleRgb(P.c1, 0.30))
    ctx.fillRect(0, 0, w, h)
    ctx.lineWidth = Math.max(1, Math.min(w, h) / 700)
    ctx.lineCap = 'round'
    const cw = w / cols, chh = h / rows
    const NL = 8
    for (let li = 0; li < NL; li++) {
      const lv = -1.05 + 2.1 * (li + 0.5) / NL
      ctx.strokeStyle = rgba(mixRgb(P.c2, P.c3, li / (NL - 1)), (0.25 + 0.65 * li / (NL - 1)) * (0.4 + 0.6 * P.inten))
      ctx.beginPath()
      for (let gy = 0; gy < rows; gy++) {
        const r0 = gy * (cols + 1), r1 = (gy + 1) * (cols + 1)
        for (let gx = 0; gx < cols; gx++) {
          const a = topoF[r0 + gx], b = topoF[r0 + gx + 1]
          const c = topoF[r1 + gx + 1], dd = topoF[r1 + gx]
          const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (dd > lv ? 1 : 0)
          const segs = TOPO_SEG[idx]
          if (!segs.length) continue
          const tv = (e0, e1) => (lv - e0) / (e1 - e0 || 1e-9)
          // edge point lookup: [x, y] in grid units
          const pts = [
            [gx + tv(a, b), gy],           // 0 top
            [gx + 1, gy + tv(b, c)],       // 1 right
            [gx + tv(dd, c), gy + 1],      // 2 bottom
            [gx, gy + tv(a, dd)],          // 3 left
          ]
          for (const [e1, e2] of segs) {
            ctx.moveTo(pts[e1][0] * cw, pts[e1][1] * chh)
            ctx.lineTo(pts[e2][0] * cw, pts[e2][1] * chh)
          }
        }
      }
      ctx.stroke()
    }
  }

  const DRAW = {
    mesh: drawMesh, aurora: drawAurora, lava: drawLava, waves: drawWaves,
    grain: drawGrain, stars: drawStars, conic: drawConic, rain: drawRain, topo: drawTopo,
  }

  // ── Compositor: optional static image first, then the animation over it ───
  // The image is static so the seamless phase-in-[0,1) loop contract holds.
  function paint(ph) {
    const w = canvas.width, h = canvas.height
    const img = (bgImg && bgImg.complete && bgImg.naturalWidth) ? bgImg : null
    if (img) {
      if (!animLayer || animLayer.width !== w || animLayer.height !== h) {
        animLayer = new OffscreenCanvas(w, h)
        animLayerCtx = animLayer.getContext('2d')
      }
      ctx = animLayerCtx
      ctx.save()
      try { DRAW[curPreset]?.(ph, params()) } finally { ctx.restore(); ctx = viewCtx }
      viewCtx.save()
      viewCtx.fillStyle = '#000'
      viewCtx.fillRect(0, 0, w, h)
      const s = (imgFit === 'contain' ? Math.min : Math.max)(w / img.naturalWidth, h / img.naturalHeight)
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s
      viewCtx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
      viewCtx.globalAlpha = animOp / 100
      viewCtx.drawImage(animLayer, 0, 0)
      viewCtx.restore()
    } else {
      ctx.save()
      try { DRAW[curPreset]?.(ph, params()) } finally { ctx.restore() }
    }
  }

  // ── Single rAF loop, phase-accumulated (speed changes stay continuous) ────
  function frame(ts) {
    rafId = requestAnimationFrame(frame)
    if (lastTs) {
      const dp = Math.min(100, ts - lastTs) / cycleMs()
      phase = (phase + dp) % 1
      if (recAcc !== null) {
        recAcc += dp
        if (recAcc >= 1) { recAcc = null; try { curRecorder?.stop() } catch {} }
      }
    }
    lastTs = ts
    paint(phase)
  }

  function sync() {
    const active = playing && shown && document.visibilityState === 'visible' && document.contains(body)
    if (active && !rafId) { lastTs = 0; rafId = requestAnimationFrame(frame) }
    else if (!active && rafId) { cancelAnimationFrame(rafId); rafId = null }
  }

  // repaint the current phase once while paused (param/preset/resolution edits)
  function renderOnce() {
    if (rafId) return
    paint(phase)
  }

  const onVis = () => sync()
  document.addEventListener('visibilitychange', onVis)

  // pause when the tool window is hidden/collapsed (RO reports zero size)
  const ro = new ResizeObserver(entries => {
    const r = entries[entries.length - 1]?.contentRect
    shown = !!r && r.width > 1 && r.height > 1
    sync()
  })
  ro.observe(preview)

  // ── Resolution ────────────────────────────────────────────────────────────
  RES_LIST.forEach((r, i) => {
    const o = document.createElement('option')
    o.value = i
    o.textContent = `${r.w} × ${r.h} — ${r.tag}${r.key ? ' · ' + t(r.key) : ''}`
    resSel.appendChild(o)
  })
  function applyResolution() {
    const r = RES_LIST[resIdx]
    canvas.width = r.w
    canvas.height = r.h
  }
  resSel.value = resIdx
  applyResolution()
  resSel.addEventListener('change', () => {
    if (recBusy) { resSel.value = resIdx; window.toast?.(t('bga_rec_busy'), 'info'); return }
    resIdx = +resSel.value
    applyResolution()
    renderOnce()
    saveState()
  })

  // ── Preset cards ──────────────────────────────────────────────────────────
  const cardByPreset = {}
  PRESETS.forEach(p => {
    const card = document.createElement('button')
    card.className = 'bga-card' + (p.id === curPreset ? ' sel' : '')
    card.innerHTML = '<div class="bga-card-thumb"></div><div class="bga-card-name"></div>'
    card.querySelector('.bga-card-name').textContent = t(p.labelKey)
    card.title = t(p.labelKey)
    card.addEventListener('click', () => {
      if (recBusy) { window.toast?.(t('bga_rec_busy'), 'info'); return }
      curPreset = p.id
      curUserId = null
      updateCardSel()
      updateLoopBadge()
      renderOnce()
      saveState()
    })
    cardByPreset[p.id] = card
    cardsEl.appendChild(card)
  })
  function refreshThumbs() {
    const a = c1Inp.value, b = c2Inp.value, c = c3Inp.value
    PRESETS.forEach(p => { cardByPreset[p.id].querySelector('.bga-card-thumb').style.background = p.thumb(a, b, c) })
  }
  refreshThumbs()

  // ── User presets — saved snapshots rendered after the built-ins ───────────
  const UP_KEY = 'iceample:bganim:userpresets'
  let userPresets = []
  try {
    const arr = JSON.parse(localStorage.getItem(UP_KEY) || '[]')
    if (Array.isArray(arr)) userPresets = arr.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string')
  } catch {}

  function persistUserPresets() {
    try { localStorage.setItem(UP_KEY, JSON.stringify(userPresets)); return true }
    catch { window.toast?.(t('bga_preset_store_fail'), 'error'); return false }
  }

  function updateCardSel() {
    Object.entries(cardByPreset).forEach(([id, c]) => c.classList.toggle('sel', !curUserId && id === curPreset))
    Object.entries(userCardEls).forEach(([id, c]) => c.classList.toggle('sel', id === curUserId))
  }

  function applyUserPreset(up) {
    if (recBusy) { window.toast?.(t('bga_rec_busy'), 'info'); return }
    curPreset = PRESETS.some(p => p.id === up.base) ? up.base : 'mesh'
    for (const [sl, valEl, v] of [[speedSl, speedVal, up.speed], [intenSl, intenVal, up.inten], [scaleSl, scaleVal, up.scale]]) {
      if (Number.isFinite(v)) { sl.value = Math.max(1, Math.min(10, Math.round(v))); valEl.textContent = sl.value }
    }
    if (Array.isArray(up.colors) && up.colors.length === 3) {
      customColors = true
      ;[c1Inp.value, c2Inp.value, c3Inp.value] = up.colors
    } else {
      customColors = false
      ;[c1Inp.value, c2Inp.value, c3Inp.value] = themeDefaults()
    }
    if (Number.isInteger(up.res) && up.res >= 0 && up.res < RES_LIST.length && up.res !== resIdx) {
      resIdx = up.res
      resSel.value = resIdx
      applyResolution()
    }
    curUserId = up.id
    refreshColorCache()
    refreshThumbs()
    updateLoopBadge()
    updateCardSel()
    renderOnce()
    saveState()
  }

  function openUserMenu(anchor, up) {
    document.getElementById('bga-user-menu')?.remove()
    const menu = document.createElement('div')
    menu.id = 'bga-user-menu'
    menu.className = 'bga-menu'
    const onDoc = e => { if (!menu.contains(e.target)) closeMenu() }
    const onKey = e => { if (e.key === 'Escape') closeMenu() }
    function closeMenu() {
      menu.remove()
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey, true)
    }
    const mkItem = (icon, label, danger, fn) => {
      const b = document.createElement('button')
      b.className = 'bga-menu-item' + (danger ? ' danger' : '')
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
      if (curUserId === up.id) { curUserId = null; saveState() }  // fall back to the base preset
      buildUserCards()
      window.toast?.(`${t('bga_preset_deleted')} — ${up.name}`, 'info')
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
    const th = themeDefaults()
    for (const up of userPresets) {
      const base = PRESETS.find(p => p.id === up.base) || PRESETS[0]
      const card = document.createElement('div')
      card.className = 'bga-card'
      card.tabIndex = 0
      card.innerHTML = '<div class="bga-card-thumb"></div><div class="bga-card-name"></div><i class="fa-solid fa-star bga-card-badge"></i><button class="bga-card-menu-btn"><i class="fa-solid fa-ellipsis-vertical"></i></button>'
      const cols = (Array.isArray(up.colors) && up.colors.length === 3) ? up.colors : th
      card.querySelector('.bga-card-thumb').style.background = base.thumb(cols[0], cols[1], cols[2])
      card.querySelector('.bga-card-name').textContent = up.name
      card.title = up.name
      card.addEventListener('click', e => { if (!e.target.closest('.bga-card-menu-btn')) applyUserPreset(up) })
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyUserPreset(up) }
      })
      card.querySelector('.bga-card-menu-btn').addEventListener('click', e => {
        e.stopPropagation()
        openUserMenu(e.currentTarget, up)
      })
      userCardEls[up.id] = card
      cardsEl.appendChild(card)
    }
    updateCardSel()
  }
  buildUserCards()

  presetSaveBtn.addEventListener('click', async () => {
    const name = (await promptName(t(presetMeta().labelKey), { title: t('pat_preset_save'), cancelable: true }) || '').trim()
    if (!name) return
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'preset'
    const up = {
      id: slug + '-' + Date.now(), name, base: curPreset,
      speed: +speedSl.value, inten: +intenSl.value, scale: +scaleSl.value,
      colors: customColors ? [c1Inp.value, c2Inp.value, c3Inp.value] : null,
      res: resIdx,
    }
    userPresets.push(up)
    if (!persistUserPresets()) { userPresets.pop(); return }
    curUserId = up.id
    buildUserCards()
    window.toast?.(t('bga_preset_saved'), 'success')
  })

  // ── Loop badge ────────────────────────────────────────────────────────────
  function updateLoopBadge() { loopVal.textContent = ` ${(cycleMs() / 1000).toFixed(1)} s` }
  updateLoopBadge()

  // ── Sliders / colors ──────────────────────────────────────────────────────
  speedSl.addEventListener('input', () => { speedVal.textContent = speedSl.value; updateLoopBadge(); saveState() })
  intenSl.addEventListener('input', () => { intenVal.textContent = intenSl.value; renderOnce(); saveState() })
  scaleSl.addEventListener('input', () => { scaleVal.textContent = scaleSl.value; renderOnce(); saveState() })
  speedVal.textContent = speedSl.value
  intenVal.textContent = intenSl.value
  scaleVal.textContent = scaleSl.value

  ;[c1Inp, c2Inp, c3Inp].forEach(inp => {
    inp.addEventListener('input', () => {
      customColors = true
      refreshColorCache()
      refreshThumbs()
      renderOnce()
      saveState()
    })
  })
  themeCols.addEventListener('click', () => {
    customColors = false
    ;[c1Inp.value, c2Inp.value, c3Inp.value] = themeDefaults()
    refreshColorCache()
    refreshThumbs()
    renderOnce()
    saveState()
  })

  // ── Play / pause ──────────────────────────────────────────────────────────
  function refreshPlayBtn() {
    playBtn.classList.toggle('active', playing)
    playBtn.innerHTML = playing
      ? '<i class="fa-solid fa-pause"></i> <span></span>'
      : '<i class="fa-solid fa-play"></i> <span></span>'
    playBtn.querySelector('span').textContent = playing ? t('bga_pause') : t('bga_play')
  }
  playBtn.addEventListener('click', () => {
    if (recBusy) { window.toast?.(t('bga_rec_busy'), 'info'); return }
    playing = !playing
    refreshPlayBtn()
    sync()
  })
  refreshPlayBtn()

  // ── Theme background bridge (bg-spectrum) ─────────────────────────────────
  themeBtn.addEventListener('click', () => {
    setBgConfig({
      enabled:   true,
      style:     presetMeta().theme,
      color:     c1Inp.value,
      color2:    c2Inp.value,
      color3:    c3Inp.value,
      speed:     +speedSl.value / 3.33,     // 1-10 → 0.3-3.0
      intensity: +intenSl.value / 10,       // 1-10 → 0.1-1.0
      density:   (+scaleSl.value - 1) / 9,  // 1-10 → 0.0-1.0
    })
    window.toast?.(t('bga_theme_applied'), 'success')
  })

  // ── Image underlay (static, drawn below the animation) ────────────────────
  function loadImageFromSrc(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  async function loadImageFromPath(path) {
    const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
    const ext = path.split('.').pop().toLowerCase()
    bgImg = await loadImageFromSrc(`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`)
    bgImgPath = path
  }

  function syncImgControls() {
    const on = !!bgImg
    imgOpSl.disabled = !on
    imgFitBtn.disabled = !on
    imgClearBtn.disabled = !on
    imgPickBtn.classList.toggle('active', on)
    imgFitBtn.innerHTML = imgFit === 'cover' ? '<i class="fa-solid fa-expand"></i>' : '<i class="fa-solid fa-compress"></i>'
    imgFitBtn.title = imgFit === 'cover' ? t('th_bg_img_cover') : t('th_bg_img_contain')
  }
  imgOpSl.value = animOp
  syncImgControls()

  imgPickBtn.addEventListener('click', async () => {
    if (window.__TAURI__?.core?.invoke) {
      try {
        const r = await window.__TAURI__.core.invoke('pick_files_with_filter', { filterName: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] })
        const path = Array.isArray(r) ? r[0] : null
        if (!path) return
        await loadImageFromPath(path)
        syncImgControls(); renderOnce(); saveState()
      } catch { window.toast?.(t('ie_load_fail'), 'error') }
    } else {
      // browser fallback: session-only (no path to persist)
      const inp = document.createElement('input')
      inp.type = 'file'
      inp.accept = 'image/png,image/jpeg,image/webp'
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0]
        if (!f) return
        const rd = new FileReader()
        rd.onload = async () => {
          try {
            bgImg = await loadImageFromSrc(rd.result)
            bgImgPath = null
            syncImgControls(); renderOnce(); saveState()
          } catch { window.toast?.(t('ie_load_fail'), 'error') }
        }
        rd.onerror = () => window.toast?.(t('ie_load_fail'), 'error')
        rd.readAsDataURL(f)
      })
      inp.click()
    }
  })

  imgOpSl.addEventListener('input', () => {
    animOp = +imgOpSl.value
    renderOnce()
    saveState()
  })

  imgFitBtn.addEventListener('click', () => {
    imgFit = imgFit === 'cover' ? 'contain' : 'cover'
    syncImgControls()
    renderOnce()
    saveState()
  })

  imgClearBtn.addEventListener('click', () => {
    bgImg = null
    bgImgPath = null
    syncImgControls()
    renderOnce()
    saveState()
  })

  // Silent re-load of the persisted image path (missing file → layer stays off).
  // The path is NOT nulled during the async load: a saveState() fired in that
  // window (any slider tweak) would persist img.path = null and lose the image
  // for good. Kept on failure too, so an unplugged drive self-heals next boot.
  if (bgImgPath && window.__TAURI__?.core?.invoke) {
    loadImageFromPath(bgImgPath)
      .then(() => { syncImgControls(); renderOnce() })
      .catch(() => { bgImg = null; syncImgControls() })
  }

  // ── Export helpers ────────────────────────────────────────────────────────
  function b64FromBuf(buf) {
    const u8 = new Uint8Array(buf)
    let s = ''
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
    return btoa(s)
  }

  async function saveBlobAs(blob, defName, ext, filterName) {
    const invoke = window.__TAURI__?.core?.invoke
    const dialog = window.__TAURI__?.dialog
    if (invoke && dialog) {
      let path = null
      try { path = await dialog.save({ defaultPath: defName, filters: [{ name: filterName, extensions: [ext] }] }) } catch {}
      if (!path) return false
      await invoke('save_binary_file', { path, base64: b64FromBuf(await blob.arrayBuffer()) })
      return true
    }
    // browser fallback (our own blob URL — safe to revoke, unlike bus-sent ones)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = defName; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return true
  }

  // Records exactly ONE loop cycle (phase-accumulated in frame()) → Blob | null
  function recordLoop() {
    if (recBusy) { window.toast?.(t('bga_rec_busy'), 'info'); return Promise.resolve(null) }
    if (typeof MediaRecorder === 'undefined') { window.toast?.(t('bga_save_fail'), 'error'); return Promise.resolve(null) }
    return new Promise(resolve => {
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m))
      const opts = { videoBitsPerSecond: Math.round(canvas.width * canvas.height * 6) }
      if (mime) opts.mimeType = mime
      let rec
      try { rec = new MediaRecorder(canvas.captureStream(30), opts) }
      catch { window.toast?.(t('bga_save_fail'), 'error'); resolve(null); return }
      const wasPlaying = playing
      playing = true; refreshPlayBtn(); sync()
      recBusy = true; curRecorder = rec
      window.toast?.(`${t('bga_recording')} (${(cycleMs() / 1000).toFixed(1)} s)`, 'info', Math.min(6000, cycleMs()))
      const chunks = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = () => {
        recBusy = false; recAcc = null; curRecorder = null
        playing = wasPlaying; refreshPlayBtn(); sync()
        resolve(chunks.length ? new Blob(chunks, { type: 'video/webm' }) : null)
      }
      recAcc = 0
      // start() can throw (dead stream/encoder) — reset the busy state or every
      // later export hits the recBusy guard until the tool is reopened.
      try { rec.start(200) }
      catch {
        recBusy = false; recAcc = null; curRecorder = null
        playing = wasPlaying; refreshPlayBtn(); sync()
        window.toast?.(t('bga_save_fail'), 'error'); resolve(null)
      }
    })
  }

  pngBtn.addEventListener('click', () => {
    canvas.toBlob(async blob => {
      if (!blob) { window.toast?.(t('bga_save_fail'), 'error'); return }
      try {
        if (await saveBlobAs(blob, `fond-${curPreset}.png`, 'png', 'PNG Image')) window.toast?.(t('bga_saved'), 'success')
      } catch { window.toast?.(t('bga_save_fail'), 'error') }
    }, 'image/png')
  })

  webmBtn.addEventListener('click', async () => {
    webmBtn.disabled = true
    try {
      const blob = await recordLoop()
      if (blob) {
        if (await saveBlobAs(blob, `fond-${curPreset}-boucle.webm`, 'webm', 'WebM Video')) window.toast?.(t('bga_saved'), 'success')
      }
    } catch { window.toast?.(t('bga_save_fail'), 'error') }
    webmBtn.disabled = false
  })

  // ── Media bus: one send button, video loop OR current frame by target ─────
  const sendBtn = makeSendButton(async targetId => {
    if (VIDEO_TARGETS.some(v => v.id === targetId)) {
      const blob = await recordLoop()
      if (!blob) return null
      // NOTE: bus receivers own nothing — the emitter must NOT revoke this URL
      return { kind: 'video', blobUrl: URL.createObjectURL(blob), name: `fond-${curPreset}.webm` }
    }
    return imageMedia(canvas, `fond-${curPreset}`)
  }, { self: 'bganim', targets: [...VIDEO_TARGETS, ...IMAGE_TARGETS], className: 'bga-btn' })
  barEl.appendChild(sendBtn)

  // ── Start ─────────────────────────────────────────────────────────────────
  sync()

  // ── Teardown ──────────────────────────────────────────────────────────────
  new MutationObserver((_, obs) => {
    if (!document.contains(body)) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null }
      try { if (curRecorder && curRecorder.state !== 'inactive') curRecorder.stop() } catch {}
      document.getElementById('bga-user-menu')?.remove()   // menu lives on document.body
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      obs.disconnect()
    }
  }).observe(document.body, { childList: true, subtree: true })
}
