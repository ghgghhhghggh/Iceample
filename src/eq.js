// eq.js — 10-band graphic equalizer for Iceample v2
import { initEqForTarget, setEqGainForTarget, getEqBandsForTarget } from './audio-bus.js'
import { t } from './i18n.js'
import { themeColor } from './theme.js'

// '#rrggbb' + alpha → '#rrggbbaa' (canvas colours from themeColor)
const withAlpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0')

const EQ_LABELS = ['32','64','125','250','500','1k','2k','4k','8k','16k']
const DB_RANGE  = 12
const N_CURVE   = 300

// Cibles disponibles — id + clé i18n
const EQ_TARGETS = [
  { id: 'master',  labelKey: null,         label: 'Master'  },
  { id: 'daw',     labelKey: 'tool_daw',   label: 'DAW'     },
  { id: 'mic',     labelKey: 'tool_mic',   label: 'Mic'     },
  { id: 'seq',     labelKey: 'tool_seq',   label: 'Seq'     },
  { id: 'editor',  labelKey: 'tool_editor',label: 'Editor'  },
]

const STORAGE_KEY = id => `iceample:eq:gains:${id}`

// Log-spaced frequency array for curve drawing (20 → 20000 Hz)
const CURVE_FREQS = (() => {
  const f = new Float32Array(N_CURVE)
  for (let i = 0; i < N_CURVE; i++)
    f[i] = 20 * Math.pow(10, (i / (N_CURVE - 1)) * Math.log10(1000))
  return f
})()

function loadGainsFor(targetId) {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY(targetId))) || new Array(10).fill(0) }
  catch { return new Array(10).fill(0) }
}
function saveGainsFor(targetId, gains) {
  localStorage.setItem(STORAGE_KEY(targetId), JSON.stringify(gains))
}

function injectStyles() {
  if (document.getElementById('eq-styles')) return
  const s = document.createElement('style')
  s.id = 'eq-styles'
  s.textContent = `
.eq-wrap {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
}
.eq-target-row {
  display: flex; gap: 4px; padding: 6px 10px 4px; flex-shrink: 0;
  border-bottom: 1px solid var(--win-border-in);
}
.eq-target-btn {
  flex: 1; height: 22px; border-radius: 4px;
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  border: 1px solid color-mix(in srgb, var(--text-primary) 8%, transparent);
  color: color-mix(in srgb, var(--text-primary) 35%, transparent); font-size: 10px; font-weight: 600;
  cursor: pointer; transition: all 0.13s; font-family: inherit;
  letter-spacing: 0.04em; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis;
}
.eq-target-btn:hover {
  background: color-mix(in srgb, var(--text-primary) 9%, transparent); color: color-mix(in srgb, var(--text-primary) 75%, transparent);
}
.eq-target-btn.active {
  background: color-mix(in srgb, var(--text-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--text-primary) 30%, transparent);
  color: var(--text-primary);
}
.eq-canvas-wrap {
  flex: 1; min-height: 0; position: relative;
}
.eq-canvas {
  width: 100%; height: 100%; display: block;
}
.eq-bands {
  display: flex; align-items: stretch; padding: 6px 10px 4px;
  gap: 0; flex-shrink: 0; height: 130px;
}
.eq-band {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  gap: 3px; min-width: 0;
}
.eq-db-val {
  font-size: 9px; font-weight: 700; color: var(--color-active);
  letter-spacing: 0; height: 12px; line-height: 12px; text-align: center;
}
.eq-slider-wrap {
  flex: 1; display: flex; align-items: center; justify-content: center;
  min-height: 0;
}
.eq-slider {
  writing-mode: vertical-lr; direction: rtl;
  -webkit-appearance: slider-vertical; appearance: slider-vertical;
  width: 18px; height: 88px;
  accent-color: var(--slider-color); cursor: pointer;
  background: transparent; outline: none;
}
.eq-freq-label {
  font-size: 9px; color: var(--dim); letter-spacing: 0; text-align: center;
  height: 12px; line-height: 12px;
}
.eq-footer {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 10px 6px; flex-shrink: 0;
  border-top: 1px solid var(--win-border-in);
}
.eq-reset-btn {
  height: 22px; padding: 0 10px; border-radius: 4px;
  background: var(--surface2); border: 1px solid var(--win-border);
  color: var(--text-secondary); font-size: 10px; font-weight: 600;
  letter-spacing: 0.05em; cursor: pointer; font-family: inherit;
}
.eq-reset-btn:hover { background: color-mix(in srgb, var(--surface2), var(--text-primary) 10%); color: var(--text-primary); }
.eq-range-label {
  font-size: 9px; color: var(--dim); margin-left: auto;
}
`
  document.head.appendChild(s)
}

