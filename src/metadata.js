// metadata.js — Éditeur de métadonnées audio + vidéo avec gestion de pochette

import { trackRecentFile } from './recent.js'
import { mediaUrlSync } from './media-url.js'
import { t } from './i18n.js'

const AUDIO_EXTS = ['mp3','flac','ogg','opus','m4a','aiff','aif','wav','wma']
const VIDEO_EXTS = ['mp4','mkv','mov','avi','webm','m4v']
const ALL_EXTS   = [...AUDIO_EXTS, ...VIDEO_EXTS]
const IMG_EXTS   = ['jpg','jpeg','png','webp','bmp']

function extOf(p) {
  return (String(p || '').split(/[\\/]/).pop().split('.').pop() || '').toLowerCase()
}

// Video = has a real video stream (cover art is a "video" stream flagged
// attached_pic). No stream info (e.g. ffprobe output without streams) →
// fall back to the file extension.
function isVideoMedia(meta, path) {
  const streams = Array.isArray(meta?.streams) ? meta.streams : []
  if (streams.length) {
    return streams.some(s => s && s.codec_type === 'video' &&
      !(s.disposition && (s.disposition.attached_pic || s.disposition.still_image)))
  }
  return VIDEO_EXTS.includes(extOf(path))
}

function invoke(cmd, args) {
  return window.__TAURI__.core.invoke(cmd, args)
}

async function pickMediaFile() {
  try {
    const result = await invoke('pick_files_with_filter', {
      filterName: t('md_filter_media'),
      extensions: ALL_EXTS,
    })
    return result && result[0] ? result[0] : null
  } catch { return null }
}

