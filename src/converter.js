// converter.js — Convertisseur universel (images, audio, vidéo, documents, PDF)

import { trackRecentFile } from './recent.js'
import { renderDesktopOnly } from './desktop-only.js'
import { t } from './i18n.js'

function invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args) }

// Fill {placeholders} of a translated string (function replacer: no `$` surprises in file names)
function fill(s, vars) { return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) }

// "3 converted" / "3 converted, 1 error(s)" + ✓
function doneMsg(ok, err) { return fill(err ? t('cv_done_ok_err') : t('cv_done_ok'), { ok, err }) + ' ✓' }

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
    ? 'background:var(--color-active,#4a9eff);color:var(--on-accent);'
    : 'background:var(--surface2);border:1px solid var(--win-border);color:var(--text-primary);')
  return b
}

function statusEl() {
  const d = document.createElement('div')
  d.style.cssText = 'font-size:11px;min-height:16px;'
  return d
}
function setStatus(el, msg, type) {
  el.textContent = msg
  el.style.color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : type === 'progress' ? 'var(--color-active)' : 'var(--text-secondary)'
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
  l.style.cssText = 'font-size:10px;color:var(--text-secondary);margin-bottom:3px;'
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

// Drop zones (file lists, single-PDF pickers) → { add(paths), hl(on) }.
// OS and library drops are routed to them by initConverter.
const dropTargets = new WeakMap()
function dropTarget(el, add, hl) { el.dataset.cvDrop = '1'; dropTargets.set(el, { add, hl }) }

// File list component
function fileList(accept) {
  const paths = []
  const box = document.createElement('div')
  box.style.cssText = 'border:1px dashed var(--win-border);border-radius:6px;padding:6px;min-height:50px;max-height:180px;overflow-y:auto;'

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
      ph.style.cssText = 'font-size:11px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);text-align:center;padding:10px;'
      ph.textContent = t('cv_no_file')
      box.appendChild(ph); return
    }
    paths.forEach((p, i) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;margin-bottom:2px;'
      row.addEventListener('mouseenter', () => row.style.background = 'color-mix(in srgb, var(--text-primary) 4%, transparent)')
      row.addEventListener('mouseleave', () => row.style.background = '')
      const icon = document.createElement('i')
      icon.className = ICONS[ext(p)] || 'fa-solid fa-file'
      icon.style.cssText = 'font-size:12px;color:var(--text-secondary);width:14px;text-align:center;'
      const name = document.createElement('span')
      name.style.cssText = 'flex:1;font-size:11px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
      name.title = p; name.textContent = shortName(p)
      const rm = document.createElement('button')
      rm.innerHTML = '<i class="fa-solid fa-xmark"></i>'
      rm.style.cssText = 'background:none;border:none;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);cursor:pointer;font-size:10px;padding:2px 4px;'
      rm.addEventListener('click', () => { paths.splice(i, 1); render() })
      row.append(icon, name, rm)
      box.appendChild(row)
    })
  }
  render()

  function add(arr) { arr.forEach(p => { if (!paths.includes(p)) paths.push(p) }); render() }

  // Drag and drop (OS files / library items, routed by initConverter): accepted types only
  dropTarget(box,
    arr => { const ok = arr.filter(p => accept.includes(ext(p))); if (ok.length) add(ok) },
    on => { box.style.borderColor = on ? 'var(--color-active)' : 'var(--win-border)' })

  return {
    el: box,
    get paths() { return paths },
    add,
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
      row.style.cssText = `display:flex;align-items:center;gap:6px;font-size:11px;color:${ok ? 'var(--success)' : 'var(--danger)'};`
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
const IMG_FMTS = () => [
  ['jpg',  'JPG — ' + t('cv_fmt_jpeg_compressed')],
  ['png',  'PNG — ' + t('cv_fmt_lossless')],
  ['webp', 'WebP — ' + t('cv_fmt_modern')],
  ['bmp',  'BMP — ' + t('cv_fmt_raw_bitmap')],
  ['tiff', 'TIFF — ' + t('cv_fmt_high_quality')],
  ['gif',  'GIF'],
  ['ico',  'ICO — ' + t('cv_fmt_win_icon')],
]

function buildImages(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  note.textContent = t('cv_img_note')

  const list = fileList(IMG_EXTS)

  const fmtSel = select(IMG_FMTS())
  const qualSlider = document.createElement('input')
  qualSlider.type = 'range'; qualSlider.min = '10'; qualSlider.max = '100'; qualSlider.value = '90'
  qualSlider.style.cssText = 'flex:1;accent-color:var(--slider-color);'
  const qualLbl = document.createElement('span')
  qualLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);min-width:36px;'
  qualLbl.textContent = '90%'
  qualSlider.addEventListener('input', () => { qualLbl.textContent = qualSlider.value + '%' })

  const qualWrap = document.createElement('div')
  qualWrap.style.cssText = 'display:flex;gap:6px;align-items:center;flex:1;'
  qualWrap.append(qualSlider, qualLbl)

  const optRow = hrow(label(t('cv_target_format'), fmtSel), label(t('cv_quality_jpeg_webp'), qualWrap))

  const addBtn = btn('<i class="fa-solid fa-plus"></i> ' + t('cv_add_images'))
  const outDirBtn = btn('<i class="fa-solid fa-folder"></i> ' + t('cv_output_folder'))
  let outDir = null
  const outDirLbl = document.createElement('span')
  outDirLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  outDirLbl.textContent = t('cv_same_folder_src')
  const goBtn = btn('<i class="fa-solid fa-rotate"></i> ' + t('cv_convert_all'), true)
  const status = statusEl()
  const results = resultList()

  wrap.append(note, list.el, optRow, hrow(addBtn, outDirBtn, outDirLbl), goBtn, status, results.el)

  addBtn.addEventListener('click', async () => list.add(await pickFiles(t('cv_images'), IMG_EXTS)))
  outDirBtn.addEventListener('click', async () => {
    const d = await openDirDialog()
    if (d) { outDir = d; outDirLbl.textContent = shortName(d) }
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, t('cv_add_one_file'), 'error'); return }
    goBtn.disabled = true; results.clear()
    const fmt = fmtSel.value
    let ok = 0, err = 0
    for (let i = 0; i < list.paths.length; i++) {
      const p = list.paths[i]
      setStatus(status, fill(t('cv_converting_n'), { i: i + 1, n: list.paths.length }), 'progress')
      const dir = outDir || p.replace(/[\\/][^\\/]+$/, '')
      const outPath = dir + '\\' + stem(p) + '.' + fmt
      try {
        await invoke('convert_image', { input: p, output: outPath })
        results.add(outPath, true)
        trackRecentFile(outPath, shortName(outPath))
        ok++
      } catch (e) {
        results.add(fill(t('cv_item_error'), { name: shortName(p), err: String(e).slice(0, 60) }), false); err++
      }
    }
    setStatus(status, doneMsg(ok, err), ok ? 'success' : 'error')
    goBtn.disabled = false
  })
}

