// pdftool.js — Suite d'outils PDF (fusionner, diviser, pivoter, réordonner, images↔PDF, DOCX/ODT↔PDF)
import { renderDesktopOnly } from './desktop-only.js'
import { t } from './i18n.js'

function invoke(cmd, args) {
  return window.__TAURI__.core.invoke(cmd, args)
}

async function saveDialog(defaultName, filters) {
  try {
    return await window.__TAURI__.dialog.save({ defaultPath: defaultName, filters })
  } catch { return null }
}

async function pickPdfFiles() {
  try {
    const paths = await invoke('pick_files_with_filter', {
      filterName: t('pdf_filter_pdfs'), extensions: ['pdf']
    })
    return paths || []
  } catch { return [] }
}

async function pickImageFiles() {
  try {
    const paths = await invoke('pick_files_with_filter', {
      filterName: t('pdf_filter_images'), extensions: ['png','jpg','jpeg','gif','webp','bmp','tiff','tif']
    })
    return paths || []
  } catch { return [] }
}

async function pickDocFiles() {
  try {
    const paths = await invoke('pick_files_with_filter', {
      filterName: t('pdf_filter_office'), extensions: ['docx','doc','odt','rtf','xlsx','pptx']
    })
    return paths || []
  } catch { return [] }
}

async function pickSinglePdf() {
  try {
    const paths = await invoke('pick_files_with_filter', {
      filterName: t('pdf_filter_pdf'), extensions: ['pdf']
    })
    return paths && paths[0] ? paths[0] : null
  } catch { return null }
}

function shortName(path) {
  return path ? path.replace(/\\/g, '/').split('/').pop() : ''
}

// Page-list separators: ASCII, fullwidth (，), ideographic (、) and Arabic (،) commas, or spaces
const PAGE_SEP = /[,，、،\s]+/

function fileItem(path, onRemove) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--surface2,#1a1a1a);border-radius:5px;margin-bottom:4px;'
  row.innerHTML = `<i class="fa-solid fa-file-pdf" style="color:var(--danger);font-size:13px;"></i>`
  const name = document.createElement('span')
  name.style.cssText = 'flex:1;font-size:11px;color:var(--text-primary,#ddd);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  name.title = path
  name.textContent = shortName(path)
  const rm = document.createElement('button')
  rm.innerHTML = '<i class="fa-solid fa-xmark"></i>'
  rm.style.cssText = 'background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:2px 4px;font-size:11px;'
  rm.addEventListener('click', onRemove)
  row.append(name, rm)
  return row
}

function makeSection(title, buildFn) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:14px 16px;gap:12px;'

  const h = document.createElement('div')
  h.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-primary,#ddd);padding-bottom:8px;border-bottom:1px solid var(--win-border-in,#1e1e1e);'
  h.textContent = title
  wrap.appendChild(h)

  buildFn(wrap)
  return wrap
}

function btn(label, icon, primary) {
  const b = document.createElement('button')
  b.innerHTML = `<i class="${icon}"></i> ${label}`
  b.style.cssText = `border:none;border-radius:5px;padding:7px 14px;cursor:pointer;font-size:11px;font-family:inherit;${
    primary
      ? 'background:var(--color-active,#4a9eff);color:var(--on-accent);'
      : 'background:var(--surface2);border:1px solid var(--win-border);color:var(--text-primary);'
  }`
  return b
}

function statusDiv() {
  const d = document.createElement('div')
  d.style.cssText = 'font-size:11px;color:var(--text-secondary);min-height:18px;'
  return d
}

function setStatus(el, msg, type) {
  el.textContent = msg
  el.style.color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--text-secondary)'
}

