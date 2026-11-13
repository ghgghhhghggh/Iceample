// ── Web Audio synth voices ───────────────────────────────────────────────────
import { getCtx, getTrackNode } from './audio-bus.js'
import { t } from './i18n.js'
import { registerTool } from './project.js'
import { matchesShortcut } from './shortcuts.js'
import { registerCommands, unregisterCommandsBy } from './commands.js'

let _ctx = null
let _dest = null  // overridden to OfflineAudioContext.destination during bounce

function ctx() {
  if (!_ctx) _ctx = getCtx()
  try { if (_ctx.state === 'suspended') _ctx.resume() } catch(e) {}
  return _ctx
}

function getDest() {
  return _dest ?? getTrackNode('seq')
}

// ── WAV encoder ───────────────────────────────────────────────────────────────
function encodeWAV(audioBuffer) {
  const numCh = audioBuffer.numberOfChannels
  const sr    = audioBuffer.sampleRate
  const len   = audioBuffer.length
  const left  = audioBuffer.getChannelData(0)
  const right = numCh > 1 ? audioBuffer.getChannelData(1) : left

  const pcm = new Int16Array(len * 2)
  for (let i = 0; i < len; i++) {
    pcm[i * 2]     = Math.max(-32768, Math.min(32767, left[i]  * 32767 | 0))
    pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, right[i] * 32767 | 0))
  }

  const buf  = new ArrayBuffer(44 + pcm.byteLength)
  const view = new DataView(buf)
  const str  = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  str(0,  'RIFF'); view.setUint32(4,  36 + pcm.byteLength, true)
  str(8,  'WAVE'); str(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 2, true);  view.setUint32(24, sr, true)
  view.setUint32(28, sr * 4, true); view.setUint16(32, 4, true)
  view.setUint16(34, 16, true); str(36, 'data')
  view.setUint32(40, pcm.byteLength, true)
  new Int16Array(buf, 44).set(pcm)
  return buf
}

function bufToBase64(ab) {
  const bytes = new Uint8Array(ab)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 8192)
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(bin)
}

function playKick(t) {
  const c = ctx()
  const osc = c.createOscillator(), g = c.createGain()
  osc.connect(g); g.connect(getDest())
  osc.frequency.setValueAtTime(160, t)
  osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.45)
  g.gain.setValueAtTime(1.2, t)
  g.gain.exponentialRampToValueAtTime(0.01, t + 0.45)
  osc.start(t); osc.stop(t + 0.45)
}

function noise(c, dur) {
  const n = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, n, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function playSnare(t) {
  const c = ctx()
  const src = c.createBufferSource(); src.buffer = noise(c, 0.22)
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900
  const g = c.createGain()
  g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.22)
  src.connect(hp); hp.connect(g); g.connect(getDest())
  src.start(t); src.stop(t + 0.22)
  const osc = c.createOscillator(), g2 = c.createGain()
  osc.frequency.value = 185
  g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.01, t + 0.1)
  osc.connect(g2); g2.connect(getDest()); osc.start(t); osc.stop(t + 0.1)
}

function playHihat(t, open = false) {
  const c = ctx(), dur = open ? 0.35 : 0.07
  const src = c.createBufferSource(); src.buffer = noise(c, dur)
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000
  const g = c.createGain()
  g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.01, t + dur)
  src.connect(hp); hp.connect(g); g.connect(getDest())
  src.start(t); src.stop(t + dur)
}

function playClap(t) {
  const c = ctx()
  for (let i = 0; i < 3; i++) {
    const ti = t + i * 0.012
    const src = c.createBufferSource(); src.buffer = noise(c, 0.12)
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.6
    const g = c.createGain()
    g.gain.setValueAtTime(0.55, ti); g.gain.exponentialRampToValueAtTime(0.01, ti + 0.12)
    src.connect(bp); bp.connect(g); g.connect(getDest())
    src.start(ti); src.stop(ti + 0.12)
  }
}