export function initEq(body) {
  injectStyles()
  body.style.padding = '0'

  let currentTarget = 'master'
  let gains = loadGainsFor(currentTarget)

  // Init first target's EQ chain and apply saved gains
  let bands = initEqForTarget(currentTarget)
  gains.forEach((g, i) => setEqGainForTarget(currentTarget, i, g))

  const wrap = document.createElement('div')
  wrap.className = 'eq-wrap'
  body.appendChild(wrap)

  // ── Target selector ────────────────────────────────────────────────────────
  const targetRow = document.createElement('div')
  targetRow.className = 'eq-target-row'

  const targetBtns = EQ_TARGETS.map(tgt => {
    const btn = document.createElement('button')
    btn.className = 'eq-target-btn' + (tgt.id === currentTarget ? ' active' : '')
    btn.textContent = tgt.labelKey ? t(tgt.labelKey) : tgt.label
    btn.title = tgt.labelKey ? t(tgt.labelKey) : tgt.label
    btn.addEventListener('click', () => {
      if (tgt.id === currentTarget) return
      // Save current gains
      saveGainsFor(currentTarget, gains)
      // Switch target
      currentTarget = tgt.id
      bands = initEqForTarget(currentTarget)
      gains = loadGainsFor(currentTarget)
      gains.forEach((g, i) => {
        setEqGainForTarget(currentTarget, i, g)
        sliders[i].value = g
        dbVals[i].textContent = g === 0 ? '0' : (g > 0 ? '+' : '') + g.toFixed(0)
      })
      targetBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      drawCurve()
    })
    targetRow.appendChild(btn)
    return btn
  })

  wrap.appendChild(targetRow)

  // ── Canvas ──────────────────────────────────────────────────────────────────
  const canvasWrap = document.createElement('div')
  canvasWrap.className = 'eq-canvas-wrap'
  const canvas = document.createElement('canvas')
  canvas.className = 'eq-canvas'
  canvasWrap.appendChild(canvas)
  wrap.appendChild(canvasWrap)

  function drawCurve() {
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    if (!W || !H) return
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    ctx.fillStyle = themeColor('--surface2')
    ctx.fillRect(0, 0, W, H)

    const toX = f => Math.round((Math.log10(f / 20) / Math.log10(1000)) * (W - 1))
    const toY = db => Math.round(H / 2 - (db / DB_RANGE) * (H / 2 - 8))

    // Grid
    const gridCol = themeColor('--win-border-in')
    ctx.strokeStyle = gridCol; ctx.lineWidth = 1
    const dbLines = [-12, -6, 0, 6, 12]
    dbLines.forEach(db => {
      const y = toY(db)
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y)
      ctx.strokeStyle = db === 0 ? themeColor('--win-border') : gridCol
      ctx.stroke()
    })
    EQ_LABELS.forEach((_, i) => {
      const freq = [32,64,125,250,500,1000,2000,4000,8000,16000][i]
      const x = toX(freq)
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H)
      ctx.strokeStyle = gridCol; ctx.stroke()
    })

    // Curve
    const activeBands = getEqBandsForTarget(currentTarget)
    if (!activeBands.length) return
    const combined = new Float32Array(N_CURVE).fill(1)
    const tmp      = new Float32Array(N_CURVE)
    const phase    = new Float32Array(N_CURVE)
    activeBands.forEach(b => {
      b.getFrequencyResponse(CURVE_FREQS, tmp, phase)
      for (let i = 0; i < N_CURVE; i++) combined[i] *= tmp[i]
    })
    const dbArr = combined.map(m => 20 * Math.log10(Math.max(m, 1e-6)))

    const accent = themeColor('--color-active')
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, withAlpha(accent, 0.25))
    grad.addColorStop(0.5, withAlpha(accent, 0.08))
    grad.addColorStop(1, withAlpha(accent, 0.01))
    ctx.beginPath()
    ctx.moveTo(0, toY(0))
    for (let i = 0; i < N_CURVE; i++) {
      ctx.lineTo(toX(CURVE_FREQS[i]), toY(Math.max(-DB_RANGE, Math.min(DB_RANGE, dbArr[i]))))
    }
    ctx.lineTo(W, toY(0))
    ctx.closePath()
    ctx.fillStyle = grad; ctx.fill()

    ctx.beginPath()
    ctx.moveTo(0, toY(0))
    for (let i = 0; i < N_CURVE; i++) {
      ctx.lineTo(toX(CURVE_FREQS[i]), toY(Math.max(-DB_RANGE, Math.min(DB_RANGE, dbArr[i]))))
    }
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5; ctx.stroke()

    ctx.fillStyle = withAlpha(themeColor('--text-secondary'), 0.65); ctx.font = '9px monospace'
    ctx.fillText('0', 3, toY(0) - 3)
  }

  const ro = new ResizeObserver(drawCurve)
  ro.observe(canvasWrap)
  window.addEventListener('iceample-theme-changed', drawCurve)

  // ── Sliders ──────────────────────────────────────────────────────────────────
  const bandsRow = document.createElement('div')
  bandsRow.className = 'eq-bands'

  const dbVals  = []
  const sliders = EQ_LABELS.map((label, i) => {
    const col = document.createElement('div')
    col.className = 'eq-band'

    const dbVal = document.createElement('div')
    dbVal.className = 'eq-db-val'
    dbVal.textContent = gains[i] === 0 ? '0' : (gains[i] > 0 ? '+' : '') + gains[i].toFixed(0)
    dbVals.push(dbVal)

    const sliderWrap = document.createElement('div')
    sliderWrap.className = 'eq-slider-wrap'

    const slider = document.createElement('input')
    slider.type = 'range'; slider.className = 'eq-slider'
    slider.min = -DB_RANGE; slider.max = DB_RANGE; slider.step = '0.5'
    slider.value = gains[i]

    slider.addEventListener('input', () => {
      const db = parseFloat(slider.value)
      gains[i] = db
      dbVal.textContent = db === 0 ? '0' : (db > 0 ? '+' : '') + db.toFixed(0)
      setEqGainForTarget(currentTarget, i, db)
      saveGainsFor(currentTarget, gains)
      drawCurve()
    })

    sliderWrap.appendChild(slider)

    const freqLabel = document.createElement('div')
    freqLabel.className = 'eq-freq-label'
    freqLabel.textContent = label

    col.append(dbVal, sliderWrap, freqLabel)
    bandsRow.appendChild(col)
    return slider
  })

  // Apply saved gains to the EQ chain
  gains.forEach((g, i) => setEqGainForTarget(currentTarget, i, g))

  wrap.appendChild(bandsRow)

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footer = document.createElement('div')
  footer.className = 'eq-footer'

  const btnReset = document.createElement('button')
  btnReset.className = 'eq-reset-btn'
  btnReset.innerHTML = `<i class="fa-solid fa-rotate-left"></i> ${t('eq_reset')}`
  btnReset.addEventListener('click', () => {
    sliders.forEach((sl, i) => {
      sl.value = 0; gains[i] = 0
      setEqGainForTarget(currentTarget, i, 0)
      dbVals[i].textContent = '0'
    })
    saveGainsFor(currentTarget, gains)
    drawCurve()
  })

  const rangeLabel = document.createElement('span')
  rangeLabel.className = 'eq-range-label'
  rangeLabel.textContent = `±${DB_RANGE} dB`

  footer.append(btnReset, rangeLabel)
  wrap.appendChild(footer)

  requestAnimationFrame(drawCurve)

  const obs = new MutationObserver(() => {
    if (!document.contains(body)) { ro.disconnect(); window.removeEventListener('iceample-theme-changed', drawCurve); obs.disconnect() }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