function fileListBox() {
  const box = document.createElement('div')
  box.style.cssText = 'border:1px dashed var(--win-border);border-radius:6px;padding:8px;min-height:60px;max-height:200px;overflow-y:auto;'
  const empty = document.createElement('div')
  empty.style.cssText = 'font-size:11px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);text-align:center;padding:16px;'
  empty.textContent = t('pdf_no_file')
  box.appendChild(empty)

  const paths = []

  function render() {
    box.innerHTML = ''
    if (!paths.length) { box.appendChild(empty); return }
    paths.forEach((p, i) => {
      const row = fileItem(p, () => { paths.splice(i, 1); render() })
      box.appendChild(row)
    })
  }

  return {
    el: box,
    get paths() { return paths },
    add(newPaths) { newPaths.forEach(p => { if (!paths.includes(p)) paths.push(p) }); render() },
    clear() { paths.length = 0; render() },
  }
}

// ── Tab: Fusionner ────────────────────────────────────────────────────────────
function buildMerge(wrap) {
  const list = fileListBox()
  wrap.appendChild(list.el)

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;'
  const addBtn = btn(t('pdf_add_pdfs'), 'fa-solid fa-plus')
  const goBtn  = btn(t('pdf_merge'), 'fa-solid fa-object-group', true)
  row.append(addBtn, goBtn)

  const note = document.createElement('div')
  note.style.cssText = 'font-size:10px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);'
  note.textContent = t('pdf_merge_note')

  const status = statusDiv()
  wrap.append(row, note, status)

  addBtn.addEventListener('click', async () => {
    const paths = await pickPdfFiles()
    list.add(paths)
  })

  goBtn.addEventListener('click', async () => {
    if (list.paths.length < 2) { setStatus(status, t('pdf_err_min2'), 'error'); return }
    const out = await saveDialog(t('pdf_fname_merged') + '.pdf', [{ name: 'PDF', extensions: ['pdf'] }])
    if (!out) return
    setStatus(status, t('pdf_merging'))
    goBtn.disabled = true
    try {
      await invoke('pdf_merge', { paths: list.paths, output: out })
      setStatus(status, t('pdf_merged').replace('{file}', () => shortName(out)) + ' ✓', 'success')
    } catch (e) { setStatus(status, t('pdf_error') + ' ' + String(e), 'error') }
    goBtn.disabled = false
  })
}

// ── Tab: Diviser ──────────────────────────────────────────────────────────────
function buildSplit(wrap) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const pickBtn = btn(t('pdf_pick_pdf'), 'fa-solid fa-file-pdf')
  const fileLbl = document.createElement('span')
  fileLbl.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  fileLbl.textContent = t('pdf_no_file')
  row.append(pickBtn, fileLbl)

  let pdfPath = null
  const infoLbl = document.createElement('div')
  infoLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);'

  const goBtn = btn(t('pdf_split_go'), 'fa-solid fa-scissors', true)
  const status = statusDiv()
  wrap.append(row, infoLbl, goBtn, status)

  pickBtn.addEventListener('click', async () => {
    const p = await pickSinglePdf()
    if (!p) return
    pdfPath = p
    fileLbl.textContent = shortName(p)
    try {
      const info = JSON.parse(await invoke('pdf_info', { path: p }))
      infoLbl.textContent = `${t('pdf_pages_n').replace('{n}', info.page_count)} — ${Math.round(info.width)}×${Math.round(info.height)} pt`
    } catch { infoLbl.textContent = '' }
  })

  goBtn.addEventListener('click', async () => {
    if (!pdfPath) { setStatus(status, t('pdf_err_pick'), 'error'); return }
    const { dialog } = window.__TAURI__
    const dir = await dialog.open({ directory: true, title: t('pdf_dest_folder') }).catch(() => null)
    if (!dir) return
    setStatus(status, t('pdf_splitting'))
    goBtn.disabled = true
    try {
      const out = await invoke('pdf_split', { path: pdfPath, outputDir: dir })
      setStatus(status, t('pdf_split_done').replace('{n}', out.length).replace('{dir}', () => shortName(dir)) + ' ✓', 'success')
    } catch (e) { setStatus(status, t('pdf_error') + ' ' + String(e), 'error') }
    goBtn.disabled = false
  })
}

