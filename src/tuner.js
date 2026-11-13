// tuner.js — Chromatic tuner + delay calculator for Iceample v2
import { t } from './i18n.js'
import { getMicStream, makeInputSwitch, routeContext } from './devices.js'

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

function freqToMidi(f) { return 12 * Math.log2(f / 440) + 69 }
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12) }
function noteFromFreq(f) {
  const m = freqToMidi(f)
  const note = Math.round(m)
  const cents = Math.round((m - note) * 100)
  const octave = Math.floor(note / 12) - 1
  const name = NOTES[note % 12]
  return { name, octave, cents, freq: midiToFreq(note) }
}

// ── Autocorrelation pitch detection ──────────────────────────────────────────
function detectPitch(buf, sampleRate) {
  let rms = 0
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / buf.length)
  if (rms < 0.008) return null

  // Find first zero-crossing from left
  let r1 = 0
  for (let i = 0; i < buf.length / 2; i++) {
    if (Math.abs(buf[i]) < 0.2) { r1 = i; break }
  }
  const sliced = buf.slice(r1, Math.floor(buf.length * 0.75))

  const n = sliced.length
  const corr = new Float32Array(n)
  for (let lag = 0; lag < n; lag++) {
    for (let i = 0; i < n - lag; i++) corr[lag] += sliced[i] * sliced[i + lag]
  }

  // Skip initial peak, find next maximum
  let d = 0
  while (d < n - 1 && corr[d] > corr[d + 1]) d++
  let best = -1, bestVal = -Infinity
  for (let i = d; i < n; i++) {
    if (corr[i] > bestVal) { bestVal = corr[i]; best = i }
  }
  if (best < 1 || best >= n - 1) return null

  // Parabolic interpolation for sub-sample accuracy
  const x1 = corr[best - 1], x2 = corr[best], x3 = corr[best + 1]
  const a = (x1 + x3 - 2 * x2) / 2
  const b = (x3 - x1) / 2
  const refined = best - (a !== 0 ? b / (2 * a) : 0)

  const freq = sampleRate / (r1 + refined)
  if (freq < 50 || freq > 2000) return null
  return freq
}

const NOTE_VALS = [
  { label: '1/1',       mult: 4 },
  { label: '1/2',       mult: 2 },
  { label: '1/2 .',     mult: 3 },
  { label: '1/4',       mult: 1 },
  { label: '1/4 .',     mult: 1.5 },
  { label: '1/4 tri.',  mult: 2/3 },
  { label: '1/8',       mult: 0.5 },
  { label: '1/8 .',     mult: 0.75 },
  { label: '1/8 tri.',  mult: 1/3 },
  { label: '1/16',      mult: 0.25 },
  { label: '1/16 .',    mult: 0.375 },
  { label: '1/16 tri.', mult: 1/6 },
]

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('tuner-styles')) return
  const s = document.createElement('style')
  s.id = 'tuner-styles'
  s.textContent = `
.tuner-wrap {
  display: flex; flex-direction: column; align-items: center;
  height: 100%; gap: 10px; padding: 14px;
  overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--win-border) transparent;
}
.tuner-note-display {
  display: flex; align-items: baseline; gap: 4px;
}
.tuner-note {
  font-size: 64px; font-weight: 800; line-height: 1;
  color: var(--text-primary); letter-spacing: -2px;
  transition: color 0.2s;
}
.tuner-octave {
  font-size: 22px; color: var(--dim); font-weight: 600;
}
.tuner-freq {
  font-size: 11px; color: var(--dim); font-variant-numeric: tabular-nums;
}
/* Needle gauge */
.tuner-gauge {
  width: 100%; position: relative; height: 60px;
}
.tuner-gauge-svg {
  width: 100%; height: 100%;
}
.tuner-cents {
  font-size: 13px; font-variant-numeric: tabular-nums;
  color: var(--text-secondary); min-width: 60px; text-align: center;
  font-weight: 600;
}
.tuner-status {
  font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--dim);
}
.tuner-source-btn {
  font-size: 10px; background: var(--surface2); border: 1px solid var(--win-border);
  border-radius: 4px; color: var(--text-secondary); padding: 4px 10px;
  font-family: inherit; cursor: pointer; display: flex; align-items: center; gap: 6px;
}
.tuner-source-btn:hover { background: color-mix(in srgb, var(--surface2), var(--text-primary) 10%); color: var(--text-primary); }
.tuner-divider {
  width: 100%; border: none; border-top: 1px solid color-mix(in srgb, var(--text-primary) 6%, transparent);
  margin: 4px 0;
}
.tuner-section-hdr {
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: color-mix(in srgb, var(--text-primary) 25%, transparent);
  padding-bottom: 4px; align-self: flex-start; width: 100%;
}
.tuner-bpm-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
}
.tuner-bpm-inp {
  width: 64px; background: var(--surface2); border: 1px solid var(--win-border);
  border-radius: 5px; color: var(--text-primary); font-size: 18px;
  font-family: inherit; font-weight: 700; text-align: center;
  padding: 3px 0; outline: none;
}
.tuner-bpm-inp:focus { border-color: var(--color-active); }
.tuner-bpm-label { font-size: 10px; color: var(--dim); letter-spacing: 0.08em; }
.delay-table {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 2px; width: 100%;
}
.delay-th {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--dim); padding: 3px 6px;
}
.delay-cell {
  font-size: 11px; padding: 4px 6px; background: var(--surface2);
  border-radius: 3px; color: var(--text-secondary); font-variant-numeric: tabular-nums;
}
.delay-cell:first-child { color: var(--text-primary); font-weight: 600; }
.delay-cell.hz { color: color-mix(in srgb, var(--text-secondary) 65%, transparent); font-size: 10px; }
`
  document.head.appendChild(s)
}

