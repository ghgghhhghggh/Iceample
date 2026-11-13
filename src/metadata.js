// metadata.js — Éditeur de métadonnées audio + vidéo avec gestion de pochette

import { trackRecentFile } from './recent.js'

const AUDIO_EXTS = ['mp3','flac','ogg','opus','m4a','aiff','aif','wav','wma']
const VIDEO_EXTS = ['mp4','mkv','mov','avi','webm','m4v']
const ALL_EXTS   = [...AUDIO_EXTS, ...VIDEO_EXTS]

function invoke(cmd, args) {
  return window.__TAURI__.core.invoke(cmd, args)
}

async function pickMediaFile() {
  try {
    const result = await invoke('pick_files_with_filter', {
      filterName: 'Audio & Vidéo',
      extensions: ALL_EXTS,
    })
    return result && result[0] ? result[0] : null
  } catch { return null }
}

async function pickImageFile() {
  try {
    const result = await invoke('pick_files_with_filter', {
      filterName: 'Images',
      extensions: ['jpg','jpeg','png','webp','bmp'],
    })
    return result && result[0] ? result[0] : null
  } catch { return null }
}

function parseFfprobe(json) {
  let data
  try { data = JSON.parse(json) } catch { return {} }
  const fmt = data.format || {}
  const tags = fmt.tags || {}
  const norm = {}
  for (const [k, v] of Object.entries(tags)) norm[k.toLowerCase()] = v
  return {
    title:   norm.title   || '',
    artist:  norm.artist  || norm['album_artist'] || norm['artist'] || '',
    album:   norm.album   || '',
    year:    norm.date    || norm.year || '',
    genre:   norm.genre   || '',
    comment: norm.comment || norm['comment-0'] || '',
    track:   norm.track   || '',
    duration: fmt.duration ? Math.round(parseFloat(fmt.duration)) : 0,
    bitrate:  fmt.bit_rate ? Math.round(parseInt(fmt.bit_rate) / 1000) : 0,
    format:   fmt.format_name || '',
    streams:  data.streams || [],
  }
}

function formatDuration(s) {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
}