// ── Tab: Pivoter ──────────────────────────────────────────────────────────────
function buildRotate(wrap) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const pickBtn = btn(t('pdf_pick_pdf'), 'fa-solid fa-file-pdf')
  const fileLbl = document.createElement('span')
  fileLbl.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary);'
  fileLbl.textContent = t('pdf_no_file')
  row.append(pickBtn, fileLbl)

  let pdfPath = null

  const optRow = document.createElement('div')
  optRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;'

  const angleSelect = document.createElement('select')
  angleSelect.style.cssText = 'background:var(--surface2,#1a1a1a);border:1px solid var(--win-border);color:var(--text-primary);border-radius:5px;padding:5px 8px;font-size:12px;'
  for (const [label, val] of [[t('pdf_rot_90'), '90'], ['180°', '180'], [t('pdf_rot_270'), '270']]) {
    const opt = document.createElement('option')
    opt.value = val; opt.textContent = label
    angleSelect.appendChild(opt)
  }

  const pageInput = document.createElement('input')
  pageInput.type = 'text'; pageInput.placeholder = t('pdf_pages_ph')
  pageInput.style.cssText = 'flex:1;background:var(--surface2,#1a1a1a);border:1px solid var(--win-border);color:var(--text-primary);border-radius:5px;padding:5px 8px;font-size:11px;outline:none;'

  optRow.append(angleSelect, pageInput)

  const goBtn = btn(t('pdf_rotate_go'), 'fa-solid fa-rotate-right', true)
  const status = statusDiv()
  wrap.append(row, optRow, goBtn, status)

  pickBtn.addEventListener('click', async () => {
    const p = await pickSinglePdf()
    if (p) { pdfPath = p; fileLbl.textContent = shortName(p) }
  })

  function parsePages(str) {
    if (!str.trim()) return []
    const pages = []
    for (const part of str.replace(/\s*-\s*/g, '-').split(PAGE_SEP)) {
      const trimmed = part.trim()
      if (trimmed.includes('-')) {
        const [a, b] = trimmed.split('-').map(Number)
        for (let i = a; i <= b; i++) pages.push(i)
      } else {
        const n = parseInt(trimmed)
        if (!isNaN(n)) pages.push(n)
      }
    }
    return [...new Set(pages)].sort((a, b) => a - b)
  }

  goBtn.addEventListener('click', async () => {
    if (!pdfPath) { setStatus(status, t('pdf_err_pick'), 'error'); return }
    const out = await saveDialog(shortName(pdfPath).replace(/\.pdf$/i, '') + '_' + t('pdf_fname_rotated') + '.pdf', [{ name: 'PDF', extensions: ['pdf'] }])
    if (!out) return
    setStatus(status, t('pdf_rotating'))
    goBtn.disabled = true
    try {
      await invoke('pdf_rotate', {
        path: pdfPath, output: out,
        pages: parsePages(pageInput.value),
        degrees: parseInt(angleSelect.value),
      })
      setStatus(status, t('pdf_rotated').replace('{file}', () => shortName(out)) + ' ✓', 'success')
    } catch (e) { setStatus(status, t('pdf_error') + ' ' + String(e), 'error') }
    goBtn.disabled = false
  })
}

