// project.js — Global project save / load / auto-save for Iceample v2
//
// Pattern: each tool registers itself via registerTool(id, { getState, setState }).
// A project snapshot is { name, version, ts, layout, tools: { id: state } }.
// Project files use the .iceproject extension (JSON).
//
// Auto-save is a crash net only: every minute the state of each open tool goes
// to IndexedDB, and the "restore?" banner is offered at startup ONLY when the
// previous session did not close cleanly (crash, kill, power loss).

import { getSavedState } from './layout.js'
import { clearHistory } from './history.js'
import { safeInvoke } from './error-utils.js'

// ── Tool registry ─────────────────────────────────────────────────────────────
const _tools   = {}   // id → { getState, setState, el, rev }
const _pending = {}   // id → restored state waiting for its tool to be opened

/** Register a tool so its state is included in project snapshots.
 *  getState() returns a plain, JSON-serialisable object (or a Promise of one).
 *  setState(state) restores the tool from that object.
 *  el  (optional) — the tool's body element: once it leaves the DOM the tool is
 *      closed and is skipped by snapshots / restores.
 *  rev (optional) — () => number that changes whenever the state changes; lets
 *      the auto-save skip getState() entirely for tools that are costly to
 *      serialise (images) while nothing moved.
 */
export function registerTool(id, { getState, setState, el = null, rev = null }) {
  _tools[id] = { getState, setState, el, rev }
  delete _saved[id]   // a (re)opened tool starts from a clean auto-save cache
  if (id in _pending) {
    // The tool was closed when a snapshot was applied: hand it its state now
    // (deferred, so the tool's own init has finished running).
    const state = _pending[id]; delete _pending[id]
    setTimeout(() => _applyOne(id, state), 0)
  }
}

const _alive = reg => !reg.el || reg.el.isConnected

async function _applyOne(id, state) {
  try { await _tools[id].setState(state) }
  catch (e) { console.warn('[project] setState failed for', id, e) }
}

// ── Auto-save storage (IndexedDB: one record per tool, no 5 MB ceiling) ───────
const AS_DB = 'iceample-autosave', AS_STORE = 'tools', AS_META = '@meta'
const AS_INTERVAL  = 60_000        // 1 min
const AS_MAX_CHARS = 64_000_000    // per tool — beyond this the tool is left out
const _saved = {}                  // id → { rev } | { json } : what IndexedDB holds
let _dbPromise = null
let _saving = false
let _recoveryPending = false       // banner on screen → keep the crashed snapshot intact

function _db() {
  return _dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(AS_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(AS_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => { _dbPromise = null; reject(req.error) }
  })
}
async function _store(mode, fn) {
  const db = await _db()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AS_STORE, mode)
    const out = fn(tx.objectStore(AS_STORE))
    tx.oncomplete = () => resolve(out)
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}
async function _clearStore() {
  for (const id of Object.keys(_saved)) delete _saved[id]
  try { await _store('readwrite', s => { s.clear() }) }
  catch (e) { console.warn('[project] autosave clear failed:', e) }
}

/** Start periodic auto-save. Call once after the workbench is ready. */
export function startAutosave() {
  setInterval(_autoSave, AS_INTERVAL)
}

async function _autoSave() {
  if (_recoveryPending || _saving) return
  _saving = true
  try {
    const puts = {}, live = new Set()
    for (const [id, reg] of Object.entries(_tools)) {
      if (!_alive(reg)) continue
      live.add(id)
      try {
        const rev  = reg.rev ? reg.rev() : null
        const prev = _saved[id]
        if (prev && rev !== null && prev.rev === rev) continue        // untouched
        let json = JSON.stringify(await reg.getState())
        if (json === undefined) continue
        if (prev && rev === null && prev.json === json) continue      // identical
        if (json.length > AS_MAX_CHARS) {
          console.warn('[project] autosave: state too large, skipped:', id)
          json = null
        }
        puts[id] = { json, mark: rev !== null ? { rev } : { json } }
      } catch (e) { console.warn('[project] getState failed for', id, e) }
    }
    const gone = Object.keys(_saved).filter(id => !live.has(id))      // closed tools
    if (!Object.keys(puts).length && !gone.length) return
    await _store('readwrite', s => {
      for (const [id, p] of Object.entries(puts)) { if (p.json === null) s.delete(id); else s.put(p.json, id) }
      for (const id of gone) s.delete(id)
      s.put({ ts: Date.now() }, AS_META)
    })
    for (const [id, p] of Object.entries(puts)) _saved[id] = p.mark
    for (const id of gone) delete _saved[id]
  } catch (e) {
    console.warn('[project] autosave failed:', e)
  } finally { _saving = false }
}

