// tempo.js — Metronome + Delay Calculator for Iceample v2
import { getCtx } from './audio-bus.js'
import { matchesShortcut } from './shortcuts.js'
import { t } from './i18n.js'

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('tempo-styles')) return
  const s = document.createElement('style')
  s.id = 'tempo-styles'
  s.textContent = `
.tempo-wrap {
  display: flex; flex-direction: column; height: 100%; padding: 10px 12px;
  gap: 12px;
}
.tempo-section-hdr {
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: color-mix(in srgb, var(--text-primary) 25%, transparent);
  padding-bottom: 6px; border-bottom: 1px solid color-mix(in srgb, var(--text-primary) 6%, transparent);
}
/* BPM row (shared) */
.tempo-bpm-row {
  display: flex; align-items: center; gap: 8px;
}
.tempo-bpm-inp {
  width: 72px; background: var(--surface2); border: 1px solid var(--win-border);
  border-radius: 5px; color: var(--text-primary); font-size: 22px;
  font-family: inherit; font-weight: 700; text-align: center;
  padding: 4px 0; outline: none;
}
.tempo-bpm-inp:focus { border-color: var(--color-active); }
.tempo-tap-btn {
  flex: 1; height: 38px; background: var(--surface2); border: 1px solid var(--win-border);
  border-radius: 5px; color: var(--text-secondary); font-size: 11px;
  font-family: inherit; cursor: pointer; letter-spacing: 0.06em;
  transition: background 0.08s, border-color 0.08s, color 0.08s;
}
.tempo-tap-btn:active { background: color-mix(in srgb, var(--surface2), var(--text-primary) 10%); border-color: color-mix(in srgb, var(--win-border), var(--text-primary) 15%); color: var(--text-primary); }
/* Metronome */
.metro-controls {
  display: flex; align-items: center; gap: 8px;
}
.metro-play-btn {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--surface2); border: 1px solid var(--win-border);
  color: var(--text-secondary); font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.12s; flex-shrink: 0;
}
.metro-play-btn.playing {
  background: color-mix(in srgb, var(--color-active) 15%, var(--surface2));
  border-color: var(--color-active); color: var(--color-active);
}
.metro-sig-select {
  background: var(--surface2); border: 1px solid var(--win-border); border-radius: 4px;
  color: var(--text-primary); font-size: 11px; font-family: inherit;
  padding: 4px 6px; cursor: pointer;
}
.metro-vol-wrap {
  display: flex; align-items: center; gap: 6px; flex: 1;
}
.metro-vol-wrap span { font-size: 10px; color: var(--dim); }
.metro-vol {
  flex: 1; -webkit-appearance: none; appearance: none;
  height: 3px; background: var(--win-border); border-radius: 2px; outline: none; cursor: pointer;
}
.metro-vol::-webkit-slider-thumb {
  -webkit-appearance: none; width: 10px; height: 10px;
  border-radius: 50%; background: var(--slider-color); cursor: pointer;
}
/* Beat visualizer */
.metro-beats {
  display: flex; gap: 6px; align-items: center; height: 18px;
}
.metro-beat-dot {
  flex: 1; height: 8px; border-radius: 4px;
  background: var(--win-border); transition: background 0.05s;
}
.metro-beat-dot.on { background: var(--color-active); box-shadow: 0 0 6px var(--color-active); }
.metro-beat-dot.down { background: var(--text-primary); box-shadow: 0 0 8px color-mix(in srgb, var(--text-primary) 60%, transparent); }
`
  document.head.appendChild(s)
}

// ── Shared BPM state (persists while app is open) ─────────────────────────────
let _bpm = parseInt(localStorage.getItem('iceample:metro:bpm') || '120', 10)