// ── Tab: Réordonner ───────────────────────────────────────────────────────────
function buildReorder(wrap) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const pickBtn = btn(t('pdf_pick_pdf'), 'fa-solid fa-file-pdf')
  const fileLbl = document.createElement('span')
  fileLbl.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary);'
  fileLbl.textContent = t('pdf_no_file')
  row.append(pickBtn, fileLbl)

  const infoLbl = document.createElement('div')
  infoLbl.style.cssText = 'font-size:11px;color:var(--text-secondary);'

  const orderInput = document.createElement('input')
  orderInput.type = 'text'; orderInput.placeholder = t('pdf_order_ph')
  orderInput.style.cssText = 'background:var(--surface2,#1a1a1a);border:1px solid var(--win-border);color:var(--text-primary);border-radius:5px;padding:6px 10px;font-size:12px;outline:none;width:100%;box-sizing:border-box;'

  const orderNote = document.createElement('div')
  orderNote.style.cssText = 'font-size:10px;color:color-mix(in srgb, var(--text-secondary) 65%, transparent);'
  orderNote.textContent = t('pdf_order_note')

  let pdfPath = null
  let pageCount = 0

  const goBtn = btn(t('pdf_reorder_go'), 'fa-solid fa-sort', true)
  const status = statusDiv()
  wrap.append(row, infoLbl, orderNote, orderInput, goBtn, status)

  pickBtn.addEventListener('click', async () => {
    const p = await pickSinglePdf()
    if (!p) return
    pdfPath = p; fileLbl.textContent = shortName(p)
    try {
      const info = JSON.parse(await invoke('pdf_info', { path: p }))
      pageCount = info.page_count
      infoLbl.textContent = t('pdf_pages_n').replace('{n}', pageCount)
      orderInput.value = Array.from({length: pageCount}, (_, i) => i + 1).join(',')
    } catch {}
  })

  goBtn.addEventListener('click', async () => {
    if (!pdfPath) { setStatus(status, t('pdf_err_pick'), 'error'); return }
    const order = orderInput.value.split(PAGE_SEP).map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    if (!order.length) { setStatus(status, t('pdf_err_order'), 'error'); return }
    const out = await saveDialog(shortName(pdfPath).replace(/\.pdf$/i, '') + '_' + t('pdf_fname_reordered') + '.pdf', [{ name: 'PDF', extensions: ['pdf'] }])
    if (!out) return
    setStatus(status, t('pdf_reordering'))
    goBtn.disabled = true
    try {
      await invoke('pdf_reorder', { path: pdfPath, output: out, order })
      setStatus(status, t('pdf_reordered').replace('{file}', () => shortName(out)) + ' ✓', 'success')
    } catch (e) { setStatus(status, t('pdf_error') + ' ' + String(e), 'error') }
    goBtn.disabled = false
  })
}

// ── Tab: Images → PDF ─────────────────────────────────────────────────────────
function buildImagesToPdf(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  note.textContent = t('pdf_img2pdf_note')

  const list = fileListBox()

  const addBtn = btn(t('pdf_add_images'), 'fa-solid fa-images')
  const goBtn  = btn(t('pdf_create'), 'fa-solid fa-file-export', true)
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;'
  row.append(addBtn, goBtn)

  const status = statusDiv()
  wrap.append(note, list.el, row, status)

  addBtn.addEventListener('click', async () => {
    const paths = await pickImageFiles()
    list.add(paths)
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, t('pdf_err_min_image'), 'error'); return }
    const out = await saveDialog(t('pdf_fname_images') + '.pdf', [{ name: 'PDF', extensions: ['pdf'] }])
    if (!out) return
    setStatus(status, t('pdf_converting'))
    goBtn.disabled = true
    try {
      await invoke('images_to_pdf', { paths: list.paths, output: out })
      setStatus(status, t('pdf_created').replace('{file}', () => shortName(out)) + ' ✓', 'success')
    } catch (e) { setStatus(status, t('pdf_error') + ' ' + String(e), 'error') }
    goBtn.disabled = false
  })
}

// ── Tab: PDF → Images ─────────────────────────────────────────────────────────
function buildPdfToImages(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  note.textContent = t('pdf_pdf2img_note')

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const pickBtn = btn(t('pdf_pick_pdf'), 'fa-solid fa-file-pdf')
  const fileLbl = document.createElement('span')
  fileLbl.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary);'
  fileLbl.textContent = t('pdf_no_file')
  row.append(pickBtn, fileLbl)

  let pdfPath = null

  const goBtn = btn(t('pdf_to_images_go'), 'fa-solid fa-images', true)
  const status = statusDiv()
  wrap.append(note, row, goBtn, status)

  pickBtn.addEventListener('click', async () => {
    const p = await pickSinglePdf()
    if (p) { pdfPath = p; fileLbl.textContent = shortName(p) }
  })

  goBtn.addEventListener('click', async () => {
    if (!pdfPath) { setStatus(status, t('pdf_err_pick'), 'error'); return }
    const soffice = await invoke('find_libreoffice', {})
    if (!soffice) { setStatus(status, t('pdf_err_lo_install'), 'error'); return }
    const { dialog } = window.__TAURI__
    const dir = await dialog.open({ directory: true, title: t('pdf_dest_folder') }).catch(() => null)
    if (!dir) return
    setStatus(status, t('pdf_converting_lo'))
    goBtn.disabled = true
    try {
      await invoke('convert_with_libreoffice', { soffice, input: pdfPath, outputDir: dir, format: 'png' })
      setStatus(status, t('pdf_converted').replace('{file}', () => shortName(dir)) + ' ✓', 'success')
    } catch (e) { setStatus(status, t('pdf_error') + ' ' + String(e), 'error') }
    goBtn.disabled = false
  })
}

