// history.js — Undo / Redo command stack for Iceample v2
// Usage:
//   import { pushHistory, undo, redo, canUndo, canRedo } from './history.js'
//   pushHistory('clip move', () => moveBack(), () => moveForward())

const MAX = 100          // max steps kept in memory
let _stack   = []        // array of { label, undoFn, redoFn }
let _pos     = -1        // index of the last executed action

// Dispatched whenever the stack changes so the UI can update button states
function _notify() {
  window.dispatchEvent(new CustomEvent('iceample-history-change', {
    detail: { canUndo: canUndo(), canRedo: canRedo() }
  }))
}

/** Record an undoable action.
 *  Call AFTER the action has been applied to state.
 *  @param {string}   label   — human-readable description (for debug / future UI)
 *  @param {Function} undoFn  — restores state to before the action
 *  @param {Function} redoFn  — re-applies the action
 */
export function pushHistory(label, undoFn, redoFn) {
  // Discard any redoable future when a new action branches off
  _stack = _stack.slice(0, _pos + 1)
  _stack.push({ label, undoFn, redoFn })

  // Trim to MAX
  if (_stack.length > MAX) _stack.shift()
  _pos = _stack.length - 1

  _notify()
}

/** Undo the last action. Returns false if nothing to undo. */
export function undo() {
  if (!canUndo()) return false
  try { _stack[_pos].undoFn() } catch (e) { console.error('[history] undo error:', e) }
  _pos--
  _notify()
  return true
}

/** Redo the next action. Returns false if nothing to redo. */
export function redo() {
  if (!canRedo()) return false
  _pos++
  try { _stack[_pos].redoFn() } catch (e) { console.error('[history] redo error:', e) }
  _notify()
  return true
}

export function canUndo() { return _pos >= 0 }
export function canRedo() { return _pos < _stack.length - 1 }

/** Wipe history (e.g. after loading a project). */
export function clearHistory() {
  _stack = []
  _pos   = -1
  _notify()
}