// Subscribers notified whenever the BPM changes (e.g. to keep a VST arpeggiator
// in sync with the project tempo).
const _bpmCbs = new Set()
export function getBpm() { return _bpm }
export function onBpmChange(cb) { _bpmCbs.add(cb); return () => _bpmCbs.delete(cb) }
function _setBpm(v) {
  _bpm = Math.max(20, Math.min(300, Math.round(v)))
  localStorage.setItem('iceample:metro:bpm', _bpm)
  _bpmCbs.forEach(fn => { try { fn(_bpm) } catch {} })
}
/** Set the project tempo from anywhere (clamped, persisted, broadcast). */
export function setBpm(v) { _setBpm(v) }
let _timeSig = parseInt(localStorage.getItem('iceample:metro:timesig') || '4', 10)
let _vol = parseFloat(localStorage.getItem('iceample:metro:vol') || '0.5')
let _playing = false
let _beat = 0
let _nextBeat = 0
let _schedId = null

const _beatCbs = new Set()
const _metroCbs = new Set()
export function onMetroChange(cb) { _metroCbs.add(cb); return () => _metroCbs.delete(cb) }
function _notifyMetro() { _metroCbs.forEach(fn => { try { fn(_playing) } catch {} }) }
export function isMetroOn() { return _playing }
export function toggleMetronome() { _playing ? stopMetro() : startMetro(); return _playing }

function scheduleClick(time, isDown) {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.connect(g); g.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = isDown ? 1000 : 660
  g.gain.setValueAtTime(_vol * 0.5, time)
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045)
  osc.start(time); osc.stop(time + 0.05)
}

function _scheduler() {
  const ctx = getCtx()
  while (_nextBeat < ctx.currentTime + 0.1) {
    const beatInBar = _beat % _timeSig
    scheduleClick(_nextBeat, beatInBar === 0)
    const t = _nextBeat
    _beatCbs.forEach(fn => setTimeout(() => fn(beatInBar), Math.max(0, (t - ctx.currentTime) * 1000 - 10)))
    _nextBeat += 60 / _bpm
    _beat++
  }
}

function startMetro() {
  if (_playing) return
  const ctx = getCtx()
  _playing = true; _beat = 0
  _nextBeat = ctx.currentTime + 0.05
  _schedId = setInterval(_scheduler, 25)
  _notifyMetro()
}

function stopMetro() {
  _playing = false
  clearInterval(_schedId)
  _beatCbs.forEach(fn => fn(-1))
  _notifyMetro()
}

