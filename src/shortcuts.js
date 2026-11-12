// shortcuts.js — Fully customizable keyboard shortcuts for Iceample v2

export const DEFAULT_SHORTCUTS = {
  'command-palette':{ key: 'ctrl+k',            label_key: 'sc_command_palette'},
  'fullscreen':     { key: 'F11',               label_key: 'sc_fullscreen'    },
  'close-menu':     { key: 'Escape',            label_key: 'sc_close_menu'    },
  'save':           { key: 'ctrl+s',            label_key: 'sc_save'          },
  'play-pause':     { key: ' ',                 label_key: 'sc_play_pause'    },
  'piano-oct-up':   { key: 'shift+ArrowRight',  label_key: 'sc_piano_oct_up'  },
  'piano-oct-down': { key: 'shift+ArrowLeft',   label_key: 'sc_piano_oct_down'},
  'metro-tap':      { key: 't',                 label_key: 'sc_metro_tap'     },
  'undo':           { key: 'ctrl+z',            label_key: 'sc_undo'          },
  'redo':           { key: 'ctrl+shift+z',      label_key: 'sc_redo'          },
  'proj-save':      { key: 'ctrl+shift+s',      label_key: 'sc_proj_save'     },
  'transport-stop': { key: '',                  label_key: 'sc_transport_stop'},
  'arrange-windows':{ key: '',                  label_key: 'sc_arrange'       },
  'focus-mode':     { key: 'alt+f',             label_key: 'sc_focus_mode'    },
  'reduce-motion':  { key: 'alt+m',             label_key: 'sc_reduce_motion' },
  // ── Pistes (DAW + micro) ──────────────────────────────────────────────────
  'clip-delete':    { key: 'Delete',            label_key: 'sc_clip_delete'   },
  'marquee-clear':  { key: 'Escape',            label_key: 'sc_marquee_clear' },
  'marquee-cut':    { key: '',                  label_key: 'sc_marquee_cut'   },
  'clip-split':     { key: '',                  label_key: 'sc_clip_split'    },
  'count-in':       { key: '',                  label_key: 'sc_count_in'      },
  'go-to-start':    { key: 'Home',              label_key: 'sc_go_to_start'   },
  'loop-toggle':    { key: '',                  label_key: 'sc_loop_toggle'   },
  'record':         { key: 'r',                 label_key: 'sc_record'        },
  'new-track':      { key: 'shift+t',           label_key: 'sc_new_track'     },
  'select-all':     { key: 'ctrl+a',            label_key: 'sc_select_all'    },
  'clip-duplicate': { key: 'ctrl+d',            label_key: 'sc_clip_duplicate'},
  'clip-nudge-left':{ key: 'alt+ArrowLeft',     label_key: 'sc_nudge_left'    },
  'clip-nudge-right':{key: 'alt+ArrowRight',    label_key: 'sc_nudge_right'   },
  'zoom-in':        { key: 'ctrl+=',            label_key: 'sc_zoom_in'       },
  'zoom-out':       { key: 'ctrl+-',            label_key: 'sc_zoom_out'      },
  // ── Global ────────────────────────────────────────────────────────────────
  'metronome':      { key: 'b',                 label_key: 'sc_metronome'     },
  'open-settings':  { key: 'ctrl+,',            label_key: 'sc_open_settings' },
  'tempo-up':       { key: 'ctrl+ArrowUp',      label_key: 'sc_tempo_up'      },
  'tempo-down':     { key: 'ctrl+ArrowDown',    label_key: 'sc_tempo_down'    },
  'play-from-start':{ key: 'ctrl+Enter',        label_key: 'sc_play_from_start'},
  'play-loop':      { key: 'shift+Enter',       label_key: 'sc_play_loop'     },
  'playhead-left':  { key: 'ArrowLeft',         label_key: 'sc_playhead_left' },
  'playhead-right': { key: 'ArrowRight',        label_key: 'sc_playhead_right'},
  'zoom-reset':     { key: 'ctrl+0',            label_key: 'sc_zoom_reset'    },
  'nudge-fine-left':{ key: 'shift+alt+ArrowLeft',  label_key: 'sc_nudge_fine_left' },
  'nudge-fine-right':{key: 'shift+alt+ArrowRight', label_key: 'sc_nudge_fine_right'},
  'master-mute':    { key: 'ctrl+shift+m',      label_key: 'sc_master_mute'   },
  'toggle-dock':    { key: 'ctrl+alt+b',        label_key: 'sc_toggle_dock'   },
  'focus-next-win': { key: 'ctrl+Tab',          label_key: 'sc_focus_next'    },
  'focus-prev-win': { key: 'ctrl+shift+Tab',    label_key: 'sc_focus_prev'    },
  'win-maximize':   { key: 'ctrl+alt+Enter',    label_key: 'sc_win_maximize'  },
  'master-vol-up':  { key: 'ctrl+alt+ArrowUp',  label_key: 'sc_master_vol_up' },
  'master-vol-down':{ key: 'ctrl+alt+ArrowDown',label_key: 'sc_master_vol_down'},
  'close-all':      { key: 'ctrl+shift+w',      label_key: 'sc_close_all'     },
  // ── Fenêtres-outils (ouvrir/fermer) ──────────────────────────────────────
  'win-daw':        { key: 'ctrl+alt+d',        label_key: 'sc_win_daw'       },
  'win-mic':        { key: 'ctrl+alt+m',        label_key: 'sc_win_mic'       },
  'win-mixer':      { key: 'ctrl+alt+x',        label_key: 'sc_win_mixer'     },
  'win-sequencer':  { key: 'ctrl+alt+s',        label_key: 'sc_win_sequencer' },
  'win-editor':     { key: 'ctrl+alt+e',        label_key: 'sc_win_editor'    },
  'win-piano':      { key: 'ctrl+alt+p',        label_key: 'sc_win_piano'     },
  'win-eq':         { key: 'ctrl+alt+q',        label_key: 'sc_win_eq'        },
  'win-library':    { key: 'ctrl+alt+l',        label_key: 'sc_win_library'   },
  'win-search':     { key: '',                  label_key: 'sc_win_search'    },
  'win-importer':   { key: '',                  label_key: 'sc_win_importer'  },
  'win-notes':      { key: '',                  label_key: 'sc_win_notes'     },
  'win-timer':      { key: '',                  label_key: 'sc_win_timer'     },
  'win-tempo':      { key: '',                  label_key: 'sc_win_tempo'     },
  'win-spectrum':   { key: '',                  label_key: 'sc_win_spectrum'  },
  'win-tuner':      { key: '',                  label_key: 'sc_win_tuner'     },
  // ── Mixeur ────────────────────────────────────────────────────────────────
  'mixdown':        { key: '',                  label_key: 'sc_mixdown'       },
  'mute-seq':       { key: '',                  label_key: 'sc_mute_seq'      },
  'solo-seq':       { key: '',                  label_key: 'sc_solo_seq'      },
  'mute-daw':       { key: '',                  label_key: 'sc_mute_daw'      },
  'solo-daw':       { key: '',                  label_key: 'sc_solo_daw'      },
  'mute-mic':       { key: '',                  label_key: 'sc_mute_mic'      },
  'solo-mic':       { key: '',                  label_key: 'sc_solo_mic'      },
  'mute-editor':    { key: '',                  label_key: 'sc_mute_editor'   },
  'solo-editor':    { key: '',                  label_key: 'sc_solo_editor'   },
  'mute-piano':     { key: '',                  label_key: 'sc_mute_piano'    },
  'solo-piano':     { key: '',                  label_key: 'sc_solo_piano'    },
  // ── Séquenceur ────────────────────────────────────────────────────────────
  'seq-clear':      { key: '',                  label_key: 'sc_seq_clear'     },
  'seq-shift-left': { key: '',                  label_key: 'sc_seq_shift_left'},
  'seq-shift-right':{ key: '',                  label_key: 'sc_seq_shift_right'},
  // ── Éditeur (traitement audio destructif sur la zone de trim) ─────────────
  'ed-normalize':   { key: 'n',                 label_key: 'sc_ed_normalize'  },
  'ed-reverse':     { key: 'shift+r',           label_key: 'sc_ed_reverse'    },
  'ed-fade-in':     { key: 'i',                 label_key: 'sc_ed_fade_in'    },
  'ed-fade-out':    { key: 'o',                 label_key: 'sc_ed_fade_out'   },
  'ed-gain-up':     { key: 'ArrowUp',           label_key: 'sc_ed_gain_up'    },
  'ed-gain-down':   { key: 'ArrowDown',         label_key: 'sc_ed_gain_down'  },
  'ed-silence':     { key: 's',                 label_key: 'sc_ed_silence'    },
  'ed-crop':        { key: 'k',                 label_key: 'sc_ed_crop'       },
  'ed-cut':         { key: 'ctrl+x',            label_key: 'sc_ed_cut'        },
  'ed-copy':        { key: 'ctrl+c',            label_key: 'sc_ed_copy'       },
  'ed-paste':       { key: 'ctrl+v',            label_key: 'sc_ed_paste'      },
  'ed-fade-in-exp': { key: 'shift+i',           label_key: 'sc_ed_fade_in_exp'},
  'ed-fade-out-exp':{ key: 'shift+o',           label_key: 'sc_ed_fade_out_exp'},
  'ed-insert-silence':{ key: 'Insert',          label_key: 'sc_ed_insert_silence'},
  // ── Éditeur d'image ───────────────────────────────────────────────────────
  'ie-draw-straight': { key: 'shift',           label_key: 'sc_ie_draw_straight'},
  // ── Pad d'écriture (markdown) ─────────────────────────────────────────────
  'writer-bold':    { key: 'ctrl+b',            label_key: 'sc_writer_bold'   },
  'writer-italic':  { key: 'ctrl+i',            label_key: 'sc_writer_italic' },
  'writer-heading': { key: '',                  label_key: 'sc_writer_heading'},
  'writer-preview': { key: 'ctrl+e',            label_key: 'sc_writer_preview'},
  'writer-save':    { key: '',                  label_key: 'sc_writer_save'   },
}

