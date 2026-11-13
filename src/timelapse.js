// timelapse.js — « Timelapse & Boucle » : deux outils ffmpeg dans une fenêtre,
// commutés par un contrôle segmenté.
//   • Mode images : une liste ORDONNÉE d'images → vidéo. Les chemins sont
//     quelconques (pas de motif numéroté possible), donc on passe par le
//     démuxeur concat avec une `duration` par image écrite dans un fichier
//     liste temporaire.
//   • Mode boucle : une vidéo → boomerang (avant puis arrière) ou boucle
//     parfaite (la fin se fond dans le début via xfade).
// Les deux modes écrivent dans « Vidéos », rafraîchissent la bibliothèque,
// alimentent les récents et envoient le résultat au Montage vidéo (bus média).
import { t } from './i18n.js'
import { promptName } from './rename-dialog.js'
import { trackRecentFile } from './recent.js'
import { sendMedia } from './media-bus.js'

const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp']
const VID_EXT = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' }

const extOf = s => String(s || '').split('.').pop().toLowerCase()
const baseName = s => String(s || '').split(/[\\/]/).pop()
// Same escaping as the montage export in videorec.js: the concat demuxer reads
// forward slashes fine on Windows, and a single quote must be closed/escaped.
const escapePath = p => String(p).replace(/\\/g, '/').replace(/'/g, "'\\''")

export function initTimelapse(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;font-family:inherit;'

  // ── Media bus (receive) ────────────────────────────────────────────────────
  // Registered first thing so a send fired right after the tool opens lands.
  body.addEventListener('iceample-media', e => receiveMedia(e.detail))

  const images = []            // [{ path, name, thumb, imgEl }]
  let video = null             // { path, name }
  let mode = 'images'
  let busy = false
  let destroyed = false

  const hasTauri = !!window.__TAURI__

  // ── Small styling helpers (theme vars only) ───────────────────────────────
  const FIELD = 'background:var(--surface);border:1px solid var(--win-border-in);color:var(--text-primary);border-radius:5px;padding:4px 7px;font-size:11px;font-family:inherit;outline:none;'
  const LABEL = 'font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;'

  function mkBtn(txt, icon, primary) {
    const b = document.createElement('button')
    b.innerHTML = `<i class="fa-solid ${icon}"></i> <span></span>`
    b.querySelector('span').textContent = txt
    b.style.cssText = primary
      ? 'border:1px solid var(--btn-primary);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--btn-primary);color:var(--on-accent);font-weight:600;'
      : 'border:1px solid var(--win-border-in);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface);color:var(--text-primary);'
    return b
  }
  function mkIconBtn(icon, title) {
    const b = document.createElement('button')
    b.title = title
    b.innerHTML = `<i class="fa-solid ${icon}"></i>`
    b.style.cssText = 'background:none;border:1px solid var(--win-border-in);color:var(--text-secondary);padding:4px 7px;border-radius:4px;cursor:pointer;font-size:10px;flex-shrink:0;'
    return b
  }
  function mkField(labelTxt, el) {
    const w = document.createElement('label')
    w.style.cssText = 'display:flex;align-items:center;gap:5px;'
    const l = document.createElement('span')
    l.style.cssText = LABEL
    l.textContent = labelTxt
    w.append(l, el)
    return w
  }

  // ── Segmented control ─────────────────────────────────────────────────────
  const topBar = document.createElement('div')
  topBar.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:8px 12px;flex-shrink:0;background:var(--surface2,var(--surface));border-bottom:1px solid var(--win-border-in);'

  const segWrap = document.createElement('div')
  segWrap.style.cssText = 'display:flex;border:1px solid var(--win-border-in);border-radius:7px;overflow:hidden;'
  function mkSeg(txt, icon, m) {
    const b = document.createElement('button')
    b.innerHTML = `<i class="fa-solid ${icon}"></i> <span></span>`
    b.querySelector('span').textContent = txt
    b.style.cssText = 'border:none;padding:6px 14px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface);color:var(--text-secondary);'
    b.addEventListener('click', () => setMode(m))
    return b
  }
  const segImages = mkSeg(t('tl_mode_images'), 'fa-images', 'images')
  const segLoop   = mkSeg(t('tl_mode_loop'),   'fa-rotate', 'loop')
  segWrap.append(segImages, segLoop)
  topBar.appendChild(segWrap)

  function refreshSeg() {
    for (const [b, m] of [[segImages, 'images'], [segLoop, 'loop']]) {
      const on = mode === m
      b.style.background = on ? 'var(--color-active)' : 'var(--surface)'
      b.style.color = on ? '#fff' : 'var(--text-secondary)'
    }
  }

  body.appendChild(topBar)

  // Without Tauri the tool still opens — it just can't run ffmpeg.
  if (!hasTauri) {
    const note = document.createElement('div')
    note.style.cssText = 'padding:10px 12px;text-align:center;font-size:11px;color:var(--text-secondary);border-bottom:1px solid var(--win-border-in);'
    note.textContent = t('tl_tauri_only')
    body.appendChild(note)
  }

  // ── Mode 1 — images → vidéo ───────────────────────────────────────────────
  const paneImages = document.createElement('div')
  paneImages.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;'

  const imgBar = document.createElement('div')
  imgBar.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;flex-shrink:0;border-bottom:1px solid var(--win-border-in);'

  const addBtn = mkBtn(t('tl_add_images'), 'fa-folder-open')
  const countEl = document.createElement('span')
  countEl.style.cssText = 'font-size:10px;color:var(--text-secondary);font-variant-numeric:tabular-nums;'

  const spacer1 = document.createElement('div')
  spacer1.style.cssText = 'flex:1;'

  const fpsInp = document.createElement('input')
  fpsInp.type = 'number'; fpsInp.min = '1'; fpsInp.max = '60'; fpsInp.step = '1'; fpsInp.value = '12'
  fpsInp.style.cssText = FIELD + 'width:56px;'

  const resSel = document.createElement('select')
  resSel.style.cssText = FIELD
  for (const [val, txt] of [['orig', t('tl_res_original')], ['1920', '1920 px'], ['1280', '1280 px'], ['854', '854 px']]) {
    const o = document.createElement('option')
    o.value = val; o.textContent = txt
    resSel.appendChild(o)
  }

  const buildBtn = mkBtn(t('tl_build'), 'fa-wand-magic-sparkles', true)

  imgBar.append(addBtn, countEl, spacer1, mkField(t('tl_fps'), fpsInp), mkField(t('tl_width'), resSel), buildBtn)

  const listEl = document.createElement('div')
  listEl.style.cssText = 'flex:1;overflow-y:auto;background:var(--surface2,var(--surface));'

  const emptyEl = document.createElement('div')
  emptyEl.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;min-height:120px;color:var(--text-secondary);font-size:11px;text-align:center;padding:16px;pointer-events:none;'
  emptyEl.innerHTML = '<i class="fa-solid fa-images" style="font-size:32px;opacity:.4;"></i><span></span>'
  emptyEl.querySelector('span').textContent = t('tl_empty')

  paneImages.append(imgBar, listEl)

  // ── Mode 2 — vidéo → boucle / boomerang ───────────────────────────────────
  const paneLoop = document.createElement('div')
  paneLoop.style.cssText = 'flex:1;display:none;flex-direction:column;overflow:hidden;'

  const loopBar = document.createElement('div')
  loopBar.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;flex-shrink:0;border-bottom:1px solid var(--win-border-in);'
  const openBtn = mkBtn(t('tl_open_video'), 'fa-folder-open')
  const vidName = document.createElement('span')
  vidName.style.cssText = 'flex:1;min-width:0;font-size:11px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
  loopBar.append(openBtn, vidName)

  const vidBox = document.createElement('div')
  vidBox.style.cssText = 'flex:1;min-height:120px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;background:var(--surface2,var(--surface));'
  const vidEl = document.createElement('video')
  vidEl.controls = true; vidEl.playsInline = true; vidEl.preload = 'metadata'
  vidEl.style.cssText = 'max-width:100%;max-height:100%;display:none;'
  const vidHint = document.createElement('div')
  vidHint.style.cssText = 'color:var(--text-secondary);text-align:center;font-size:11px;pointer-events:none;padding:16px;'
  vidHint.innerHTML = '<i class="fa-solid fa-film" style="font-size:32px;display:block;margin-bottom:8px;opacity:.4;"></i><span></span>'
  vidHint.querySelector('span').textContent = t('tl_drop_video')
  vidBox.append(vidEl, vidHint)

  const loopActions = document.createElement('div')
  loopActions.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;flex-shrink:0;border-top:1px solid var(--win-border-in);background:var(--surface2,var(--surface));'
  const boomBtn = mkBtn(t('tl_boomerang'), 'fa-arrows-left-right')
  const boomHint = document.createElement('span')
  boomHint.style.cssText = 'flex:1;min-width:120px;font-size:10px;color:var(--text-secondary);line-height:1.4;'
  boomHint.textContent = t('tl_boomerang_hint')
  const blendInp = document.createElement('input')
  blendInp.type = 'number'; blendInp.min = '0.2'; blendInp.max = '3'; blendInp.step = '0.1'; blendInp.value = '0.7'
  blendInp.style.cssText = FIELD + 'width:60px;'
  const loopBtn = mkBtn(t('tl_loop'), 'fa-infinity', true)
  loopActions.append(boomBtn, boomHint, mkField(t('tl_blend'), blendInp), loopBtn)

  paneLoop.append(loopBar, vidBox, loopActions)

  body.append(paneImages, paneLoop)

  // ── Mode switching ────────────────────────────────────────────────────────
  function setMode(m) {
    mode = m
    paneImages.style.display = m === 'images' ? 'flex' : 'none'
    paneLoop.style.display   = m === 'loop'   ? 'flex' : 'none'
    refreshSeg()
  }
  setMode('images')

  // ── Enable / disable ──────────────────────────────────────────────────────
  function updateButtons() {
    const idle = hasTauri && !busy
    addBtn.disabled   = !idle
    openBtn.disabled  = !idle
    buildBtn.disabled = !idle || images.length < 2
    boomBtn.disabled  = !idle || !video
    loopBtn.disabled  = !idle || !video
    for (const b of [addBtn, openBtn, buildBtn, boomBtn, loopBtn]) {
      b.style.opacity = b.disabled ? '.45' : '1'
      b.style.cursor  = b.disabled ? 'default' : 'pointer'
    }
  }

  // ── File picker ───────────────────────────────────────────────────────────
  // The dialog command is invoked with both the descriptive shape used across
  // the app ({title, filters, multiple}) and the flat {filterName, extensions}
  // pair the Rust side actually destructures — extra keys are ignored, so one
  // payload satisfies either signature. The result is normalised because it can
  // come back as plain path strings or as {path, name} records.
  async function pickFiles(title, filterName, extensions, multiple) {
    if (!hasTauri) return []
    try {
      const result = await window.__TAURI__.core.invoke('pick_files_with_filter', {
        title,
        filters: [{ name: filterName, extensions }],
        multiple,
        filterName,
        extensions,
      })
      const arr = Array.isArray(result) ? result : (result ? [result] : [])
      return arr.map(item => {
        const path = typeof item === 'string' ? item : item?.path
        if (!path) return null
        const name = (typeof item === 'string' ? null : item.name) || baseName(path)
        return { path, name }
      }).filter(Boolean)
    } catch (e) {
      window.toast?.(String(e), 'error')
      return []
    }
  }

  // ── Image list ────────────────────────────────────────────────────────────
  async function loadThumb(it) {
    if (!hasTauri || it.thumb) return
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path: it.path })
      if (destroyed) return
      it.thumb = `data:${IMG_MIME[extOf(it.name)] || 'image/png'};base64,${b64}`
      if (it.imgEl) it.imgEl.src = it.thumb
    } catch {}   // unreadable file: the row simply keeps an empty thumbnail
  }

  function makeRow(it, i) {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--win-border-in);'

    const idx = document.createElement('span')
    idx.textContent = String(i + 1)
    idx.style.cssText = 'font-size:10px;color:var(--text-secondary);min-width:20px;text-align:right;font-variant-numeric:tabular-nums;flex-shrink:0;'

    const img = document.createElement('img')
    img.style.cssText = 'width:54px;height:32px;object-fit:cover;border-radius:4px;background:var(--surface);border:1px solid var(--win-border-in);flex-shrink:0;'
    if (it.thumb) img.src = it.thumb
    it.imgEl = img

    const label = document.createElement('span')
    label.style.cssText = 'flex:1;min-width:0;font-size:11px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
    label.textContent = it.name
    label.title = it.path

    const upBtn   = mkIconBtn('fa-chevron-up',   t('tl_move_up'))
    const downBtn = mkIconBtn('fa-chevron-down', t('tl_move_down'))
    const delBtn  = mkIconBtn('fa-xmark',        t('tl_remove'))
    if (i === 0) { upBtn.disabled = true; upBtn.style.opacity = '.35' }
    if (i === images.length - 1) { downBtn.disabled = true; downBtn.style.opacity = '.35' }
    upBtn.addEventListener('click',   () => move(i, -1))
    downBtn.addEventListener('click', () => move(i,  1))
    delBtn.addEventListener('click',  () => { images.splice(i, 1); renderList() })

    row.append(idx, img, label, upBtn, downBtn, delBtn)
    return row
  }

  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= images.length) return
    const [it] = images.splice(i, 1)
    images.splice(j, 0, it)
    renderList()
  }

  function renderList() {
    listEl.innerHTML = ''
    countEl.textContent = images.length + ' ' + t('tl_images_count')
    if (!images.length) listEl.appendChild(emptyEl)
    else images.forEach((it, i) => listEl.appendChild(makeRow(it, i)))
    updateButtons()
  }

  function addImages(entries) {
    let added = 0
    for (const e of entries) {
      if (!e?.path) continue
      const name = e.name || baseName(e.path)
      if (!IMG_EXT.includes(extOf(name))) continue
      images.push({ path: e.path, name, thumb: null, imgEl: null })
      added++
    }
    if (!added) return
    renderList()
    images.forEach(loadThumb)
  }

  addBtn.addEventListener('click', async () => {
    if (!hasTauri || busy) return
    addImages(await pickFiles(t('tl_add_images'), 'Images', IMG_EXT, true))
  })

  // ── Video loading ─────────────────────────────────────────────────────────
  function loadVideo(path, name) {
    video = { path, name: name || baseName(path) }
    vidEl.src = 'file://' + String(path).replace(/\\/g, '/')
    vidEl.style.display = 'block'
    vidHint.style.display = 'none'
    vidName.textContent = video.name
    updateButtons()
  }

  openBtn.addEventListener('click', async () => {
    if (!hasTauri || busy) return
    const picked = await pickFiles(t('tl_open_video'), 'Vidéos', VID_EXT, false)
    if (picked[0]) loadVideo(picked[0].path, picked[0].name)
  })

  // ── Media bus / drops ─────────────────────────────────────────────────────
  function receiveMedia(m) {
    if (!m) return
    if (m.kind === 'image') {
      // Bus images are data URLs with no file on disk — ffmpeg needs a path.
      window.toast?.(t('tl_need_files'), 'warn')
      return
    }
    if (m.kind !== 'video') return
    if (!m.path) { window.toast?.(t('tl_need_files'), 'warn'); return }
    setMode('loop')
    loadVideo(m.path, m.name)
  }

  body.addEventListener('iceample-drop', e => {
    const file = e.detail?.file
    if (!file?.path) return
    const ext = extOf(file.name || file.path)
    if (IMG_EXT.includes(ext)) { setMode('images'); addImages([{ path: file.path, name: file.name || baseName(file.path) }]) }
    else if (VID_EXT.includes(ext)) { setMode('loop'); loadVideo(file.path, file.name) }
  })

  // ── ffmpeg plumbing ───────────────────────────────────────────────────────
  function libInfo() {
    const root = localStorage.getItem('library:root')
    if (!root) { window.toast?.(t('vc_no_lib'), 'error'); return null }
    return { root, sep: root.includes('\\') ? '\\' : '/' }
  }
  // Owns the busy flag for a WHOLE action (name prompt included) so a second
  // click during the modal can't slip past the guards.
  async function ffAction(fn) {
    busy = true; updateButtons()
    try { await fn() } finally { busy = false; updateButtons() }
  }
  async function runFF(args, outPath, outName, folder) {
    window.toast?.(t('vc_running'), 'info')
    try {
      await window.__TAURI__.core.invoke('ffmpeg_run', { args })
      trackRecentFile(outPath, outName)
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder } }))
      sendMedia('videorec', { kind: 'video', path: outPath, name: outName })
      window.toast?.(t('vc_done') + ' : ' + outName + ' — ' + t('tl_sent_editor'), 'success')
      return true
    } catch (e) {
      window.toast?.(t('vc_fail') + ' : ' + e, 'error')
      return false
    }
  }
  const defaultBase = n => (n || 'video').replace(/\.[^.]+$/, '') || 'video'
  const clampNum = (el, min, max, fallback) => {
    const v = parseFloat(el.value)
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
  }

  // Mode 1 — build the timelapse.
  buildBtn.addEventListener('click', () => {
    if (busy) return
    if (!hasTauri) { window.toast?.(t('tl_tauri_only'), 'warn'); return }
    if (images.length < 2) { window.toast?.(t('tl_no_images'), 'warn'); return }
    const lib = libInfo(); if (!lib) return
    const fps = Math.round(clampNum(fpsInp, 1, 60, 12))
    fpsInp.value = String(fps)
    const w = resSel.value === 'orig' ? 0 : parseInt(resSel.value, 10)
    ffAction(async () => {
      const base = await promptName(defaultBase(images[0].name) + '_timelapse', { title: t('tl_build') })
      if (!base) return
      const per = (1 / fps).toFixed(4)
      const lines = []
      for (const it of images) {
        lines.push(`file '${escapePath(it.path)}'`)
        lines.push(`duration ${per}`)
      }
      // Documented concat-demuxer quirk: the last entry's `duration` is not
      // honoured, so the final image is dropped unless its `file` line is
      // repeated once more (without a duration).
      lines.push(`file '${escapePath(images[images.length - 1].path)}'`)
      const listPath = lib.root + lib.sep + '.timelapse-list.txt'
      try { await window.__TAURI__.core.invoke('save_text_file', { path: listPath, content: lines.join('\n') }) }
      catch (e) { window.toast?.(t('vc_fail') + ' : ' + e, 'error'); return }
      const folder  = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      const args = ['-f', 'concat', '-safe', '0', '-i', listPath, '-vsync', 'vfr', '-pix_fmt', 'yuv420p', '-r', String(fps)]
      if (w) args.push('-vf', `scale='min(${w},iw)':-2`)
      args.push(outPath)
      await runFF(args, outPath, base + '.mp4', folder)
    })
  })

  // Mode 2 — shared guard.
  function guardVideo() {
    if (busy) return false
    if (!hasTauri) { window.toast?.(t('tl_tauri_only'), 'warn'); return false }
    if (!video) { window.toast?.(t('vc_no_video'), 'warn'); return false }
    return true
  }

  boomBtn.addEventListener('click', () => {
    if (!guardVideo()) return
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const base = await promptName(defaultBase(video.name) + '_boomerang', { title: t('tl_boomerang') })
      if (!base) return
      const folder  = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      await runFF(
        ['-i', video.path, '-filter_complex', '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]', '-map', '[v]', '-an', outPath],
        outPath, base + '.mp4', folder,
      )
    })
  })

  loopBtn.addEventListener('click', () => {
    if (!guardVideo()) return
    const d = Number(clampNum(blendInp, 0.2, 3, 0.7).toFixed(2))
    blendInp.value = String(d)
    // Duration comes from the preview element; the xfade offset is meaningless
    // (and ffmpeg would emit a black tail) on a clip shorter than two blends.
    const dur = vidEl.duration
    if (!Number.isFinite(dur) || dur <= 2 * d + 0.5) { window.toast?.(t('tl_too_short'), 'warn'); return }
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const base = await promptName(defaultBase(video.name) + '_loop', { title: t('tl_loop') })
      if (!base) return
      const folder  = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      const offset = (dur - 2 * d).toFixed(3)
      const fc = `[0:v]split[main][tail];[tail]trim=start=0:end=${d},setpts=PTS-STARTPTS[head];[main]trim=start=${d},setpts=PTS-STARTPTS[body];[body][head]xfade=transition=fade:duration=${d}:offset=${offset}[v]`
      await runFF(['-i', video.path, '-filter_complex', fc, '-map', '[v]', '-an', outPath], outPath, base + '.mp4', folder)
    })
  })

  // ── Init + teardown ───────────────────────────────────────────────────────
  renderList()
  refreshSeg()
  updateButtons()

  const cleanObs = new MutationObserver(() => {
    if (!document.contains(body)) {
      destroyed = true
      try { vidEl.pause() } catch {}
      // Nothing to revoke: thumbnails are data URLs and the preview reads the
      // file:// path directly — no object URL is ever created here.
      vidEl.removeAttribute('src')
      cleanObs.disconnect()
    }
  })
  cleanObs.observe(document.body, { childList: true, subtree: true })
}