// ── Tab: DOCX/ODT → PDF ───────────────────────────────────────────────────────
function buildDocToPdf(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  note.textContent = t('pdf_doc2pdf_note')

  const list = fileListBox()

  const addBtn = btn(t('pdf_add_docs'), 'fa-solid fa-file-word')
  const goBtn  = btn(t('pdf_to_pdf_go'), 'fa-solid fa-file-pdf', true)
  const rowBtns = document.createElement('div')
  rowBtns.style.cssText = 'display:flex;gap:8px;'
  rowBtns.append(addBtn, goBtn)

  const status = statusDiv()
  wrap.append(note, list.el, rowBtns, status)

  addBtn.addEventListener('click', async () => {
    const paths = await pickDocFiles()
    list.add(paths)
  })

  goBtn.addEventListener('click', async () => {
    if (!list.paths.length) { setStatus(status, t('pdf_err_min_doc'), 'error'); return }
    const soffice = await invoke('find_libreoffice', {})
    if (!soffice) { setStatus(status, t('pdf_err_lo'), 'error'); return }
    const { dialog } = window.__TAURI__
    const dir = await dialog.open({ directory: true, title: t('pdf_dest_folder') }).catch(() => null)
    if (!dir) return
    setStatus(status, t('pdf_converting_n').replace('{n}', list.paths.length))
    goBtn.disabled = true
    let ok = 0, err = 0
    for (const p of list.paths) {
      try {
        await invoke('convert_with_libreoffice', { soffice, input: p, outputDir: dir, format: 'pdf' })
        ok++
      } catch { err++ }
    }
    const doneMsg = (err ? t('pdf_doc_done_err') : t('pdf_doc_done'))
      .replace('{ok}', ok).replace('{err}', err).replace('{dir}', () => shortName(dir))
    setStatus(status, ok ? doneMsg + ' ✓' : doneMsg, ok ? 'success' : 'error')
    goBtn.disabled = false
  })
}

// ── Tab: PDF → DOCX/ODT ───────────────────────────────────────────────────────
function buildPdfToDoc(wrap) {
  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  note.textContent = t('pdf_pdf2doc_note')

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const pickBtn = btn(t('pdf_pick_pdf'), 'fa-solid fa-file-pdf')
  const fileLbl = document.createElement('span')
  fileLbl.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary);'
  fileLbl.textContent = t('pdf_no_file')
  row.append(pickBtn, fileLbl)

  let pdfPath = null

  const fmtRow = document.createElement('div')
  fmtRow.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const fmtSelect = document.createElement('select')
  fmtSelect.style.cssText = 'background:var(--surface2,#1a1a1a);border:1px solid var(--win-border);color:var(--text-primary);border-radius:5px;padding:5px 8px;font-size:12px;'
  for (const [label, val] of [['DOCX (Word)', 'docx'], ['ODT (LibreOffice)', 'odt']]) {
    const opt = document.createElement('option')
    opt.value = val; opt.textContent = label
    fmtSelect.appendChild(opt)
  }
  fmtRow.append(document.createTextNode(t('pdf_format') + ' '), fmtSelect)

  const goBtn = btn(t('pdf_convert'), 'fa-solid fa-file-word', true)
  const status = statusDiv()
  wrap.append(note, row, fmtRow, goBtn, status)

  pickBtn.addEventListener('click', async () => {
    const p = await pickSinglePdf()
    if (p) { pdfPath = p; fileLbl.textContent = shortName(p) }
  })

  goBtn.addEventListener('click', async () => {
    if (!pdfPath) { setStatus(status, t('pdf_err_pick'), 'error'); return }
    const soffice = await invoke('find_libreoffice', {})
    if (!soffice) { setStatus(status, t('pdf_err_lo'), 'error'); return }
    const { dialog } = window.__TAURI__
    const dir = await dialog.open({ directory: true, title: t('pdf_dest_folder') }).catch(() => null)
    if (!dir) return
    setStatus(status, t('pdf_converting'))
    goBtn.disabled = true
    try {
      const out = await invoke('convert_with_libreoffice', { soffice, input: pdfPath, outputDir: dir, format: fmtSelect.value })
      setStatus(status, t('pdf_converted').replace('{file}', () => shortName(out)) + ' ✓', 'success')
    } catch (e) { setStatus(status, t('pdf_error') + ' ' + String(e), 'error') }
    goBtn.disabled = false
  })
}

