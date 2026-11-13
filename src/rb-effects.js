// rb-effects.js — UI effects ported in vanilla from react-bits (MIT + Commons
// Clause). Reimplemented from scratch (no React); credited in the About window.

// Animated number rollup. Tweens the element's text from its current value to
// `to` with an easeOutCubic. Honours "reduce motion".
export function animateCount(el, to, opts = {}) {
  if (!el) return
  const dur = opts.duration ?? 350
  const dec = opts.decimals ?? 0
  const fmt = v => (dec ? v.toFixed(dec) : String(Math.round(v)))
  const from = parseFloat((el.textContent || '0').replace(/[^\d.-]/g, '')) || 0
  if (from === to || document.documentElement.classList.contains('reduce-motion')) { el.textContent = fmt(to); return }
  if (el._rbRaf) cancelAnimationFrame(el._rbRaf)
  const t0 = performance.now()
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / dur)
    const e = 1 - Math.pow(1 - k, 3)
    el.textContent = fmt(from + (to - from) * e)
    if (k < 1) el._rbRaf = requestAnimationFrame(tick)
    else { el.textContent = fmt(to); el._rbRaf = 0 }
  }
  el._rbRaf = requestAnimationFrame(tick)
}

function injectRbStyles() {
  if (document.getElementById('rb-styles')) return
  const s = document.createElement('style'); s.id = 'rb-styles'
  s.textContent = `
.rb-es { width:var(--rb-es-w,80px); padding:8px 0; cursor:pointer; transition:transform .14s ease; touch-action:none; }
.rb-es-track { height:5px; background:#2a2a2e; border-radius:3px; position:relative; }
.rb-es-fill { height:100%; background:var(--color-active,#4a9eff); border-radius:3px; width:0; }
.rb-es.grab { transition:none; }
.rb-es.grab .rb-es-track { box-shadow:0 0 0 3px color-mix(in srgb, var(--color-active,#4a9eff) 22%, transparent); }
@keyframes rb-list-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
.rb-list-item { animation:rb-list-in .32s cubic-bezier(.2,.8,.3,1) both; }
html.reduce-motion .rb-list-item { animation:none; }
`
  document.head.appendChild(s)
}

// Elastic slider — a range control with a spring fill and an elastic overshoot
// past its ends. Returns { el, get/set value }. Ported in vanilla from react-bits.
export function createElasticSlider({ min = 0, max = 1, step = 0, value = 0, width = 80, onInput } = {}) {
  injectRbStyles()
  const wrap = document.createElement('div'); wrap.className = 'rb-es'; wrap.style.setProperty('--rb-es-w', width + 'px')
  wrap.innerHTML = '<div class="rb-es-track"><div class="rb-es-fill"></div></div>'
  const track = wrap.querySelector('.rb-es-track'), fill = wrap.querySelector('.rb-es-fill')
  const clamp = v => Math.max(min, Math.min(max, v))
  let val = clamp(value), target = val, raf = 0
  const paint = () => { fill.style.width = ((val - min) / (max - min) * 100) + '%' }
  const spring = () => { val += (target - val) * 0.3; paint(); if (Math.abs(target - val) > 1e-4) raf = requestAnimationFrame(spring); else { val = target; paint(); raf = 0 } }
  const kick = () => { if (!raf) raf = requestAnimationFrame(spring) }
  function fromX(cx) {
    const r = track.getBoundingClientRect()
    let k = (cx - r.left) / r.width
    const over = k < 0 ? k * 0.18 : k > 1 ? (k - 1) * 0.18 : 0
    wrap.style.transform = `translateX(${over * r.width}px) scaleY(${1 + Math.min(0.5, Math.abs(over) * 2.5)})`
    k = Math.max(0, Math.min(1, k))
    let v = min + k * (max - min); if (step) v = Math.round(v / step) * step
    target = clamp(v); kick(); onInput && onInput(target)
  }
  track.addEventListener('pointerdown', e => {
    e.preventDefault(); wrap.classList.add('grab'); fromX(e.clientX)
    const mv = ev => fromX(ev.clientX)
    const up = () => { wrap.classList.remove('grab'); wrap.style.transform = ''; document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up) }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up)
  })
  paint()
  return { el: wrap, get value() { return target }, set value(v) { target = clamp(v); val = target; paint() } }
}

// Animated list — staggered entrance of a container's direct children.
export function animateListIn(container, opts = {}) {
  if (!container || document.documentElement.classList.contains('reduce-motion')) return
  injectRbStyles()
  const step = opts.stagger ?? 28
  ;[...container.children].forEach((c, i) => { c.classList.add('rb-list-item'); c.style.animationDelay = (i * step) + 'ms' })
}

// ASCII text — renders text as an ASCII-art canvas (usable as a texture).
export function asciiCanvas(text, color = '#ffffff', cell = 8) {
  const ramp = ' .:-=+*#%@'
  const tc = document.createElement('canvas'), tx = tc.getContext('2d')
  const font = '900 160px monospace'; tx.font = font
  tc.width = Math.max(64, Math.ceil(tx.measureText(text || ' ').width) + 60); tc.height = 220
  tx.font = font; tx.fillStyle = '#fff'; tx.textAlign = 'center'; tx.textBaseline = 'middle'; tx.fillText(text || ' ', tc.width / 2, tc.height / 2)
  const src = tx.getImageData(0, 0, tc.width, tc.height).data
  const cols = Math.max(1, Math.floor(tc.width / cell)), rows = Math.max(1, Math.floor(tc.height / cell))
  const out = document.createElement('canvas'), oc = out.getContext('2d')
  const cw = 9, ch = 15
  out.width = cols * cw; out.height = rows * ch
  oc.fillStyle = color; oc.font = '700 ' + ch + 'px monospace'; oc.textBaseline = 'top'
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let sum = 0, n = 0
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) { sum += src[((r * cell + y) * tc.width + (c * cell + x)) * 4 + 3]; n++ }
    const b = sum / n / 255
    const k = Math.min(ramp.length - 1, Math.floor(b * (ramp.length - 1)))
    if (ramp[k] !== ' ') oc.fillText(ramp[k], c * cw, r * ch)
  }
  return out
}
