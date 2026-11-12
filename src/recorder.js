// recorder.js — Enregistreur écran / webcam. Records takes via MediaRecorder,
// lists them with thumbnails and lets the user save them to the library or
// ship them to the video editor / subtitles tool through the media bus.
// Extracted from videorec.js when the timeline became the full video editor.
import { t } from './i18n.js'
import { promptName } from './rename-dialog.js'
import { trackRecentFile } from './recent.js'
import { sendMedia } from './media-bus.js'

export function initRecorder(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;font-family:inherit;'

  // ── State ──────────────────────────────────────────────────────────────────
  let source        = 'screen'   // 'screen' | 'webcam'
  let recording     = false
  let stopping      = false      // between "stop asked" and onstop firing
  let destroyed     = false
  let stream        = null
  let mediaRecorder = null
  let recChunks     = []
  let recStart      = 0
  let timerId       = null
  let takeNo        = 0
  const takes       = []

  const fmtElapsed = s => {
    s = Math.max(0, Math.floor(s || 0))
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
  }

  // ── Top bar ────────────────────────────────────────────────────────────────
  const bar = document.createElement('div')
  bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;flex-shrink:0;background:var(--surface2,#141414);border-bottom:1px solid var(--win-border-in,#1e1e1e);flex-wrap:wrap;'

  const segWrap = document.createElement('div')
  segWrap.style.cssText = 'display:flex;border:1px solid var(--win-border-in,#1e1e1e);border-radius:6px;overflow:hidden;'
  function mkSeg(txt, icon, mode) {
    const b = document.createElement('button')
    b.innerHTML = `<i class="fa-solid ${icon}"></i> ${txt}`
    b.style.cssText = 'border:none;padding:6px 10px;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface,#111);color:var(--text-secondary,#999);'
    b.addEventListener('click', () => { if (recording) return; source = mode; refreshSeg() })
    return b
  }
  const screenBtn = mkSeg(t('rec_screen'), 'fa-display', 'screen')
  const camBtn    = mkSeg(t('rec_webcam'), 'fa-camera',  'webcam')
  segWrap.append(screenBtn, camBtn)
  function refreshSeg() {
    for (const [b, m] of [[screenBtn, 'screen'], [camBtn, 'webcam']]) {
      const on = source === m
      b.style.background = on ? 'var(--color-active,#4a9eff)' : 'var(--surface,#111)'
      b.style.color = on ? '#fff' : 'var(--text-secondary,#999)'
    }
  }
  refreshSeg()

  const micLbl = document.createElement('label')
  micLbl.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary,#999);cursor:pointer;user-select:none;'
  const micChk = document.createElement('input')
  micChk.type = 'checkbox'; micChk.checked = true
  micChk.style.cssText = 'accent-color:var(--color-active,#4a9eff);cursor:pointer;'
  micLbl.append(micChk, document.createTextNode(t('rec_mic')))

  const spacer = document.createElement('div')
  spacer.style.cssText = 'flex:1;'

  const timeLbl = document.createElement('span')
  timeLbl.textContent = '00:00'
  timeLbl.style.cssText = 'font-size:12px;font-variant-numeric:tabular-nums;color:var(--text-primary,#ddd);min-width:44px;text-align:right;'

  const recBtn = document.createElement('button')
  recBtn.title = t('vr_record')
  recBtn.innerHTML = '<i class="fa-solid fa-circle"></i>'
  recBtn.style.cssText = 'width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;background:#e0334c;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;'

  bar.append(segWrap, micLbl, spacer, timeLbl, recBtn)

  // ── Preview ────────────────────────────────────────────────────────────────
  const previewBox = document.createElement('div')
  previewBox.style.cssText = 'flex:1;min-height:120px;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden;position:relative;'
  const liveVid = document.createElement('video')
  liveVid.muted = true; liveVid.autoplay = true; liveVid.playsInline = true
  liveVid.style.cssText = 'max-width:100%;max-height:100%;display:none;'
  const hint = document.createElement('div')
  hint.style.cssText = 'color:var(--text-secondary,#555);text-align:center;pointer-events:none;padding:16px;'
  hint.innerHTML = `<i class="fa-solid fa-clapperboard" style="font-size:34px;display:block;margin-bottom:8px;opacity:.4;"></i>${t('rec_hint')}`
  previewBox.append(liveVid, hint)

  function showHint() {
    liveVid.pause(); liveVid.srcObject = null; liveVid.removeAttribute('src')
    liveVid.controls = false; liveVid.muted = true
    liveVid.style.display = 'none'; hint.style.display = ''
  }
  function showLive(s) {
    liveVid.removeAttribute('src'); liveVid.controls = false; liveVid.muted = true
    liveVid.srcObject = s
    liveVid.style.display = 'block'; hint.style.display = 'none'
  }
  function playTake(take) {
    liveVid.srcObject = null
    liveVid.src = take.savedPath ? 'file://' + String(take.savedPath).replace(/\\/g, '/') : take.url
    liveVid.muted = false; liveVid.controls = true
    liveVid.style.display = 'block'; hint.style.display = 'none'
    liveVid.play().catch(() => {})
  }

  // ── Takes list ─────────────────────────────────────────────────────────────
  const listWrap = document.createElement('div')
  listWrap.style.cssText = 'flex-shrink:0;max-height:190px;overflow-y:auto;background:var(--surface2,#141414);border-top:1px solid var(--win-border-in,#1e1e1e);'

  body.append(bar, previewBox, listWrap)

  // ── Thumbnail (seek slightly into the blob, draw to canvas) ────────────────
  function grabThumb(url, cb) {
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.src = url
    v.addEventListener('loadeddata', () => {
      v.currentTime = 0.1
      v.addEventListener('seeked', () => {
        try { const c = document.createElement('canvas'); c.width = 96; c.height = 54; c.getContext('2d').drawImage(v, 0, 0, 96, 54); cb(c.toDataURL('image/jpeg', 0.6)) } catch { cb(null) }
        v.src = ''
      }, { once: true })
    }, { once: true })
    v.addEventListener('error', () => cb(null), { once: true })
  }

  function takeMedia(take) {
    return take.savedPath
      ? { kind: 'video', path: take.savedPath, name: take.name }
      : { kind: 'video', blobUrl: take.url, name: take.name }
  }

  async function saveTake(take) {
    const base = await promptName(take.name.replace(/\.[^.]+$/, '').replace(/\s+/g, '_'), { title: t('rec_save') })
    if (base == null) return
    const ext = take.ext || '.webm'
    const root = localStorage.getItem('library:root')
    if (window.__TAURI__ && !root) { window.toast?.(t('vc_no_lib'), 'error'); return }
    if (window.__TAURI__) {
      try {
        const sep = root.includes('\\') ? '\\' : '/'
        // FileReader keeps the base64 conversion off a giant JS string rope —
        // a long screen take can be hundreds of MB.
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(String(r.result).split(',')[1] || '')
          r.onerror = () => rej(r.error)
          r.readAsDataURL(take.blob)
        })
        const fpath = root + sep + 'Vidéos' + sep + base + ext
        await window.__TAURI__.core.invoke('save_binary_file', { path: fpath, base64: b64 })
        take.savedPath = fpath
        take.name = base + ext
        if (take.labelEl) take.labelEl.textContent = take.name + ' · ' + fmtElapsed(take.duration)
        window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Vidéos' } }))
        trackRecentFile(fpath, base + ext)
        window.toast?.(t('vr_saved') + ' : ' + base + ext, 'success')
      } catch (e) { window.toast?.(t('clip_save_fail') + ' : ' + e, 'error') }
    } else {
      // No Tauri: plain browser download fallback.
      const a = document.createElement('a')
      a.href = take.url; a.download = base + ext
      document.body.appendChild(a); a.click(); a.remove()
    }
  }

  function deleteTake(take) {
    const i = takes.indexOf(take); if (i >= 0) takes.splice(i, 1)
    if (liveVid.src === take.url) showHint()
    URL.revokeObjectURL(take.url)
    take.row?.remove()
  }

  function addTakeRow(take) {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--win-border-in,#1e1e1e);'
    const img = document.createElement('img')
    img.style.cssText = 'width:56px;height:32px;object-fit:cover;border-radius:4px;background:#000;flex-shrink:0;'
    const label = document.createElement('span')
    label.style.cssText = 'flex:1;min-width:0;font-size:11px;color:var(--text-primary,#ddd);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
    label.textContent = take.name + ' · ' + fmtElapsed(take.duration)
    const mkIcon = (icon, title) => {
      const b = document.createElement('button')
      b.title = title
      b.innerHTML = `<i class="fa-solid ${icon}"></i>`
      b.style.cssText = 'background:none;border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-secondary,#888);padding:4px 7px;border-radius:4px;cursor:pointer;font-size:10px;flex-shrink:0;'
      return b
    }
    const playBtn = mkIcon('fa-play',               t('rec_play'))
    const saveBtn = mkIcon('fa-floppy-disk',        t('rec_save'))
    const edBtn   = mkIcon('fa-clapperboard',       t('rec_send_editor'))
    const subBtn  = mkIcon('fa-closed-captioning',  t('rec_send_subs'))
    const delBtn  = mkIcon('fa-trash',              t('clip_delete'))
    playBtn.addEventListener('click', () => playTake(take))
    saveBtn.addEventListener('click', () => saveTake(take))
    edBtn.addEventListener('click',   () => sendMedia('videorec', takeMedia(take)))
    subBtn.addEventListener('click',  () => sendMedia('subtitles', takeMedia(take)))
    delBtn.addEventListener('click',  () => deleteTake(take))
    row.append(img, label, playBtn, saveBtn, edBtn, subBtn, delBtn)
    listWrap.appendChild(row)
    take.row = row; take.img = img; take.labelEl = label
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  async function startRecording() {
    if (recording || stopping) return
    if (typeof MediaRecorder === 'undefined') { window.toast?.(t('rec_denied'), 'error'); return }
    const mic = micChk.checked
    let s
    try {
      if (source === 'screen') {
        // getDisplayMedia's `audio` is SYSTEM sound, not the microphone — so
        // the screen path always captures video-only from the display, then
        // mixes in a real getUserMedia mic track when the box is checked
        // (same pattern as export-canvas.js).
        s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        if (mic) {
          try {
            const a = await navigator.mediaDevices.getUserMedia({ audio: true })
            a.getAudioTracks().forEach(tr => s.addTrack(tr))
          } catch {}   // mic refused → record video-only rather than aborting
        }
      } else {
        s = await navigator.mediaDevices.getUserMedia({ video: true, audio: mic })
      }
    } catch { window.toast?.(t('rec_denied'), 'error'); return }
    // The window may have been closed while the permission prompt was open.
    if (destroyed) { s.getTracks().forEach(tr => tr.stop()); return }
    try {
      stream = s
      showLive(s)
      recChunks = []
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : ''
      mediaRecorder = new MediaRecorder(s, mimeType ? { mimeType } : {})
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recChunks.push(e.data) }
      mediaRecorder.onstop = finishTake
      // User can end a screen share from the browser/OS UI — treat as stop.
      s.getVideoTracks()[0]?.addEventListener('ended', stopRecording)
      mediaRecorder.start(500)
    } catch (e) {
      // Recorder construction/start failed: release the capture so the camera
      // LED / share banner doesn't stay on with no way to turn it off.
      s.getTracks().forEach(tr => tr.stop())
      stream = null; mediaRecorder = null
      showHint()
      window.toast?.(t('rec_denied') + ' : ' + e, 'error')
      return
    }
    recording = true
    micChk.disabled = true
    recStart = performance.now()
    recBtn.innerHTML = '<i class="fa-solid fa-stop"></i>'
    timerId = setInterval(() => { timeLbl.textContent = fmtElapsed((performance.now() - recStart) / 1000) }, 250)
  }

  function stopRecording() {
    if (!recording || stopping) return
    stopping = true
    // Reset the visible state right away — finishTake (the recorder's async
    // onstop) does the data wrap-up. `recording` stays true until then so a
    // fast re-click can't start a second capture over this one.
    clearInterval(timerId); timerId = null
    recBtn.innerHTML = '<i class="fa-solid fa-circle"></i>'
    try { mediaRecorder.stop() }
    catch { finishTake() }   // recorder already inactive → wrap up ourselves
  }

  function finishTake() {
    clearInterval(timerId); timerId = null
    const dur = (performance.now() - recStart) / 1000
    stream?.getTracks().forEach(tr => tr.stop())
    stream = null
    const mime = mediaRecorder?.mimeType || 'video/webm'
    const blob = new Blob(recChunks, { type: mime })
    recChunks = []; mediaRecorder = null
    recording = false; stopping = false
    micChk.disabled = false
    recBtn.innerHTML = '<i class="fa-solid fa-circle"></i>'
    timeLbl.textContent = '00:00'
    showHint()
    if (destroyed || !blob.size) return
    const url = URL.createObjectURL(blob)
    takeNo++
    const ext = /mp4/i.test(mime) ? '.mp4' : '.webm'
    const take = { id: takeNo, url, blob, ext, duration: dur, name: t('rec_take') + ' ' + takeNo, savedPath: null, thumb: null }
    takes.push(take)
    addTakeRow(take)
    grabThumb(url, dataUrl => { if (!dataUrl) return; take.thumb = dataUrl; if (take.img) take.img.src = dataUrl })
  }

  recBtn.addEventListener('click', () => { recording ? stopRecording() : startRecording() })

  // ── Teardown ───────────────────────────────────────────────────────────────
  const cleanObs = new MutationObserver(() => {
    if (!document.contains(body)) {
      destroyed = true
      stopRecording()
      stream?.getTracks().forEach(tr => tr.stop()); stream = null
      clearInterval(timerId)
      takes.forEach(tk => URL.revokeObjectURL(tk.url))
      cleanObs.disconnect()
    }
  })
  cleanObs.observe(document.body, { childList: true, subtree: true })
}
