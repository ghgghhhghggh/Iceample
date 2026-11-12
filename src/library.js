import { t } from './i18n.js'
import { sendMedia } from './media-bus.js'

const LIBRARY_CATEGORIES = [
  { id: 'imported',  label: 'Importés'        },
  { id: 'modified',  label: 'Modifiés'         },
  { id: 'sounds',    label: 'Sons'             },
  { id: 'voices',    label: 'Voix'             },
  { id: 'images',    label: 'Images'           },
  { id: 'models3d',  label: '3D'               },
  { id: 'sequences', label: 'Séquences'        },
  { id: 'seqaudio',  label: 'Séquences Audio'  },
  { id: 'ringtones', label: 'Sonneries'        },
  { id: 'pistes',    label: 'Pistes'           },
]

const STORAGE_KEY  = 'library:root'
const ORDER_KEY    = 'library:tile-order'

function getOrderedCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY))
    if (!Array.isArray(saved)) return LIBRARY_CATEGORIES
    const map = Object.fromEntries(LIBRARY_CATEGORIES.map(c => [c.id, c]))
    return [
      ...saved.filter(id => map[id]).map(id => map[id]),
      ...LIBRARY_CATEGORIES.filter(c => !saved.includes(c.id))
    ]
  } catch { return LIBRARY_CATEGORIES }
}

function saveTileOrder(cats) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(cats.map(c => c.id)))
}

export function initLibrary(container, openWindow) {
  container.innerHTML = ''
  container.classList.add('lib-container')
  render(container, openWindow)
}

const USER_FOLDERS_KEY = 'library:folders'
function getUserFolders() {
  try { return JSON.parse(localStorage.getItem(USER_FOLDERS_KEY)) || [] } catch { return [] }
}
function saveUserFolders(arr) { localStorage.setItem(USER_FOLDERS_KEY, JSON.stringify(arr)) }

async function render(container, openWindow) {
  container.innerHTML = ''
  let root = localStorage.getItem(STORAGE_KEY)
  // Works out of the box: silently create a default library if none is set.
  if (!root && window.__TAURI__) {
    try {
      root = await window.__TAURI__.core.invoke('setup_default_library')
      if (root) localStorage.setItem(STORAGE_KEY, root)
    } catch {}
  }
  if (!root) { renderSetup(container, openWindow); return }
  renderGrid(container, root, openWindow)
}

function renderSetup(container, openWindow) {
  const wrap = document.createElement('div')
  wrap.className = 'lib-setup'
  wrap.innerHTML = `
    <i class="fa-solid fa-folder-open lib-setup-icon"></i>
    <span class="lib-setup-text">${t('lib_setup_text')}</span>
    <button class="lib-setup-btn" id="lib-pick-btn">
      <i class="fa-solid fa-folder-plus"></i> ${t('lib_pick_btn')}
    </button>
  `
  container.appendChild(wrap)
  wrap.querySelector('#lib-pick-btn').addEventListener('click', async () => {
    if (!window.__TAURI__) return
    try {
      const { invoke } = window.__TAURI__.core
      const path = await invoke('pick_and_setup_library')
      localStorage.setItem(STORAGE_KEY, path)
      render(container, openWindow)
    } catch {}
  })
}

