// web-shim.js — runs the Tauri frontend in a plain browser.
//
// The desktop app gets `window.__TAURI__` injected by Tauri before any script
// runs, so this file does nothing there. In a browser it installs a stand-in
// with the same shape, so the existing `invoke(...)` call sites keep working:
//   • the library lives in IndexedDB under the virtual root /Iceample
//   • "open file" dialogs become <input type="file">, files get a session path
//   • saving outside the library becomes a browser download
//   • anything that needs native code (ffmpeg, VST, LibreOffice…) rejects with
//     a "desktop app only" toast
//
// Web-only checks elsewhere in the code use `window.__ICEAMPLE_WEB__`.
;(function () {
  if (window.__TAURI__) return
  window.__ICEAMPLE_WEB__ = true

  const ROOT = '/Iceample'
  const PICKED = '/Fichiers'            // session-only: files chosen or dropped by the user
  const LIBRARY_FOLDERS = ['Importés', 'Modifiés', 'Sons', 'Voix', 'Images', '3D', 'Séquences', 'Séquences Audio', 'Sonneries', 'Pistes']
  // Keep in sync with BROWSABLE_EXTS in src-tauri/src/lib.rs
  const BROWSABLE = new Set([
    'wav', 'mp3', 'flac', 'ogg', 'aiff', 'aif', 'm4a',
    'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp',
    'mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v',
    'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'dng', 'srw', 'pef',
    'glb',
    'iceseq', 'icedaw', 'icemic', 'icevid', 'iceimg',
    'm4r',
  ])
  const AUDIO_EXTS = ['wav', 'mp3', 'flac', 'ogg', 'aiff', 'aif', 'm4a']
  const MIME = {
    wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg', m4a: 'audio/mp4', m4r: 'audio/mp4',
    aiff: 'audio/aiff', aif: 'audio/aiff',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
    glb: 'model/gltf-binary', pdf: 'application/pdf', html: 'text/html', json: 'application/json',
    txt: 'text/plain', srt: 'text/plain', vtt: 'text/vtt',
  }

  // ── Path helpers ───────────────────────────────────────────────────────────
  const norm = p => String(p ?? '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/(.)\/$/, '$1')
  const baseName = p => norm(p).split('/').pop() || ''
  const extOf = p => { const n = baseName(p); const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : '' }
  const inLibrary = p => p === ROOT || p.startsWith(ROOT + '/')

  // ── Base64 ─────────────────────────────────────────────────────────────────
  function b64ToBytes(b64) {
    const bin = atob(String(b64).replace(/\s+/g, ''))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  function bytesToB64(bytes) {
    let bin = ''
    const CH = 0x8000
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
    return btoa(bin)
  }

  // ── IndexedDB store (the library) ──────────────────────────────────────────
  let dbPromise = null
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('iceample-web-fs', 1)
        req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'path' })
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      dbPromise.catch(() => { dbPromise = null })
      navigator.storage?.persist?.().catch(() => {})
    }
    return dbPromise
  }
  async function store(mode, fn) {
    const d = await db()
    return new Promise((resolve, reject) => {
      const tx = d.transaction('files', mode)
      const req = fn(tx.objectStore('files'))
      tx.oncomplete = () => resolve(req?.result)
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('IndexedDB'))
    })
  }
  const idbGet = path => store('readonly', s => s.get(path))
  const idbPut = (path, data) => store('readwrite', s => s.put({ path, data, mtime: Date.now() }))
  const idbDel = path => store('readwrite', s => s.delete(path))
  const idbKeysUnder = dir => store('readonly', s => s.getAllKeys(IDBKeyRange.bound(dir + '/', dir + '/￿')))

  // ── Session files (picked through a dialog) ────────────────────────────────
  const picked = new Map()
  let pickedSeq = 0
  function registerFile(file) {
    const path = `${PICKED}/${++pickedSeq}/${file.name}`
    picked.set(path, file)
    return path
  }
  window.__ICEAMPLE_WEB_REGISTER__ = registerFile

  async function readBlob(rawPath) {
    const path = norm(rawPath)
    if (picked.has(path)) return picked.get(path)
    const rec = inLibrary(path) ? await idbGet(path) : null
    if (rec) return rec.data
    throw `Fichier introuvable : ${baseName(path)}`
  }

  function download(blob, name) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name || 'iceample'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }

  async function writeFile(rawPath, blob) {
    const path = norm(rawPath)
    if (inLibrary(path)) {
      try { await idbPut(path, blob) }
      catch (e) { throw (e?.name === 'QuotaExceededError' ? 'Espace de stockage du navigateur plein' : String(e?.message ?? e)) }
      return null
    }
    // Keep it readable for the rest of the session (tools re-open what they just exported).
    picked.set(path, blob)
    download(blob, baseName(path))
    return null
  }

  // ── File dialogs ───────────────────────────────────────────────────────────
  function pickFiles({ extensions = [], multiple = true } = {}) {
    return new Promise(resolve => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = !!multiple
      const exts = extensions.filter(x => x && x !== '*')
      if (exts.length) input.accept = exts.map(x => '.' + x).join(',')
      input.style.display = 'none'
      let done = false
      const finish = files => { if (done) return; done = true; input.remove(); resolve(files) }
      input.addEventListener('change', () => finish(input.files?.length ? [...input.files] : null))
      input.addEventListener('cancel', () => finish(null))
      document.body.appendChild(input)
      input.click()
    })
  }

  function savePath({ defaultPath, filters } = {}) {
    let name = baseName(defaultPath || '') || 'iceample'
    const ext = filters?.[0]?.extensions?.[0]
    if (ext && ext !== '*' && !extOf(name)) name += '.' + ext
    return `/Téléchargements/${name}`
  }

  // ── Messages (i18n is a module: loaded lazily) ─────────────────────────────
  let tr = null
  const i18nReady = import('./i18n.js').then(m => { tr = m.t }).catch(() => {})
  const msg = (key, fallback) => { const v = tr?.(key); return v && v !== key ? v : fallback }

  let lastDesktopToast = 0
  function desktopOnly(cmd) {
    const now = Date.now()
    if (now - lastDesktopToast > 2500) {
      lastDesktopToast = now
      window.toast?.(msg('web_desktop_only', 'Available in the desktop app only'), 'info', 4000)
    }
    return Promise.reject(`${msg('web_desktop_only', 'Available in the desktop app only')} (${cmd})`)
  }

  // ── Commands ───────────────────────────────────────────────────────────────
  async function listFolder(rawPath) {
    const dir = norm(rawPath)
    const dirs = new Map(), files = []
    if (dir === ROOT) LIBRARY_FOLDERS.forEach(n => dirs.set(n, { name: n, path: `${ROOT}/${n}`, is_dir: true }))
    const keys = inLibrary(dir) ? await idbKeysUnder(dir) : []
    for (const key of keys) {
      const rest = key.slice(dir.length + 1)
      const slash = rest.indexOf('/')
      if (slash >= 0) {
        const name = rest.slice(0, slash)
        if (!dirs.has(name)) dirs.set(name, { name, path: `${dir}/${name}`, is_dir: true })
      } else if (BROWSABLE.has(extOf(rest))) {
        files.push({ name: rest, path: key, is_dir: false })
      }
    }
    const byName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    return [...dirs.values()].sort(byName).concat(files.sort(byName))
  }

  async function convertImage({ input, output }) {
    const bmp = await createImageBitmap(await readBlob(input))
    const c = document.createElement('canvas')
    c.width = bmp.width; c.height = bmp.height
    c.getContext('2d').drawImage(bmp, 0, 0)
    const type = MIME[extOf(output)]
    if (!type || !type.startsWith('image/') || type === 'image/svg+xml') throw `Format non pris en charge dans le navigateur : ${extOf(output)}`
    const blob = await new Promise(r => c.toBlob(r, type, 0.92))
    if (!blob || blob.type !== type) throw `Format non pris en charge dans le navigateur : ${extOf(output)}`
    return writeFile(output, blob)
  }

  const asPicked = files => (files || []).map(f => ({ name: f.name, path: registerFile(f) }))

  const COMMANDS = {
    read_text_file: async ({ path }) => (await readBlob(path)).text(),
    read_file_base64: async ({ path }) => bytesToB64(new Uint8Array(await (await readBlob(path)).arrayBuffer())),
    save_text_file: ({ path, content }) => writeFile(path, new Blob([content ?? ''], { type: MIME[extOf(path)] || 'text/plain' })),
    save_binary_file: ({ path, base64 }) => writeFile(path, new Blob([b64ToBytes(base64 ?? '')], { type: MIME[extOf(path)] || 'application/octet-stream' })),

    list_folder_contents: ({ path }) => listFolder(path),
    delete_file: async ({ path }) => { const p = norm(path); picked.delete(p); if (inLibrary(p)) await idbDel(p); return null },
    copy_file: async ({ src, dst }) => writeFile(dst, await readBlob(src)),
    rename_file: async a => {
      const from = norm(a.oldPath ?? a.old_path), to = norm(a.newPath ?? a.new_path)
      if (from === to) return null
      await writeFile(to, await readBlob(from))
      picked.delete(from)
      if (inLibrary(from)) await idbDel(from)
      return null
    },
    search_library: async ({ root, query }) => {
      const q = String(query ?? '').toLowerCase(), out = []
      for (const folder of LIBRARY_FOLDERS) {
        for (const e of await listFolder(`${norm(root)}/${folder}`)) {
          if (!e.is_dir && e.name.toLowerCase().includes(q)) out.push({ name: e.name, path: e.path, folder })
        }
      }
      return out
    },

    setup_default_library: async () => ROOT,
    pick_and_setup_library: async () => ROOT,
    pick_folder: async () => { window.toast?.(msg('web_lib_in_browser', 'Your files are stored in this browser'), 'info'); return null },
    open_folder: async () => { window.toast?.(msg('web_lib_in_browser', 'Your files are stored in this browser'), 'info'); return null },

    pick_files_with_filter: async a => { const f = await pickFiles({ extensions: a?.extensions }); return f ? f.map(registerFile) : null },
    pick_audio_file: async () => asPicked(await pickFiles({ extensions: AUDIO_EXTS, multiple: false }))[0] ?? null,
    pick_multiple_audio_files: async () => asPicked(await pickFiles({ extensions: AUDIO_EXTS })),

    convert_image: convertImage,

    // Native-only features that are polled quietly: answer "nothing here" instead of an error toast.
    scan_vsts: async () => [],
    set_vst_tempo: async () => null,
    find_libreoffice: async () => null,
    extract_audio_artwork: async () => '',
  }

  async function invoke(cmd, args = {}) {
    const fn = COMMANDS[cmd]
    if (!fn) { await i18nReady; return desktopOnly(cmd) }
    return fn(args || {})
  }

  window.__TAURI__ = {
    core: { invoke },
    dialog: {
      save: async opts => savePath(opts),
      open: async (opts = {}) => {
        if (opts.directory) return '/Téléchargements'
        const files = await pickFiles({ extensions: (opts.filters || []).flatMap(f => f.extensions || []), multiple: !!opts.multiple })
        if (!files) return null
        const paths = files.map(registerFile)
        return opts.multiple ? paths : paths[0]
      },
    },
    event: { listen: async () => () => {}, emit: async () => {} },
    opener: { openUrl: async url => { window.open(url, '_blank', 'noopener') } },
  }

  // A file dropped where no tool handles it must not navigate the tab away.
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault() })
  }

  // ── "Download the app" button ──────────────────────────────────────────────
  // The installer URL comes from <meta name="iceample-download-url"> in index.html.
  // While it is empty there is nothing to download, so no button is shown.
  function addDownloadButton() {
    const url = document.querySelector('meta[name="iceample-download-url"]')?.content?.trim()
    if (!url || document.getElementById('web-download-btn')) return
    const style = document.createElement('style')
    style.textContent = `
      #web-download-btn{position:fixed;top:10px;right:12px;z-index:50;display:inline-flex;align-items:center;gap:7px;
        padding:6px 12px;border-radius:999px;font-family:inherit;font-size:11px;font-weight:600;line-height:1;text-decoration:none;cursor:pointer;
        color:var(--text-primary,#f2ecff);background:var(--surface,#16121e);border:1px solid var(--win-border-in,#201830);
        opacity:.78;transition:opacity .15s,border-color .15s}
      #web-download-btn:hover{opacity:1;border-color:var(--accent,#b44be1)}
      #web-download-btn i{color:var(--accent,#b44be1)}
      #app.hidden ~ #web-download-btn{display:none}`
    document.head.appendChild(style)
    const a = document.createElement('a')
    a.id = 'web-download-btn'
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
    // data-i18n: applyTranslations() in i18n.js re-labels it on language change.
    a.innerHTML = '<i class="fa-solid fa-download"></i><span data-i18n="web_download_app">Download the app</span>'
    document.body.appendChild(a)
    i18nReady.then(() => { a.querySelector('span').textContent = msg('web_download_app', 'Download the app') })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addDownloadButton)
  else addDownloadButton()
})()