// ── Tab: Audio ────────────────────────────────────────────────────────────────

const AUDIO_EXTS = ['mp3','wav','flac','ogg','m4a','aac','opus','aiff','aif','wma','mka']
const AUDIO_FMTS = () => [
  ['mp3',  'MP3 — ' + t('cv_fmt_universal')],
  ['wav',  'WAV — ' + t('cv_fmt_lossless_pcm')],
  ['flac', 'FLAC — ' + t('cv_fmt_lossless_compressed')],
  ['ogg',  'OGG Vorbis — ' + t('cv_fmt_open')],
  ['m4a',  'M4A — AAC (Apple)'],
  ['aac',  'AAC'],
  ['opus', 'OPUS — ' + t('cv_fmt_modern_voip')],
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
  note.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  note.textContent = t('cv_audio_note')

  const list = fileList(AUDIO_EXTS)

  const fmtSel = select(AUDIO_FMTS())
  const brSel  = select(AUDIO_BITRATES)
  brSel.value  = '192k'
  const qualRow = hrow(label(t('cv_target_format'), fmtSel), label(t('cv_bitrate'), brSel))

  // Hide bitrate for lossless formats
  fmtSel.addEventListener('change', () => {
    const lossless = ['flac','wav'].includes(fmtSel.value)
    brSel.parentElement.style.opacity = lossless ? '0.3' : '1'
    brSel.disabled = lossless
  })

  const addBtn    = btn('<i class="fa-solid fa-plus"></i> ' + t('cv_add_audio'))
  const outDirBtn = btn('<i class="fa-solid fa-folder"></i> ' + t('cv_output_folder'))
  let outDir = null
  const outDirLbl = document.createElement('span')
  outDirLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);flex:1;'
  outDirLbl.textContent = t('cv_same_folder')
  const goBtn = btn('<i class="fa-solid fa-rotate"></i> ' + t('cv_convert_all'), true)
  const status = statusEl()
  const results = resultList()

  wrap.append(note, list.el, qualRow, hrow(addBtn, outDirBtn, outDirLbl), goBtn, status, results.el)

  addBtn.addEventListener('click', async () => list.add(await pickFiles(t('cv_audio'), AUDIO_EXTS)))
  outDirBtn.addEventListener('click', async () => {
    const d = await openDirDialog(); if (d) { outDir = d; outDirLbl.textContent = shortName(d) }
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, t('cv_add_one_file'), 'error'); return }
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
    setStatus(status, doneMsg(ok, err), ok ? 'success' : 'error')
    goBtn.disabled = false
  })
}