function renderGrid(container, root, openWindow) {
  const grid = document.createElement('div')
  grid.className = 'lib-grid'

  const sep = root.includes('\\') ? '\\' : '/'
  let currentFolderWin = null
  let currentFolderCtl = null   // { show, rootPath, getCurrent } of the open folder window
  let orderedCats = getOrderedCategories()

  function openCatFolder(cat, initialPath = null) {
    document.querySelectorAll('.lib-tile').forEach(tile => tile.classList.remove('active'))
    const tile = grid.querySelector(`[data-cat-id="${cat.id}"]`)
    if (tile) tile.classList.add('active')
    if (currentFolderWin) currentFolderWin.remove()
    const folderPath = root + sep + cat.label
    currentFolderWin = openWindow(
      cat.label, 'fa-solid fa-folder', 300, 360,
      body => populateFolderWindow(body, folderPath, sep, openWindow, { initialPath, onReady: ctl => { currentFolderCtl = ctl } })
    )
    const obs = new MutationObserver(() => {
      if (!document.contains(currentFolderWin)) {
        document.querySelectorAll('.lib-tile').forEach(tile => tile.classList.remove('active'))
        currentFolderWin = null; currentFolderCtl = null
        obs.disconnect()
      }
    })
    obs.observe(document.body, { childList: true, subtree: true })
  }

  function openUserFolder(uf) {
    document.querySelectorAll('.lib-tile').forEach(tile => tile.classList.remove('active'))
    if (currentFolderWin) currentFolderWin.remove()
    currentFolderWin = openWindow(
      uf.label, 'fa-solid fa-folder-tree', 320, 380,
      body => populateFolderWindow(body, uf.path, sep, openWindow, { onReady: ctl => { currentFolderCtl = ctl } })
    )
    const obs = new MutationObserver(() => {
      if (!document.contains(currentFolderWin)) {
        document.querySelectorAll('.lib-tile').forEach(tile => tile.classList.remove('active'))
        currentFolderWin = null; currentFolderCtl = null
        obs.disconnect()
      }
    })
    obs.observe(document.body, { childList: true, subtree: true })
  }

  // Auto-refresh / auto-navigate when a sample is written anywhere in the app.
  function onLibChange(e) {
    const folder = e.detail && e.detail.folder
    const refresh = () => { if (currentFolderCtl) currentFolderCtl.show(currentFolderCtl.getCurrent()) }
    if (!folder) { refresh(); return }
    // Already inside (or at) the open window's tree → just navigate there.
    if (currentFolderCtl && (folder === currentFolderCtl.rootPath || folder.startsWith(currentFolderCtl.rootPath + sep))) {
      currentFolderCtl.show(folder); return
    }
    // Map the folder to a category tile and open it at the saved location.
    if (folder.startsWith(root + sep)) {
      const topLabel = folder.slice(root.length + sep.length).split(sep)[0]
      const cat = orderedCats.find(c => c.label === topLabel)
      if (cat) { openCatFolder(cat, folder); return }
    }
    refresh()   // outside the known categories → at least refresh what's open
  }
  window.addEventListener('iceample-library-changed', onLibChange)

  function buildTiles() {
    grid.innerHTML = ''
    orderedCats.forEach(cat => {
      const tile = document.createElement('button')
      tile.className = 'lib-tile'
      tile.dataset.catId = cat.id
      tile.innerHTML = `
        <i class="fa-solid fa-folder lib-tile-icon"></i>
        <span class="lib-tile-label">${cat.label}</span>
      `

      // Hold-to-drag (250ms) + click-to-open
      let holdTimer = null
      let dragging  = false

      tile.addEventListener('mousedown', e => {
        if (e.button !== 0) return
        dragging = false
        holdTimer = setTimeout(() => {
          dragging = true
          startTileDrag(e, cat, tile)
        }, 250)
      })

      tile.addEventListener('click', () => {
        if (dragging) return
        openCatFolder(cat)
      })

      tile.addEventListener('mouseleave', () => { clearTimeout(holdTimer) })
      tile.addEventListener('mouseup',    () => { if (!dragging) clearTimeout(holdTimer) })

      grid.appendChild(tile)
    })

    // User folders — bookmarks to the user's own existing folders, browsed in place
    getUserFolders().forEach(uf => {
      const ut = document.createElement('button')
      ut.className = 'lib-tile lib-tile-user'
      ut.title = uf.path
      ut.innerHTML = `
        <i class="fa-solid fa-folder-tree lib-tile-icon"></i>
        <span class="lib-tile-label">${uf.label}</span>
        <span class="lib-tile-remove" title="${t('lib_remove') || 'Retirer'}">&times;</span>
      `
      ut.addEventListener('click', e => {
        if (e.target.closest('.lib-tile-remove')) return
        openUserFolder(uf)
      })
      ut.querySelector('.lib-tile-remove').addEventListener('click', e => {
        e.stopPropagation()
        saveUserFolders(getUserFolders().filter(f => f.path !== uf.path))
        buildTiles()
      })
      grid.appendChild(ut)
    })

    // Emplacement tile — click opens the library folder in the file manager;
    // right-click lets you change where the app stores its files.
    const locationTile = document.createElement('button')
    locationTile.className = 'lib-tile lib-tile-location'
    locationTile.title = `${root}\n(${t('lib_change_loc') || 'clic droit : changer'})`
    locationTile.innerHTML = `
      <i class="fa-solid fa-folder-open lib-tile-icon"></i>
      <span class="lib-tile-label">${t('lib_location')}</span>
    `
    locationTile.addEventListener('click', () => {
      if (window.__TAURI__) window.__TAURI__.core.invoke('open_folder', { path: root }).catch(() => {})
    })
    locationTile.addEventListener('contextmenu', async e => {
      e.preventDefault()
      if (!window.__TAURI__) return
      try {
        const path = await window.__TAURI__.core.invoke('pick_and_setup_library')
        if (path) { localStorage.setItem(STORAGE_KEY, path); render(container, openWindow) }
      } catch {}
    })
    grid.appendChild(locationTile)

    // "+ Add folder" — bookmark one of your own folders (always last)
    const addTile = document.createElement('button')
    addTile.className = 'lib-tile lib-tile-add'
    addTile.innerHTML = `<i class="fa-solid fa-plus lib-tile-icon"></i><span class="lib-tile-label">${t('lib_add_folder') || 'Ajouter un dossier'}</span>`
    addTile.addEventListener('click', async () => {
      if (!window.__TAURI__) return
      try {
        const path = await window.__TAURI__.core.invoke('pick_folder')
        if (!path) return
        const label = (path.split(/[\\/]/).filter(Boolean).pop() || path).slice(0, 18)
        const folders = getUserFolders()
        if (!folders.some(f => f.path === path)) { folders.push({ path, label }); saveUserFolders(folders) }
        buildTiles()
      } catch {}
    })
    grid.appendChild(addTile)
  }

  // ── Tile drag & drop ────────────────────────────────────────────────────
  function startTileDrag(e, cat, tile) {
    const ghost = document.createElement('div')
    ghost.className = 'lib-tile-ghost'
    ghost.style.width  = tile.offsetWidth  + 'px'
    ghost.style.height = tile.offsetHeight + 'px'
    ghost.innerHTML = tile.innerHTML
    ghost.style.left = (e.clientX - tile.offsetWidth  / 2) + 'px'
    ghost.style.top  = (e.clientY - tile.offsetHeight / 2) + 'px'
    document.body.appendChild(ghost)
    tile.classList.add('lib-tile-dragging')

    function onMove(ev) {
      ghost.style.left = (ev.clientX - tile.offsetWidth  / 2) + 'px'
      ghost.style.top  = (ev.clientY - tile.offsetHeight / 2) + 'px'
      const under = document.elementFromPoint(ev.clientX, ev.clientY)
      const overTile = under?.closest('.lib-tile[data-cat-id]')
      grid.querySelectorAll('.lib-tile').forEach(tile => tile.classList.remove('lib-tile-drop-target'))
      if (overTile && overTile !== tile) overTile.classList.add('lib-tile-drop-target')
    }

    function onUp(ev) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      ghost.remove()
      tile.classList.remove('lib-tile-dragging')
      grid.querySelectorAll('.lib-tile').forEach(tile => tile.classList.remove('lib-tile-drop-target'))

      const under   = document.elementFromPoint(ev.clientX, ev.clientY)
      const overTile = under?.closest('.lib-tile[data-cat-id]')
      if (overTile && overTile.dataset.catId !== cat.id) {
        const srcIdx = orderedCats.findIndex(c => c.id === cat.id)
        const dstIdx = orderedCats.findIndex(c => c.id === overTile.dataset.catId)
        if (srcIdx >= 0 && dstIdx >= 0) {
          orderedCats.splice(srcIdx, 1)
          orderedCats.splice(dstIdx, 0, cat)
          saveTileOrder(orderedCats)
          buildTiles()
        }
      }
      // suppress next click
      document.addEventListener('click', ev => ev.stopPropagation(), { once: true, capture: true })
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  buildTiles()
  container.appendChild(grid)

  // Fermer dossier si on déplace la fenêtre librairie
  const titlebar = container.closest('.tool-win')?.querySelector('.tool-win-titlebar')
  if (titlebar) {
    titlebar.addEventListener('mousedown', () => {
      if (currentFolderWin) {
        currentFolderWin.remove()
        document.querySelectorAll('.lib-tile').forEach(tile => tile.classList.remove('active'))
        currentFolderWin = null
      }
    })
  }

  const libCloseObs = new MutationObserver(() => {
    if (!document.contains(container)) {
      if (currentFolderWin) currentFolderWin.remove()
      window.removeEventListener('iceample-library-changed', onLibChange)
      libCloseObs.disconnect()
    }
  })
  libCloseObs.observe(document.body, { childList: true, subtree: true })
}

// ── Folder window ──────────────────────────────────────────────────────────
async function populateFolderWindow(body, rootPath, sep, openWindow, opts = {}) {
  body.classList.add('lib-browser-body')

  if (!window.__TAURI__) {
    body.innerHTML = `<div class="lib-browser-empty"><i class="fa-solid fa-triangle-exclamation"></i> ${t('lib_app_only')}</div>`
    return
  }
  const { invoke } = window.__TAURI__.core

  // Browse a folder (and let the user dive into sub-folders, without going
  // above the folder that was opened).
  let currentPath = rootPath
  async function show(path) {
    currentPath = path
    body.innerHTML = ''
    if (path !== rootPath) {
      const up = document.createElement('div')
      up.className = 'lib-up-item'
      up.innerHTML = `<i class="fa-solid fa-arrow-turn-up"></i><span class="lib-file-name">..</span>`
      up.addEventListener('click', () => {
        const parent = path.slice(0, path.lastIndexOf(sep))
        show(parent.length >= rootPath.length ? parent : rootPath)
      })
      body.appendChild(up)
    }

    let items = []
    try { items = await invoke('list_folder_contents', { path }) } catch {}

    if (!items.length) {
      const empty = document.createElement('div')
      empty.className = 'lib-browser-empty'
      empty.innerHTML = `<i class="fa-solid fa-folder-open"></i> ${t('lib_folder_empty')}`
      body.appendChild(empty)
      return
    }
    items.forEach(f => {
      if (f.is_dir) body.appendChild(buildFolderItem(f, show))
      else          body.appendChild(buildFileItem(f, path, sep, body, openWindow))
    })
  }
  // Expose a controller so the library can refresh / navigate this window.
  if (opts.onReady) opts.onReady({ show, rootPath, getCurrent: () => currentPath })
  show(opts.initialPath || rootPath)
}

function buildFolderItem(f, navigate) {
  const item = document.createElement('div')
  item.className = 'lib-file-item lib-folder-item'
  item.innerHTML = `
    <i class="fa-solid fa-folder lib-file-icon"></i>
    <span class="lib-file-name">${f.name}</span>
    <i class="fa-solid fa-chevron-right lib-folder-chevron"></i>
  `
  item.addEventListener('click', () => navigate(f.path))
  return item
}

function buildFileItem(f, folderPath, sep, body, openWindow) {
  const isSeq = f.name.endsWith('.iceseq')
  const isDaw = f.name.endsWith('.icedaw')
  const icon  = isSeq ? 'fa-table-cells' : isDaw ? 'fa-film' : 'fa-music'

  const item = document.createElement('div')
  item.className = 'lib-file-item'
  item.innerHTML = `
    <i class="fa-solid ${icon} lib-file-icon"></i>
    <span class="lib-file-name">${f.name}</span>
    <div class="lib-file-actions">
      <button class="lib-file-action lib-file-move" title="${t('lib_move_title')}"><i class="fa-solid fa-folder-arrow-down"></i></button>
      <button class="lib-file-action lib-file-rename" title="${t('lib_rename_title')}"><i class="fa-solid fa-pencil"></i></button>
      <button class="lib-file-action lib-file-delete" title="${t('lib_delete_title')}"><i class="fa-solid fa-trash"></i></button>
    </div>
  `

  if (!isSeq && !isDaw) item.addEventListener('dblclick', () => openLibraryFile(f, openWindow))

  // Drag vers piste
  item.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    e.preventDefault()
    const fileData = { name: f.name, path: f.path }
    const label    = f.name.length > 26 ? f.name.slice(0, 24) + '…' : f.name
    let ghost = null, dragging = false
    const sx = e.clientX, sy = e.clientY

    function onMove(ev) {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
        dragging = true
        ghost = document.createElement('div')
        ghost.className = 'lib-drag-ghost'
        ghost.innerHTML = `<i class="fa-solid ${isSeq ? 'fa-table-cells' : 'fa-music'}"></i><span>${label}</span>`
        document.body.appendChild(ghost)
        item.classList.add('dragging')
      }
      ghost.style.left = (ev.clientX + 14) + 'px'
      ghost.style.top  = (ev.clientY - 14) + 'px'
      const under = document.elementFromPoint(ev.clientX, ev.clientY)
      const lane  = under?.closest('.daw-lane')
      document.querySelectorAll('.daw-lane').forEach(l => l.classList.toggle('drag-over', l === lane))
    }

    function onUp(ev) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
      document.querySelectorAll('.daw-lane').forEach(l => l.classList.remove('drag-over'))
      item.classList.remove('dragging')
      if (ghost) ghost.remove()
      if (!dragging) return
      document.addEventListener('click', e => e.stopPropagation(), { once: true, capture: true })
      const under = document.elementFromPoint(ev.clientX, ev.clientY)
      if (under) {
        under.dispatchEvent(new CustomEvent('iceample-drop', {
          bubbles: true,
          detail: { file: fileData, clientX: ev.clientX, clientY: ev.clientY }
        }))
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  })

  // ── Déplacer vers ─────────────────────────────────────────────────────────
  item.querySelector('.lib-file-move').addEventListener('click', e => {
    e.stopPropagation()
    if (item.querySelector('.lib-move-row')) return

    // Extract root and current folder from folderPath
    const lastSep   = folderPath.lastIndexOf(sep)
    const root      = folderPath.substring(0, lastSep)
    const curFolder = folderPath.substring(lastSep + 1)

    const moveRow = document.createElement('div')
    moveRow.className = 'lib-move-row'

    const label = document.createElement('span')
    label.className = 'lib-move-label'
    label.innerHTML = `<i class="fa-solid fa-folder-arrow-down"></i> ${t('lib_move_to')}`
    moveRow.appendChild(label)

    const folders = document.createElement('div')
    folders.className = 'lib-move-folders'

    LIBRARY_CATEGORIES.filter(c => c.label !== curFolder).forEach(cat => {
      const btn = document.createElement('button')
      btn.className = 'lib-move-folder-btn'
      btn.textContent = cat.label
      btn.addEventListener('click', async () => {
        try {
          const newPath = root + sep + cat.label + sep + f.name
          await window.__TAURI__.core.invoke('rename_file', { oldPath: f.path, newPath })
          f.path = newPath
          item.remove()
        } catch (err) {
          console.error('Move failed:', err)
          moveRow.remove()
        }
      })
      folders.appendChild(btn)
    })

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'lib-move-cancel'
    cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
    cancelBtn.addEventListener('click', () => moveRow.remove())

    moveRow.appendChild(folders)
    moveRow.appendChild(cancelBtn)
    item.appendChild(moveRow)
  })

  // ── Renommer ──────────────────────────────────────────────────────────────
  item.querySelector('.lib-file-rename').addEventListener('click', e => {
    e.stopPropagation()
    const nameEl = item.querySelector('.lib-file-name')
    if (item.querySelector('.lib-rename-input')) return

    const ext      = f.name.includes('.') ? '.' + f.name.split('.').pop() : ''
    const baseName = ext ? f.name.slice(0, -ext.length) : f.name

    const input = document.createElement('input')
    input.className = 'lib-rename-input'
    input.value = baseName
    nameEl.replaceWith(input)
    input.focus(); input.select()

    async function commit() {
      const newBase = input.value.trim()
      if (!newBase || newBase === baseName) { cancel(); return }
      const newName = newBase + ext
      const newPath = folderPath + sep + newName
      try {
        await window.__TAURI__.core.invoke('rename_file', { oldPath: f.path, newPath })
        f.name = newName; f.path = newPath
        const span = document.createElement('span')
        span.className = 'lib-file-name'
        span.textContent = newName
        input.replaceWith(span)
      } catch { cancel() }
    }

    function cancel() {
      const span = document.createElement('span')
      span.className = 'lib-file-name'
      span.textContent = f.name
      input.replaceWith(span)
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); commit() }
      if (e.key === 'Escape') cancel()
    })
    input.addEventListener('blur', commit)
  })

  // ── Supprimer ─────────────────────────────────────────────────────────────
  item.querySelector('.lib-file-delete').addEventListener('click', e => {
    e.stopPropagation()
    if (item.querySelector('.lib-confirm-row')) return

    const confirm = document.createElement('div')
    confirm.className = 'lib-confirm-row'
    confirm.innerHTML = `
      <span class="lib-confirm-msg"><i class="fa-solid fa-triangle-exclamation"></i> ${t('lib_confirm_delete')}</span>
      <button class="lib-confirm-yes"><i class="fa-solid fa-check"></i> ${t('lib_confirm_yes')}</button>
      <button class="lib-confirm-no"><i class="fa-solid fa-xmark"></i> ${t('lib_confirm_no')}</button>
    `
    item.appendChild(confirm)

    confirm.querySelector('.lib-confirm-yes').addEventListener('click', async () => {
      try {
        await window.__TAURI__.core.invoke('delete_file', { path: f.path })
        item.remove()
      } catch { confirm.remove() }
    })
    confirm.querySelector('.lib-confirm-no').addEventListener('click', () => confirm.remove())
  })

  return item
}

