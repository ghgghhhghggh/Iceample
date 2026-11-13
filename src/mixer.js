// mixer.js — Premium hardware-style mixer strip UI for Iceample v2
import {
  getCtx,
  getAnalyser,
  getStereoAnalysers,
  createMasterTap,
  setVolume,
  setMute,
  setSolo,
  getVolume,
  getMuted,
  getSolo,
  setPan,
  getPan,
  setCompressorEnabled,
  setCompressorParam,
  getCompressorEnabled,
  getCompressorParams,
  onMixChange,
} from './audio-bus.js'
import { t } from './i18n.js'
import { registerTool } from './project.js'
import { themeColor } from './theme.js'

// ── Track definitions ────────────────────────────────────────────────────────

const TRACKS = [
  { id: 'seq',    label: 'SEQ',    nameKey: 'mix_track_seq' },
  { id: 'daw',    label: 'DAW',    nameKey: 'mix_track_daw' },
  { id: 'mic',    label: 'MIC',    nameKey: 'mix_track_mic' },
  { id: 'editor', label: 'EDIT',   nameKey: 'mix_track_editor' },
  { id: 'piano',  label: 'PIANO',  nameKey: 'mix_track_piano' },
]
const MASTER = { id: 'master', label: 'MASTER', nameKey: 'mix_track_master' }

