// audio-features.js — Turns a sound into numbers an animation can follow.
//
// For every video frame of a sound file (offline, so the result is identical
// at every export) or for the app's live mix:
//   level   overall loudness          0..1
//   bass    20–250 Hz energy          0..1
//   mid     250–4000 Hz energy        0..1
//   treble  4–16 kHz energy           0..1
//   beat    1 on a detected beat, then decays towards 0
// Values are normalised per sound (98th percentile = 1) so a quiet track moves
// an animation as much as a loud one.
//
// Animation tools use createAudioDriver(): load a file (or follow the app's
// mix), play / pause / seek it with the animation, read features() each frame,
// and get its audio track to record a video WITH the sound.

import { createPrivateAnalyser } from './audio-bus.js'
import { routeMedia } from './devices.js'

const FFT_SIZE = 2048
const BANDS = { bass: [20, 250], mid: [250, 4000], treble: [4000, 16000] }

// ── Decoding (small cache: the same file is often opened by several tools) ───
const _files = new Map()   // path → Promise<{ buffer, bytes }>
const MAX_CACHED = 4

export function loadAudioFile(path) {
  if (!_files.has(path)) {
    const p = (async () => {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer.slice(0))
      return { buffer, bytes }
    })()
    p.catch(() => _files.delete(path))
    _files.set(path, p)
    while (_files.size > MAX_CACHED) _files.delete(_files.keys().next().value)
  }
  return _files.get(path)
}

// ── FFT (radix-2, in place) ───────────────────────────────────────────────────
function makeFft(n) {
  const levels = Math.log2(n)
  const rev = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b)
    rev[i] = r
  }
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2)
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n) }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i]
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2, step = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step
          const tr = re[i + j + half] * cos[k] - im[i + j + half] * sin[k]
          const ti = re[i + j + half] * sin[k] + im[i + j + half] * cos[k]
          re[i + j + half] = re[i + j] - tr; im[i + j + half] = im[i + j] - ti
          re[i + j] += tr; im[i + j] += ti
        }
      }
    }
  }
}

function percentile(arr, p) {
  const s = Float32Array.from(arr).sort()
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0
}

function normalise(arr) {
  const ref = percentile(arr, 0.98) || Math.max(...arr) || 1
  for (let i = 0; i < arr.length; i++) arr[i] = Math.min(1, arr[i] / ref)
}

/** Beats from the bass flux: a sudden rise well above its recent average. */
function detectBeats(bass, fps) {
  const n = bass.length, beat = new Float32Array(n)
  const win = Math.max(2, Math.round(fps * 0.4)), gap = Math.max(1, Math.round(fps * 0.22))
  const decay = Math.exp(-1 / (fps * 0.12))
  const flux = new Float32Array(n)
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, bass[i] - bass[i - 1])
  let last = -gap, env = 0
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) { sum += flux[j]; cnt++ }
    const threshold = (sum / cnt) * 1.5 + 0.04
    if (flux[i] > threshold && i - last >= gap) { env = 1; last = i } else env *= decay
    beat[i] = env
  }
  return beat
}

/** Analyse a decoded sound: one value per frame at `fps` (async, yields so the
 *  UI stays responsive; onProgress(0..1) is optional). */
export async function analyseBuffer(buffer, fps = 30, onProgress) {
  const sr = buffer.sampleRate, len = buffer.length
  const mono = new Float32Array(len)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) mono[i] += d[i] / buffer.numberOfChannels
  }
  const frames = Math.max(1, Math.ceil(buffer.duration * fps))
  const out = { fps, duration: buffer.duration, frames,
    level: new Float32Array(frames), bass: new Float32Array(frames),
    mid: new Float32Array(frames), treble: new Float32Array(frames) }
  const fft = makeFft(FFT_SIZE)
  const win = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1))
  const re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE)
  const binHz = sr / FFT_SIZE
  const ranges = Object.fromEntries(Object.entries(BANDS).map(([k, [lo, hi]]) =>
    [k, [Math.max(1, Math.floor(lo / binHz)), Math.min(FFT_SIZE / 2 - 1, Math.ceil(hi / binHz))]]))

  for (let f = 0; f < frames; f++) {
    const start = Math.round(f / fps * sr) - FFT_SIZE / 2
    let sum2 = 0
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = mono[start + i] || 0
      re[i] = s * win[i]; im[i] = 0; sum2 += s * s
    }
    out.level[f] = Math.sqrt(sum2 / FFT_SIZE)
    fft(re, im)
    for (const [band, [a, b]] of Object.entries(ranges)) {
      let e = 0
      for (let k = a; k <= b; k++) e += re[k] * re[k] + im[k] * im[k]
      out[band][f] = Math.sqrt(e / (b - a + 1))
    }
    if (f % 300 === 299) { onProgress?.(f / frames); await new Promise(r => setTimeout(r, 0)) }
  }
  for (const k of ['level', 'bass', 'mid', 'treble']) normalise(out[k])
  out.beat = detectBeats(out.bass, fps)
  onProgress?.(1)
  return out
}

