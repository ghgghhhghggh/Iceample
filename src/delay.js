// delay.js — Audio delay / echo effect pedal
import { getMicStream, makeInputSwitch, routeContext } from './devices.js'
function injectStyles() {
  if (document.getElementById('delay-styles')) return
  const s = document.createElement('style'); s.id = 'delay-styles'
  s.textContent = `
.dly-body{display:flex;flex-direction:column;height:100%;background:var(--surface);color:var(--text-primary);font-family:inherit;font-size:12px;user-select:none}
.dly-vis{flex:0 0 90px;background:color-mix(in srgb,var(--surface) 55%,#000);position:relative;overflow:hidden}
.dly-vis canvas{position:absolute;inset:0;width:100%;height:100%}
.dly-ctrl{flex:1;display:flex;flex-direction:column;gap:0;overflow-y:auto}
.dly-row{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--win-border-in)}
.dly-lbl{width:80px;flex-shrink:0;font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.4px}
.dly-val{width:48px;flex-shrink:0;font-size:11px;color:var(--color-active);text-align:right;font-variant-numeric:tabular-nums}
.dly-slider{flex:1;-webkit-appearance:none;appearance:none;height:3px;background:var(--win-border-in);border-radius:2px;outline:none;cursor:pointer}
.dly-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--color-active);cursor:pointer;border:2px solid var(--surface);box-shadow:0 0 6px color-mix(in srgb,var(--color-active) 60%,transparent)}
.dly-bottom{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--win-border-in);flex-shrink:0}
.dly-on-btn{flex:1;padding:8px;border-radius:8px;border:1px solid var(--win-border);background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));color:var(--text-secondary);font-size:11px;cursor:pointer;font-family:inherit;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px}
.dly-on-btn.active{background:color-mix(in srgb,var(--color-active) 18%,transparent);border-color:var(--color-active);color:var(--color-active)}
.dly-tap{padding:8px 14px;border-radius:8px;border:1px solid var(--win-border);background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));color:var(--text-secondary);font-size:10px;cursor:pointer;font-family:inherit;transition:background .1s;flex-shrink:0}
.dly-tap:active{background:color-mix(in srgb,var(--text-primary) 16%,var(--surface))}
.dly-echo-bar{display:flex;gap:3px;padding:6px 14px;border-bottom:1px solid var(--win-border-in);flex-shrink:0}
.dly-echo-dot{width:8px;height:8px;border-radius:50%;background:var(--win-border-in);transition:background .1s,transform .1s}
.dly-echo-dot.lit{background:var(--color-active);transform:scale(1.2)}
`
  document.head.appendChild(s)
}