// ── Crash detection ───────────────────────────────────────────────────────────
// Each running session owns a localStorage marker, removed when it closes
// cleanly, and a Web Lock that the browser releases the instant the page dies.
// At startup: a marker whose lock is gone = a session that crashed. A marker
// whose lock is still held = another window that is simply open.
const SESSION_ID  = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const OPEN_PREFIX = 'iceample:session:open:'
const LOCK_PREFIX = 'iceample-session-'
const OFFER_KEY   = 'iceample:recovery:offered'   // banner shown but not answered yet

const _markOpen   = () => { try { localStorage.setItem(OPEN_PREFIX + SESSION_ID, '1') } catch {} }
const _markClosed = () => { try { localStorage.removeItem(OPEN_PREFIX + SESSION_ID) } catch {} }

/** Call once at startup. Resolves to the auto-saved snapshot of a session that
 *  ended abnormally, or null when the previous session closed cleanly (or when
 *  there is nothing to restore). While a snapshot is offered, auto-save is
 *  paused until resolveRecovery() is called. */
export async function checkRecovery() {
  const earlier = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(OPEN_PREFIX)) earlier.push(k.slice(OPEN_PREFIX.length))
    }
    localStorage.removeItem('iceample:autosave')   // pre-IndexedDB slot, no longer read
  } catch {}

  // Lock first, marker second: whoever sees our marker also sees our lock.
  // 'pagehide' also fires when the desktop (Tauri/WebView2) window is closed
  // normally — checked against a killed process, which leaves the marker behind.
  try { navigator.locks.request(LOCK_PREFIX + SESSION_ID, () => new Promise(() => {})) } catch {}
  _markOpen()
  window.addEventListener('pagehide', e => { if (!e.persisted) _markClosed() })
  window.addEventListener('pageshow', e => { if (e.persisted) _markOpen() })

  let held = null
  try { held = new Set((await navigator.locks.query()).held.map(l => l.name)) } catch {}
  // A recovery that was offered but never answered (banner ignored, app closed
  // normally) is offered again rather than silently thrown away.
  let crashed = false, othersOpen = false
  try { crashed = localStorage.getItem(OFFER_KEY) === '1' } catch {}
  for (const id of earlier) {
    if (held && held.has(LOCK_PREFIX + id)) { othersOpen = true; continue }
    crashed = true
    try { localStorage.removeItem(OPEN_PREFIX + id) } catch {}
  }

  if (!crashed) {
    if (!othersOpen) await _clearStore()   // leftovers of a cleanly closed session
    return null
  }
  const tools = {}
  try {
    const rows = await _store('readonly', s => {
      const out = []
      s.openCursor().onsuccess = e => { const c = e.target.result; if (c) { out.push([c.key, c.value]); c.continue() } }
      return out
    })
    for (const [id, json] of rows) {
      if (id === AS_META || typeof json !== 'string') continue
      try { tools[id] = JSON.parse(json) } catch {}
    }
  } catch (e) { console.warn('[project] autosave read failed:', e) }
  if (!Object.keys(tools).length) { try { localStorage.removeItem(OFFER_KEY) } catch {}; return null }
  _recoveryPending = true
  try { localStorage.setItem(OFFER_KEY, '1') } catch {}
  return { name: 'autosave', version: 2, ts: Date.now(), layout: null, tools }
}

/** The user answered the recovery banner (restore or discard): drop the crashed
 *  snapshot and let auto-save run again. */
export async function resolveRecovery() {
  try { localStorage.removeItem(OFFER_KEY) } catch {}
  await _clearStore()
  _recoveryPending = false
}

/** Apply an auto-save recovery snapshot. Returns the ids of the tools that are
 *  not open right now: their state is applied as soon as they are opened. */
