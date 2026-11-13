// videorec.js — Full video editor (multi-lane clip timeline + ffmpeg actions).
// Same timeline + lane model as mic.js; clips hold a Blob URL + optional saved
// path. A small preview panel below the ruler plays back the clip under the
// playhead when transport runs. Cut / audio-extract / GIF / montage export are
// ffmpeg-backed (Tauri only). Recording lives in recorder.js now.
import { t } from './i18n.js'
import { getBpm } from './tempo.js'
import { pushHistory, clearHistory } from './history.js'
import { matchesShortcut } from './shortcuts.js'
import { promptName, confirmUnsaved } from './rename-dialog.js'
import { trackRecentFile } from './recent.js'
import { sendMedia } from './media-bus.js'
import { registerTool } from './project.js'

function injectVrStyles() {
  if (document.getElementById('vr-styles')) return
  const s = document.createElement('style')
  s.id = 'vr-styles'
  s.textContent = `
.vr-body { display:flex; flex-direction:column; height:100%; background:var(--surface); }
.vr-pzone { display:flex; flex-direction:column; flex-shrink:0; min-height:120px; }
.vr-preview { position:relative; flex:1; min-height:0; background:color-mix(in srgb, var(--bg) 28%, black); display:flex; align-items:center; justify-content:center; overflow:hidden; }
.vr-preview video { max-width:100%; max-height:100%; display:block; }
.vr-preview-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; color:var(--text-secondary); font-size:12px; pointer-events:none; }
.vr-preview-empty i { font-size:22px; opacity:.4; }
.vr-preview-badge { position:absolute; top:6px; left:8px; font-size:10px; color:var(--text-primary); background:color-mix(in srgb, var(--bg) 72%, transparent); border-radius:4px; padding:2px 6px; pointer-events:none; }
.vr-transport { display:flex; align-items:center; justify-content:center; gap:8px; padding:4px 8px; flex-shrink:0; background:var(--surface2); border-top:1px solid var(--win-border-in); }
.vr-total { font-size:11px; color:var(--text-secondary); font-variant-numeric:tabular-nums; }
.vr-divider { flex-shrink:0; height:8px; display:flex; align-items:center; justify-content:center; cursor:ns-resize; background:var(--surface); border-top:1px solid var(--win-border-in); border-bottom:1px solid var(--win-border-in); }
.vr-divider:hover, .vr-divider.dragging { background:color-mix(in srgb, var(--color-active) 14%, var(--surface)); }
.vr-grip { width:38px; height:3px; border-radius:2px; background:color-mix(in srgb, var(--text-secondary) 55%, transparent); pointer-events:none; }
.vr-clip { background:linear-gradient(135deg, color-mix(in srgb, var(--color-active) 30%, var(--surface2)), color-mix(in srgb, var(--color-active) 12%, var(--surface2))) !important; border:1px solid color-mix(in srgb, var(--color-active) 45%, transparent) !important; }
.vr-clip .vr-thumb { position:absolute; inset:0; object-fit:cover; opacity:.55; border-radius:3px; pointer-events:none; }
.vr-actions { display:flex; align-items:center; gap:6px; padding:5px 8px; flex-wrap:wrap; flex-shrink:0; background:var(--surface2); border-bottom:1px solid var(--win-border-in); }
.vr-act-btn { border:1px solid var(--win-border-in); border-radius:5px; padding:4px 8px; cursor:pointer; font-size:11px; font-family:inherit; background:var(--surface); color:var(--text-primary); }
.vr-act-btn:disabled { opacity:.45; cursor:default; }
.vr-badge { font-size:10px; color:var(--text-secondary); min-width:46px; text-align:center; background:var(--surface); border:1px solid var(--win-border-in); border-radius:4px; padding:3px 5px; font-variant-numeric:tabular-nums; }
.vr-tj { position:absolute; width:14px; height:14px; transform:rotate(45deg); background:var(--surface); border:1px solid var(--win-border); border-radius:3px; cursor:pointer; z-index:5; transition:border-color .15s, background .15s; }
.vr-tj:hover { border-color:var(--color-active); background:color-mix(in srgb, var(--color-active) 18%, var(--surface)); }
.vr-tj.on { border-color:var(--color-active); background:color-mix(in srgb, var(--color-active) 55%, var(--surface)); }
.vr-music-lane { position:relative; height:34px; border-top:1px solid var(--win-border-in); background:color-mix(in srgb, var(--vu-color-low) 5%, transparent); }
.vr-music-blk { position:absolute; top:3px; height:28px; display:flex; align-items:center; gap:6px; padding:0 8px; font-size:10px; color:var(--text-primary); background:linear-gradient(135deg, color-mix(in srgb, var(--vu-color-low) 28%, var(--surface2)), color-mix(in srgb, var(--vu-color-low) 10%, var(--surface2))); border:1px solid color-mix(in srgb, var(--vu-color-low) 45%, transparent); border-radius:5px; cursor:grab; overflow:hidden; white-space:nowrap; user-select:none; }
.vr-music-blk i { flex-shrink:0; opacity:.8; }
.vr-music-name { overflow:hidden; text-overflow:ellipsis; }
.vr-text-lane { position:relative; height:34px; border-bottom:1px solid var(--win-border-in); background:color-mix(in srgb, var(--color-active) 4%, transparent); }
.vr-text-tag { position:sticky; left:6px; display:inline-block; margin:10px 0 0 6px; font-size:9px; letter-spacing:.4px; text-transform:uppercase; color:var(--text-secondary); opacity:.7; pointer-events:none; }
.vr-txt-item { position:absolute; top:3px; height:28px; display:flex; align-items:center; gap:5px; padding:0 10px; font-size:10px; color:var(--text-primary); background:linear-gradient(135deg, color-mix(in srgb, var(--color-active) 24%, var(--surface2)), color-mix(in srgb, var(--color-active) 8%, var(--surface2))); border:1px solid color-mix(in srgb, var(--color-active) 40%, transparent); border-radius:5px; cursor:grab; overflow:hidden; white-space:nowrap; user-select:none; }
.vr-txt-item i { flex-shrink:0; opacity:.8; font-size:9px; }
.vr-txt-label { overflow:hidden; text-overflow:ellipsis; pointer-events:none; }
.vr-txt-h { position:absolute; top:0; bottom:0; width:7px; cursor:ew-resize; }
.vr-txt-h.l { left:0 } .vr-txt-h.r { right:0 }
.vr-txt-h::after { content:''; position:absolute; top:7px; bottom:7px; left:2.5px; width:2px; border-radius:1px; background:color-mix(in srgb, var(--text-primary) 45%, transparent); }
.vr-txt-overlay { position:absolute; overflow:hidden; pointer-events:none; z-index:3; }
.vr-txt-prev { position:absolute; max-width:90%; line-height:1.25; font-family:Arial, sans-serif; white-space:pre-wrap; }
.vr-clip.vr-ph { background:repeating-linear-gradient(45deg, color-mix(in srgb, var(--text-secondary) 13%, transparent) 0 8px, color-mix(in srgb, var(--surface2) 60%, transparent) 8px 16px) !important; border:1.5px dashed color-mix(in srgb, var(--text-secondary) 55%, transparent) !important; }
.vr-ph-dur { margin-left:auto; flex-shrink:0; font-size:9px; color:var(--text-secondary); background:color-mix(in srgb, var(--bg) 55%, transparent); border-radius:3px; padding:1px 4px; font-variant-numeric:tabular-nums; }
.vr-pos-grid { display:grid; grid-template-columns:repeat(3, 18px); grid-auto-rows:18px; gap:3px; }
.vr-pos-cell { border:1px solid var(--win-border-in); border-radius:3px; background:var(--surface); cursor:pointer; padding:0; }
.vr-pos-cell.on { background:color-mix(in srgb, var(--color-active) 45%, var(--surface)); border-color:var(--color-active); }
.vr-mk-lane { position:relative; height:18px; border-bottom:1px solid var(--win-border-in); background:color-mix(in srgb, var(--vu-color-high) 4%, transparent); }
.vr-mk-item { position:absolute; top:3px; height:12px; border-radius:6px; background:linear-gradient(135deg, color-mix(in srgb, var(--vu-color-high) 30%, var(--surface2)), color-mix(in srgb, var(--vu-color-high) 10%, var(--surface2))); border:1px solid color-mix(in srgb, var(--vu-color-high) 45%, transparent); cursor:grab; user-select:none; }
.vr-mk-item::before { content:''; position:absolute; left:2px; top:2px; width:6px; height:6px; transform:rotate(45deg); border-radius:1px; background:color-mix(in srgb, var(--vu-color-high) 70%, var(--text-primary)); pointer-events:none; }
.vr-mk-h { position:absolute; top:0; bottom:0; right:0; width:6px; cursor:ew-resize; }
.vr-mk-h::after { content:''; position:absolute; top:2px; bottom:2px; right:2px; width:2px; border-radius:1px; background:color-mix(in srgb, var(--text-primary) 45%, transparent); }
.vr-mk-pins { position:absolute; z-index:5; pointer-events:none; }
.vr-mk-pin { position:absolute; width:12px; height:12px; border-radius:50%; transform:translate(-50%,-50%); box-sizing:border-box; border:2px solid var(--color-active); background:color-mix(in srgb, var(--color-active) 30%, transparent); opacity:.4; pointer-events:auto; cursor:grab; }
.vr-mk-pin.on { opacity:1; background:var(--color-active); box-shadow:0 0 0 3px color-mix(in srgb, var(--color-active) 25%, transparent); }
.vr-mk-fx { position:absolute; overflow:hidden; pointer-events:none; z-index:2; }
.vr-mk-blur { position:absolute; }
.vr-mk-spot { position:absolute; inset:0; }
.vr-preview.vr-placing { cursor:crosshair; }
.vr-preview.vr-placing video, .vr-preview.vr-placing .vr-mk-pin { pointer-events:none; }
  `
  document.head.appendChild(s)
}

