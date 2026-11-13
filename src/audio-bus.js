// audio-bus.js — Shared Web Audio infrastructure for Iceample v2
// Signal chain per track:
//   source → trackGain → [EQ bands] → panner → compressor → master → [master EQ] → out → destination
// `out` is the fixed final node: the master analyser, the stereo meter and the
// recording taps hang off it, so inserting/removing the master EQ (which
// rewires master → out) never cuts them, and recordings include the EQ.

const TRACK_IDS = ['daw', 'mic', 'seq', 'editor', 'piano']

let _ctx    = null
let _master = null
let _out    = null

// Per-track nodes
const _gains  = {}   // id → GainNode  (volume/mute)
const _pans   = {}   // id → StereoPannerNode
const _comps  = {}   // id → DynamicsCompressorNode
const _compOn = {}   // id → boolean  (compressor bypassed when false)
const _analysers = {}

const _vols  = { daw: 1, mic: 1, seq: 1, editor: 1, piano: 1, master: 1 }
const _panVals = { daw: 0, mic: 0, seq: 0, editor: 0, piano: 0 }
const _muted = { daw: false, mic: false, seq: false, editor: false, piano: false }
const _solo  = { daw: false, mic: false, seq: false, editor: false, piano: false }
let _stereoSplit = null

// Effective gain accounting for mute + solo: when any track is soloed, only the
// soloed (and un-muted) tracks are audible.
function _anySolo() { return _solo.daw || _solo.mic || _solo.seq || _solo.editor || _solo.piano }
function _effGain(id) {
  if (_muted[id]) return 0
  if (_anySolo() && !_solo[id]) return 0
  return _vols[id] ?? 1
}
function _applyAllGains() {
  for (const id of ['daw', 'mic', 'seq', 'editor', 'piano']) {
    if (_gains[id]) _gains[id].gain.value = _effGain(id)
  }
}

// ── AudioContext ──────────────────────────────────────────────────────────────

const _ctxReadyCbs = []

/** Run `cb(ctx)` as soon as the shared AudioContext exists (right away if it
 *  already does) — e.g. to apply the chosen output device. */
export function onCtxReady(cb) {
  if (_ctx) { try { cb(_ctx) } catch (e) { console.warn('[audio-bus] onCtxReady:', e) } }
  else _ctxReadyCbs.push(cb)
}

/** The shared AudioContext if it was already created, else null (never creates it). */
export function peekCtx() { return _ctx }