export function applyAutosaveRecovery(snap) {
  return _applySnapshot(snap)
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────
async function _snapshot(name) {
  const toolStates = {}
  for (const [id, reg] of Object.entries(_tools)) {
    if (!_alive(reg)) continue
    try { toolStates[id] = await reg.getState() } catch (e) { console.warn('[project] getState failed for', id, e) }
  }
  return {
    name,
    version: 2,
    ts: Date.now(),
    layout: getSavedState(),
    tools: toolStates,
  }
}

function _applySnapshot(snap) {
  if (!snap || snap.version !== 2) throw new Error('Unsupported project format')
  for (const id of Object.keys(_pending)) delete _pending[id]
  for (const [id, state] of Object.entries(snap.tools || {})) {
    const reg = _tools[id]
    if (reg && _alive(reg)) _applyOne(id, state)
    else _pending[id] = state   // applied when that tool is opened
  }
  clearHistory()
  return Object.keys(_pending)
}

/** Encode an image or canvas as a PNG data URL without blocking the UI (the
 *  PNG encoding runs off the main thread). Results are cached per <img>, whose
 *  pixels never change; canvases are re-encoded on every call. */
const _imgUrlCache = new WeakMap()
export async function toDataURLAsync(src) {
  if (!src) return null
  const isImg = src instanceof HTMLImageElement
  if (isImg) {
    if (typeof src.src === 'string' && src.src.startsWith('data:')) return src.src
    if (_imgUrlCache.has(src)) return _imgUrlCache.get(src)
  }
  let canvas = src
  if (!(src instanceof HTMLCanvasElement)) {
    canvas = document.createElement('canvas')
    canvas.width = src.naturalWidth || src.width; canvas.height = src.naturalHeight || src.height
    canvas.getContext('2d').drawImage(src, 0, 0)
  }
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  if (!blob) return null
  const url = await new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error)
    fr.readAsDataURL(blob)
  })
  if (isImg) _imgUrlCache.set(src, url)
  return url
}

// ── File save / load ──────────────────────────────────────────────────────────

/** Save the current project to a .iceproject file (Tauri or browser download). */
export async function saveProjectToFile(name) {
  const snap = await _snapshot(name || 'Project')
  const json = JSON.stringify(snap, null, 2)

  try {
    if (window.__TAURI__) {
      const { save } = window.__TAURI__.dialog
      const path = await save({
        defaultPath: (snap.name || 'project') + '.iceproject',
        filters: [{ name: 'Iceample Project', extensions: ['iceproject'] }],
      })
      if (!path) return false
      const result = await safeInvoke('save_text_file', { path, content: json })
      if (result === null) return false  // safeInvoke showed toast on error
    } else {
      // Browser fallback — download
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = (snap.name || 'project') + '.iceproject'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    }
  } catch (e) {
    console.error('[project] save failed:', e)
    window.toast?.(`${e?.message ?? e}`, 'error')
    return false
  }
  return true
}

/** Load a .iceproject file (Tauri open dialog or file input). */
export async function loadProjectFromFile() {
  let json = null

  try {
    if (window.__TAURI__) {
      const { open } = window.__TAURI__.dialog
      const path = await open({
        multiple: false,
        filters: [{ name: 'Iceample Project', extensions: ['iceproject'] }],
      })
      if (!path) return false
      json = await safeInvoke('read_text_file', { path })
      if (json === null) return false  // safeInvoke showed toast on error
    } else {
      json = await new Promise(resolve => {
        const input = document.createElement('input')
        input.type = 'file'; input.accept = '.iceproject'
        input.addEventListener('change', () => {
          if (!input.files[0]) { resolve(null); return }
          const reader = new FileReader()
          reader.onload = e => resolve(e.target.result)
          reader.readAsText(input.files[0])
        })
        input.click()
      })
    }

    if (!json) return false
    let snap
    try {
      snap = JSON.parse(json)
    } catch (e) {
      console.error('[project] JSON parse failed:', e)
      window.toast?.('Fichier projet invalide (JSON corrompu)', 'error')
      return false
    }
    _applySnapshot(snap)
    return true
  } catch (e) {
    console.error('[project] load failed:', e)
    window.toast?.(`${e?.message ?? e}`, 'error')
    return false
  }
}