export function initVideoRec(body) {
  injectVrStyles()
  body.classList.add('vr-body')

  const root = localStorage.getItem('library:root')
  const sep  = root?.includes('\\') ? '\\' : '/'

  let ZOOM = 80
  const ZOOM_MIN = 0.5, ZOOM_MAX = 500
  let playheadTime = 0
  let isPlaying    = false

  let playStart    = 0
  let playOffset   = 0
  let playRafId    = null

  const clips = []
  let clipId  = 0
  let loopStart = null, loopEnd = null, loopOn = false
  let selClip = null   // highlighted clip (drives the preview)
  let music = null     // { path, name, start, volume, fadeOut, duration } — one track under the lanes

  body.innerHTML = `
    <div class="vr-pzone" id="vr-pzone">
      <div class="vr-preview" id="vr-preview">
        <video id="vr-vid" playsinline controls></video>
        <div class="vr-preview-empty" id="vr-empty">
          <i class="fa-solid fa-film"></i>${t('vr_no_clip')}
        </div>
        <span class="vr-preview-badge" id="vr-badge" style="display:none"></span>
      </div>
      <div class="vr-transport">
        <button class="seq-btn" id="vr-home" title="${t('sc_go_to_start')}"><i class="fa-solid fa-backward-step"></i></button>
        <button class="seq-btn daw-play-btn" id="vr-play"><i class="fa-solid fa-play"></i></button>
        <button class="seq-btn" id="vr-stop"><i class="fa-solid fa-stop"></i></button>
        <button class="seq-btn" id="vr-split" title="${t('sc_clip_split')}" data-i18n-title="sc_clip_split"><i class="fa-solid fa-scissors"></i></button>
        <span class="daw-time" id="vr-time">0:00</span>
        <span class="vr-total" id="vr-total">/ 0:00</span>
      </div>
    </div>
    <div class="vr-divider" id="vr-divider"><div class="vr-grip"></div></div>
    <div class="daw-controls">
      <button class="seq-btn" id="vr-add" title="${t('mic_add_lane')}"><i class="fa-solid fa-plus"></i></button>
      <button class="seq-btn" id="vr-music" title="${t('vr_add_music')}"><i class="fa-solid fa-music"></i></button>
      <button class="seq-btn" id="vr-text" title="${t('vr_add_text')}"><i class="fa-solid fa-font"></i></button>
      <button class="seq-btn" id="vr-marker" title="${t('vr_mk_add')}"><i class="fa-solid fa-location-dot"></i></button>
      <button class="seq-btn" id="vr-tpl" title="${t('vr_templates')}"><i class="fa-solid fa-shapes"></i></button>
      <button class="seq-btn" id="vr-export" title="${t('vr_export_montage')}"><i class="fa-solid fa-file-export"></i></button>
      <div style="flex:1"></div>
      <input class="seq-save-input" id="vr-name" type="text" placeholder="${t('vr_name_placeholder')}" maxlength="40" />
      <button class="seq-btn" id="vr-save" title="${t('vr_save')}"><i class="fa-solid fa-floppy-disk"></i></button>
    </div>
    <div class="vr-actions" id="vr-actions">
      <button class="vr-act-btn" id="vr-set-in"><i class="fa-solid fa-arrow-right-to-bracket"></i> ${t('vc_set_in')}</button>
      <span class="vr-badge" id="vr-in-badge">0:00.0</span>
      <button class="vr-act-btn" id="vr-set-out"><i class="fa-solid fa-arrow-right-from-bracket"></i> ${t('vc_set_out')}</button>
      <span class="vr-badge" id="vr-out-badge">0:00.0</span>
      <div class="seq-sep"></div>
      <button class="vr-act-btn" id="vr-cut" disabled><i class="fa-solid fa-scissors"></i> ${t('vc_cut')}</button>
      <button class="vr-act-btn" id="vr-audio" disabled><i class="fa-solid fa-music"></i> ${t('vc_extract_audio')}</button>
      <button class="vr-act-btn" id="vr-gif" disabled><i class="fa-solid fa-file-image"></i> ${t('vc_gif')}</button>
      <button class="vr-act-btn" id="vr-subs" disabled><i class="fa-solid fa-closed-captioning"></i> ${t('vc_burn_subs')}</button>
      <button class="vr-act-btn" id="vr-raudio" disabled><i class="fa-solid fa-music"></i> ${t('vc_replace_audio')}</button>
      <button class="vr-act-btn" id="vr-speed" disabled><i class="fa-solid fa-gauge-high"></i> ${t('vc_speed')}</button>
      <button class="vr-act-btn" id="vr-chroma" disabled><i class="fa-solid fa-wand-magic-sparkles"></i> ${t('vc_chroma')}</button>
      <button class="vr-act-btn" id="vr-frames" disabled><i class="fa-solid fa-images"></i> ${t('vc_frames')}</button>
      <button class="vr-act-btn" id="vr-compress" disabled><i class="fa-solid fa-file-zipper"></i> ${t('vc_compress')}</button>
    </div>
    <div class="daw-scrollbar-track"><div class="daw-scrollbar-thumb" id="vr-sb"></div></div>
    <div class="daw-scroll-wrap" id="vr-scroll">
      <div class="daw-inner" id="vr-inner">
        <div class="daw-ruler" id="vr-ruler"></div>
        <div class="daw-lanes" id="vr-lanes"></div>
        <div class="daw-playhead" id="vr-playhead"></div>
      </div>
    </div>`

  const btnPlay   = body.querySelector('#vr-play')
  const btnStop   = body.querySelector('#vr-stop')
  const btnHome   = body.querySelector('#vr-home')
  const timeEl    = body.querySelector('#vr-time')
  const totalEl   = body.querySelector('#vr-total')
  const btnAdd    = body.querySelector('#vr-add')
  const btnMusic  = body.querySelector('#vr-music')
  const btnText   = body.querySelector('#vr-text')
  const btnMarker = body.querySelector('#vr-marker')
  const btnTpl    = body.querySelector('#vr-tpl')
  const btnExport = body.querySelector('#vr-export')
  const nameInp   = body.querySelector('#vr-name')
  const btnSave   = body.querySelector('#vr-save')
  const previewEl = body.querySelector('#vr-preview')
  const pzoneEl   = body.querySelector('#vr-pzone')
  const dividerEl = body.querySelector('#vr-divider')
  const vidEl     = body.querySelector('#vr-vid')
  const emptyEl   = body.querySelector('#vr-empty')
  const badgeEl   = body.querySelector('#vr-badge')

  const setInBtn  = body.querySelector('#vr-set-in')
  const setOutBtn = body.querySelector('#vr-set-out')
  const inBadge   = body.querySelector('#vr-in-badge')
  const outBadge  = body.querySelector('#vr-out-badge')
  const cutBtn    = body.querySelector('#vr-cut')
  const audioBtn  = body.querySelector('#vr-audio')
  const gifBtn    = body.querySelector('#vr-gif')
  const subsBtn   = body.querySelector('#vr-subs')
  const raudioBtn = body.querySelector('#vr-raudio')
  const speedBtn  = body.querySelector('#vr-speed')
  const chromaBtn = body.querySelector('#vr-chroma')
  const framesBtn = body.querySelector('#vr-frames')
  const compBtn   = body.querySelector('#vr-compress')

  const scrollWrap = body.querySelector('#vr-scroll')
  const innerEl    = body.querySelector('#vr-inner')
  const rulerEl    = body.querySelector('#vr-ruler')
  const lanesEl    = body.querySelector('#vr-lanes')
  const playheadEl = body.querySelector('#vr-playhead')
  const sbThumb    = body.querySelector('#vr-sb')

  // ── Resizable preview: drag the divider to trade preview for timeline ─────
  // `desiredPvH` remembers what the user asked for so a temporary window
  // shrink doesn't permanently lose the chosen height.
  const PREVIEW_KEY = 'iceample:videorec:previewH'
  let desiredPvH = parseInt(localStorage.getItem(PREVIEW_KEY), 10) || 230
  let previewH = desiredPvH
  function clampPreviewH() {
    const maxH = Math.max(120, body.clientHeight - 160)
    previewH = Math.min(Math.max(120, desiredPvH), maxH)
    pzoneEl.style.height = previewH + 'px'
  }
  clampPreviewH()
  dividerEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    e.preventDefault()
    const y0 = e.clientY, h0 = previewH
    dividerEl.classList.add('dragging')
    const onMove = ev => { desiredPvH = h0 + (ev.clientY - y0); clampPreviewH() }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      dividerEl.classList.remove('dragging')
      desiredPvH = previewH
      localStorage.setItem(PREVIEW_KEY, String(Math.round(previewH)))
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  })

  function setBtnState(btn, state) {
    const icons = { spin: 'fa-spinner fa-spin', ok: 'fa-check', err: 'fa-xmark' }
    btn.innerHTML = `<i class="fa-solid ${icons[state]}"></i>`
  }
  function resetBtn(btn, icon) { setTimeout(() => { btn.innerHTML = `<i class="fa-solid ${icon}"></i>` }, 1200) }
  function fmtTime(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
  }

  // ── Media bus (receive) ──────────────────────────────────────────────────
  // Registered early so a send right after the tool opens always lands.
  // {kind:'video', path|blobUrl} → mounted as a clip appended after the last
  // clip on the timeline (same loadedmetadata path as the drop handler).
  body.addEventListener('iceample-media', e => receiveMedia(e.detail))
  function receiveMedia(m) {
    if (!m) return
    if (m.kind === 'icevid' && m.path) { loadProject(m.path, m.name); return }
    if (m.path && (m.kind === 'icetpl' || /\.icetpl$/i.test(m.path))) { loadTemplateFile(m.path); return }
    if (m.kind !== 'video') return
    const url = m.path ? 'file://' + String(m.path).replace(/\\/g, '/') : (m.blobUrl || null)
    if (!url) return
    // A template placeholder waiting for media has priority over appending:
    // the first unfilled slot (by start time) receives the file. Blob-only
    // media can't fill a slot (the export needs a real path) so it appends.
    if (m.path) {
      const ph = clips.filter(c => c.placeholder).sort((a, b) => a.startTime - b.startTime)[0]
      if (ph) { fillPlaceholder(ph, m.path, m.name); return }
    }
    const v = document.createElement('video'); v.preload = 'metadata'; v.src = url
    v.addEventListener('loadedmetadata', () => {
      const mount = () => {
        const fin = Number.isFinite(v.duration) && v.duration > 0
        let start = 0
        for (const c of clips) start = Math.max(start, c.startTime + c.duration)
        const c = mountClip({ id: ++clipId, laneIdx: 0, startTime: start, duration: fin ? v.duration : 10, srcDur: fin ? v.duration : null, w: v.videoWidth || 0, h: v.videoHeight || 0, savedPath: m.path || null, videoUrl: m.path ? null : m.blobUrl, label: m.name || null })
        grabThumb(url, thumb => { if (!thumb) return; c.thumbnail = thumb; const img = document.createElement('img'); img.className = 'vr-thumb'; img.src = thumb; c.el.prepend(img) })
        selectClip(c); updateRuler(); updateScrollbar()
      }
      if (Number.isFinite(v.duration)) { mount(); return }
      // MediaRecorder WebM blobs (e.g. bganim's bus send) report Infinity at
      // loadedmetadata — seek far past the end so Chromium computes the real
      // length, then mount with a finite duration (timeout = 10 s fallback).
      let mounted = false
      const once = () => { if (mounted) return; mounted = true; mount() }
      v.addEventListener('seeked', once, { once: true })
      setTimeout(once, 3000)
      v.currentTime = 1e101
    }, { once: true })
  }
  // ── Load a saved .icevid montage (replaces the current timeline) ──────────
  async function loadProject(path, name) {
    if (!window.__TAURI__) return
    if (hasUnsaved()) {
      const choice = await confirmUnsaved(); if (choice === 'cancel') return
      // 'save' means save-then-proceed (same as btnSave/_beforeClose) — never discard.
      if (choice === 'save') for (const c of clips.filter(x => x.videoUrl && !x.savedPath)) await saveClip(c)
    }
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))))
      if (!data || !Array.isArray(data.clips)) throw new Error('format')
      applyTimeline(data)
      nameInp.value = String(name || path.split(/[\\/]/).pop() || '').replace(/\.icevid$/i, '')
    } catch (e) { window.toast?.(t('vc_fail') + ' : ' + e, 'error') }
  }
  // Replace the whole timeline with a serialized montage (see serializeTimeline).
  function applyTimeline(data) {
    ;[...clips].forEach(c => unmountById(c.id))
    ;[...texts].forEach(x => removeText(x.id))
    ;[...markers].forEach(m => removeMarker(m.id))
    clearHistory()   // undo entries reference the wiped timeline

    while (lanes.length < Math.max(2, data.lanes | 0)) addLane()
    for (const d of data.clips) mountClip({ ...d, id: ++clipId })
    // Stage 1/2/3 fields (music, transitions, texts, markers, placeholders)
    // are all optional — old .icevid files simply load with them off.
    if (Array.isArray(data.texts)) for (const d of data.texts) addTextItem(d)
    if (Array.isArray(data.markers)) for (const d of data.markers) addMarkerItem(d)
    music = data.music && data.music.path ? { start: 0, volume: 1, fadeOut: false, duration: null, ...data.music } : null
    pendingMusic = null
    selectClip(null); updateRuler(); updateScrollbar(); updateTextOverlay(playheadTime)
  }
  // The montage as plain data — the .icevid file content, also what the
  // project auto-save keeps.
  function serializeTimeline() {
    return {
      lanes: lanes.length,
      music: music ? { path: music.path, name: music.name || null, start: music.start || 0, volume: music.volume ?? 1, fadeOut: !!music.fadeOut, duration: music.duration ?? null } : null,
      texts: texts.map(tx => ({ text: tx.text, start: tx.start, dur: tx.dur, size: tx.size, color: tx.color, band: tx.band, pos: tx.pos })),
      markers: markers.map(m => ({ x: m.x, y: m.y, start: m.start, dur: m.dur, fn: m.fn, params: { ...m.params } })),
      clips: clips.map(c => ({ laneIdx: c.laneIdx, startTime: c.startTime, duration: c.duration, srcIn: c.srcIn || 0, srcDur: c.srcDur ?? null, w: c.w || 0, h: c.h || 0, savedPath: c.savedPath || null, label: c.label || null, thumbnail: c.thumbnail || null, transition: c.transition || null, placeholder: !!c.placeholder })),
    }
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  const TIMELINE_DUR = 21600, MIN_DUR = 120
  const lanes = [], LANE_H_PX = 58, RULER_H_PX = 24

  // One slim dedicated music strip rendered under the video lanes (the
  // absolutely-positioned playhead/loop overlays don't take flow space, so
  // appending after them still lands the strip right below the lanes).
  const MUSIC_H = 34
  const musicLane = document.createElement('div'); musicLane.className = 'vr-music-lane'
  innerEl.appendChild(musicLane)
  const musicBlk = document.createElement('div'); musicBlk.className = 'vr-music-blk'; musicBlk.style.display = 'none'
  musicBlk.innerHTML = '<i class="fa-solid fa-music"></i><span class="vr-music-name"></span>'
  const musicNameEl = musicBlk.querySelector('.vr-music-name')
  musicLane.appendChild(musicBlk)

  // One dedicated "Texte" overlay strip rendered ABOVE the video lanes
  // (inserted between the ruler and the lanes, so everything below shifts by
  // TEXT_H — the junction badges account for it). Items are CapCut-style
  // titles {id, text, start, dur, size, color, band, pos}; the preview
  // mirrors them live and the export burns them in via drawtext.
  const TEXT_H = 34
  const TXT_SIZES = { s: 24, m: 36, l: 52, xl: 72 }   // px at the 720p reference
  const textLane = document.createElement('div'); textLane.className = 'vr-text-lane'
  const textTag = document.createElement('span'); textTag.className = 'vr-text-tag'; textTag.textContent = t('vr_text_lane')
  textLane.appendChild(textTag)
  innerEl.insertBefore(textLane, lanesEl)
  const texts = []
  let textId = 0
  function positionText(tx) { tx.el.style.left = (tx.start * ZOOM) + 'px'; tx.el.style.width = Math.max(14, tx.dur * ZOOM) + 'px' }
  function positionTexts() { texts.forEach(positionText) }

  // One extra-slim MARKER strip right under the ruler (above the text lane —
  // everything below shifts by MARKER_H, mirrored in updateInnerHeight and
  // the junction badge tops). A spatio-temporal marker fuses WHERE and WHEN:
  // {id, x, y (% of the video frame), start, dur, fn: 'zoom'|'blur'|'spot',
  // params}. One marker = ONE function — the editor switches fn, never
  // stacks. Zoom's dur is DERIVED from its aller/maintien/retour envelope.
  const MARKER_H = 18
  const markerLane = document.createElement('div'); markerLane.className = 'vr-mk-lane'; markerLane.title = t('vr_mk_lane')
  innerEl.insertBefore(markerLane, textLane)
  const markers = []
  let markerId = 0
  function positionMarker(m) { m.el.style.left = (m.start * ZOOM) + 'px'; m.el.style.width = Math.max(12, m.dur * ZOOM) + 'px' }
  function positionMarkers() { markers.forEach(positionMarker) }

  function tlDur() {
    let end = 0
    for (const c of clips) end = Math.max(end, c.startTime + c.duration)
    const viewDur = scrollWrap.clientWidth / ZOOM, viewRight = scrollWrap.scrollLeft / ZOOM + viewDur
    return Math.min(TIMELINE_DUR, Math.max(MIN_DUR, end + 30, viewRight + viewDur, (playheadTime || 0) + 30))
  }
  function snapTime(sec) { const g = 60 / getBpm(); return Math.round(sec / g) * g }
  function updateInnerHeight() { innerEl.style.height = (RULER_H_PX + MARKER_H + TEXT_H + lanes.length * LANE_H_PX + MUSIC_H) + 'px' }
  // NOTE: the old autoResizeWindow (window height driven by lane count) is
  // gone on purpose — it fought the user's manual preview/divider sizing.
  function contentEnd() { let e = 0; for (const c of clips) e = Math.max(e, c.startTime + c.duration); return e }
  function updateTotal() { totalEl.textContent = '/ ' + fmtTime(contentEnd()) }
  function addLane() {
    const lane = document.createElement('div')
    lane.className = 'daw-lane'; lane.dataset.laneIdx = lanes.length
    lane.style.width = Math.round(tlDur() * ZOOM) + 'px'
    lanesEl.appendChild(lane); lanes.push(lane)
    updateInnerHeight(); updateRuler(); return lanes.length - 1
  }
  // Declared before the first addLane() below: addLane calls updateRuler(),
  // which reads this — a `const` further down would be in its temporal dead
  // zone and throw during init.
  const NICE_STEPS = [1,2,5,10,15,30,60,120,300,600,900,1800,3600]
  addLane(); addLane()
  btnAdd.addEventListener('click', () => addLane())

  function updateRuler() {
    const totalW = Math.round(tlDur() * ZOOM)
    rulerEl.style.width = totalW + 'px'; lanes.forEach(l => l.style.width = totalW + 'px')
    rulerEl.innerHTML = ''
    const step = NICE_STEPS.find(s => s * ZOOM >= 60) ?? 3600
    const visStart = Math.floor(scrollWrap.scrollLeft / ZOOM / step) * step
    const visEnd   = Math.ceil((scrollWrap.scrollLeft + scrollWrap.clientWidth) / ZOOM) + step * 2
    for (let tt = Math.max(0, visStart); tt <= Math.min(tlDur(), visEnd); tt += step) {
      const mark = document.createElement('div'); mark.className = 'daw-ruler-mark'
      mark.style.left = (tt * ZOOM) + 'px'
      const h = Math.floor(tt / 3600), m = Math.floor((tt % 3600) / 60), s = tt % 60
      mark.textContent = h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}s`
      rulerEl.appendChild(mark)
    }
    // Everything whose geometry depends on ZOOM / clip layout rides along:
    musicLane.style.width = totalW + 'px'
    textLane.style.width = totalW + 'px'
    markerLane.style.width = totalW + 'px'
    positionMusic(); positionTexts(); positionMarkers(); renderJunctionBadges(); updateTotal()
  }
  function applyZoom(newZoom, cursorClientX) {
    const rect = scrollWrap.getBoundingClientRect(), cursorX = cursorClientX - rect.left
    const cursorTime = (scrollWrap.scrollLeft + cursorX) / ZOOM
    ZOOM = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom))
    updateRuler(); clips.forEach(positionClip)
    playheadEl.style.left = (playheadTime * ZOOM) + 'px'
    scrollWrap.scrollLeft = Math.max(0, cursorTime * ZOOM - cursorX); updateScrollbar()
  }
  scrollWrap.addEventListener('wheel', e => { e.preventDefault(); applyZoom(ZOOM * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX) }, { passive: false })
  rulerEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    const sr = scrollWrap.getBoundingClientRect()
    const at = cx => Math.max(0, (cx - sr.left + scrollWrap.scrollLeft) / ZOOM)
    const t0 = snapTime(at(e.clientX)); let dragged = false
    const onMove = ev => { if (Math.abs(ev.clientX - e.clientX) > 3) dragged = true; if (dragged) setRange(t0, snapTime(at(ev.clientX))) }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if (!dragged) { playheadTime = at(e.clientX); playheadEl.style.left = (playheadTime * ZOOM) + 'px'; updateTextOverlay(playheadTime) } }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  })

  function updateScrollbar() {
    const trackW = scrollWrap.clientWidth, contentW = tlDur() * ZOOM
    if (contentW <= trackW) { sbThumb.style.width = '100%'; sbThumb.style.left = '0'; return }
    const thumbW = Math.max(30, trackW / contentW * trackW), maxScroll = contentW - trackW
    const pct = maxScroll > 0 ? scrollWrap.scrollLeft / maxScroll : 0
    sbThumb.style.width = thumbW + 'px'; sbThumb.style.left = (pct * (trackW - thumbW)) + 'px'
  }
  // Playhead auto-follow fires a scroll event per rAF frame; rebuilding the
  // whole ruler + junction badges each frame is wasted work while the visible
  // mark range hasn't crossed a step boundary. The key quantizes the visible
  // window (and the growing content width) to the mark step — same key means
  // nothing new to draw. Geometry changes (zoom, clip edits) call
  // updateRuler() directly and are never skipped.
  let rulerScrollKey = ''
  scrollWrap.addEventListener('scroll', () => {
    updateScrollbar()
    const step = NICE_STEPS.find(s => s * ZOOM >= 60) ?? 3600
    const key = ZOOM + ':' + Math.floor(scrollWrap.scrollLeft / (step * ZOOM)) + ':' +
      Math.ceil((scrollWrap.scrollLeft + scrollWrap.clientWidth) / (step * ZOOM)) + ':' + Math.ceil(tlDur() / step)
    if (key === rulerScrollKey) return
    rulerScrollKey = key
    updateRuler()
  })
  let sbStartX = 0, sbStartScroll = 0
  sbThumb.addEventListener('mousedown', e => {
    if (e.button !== 0) return; e.preventDefault()
    sbStartX = e.clientX; sbStartScroll = scrollWrap.scrollLeft
    function onMove(ev) { const trackW = scrollWrap.clientWidth, contentW = tlDur() * ZOOM, thumbW = Math.max(30, trackW / contentW * trackW), tr = trackW - thumbW; scrollWrap.scrollLeft = sbStartScroll + (tr > 0 ? (ev.clientX - sbStartX) / tr * (contentW - trackW) : 0) }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  })

  // ── Loop / marquee range ──────────────────────────────────────────────────
  const loopRegion = document.createElement('div'); loopRegion.className = 'daw-loop-region'; loopRegion.style.display = 'none'; innerEl.appendChild(loopRegion)
  const marqueeCut = document.createElement('button'); marqueeCut.className = 'daw-marquee-cut'; marqueeCut.title = t('marquee_cut'); marqueeCut.innerHTML = '<i class="fa-solid fa-scissors"></i>'; marqueeCut.style.display = 'none'; innerEl.appendChild(marqueeCut)
  marqueeCut.addEventListener('mousedown', ev => ev.stopPropagation())
  marqueeCut.addEventListener('click', ev => { ev.stopPropagation(); if (loopOn && loopStart != null && loopEnd != null && loopEnd > loopStart) { carveRange(loopStart, loopEnd); clearRange() } })
  function updateLoopUI() {
    if (loopStart == null || loopEnd == null || loopEnd <= loopStart) { loopRegion.style.display = 'none'; marqueeCut.style.display = 'none'; return }
    loopRegion.style.display = ''; loopRegion.style.left = (loopStart * ZOOM) + 'px'; loopRegion.style.width = ((loopEnd - loopStart) * ZOOM) + 'px'
    loopRegion.classList.toggle('active', loopOn); marqueeCut.style.display = ''; marqueeCut.style.left = (loopStart * ZOOM + 4) + 'px'
  }
  function setRange(a, b) { loopStart = Math.min(a, b); loopEnd = Math.max(a, b); loopOn = loopEnd > loopStart; updateLoopUI() }
  function clearRange() { loopStart = loopEnd = null; loopOn = false; updateLoopUI() }
  function rangeReady() { return loopOn && loopStart != null && loopEnd != null && loopEnd > loopStart }

  lanesEl.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('.daw-clip')) return
    const sr = scrollWrap.getBoundingClientRect(), t0 = snapTime(Math.max(0, (e.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM))
    const x0 = e.clientX, y0 = e.clientY; let dragged = false
    const onMove = ev => { if (!dragged && (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 3)) dragged = true; if (!dragged) return; setRange(t0, snapTime(Math.max(0, (ev.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM))) }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if (!dragged) clearRange() }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  })

  // ── Thumbnail ─────────────────────────────────────────────────────────────
  function grabThumb(url, cb) {
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.src = url
    v.addEventListener('loadeddata', () => {
      v.currentTime = 0.5
      v.addEventListener('seeked', () => {
        try { const c = document.createElement('canvas'); c.width = 120; c.height = 68; c.getContext('2d').drawImage(v, 0, 0, 120, 68); cb(c.toDataURL('image/jpeg', 0.6)) } catch { cb(null) }
        v.src = ''
      }, { once: true })
    }, { once: true })
    v.addEventListener('error', () => cb(null), { once: true })
  }

  // ── Clip management ────────────────────────────────────────────────────────
  function positionClip(c) { c.el.style.left = (c.startTime * ZOOM) + 'px'; c.el.style.width = Math.max(4, c.duration * ZOOM) + 'px' }
  function laneIdxFromY(clientY) { let best = 0; lanes.forEach((l, i) => { const r = l.getBoundingClientRect(); if (clientY >= r.top && clientY <= r.bottom) best = i }); return best }
  function selectClip(c) {
    clips.forEach(x => x.el.classList.remove('selected'))
    selClip = c
    updateActionState()
    if (!c) { vidEl.src = ''; emptyEl.style.display = ''; badgeEl.style.display = 'none'; return }
    c.el.classList.add('selected')
    const src = c.videoUrl || (c.savedPath ? 'file://' + String(c.savedPath).replace(/\\/g, '/') : null)
    if (src) { vidEl.src = src; emptyEl.style.display = 'none'; badgeEl.style.display = ''; badgeEl.textContent = c.label || c.savedPath?.split(/[\\/]/).pop() || 'clip' }
    else { vidEl.src = ''; emptyEl.style.display = ''; badgeEl.style.display = 'none' }
  }
  function mountClip(d) {
    const el = document.createElement('div')
    el.className = 'daw-clip vr-clip mic-clip' + (d.placeholder ? ' vr-ph' : ''); el.dataset.clipId = d.id
    el.innerHTML = '<i class="fa-solid fa-film"></i><span class="daw-clip-name"></span>'
    el.querySelector('.daw-clip-name').textContent = d.label || ''
    if (d.placeholder) { const b = document.createElement('span'); b.className = 'vr-ph-dur'; b.textContent = (Math.round((d.duration || 0) * 10) / 10) + 's'; el.appendChild(b) }
    if (d.thumbnail) { const img = document.createElement('img'); img.className = 'vr-thumb'; img.src = d.thumbnail; el.prepend(img) }
    // srcIn/srcDur: offset and total length within the SOURCE file — set by
    // carve/split so trimmed fragments play (and export) the right slice.
    // w/h: source frame size probed at mount (0 = unknown — old projects,
    // probe failures); the montage export picks its target resolution off it.
    // transition: { type, dur } applied at this clip's RIGHT edge on export.
    // placeholder: a template slot holding no media yet (skipped by export).
    const clip = { id: d.id, laneIdx: d.laneIdx, startTime: d.startTime, duration: d.duration, srcIn: d.srcIn || 0, srcDur: d.srcDur ?? null, w: d.w || 0, h: d.h || 0, videoUrl: d.videoUrl || null, savedPath: d.savedPath || null, thumbnail: d.thumbnail || null, label: d.label || null, transition: d.transition || null, placeholder: !!d.placeholder, el }
    clips.push(clip); positionClip(clip)
    if (lanes[clip.laneIdx]) lanes[clip.laneIdx].appendChild(el)
    makeDraggable(clip)
    el.addEventListener('click', e => { e.stopPropagation(); selectClip(clip) })
    return clip
  }
  function snapClip(c) { return { id: c.id, laneIdx: c.laneIdx, startTime: c.startTime, duration: c.duration, srcIn: c.srcIn || 0, srcDur: c.srcDur ?? null, w: c.w || 0, h: c.h || 0, videoUrl: c.videoUrl, savedPath: c.savedPath, thumbnail: c.thumbnail, label: c.label, transition: c.transition || null, placeholder: !!c.placeholder } }
  function unmountById(id) { const i = clips.findIndex(c => c.id === id); if (i >= 0) { if (selClip?.id === id) selectClip(null); clips[i].el.remove(); clips.splice(i, 1) } }
  function carveRange(t0, t1) {
    if (t1 <= t0) return
    const affected = clips.filter(c => c.startTime < t1 && c.startTime + c.duration > t0); if (!affected.length) return
    const removed = affected.map(snapClip), created = []
    affected.forEach(c => {
      const cs = c.startTime, ce = cs + c.duration, si = c.srcIn || 0; unmountById(c.id)
      // The left piece's right edge is now a fresh cut — its transition (if
      // any) stays with the ORIGINAL right edge, i.e. the right piece.
      if (cs < t0) { const nc = mountClip({ ...snapClip(c), id: ++clipId, startTime: cs, duration: t0 - cs, transition: null }); created.push(snapClip(nc)) }
      if (ce > t1) { const nc = mountClip({ ...snapClip(c), id: ++clipId, startTime: t1, duration: ce - t1, srcIn: si + (t1 - cs) }); created.push(snapClip(nc)) }
    })
    updateRuler(); updateScrollbar()
    pushHistory('vr carve', () => { created.forEach(p => unmountById(p.id)); removed.forEach(mountClip); updateRuler(); updateScrollbar() }, () => { removed.forEach(r => unmountById(r.id)); created.forEach(mountClip); updateRuler(); updateScrollbar() })
  }
  function makeDraggable(clip) {
    clip.el.addEventListener('mousedown', e => {
      if (e.button !== 0) return; e.preventDefault(); e.stopPropagation()
      const rect = clip.el.getBoundingClientRect(), offsetX = e.clientX - rect.left
      const prevLane = clip.laneIdx, prevTime = clip.startTime
      const ghost = clip.el.cloneNode(true)
      ghost.style.cssText = `position:fixed;pointer-events:none;opacity:0.75;z-index:9000;overflow:hidden;border-radius:4px;width:${Math.min(clip.el.offsetWidth,260)}px;height:${clip.el.offsetHeight}px;left:${rect.left}px;top:${rect.top}px;`
      document.body.appendChild(ghost); clip.el.classList.add('daw-clip-dragging')
      function onMove(ev) { ghost.style.left = (ev.clientX - offsetX) + 'px'; ghost.style.top = (ev.clientY - 29) + 'px' }
      function onUp(ev) {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
        ghost.remove(); clip.el.classList.remove('daw-clip-dragging')
        // A plain click (no real movement) must SELECT, not re-snap the clip to
        // the grid — bail before repositioning and let the el's click handler
        // run (the capture-phase click killer below would otherwise eat it).
        if (Math.abs(ev.clientX - e.clientX) <= 3 && Math.abs(ev.clientY - e.clientY) <= 3) return
        const sr = scrollWrap.getBoundingClientRect(), newLaneIdx = laneIdxFromY(ev.clientY)
        const newTime = snapTime(Math.max(0, (ev.clientX - sr.left + scrollWrap.scrollLeft - offsetX) / ZOOM))
        const cid = clip.id
        const applyPos = (li, ti) => { const c = clips.find(x => x.id === cid); if (!c) return; c.laneIdx = li; c.startTime = ti; positionClip(c); if (lanes[li] && !lanes[li].contains(c.el)) lanes[li].appendChild(c.el); updateRuler(); updateScrollbar() }
        applyPos(newLaneIdx, newTime)
        if (prevLane !== newLaneIdx || Math.abs(prevTime - newTime) > 0.001) pushHistory('vr move', () => applyPos(prevLane, prevTime), () => applyPos(newLaneIdx, newTime))
        document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    })
    clip.el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showClipMenu(e, clip) })
  }
  let _vrCtx = null
  function showClipMenu(e, clip) {
    if (_vrCtx) { _vrCtx.remove(); _vrCtx = null }
    const menu = document.createElement('div'); menu.className = 'daw-clip-ctx'; _vrCtx = menu
    const close = () => { menu.remove(); _vrCtx = null; document.removeEventListener('mousedown', onDoc) }
    const head = document.createElement('div'); head.className = 'daw-ctx-head'; head.innerHTML = `<i class="fa-solid fa-film"></i><span>${clip.label || 'Clip'}</span>`; menu.appendChild(head)
    if ((clip.videoUrl || clip.savedPath) && window.__TAURI__) {
      const savBtn = document.createElement('button'); savBtn.className = 'daw-ctx-btn'
      savBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${t('clip_save_sample')}`
      savBtn.addEventListener('click', () => { close(); saveClip(clip) })
      menu.appendChild(savBtn)
    }
    if (clip.videoUrl || clip.savedPath) {
      // Media bus: hand this clip to the subtitles tool as its video background.
      const subBtn = document.createElement('button'); subBtn.className = 'daw-ctx-btn'
      subBtn.innerHTML = `<i class="fa-solid fa-closed-captioning"></i> ${t('send_to')} — ${t('tool_subtitles')}`
      subBtn.addEventListener('click', () => {
        close()
        sendMedia('subtitles', clip.savedPath
          ? { kind: 'video', path: clip.savedPath, name: clip.label }
          : { kind: 'video', blobUrl: clip.videoUrl, name: clip.label })
      })
      menu.appendChild(subBtn)
    }
    const del = document.createElement('button'); del.className = 'daw-ctx-btn daw-ctx-del'; del.innerHTML = `<i class="fa-solid fa-trash"></i> ${t('clip_delete')}`
    del.addEventListener('click', () => { close(); unmountById(clip.id); updateRuler(); updateScrollbar() })
    menu.appendChild(del)
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'
    document.body.appendChild(menu)
    const r = menu.getBoundingClientRect()
    if (r.right > innerWidth) menu.style.left = (e.clientX - r.width) + 'px'
    if (r.bottom > innerHeight) menu.style.top = (e.clientY - r.height) + 'px'
    const onDoc = ev => { if (!menu.contains(ev.target)) close() }
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0)
  }
  async function saveClip(clip) {
    if (!root || !window.__TAURI__) return
    const src = clip.videoUrl || (clip.savedPath ? `file://${clip.savedPath}` : null); if (!src && !clip.videoUrl) return
    const defName = clip.label || 'video_clip'
    const base = await promptName(defName.replace(/\.[^.]+$/, ''), { title: t('vr_save') }); if (base == null) return
    try {
      let b64
      if (clip.videoUrl) {
        // FileReader keeps the base64 conversion off a giant JS string rope.
        const blob = await (await fetch(clip.videoUrl)).blob()
        b64 = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(String(r.result).split(',')[1] || '')
          r.onerror = () => rej(r.error)
          r.readAsDataURL(blob)
        })
      } else {
        const { invoke } = window.__TAURI__.core; b64 = await invoke('read_file_base64', { path: clip.savedPath })
      }
      const ext = clip.videoUrl ? '.webm' : (clip.savedPath?.match(/\.[^.]+$/) || ['.webm'])[0]
      const fpath = root + sep + 'Vidéos' + sep + base + ext
      await window.__TAURI__.core.invoke('save_binary_file', { path: fpath, base64: b64 })
      clip.savedPath = fpath; clip.videoUrl = null; clip.label = base + ext
      clip.el.querySelector('.daw-clip-name').textContent = (base + ext).slice(0, 22)
      if (selClip === clip) selectClip(clip)   // preview switches to the saved file
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Vidéos' } }))
      trackRecentFile(fpath, base + ext)
      window.toast?.(t('vr_saved') + ' : ' + base + ext, 'success')
    } catch (err) { window.toast?.(t('clip_save_fail'), 'error') }
  }
  const hasUnsaved = () => clips.some(c => c.videoUrl && !c.savedPath)

  // ── Transitions between adjacent clips ────────────────────────────────────
  // One clickable diamond per junction: two clips on the SAME lane whose
  // edges touch (≤80ms apart). The chosen transition is stored on the LEFT
  // clip as clip.transition = { type, dur } and consumed by the export.
  const TR_TYPES = [
    [null, 'vr_tr_none', 'fa-ban'],
    ['fade', 'vr_tr_fade', 'fa-circle-half-stroke'],
    ['fadeblack', 'vr_tr_fadeblack', 'fa-moon'],
    ['slideleft', 'vr_tr_slide', 'fa-arrow-left-long'],
    ['wipeleft', 'vr_tr_wipe', 'fa-broom'],
    ['circleopen', 'vr_tr_circle', 'fa-circle-dot'],
  ]
  function renderJunctionBadges() {
    innerEl.querySelectorAll('.vr-tj').forEach(el => el.remove())
    const byLane = new Map()
    for (const c of clips) { if (!byLane.has(c.laneIdx)) byLane.set(c.laneIdx, []); byLane.get(c.laneIdx).push(c) }
    byLane.forEach((arr, li) => {
      if (!lanes[li]) return
      arr.sort((x, y) => x.startTime - y.startTime)
      for (let i = 0; i < arr.length - 1; i++) {
        const left = arr[i], right = arr[i + 1]
        if (Math.abs(left.startTime + left.duration - right.startTime) > 0.08) continue
        const el = document.createElement('div')
        el.className = 'vr-tj' + (left.transition && left.transition.type ? ' on' : '')
        el.title = t('vr_transition')
        el.style.left = ((left.startTime + left.duration) * ZOOM - 7) + 'px'
        el.style.top = (RULER_H_PX + MARKER_H + TEXT_H + li * LANE_H_PX + LANE_H_PX / 2 - 7) + 'px'
        el.addEventListener('mousedown', ev => ev.stopPropagation())
        el.addEventListener('click', ev => { ev.stopPropagation(); openTransPopover(el, left) })
        innerEl.appendChild(el)
      }
    })
  }
  function openTransPopover(anchor, clip) {
    let dur = clip.transition?.dur || 0.5
    actPopup(anchor, (pop, finish) => {
      const durRow = popRow(t('vr_tr_dur'))
      const paints = []
      ;[0.3, 0.5, 1].forEach(v => {
        const b = document.createElement('button')
        b.textContent = v + 's'
        b.style.cssText = 'border:1px solid var(--win-border-in);border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;font-family:inherit;color:var(--text-primary);'
        const paint = () => { b.style.background = Math.abs(dur - v) < 0.01 ? 'color-mix(in srgb, var(--color-active) 30%, var(--surface))' : 'var(--surface)' }
        paint(); paints.push(paint)
        b.addEventListener('click', ev => { ev.stopPropagation(); dur = v; paints.forEach(f => f()) })
        durRow.appendChild(b)
      })
      pop.appendChild(durRow)
      TR_TYPES.forEach(([type, key, icon]) => {
        const b = popBtn(t(key), icon)
        b.addEventListener('click', () => finish({ type }))
        pop.appendChild(b)
      })
    }).then(v => {
      if (!v) return   // outside click / Escape: leave the junction untouched
      clip.transition = v.type ? { type: v.type, dur } : null
      renderJunctionBadges()
    })
  }

  // ── Music lane interactions ───────────────────────────────────────────────
  function positionMusic() {
    if (!music) { musicBlk.style.display = 'none'; return }
    musicBlk.style.display = 'flex'
    musicBlk.style.left = (music.start * ZOOM) + 'px'
    musicBlk.style.width = Math.max(30, (music.duration || 60) * ZOOM) + 'px'
    musicNameEl.textContent = music.name || 'music'
  }
  function setMusicFromPath(p) {
    const name = String(p).split(/[\\/]/).pop() || 'music'
    const probe = new Audio(); probe.preload = 'metadata'
    // A template's music slot (offset/volume/fade, no path) waits here and
    // seeds the NEXT picked track, then clears.
    const done = dur => {
      const prefs = pendingMusic || {}; pendingMusic = null
      music = { path: p, name, start: prefs.start || 0, volume: prefs.volume ?? 1, fadeOut: !!prefs.fadeOut, duration: dur }
      positionMusic()
    }
    probe.addEventListener('loadedmetadata', () => done(isFinite(probe.duration) ? probe.duration : null), { once: true })
    probe.addEventListener('error', () => done(null), { once: true })
    probe.src = 'file://' + String(p).replace(/\\/g, '/')
  }
  function openMusicPopover() {
    if (!music) return
    actPopup(musicBlk, (pop, finish) => {
      const volRow = popRow(t('vr_music_volume'))
      const volVal = document.createElement('span'); volVal.style.cssText = 'color:var(--text-primary);font-variant-numeric:tabular-nums;'
      volVal.textContent = Math.round((music.volume ?? 1) * 100) + '%'
      volRow.appendChild(volVal)
      const vol = document.createElement('input'); vol.type = 'range'; vol.min = '0'; vol.max = '150'; vol.step = '5'
      vol.value = String(Math.round((music.volume ?? 1) * 100))
      vol.style.cssText = 'width:calc(100% - 20px);margin:0 10px 4px;accent-color:var(--color-active);'
      vol.addEventListener('input', () => { music.volume = parseInt(vol.value, 10) / 100; volVal.textContent = vol.value + '%' })
      const fadeRow = popRow(t('vr_music_fade'))
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!music.fadeOut
      chk.addEventListener('change', () => { music.fadeOut = chk.checked })
      fadeRow.appendChild(chk)
      const rm = popBtn(t('vr_music_remove'), 'fa-trash')
      rm.addEventListener('click', () => finish('remove'))
      pop.append(volRow, vol, fadeRow, rm)
    }).then(v => { if (v === 'remove') { music = null; positionMusic() } })
  }
  btnMusic.addEventListener('click', async () => {
    if (!window.__TAURI__) { window.toast?.(t('vc_tauri_only'), 'warn'); return }
    if (music) { openMusicPopover(); return }   // already set: tweak/remove it
    const p = await pickFile(t('vr_add_music'), 'Audio', ['mp3', 'wav', 'ogg', 'm4a', 'flac'])
    if (p) setMusicFromPath(p)
  })
  // Horizontal drag sets the start offset; a plain click (≤3px) opens the
  // settings popover from the block's own click handler (same drag-vs-click
  // discrimination + capture-phase click killer as the clips above).
  musicBlk.addEventListener('mousedown', e => {
    if (e.button !== 0 || !music) return
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, s0 = music.start
    let moved = false
    const onMove = ev => {
      if (!moved && Math.abs(ev.clientX - x0) > 3) moved = true
      if (moved) { music.start = Math.max(0, snapTime(s0 + (ev.clientX - x0) / ZOOM)); positionMusic() }
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      if (moved) document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  })
  musicBlk.addEventListener('click', e => { e.stopPropagation(); openMusicPopover() })

  // ── Text overlays: live preview + items + drag/trim + editor ──────────────
  const txtOverlay = document.createElement('div'); txtOverlay.className = 'vr-txt-overlay'; txtOverlay.style.display = 'none'
  previewEl.appendChild(txtOverlay)
  let overlayKey = ''
  // The video's RENDERED box relative to previewEl, measured from layout
  // (offset*) rather than getBoundingClientRect — a zoom marker puts a CSS
  // transform on the <video>, and the transformed rect must never feed back
  // into overlay geometry (texts/pins stay put while the picture zooms, just
  // like the export where drawtext runs after the zoom).
  function videoBox() {
    if (vidEl.videoWidth && vidEl.getAttribute('src')) return { left: vidEl.offsetLeft, top: vidEl.offsetTop, width: vidEl.offsetWidth, height: vidEl.offsetHeight }
    return { left: 0, top: 0, width: previewEl.clientWidth, height: previewEl.clientHeight }
  }
  // Live mirror of the burned result: shown only while the playhead sits in
  // [start, start+dur]. The overlay hugs the <video>'s rendered box (so
  // letterboxing doesn't shift positions) and font sizes scale with that
  // box's height vs the 720p reference the export uses.
  function updateTextOverlay(time) {
    updateMarkerOverlay(time)   // markers ride every refresh path the texts use
    const act = texts.filter(tx => time >= tx.start && time < tx.start + tx.dur)
    if (!act.length) {
      if (txtOverlay.style.display !== 'none') { txtOverlay.style.display = 'none'; txtOverlay.innerHTML = '' }
      overlayKey = ''
      return
    }
    const vb = videoBox()
    txtOverlay.style.display = ''
    txtOverlay.style.left = vb.left + 'px'; txtOverlay.style.top = vb.top + 'px'
    txtOverlay.style.width = vb.width + 'px'; txtOverlay.style.height = vb.height + 'px'
    const scale = (vb.height || 720) / 720
    const key = scale.toFixed(3) + act.map(tx => [tx.id, tx.text, tx.size, tx.color, tx.band, tx.pos].join('|')).join('~')
    if (key === overlayKey) return   // playback tick calls every frame — rebuild only on change
    overlayKey = key
    txtOverlay.innerHTML = ''
    for (const tx of act) {
      const d = document.createElement('div'); d.className = 'vr-txt-prev'
      d.textContent = tx.text
      d.style.fontSize = ((TXT_SIZES[tx.size] || 36) * scale) + 'px'
      d.style.color = tx.color || '#ffffff'   // user-picked content color — literal on purpose
      if (tx.band) { d.style.background = 'rgba(0,0,0,.5)'; d.style.padding = (14 * scale) + 'px' }   // mirrors black@0.5 + boxborderw=14
      const yv = tx.pos?.[0] || 'b', xh = tx.pos?.[1] || 'c'
      const tf = []
      if (xh === 'l') d.style.left = '5%'
      else if (xh === 'r') d.style.right = '5%'
      else { d.style.left = '50%'; tf.push('translateX(-50%)') }
      if (yv === 't') d.style.top = '5%'
      else if (yv === 'b') d.style.bottom = '5%'
      else { d.style.top = '50%'; tf.push('translateY(-50%)') }
      if (tf.length) d.style.transform = tf.join(' ')
      d.style.textAlign = xh === 'l' ? 'left' : xh === 'r' ? 'right' : 'center'
      txtOverlay.appendChild(d)
    }
  }
  function refreshText(tx) { positionText(tx); tx.el.querySelector('.vr-txt-label').textContent = tx.text.replace(/\s+/g, ' '); overlayKey = ''; updateTextOverlay(playheadTime) }
  function removeText(id) { const i = texts.findIndex(x => x.id === id); if (i >= 0) { texts[i].el.remove(); texts.splice(i, 1); overlayKey = ''; updateTextOverlay(playheadTime) } }
  function addTextItem(d) {
    d = d || {}
    const el = document.createElement('div'); el.className = 'vr-txt-item'
    el.innerHTML = '<i class="fa-solid fa-font"></i><span class="vr-txt-label"></span><div class="vr-txt-h l"></div><div class="vr-txt-h r"></div>'
    const tx = { id: ++textId, text: String(d.text ?? t('vr_text_default')), start: Math.max(0, +d.start || 0), dur: Math.max(0.2, +d.dur || 3), size: TXT_SIZES[d.size] ? d.size : 'm', color: d.color || '#ffffff', band: !!d.band, pos: /^[tcb][lcr]$/.test(d.pos || '') ? d.pos : 'bc', el }
    el.querySelector('.vr-txt-label').textContent = tx.text.replace(/\s+/g, ' ')
    texts.push(tx); positionText(tx); textLane.appendChild(el)
    // Horizontal drag moves `start`; the two edge handles trim start/dur —
    // same ≤3px click-vs-drag discrimination + capture-phase click killer as
    // the clips, so plain clicks and dblclicks still reach their handlers.
    el.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.classList.contains('vr-txt-h')) return
      e.preventDefault(); e.stopPropagation()
      const x0 = e.clientX, s0 = tx.start
      let moved = false
      const onMove = ev => {
        if (!moved && Math.abs(ev.clientX - x0) > 3) moved = true
        if (moved) { tx.start = Math.max(0, snapTime(s0 + (ev.clientX - x0) / ZOOM)); positionText(tx); overlayKey = ''; updateTextOverlay(playheadTime) }
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
        if (!moved) return
        document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
        const tid = tx.id, ns = tx.start
        if (Math.abs(ns - s0) > 0.001) {
          const apply = st => { const x = texts.find(v => v.id === tid); if (!x) return; x.start = st; positionText(x); overlayKey = ''; updateTextOverlay(playheadTime) }
          pushHistory('vr text move', () => apply(s0), () => apply(ns))
        }
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    })
    const trim = (handle, leftEdge) => {
      handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return
        e.preventDefault(); e.stopPropagation()
        const x0 = e.clientX, s0 = tx.start, d0 = tx.dur
        let moved = false
        const onMove = ev => {
          if (!moved && Math.abs(ev.clientX - x0) > 3) moved = true
          if (!moved) return
          const delta = (ev.clientX - x0) / ZOOM
          if (leftEdge) { const ns = Math.min(Math.max(0, snapTime(s0 + delta)), s0 + d0 - 0.2); tx.start = ns; tx.dur = s0 + d0 - ns }
          else tx.dur = Math.max(0.2, snapTime(s0 + d0 + delta) - s0)
          positionText(tx); overlayKey = ''; updateTextOverlay(playheadTime)
        }
        const onUp = () => {
          document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
          if (!moved) return
          document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
          const tid = tx.id, ns = tx.start, nd = tx.dur
          if (Math.abs(ns - s0) > 0.001 || Math.abs(nd - d0) > 0.001) {
            const apply = (st, du) => { const x = texts.find(v => v.id === tid); if (!x) return; x.start = st; x.dur = du; positionText(x); overlayKey = ''; updateTextOverlay(playheadTime) }
            pushHistory('vr text trim', () => apply(s0, d0), () => apply(ns, nd))
          }
        }
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
      })
    }
    trim(el.querySelector('.vr-txt-h.l'), true)
    trim(el.querySelector('.vr-txt-h.r'), false)
    el.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); openTextEditor(tx) })
    return tx
  }
  // Themed popover editor (dblclick a text item). Edits apply LIVE — closing
  // the popover (outside click / Escape) keeps them; only delete goes through
  // finish().
  function openTextEditor(tx) {
    actPopup(tx.el, (pop, finish) => {
      const ta = document.createElement('textarea')
      ta.rows = 3
      ta.style.cssText = 'display:block;width:200px;margin:6px 10px 2px;resize:vertical;background:var(--surface2);color:var(--text-primary);border:1px solid var(--win-border-in);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit;'
      ta.value = tx.text
      ta.addEventListener('input', () => { tx.text = ta.value; refreshText(tx) })
      pop.appendChild(ta)
      const sizeRow = popRow(t('vr_text_size'))
      const sPaints = []
      ;['s', 'm', 'l', 'xl'].forEach(sz => {
        const b = document.createElement('button')
        b.textContent = sz.toUpperCase()
        b.style.cssText = 'border:1px solid var(--win-border-in);border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;font-family:inherit;color:var(--text-primary);'
        const paint = () => { b.style.background = tx.size === sz ? 'color-mix(in srgb, var(--color-active) 30%, var(--surface))' : 'var(--surface)' }
        paint(); sPaints.push(paint)
        b.addEventListener('click', ev => { ev.stopPropagation(); tx.size = sz; sPaints.forEach(f => f()); refreshText(tx) })
        sizeRow.appendChild(b)
      })
      const colRow = popRow(t('vr_text_color'))
      const col = document.createElement('input'); col.type = 'color'; col.value = /^#[0-9a-fA-F]{6}$/.test(tx.color) ? tx.color : '#ffffff'
      col.style.cssText = 'width:38px;height:22px;border:1px solid var(--win-border-in);border-radius:4px;padding:1px;cursor:pointer;background:none;'
      col.addEventListener('input', () => { tx.color = col.value; refreshText(tx) })
      colRow.appendChild(col)
      const bandRow = popRow(t('vr_text_band'))
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = tx.band
      chk.addEventListener('change', () => { tx.band = chk.checked; refreshText(tx) })
      bandRow.appendChild(chk)
      const posRow = popRow(t('vr_text_pos'))
      const grid = document.createElement('div'); grid.className = 'vr-pos-grid'
      ;['tl', 'tc', 'tr', 'cl', 'cc', 'cr', 'bl', 'bc', 'br'].forEach(p => {
        const cell = document.createElement('button'); cell.className = 'vr-pos-cell' + (tx.pos === p ? ' on' : '')
        cell.addEventListener('click', ev => { ev.stopPropagation(); tx.pos = p; grid.querySelectorAll('.vr-pos-cell').forEach(c => c.classList.toggle('on', c === cell)); refreshText(tx) })
        grid.appendChild(cell)
      })
      posRow.appendChild(grid)
      const timeRow = popRow(t('vr_text_start'))
      const stInp = document.createElement('input'); stInp.type = 'number'; stInp.min = '0'; stInp.step = '0.1'; stInp.value = String(Math.round(tx.start * 10) / 10); stInp.style.cssText = POP_INP
      stInp.addEventListener('change', () => { tx.start = Math.max(0, parseFloat(stInp.value) || 0); refreshText(tx); updateRuler() })
      timeRow.appendChild(stInp)
      const durRow = popRow(t('vr_text_dur'))
      const duInp = document.createElement('input'); duInp.type = 'number'; duInp.min = '0.2'; duInp.step = '0.1'; duInp.value = String(Math.round(tx.dur * 10) / 10); duInp.style.cssText = POP_INP
      duInp.addEventListener('change', () => { tx.dur = Math.max(0.2, parseFloat(duInp.value) || 0.2); refreshText(tx); updateRuler() })
      durRow.appendChild(duInp)
      const del = popBtn(t('clip_delete'), 'fa-trash')
      del.addEventListener('click', () => finish('del'))
      pop.append(sizeRow, colRow, bandRow, posRow, timeRow, durRow, del)
    }).then(v => { if (v === 'del') removeText(tx.id) })
  }
  btnText.addEventListener('click', () => {
    const tx = addTextItem({ start: playheadTime, dur: 3 })   // starts under the playhead → instantly visible
    updateRuler(); updateTextOverlay(playheadTime)
    openTextEditor(tx)
  })

  // ── Spatio-temporal markers: pins + strip + placement + editor ────────────
  // Pointing at a spot ON the image beats juggling time + coordinates — a
  // marker fuses both. The pin is the WHERE (draggable on the preview), its
  // strip item is the WHEN (draggable/trimmable on the timeline), and each
  // marker carries exactly ONE function with its own settings.
  const MK_FNS = [
    ['zoom', 'vr_mk_zoom', 'fa-magnifying-glass-plus'],
    ['blur', 'vr_mk_blur', 'fa-smog'],
    ['spot', 'vr_mk_spot', 'fa-lightbulb'],
  ]
  function defaultMkParams(fn) {
    if (fn === 'blur') return { radius: 15, intensity: 2 }          // rayon % of frame height
    if (fn === 'spot') return { radius: 25, dark: 60 }              // rayon %, assombrissement %
    return { factor: 1.8, in: 0.4, hold: 1, out: 0.4, cut: false }  // aller/maintien/retour (s)
  }
  const zoomDur = p => Math.max(0.2, (+p.in || 0) + (+p.hold || 0) + (p.cut ? 0 : +p.out || 0))
  const mkPct = (v, dflt) => { v = +v; return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : dflt }

  // Preview layers, both hugging the video's rendered box via videoBox():
  // pins above everything (z 5), effect mirrors UNDER the text overlay (z 2)
  // so titles stay sharp above a blur/spot — same layering as the export.
  const mkFx = document.createElement('div'); mkFx.className = 'vr-mk-fx'; mkFx.style.display = 'none'
  const mkPins = document.createElement('div'); mkPins.className = 'vr-mk-pins'; mkPins.style.display = 'none'
  previewEl.appendChild(mkFx); previewEl.appendChild(mkPins)
  let mkFxKey = ''

  // Piecewise-LINEAR zoom envelope 1→Z→Z→1 — the export writes the exact same
  // ramp into the zoompan expression, so preview and burn stay in step.
  function zoomScaleAt(m, tt) {
    const p = m.params, aIn = +p.in || 0, hold = +p.hold || 0, aOut = p.cut ? 0 : (+p.out || 0), f = +p.factor || 1.8
    const rel = tt - m.start
    if (rel < 0 || rel >= aIn + hold + aOut) return 1
    if (rel < aIn) return aIn > 0.001 ? 1 + (f - 1) * rel / aIn : f
    if (rel < aIn + hold) return f
    return aOut > 0.001 ? f - (f - 1) * (rel - aIn - hold) / aOut : 1
  }
  function updateMarkerOverlay(time) {
    if (!markers.length) {
      if (mkPins.style.display !== 'none') { mkPins.style.display = 'none'; mkFx.style.display = 'none'; mkFx.innerHTML = '' }
      mkFxKey = ''
      if (vidEl.style.transform) { vidEl.style.transform = ''; vidEl.style.transformOrigin = '' }
      return
    }
    const vb = videoBox()
    mkPins.style.display = ''
    mkPins.style.left = vb.left + 'px'; mkPins.style.top = vb.top + 'px'
    mkPins.style.width = vb.width + 'px'; mkPins.style.height = vb.height + 'px'
    for (const m of markers) {
      m.pinEl.style.left = m.x + '%'; m.pinEl.style.top = m.y + '%'
      m.pinEl.classList.toggle('on', time >= m.start && time < m.start + m.dur)
    }
    // Zoom rides the VIDEO ELEMENT only (overlays measure layout, not the
    // transformed rect). Overlapping zooms never compound: the earliest-
    // starting one wins — the same rule the export graph applies.
    const zAct = markers.filter(m => m.fn === 'zoom' && time >= m.start && time < m.start + m.dur).sort((a, b) => a.start - b.start)[0]
    const zs = zAct ? zoomScaleAt(zAct, time) : 1
    if (zs > 1.001) {
      // Same framing rule as the burn: zoompan CENTRES the marked point in a
      // 1/z-sized window clamped in-frame (x = clip(px-(1/z)/2, 0, 1-1/z)),
      // whereas transform-origin would pin the point at its screen position —
      // the two only agree at 0/0.5/1. Reproduce the window instead: with
      // origin 0 0, `scale(z) translate(-left, -top)` maps source fraction
      // `left` to the left edge and `left+1/z` to the right one.
      const win = 1 / zs
      const cl = p => Math.max(0, Math.min(1 - win, p - win / 2))
      const lx = cl(zAct.x / 100), ly = cl(zAct.y / 100)
      vidEl.style.transformOrigin = '0 0'
      vidEl.style.transform = 'scale(' + zs.toFixed(4) + ') translate(' + (-lx * 100).toFixed(3) + '%,' + (-ly * 100).toFixed(3) + '%)'
    } else if (vidEl.style.transform) { vidEl.style.transform = ''; vidEl.style.transformOrigin = '' }
    // Blur / spot mirrors — rebuilt only when the active set or the box
    // geometry changes (the playback tick calls this every frame).
    const act = markers.filter(m => (m.fn === 'blur' || m.fn === 'spot') && time >= m.start && time < m.start + m.dur)
    if (!act.length) {
      if (mkFx.style.display !== 'none') { mkFx.style.display = 'none'; mkFx.innerHTML = '' }
      mkFxKey = ''
      return
    }
    mkFx.style.display = ''
    mkFx.style.left = vb.left + 'px'; mkFx.style.top = vb.top + 'px'
    mkFx.style.width = vb.width + 'px'; mkFx.style.height = vb.height + 'px'
    const key = Math.round(vb.width) + 'x' + Math.round(vb.height) + act.map(m => [m.id, m.fn, m.x, m.y, JSON.stringify(m.params)].join('|')).join('~')
    if (key === mkFxKey) return
    mkFxKey = key
    mkFx.innerHTML = ''
    const k = (vb.height || 720) / 720   // same 720p px reference as the export
    for (const m of act) {
      if (m.fn === 'blur') {
        const d = document.createElement('div'); d.className = 'vr-mk-blur'
        // Mirrors the burn exactly: a SQUARE patch (side = 2×radius% of the
        // frame height, capped at the frame width like the export's
        // min(...,floor(iw/2)*2)) pushed back inside the frame with the same
        // min(max(c-sz/2,0),W-sz) clamp the crop/overlay pair uses.
        const sz = Math.min(2 * (m.params.radius || 15) / 100 * vb.height, vb.width)
        const cl = (c, span) => Math.min(Math.max(c - sz / 2, 0), Math.max(0, span - sz))
        d.style.left = cl(m.x / 100 * vb.width, vb.width).toFixed(1) + 'px'
        d.style.top = cl(m.y / 100 * vb.height, vb.height).toFixed(1) + 'px'
        d.style.width = sz + 'px'; d.style.height = sz + 'px'
        d.style.backdropFilter = 'blur(' + (6 * (m.params.intensity || 2) * k).toFixed(1) + 'px)'
        mkFx.appendChild(d)
      } else {
        const d = document.createElement('div'); d.className = 'vr-mk-spot'
        const r0 = (m.params.radius || 25) / 100 * vb.height
        const a = Math.max(0, Math.min(0.9, (m.params.dark || 60) / 100))
        // Content mirror of the burned vignette — literal black on purpose.
        d.style.background = 'radial-gradient(circle at ' + m.x + '% ' + m.y + '%, transparent ' + r0.toFixed(1) + 'px, rgba(0,0,0,' + a + ') ' + (r0 + 0.18 * vb.height).toFixed(1) + 'px)'
        mkFx.appendChild(d)
      }
    }
  }
  function refreshMarker(m) {
    positionMarker(m)
    m.el.title = t((MK_FNS.find(f => f[0] === m.fn) || MK_FNS[0])[1])
    m.el.querySelector('.vr-mk-h').style.display = m.fn === 'zoom' ? 'none' : ''   // zoom's dur is derived
    mkFxKey = ''; updateMarkerOverlay(playheadTime)
  }
  function removeMarker(id) {
    const i = markers.findIndex(m => m.id === id)
    if (i >= 0) { markers[i].el.remove(); markers[i].pinEl.remove(); markers.splice(i, 1); mkFxKey = ''; updateMarkerOverlay(playheadTime) }
  }
  function snapMarker(m) { return { id: m.id, x: m.x, y: m.y, start: m.start, dur: m.dur, fn: m.fn, params: { ...m.params } } }
  function addMarkerItem(d) {
    d = d || {}
    const fn = MK_FNS.some(f => f[0] === d.fn) ? d.fn : 'zoom'
    const params = { ...defaultMkParams(fn), ...(d.params && typeof d.params === 'object' ? d.params : {}) }
    const el = document.createElement('div'); el.className = 'vr-mk-item'
    el.innerHTML = '<div class="vr-mk-h"></div>'
    const pinEl = document.createElement('div'); pinEl.className = 'vr-mk-pin'
    const m = { id: d.id || ++markerId, x: mkPct(d.x, 50), y: mkPct(d.y, 50), start: Math.max(0, +d.start || 0), dur: fn === 'zoom' ? zoomDur(params) : Math.max(0.2, +d.dur || 2), fn, params, el, pinEl }
    if (d.id) markerId = Math.max(markerId, d.id)   // undo re-mounts keep ids unique
    markers.push(m)
    markerLane.appendChild(el); mkPins.appendChild(pinEl)
    refreshMarker(m)
    // Strip drag moves `start`; the right handle trims dur (blur/spot only) —
    // same ≤3px click-vs-drag discrimination + capture-phase click killer as
    // the clips/texts, and the same id-lookup undo closures.
    el.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.classList.contains('vr-mk-h')) return
      e.preventDefault(); e.stopPropagation()
      const x0 = e.clientX, s0 = m.start
      let moved = false
      const onMove = ev => {
        if (!moved && Math.abs(ev.clientX - x0) > 3) moved = true
        if (moved) { m.start = Math.max(0, snapTime(s0 + (ev.clientX - x0) / ZOOM)); positionMarker(m); mkFxKey = ''; updateMarkerOverlay(playheadTime) }
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
        if (!moved) return
        document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
        const mid = m.id, ns = m.start
        if (Math.abs(ns - s0) > 0.001) {
          const apply = st => { const v = markers.find(z => z.id === mid); if (!v) return; v.start = st; positionMarker(v); mkFxKey = ''; updateMarkerOverlay(playheadTime) }
          pushHistory('vr marker move', () => apply(s0), () => apply(ns))
        }
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    })
    el.querySelector('.vr-mk-h').addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.preventDefault(); e.stopPropagation()
      const x0 = e.clientX, d0 = m.dur
      let moved = false
      const onMove = ev => {
        if (!moved && Math.abs(ev.clientX - x0) > 3) moved = true
        if (moved) { m.dur = Math.max(0.2, snapTime(m.start + d0 + (ev.clientX - x0) / ZOOM) - m.start); positionMarker(m); mkFxKey = ''; updateMarkerOverlay(playheadTime) }
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
        if (!moved) return
        document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
        const mid = m.id, nd = m.dur
        if (Math.abs(nd - d0) > 0.001) {
          const apply = du => { const v = markers.find(z => z.id === mid); if (!v) return; v.dur = du; positionMarker(v); mkFxKey = ''; updateMarkerOverlay(playheadTime) }
          pushHistory('vr marker trim', () => apply(d0), () => apply(nd))
        }
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    })
    // Pin drag moves the WHERE (x/y % of the frame, clamped in-frame).
    pinEl.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.preventDefault(); e.stopPropagation()
      const px0 = e.clientX, py0 = e.clientY, ox = m.x, oy = m.y
      let moved = false
      const onMove = ev => {
        if (!moved && (Math.abs(ev.clientX - px0) > 3 || Math.abs(ev.clientY - py0) > 3)) moved = true
        if (!moved) return
        const vb = videoBox()
        if (!vb.width || !vb.height) return
        m.x = Math.max(0, Math.min(100, ox + (ev.clientX - px0) / vb.width * 100))
        m.y = Math.max(0, Math.min(100, oy + (ev.clientY - py0) / vb.height * 100))
        mkFxKey = ''; updateMarkerOverlay(playheadTime)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
        if (!moved) return
        document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
        const mid = m.id, nx = m.x, ny = m.y
        if (Math.abs(nx - ox) > 0.01 || Math.abs(ny - oy) > 0.01) {
          const apply = (X, Y) => { const v = markers.find(z => z.id === mid); if (!v) return; v.x = X; v.y = Y; mkFxKey = ''; updateMarkerOverlay(playheadTime) }
          pushHistory('vr marker move', () => apply(ox, oy), () => apply(nx, ny))
        }
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    })
    pinEl.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); openMarkerEditor(m, pinEl) })
    el.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); openMarkerEditor(m, el) })
    return m
  }

  // One-shot placement: arm → the next click ON the preview drops a marker at
  // that x/y with start = playhead. `.vr-placing` turns off pointer events on
  // the <video> (so its controls can't eat the click) and on the pins.
  let placing = false
  function placeKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelPlacement() } }
  function placeClick(e) {
    e.preventDefault(); e.stopPropagation()
    const vb = videoBox(), pr = previewEl.getBoundingClientRect()
    cancelPlacement()
    // No clip previewed yet → the video box is 0×0. Say so instead of
    // silently dropping the click the user just aimed.
    if (!vb.width || !vb.height) { window.toast?.(t('vc_no_video'), 'info'); return }
    const x = Math.max(0, Math.min(100, (e.clientX - pr.left - vb.left) / vb.width * 100))
    const y = Math.max(0, Math.min(100, (e.clientY - pr.top - vb.top) / vb.height * 100))
    const m = addMarkerItem({ x, y, start: playheadTime, fn: 'zoom' })
    updateRuler(); updateMarkerOverlay(playheadTime)
    const snap = snapMarker(m)
    pushHistory('vr marker add',
      () => { removeMarker(snap.id); updateRuler() },
      () => { addMarkerItem(snap); updateRuler(); updateMarkerOverlay(playheadTime) })
  }
  function armPlacement() {
    // Placement swallows the next preview click, so close any open popover
    // first — otherwise it would linger with no way to dismiss it.
    document.getElementById('vr-act-pop')?.remove()
    placing = true
    previewEl.classList.add('vr-placing')
    btnMarker.style.background = 'color-mix(in srgb, var(--color-active) 30%, transparent)'
    previewEl.addEventListener('click', placeClick, true)
    document.addEventListener('keydown', placeKey, true)
    window.toast?.(t('vr_mk_place_hint'), 'info')
  }
  function cancelPlacement() {
    if (!placing) return
    placing = false
    previewEl.classList.remove('vr-placing')
    btnMarker.style.background = ''
    previewEl.removeEventListener('click', placeClick, true)
    document.removeEventListener('keydown', placeKey, true)
  }
  btnMarker.addEventListener('click', () => { placing ? cancelPlacement() : armPlacement() })

  // Themed popover editor (dblclick a pin or its strip item). Edits apply
  // LIVE like the text editor — closing keeps them; only delete finishes.
  function openMarkerEditor(m, anchor) {
    actPopup(anchor, (pop, finish) => {
      // Function segmented control — switching REPLACES the params with that
      // function's defaults (1 marqueur = 1 fonction, jamais de cumul).
      const fnRow = document.createElement('div')
      fnRow.style.cssText = 'display:flex;gap:4px;padding:6px 10px 2px;'
      const fnPaints = []
      MK_FNS.forEach(([fn, key, icon]) => {
        const b = document.createElement('button')
        b.innerHTML = `<i class="fa-solid ${icon}"></i> <span></span>`
        b.querySelector('span').textContent = t(key)
        b.style.cssText = 'flex:1;border:1px solid var(--win-border-in);border-radius:4px;padding:3px 6px;font-size:10px;cursor:pointer;font-family:inherit;color:var(--text-primary);white-space:nowrap;'
        const paint = () => { b.style.background = m.fn === fn ? 'color-mix(in srgb, var(--color-active) 30%, var(--surface))' : 'var(--surface)' }
        paint(); fnPaints.push(paint)
        b.addEventListener('click', ev => {
          ev.stopPropagation()
          if (m.fn === fn) return
          m.fn = fn; m.params = defaultMkParams(fn)
          if (fn === 'zoom') m.dur = zoomDur(m.params)
          fnPaints.forEach(f => f()); renderParams(); refreshMarker(m); updateRuler()
        })
        fnRow.appendChild(b)
      })
      pop.appendChild(fnRow)
      const paramsBox = document.createElement('div')
      pop.appendChild(paramsBox)
      let zoomDurVal = null
      const syncZoomDur = () => { m.dur = zoomDur(m.params); if (zoomDurVal) zoomDurVal.textContent = (Math.round(m.dur * 10) / 10) + 's' }
      const slider = (label, min, max, step, val, fmt, onChange) => {
        const row = popRow(label)
        const valEl = document.createElement('span'); valEl.style.cssText = 'color:var(--text-primary);font-variant-numeric:tabular-nums;'
        valEl.textContent = fmt(val)
        row.appendChild(valEl)
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(val)
        inp.style.cssText = 'width:calc(100% - 20px);margin:0 10px 4px;accent-color:var(--color-active);'
        inp.addEventListener('input', () => { const v = parseFloat(inp.value); valEl.textContent = fmt(v); onChange(v) })
        paramsBox.append(row, inp)
        return inp
      }
      const editableDurRow = () => {
        const dRow = popRow(t('vr_text_dur'))
        const duInp = document.createElement('input'); duInp.type = 'number'; duInp.min = '0.2'; duInp.step = '0.1'; duInp.value = String(Math.round(m.dur * 10) / 10); duInp.style.cssText = POP_INP
        duInp.addEventListener('change', () => { m.dur = Math.max(0.2, parseFloat(duInp.value) || 0.2); refreshMarker(m); updateRuler() })
        dRow.appendChild(duInp)
        paramsBox.appendChild(dRow)
      }
      function renderParams() {
        paramsBox.innerHTML = ''
        zoomDurVal = null
        const p = m.params
        if (m.fn === 'zoom') {
          slider(t('vr_mk_factor'), 1.2, 3, 0.1, p.factor, v => v.toFixed(1) + '×', v => { p.factor = v; refreshMarker(m) })
          slider(t('vr_mk_in'), 0.2, 2, 0.1, p.in, v => v.toFixed(1) + 's', v => { p.in = v; syncZoomDur(); refreshMarker(m); updateRuler() })
          slider(t('vr_mk_hold'), 0, 5, 0.1, p.hold, v => v.toFixed(1) + 's', v => { p.hold = v; syncZoomDur(); refreshMarker(m); updateRuler() })
          const outInp = slider(t('vr_mk_out'), 0.2, 2, 0.1, p.out, v => v.toFixed(1) + 's', v => { p.out = v; syncZoomDur(); refreshMarker(m); updateRuler() })
          outInp.disabled = !!p.cut
          const cutRow = popRow(t('vr_mk_cut'))
          const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!p.cut
          chk.addEventListener('change', () => { p.cut = chk.checked; outInp.disabled = p.cut; syncZoomDur(); refreshMarker(m); updateRuler() })
          cutRow.appendChild(chk)
          paramsBox.appendChild(cutRow)
          const dRow = popRow(t('vr_text_dur'))   // dur is DERIVED for zoom — read-only echo
          zoomDurVal = document.createElement('span'); zoomDurVal.style.cssText = 'color:var(--text-primary);font-variant-numeric:tabular-nums;'
          dRow.appendChild(zoomDurVal)
          paramsBox.appendChild(dRow)
          syncZoomDur()
        } else if (m.fn === 'blur') {
          slider(t('vr_mk_radius'), 5, 40, 1, p.radius, v => v + '%', v => { p.radius = v; refreshMarker(m) })
          slider(t('vr_mk_intensity'), 1, 3, 0.5, p.intensity, v => v.toFixed(1), v => { p.intensity = v; refreshMarker(m) })
          editableDurRow()
        } else {
          slider(t('vr_mk_radius'), 10, 50, 1, p.radius, v => v + '%', v => { p.radius = v; refreshMarker(m) })
          slider(t('vr_mk_dark'), 30, 90, 5, p.dark, v => v + '%', v => { p.dark = v; refreshMarker(m) })
          editableDurRow()
        }
      }
      renderParams()
      const stRow = popRow(t('vr_text_start'))
      const stInp = document.createElement('input'); stInp.type = 'number'; stInp.min = '0'; stInp.step = '0.1'; stInp.value = String(Math.round(m.start * 10) / 10); stInp.style.cssText = POP_INP
      stInp.addEventListener('change', () => { m.start = Math.max(0, parseFloat(stInp.value) || 0); refreshMarker(m); updateRuler() })
      stRow.appendChild(stInp)
      const del = popBtn(t('clip_delete'), 'fa-trash')
      del.addEventListener('click', () => finish('del'))
      pop.append(stRow, del)
    }).then(v => {
      if (v !== 'del') return
      const snap = snapMarker(m)
      removeMarker(m.id); updateRuler()
      pushHistory('vr marker delete',
        () => { addMarkerItem(snap); updateRuler(); updateMarkerOverlay(playheadTime) },
        () => { removeMarker(snap.id); updateRuler() })
    })
  }

  // ── Templates ("Modèles") + timeline import ───────────────────────────────
  // A template is durations-only — no media paths ever leave the app. Slots
  // land as ghost placeholder clips; dropping real media on one fills it.
  let pendingMusic = null   // a template's music prefs, consumed on next pick
  function fillPlaceholder(ph, path, name) {
    const url = 'file://' + String(path).replace(/\\/g, '/')
    const v = document.createElement('video'); v.preload = 'metadata'; v.src = url
    v.addEventListener('loadedmetadata', () => {
      const mdur = v.duration || 0
      ph.savedPath = path; ph.videoUrl = null
      ph.label = name || String(path).split(/[\\/]/).pop() || 'clip'
      ph.srcIn = 0; ph.srcDur = mdur || null
      ph.w = v.videoWidth || 0; ph.h = v.videoHeight || 0
      // Longer media keeps the slot's duration (srcDur lets the export trim
      // it); shorter media keeps its own length and says so.
      if (mdur && mdur < ph.duration - 0.05) { ph.duration = mdur; window.toast?.(t('vr_ph_shorter'), 'info') }
      ph.placeholder = false
      ph.el.classList.remove('vr-ph')
      ph.el.querySelector('.vr-ph-dur')?.remove()
      ph.el.querySelector('.daw-clip-name').textContent = ph.label.slice(0, 22)
      positionClip(ph)
      grabThumb(url, thumb => { if (!thumb) return; ph.thumbnail = thumb; const img = document.createElement('img'); img.className = 'vr-thumb'; img.src = thumb; ph.el.prepend(img) })
      selectClip(ph); updateRuler(); updateScrollbar()
    }, { once: true })
    v.addEventListener('error', () => window.toast?.(t('vc_fail'), 'error'), { once: true })
  }
  async function applyTemplate(tpl) {
    if (!tpl || !Array.isArray(tpl.slots)) { window.toast?.(t('vr_import_fail'), 'error'); return }
    if (hasUnsaved()) {
      const choice = await confirmUnsaved(); if (choice === 'cancel') return
      // 'save' means save-then-proceed (same as btnSave/_beforeClose) — never discard.
      if (choice === 'save') for (const c of clips.filter(x => x.videoUrl && !x.savedPath)) await saveClip(c)
    }
    ;[...clips].forEach(c => unmountById(c.id))
    ;[...texts].forEach(x => removeText(x.id))
    ;[...markers].forEach(m => removeMarker(m.id))   // markers point at media the template doesn't carry
    clearHistory()   // undo entries reference the wiped timeline
    const maxLane = tpl.slots.reduce((m, s) => Math.max(m, s.lane | 0), 0)
    while (lanes.length < Math.max(2, maxLane + 1)) addLane()
    for (const s of tpl.slots) {
      const tr = s.transition
      mountClip({
        id: ++clipId, laneIdx: Math.max(0, s.lane | 0), startTime: Math.max(0, +s.start || 0),
        duration: Math.max(0.2, +s.duration || 1), label: s.label || null,
        transition: tr && (tr.type || typeof tr === 'string') ? { type: tr.type || tr, dur: +tr.dur || 0.5 } : null,
        placeholder: true,
      })
    }
    for (const d of (Array.isArray(tpl.texts) ? tpl.texts : [])) addTextItem(d)
    music = null; positionMusic()
    pendingMusic = tpl.music ? { start: +tpl.music.offset || 0, volume: tpl.music.volume ?? 1, fadeOut: !!tpl.music.fade } : null
    if (tpl.name && !nameInp.value.trim()) nameInp.value = String(tpl.name).slice(0, 40)
    selectClip(null); updateRuler(); updateScrollbar(); updateTextOverlay(playheadTime)
    window.toast?.(t('vr_tpl_applied'), 'info')
    if (tpl.music) window.toast?.(t('vr_tpl_add_music'), 'info')
  }
  async function loadTemplateFile(path) {
    if (!window.__TAURI__) { window.toast?.(t('vc_tauri_only'), 'warn'); return }
    try {
      const data = JSON.parse(await window.__TAURI__.core.invoke('read_text_file', { path }))
      if (!data || data.icetpl !== 1 || !Array.isArray(data.slots)) throw new Error('format')
      applyTemplate(data)
    } catch { window.toast?.(t('vr_import_fail'), 'error') }
  }
  async function saveTemplate() {
    if (!window.__TAURI__) { window.toast?.(t('vc_tauri_only'), 'warn'); return }
    if (!root) { window.toast?.(t('vc_no_lib'), 'error'); return }
    if (!clips.length && !texts.length) { window.toast?.(t('vr_tpl_empty'), 'info'); return }
    const base = await promptName(nameInp.value.trim() || t('vr_default_name'), { title: t('vr_tpl_save') }); if (base == null || base === '') return
    const tpl = {
      icetpl: 1, name: base,
      // Durations only — savedPath/videoUrl deliberately never serialized.
      slots: [...clips].sort((a, b) => a.startTime - b.startTime).map(c => ({ lane: c.laneIdx, start: c.startTime, duration: c.duration, label: c.label || null, transition: c.transition || null })),
      texts: texts.map(tx => ({ text: tx.text, start: tx.start, dur: tx.dur, size: tx.size, color: tx.color, band: tx.band, pos: tx.pos })),
      music: music ? { offset: music.start || 0, volume: music.volume ?? 1, fade: !!music.fadeOut } : null,
    }
    try {
      const fpath = root + sep + 'Pistes' + sep + base + '.icetpl'
      await window.__TAURI__.core.invoke('save_text_file', { path: fpath, content: JSON.stringify(tpl, null, 2) })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Pistes' } }))
      trackRecentFile(fpath, base + '.icetpl')
      window.toast?.(t('vr_saved') + ' : ' + base + '.icetpl', 'success')
    } catch (e) { window.toast?.(t('vc_fail') + ' : ' + e, 'error') }
  }
  // Built-in templates — built lazily so t() follows the live language.
  function builtinTemplates() {
    return [
      { icon: 'fa-clapperboard', tpl: { icetpl: 1, name: t('vr_tpl_vlog'), slots: [
        { lane: 0, start: 0, duration: 3, label: t('vr_tpl_intro'), transition: { type: 'fade', dur: 0.5 } },
        { lane: 0, start: 3, duration: 8, label: t('vr_tpl_clip') + ' 1', transition: { type: 'fade', dur: 0.5 } },
        { lane: 0, start: 11, duration: 8, label: t('vr_tpl_clip') + ' 2', transition: { type: 'fade', dur: 0.5 } },
        { lane: 0, start: 19, duration: 8, label: t('vr_tpl_clip') + ' 3', transition: null },
      ], texts: [{ text: t('vr_tpl_title'), start: 0.4, dur: 2.2, size: 'l', color: '#ffffff', band: false, pos: 'cc' }], music: null } },
      { icon: 'fa-arrow-right-arrow-left', tpl: { icetpl: 1, name: t('vr_tpl_beforeafter'), slots: [
        { lane: 0, start: 0, duration: 5, label: t('vr_tpl_before'), transition: { type: 'wipeleft', dur: 0.5 } },
        { lane: 0, start: 5, duration: 5, label: t('vr_tpl_after'), transition: null },
      ], texts: [
        { text: t('vr_tpl_before'), start: 0.3, dur: 4.4, size: 'm', color: '#ffffff', band: true, pos: 'tc' },
        { text: t('vr_tpl_after'), start: 5.3, dur: 4.4, size: 'm', color: '#ffffff', band: true, pos: 'tc' },
      ], music: null } },
      { icon: 'fa-images', tpl: { icetpl: 1, name: t('vr_tpl_slideshow'),
        slots: [0, 1, 2, 3, 4].map(i => ({ lane: 0, start: i * 4, duration: 4, label: t('vr_tpl_slide') + ' ' + (i + 1), transition: i < 4 ? { type: 'fade', dur: 0.5 } : null })),
        texts: [], music: { offset: 0, volume: 0.8, fade: true } } },
    ]
  }
  btnTpl.addEventListener('click', async () => {
    const v = await actPopup(btnTpl, (pop, finish) => {
      builtinTemplates().forEach(b => {
        const btn = popBtn(b.tpl.name, b.icon)
        btn.addEventListener('click', () => finish({ tpl: b.tpl }))
        pop.appendChild(btn)
      })
      const sepEl = document.createElement('div'); sepEl.style.cssText = 'height:1px;background:var(--win-border-in);margin:4px 6px;'
      pop.appendChild(sepEl)
      const sv = popBtn(t('vr_tpl_save'), 'fa-floppy-disk'); sv.addEventListener('click', () => finish({ act: 'save' })); pop.appendChild(sv)
      const im = popBtn(t('vr_tpl_import'), 'fa-file-import'); im.addEventListener('click', () => finish({ act: 'import' })); pop.appendChild(im)
    })
    if (!v) return
    if (v.tpl) applyTemplate(v.tpl)
    else if (v.act === 'save') saveTemplate()
    else if (v.act === 'import') importTimeline()
  })
  // Import a timeline exported by another editor — the result is exactly a
  // template apply: placeholder clips carrying the source's names/durations.
  async function importTimeline() {
    if (!window.__TAURI__) { window.toast?.(t('vc_tauri_only'), 'warn'); return }
    const p = await pickFile(t('vr_tpl_import'), 'Timeline', ['edl', 'fcpxml', 'xml', 'otio']); if (!p) return
    let txt
    try { txt = await window.__TAURI__.core.invoke('read_text_file', { path: p }) }
    catch (e) { window.toast?.(t('vc_fail') + ' : ' + e, 'error'); return }
    const ext = (p.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
    let slots = null
    try {
      if (ext === 'edl') slots = parseEDL(txt)
      else if (ext === 'otio') slots = parseOTIO(txt)
      else slots = parseFCPXML(txt)   // .fcpxml and .xml
    } catch { slots = null }   // malformed file → toast below, never a crash
    if (!slots || !slots.length) { window.toast?.(t('vr_import_fail'), 'error'); return }
    applyTemplate({ icetpl: 1, name: String(p).split(/[\\/]/).pop().replace(/\.[^.]+$/, ''), slots, texts: [], music: null })
  }
  // CMX3600 EDL: "001  REEL  V  C [frames]  src-in src-out rec-in rec-out",
  // four HH:MM:SS:FF timecodes read at 25 fps. Audio-only events (track
  // without V) are skipped; D/W transition codes land on the previous slot.
  function parseEDL(txt) {
    const TC = '(\\d{1,2})[:;](\\d{2})[:;](\\d{2})[:;](\\d{2})'
    const evRe = new RegExp('^\\d+\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)(?:\\s+(\\d+))?\\s+' + TC + '\\s+' + TC + '\\s+' + TC + '\\s+' + TC + '\\s*$')
    const tc = (h, m, s, f) => (+h) * 3600 + (+m) * 60 + (+s) + (+f) / 25
    const slots = []
    let last = null
    for (const raw of txt.split(/\r?\n/)) {
      const l = raw.trim()
      const fromName = l.match(/^\*\s*FROM CLIP NAME:\s*(.+)$/i)
      if (fromName && last) { last.label = fromName[1].trim(); continue }
      const m = l.match(evRe)
      if (!m) continue
      const track = m[2].toUpperCase()
      if (!track.includes('V') && track !== 'B') continue
      const recIn = tc(m[13], m[14], m[15], m[16]), recOut = tc(m[17], m[18], m[19], m[20])
      const dur = recOut - recIn
      if (!(dur > 0)) continue
      const code = m[3].toUpperCase()
      if (last && (code.startsWith('D') || code.startsWith('W'))) last.transition = { type: code.startsWith('W') ? 'wipeleft' : 'fade', dur: Math.max(0.2, (parseInt(m[4], 10) || 12) / 25) }
      last = { lane: 0, start: recIn, duration: dur, label: m[1], transition: null }
      slots.push(last)
    }
    if (slots.length) { const t0 = Math.min(...slots.map(s => s.start)); slots.forEach(s => { s.start -= t0 }) }
    return slots
  }
  // FCPXML: any asset-clip / video / clip element with offset + duration in
  // rational 'N/Ds' or plain 'Ns' seconds. Nested media (a <video> inside a
  // <clip>) is skipped so each clip lands exactly once.
  function parseRational(v) {
    const m = String(v ?? '').trim().match(/^(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?s?$/)
    if (!m) return NaN
    return parseFloat(m[1]) / (m[2] ? parseFloat(m[2]) : 1)
  }
  function parseFCPXML(txt) {
    const doc = new DOMParser().parseFromString(txt, 'application/xml')
    if (doc.querySelector('parsererror')) return null
    const slots = []
    doc.querySelectorAll('asset-clip, video, clip').forEach(el => {
      if (el.parentElement && el.parentElement.closest('asset-clip, video, clip')) return
      const dur = parseRational(el.getAttribute('duration'))
      if (!(dur > 0)) return
      const off = parseRational(el.getAttribute('offset'))
      slots.push({ lane: 0, start: isNaN(off) ? 0 : off, duration: dur, label: el.getAttribute('name') || null, transition: null })
    })
    slots.sort((a, b) => a.start - b.start)
    if (slots.length) { const t0 = Math.min(...slots.map(s => s.start)); slots.forEach(s => { s.start -= t0 }) }
    return slots
  }
  // OTIO: JSON — video Track children of schema Clip.* read from
  // source_range.duration {value, rate} and laid out sequentially, with Gap
  // durations preserved as timeline gaps. One lane per video track.
  function parseOTIO(txt) {
    const data = JSON.parse(txt)
    const tracks = (data && data.tracks && data.tracks.children) || []
    const slots = []
    let lane = 0
    for (const tr of tracks) {
      if (!String(tr?.OTIO_SCHEMA || '').startsWith('Track')) continue
      if (tr.kind && String(tr.kind).toLowerCase() !== 'video') continue
      let cur = 0
      for (const ch of (tr.children || [])) {
        const schema = String(ch?.OTIO_SCHEMA || '')
        const dd = ch?.source_range?.duration
        const dur = dd ? (+dd.value || 0) / (+dd.rate || 1) : 0
        if (schema.startsWith('Clip')) { if (dur > 0) slots.push({ lane, start: cur, duration: dur, label: ch.name || null, transition: null }); cur += dur }
        else if (schema.startsWith('Gap')) cur += dur
      }
      lane++
    }
    return slots
  }

  // ── Clip actions (ffmpeg, ported from videocut) ───────────────────────────
  let tIn = 0, tOut = 0, ffRunning = false
  const fmtTimeD = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1) }
  const ffTime = v => Math.max(0, v || 0).toFixed(3)
  function setIn(v)  { tIn  = Math.max(0, v || 0); inBadge.textContent  = fmtTimeD(tIn) }
  function setOut(v) { tOut = Math.max(0, v || 0); outBadge.textContent = fmtTimeD(tOut) }
  // In/out reset only when the preview switches to a DIFFERENT clip — playhead
  // crossings and re-selects of the same clip keep the user's marks.
  let inOutClipId = null
  vidEl.addEventListener('loadedmetadata', () => {
    // Runs on EVERY source switch: the new clip may have different intrinsic
    // dimensions, so the pins/texts glued to the rendered video box must be
    // re-laid out even when the in/out marks are left alone below.
    updateTextOverlay(playheadTime)
    const id = selClip?.id ?? null
    if (id === inOutClipId) return
    inOutClipId = id
    setIn(0); setOut(vidEl.duration || 0)
  })
  setInBtn.addEventListener('click',  () => setIn(vidEl.currentTime))
  setOutBtn.addEventListener('click', () => setOut(vidEl.currentTime))

  function updateActionState() {
    const on = !!selClip && !ffRunning
    ;[cutBtn, audioBtn, gifBtn, subsBtn, raudioBtn, speedBtn, chromaBtn, framesBtn, compBtn].forEach(b => { b.disabled = !on })
    btnExport.disabled = ffRunning
    btnExport.style.opacity = ffRunning ? '0.55' : '1'
  }
  function setFfBusy(b) { ffRunning = b; updateActionState() }

  function libInfo() {
    if (!root) { window.toast?.(t('vc_no_lib'), 'error'); return null }
    return { root, sep }
  }
  // Common guard: idle + Tauri + a selected clip backed by a real file path.
  function ffGuard() {
    if (ffRunning) return null
    if (!window.__TAURI__) { window.toast?.(t('vc_tauri_only'), 'warn'); return null }
    if (!selClip) { window.toast?.(t('vc_no_video'), 'warn'); return null }
    if (selClip.placeholder) { window.toast?.(t('vr_ph_fill_first'), 'warn'); return null }
    if (!selClip.savedPath) { window.toast?.(t('vc_need_saved'), 'warn'); return null }
    return selClip
  }
  // Marks the tool busy for a whole action INCLUDING its name prompt, so a
  // second action started during the prompt can't slip past ffGuard.
  async function ffAction(fn) {
    setFfBusy(true)
    try { await fn() } finally { setFfBusy(false) }
  }
  // Busy state is owned by ffAction (which wraps the whole user action).
  // `quiet` suppresses the failure toast when the caller has a fallback to try.
  // `-y` for the same reason as ffRaw: ffmpeg_run attaches no stdin, so the
  // overwrite prompt would EOF-abort any export reusing a previous name.
  async function runFF(args, outPath, outName, folder, quiet) {
    window.toast?.(t('vc_running'), 'info')
    try {
      await window.__TAURI__.core.invoke('ffmpeg_run', { args: ['-y', ...args] })
      trackRecentFile(outPath, outName)
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder } }))
      window.toast?.(t('vc_done') + ' : ' + outName, 'success')
      return true
    } catch (e) {
      if (!quiet) window.toast?.(t('vc_fail') + ' : ' + e, 'error')
      return false
    }
  }
  const clipBase = c => (c.label || 'clip').replace(/\.[^.]+$/, '') || 'clip'

  // Mounts an ffmpeg RESULT right after the source clip. The output is its own
  // standalone file, so srcIn is 0 and srcDur is its OWN duration — never the
  // source's (otherwise the montage export would re-trim it).
  function mountResult(outPath, label, srcLane, srcEnd, fallbackDur) {
    const url = 'file://' + outPath.replace(/\\/g, '/')
    const v = document.createElement('video'); v.preload = 'metadata'; v.src = url
    v.addEventListener('loadedmetadata', () => {
      const nc = mountClip({ id: ++clipId, laneIdx: srcLane, startTime: srcEnd, duration: v.duration || fallbackDur, srcDur: v.duration || null, w: v.videoWidth || 0, h: v.videoHeight || 0, savedPath: outPath, label })
      grabThumb(url, thumb => { if (!thumb) return; nc.thumbnail = thumb; const img = document.createElement('img'); img.className = 'vr-thumb'; img.src = thumb; nc.el.prepend(img) })
      selectClip(nc); updateRuler(); updateScrollbar()
    }, { once: true })
  }
  // Native file picker — the Tauri command answers with a plain string, a
  // {path} object, or an array of either, so normalise all three shapes.
  // The Rust command signature is (filter_name, extensions) — camelCase over
  // the bridge. Passing title/filters/multiple makes Tauri reject the call.
  async function pickFile(title, name, exts) {
    try {
      const result = await window.__TAURI__.core.invoke('pick_files_with_filter', { filterName: name, extensions: exts })
      const item = Array.isArray(result) ? result[0] : result
      if (!item) return null
      return (typeof item === 'string' ? item : item.path) || null
    } catch (e) { window.toast?.(t('vc_fail') + ' : ' + e, 'error'); return null }
  }
  // ffmpeg's filtergraph parser needs forward slashes AND an escaped drive
  // colon: C:\a\subs.srt → C\:/a/subs.srt (then wrap it in single quotes).
  const subsFilterPath = p => String(p).replace(/\\/g, '/').replace(/:/g, '\\:')
  // atempo only accepts 0.5..2.0 — chain stages whose product is the requested
  // factor (4 → 'atempo=2.0,atempo=2.0', 0.25 → 'atempo=0.5,atempo=0.5').
  function atempoChain(f) {
    const parts = []; let r = f
    while (r > 2.0001) { parts.push(2); r /= 2 }
    while (r < 0.4999) { parts.push(0.5); r *= 2 }
    parts.push(r)
    const nf = x => { const s = x.toFixed(4).replace(/0+$/, ''); return s.endsWith('.') ? s + '0' : s }
    return parts.map(x => 'atempo=' + nf(x)).join(',')
  }

  // Tiny inline popup anchored under an action button (same shape as the media
  // bus send menu): `build` fills it and calls finish(value); an outside click
  // or Escape resolves null so the caller just bails.
  const POP_ROW = 'display:flex;align-items:center;gap:8px;padding:5px 10px;font-size:11px;color:var(--text-secondary);'
  const POP_INP = 'width:82px;background:var(--surface2,#141414);color:var(--text-primary);border:1px solid var(--win-border-in,#1e1e1e);border-radius:4px;padding:3px 5px;font-size:11px;font-family:inherit;'
  function actPopup(anchor, build) {
    return new Promise(resolve => {
      document.getElementById('vr-act-pop')?.remove()
      const pop = document.createElement('div')
      pop.id = 'vr-act-pop'
      pop.style.cssText = 'position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--win-border);border-radius:10px;padding:4px;min-width:170px;box-shadow:0 10px 28px -10px rgba(0,0,0,.6)'
      let done = false
      const finish = v => {
        if (done) return
        done = true; pop.remove()
        document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey, true)
        resolve(v ?? null)
      }
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); finish(null) } }
      const onDoc = () => finish(null)
      pop.addEventListener('click', e => e.stopPropagation())
      pop.addEventListener('mousedown', e => e.stopPropagation())
      build(pop, finish)
      document.body.appendChild(pop)
      const r = anchor.getBoundingClientRect()
      pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px'
      let top = r.bottom + 5
      if (top + pop.offsetHeight > window.innerHeight - 6) top = Math.max(6, r.top - pop.offsetHeight - 5)
      pop.style.top = top + 'px'
      setTimeout(() => { document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey, true) }, 0)
    })
  }
  function popBtn(label, icon) {
    const b = document.createElement('button'); b.className = 'ctx-item'
    b.innerHTML = icon ? `<i class="fa-solid ${icon}"></i><span></span>` : '<span></span>'
    b.querySelector('span').textContent = label
    return b
  }
  function popRow(labelText) {
    const row = document.createElement('div'); row.style.cssText = POP_ROW
    const lbl = document.createElement('span'); lbl.style.cssText = 'flex:1;'; lbl.textContent = labelText
    row.appendChild(lbl)
    return row
  }

  cutBtn.addEventListener('click', () => {
    const c = ffGuard(); if (!c) return
    if (!(tOut > tIn)) { window.toast?.(t('vc_range_invalid'), 'warn'); return }
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const base = await promptName(clipBase(c) + '_cut', { title: t('vc_cut') }); if (!base) return
      const folder = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      const srcLane = c.laneIdx, srcEnd = c.startTime + c.duration
      const ok = await runFF(['-ss', ffTime(tIn), '-to', ffTime(tOut), '-i', c.savedPath, '-c', 'copy', outPath], outPath, base + '.mp4', folder)
      if (ok) mountResult(outPath, base + '.mp4', srcLane, srcEnd, tOut - tIn)
    })
  })

  audioBtn.addEventListener('click', () => {
    const c = ffGuard(); if (!c) return
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const base = await promptName(clipBase(c), { title: t('vc_extract_audio') }); if (!base) return
      const folder = lib.root + lib.sep + 'Sons'
      const outPath = folder + lib.sep + base + '.mp3'
      await runFF(['-i', c.savedPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outPath], outPath, base + '.mp3', folder)
    })
  })

  gifBtn.addEventListener('click', () => {
    const c = ffGuard(); if (!c) return
    if (!(tOut > tIn)) { window.toast?.(t('vc_range_invalid'), 'warn'); return }
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const base = await promptName(clipBase(c), { title: t('vc_gif') }); if (!base) return
      const folder = lib.root + lib.sep + 'Images'
      const outPath = folder + lib.sep + base + '.gif'
      await runFF(['-ss', ffTime(tIn), '-to', ffTime(tOut), '-i', c.savedPath, '-vf', 'fps=12,scale=480:-1:flags=lanczos', outPath], outPath, base + '.gif', folder)
    })
  })

  // Burn an .srt/.vtt into the picture (hard subs). Audio is stream-copied.
  subsBtn.addEventListener('click', () => {
    const c = ffGuard(); if (!c) return
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const subPath = await pickFile(t('vc_burn_subs'), 'Subtitles', ['srt', 'vtt']); if (!subPath) return
      const base = await promptName(clipBase(c) + '_subs', { title: t('vc_burn_subs') }); if (!base) return
      const folder = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      const srcLane = c.laneIdx, srcEnd = c.startTime + c.duration
      const ok = await runFF(['-i', c.savedPath, '-vf', `subtitles='${subsFilterPath(subPath)}'`, '-c:a', 'copy', outPath], outPath, base + '.mp4', folder)
      if (ok) mountResult(outPath, base + '.mp4', srcLane, srcEnd, c.duration)
    })
  })

  // Swap the soundtrack: keep the video stream as-is, take audio from a file.
  raudioBtn.addEventListener('click', () => {
    const c = ffGuard(); if (!c) return
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const audioPath = await pickFile(t('vc_replace_audio'), 'Audio', ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg']); if (!audioPath) return
      const base = await promptName(clipBase(c) + '_audio', { title: t('vc_replace_audio') }); if (!base) return
      const folder = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      const srcLane = c.laneIdx, srcEnd = c.startTime + c.duration
      const ok = await runFF(['-i', c.savedPath, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-shortest', outPath], outPath, base + '.mp4', folder)
      if (ok) mountResult(outPath, base + '.mp4', srcLane, srcEnd, c.duration)
    })
  })

  // Retime picture AND sound. A source with no audio track makes the filter
  // graph fail — runFF already surfaces that as an error toast.
  speedBtn.addEventListener('click', () => {
    const c = ffGuard(); if (!c) return
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const f = await actPopup(speedBtn, (pop, finish) => {
        ;[0.25, 0.5, 1.5, 2, 4].forEach(v => {
          const b = popBtn(v + '×', 'fa-gauge-high')
          b.addEventListener('click', () => finish(v))
          pop.appendChild(b)
        })
      })
      if (!f) return
      const base = await promptName(clipBase(c) + '_x' + String(f).replace('.', '_'), { title: t('vc_speed') }); if (!base) return
      const folder = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      const srcLane = c.laneIdx, srcEnd = c.startTime + c.duration
      const graph = `[0:v]setpts=${(1 / f).toFixed(4)}*PTS[v];[0:a]${atempoChain(f)}[a]`
      let ok = await runFF(['-i', c.savedPath, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', outPath], outPath, base + '.mp4', folder, true)
      if (!ok) {
        // Silent source: the [0:a] branch has nothing to consume — retime video only.
        ok = await runFF(['-i', c.savedPath, '-filter:v', `setpts=${(1 / f).toFixed(4)}*PTS`, '-an', outPath], outPath, base + '.mp4', folder)
      }
      if (ok) mountResult(outPath, base + '.mp4', srcLane, srcEnd, c.duration / f)
    })
  })

  // Green-screen: key the clip out and lay it over a still background image.
  chromaBtn.addEventListener('click', () => {
    const c = ffGuard(); if (!c) return
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const opt = await actPopup(chromaBtn, (pop, finish) => {
        const colRow = popRow(t('vc_chroma_color'))
        const col = document.createElement('input'); col.type = 'color'; col.value = '#00b140'
        col.style.cssText = 'width:38px;height:22px;border:1px solid var(--win-border-in,#1e1e1e);border-radius:4px;padding:1px;cursor:pointer;background:none;'
        colRow.appendChild(col)
        const simRow = popRow(t('vc_chroma_sim'))
        const simVal = document.createElement('span'); simVal.style.cssText = 'color:var(--text-primary);font-variant-numeric:tabular-nums;'; simVal.textContent = '0.15'
        simRow.appendChild(simVal)
        const sim = document.createElement('input'); sim.type = 'range'; sim.min = '0.01'; sim.max = '0.5'; sim.step = '0.01'; sim.value = '0.15'
        sim.style.cssText = 'width:calc(100% - 20px);margin:0 10px 4px;accent-color:var(--color-active);'
        sim.addEventListener('input', () => { simVal.textContent = parseFloat(sim.value).toFixed(2) })
        const go = popBtn(t('vc_apply'), 'fa-wand-magic-sparkles')
        go.addEventListener('click', () => finish({ hex: col.value, sim: parseFloat(sim.value) }))
        pop.append(colRow, simRow, sim, go)
      })
      if (!opt) return
      const bgPath = await pickFile(t('vc_chroma_bg'), 'Images', ['png', 'jpg', 'jpeg', 'webp']); if (!bgPath) return
      const base = await promptName(clipBase(c) + '_key', { title: t('vc_chroma') }); if (!base) return
      const folder = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      const srcLane = c.laneIdx, srcEnd = c.startTime + c.duration
      // ffmpeg's chromakey wants 0xRRGGBB, the color input gives #rrggbb.
      const hex = '0x' + opt.hex.replace('#', '')
      // `-loop 1` on the still background makes it an endless stream; without it
      // `overlay=shortest=1` would end the output after a single frame. The
      // background is also scaled to the clip's frame size before overlaying.
      // scale2ref takes [toScale][reference]; its DEFAULT w/h (iw/ih = the
      // REFERENCE's dims) scales the background to the video's frame size —
      // main_w/main_h would be the background's own size, i.e. a no-op.
      const graph = `[0:v][1:v]scale2ref[bg][vid];[vid]chromakey=${hex}:${opt.sim}:0.05[ck];[bg][ck]overlay=shortest=1[v]`
      const ok = await runFF(['-loop', '1', '-i', bgPath, '-i', c.savedPath, '-filter_complex', graph, '-map', '[v]', '-map', '1:a?', '-shortest', outPath], outPath, base + '.mp4', folder)
      if (ok) mountResult(outPath, base + '.mp4', srcLane, srcEnd, c.duration)
    })
  })

  // Stills into the Images folder — nothing gets mounted back on the timeline.
  framesBtn.addEventListener('click', () => {
    const c = ffGuard(); if (!c) return
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const pick = await actPopup(framesBtn, (pop, finish) => {
        const one = popBtn(t('vc_frame_current'), 'fa-image')
        one.addEventListener('click', () => finish({ mode: 'one' }))
        const row = popRow(t('vc_frames_every'))
        const num = document.createElement('input'); num.type = 'number'; num.min = '0.1'; num.step = '0.5'; num.value = '1'; num.style.cssText = POP_INP
        row.appendChild(num)
        const rng = popBtn(t('vc_frames_range'), 'fa-images')
        rng.addEventListener('click', () => finish({ mode: 'range', n: Math.max(0.1, parseFloat(num.value) || 1) }))
        pop.append(one, row, rng)
      })
      if (!pick) return
      if (pick.mode === 'range' && !(tOut > tIn)) { window.toast?.(t('vc_range_invalid'), 'warn'); return }
      const base = await promptName(clipBase(c) + '_frame', { title: t('vc_frames') }); if (!base) return
      const folder = lib.root + lib.sep + 'Images'
      const single = pick.mode === 'one'
      const outName = single ? base + '.png' : base + '_001.png'
      const outPath = folder + lib.sep + outName
      const args = single
        ? ['-ss', ffTime(vidEl.currentTime), '-i', c.savedPath, '-frames:v', '1', folder + lib.sep + base + '.png']
        : ['-ss', ffTime(tIn), '-to', ffTime(tOut), '-i', c.savedPath, '-vf', 'fps=1/' + pick.n, folder + lib.sep + base + '_%03d.png']
      await runFF(args, outPath, outName, folder)
    })
  })

  // Re-encode smaller: CRF preset + an optional downscale (height auto, even).
  compBtn.addEventListener('click', () => {
    const c = ffGuard(); if (!c) return
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const opt = await actPopup(compBtn, (pop, finish) => {
        const row = popRow(t('vc_max_width'))
        const sel = document.createElement('select'); sel.style.cssText = POP_INP
        ;[['0', t('vc_w_original')], ['1920', '1920'], ['1280', '1280'], ['854', '854']].forEach(([v, txt]) => {
          const o = document.createElement('option'); o.value = v; o.textContent = txt; sel.appendChild(o)
        })
        row.appendChild(sel)
        pop.appendChild(row)
        ;[[20, 'vc_q_high'], [26, 'vc_q_medium'], [32, 'vc_q_small']].forEach(([crf, key]) => {
          const b = popBtn(t(key), 'fa-file-zipper')
          b.addEventListener('click', () => finish({ crf, w: parseInt(sel.value, 10) || 0 }))
          pop.appendChild(b)
        })
      })
      if (!opt) return
      const base = await promptName(clipBase(c) + '_min', { title: t('vc_compress') }); if (!base) return
      const folder = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      const srcLane = c.laneIdx, srcEnd = c.startTime + c.duration
      const scaleArgs = opt.w ? ['-vf', `scale='min(${opt.w},iw)':-2`] : []
      const ok = await runFF(['-i', c.savedPath, '-c:v', 'libx264', '-crf', String(opt.crf), '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k', ...scaleArgs, outPath], outPath, base + '.mp4', folder)
      if (ok) mountResult(outPath, base + '.mp4', srcLane, srcEnd, c.duration)
    })
  })

  // ── Export montage ────────────────────────────────────────────────────────
  // No transitions → lossless concat demuxer (stream copy, same as always).
  // Any transition → xfade/acrossfade filter_complex chain (re-encode) at an
  // adaptive target: 1920x1080 when any source exceeds 720p, else 1280x720.
  // A music track adds a second ffmpeg pass over the finished montage.

  // Bare ffmpeg run without runFF's success side-effects — used for the
  // intermediate passes (text burn / music). Those write FIXED hidden names
  // (.montage-pre.mp4 / .montage-txt.mp4), so `-y` is required: ffmpeg_run
  // attaches no stdin and the overwrite prompt would fail every re-export.
  async function ffRaw(args, quiet) {
    try { await window.__TAURI__.core.invoke('ffmpeg_run', { args: ['-y', ...args] }); return true }
    catch (e) { if (!quiet) window.toast?.(t('vc_fail') + ' : ' + e, 'error'); return false }
  }
  // A stored transition only counts while its junction is still LIVE: the next
  // clip in export order sits on the same lane with edges touching (the same
  // ≤80ms rule renderJunctionBadges uses). Dragging a clip away leaves a stale
  // clip.transition behind with no badge to remove it — ignoring it here keeps
  // the lossless `-c copy` concat and stops invisible crossfades in the export.
  const transLive = (left, right) => !!(left.transition && left.transition.type && right && right.laneIdx === left.laneIdx && Math.abs(left.startTime + left.duration - right.startTime) <= 0.08)
  // xfade OFFSET MATH — `offset` is when the transition STARTS on the stream
  // chained so far: offset(k) = (chained length so far) - (transition dur k);
  // each xfade then extends the chain to (chained + next clip - transition).
  // Worked 3-clip example: durations 4s, 3s, 2s; transitions 0.5s then 1s:
  //   step 1: offset = 4   - 0.5 = 3.5   chained = 4   + 3 - 0.5 = 6.5
  //   step 2: offset = 6.5 - 1   = 5.5   chained = 6.5 + 2 - 1   = 7.5
  //   total 7.5 = 4+3+2 - (0.5+1): every transition overlaps both neighbours,
  //   and clip 2 fades in over [3.5,4] then out over [5.5,6.5]. Checks out.
  function buildXfade(ordered, withAudio) {
    // Adaptive target: 1080p as soon as ANY source exceeds 720p (unknown
    // dims — old projects, failed probes — count as 720p), else the classic
    // 1280x720 so pure-720p montages come out byte-identical to before.
    // fps stays 30 either way.
    const hd = ordered.some(c => (c.w || 0) > 1280 || (c.h || 0) > 720)
    const TW = hd ? 1920 : 1280, TH = hd ? 1080 : 720
    const v = [], a = []
    ordered.forEach((c, i) => {
      // Respect each fragment's srcIn/duration (split/carve slices).
      const si = ffTime(c.srcIn || 0), d = ffTime(c.duration)
      v.push(`[${i}:v]trim=start=${si}:duration=${d},setpts=PTS-STARTPTS,scale=${TW}:${TH}:force_original_aspect_ratio=decrease,pad=${TW}:${TH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,settb=AVTB,format=yuv420p[v${i}]`)
      if (withAudio) a.push(`[${i}:a]atrim=start=${si}:duration=${d},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`)
    })
    let cum = ordered[0].duration, vOut = 'v0', aOut = 'a0'
    const offsets = [0]   // export-time start of each clip on the chained stream
    ordered.slice(1).forEach((c, k) => {
      const tr = transLive(ordered[k], c) ? ordered[k].transition : null
      // A junction with no transition still needs an xfade node to keep the
      // chain shape — a 10ms fade reads as a plain cut.
      let dur = tr && tr.type ? tr.dur : 0.01
      dur = Math.max(0.01, Math.min(dur, ordered[k].duration - 0.05, c.duration - 0.05, cum - 0.05))
      const type = tr && tr.type ? tr.type : 'fade'
      const off = cum - dur
      offsets.push(off)
      v.push(`[${vOut}][v${k + 1}]xfade=transition=${type}:duration=${ffTime(dur)}:offset=${ffTime(off)}[vx${k + 1}]`)
      vOut = `vx${k + 1}`
      if (withAudio) { a.push(`[${aOut}][a${k + 1}]acrossfade=d=${ffTime(dur)}[ax${k + 1}]`); aOut = `ax${k + 1}` }
      cum += c.duration - dur
    })
    return { graph: v.concat(a).join(';'), vOut, aOut, total: cum, offsets, targetH: TH }
  }
  // ── Text burn-in (drawtext) ───────────────────────────────────────────────
  // escapeDrawtext — the text value crosses TWO parsers, so these characters
  // need handling: backslash, single quote, colon, comma, semicolon, percent.
  // Backslash and percent are escaped first for drawtext's own expansion
  // pass; the whole value is then single-quoted for the filtergraph
  // tokenizer, which turns colon, comma and semicolon into literals; a quote
  // itself can't live inside quotes, so it becomes '\'' (close, escaped
  // quote, reopen).
  const escapeDrawtext = s => "'" + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/'/g, "'\\''") + "'"
  // Timeline→export time: gaps collapse (concat) and transitions overlap
  // (xfade), so a text's [start, end] is remapped through each clip's export
  // offset before landing in enable='between(t,...)'.
  function exportTimeMap(ordered, offsets, total) {
    return tt => {
      for (let i = 0; i < ordered.length; i++) {
        const c = ordered[i]
        if (tt <= c.startTime) return offsets[i]
        if (tt < c.startTime + c.duration) return Math.min(total, offsets[i] + (tt - c.startTime))
      }
      return total
    }
  }
  // One drawtext per overlay, comma-chained. TXT_SIZES are px at the 720p
  // reference; `refH` is the height of the frame actually being burned (the
  // xfade target, or the first clip's own height on the concat pass), so
  // fontsize and the band's boxborderw scale by refH/720 and the text keeps
  // the same visual fraction on a 1080p render as on a 720p one — matching
  // the live preview, which scales the same reference by its box height.
  // The x/y margins are w/h expressions and scale by themselves.
  function buildDrawtextChain(map, refH) {
    const k = (refH || 720) / 720
    return texts.map(tx => {
      let st = map(tx.start), en = map(tx.start + tx.dur)
      if (en <= st) en = st + 0.05   // fully collapsed into a cut: keep the graph valid
      const yv = tx.pos?.[0] || 'b', xh = tx.pos?.[1] || 'c'
      const x = xh === 'l' ? 'w*0.05' : xh === 'r' ? 'w-text_w-w*0.05' : '(w-text_w)/2'
      const y = yv === 't' ? 'h*0.05' : yv === 'b' ? 'h-text_h-h*0.05' : '(h-text_h)/2'
      const col = '0x' + String(tx.color || '').replace(/[^0-9a-fA-F]/g, '').padEnd(6, 'f').slice(0, 6)
      let f = `drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text=${escapeDrawtext(tx.text)}` +
        `:fontsize=${Math.round((TXT_SIZES[tx.size] || 36) * k)}:fontcolor=${col}:x=${x}:y=${y}` +
        `:enable='between(t,${ffTime(st)},${ffTime(en)})'`
      if (tx.band) f += `:box=1:boxcolor=black@0.5:boxborderw=${Math.round(14 * k)}`
      return f
    }).join(',')
  }
  // ── Marker burn-in ────────────────────────────────────────────────────────
  // Markers land on the SAME final passes as the texts, through the same
  // exportTimeMap remap. Chain order: blur regions → spot vignettes → zoom →
  // drawtext, so blur/spot coordinates live in original frame space (and get
  // magnified WITH the picture), while titles stay sharp above everything.
  //
  // ZOOM: the animated crop-size approach (crop=w='iw/Z(t)') was tested on
  // ffmpeg 8 and does NOT animate — crop's w/h expressions are evaluated once
  // at init (frames verified unzoomed mid-envelope). zoompan drives the
  // envelope instead: its z/x/y expressions re-evaluate per frame via `time`.
  // zoompan REWRITES output PTS at its own fps parameter, so its input must
  // already be 30 fps CFR (the xfade graph is; the concat fx pass prepends
  // fps=30 — verified: a 60 fps input through zoompan d=1:fps=30 without the
  // normalization doubles the duration).
  //
  // Worked zoom example — marker at export t0=5s, factor 1.8, aller 0.4,
  // maintien 1, retour 0.4 → t1=5.4, t2=6.4, t3=6.8; center x=60% y=40% on
  // 1280x720:
  //   z(time) = if(between(time,5,6.8),
  //               if(lt(time,5.4), 1+0.8*(time-5)/0.4,      → z(5.2)=1.4
  //               if(lt(time,6.4), 1.8,                     → z(5.9)=1.8
  //                 1.8-0.8*(time-6.4)/0.4)), 1)            → z(6.6)=1.4
  //   at 5.9s the source window is iw/1.8 × ih/1.8 = 711×400 px at
  //   x = clip(1280*0.6 - 711/2, 0, 1280-711) = clip(412.4, 0, 569) = 412,
  //   y = clip(720*0.4  - 400/2, 0, 720-400)  = clip(88,    0, 320) = 88,
  //   scaled back to 1280x720 → 1.8× in on the point, clamped in-frame; at
  //   z=1 the window is the whole frame and clip() collapses x/y to 0.
  //   (Verified frame-by-frame against testsrc2 in development.)
  //
  // Overlapping ZOOM markers never compound: the nested if() chain tests
  // markers in start order, so the earliest-starting one wins at any instant.
  // Envelope segment bounds remap INDIVIDUALLY through exportTimeMap, so a
  // marker spanning a collapsed gap keeps a valid export-side shape (a
  // segment collapsed under 20 ms becomes a plain jump).
  // Marker coords are fractions of the PICTURE the pin was placed on (the
  // <video>'s own box — .vr-preview video is max-width/height only, so no
  // letterbox inside it). The concat path burns that very picture, but
  // buildXfade scales+pads every source into the 16:9 target, so there a pin
  // must be remapped into padded-frame space or it lands in the black bars
  // whenever the source aspect differs (1080x1920 → 607x1080 padded at x=656:
  // 25% of the picture is 42% of the frame). Per marker, the clip under its
  // start decides the letterbox — one marker rides one clip.
  const MK_FULL = { fw: 1, fh: 1, ox: 0, oy: 0 }
  function padPlacement(ordered, TW, TH) {
    return m => {
      const c = ordered.find(o => m.start >= o.startTime && m.start < o.startTime + o.duration) || ordered[0]
      const w = (c && c.w) || 0, h = (c && c.h) || 0
      if (!w || !h) return MK_FULL   // unknown dims → assume it already fills
      const s = Math.min(TW / w, TH / h)
      const fw = Math.min(1, w * s / TW), fh = Math.min(1, h * s / TH)
      return { fw, fh, ox: (1 - fw) / 2, oy: (1 - fh) / 2 }
    }
  }
  function buildMarkerGraph(inLabel, map, refW, refH, spotIdx, place) {
    const k = (refH || 720) / 720
    const at = place || (() => MK_FULL)
    const nodes = []
    let cur = inLabel, n = 0
    const sorted = [...markers].sort((a, b) => a.start - b.start)
    const mkRange = m => { let st = map(m.start), en = map(m.start + m.dur); if (en <= st) en = st + 0.05; return [st, en] }
    for (const m of sorted) {
      const pl = at(m)
      const cx = (pl.ox + m.x / 100 * pl.fw).toFixed(4), cy = (pl.oy + m.y / 100 * pl.fh).toFixed(4)
      if (m.fn === 'blur') {
        // Square region blur (sober, standard for faces/plates): crop the
        // zone, boxblur it, overlay it back. Side = 2×rayon% of frame height
        // (even, clamped in-frame); crop and overlay use the SAME clamp
        // expression so the patch never shifts.
        const [st, en] = mkRange(m)
        // radius% is of the PICTURE height, so it shrinks with the letterbox.
        const side = `min(floor(ih*${(2 * (m.params.radius || 15) / 100 * pl.fh).toFixed(4)}/2)*2,floor(iw/2)*2)`
        const lr = Math.max(2, Math.round(6 * (m.params.intensity || 2) * k))
        n++
        nodes.push(`[${cur}]split[mba${n}][mbb${n}]`)
        nodes.push(`[mbb${n}]crop=w='${side}':h='${side}':x='min(max(iw*${cx}-out_w/2,0),iw-out_w)':y='min(max(ih*${cy}-out_h/2,0),ih-out_h)',boxblur=${lr}:2[mbf${n}]`)
        nodes.push(`[mba${n}][mbf${n}]overlay=x='min(max(main_w*${cx}-overlay_w/2,0),main_w-overlay_w)':y='min(max(main_h*${cy}-overlay_h/2,0),main_h-overlay_h)':enable='between(t,${ffTime(st)},${ffTime(en)})'[mbo${n}]`)
        cur = `mbo${n}`
      } else if (m.fn === 'spot') {
        const [st, en] = mkRange(m)
        const idx = spotIdx.get(m.id)
        if (idx == null) continue
        n++
        nodes.push(`[${cur}][${idx}:v]overlay=0:0:enable='between(t,${ffTime(st)},${ffTime(en)})'[msp${n}]`)
        cur = `msp${n}`
      }
    }
    const zooms = sorted.filter(m => m.fn === 'zoom').map(m => {
      const p = m.params, aIn = +p.in || 0, hold = +p.hold || 0
      const t0 = map(m.start), t1 = map(m.start + aIn), t2 = map(m.start + aIn + hold), t3 = map(m.start + m.dur)
      return { m, t0, t1: Math.max(t1, t0), t2: Math.max(t2, t1), t3: Math.max(t3, t2) }
    }).filter(z => z.t3 - z.t0 > 0.08)   // fully collapsed into a cut → no flash
    // zoompan's `s` is the HARD output resolution, so a wrong refW/refH would
    // silently re-encode the montage at that size. Unknown dims → skip the
    // zoom node rather than force 1280x720 onto a 1080p source.
    if (zooms.length && refW && refH) {
      let zExpr = '1'
      let xExpr = 'clip(iw*0.5-(iw/zoom)/2,0,iw-iw/zoom)'
      let yExpr = 'clip(ih*0.5-(ih/zoom)/2,0,ih-ih/zoom)'
      for (let i = zooms.length - 1; i >= 0; i--) {   // built inside-out: marker 0 ends up outermost
        const z = zooms[i], f = Math.max(1.01, +z.m.params.factor || 1.8).toFixed(3)
        const up = z.t1 - z.t0 > 0.02 ? `1+(${f}-1)*(time-${ffTime(z.t0)})/${(z.t1 - z.t0).toFixed(3)}` : f
        const down = (!z.m.params.cut && z.t3 - z.t2 > 0.02) ? `${f}-(${f}-1)*(time-${ffTime(z.t2)})/${(z.t3 - z.t2).toFixed(3)}` : '1'
        const inner = `if(lt(time,${ffTime(z.t1)}),${up},if(lt(time,${ffTime(z.t2)}),${f},${down}))`
        const cond = `between(time,${ffTime(z.t0)},${ffTime(z.t3)})`
        zExpr = `if(${cond},${inner},${zExpr})`
        const zp = at(z.m)
        const cx = (zp.ox + z.m.x / 100 * zp.fw).toFixed(4), cy = (zp.oy + z.m.y / 100 * zp.fh).toFixed(4)
        xExpr = `if(${cond},clip(iw*${cx}-(iw/zoom)/2,0,iw-iw/zoom),${xExpr})`
        yExpr = `if(${cond},clip(ih*${cy}-(ih/zoom)/2,0,ih-ih/zoom),${yExpr})`
      }
      n++
      // s must be even for the yuv420p encode; odd source dims round down.
      nodes.push(`[${cur}]zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${Math.max(2, (refW || 1280) & ~1)}x${Math.max(2, (refH || 720) & ~1)}:fps=30[mzp${n}]`)
      cur = `mzp${n}`
    }
    return { graph: nodes.join(';'), out: cur }
  }
  // Spot vignettes are painted client-side at the export resolution (canvas →
  // PNG with alpha, same radial formula as the live preview), saved as hidden
  // intermediates next to .concat-list.txt, then overlaid full-frame with
  // enable=between(...). One PNG per spot marker; the caller assigns each
  // file's ffmpeg input index.
  // Real pixel size of an on-disk video, through the same hidden-<video>
  // metadata path the timeline uses. Resolves {w:0,h:0} on error/timeout so a
  // caller can skip resolution-dependent nodes instead of guessing a size.
  function probeVideoSize(path) {
    return new Promise(resolve => {
      const v = document.createElement('video'); v.preload = 'metadata'
      let done = false
      const fin = (w, h) => { if (done) return; done = true; clearTimeout(to); v.removeAttribute('src'); resolve({ w: w || 0, h: h || 0 }) }
      const to = setTimeout(() => fin(0, 0), 5000)
      v.addEventListener('loadedmetadata', () => fin(v.videoWidth, v.videoHeight), { once: true })
      v.addEventListener('error', () => fin(0, 0), { once: true })
      v.src = 'file://' + String(path).replace(/\\/g, '/')
    })
  }
  async function writeSpotPngs(W, H, place) {
    const spots = markers.filter(m => m.fn === 'spot')
    const files = []
    const at = place || (() => MK_FULL)
    for (const m of spots) {
      const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H
      const ctx = cnv.getContext('2d')
      // Same picture→padded-frame remap as the graph: the mask covers the WHOLE
      // target frame, but the pin and the radius are fractions of the picture.
      const pl = at(m)
      const cx = (pl.ox + m.x / 100 * pl.fw) * W, cy = (pl.oy + m.y / 100 * pl.fh) * H
      const r0 = Math.max(1, (m.params.radius || 25) / 100 * H * pl.fh)
      const a = Math.max(0, Math.min(0.9, (m.params.dark || 60) / 100))
      const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r0 + 0.18 * H * pl.fh)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,' + a + ')')   // canvas extends the last stop past the outer circle
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      const b64 = cnv.toDataURL('image/png').split(',')[1]
      const p = root + sep + '.montage-spot-' + (files.length + 1) + '.png'
      await window.__TAURI__.core.invoke('save_binary_file', { path: p, base64: b64 })
      files.push(p)
    }
    return { spots, files }
  }
  // Second pass: lay the music track under the finished montage. Quiet-try
  // mixing with the montage's own audio first; a montage with NO audio stream
  // makes [0:a] fail — retry with the music alone under the picture.
  // amix normalizes by default (each input scaled by 1/n, swelling back when
  // one ends) — normalize=0 keeps the montage audio at full level; the music
  // is already attenuated by its own volume filter.
  async function musicPass(srcPath, outPath, totalDur, outName, folder) {
    const ms = Math.max(0, Math.round((music.start || 0) * 1000))
    let chain = `adelay=${ms}|${ms},volume=${(music.volume ?? 1).toFixed(2)}`
    if (music.fadeOut) {
      const end = Math.min(totalDur, (music.start || 0) + (music.duration || totalDur))
      chain += `,afade=t=out:st=${ffTime(Math.max(0, end - 2))}:d=2`
    }
    const inputs = ['-i', srcPath, '-i', music.path]
    const enc = ['-map', '0:v', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k']
    let ok = await runFF([...inputs, '-filter_complex', `[1:a]${chain}[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`, ...enc, '-map', '[a]', outPath], outPath, outName, folder, true)
    if (!ok) ok = await runFF([...inputs, '-filter_complex', `[1:a]${chain},atrim=0:${ffTime(totalDur)}[a]`, ...enc, '-map', '[a]', '-shortest', outPath], outPath, outName, folder)
    return ok
  }
  btnExport.addEventListener('click', () => {
    if (ffRunning) return
    if (!window.__TAURI__) { window.toast?.(t('vc_tauri_only'), 'warn'); return }
    // Template placeholders hold no media — they are skipped, with a nudge.
    if (clips.some(c => c.placeholder)) window.toast?.(t('vr_ph_fill_first'), 'warn')
    const real = clips.filter(c => !c.placeholder)
    if (!real.length) { window.toast?.(t('vc_no_video'), 'warn'); return }
    const ordered = [...real].sort((a, b) => a.startTime - b.startTime)
    if (ordered.some(c => !c.savedPath)) { window.toast?.(t('vr_need_all_saved'), 'warn'); return }
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const base = await promptName(nameInp.value.trim() || t('vr_default_name'), { title: t('vr_export_montage') }); if (!base) return
      const folder = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4'
      const outName = base + '.mp4'
      const hasTrans = ordered.slice(0, -1).some((c, i) => transLive(c, ordered[i + 1]))
      const withMusic = !!(music && music.path)
      const withTexts = texts.length > 0
      const withMarkers = markers.length > 0
      // Stage plan: montage → [fx burn (texts + markers) on the concat path —
      // the xfade graph burns both inline] → [music]. Only the FINAL stage
      // goes through runFF so toasts/recents track the finished file; earlier
      // stages land in hidden intermediates (ffmpeg can't overwrite its own
      // input). With no texts, no markers and no music this is exactly the
      // stage-1 behavior — pure `-c copy` concat included.
      const needFxPass = (withTexts || withMarkers) && !hasTrans
      const pre1 = lib.root + lib.sep + '.montage-pre.mp4'
      const pre2 = lib.root + lib.sep + '.montage-txt.mp4'
      const s1Final = !needFxPass && !withMusic
      const target = s1Final ? outPath : pre1
      const run = s1Final ? (args, quiet) => runFF(args, outPath, outName, folder, quiet) : (args, quiet) => ffRaw(args, quiet)
      if (!s1Final) window.toast?.(t('vc_running'), 'info')
      let ok, totalDur
      if (!hasTrans) {
        const escapePath = p => String(p).replace(/\\/g, '/').replace(/'/g, "'\\''")
        const listPath = lib.root + lib.sep + '.concat-list.txt'
        // Trimmed fragments (split/carve) carry srcIn/duration into the concat
        // demuxer via inpoint/outpoint so the export matches the timeline
        // instead of re-emitting each source file in full.
        const content = ordered.map(c => {
          const si = c.srcIn || 0
          const trimmed = si > 0 || (c.srcDur != null && c.duration < c.srcDur - 0.05)
          const lines = [`file '${escapePath(c.savedPath)}'`]
          if (trimmed) { lines.push(`inpoint ${ffTime(si)}`); lines.push(`outpoint ${ffTime(si + c.duration)}`) }
          return lines.join('\n')
        }).join('\n')
        try { await window.__TAURI__.core.invoke('save_text_file', { path: listPath, content }) }
        catch (e) { window.toast?.(t('vc_fail') + ' : ' + e, 'error'); return }
        totalDur = ordered.reduce((s, c) => s + c.duration, 0)
        ok = await run(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', target], false)
      } else {
        const enc = ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart']
        const xf = buildXfade(ordered, true)
        totalDur = xf.total
        // Spot vignettes are extra picture inputs appended after the clips —
        // painted at the xfade target size so overlay=0:0 lines up exactly.
        const spotIdx = new Map()
        let spotFiles = []
        const xfW = xf.targetH === 1080 ? 1920 : 1280
        const xfPlace = padPlacement(ordered, xfW, xf.targetH)
        if (withMarkers && markers.some(m => m.fn === 'spot')) {
          try {
            const sp = await writeSpotPngs(xfW, xf.targetH, xfPlace)
            spotFiles = sp.files
            sp.spots.forEach((m, i) => spotIdx.set(m.id, ordered.length + i))
          } catch (e) { window.toast?.(t('vc_fail') + ' : ' + e, 'error'); return }
        }
        const inputs = [...ordered.flatMap(c => ['-i', c.savedPath]), ...spotFiles.flatMap(p => ['-i', p])]
        // Markers chain BEFORE drawtext — titles stay sharp above zoom/blur.
        // The stream leaving the xfade chain is already 30 fps CFR, which is
        // exactly what the zoompan node inside buildMarkerGraph requires.
        const withFx = (g, vv, offsets, total) => {
          if (withMarkers) {
            const mg = buildMarkerGraph(vv, exportTimeMap(ordered, offsets, total), xfW, xf.targetH, spotIdx, xfPlace)
            if (mg.graph) { g += ';' + mg.graph; vv = mg.out }
          }
          if (withTexts) { g += `;[${vv}]${buildDrawtextChain(exportTimeMap(ordered, offsets, total), xf.targetH)}[vtxt]`; vv = 'vtxt' }
          return [g, vv]
        }
        let [graph, vOut] = withFx(xf.graph, xf.vOut, xf.offsets, xf.total)
        ok = await run([...inputs, '-filter_complex', graph, '-map', `[${vOut}]`, '-map', `[${xf.aOut}]`, '-c:a', 'aac', '-b:a', '192k', ...enc, target], true)
        if (!ok) {
          // A clip without an audio stream breaks the acrossfade chain — say
          // so, then redo the whole export video-only.
          window.toast?.(t('vr_tr_no_audio'), 'info')
          const xv = buildXfade(ordered, false)
          const [g2, v2] = withFx(xv.graph, xv.vOut, xv.offsets, xv.total)
          ok = await run([...inputs, '-filter_complex', g2, '-map', `[${v2}]`, '-an', ...enc, target], false)
        }
      }
      if (ok && needFxPass) {
        // Burn texts + markers over the concat result in one re-encode pass —
        // the concat itself stays a lossless stream copy at the SOURCE
        // resolution, so the px reference must be that stream's real size, not
        // a guess (see the probe below; mixed-resolution concats are already
        // best-effort in the demuxer anyway).
        const offs = []; let acc = 0
        for (const c of ordered) { offs.push(acc); acc += c.duration }
        const map = exportTimeMap(ordered, offs, acc)
        // zoompan's s= and the spot mask are HARD pixel geometry over the
        // concat intermediate, so a guess is no longer merely cosmetic (it was,
        // back when refW/refH only scaled drawtext): ordered[0].w/h is 0 for
        // pre-adaptive .icevid projects and for a failed metadata probe, which
        // would re-encode a 1080p montage down to 1280x720 and overlay a
        // quadrant-sized vignette. Probe pre1 itself, fall back to the first
        // clip's dims, and leave 0 (→ node skipped) rather than invent a size.
        const probed = await probeVideoSize(pre1)
        const refW = probed.w || ordered[0].w || 0, refH = probed.h || ordered[0].h || 0
        const enc = ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', '-c:a', 'copy']
        const fxTarget = withMusic ? pre2 : outPath
        const fxRun = args => withMusic ? ffRaw(args) : runFF(args, outPath, outName, folder)
        if (withMarkers) {
          // Markers need extra overlay inputs / zoompan → full filter_complex.
          const spotIdx = new Map()
          let spotFiles = []
          if (markers.some(m => m.fn === 'spot') && refW && refH) {
            try {
              const sp = await writeSpotPngs(refW, refH)
              spotFiles = sp.files
              sp.spots.forEach((m, i) => spotIdx.set(m.id, 1 + i))   // input 0 = pre1
            } catch (e) { window.toast?.(t('vc_fail') + ' : ' + e, 'error'); return }
          }
          // fps=30 first when a zoom marker exists: zoompan re-times its
          // output at ITS fps parameter, so normalizing the input keeps
          // duration and audio sync for any source frame rate.
          const segs = []
          let v = '0:v'
          if (markers.some(m => m.fn === 'zoom')) { segs.push('[0:v]fps=30[mfps]'); v = 'mfps' }
          const mg = buildMarkerGraph(v, map, refW, refH, spotIdx)
          if (mg.graph) { segs.push(mg.graph); v = mg.out }
          if (withTexts) { segs.push(`[${v}]${buildDrawtextChain(map, refH)}[vtxt]`); v = 'vtxt' }
          ok = await fxRun(['-i', pre1, ...spotFiles.flatMap(p => ['-i', p]), '-filter_complex', segs.join(';'), '-map', `[${v}]`, '-map', '0:a?', ...enc, fxTarget])
        } else {
          ok = await fxRun(['-i', pre1, '-vf', buildDrawtextChain(map, refH), ...enc, fxTarget])
        }
      }
      if (ok && withMusic) await musicPass(needFxPass ? pre2 : pre1, outPath, totalDur, outName, folder)
    })
  })

  // ── Drop video files ───────────────────────────────────────────────────────
  lanesEl.addEventListener('iceample-drop', e => {
    const { file, clientX, clientY } = e.detail; if (!file) return
    const ext = file.name.toLowerCase()
    if (/\.icetpl$/.test(ext)) { loadTemplateFile(file.path); return }
    if (!/\.(mp4|mov|webm|mkv|avi|m4v|3gp|ogv)$/.test(ext)) return
    const sr = scrollWrap.getBoundingClientRect()
    const li = laneIdxFromY(clientY), time = Math.max(0, (clientX - sr.left + scrollWrap.scrollLeft) / ZOOM)
    // A drop ON a placeholder fills that slot (keeping its start/duration);
    // coordinate-less forwarded drops fill the first empty slot instead of
    // appending at the end.
    let ph = clips.find(c => c.placeholder && c.laneIdx === li && time >= c.startTime && time < c.startTime + c.duration)
    if (!ph && e.detail.vrEnd) ph = clips.filter(c => c.placeholder).sort((a, b) => a.startTime - b.startTime)[0]
    if (ph) { fillPlaceholder(ph, file.path, file.name); return }
    const url = 'file://' + String(file.path).replace(/\\/g, '/')
    const v = document.createElement('video'); v.preload = 'metadata'; v.src = url
    v.addEventListener('loadedmetadata', () => {
      const c = mountClip({ id: ++clipId, laneIdx: li, startTime: time, duration: v.duration || 10, srcDur: v.duration || null, w: v.videoWidth || 0, h: v.videoHeight || 0, savedPath: file.path, label: file.name })
      grabThumb(url, thumb => { if (!thumb) return; c.thumbnail = thumb; const img = document.createElement('img'); img.className = 'vr-thumb'; img.src = thumb; c.el.prepend(img) })
      selectClip(c); updateRuler(); updateScrollbar()
    }, { once: true })
  })
  // Drops anywhere else in the window (preview, ruler, action bar, or the
  // coordinate-less dispatch from main.js) land on lane 0 AFTER the last clip.
  function forwardDropToEnd(detail) {
    const endTime = clips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0)
    const sr = scrollWrap.getBoundingClientRect()
    lanesEl.dispatchEvent(new CustomEvent('iceample-drop', {
      detail: { ...detail, clientX: sr.left - scrollWrap.scrollLeft + endTime * ZOOM, clientY: lanesEl.getBoundingClientRect().top + 10, vrEnd: true },
      bubbles: false,
    }))
  }
  previewEl.addEventListener('iceample-drop', e => forwardDropToEnd(e.detail))
  body.addEventListener('iceample-drop', e => {
    if (lanesEl.contains(e.target) || e.target === lanesEl || previewEl.contains(e.target) || e.target === previewEl) return
    forwardDropToEnd(e.detail)
  })

  // ── Playback ──────────────────────────────────────────────────────────────
  // Find the clip CONTAINING a given timeline time (first lane wins). No
  // "upcoming clip" fallback: in a gap the preview just pauses instead of
  // pre-playing (and silently re-targeting the ffmpeg bar to) the next clip.
  function clipAt(time) { return clips.find(c => c.startTime <= time && time < c.startTime + c.duration) || null }
  let vidClip = null
  function syncVideoToTime(time) {
    const c = clipAt(time)
    if (!c) { vidClip = null; vidEl.pause(); return }   // gap: keep selection, pause preview
    if (c !== vidClip) {
      vidClip = c; selectClip(c)   // selectClip assigns vidEl.src once
      vidEl.currentTime = (c.srcIn || 0) + Math.max(0, time - c.startTime)
      if (isPlaying) vidEl.play().catch(() => {})
    } else {
      const expected = (c.srcIn || 0) + (time - c.startTime)
      if (Math.abs(vidEl.currentTime - expected) > 0.3) vidEl.currentTime = expected
      if (isPlaying && vidEl.paused) vidEl.play().catch(() => {})
    }
  }
  function doPlay() {
    if (loopOn && loopStart != null && loopEnd != null && (playheadTime < loopStart || playheadTime >= loopEnd)) { playheadTime = loopStart; playheadEl.style.left = (playheadTime * ZOOM) + 'px' }
    isPlaying = true; btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>'
    playOffset = playheadTime; playStart = performance.now() / 1000
    syncVideoToTime(playheadTime)
    function tick() {
      if (!isPlaying) return
      playheadTime = playOffset + (performance.now() / 1000 - playStart)
      if (loopOn && loopEnd != null && loopStart != null && playheadTime >= loopEnd) { playheadTime = loopStart; playOffset = loopStart; playStart = performance.now() / 1000; syncVideoToTime(playheadTime) }
      const px = playheadTime * ZOOM; playheadEl.style.left = px + 'px'; timeEl.textContent = fmtTime(playheadTime)
      const visRight = scrollWrap.scrollLeft + scrollWrap.clientWidth
      if (px > visRight - 80) scrollWrap.scrollLeft = px - scrollWrap.clientWidth / 2
      updateScrollbar(); syncVideoToTime(playheadTime); updateTextOverlay(playheadTime)
      playRafId = requestAnimationFrame(tick)
    }
    playRafId = requestAnimationFrame(tick)
  }
  function doPause() {
    if (!isPlaying) return; isPlaying = false; cancelAnimationFrame(playRafId)
    playheadTime = playOffset + (performance.now() / 1000 - playStart)
    playheadEl.style.left = (playheadTime * ZOOM) + 'px'; timeEl.textContent = fmtTime(playheadTime)
    vidEl.pause(); btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'; updateScrollbar()
  }
  function doStop() {
    isPlaying = false; cancelAnimationFrame(playRafId)
    playheadTime = 0; playheadEl.style.left = '0px'; timeEl.textContent = '0:00'
    vidEl.pause(); vidEl.currentTime = 0; btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'; updateScrollbar(); updateTextOverlay(0)
  }
  btnPlay.addEventListener('click', () => { isPlaying ? doPause() : doPlay() })
  btnStop.addEventListener('click', () => { doStop() })
  btnHome.addEventListener('click', () => goToStart())
  body.querySelector('#vr-split').addEventListener('click', () => splitAtPlayhead())
  function onTransport(e) {
    const a = e.detail.action
    if (a === 'play') { if (e.detail.position != null) { playheadTime = e.detail.position; playheadEl.style.left = (playheadTime * ZOOM) + 'px' }; if (!isPlaying) doPlay() }
    else if (a === 'pause') doPause(); else doStop()
  }
  window.addEventListener('iceample-transport', onTransport)

  // ── Helpers ────────────────────────────────────────────────────────────────
  function goToStart() { playheadTime = 0; playheadEl.style.left = '0px'; timeEl.textContent = fmtTime(0); if (isPlaying) { playOffset = 0; playStart = performance.now() / 1000; syncVideoToTime(0) }; updateScrollbar(); updateTextOverlay(0) }
  function splitAtPlayhead() {
    const tp = playheadTime, affected = clips.filter(c => c.startTime + 0.1 < tp && tp < c.startTime + c.duration - 0.1); if (!affected.length) return
    const removed = affected.map(snapClip), created = []
    affected.forEach(c => { const cs = c.startTime, ce = cs + c.duration, si = c.srcIn || 0; unmountById(c.id); created.push(snapClip(mountClip({ ...snapClip(c), id: ++clipId, startTime: cs, duration: tp - cs, transition: null }))); created.push(snapClip(mountClip({ ...snapClip(c), id: ++clipId, startTime: tp, duration: ce - tp, srcIn: si + (tp - cs) }))) })
    updateRuler(); updateScrollbar()
    pushHistory('vr split', () => { created.forEach(p => unmountById(p.id)); removed.forEach(mountClip); updateRuler(); updateScrollbar() }, () => { removed.forEach(r => unmountById(r.id)); created.forEach(mountClip); updateRuler(); updateScrollbar() })
  }
  function zoomBy(f) { const r = scrollWrap.getBoundingClientRect(); applyZoom(ZOOM * f, r.left + scrollWrap.clientWidth / 2) }
  function zoomReset() { const r = scrollWrap.getBoundingClientRect(); applyZoom(80, r.left + scrollWrap.clientWidth / 2) }
  function movePlayhead(beats) { playheadTime = Math.max(0, playheadTime + beats * (60 / getBpm())); playheadEl.style.left = (playheadTime * ZOOM) + 'px'; timeEl.textContent = fmtTime(playheadTime); updateTextOverlay(playheadTime) }
  function playLoopRegion() {
    if (loopStart == null || loopEnd == null || loopEnd <= loopStart) return
    loopOn = true; updateLoopUI()
    playheadTime = loopStart; playheadEl.style.left = (loopStart * ZOOM) + 'px'; updateTextOverlay(loopStart)
    if (isPlaying) { playOffset = loopStart; playStart = performance.now() / 1000; syncVideoToTime(loopStart) } else doPlay()
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  function onVrKey(e) {
    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    if (!body.contains(a) && !body.matches(':hover')) return
    if (matchesShortcut('marquee-clear', e)) { clearRange(); return }
    if ((matchesShortcut('clip-delete', e) || e.key === 'Backspace') && rangeReady()) { e.preventDefault(); carveRange(loopStart, loopEnd); clearRange(); return }
    if (matchesShortcut('marquee-cut', e))    { if (rangeReady()) { e.preventDefault(); carveRange(loopStart, loopEnd); clearRange() } return }
    if (matchesShortcut('loop-toggle', e)) {
      e.preventDefault()
      if (loopStart != null && loopEnd != null && loopEnd > loopStart) { loopOn = !loopOn; updateLoopUI() }
      return
    }
    if (matchesShortcut('go-to-start', e))    { e.preventDefault(); goToStart(); return }
    if (matchesShortcut('new-track', e))      { e.preventDefault(); btnAdd.click(); return }
    if (matchesShortcut('clip-split', e))     { e.preventDefault(); splitAtPlayhead(); return }
    if (matchesShortcut('zoom-in', e))        { e.preventDefault(); zoomBy(1.2); return }
    if (matchesShortcut('zoom-out', e))       { e.preventDefault(); zoomBy(1 / 1.2); return }
    if (matchesShortcut('zoom-reset', e))     { e.preventDefault(); zoomReset(); return }
    if (matchesShortcut('playhead-left', e))  { e.preventDefault(); movePlayhead(-1); return }
    if (matchesShortcut('playhead-right', e)) { e.preventDefault(); movePlayhead(1); return }
    if (matchesShortcut('play-loop', e))      { e.preventDefault(); playLoopRegion(); return }
  }
  document.addEventListener('keydown', onVrKey)

  // ── Save project ───────────────────────────────────────────────────────────
  btnSave.addEventListener('click', async () => {
    const name = nameInp.value.trim() || t('vr_default_name')
    if (!root || !window.__TAURI__) { setBtnState(btnSave, 'err'); resetBtn(btnSave, 'fa-floppy-disk'); return }
    if (hasUnsaved()) {
      const choice = await confirmUnsaved(); if (choice === 'cancel') return; if (choice === 'save') { for (const c of clips.filter(x => x.videoUrl && !x.savedPath)) await saveClip(c) }
    }
    setBtnState(btnSave, 'spin')
    try {
      const data = JSON.stringify(serializeTimeline(), null, 2)
      await window.__TAURI__.core.invoke('save_text_file', { path: root + sep + 'Pistes' + sep + name + '.icevid', content: data })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Pistes' } }))
      setBtnState(btnSave, 'ok')
    } catch { setBtnState(btnSave, 'err') }
    resetBtn(btnSave, 'fa-floppy-disk')
  })
  nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click() })

  // ── Project registry ───────────────────────────────────────────────────────
  // Clips recorded in this session and never saved only exist as blob URLs,
  // which do not survive the app: they are left out (nothing could reload them).
  registerTool('videorec', {
    el: body,
    getState: () => {
      const data = serializeTimeline()
      data.clips = data.clips.filter(c => c.savedPath || c.placeholder)
      data.name = nameInp.value
      return data
    },
    setState: (state) => {
      if (!state || !Array.isArray(state.clips)) return
      doStop()
      applyTimeline(state)
      positionMusic()
      if (typeof state.name === 'string') nameInp.value = state.name
    },
  })

  // ── Init ──────────────────────────────────────────────────────────────────
  updateRuler(); updateScrollbar(); playheadEl.style.left = '0px'
  const resizeObs = new ResizeObserver(() => { clampPreviewH(); updateRuler(); updateScrollbar(); updateTextOverlay(playheadTime) })
  resizeObs.observe(scrollWrap); resizeObs.observe(body)

  const cleanObs = new MutationObserver(() => {
    if (!document.contains(body)) {
      doStop()
      cancelPlacement()   // drops the armed capture listeners (document keydown)
      document.getElementById('vr-act-pop')?.remove()   // popup lives on body
      if (_vrCtx) { _vrCtx.remove(); _vrCtx = null }    // clip ctx menu too
      document.removeEventListener('keydown', onVrKey)
      window.removeEventListener('iceample-transport', onTransport)
      // NOTE: blob URLs on clips are OWNED by the recorder tool that handed
      // them over — revoking them here would break its still-open takes list.
      cleanObs.disconnect(); resizeObs.disconnect()
    }
  })
  cleanObs.observe(document.body, { childList: true, subtree: true })

  const vrWin = body.closest('.tool-win')
  if (vrWin) {
    vrWin._beforeClose = async doClose => {
      if (!hasUnsaved()) { doClose(); return }
      const choice = await confirmUnsaved(); if (choice === 'cancel') return
      if (choice === 'save') for (const c of clips.filter(x => x.videoUrl && !x.savedPath)) await saveClip(c)
      doClose()
    }
  }
}
