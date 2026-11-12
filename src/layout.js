// layout.js — Window layout persistence for Iceample v2
// Saves / restores positions + sizes of all tool windows.

const LS_CURRENT  = 'iceample:layout:current'
const LS_PRESETS  = 'iceample:layout:presets'
const LS_DOCK_POS = 'iceample:layout:dockPos'

/** Serialize all open tool windows into an array. */
export function captureLayout(workbench) {
  const wins = []
  workbench.querySelectorAll('.tool-win[data-tool-id]').forEach(win => {
    wins.push({
      id: win.dataset.toolId,
      x:  parseInt(win.style.left)  || 0,
      y:  parseInt(win.style.top)   || 0,
      w:  win.offsetWidth,
      h:  win.offsetHeight,
    })
  })
  return wins
}

/** Auto-save current layout. Called after every drag / resize / open / close. */
export function autoSaveLayout(workbench) {
  localStorage.setItem(LS_CURRENT, JSON.stringify(captureLayout(workbench)))
}

/** Return saved position+size for a given toolId, or null. */
export function getSavedState(toolId) {
  try {
    const data = JSON.parse(localStorage.getItem(LS_CURRENT)) || []
    return data.find(w => w.id === toolId) || null
  } catch { return null }
}

/** Return the full current saved layout array. */
export function getFullLayout() {
  try { return JSON.parse(localStorage.getItem(LS_CURRENT)) || [] }
  catch { return [] }
}

/** Save the current layout under a named preset. */
export function saveNamedLayout(name, workbench) {
  const presets = getNamedLayouts()
  presets[name] = captureLayout(workbench)
  localStorage.setItem(LS_PRESETS, JSON.stringify(presets))
}

/** Return all named layout presets as { name: wins[] }. */
export function getNamedLayouts() {
  try { return JSON.parse(localStorage.getItem(LS_PRESETS)) || {} }
  catch { return {} }
}

/** Delete a named preset. */
export function deleteNamedLayout(name) {
  const p = getNamedLayouts()
  delete p[name]
  localStorage.setItem(LS_PRESETS, JSON.stringify(p))
}

/** Clear current layout (used when a preset is loaded). */
export function clearCurrentLayout() {
  localStorage.removeItem(LS_CURRENT)
}

/** Save dock position. */
export function saveDockPos(x, y) {
  localStorage.setItem(LS_DOCK_POS, JSON.stringify({ x, y }))
}

/** Load dock position, or null. */
export function loadDockPos() {
  try { return JSON.parse(localStorage.getItem(LS_DOCK_POS)) || null }
  catch { return null }
}