// ── CSS ──────────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('mixer-styles')) return
  const s = document.createElement('style')
  s.id = 'mixer-styles'
  s.textContent = `
.mix-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: color-mix(in srgb, var(--surface2), var(--workbench-bg) 50%);
  padding: 8px 6px 10px;
  overflow: hidden;
}

.mix-strips {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 100%;
}

.mix-strip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 40px;
  height: 100%;
  background: linear-gradient(180deg, var(--surface) 0%, var(--surface2) 100%);
  border: 1px solid var(--win-border-in);
  border-radius: 6px;
  padding: 8px 0 10px;
  position: relative;
  transition: border-color 0.15s;
}

.mix-strip:hover {
  border-color: var(--win-border);
}

.mix-strip-master {
  flex: 1.3;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--master-color) 12%, var(--surface)) 0%,
    color-mix(in srgb, var(--master-color)  8%, var(--surface2)) 100%
  );
  border-color: color-mix(in srgb, var(--master-color) 38%, var(--surface2));
}

.mix-strip-master:hover {
  border-color: color-mix(in srgb, var(--master-color) 58%, var(--surface2));
}

.mix-sep {
  width: 1px;
  align-self: stretch;
  margin: 0 4px;
  background: linear-gradient(180deg, transparent 5%, var(--win-border) 30%, var(--win-border) 70%, transparent 95%);
  flex-shrink: 0;
}

/* Label at top */
.mix-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-secondary) 65%, transparent);
  margin-bottom: 1px;
  flex-shrink: 0;
}

.mix-strip-master .mix-label {
  color: color-mix(in srgb, var(--master-color) 75%, var(--text-secondary));
  letter-spacing: 0.1em;
}

/* VU meter */
.mix-vu {
  display: block;
  flex-shrink: 0;
  border-radius: 2px;
  overflow: hidden;
}
.mix-vu-wrap { display: flex; align-items: stretch; flex-shrink: 0; }
.mix-db-scale { position: relative; width: 17px; margin-left: 3px; align-self: stretch; }
.mix-db-tick {
  position: absolute; right: 0; transform: translateY(-50%);
  font-size: 6px; line-height: 1; color: color-mix(in srgb, var(--text-secondary) 65%, transparent);
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
}

/* dB readout */
.mix-db {
  font-size: 8.5px;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--text-secondary) 50%, transparent);
  letter-spacing: 0.02em;
  min-width: 32px;
  text-align: center;
  flex-shrink: 0;
  transition: color 0.2s;
}

.mix-db.active {
  color: var(--text-secondary);
}

/* Vertical fader */
.mix-fader-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  width: 100%;
}

.mix-fader {
  -webkit-appearance: none;
  appearance: none;
  writing-mode: vertical-lr;
  direction: rtl;
  width: 100%;
  height: 100%;
  min-height: 50px;
  background: transparent;
  cursor: pointer;
  outline: none;
  border: none;
  padding: 0;
  margin: 0;
}

/* WebKit track */
.mix-fader::-webkit-slider-runnable-track {
  width: 3px;
  height: 100%;
  background: var(--win-border-in);
  border-radius: 2px;
  border: 1px solid var(--win-border);
}

/* WebKit thumb (metallic cap derived from the theme, light on light themes) */
.mix-fader::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 10px;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--text-secondary) 30%, var(--surface)) 0%,
    color-mix(in srgb, var(--text-secondary) 55%, var(--surface)) 40%,
    color-mix(in srgb, var(--text-secondary) 30%, var(--surface)) 100%);
  border-radius: 3px;
  border: 1px solid color-mix(in srgb, var(--text-secondary) 70%, var(--surface));
  box-shadow: 0 1px 4px rgba(0,0,0,0.7), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 6%, transparent);
  cursor: grab;
  margin-left: -9px;
  position: relative;
}

.mix-fader::-webkit-slider-thumb:active {
  cursor: grabbing;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--text-secondary) 40%, var(--surface)) 0%,
    color-mix(in srgb, var(--text-secondary) 70%, var(--surface)) 40%,
    color-mix(in srgb, var(--text-secondary) 40%, var(--surface)) 100%);
  border-color: var(--text-secondary);
}

/* Firefox track */
.mix-fader::-moz-range-track {
  width: 3px;
  background: var(--win-border-in);
  border-radius: 2px;
  border: 1px solid var(--win-border);
}

/* Firefox thumb */
.mix-fader::-moz-range-thumb {
  width: 22px;
  height: 10px;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--text-secondary) 30%, var(--surface)) 0%,
    color-mix(in srgb, var(--text-secondary) 55%, var(--surface)) 40%,
    color-mix(in srgb, var(--text-secondary) 30%, var(--surface)) 100%);
  border-radius: 3px;
  border: 1px solid color-mix(in srgb, var(--text-secondary) 70%, var(--surface));
  box-shadow: 0 1px 4px rgba(0,0,0,0.7);
  cursor: grab;
}

.mix-strip-master .mix-fader::-webkit-slider-thumb {
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--master-color) 55%, var(--surface)) 0%,
    var(--master-color) 40%,
    color-mix(in srgb, var(--master-color) 55%, var(--surface)) 100%
  );
  border-color: color-mix(in srgb, var(--text-primary) 18%, var(--master-color));
  box-shadow: 0 1px 6px rgba(0,0,0,0.8), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 6%, transparent);
}

.mix-strip-master .mix-fader::-moz-range-thumb {
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--master-color) 55%, var(--surface)) 0%,
    var(--master-color) 40%,
    color-mix(in srgb, var(--master-color) 55%, var(--surface)) 100%
  );
  border-color: color-mix(in srgb, var(--text-primary) 18%, var(--master-color));
}

/* Mute button */
.mix-mute {
  width: 26px;
  height: 16px;
  background: var(--surface2);
  border: 1px solid var(--win-border);
  border-radius: 3px;
  color: color-mix(in srgb, var(--text-secondary) 50%, transparent);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.05em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s;
  flex-shrink: 0;
  font-family: inherit;
  line-height: 1;
}

.mix-mute:hover {
  background: color-mix(in srgb, var(--surface2), var(--text-primary) 10%);
  color: var(--text-secondary);
  border-color: color-mix(in srgb, var(--win-border), var(--text-secondary) 30%);
}

.mix-mute.active {
  background: color-mix(in srgb, var(--danger) 18%, var(--surface2));
  border-color: color-mix(in srgb, var(--danger) 45%, var(--surface2));
  color: var(--danger);
  box-shadow: 0 0 6px color-mix(in srgb, var(--danger) 25%, transparent);
}

/* Mute + Solo row */
.mix-ms-row { display: flex; gap: 3px; flex-shrink: 0; }
.mix-solo {
  width: 26px;
  height: 16px;
  background: var(--surface2);
  border: 1px solid var(--win-border);
  border-radius: 3px;
  color: color-mix(in srgb, var(--text-secondary) 50%, transparent);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.05em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s;
  flex-shrink: 0;
  font-family: inherit;
  line-height: 1;
}
.mix-solo:hover { background: color-mix(in srgb, var(--surface2), var(--text-primary) 10%); color: var(--text-secondary); border-color: color-mix(in srgb, var(--win-border), var(--text-secondary) 30%); }
.mix-solo.active {
  background: color-mix(in srgb, var(--warning) 18%, var(--surface2));
  border-color: color-mix(in srgb, var(--warning) 45%, var(--surface2));
  color: var(--warning);
  box-shadow: 0 0 6px color-mix(in srgb, var(--warning) 25%, transparent);
}

/* Pan knob row */
.mix-pan-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}
.mix-pan-label {
  font-size: 7px;
  color: color-mix(in srgb, var(--text-secondary) 65%, transparent);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.mix-pan-val {
  font-size: 8px;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--text-secondary) 65%, transparent);
  min-width: 28px;
  text-align: center;
}
.mix-pan {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  background: var(--win-border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  border: none;
  padding: 0;
}
.mix-pan::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--slider-color, #4a9eff);
  border: 1px solid color-mix(in srgb, var(--text-primary) 15%, transparent);
  cursor: grab;
}
.mix-pan::-webkit-slider-thumb:active { cursor: grabbing; }

/* Compressor strip */
.mix-comp-btn {
  width: 100%;
  height: 14px;
  background: var(--surface2);
  border: 1px solid var(--win-border-in);
  border-radius: 3px;
  color: color-mix(in srgb, var(--text-secondary) 50%, transparent);
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.08em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  flex-shrink: 0;
  font-family: inherit;
}
.mix-comp-btn:hover { background: color-mix(in srgb, var(--surface2), var(--text-primary) 10%); color: var(--text-secondary); border-color: var(--win-border); }
.mix-comp-btn.active {
  background: color-mix(in srgb, var(--color-active) 15%, var(--surface2));
  border-color: color-mix(in srgb, var(--color-active) 45%, var(--surface2));
  color: var(--color-active);
  box-shadow: 0 0 4px color-mix(in srgb, var(--color-active) 20%, transparent);
}

/* Mixdown record/export button (master) */
.mix-export-btn {
  width: 100%;
  height: 16px;
  margin-top: 4px;
  background: var(--surface2);
  border: 1px solid var(--win-border-in);
  border-radius: 3px;
  color: color-mix(in srgb, var(--text-secondary) 65%, transparent);
  font-size: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  flex-shrink: 0;
}
.mix-export-btn:hover { background: color-mix(in srgb, var(--surface2), var(--text-primary) 10%); color: var(--text-secondary); border-color: var(--win-border); }
.mix-export-btn.recording {
  background: color-mix(in srgb, var(--danger) 18%, var(--surface2));
  border-color: var(--danger);
  color: var(--danger);
  animation: mix-rec-pulse 1.1s ease-in-out infinite;
}
@keyframes mix-rec-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }

/* Compressor toggle + floating popover panel (rendered on <body>, above the
   mixer window, so the window itself stays compact). */
.mix-comp-panel {
  position: fixed;
  width: 170px;
  transform: translateX(-50%);
  display: none;
  flex-direction: column;
  gap: 3px;
  padding: 7px 8px;
  background: var(--surface);
  border: 1px solid var(--win-border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.7);
  z-index: 9999;
}
.mix-comp-panel.open { display: flex; }
.mix-comp-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 6px; padding-bottom: 4px; margin-bottom: 2px;
  border-bottom: 1px solid var(--win-border-in);
}
.mix-comp-head-lbl { font-size: 7px; font-weight: 800; letter-spacing: 0.1em; color: var(--text-secondary); }
.mix-comp-en {
  height: 13px; padding: 0 7px; border-radius: 3px;
  background: var(--surface2); border: 1px solid var(--win-border); color: color-mix(in srgb, var(--text-secondary) 65%, transparent);
  font-size: 7px; font-weight: 800; letter-spacing: 0.06em; cursor: pointer; font-family: inherit;
}
.mix-comp-en:hover { background: color-mix(in srgb, var(--surface2), var(--text-primary) 10%); color: var(--text-secondary); }
.mix-comp-en.active { background: color-mix(in srgb, var(--color-active) 15%, var(--surface2)); border-color: color-mix(in srgb, var(--color-active) 45%, var(--surface2)); color: var(--color-active); }
.mix-comp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
}
.mix-comp-lbl {
  font-size: 7px;
  color: color-mix(in srgb, var(--text-secondary) 65%, transparent);
  min-width: 18px;
  text-align: right;
  flex-shrink: 0;
}
.mix-comp-sl {
  flex: 1;
  -webkit-appearance: none;
  height: 2px;
  background: var(--win-border);
  border-radius: 1px;
  outline: none;
  cursor: pointer;
  border: none;
}
.mix-comp-sl::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--slider-color);
  border: none;
}
.mix-comp-val {
  font-size: 7px;
  color: color-mix(in srgb, var(--text-secondary) 65%, transparent);
  min-width: 22px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
  `
  document.head.appendChild(s)
}