export function initDelay(body) {
  injectStyles()
  body.innerHTML = `
<div class="dly-body">
  <div class="dly-vis"><canvas id="dly-canvas"></canvas></div>
  <div class="dly-echo-bar" id="dly-echo-bar"></div>
  <div class="dly-ctrl">
    <div class="dly-row">
      <span class="dly-lbl">Délai</span>
      <input class="dly-slider" id="dly-time" type="range" min="10" max="1000" step="10" value="250">
      <span class="dly-val" id="dly-time-val">250ms</span>
    </div>
    <div class="dly-row">
      <span class="dly-lbl">Feedback</span>
      <input class="dly-slider" id="dly-fb" type="range" min="0" max="95" step="1" value="40">
      <span class="dly-val" id="dly-fb-val">40%</span>
    </div>
    <div class="dly-row">
      <span class="dly-lbl">Mix</span>
      <input class="dly-slider" id="dly-mix" type="range" min="0" max="100" step="1" value="50">
      <span class="dly-val" id="dly-mix-val">50%</span>
    </div>
    <div class="dly-row">
      <span class="dly-lbl">Amortissement</span>
      <input class="dly-slider" id="dly-damp" type="range" min="500" max="20000" step="100" value="8000">
      <span class="dly-val" id="dly-damp-val">8kHz</span>
    </div>
  </div>
  <div class="dly-bottom">
    <button class="dly-on-btn" id="dly-on"><i class="fa-solid fa-microphone"></i> Activer le micro</button>
    <button class="dly-tap" id="dly-tap" title="Tap tempo">TAP</button>
  </div>
</div>`

  const canvas = body.querySelector('#dly-canvas')
  const ctx2d  = canvas.getContext('2d')
  const onBtn  = body.querySelector('#dly-on')
  onBtn.after(makeInputSwitch('delay', ''))
  const tapBtn = body.querySelector('#dly-tap')
  const echoBar = body.querySelector('#dly-echo-bar')

  const timeSlider = body.querySelector('#dly-time')
  const fbSlider   = body.querySelector('#dly-fb')
  const mixSlider  = body.querySelector('#dly-mix')
  const dampSlider = body.querySelector('#dly-damp')
  const timeVal    = body.querySelector('#dly-time-val')
  const fbVal      = body.querySelector('#dly-fb-val')
  const mixVal     = body.querySelector('#dly-mix-val')
  const dampVal    = body.querySelector('#dly-damp-val')

  // ── Echo dots (visual feedback of echoes) ────────────────────────────────────
  const MAX_ECHOES = 8
  const echoDots = []
  for (let i = 0; i < MAX_ECHOES; i++) {
    const d = document.createElement('div'); d.className = 'dly-echo-dot'; echoBar.appendChild(d); echoDots.push(d)
  }

  function updateEchoDots(fb) {
    let level = 1
    for (let i = 0; i < MAX_ECHOES; i++) {
      echoDots[i].classList.toggle('lit', level > 0.05)
      level *= fb / 100
    }
  }

  // ── Audio ─────────────────────────────────────────────────────────────────────
  let audioCtx = null, sourceNode = null, analyser = null
  let delayNode = null, feedbackGain = null, dryGain = null, wetGain = null, dampFilter = null
  let rafId = null, isActive = false

  function applyParams() {
    if (!audioCtx) return
    const time  = parseFloat(timeSlider.value) / 1000
    const fb    = parseFloat(fbSlider.value)
    const mix   = parseFloat(mixSlider.value) / 100
    const damp  = parseFloat(dampSlider.value)
    const now   = audioCtx.currentTime
    delayNode.delayTime.setTargetAtTime(time, now, 0.01)
    feedbackGain.gain.setTargetAtTime(Math.min(0.95, fb / 100), now, 0.01)
    dryGain.gain.setTargetAtTime(1 - mix * 0.5, now, 0.01)
    wetGain.gain.setTargetAtTime(mix * 0.8, now, 0.01)
    dampFilter.frequency.setTargetAtTime(damp, now, 0.01)
    updateEchoDots(fb)
  }

  async function startAudio() {
    if (audioCtx) return
    try {
      const stream = await getMicStream('delay', { echoCancellation: false, noiseSuppression: false })
      audioCtx   = new AudioContext()
      routeContext(audioCtx)
      sourceNode = audioCtx.createMediaStreamSource(stream)
      analyser   = audioCtx.createAnalyser(); analyser.fftSize = 1024

      delayNode    = audioCtx.createDelay(2.0)
      feedbackGain = audioCtx.createGain()
      dryGain      = audioCtx.createGain()
      wetGain      = audioCtx.createGain()
      dampFilter   = audioCtx.createBiquadFilter(); dampFilter.type = 'lowpass'

      // Routing: src → analyser → dry → dest
      //          src → delay → feedback → delay (loop)
      //                delay → damp → wet → dest
      sourceNode.connect(analyser)
      sourceNode.connect(dryGain)
      sourceNode.connect(delayNode)
      delayNode.connect(feedbackGain)
      feedbackGain.connect(dampFilter)
      dampFilter.connect(delayNode)
      delayNode.connect(wetGain)
      dryGain.connect(audioCtx.destination)
      wetGain.connect(audioCtx.destination)

      applyParams()
      isActive = true
      onBtn.classList.add('active')
      onBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Actif'
      drawWaveform()
    } catch (e) {
      window.toast?.('Accès micro refusé', 'error')
    }
  }

  // ── Waveform draw ─────────────────────────────────────────────────────────────
  function drawWaveform() {
    if (!analyser) return
    rafId = requestAnimationFrame(drawWaveform)
    const W = canvas.parentElement.clientWidth, H = canvas.parentElement.clientHeight
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
    const buf = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(buf)
    ctx2d.clearRect(0, 0, W, H)
    ctx2d.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-active').trim() || '#b23fd6'
    ctx2d.lineWidth = 1.5; ctx2d.beginPath()
    const step = W / buf.length
    for (let i = 0; i < buf.length; i++) {
      const y = (buf[i] / 128 - 1) * (H / 2) + H / 2
      i === 0 ? ctx2d.moveTo(0, y) : ctx2d.lineTo(i * step, y)
    }
    ctx2d.stroke()
  }

  // ── Tap tempo ─────────────────────────────────────────────────────────────────
  let tapTimes = []
  tapBtn.addEventListener('click', () => {
    const now = Date.now()
    tapTimes = tapTimes.filter(t => now - t < 3000)
    tapTimes.push(now)
    if (tapTimes.length >= 2) {
      const intervals = []
      for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i-1])
      const avg = intervals.reduce((a,b)=>a+b,0)/intervals.length
      const ms = Math.max(10, Math.min(1000, Math.round(avg)))
      timeSlider.value = ms
      timeVal.textContent = ms + 'ms'
      applyParams()
    }
  })

  // ── Controls ──────────────────────────────────────────────────────────────────
  function fmtDamp(hz) { return hz >= 1000 ? (hz/1000).toFixed(1)+'kHz' : hz+'Hz' }

  timeSlider.addEventListener('input',  () => { timeVal.textContent  = timeSlider.value + 'ms'; applyParams() })
  fbSlider.addEventListener('input',    () => { fbVal.textContent    = fbSlider.value + '%';   applyParams() })
  mixSlider.addEventListener('input',   () => { mixVal.textContent   = mixSlider.value + '%';  applyParams() })
  dampSlider.addEventListener('input',  () => { dampVal.textContent  = fmtDamp(parseFloat(dampSlider.value)); applyParams() })

  onBtn.addEventListener('click', () => {
    if (!isActive) startAudio()
    else {
      if (audioCtx) { audioCtx.close(); audioCtx = null }
      if (rafId) { cancelAnimationFrame(rafId); rafId = null }
      isActive = false
      onBtn.classList.remove('active')
      onBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Activer le micro'
      ctx2d.clearRect(0, 0, canvas.width, canvas.height)
    }
  })

  updateEchoDots(parseFloat(fbSlider.value))

  // ── Teardown ──────────────────────────────────────────────────────────────────
  new MutationObserver((_, obs) => {
    if (!document.contains(body)) {
      if (audioCtx) audioCtx.close()
      if (rafId) cancelAnimationFrame(rafId)
      obs.disconnect()
    }
  }).observe(document.body, { childList: true, subtree: true })
}