// ── Tab: Vidéo ────────────────────────────────────────────────────────────────

const VIDEO_EXTS = ['mp4','webm','avi','mov','mkv','m4v','wmv','flv','ts','mts','m2ts']
const VIDEO_FMTS = () => [
  ['mp4',  'MP4 (H.264) — ' + t('cv_fmt_universal')],
  ['webm', 'WebM (VP9) — ' + t('cv_fmt_web')],
  ['avi',  'AVI'],
  ['mov',  'MOV (QuickTime)'],
  ['mkv',  'MKV (Matroska)'],
  ['gif',  t('cv_fmt_animated_gif')],
]
const VIDEO_QUALITY = () => [
  ['fast',   t('cv_q_fast')],
  ['medium', t('cv_q_standard')],
  ['slow',   t('cv_q_slow')],
]
const VIDEO_RES = () => [
  ['',      t('cv_res_original')],
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
  note.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  note.textContent = t('cv_video_note')

  const list = fileList(VIDEO_EXTS)

  const fmtSel  = select(VIDEO_FMTS())
  const qualSel = select(VIDEO_QUALITY())
  qualSel.value = 'medium'
  const resSel  = select(VIDEO_RES())
  const optRow  = hrow(label(t('cv_target_format'), fmtSel), label(t('cv_quality'), qualSel), label(t('cv_resolution'), resSel))

  const addBtn    = btn('<i class="fa-solid fa-plus"></i> ' + t('cv_add_videos'))
  const outDirBtn = btn('<i class="fa-solid fa-folder"></i> ' + t('cv_output_folder'))
  let outDir = null
  const outDirLbl = document.createElement('span')
  outDirLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);flex:1;'
  outDirLbl.textContent = t('cv_same_folder')
  const goBtn = btn('<i class="fa-solid fa-rotate"></i> ' + t('cv_convert_all'), true)
  const status = statusEl()
  const results = resultList()

  // GIF can't have resolution 'keep' — set fallback
  fmtSel.addEventListener('change', () => {
    const isGif = fmtSel.value === 'gif'
    qualSel.parentElement.style.opacity = isGif ? '0.3' : '1'
    qualSel.disabled = isGif
  })

  wrap.append(note, list.el, optRow, hrow(addBtn, outDirBtn, outDirLbl), goBtn, status, results.el)

  addBtn.addEventListener('click', async () => list.add(await pickFiles(t('cv_videos'), VIDEO_EXTS)))
  outDirBtn.addEventListener('click', async () => {
    const d = await openDirDialog(); if (d) { outDir = d; outDirLbl.textContent = shortName(d) }
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, t('cv_add_one_file'), 'error'); return }
    goBtn.disabled = true; results.clear()
    const fmt  = fmtSel.value
    const qual = qualSel.value
    const res  = resSel.value
    const extra = videoArgs(fmt, qual, res)
    let ok = 0, err = 0
    for (let i = 0; i < list.paths.length; i++) {
      const p = list.paths[i]
      setStatus(status, fill(t('cv_video_progress'), { i: i + 1, n: list.paths.length, name: shortName(p) }), 'progress')
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
    setStatus(status, doneMsg(ok, err), ok ? 'success' : 'error')
    goBtn.disabled = false
  })
}