// ── VU meter draw ────────────────────────────────────────────────────────────

const _timeBuf = {}

function drawVU(canvas, analyser, dbEl) {
  const id = canvas.dataset.track
  if (!_timeBuf[id] || _timeBuf[id].length !== analyser.fftSize) {
    _timeBuf[id] = new Float32Array(analyser.fftSize)
  }
  analyser.getFloatTimeDomainData(_timeBuf[id])

  // RMS
  let sum = 0
  const buf = _timeBuf[id]
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  const rms = Math.sqrt(sum / buf.length)

  const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity
  const norm = Math.max(0, Math.min(1, (db + 60) / 60))

  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const SEGS = 20
  const segH = Math.floor(h / SEGS)
  const gap = 1
  const inner = segH - gap

  // Read theme colors once per draw call
  const style   = getComputedStyle(document.documentElement)
  const colLow  = style.getPropertyValue('--vu-color-low').trim()  || '#20be3c'
  const colMid  = style.getPropertyValue('--vu-color-mid').trim()  || '#d2c314'
  const colHigh = style.getPropertyValue('--vu-color-high').trim() || '#dc281e'

  ctx.clearRect(0, 0, w, h)

  for (let i = 0; i < SEGS; i++) {
    // i=0 is bottom, i=19 is top
    const ratio = (i + 0.5) / SEGS
    const y = h - (i + 1) * segH + gap
    const lit = ratio <= norm

    if (!lit) {
      ctx.fillStyle = themeColor('--text-primary') + '0d'   // 5% alpha
    } else if (ratio < 0.65) {
      ctx.fillStyle = colLow
    } else if (ratio < 0.85) {
      ctx.fillStyle = colMid
    } else {
      ctx.fillStyle = colHigh
    }

    if (ctx.roundRect) {
      ctx.beginPath()
      ctx.roundRect(1, y, w - 2, inner, 1)
      ctx.fill()
    } else {
      ctx.fillRect(1, y, w - 2, inner)
    }
  }

  // dB label
  if (dbEl) {
    if (db === -Infinity || rms < 1e-6) {
      dbEl.textContent = '-∞'
      dbEl.classList.remove('active')
    } else {
      dbEl.textContent = (db >= 0 ? '+' : '') + db.toFixed(1)
      dbEl.classList.toggle('active', rms > 0.001)
    }
  }
}