// ── Public init ───────────────────────────────────────────────────────────────
export function initTempo(body) {
  injectStyles()
  body.style.padding = '0'

  const wrap = document.createElement('div')
  wrap.className = 'tempo-wrap'
  body.appendChild(wrap)

  // ── Shared BPM + Tap ───────────────────────────────────────────────────────
  const bpmRow = document.createElement('div')
  bpmRow.className = 'tempo-bpm-row'

  const bpmInp = document.createElement('input')
  bpmInp.type = 'number'; bpmInp.className = 'tempo-bpm-inp'
  bpmInp.min = '20'; bpmInp.max = '300'; bpmInp.value = _bpm

  const tapBtn = document.createElement('button')
  tapBtn.className = 'tempo-tap-btn'
  tapBtn.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> TAP'

  bpmRow.appendChild(bpmInp); bpmRow.appendChild(tapBtn)
  wrap.appendChild(bpmRow)

  function setBpm(v) {
    _setBpm(v)            // updates state, persists, notifies subscribers
    bpmInp.value = _bpm
  }
  bpmInp.addEventListener('change', () => setBpm(parseFloat(bpmInp.value)))
  // Keep the field in sync when BPM is changed elsewhere (e.g. the corner box).
  const offBpmSync = onBpmChange(v => { if (document.activeElement !== bpmInp) bpmInp.value = v })

  // Tap tempo
  let tapTimes = []
  tapBtn.addEventListener('click', () => {
    const now = performance.now()
    tapTimes = tapTimes.filter(t => now - t < 3000)
    tapTimes.push(now)
    if (tapTimes.length >= 2) {
      const diffs = tapTimes.slice(1).map((t, i) => t - tapTimes[i])
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
      setBpm(60000 / avg)
    }
  })

  // ── Métronome ──────────────────────────────────────────────────────────────
  const metroHdr = document.createElement('div')
  metroHdr.className = 'tempo-section-hdr'
  metroHdr.textContent = t('metro_section')
  wrap.appendChild(metroHdr)

  // Beat dots
  const beatsWrap = document.createElement('div')
  beatsWrap.className = 'metro-beats'
  const dots = []
  function rebuildDots() {
    beatsWrap.innerHTML = ''
    dots.length = 0
    for (let i = 0; i < _timeSig; i++) {
      const d = document.createElement('div')
      d.className = 'metro-beat-dot'
      dots.push(d); beatsWrap.appendChild(d)
    }
  }
  rebuildDots()
  wrap.appendChild(beatsWrap)

  // Beat callback
  _beatCbs.add(beatInBar => {
    dots.forEach((d, i) => {
      d.classList.remove('on', 'down')
      if (beatInBar === -1) return
      if (i === beatInBar) d.classList.add(beatInBar === 0 ? 'down' : 'on')
    })
  })

  // Controls row
  const controls = document.createElement('div')
  controls.className = 'metro-controls'

  const playBtn = document.createElement('button')
  playBtn.className = 'metro-play-btn' + (_playing ? ' playing' : '')
  playBtn.innerHTML = _playing ? '<i class="fa-solid fa-stop"></i>' : '<i class="fa-solid fa-play"></i>'

  const sigSel = document.createElement('select')
  sigSel.className = 'metro-sig-select'
  ;[2,3,4,5,6,7,8].forEach(n => {
    const opt = document.createElement('option')
    opt.value = n; opt.textContent = `${n}/4`
    if (n === _timeSig) opt.selected = true
    sigSel.appendChild(opt)
  })
  sigSel.addEventListener('change', () => {
    _timeSig = parseInt(sigSel.value, 10)
    localStorage.setItem('iceample:metro:timesig', _timeSig)
    rebuildDots()
  })

  const volWrap = document.createElement('div')
  volWrap.className = 'metro-vol-wrap'
  volWrap.innerHTML = '<span><i class="fa-solid fa-volume-low"></i></span>'
  const volRange = document.createElement('input')
  volRange.type = 'range'; volRange.className = 'metro-vol'
  volRange.min = '0'; volRange.max = '1'; volRange.step = '0.05'; volRange.value = _vol
  volRange.addEventListener('input', () => {
    _vol = parseFloat(volRange.value)
    localStorage.setItem('iceample:metro:vol', _vol)
  })
  volWrap.appendChild(volRange)

  function setMetro(on) {
    if (on && !_playing) startMetro()
    else if (!on && _playing) stopMetro()
  }
  // Reflect the shared metronome state (also driven by the global shortcut).
  const offMetroSync = onMetroChange(on => {
    playBtn.classList.toggle('playing', on)
    playBtn.innerHTML = on ? '<i class="fa-solid fa-stop"></i>' : '<i class="fa-solid fa-play"></i>'
  })
  playBtn.addEventListener('click', () => setMetro(!_playing))

  // Global transport sync — the metronome follows the master Play/Stop.
  function onTransport(e) { setMetro(e.detail.action === 'play') }
  window.addEventListener('iceample-transport', onTransport)

  controls.appendChild(playBtn); controls.appendChild(sigSel); controls.appendChild(volWrap)
  wrap.appendChild(controls)

  // Cleanup on window close
  // Tap tempo via keyboard shortcut (only when this metro window is alive)
  function onMetroKey(e) {
    if (e.target.tagName === 'INPUT') return
    if (matchesShortcut('metro-tap', e)) { e.preventDefault(); tapBtn.click() }
  }
  document.addEventListener('keydown', onMetroKey)

  const obs = new MutationObserver(() => {
    if (!document.contains(body)) {
      stopMetro()
      _beatCbs.clear()
      offMetroSync()
      document.removeEventListener('keydown', onMetroKey)
      window.removeEventListener('iceample-transport', onTransport)
      offBpmSync()
      obs.disconnect()
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
