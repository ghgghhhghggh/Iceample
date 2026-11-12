// piano.js — Virtual piano / sampler for Iceample v2
import { getCtx, getTrackNode } from './audio-bus.js'
import { matchesShortcut } from './shortcuts.js'
import { t } from './i18n.js'
import { getBpm, onBpmChange } from './tempo.js'
import { promptName } from './rename-dialog.js'

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const WHITE  = [0,2,4,5,7,9,11]
const BLACK  = [1,3,-1,6,8,10,-1]

// Single global listener for MIDI a VST emits back (arpeggiators etc.); it
// dispatches to the most recently opened piano so we never stack listeners.
let activePianoMidiHandler = null
let vstMidiListenerReady   = false

function noteFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12) }

function noteName(midi) { return NOTES[midi % 12] + Math.floor(midi / 12 - 1) }

function encodeWAV(decoded) {
  const numCh = 2, sr = decoded.sampleRate
  const left  = decoded.getChannelData(0)
  const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left
  const len   = left.length
  const buf   = new ArrayBuffer(44 + len * 4)
  const v     = new DataView(buf)
  const s = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)) }
  s(0,'RIFF'); v.setUint32(4, 36 + len * 4, true); s(8,'WAVE')
  s(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,numCh,true)
  v.setUint32(24,sr,true); v.setUint32(28,sr*numCh*2,true); v.setUint16(32,numCh*2,true); v.setUint16(34,16,true)
  s(36,'data'); v.setUint32(40, len * 4, true)
  let off = 44
  for (let i = 0; i < len; i++) {
    v.setInt16(off, Math.max(-1,Math.min(1,left[i]))  * 0x7fff, true); off += 2
    v.setInt16(off, Math.max(-1,Math.min(1,right[i])) * 0x7fff, true); off += 2
  }
  return new Uint8Array(buf)
}

function bufToBase64(bytes) {
  let b = ''
  for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i])
  return btoa(b)
}

function injectStyles() {
  if (document.getElementById('piano-styles')) return
  const s = document.createElement('style')
  s.id = 'piano-styles'
  s.textContent = `
.piano-wrap {
  display: flex; flex-direction: column; height: 100%; gap: 0; overflow: hidden;
}
.piano-controls {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-bottom: 1px solid var(--win-border-in); flex-shrink: 0;
}
.piano-sample-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-bottom: 1px solid var(--win-border-in); flex-shrink: 0;
}
.piano-transport {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-bottom: 1px solid var(--win-border-in); flex-shrink: 0;
}
.piano-label { font-size: 10px; color: var(--dim); letter-spacing: 0.06em; }
.piano-octave-btn {
  width: 22px; height: 22px; background: #1a1a1a;
  border: 1px solid var(--win-border); border-radius: 4px;
  color: var(--text-secondary); font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; line-height: 1; font-family: inherit;
}
.piano-octave-btn:hover { background: #242424; color: var(--text-primary); }
.piano-octave-val {
  font-size: 13px; font-weight: 700; color: var(--text-primary);
  min-width: 16px; text-align: center;
}
.piano-vol-wrap { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.piano-vol-wrap span { font-size: 10px; color: var(--dim); }
.piano-vol {
  width: 70px; -webkit-appearance: none; appearance: none;
  height: 3px; background: #2a2a2a; border-radius: 2px; outline: none; cursor: pointer;
}
.piano-vol::-webkit-slider-thumb {
  -webkit-appearance: none; width: 10px; height: 10px;
  border-radius: 50%; background: var(--color-active); cursor: pointer;
}
.piano-note-display {
  font-size: 10px; color: var(--color-active); min-width: 36px;
  font-weight: 600; letter-spacing: 0.04em;
}
.piano-sample-name {
  flex: 1; font-size: 10px; color: var(--text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0;
}
.piano-sample-name.loaded { color: var(--color-active); }
.piano-btn {
  height: 22px; padding: 0 8px; border-radius: 4px;
  background: #1a1a1a; border: 1px solid var(--win-border);
  color: var(--text-secondary); font-size: 10px; font-weight: 600;
  letter-spacing: 0.05em; cursor: pointer; font-family: inherit;
  display: flex; align-items: center; gap: 4px; white-space: nowrap; flex-shrink: 0;
}
.piano-btn:hover { background: #242424; color: var(--text-primary); }
.piano-btn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }
.piano-btn.active { background: color-mix(in srgb, #dc281e 20%, #000); border-color: #dc281e; color: #dc281e; }
.piano-btn.accent { background: color-mix(in srgb, var(--color-active) 15%, #000); border-color: var(--color-active); color: var(--color-active); }
.piano-root-val {
  font-size: 12px; font-weight: 700; color: var(--text-primary);
  min-width: 28px; text-align: center;
}
.piano-clip-tile {
  display: flex; align-items: center; gap: 5px; margin-left: auto;
  height: 22px; padding: 0 8px; border-radius: 4px;
  background: color-mix(in srgb, var(--color-active) 12%, #000);
  border: 1px solid var(--color-active); color: var(--color-active);
  font-size: 10px; font-weight: 600; cursor: grab; white-space: nowrap; flex-shrink: 0;
  user-select: none;
}
.piano-clip-tile:active { cursor: grabbing; }
.piano-synth-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-bottom: 1px solid var(--win-border-in); flex-shrink: 0;
}
.psyn-waves { display: flex; gap: 3px; margin-left: 2px; }
.psyn-wave {
  height: 22px; min-width: 32px; padding: 0 6px; border-radius: 4px;
  background: #1a1a1a; border: 1px solid var(--win-border);
  color: var(--text-secondary); font-size: 9px; font-weight: 700;
  letter-spacing: 0.04em; cursor: pointer; font-family: inherit;
}
.psyn-wave:hover { background: #242424; color: var(--text-primary); }
.psyn-wave.active {
  background: color-mix(in srgb, var(--color-active) 15%, #000);
  border-color: var(--color-active); color: var(--color-active);
}
.piano-synth-panel {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px 14px;
  padding: 9px 10px; border-bottom: 1px solid var(--win-border-in); flex-shrink: 0;
}
.piano-synth-panel.collapsed { display: none; }
.psyn-ctrl { display: flex; align-items: center; gap: 7px; }
.psyn-lbl { font-size: 9px; color: var(--dim); letter-spacing: 0.06em; min-width: 26px; }
.psyn-slider {
  flex: 1; -webkit-appearance: none; appearance: none;
  height: 3px; background: #2a2a2a; border-radius: 2px; outline: none; cursor: pointer;
}
.psyn-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 10px; height: 10px;
  border-radius: 50%; background: var(--color-active); cursor: pointer;
}
.piano-kb-wrap {
  flex: 1; display: flex; align-items: stretch;
  padding: 0; position: relative; overflow: hidden;
}
.piano-roll-wrap { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.roll-scroll { flex: 1; overflow: auto; background: #0c0c0c; }
.roll-inner { position: relative; }
.roll-grid  { position: absolute; inset: 0; display: block; }
.roll-notes { position: absolute; inset: 0; }
.roll-note {
  position: absolute;
  background: color-mix(in srgb, var(--color-active) 70%, #000);
  border: 1px solid color-mix(in srgb, var(--color-active) 90%, #fff);
  border-radius: 2px;
  box-sizing: border-box;
  cursor: grab;
}
.roll-note::after {   /* resize affordance on the right edge */
  content: ''; position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: ew-resize;
}
.roll-note:hover { background: color-mix(in srgb, var(--color-active) 85%, #000); }
.roll-playhead {
  position: absolute; top: 0; bottom: 0; width: 2px;
  background: #e8d24a; pointer-events: none; z-index: 5;
}
.piano-kb {
  position: relative; display: flex; flex-shrink: 0; width: 100%; height: 100%;
}
.piano-white {
  height: 100%; background: #f0f0f0;
  border-right: 1px solid #888; border-bottom: 1px solid #888;
  border-top: none; border-left: none; border-radius: 0 0 4px 4px;
  cursor: pointer; position: relative; flex-shrink: 0;
  transition: background 0.05s; user-select: none;
}
.piano-white:hover { background: #ddd; }
.piano-white.active { background: color-mix(in srgb, var(--color-active) 60%, #fff); }
.piano-white-label {
  position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
  font-size: 8px; color: #777; pointer-events: none; letter-spacing: 0;
}
.piano-black {
  height: 60%; background: #1a1a1a;
  border: 1px solid #000; border-top: none; border-radius: 0 0 3px 3px;
  cursor: pointer; position: absolute; z-index: 2;
  transition: background 0.05s; user-select: none;
}
.piano-black:hover { background: #2a2a2a; }
.piano-black.active { background: color-mix(in srgb, var(--color-active) 80%, #000); }
.piano-mode-btn {
  height: 22px; padding: 0 8px; border-radius: 4px;
  background: #1a1a1a; border: 1px solid var(--win-border);
  color: var(--text-secondary); font-size: 10px; font-weight: 600;
  letter-spacing: 0.05em; cursor: pointer; font-family: inherit;
  display: flex; align-items: center; gap: 4px; white-space: nowrap;
}
.piano-mode-btn.vst-active {
  background: color-mix(in srgb, #a855f7 15%, #000);
  border-color: #a855f7; color: #a855f7;
}
`
  document.head.appendChild(s)
}

