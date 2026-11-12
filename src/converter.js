// converter.js — Convertisseur universel (images, audio, vidéo, documents, PDF)

import { trackRecentFile } from './recent.js'
import { renderDesktopOnly } from './desktop-only.js'

function invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args) }

async function saveDialog(name, exts) {
  try { return await window.__TAURI__.dialog.save({ defaultPath: name, filters: [{ name: exts[0].toUpperCase(), extensions: exts }] }) }
  catch { return null }
}
async function openDirDialog() {
  try { return await window.__TAURI__.dialog.open({ directory: true }) }
  catch { return null }
}

function shortName(p) { return p ? p.replace(/\\/g, '/').split('/').pop() : '' }
function ext(p) { return p.split('.').pop().toLowerCase() }
function stem(p) { return shortName(p).replace(/\.[^.]+$/, '') }

async function pickFiles(filterName, extensions) {
  try {
    const r = await invoke('pick_files_with_filter', { filterName, extensions })
    return r || []
  } catch { return [] }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const BTN = 'border:none;border-radius:5px;padding:6px 12px;cursor:pointer;font-size:11px;font-family:inherit;'
const INP = 'background:var(--surface2,#1a1a1a);border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-primary,#ddd);border-radius:5px;padding:5px 8px;font-size:11px;outline:none;'
const SEL = INP + 'cursor:pointer;'

function btn(label, primary) {
  const b = document.createElement('button')
  b.innerHTML = label
  b.style.cssText = BTN + (primary
    ? 'background:var(--color-active,#4a9eff);color:#fff;'
    : 'background:#2a2a2a;border:1px solid #444;color:#ddd;')
  return b
}

function statusEl() {
  const d = document.createElement('div')
  d.style.cssText = 'font-size:11px;min-height:16px;'
  return d
}
function setStatus(el, msg, type) {
  el.textContent = msg
  el.style.color = type === 'error' ? '#e05252' : type === 'success' ? '#52b152' : type === 'progress' ? '#4a9eff' : '#888'
}

function select(opts) {
  const s = document.createElement('select')
  s.style.cssText = SEL
  for (const [val, label] of opts) {
    const o = document.createElement('option')
    o.value = val; o.textContent = label; s.appendChild(o)
  }
  return s
}

function label(text, el) {
  const w = document.createElement('div')
  const l = document.createElement('div')
  l.style.cssText = 'font-size:10px;color:#888;margin-bottom:3px;'
  l.textContent = text
  w.append(l, el)
  return w
}

function hrow(...els) {
  const r = document.createElement('div')
  r.style.cssText = 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;'
  r.append(...els)
  return r
}

// File list component
function fileList(accept) {
  const paths = []
  const box = document.createElement('div')
  box.style.cssText = 'border:1px dashed #333;border-radius:6px;padding:6px;min-height:50px;max-height:180px;overflow-y:auto;'

  const ICONS = {
    // images
    png:'fa-solid fa-image',jpg:'fa-solid fa-image',jpeg:'fa-solid fa-image',
    webp:'fa-solid fa-image',gif:'fa-solid fa-image',bmp:'fa-solid fa-image',
    tiff:'fa-solid fa-image',tif:'fa-solid fa-image',ico:'fa-solid fa-image',
    // audio
    mp3:'fa-solid fa-music',wav:'fa-solid fa-music',flac:'fa-solid fa-music',
    ogg:'fa-solid fa-music',m4a:'fa-solid fa-music',aac:'fa-solid fa-music',
    opus:'fa-solid fa-music',
    // video
    mp4:'fa-solid fa-film',webm:'fa-solid fa-film',avi:'fa-solid fa-film',
    mov:'fa-solid fa-film',mkv:'fa-solid fa-film',
    // docs
    pdf:'fa-solid fa-file-pdf',docx:'fa-solid fa-file-word',doc:'fa-solid fa-file-word',
    odt:'fa-solid fa-file-alt',txt:'fa-solid fa-file-lines',html:'fa-solid fa-code',
    rtf:'fa-solid fa-file-alt',
  }

  function render() {
    box.innerHTML = ''
    if (!paths.length) {
      const ph = document.createElement('div')
      ph.style.cssText = 'font-size:11px;color:#555;text-align:center;padding:10px;'
      ph.textContent = 'Aucun fichier'
      box.appendChild(ph); return
    }
    paths.forEach((p, i) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;margin-bottom:2px;'
      row.addEventListener('mouseenter', () => row.style.background = 'rgba(255,255,255,0.04)')
      row.addEventListener('mouseleave', () => row.style.background = '')
      const icon = document.createElement('i')
      icon.className = ICONS[ext(p)] || 'fa-solid fa-file'
      icon.style.cssText = 'font-size:12px;color:#778;width:14px;text-align:center;'
      const name = document.createElement('span')
      name.style.cssText = 'flex:1;font-size:11px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
      name.title = p; name.textContent = shortName(p)
      const rm = document.createElement('button')
      rm.innerHTML = '<i class="fa-solid fa-xmark"></i>'
      rm.style.cssText = 'background:none;border:none;color:#555;cursor:pointer;font-size:10px;padding:2px 4px;'
      rm.addEventListener('click', () => { paths.splice(i, 1); render() })
      row.append(icon, name, rm)
      box.appendChild(row)
    })
  }
  render()

  // Drag and drop
  box.addEventListener('dragover', e => { e.preventDefault(); box.style.borderColor = '#4a9eff' })
  box.addEventListener('dragleave', () => { box.style.borderColor = '#333' })
  box.addEventListener('drop', e => {
    e.preventDefault(); box.style.borderColor = '#333'
    for (const f of e.dataTransfer.files) {
      if (f.path && !paths.includes(f.path)) paths.push(f.path)
    }
    render()
  })

  return {
    el: box,
    get paths() { return paths },
    add(arr) { arr.forEach(p => { if (!paths.includes(p)) paths.push(p) }); render() },
    clear() { paths.length = 0; render() },
  }
}