// ── Main init ─────────────────────────────────────────────────────────────────
export function initPdfTool(body) {
  if (!window.__TAURI__ || window.__ICEAMPLE_WEB__) {
    renderDesktopOnly(body)
    return
  }

  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;'

  const TABS = [
    { id: 'merge',     label: t('pdf_merge'),       icon: 'fa-solid fa-object-group', build: buildMerge },
    { id: 'split',     label: t('pdf_split'),       icon: 'fa-solid fa-scissors',     build: buildSplit },
    { id: 'rotate',    label: t('pdf_rotate'),      icon: 'fa-solid fa-rotate-right', build: buildRotate },
    { id: 'reorder',   label: t('pdf_reorder'),     icon: 'fa-solid fa-sort',         build: buildReorder },
    { id: 'img2pdf',   label: t('pdf_tab_img2pdf'), icon: 'fa-solid fa-images',       build: buildImagesToPdf },
    { id: 'pdf2img',   label: t('pdf_tab_pdf2img'), icon: 'fa-solid fa-image',        build: buildPdfToImages },
    { id: 'doc2pdf',   label: t('pdf_tab_doc2pdf'), icon: 'fa-solid fa-file-pdf',     build: buildDocToPdf },
    { id: 'pdf2doc',   label: t('pdf_tab_pdf2doc'), icon: 'fa-solid fa-file-word',    build: buildPdfToDoc },
  ]

  // Tab bar
  const tabBar = document.createElement('div')
  tabBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;padding:8px 10px;border-bottom:1px solid var(--win-border-in,#1e1e1e);flex-shrink:0;'

  // Content area
  const content = document.createElement('div')
  content.style.cssText = 'flex:1;overflow:hidden;position:relative;'

  let activeId = null
  const panels = {}

  for (const tab of TABS) {
    const tabBtn = document.createElement('button')
    tabBtn.style.cssText = 'border:none;border-radius:5px;padding:5px 10px;cursor:pointer;font-size:11px;font-family:inherit;background:none;color:var(--text-secondary);display:flex;align-items:center;gap:5px;'
    tabBtn.innerHTML = `<i class="${tab.icon}"></i> ${tab.label}`

    const panel = document.createElement('div')
    panel.style.cssText = 'position:absolute;inset:0;display:none;overflow-y:auto;'
    content.appendChild(panel)
    panels[tab.id] = { btn: tabBtn, panel }

    tabBtn.addEventListener('click', () => {
      if (activeId) {
        panels[activeId].btn.style.background = 'none'
        panels[activeId].btn.style.color = 'var(--text-secondary)'
        panels[activeId].panel.style.display = 'none'
      }
      activeId = tab.id
      tabBtn.style.background = 'color-mix(in srgb, var(--text-primary) 8%, transparent)'
      tabBtn.style.color = 'var(--text-primary,#ddd)'
      panel.style.display = 'block'

      // Lazy build
      if (!panel.dataset.built) {
        panel.dataset.built = '1'
        const section = makeSection(tab.label, tab.build)
        panel.appendChild(section)
      }
    })

    tabBar.appendChild(tabBtn)
  }

  body.append(tabBar, content)

  // Activate first tab
  panels[TABS[0].id].btn.click()
}