let _shortcuts = {}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem('iceample:shortcuts') || '{}')
    _shortcuts = {}
    for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
      _shortcuts[id] = { ...def, key: saved[id]?.key ?? def.key }
    }
  } catch {
    _shortcuts = Object.fromEntries(
      Object.entries(DEFAULT_SHORTCUTS).map(([id, def]) => [id, { ...def }])
    )
  }
}
load()

export function getShortcut(action) {
  return _shortcuts[action]?.key ?? DEFAULT_SHORTCUTS[action]?.key
}

export function setShortcut(action, key) {
  if (!_shortcuts[action]) return
  _shortcuts[action].key = key
  const toSave = {}
  for (const [id, data] of Object.entries(_shortcuts)) toSave[id] = { key: data.key }
  localStorage.setItem('iceample:shortcuts', JSON.stringify(toSave))
}

export function resetShortcuts() {
  localStorage.removeItem('iceample:shortcuts')
  load()
}

export function getAllShortcuts() { return _shortcuts }

export function matchesShortcut(action, e) {
  return keyEventMatches(e, getShortcut(action))
}

export function keyEventMatches(e, binding) {
  if (!binding) return false
  const parts   = binding.split('+')
  const mainKey = parts[parts.length - 1]
  const ctrl    = parts.includes('ctrl')
  const shift   = parts.includes('shift')
  const alt     = parts.includes('alt')
  const keyMatch = e.key === mainKey || e.key.toLowerCase() === mainKey.toLowerCase()
  return keyMatch && e.ctrlKey === ctrl && e.shiftKey === shift && e.altKey === alt
}

export function eventToBinding(e) {
  const mod = e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta'
  if (mod) return null
  const parts = []
  if (e.ctrlKey)  parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey)   parts.push('alt')
  parts.push(e.key)
  return parts.join('+')
}

export function formatBinding(binding) {
  if (!binding) return '—'
  return binding.split('+').map(p => {
    if (p === ' ')        return 'Space'
    if (p === 'Escape')   return 'Esc'
    if (p === 'Delete')   return 'Del'
    if (p === 'Backspace') return '⌫'
    if (p === 'ArrowUp')   return '↑'
    if (p === 'ArrowDown') return '↓'
    if (p === 'ArrowLeft') return '←'
    if (p === 'ArrowRight') return '→'
    if (p === 'ctrl')  return 'Ctrl'
    if (p === 'shift') return 'Shift'
    if (p === 'alt')   return 'Alt'
    return p
  }).join(' + ')
}