// ── Strip builder ────────────────────────────────────────────────────────────

function buildStrip(trackDef, isMaster, cleanups = []) {
  const strip = document.createElement('div')
  strip.className = 'mix-strip' + (isMaster ? ' mix-strip-master' : '')
  strip.dataset.track = trackDef.id

  // Label
  const label = document.createElement('div')
  label.className = 'mix-label'
  label.textContent = trackDef.label
  strip.appendChild(label)

  // VU canvas (with a dB scale beside the master meter)
  const canvas = document.createElement('canvas')
  canvas.className = 'mix-vu'
  canvas.dataset.track = trackDef.id
  canvas.width = isMaster ? 26 : 22
  canvas.height = 100
  if (isMaster) {
    const vuWrap = document.createElement('div')
    vuWrap.className = 'mix-vu-wrap'
    vuWrap.appendChild(canvas)
    const scale = document.createElement('div')
    scale.className = 'mix-db-scale'
    for (const db of [0, 6, 12, 24, 48]) {
      const tk = document.createElement('span')
      tk.className = 'mix-db-tick'
      tk.style.top = (db / 60 * 100) + '%'   // VU spans 0..-60 dB linearly
      tk.textContent = db === 0 ? '0' : '-' + db
      scale.appendChild(tk)
    }
    vuWrap.appendChild(scale)
    strip.appendChild(vuWrap)
  } else {
    strip.appendChild(canvas)
  }

  // dB readout
  const dbEl = document.createElement('div')
  dbEl.className = 'mix-db'
  dbEl.textContent = '-∞'
  strip.appendChild(dbEl)

  // Fader
  const faderWrap = document.createElement('div')
  faderWrap.className = 'mix-fader-wrap'

  const fader = document.createElement('input')
  fader.type = 'range'
  fader.className = 'mix-fader'
  fader.min = '0'
  fader.max = '1'
  fader.step = '0.01'
  fader.value = String(getVolume(trackDef.id))

  fader.addEventListener('input', () => {
    setVolume(trackDef.id, parseFloat(fader.value))
  })

  faderWrap.appendChild(fader)
  strip.appendChild(faderWrap)

  // Pan knob (not on master)
  if (!isMaster) {
    const panRow = document.createElement('div')
    panRow.className = 'mix-pan-row'

    const panLabel = document.createElement('div')
    panLabel.className = 'mix-pan-label'
    panLabel.textContent = t('mix_pan')

    const panVal = document.createElement('div')
    panVal.className = 'mix-pan-val'
    const _fmtPan = v => v === 0 ? 'C' : (v > 0 ? 'R' + Math.round(v * 100) : 'L' + Math.round(-v * 100))
    panVal.textContent = _fmtPan(getPan(trackDef.id))

    const panSlider = document.createElement('input')
    panSlider.type  = 'range'
    panSlider.className = 'mix-pan'
    panSlider.min   = '-1'; panSlider.max = '1'; panSlider.step = '0.01'
    panSlider.value = String(getPan(trackDef.id))
    panSlider.addEventListener('input', () => {
      const v = parseFloat(panSlider.value)
      setPan(trackDef.id, v)
      panVal.textContent = _fmtPan(v)
    })
    panSlider.addEventListener('dblclick', () => {
      panSlider.value = '0'; setPan(trackDef.id, 0); panVal.textContent = 'C'
    })

    panRow.append(panLabel, panSlider, panVal)
    strip.appendChild(panRow)
  }

  // Mute + Solo (hidden for master)
  if (!isMaster) {
    const msRow = document.createElement('div')
    msRow.className = 'mix-ms-row'

    const muteBtn = document.createElement('button')
    muteBtn.className = 'mix-mute' + (getMuted(trackDef.id) ? ' active' : '')
    muteBtn.textContent = 'M'
    muteBtn.title = t('mix_mute') + ' ' + t(trackDef.nameKey)
    muteBtn.addEventListener('click', () => {
      const nowMuted = !getMuted(trackDef.id)
      setMute(trackDef.id, nowMuted)
      muteBtn.classList.toggle('active', nowMuted)
    })

    const soloBtn = document.createElement('button')
    soloBtn.className = 'mix-solo' + (getSolo(trackDef.id) ? ' active' : '')
    soloBtn.textContent = 'S'
    soloBtn.title = t('mix_solo') + ' ' + t(trackDef.nameKey)
    soloBtn.dataset.track = trackDef.id
    soloBtn.addEventListener('click', () => {
      const nowSolo = !getSolo(trackDef.id)
      setSolo(trackDef.id, nowSolo)
      soloBtn.classList.toggle('active', nowSolo)
    })

    msRow.append(muteBtn, soloBtn)
    strip.appendChild(msRow)
  }

  // Compressor toggle + mini panel (not on master)
  if (!isMaster) {
    const compEnabled = getCompressorEnabled(trackDef.id)
    const compBtn = document.createElement('button')
    compBtn.className = 'mix-comp-btn' + (compEnabled ? ' active' : '')
    compBtn.innerHTML = '<i class="fa-solid fa-compress-alt" style="font-size:6px"></i> COMP'
    compBtn.title = t('mix_comp')

    const compPanel = document.createElement('div')
    compPanel.className = 'mix-comp-panel'

    // Header: enable/bypass toggle (independent from showing the panel).
    const compHead = document.createElement('div')
    compHead.className = 'mix-comp-head'
    const compHeadLbl = document.createElement('span')
    compHeadLbl.className = 'mix-comp-head-lbl'; compHeadLbl.textContent = 'COMP'
    const enBtn = document.createElement('button')
    enBtn.className = 'mix-comp-en' + (compEnabled ? ' active' : '')
    enBtn.textContent = compEnabled ? 'ON' : 'OFF'
    enBtn.addEventListener('click', () => {
      const on = !getCompressorEnabled(trackDef.id)
      setCompressorEnabled(trackDef.id, on)
      enBtn.classList.toggle('active', on); enBtn.textContent = on ? 'ON' : 'OFF'
      compBtn.classList.toggle('active', on)
    })
    compHead.append(compHeadLbl, enBtn)
    compPanel.appendChild(compHead)

    const COMP_PARAMS = [
      { key: 'threshold', label: 'THR', min: -60, max: 0,    step: 1,    fmt: v => v + 'dB' },
      { key: 'ratio',     label: 'RAT', min: 1,   max: 20,   step: 0.5,  fmt: v => v + ':1'  },
      { key: 'attack',    label: 'ATK', min: 0,   max: 0.5,  step: 0.001, fmt: v => Math.round(v*1000)+'ms' },
      { key: 'release',   label: 'REL', min: 0,   max: 1,    step: 0.01, fmt: v => Math.round(v*1000)+'ms' },
    ]
    const params = getCompressorParams(trackDef.id)
    COMP_PARAMS.forEach(({ key, label, min, max, step, fmt }) => {
      const row = document.createElement('div'); row.className = 'mix-comp-row'
      const lbl = document.createElement('div'); lbl.className = 'mix-comp-lbl'; lbl.textContent = label
      const sl  = document.createElement('input'); sl.type = 'range'; sl.className = 'mix-comp-sl'
      sl.min = min; sl.max = max; sl.step = step; sl.value = params[key] ?? 0
      const val = document.createElement('div'); val.className = 'mix-comp-val'; val.textContent = fmt(parseFloat(sl.value))
      sl.addEventListener('input', () => {
        const v = parseFloat(sl.value)
        setCompressorParam(trackDef.id, key, v)
        val.textContent = fmt(v)
      })
      row.append(lbl, sl, val); compPanel.appendChild(row)
    })

    // The popover floats on <body>, above the mixer window, so opening it never
    // grows the window. The COMP button just shows/hides it; enabling is the
    // ON/OFF toggle inside it.
    let popoverOpen = false
    function positionPanel() {
      const r = compBtn.getBoundingClientRect()
      compPanel.style.left   = Math.round(r.left + r.width / 2) + 'px'
      compPanel.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px'
      compPanel.style.top    = 'auto'
      // Flip below the button if opening above would overflow the screen top.
      const pr = compPanel.getBoundingClientRect()
      if (pr.top < 4) {
        compPanel.style.bottom = 'auto'
        compPanel.style.top    = Math.round(r.bottom + 6) + 'px'
      }
    }
    function onDocDown(e) {
      if (compPanel.contains(e.target) || compBtn.contains(e.target)) return
      closePanel()
    }
    function openPanel() {
      if (!compPanel.isConnected) document.body.appendChild(compPanel)
      compPanel.classList.add('open')
      positionPanel()
      popoverOpen = true
      setTimeout(() => {
        document.addEventListener('mousedown', onDocDown, true)
        window.addEventListener('resize', positionPanel)
      }, 0)
    }
    function closePanel() {
      compPanel.classList.remove('open')
      popoverOpen = false
      document.removeEventListener('mousedown', onDocDown, true)
      window.removeEventListener('resize', positionPanel)
      if (compPanel.isConnected) compPanel.remove()
    }
    compBtn.addEventListener('click', () => { popoverOpen ? closePanel() : openPanel() })
    cleanups.push(closePanel)

    // Only the button lives in the strip; the panel floats on <body> when open.
    strip.appendChild(compBtn)
  }

  // Stereo correlation meter (master only)
  let corrCanvas = null
  if (isMaster) {
    const corrWrap = document.createElement('div')
    corrWrap.style.cssText = 'width:100%;padding:0 4px;flex-shrink:0;'

    const corrLabel = document.createElement('div')
    corrLabel.style.cssText = 'font-size:8px;text-align:center;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);letter-spacing:0.1em;margin-bottom:2px;'
    corrLabel.textContent = 'Φ'

    corrCanvas = document.createElement('canvas')
    corrCanvas.width = 60; corrCanvas.height = 8
    corrCanvas.style.cssText = 'width:100%;height:8px;display:block;border-radius:3px;overflow:hidden;'

    corrWrap.appendChild(corrLabel)
    corrWrap.appendChild(corrCanvas)
    strip.appendChild(corrWrap)

    // ── Mixdown recorder/export (master only) ────────────────────────────────
    const recBtn = document.createElement('button')
    recBtn.className = 'mix-export-btn'
    recBtn.innerHTML = '<i class="fa-solid fa-circle"></i>'
    recBtn.title = t('mix_export_master')
    let mrec = null, mtap = null, mchunks = []
    recBtn.addEventListener('click', async () => {
      if (mrec) { mrec.stop(); return }   // second click → stop & save
      try {
        mtap = createMasterTap()
        mrec = new MediaRecorder(mtap.stream)
        mchunks = []
        mrec.ondataavailable = e => { if (e.data.size) mchunks.push(e.data) }
        mrec.onstop = async () => {
          recBtn.classList.remove('recording')
          recBtn.innerHTML = '<i class="fa-solid fa-circle"></i>'
          const mime = mrec?.mimeType || 'audio/webm'
          mrec = null
          try { mtap?.disconnect() } catch {}
          try {
            const ab  = await new Blob(mchunks, { type: mime }).arrayBuffer()
            const buf = await getCtx().decodeAudioData(ab)
            const wav = encodeWAV(buf)
            if (window.__TAURI__) {
              const { save } = window.__TAURI__.dialog
              const path = await save({ defaultPath: 'mixdown.wav', filters: [{ name: 'WAV', extensions: ['wav'] }] })
              if (!path) return
              await window.__TAURI__.core.invoke('save_binary_file', { path, base64: ab2b64(wav) })
              window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: path.replace(/[\\/][^\\/]*$/, '') } }))
              window.toast?.(t('mix_export_done'), 'success')
            } else {
              const a = document.createElement('a')
              a.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
              a.download = 'mixdown.wav'; a.click()
              setTimeout(() => URL.revokeObjectURL(a.href), 5000)
            }
          } catch (e) { window.toast?.(t('mix_export_fail') + ': ' + (e?.message ?? e), 'error') }
        }
        mrec.start()
        recBtn.classList.add('recording')
        recBtn.innerHTML = '<i class="fa-solid fa-stop"></i>'
        window.toast?.(t('mix_recording'), 'info')
      } catch (e) {
        window.toast?.(t('mix_export_fail') + ': ' + (e?.message ?? e), 'error')
        mrec = null
      }
    })
    strip.appendChild(recBtn)
  }

  return { strip, canvas, dbEl, corrCanvas }
}