// Result list (output files)
function resultList() {
  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;gap:3px;max-height:120px;overflow-y:auto;'
  const items = []
  return {
    el,
    add(path, ok) {
      items.push({ path, ok })
      const row = document.createElement('div')
      row.style.cssText = `display:flex;align-items:center;gap:6px;font-size:11px;color:${ok ? '#52b152' : '#e05252'};`
      row.innerHTML = `<i class="${ok ? 'fa-solid fa-check' : 'fa-solid fa-xmark'}"></i>`
      const n = document.createElement('span')
      n.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
      n.textContent = shortName(path)
      n.title = path
      row.appendChild(n)
      el.appendChild(row)
    },
    clear() { el.innerHTML = ''; items.length = 0 },
  }
}

function section(buildFn) {
  const w = document.createElement('div')
  w.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:14px 16px;height:100%;overflow-y:auto;box-sizing:border-box;'
  buildFn(w)
  return w
}

// ── Tab: Images ───────────────────────────────────────────────────────────────

const IMG_EXTS = ['png','jpg','jpeg','webp','gif','bmp','tiff','tif','ico','avif']
const IMG_FMTS = [
  ['jpg',  'JPG — JPEG compressé'],
  ['png',  'PNG — Sans perte'],
  ['webp', 'WebP — Moderne'],
  ['bmp',  'BMP — Bitmap brut'],
  ['tiff', 'TIFF — Haute qualité'],
  ['gif',  'GIF'],
  ['ico',  'ICO — Icône Windows'],
]

