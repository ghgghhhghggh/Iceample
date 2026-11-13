// commands.js — central registry of runnable commands.
//
// This is the spine of the workbench: any tool/feature registers its actions
// here, and surfaces like the command palette (Ctrl+K) read from it. Keeping it
// dependency-free makes it the natural plug point for the future Tool SDK.
//
// A command:
//   {
//     id:            'open-daw',            // unique
//     run:           () => {...},           // required
//     titleKey?:     'tool_daw',            // i18n key for the label
//     title?:        'Literal label',       // fallback if no titleKey
//     category?:     'cmd_cat_tools',       // i18n key (grouping)
//     icon?:         'fa-solid fa-film',
//     shortcutAction?: 'win-daw',           // shortcuts.js action id → show its binding
//     keywords?:     'open ouvrir audio',   // extra search terms
//   }

const _commands = []

export function registerCommand(cmd) {
  if (!cmd || !cmd.id || typeof cmd.run !== 'function') return
  const i = _commands.findIndex(c => c.id === cmd.id)
  if (i >= 0) _commands[i] = cmd
  else _commands.push(cmd)
}

export function registerCommands(list) {
  if (Array.isArray(list)) list.forEach(registerCommand)
}

export function getCommands() {
  return _commands.slice()
}

export function runCommand(id) {
  const c = _commands.find(c => c.id === id)
  if (c) { try { c.run() } catch (e) { console.error('command failed:', id, e) } }
}

// Remove every command matching a predicate (e.g. on a tool closing).
export function unregisterCommandsBy(pred) {
  for (let i = _commands.length - 1; i >= 0; i--) {
    if (pred(_commands[i])) _commands.splice(i, 1)
  }
}