function showVstPicker(vsts, onPick) {
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;`

  const box = document.createElement('div')
  box.style.cssText = `background:#1a1a1a;border:1px solid #333;border-radius:8px;width:380px;max-height:420px;display:flex;flex-direction:column;overflow:hidden;`

  const hdr = document.createElement('div')
  hdr.style.cssText = `padding:10px 14px;border-bottom:1px solid #2a2a2a;font-size:12px;font-weight:700;color:#e0e0e0;display:flex;justify-content:space-between;align-items:center;`
  hdr.innerHTML = '<span><i class="fa-solid fa-plug" style="margin-right:6px;color:#a855f7"></i>Select VST Instrument</span>'

  const closeBtn = document.createElement('button')
  closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
  closeBtn.style.cssText = `background:none;border:none;color:#888;cursor:pointer;font-size:14px;`
  closeBtn.onclick = () => { document.body.removeChild(overlay); onPick(null) }
  hdr.appendChild(closeBtn)

  const filter = document.createElement('input')
  filter.placeholder = 'Filter…'
  filter.style.cssText = `margin:8px;padding:5px 8px;background:#111;border:1px solid #333;border-radius:4px;color:#e0e0e0;font-size:11px;outline:none;`

  const list = document.createElement('div')
  list.style.cssText = `flex:1;overflow-y:auto;padding:4px 0;`

  function renderList(query) {
    list.innerHTML = ''
    const q = query.toLowerCase()
    vsts.filter(v => v.name.toLowerCase().includes(q)).forEach(v => {
      const item = document.createElement('div')
      item.style.cssText = `padding:6px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:11px;color:#ccc;`
      item.innerHTML = `<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:#2a2a2a;color:#888;text-transform:uppercase;">${v.format}</span><span>${v.name}</span>`
      item.onmouseenter = () => item.style.background = '#242424'
      item.onmouseleave = () => item.style.background = ''
      item.onclick = () => { document.body.removeChild(overlay); onPick(v) }
      list.appendChild(item)
    })
  }

  renderList('')
  filter.oninput = () => renderList(filter.value)

  // Browse for any plugin file (e.g. a 32-bit VST outside the scanned folders)
  const browseBtn = document.createElement('button')
  browseBtn.innerHTML = `<i class="fa-solid fa-folder-open" style="margin-right:6px;"></i>${t('pia_browse')}`
  browseBtn.style.cssText = `margin:8px;padding:7px 8px;background:#222;border:1px solid #3a3a3a;border-radius:4px;color:#ccc;font-size:11px;cursor:pointer;`
  browseBtn.onmouseenter = () => browseBtn.style.background = '#2c2c2c'
  browseBtn.onmouseleave = () => browseBtn.style.background = '#222'
  browseBtn.onclick = async () => {
    try {
      const v = await window.__TAURI__.core.invoke('pick_vst_file')
      if (v) { document.body.removeChild(overlay); onPick(v) }
    } catch(e) { window.toast(t('pia_file_error') + ': ' + e, 'error') }
  }

  // Close when clicking the dark backdrop (outside the box)
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { document.body.removeChild(overlay); onPick(null) }
  })

  box.append(hdr, filter, list, browseBtn)
  overlay.appendChild(box)
  document.body.appendChild(overlay)
  filter.focus()
}