function buildImages(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:#888;'
  note.textContent = 'Convertissez entre formats d\'image. Glissez-déposez ou ajoutez des fichiers.'

  const list = fileList(IMG_EXTS)

  const fmtSel = select(IMG_FMTS)
  const qualSlider = document.createElement('input')
  qualSlider.type = 'range'; qualSlider.min = '10'; qualSlider.max = '100'; qualSlider.value = '90'
  qualSlider.style.cssText = 'flex:1;accent-color:var(--color-active,#4a9eff);'
  const qualLbl = document.createElement('span')
  qualLbl.style.cssText = 'font-size:11px;color:#aaa;min-width:36px;'
  qualLbl.textContent = '90%'
  qualSlider.addEventListener('input', () => { qualLbl.textContent = qualSlider.value + '%' })

  const qualRow = hrow(
    label('Format cible', fmtSel),
    label('Qualité JPEG/WebP', Object.assign(document.createElement('div'), {
      style: 'display:flex;gap:6px;align-items:center;',
      innerHTML: '',
    })),
  )
  // rebuild quality wrapper inline
  const qualWrap = document.createElement('div')
  qualWrap.style.cssText = 'display:flex;gap:6px;align-items:center;flex:1;'
  qualWrap.append(qualSlider, qualLbl)

  const optRow = hrow(label('Format cible', fmtSel), label('Qualité (JPEG/WebP)', qualWrap))

  const addBtn = btn('<i class="fa-solid fa-plus"></i> Ajouter des images')
  const outDirBtn = btn('<i class="fa-solid fa-folder"></i> Dossier de sortie')
  let outDir = null
  const outDirLbl = document.createElement('span')
  outDirLbl.style.cssText = 'font-size:11px;color:#666;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  outDirLbl.textContent = 'Même dossier que les fichiers sources'
  const goBtn = btn('<i class="fa-solid fa-rotate"></i> Convertir tout', true)
  const status = statusEl()
  const results = resultList()

  wrap.append(note, list.el, optRow, hrow(addBtn, outDirBtn, outDirLbl), goBtn, status, results.el)

  addBtn.addEventListener('click', async () => list.add(await pickFiles('Images', IMG_EXTS)))
  outDirBtn.addEventListener('click', async () => {
    const d = await openDirDialog()
    if (d) { outDir = d; outDirLbl.textContent = shortName(d) }
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, 'Ajoutez au moins un fichier.', 'error'); return }
    goBtn.disabled = true; results.clear()
    const fmt = fmtSel.value
    let ok = 0, err = 0
    for (let i = 0; i < list.paths.length; i++) {
      const p = list.paths[i]
      setStatus(status, `Conversion ${i+1}/${list.paths.length}…`, 'progress')
      const dir = outDir || p.replace(/[\\/][^\\/]+$/, '')
      const outPath = dir + '\\' + stem(p) + '.' + fmt
      try {
        await invoke('convert_image', { input: p, output: outPath })
        results.add(outPath, true)
        trackRecentFile(outPath, shortName(outPath))
        ok++
      } catch (e) {
        results.add(shortName(p) + ' → erreur: ' + String(e).slice(0, 60), false); err++
      }
    }
    setStatus(status, `${ok} converti(s)${err ? `, ${err} erreur(s)` : ''} ✓`, ok ? 'success' : 'error')
    goBtn.disabled = false
  })
}

// ── Tab: Audio ────────────────────────────────────────────────────────────────

const AUDIO_EXTS = ['mp3','wav','flac','ogg','m4a','aac','opus','aiff','aif','wma','mka']
const AUDIO_FMTS = [
  ['mp3',  'MP3 — Compatible universel'],
  ['wav',  'WAV — Sans perte (PCM)'],
  ['flac', 'FLAC — Lossless compressé'],
  ['ogg',  'OGG Vorbis — Libre'],
  ['m4a',  'M4A — AAC (Apple)'],
  ['aac',  'AAC'],
  ['opus', 'OPUS — Moderne / VoIP'],
]
const AUDIO_BITRATES = [['64k','64 kbps'],['96k','96 kbps'],['128k','128 kbps'],['192k','192 kbps'],['256k','256 kbps'],['320k','320 kbps']]

function audioArgs(fmt, bitrate) {
  // Returns ffmpeg encoding args (no input/output)
  switch (fmt) {
    case 'mp3':  return ['-c:a','libmp3lame','-b:a',bitrate,'-q:a','2']
    case 'flac': return ['-c:a','flac']
    case 'wav':  return ['-c:a','pcm_s16le']
    case 'ogg':  return ['-c:a','libvorbis','-b:a',bitrate]
    case 'm4a':  return ['-c:a','aac','-b:a',bitrate,'-movflags','+faststart']
    case 'aac':  return ['-c:a','aac','-b:a',bitrate]
    case 'opus': return ['-c:a','libopus','-b:a',bitrate]
    default:     return ['-c:a','copy']
  }
}

