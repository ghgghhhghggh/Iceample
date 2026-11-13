// beat-detector.js — sub-bass kick detector with adaptive threshold.
//
// Taps an existing analyser (same audio source as the visualisers), isolates
// the sub energy (first FFT bins) and fires onBeat() on each kick. A slow
// moving average adapts to the track's overall volume so it stays reactive on
// both quiet and loud songs.
//
// Two knobs to tune to your material (live-adjustable via `detector.cfg`):
//   • threshold    (1.35) — energy must exceed avg × threshold to count as a kick.
//                            Lower it if soft kicks are missed.
//   • minInterval  (250)  — minimum ms between two kicks.
//                            Raise it if long/boomy bass double-triggers.

import { getAnalyser } from './audio-bus.js'

export function createBeatDetector(opts = {}) {
  const cfg = {
    source:      'master',  // which bus analyser to tap
    bins:        8,         // number of low FFT bins = "sub" band
    threshold:   1.35,      // kick = energy > average × threshold
    minInterval: 250,       // ms — debounce between kicks
    follow:      0.92,      // moving-average inertia (higher = slower to adapt)
    minEnergy:   0.04,      // ignore near-silence
    onBeat:      () => {},
    ...opts,
  }

  const analyser = getAnalyser(cfg.source)
  const freq = new Uint8Array(analyser.frequencyBinCount)
  let avg = 0, last = 0, raf = null, running = true

  function tick() {
    if (!running) return
    raf = requestAnimationFrame(tick)

    analyser.getByteFrequencyData(freq)
    const n = Math.max(1, Math.min(cfg.bins, freq.length))
    let sum = 0
    for (let i = 0; i < n; i++) sum += freq[i]
    const energy = sum / (n * 255)            // 0 … 1

    // Adaptive baseline: slow follow so it tracks the song's loudness.
    avg = avg * cfg.follow + energy * (1 - cfg.follow)

    const now = performance.now()
    if (energy > avg * cfg.threshold && energy > cfg.minEnergy && now - last >= cfg.minInterval) {
      last = now
      const strength = avg > 0 ? Math.min(1, (energy / avg - 1)) : 0
      cfg.onBeat({ energy, average: avg, strength, time: now })
    }
  }
  tick()

  return {
    cfg,                                   // live-tunable (cfg.threshold, cfg.minInterval…)
    stop()  { running = false; if (raf) cancelAnimationFrame(raf); raf = null },
    start() { if (!running) { running = true; tick() } },
  }
}
