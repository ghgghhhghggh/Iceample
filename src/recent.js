// recent.js — Panneau des fichiers récents
import { t } from './i18n.js'

const STORAGE_KEY = 'iceample:recent_files'
const MAX_ENTRIES  = 30

const TYPE_ICONS = {
  mp3: 'fa-solid fa-music', wav: 'fa-solid fa-music', flac: 'fa-solid fa-music',
  ogg: 'fa-solid fa-music', m4a: 'fa-solid fa-music', aiff: 'fa-solid fa-music',
  aif: 'fa-solid fa-music', aac: 'fa-solid fa-music',
  pdf: 'fa-solid fa-file-pdf',
  docx: 'fa-solid fa-file-word', doc: 'fa-solid fa-file-word',
  odt: 'fa-solid fa-file-alt',
  png: 'fa-solid fa-image', jpg: 'fa-solid fa-image', jpeg: 'fa-solid fa-image',
  gif: 'fa-solid fa-image', webp: 'fa-solid fa-image', bmp: 'fa-solid fa-image',
  mp4: 'fa-solid fa-film', webm: 'fa-solid fa-film', mov: 'fa-solid fa-film',
  iceseq: 'fa-solid fa-wave-square', icedaw: 'fa-solid fa-layer-group',
}

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}
function saveEntries(entries) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch {}
}

import { openWithDefault, openersFor, showOpenWithMenu } from './file-routes.js'

export function trackRecentFile(path, name) {
  if (!path) return
  const ext = path.split('.').pop().toLowerCase()
  const entries = loadEntries().filter(e => e.path !== path)
  entries.unshift({ path, name: name || path.split(/[\\/]/).pop(), ext, opened_at: Date.now() })
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
  saveEntries(entries)
  window.dispatchEvent(new CustomEvent('iceample-recent-updated'))
}

function relativeTime(ts) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (d > 0)  return t('rct_ago_days').replace('{n}', d)
  if (h > 0)  return t('rct_ago_hours').replace('{n}', h)
  if (m > 0)  return t('rct_ago_min').replace('{n}', m)
  return t('rct_just_now')
}

async function openFile(path, ext) {
  if (!window.__TAURI__) { window.toast?.(t('rct_app_only'), 'error'); return }
  // The tool that handles this kind of file (file-routes.js); other files keep
  // the old broadcast (still handled by Metadata).
  const name = String(path).split(/[\\/]/).pop()
  if (!openWithDefault({ path, name })) {
    window.dispatchEvent(new CustomEvent('iceample-open-file', { detail: { path, ext } }))
  }
  trackRecentFile(path)
}

async function openInExplorer(path) {
  if (!window.__TAURI__) return
  try {
    const dir = path.replace(/[\\/][^\\/]+$/, '')
    await window.__TAURI__.core.invoke('open_folder', { path: dir })
  } catch (e) { window.toast?.(t('rct_folder_error') + ' ' + String(e), 'error') }
}

export function initRecent(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);'

  // Toolbar
  const toolbar = document.createElement('div')
  toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--win-border-in,#1e1e1e);flex-shrink:0;'

  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = t('rct_filter')
  searchInput.style.cssText = 'flex:1;background:var(--surface2,#1a1a1a);border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-primary,#ddd);border-radius:5px;padding:5px 10px;font-size:12px;outline:none;'

  const clearBtn = document.createElement('button')
  clearBtn.innerHTML = '<i class="fa-solid fa-trash"></i>'
  clearBtn.title = t('rct_clear_history')
  clearBtn.style.cssText = 'background:none;border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-secondary);padding:5px 8px;border-radius:5px;cursor:pointer;font-size:11px;'
  clearBtn.addEventListener('click', () => {
    if (confirm(t('rct_clear_confirm'))) {
      saveEntries([])
      render()
    }
  })

  toolbar.append(searchInput, clearBtn)

  // List container
  const list = document.createElement('div')
  list.style.cssText = 'flex:1;overflow-y:auto;padding:8px;'

  body.append(toolbar, list)

  function render() {
    const q = searchInput.value.trim().toLowerCase()
    const entries = loadEntries().filter(e =>
      !q || e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q)
    )

    list.innerHTML = ''
    if (!entries.length) {
      const empty = document.createElement('div')
      empty.style.cssText = 'text-align:center;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);font-size:12px;padding:40px 16px;'
      empty.textContent = q ? t('rct_no_results') : t('rct_empty')
      list.appendChild(empty)
      return
    }

    for (const entry of entries) {
      const icon = TYPE_ICONS[entry.ext] || 'fa-solid fa-file'
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;cursor:pointer;transition:background 0.1s;margin-bottom:2px;'
      row.addEventListener('mouseenter', () => row.style.background = 'color-mix(in srgb, var(--text-primary) 5%, transparent)')
      row.addEventListener('mouseleave', () => row.style.background = '')

      const ico = document.createElement('i')
      ico.className = icon
      ico.style.cssText = 'font-size:16px;color:var(--text-secondary);width:18px;text-align:center;flex-shrink:0;'

      // Name/path are file data → textContent / attribute, never innerHTML
      const info = document.createElement('div')
      info.style.cssText = 'flex:1;min-width:0;'
      const nameEl = document.createElement('div')
      nameEl.style.cssText = 'font-size:12px;color:var(--text-primary,#ddd);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
      nameEl.textContent = String(entry.name ?? '')
      const pathEl = document.createElement('div')
      pathEl.style.cssText = 'font-size:10px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
      pathEl.title = String(entry.path ?? '')
      pathEl.textContent = String(entry.path ?? '')
      info.append(nameEl, pathEl)

      const meta = document.createElement('div')
      meta.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;'
      meta.innerHTML = `
        <span style="font-size:10px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);">${relativeTime(entry.opened_at)}</span>
        <div style="display:flex;gap:4px;">
          <button title="${t('rct_open')}" style="background:none;border:1px solid var(--win-border);color:var(--text-secondary);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px;">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </button>
          <button title="${t('rct_show_folder')}" style="background:none;border:1px solid var(--win-border);color:var(--text-secondary);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px;">
            <i class="fa-solid fa-folder-open"></i>
          </button>
          <button title="${t('rct_remove')}" style="background:none;border:1px solid var(--win-border);color:var(--text-secondary);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:10px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `

      const [openBtn, folderBtn, removeBtn] = meta.querySelectorAll('button')
      openBtn.addEventListener('click', e => {
        e.stopPropagation()
        const f = { path: entry.path, name: entry.name || String(entry.path).split(/[\\/]/).pop() }
        if (openersFor(f.name).length > 1) showOpenWithMenu(openBtn, f)
        else openFile(entry.path, entry.ext)
      })
      folderBtn.addEventListener('click', e => { e.stopPropagation(); openInExplorer(entry.path) })
      removeBtn.addEventListener('click', e => {
        e.stopPropagation()
        const updated = loadEntries().filter(en => en.path !== entry.path)
        saveEntries(updated)
        render()
      })

      row.addEventListener('click', () => openFile(entry.path, entry.ext))
      row.append(ico, info, meta)
      list.appendChild(row)
    }
  }

  searchInput.addEventListener('input', render)
  window.addEventListener('iceample-recent-updated', render)
  render()

  // Teardown: tool closed (body left the DOM) → stop listening to the window
  new MutationObserver((_, obs) => {
    if (document.contains(body)) return
    window.removeEventListener('iceample-recent-updated', render)
    obs.disconnect()
  }).observe(document.body, { childList: true, subtree: true })
}