function buildAudio(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:#888;'
  note.textContent = 'Convertissez des fichiers audio entre formats via FFmpeg.'

  const list = fileList(AUDIO_EXTS)

  const fmtSel = select(AUDIO_FMTS)
  const brSel  = select(AUDIO_BITRATES)
  brSel.value  = '192k'
  const qualRow = hrow(label('Format cible', fmtSel), label('Débit', brSel))

  // Hide bitrate for lossless formats
  fmtSel.addEventListener('change', () => {
    const lossless = ['flac','wav'].includes(fmtSel.value)
    brSel.parentElement.style.opacity = lossless ? '0.3' : '1'
    brSel.disabled = lossless
  })

  const addBtn    = btn('<i class="fa-solid fa-plus"></i> Ajouter des fichiers audio')
  const outDirBtn = btn('<i class="fa-solid fa-folder"></i> Dossier de sortie')
  let outDir = null
  const outDirLbl = document.createElement('span')
  outDirLbl.style.cssText = 'font-size:11px;color:#666;flex:1;'
  outDirLbl.textContent = 'Même dossier'
  const goBtn = btn('<i class="fa-solid fa-rotate"></i> Convertir tout', true)
  const status = statusEl()
  const results = resultList()

  wrap.append(note, list.el, qualRow, hrow(addBtn, outDirBtn, outDirLbl), goBtn, status, results.el)

  addBtn.addEventListener('click', async () => list.add(await pickFiles('Audio', AUDIO_EXTS)))
  outDirBtn.addEventListener('click', async () => {
    const d = await openDirDialog(); if (d) { outDir = d; outDirLbl.textContent = shortName(d) }
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, 'Ajoutez au moins un fichier.', 'error'); return }
    goBtn.disabled = true; results.clear()
    const fmt = fmtSel.value
    const extra = audioArgs(fmt, brSel.value)
    let ok = 0, err = 0
    for (let i = 0; i < list.paths.length; i++) {
      const p = list.paths[i]
      setStatus(status, `${i+1}/${list.paths.length} — ${shortName(p)}`, 'progress')
      const dir = outDir || p.replace(/[\\/][^\\/]+$/, '')
      const out = dir + '\\' + stem(p) + '.' + fmt
      try {
        await invoke('convert_media', { input: p, output: out, extraArgs: extra })
        results.add(out, true)
        trackRecentFile(out, shortName(out))
        ok++
      } catch (e) {
        results.add(shortName(p) + ': ' + String(e).slice(0,60), false); err++
      }
    }
    setStatus(status, `${ok} converti(s)${err ? `, ${err} erreur(s)` : ''} ✓`, ok ? 'success' : 'error')
    goBtn.disabled = false
  })
}

// ── Tab: Vidéo ────────────────────────────────────────────────────────────────

const VIDEO_EXTS = ['mp4','webm','avi','mov','mkv','m4v','wmv','flv','ts','mts','m2ts']
const VIDEO_FMTS = [
  ['mp4',  'MP4 (H.264) — Compatible universel'],
  ['webm', 'WebM (VP9) — Web'],
  ['avi',  'AVI'],
  ['mov',  'MOV (QuickTime)'],
  ['mkv',  'MKV (Matroska)'],
  ['gif',  'GIF animé'],
]
const VIDEO_QUALITY = [
  ['fast',   'Rapide (qualité réduite)'],
  ['medium', 'Standard'],
  ['slow',   'Haute qualité (lent)'],
]
const VIDEO_RES = [
  ['',      'Résolution originale'],
  ['1920:-2','1080p'],
  ['1280:-2','720p'],
  ['854:-2', '480p'],
  ['640:-2', '360p'],
]

function videoArgs(fmt, quality, resVal) {
  const crf = quality === 'fast' ? '28' : quality === 'slow' ? '18' : '23'
  const preset = quality === 'fast' ? 'fast' : quality === 'slow' ? 'slow' : 'medium'
  const vf = resVal ? [`scale=${resVal}`] : []

  switch (fmt) {
    case 'mp4': {
      const a = ['-c:v','libx264','-crf',crf,'-preset',preset,'-c:a','aac','-b:a','128k','-movflags','+faststart']
      if (vf.length) a.push('-vf', vf.join(','))
      return a
    }
    case 'webm': {
      const a = ['-c:v','libvpx-vp9','-crf',crf,'-b:v','0','-c:a','libopus','-b:a','128k']
      if (vf.length) a.push('-vf', vf.join(','))
      return a
    }
    case 'gif': {
      const scale = resVal || '480:-2'
      return ['-vf', `scale=${scale},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`, '-loop','0']
    }
    default: {
      const a = ['-c:v','copy','-c:a','copy']
      if (vf.length) { a[0] = '-vf'; a[1] = vf.join(','); a.unshift('-c:v', 'libx264', '-crf', crf) }
      return a
    }
  }
}