// ── Open routing ───────────────────────────────────────────────────────────
// Double-clicked files go to the right tool by extension; audio (and anything
// unknown) keeps the little player window below.
const LIB_IMAGE_EXTS  = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
const LIB_VIDEO_EXTS  = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']
// Camera RAW formats — routed to the dedicated RAW tool, never to the player.
const LIB_RAW_EXTS    = ['cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'dng', 'srw', 'pef']
const LIB_IMAGE_MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                          webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' }

async function openLibraryFile(f, openWindow) {
  const ext = f.name.split('.').pop().toLowerCase()
  if (ext === 'glb' || ext === 'gltf') {
    sendMedia('tool3d', { kind: 'model', path: f.path, name: f.name })
    return
  }
  if (ext === 'iceimg') {
    sendMedia('imgedit', { kind: 'iceimg', path: f.path, name: f.name })
    return
  }
  if (ext === 'icevid') {
    sendMedia('videorec', { kind: 'icevid', path: f.path, name: f.name })
    return
  }
  if (ext === 'icetpl') {
    sendMedia('videorec', { kind: 'icetpl', path: f.path, name: f.name })
    return
  }
  if (LIB_VIDEO_EXTS.includes(ext)) {
    sendMedia('videorec', { kind: 'video', path: f.path, name: f.name })
    return
  }
  if (LIB_RAW_EXTS.includes(ext)) {
    sendMedia('rawtool', { kind: 'raw', path: f.path, name: f.name })
    return
  }
  if (LIB_IMAGE_EXTS.includes(ext)) {
    if (!window.__TAURI__) return
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path: f.path })
      sendMedia('imgedit', { kind: 'image', dataUrl: `data:${LIB_IMAGE_MIMES[ext]};base64,${b64}`, name: f.name })
    } catch { window.toast?.(t('lib_read_error'), 'error') }
    return
  }
  openPlayerWindow(f, openWindow)
}

