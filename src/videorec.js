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
import { mediaUrl, mediaUrlSync } from './media-url.js'
import { registerTool } from './project.js'
import { routeMedia } from './devices.js'
import { fxOf, fxDiff, cfgOf, ASPECTS, RESOLUTIONS, FPS_LIST, SPEEDS, exportSize, cropWindow, planRender, buildRenderArgs } from './videorec-render.js'

function injectVrStyles() {
  if (document.getElementById('vr-styles')) return
  const s = document.createElement('style')
  s.id = 'vr-styles'
  s.textContent = `
.vr-body { display:flex; flex-direction:column; height:100%; background:var(--surface); }
.vr-pzone { display:flex; flex-direction:column; flex-shrink:0; min-height:120px; }
.vr-preview { position:relative; flex:1; min-height:0; background:color-mix(in srgb, var(--bg) 28%, black); display:flex; align-items:center; justify-content:center; overflow:hidden; }
/* The export frame (its aspect, black like the rendered file — content, not theme),
   the clip's picture inside it, and the overlay clip on top. */
.vr-frame { position:absolute; overflow:hidden; background:black; box-shadow:0 0 0 1px color-mix(in srgb, var(--text-primary) 12%, transparent); }
.vr-pic { position:absolute; }
.vr-pic > video, .vr-pic > img, .vr-ovl > video, .vr-ovl > img { position:absolute; display:block; object-fit:fill; transform-origin:50% 50%; }
.vr-ovl { position:absolute; overflow:hidden; pointer-events:none; }
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
.vr-clip-h { position:absolute; top:0; bottom:0; width:8px; cursor:ew-resize; z-index:2; }
.vr-clip-h.l { left:0 } .vr-clip-h.r { right:0 }
.vr-clip-h::after { content:''; position:absolute; top:9px; bottom:9px; left:3px; width:2px; border-radius:1px; background:color-mix(in srgb, var(--text-primary) 55%, transparent); opacity:0; transition:opacity .12s; }
.vr-clip:hover .vr-clip-h::after, .vr-clip.selected .vr-clip-h::after { opacity:1; }
.vr-clip-badge { position:absolute; right:9px; bottom:3px; font-size:9px; line-height:1; padding:2px 4px; border-radius:3px; color:var(--text-primary); background:color-mix(in srgb, var(--bg) 70%, transparent); pointer-events:none; font-variant-numeric:tabular-nums; }
.vr-clip-badge:empty { display:none; }
.vr-ov-lane { position:relative; height:40px; border-bottom:1px solid var(--win-border-in); background:color-mix(in srgb, var(--vu-color-mid) 5%, transparent); }
.vr-ov-lane .daw-clip { top:3px; height:34px; }
.vr-ph-grip { position:absolute; top:-24px; left:-7px; width:16px; height:24px; cursor:ew-resize; pointer-events:auto; }
.vr-controls .seq-btn { width:auto; min-width:28px; padding:0 7px; gap:5px; }
.vr-lbl { font-size:11px; }
.vr-body { container-type:inline-size; }
@container (max-width: 780px) { .vr-lbl { display:none; } }
.vr-actions.hidden { display:none; }
.vr-job { display:none; align-items:center; gap:6px; font-size:10px; color:var(--text-secondary); min-width:150px; max-width:260px; flex:1; }
.vr-job.on { display:flex; }
.vr-job-lbl { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vr-job-bar { flex:1; min-width:50px; height:5px; border-radius:3px; background:color-mix(in srgb, var(--text-primary) 14%, transparent); overflow:hidden; }
.vr-job-fill { height:100%; width:0; background:var(--accent); transition:width .2s; }
.vr-job-bar.indet .vr-job-fill { width:30%; animation:vrIndet 1.2s linear infinite; }
@keyframes vrIndet { from { transform:translateX(-100%) } to { transform:translateX(340%) } }
.vr-job-pct { font-variant-numeric:tabular-nums; min-width:28px; text-align:right; }
.vr-prop-sec { padding:7px 10px 2px; font-size:9px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--text-secondary); opacity:.8; }
.vr-prop-chips { display:flex; flex-wrap:wrap; gap:4px; padding:2px 10px 5px; }
.vr-chip { border:1px solid var(--win-border-in); border-radius:4px; padding:2px 7px; font-size:10px; cursor:pointer; font-family:inherit; color:var(--text-primary); background:var(--surface); }
.vr-chip.on { background:color-mix(in srgb, var(--color-active) 30%, var(--surface)); border-color:color-mix(in srgb, var(--color-active) 60%, transparent); }
.vr-chip:disabled { opacity:.4; cursor:default; }
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
  // Export settings (aspect, resolution, frame rate, quality, framing): kept in
  // the project, and the last ones used become the default of new montages.
  const EXPORT_KEY = 'iceample:videorec:export'
  let exportCfg = cfgOf((() => { try { return JSON.parse(localStorage.getItem(EXPORT_KEY) || 'null') } catch { return null } })())
  const audioProbe = new Map()   // source path → Promise<boolean>: does it carry sound?
  const IMG_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i
  const IMG_DUR = 5             // default length of a still image on the timeline (s)
  let previewReady = false      // preview layout runs only once every part of the tool exists

  body.innerHTML = `
    <div class="vr-pzone" id="vr-pzone">
      <div class="vr-preview" id="vr-preview">
        <div class="vr-frame" id="vr-frame">
          <div class="vr-pic" id="vr-pic"><video id="vr-vid" playsinline></video><img id="vr-img" alt="" draggable="false" style="display:none"></div>
          <div class="vr-ovl" id="vr-ovl" style="display:none"><video id="vr-ovid" playsinline></video><img id="vr-oimg" alt="" draggable="false" style="display:none"></div>
        </div>
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
    <div class="daw-controls vr-controls">
      <button class="seq-btn" id="vr-add" title="${t('mic_add_lane')}"><i class="fa-solid fa-plus"></i><span class="vr-lbl">${t('vr_lbl_lane')}</span></button>
      <button class="seq-btn" id="vr-music" title="${t('vr_add_music')}"><i class="fa-solid fa-music"></i><span class="vr-lbl">${t('vr_lbl_music')}</span></button>
      <button class="seq-btn" id="vr-text" title="${t('vr_add_text')}"><i class="fa-solid fa-font"></i><span class="vr-lbl">${t('vr_lbl_text')}</span></button>
      <button class="seq-btn" id="vr-marker" title="${t('vr_mk_add')}"><i class="fa-solid fa-location-dot"></i><span class="vr-lbl">${t('vr_lbl_marker')}</span></button>
      <button class="seq-btn" id="vr-tpl" title="${t('vr_templates')}"><i class="fa-solid fa-shapes"></i><span class="vr-lbl">${t('vr_lbl_tpl')}</span></button>
      <button class="seq-btn" id="vr-tools" title="${t('vr_tools')}"><i class="fa-solid fa-screwdriver-wrench"></i><span class="vr-lbl">${t('vr_lbl_tools')}</span></button>
      <button class="seq-btn" id="vr-export" title="${t('vr_export_montage')}"><i class="fa-solid fa-file-export"></i><span class="vr-lbl">${t('vr_lbl_export')}</span></button>
      <div class="vr-job" id="vr-job"><span class="vr-job-lbl"></span><div class="vr-job-bar"><div class="vr-job-fill"></div></div><span class="vr-job-pct"></span><button class="seq-btn" id="vr-job-cancel" title="${t('vr_job_cancel')}"><i class="fa-solid fa-xmark"></i></button></div>
      <div style="flex:1"></div>
      <input class="seq-save-input" id="vr-name" type="text" placeholder="${t('vr_name_placeholder')}" maxlength="40" />
      <button class="seq-btn" id="vr-save" title="${t('vr_save')}"><i class="fa-solid fa-floppy-disk"></i></button>
    </div>
    <div class="vr-actions hidden" id="vr-actions">
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
  const frameEl   = body.querySelector('#vr-frame')
  const picEl     = body.querySelector('#vr-pic')
  const imgEl     = body.querySelector('#vr-img')
  const ovlEl     = body.querySelector('#vr-ovl')
  const ovVid     = body.querySelector('#vr-ovid')
  const ovImg     = body.querySelector('#vr-oimg')
  const btnTools  = body.querySelector('#vr-tools')
  const actionsEl = body.querySelector('#vr-actions')
  const jobEl     = body.querySelector('#vr-job')
  const jobLbl    = jobEl.querySelector('.vr-job-lbl')
  const jobBar    = jobEl.querySelector('.vr-job-bar')
  const jobFill   = jobEl.querySelector('.vr-job-fill')
  const jobPct    = jobEl.querySelector('.vr-job-pct')
  const jobCancel = body.querySelector('#vr-job-cancel')

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
  async function receiveMedia(m) {
    if (!m) return
    if (m.kind === 'icevid' && m.path) { loadProject(m.path, m.name); return }
    if (m.path && (m.kind === 'icetpl' || /\.icetpl$/i.test(m.path))) { loadTemplateFile(m.path); return }
    // An audio file becomes the montage's music track.
    if (m.kind === 'audio' && m.path) { setMusicFromPath(m.path); return }
    // A still image becomes a picture clip (5 s, trimmable to any length).
    if (m.kind === 'image') { addImageMedia(m); return }
    if (m.kind !== 'video') return
    // Local files go through media-url.js (the webview refuses file:// URLs).
    let url = m.blobUrl || null
    if (m.path) { try { url = await mediaUrl(m.path) } catch { url = null } }
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
    if (data.export) { exportCfg = cfgOf(data.export); layoutFrame() }
    music = data.music && data.music.path ? { start: 0, volume: 1, fadeOut: false, duration: null, ...data.music } : null
    pendingMusic = null
    selectClip(null); updateRuler(); updateScrollbar(); updateTextOverlay(playheadTime); syncVideoToTime(playheadTime)
  }
  // The montage as plain data — the .icevid file content, also what the
  // project auto-save keeps.
  function serializeTimeline() {
    return {
      lanes: lanes.length,
      music: music ? { path: music.path, name: music.name || null, start: music.start || 0, volume: music.volume ?? 1, fadeOut: !!music.fadeOut, duration: music.duration ?? null } : null,
      texts: texts.map(tx => ({ text: tx.text, start: tx.start, dur: tx.dur, size: tx.size, color: tx.color, band: tx.band, pos: tx.pos })),
      markers: markers.map(m => ({ x: m.x, y: m.y, start: m.start, dur: m.dur, fn: m.fn, params: { ...m.params } })),
      clips: clips.map(c => ({ laneIdx: c.laneIdx, startTime: c.startTime, duration: c.duration, srcIn: c.srcIn || 0, srcDur: c.srcDur ?? null, w: c.w || 0, h: c.h || 0, savedPath: c.savedPath || null, label: c.label || null, thumbnail: c.thumbnail || null, transition: c.transition || null, placeholder: !!c.placeholder, image: c.image || undefined, fx: fxDiff(c.fx) || undefined })),
      export: { ...exportCfg },
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
  // Overlay lane (picture-in-picture): its clips are drawn ABOVE the main
  // sequence, at their own place and size (clip properties). laneIdx = -1.
  const OV_H = 40
  const ovLane = document.createElement('div'); ovLane.className = 'vr-ov-lane'
  const ovTag = document.createElement('span'); ovTag.className = 'vr-text-tag'; ovTag.textContent = t('vr_lane_overlay')
  ovLane.appendChild(ovTag)
  innerEl.insertBefore(ovLane, lanesEl)
  const laneEl = li => li === -1 ? ovLane : lanes[li]
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
  function updateInnerHeight() { innerEl.style.height = (RULER_H_PX + MARKER_H + TEXT_H + OV_H + lanes.length * LANE_H_PX + MUSIC_H) + 'px' }
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
    ovLane.style.width = totalW + 'px'
    markerLane.style.width = totalW + 'px'
    positionMusic(); positionTexts(); positionMarkers(); renderJunctionBadges(); updateTotal(); refreshFrame()
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
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if (!dragged) setPlayhead(at(e.clientX)) }
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
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.crossOrigin = 'anonymous'; v.src = url
    v.addEventListener('loadeddata', () => {
      v.currentTime = 0.5
      v.addEventListener('seeked', () => {
        try { const c = document.createElement('canvas'); c.width = 120; c.height = 68; c.getContext('2d').drawImage(v, 0, 0, 120, 68); cb(c.toDataURL('image/jpeg', 0.6)) } catch { cb(null) }
        v.src = ''
      }, { once: true })
    }, { once: true })
    v.addEventListener('error', () => cb(null), { once: true })
  }

  // Still images: thumbnail and size through an <img>.
  function loadImage(path) {
    return mediaUrl(path).then(url => new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res({ img, url })
      img.onerror = () => rej(new Error('image'))
      img.src = url
    }))
  }
  function imageThumb(img) {
    try {
      const c = document.createElement('canvas'); c.width = 120; c.height = 68
      const k = Math.max(120 / img.naturalWidth, 68 / img.naturalHeight)
      const w = img.naturalWidth * k, h = img.naturalHeight * k
      c.getContext('2d').drawImage(img, (120 - w) / 2, (68 - h) / 2, w, h)
      return c.toDataURL('image/jpeg', 0.6)
    } catch { return null }
  }
  function setThumb(c, thumb) {
    if (!thumb) return
    c.thumbnail = thumb
    c.el.querySelector('.vr-thumb')?.remove()
    const img = document.createElement('img'); img.className = 'vr-thumb'; img.src = thumb; c.el.prepend(img)
  }
  // An image file for the timeline: a path already on disk, or (picture sent
  // by another tool) saved once into the library's Images folder.
  async function imagePath(m) {
    if (m.path && IMG_EXT.test(m.path)) return m.path
    if (!m.dataUrl || !root || !window.__TAURI__) return null
    const ext = (/^data:image\/(png|jpeg|webp)/.exec(m.dataUrl) || [0, 'png'])[1].replace('jpeg', 'jpg')
    const base = String(m.name || 'image').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40) || 'image'
    const p = root + sep + 'Images' + sep + base + '-' + Date.now().toString(36) + '.' + ext
    await window.__TAURI__.core.invoke('save_binary_file', { path: p, base64: m.dataUrl.split(',')[1] })
    window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Images' } }))
    return p
  }
  // `at` = timeline position (drop); none = after the last clip, or into the
  // first empty template slot.
  async function addImageMedia(m, laneIdx = 0, at = null) {
    let p = null
    try { p = await imagePath(m) } catch { p = null }
    if (!p) { window.toast?.(t('vc_fail'), 'error'); return }
    const name = m.name || String(p).split(/[\\/]/).pop()
    if (at == null) {
      const ph = clips.filter(c => c.placeholder).sort((a, b) => a.startTime - b.startTime)[0]
      if (ph) { fillPlaceholder(ph, p, name); return }
    }
    let loaded
    try { loaded = await loadImage(p) } catch { window.toast?.(t('vc_fail'), 'error'); return }
    let start = at
    if (start == null) { start = 0; for (const c of clips) start = Math.max(start, c.startTime + c.duration) }
    const c = mountClip({ id: ++clipId, laneIdx, startTime: start, duration: IMG_DUR, srcDur: null, w: loaded.img.naturalWidth, h: loaded.img.naturalHeight, savedPath: p, label: name, image: true })
    setThumb(c, imageThumb(loaded.img))
    selectClip(c); updateRuler(); updateScrollbar()
  }

  // ── Clip management ────────────────────────────────────────────────────────
  function positionClip(c) { c.el.style.left = (c.startTime * ZOOM) + 'px'; c.el.style.width = Math.max(4, c.duration * ZOOM) + 'px' }
  function laneIdxFromY(clientY) { const ov = ovLane.getBoundingClientRect(); if (clientY >= ov.top && clientY <= ov.bottom) return -1; let best = 0; lanes.forEach((l, i) => { const r = l.getBoundingClientRect(); if (clientY >= r.top && clientY <= r.bottom) best = i }); return best }
  // Selecting a clip highlights it, drives the clip tools and shows it in the
  // preview: at the playhead when the playhead is inside it, else its first
  // frame. `fromSync` = the playhead walked into it (playback / scrubbing).
  function selectClip(c, fromSync) {
    clips.forEach(x => x.el.classList.remove('selected'))
    selClip = c
    updateActionState()
    if (!c) { badgeEl.style.display = 'none'; if (!fromSync) syncVideoToTime(playheadTime); return }
    c.el.classList.add('selected')
    badgeEl.style.display = ''; badgeEl.textContent = c.label || c.savedPath?.split(/[\\/]/).pop() || 'clip'
    if (fromSync || c.laneIdx === -1) { if (!fromSync) syncVideoToTime(playheadTime); return }
    const inside = playheadTime >= c.startTime && playheadTime < c.startTime + c.duration
    if (inside) { vidClip = null; syncVideoToTime(playheadTime); return }
    vidClip = c
    showClipMedia(c)
    picEl.style.opacity = '1'
    if (!c.image && vidEl.getAttribute('src')) { vidEl.pause(); vidEl.currentTime = c.srcIn || 0 }
  }
  function mountClip(d) {
    if (d.savedPath && !mediaUrlSync(d.savedPath)) mediaUrl(d.savedPath).catch(() => {})   // web: resolve once for the preview
    const el = document.createElement('div')
    el.className = 'daw-clip vr-clip mic-clip' + (d.placeholder ? ' vr-ph' : ''); el.dataset.clipId = d.id
    el.innerHTML = '<i class="fa-solid ' + (d.image ? 'fa-image' : 'fa-film') + '"></i><span class="daw-clip-name"></span><span class="vr-clip-badge"></span><div class="vr-clip-h l"></div><div class="vr-clip-h r"></div>'
    el.querySelector('.daw-clip-name').textContent = d.label || ''
    if (d.placeholder) { const b = document.createElement('span'); b.className = 'vr-ph-dur'; b.textContent = (Math.round((d.duration || 0) * 10) / 10) + 's'; el.appendChild(b) }
    if (d.thumbnail) { const img = document.createElement('img'); img.className = 'vr-thumb'; img.src = d.thumbnail; el.prepend(img) }
    // srcIn/srcDur: offset and total length within the SOURCE file — set by
    // carve/split so trimmed fragments play (and export) the right slice.
    // w/h: source frame size probed at mount (0 = unknown — old projects,
    // probe failures); the montage export picks its target resolution off it.
    // transition: { type, dur } applied at this clip's RIGHT edge on export.
    // placeholder: a template slot holding no media yet (skipped by export).
    const clip = { id: d.id, laneIdx: d.laneIdx, startTime: d.startTime, duration: d.duration, srcIn: d.srcIn || 0, srcDur: d.srcDur ?? null, w: d.w || 0, h: d.h || 0, videoUrl: d.videoUrl || null, savedPath: d.savedPath || null, thumbnail: d.thumbnail || null, label: d.label || null, transition: d.transition || null, placeholder: !!d.placeholder, image: !!d.image, fx: d.fx ? { ...d.fx } : null, el }
    if (d.id > clipId) clipId = d.id
    clips.push(clip); positionClip(clip); refreshClipBadge(clip)
    if (laneEl(clip.laneIdx)) laneEl(clip.laneIdx).appendChild(el)
    makeDraggable(clip)
    el.addEventListener('click', e => { e.stopPropagation(); selectClip(clip) })
    el.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); if (!clip.placeholder) openClipProps(clip) })
    return clip
  }
  // Small tag on the clip when it plays at another speed or has properties.
  function refreshClipBadge(c) {
    const b = c.el.querySelector('.vr-clip-badge'); if (!b) return
    const fx = fxOf(c), parts = []
    if (!c.image && fx.speed !== 1) parts.push(fx.speed + '\u00d7')
    if (fxDiff({ ...c.fx, speed: 1, pos: 'br', size: 35, opacity: 100 })) parts.push('fx')
    b.textContent = parts.join(' ')
  }
  function snapClip(c) { return { id: c.id, laneIdx: c.laneIdx, startTime: c.startTime, duration: c.duration, srcIn: c.srcIn || 0, srcDur: c.srcDur ?? null, w: c.w || 0, h: c.h || 0, videoUrl: c.videoUrl, savedPath: c.savedPath, thumbnail: c.thumbnail, label: c.label, transition: c.transition || null, placeholder: !!c.placeholder, image: !!c.image, fx: c.fx ? { ...c.fx } : null } }
  function unmountById(id) { const i = clips.findIndex(c => c.id === id); if (i >= 0) { if (selClip?.id === id) selectClip(null); clips[i].el.remove(); clips.splice(i, 1) } }
  // Delete (Suppr / context menu), undoable.
  function deleteClip(clip) {
    const snap = snapClip(clip)
    unmountById(clip.id); updateRuler(); updateScrollbar(); syncVideoToTime(playheadTime)
    pushHistory('vr delete',
      () => { mountClip(snap); updateRuler(); updateScrollbar(); syncVideoToTime(playheadTime) },
      () => { unmountById(snap.id); updateRuler(); updateScrollbar(); syncVideoToTime(playheadTime) })
  }
  function carveRange(t0, t1) {
    if (t1 <= t0) return
    const affected = clips.filter(c => c.startTime < t1 && c.startTime + c.duration > t0); if (!affected.length) return
    const removed = affected.map(snapClip), created = []
    affected.forEach(c => {
      const cs = c.startTime, ce = cs + c.duration, si = c.srcIn || 0; unmountById(c.id)
      // The left piece's right edge is now a fresh cut — its transition (if
      // any) stays with the ORIGINAL right edge, i.e. the right piece.
      if (cs < t0) { const nc = mountClip({ ...snapClip(c), id: ++clipId, startTime: cs, duration: t0 - cs, transition: null }); created.push(snapClip(nc)) }
      if (ce > t1) { const nc = mountClip({ ...snapClip(c), id: ++clipId, startTime: t1, duration: ce - t1, srcIn: c.image ? 0 : si + (t1 - cs) * fxOf(c).speed }); created.push(snapClip(nc)) }
    })
    updateRuler(); updateScrollbar()
    pushHistory('vr carve', () => { created.forEach(p => unmountById(p.id)); removed.forEach(mountClip); updateRuler(); updateScrollbar() }, () => { removed.forEach(r => unmountById(r.id)); created.forEach(mountClip); updateRuler(); updateScrollbar() })
  }
  function makeDraggable(clip) {
    clip.el.addEventListener('mousedown', e => {
      if (e.button !== 0) return; e.preventDefault(); e.stopPropagation()
      const hEl = e.target.closest('.vr-clip-h')
      if (hEl) { startTrim(clip, hEl.classList.contains('l'), e); return }
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
        const newTime = (ev.altKey ? (x => x) : snapTime)(Math.max(0, (ev.clientX - sr.left + scrollWrap.scrollLeft - offsetX) / ZOOM))   // Alt: no grid
        const cid = clip.id
        const applyPos = (li, ti) => { const c = clips.find(x => x.id === cid); if (!c) return; c.laneIdx = li; c.startTime = ti; positionClip(c); if (laneEl(li) && !laneEl(li).contains(c.el)) laneEl(li).appendChild(c.el); updateRuler(); updateScrollbar(); if (!isPlaying) { vidClip = null; syncVideoToTime(playheadTime) } }
        applyPos(newLaneIdx, newTime)
        if (prevLane !== newLaneIdx || Math.abs(prevTime - newTime) > 0.001) pushHistory('vr move', () => applyPos(prevLane, prevTime), () => applyPos(newLaneIdx, newTime))
        document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    })
    clip.el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showClipMenu(e, clip) })
  }
  // Edge trim: the left handle moves the start (and the source in-point), the
  // right one the end. A video can't grow past its source; an image can.
  // Edges stick to the other clips' edges and to the playhead (Alt: free).
  // While dragging, the preview shows the frame at the moving edge.
  function edgeSnap(tt, self, free) {
    if (free) return tt
    let best = tt, bd = 8 / ZOOM
    const cands = [playheadTime, 0]
    for (const c of clips) if (c !== self) cands.push(c.startTime, c.startTime + c.duration)
    for (const v of cands) { const d = Math.abs(v - tt); if (d < bd) { bd = d; best = v } }
    return best
  }
  function startTrim(clip, left, e) {
    const x0 = e.clientX, s0 = clip.startTime, d0 = clip.duration, i0 = clip.srcIn || 0
    const sp = clip.image ? 1 : fxOf(clip).speed, MIN = 0.1
    const maxEnd = (!clip.image && clip.srcDur) ? s0 + (clip.srcDur - i0) / sp : Infinity
    const minStart = clip.image ? 0 : Math.max(0, s0 - i0 / sp)
    let moved = false
    const onMove = ev => {
      if (!moved && Math.abs(ev.clientX - x0) > 3) moved = true
      if (!moved) return
      const delta = (ev.clientX - x0) / ZOOM
      if (left) {
        const ns = Math.max(minStart, Math.min(edgeSnap(s0 + delta, clip, ev.altKey), s0 + d0 - MIN))
        clip.startTime = ns; clip.duration = s0 + d0 - ns
        if (!clip.image) clip.srcIn = Math.max(0, i0 + (ns - s0) * sp)
      } else {
        const ne = Math.max(s0 + MIN, Math.min(edgeSnap(s0 + d0 + delta, clip, ev.altKey), maxEnd))
        clip.duration = ne - s0
      }
      positionClip(clip); renderJunctionBadges(); updateTotal()
      if (!isPlaying) { vidClip = null; syncVideoToTime(left ? clip.startTime : clip.startTime + clip.duration - 0.04) }
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      if (!moved) return
      document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
      const cid = clip.id, ns = clip.startTime, nd = clip.duration, ni = clip.srcIn || 0
      const apply = (st, du, si) => { const c = clips.find(x => x.id === cid); if (!c) return; c.startTime = st; c.duration = du; c.srcIn = si; positionClip(c); updateRuler(); updateScrollbar(); if (!isPlaying) { vidClip = null; syncVideoToTime(playheadTime) } }
      apply(ns, nd, ni)
      if (Math.abs(ns - s0) > 0.001 || Math.abs(nd - d0) > 0.001) pushHistory('vr trim', () => apply(s0, d0, i0), () => apply(ns, nd, ni))
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }
  let _vrCtx = null
  function showClipMenu(e, clip) {
    if (_vrCtx) { _vrCtx.remove(); _vrCtx = null }
    const menu = document.createElement('div'); menu.className = 'daw-clip-ctx'; _vrCtx = menu
    const close = () => { menu.remove(); _vrCtx = null; document.removeEventListener('mousedown', onDoc) }
    const head = document.createElement('div'); head.className = 'daw-ctx-head'; head.innerHTML = `<i class="fa-solid fa-film"></i><span>${clip.label || 'Clip'}</span>`; menu.appendChild(head)
    if (!clip.image && (clip.videoUrl || clip.savedPath) && window.__TAURI__) {
      const savBtn = document.createElement('button'); savBtn.className = 'daw-ctx-btn'
      savBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${t('clip_save_sample')}`
      savBtn.addEventListener('click', () => { close(); saveClip(clip) })
      menu.appendChild(savBtn)
    }
    if (!clip.image && (clip.videoUrl || clip.savedPath)) {
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
    if (!clip.placeholder) {
      const pr = document.createElement('button'); pr.className = 'daw-ctx-btn'
      pr.innerHTML = `<i class="fa-solid fa-sliders"></i> ${t('vr_props')}`
      pr.addEventListener('click', () => { close(); openClipProps(clip) })
      menu.insertBefore(pr, menu.children[1] || null)
    }
    const del = document.createElement('button'); del.className = 'daw-ctx-btn daw-ctx-del'; del.innerHTML = `<i class="fa-solid fa-trash"></i> ${t('clip_delete')}`
    del.addEventListener('click', () => { close(); deleteClip(clip) })
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
    const src = clip.videoUrl || clip.savedPath || null; if (!src) return
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

  // ── Clip properties ───────────────────────────────────────────────────────
  // Popover editor (double-click a clip, or "Properties…" in its menu): speed,
  // volume, fades, rotation / mirror, crop, colour and — on the overlay lane —
  // place, size and opacity. Every change shows at once in the preview;
  // closing keeps it and records ONE undo step. The export applies the same
  // values (videorec-render.js).
  function chipRow(pop, label, items, get, onPick) {
    const sec = document.createElement('div'); sec.className = 'vr-prop-sec'; sec.textContent = label
    const row = document.createElement('div'); row.className = 'vr-prop-chips'
    const btns = items.map(([v, txt]) => {
      const b = document.createElement('button'); b.className = 'vr-chip'; b.textContent = txt
      b.addEventListener('click', ev => { ev.stopPropagation(); onPick(v); paint() })
      row.appendChild(b)
      return [v, b]
    })
    const paint = () => btns.forEach(([v, b]) => b.classList.toggle('on', get(v) === true || get() === v))
    paint(); pop.append(sec, row)
    return paint
  }
  function propSlider(pop, label, min, max, step, get, fmt, onInput) {
    const row = popRow(label)
    const out = document.createElement('span'); out.style.cssText = 'color:var(--text-primary);font-variant-numeric:tabular-nums;'
    row.appendChild(out)
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = String(min); inp.max = String(max); inp.step = String(step)
    inp.style.cssText = 'width:calc(100% - 20px);margin:0 10px 4px;accent-color:var(--slider-color);'
    const paint = () => { inp.value = String(get()); out.textContent = fmt(get()) }
    inp.addEventListener('input', () => { onInput(parseFloat(inp.value)); out.textContent = fmt(get()) })
    paint(); pop.append(row, inp)
    return paint
  }
  function openClipProps(clip, anchor) {
    if (!clip || clip.placeholder) return
    const cid = clip.id
    const before = { fx: clip.fx ? { ...clip.fx } : null, duration: clip.duration }
    const fx = fxOf(clip)
    const isImg = !!clip.image, isOv = clip.laneIdx === -1
    const maxSpan = () => (!isImg && clip.srcDur) ? Math.max(0.1, clip.srcDur - (clip.srcIn || 0)) : Infinity
    const live = () => {
      clip.fx = fxDiff(fx)
      refreshFrame()   // a turned first clip changes the 'like the video' frame
      positionClip(clip); refreshClipBadge(clip); renderJunctionBadges(); updateTotal()
      if (shownClip === clip) layoutPicture()
      if (shownOv === clip) layoutOverlay()
      if (!isPlaying) { vidClip = null; syncVideoToTime(playheadTime) }
    }
    // Edit what you see: the playhead jumps onto the clip if it isn't on it.
    if (!(playheadTime >= clip.startTime && playheadTime < clip.startTime + clip.duration)) setPlayhead(clip.startTime)
    selectClip(clip)
    const paints = []
    actPopup(anchor || clip.el, (pop, finish) => {
      pop.style.minWidth = '260px'; pop.style.maxHeight = 'min(560px, 80vh)'; pop.style.overflowY = 'auto'
      const head = document.createElement('div'); head.className = 'vr-prop-sec'
      head.style.cssText = 'text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
      head.textContent = clip.label || 'Clip'
      pop.appendChild(head)
      if (!isImg) {
        // A new speed keeps the same piece of the source: the clip gets
        // shorter or longer on the timeline.
        paints.push(chipRow(pop, t('vr_p_speed'), SPEEDS.map(v => [v, v + '\u00d7']), () => fx.speed, v => {
          const span = Math.min(clip.duration * fx.speed, maxSpan())
          fx.speed = v; clip.duration = Math.max(0.1, span / v); live(); updateRuler()
        }))
        paints.push(propSlider(pop, t('vr_p_volume'), 0, 200, 5, () => Math.round(fx.vol * 100), v => v + ' %', v => { fx.vol = v / 100; live() }))
      } else {
        paints.push(propSlider(pop, t('vr_p_duration'), 0.5, 30, 0.5, () => Math.round(clip.duration * 2) / 2, v => v + ' s', v => { clip.duration = v; live(); updateRuler() }))
      }
      paints.push(propSlider(pop, t('vr_p_fade_in'), 0, 3, 0.1, () => fx.fadeIn, v => v.toFixed(1) + ' s', v => { fx.fadeIn = v; live() }))
      paints.push(propSlider(pop, t('vr_p_fade_out'), 0, 3, 0.1, () => fx.fadeOut, v => v.toFixed(1) + ' s', v => { fx.fadeOut = v; live() }))
      paints.push(chipRow(pop, t('vr_p_rotate'), [[0, '0\u00b0'], [90, '90\u00b0'], [180, '180\u00b0'], [270, '270\u00b0']], () => fx.rot, v => { fx.rot = v; live() }))
      paints.push(chipRow(pop, t('vr_p_flip'), [['h', t('vr_p_flip_h')], ['v', t('vr_p_flip_v')]],
        v => v === 'h' ? fx.flipH : v === 'v' ? fx.flipV : undefined,
        v => { if (v === 'h') fx.flipH = !fx.flipH; else fx.flipV = !fx.flipV; live() }))
      const sec = txt => { const d = document.createElement('div'); d.className = 'vr-prop-sec'; d.textContent = txt; pop.appendChild(d) }
      sec(t('vr_p_crop'))
      paints.push(propSlider(pop, 'Zoom', 1, 3, 0.05, () => fx.zoom, v => '\u00d7' + v.toFixed(2), v => { fx.zoom = v; live() }))
      paints.push(propSlider(pop, t('vr_p_crop_x'), 0, 100, 1, () => fx.cx, v => Math.round(v) + ' %', v => { fx.cx = v; live() }))
      paints.push(propSlider(pop, t('vr_p_crop_y'), 0, 100, 1, () => fx.cy, v => Math.round(v) + ' %', v => { fx.cy = v; live() }))
      sec(t('vr_p_color'))
      paints.push(propSlider(pop, t('vr_p_bright'), -50, 50, 1, () => fx.bright, v => (v > 0 ? '+' : '') + Math.round(v), v => { fx.bright = v; live() }))
      paints.push(propSlider(pop, t('vr_p_contrast'), 50, 150, 1, () => fx.contrast, v => Math.round(v) + ' %', v => { fx.contrast = v; live() }))
      paints.push(propSlider(pop, t('vr_p_sat'), 0, 200, 1, () => fx.sat, v => Math.round(v) + ' %', v => { fx.sat = v; live() }))
      paints.push(chipRow(pop, t('vr_p_look'), [['none', t('vr_look_none')], ['bw', t('vr_look_bw')], ['sepia', t('vr_look_sepia')]], () => fx.look, v => { fx.look = v; live() }))
      if (isOv) {
        sec(t('vr_lane_overlay'))
        const posRow = popRow(t('vr_p_ov_pos'))
        const grid = document.createElement('div'); grid.className = 'vr-pos-grid'
        const cells = []
        for (const yv of 'tcb') for (const xh of 'lcr') {
          const b = document.createElement('button'); b.className = 'vr-pos-cell'; b.dataset.pos = yv + xh
          b.addEventListener('click', ev => { ev.stopPropagation(); fx.pos = yv + xh; paintGrid(); live() })
          grid.appendChild(b); cells.push(b)
        }
        const paintGrid = () => cells.forEach(b => b.classList.toggle('on', b.dataset.pos === fx.pos))
        paintGrid(); paints.push(paintGrid)
        posRow.appendChild(grid); pop.appendChild(posRow)
        paints.push(propSlider(pop, t('vr_p_ov_size'), 10, 100, 1, () => fx.size, v => Math.round(v) + ' %', v => { fx.size = v; live() }))
        paints.push(propSlider(pop, t('vr_p_opacity'), 10, 100, 1, () => fx.opacity, v => Math.round(v) + ' %', v => { fx.opacity = v; live() }))
      }
      const rs = popBtn(t('vr_p_reset'), 'fa-rotate-left')
      rs.addEventListener('click', ev => {
        ev.stopPropagation()
        const span = Math.min(clip.duration * fx.speed, maxSpan())
        Object.assign(fx, fxOf({ fx: isOv ? { pos: fx.pos, size: fx.size, opacity: fx.opacity } : null }))
        if (!isImg) clip.duration = Math.max(0.1, span)
        live(); updateRuler(); paints.forEach(p => p())
      })
      pop.appendChild(rs)
    }).then(() => {
      const c = clips.find(x => x.id === cid); if (!c) return
      const after = { fx: c.fx ? { ...c.fx } : null, duration: c.duration }
      if (JSON.stringify(before) === JSON.stringify(after)) return
      const apply = st => {
        const x = clips.find(y => y.id === cid); if (!x) return
        x.fx = st.fx ? { ...st.fx } : null; x.duration = st.duration
        positionClip(x); refreshClipBadge(x); updateRuler(); updateScrollbar()
        if (shownClip === x) layoutPicture()
        if (shownOv === x) layoutOverlay()
        if (!isPlaying) { vidClip = null; syncVideoToTime(playheadTime) }
      }
      pushHistory('vr clip props', () => apply(before), () => apply(after))
      updateRuler(); updateScrollbar()
    })
  }

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
        el.style.top = (RULER_H_PX + MARKER_H + TEXT_H + OV_H + li * LANE_H_PX + LANE_H_PX / 2 - 7) + 'px'
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
    mediaUrl(p).then(u => { probe.src = u }).catch(() => done(null))
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
      vol.style.cssText = 'width:calc(100% - 20px);margin:0 10px 4px;accent-color:var(--slider-color);'
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
  // ── Preview frame ─────────────────────────────────────────────────────────
  // The preview shows the EXPORT frame (aspect from the export settings, black
  // bars or fill), the picture of the clip under the playhead inside it with
  // its properties (crop, flips, rotation, colour, fades), and the overlay
  // clip on top — the same composition videorec-render.js writes.
  let frameRect = { left: 0, top: 0, width: 0, height: 0 }
  let picRect = null      // picture box inside the frame
  let shownClip = null    // clip whose media the main elements show
  let shownOv = null      // overlay clip shown
  function layoutFrame() {
    const pw = previewEl.clientWidth, ph = previewEl.clientHeight
    if (!pw || !ph) return
    const { W, H } = exportSize(exportCfg, clips), a = W / H, pad = 6
    let w = pw - pad * 2, h = w / a
    if (h > ph - pad * 2) { h = ph - pad * 2; w = h * a }
    w = Math.max(0, w); h = Math.max(0, h)
    frameRect = { left: (pw - w) / 2, top: (ph - h) / 2, width: w, height: h }
    frameEl.style.left = frameRect.left + 'px'; frameEl.style.top = frameRect.top + 'px'
    frameEl.style.width = w + 'px'; frameEl.style.height = h + 'px'
  }
  const mediaDims = (c, el) => {
    const w = c.image ? el.naturalWidth : el.videoWidth, h = c.image ? el.naturalHeight : el.videoHeight
    return { w: w || c.w || 16, h: h || c.h || 9 }
  }
  // Lays out a <video>/<img> in a bw×bh box with the clip's properties: crop
  // through object-view-box, flips + rotation through the transform (a quarter
  // turn swaps the element's own width and height), colour through filter.
  function applyMediaFx(el, fx, bw, bh) {
    const turned = fx.rot % 180 !== 0
    const ew = turned ? bh : bw, eh = turned ? bw : bh
    el.style.width = ew + 'px'; el.style.height = eh + 'px'
    el.style.left = (bw - ew) / 2 + 'px'; el.style.top = (bh - eh) / 2 + 'px'
    const tf = []
    if (fx.rot) tf.push(`rotate(${fx.rot}deg)`)
    if (fx.flipH || fx.flipV) tf.push(`scale(${fx.flipH ? -1 : 1},${fx.flipV ? -1 : 1})`)
    el.style.transform = tf.join(' ')
    if (fx.zoom > 1.001) {
      const w = cropWindow(fx), pc = v => (v * 100).toFixed(2) + '%'
      el.style.objectViewBox = `inset(${pc(w.t)} ${pc(1 - w.l - w.w)} ${pc(1 - w.t - w.h)} ${pc(w.l)})`
    } else el.style.objectViewBox = ''
    const f = []
    if (fx.bright) f.push(`brightness(${(1 + fx.bright / 100).toFixed(3)})`)
    if (fx.contrast !== 100) f.push(`contrast(${(fx.contrast / 100).toFixed(3)})`)
    if (fx.sat !== 100) f.push(`saturate(${(fx.sat / 100).toFixed(3)})`)
    if (fx.look === 'bw') f.push('grayscale(1)'); else if (fx.look === 'sepia') f.push('sepia(1)')
    el.style.filter = f.join(' ')
  }
  function layoutPicture() {
    const c = shownClip
    if (!c || !frameRect.width) { picRect = null; picEl.style.display = 'none'; return }
    const fx = fxOf(c), el = c.image ? imgEl : vidEl
    let { w, h } = mediaDims(c, el)
    if (fx.rot % 180) [w, h] = [h, w]
    const fw = frameRect.width, fh = frameRect.height
    const k = exportCfg.fit === 'cover' ? Math.max(fw / w, fh / h) : Math.min(fw / w, fh / h)
    const pw = w * k, ph = h * k
    picRect = { left: (fw - pw) / 2, top: (fh - ph) / 2, width: pw, height: ph }
    picEl.style.display = ''
    picEl.style.left = picRect.left + 'px'; picEl.style.top = picRect.top + 'px'
    picEl.style.width = pw + 'px'; picEl.style.height = ph + 'px'
    applyMediaFx(el, fx, pw, ph)
  }
  function layoutOverlay() {
    const c = shownOv
    if (!c || !frameRect.width) { ovlEl.style.display = 'none'; return }
    const fx = fxOf(c), el = c.image ? ovImg : ovVid
    let { w, h } = mediaDims(c, el)
    if (fx.rot % 180) [w, h] = [h, w]
    const fw = frameRect.width, fh = frameRect.height
    const bw = fw * fx.size / 100, bh = bw * h / w, m = Math.min(fw, fh) * 0.04
    const x = fx.pos[1] === 'l' ? m : fx.pos[1] === 'r' ? fw - bw - m : (fw - bw) / 2
    const y = fx.pos[0] === 't' ? m : fx.pos[0] === 'b' ? fh - bh - m : (fh - bh) / 2
    ovlEl.style.display = ''
    ovlEl.style.left = x + 'px'; ovlEl.style.top = y + 'px'; ovlEl.style.width = bw + 'px'; ovlEl.style.height = bh + 'px'
    applyMediaFx(el, fx, bw, bh)
  }
  // The frame follows the timeline (format 'like the video' = first clip) —
  // re-laid out only when its size actually changes.
  let frameKey = ''
  function refreshFrame() {
    if (!previewReady) return
    const { W, H } = exportSize(exportCfg, clips)
    const key = W + 'x' + H + ':' + exportCfg.fit + ':' + previewEl.clientWidth + 'x' + previewEl.clientHeight
    if (key !== frameKey) { frameKey = key; relayoutPreview() }
  }
  function relayoutPreview() { layoutFrame(); layoutPicture(); layoutOverlay(); overlayKey = ''; mkFxKey = ''; updateTextOverlay(playheadTime) }
  // Points the main elements at a clip's media (video or still image).
  function showClipMedia(c) {
    if (c === shownClip) return
    shownClip = c || null
    if (!c) { vidEl.pause(); vidEl.removeAttribute('src'); imgEl.removeAttribute('src'); layoutPicture(); return }
    const src = c.videoUrl || (c.savedPath ? mediaUrlSync(c.savedPath) : null)
    if (!src) {
      // Web: the library file isn't resolved yet (restored project) — resolve, then retry.
      picEl.style.display = 'none'
      if (c.savedPath) mediaUrl(c.savedPath).then(u => { if (u && shownClip === c) { shownClip = null; vidClip = null; syncVideoToTime(playheadTime) } }).catch(() => {})
      return
    }
    if (c.image) {
      vidEl.pause(); vidEl.removeAttribute('src'); vidEl.style.display = 'none'
      imgEl.style.display = ''; if (imgEl.getAttribute('src') !== src) imgEl.src = src
    } else {
      imgEl.style.display = 'none'; imgEl.removeAttribute('src')
      vidEl.style.display = ''; if (vidEl.getAttribute('src') !== src) vidEl.src = src
    }
    layoutPicture()
  }
  function showOverlayMedia(c) {
    shownOv = c || null
    if (!c) { ovVid.pause(); ovVid.removeAttribute('src'); ovImg.removeAttribute('src'); ovlEl.style.display = 'none'; return }
    const src = c.videoUrl || (c.savedPath ? mediaUrlSync(c.savedPath) : null)
    if (!src) {
      ovlEl.style.display = 'none'
      if (c.savedPath) mediaUrl(c.savedPath).then(u => { if (u && shownOv === c) { shownOv = null; syncVideoToTime(playheadTime) } }).catch(() => {})
      return
    }
    if (c.image) {
      ovVid.pause(); ovVid.removeAttribute('src'); ovVid.style.display = 'none'
      ovImg.style.display = ''; if (ovImg.getAttribute('src') !== src) ovImg.src = src
    } else {
      ovImg.style.display = 'none'; ovImg.removeAttribute('src')
      ovVid.style.display = ''; if (ovVid.getAttribute('src') !== src) ovVid.src = src
    }
    layoutOverlay()
  }
  vidEl.addEventListener('loadedmetadata', layoutPicture)
  imgEl.addEventListener('load', layoutPicture)
  ovVid.addEventListener('loadedmetadata', layoutOverlay)
  ovImg.addEventListener('load', layoutOverlay)
  // Picture box (markers live on the picture) and frame box (titles live on
  // the frame), both relative to previewEl.
  function videoBox() {
    if (picRect && shownClip && picEl.style.display !== 'none') return { left: frameRect.left + picRect.left, top: frameRect.top + picRect.top, width: picRect.width, height: picRect.height }
    return { ...frameRect }
  }
  function frameBox() { return { ...frameRect } }
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
    const vb = frameBox()
    txtOverlay.style.display = ''
    txtOverlay.style.left = vb.left + 'px'; txtOverlay.style.top = vb.top + 'px'
    txtOverlay.style.width = vb.width + 'px'; txtOverlay.style.height = vb.height + 'px'
    const scale = (Math.min(vb.width, vb.height) || 720) / 720   // same short-side reference as the export
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
      if (picEl.style.transform) { picEl.style.transform = ''; picEl.style.transformOrigin = '' }
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
      picEl.style.transformOrigin = '0 0'
      picEl.style.transform = 'scale(' + zs.toFixed(4) + ') translate(' + (-lx * 100).toFixed(3) + '%,' + (-ly * 100).toFixed(3) + '%)'
    } else if (picEl.style.transform) { picEl.style.transform = ''; picEl.style.transformOrigin = '' }
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
        inp.style.cssText = 'width:calc(100% - 20px);margin:0 10px 4px;accent-color:var(--slider-color);'
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
  async function fillPlaceholder(ph, path, name) {
    const label = name || String(path).split(/[\\/]/).pop() || 'clip'
    const finish = () => {
      ph.savedPath = path; ph.videoUrl = null; ph.label = label; ph.srcIn = 0
      ph.placeholder = false
      ph.el.classList.remove('vr-ph')
      ph.el.querySelector('.vr-ph-dur')?.remove()
      ph.el.querySelector('.daw-clip-name').textContent = label.slice(0, 22)
      ph.el.querySelector('i.fa-solid')?.classList.replace('fa-film', ph.image ? 'fa-image' : 'fa-film')
      positionClip(ph); refreshClipBadge(ph)
      selectClip(ph); updateRuler(); updateScrollbar()
    }
    if (IMG_EXT.test(path)) {
      // A picture keeps the slot's length (it can last as long as needed).
      let loaded
      try { loaded = await loadImage(path) } catch { window.toast?.(t('vc_fail'), 'error'); return }
      ph.image = true; ph.srcDur = null; ph.w = loaded.img.naturalWidth; ph.h = loaded.img.naturalHeight
      finish(); setThumb(ph, imageThumb(loaded.img))
      return
    }
    let url
    try { url = await mediaUrl(path) } catch { return }
    const v = document.createElement('video'); v.preload = 'metadata'; v.src = url
    v.addEventListener('loadedmetadata', () => {
      const mdur = v.duration || 0
      ph.image = false; ph.srcDur = mdur || null
      ph.w = v.videoWidth || 0; ph.h = v.videoHeight || 0
      // Longer media keeps the slot's duration (srcDur lets the export trim
      // it); shorter media keeps its own length and says so.
      if (mdur && mdur < ph.duration - 0.05) { ph.duration = mdur; window.toast?.(t('vr_ph_shorter'), 'info') }
      finish()
      grabThumb(url, thumb => setThumb(ph, thumb))
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
        id: ++clipId, laneIdx: s.lane === -1 ? -1 : Math.max(0, s.lane | 0), startTime: Math.max(0, +s.start || 0),
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
    const on = !!selClip && !selClip.image && !ffRunning
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
    if (selClip.image) { window.toast?.(t('vr_img_no_tools'), 'info'); return null }
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
  // Runs through ffJob (progress bar + cancel; it adds `-y`, as ffmpeg has no
  // stdin to ask before overwriting a previous result of the same name).
  async function runFF(args, outPath, outName, folder, quiet) {
    const r = await ffJob(args, selClip?.srcDur || null, t('vc_running'))
    if (r.ok) {
      trackRecentFile(outPath, outName)
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder } }))
      window.toast?.(t('vc_done') + ' : ' + outName, 'success')
      return true
    }
    if (r.cancelled) { removeFile(outPath); window.toast?.(t('vr_job_cancelled'), 'info'); return false }
    if (!quiet) window.toast?.(t('vc_fail') + ' : ' + r.error, 'error')
    return false
  }
  const clipBase = c => (c.label || 'clip').replace(/\.[^.]+$/, '') || 'clip'

  // Mounts an ffmpeg RESULT right after the source clip. The output is its own
  // standalone file, so srcIn is 0 and srcDur is its OWN duration — never the
  // source's (otherwise the montage export would re-trim it).
  async function mountResult(outPath, label, srcLane, srcEnd, fallbackDur) {
    let url
    try { url = await mediaUrl(outPath) } catch { return }
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
        sim.style.cssText = 'width:calc(100% - 20px);margin:0 10px 4px;accent-color:var(--slider-color);'
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

  // ── ffmpeg jobs: progress + cancel ────────────────────────────────────────
  // Every ffmpeg run of the tool goes through `ffmpeg_job` (lib.rs): ffmpeg
  // reports its position, the bar under the timeline shows it, and the ✕
  // button kills the process. `total` = expected output length (s), or null.
  let curJob = null
  const clamp01 = v => Math.max(0, Math.min(1, v))
  function setJobFrac(f) {
    const known = f != null && Number.isFinite(f)
    jobBar.classList.toggle('indet', !known)
    jobFill.style.width = known ? Math.round(clamp01(f) * 100) + '%' : ''
    jobPct.textContent = known ? Math.round(clamp01(f) * 100) + '%' : ''
  }
  async function ffJob(args, total, label) {
    const job = 'vr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
    curJob = job
    jobLbl.textContent = label; jobEl.classList.add('on'); setJobFrac(total ? 0 : null)
    let unlisten = null
    try {
      unlisten = await window.__TAURI__.event.listen('ffmpeg-progress', e => {
        const p = e.payload || {}
        if (p.job === job && total) setJobFrac(p.time / total)
      })
    } catch { /* no events (web): the bar stays indeterminate */ }
    try {
      await window.__TAURI__.core.invoke('ffmpeg_job', { job, args: ['-y', ...args] })
      return { ok: true }
    } catch (e) {
      const msg = String(e?.message ?? e)
      return { ok: false, cancelled: msg === 'cancelled', error: msg }
    } finally {
      try { unlisten?.() } catch {}
      if (curJob === job) { curJob = null; jobEl.classList.remove('on') }
    }
  }
  jobCancel.addEventListener('click', () => { if (curJob) window.__TAURI__.core.invoke('ffmpeg_cancel', { job: curJob }).catch(() => {}) })
  const removeFile = p => window.__TAURI__?.core.invoke('delete_file', { path: p }).catch(() => {})

  // ── Export montage ────────────────────────────────────────────────────────
  // ONE ffmpeg pass (videorec-render.js) at the chosen size, frame rate and
  // quality: the sequence with its black gaps and transitions, every clip's
  // properties, markers, overlay clips, titles and the music.
  const saveExportCfg = () => { try { localStorage.setItem(EXPORT_KEY, JSON.stringify(exportCfg)) } catch {} }
  // Which sources carry sound (a silent source needs generated silence).
  function hasAudioStream(path) {
    if (!audioProbe.has(path)) {
      audioProbe.set(path, window.__TAURI__.core.invoke('ffmpeg_probe', { path })
        .then(log => /Stream #\d+:\d+[^\n]*: Audio:/.test(String(log)))
        .catch(() => false))
    }
    return audioProbe.get(path)
  }
  // Spot vignettes are painted here at the export size (canvas → PNG with
  // alpha, same radial formula as the live preview) and overlaid full-frame;
  // the files are deleted after the render.
  async function writeSpotPngs(W, H, place) {
    const spots = markers.filter(m => m.fn === 'spot')
    const files = []
    for (const m of spots) {
      const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H
      const ctx = cnv.getContext('2d')
      const pl = place(m)
      const cx = (pl.ox + m.x / 100 * pl.fw) * W, cy = (pl.oy + m.y / 100 * pl.fh) * H
      const r0 = Math.max(1, (m.params.radius || 25) / 100 * H * pl.fh)
      const a = Math.max(0, Math.min(0.9, (m.params.dark || 60) / 100))
      const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r0 + 0.18 * H * pl.fh)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,' + a + ')')   // canvas extends the last stop past the outer circle
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      const p = root + sep + '.montage-spot-' + (files.length + 1) + '.png'
      await window.__TAURI__.core.invoke('save_binary_file', { path: p, base64: cnv.toDataURL('image/png').split(',')[1] })
      files.push(p)
    }
    return files
  }
  // Settings popover: format, resolution, frame rate, quality, framing.
  // Each choice applies at once (the preview frame follows) and is remembered.
  function openExportPanel() {
    return actPopup(btnExport, (pop, finish) => {
      pop.style.minWidth = '250px'
      const head = document.createElement('div'); head.className = 'vr-prop-sec'; head.textContent = t('vr_export_montage'); pop.appendChild(head)
      const info = document.createElement('div'); info.style.cssText = 'padding:2px 10px 4px;font-size:10px;color:var(--text-secondary);font-variant-numeric:tabular-nums;'
      const paintInfo = () => {
        const { W, H } = exportSize(exportCfg, clips)
        const real = clips.filter(c => !c.placeholder && c.laneIdx >= 0)
        info.textContent = W + ' × ' + H + ' · ' + exportCfg.fps + ' ' + t('vr_fps_unit') + (real.length ? ' · ' + fmtTime(planRender({ clips: real, cfg: exportCfg }).total) : '')
      }
      const set = (key, v) => { exportCfg = cfgOf({ ...exportCfg, [key]: v }); saveExportCfg(); relayoutPreview(); paintInfo() }
      const RES_LBL = { 480: '480p', 720: '720p', 1080: '1080p', 1440: '1440p', 2160: '4K' }
      chipRow(pop, t('vr_exp_format'), ASPECTS.map(a => [a, a === 'auto' ? t('vr_exp_auto') : a]), () => exportCfg.aspect, v => set('aspect', v))
      chipRow(pop, t('vr_exp_res'), RESOLUTIONS.map(r => [r, RES_LBL[r]]), () => exportCfg.res, v => set('res', v))
      chipRow(pop, t('vr_exp_fps'), FPS_LIST.map(f => [f, String(f)]), () => exportCfg.fps, v => set('fps', v))
      chipRow(pop, t('vr_exp_quality'), [['high', t('vr_q_high')], ['standard', t('vr_q_std')], ['light', t('vr_q_light')]], () => exportCfg.quality, v => set('quality', v))
      chipRow(pop, t('vr_exp_fit'), [['contain', t('vr_fit_contain')], ['cover', t('vr_fit_cover')]], () => exportCfg.fit, v => set('fit', v))
      paintInfo(); pop.appendChild(info)
      const go = popBtn(t('vr_exp_go'), 'fa-file-export')
      go.style.fontWeight = '600'
      go.addEventListener('click', () => finish('go'))
      pop.appendChild(go)
    })
  }
  btnExport.addEventListener('click', async () => {
    if (ffRunning) return
    if (await openExportPanel() === 'go') exportMontage()
  })
  function exportMontage() {
    if (!window.__TAURI__ || window.__ICEAMPLE_WEB__) { window.toast?.(t('vc_tauri_only'), 'warn'); return }
    if (clips.some(c => c.placeholder)) window.toast?.(t('vr_ph_fill_first'), 'warn')
    const real = clips.filter(c => !c.placeholder)
    if (!real.some(c => c.laneIdx >= 0)) { window.toast?.(t('vc_no_video'), 'warn'); return }
    if (real.some(c => !c.savedPath)) { window.toast?.(t('vr_need_all_saved'), 'warn'); return }
    const lib = libInfo(); if (!lib) return
    ffAction(async () => {
      const base = await promptName(nameInp.value.trim() || t('vr_default_name'), { title: t('vr_export_montage') }); if (!base) return
      const folder = lib.root + lib.sep + 'Vidéos'
      const outPath = folder + lib.sep + base + '.mp4', outName = base + '.mp4'
      jobLbl.textContent = t('vr_job_export'); jobEl.classList.add('on'); setJobFrac(null)
      const plan = planRender({ clips: real, cfg: exportCfg })
      const paths = [...new Set(real.filter(c => !c.image).map(c => c.savedPath))]
      const sound = new Map(await Promise.all(paths.map(async p => [p, await hasAudioStream(p)])))
      let spotFiles = []
      if (markers.some(m => m.fn === 'spot')) {
        try { spotFiles = await writeSpotPngs(plan.W, plan.H, plan.place) }
        catch (e) { jobEl.classList.remove('on'); window.toast?.(t('vc_fail') + ' : ' + e, 'error'); return }
      }
      const { args, total } = buildRenderArgs(plan, {
        clips: real, texts, markers, music, outPath, spotFiles,
        fontFile: 'C\\:/Windows/Fonts/arial.ttf',
        hasAudio: p => !!sound.get(p),
      })
      const r = await ffJob(args, total, t('vr_job_export'))
      // Temporary pictures, plus the intermediates older versions left behind.
      for (const p of [...spotFiles, ...['.montage-pre.mp4', '.montage-txt.mp4', '.concat-list.txt'].map(n => lib.root + lib.sep + n)]) removeFile(p)
      if (r.ok) {
        trackRecentFile(outPath, outName)
        window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder } }))
        import('./file-routes.js').then(m => m.toastSaved(t('vc_done') + ' : ' + outName, outPath)).catch(() => window.toast?.(t('vc_done') + ' : ' + outName, 'success'))
      } else if (r.cancelled) { removeFile(outPath); window.toast?.(t('vr_job_cancelled'), 'info') }
      else window.toast?.(t('vc_fail') + ' : ' + r.error, 'error')
    })
  }

  // ── Drop video files ───────────────────────────────────────────────────────
  lanesEl.addEventListener('iceample-drop', async e => {
    const { file, clientX, clientY } = e.detail; if (!file) return
    const ext = file.name.toLowerCase()
    if (/\.icetpl$/.test(ext)) { loadTemplateFile(file.path); return }
    const isImg = IMG_EXT.test(ext)
    if (!isImg && !/\.(mp4|mov|webm|mkv|avi|m4v|3gp|ogv)$/.test(ext)) return
    const sr = scrollWrap.getBoundingClientRect()
    const li = laneIdxFromY(clientY), time = Math.max(0, (clientX - sr.left + scrollWrap.scrollLeft) / ZOOM)
    // A drop ON a placeholder fills that slot (keeping its start/duration);
    // coordinate-less forwarded drops fill the first empty slot instead of
    // appending at the end.
    let ph = clips.find(c => c.placeholder && c.laneIdx === li && time >= c.startTime && time < c.startTime + c.duration)
    if (!ph && e.detail.vrEnd) ph = clips.filter(c => c.placeholder).sort((a, b) => a.startTime - b.startTime)[0]
    if (ph) { fillPlaceholder(ph, file.path, file.name); return }
    if (isImg) { addImageMedia({ path: file.path, name: file.name }, li, e.detail.vrEnd ? null : time); return }
    let url
    try { url = await mediaUrl(file.path) } catch { return }
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
  // A drop on the overlay lane: same handler, the Y position picks lane -1.
  ovLane.addEventListener('iceample-drop', e => lanesEl.dispatchEvent(new CustomEvent('iceample-drop', { detail: e.detail, bubbles: false })))
  body.addEventListener('iceample-drop', e => {
    if (lanesEl.contains(e.target) || e.target === lanesEl || previewEl.contains(e.target) || e.target === previewEl || ovLane.contains(e.target)) return
    forwardDropToEnd(e.detail)
  })

  // ── Playback ──────────────────────────────────────────────────────────────
  // The preview follows the playhead: the main-lane clip under it (first lane
  // wins; a gap shows black, like the export), the overlay clip on top, fades
  // as opacity, speed as playbackRate, and the music. Paused, every playhead
  // move (ruler click, arrows, grip drag) shows the exact frame.
  const mainClipAt = time => clips.find(c => c.laneIdx >= 0 && !c.placeholder && c.startTime <= time && time < c.startTime + c.duration) || null
  const ovClipAt = time => clips.find(c => c.laneIdx === -1 && !c.placeholder && c.startTime <= time && time < c.startTime + c.duration) || null
  const srcTimeAt = (c, time) => (c.srcIn || 0) + Math.max(0, time - c.startTime) * fxOf(c).speed
  function fadeAlpha(c, time) {
    const fx = fxOf(c), rel = time - c.startTime, d = c.duration
    let a = 1
    if (fx.fadeIn > 0.01) a = Math.min(a, rel / Math.min(fx.fadeIn, d / 2))
    if (fx.fadeOut > 0.01) a = Math.min(a, (d - rel) / Math.min(fx.fadeOut, d / 2))
    return Math.max(0, Math.min(1, a))
  }
  function followTimeline(el, c, time) {
    const fx = fxOf(c)
    if (el.playbackRate !== fx.speed) el.playbackRate = fx.speed
    el.volume = Math.min(1, fx.vol); el.muted = fx.vol <= 0.001
    const want = srcTimeAt(c, time)
    if (isPlaying) {
      if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want
      if (el.paused) el.play().catch(() => {})
    } else {
      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - want) > 0.01) el.currentTime = want
    }
  }
  // Music preview (the export mixes it the same way: offset, volume, 2 s fade).
  const musicEl = new Audio(); musicEl.preload = 'auto'
  routeMedia(musicEl)
  let musicFor = null
  function syncMusic(time) {
    if (!music || !music.path || !isPlaying) { if (!musicEl.paused) musicEl.pause(); return }
    if (musicFor !== music.path) {
      musicFor = music.path
      const u = mediaUrlSync(music.path)
      if (u) musicEl.src = u
      else mediaUrl(music.path).then(x => { if (musicFor === music.path) musicEl.src = x }).catch(() => {})
    }
    const rel = time - (music.start || 0)
    if (rel < 0 || (music.duration && rel >= music.duration)) { if (!musicEl.paused) musicEl.pause(); return }
    let vol = Math.min(1, music.volume ?? 1)
    if (music.fadeOut) {
      const end = Math.min(contentEnd(), (music.start || 0) + (music.duration || Infinity))
      if (time > end - 2) vol *= Math.max(0, (end - time) / 2)
    }
    musicEl.volume = vol
    if (Math.abs(musicEl.currentTime - rel) > 0.3) musicEl.currentTime = rel
    if (musicEl.paused) musicEl.play().catch(() => {})
  }
  let vidClip = null
  function syncVideoToTime(time) {
    const c = mainClipAt(time)
    if (!c) { vidClip = null; vidEl.pause(); picEl.style.opacity = '0' }   // gap: black frame
    else {
      if (c !== vidClip) { vidClip = c; showClipMedia(c); if (selClip !== c && isPlaying) selectClip(c, true) }
      picEl.style.opacity = String(fadeAlpha(c, time))
      if (!c.image && vidEl.getAttribute('src')) followTimeline(vidEl, c, time)
    }
    const o = ovClipAt(time)
    if (o !== shownOv) showOverlayMedia(o)
    if (o) {
      ovlEl.style.opacity = String(fxOf(o).opacity / 100 * fadeAlpha(o, time))
      if (!o.image && ovVid.getAttribute('src')) followTimeline(ovVid, o, time)
    } else if (!ovVid.paused) ovVid.pause()
    syncMusic(time)
    emptyEl.style.display = clips.length ? 'none' : ''
  }
  function setPlayhead(time) {
    playheadTime = Math.max(0, time)
    playheadEl.style.left = (playheadTime * ZOOM) + 'px'; timeEl.textContent = fmtTime(playheadTime)
    if (isPlaying) { playOffset = playheadTime; playStart = performance.now() / 1000 }
    syncVideoToTime(playheadTime); updateTextOverlay(playheadTime); updateScrollbar()
  }
  function doPlay() {
    if (loopOn && loopStart != null && loopEnd != null && (playheadTime < loopStart || playheadTime >= loopEnd)) { playheadTime = loopStart; playheadEl.style.left = (playheadTime * ZOOM) + 'px' }
    isPlaying = true; btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>'
    playOffset = playheadTime; playStart = performance.now() / 1000
    vidClip = null
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
  function stopMedia() { vidEl.pause(); ovVid.pause(); musicEl.pause() }
  function doPause() {
    if (!isPlaying) return; isPlaying = false; cancelAnimationFrame(playRafId)
    playheadTime = playOffset + (performance.now() / 1000 - playStart)
    stopMedia(); btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
    setPlayhead(playheadTime)
  }
  function doStop() {
    isPlaying = false; cancelAnimationFrame(playRafId)
    stopMedia(); btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
    setPlayhead(0)
  }
  // Grip on the playhead (in the ruler): drag to scrub.
  const phGrip = document.createElement('div'); phGrip.className = 'vr-ph-grip'; playheadEl.appendChild(phGrip)
  phGrip.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const sr = scrollWrap.getBoundingClientRect()
    const onMove = ev => setPlayhead((ev.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM)
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  })
  btnPlay.addEventListener('click', () => { isPlaying ? doPause() : doPlay() })
  btnStop.addEventListener('click', () => { doStop() })
  btnHome.addEventListener('click', () => goToStart())
  body.querySelector('#vr-split').addEventListener('click', () => splitAtPlayhead())
  function onTransport(e) {
    const a = e.detail.action
    if (a === 'play') { if (e.detail.position != null) setPlayhead(e.detail.position); if (!isPlaying) doPlay() }
    else if (a === 'pause') doPause(); else doStop()
  }
  window.addEventListener('iceample-transport', onTransport)

  // ── Helpers ────────────────────────────────────────────────────────────────
  function goToStart() { setPlayhead(0) }
  function splitAtPlayhead() {
    const tp = playheadTime, affected = clips.filter(c => c.startTime + 0.1 < tp && tp < c.startTime + c.duration - 0.1); if (!affected.length) return
    const removed = affected.map(snapClip), created = []
    affected.forEach(c => { const cs = c.startTime, ce = cs + c.duration, si = c.srcIn || 0; unmountById(c.id); created.push(snapClip(mountClip({ ...snapClip(c), id: ++clipId, startTime: cs, duration: tp - cs, transition: null }))); created.push(snapClip(mountClip({ ...snapClip(c), id: ++clipId, startTime: tp, duration: ce - tp, srcIn: c.image ? 0 : si + (tp - cs) * fxOf(c).speed }))) })
    updateRuler(); updateScrollbar()
    pushHistory('vr split', () => { created.forEach(p => unmountById(p.id)); removed.forEach(mountClip); updateRuler(); updateScrollbar() }, () => { removed.forEach(r => unmountById(r.id)); created.forEach(mountClip); updateRuler(); updateScrollbar() })
  }
  function zoomBy(f) { const r = scrollWrap.getBoundingClientRect(); applyZoom(ZOOM * f, r.left + scrollWrap.clientWidth / 2) }
  function zoomReset() { const r = scrollWrap.getBoundingClientRect(); applyZoom(80, r.left + scrollWrap.clientWidth / 2) }
  function movePlayhead(beats) { setPlayhead(playheadTime + beats * (60 / getBpm())) }
  function stepFrame(dir) { setPlayhead(Math.round(playheadTime * exportCfg.fps + dir) / exportCfg.fps) }
  function playLoopRegion() {
    if (loopStart == null || loopEnd == null || loopEnd <= loopStart) return
    loopOn = true; updateLoopUI()
    setPlayhead(loopStart)
    if (!isPlaying) doPlay()
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  function onVrKey(e) {
    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    if (!body.contains(a) && !body.matches(':hover')) return
    if (matchesShortcut('marquee-clear', e)) { clearRange(); return }
    if ((matchesShortcut('clip-delete', e) || e.key === 'Backspace') && rangeReady()) { e.preventDefault(); carveRange(loopStart, loopEnd); clearRange(); return }
    if ((matchesShortcut('clip-delete', e) || e.key === 'Backspace') && selClip) { e.preventDefault(); deleteClip(selClip); return }
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); stepFrame(e.key === 'ArrowRight' ? 1 : -1); return }
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
  // The ffmpeg clip tools (cut, GIF, subtitles…) sit in a bar shown on demand.
  const TOOLS_KEY = 'iceample:videorec:tools'
  const showTools = on => { actionsEl.classList.toggle('hidden', !on); btnTools.classList.toggle('active', on); try { localStorage.setItem(TOOLS_KEY, on ? '1' : '0') } catch {} }
  showTools((() => { try { return localStorage.getItem(TOOLS_KEY) === '1' } catch { return false } })())
  btnTools.addEventListener('click', () => showTools(actionsEl.classList.contains('hidden')))
  updateRuler(); updateScrollbar(); playheadEl.style.left = '0px'
  previewReady = true
  relayoutPreview(); syncVideoToTime(0)
  const resizeObs = new ResizeObserver(() => { clampPreviewH(); updateRuler(); updateScrollbar(); relayoutPreview() })
  resizeObs.observe(scrollWrap); resizeObs.observe(body); resizeObs.observe(previewEl)

  const cleanObs = new MutationObserver(() => {
    if (!document.contains(body)) {
      doStop()
      if (curJob) window.__TAURI__?.core.invoke('ffmpeg_cancel', { job: curJob }).catch(() => {})
      musicEl.removeAttribute('src')
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