function buildVideo(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:#888;'
  note.textContent = 'Convertissez des vidéos via FFmpeg. Le GIF animé fonctionne aussi.'

  const list = fileList(VIDEO_EXTS)

  const fmtSel  = select(VIDEO_FMTS)
  const qualSel = select(VIDEO_QUALITY)
  qualSel.value = 'medium'
  const resSel  = select(VIDEO_RES)
  const optRow  = hrow(label('Format cible', fmtSel), label('Qualité', qualSel), label('Résolution', resSel))

  const addBtn    = btn('<i class="fa-solid fa-plus"></i> Ajouter des vidéos')
  const outDirBtn = btn('<i class="fa-solid fa-folder"></i> Dossier de sortie')
  let outDir = null
  const outDirLbl = document.createElement('span')
  outDirLbl.style.cssText = 'font-size:11px;color:#666;flex:1;'
  outDirLbl.textContent = 'Même dossier'
  const goBtn = btn('<i class="fa-solid fa-rotate"></i> Convertir tout', true)
  const status = statusEl()
  const results = resultList()

  // GIF can't have resolution 'keep' — set fallback
  fmtSel.addEventListener('change', () => {
    const isGif = fmtSel.value === 'gif'
    qualSel.parentElement.style.opacity = isGif ? '0.3' : '1'
    qualSel.disabled = isGif
  })

  wrap.append(note, list.el, optRow, hrow(addBtn, outDirBtn, outDirLbl), goBtn, status, results.el)

  addBtn.addEventListener('click', async () => list.add(await pickFiles('Vidéos', VIDEO_EXTS)))
  outDirBtn.addEventListener('click', async () => {
    const d = await openDirDialog(); if (d) { outDir = d; outDirLbl.textContent = shortName(d) }
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, 'Ajoutez au moins un fichier.', 'error'); return }
    goBtn.disabled = true; results.clear()
    const fmt  = fmtSel.value
    const qual = qualSel.value
    const res  = resSel.value
    const extra = videoArgs(fmt, qual, res)
    let ok = 0, err = 0
    for (let i = 0; i < list.paths.length; i++) {
      const p = list.paths[i]
      setStatus(status, `${i+1}/${list.paths.length} — ${shortName(p)} (peut être long…)`, 'progress')
      const dir = outDir || p.replace(/[\\/][^\\/]+$/, '')
      const out = dir + '\\' + stem(p) + '.' + fmt
      try {
        await invoke('convert_media', { input: p, output: out, extraArgs: extra })
        results.add(out, true)
        trackRecentFile(out, shortName(out))
        ok++
      } catch (e) {
        results.add(shortName(p) + ': ' + String(e).slice(0,60), false); err++
      }
    }
    setStatus(status, `${ok} converti(s)${err ? `, ${err} erreur(s)` : ''} ✓`, ok ? 'success' : 'error')
    goBtn.disabled = false
  })
}

// ── Tab: Documents ────────────────────────────────────────────────────────────

const DOC_EXTS = ['pdf','docx','doc','odt','rtf','txt','html','htm','epub','pptx','xlsx','csv']
const DOC_FMTS = [
  ['pdf',  'PDF'],
  ['docx', 'DOCX (Word)'],
  ['odt',  'ODT (LibreOffice)'],
  ['txt',  'TXT — Texte brut'],
  ['html', 'HTML'],
  ['rtf',  'RTF'],
  ['epub', 'EPUB'],
  ['pptx', 'PPTX (PowerPoint)'],
  ['xlsx', 'XLSX (Excel)'],
  ['csv',  'CSV'],
]

function buildDocuments(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:#888;'
  note.textContent = 'Conversion de documents via LibreOffice (doit être installé). Supporte PDF, DOCX, ODT, TXT, HTML, EPUB…'

  const sofficePath = { value: null }

  // Detect LibreOffice on open
  ;(async () => {
    if (!window.__TAURI__) return
    const p = await invoke('find_libreoffice', {})
    sofficePath.value = p || null
    if (p) {
      loBadge.textContent = '✓ LibreOffice détecté'
      loBadge.style.color = '#52b152'
    } else {
      loBadge.textContent = '✗ LibreOffice non trouvé — installez-le sur libreoffice.org'
      loBadge.style.color = '#e09052'
    }
  })()

  const loBadge = document.createElement('div')
  loBadge.style.cssText = 'font-size:10px;color:#888;'
  loBadge.textContent = 'Détection de LibreOffice…'

  const list = fileList(DOC_EXTS)

  const fmtSel = select(DOC_FMTS)
  const optRow = hrow(label('Format cible', fmtSel))

  const addBtn    = btn('<i class="fa-solid fa-plus"></i> Ajouter des documents')
  const outDirBtn = btn('<i class="fa-solid fa-folder"></i> Dossier de sortie')
  let outDir = null
  const outDirLbl = document.createElement('span')
  outDirLbl.style.cssText = 'font-size:11px;color:#666;flex:1;'
  outDirLbl.textContent = 'Même dossier'
  const goBtn = btn('<i class="fa-solid fa-rotate"></i> Convertir tout', true)
  const status = statusEl()
  const results = resultList()

  wrap.append(note, loBadge, list.el, optRow, hrow(addBtn, outDirBtn, outDirLbl), goBtn, status, results.el)

  addBtn.addEventListener('click', async () => list.add(await pickFiles('Documents', DOC_EXTS)))
  outDirBtn.addEventListener('click', async () => {
    const d = await openDirDialog(); if (d) { outDir = d; outDirLbl.textContent = shortName(d) }
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, 'Ajoutez au moins un fichier.', 'error'); return }
    if (!sofficePath.value) { setStatus(status, 'LibreOffice non trouvé. Installez-le pour cette fonctionnalité.', 'error'); return }
    goBtn.disabled = true; results.clear()
    const fmt = fmtSel.value
    let ok = 0, err = 0
    for (let i = 0; i < list.paths.length; i++) {
      const p = list.paths[i]
      setStatus(status, `${i+1}/${list.paths.length} — ${shortName(p)}`, 'progress')
      const dir = outDir || p.replace(/[\\/][^\\/]+$/, '')
      try {
        const out = await invoke('convert_with_libreoffice', { soffice: sofficePath.value, input: p, outputDir: dir, format: fmt })
        results.add(out, true)
        trackRecentFile(out, shortName(out))
        ok++
      } catch (e) {
        results.add(shortName(p) + ': ' + String(e).slice(0,60), false); err++
      }
    }
    setStatus(status, `${ok} converti(s)${err ? `, ${err} erreur(s)` : ''} ✓`, ok ? 'success' : 'error')
    goBtn.disabled = false
  })
}