export function initMetadata(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;'

  let currentPath  = null
  let isDirty      = false
  let artworkPath  = null   // newly picked artwork file path
  let artworkDirty = false  // artwork changed

  const BTN  = 'border:none;border-radius:5px;padding:6px 12px;cursor:pointer;font-size:11px;font-family:inherit;'
  const INP  = 'background:var(--surface2,#1a1a1a);border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-primary,#ddd);border-radius:5px;padding:5px 8px;font-size:12px;outline:none;width:100%;box-sizing:border-box;'
  const LBL  = 'color:var(--text-secondary);font-size:11px;margin-bottom:3px;display:block;'

  // ── Header ──────────────────────────────────────────────────────────────────
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--win-border-in,#1e1e1e);flex-shrink:0;'

  const pickBtn = document.createElement('button')
  pickBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Ouvrir'
  pickBtn.style.cssText = BTN + 'background:var(--btn-primary);color:var(--on-accent);'

  const fileLbl = document.createElement('span')
  fileLbl.style.cssText = 'flex:1;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;'
  fileLbl.textContent = 'Aucun fichier sélectionné'

  const saveBtn = document.createElement('button')
  saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Enregistrer'
  saveBtn.style.cssText = BTN + 'background:var(--surface2);border:1px solid var(--win-border);color:var(--text-primary);'
  saveBtn.disabled = true

  header.append(pickBtn, fileLbl, saveBtn)

  // ── Info bar ─────────────────────────────────────────────────────────────────
  const infoBar = document.createElement('div')
  infoBar.style.cssText = 'display:flex;gap:16px;padding:5px 12px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--win-border-in,#1e1e1e);color:color-mix(in srgb, var(--text-secondary) 65%, transparent);font-size:10px;flex-shrink:0;'
  infoBar.innerHTML = '—'

  // ── Content ──────────────────────────────────────────────────────────────────
  const content = document.createElement('div')
  content.style.cssText = 'display:flex;gap:0;flex:1;overflow:hidden;'

  // Left: artwork
  const artWrap = document.createElement('div')
  artWrap.style.cssText = 'width:172px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding:14px 12px;gap:8px;border-right:1px solid var(--win-border-in,#1e1e1e);'

  const artImg = document.createElement('img')
  artImg.style.cssText = 'width:140px;height:140px;object-fit:cover;border-radius:6px;background:var(--preview-bg);border:1px solid var(--win-border);display:block;'
  artImg.alt = ''

  const artStatus = document.createElement('div')
  artStatus.style.cssText = 'font-size:10px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);text-align:center;line-height:1.4;'
  artStatus.textContent = 'Pas de pochette'

  const artPickBtn = document.createElement('button')
  artPickBtn.innerHTML = '<i class="fa-solid fa-image"></i> Choisir une pochette'
  artPickBtn.style.cssText = BTN + 'background:var(--surface2);border:1px solid var(--win-border);color:var(--text-primary);width:100%;font-size:10px;padding:5px 8px;'
  artPickBtn.disabled = true

  const artRemoveBtn = document.createElement('button')
  artRemoveBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Supprimer'
  artRemoveBtn.style.cssText = BTN + 'background:none;border:1px solid var(--win-border);color:var(--text-secondary);width:100%;font-size:10px;padding:4px 8px;display:none;'

  // Drag artwork onto the image
  artImg.style.cursor = 'pointer'
  artImg.title = 'Cliquer ou glisser une image'

  artWrap.append(artImg, artStatus, artPickBtn, artRemoveBtn)

  // Right: form
  const form = document.createElement('div')
  form.style.cssText = 'flex:1;overflow-y:auto;padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;align-content:start;'

  const fields = [
    { key: 'title',   label: 'Titre',      span: 2 },
    { key: 'artist',  label: 'Artiste',    span: 1 },
    { key: 'album',   label: 'Album',      span: 1 },
    { key: 'year',    label: 'Année',      span: 1 },
    { key: 'genre',   label: 'Genre',      span: 1 },
    { key: 'track',   label: 'Piste n°',   span: 1 },
    { key: 'comment', label: 'Commentaire',span: 2, multiline: true },
  ]

  const inputs = {}
  for (const f of fields) {
    const wrap = document.createElement('div')
    if (f.span === 2) wrap.style.gridColumn = 'span 2'
    const lbl = document.createElement('label')
    lbl.style.cssText = LBL
    lbl.textContent = f.label
    const inp = f.multiline ? document.createElement('textarea') : document.createElement('input')
    inp.style.cssText = INP
    if (f.multiline) { inp.rows = 2; inp.style.resize = 'vertical' }
    inp.disabled = true
    inp.addEventListener('input', () => { isDirty = true; saveBtn.disabled = false })
    inputs[f.key] = inp
    wrap.append(lbl, inp)
    form.appendChild(wrap)
  }

  content.append(artWrap, form)
  body.append(header, infoBar, content)

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function markDirty() {
    isDirty = true
    saveBtn.disabled = false
  }

  function setLoading(on) {
    Object.values(inputs).forEach(i => { i.disabled = on || !currentPath })
    artPickBtn.disabled = on || !currentPath
    saveBtn.disabled = on || (!isDirty && !artworkDirty) || !currentPath
    pickBtn.disabled = on
  }

  function fillForm(meta) {
    for (const [k, inp] of Object.entries(inputs)) inp.value = meta[k] || ''
    const isVideo = VIDEO_EXTS.includes(meta.format?.split(',')[0])
    infoBar.innerHTML = [
      meta.format && `<b>${meta.format.toUpperCase()}</b>`,
      meta.duration && `Durée: <b>${formatDuration(meta.duration)}</b>`,
      meta.bitrate  && `Débit: <b>${meta.bitrate} kb/s</b>`,
      isVideo       && `<span style="color:var(--color-active);">Vidéo</span>`,
    ].filter(Boolean).join(' &nbsp;·&nbsp; ') || '—'
    isDirty = false
    artworkDirty = false
    saveBtn.disabled = true
  }

  function setArtwork(src, label) {
    if (src) {
      artImg.src = src
      artImg.style.background = 'transparent'
      artRemoveBtn.style.display = 'block'
    } else {
      artImg.src = ''
      artImg.style.background = 'var(--preview-bg)'
      artRemoveBtn.style.display = 'none'
    }
    artStatus.textContent = label || 'Pas de pochette'
  }

  // ── Load file ─────────────────────────────────────────────────────────────────

  async function loadFile(path) {
    if (!window.__TAURI__) { window.toast?.('Tauri requis', 'error'); return }
    currentPath = path
    artworkPath = null
    artworkDirty = false
    const fileName = path.split(/[\\/]/).pop()
    fileLbl.textContent = fileName
    trackRecentFile(path, fileName)
    setLoading(true)
    setArtwork(null, 'Chargement…')

    try {
      const json = await invoke('read_audio_metadata', { path })
      const meta = parseFfprobe(json)
      fillForm(meta)

      // Extract embedded artwork
      setArtwork(null, 'Chargement pochette…')
      try {
        const b64 = await invoke('extract_audio_artwork', { path })
        if (b64) {
          setArtwork(`data:image/jpeg;base64,${b64}`, 'Pochette intégrée')
        } else {
          setArtwork(null, 'Pas de pochette')
        }
      } catch {
        setArtwork(null, 'Pas de pochette')
      }
    } catch (e) {
      window.toast?.(String(e), 'error')
    }

    Object.values(inputs).forEach(i => { i.disabled = false })
    setLoading(false)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function saveMetadata() {
    if (!currentPath || !window.__TAURI__) return
    setLoading(true)
    try {
      const tags = {}
      for (const [k, inp] of Object.entries(inputs)) {
        if (inp.value.trim()) {
          tags[k] = inp.value.trim()
          if (k === 'year') tags['date'] = inp.value.trim()
        }
      }
      await invoke('write_audio_metadata', {
        path: currentPath,
        tags: JSON.stringify(tags),
        artworkPath: artworkPath || null,
      })
      window.toast?.('Métadonnées enregistrées ✓', 'success')

      // If we embedded new artwork, update the display from the saved file
      if (artworkPath) {
        artworkPath = null
        artworkDirty = false
        const b64 = await invoke('extract_audio_artwork', { path: currentPath }).catch(() => '')
        if (b64) setArtwork(`data:image/jpeg;base64,${b64}`, 'Pochette intégrée')
      }

      isDirty = false
      artworkDirty = false
      saveBtn.disabled = true
    } catch (e) {
      window.toast?.(String(e), 'error')
    }
    setLoading(false)
  }

  // ── Artwork pick ──────────────────────────────────────────────────────────────

  async function pickArtwork() {
    const p = await pickImageFile()
    if (!p) return
    artworkPath = p
    artworkDirty = true
    // Show local preview via file:// URL (works in Tauri WebView)
    const url = 'file:///' + p.replace(/\\/g, '/')
    setArtwork(url, '⬤ Nouvelle pochette (non enregistrée)')
    artStatus.style.color = 'var(--warning)'
    markDirty()
  }

  artPickBtn.addEventListener('click', pickArtwork)
  artImg.addEventListener('click', () => { if (currentPath) pickArtwork() })

  artRemoveBtn.addEventListener('click', () => {
    artworkPath = '__remove__'
    artworkDirty = true
    setArtwork(null, 'Pochette supprimée (à enregistrer)')
    artStatus.style.color = 'var(--danger)'
    markDirty()
  })

  // ── Drag & drop (fichier média ou image sur l'outil) ──────────────────────────

  body.addEventListener('dragover', e => e.preventDefault())
  body.addEventListener('drop', e => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    const path = file.path || null
    if (!path) { window.toast?.('Impossible de lire le chemin', 'error'); return }
    if (ALL_EXTS.includes(ext)) {
      loadFile(path)
    } else if (['jpg','jpeg','png','webp','bmp'].includes(ext)) {
      if (!currentPath) { window.toast?.('Ouvrez d\'abord un fichier audio', 'error'); return }
      artworkPath = path
      artworkDirty = true
      setArtwork('file:///' + path.replace(/\\/g, '/'), '⬤ Nouvelle pochette (non enregistrée)')
      artStatus.style.color = 'var(--warning)'
      markDirty()
    } else {
      window.toast?.('Format non supporté', 'error')
    }
  })

  // ── Drag image directly onto the artwork zone ─────────────────────────────────

  artWrap.addEventListener('dragover', e => {
    e.preventDefault(); e.stopPropagation()
    artWrap.style.background = 'color-mix(in srgb, var(--color-active) 8%, transparent)'
  })
  artWrap.addEventListener('dragleave', () => { artWrap.style.background = '' })
  artWrap.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation()
    artWrap.style.background = ''
    if (!currentPath) { window.toast?.('Ouvrez d\'abord un fichier audio', 'error'); return }
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    const path = file.path || null
    if (!path || !['jpg','jpeg','png','webp','bmp'].includes(ext)) {
      window.toast?.('Glissez une image (JPG, PNG, WebP…)', 'error'); return
    }
    artworkPath = path
    artworkDirty = true
    setArtwork('file:///' + path.replace(/\\/g, '/'), '⬤ Nouvelle pochette (non enregistrée)')
    artStatus.style.color = 'var(--warning)'
    markDirty()
  })

  // ── Event wiring ──────────────────────────────────────────────────────────────

  pickBtn.addEventListener('click', async () => {
    const path = await pickMediaFile()
    if (path) loadFile(path)
  })

  saveBtn.addEventListener('click', saveMetadata)

  window.addEventListener('iceample-open-file', e => {
    const { path, ext } = e.detail
    if (ALL_EXTS.includes(ext)) loadFile(path)
  })
}