// ── WAV (16-bit stereo) encoder + base64 ──────────────────────────────────────
function encodeWAV(buf) {
  const numCh = Math.min(2, buf.numberOfChannels)
  const sr    = buf.sampleRate
  const len   = buf.length
  const L = buf.getChannelData(0)
  const R = numCh > 1 ? buf.getChannelData(1) : L
  const ab = new ArrayBuffer(44 + len * numCh * 2)
  const dv = new DataView(ab)
  const ws = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); dv.setUint32(4, 36 + len * numCh * 2, true); ws(8, 'WAVE')
  ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true)
  dv.setUint16(22, numCh, true); dv.setUint32(24, sr, true)
  dv.setUint32(28, sr * numCh * 2, true); dv.setUint16(32, numCh * 2, true); dv.setUint16(34, 16, true)
  ws(36, 'data'); dv.setUint32(40, len * numCh * 2, true)
  let off = 44
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, (ch === 0 ? L : R)[i]))
      dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2
    }
  }
  return ab
}
function ab2b64(ab) {
  const bytes = new Uint8Array(ab)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// ── RAF loop ─────────────────────────────────────────────────────────────────

const _lBuf = new Float32Array(2048)
const _rBuf = new Float32Array(2048)

function drawCorrelation(canvas) {
  try {
    const { l, r } = getStereoAnalysers()
    l.getFloatTimeDomainData(_lBuf)
    r.getFloatTimeDomainData(_rBuf)
    const n = Math.min(_lBuf.length, _rBuf.length, 512)
    let sumLR = 0, sumL2 = 0, sumR2 = 0
    for (let i = 0; i < n; i++) {
      sumLR += _lBuf[i] * _rBuf[i]
      sumL2 += _lBuf[i] * _lBuf[i]
      sumR2 += _rBuf[i] * _rBuf[i]
    }
    const denom = Math.sqrt(sumL2 * sumR2)
    const corr = denom > 1e-10 ? Math.max(-1, Math.min(1, sumLR / denom)) : 1

    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)

    // Background track
    ctx.fillStyle = themeColor('--surface2')
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0, 0, w, h, 3); else ctx.rect(0, 0, w, h)
    ctx.fill()

    // Filled bar: center = w/2, corr=+1 → right end, corr=-1 → left end
    const center = w / 2
    const pos = center + corr * center
    const barColor = corr > 0.5 ? '#20be3c' : corr > 0 ? '#d2c314' : '#dc281e'
    ctx.fillStyle = barColor
    const barX = Math.min(center, pos), barW = Math.abs(pos - center)
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(barX, 1, barW, h - 2, 2); else ctx.rect(barX, 1, barW, h - 2)
    ctx.fill()

    // Center line
    ctx.fillStyle = themeColor('--win-border')
    ctx.fillRect(center - 0.5, 0, 1, h)
  } catch (_) {}
}