// ── Tab: PDF (opérations spécifiques) ────────────────────────────────────────

async function pickSinglePdf() {
  const a = await pickFiles('PDF', ['pdf']); return a[0] || null
}

function pdfFileRow(label_) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const pickBtn = btn(`<i class="fa-solid fa-file-pdf"></i> ${label_}`)
  const lbl = document.createElement('span')
  lbl.style.cssText = 'flex:1;font-size:11px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  lbl.textContent = 'Aucun fichier'
  row.append(pickBtn, lbl)
  let path = null
  pickBtn.addEventListener('click', async () => {
    const p = await pickSinglePdf()
    if (p) { path = p; lbl.textContent = shortName(p) }
  })
  return { el: row, get path() { return path } }
}

function buildPdf(wrap) {
  // Sub-tabs for PDF operations
  const PDF_SUBTABS = [
    { id: 'merge',   label: 'Fusionner',    build: buildPdfMerge },
    { id: 'split',   label: 'Diviser',      build: buildPdfSplit },
    { id: 'rotate',  label: 'Pivoter',      build: buildPdfRotate },
    { id: 'reorder', label: 'Réordonner',   build: buildPdfReorder },
    { id: 'img2pdf', label: 'Images → PDF', build: buildImgToPdf },
  ]

  const tabRow = document.createElement('div')
  tabRow.style.cssText = 'display:flex;gap:2px;flex-wrap:wrap;'

  const content = document.createElement('div')
  content.style.cssText = 'flex:1;overflow:auto;'

  wrap.append(tabRow, content)

  let activeId = null
  const panels = {}

  for (const t of PDF_SUBTABS) {
    const tb = document.createElement('button')
    tb.textContent = t.label
    tb.style.cssText = BTN + 'background:none;color:#888;border:1px solid transparent;'

    const panel = document.createElement('div')
    panel.style.cssText = 'display:none;flex-direction:column;gap:8px;padding-top:10px;'
    content.appendChild(panel)
    panels[t.id] = { btn: tb, panel }

    tb.addEventListener('click', () => {
      if (activeId) {
        panels[activeId].btn.style.background = 'none'
        panels[activeId].btn.style.color = '#888'
        panels[activeId].btn.style.borderColor = 'transparent'
        panels[activeId].panel.style.display = 'none'
      }
      activeId = t.id
      tb.style.background = 'rgba(255,255,255,0.08)'
      tb.style.color = 'var(--text-primary,#ddd)'
      tb.style.borderColor = 'var(--win-border-in,#333)'
      panel.style.display = 'flex'
      if (!panel.dataset.built) { panel.dataset.built = '1'; t.build(panel) }
    })
    tabRow.appendChild(tb)
  }

  panels[PDF_SUBTABS[0].id].btn.click()
}

