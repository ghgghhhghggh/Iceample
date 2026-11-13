// midi-bus.js — Global MIDI keyboard + CC input for Iceample v2
// Uses Web MIDI API; dispatches:
//   'iceample-midi'    — { type: 'noteon'|'noteoff', midi, velocity }
//   'iceample-midi-cc' — { cc, value, channel }
//   'iceample-midi-pb' — { value }  (-1 … +1)

// ── MIDI Learn ─────────────────────────────────────────────────────────────────
// midiLearnStart(paramId, cb) — next CC received binds to paramId; cb(cc, value)
// midiLearnStop()             — cancel pending learn
// getMidiBinding(paramId)     — returns cc number or null
// clearMidiBinding(paramId)   — remove binding
const BINDINGS_KEY = 'iceample:midi:cc-bindings'

let _learnParamId = null
let _learnCb      = null

function _loadBindings() {
  try { return JSON.parse(localStorage.getItem(BINDINGS_KEY) || '{}') } catch { return {} }
}
function _saveBindings(b) { localStorage.setItem(BINDINGS_KEY, JSON.stringify(b)) }

export function midiLearnStart(paramId, cb) {
  _learnParamId = paramId
  _learnCb      = cb
}

export function midiLearnStop() {
  _learnParamId = null
  _learnCb      = null
}

export function getMidiBinding(paramId) {
  return _loadBindings()[paramId] ?? null
}

export function clearMidiBinding(paramId) {
  const b = _loadBindings()
  delete b[paramId]
  _saveBindings(b)
}

export function getAllMidiBindings() { return _loadBindings() }

// ── MIDI device connection ─────────────────────────────────────────────────────
let _midiAccess = null
let _activePort = null

export async function initMidiBus() {
  if (!navigator.requestMIDIAccess) {
    console.warn('[midi-bus] Web MIDI API not available')
    return
  }
  try {
    _midiAccess = await navigator.requestMIDIAccess({ sysex: false })
    _connectSaved()
    _midiAccess.onstatechange = () => _connectSaved()
  } catch (e) {
    console.warn('[midi-bus] MIDI access denied:', e)
  }
}

function _connectSaved() {
  const savedName = localStorage.getItem('dev:midi-in-name')
  if (_activePort) { _activePort.onmidimessage = null; _activePort = null }
  if (!savedName || !_midiAccess) return
  for (const port of _midiAccess.inputs.values()) {
    if (port.name === savedName) {
      _activePort = port
      port.onmidimessage = _handleMessage
      return
    }
  }
}

function _handleMessage(ev) {
  const [status, byte1, byte2] = ev.data
  const type = status & 0xF0
  const chan  = (status & 0x0F) + 1   // 1-based

  // Channel filter (0 = all)
  const midiChan = parseInt(localStorage.getItem('iceample:audio:midiChannel') || '0', 10)
  if (midiChan !== 0 && chan !== midiChan) return

  // ── Note On / Off ─────────────────────────────────────────────────────────
  if (type === 0x90 || type === 0x80) {
    const transpose = parseInt(localStorage.getItem('iceample:audio:midiTranspose') || '0', 10)
    const midi = Math.max(0, Math.min(127, byte1 + transpose))
    if (type === 0x90 && byte2 > 0) {
      window.dispatchEvent(new CustomEvent('iceample-midi', {
        detail: { type: 'noteon', midi, velocity: byte2 }
      }))
    } else {
      window.dispatchEvent(new CustomEvent('iceample-midi', {
        detail: { type: 'noteoff', midi, velocity: 0 }
      }))
    }
    return
  }

  // ── Control Change (0xB0) ─────────────────────────────────────────────────
  if (type === 0xB0) {
    const cc  = byte1
    const val = byte2   // 0–127

    // MIDI Learn: first CC received → bind & fire callback
    if (_learnParamId !== null) {
      const b = _loadBindings()
      b[_learnParamId] = cc
      _saveBindings(b)
      const cb = _learnCb
      midiLearnStop()
      if (cb) cb(cc, val)
      window.dispatchEvent(new CustomEvent('iceample-midi-learned', {
        detail: { paramId: _learnParamId, cc }
      }))
    }

    // Dispatch to all listeners (e.g. sliders bound via MIDI Learn)
    window.dispatchEvent(new CustomEvent('iceample-midi-cc', {
      detail: { cc, value: val, channel: chan }
    }))

    // Route to any registered param binding
    const bindings = _loadBindings()
    for (const [paramId, boundCc] of Object.entries(bindings)) {
      if (boundCc === cc) {
        window.dispatchEvent(new CustomEvent('iceample-midi-cc-param', {
          detail: { paramId, value: val / 127 }
        }))
      }
    }
    return
  }

  // ── Pitch Bend (0xE0) ─────────────────────────────────────────────────────
  if (type === 0xE0) {
    const raw   = (byte2 << 7) | byte1          // 0–16383
    const norm  = (raw - 8192) / 8192           // -1 … +1
    window.dispatchEvent(new CustomEvent('iceample-midi-pb', {
      detail: { value: norm }
    }))
    return
  }

  // ── Aftertouch (0xA0 poly, 0xD0 channel) ─────────────────────────────────
  if (type === 0xD0) {
    window.dispatchEvent(new CustomEvent('iceample-midi-at', {
      detail: { value: byte1 / 127 }
    }))
  }
}

/** Call after the user picks a new port in settings so we reconnect immediately. */
export function reconnectMidi() {
  if (_midiAccess) _connectSaved()
}
