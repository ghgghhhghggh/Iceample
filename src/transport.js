// transport.js — global synchronized transport (the master clock).
// Owns a single play position (in seconds) driven by the AudioContext clock, and
// broadcasts play/pause/stop so every opted-in tool (DAW, mic, sequencer,
// metronome) starts from the SAME position, in time. Tools listen for the
// `iceample-transport` window event and call their own play/stop; the position
// is carried in the event detail so timelines can seek to it.

import { getCtx } from './audio-bus.js'

let _playing  = false
let _position = 0   // seconds (frozen value when paused/stopped)
let _startCtx = 0   // AudioContext time corresponding to position 0
let _raf      = null
const _posCbs = new Set()

export function isTransportPlaying() { return _playing }

export function getPosition() {
  return _playing ? (getCtx().currentTime - _startCtx) : _position
}

/** Subscribe to position updates (called on a RAF while playing, and on seeks). */
export function onPosition(cb) { _posCbs.add(cb); return () => _posCbs.delete(cb) }
function _notifyPos() { const p = getPosition(); _posCbs.forEach(fn => { try { fn(p) } catch {} }) }

function _tick() {
  if (!_playing) return
  _notifyPos()
  _raf = requestAnimationFrame(_tick)
}

function broadcast(action) {
  window.dispatchEvent(new CustomEvent('iceample-transport', { detail: { action, position: getPosition() } }))
  window.dispatchEvent(new CustomEvent('iceample-transport-state', { detail: { playing: _playing } }))
}

export function transportPlay() {
  if (_playing) return
  _playing  = true
  _startCtx = getCtx().currentTime - _position
  broadcast('play')
  _tick()
}

export function transportPause() {
  if (!_playing) return
  _position = getCtx().currentTime - _startCtx
  _playing  = false
  if (_raf) cancelAnimationFrame(_raf)
  broadcast('pause')
  _notifyPos()
}

export function transportStop() {
  _playing  = false
  _position = 0
  if (_raf) cancelAnimationFrame(_raf)
  broadcast('stop')
  _notifyPos()
}

export function transportToggle() { _playing ? transportPause() : transportPlay() }

export function seekTransport(t) {
  _position = Math.max(0, t)
  if (_playing) _startCtx = getCtx().currentTime - _position
  _notifyPos()
}