async function pickImageFile() {
  try {
    const result = await invoke('pick_files_with_filter', {
      filterName: t('md_filter_images'),
      extensions: IMG_EXTS,
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
  pickBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> ' + t('md_open')
  pickBtn.style.cssText = BTN + 'background:var(--btn-primary);color:var(--on-accent);'

  const fileLbl = document.createElement('span')
  fileLbl.style.cssText = 'flex:1;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;'
  fileLbl.textContent = t('md_no_file')

  const saveBtn = document.createElement('button')
  saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + t('md_save')
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
  artStatus.textContent = t('md_no_art')

  const artPickBtn = document.createElement('button')
  artPickBtn.innerHTML = '<i class="fa-solid fa-image"></i> ' + t('md_pick_art')
  artPickBtn.style.cssText = BTN + 'background:var(--surface2);border:1px solid var(--win-border);color:var(--text-primary);width:100%;font-size:10px;padding:5px 8px;'
  artPickBtn.disabled = true

  const artRemoveBtn = document.createElement('button')
  artRemoveBtn.innerHTML = '<i class="fa-solid fa-trash"></i> ' + t('md_remove_art')
  artRemoveBtn.style.cssText = BTN + 'background:none;border:1px solid var(--win-border);color:var(--text-secondary);width:100%;font-size:10px;padding:4px 8px;display:none;'

  // Drag artwork onto the image
  artImg.style.cursor = 'pointer'
  artImg.title = t('md_art_hint')

  artWrap.append(artImg, artStatus, artPickBtn, artRemoveBtn)

  // Right: form
  const form = document.createElement('div')
  form.style.cssText = 'flex:1;overflow-y:auto;padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;align-content:start;'

  const fields = [
    { key: 'title',   label: t('md_f_title'),   span: 2 },
    { key: 'artist',  label: t('md_f_artist'),  span: 1 },
    { key: 'album',   label: t('md_f_album'),   span: 1 },
    { key: 'year',    label: t('md_f_year'),    span: 1 },
    { key: 'genre',   label: t('md_f_genre'),   span: 1 },
    { key: 'track',   label: t('md_f_track'),   span: 1 },
    { key: 'comment', label: t('md_f_comment'), span: 2, multiline: true },
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
    const isVideo = isVideoMedia(meta, currentPath)
    infoBar.innerHTML = [
      meta.format && `<b>${meta.format.toUpperCase()}</b>`,
      meta.duration && `${t('md_duration')} <b>${formatDuration(meta.duration)}</b>`,
      meta.bitrate  && `${t('md_bitrate')} <b>${meta.bitrate} kb/s</b>`,
      isVideo       && `<span style="color:var(--color-active);">${t('md_video')}</span>`,
    ].filter(Boolean).join(' &nbsp;·&nbsp; ') || '—'
    isDirty = false
    artworkDirty = false
    saveBtn.disabled = true
  }

  // Resets the status colour; callers showing a pending change (new / removed
  // artwork) set the warning/danger colour right after.
  function setArtwork(src, label) {
    artStatus.style.color = ''
    if (src) {
      artImg.src = src
      artImg.style.background = 'transparent'
      artRemoveBtn.style.display = 'block'
    } else {
      artImg.src = ''
      artImg.style.background = 'var(--preview-bg)'
      artRemoveBtn.style.display = 'none'
    }
    artStatus.textContent = label || t('md_no_art')
  }

  // ── Load file ─────────────────────────────────────────────────────────────────

  async function loadFile(path) {
    if (!window.__TAURI__) { window.toast?.(t('md_app_only'), 'error'); return }
    currentPath = path
    artworkPath = null
    artworkDirty = false
    const fileName = path.split(/[\\/]/).pop()
    fileLbl.textContent = fileName
    trackRecentFile(path, fileName)
    setLoading(true)
    setArtwork(null, t('md_loading'))

    try {
      const json = await invoke('read_audio_metadata', { path })
      const meta = parseFfprobe(json)
      fillForm(meta)

      // Extract embedded artwork
      setArtwork(null, t('md_loading_art'))
      try {
        const b64 = await invoke('extract_audio_artwork', { path })
        if (b64) {
          setArtwork(`data:image/jpeg;base64,${b64}`, t('md_art_embedded'))
        } else {
          setArtwork(null, t('md_no_art'))
        }
      } catch {
        setArtwork(null, t('md_no_art'))
      }
    } catch (e) {
      window.toast?.(t('md_read_error') + ' ' + String(e), 'error')
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
      window.toast?.(t('md_saved') + ' ✓', 'success')

      // If we embedded new artwork, update the display from the saved file
      if (artworkPath) {
        artworkPath = null
        artworkDirty = false
        const b64 = await invoke('extract_audio_artwork', { path: currentPath }).catch(() => '')
        if (b64) setArtwork(`data:image/jpeg;base64,${b64}`, t('md_art_embedded'))
        else setArtwork(null, t('md_no_art'))   // artwork was removed
      }

      isDirty = false
      artworkDirty = false
      saveBtn.disabled = true
    } catch (e) {
      window.toast?.(t('md_save_error') + ' ' + String(e), 'error')
    }
    setLoading(false)
  }

  // ── Artwork pick ──────────────────────────────────────────────────────────────

  // New artwork chosen (picker or drop) — embedded on the next save
  function setPendingArtwork(p) {
    artworkPath = p
    artworkDirty = true
    // Local preview through the asset protocol (the webview refuses file://)
    setArtwork(mediaUrlSync(p), '⬤ ' + t('md_art_new'))
    artStatus.style.color = 'var(--warning)'
    markDirty()
  }

  async function pickArtwork() {
    const p = await pickImageFile()
    if (!p) return
    setPendingArtwork(p)
  }

  artPickBtn.addEventListener('click', pickArtwork)
  artImg.addEventListener('click', () => { if (currentPath) pickArtwork() })

  artRemoveBtn.addEventListener('click', () => {
    artworkPath = '__remove__'
    artworkDirty = true
    setArtwork(null, t('md_art_removed'))
    artStatus.style.color = 'var(--danger)'
    markDirty()
  })

  // ── Drag & drop (fichier média ou image sur l'outil) ──────────────────────────
  // One handler for every drop source: HTML5 (no real path in Tauri/web),
  // library drag (iceample-drop) and OS file drop (Tauri onDragDropEvent).
  // onArtZone = dropped on the artwork column → only an image is accepted.

  function handleDrop(path, name, onArtZone) {
    const ext = extOf(path || name)
    if (onArtZone) {
      if (!currentPath) { window.toast?.(t('md_open_first'), 'error'); return }
      if (!path || !IMG_EXTS.includes(ext)) {
        window.toast?.(t('md_drop_image') + ' (JPG, PNG, WebP…)', 'error'); return
      }
      setPendingArtwork(path)
      return
    }
    if (!path) { window.toast?.(t('md_no_path'), 'error'); return }
    if (ALL_EXTS.includes(ext)) {
      loadFile(path)
    } else if (IMG_EXTS.includes(ext)) {
      if (!currentPath) { window.toast?.(t('md_open_first'), 'error'); return }
      setPendingArtwork(path)
    } else {
      window.toast?.(t('md_unsupported'), 'error')
    }
  }

  body.addEventListener('dragover', e => e.preventDefault())
  body.addEventListener('drop', e => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    handleDrop(file.path || null, file.name, false)
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
    const file = e.dataTransfer.files[0]
    if (!file && currentPath) return
    handleDrop(file?.path || null, file?.name, true)
  })

  // ── Library drag (Library, Search, Piano…) — carries a real path ─────────────

  body.addEventListener('iceample-drop', e => {
    const file = e.detail?.file
    if (!file) return
    handleDrop(file.path ? String(file.path) : null, file.name, artWrap.contains(e.target))
  })

  // ── OS file drop in the desktop app ──────────────────────────────────────────
  // WebView2 hands OS drops to Tauri, not to HTML5 events. onDragDropEvent is
  // webview-GLOBAL: react only when the drop lands on this tool, and unlisten
  // at teardown (see effects.js).
  let dead = false
  let dropUnlisten = null
  if (window.__TAURI__) {
    ;(async () => {
      try {
        const wv = window.__TAURI__.webview?.getCurrentWebview?.()
        if (!wv?.onDragDropEvent) return
        dropUnlisten = await wv.onDragDropEvent(ev => {
          if (dead || !document.contains(body)) return
          const { type, paths, position } = ev.payload || {}
          if (type !== 'drop') return
          let target = null
          if (position) {
            // position is in physical pixels, relative to the webview
            const dpr = window.devicePixelRatio || 1
            target = document.elementFromPoint(position.x / dpr, position.y / dpr)
            if (!target || !body.contains(target)) return   // dropped on another tool
          }
          const path = paths?.[0] ? String(paths[0]) : null
          handleDrop(path, path, !!target && artWrap.contains(target))
        })
        if (dead) { dropUnlisten?.(); dropUnlisten = null }   // closed while awaiting
      } catch {}
    })()
  }

  // ── Event wiring ──────────────────────────────────────────────────────────────

  pickBtn.addEventListener('click', async () => {
    const path = await pickMediaFile()
    if (path) loadFile(path)
  })

  saveBtn.addEventListener('click', saveMetadata)

  // Audio or video file sent by "Open with…" (Library, Search, Recents).
  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (m && m.path && (m.kind === 'audio' || m.kind === 'video')) loadFile(m.path)
  })

  const onOpenFile = e => {
    const { path, ext } = e.detail || {}
    if (path && ALL_EXTS.includes(ext)) loadFile(path)
  }
  window.addEventListener('iceample-open-file', onOpenFile)

  // ── Teardown (tool closed → body left the DOM) ───────────────────────────────
  new MutationObserver((_, obs) => {
    if (document.contains(body)) return
    dead = true
    dropUnlisten?.(); dropUnlisten = null
    window.removeEventListener('iceample-open-file', onOpenFile)
    obs.disconnect()
  }).observe(document.body, { childList: true, subtree: true })
}