// ── Tab: Documents ────────────────────────────────────────────────────────────

const DOC_EXTS = ['pdf','docx','doc','odt','rtf','txt','html','htm','epub','pptx','xlsx','csv']
const DOC_FMTS = () => [
  ['pdf',  'PDF'],
  ['docx', 'DOCX (Word)'],
  ['odt',  'ODT (LibreOffice)'],
  ['txt',  'TXT — ' + t('cv_fmt_plain_text')],
  ['html', 'HTML'],
  ['rtf',  'RTF'],
  ['epub', 'EPUB'],
  ['pptx', 'PPTX (PowerPoint)'],
  ['xlsx', 'XLSX (Excel)'],
  ['csv',  'CSV'],
]

function buildDocuments(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  note.textContent = t('cv_docs_note')

  const sofficePath = { value: null }

  // Detect LibreOffice on open
  const loBadge = document.createElement('div')
  loBadge.style.cssText = 'font-size:10px;color:var(--text-secondary);'
  loBadge.textContent = t('cv_lo_detecting')

  // Detect LibreOffice on open (a failing lookup counts as "not found")
  ;(async () => {
    if (!window.__TAURI__) return
    let p = null
    try { p = await invoke('find_libreoffice', {}) } catch {}
    sofficePath.value = p || null
    if (p) {
      loBadge.textContent = '✓ ' + t('cv_lo_found')
      loBadge.style.color = 'var(--success)'
    } else {
      loBadge.textContent = '✗ ' + t('cv_lo_missing')
      loBadge.style.color = 'var(--warning)'
    }
  })()

  const list = fileList(DOC_EXTS)

  const fmtSel = select(DOC_FMTS())
  const optRow = hrow(label(t('cv_target_format'), fmtSel))

  const addBtn    = btn('<i class="fa-solid fa-plus"></i> ' + t('cv_add_docs'))
  const outDirBtn = btn('<i class="fa-solid fa-folder"></i> ' + t('cv_output_folder'))
  let outDir = null
  const outDirLbl = document.createElement('span')
  outDirLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);flex:1;'
  outDirLbl.textContent = t('cv_same_folder')
  const goBtn = btn('<i class="fa-solid fa-rotate"></i> ' + t('cv_convert_all'), true)
  const status = statusEl()
  const results = resultList()

  wrap.append(note, loBadge, list.el, optRow, hrow(addBtn, outDirBtn, outDirLbl), goBtn, status, results.el)

  addBtn.addEventListener('click', async () => list.add(await pickFiles(t('cv_documents'), DOC_EXTS)))
  outDirBtn.addEventListener('click', async () => {
    const d = await openDirDialog(); if (d) { outDir = d; outDirLbl.textContent = shortName(d) }
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, t('cv_add_one_file'), 'error'); return }
    if (!sofficePath.value) { setStatus(status, t('cv_lo_required'), 'error'); return }
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
    setStatus(status, doneMsg(ok, err), ok ? 'success' : 'error')
    goBtn.disabled = false
  })
}

// ── Tab: PDF (opérations spécifiques) ────────────────────────────────────────

async function pickSinglePdf() {
  const a = await pickFiles('PDF', ['pdf']); return a[0] || null
}

// onPick(path) runs once the chosen (or dropped) PDF is stored
function pdfFileRow(label_, onPick) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;align-items:center;outline-offset:3px;'
  const pickBtn = btn(`<i class="fa-solid fa-file-pdf"></i> ${label_}`)
  const lbl = document.createElement('span')
  lbl.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  lbl.textContent = t('cv_no_file')
  row.append(pickBtn, lbl)
  let path = null
  const setPath = p => { path = p; lbl.textContent = shortName(p); onPick?.(p) }
  pickBtn.addEventListener('click', async () => {
    const p = await pickSinglePdf()
    if (p) setPath(p)
  })
  dropTarget(row,
    arr => { const p = arr.find(x => ext(x) === 'pdf'); if (p) setPath(p) },
    on => { row.style.outline = on ? '1px dashed var(--color-active)' : '' })
  return { el: row, get path() { return path } }
}