export function getCtx() {
  if (!_ctx) {
    const sr  = parseInt(localStorage.getItem('iceample:audio:sampleRate')  || '0', 10)
    const lat = localStorage.getItem('iceample:audio:latencyHint') || 'interactive'
    _ctx = new AudioContext(sr > 0 ? { sampleRate: sr, latencyHint: lat } : { latencyHint: lat })
    _ctxReadyCbs.splice(0).forEach(cb => { try { cb(_ctx) } catch (e) { console.warn('[audio-bus] onCtxReady:', e) } })
  }
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// ── Master + output nodes ─────────────────────────────────────────────────────

function _getOut() {
  if (!_out) {
    const ctx = getCtx()
    _out = ctx.createGain()
    _out.connect(ctx.destination)
  }
  return _out
}

function _getMaster() {
  if (!_master) {
    const ctx = getCtx()
    _master = ctx.createGain()
    _master.gain.value = _vols.master
    _master.connect(_getOut())
  }
  return _master
}

// ── Per-track FX chain ────────────────────────────────────────────────────────
// trackGain → panner → compressor → master
// EQ is inserted between trackGain and panner (see initEqForTarget).

function _buildTrack(id) {
  const ctx  = getCtx()
  const gain = ctx.createGain()
  gain.gain.value = _effGain(id)

  const pan = ctx.createStereoPanner()
  pan.pan.value = _panVals[id] ?? 0

  const comp = ctx.createDynamicsCompressor()
  // Default: gentle limiting — barely audible unless track clips
  comp.threshold.value = -24
  comp.knee.value      = 30
  comp.ratio.value     = 4
  comp.attack.value    = 0.003
  comp.release.value   = 0.25
  const compEnabled = _compOn[id] ?? false

  if (compEnabled) {
    gain.connect(pan)
    pan.connect(comp)
    comp.connect(_getMaster())
  } else {
    gain.connect(pan)
    pan.connect(_getMaster())
    // comp is idle (not connected)
  }

  _gains[id]  = gain
  _pans[id]   = pan
  _comps[id]  = comp
  _compOn[id] = compEnabled
}

/** Returns the raw track gain node (use this as connection target from sources). */
export function getTrackNode(id) {
  if (!_gains[id]) _buildTrack(id)
  return _gains[id]
}

function _getPan(id)  { if (!_pans[id])  _buildTrack(id); return _pans[id]  }
function _getComp(id) { if (!_comps[id]) _buildTrack(id); return _comps[id] }

// ── Analyser ──────────────────────────────────────────────────────────────────

export function getAnalyser(id) {
  if (!_analysers[id]) {
    const ctx      = getCtx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.75
    if (id === 'master') {
      _getMaster()
      _getOut().connect(analyser)
    } else {
      getTrackNode(id).connect(analyser)
    }
    _analysers[id] = analyser
  }
  return _analysers[id]
}

// ── Volume / mute / solo ───────────────────────────────────────────────────────

// Subscribers notified whenever volume/mute/solo changes (so UIs like the mixer
// stay in sync when these are driven from keyboard shortcuts).
const _mixCbs = new Set()
export function onMixChange(cb) { _mixCbs.add(cb); return () => _mixCbs.delete(cb) }
function _notifyMix(id) { _mixCbs.forEach(fn => { try { fn(id) } catch {} }) }

export function setVolume(id, val) {
  _vols[id] = val
  if (id === 'master') { if (_master) _master.gain.value = _muted.master ? 0 : val; _notifyMix(id); return }
  if (_gains[id]) _gains[id].gain.value = _effGain(id)
  _notifyMix(id)
}

export function setMute(id, muted) {
  _muted[id] = muted
  if (id === 'master') { if (_master) _master.gain.value = muted ? 0 : (_vols.master ?? 1); _notifyMix(id); return }
  _applyAllGains()
  _notifyMix(id)
}

export function setSolo(id, on) {
  if (id === 'master') return
  _solo[id] = on
  _applyAllGains()
  _notifyMix(id)
}

export function getVolume(id)  { return _vols[id]  ?? 1     }
export function getMuted(id)   { return _muted[id] ?? false }
export function getSolo(id)    { return _solo[id]  ?? false }
export function anySolo()      { return _anySolo() }

// ── Pan ───────────────────────────────────────────────────────────────────────

export function setPan(id, val) {
  _panVals[id] = Math.max(-1, Math.min(1, val))
  if (_pans[id]) _pans[id].pan.value = _panVals[id]
}

export function getPan(id) { return _panVals[id] ?? 0 }

// ── Compressor ────────────────────────────────────────────────────────────────

export function setCompressorEnabled(id, enabled) {
  if (_compOn[id] === enabled) return
  _compOn[id] = enabled
  const gain = _gains[id]; if (!gain) return
  const pan  = _pans[id]
  const comp = _comps[id]
  const master = _getMaster()

  // Only the panner's OUTPUT routing changes (… → pan → [comp] → master).
  // The EQ→pan input edge must stay intact, so we never touch the EQ here.
  try { pan.disconnect() } catch {}

  if (enabled) {
    pan.connect(comp); comp.connect(master)
  } else {
    pan.connect(master)
  }
}

export function setCompressorParam(id, param, val) {
  const comp = _getComp(id)
  if (comp[param] && comp[param].setTargetAtTime) {
    comp[param].setTargetAtTime(val, getCtx().currentTime, 0.01)
  }
}

export function getCompressorEnabled(id) { return _compOn[id] ?? false }

export function getCompressorParams(id) {
  const comp = _getComp(id)
  return {
    threshold: comp.threshold.value,
    knee:      comp.knee.value,
    ratio:     comp.ratio.value,
    attack:    comp.attack.value,
    release:   comp.release.value,
  }
}

// ── Per-track EQ (10-band) ────────────────────────────────────────────────────
// Inserted between trackGain and panner.

const EQ_FREQS    = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const _eqByTarget = {}

function _makeEqBands(ctx) {
  return EQ_FREQS.map((freq, i) => {
    const f = ctx.createBiquadFilter()
    f.frequency.value = freq
    f.gain.value = 0
    f.Q.value    = 1.4
    f.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking'
    return f
  })
}

export function initEqForTarget(targetId) {
  if (_eqByTarget[targetId]) return _eqByTarget[targetId]
  const ctx   = getCtx()
  const bands = _makeEqBands(ctx)
  for (let i = 0; i < bands.length - 1; i++) bands[i].connect(bands[i + 1])
  _eqByTarget[targetId] = bands

  const last = bands[bands.length - 1]
  if (targetId === 'master') {
    const master = _getMaster()
    const out    = _getOut()
    try { master.disconnect(out) } catch {}   // only that edge: the taps on `out` stay connected
    master.connect(bands[0])
    last.connect(out)
  } else {
    const gain = getTrackNode(targetId)
    const pan  = _getPan(targetId)
    try { gain.disconnect(pan) } catch {}
    gain.connect(bands[0])
    last.connect(pan)
  }
  return bands
}

export function removeEqForTarget(targetId) {
  const bands = _eqByTarget[targetId]; if (!bands) return
  const last  = bands[bands.length - 1]
  if (targetId === 'master') {
    try { _master?.disconnect(bands[0]) } catch {}
    try { last.disconnect() } catch {}
    _master?.connect(_getOut())
  } else {
    const gain = _gains[targetId]
    const pan  = _getPan(targetId)
    if (gain) {
      try { gain.disconnect(bands[0]) } catch {}
      try { last.disconnect(pan) } catch {}
      gain.connect(pan)
    }
  }
  delete _eqByTarget[targetId]
}

export function setEqGainForTarget(targetId, index, db) {
  const bands = _eqByTarget[targetId]
  if (bands?.[index]) bands[index].gain.value = db
}

export function getEqBandsForTarget(targetId) { return _eqByTarget[targetId] || [] }

// Legacy aliases
export function initEqChain()    { return initEqForTarget('master') }
export function setEqGain(i, db) { setEqGainForTarget('master', i, db) }
export function getEqBands()     { return getEqBandsForTarget('master') }

// ── Master capture (for recording / exporting the full mix) ───────────────────

/** Tap the master output into a MediaStream for recording. Call disconnect()
 *  when done so the extra node is released. */
export function createMasterTap() {
  const ctx  = getCtx()
  const dest = ctx.createMediaStreamDestination()
  _getMaster()
  const out  = _getOut()
  out.connect(dest)
  return { stream: dest.stream, disconnect: () => { try { out.disconnect(dest) } catch {} } }
}

/** A private analyser on a track (or 'master'), owned by the caller: it may
 *  change fftSize / smoothing freely without disturbing the shared analyser
 *  that the mixer meters and the beat detector read. Call analyser.release()
 *  when done (e.g. when the tool's window closes). */
export function createPrivateAnalyser(id = 'master') {
  const ctx = getCtx()
  const analyser = ctx.createAnalyser()
  let src
  if (id === 'master') { _getMaster(); src = _getOut() } else src = getTrackNode(id)
  src.connect(analyser)
  analyser.release = () => { try { src.disconnect(analyser) } catch {} }
  return analyser
}

// ── Stereo correlation (master) ───────────────────────────────────────────────

export function getStereoAnalysers() {
  if (!_stereoSplit) {
    const ctx      = getCtx()
    const splitter = ctx.createChannelSplitter(2)
    _getMaster()
    _getOut().connect(splitter)
    const l = ctx.createAnalyser(); l.fftSize = 2048
    const r = ctx.createAnalyser(); r.fftSize = 2048
    splitter.connect(l, 0); splitter.connect(r, 1)
    _stereoSplit = { l, r }
  }
  return _stereoSplit
}