// ── Synth builder — crée une fonction play depuis les paramètres utilisateur ──
function buildSynthPlay({ wave, freq, attack, decay, sustain, release, volume }) {
  return function play(t) {
    const c = ctx()
    const g = c.createGain()
    g.connect(getDest())
    const dur = attack + decay + release + 0.05

    if (wave === 'noise') {
      const src = c.createBufferSource()
      src.buffer = noise(c, Math.max(0.05, attack + decay + release))
      src.connect(g)
      src.start(t); src.stop(t + dur)
    } else {
      const osc = c.createOscillator()
      osc.type = wave; osc.frequency.value = freq
      osc.connect(g); osc.start(t); osc.stop(t + dur)
    }

    // ADSR
    const v = volume
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(v, t + attack)
    g.gain.linearRampToValueAtTime(v * sustain, t + attack + decay)
    g.gain.setValueAtTime(v * sustain, t + attack + decay)
    g.gain.linearRampToValueAtTime(0.0001, t + attack + decay + release)
  }
}

// ── Row colors palette ───────────────────────────────────────────────────────
const PALETTE = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f43','#00d2d3','#ff6b9d']
let _paletteIdx = 0
function nextColor() { return PALETTE[_paletteIdx++ % PALETTE.length] }

// ── Default rows ─────────────────────────────────────────────────────────────
const DEFAULT_ROWS = [
  { id: 'kick',  name: 'Kick',   color: '#ff6b6b', play: t => playKick(t) },
  { id: 'snare', name: 'Snare',  color: '#ffd93d', play: t => playSnare(t) },
  { id: 'hihat', name: 'Hi-hat', color: '#6bcb77', play: t => playHihat(t) },
  { id: 'clap',  name: 'Clap',   color: '#4d96ff', play: t => playClap(t) },
]

// ── Init ─────────────────────────────────────────────────────────────────────
let _bounceIntoView = null
export function setBounceUtil(fn) { _bounceIntoView = fn }

let _spawn = null
export function setSpawnUtil(fn) { _spawn = fn }