// Page count of a PDF, or null if it can't be read
async function pdfPageCount(path) {
  try { return JSON.parse(await invoke('pdf_info', { path })).page_count } catch { return null }
}

function buildPdf(wrap) {
  // Sub-tabs for PDF operations
  const PDF_SUBTABS = [
    { id: 'merge',   label: t('cv_pdf_merge'),   build: buildPdfMerge },
    { id: 'split',   label: t('cv_pdf_split'),   build: buildPdfSplit },
    { id: 'rotate',  label: t('cv_pdf_rotate'),  build: buildPdfRotate },
    { id: 'reorder', label: t('cv_pdf_reorder'), build: buildPdfReorder },
    { id: 'img2pdf', label: t('cv_pdf_img2pdf'), build: buildImgToPdf },
  ]

  const tabRow = document.createElement('div')
  tabRow.style.cssText = 'display:flex;gap:2px;flex-wrap:wrap;'

  const content = document.createElement('div')
  content.style.cssText = 'flex:1;overflow:auto;'

  wrap.append(tabRow, content)

  let activeId = null
  const panels = {}

  for (const sub of PDF_SUBTABS) {
    const tb = document.createElement('button')
    tb.textContent = sub.label
    tb.style.cssText = BTN + 'background:none;color:var(--text-secondary);border:1px solid transparent;'

    const panel = document.createElement('div')
    panel.style.cssText = 'display:none;flex-direction:column;gap:8px;padding-top:10px;'
    content.appendChild(panel)
    panels[sub.id] = { btn: tb, panel }

    tb.addEventListener('click', () => {
      if (activeId) {
        panels[activeId].btn.style.background = 'none'
        panels[activeId].btn.style.color = 'var(--text-secondary)'
        panels[activeId].btn.style.borderColor = 'transparent'
        panels[activeId].panel.style.display = 'none'
      }
      activeId = sub.id
      tb.style.background = 'color-mix(in srgb, var(--text-primary) 8%, transparent)'
      tb.style.color = 'var(--text-primary,#ddd)'
      tb.style.borderColor = 'var(--win-border-in,#333)'
      panel.style.display = 'flex'
      if (!panel.dataset.built) { panel.dataset.built = '1'; sub.build(panel) }
    })
    tabRow.appendChild(tb)
  }

  panels[PDF_SUBTABS[0].id].btn.click()
}

function buildPdfMerge(wrap) {
  const list = fileList(['pdf'])
  const addBtn = btn('<i class="fa-solid fa-plus"></i> ' + t('cv_add_pdfs'))
  const goBtn  = btn('<i class="fa-solid fa-object-group"></i> ' + t('cv_pdf_merge'), true)
  const status = statusEl()
  wrap.append(list.el, hrow(addBtn, goBtn), status)
  addBtn.addEventListener('click', async () => list.add(await pickFiles('PDF', ['pdf'])))
  goBtn.addEventListener('click', async () => {
    if (list.paths.length < 2) { setStatus(status, t('cv_min_2_pdf'), 'error'); return }
    const out = await saveDialog(t('cv_file_merged') + '.pdf', ['pdf']); if (!out) return
    setStatus(status, t('cv_merging'), 'progress'); goBtn.disabled = true
    try {
      await invoke('pdf_merge', { paths: list.paths, output: out })
      trackRecentFile(out, shortName(out))
      setStatus(status, `→ ${shortName(out)} ✓`, 'success')
    } catch (e) { setStatus(status, String(e), 'error') }
    goBtn.disabled = false
  })
}

