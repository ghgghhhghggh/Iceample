// devices.js — Applies Settings → Devices to the actual sound.
//
// Every sound in Iceample is played and captured by the webview, so the device
// lists come from its own enumeration: its deviceIds are the only identifiers
// getUserMedia and setSinkId understand. Choices keep the settings page's
// localStorage keys ('' = not set):
//   dev:mic1  microphone used by every tool (system default when empty)
//   dev:mic2  optional second input, picked per tool with the 1/2 button
//   dev:out1  main output (system default when empty)
//   dev:out2  secondary output: plays a copy of the app's mix (off when empty)
// Older versions stored native list indices ("0", "1"…): they match no
// device and are cleared once at startup.

import { onCtxReady, peekCtx, createMasterTap } from './audio-bus.js'
import { t } from './i18n.js'

const KEYS = { mic1: 'dev:mic1', mic2: 'dev:mic2', out1: 'dev:out1', out2: 'dev:out2' }
const SLOT_PREFIX = 'dev:input-slot:'

const read  = k => { try { return localStorage.getItem(k) || '' } catch { return '' } }
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch {} }

export function getDevice(name) { return read(KEYS[name]) }

export function setDevice(name, id) {
  write(KEYS[name], id || '')
  if (name === 'out1' || name === 'out2') applyOutputs()
  window.dispatchEvent(new CustomEvent('iceample-devices-changed', { detail: { name } }))
}

// ── Inputs ────────────────────────────────────────────────────────────────────

/** Which input (1 or 2) a tool records from. 2 only while input 2 is set. */
export function getInputSlot(tool) {
  return read(SLOT_PREFIX + tool) === '2' && getDevice('mic2') ? 2 : 1
}

function setInputSlot(tool, slot) { write(SLOT_PREFIX + tool, slot === 2 ? '2' : '') }

/** Audio constraints for `tool`, carrying the chosen device. `ideal` (not
 *  `exact`): an unplugged device falls back to the default one instead of
 *  failing the recording. */
export function micConstraints(tool, extra = {}) {
  const id = getDevice(getInputSlot(tool) === 2 ? 'mic2' : 'mic1')
  const c = { ...extra }
  if (id) c.deviceId = { ideal: id }
  return Object.keys(c).length ? c : true
}

/** getUserMedia for `tool` with the chosen microphone. */
export function getMicStream(tool, extra = {}, video = false) {
  return navigator.mediaDevices.getUserMedia({ audio: micConstraints(tool, extra), video })
}

/** Small "1 / 2" button picking the input a tool records from. Hidden while
 *  no second input is set in the settings. */
export function makeInputSwitch(tool, className = 'seq-btn') {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = `${className} dev-input-switch`
  const render = () => {
    b.style.display = getDevice('mic2') ? '' : 'none'
    b.innerHTML = `<i class="fa-solid fa-microphone"></i>${getInputSlot(tool)}`
    b.title = t('dev_input_switch')
  }
  b.addEventListener('click', e => {
    e.stopPropagation()
    setInputSlot(tool, getInputSlot(tool) === 2 ? 1 : 2)
    render()
  })
  let seen = false   // stop listening once the tool's window has been closed
  const onChange = () => {
    if (b.isConnected) { seen = true; render() }
    else if (seen) window.removeEventListener('iceample-devices-changed', onChange)
  }
  window.addEventListener('iceample-devices-changed', onChange)
  render()
  return b
}

// ── Outputs ───────────────────────────────────────────────────────────────────

const _contexts = new Set()   // extra AudioContexts owned by tools (delay, tuner)

async function setSink(target, id) {
  if (!target || typeof target.setSinkId !== 'function') return
  const current = typeof target.sinkId === 'string' ? target.sinkId : ''
  if (current === id) return
  try { await target.setSinkId(id) }
  catch (e) {
    console.warn('[devices] output unavailable, using the default one:', e?.name || e)
    if (id) { try { await target.setSinkId('') } catch {} }
  }
}

/** Send a media element (<audio>/<video>) to the main output. Elements in the
 *  page are handled automatically when they play; call this for detached
 *  ones (`new Audio()`). */
export function routeMedia(el) {
  if (el && !el._iceSecondary) setSink(el, getDevice('out1'))
}

/** Register an AudioContext a tool created itself, so it follows the main output. */
export function routeContext(ctx) {
  if (!ctx) return
  _contexts.add(ctx)
  setSink(ctx, getDevice('out1'))
}

let _second = null   // { tap, el } while the secondary output is playing

function stopSecondary() {
  if (!_second) return
  try { _second.el.pause(); _second.el.srcObject = null } catch {}
  try { _second.tap.disconnect() } catch {}
  _second = null
}

async function applySecondary() {
  const id = getDevice('out2')
  const ctx = peekCtx()
  if (!id || !ctx) { stopSecondary(); return }
  // Same physical device as the main output → the sound would play twice.
  try {
    const outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput')
    const main = outs.find(d => d.deviceId === (getDevice('out1') || 'default'))
    const second = outs.find(d => d.deviceId === id)
    if (!second || (main && main.groupId && main.groupId === second.groupId)) { stopSecondary(); return }
  } catch {}
  if (!_second) {
    const tap = createMasterTap()
    const el = new Audio()
    el._iceSecondary = true
    el.srcObject = tap.stream
    _second = { tap, el }
  }
  const el = _second.el
  await setSink(el, id)
  el.play().catch(() => {
    // No user gesture yet: start on the next click.
    document.addEventListener('pointerdown', () => { if (_second?.el === el) el.play().catch(() => {}) }, { once: true })
  })
}

function applyOutputs() {
  const id = getDevice('out1')
  const ctx = peekCtx()
  if (ctx) setSink(ctx, id)
  for (const c of _contexts) {
    if (c.state === 'closed') _contexts.delete(c)
    else setSink(c, id)
  }
  document.querySelectorAll('audio, video').forEach(el => routeMedia(el))
  applySecondary()
}

// ── Startup ───────────────────────────────────────────────────────────────────

let _started = false
export function initDevices() {
  if (_started) return
  _started = true
  // Native list indices saved by older versions mean nothing to the webview.
  for (const k of Object.values(KEYS)) if (/^\d+$/.test(read(k))) write(k, '')
  onCtxReady(() => applyOutputs())
  // Media elements in the page pick up the output as they start playing.
  document.addEventListener('play', e => { if (e.target instanceof HTMLMediaElement) routeMedia(e.target) }, true)
  navigator.mediaDevices?.addEventListener?.('devicechange', () => applyOutputs())
}