export function initTuner(body) {
  injectStyles()

  const wrap = document.createElement('div')
  wrap.className = 'tuner-wrap'
  body.appendChild(wrap)

  // Note display
  const noteDisplay = document.createElement('div')
  noteDisplay.className = 'tuner-note-display'
  const noteEl = document.createElement('span')
  noteEl.className = 'tuner-note'
  noteEl.textContent = '—'
  const octEl = document.createElement('span')
  octEl.className = 'tuner-octave'
  noteDisplay.appendChild(noteEl)
  noteDisplay.appendChild(octEl)
  wrap.appendChild(noteDisplay)

  const freqEl = document.createElement('div')
  freqEl.className = 'tuner-freq'
  freqEl.textContent = '— Hz'
  wrap.appendChild(freqEl)

  // Gauge SVG
  const gaugeWrap = document.createElement('div')
  gaugeWrap.className = 'tuner-gauge'
  const W = 220, H = 60, CX = W / 2, CY = H + 10
  const R = H + 20
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.setAttribute('class', 'tuner-gauge-svg')

  // Arc
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  const startA = Math.PI * 0.7, endA = Math.PI * 0.3
  const ax1 = CX + R * Math.cos(Math.PI - startA), ay1 = CY - R * Math.sin(Math.PI - startA)
  const ax2 = CX + R * Math.cos(Math.PI - endA),   ay2 = CY - R * Math.sin(Math.PI - endA)
  arc.setAttribute('d', `M ${ax1} ${ay1} A ${R} ${R} 0 0 1 ${ax2} ${ay2}`)
  arc.setAttribute('fill', 'none')
  arc.style.stroke = 'var(--win-border)'   // style, not attribute: var() support
  arc.setAttribute('stroke-width', '3')
  arc.setAttribute('stroke-linecap', 'round')
  svg.appendChild(arc)

  // Center mark
  const cMark = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  cMark.setAttribute('x1', CX); cMark.setAttribute('y1', CY - R + 6)
  cMark.setAttribute('x2', CX); cMark.setAttribute('y2', CY - R + 16)
  cMark.style.stroke = 'color-mix(in srgb, var(--text-secondary) 65%, transparent)'; cMark.setAttribute('stroke-width', '2')
  svg.appendChild(cMark)

  // Needle
  const needle = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  needle.setAttribute('x1', CX); needle.setAttribute('y1', CY)
  needle.setAttribute('x2', CX); needle.setAttribute('y2', CY - R + 4)
  needle.style.stroke = 'var(--text-secondary)'; needle.setAttribute('stroke-width', '2')
  needle.setAttribute('stroke-linecap', 'round')
  svg.appendChild(needle)

  gaugeWrap.appendChild(svg)
  wrap.appendChild(gaugeWrap)

  function setNeedle(cents, color) {
    const angle = (cents / 50) * (Math.PI * 0.3)
    const needleAngle = Math.PI * 0.5 + angle
    const nx = CX + (R - 4) * Math.cos(Math.PI - needleAngle)
    const ny = CY - (R - 4) * Math.sin(Math.PI - needleAngle)
    needle.setAttribute('x2', nx); needle.setAttribute('y2', ny)
    needle.style.stroke = color
  }

  const centsEl = document.createElement('div')
  centsEl.className = 'tuner-cents'
  centsEl.textContent = '— ¢'
  wrap.appendChild(centsEl)

  const statusEl = document.createElement('div')
  statusEl.className = 'tuner-status'
  statusEl.textContent = t('tuner_waiting')
  wrap.appendChild(statusEl)

  const srcBtn = document.createElement('button')
  srcBtn.className = 'tuner-source-btn'
  srcBtn.innerHTML = `<i class="fa-solid fa-microphone"></i> ${t('tuner_enable_mic')}`
  wrap.appendChild(srcBtn)
  srcBtn.after(makeInputSwitch('tuner', ''))

  // ── Audio pipeline ─────────────────────────────────────────────────────────
  let stream = null
  let analyser = null
  let rafId = null
  let audioCtx = null

  const timeBuf = new Float32Array(2048)

  function startAnalysis() {
    if (!analyser) return
    analyser.getFloatTimeDomainData(timeBuf)
    const freq = detectPitch(timeBuf, audioCtx.sampleRate)

    if (freq) {
      const { name, octave, cents, freq: targetFreq } = noteFromFreq(freq)
      noteEl.textContent = name
      octEl.textContent = octave
      freqEl.textContent = freq.toFixed(1) + ' Hz  (' + t('tuner_target') + targetFreq.toFixed(1) + ' Hz)'
      centsEl.textContent = (cents >= 0 ? '+' : '') + cents + ' ¢'

      const absCents = Math.abs(cents)
      const color = absCents < 5 ? 'var(--success)' : absCents < 15 ? 'var(--warning)' : 'var(--danger)'
      noteEl.style.color = color
      needle.style.stroke = color
      setNeedle(cents, color)

      statusEl.textContent = absCents < 5 ? t('tuner_in_tune') : absCents < 15 ? t('tuner_close') : t('tuner_out_of_tune')
      statusEl.style.color = color
    } else {
      statusEl.textContent = t('tuner_silence')
      statusEl.style.color = ''
    }

    if (document.contains(body)) rafId = requestAnimationFrame(startAnalysis)
  }

  srcBtn.addEventListener('click', async () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      stream = null; analyser = null
      cancelAnimationFrame(rafId)
      srcBtn.innerHTML = `<i class="fa-solid fa-microphone"></i> ${t('tuner_enable_mic')}`
      noteEl.textContent = '—'; octEl.textContent = ''; freqEl.textContent = '— Hz'
      centsEl.textContent = '— ¢'; statusEl.textContent = t('tuner_waiting')
      noteEl.style.color = ''; setNeedle(0, 'var(--text-secondary)')
      return
    }
    try {
      stream = await getMicStream('tuner')
      audioCtx = new AudioContext()
      routeContext(audioCtx)
      const source = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0
      source.connect(analyser)
      srcBtn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i> ${t('tuner_disable')}`
      startAnalysis()
    } catch (e) {
      statusEl.textContent = t('tuner_mic_denied')
    }
  })

  // ── Delay calculator ───────────────────────────────────────────────────────
  const hr = document.createElement('hr')
  hr.className = 'tuner-divider'
  wrap.appendChild(hr)

  const delayHdr = document.createElement('div')
  delayHdr.className = 'tuner-section-hdr'
  delayHdr.textContent = t('tuner_delay_calc')
  wrap.appendChild(delayHdr)

  const bpmRow = document.createElement('div')
  bpmRow.className = 'tuner-bpm-row'
  const bpmInp = document.createElement('input')
  bpmInp.type = 'number'; bpmInp.className = 'tuner-bpm-inp'
  bpmInp.min = '20'; bpmInp.max = '300'
  bpmInp.value = parseInt(localStorage.getItem('iceample:metro:bpm') || '120', 10)
  const bpmLbl = document.createElement('span')
  bpmLbl.className = 'tuner-bpm-label'; bpmLbl.textContent = 'BPM'
  bpmRow.appendChild(bpmInp); bpmRow.appendChild(bpmLbl)
  wrap.appendChild(bpmRow)

  const table = document.createElement('div')
  table.className = 'delay-table'
  ;[t('tuner_col_note'), t('tuner_col_ms'), t('tuner_col_hz')].forEach(h => {
    const th = document.createElement('div')
    th.className = 'delay-th'; th.textContent = h
    table.appendChild(th)
  })
  const delayCells = []
  NOTE_VALS.forEach(({ label, mult }) => {
    const lbl = document.createElement('div'); lbl.className = 'delay-cell'; lbl.textContent = label
    const ms  = document.createElement('div'); ms.className = 'delay-cell'
    const hz  = document.createElement('div'); hz.className = 'delay-cell hz'
    table.appendChild(lbl); table.appendChild(ms); table.appendChild(hz)
    delayCells.push({ mult, ms, hz })
  })
  wrap.appendChild(table)

  function updateDelay() {
    const bpm = Math.max(20, Math.min(300, parseFloat(bpmInp.value) || 120))
    delayCells.forEach(({ mult, ms, hz }) => {
      const msVal = (60000 / bpm) * mult
      ms.textContent = msVal.toFixed(1) + ' ms'
      hz.textContent = (1000 / msVal).toFixed(2) + ' Hz'
    })
  }
  updateDelay()
  bpmInp.addEventListener('input', () => {
    localStorage.setItem('iceample:metro:bpm', bpmInp.value)
    updateDelay()
  })

  const obs = new MutationObserver(() => {
    if (!document.contains(body)) {
      cancelAnimationFrame(rafId)
      if (stream) stream.getTracks().forEach(t => t.stop())
      if (audioCtx) audioCtx.close()
      obs.disconnect()
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