function buildPdfSplit(wrap) {
  const infoLbl = document.createElement('div')
  infoLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  const picker = pdfFileRow(t('cv_pick_pdf'), async p => {
    infoLbl.textContent = ''
    const n = await pdfPageCount(p)
    if (n == null || picker.path !== p) return   // unreadable, or another file chosen meanwhile
    infoLbl.textContent = fill(t('cv_n_pages'), { n })
  })
  const goBtn = btn('<i class="fa-solid fa-scissors"></i> ' + t('cv_split_pages'), true)
  const status = statusEl()
  wrap.append(picker.el, infoLbl, goBtn, status)
  goBtn.addEventListener('click', async () => {
    if (!picker.path) { setStatus(status, t('cv_choose_pdf_err'), 'error'); return }
    const dir = await openDirDialog(); if (!dir) return
    setStatus(status, t('cv_splitting'), 'progress'); goBtn.disabled = true
    try {
      const out = await invoke('pdf_split', { path: picker.path, outputDir: dir })
      out.forEach(p => trackRecentFile(p, shortName(p)))
      setStatus(status, fill(t('cv_files_created'), { n: out.length }) + ' ✓', 'success')
    } catch (e) { setStatus(status, String(e), 'error') }
    goBtn.disabled = false
  })
}

function buildPdfRotate(wrap) {
  const picker = pdfFileRow(t('cv_pick_pdf'))
  const angleSel = select([['90', t('cv_rot_cw')],['180','180°'],['270', t('cv_rot_ccw')]])
  const pagesInp = document.createElement('input')
  pagesInp.type = 'text'; pagesInp.placeholder = t('cv_pages_ph')
  pagesInp.style.cssText = INP + 'flex:1;'
  const goBtn = btn('<i class="fa-solid fa-rotate-right"></i> ' + t('cv_pdf_rotate'), true)
  const status = statusEl()
  wrap.append(picker.el, hrow(label(t('cv_angle'), angleSel), label(t('cv_pages'), pagesInp)), goBtn, status)
  function parsePages(s) {
    if (!s.trim()) return []
    const r = []; for (const p of s.split(',')) { const t = p.trim(); if (t.includes('-')) { const [a,b]=t.split('-').map(Number); for(let i=a;i<=b;i++) r.push(i) } else { const n=parseInt(t); if(!isNaN(n)) r.push(n) } } return [...new Set(r)].sort((a,b)=>a-b)
  }
  goBtn.addEventListener('click', async () => {
    if (!picker.path) { setStatus(status, t('cv_choose_pdf_err'), 'error'); return }
    const out = await saveDialog(stem(picker.path) + '_' + t('cv_suffix_rotated') + '.pdf', ['pdf']); if (!out) return
    setStatus(status, t('cv_rotating'), 'progress'); goBtn.disabled = true
    try {
      await invoke('pdf_rotate', { path: picker.path, output: out, pages: parsePages(pagesInp.value), degrees: parseInt(angleSel.value) })
      trackRecentFile(out, shortName(out))
      setStatus(status, `→ ${shortName(out)} ✓`, 'success')
    } catch (e) { setStatus(status, String(e), 'error') }
    goBtn.disabled = false
  })
}