/** Values of an analysis at time `t` (seconds). */
export function featuresAt(a, t) {
  const i = Math.max(0, Math.min(a.frames - 1, Math.floor(t * a.fps)))
  return { level: a.level[i], bass: a.bass[i], mid: a.mid[i], treble: a.treble[i], beat: a.beat[i] }
}

/** Same values, live, from the app's mix (or one track): call read() once per
 *  frame, release() when done. */
export function createLiveFeatures(source = 'master') {
  const an = createPrivateAnalyser(source)
  an.fftSize = FFT_SIZE
  an.smoothingTimeConstant = 0.5
  const freq = new Float32Array(an.frequencyBinCount), time = new Float32Array(an.fftSize)
  const binHz = an.context.sampleRate / an.fftSize
  const peak = { level: 0.02, bass: 0.02, mid: 0.02, treble: 0.02 }
  let prevBass = 0, fluxAvg = 0, beat = 0, lastBeat = 0
  const band = (lo, hi) => {
    const a = Math.max(1, Math.floor(lo / binHz)), b = Math.min(freq.length - 1, Math.ceil(hi / binHz))
    let e = 0
    for (let k = a; k <= b; k++) { const m = Math.pow(10, freq[k] / 20); e += m * m }
    return Math.sqrt(e / (b - a + 1))
  }
  const norm = (k, v) => { peak[k] = Math.max(v, peak[k] * 0.997); return Math.min(1, v / peak[k]) }
  return {
    read() {
      an.getFloatTimeDomainData(time)
      an.getFloatFrequencyData(freq)
      let s2 = 0
      for (let i = 0; i < time.length; i++) s2 += time[i] * time[i]
      const level = norm('level', Math.sqrt(s2 / time.length))
      const bass = norm('bass', band(...BANDS.bass))
      const mid = norm('mid', band(...BANDS.mid))
      const treble = norm('treble', band(...BANDS.treble))
      const flux = Math.max(0, bass - prevBass); prevBass = bass
      fluxAvg = fluxAvg * 0.94 + flux * 0.06
      const now = performance.now()
      if (flux > fluxAvg * 2.2 + 0.05 && now - lastBeat > 220) { beat = 1; lastBeat = now } else beat *= 0.86
      return { level, bass, mid, treble, beat }
    },
    release() { an.release() },
  }
}

/** One object per animation tool: a sound file it plays and follows, or the
 *  app's live mix. Everything an animation needs, in one place. */
export function createAudioDriver() {
  let mode = 'off'            // 'off' | 'file' | 'mix'
  let analysis = null, el = null, url = null, live = null, name = ''
  const listeners = new Set()
  const notify = () => listeners.forEach(fn => { try { fn() } catch {} })

  function clearFile() {
    if (el) { try { el.pause() } catch {}; el.removeAttribute('src') }
    if (url) URL.revokeObjectURL(url)
    el = null; url = null; analysis = null; name = ''
  }
  function clearLive() { live?.release(); live = null }

  return {
    get mode() { return mode },
    get name() { return name },
    get duration() { return analysis ? analysis.duration : 0 },
    get currentTime() { return el ? el.currentTime : 0 },
    get playing() { return !!el && !el.paused },
    get element() { return el },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },

    /** Decode + analyse a file, ready to play. Throws if it can't be read. */
    async loadFile(path, fileName, { fps = 30, onProgress } = {}) {
      const { buffer, bytes } = await loadAudioFile(path)
      const a = await analyseBuffer(buffer, fps, onProgress)
      clearFile(); clearLive()
      analysis = a
      name = fileName || String(path).split(/[\\/]/).pop()
      url = URL.createObjectURL(new Blob([bytes]))
      el = new Audio(url)
      el.preload = 'auto'
      routeMedia(el)   // main output chosen in Settings → Device
      el.addEventListener('ended', notify)
      mode = 'file'
      notify()
    },
    /** Follow the app's live mix instead of a file. */
    useMix() { clearFile(); clearLive(); live = createLiveFeatures('master'); mode = 'mix'; name = ''; notify() },
    clear() { clearFile(); clearLive(); mode = 'off'; notify() },

    play()  { if (el) el.play().catch(() => {}) },
    pause() { if (el) el.pause() },
    seek(t) { if (el) el.currentTime = Math.max(0, Math.min(t, el.duration || t)) },

    /** Current values (null when no sound drives the animation). */
    features() {
      if (mode === 'file' && analysis && el) return featuresAt(analysis, el.currentTime)
      if (mode === 'mix' && live) return live.read()
      return null
    },
    /** The sound as a MediaStream track, to record a video with the sound. */
    audioTrack() {
      if (!el || typeof el.captureStream !== 'function') return null
      return el.captureStream().getAudioTracks()[0] || null
    },
    dispose() { clearFile(); clearLive(); listeners.clear() },
  }
}