function openSynthWindow(addRow) {
  if (!_spawn) return
  _spawn(t('seq_new_synth'), 'fa-solid fa-wave-square', 340, 330, winBody => {
    winBody.style.cssText = 'padding:0;overflow-y:auto'
    winBody.innerHTML = `
      <div class="seq-synth-body">
        <div class="seq-synth-row">
          <label class="seq-synth-label">${t('seq_synth_name')}</label>
          <input class="seq-synth-input" id="sw-name" type="text" value="Synth" maxlength="14" />
        </div>
        <div class="seq-synth-row">
          <label class="seq-synth-label">${t('seq_synth_shape')}</label>
          <div class="seq-wave-group" id="sw-wave">
            <button class="seq-wave-btn active" data-wave="sine">Sine</button>
            <button class="seq-wave-btn" data-wave="square">Square</button>
            <button class="seq-wave-btn" data-wave="sawtooth">Saw</button>
            <button class="seq-wave-btn" data-wave="triangle">Triangle</button>
            <button class="seq-wave-btn" data-wave="noise">Noise</button>
          </div>
        </div>
        <div class="seq-synth-row" id="sw-freq-row">
          <label class="seq-synth-label">${t('seq_synth_freq')}</label>
          <input class="seq-synth-range" id="sw-freq" type="range" min="20" max="2000" value="440" />
          <span class="seq-synth-val" id="sw-freq-val">440 Hz</span>
        </div>
        <div class="seq-synth-row">
          <label class="seq-synth-label">Attack</label>
          <input class="seq-synth-range" id="sw-atk" type="range" min="0.001" max="2" step="0.001" value="0.005" />
          <span class="seq-synth-val" id="sw-atk-val">0.01 s</span>
        </div>
        <div class="seq-synth-row">
          <label class="seq-synth-label">Decay</label>
          <input class="seq-synth-range" id="sw-dec" type="range" min="0.001" max="2" step="0.001" value="0.1" />
          <span class="seq-synth-val" id="sw-dec-val">0.10 s</span>
        </div>
        <div class="seq-synth-row">
          <label class="seq-synth-label">Sustain</label>
          <input class="seq-synth-range" id="sw-sus" type="range" min="0" max="1" step="0.01" value="0.3" />
          <span class="seq-synth-val" id="sw-sus-val">0.30</span>
        </div>
        <div class="seq-synth-row">
          <label class="seq-synth-label">Release</label>
          <input class="seq-synth-range" id="sw-rel" type="range" min="0.001" max="4" step="0.001" value="0.3" />
          <span class="seq-synth-val" id="sw-rel-val">0.30 s</span>
        </div>
        <div class="seq-synth-row">
          <label class="seq-synth-label">${t('seq_synth_volume')}</label>
          <input class="seq-synth-range" id="sw-vol" type="range" min="0.01" max="1" step="0.01" value="0.7" />
          <span class="seq-synth-val" id="sw-vol-val">70%</span>
        </div>
        <div class="seq-synth-actions">
          <button class="seq-btn" id="sw-preview" title="${t('seq_synth_preview_title')}"><i class="fa-solid fa-play"></i></button>
          <button class="seq-synth-add" id="sw-confirm"><i class="fa-solid fa-plus"></i> ${t('seq_synth_add')}</button>
        </div>
      </div>
    `

    function getParams() {
      const wave = winBody.querySelector('.seq-wave-btn.active')?.dataset.wave || 'sine'
      return {
        wave,
        freq:    parseFloat(winBody.querySelector('#sw-freq').value),
        attack:  parseFloat(winBody.querySelector('#sw-atk').value),
        decay:   parseFloat(winBody.querySelector('#sw-dec').value),
        sustain: parseFloat(winBody.querySelector('#sw-sus').value),
        release: parseFloat(winBody.querySelector('#sw-rel').value),
        volume:  parseFloat(winBody.querySelector('#sw-vol').value),
      }
    }

    winBody.querySelectorAll('.seq-wave-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        winBody.querySelectorAll('.seq-wave-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        winBody.querySelector('#sw-freq-row').style.display = btn.dataset.wave === 'noise' ? 'none' : ''
      })
    })

    const rangeMap = [
      ['#sw-freq', '#sw-freq-val', v => `${Math.round(v)} Hz`],
      ['#sw-atk',  '#sw-atk-val',  v => `${(+v).toFixed(2)} s`],
      ['#sw-dec',  '#sw-dec-val',  v => `${(+v).toFixed(2)} s`],
      ['#sw-sus',  '#sw-sus-val',  v => `${(+v).toFixed(2)}`],
      ['#sw-rel',  '#sw-rel-val',  v => `${(+v).toFixed(2)} s`],
      ['#sw-vol',  '#sw-vol-val',  v => `${Math.round(v * 100)}%`],
    ]
    rangeMap.forEach(([inp, disp, fmt]) => {
      const el = winBody.querySelector(inp), dsp = winBody.querySelector(disp)
      el.addEventListener('input', () => { dsp.textContent = fmt(el.value) })
    })

    winBody.querySelector('#sw-preview').addEventListener('click', () => {
      buildSynthPlay(getParams())(ctx().currentTime + 0.05)
    })

    winBody.querySelector('#sw-confirm').addEventListener('click', () => {
      const params = getParams()
      const name = winBody.querySelector('#sw-name').value.trim() || 'Synth'
      addRow({ id: 'synth_' + Date.now(), name, color: nextColor(), play: buildSynthPlay(params) })
      winBody.closest('.tool-win')?.querySelector('.tool-win-close')?.click()
    })
  })
}