function buildPdfReorder(wrap) {
  const infoLbl = document.createElement('div'); infoLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  const orderInp = document.createElement('input'); orderInp.type='text'; orderInp.placeholder=t('cv_order_ph'); orderInp.style.cssText=INP+'width:100%;box-sizing:border-box;'
  const picker = pdfFileRow(t('cv_pick_pdf'), async p => {
    infoLbl.textContent = ''
    const n = await pdfPageCount(p)
    if (n == null || picker.path !== p) return   // unreadable, or another file chosen meanwhile
    infoLbl.textContent = fill(t('cv_n_pages'), { n })
    orderInp.value = Array.from({ length: n }, (_, i) => i + 1).join(',')
  })
  const goBtn = btn('<i class="fa-solid fa-sort"></i> ' + t('cv_pdf_reorder'), true)
  const status = statusEl()
  wrap.append(picker.el, infoLbl, label(t('cv_page_order'), orderInp), goBtn, status)
  goBtn.addEventListener('click', async () => {
    if (!picker.path) { setStatus(status,t('cv_choose_pdf_err'),'error'); return }
    const order = orderInp.value.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n))
    if (!order.length) { setStatus(status,t('cv_invalid_order'),'error'); return }
    const out = await saveDialog(stem(picker.path)+'_'+t('cv_suffix_reordered')+'.pdf',['pdf']); if (!out) return
    setStatus(status,t('cv_reordering'),'progress'); goBtn.disabled=true
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
  const addBtn = btn('<i class="fa-solid fa-images"></i> ' + t('cv_add_images'))
  const goBtn  = btn('<i class="fa-solid fa-file-pdf"></i> ' + t('cv_create_pdf'), true)
  const status = statusEl()
  wrap.append(list.el, hrow(addBtn, goBtn), status)
  addBtn.addEventListener('click', async () => list.add(await pickFiles(t('cv_images'), ['png','jpg','jpeg','webp','gif','bmp'])))
  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status,t('cv_need_images'),'error'); return }
    const out = await saveDialog(t('cv_file_images')+'.pdf',['pdf']); if (!out) return
    setStatus(status,t('cv_creating_pdf'),'progress'); goBtn.disabled=true
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
    { id: 'images', label: t('cv_images'),    icon: 'fa-solid fa-image',         build: buildImages },
    { id: 'audio',  label: t('cv_audio'),     icon: 'fa-solid fa-music',          build: buildAudio },
    { id: 'video',  label: t('cv_video'),     icon: 'fa-solid fa-film',           build: buildVideo },
    { id: 'docs',   label: t('cv_documents'), icon: 'fa-solid fa-file-lines',     build: buildDocuments },
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
    tabBtn.style.cssText = 'background:none;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);padding:9px 14px;cursor:pointer;font-size:11px;font-family:inherit;white-space:nowrap;transition:color 0.15s;'

    const panel = document.createElement('div')
    panel.style.cssText = 'position:absolute;inset:0;display:none;overflow-y:auto;'
    contentArea.appendChild(panel)
    panels[tab.id] = { btn: tabBtn, panel }

    tabBtn.addEventListener('click', () => {
      if (activeId) {
        panels[activeId].btn.style.borderBottomColor = 'transparent'
        panels[activeId].btn.style.color = 'var(--text-secondary)'
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

  // ── Drops: OS files (Tauri) + library drags ─────────────────────────────────
  // Target = drop zone under the pointer, else the one in the visible tab.
  const targetAt = el => {
    const hit = el?.closest?.('[data-cv-drop]')
    if (hit && body.contains(hit)) return hit
    return [...body.querySelectorAll('[data-cv-drop]')].find(z => z.getClientRects().length) || null
  }
  // Element under a Tauri drag position (physical px); undefined = position unusable
  const elAt = pos => {
    if (!pos) return undefined
    const x = pos.x / devicePixelRatio, y = pos.y / devicePixelRatio
    if (!(x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight)) return undefined
    return document.elementFromPoint(x, y) || undefined
  }
  let lit = null
  const light = z => {
    if (lit === z) return
    if (lit) dropTargets.get(lit)?.hl(false)
    lit = z
    if (z) dropTargets.get(z)?.hl(true)
  }

  // onDragDropEvent is webview-GLOBAL: unlisten at teardown, or every open of
  // this tool leaves another listener holding a dead body.
  let dead = false
  let dropUnlisten = null
  ;(async () => {
    try {
      const wv = window.__TAURI__.webview?.getCurrentWebview?.()
      if (!wv?.onDragDropEvent) return
      const un = await wv.onDragDropEvent(e => {
        if (!document.contains(body)) return
        const { type, paths, position } = e.payload || {}
        if (type === 'leave') { light(null); return }
        const under = elAt(position)
        // Over another tool window → not for this one
        const zone = under && !body.contains(under) ? null : targetAt(under)
        if (type === 'enter' || type === 'over') light(zone)
        else if (type === 'drop') {
          light(null)
          if (zone && paths?.length) dropTargets.get(zone)?.add(paths)
        }
      })
      if (dead) un()   // closed while awaiting
      else dropUnlisten = un
    } catch {}
  })()

  // Library drag (item dropped on this tool)
  body.addEventListener('iceample-drop', e => {
    const f = e.detail?.file
    if (!f?.path) return
    const zone = targetAt(e.target)
    if (zone) dropTargets.get(zone)?.add([f.path])
  })

  const cleanObs = new MutationObserver(() => {
    if (document.contains(body)) return
    dead = true
    dropUnlisten?.(); dropUnlisten = null
    cleanObs.disconnect()
  })
  cleanObs.observe(document.body, { childList: true, subtree: true })
}
