// project.js — Global project save / load / auto-save for Iceample v2
//
// Pattern: each tool registers itself via registerTool(id, { getState, setState }).
// A project snapshot is { name, version, ts, layout, tools: { id: state } }.
// Project files use the .iceproject extension (JSON).

import { getSavedState } from './layout.js'
import { clearHistory } from './history.js'
import { safeInvoke } from './error-utils.js'

// ── Tool registry ─────────────────────────────────────────────────────────────
const _tools = {}   // id → { getState, setState }

/** Register a tool so its state is included in project snapshots.
 *  getState() must return a plain, JSON-serialisable object.
 *  setState(state) must restore the tool from that object.
 */
export function registerTool(id, { getState, setState }) {
  _tools[id] = { getState, setState }
}

// ── Auto-save ─────────────────────────────────────────────────────────────────
const AS_KEY   = 'iceample:autosave'
const AS_DIRTY = 'iceample:autosave:dirty'
let   _workbench = null
let   _asTimer   = null
const AS_INTERVAL = 60_000   // 1 min

/** Start periodic auto-save. Call once after the workbench is ready. */
export function startAutosave(workbench) {
  _workbench = workbench

  // Dirty flag — set on any user interaction
  document.addEventListener('mousedown', _markDirty, { passive: true })
  document.addEventListener('keydown',   _markDirty, { passive: true })

  _asTimer = setInterval(_autoSave, AS_INTERVAL)
  // Also save when the window/tab is about to close
  window.addEventListener('beforeunload', _autoSave)
}

function _markDirty() {
  sessionStorage.setItem(AS_DIRTY, '1')
}

function _autoSave() {
  if (!sessionStorage.getItem(AS_DIRTY)) return  // nothing changed
  try {
    const snap = _snapshot('autosave')
    localStorage.setItem(AS_KEY, JSON.stringify(snap))
    sessionStorage.removeItem(AS_DIRTY)
  } catch (e) {
    console.warn('[project] autosave failed:', e)
  }
}

/** Returns a recovery snapshot if one exists from a previous (crashed) session.
 *  The snapshot is considered a recovery candidate only if the session storage
 *  flag isn't present (meaning it was written in a DIFFERENT session). */
export function getAutosaveRecovery() {
  if (sessionStorage.getItem('iceample:session:started')) return null  // same session
  const raw = localStorage.getItem(AS_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

/** Mark session as started so we don't offer recovery from the same run. */
export function markSessionStarted() {
  sessionStorage.setItem('iceample:session:started', '1')
}

/** Clear the auto-save slot (called after the user explicitly discards it). */
export function discardAutosave() {
  localStorage.removeItem(AS_KEY)
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────
function _snapshot(name) {
  const toolStates = {}
  for (const [id, reg] of Object.entries(_tools)) {
    try { toolStates[id] = reg.getState() } catch (e) { console.warn('[project] getState failed for', id, e) }
  }
  return {
    name,
    version: 2,
    ts: Date.now(),
    layout: _workbench ? getSavedState() : null,
    tools: toolStates,
  }
}

function _applySnapshot(snap) {
  if (!snap || snap.version !== 2) throw new Error('Unsupported project format')
  const tools = snap.tools || {}
  for (const [id, state] of Object.entries(tools)) {
    if (_tools[id]) {
      try { _tools[id].setState(state) } catch (e) { console.warn('[project] setState failed for', id, e) }
    }
  }
  clearHistory()
}

// ── File save / load ──────────────────────────────────────────────────────────

/** Save the current project to a .iceproject file (Tauri or browser download). */
export async function saveProjectToFile(name) {
  const snap = _snapshot(name || 'Project')
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

/** Apply an auto-save recovery snapshot. */
export function applyAutosaveRecovery(snap) {
  _applySnapshot(snap)
}