export function initSequencer(body) {
  let steps    = 16
  let bpm      = 120
  let playing  = false
  let schedStep   = 0
  let nextNote    = 0
  let timerId     = null
  const LOOKAHEAD = 25    // ms
  const AHEAD     = 0.1   // seconds

  const rows = DEFAULT_ROWS.map(r => ({ ...r, pattern: new Array(32).fill(false) }))

  // ── DOM ────────────────────────────────────────────────────────────────────
  body.innerHTML = ''
  body.style.cssText = 'padding:0;display:flex;flex-direction:column;overflow:hidden;gap:0;position:relative'

  body.innerHTML = `
    <div class="seq-controls">
      <button class="seq-btn seq-play-btn" id="seq-play" title="Play / Pause">
        <i class="fa-solid fa-play"></i>
      </button>
      <button class="seq-btn" id="seq-stop" title="Stop">
        <i class="fa-solid fa-stop"></i>
      </button>
      <div class="seq-sep"></div>
      <span class="seq-label">${t('seq_bpm_label')}</span>
      <input class="seq-bpm" id="seq-bpm" type="number" min="40" max="300" value="120" />
      <div class="seq-sep"></div>
      <span class="seq-label">${t('seq_steps_label')}</span>
      <select class="seq-select" id="seq-steps">
        <option value="8">8</option>
        <option value="16" selected>16</option>
        <option value="32">32</option>
      </select>
      <div class="seq-sep"></div>
      <button class="seq-btn" id="seq-clear" title="${t('seq_clear_title')}">
        <i class="fa-solid fa-trash-can"></i>
      </button>
      <div class="seq-sep"></div>
      <input class="seq-save-input" id="seq-save-name" type="text" placeholder="${t('seq_name_placeholder')}" maxlength="40" title="${t('seq_name_placeholder')}" />
      <button class="seq-btn" id="seq-save" title="${t('seq_save_title')}">
        <i class="fa-solid fa-floppy-disk"></i>
      </button>
    </div>
    <div class="seq-grid" id="seq-grid"></div>
    <div class="seq-add-bar">
      <button class="seq-add-btn" id="seq-add">
        <i class="fa-solid fa-plus"></i> ${t('seq_add_track')}
      </button>
    </div>

    <!-- picker type -->
    <div class="seq-add-picker hidden" id="seq-add-picker">
      <div class="seq-picker-section">
        <button class="seq-picker-item" id="seq-pick-synth">
          <i class="fa-solid fa-wave-square"></i>${t('seq_add_synth')}
        </button>
        <button class="seq-picker-item" id="seq-pick-sample">
          <i class="fa-solid fa-folder-open"></i>${t('seq_add_sample')}
        </button>
      </div>
    </div>

    <!-- lib picker (choisir sample depuis librairie) -->
    <div class="seq-lib-picker hidden" id="seq-lib-picker">
      <div class="seq-lib-picker-header">
        <button class="seq-btn seq-lib-back hidden" id="seq-lib-back"><i class="fa-solid fa-arrow-left"></i></button>
        <span class="seq-picker-title" id="seq-lib-title"><i class="fa-solid fa-folder"></i> ${t('seq_choose_folder')}</span>
      </div>
      <div id="seq-lib-items"></div>
      <div class="seq-lib-native-row">
        <button class="seq-picker-item" id="seq-lib-native">
          <i class="fa-solid fa-computer"></i>${t('seq_from_computer')}
        </button>
      </div>
    </div>

  `

  const grid      = body.querySelector('#seq-grid')
  const btnPlay   = body.querySelector('#seq-play')
  const btnStop   = body.querySelector('#seq-stop')
  const inpBpm    = body.querySelector('#seq-bpm')
  const selStep   = body.querySelector('#seq-steps')
  const btnClear  = body.querySelector('#seq-clear')
  const btnAdd    = body.querySelector('#seq-add')
  const btnSave   = body.querySelector('#seq-save')
  const picker    = body.querySelector('#seq-add-picker')
  const libPicker = body.querySelector('#seq-lib-picker')

  // ── Grid builder ──────────────────────────────────────────────────────────
  function buildGrid() {
    grid.innerHTML = ''
    rows.forEach((row, ri) => {
      const rowEl = document.createElement('div')
      rowEl.className = 'seq-row'
      rowEl.innerHTML = `<div class="seq-row-label">${row.name}</div>`

      const cells = document.createElement('div')
      cells.className = 'seq-cells'

      for (let s = 0; s < steps; s++) {
        const cell = document.createElement('button')
        cell.className = 'seq-cell' + (row.pattern[s] ? ' on' : '')
        cell.dataset.row  = ri
        cell.dataset.step = s
        if (s > 0 && s % 4 === 0) cell.classList.add('group-start')
        cell.addEventListener('click', () => {
          row.pattern[s] = !row.pattern[s]
          cell.classList.toggle('on', row.pattern[s])
        })
        cells.appendChild(cell)
      }

      rowEl.appendChild(cells)
      grid.appendChild(rowEl)
    })
  }

  buildGrid()

  // ── Step highlight ────────────────────────────────────────────────────────
  function markStep(step) {
    grid.querySelectorAll('.seq-cell').forEach(c => {
      const s = +c.dataset.step
      c.classList.toggle('current', s === step)
    })
  }

  // ── Scheduler ─────────────────────────────────────────────────────────────
  function schedule() {
    const c = ctx()
    while (nextNote < c.currentTime + AHEAD) {
      const beat = schedStep
      rows.forEach(row => { if (row.pattern[beat]) row.play(nextNote) })

      const delay = (nextNote - c.currentTime) * 1000
      setTimeout(() => { if (playing) markStep(beat) }, Math.max(0, delay))

      const spb  = 60 / bpm
      const sps  = spb / 4   // 16th note
      nextNote  += sps
      schedStep  = (schedStep + 1) % steps
    }
  }

  function start() {
    if (playing) return
    const c = ctx()
    playing   = true
    schedStep = 0
    nextNote  = c.currentTime + 0.05
    timerId   = setInterval(schedule, LOOKAHEAD)
    btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>'
    btnPlay.classList.add('active')
  }

  function stop() {
    playing = false
    clearInterval(timerId)
    markStep(-1)
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
    btnPlay.classList.remove('active')
  }

  // ── Charger une séquence .iceseq ─────────────────────────────────────────
  async function loadSequence(filePath) {
    try {
      const { invoke } = window.__TAURI__.core
      const json = await invoke('read_text_file', { path: filePath })
      const data = JSON.parse(json)

      stop()
      if (data.bpm)   { bpm = data.bpm;   inpBpm.value = bpm }
      if (data.steps) {
        steps = data.steps
        selStep.value = String(steps)
      }

      rows.length = 0
      ;(data.rows || []).forEach(r => {
        const def = DEFAULT_ROWS.find(d => d.name.toLowerCase() === r.name.toLowerCase())
        rows.push({
          id:      def ? def.id : 'loaded_' + Date.now(),
          name:    r.name,
          color:   def ? def.color : nextColor(),
          play:    def ? def.play : () => {},
          pattern: [...(r.pattern || []), ...new Array(32).fill(false)].slice(0, 32),
        })
      })

      buildGrid()
    } catch (e) {
      console.error('loadSequence error:', e)
    }
  }

  // Drop .iceseq sur le séquenceur
  body.addEventListener('iceample-drop', async e => {
    const { file } = e.detail
    if (!file || !file.path.endsWith('.iceseq') || !window.__TAURI__) return
    await loadSequence(file.path)
  })

  btnPlay.addEventListener('click', () => playing ? stop() : start())
  btnStop.addEventListener('click', stop)

  // Global transport sync.
  function onTransport(e) {
    if (e.detail.action === 'play') { if (!playing) start() }
    else stop()
  }
  window.addEventListener('iceample-transport', onTransport)

  inpBpm.addEventListener('input', e => {
    bpm = Math.min(300, Math.max(40, parseInt(e.target.value) || 120))
  })

  selStep.addEventListener('change', e => {
    steps = parseInt(e.target.value)
    stop()
    buildGrid()
  })

  btnClear.addEventListener('click', () => {
    rows.forEach(r => r.pattern.fill(false))
    buildGrid()
  })

  // Rotate every row's pattern within the active step window (dir +1 right, -1 left).
  function shiftPattern(dir) {
    rows.forEach(r => {
      const seg = r.pattern.slice(0, steps)
      const rot = dir > 0
        ? [seg[seg.length - 1], ...seg.slice(0, -1)]
        : [...seg.slice(1), seg[0]]
      for (let i = 0; i < steps; i++) r.pattern[i] = rot[i]
    })
    buildGrid()
  }

  // Keyboard shortcuts — only when the sequencer is focused/hovered.
  function onSeqKey(e) {
    const a = document.activeElement
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    if (!body.contains(a) && !body.matches(':hover')) return
    if (matchesShortcut('seq-clear', e))       { e.preventDefault(); btnClear.click(); return }
    if (matchesShortcut('seq-shift-left', e))  { e.preventDefault(); shiftPattern(-1); return }
    if (matchesShortcut('seq-shift-right', e)) { e.preventDefault(); shiftPattern(1) }
  }
  document.addEventListener('keydown', onSeqKey)

  // Expose the sequencer's actions to the command palette while it's open.
  registerCommands([
    { id: 'seq:clear',       titleKey: 'sc_seq_clear',      icon: 'fa-solid fa-trash-can',   category: 'tool_seq', shortcutAction: 'seq-clear',       run: () => btnClear.click() },
    { id: 'seq:shift-left',  titleKey: 'sc_seq_shift_left', icon: 'fa-solid fa-arrow-left',  category: 'tool_seq', shortcutAction: 'seq-shift-left',  run: () => shiftPattern(-1) },
    { id: 'seq:shift-right', titleKey: 'sc_seq_shift_right',icon: 'fa-solid fa-arrow-right', category: 'tool_seq', shortcutAction: 'seq-shift-right', run: () => shiftPattern(1) },
  ])
  new MutationObserver((_, obs) => {
    if (!document.contains(body)) {
      document.removeEventListener('keydown', onSeqKey)
      unregisterCommandsBy(c => c.id.startsWith('seq:'))
      obs.disconnect()
    }
  }).observe(document.body, { childList: true, subtree: true })

  // ── Add row ────────────────────────────────────────────────────────────────
  function addRow(row) {
    rows.push({ ...row, pattern: new Array(32).fill(false) })
    buildGrid()
  }

  btnAdd.addEventListener('click', e => {
    e.stopPropagation()
    picker.classList.toggle('hidden')
  })

  // Ouvrir éditeur synthèse dans une fenêtre flottante séparée
  body.querySelector('#seq-pick-synth').addEventListener('click', () => {
    picker.classList.add('hidden')
    openSynthWindow(addRow)
  })

  // ── Sample depuis librairie ───────────────────────────────────────────────
  const LIB_CATEGORIES = ['Importés', 'Modifiés', 'Sons', 'Voix', 'Séquences']
  const libItems    = body.querySelector('#seq-lib-items')
  const libTitle    = body.querySelector('#seq-lib-title')
  const libBackBtn  = body.querySelector('#seq-lib-back')
  let libCurrentFolder = null

  function openLibraryPicker() {
    picker.classList.add('hidden')
    libCurrentFolder = null
    showLibFolders()
    libPicker.classList.remove('hidden')
  }

  function showLibFolders() {
    libBackBtn.classList.add('hidden')
    libTitle.innerHTML = `<i class="fa-solid fa-folder"></i> ${t('seq_choose_folder')}`
    libItems.innerHTML = ''
    LIB_CATEGORIES.forEach(name => {
      const btn = document.createElement('button')
      btn.className = 'seq-picker-item'
      btn.innerHTML = `<i class="fa-solid fa-folder"></i>${name}`
      btn.addEventListener('click', () => showLibFiles(name))
      libItems.appendChild(btn)
    })
  }

  async function showLibFiles(folderName) {
    libCurrentFolder = folderName
    libBackBtn.classList.remove('hidden')
    libTitle.innerHTML = `<i class="fa-solid fa-folder-open"></i> ${folderName}`
    libItems.innerHTML = '<div class="seq-lib-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>'

    const root = localStorage.getItem('library:root')
    if (!root || !window.__TAURI__) {
      libItems.innerHTML = `<div class="seq-lib-empty">${t('seq_lib_not_configured')}</div>`
      return
    }
    const sep = root.includes('\\') ? '\\' : '/'
    const { invoke } = window.__TAURI__.core
    const files = await invoke('list_folder_contents', { path: root + sep + folderName })
    libItems.innerHTML = ''
    if (files.length === 0) {
      libItems.innerHTML = `<div class="seq-lib-empty">${t('seq_folder_empty')}</div>`
      return
    }
    files.forEach(f => {
      const btn = document.createElement('button')
      btn.className = 'seq-picker-item'
      btn.innerHTML = `<i class="fa-solid fa-music"></i>${f.name}`
      btn.addEventListener('click', () => loadSampleFromLib(f))
    libItems.appendChild(btn)
    })
  }

  async function loadSampleFromLib(file) {
    libPicker.classList.add('hidden')
    if (!window.__TAURI__) return
    const { invoke } = window.__TAURI__.core
    try {
      const b64 = await invoke('read_file_base64', { path: file.path })
      const binary = atob(b64)
      const ab = new ArrayBuffer(binary.length)
      const view = new Uint8Array(ab)
      for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 14)
      let cachedBuf = null
      ctx().decodeAudioData(ab).then(b => { cachedBuf = b })
      addRow({
        id: 'sample_' + Date.now(), name, color: nextColor(),
        play: t => {
          if (!cachedBuf) return
          const c = ctx(), src = c.createBufferSource()
          src.buffer = cachedBuf
          const g = c.createGain(); g.gain.value = 0.85
          src.connect(g); g.connect(getDest()); src.start(t)
        }
      })
    } catch (e) { console.error('Erreur chargement sample:', e) }
  }

  libBackBtn.addEventListener('click', showLibFolders)

  body.querySelector('#seq-lib-native').addEventListener('click', () => {
    libPicker.classList.add('hidden')
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'audio/*'
    input.addEventListener('change', () => {
      const file = input.files[0]; if (!file) return
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 14)
      const url  = URL.createObjectURL(file)
      let cachedBuf = null
      fetch(url).then(r => r.arrayBuffer()).then(ab => ctx().decodeAudioData(ab)).then(b => { cachedBuf = b })
      addRow({
        id: 'sample_' + Date.now(), name, color: nextColor(),
        play: t => {
          if (!cachedBuf) return
          const c = ctx(), src = c.createBufferSource()
          src.buffer = cachedBuf
          const g = c.createGain(); g.gain.value = 0.85
          src.connect(g); g.connect(getDest()); src.start(t)
        }
      })
    })
    input.click()
  })

  body.querySelector('#seq-pick-sample').addEventListener('click', openLibraryPicker)

  // ── Sauvegarder la séquence ───────────────────────────────────────────────
  const saveNameInp = body.querySelector('#seq-save-name')

  async function doSave() {
    const name = saveNameInp.value.trim() || t('seq_default_name')
    const root = localStorage.getItem('library:root')
    if (!root || !window.__TAURI__) {
      btnSave.style.color = '#ff5f5f'
      setTimeout(() => { btnSave.style.color = '' }, 1500)
      return
    }

    btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'

    try {
      const sep = root.includes('\\') ? '\\' : '/'
      const { invoke } = window.__TAURI__.core

      // ── 1. Sauvegarder le fichier .iceseq (JSON) dans Séquences ──
      const seqData = JSON.stringify({
        bpm,
        steps,
        rows: rows.map(r => ({ name: r.name, pattern: r.pattern.slice(0, steps) }))
      })
      await invoke('save_text_file', {
        path: root + sep + 'Séquences' + sep + name + '.iceseq',
        content: seqData
      })

      // ── 2. Bounce WAV dans Séquences Audio ──────────────────────
      const spb      = 60 / bpm
      const sps      = spb / 4
      const duration = steps * sps + 2
      const sr       = 44100
      const offCtx   = new OfflineAudioContext(2, Math.ceil(sr * duration), sr)
      const saved    = _ctx
      _ctx = offCtx
      _dest = offCtx.destination
      for (let s = 0; s < steps; s++) {
        rows.forEach(row => { if (row.pattern[s]) row.play(s * sps) })
      }
      const rendered = await offCtx.startRendering()
      _ctx = saved
      _dest = null

      const wav    = encodeWAV(rendered)
      const base64 = bufToBase64(wav)
      await invoke('save_binary_file', {
        path: root + sep + 'Séquences Audio' + sep + name + '.wav',
        base64
      })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Séquences Audio' } }))

      btnSave.innerHTML = '<i class="fa-solid fa-check"></i>'
      btnSave.style.color = 'var(--color-active)'
      setTimeout(() => { btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>'; btnSave.style.color = '' }, 1500)
    } catch (err) {
      console.error('[SAVE]', err)
      btnSave.innerHTML = '<i class="fa-solid fa-xmark"></i>'
      btnSave.style.color = '#ff5f5f'
      setTimeout(() => { btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>'; btnSave.style.color = '' }, 1500)
    }
  }

  btnSave.addEventListener('click', doSave)
  saveNameInp.addEventListener('keydown', e => { if (e.key === 'Enter') doSave() })

  document.addEventListener('click', e => {
    if (!e.target.closest('#seq-add') && !e.target.closest('#seq-add-picker'))
      picker.classList.add('hidden')
    if (!e.target.closest('#seq-lib-picker') && !e.target.closest('#seq-pick-sample'))
      libPicker.classList.add('hidden')
  })

  // Cleanup on window close
  const obs = new MutationObserver(() => {
    if (!document.contains(body)) { stop(); window.removeEventListener('iceample-transport', onTransport); obs.disconnect() }
  })
  obs.observe(document.body, { childList: true, subtree: true })

  // ── Project registry ───────────────────────────────────────────────────────
  registerTool('seq', {
    el: body,
    getState: () => ({
      bpm,
      steps,
      rows: rows.map(r => ({
        id:      r.id,
        name:    r.name,
        color:   r.color,
        pattern: r.pattern.slice(0, steps),
      })),
    }),
    setState: (state) => {
      if (!state) return
      stop()
      if (state.bpm)   { bpm = state.bpm;   inpBpm.value = bpm }
      if (state.steps) { steps = state.steps; selStep.value = String(steps) }
      if (Array.isArray(state.rows)) {
        rows.length = 0
        state.rows.forEach(r => {
          const def = DEFAULT_ROWS.find(d => d.id === r.id || d.name.toLowerCase() === r.name?.toLowerCase())
          rows.push({
            id:      r.id || ('row_' + Date.now()),
            name:    r.name || 'Row',
            color:   r.color || nextColor(),
            play:    def ? def.play : () => {},
            pattern: [...(r.pattern || []), ...new Array(32).fill(false)].slice(0, 32),
          })
        })
        buildGrid()
      }
    },
  })
}