function buildPdfMerge(wrap) {
  const list = fileList(['pdf'])
  const addBtn = btn('<i class="fa-solid fa-plus"></i> Ajouter des PDF')
  const goBtn  = btn('<i class="fa-solid fa-object-group"></i> Fusionner', true)
  const status = statusEl()
  wrap.append(list.el, hrow(addBtn, goBtn), status)
  addBtn.addEventListener('click', async () => list.add(await pickFiles('PDF', ['pdf'])))
  goBtn.addEventListener('click', async () => {
    if (list.paths.length < 2) { setStatus(status, 'Minimum 2 PDF.', 'error'); return }
    const out = await saveDialog('fusion.pdf', ['pdf']); if (!out) return
    setStatus(status, 'Fusion…', 'progress'); goBtn.disabled = true
    try {
      await invoke('pdf_merge', { paths: list.paths, output: out })
      trackRecentFile(out, shortName(out))
      setStatus(status, `→ ${shortName(out)} ✓`, 'success')
    } catch (e) { setStatus(status, String(e), 'error') }
    goBtn.disabled = false
  })
}

function buildPdfSplit(wrap) {
  const picker = pdfFileRow('Choisir un PDF')
  const infoLbl = document.createElement('div')
  infoLbl.style.cssText = 'font-size:11px;color:#888;'
  const goBtn = btn('<i class="fa-solid fa-scissors"></i> Diviser en pages', true)
  const status = statusEl()
  wrap.append(picker.el, infoLbl, goBtn, status)
  picker.el.querySelector('button').addEventListener('click', async () => {
    if (picker.path) {
      try {
        const info = JSON.parse(await invoke('pdf_info', { path: picker.path }))
        infoLbl.textContent = `${info.page_count} pages`
      } catch {}
    }
  })
  goBtn.addEventListener('click', async () => {
    if (!picker.path) { setStatus(status, 'Choisissez un PDF.', 'error'); return }
    const dir = await openDirDialog(); if (!dir) return
    setStatus(status, 'Division…', 'progress'); goBtn.disabled = true
    try {
      const out = await invoke('pdf_split', { path: picker.path, outputDir: dir })
      out.forEach(p => trackRecentFile(p, shortName(p)))
      setStatus(status, `${out.length} fichier(s) créé(s) ✓`, 'success')
    } catch (e) { setStatus(status, String(e), 'error') }
    goBtn.disabled = false
  })
}

function buildPdfRotate(wrap) {
  const picker = pdfFileRow('Choisir un PDF')
  const angleSel = select([['90','90° horaire'],['180','180°'],['270','270° antihoraire']])
  const pagesInp = document.createElement('input')
  pagesInp.type = 'text'; pagesInp.placeholder = 'Pages (ex: 1,3-5 ou vide = toutes)'
  pagesInp.style.cssText = INP + 'flex:1;'
  const goBtn = btn('<i class="fa-solid fa-rotate-right"></i> Pivoter', true)
  const status = statusEl()
  wrap.append(picker.el, hrow(label('Angle', angleSel), label('Pages', pagesInp)), goBtn, status)
  function parsePages(s) {
    if (!s.trim()) return []
    const r = []; for (const p of s.split(',')) { const t = p.trim(); if (t.includes('-')) { const [a,b]=t.split('-').map(Number); for(let i=a;i<=b;i++) r.push(i) } else { const n=parseInt(t); if(!isNaN(n)) r.push(n) } } return [...new Set(r)].sort((a,b)=>a-b)
  }
  goBtn.addEventListener('click', async () => {
    if (!picker.path) { setStatus(status, 'Choisissez un PDF.', 'error'); return }
    const out = await saveDialog(stem(picker.path) + '_pivote.pdf', ['pdf']); if (!out) return
    setStatus(status, 'Rotation…', 'progress'); goBtn.disabled = true
    try {
      await invoke('pdf_rotate', { path: picker.path, output: out, pages: parsePages(pagesInp.value), degrees: parseInt(angleSel.value) })
      trackRecentFile(out, shortName(out))
      setStatus(status, `→ ${shortName(out)} ✓`, 'success')
    } catch (e) { setStatus(status, String(e), 'error') }
    goBtn.disabled = false
  })
}