function startLoop(body, strips) {
  function tick() {
    if (!body.isConnected) return
    for (const { trackId, canvas, dbEl, corrCanvas } of strips) {
      try {
        const analyser = getAnalyser(trackId)
        drawVU(canvas, analyser, dbEl)
        if (corrCanvas) drawCorrelation(corrCanvas)
      } catch (_) {}
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// ── Public init ──────────────────────────────────────────────────────────────

export function initMixer(body) {
  injectStyles()

  const mixBody = document.createElement('div')
  mixBody.className = 'mix-body'

  const stripsRow = document.createElement('div')
  stripsRow.className = 'mix-strips'

  const animTargets = []
  const cleanups = []   // close/remove floating comp popovers on mixer close

  // Four track strips
  for (const track of TRACKS) {
    const { strip, canvas, dbEl } = buildStrip(track, false, cleanups)
    stripsRow.appendChild(strip)
    animTargets.push({ trackId: track.id, canvas, dbEl, corrCanvas: null })
  }

  // Separator
  const sep = document.createElement('div')
  sep.className = 'mix-sep'
  stripsRow.appendChild(sep)

  // Master strip
  const { strip: masterStrip, canvas: masterCanvas, dbEl: masterDb, corrCanvas } = buildStrip(MASTER, true)
  stripsRow.appendChild(masterStrip)
  animTargets.push({ trackId: 'master', canvas: masterCanvas, dbEl: masterDb, corrCanvas })

  mixBody.appendChild(stripsRow)
  body.appendChild(mixBody)

  startLoop(body, animTargets)

  // Keep the strips in sync when volume/mute/solo are changed elsewhere
  // (e.g. keyboard shortcuts).
  const offMix = onMixChange(id => {
    const strip = body.querySelector(`.mix-strip[data-track="${id}"]`)
    if (!strip) return
    const f = strip.querySelector('.mix-fader'); if (f && document.activeElement !== f) f.value = String(getVolume(id))
    const m = strip.querySelector('.mix-mute'); if (m) m.classList.toggle('active', getMuted(id))
    const s = strip.querySelector('.mix-solo'); if (s) s.classList.toggle('active', getSolo(id))
  })
  cleanups.push(offMix)

  // Remove any floating comp popovers (and their listeners) when the mixer closes.
  const closeObs = new MutationObserver(() => {
    if (!body.isConnected) { cleanups.forEach(fn => { try { fn() } catch {} }); closeObs.disconnect() }
  })
  closeObs.observe(document.body, { childList: true, subtree: true })

  // ── Project registry ───────────────────────────────────────────────────────
  const allTracks = [...TRACKS, MASTER]
  registerTool('mixer', {
    getState: () => {
      const volumes = {}, mutes = {}, pans = {}, comps = {}
      for (const tr of allTracks) {
        volumes[tr.id] = getVolume(tr.id)
        mutes[tr.id]   = getMuted(tr.id)
      }
      for (const tr of TRACKS) {
        pans[tr.id]  = getPan(tr.id)
        comps[tr.id] = { enabled: getCompressorEnabled(tr.id), params: getCompressorParams(tr.id) }
      }
      return { volumes, mutes, pans, comps }
    },
    setState: (state) => {
      if (!state) return
      for (const [id, vol] of Object.entries(state.volumes || {})) {
        setVolume(id, vol)
        const strip = body.querySelector(`.mix-strip[data-track="${id}"]`)
        if (strip) { const f = strip.querySelector('.mix-fader'); if (f) f.value = String(vol) }
      }
      for (const [id, muted] of Object.entries(state.mutes || {})) {
        setMute(id, muted)
        const strip = body.querySelector(`.mix-strip[data-track="${id}"]`)
        if (strip) { const btn = strip.querySelector('.mix-mute'); if (btn) btn.classList.toggle('active', muted) }
      }
      for (const [id, pan] of Object.entries(state.pans || {})) {
        setPan(id, pan)
        const strip = body.querySelector(`.mix-strip[data-track="${id}"]`)
        if (strip) { const sl = strip.querySelector('.mix-pan'); if (sl) sl.value = String(pan) }
      }
      for (const [id, comp] of Object.entries(state.comps || {})) {
        if (comp.enabled !== undefined) setCompressorEnabled(id, comp.enabled)
        for (const [key, val] of Object.entries(comp.params || {})) setCompressorParam(id, key, val)
      }
    },
  })
}