// ── Player ─────────────────────────────────────────────────────────────────
function mimeFromExt(name) {
  const ext = name.split('.').pop().toLowerCase()
  return { wav:'audio/wav', mp3:'audio/mpeg', ogg:'audio/ogg',
           flac:'audio/flac', aiff:'audio/aiff', aif:'audio/aiff', m4a:'audio/mp4' }[ext] || 'audio/wav'
}

async function openPlayerWindow(file, openWindow) {
  const shortName = file.name.length > 28 ? file.name.slice(0, 26) + '…' : file.name
  openWindow(shortName, 'fa-solid fa-music', 320, 110, async body => {
    body.classList.add('lib-player-body')
    body.innerHTML = '<div class="lib-player-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>'

    if (!window.__TAURI__) {
      body.innerHTML = `<div class="lib-browser-empty"><i class="fa-solid fa-triangle-exclamation"></i> ${t('lib_not_available')}</div>`
      return
    }

    let url = null
    try {
      const { invoke } = window.__TAURI__.core
      const b64    = await invoke('read_file_base64', { path: file.path })
      const binary = atob(b64)
      const bytes  = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      url = URL.createObjectURL(new Blob([bytes], { type: mimeFromExt(file.name) }))
    } catch {
      body.innerHTML = `<div class="lib-browser-empty"><i class="fa-solid fa-triangle-exclamation"></i> ${t('lib_read_error')}</div>`
      return
    }

    const audio = new Audio(url)
    body.innerHTML = `
      <div class="lib-player-row">
        <button class="lib-player-btn" id="lp-play"><i class="fa-solid fa-play"></i></button>
        <div class="lib-player-track">
          <div class="lib-player-bar" id="lp-bar">
            <div class="lib-player-fill" id="lp-fill"></div>
          </div>
          <span class="lib-player-time" id="lp-time">0:00</span>
        </div>
      </div>
    `

    const btnPlay = body.querySelector('#lp-play')
    const fill    = body.querySelector('#lp-fill')
    const timeEl  = body.querySelector('#lp-time')
    const bar     = body.querySelector('#lp-bar')

    function fmtTime(s) { return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}` }

    audio.addEventListener('play',  () => { btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>'; btnPlay.classList.add('playing') })
    audio.addEventListener('pause', () => { btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>';  btnPlay.classList.remove('playing') })
    audio.addEventListener('ended', () => { btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>';  btnPlay.classList.remove('playing'); fill.style.width = '0%' })
    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return
      fill.style.width = (audio.currentTime / audio.duration * 100) + '%'
      timeEl.textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(audio.duration)
    })

    btnPlay.addEventListener('click', () => { audio.paused ? audio.play() : audio.pause() })
    bar.addEventListener('click', e => {
      if (!audio.duration) return
      const r = bar.getBoundingClientRect()
      audio.currentTime = (e.clientX - r.left) / r.width * audio.duration
    })

    audio.play().catch(() => {})

    const obs = new MutationObserver(() => {
      if (!document.contains(body)) { audio.pause(); URL.revokeObjectURL(url); obs.disconnect() }
    })
    obs.observe(document.body, { childList: true, subtree: true })
  })
}