function buildPdfReorder(wrap) {
  const picker = pdfFileRow('Choisir un PDF')
  const infoLbl = document.createElement('div'); infoLbl.style.cssText = 'font-size:11px;color:#888;'
  const orderInp = document.createElement('input'); orderInp.type='text'; orderInp.placeholder='Ordre (ex: 3,1,2,4)'; orderInp.style.cssText=INP+'width:100%;box-sizing:border-box;'
  const goBtn = btn('<i class="fa-solid fa-sort"></i> Réordonner', true)
  const status = statusEl()
  wrap.append(picker.el, infoLbl, label('Ordre des pages', orderInp), goBtn, status)
  picker.el.querySelector('button').addEventListener('click', async () => {
    if (picker.path) {
      try { const info = JSON.parse(await invoke('pdf_info',{path:picker.path})); infoLbl.textContent=`${info.page_count} pages`; orderInp.value=Array.from({length:info.page_count},(_,i)=>i+1).join(',') } catch {}
    }
  })
  goBtn.addEventListener('click', async () => {
    if (!picker.path) { setStatus(status,'Choisissez un PDF.','error'); return }
    const order = orderInp.value.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n))
    if (!order.length) { setStatus(status,'Ordre invalide.','error'); return }
    const out = await saveDialog(stem(picker.path)+'_reordonné.pdf',['pdf']); if (!out) return
    setStatus(status,'Réorganisation…','progress'); goBtn.disabled=true
    try {
      await invoke('pdf_reorder',{path:picker.path,output:out,order})
      trackRecentFile(out, shortName(out))
      setStatus(status,`→ ${shortName(out)} ✓`,'success')
    } catch (e) { setStatus(status,String(e),'error') }
    goBtn.disabled=false
  })
}

function buildImgToPdf(wrap) {
  const list = fileList(['png','jpg','jpeg','webp','gif','bmp','tiff'])
  const addBtn = btn('<i class="fa-solid fa-images"></i> Ajouter des images')
  const goBtn  = btn('<i class="fa-solid fa-file-pdf"></i> Créer le PDF', true)
  const status = statusEl()
  wrap.append(list.el, hrow(addBtn, goBtn), status)
  addBtn.addEventListener('click', async () => list.add(await pickFiles('Images', ['png','jpg','jpeg','webp','gif','bmp'])))
  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status,'Ajoutez des images.','error'); return }
    const out = await saveDialog('images.pdf',['pdf']); if (!out) return
    setStatus(status,'Création du PDF…','progress'); goBtn.disabled=true
    try {
      await invoke('images_to_pdf',{paths:list.paths,output:out})
      trackRecentFile(out, shortName(out))
      setStatus(status,`→ ${shortName(out)} ✓`,'success')
    } catch (e) { setStatus(status,String(e),'error') }
    goBtn.disabled=false
  })
}

// ── Main init ─────────────────────────────────────────────────────────────────

export function initConverter(body) {
  if (!window.__TAURI__ || window.__ICEAMPLE_WEB__) {
    renderDesktopOnly(body)
    return
  }

  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;'

  const TABS = [
    { id: 'images', label: 'Images',     icon: 'fa-solid fa-image',         build: buildImages },
    { id: 'audio',  label: 'Audio',      icon: 'fa-solid fa-music',          build: buildAudio },
    { id: 'video',  label: 'Vidéo',      icon: 'fa-solid fa-film',           build: buildVideo },
    { id: 'docs',   label: 'Documents',  icon: 'fa-solid fa-file-lines',     build: buildDocuments },
    { id: 'pdf',    label: 'PDF',        icon: 'fa-solid fa-file-pdf',       build: buildPdf },
  ]

  // Tab bar
  const tabBar = document.createElement('div')
  tabBar.style.cssText = 'display:flex;padding:0 8px;border-bottom:1px solid var(--win-border-in,#1e1e1e);flex-shrink:0;overflow-x:auto;'

  const contentArea = document.createElement('div')
  contentArea.style.cssText = 'flex:1;overflow:hidden;position:relative;'

  let activeId = null
  const panels = {}

  for (const tab of TABS) {
    const tabBtn = document.createElement('button')
    tabBtn.innerHTML = `<i class="${tab.icon}" style="margin-right:5px;"></i>${tab.label}`
    tabBtn.style.cssText = 'background:none;border:none;border-bottom:2px solid transparent;color:#888;padding:9px 14px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap;transition:color 0.15s;'

    const panel = document.createElement('div')
    panel.style.cssText = 'position:absolute;inset:0;display:none;overflow-y:auto;'
    contentArea.appendChild(panel)
    panels[tab.id] = { btn: tabBtn, panel }

    tabBtn.addEventListener('click', () => {
      if (activeId) {
        panels[activeId].btn.style.borderBottomColor = 'transparent'
        panels[activeId].btn.style.color = '#888'
        panels[activeId].panel.style.display = 'none'
      }
      activeId = tab.id
      tabBtn.style.borderBottomColor = 'var(--color-active,#4a9eff)'
      tabBtn.style.color = 'var(--text-primary,#ddd)'
      panel.style.display = 'block'

      if (!panel.dataset.built) {
        panel.dataset.built = '1'
        const sec = section(tab.build)
        panel.appendChild(sec)
      }
    })

    tabBar.appendChild(tabBtn)
  }

  body.append(tabBar, contentArea)
  panels[TABS[0].id].btn.click()
}