export function initPiano(body) {
  injectStyles()
  body.style.padding = '0'

  // ── State ─────────────────────────────────────────────────────────────────
  let octave      = 4
  let vol         = 0.5
  let audioBuffer = null
  let rootMidi    = 60   // C4
  let recording   = false
  let recordStart = 0
  let recordedEvents    = []   // { midi, start, dur }
  let activeNoteStarts  = new Map()  // midi → ms from recordStart
  let activeSources     = new Map()  // midi → { src, gain } for live playback
  let playbackTimers    = []
  let rollRaf           = null    // piano-roll playhead RAF
  let exportedPath      = null
  let rollOpen          = false   // piano-roll editor visible
  let vstMode           = false   // true = use VST instrument instead of sample/osc
  let vstName           = null    // name of loaded VST
  let vstPath           = null    // path of loaded VST
  let vstFormat         = null    // format of loaded VST

  // ── Synth engine (ADSR + filter), shaping the oscillator AND the sampler ───
  const SYN_KEY = 'iceample:piano:synth'
  const synth = Object.assign(
    { wave: 'triangle', attack: 0.005, decay: 0.12, sustain: 0.7,
      release: 0.25, cutoff: 12000, resonance: 0.7 },
    (() => { try { return JSON.parse(localStorage.getItem(SYN_KEY)) || {} } catch { return {} } })()
  )
  const saveSynth = () => { try { localStorage.setItem(SYN_KEY, JSON.stringify(synth)) } catch {} }

  // ── Root ─────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div')
  wrap.className = 'piano-wrap'
  body.appendChild(wrap)

  // ── Row 1: note / octave / vol ────────────────────────────────────────────
  const controls = document.createElement('div')
  controls.className = 'piano-controls'

  const noteDisplay = document.createElement('span')
  noteDisplay.className = 'piano-note-display'
  noteDisplay.textContent = '—'

  const octLabel = document.createElement('span')
  octLabel.className = 'piano-label'
  octLabel.textContent = 'OCT'

  const btnOctDown = document.createElement('button')
  btnOctDown.className = 'piano-octave-btn'; btnOctDown.textContent = '−'
  const octVal = document.createElement('span')
  octVal.className = 'piano-octave-val'; octVal.textContent = String(octave)
  const btnOctUp = document.createElement('button')
  btnOctUp.className = 'piano-octave-btn'; btnOctUp.textContent = '+'

  btnOctDown.addEventListener('click', () => {
    if (octave > 0) { octave--; octVal.textContent = String(octave); rebuildKb() }
  })
  btnOctUp.addEventListener('click', () => {
    if (octave < 8) { octave++; octVal.textContent = String(octave); rebuildKb() }
  })

  const volWrap = document.createElement('div')
  volWrap.className = 'piano-vol-wrap'
  volWrap.innerHTML = '<span><i class="fa-solid fa-volume-low"></i></span>'
  const volRange = document.createElement('input')
  volRange.type = 'range'; volRange.className = 'piano-vol'
  volRange.min = '0'; volRange.max = '1'; volRange.step = '0.05'; volRange.value = vol
  volRange.addEventListener('input', () => { vol = parseFloat(volRange.value) })
  volWrap.appendChild(volRange)

  controls.append(noteDisplay, octLabel, btnOctDown, octVal, btnOctUp, volWrap)
  wrap.appendChild(controls)

  // ── Row 2: sample + root ──────────────────────────────────────────────────
  const sampleRow = document.createElement('div')
  sampleRow.className = 'piano-sample-row'

  const sampleName = document.createElement('span')
  sampleName.className = 'piano-sample-name'
  sampleName.textContent = t('piano_no_sample')

  const btnLoad = document.createElement('button')
  btnLoad.className = 'piano-btn'
  btnLoad.innerHTML = '<i class="fa-solid fa-folder-open"></i> Sample'

  const rootLabel = document.createElement('span')
  rootLabel.className = 'piano-label'
  rootLabel.textContent = 'ROOT'

  const btnRootDown = document.createElement('button')
  btnRootDown.className = 'piano-octave-btn'; btnRootDown.textContent = '−'
  const rootVal = document.createElement('span')
  rootVal.className = 'piano-root-val'; rootVal.textContent = noteName(rootMidi)
  const btnRootUp = document.createElement('button')
  btnRootUp.className = 'piano-octave-btn'; btnRootUp.textContent = '+'

  btnRootDown.addEventListener('click', () => {
    if (rootMidi > 0)  { rootMidi--; rootVal.textContent = noteName(rootMidi) }
  })
  btnRootUp.addEventListener('click', () => {
    if (rootMidi < 127) { rootMidi++; rootVal.textContent = noteName(rootMidi) }
  })

  btnLoad.addEventListener('click', () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'audio/*'
    input.onchange = async () => {
      const file = input.files[0]
      if (!file) return
      try {
        const arr = await file.arrayBuffer()
        audioBuffer = await getCtx().decodeAudioData(arr)
        sampleName.textContent = file.name.replace(/\.[^.]+$/, '')
        sampleName.classList.add('loaded')
        exportedPath = null
        updateTransport()
      } catch { sampleName.textContent = t('piano_decode_error') }
    }
    input.click()
  })

  sampleRow.append(sampleName, btnLoad, rootLabel, btnRootDown, rootVal, btnRootUp)
  wrap.appendChild(sampleRow)

  // ── VST Row ───────────────────────────────────────────────────────────────
  const vstRow = document.createElement('div')
  vstRow.className = 'piano-sample-row'

  const vstLabel = document.createElement('span')
  vstLabel.className = 'piano-sample-name'
  vstLabel.textContent = '— no VST —'

  const btnVstLoad = document.createElement('button')
  btnVstLoad.className = 'piano-btn'
  btnVstLoad.innerHTML = '<i class="fa-solid fa-plug"></i> VST'

  const btnVstToggle = document.createElement('button')
  btnVstToggle.className = 'piano-mode-btn'
  btnVstToggle.innerHTML = '<i class="fa-solid fa-power-off"></i>'
  btnVstToggle.title = t('vst_enable')
  btnVstToggle.style.opacity = '0.35'

  const btnVstEditor = document.createElement('button')
  btnVstEditor.className = 'piano-btn'
  btnVstEditor.innerHTML = '<i class="fa-solid fa-sliders"></i>'
  btnVstEditor.title = t('ed_vst_open_editor')
  btnVstEditor.style.opacity = '0.35'

  vstRow.append(vstLabel, btnVstLoad, btnVstEditor, btnVstToggle)
  wrap.appendChild(vstRow)

  // ── Row: synth (waveform + collapsible ADSR/filter) ───────────────────────
  const synthRow = document.createElement('div')
  synthRow.className = 'piano-synth-row'

  const synthToggle = document.createElement('button')
  synthToggle.className = 'piano-btn'
  synthToggle.innerHTML = '<i class="fa-solid fa-wave-square"></i> SYNTH'
  synthToggle.title = t('syn_title')

  const waveWrap = document.createElement('div')
  waveWrap.className = 'psyn-waves'
  ;[['sine','SIN'],['triangle','TRI'],['sawtooth','SAW'],['square','SQR']].forEach(([w, lbl]) => {
    const b = document.createElement('button')
    b.className = 'psyn-wave' + (synth.wave === w ? ' active' : '')
    b.textContent = lbl; b.dataset.wave = w
    b.addEventListener('click', () => {
      synth.wave = w; saveSynth()
      waveWrap.querySelectorAll('.psyn-wave').forEach(x => x.classList.toggle('active', x.dataset.wave === w))
    })
    waveWrap.appendChild(b)
  })
  synthRow.append(synthToggle, waveWrap)
  wrap.appendChild(synthRow)

  const synthPanel = document.createElement('div')
  synthPanel.className = 'piano-synth-panel collapsed'
  function synSlider(label, titleKey, min, max, step, val, onInput) {
    const w = document.createElement('div'); w.className = 'psyn-ctrl'; w.title = t(titleKey)
    const l = document.createElement('span'); l.className = 'psyn-lbl'; l.textContent = label
    const inp = document.createElement('input'); inp.type = 'range'
    inp.min = min; inp.max = max; inp.step = step; inp.value = val; inp.className = 'psyn-slider'
    inp.addEventListener('input', () => onInput(parseFloat(inp.value)))
    w.append(l, inp); return w
  }
  synthPanel.append(
    synSlider('A',   'syn_attack',    0,   1,     0.005, synth.attack,    v => { synth.attack = v;    saveSynth() }),
    synSlider('D',   'syn_decay',     0,   1,     0.005, synth.decay,     v => { synth.decay = v;     saveSynth() }),
    synSlider('S',   'syn_sustain',   0,   1,     0.01,  synth.sustain,   v => { synth.sustain = v;   saveSynth() }),
    synSlider('R',   'syn_release',   0,   2,     0.01,  synth.release,   v => { synth.release = v;   saveSynth() }),
    synSlider('CUT', 'syn_cutoff',    200, 18000, 50,    synth.cutoff,    v => { synth.cutoff = v;    saveSynth() }),
    synSlider('RES', 'syn_resonance', 0.1, 12,    0.1,   synth.resonance, v => { synth.resonance = v; saveSynth() }),
  )
  synthToggle.addEventListener('click', () => {
    const open = synthPanel.classList.toggle('collapsed')
    synthToggle.classList.toggle('active', !open)
  })
  wrap.appendChild(synthPanel)

  btnVstLoad.addEventListener('click', async () => {
    try {
      const vsts = await window.__TAURI__.core.invoke('scan_vsts', { extraPaths: [] })
      showVstPicker(vsts, async (picked) => {
        if (!picked) return
        if (picked.format !== 'vst2') {
          window.toast(t('pia_vst_only2'), 'error')
          return
        }
        btnVstLoad.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'
        try {
          await window.__TAURI__.core.invoke('load_vst_instrument', { path: picked.path, format: picked.format })
          vstName   = picked.name
          vstPath   = picked.path
          vstFormat = picked.format
          // Sync a tempo-synced plugin (arpeggiator) to the project BPM.
          window.__TAURI__.core.invoke('set_vst_tempo', { bpm: getBpm() }).catch(() => {})
          vstLabel.textContent = picked.name
          vstLabel.classList.add('loaded')
          btnVstToggle.style.opacity = '1'
          btnVstEditor.style.opacity = '1'
          btnVstLoad.innerHTML = '<i class="fa-solid fa-plug"></i> VST'
        } catch(e) {
          window.toast(t('pia_vst_load_err') + ': ' + e, 'error')
          btnVstLoad.innerHTML = '<i class="fa-solid fa-plug"></i> VST'
        }
      })
    } catch(e) {
      window.toast(t('pia_scan_err') + ': ' + e, 'error')
    }
  })

  btnVstEditor.addEventListener('click', async () => {
    if (!vstName) { window.toast(t('pia_load_first'), 'error'); return }
    const { invoke } = window.__TAURI__.core
    try {
      // Connected editor (live instrument bridge), if it's still alive…
      await invoke('open_vst_instrument_editor', { name: vstName })
      window.toast(t('pia_editor_ok'), 'success')
    } catch (e) {
      // …otherwise open a standalone editor straight from the plugin file
      // (reliable: same path that works in the FX chain).
      try {
        await invoke('open_vst_editor', { path: vstPath, format: vstFormat, name: vstName })
        window.toast(t('pia_editor_ok'), 'success')
      } catch (e2) {
        window.toast(t('pia_editor_err') + ': ' + e2, 'error')
      }
    }
  })

  btnVstToggle.addEventListener('click', () => {
    vstMode = !vstMode
    if (vstMode) {
      btnVstToggle.classList.add('vst-active')
      btnVstToggle.title = t('vst_disable')
    } else {
      btnVstToggle.classList.remove('vst-active')
      btnVstToggle.title = t('vst_enable')
      // Just stop routing notes to the VST — keep the plugin/bridge loaded so
      // turning it back on (and the editor) stay alive. It's freed when another
      // VST is loaded or the piano window is closed.
    }
  })

  // ── Row 3: transport ──────────────────────────────────────────────────────
  const transport = document.createElement('div')
  transport.className = 'piano-transport'

  const btnRec = document.createElement('button')
  btnRec.className = 'piano-btn'
  btnRec.innerHTML = '<i class="fa-solid fa-circle"></i> REC'

  const btnStop = document.createElement('button')
  btnStop.className = 'piano-btn'
  btnStop.innerHTML = '<i class="fa-solid fa-stop"></i>'
  btnStop.disabled = true

  const btnPlay = document.createElement('button')
  btnPlay.className = 'piano-btn'
  btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
  btnPlay.disabled = true

  const btnRoll = document.createElement('button')
  btnRoll.className = 'piano-btn'
  btnRoll.innerHTML = '<i class="fa-solid fa-table-cells"></i> ROLL'
  btnRoll.title = t('roll_toggle')

  const btnDAW = document.createElement('button')
  btnDAW.className = 'piano-btn'
  btnDAW.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> DAW'
  btnDAW.style.marginLeft = 'auto'
  btnDAW.disabled = true

  const clipTile = document.createElement('div')
  clipTile.className = 'piano-clip-tile'
  clipTile.style.display = 'none'
  clipTile.innerHTML = '<i class="fa-solid fa-music"></i><span></span>'

  transport.append(btnRec, btnStop, btnPlay, btnRoll, btnDAW, clipTile)
  wrap.appendChild(transport)

  function updateTransport() {
    btnStop.disabled  = !recording && recordedEvents.length === 0
    btnPlay.disabled  = recordedEvents.length === 0
    btnDAW.disabled   = recordedEvents.length === 0
    if (exportedPath) {
      btnDAW.style.display = 'none'
      clipTile.style.display = ''
      clipTile.querySelector('span').textContent = exportedPath.split(/[\\/]/).pop().replace(/\.\w+$/, '').slice(0, 18)
    } else {
      btnDAW.style.display = ''
      clipTile.style.display = 'none'
    }
    if (rollOpen) renderRoll()
  }

  // ── Note playback ─────────────────────────────────────────────────────────
  // Play a note on the piano's OWN engine (sample/oscillator), bypassing any
  // VST routing. Used both for direct play and for notes an arpeggiator VST
  // emits back to us.
  function playLocal(midi, vel) {
    const ctx     = getCtx()
    const track   = getTrackNode('piano')
    const velGain = Math.max(0, Math.min(127, vel)) / 127
    const now     = ctx.currentTime
    // Re-trigger safety: stop any voice already sounding on this note.
    const prev = activeSources.get(midi)
    if (prev) {
      try { prev.gain.gain.cancelScheduledValues(now); prev.gain.gain.setTargetAtTime(0, now, 0.015); prev.src.stop(now + 0.08) } catch {}
      activeSources.delete(midi)
    }

    // Source: loaded sample, else the synth oscillator.
    let src
    if (audioBuffer) {
      src = ctx.createBufferSource()
      src.buffer = audioBuffer
      src.playbackRate.value = Math.pow(2, (midi - rootMidi) / 12)
    } else {
      src = ctx.createOscillator()
      src.type = synth.wave
      src.frequency.value = noteFreq(midi)
    }

    // Low-pass filter → tone shaping.
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = synth.cutoff
    filter.Q.value         = synth.resonance

    // ADSR amplitude envelope (sustains while the key is held).
    const gain   = ctx.createGain()
    const peak   = vol * velGain * (audioBuffer ? 1 : 0.6)
    const sustain = Math.max(0.0001, peak * synth.sustain)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(peak, now + Math.max(0.001, synth.attack))
    gain.gain.setTargetAtTime(sustain, now + synth.attack, Math.max(0.005, synth.decay / 3))

    src.connect(filter); filter.connect(gain); gain.connect(track)
    src.start(now)
    activeSources.set(midi, { src, gain, filter })
  }

  function releaseLocal(midi) {
    const entry = activeSources.get(midi)
    if (!entry) return
    const { src, gain } = entry
    const ctx = getCtx()
    const now = ctx.currentTime
    // Release stage: ramp from the current level to silence.
    try {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.setTargetAtTime(0.0001, now, Math.max(0.01, synth.release / 3))
      src.stop(now + synth.release + 0.2)
    } catch {}
    activeSources.delete(midi)
  }

  function triggerNote(midi, velocity = null) {
    const vel = velocity !== null ? velocity : Math.round(vol * 127)
    if (vstMode) {
      window.__TAURI__.core.invoke('vst_note_on', { note: midi, velocity: vel })
        .catch(() => {})
      return
    }
    playLocal(midi, vel)
  }

  function releaseNote(midi) {
    if (vstMode) {
      window.__TAURI__.core.invoke('vst_note_off', { note: midi })
        .catch(() => {})
      return
    }
    releaseLocal(midi)
  }

  // ── MIDI coming BACK from a VST (e.g. Arptron's arpeggiated notes) ─────────
  // The 32-bit bridge forwards any MIDI the plugin emits; play it on the
  // piano's own synth so MIDI-effect VSTs actually make sound.
  function onVstMidiOut(p) {
    if (!p) return
    const cmd = p.status & 0xf0
    const note = p.data1, vel = p.data2
    if (cmd === 0x90 && vel > 0) {
      playLocal(note, vel)
      kb.querySelector(`[data-midi="${note}"]`)?.classList.add('active')
    } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
      releaseLocal(note)
      kb.querySelector(`[data-midi="${note}"]`)?.classList.remove('active')
    }
  }
  activePianoMidiHandler = onVstMidiOut
  if (!vstMidiListenerReady && window.__TAURI__?.event) {
    vstMidiListenerReady = true
    window.__TAURI__.event.listen('vst-midi-out', (e) => {
      if (activePianoMidiHandler) activePianoMidiHandler(e.payload)
    })
  }
  // Keep a loaded tempo-synced VST (arpeggiator) in time with the metronome.
  const offBpm = onBpmChange((bpm) => {
    if (vstName) window.__TAURI__?.core.invoke('set_vst_tempo', { bpm }).catch(() => {})
  })

  function startNote(midi, velocity = null) {
    noteDisplay.textContent = noteName(midi)
    triggerNote(midi, velocity)
    if (recording) activeNoteStarts.set(midi, performance.now() - recordStart)
  }

  function endNote(midi) {
    releaseNote(midi)
    if (recording && activeNoteStarts.has(midi)) {
      const start = activeNoteStarts.get(midi)
      recordedEvents.push({ midi, start, dur: performance.now() - recordStart - start })
      activeNoteStarts.delete(midi)
    }
  }

  // ── Transport controls ────────────────────────────────────────────────────
  btnRec.addEventListener('click', () => {
    if (recording) return
    stopPlayback()
    recordedEvents = []; activeNoteStarts.clear()
    exportedPath = null
    recordStart = performance.now()
    recording = true
    btnRec.classList.add('active')
    btnStop.disabled = false; btnPlay.disabled = true; btnDAW.disabled = true
    updateTransport()
  })

  btnStop.addEventListener('click', () => {
    if (recording) {
      for (const [midi, start] of activeNoteStarts)
        recordedEvents.push({ midi, start, dur: performance.now() - recordStart - start })
      activeNoteStarts.clear()
      recording = false
      btnRec.classList.remove('active')
    }
    stopPlayback()
    updateTransport()
  })

  btnPlay.addEventListener('click', () => {
    if (recording) return
    stopPlayback()
    playRecording()
  })

  btnDAW.addEventListener('click', async () => {
    if (!recordedEvents.length) return
    btnDAW.disabled = true
    btnDAW.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'
    try {
      await exportToDAW()
    } catch(e) {
      console.error('Piano export error:', e)
      btnDAW.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> DAW'
      btnDAW.disabled = false
    }
  })

  function stopPlayback() {
    playbackTimers.forEach(clearTimeout); playbackTimers = []
    // release any still-playing notes from playback
    for (const midi of activeSources.keys()) releaseNote(midi)
    kb.querySelectorAll('.active').forEach(el => el.classList.remove('active'))
    if (rollRaf) { cancelAnimationFrame(rollRaf); rollRaf = null }
    rollPlayhead.style.display = 'none'
  }

  function playRecording() {
    const events = [...recordedEvents]
    // Roll playhead follows playback.
    if (events.length) {
      const endMs = Math.max(...events.map(e => e.start + e.dur))
      const wall  = performance.now()
      rollPlayhead.style.display = ''
      const tick = () => {
        const el = performance.now() - wall
        rollPlayhead.style.left = (el * pxPerMs()) + 'px'
        if (el <= endMs) rollRaf = requestAnimationFrame(tick)
        else { rollPlayhead.style.display = 'none'; rollRaf = null }
      }
      rollRaf = requestAnimationFrame(tick)
    }
    events.forEach(ev => {
      const t1 = setTimeout(() => {
        triggerNote(ev.midi)
        const el = kb.querySelector(`[data-midi="${ev.midi}"]`)
        if (el) el.classList.add('active')
        const t2 = setTimeout(() => {
          releaseNote(ev.midi)
          if (el) el.classList.remove('active')
        }, ev.dur)
        playbackTimers.push(t2)
      }, ev.start)
      playbackTimers.push(t1)
    })
  }

  async function exportToDAW() {
    const totalMs = Math.max(...recordedEvents.map(e => e.start + e.dur)) + 800
    const sr      = audioBuffer?.sampleRate ?? getCtx().sampleRate
    const offCtx  = new OfflineAudioContext(2, Math.ceil(totalMs / 1000 * sr), sr)

    recordedEvents.forEach(ev => {
      const startSec = ev.start / 1000
      const durSec   = ev.dur   / 1000
      if (audioBuffer) {
        const src  = offCtx.createBufferSource()
        const gain = offCtx.createGain()
        src.buffer = audioBuffer
        src.playbackRate.value = Math.pow(2, (ev.midi - rootMidi) / 12)
        gain.gain.setValueAtTime(vol, startSec)
        gain.gain.setTargetAtTime(0, startSec + durSec, 0.08)
        src.connect(gain); gain.connect(offCtx.destination)
        src.start(startSec); src.stop(startSec + durSec + 0.5)
      } else {
        const osc  = offCtx.createOscillator()
        const gain = offCtx.createGain()
        osc.type = 'triangle'; osc.frequency.value = noteFreq(ev.midi)
        gain.gain.setValueAtTime(vol * 0.6, startSec)
        gain.gain.exponentialRampToValueAtTime(0.0001, startSec + 1.2)
        osc.connect(gain); gain.connect(offCtx.destination)
        osc.start(startSec); osc.stop(startSec + 1.25)
      }
    })

    const rendered = await offCtx.startRendering()
    const wavBytes = encodeWAV(rendered)

    const root = localStorage.getItem('library:root')
    const sep  = root?.includes('\\') ? '\\' : '/'
    if (root && window.__TAURI__) {
      const now   = new Date()
      const stamp = String(now.getHours()).padStart(2,'0') +
                    String(now.getMinutes()).padStart(2,'0') +
                    String(now.getSeconds()).padStart(2,'0')
      const base  = await promptName('piano_' + stamp, { title: t('rename_title') })
      const fname = base + '.wav'
      const fpath = root + sep + 'Sons' + sep + fname
      const { invoke } = window.__TAURI__.core
      await invoke('save_binary_file', { path: fpath, base64: bufToBase64(wavBytes) })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Sons' } }))
      exportedPath = fpath
      updateTransport()
      makeTileDraggable(fpath, fname)
    } else {
      // Browser fallback: download
      const blob = new Blob([wavBytes], { type: 'audio/wav' })
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'piano.wav' })
      a.click()
      btnDAW.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> DAW'
      btnDAW.disabled = false
    }
  }

  function makeTileDraggable(fpath, fname) {
    let ghost = null
    clipTile.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return
      ghost = document.createElement('div')
      ghost.className = 'piano-clip-tile'
      ghost.innerHTML = `<i class="fa-solid fa-music"></i><span>${fname.replace(/\.\w+$/,'').slice(0,18)}</span>`
      ghost.style.cssText = 'position:fixed;pointer-events:none;opacity:0.85;z-index:9999'
      ghost.style.left = ev.clientX + 8 + 'px'
      ghost.style.top  = ev.clientY - 11 + 'px'
      document.body.appendChild(ghost)
    })
    document.addEventListener('mousemove', ev => {
      if (!ghost) return
      ghost.style.left = ev.clientX + 8 + 'px'
      ghost.style.top  = ev.clientY - 11 + 'px'
    })
    document.addEventListener('mouseup', ev => {
      if (!ghost) return
      ghost.remove(); ghost = null
      const under = document.elementFromPoint(ev.clientX, ev.clientY)
      if (under) {
        under.dispatchEvent(new CustomEvent('iceample-drop', {
          bubbles: true,
          detail: { file: { name: fname, path: fpath }, clientX: ev.clientX, clientY: ev.clientY }
        }))
        document.addEventListener('click', e => e.stopPropagation(), { once: true, capture: true })
      }
    })
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const kbWrap = document.createElement('div')
  kbWrap.className = 'piano-kb-wrap'
  const kb = document.createElement('div')
  kb.className = 'piano-kb'
  kbWrap.appendChild(kb)
  wrap.appendChild(kbWrap)

  // ── Piano-roll editor ───────────────────────────────────────────────────────
  const ROLL_LO = 36, ROLL_HI = 96      // C2..C7
  const rowH = 12, pxPerBeat = 48
  const BLACK_SET = new Set([1, 3, 6, 8, 10])

  const rollWrap = document.createElement('div')
  rollWrap.className = 'piano-roll-wrap'
  rollWrap.style.display = 'none'
  const rollScroll = document.createElement('div')
  rollScroll.className = 'roll-scroll'
  const rollInner = document.createElement('div')
  rollInner.className = 'roll-inner'
  const gridCanvas = document.createElement('canvas')
  gridCanvas.className = 'roll-grid'
  const noteLayer = document.createElement('div')
  noteLayer.className = 'roll-notes'
  const rollPlayhead = document.createElement('div')
  rollPlayhead.className = 'roll-playhead'
  rollPlayhead.style.display = 'none'
  rollInner.append(gridCanvas, noteLayer, rollPlayhead)
  rollScroll.appendChild(rollInner)
  rollWrap.appendChild(rollScroll)
  wrap.appendChild(rollWrap)

  const beatMs   = () => 60000 / getBpm()
  const pxPerMs  = () => pxPerBeat / beatMs()
  const xToMs    = x => x / pxPerMs()
  const yToMidi  = y => ROLL_HI - Math.floor(y / rowH)
  const snapMs   = ms => { const g = beatMs() / 4; return Math.max(0, Math.round(ms / g) * g) }

  function drawRollGrid(w, h) {
    const ctx = gridCanvas.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    // pitch rows
    for (let p = ROLL_LO; p <= ROLL_HI; p++) {
      const y = (ROLL_HI - p) * rowH
      if (BLACK_SET.has(p % 12)) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, y, w, rowH) }
      ctx.fillStyle = (p % 12 === 0) ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'
      ctx.fillRect(0, y, w, 1)
    }
    // beat / bar lines
    const ppb = pxPerBeat
    for (let x = 0, b = 0; x <= w; x += ppb, b++) {
      ctx.fillStyle = (b % 4 === 0) ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'
      ctx.fillRect(x, 0, 1, h)
    }
  }

  function renderRoll() {
    const rows = ROLL_HI - ROLL_LO + 1
    const innerH = rows * rowH
    let endMs = 0
    recordedEvents.forEach(e => { endMs = Math.max(endMs, e.start + e.dur) })
    const beatsNeeded = Math.max(16, Math.ceil(endMs / beatMs()) + 4)
    const innerW = Math.round(beatsNeeded * pxPerBeat)
    rollInner.style.width = innerW + 'px'
    rollInner.style.height = innerH + 'px'
    gridCanvas.width = innerW; gridCanvas.height = innerH
    drawRollGrid(innerW, innerH)
    const ppm = pxPerMs()
    noteLayer.innerHTML = ''
    recordedEvents.forEach((ev, idx) => {
      const n = document.createElement('div')
      n.className = 'roll-note'
      n.dataset.idx = idx
      n.style.left = (ev.start * ppm) + 'px'
      n.style.width = Math.max(4, ev.dur * ppm) + 'px'
      n.style.top = ((ROLL_HI - ev.midi) * rowH) + 'px'
      n.style.height = (rowH - 1) + 'px'
      noteLayer.appendChild(n)
    })
  }

  // Editing: add (empty), move (body), resize (right edge), delete (right-click).
  rollInner.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    const r = rollInner.getBoundingClientRect()
    const noteEl = e.target.closest('.roll-note')
    if (noteEl) {
      const idx = +noteEl.dataset.idx
      const ev  = recordedEvents[idx]; if (!ev) return
      const ppm = pxPerMs()
      const rightPx = ev.start * ppm + Math.max(4, ev.dur * ppm)
      const x0 = e.clientX - r.left
      const resizing = x0 >= rightPx - 6
      const grabMs = xToMs(x0) - ev.start
      const onMove = mv => {
        const x = mv.clientX - r.left, y = mv.clientY - r.top
        if (resizing) {
          ev.dur = Math.max(beatMs() / 8, snapMs(xToMs(x)) - ev.start)
        } else {
          ev.start = snapMs(xToMs(x) - grabMs)
          ev.midi  = Math.max(ROLL_LO, Math.min(ROLL_HI, yToMidi(y)))
        }
        renderRoll()
      }
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); updateTransport() }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    } else {
      // Add a note (one beat) where clicked, then preview it.
      const x = e.clientX - r.left, y = e.clientY - r.top
      const midi = Math.max(ROLL_LO, Math.min(ROLL_HI, yToMidi(y)))
      recordedEvents.push({ midi, start: snapMs(xToMs(x)), dur: beatMs(), vel: 100 })
      renderRoll(); updateTransport()
      playLocal(midi, 100); setTimeout(() => releaseLocal(midi), 200)
    }
  })
  rollInner.addEventListener('contextmenu', e => {
    const noteEl = e.target.closest('.roll-note')
    if (!noteEl) return
    e.preventDefault(); e.stopPropagation()
    recordedEvents.splice(+noteEl.dataset.idx, 1)
    renderRoll(); updateTransport()
  })

  btnRoll.addEventListener('click', () => {
    rollOpen = !rollOpen
    btnRoll.classList.toggle('active', rollOpen)
    rollWrap.style.display = rollOpen ? '' : 'none'
    kbWrap.style.display   = rollOpen ? 'none' : ''
    if (rollOpen) renderRoll()
    else rebuildKb()
  })

  function midiNote(oct, semi) { return (oct + 1) * 12 + semi }

  const OCTAVES  = 2
  const NUM_WHITE = OCTAVES * 7

  function rebuildKb() {
    kb.innerHTML = ''
    const containerW = kbWrap.offsetWidth || 500
    const wkW     = Math.floor(containerW / NUM_WHITE)
    const lastWkW = containerW - wkW * (NUM_WHITE - 1)
    const bkW     = Math.round(wkW * 0.58)
    let whiteIdx  = 0

    for (let oct = octave; oct < octave + OCTAVES; oct++) {
      for (let w = 0; w < 7; w++) {
        const semi   = WHITE[w]
        const midi   = midiNote(oct, semi)
        const isLast = whiteIdx === NUM_WHITE - 1

        const key = document.createElement('div')
        key.className = 'piano-white'
        key.style.width = (isLast ? lastWkW : wkW) + 'px'
        key.dataset.midi = midi

        if (semi === 0) {
          const lbl = document.createElement('span')
          lbl.className = 'piano-white-label'
          lbl.textContent = 'C' + oct
          key.appendChild(lbl)
        }

        key.addEventListener('mousedown', e => { e.preventDefault(); key.classList.add('active'); startNote(midi) })
        key.addEventListener('mouseup',   () => { key.classList.remove('active'); endNote(midi) })
        key.addEventListener('mouseleave',() => { key.classList.remove('active'); endNote(midi) })
        kb.appendChild(key)

        const bSemi = BLACK[w]
        if (bSemi !== -1) {
          const bmidi = midiNote(oct, bSemi)
          const bkey  = document.createElement('div')
          bkey.className = 'piano-black'
          bkey.dataset.midi = bmidi
          bkey.style.width = bkW + 'px'
          bkey.style.left  = (whiteIdx * wkW + wkW - Math.round(bkW / 2)) + 'px'
          bkey.addEventListener('mousedown', e => { e.preventDefault(); bkey.classList.add('active'); startNote(bmidi) })
          bkey.addEventListener('mouseup',   () => { bkey.classList.remove('active'); endNote(bmidi) })
          bkey.addEventListener('mouseleave',() => { bkey.classList.remove('active'); endNote(bmidi) })
          kb.appendChild(bkey)
        }
        whiteIdx++
      }
    }
  }

  requestAnimationFrame(rebuildKb)
  const ro = new ResizeObserver(rebuildKb)
  ro.observe(kbWrap)

  // ── Computer keyboard shortcuts ───────────────────────────────────────────
  const DEFAULT_KEY_MAP = {
    'z':0,'s':1,'x':2,'d':3,'c':4,'v':5,'g':6,
    'b':7,'h':8,'n':9,'j':10,'m':11,
    'q':12,'2':13,'w':14,'3':15,'e':16,'r':17,'5':18,
    't':19,'6':20,'y':21,'7':22,'u':23,
  }
  function getKeyMap() {
    try { return JSON.parse(localStorage.getItem('iceample:piano:keymap')) || DEFAULT_KEY_MAP }
    catch { return DEFAULT_KEY_MAP }
  }

  const heldKeys = new Set()
  let lastKeydownTime = 0

  function onKeyDown(e) {
    if (e.repeat || e.target.tagName === 'INPUT') return
    if (matchesShortcut('piano-oct-up', e)) {
      e.preventDefault()
      if (octave < 8) { octave++; octVal.textContent = String(octave); rebuildKb() }
      return
    }
    if (matchesShortcut('piano-oct-down', e)) {
      e.preventDefault()
      if (octave > 0) { octave--; octVal.textContent = String(octave); rebuildKb() }
      return
    }
    const semi = getKeyMap()[e.key.toLowerCase()]
    if (semi === undefined) return
    const midi = midiNote(octave, semi)
    if (heldKeys.has(midi)) return
    heldKeys.add(midi)
    kb.querySelector(`[data-midi="${midi}"]`)?.classList.add('active')
    // Velocity from keystroke speed: fast playing → high velocity
    const now = performance.now()
    const timeSinceLast = now - lastKeydownTime
    // 0–80ms → 127, 80–400ms → interpolated, >400ms → 60
    const velocity = timeSinceLast < 80
      ? 127
      : timeSinceLast > 400
        ? 60
        : Math.round(127 - ((timeSinceLast - 80) / 320) * 67)
    lastKeydownTime = now
    startNote(midi, velocity)
  }
  function onKeyUp(e) {
    const semi = getKeyMap()[e.key.toLowerCase()]
    if (semi === undefined) return
    const midi = midiNote(octave, semi)
    heldKeys.delete(midi)
    kb.querySelector(`[data-midi="${midi}"]`)?.classList.remove('active')
    endNote(midi)
  }

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup',   onKeyUp)

  // ── MIDI keyboard input ───────────────────────────────────────────────────
  function onMidiMessage(e) {
    const { type, midi, velocity } = e.detail
    if (type === 'noteon') {
      kb.querySelector(`[data-midi="${midi}"]`)?.classList.add('active')
      startNote(midi, velocity)
    } else if (type === 'noteoff') {
      kb.querySelector(`[data-midi="${midi}"]`)?.classList.remove('active')
      endNote(midi)
    }
  }
  window.addEventListener('iceample-midi', onMidiMessage)

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const obs = new MutationObserver(() => {
    if (!document.contains(body)) {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup',   onKeyUp)
      window.removeEventListener('iceample-midi', onMidiMessage)
      stopPlayback()
      ro.disconnect()
      // Free the VST / kill the 32-bit bridge whenever one was loaded — not only
      // when the toggle is on (power-off keeps it loaded but it must still be
      // released on close, or the bridge process lingers).
      if (vstName) {
        window.__TAURI__.core.invoke('unload_vst_instrument').catch(() => {})
      }
      // Stop dispatching VST-emitted MIDI to this (now closed) piano.
      if (activePianoMidiHandler === onVstMidiOut) activePianoMidiHandler = null
      offBpm()
      obs.disconnect()
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
