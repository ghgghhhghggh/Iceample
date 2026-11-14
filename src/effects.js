// effects.js — Standalone image effects tool. Loads its own image independently,
// runs a stacked canvas 2D pipeline, manages built-in + user presets.
import { t } from './i18n.js'
import { promptName } from './rename-dialog.js'
import { FX, BUILTIN, runPipeline, compositeLocal, defaultParams, resolveFX, fxName, pmLabel, fxGroups, reduceForPreview } from './fx-engine.js'
const PREVIEW_MAX = 1600   // long side of the preview copy: the stack re-runs live on it
import { makeSendButton, imageMedia } from './media-bus.js'
import { registerTool, toDataURLAsync } from './project.js'
import { pushHistory } from './history.js'
import { themeColor } from './theme.js'
import { enhanceSidePanel } from './side-panel.js'
import { computeHistogram, drawHistogram, dataUrlBytes, readExif, exifLines } from './image-info.js'

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e }
function libRoot() { return localStorage.getItem('library:root') }

const STORE_KEY = 'iceample:fx-presets'
function loadUserPresets() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || [] } catch { return [] } }
function saveUserPresets(a) { localStorage.setItem(STORE_KEY, JSON.stringify(a)) }
// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('fx-styles')) return
  const s = document.createElement('style'); s.id = 'fx-styles'
  s.textContent = `
.fx-wrap{display:flex;flex-direction:column;height:100%;background:var(--surface);color:var(--text-primary);font-family:inherit;font-size:12px}
.fx-bar{display:flex;align-items:center;gap:4px;padding:7px 9px;border-bottom:1px solid var(--win-border-in);flex-shrink:0;flex-wrap:wrap}
.fx-btn{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;height:27px;border:1px solid var(--win-border);border-radius:7px;background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));color:var(--text-primary);font-size:11px;cursor:pointer;white-space:nowrap;font-family:inherit;transition:background .12s ease,border-color .12s ease,transform .08s ease}
.fx-btn:hover{background:color-mix(in srgb,var(--text-primary) 13%,var(--surface))}
.fx-btn:active{transform:translateY(1px)}
.fx-btn:disabled{opacity:.4;cursor:default}
.fx-sep{width:1px;height:20px;background:var(--win-border-in);margin:0 2px;flex-shrink:0}
.fx-main{display:flex;flex:1;overflow:hidden}
.fx-preview{flex:1;display:flex;align-items:center;justify-content:center;background:
  repeating-conic-gradient(color-mix(in srgb,var(--preview-bg),var(--text-primary) 3%) 0% 25%, color-mix(in srgb,var(--preview-bg),var(--text-primary) 1.5%) 0% 50%) 0 0/22px 22px;
  overflow:hidden;position:relative}
.fx-canvas{max-width:calc(100% - 32px);max-height:calc(100% - 32px);object-fit:contain;display:none;border-radius:8px;box-shadow:0 12px 32px -12px rgba(0,0,0,.65)}
.fx-empty-msg{display:flex;flex-direction:column;align-items:center;gap:10px;opacity:.4;pointer-events:none}
.fx-empty-msg i{font-size:38px}
.fx-empty-msg span{font-size:12px}
.fx-panel{width:236px;flex-shrink:0;border-left:1px solid var(--win-border-in);display:flex;flex-direction:column;overflow:hidden;background:var(--surface2)}
.fx-panel-head{display:flex;align-items:center;justify-content:space-between;padding:8px 11px;border-bottom:1px solid var(--win-border-in)}
.fx-panel-head span{font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px}
.fx-stack{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
.fx-no-fx{text-align:center;padding:28px 10px;color:var(--text-secondary);font-size:11px;opacity:.55}
.fx-item{background:color-mix(in srgb,var(--text-primary) 5%,var(--surface));border:1px solid var(--win-border-in);border-radius:8px;overflow:hidden;box-shadow:0 2px 8px -6px rgba(0,0,0,.6);transition:border-color .12s ease}
.fx-item:hover{border-color:color-mix(in srgb,var(--color-active) 35%,var(--win-border-in))}
.fx-item-head{display:flex;align-items:center;gap:6px;padding:7px 8px;cursor:default;user-select:none}
.fx-item-name{flex:1;font-size:11px;font-weight:600}
.fx-item-act{color:var(--text-secondary);cursor:pointer;font-size:10px;padding:3px 4px;opacity:.55;border-radius:4px;transition:opacity .1s ease,color .1s ease,background .1s ease}
.fx-item-act:hover{opacity:1;background:color-mix(in srgb,var(--text-primary) 10%,transparent)}
.fx-item-act.fx-item-del:hover{color:var(--vu-color-high);background:color-mix(in srgb,var(--vu-color-high) 14%,transparent)}
.fx-item-act.fx-item-disabled{cursor:not-allowed;opacity:.2;pointer-events:none}
.fx-item-body{padding:7px 9px 9px;border-top:1px solid var(--win-border-in);display:flex;flex-direction:column;gap:7px}
.fx-field{display:flex;flex-direction:column;gap:2px}
.fx-field label{font-size:10px;color:var(--text-secondary)}
.fx-field input[type=range]{width:100%;accent-color:var(--slider-color)}
.fx-field input[type=color]{width:36px;height:22px;border:1px solid var(--win-border);border-radius:4px;cursor:pointer;padding:0;background:none}
.fx-field .fx-val{font-size:10px;color:var(--text-secondary);text-align:right;opacity:.7}
.fx-row{display:flex;align-items:center;gap:4px}
.fx-add-btn{margin:2px 8px 8px;padding:8px;border:1px dashed var(--win-border);border-radius:8px;background:none;color:var(--text-secondary);cursor:pointer;font-size:11px;font-family:inherit;width:calc(100% - 16px);transition:border-color .12s ease,color .12s ease,background .12s ease}
.fx-add-btn:hover{border-color:var(--color-active);color:var(--text-primary);background:color-mix(in srgb,var(--color-active) 6%,transparent)}
.fx-drop-ov{position:absolute;inset:0;background:color-mix(in srgb,var(--color-active) 20%,transparent);border:2px dashed var(--color-active);display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:18px;color:var(--color-active);z-index:10}
.fx-pop{position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--win-border);border-radius:9px;box-shadow:0 12px 32px rgba(0,0,0,.6);min-width:160px;max-height:min(60vh,380px);overflow-y:auto;overflow-x:hidden;animation:fx-pop-in .12s ease}
@keyframes fx-pop-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.fx-pop-item{padding:7px 14px;cursor:pointer;font-size:11px;color:var(--text-primary);white-space:nowrap;transition:background .1s ease}
.fx-pop-item:hover{background:color-mix(in srgb,var(--text-primary) 10%,transparent)}
.fx-pop-sep{height:1px;background:var(--win-border-in);margin:3px 0}
.fx-pop-head{padding:5px 14px;font-size:9px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;pointer-events:none;opacity:.7}
.fx-lib-ov{position:absolute;inset:0;background:var(--surface);display:flex;flex-direction:column;z-index:5}
.fx-lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;padding:10px;overflow-y:auto;flex:1}
.fx-lib-item{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:5px;border-radius:6px;transition:background .1s ease}
.fx-lib-item:hover{background:var(--hover)}
.fx-lib-item img{width:72px;height:72px;object-fit:cover;border-radius:5px;background:var(--preview-bg)}
.fx-lib-item span{font-size:9px;text-align:center;overflow:hidden;max-width:76px;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary)}
.fx-local{display:flex;flex-direction:column;gap:7px;padding:8px 8px 9px;border-bottom:1px solid var(--win-border-in)}
.fx-local-toggle{justify-content:center}
.fx-local-toggle.fx-local-on{border-color:color-mix(in srgb,var(--color-active) 65%,var(--win-border));color:var(--color-active);background:color-mix(in srgb,var(--color-active) 12%,var(--surface))}
.fx-local-body{display:flex;flex-direction:column;gap:7px}
.fx-local-body[hidden]{display:none}
.fx-item.off{opacity:.55}
.fx-item.off .fx-item-body{display:none}
.fx-item-act.fx-on{opacity:.9;color:var(--color-active)}
.fx-btn.on{border-color:color-mix(in srgb,var(--color-active) 65%,var(--win-border));color:var(--color-active);background:color-mix(in srgb,var(--color-active) 12%,var(--surface))}
.fx-before{position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:3px 10px;border-radius:10px;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;background:color-mix(in srgb,var(--surface) 88%,transparent);border:1px solid var(--win-border);color:var(--text-primary);pointer-events:none;z-index:6;display:none}
.fx-info{position:absolute;left:10px;bottom:10px;width:232px;z-index:6;padding:9px 10px 8px;border-radius:9px;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid var(--win-border);box-shadow:0 10px 26px -12px rgba(0,0,0,.6);backdrop-filter:blur(10px);font-size:10px;color:var(--text-secondary);display:none}
.fx-info.on{display:block}
.fx-info canvas{width:100%;height:78px;display:block;border-radius:5px;background:color-mix(in srgb,var(--text-primary) 4%,transparent);margin:5px 0 6px}
.fx-info-row{display:flex;gap:6px;line-height:1.55}
.fx-info-row b{font-weight:600;color:var(--text-primary);min-width:62px}
.fx-info-gps{margin-top:4px;color:var(--warning);display:flex;gap:5px;align-items:flex-start}
.fx-pop-item{display:flex;align-items:center;gap:6px}
.fx-pop-del{margin-left:auto;opacity:.45;padding:2px 3px;border-radius:4px}
.fx-pop-del:hover{opacity:1;color:var(--danger);background:color-mix(in srgb,var(--danger) 14%,transparent)}
.fx-batch{padding:10px;min-width:250px}
.fx-batch .fx-chips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 8px}
.fx-chip{border:1px solid var(--win-border-in);border-radius:5px;padding:3px 8px;font-size:10px;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text-primary)}
.fx-chip.on{background:color-mix(in srgb,var(--color-active) 28%,var(--surface));border-color:color-mix(in srgb,var(--color-active) 60%,transparent)}
.fx-batch-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary)}
.fx-pin{position:absolute;z-index:4;transform:translate(-50%,-100%);pointer-events:none;color:var(--color-active);font-size:19px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.55));display:none}
`
  document.head.appendChild(s)
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initEffects(body) {
  injectStyles()
  let srcImg = null
  let stack = []
  let srcName = ''        // file name of the source (export default name)
  let srcExif = null      // EXIF of the source photo (JPEG), if any
  let prev = null         // { image, scale }: reduced copy the live preview runs on
  // Local (marker-centered) application — ONE marker at a time carrying its own
  // settings (« 1 marqueur = 1 fonction »). x/y are 0–1 fractions of the image;
  // radius is % of the min dimension; feather is the edge falloff (0–100).
  const local = { on: false, x: 0.5, y: 0.5, radius: 25, feather: 60 }

  body.innerHTML = `
<div class="fx-wrap">
  <div class="fx-bar">
    <button class="fx-btn" id="fx-open"><i class="fa-solid fa-folder-open"></i> ${t('fx_open')}</button>
    <button class="fx-btn" id="fx-lib"><i class="fa-solid fa-images"></i> ${t('fx_library')}</button>
    <input type="file" id="fx-file" accept="image/*" hidden />
    <span class="fx-sep"></span>
    <button class="fx-btn" id="fx-presets"><i class="fa-solid fa-layer-group"></i> ${t('fx_presets')} <i class="fa-solid fa-chevron-down" style="font-size:8px;margin-left:2px"></i></button>
    <button class="fx-btn" id="fx-save" title="${t('fx_save')}"><i class="fa-solid fa-floppy-disk"></i></button>
    <button class="fx-btn" id="fx-imp" title="${t('fx_import')}"><i class="fa-solid fa-file-import"></i></button>
    <input type="file" id="fx-imp-file" accept=".json" hidden />
    <span class="fx-sep"></span>
    <button class="fx-btn" id="fx-compare" title="${t('fx_compare_hint')}" disabled><i class="fa-solid fa-eye"></i> ${t('fx_compare')}</button>
    <button class="fx-btn" id="fx-info-btn" title="${t('fx_info')}"><i class="fa-solid fa-chart-column"></i></button>
    <span class="fx-sep"></span>
    <button class="fx-btn" id="fx-export" disabled><i class="fa-solid fa-download"></i> ${t('fx_export')}</button>
    <span id="fx-send-slot"></span>
    <button class="fx-btn" id="fx-batch" title="${t('fx_batch_hint')}"><i class="fa-solid fa-boxes-stacked"></i> ${t('fx_batch')}</button>
  </div>
  <div class="fx-main">
    <div class="fx-preview" id="fx-preview">
      <div class="fx-empty-msg" id="fx-empty"><i class="fa-solid fa-image"></i><span>${t('fx_empty')}</span></div>
      <canvas class="fx-canvas" id="fx-canvas"></canvas>
      <div class="fx-before" id="fx-before">${t('fx_before')}</div>
      <div class="fx-info" id="fx-info"></div>
    </div>
    <div class="fx-panel">
      <div class="fx-panel-head">
        <span>${t('fx_effects')}</span>
        <button class="fx-btn" id="fx-reset" style="padding:2px 7px;font-size:10px">${t('fx_reset')}</button>
      </div>
      <div class="fx-local">
        <button class="fx-btn fx-local-toggle" id="fx-local-toggle"><i class="fa-solid fa-location-dot"></i> ${t('fx_local')}</button>
        <div class="fx-local-body" id="fx-local-body" hidden>
          <div class="fx-field">
            <label>${t('fx_radius')}</label>
            <div class="fx-row"><input type="range" id="fx-local-radius" min="5" max="60" step="1" value="25" style="flex:1" /><span class="fx-val" id="fx-local-radius-val">25%</span></div>
          </div>
          <div class="fx-field">
            <label>${t('fx_local_feather')}</label>
            <div class="fx-row"><input type="range" id="fx-local-feather" min="0" max="100" step="1" value="60" style="flex:1" /><span class="fx-val" id="fx-local-feather-val">60%</span></div>
          </div>
        </div>
      </div>
      <div class="fx-stack" id="fx-stack"></div>
      <button class="fx-add-btn" id="fx-add"><i class="fa-solid fa-plus"></i> ${t('fx_add')}</button>
    </div>
  </div>
</div>`

  const canvas  = body.querySelector('#fx-canvas')
  const emptyEl = body.querySelector('#fx-empty')
  const stackEl = body.querySelector('#fx-stack')
  const preview = body.querySelector('#fx-preview')
  enhanceSidePanel(body.querySelector('.fx-panel'), { id: 'effects', min: 200, max: 460 })

  // ── Pipeline render ────────────────────────────────────────────────────────
  let rafId = null
  let stateRev = 0   // bumped on every repaint request → project auto-save change marker
  function scheduleRender() {
    stateRev++
    if (rafId) return
    rafId = requestAnimationFrame(() => { rafId = null; renderCanvas() })
  }
  let renderGen = 0
  let lastPipeOut = null   // cached full-frame pipeline result, for local-only re-composites
  // Single output seam: preview, export and bus-send all read #fx-canvas, so
  // compositing here guarantees they all carry the SAME (possibly localized) result.
  function blit(out) {
    const final = local.on && prev ? compositeLocal(prev.image, out, local) : out
    canvas.width = final.width; canvas.height = final.height
    canvas.getContext('2d').drawImage(final,0,0)
    body.querySelector('#fx-export').disabled = false
    body.querySelector('#fx-compare').disabled = false
    positionPin(); refreshInfo()
  }
  // The live preview runs on a reduced copy (pixel-sized settings scaled to
  // match) so every slider stays fluid on big photos; export and "send to"
  // run the same stack again at full size.
  function renderCanvas() {
    if (!srcImg || !prev) return
    const gen = ++renderGen
    runPipeline(prev.image, stack, { scale: prev.scale }).then(out => {
      if (gen !== renderGen) return   // a newer render started meanwhile — drop this stale one
      lastPipeOut = out
      if (!comparing) blit(out)
    }).catch(() => { if (gen === renderGen) window.toast?.(t('fx_render_fail'), 'error') })
  }
  async function renderFull() {
    const out = await runPipeline(srcImg, stack)
    return local.on ? compositeLocal(srcImg, out, local) : out
  }
  // Local-only changes (center, radius, feather, toggle) re-composite the cached
  // pipeline output instead of re-running every effect — the sliders stay fluid
  // even with heavy effects (oil, GPU passes) in the stack.
  let compRaf = null
  function scheduleComposite() {
    stateRev++
    if (!srcImg) return
    if (!lastPipeOut) { scheduleRender(); return }
    if (compRaf) return
    compRaf = requestAnimationFrame(() => { compRaf = null; if (lastPipeOut) blit(lastPipeOut) })
  }
  function showImage(img, name, dataUrl) {
    // Invalidate in-flight renders here, not just in renderCanvas: a slow
    // pipeline resolving between this call and the rAF would blit the OLD
    // effect result composited over the NEW source image.
    renderGen++
    srcImg = img; lastPipeOut = null
    prev = reduceForPreview(img, PREVIEW_MAX)
    srcName = String(name || '').replace(/\.[^.]+$/, '')
    srcExif = /^data:image\/jpe?g/i.test(dataUrl || '') ? readExif(dataUrlBytes(dataUrl)) : null
    emptyEl.style.display = 'none'; canvas.style.display = 'block'; scheduleRender()
  }
  // Every way in (file, library, drop, bus) goes through here: the data URL
  // keeps the file's own bytes, so a camera photo's EXIF can be read.
  function loadDataUrl(dataUrl, name) {
    const i = new Image()
    i.onload = () => showImage(i, name, dataUrl)
    i.onerror = () => window.toast?.(t('ie_load_fail'), 'error')
    i.src = dataUrl
  }

  // Media bus: image sent from another tool becomes the source; the rendered
  // RESULT can be shipped onward with the "send to…" button.
  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (!m || m.kind !== 'image' || !m.dataUrl) return
    const i = new Image()
    i.onload = () => { showImage(i, m.name, m.dataUrl); applyIncomingMarkers(m.markers) }
    i.src = m.dataUrl
  })
  // Optional `media.markers = [{x, y}]` (percent coords) rides the bus payload
  // untouched; the FIRST marker pre-centers Local mode with default settings
  // (« 1 marqueur = 1 fonction »). Malformed markers are ignored silently.
  function applyIncomingMarkers(markers) {
    if (!Array.isArray(markers) || !markers.length) return
    const x = Number(markers[0]?.x), y = Number(markers[0]?.y)
    if (!isFinite(x) || !isFinite(y)) return
    local.on = true
    local.x = Math.min(1, Math.max(0, x / 100))
    local.y = Math.min(1, Math.max(0, y / 100))
    local.radius = 25; local.feather = 60
    syncLocalUI(); scheduleComposite()
    window.toast?.(t('fx_local_hint'), 'info')
  }
  {
    // The full-size result, not the preview copy.
    const sendBtn = makeSendButton(async () => {
      if (!srcImg || !canvas.width) return null
      return imageMedia(await renderFull(), (srcName || t('tool_effects')) + '-fx')
    }, { self: 'effects', className: 'fx-btn', iconOnly: true })
    body.querySelector('#fx-send-slot').replaceWith(sendBtn)
  }

  // ── Local (marker-centered) application ────────────────────────────────────
  const pin = el('i','fa-solid fa-location-dot fx-pin')
  preview.appendChild(pin)
  const localToggle  = body.querySelector('#fx-local-toggle')
  const localBody    = body.querySelector('#fx-local-body')
  const localRadius  = body.querySelector('#fx-local-radius')
  const localFeather = body.querySelector('#fx-local-feather')
  const localRadiusVal  = body.querySelector('#fx-local-radius-val')
  const localFeatherVal = body.querySelector('#fx-local-feather-val')

  // The pin lives in .fx-preview (position:relative); the canvas is displayed
  // letterboxed inside it, so map the 0–1 image fractions through the canvas
  // client rect. Pointer-events none — clicks fall through to the canvas.
  function positionPin() {
    if (!local.on || !srcImg || canvas.style.display === 'none') { pin.style.display = 'none'; return }
    const pr = preview.getBoundingClientRect(), cr = canvas.getBoundingClientRect()
    if (!cr.width || !cr.height) { pin.style.display = 'none'; return }
    pin.style.display = 'block'
    pin.style.left = (cr.left - pr.left + local.x * cr.width) + 'px'
    pin.style.top  = (cr.top  - pr.top  + local.y * cr.height) + 'px'
  }
  function syncLocalUI() {
    localToggle.classList.toggle('fx-local-on', local.on)
    localBody.hidden = !local.on
    localRadius.value = local.radius;   localRadiusVal.textContent  = local.radius + '%'
    localFeather.value = local.feather; localFeatherVal.textContent = local.feather + '%'
    canvas.style.cursor = local.on ? 'crosshair' : ''
    positionPin()
  }
  localToggle.addEventListener('click', () => { local.on = !local.on; syncLocalUI(); scheduleComposite() })
  localRadius.addEventListener('input', () => { local.radius = parseFloat(localRadius.value); localRadiusVal.textContent = local.radius + '%'; scheduleComposite() })
  localFeather.addEventListener('input', () => { local.feather = parseFloat(localFeather.value); localFeatherVal.textContent = local.feather + '%'; scheduleComposite() })
  canvas.addEventListener('click', e => {
    if (!local.on || !srcImg) return
    const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return
    local.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    local.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    positionPin(); scheduleComposite()
  })
  // Keep the pin glued to the displayed canvas when the pane resizes.
  const pinRo = window.ResizeObserver ? new ResizeObserver(positionPin) : null
  pinRo?.observe(preview)

  // ── Undo ───────────────────────────────────────────────────────────────────
  // Each change of the stack (add, remove, move, on/off, preset, reset, a
  // finished slider move) is one step of the app's undo (Ctrl+Z).
  const snapStack = () => stack.map(i => ({ type: i.type, params: { ...i.params }, enabled: i.enabled !== false }))
  function setStack(st) { stack = st.map(i => ({ type: i.type, params: { ...i.params }, enabled: i.enabled !== false })); renderStack(); if (srcImg) scheduleRender() }
  function commit(label, before) {
    const after = snapStack()
    if (JSON.stringify(before) === JSON.stringify(after)) return
    pushHistory('fx ' + label, () => setStack(before), () => setStack(after))
  }
  let editBefore = null   // stack before the slider / colour being dragged
  const beginEdit = () => { if (!editBefore) editBefore = snapStack() }
  const endEdit = () => { if (editBefore) { commit('param', editBefore); editBefore = null } }

  // ── Stack UI ───────────────────────────────────────────────────────────────
  function renderStack() {
    stackEl.innerHTML = ''
    if (!stack.length) {
      const p = el('div','fx-no-fx'); p.textContent = t('fx_no_fx'); stackEl.appendChild(p); return
    }
    stack.forEach((item, idx) => {
      const def = resolveFX(item.type); if (!def) return
      const card = el('div','fx-item')
      const head = el('div','fx-item-head')
      const nameSpan = el('span','fx-item-name')
      nameSpan.innerHTML = `<i class="fa-solid ${def.icon}" style="margin-right:5px;font-size:10px;opacity:.65"></i>${fxName(def)}`
      const on = item.enabled !== false
      if (!on) card.classList.add('off')
      const eye = el('i','fa-solid ' + (on ? 'fa-eye fx-on' : 'fa-eye-slash') + ' fx-item-act'); eye.title = t('fx_toggle')
      eye.addEventListener('click', () => { const b = snapStack(); item.enabled = !on; renderStack(); scheduleRender(); commit('toggle', b) })
      const up = el('i','fa-solid fa-chevron-up fx-item-act' + (idx === 0 ? ' fx-item-disabled' : '')); up.title = t('fx_move_up')
      up.addEventListener('click', () => { if (idx > 0) { const b = snapStack(); [stack[idx-1], stack[idx]] = [stack[idx], stack[idx-1]]; renderStack(); scheduleRender(); commit('move', b) } })
      const down = el('i','fa-solid fa-chevron-down fx-item-act' + (idx === stack.length - 1 ? ' fx-item-disabled' : '')); down.title = t('fx_move_down')
      down.addEventListener('click', () => { if (idx < stack.length - 1) { const b = snapStack(); [stack[idx], stack[idx+1]] = [stack[idx+1], stack[idx]]; renderStack(); scheduleRender(); commit('move', b) } })
      const del = el('i','fa-solid fa-trash fx-item-act fx-item-del'); del.title = t('fx_remove')
      del.addEventListener('click', () => { const b = snapStack(); stack.splice(idx,1); renderStack(); scheduleRender(); commit('remove', b) })
      head.append(nameSpan, eye, up, down, del)
      const bdy = el('div','fx-item-body')
      def.params.forEach(pm => {
        const f = el('div','fx-field')
        const lbl = el('label'); lbl.textContent = pmLabel(pm)
        if (pm.type === 'range') {
          const row = el('div','fx-row')
          const inp = el('input'); inp.type='range'; inp.min=pm.min; inp.max=pm.max; inp.step=pm.step; inp.value=item.params[pm.id]??pm.def; inp.style.flex='1'
          const val = el('span','fx-val'); val.textContent = Number(inp.value).toFixed(pm.step < 1 ? 2 : 0)
          inp.addEventListener('pointerdown', beginEdit); inp.addEventListener('keydown', beginEdit)
          inp.addEventListener('input', () => { beginEdit(); item.params[pm.id] = parseFloat(inp.value); val.textContent = Number(inp.value).toFixed(pm.step<1?2:0); scheduleRender() })
          inp.addEventListener('change', endEdit)
          row.append(inp,val); f.append(lbl,row)
        } else if (pm.type === 'color') {
          const inp = el('input'); inp.type='color'; inp.value = item.params[pm.id]??pm.def
          inp.addEventListener('input', () => { beginEdit(); item.params[pm.id] = inp.value; scheduleRender() })
          inp.addEventListener('change', endEdit)
          f.append(lbl,inp)
        }
        bdy.appendChild(f)
      })
      card.append(head,bdy); stackEl.appendChild(card)
    })
  }

  // ── Popup ──────────────────────────────────────────────────────────────────
  function showPopup(anchor, items) {
    document.getElementById('fx-pop')?.remove()
    const pop = el('div','fx-pop'); pop.id = 'fx-pop'
    items.forEach(item => {
      if (item.sep)  { pop.appendChild(el('div','fx-pop-sep')); return }
      if (item.head) { const h=el('div','fx-pop-head'); h.textContent=item.head; pop.appendChild(h); return }
      const row = el('div','fx-pop-item'); row.innerHTML = item.label
      row.addEventListener('click', () => { pop.remove(); item.action?.() })
      if (item.del) {
        const d = el('i','fa-solid fa-trash fx-pop-del'); d.title = t('fx_remove')
        d.addEventListener('click', ev => { ev.stopPropagation(); pop.remove(); item.del() })
        row.appendChild(d)
      }
      pop.appendChild(row)
    })
    const r = anchor.getBoundingClientRect()
    pop.style.left = Math.min(r.left, window.innerWidth-200) + 'px'
    pop.style.top  = (r.bottom+4) + 'px'
    document.body.appendChild(pop)
    // Flip above the anchor (or clamp) if there isn't room below for it.
    const pr = pop.getBoundingClientRect()
    if (pr.bottom > window.innerHeight - 8) {
      const above = r.top - 4 - pr.height
      pop.style.top = (above >= 4 ? above : Math.max(4, window.innerHeight - pr.height - 8)) + 'px'
    }
    setTimeout(() => document.addEventListener('click', () => pop.remove(), {once:true}), 0)
  }

  // ── Add effect ─────────────────────────────────────────────────────────────
  body.querySelector('#fx-add').addEventListener('click', e => {
    const mkItem = type => { const def = FX[type]; return {
      label: `<i class="fa-solid ${def.icon}" style="margin-right:8px;width:12px;text-align:center;opacity:.7"></i>${fxName(def)}`,
      action() { const b = snapStack(); stack.push({type, params:defaultParams(def), enabled:true}); renderStack(); scheduleRender(); commit('add', b) }
    } }
    const items = []
    fxGroups().forEach(([key, ids], i) => { if (i) items.push({sep:true}); items.push({head:t(key)}); ids.forEach(id => items.push(mkItem(id))) })
    showPopup(e.currentTarget, items)
  })

  // ── Presets ────────────────────────────────────────────────────────────────
  body.querySelector('#fx-presets').addEventListener('click', e => {
    const userPresets = loadUserPresets()
    const items = [{head:t('fx_builtin')}, ...BUILTIN.map(pr => ({label:pr.name, action(){applyPreset(pr)}}))]
    if (userPresets.length) {
      items.push({sep:true},{head:t('fx_user')})
      userPresets.forEach((pr, i) => items.push({label:pr.name, action(){applyPreset(pr)}, del(){
        const arr = loadUserPresets(); arr.splice(i, 1); saveUserPresets(arr)
        window.toast?.(t('fx_preset_deleted') + ' : ' + pr.name, 'info')
      }}))
    }
    showPopup(e.currentTarget, items)
  })

  function applyPreset(pr) {
    const b = snapStack()
    stack = pr.effects
      .filter(item => resolveFX(item.type))
      .map(item => ({type:item.type, params:{...defaultParams(resolveFX(item.type)), ...item.params}, enabled:true}))
    renderStack(); scheduleRender(); commit('preset', b)
  }

  // ── Save preset ────────────────────────────────────────────────────────────
  body.querySelector('#fx-save').addEventListener('click', async () => {
    if (!stack.length) return
    const name = await promptName('', {title:t('fx_preset_name')}); if (!name) return
    const arr = loadUserPresets()
    arr.push({name, effects:stack.map(i => ({type:i.type, params:{...i.params}}))})
    saveUserPresets(arr)
    window.toast?.(t('fx_save') + ': ' + name, 'success')
  })

  // ── Import preset JSON ─────────────────────────────────────────────────────
  const impFile = body.querySelector('#fx-imp-file')
  body.querySelector('#fx-imp').addEventListener('click', () => impFile.click())
  impFile.addEventListener('change', () => {
    const f = impFile.files[0]; if (!f) return
    const r = new FileReader()
    r.onload = () => {
      try {
        const data = JSON.parse(r.result)
        const presets = Array.isArray(data) ? data : [data]
        const arr = loadUserPresets()
        presets.forEach(pr => { if (pr.name && Array.isArray(pr.effects)) arr.push(pr) })
        saveUserPresets(arr)
        window.toast?.(t('fx_imported'), 'success')
      } catch { window.toast?.(t('theme_invalid_json'), 'error') }
    }
    r.readAsText(f); impFile.value = ''
  })

  // ── Reset ──────────────────────────────────────────────────────────────────
  body.querySelector('#fx-reset').addEventListener('click', () => {
    const b = snapStack(); stack = []; renderStack(); if (srcImg) scheduleRender(); commit('reset', b)
  })

  // ── Export to library ──────────────────────────────────────────────────────
  body.querySelector('#fx-export').addEventListener('click', async () => {
    if (!window.__TAURI__) return
    const root = libRoot(); if (!root) { window.toast?.(t('vc_no_lib'), 'error'); return }
    const name = await promptName(srcName ? srcName + '-fx' : 'export', {title:t('fx_export')}); if (!name) return
    const sep = root.includes('\\') ? '\\' : '/'
    let b64
    try { b64 = (await renderFull()).toDataURL('image/png').split(',')[1] }
    catch { window.toast?.(t('fx_render_fail'), 'error'); return }
    try {
      await window.__TAURI__.core.invoke('save_binary_file', {path:root+sep+'Images'+sep+name+'.png', base64:b64})
      window.dispatchEvent(new CustomEvent('iceample-library-changed', {detail:{folder:root+sep+'Images'}}))
      window.toast?.(t('fx_export') + ': ' + name + '.png', 'success')
    } catch { window.toast?.(t('ie_export_fail'), 'error') }
  })

  // ── Open file ──────────────────────────────────────────────────────────────
  const fileInp = body.querySelector('#fx-file')
  body.querySelector('#fx-open').addEventListener('click', () => fileInp.click())
  fileInp.addEventListener('change', () => {
    const f = fileInp.files[0]; if (!f) return
    const r = new FileReader()
    r.onload = () => loadDataUrl(r.result, f.name)
    r.readAsDataURL(f); fileInp.value = ''
  })

  // ── Library ────────────────────────────────────────────────────────────────
  body.querySelector('#fx-lib').addEventListener('click', openLibrary)
  async function openLibrary() {
    if (!window.__TAURI__) return
    const root = libRoot(); if (!root) { window.toast?.(t('vc_no_lib'), 'error'); return }
    const sep = root.includes('\\') ? '\\' : '/'
    const {invoke} = window.__TAURI__.core
    let items = []
    for (const folder of ['Images','Modifiés','Importés']) {
      try { items = items.concat((await invoke('list_folder_contents',{path:root+sep+folder})) || []) } catch {}
    }
    items = items.filter(f => !f.is_dir && /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name))
    const ov = el('div','fx-lib-ov')
    const bar = el('div'); bar.style.cssText='display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--win-border-in)'
    const title = el('span'); title.style.cssText='flex:1;font-size:12px;font-weight:600'; title.textContent = t('fx_library')
    const cls = el('button','fx-btn'); cls.innerHTML='<i class="fa-solid fa-xmark"></i>'; cls.addEventListener('click',()=>ov.remove())
    bar.append(title,cls)
    const grid = el('div','fx-lib-grid')
    items.forEach(f => {
      const it = el('div','fx-lib-item')
      const img = el('img'); const span = el('span'); span.textContent = f.name
      it.append(img,span)
      const mime = /\.png$/i.test(f.name)?'image/png':/\.webp$/i.test(f.name)?'image/webp':/\.gif$/i.test(f.name)?'image/gif':'image/jpeg'
      ;(async()=>{ try { const b64=await invoke('read_file_base64',{path:f.path}); img.src='data:'+mime+';base64,'+b64 } catch {} })()
      it.addEventListener('click', ()=>{
        if (!img.src || img.src===window.location.href) return
        ov.remove(); loadDataUrl(img.src, f.name)
      })
      grid.appendChild(it)
    })
    ov.append(bar,grid); preview.appendChild(ov)
  }

  // ── Drag-drop ──────────────────────────────────────────────────────────────
  let dragCtr = 0
  const showDrop = () => { if (!preview.querySelector('.fx-drop-ov')) { const d=el('div','fx-drop-ov'); d.innerHTML='<i class="fa-solid fa-image"></i>'; preview.appendChild(d) } }
  const hideDrop = () => { dragCtr=0; preview.querySelector('.fx-drop-ov')?.remove() }
  preview.addEventListener('dragenter', e=>{ if (!e.dataTransfer?.types.includes('Files')) return; e.preventDefault(); dragCtr++; showDrop() })
  preview.addEventListener('dragleave', ()=>{ dragCtr=Math.max(0,dragCtr-1); if (!dragCtr) preview.querySelector('.fx-drop-ov')?.remove() })
  preview.addEventListener('dragover',  e=>e.preventDefault())
  preview.addEventListener('drop', e=>{
    e.preventDefault(); hideDrop()
    const f=e.dataTransfer?.files?.[0]; if (!f||!f.type.startsWith('image/')) return
    const r=new FileReader(); r.onload=()=>loadDataUrl(r.result, f.name); r.readAsDataURL(f)
  })
  // onDragDropEvent is webview-GLOBAL: its unlisten must be called at teardown,
  // or every open of this tool leaves another listener holding a dead body.
  let dead = false
  let dropUnlisten = null
  if (window.__TAURI__) {
    ;(async()=>{
      try {
        const wv = window.__TAURI__.webview?.getCurrentWebview?.()
        if (!wv?.onDragDropEvent) return
        dropUnlisten = await wv.onDragDropEvent(e=>{
          if (!document.contains(body)) return
          const {type,paths} = e.payload||{}
          if (type==='drop' && paths?.length) {
            const path=paths[0], ext=(path.split('.').pop()||'').toLowerCase()
            if (!['png','jpg','jpeg','webp','gif','bmp'].includes(ext)) return
            ;(async()=>{
              const b64 = await window.__TAURI__.core.invoke('read_file_base64',{path})
              const mime = ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='gif'?'image/gif':ext==='bmp'?'image/bmp':'image/jpeg'
              loadDataUrl('data:'+mime+';base64,'+b64, path.split(/[\\/]/).pop())
            })()
          }
        })
        if (dead) { dropUnlisten?.(); dropUnlisten = null }   // closed while awaiting
      } catch {}
    })()
  }

  // ── Library drop (drag from the library tool) ──────────────────────────────
  body.addEventListener('iceample-drop', async e => {
    const file = e.detail?.file
    if (!file || !window.__TAURI__) return
    const ext = (file.name.split('.').pop()||'').toLowerCase()
    if (!['png','jpg','jpeg','webp','gif','bmp'].includes(ext)) return
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', {path:file.path})
      const mime = ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='gif'?'image/gif':ext==='bmp'?'image/bmp':'image/jpeg'
      loadDataUrl('data:'+mime+';base64,'+b64, file.name)
    } catch {}
  })

  // ── Project registry (source image + effect stack + local marker) ──────────
  registerTool('effects', {
    el: body,
    rev: () => stateRev,
    getState: async () => ({
      src: srcImg ? await toDataURLAsync(srcImg) : null,
      stack: snapStack(),
      local: { ...local },
      name: srcName,
    }),
    setState: (state) => {
      if (!state) return
      if (Array.isArray(state.stack)) {
        stack = state.stack
          .filter(item => item && resolveFX(item.type))
          .map(item => ({ type: item.type, params: { ...defaultParams(resolveFX(item.type)), ...item.params }, enabled: item.enabled !== false }))
      }
      if (state.local) Object.assign(local, state.local)
      renderStack(); syncLocalUI()
      if (state.src) {
        const i = new Image()
        i.onload = () => { showImage(i, state.name || ''); positionPin() }
        i.src = state.src
      } else scheduleRender()
    },
  })

  // ── Before / after ─────────────────────────────────────────────────────────
  // Hold the button (or the B key over the tool) to see the original.
  let comparing = false
  const beforeTag = body.querySelector('#fx-before')
  function setCompare(on) {
    if (on === comparing || !prev) return
    comparing = on
    body.querySelector('#fx-compare').classList.toggle('on', on)
    beforeTag.style.display = on ? 'block' : 'none'
    if (on) {
      canvas.width = prev.image.width; canvas.height = prev.image.height
      const g = canvas.getContext('2d'); g.clearRect(0, 0, canvas.width, canvas.height); g.drawImage(prev.image, 0, 0)
    } else if (lastPipeOut) blit(lastPipeOut)
    else scheduleRender()
  }
  const cmpBtn = body.querySelector('#fx-compare')
  cmpBtn.addEventListener('pointerdown', e => { e.preventDefault(); try { cmpBtn.setPointerCapture(e.pointerId) } catch {} setCompare(true) })
  cmpBtn.addEventListener('pointerup', () => setCompare(false))
  cmpBtn.addEventListener('pointercancel', () => setCompare(false))
  const fxKeyDown = e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'b' || !body.matches(':hover')) return
    const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    setCompare(true)
  }
  const fxKeyUp = e => { if (e.key.toLowerCase() === 'b') setCompare(false) }
  document.addEventListener('keydown', fxKeyDown)
  document.addEventListener('keyup', fxKeyUp)

  // ── Info: histogram of the result, size, EXIF of the source photo ──────────
  const infoEl = body.querySelector('#fx-info')
  const infoBtn = body.querySelector('#fx-info-btn')
  let infoOn = (() => { try { return localStorage.getItem('iceample:fx:info') === '1' } catch { return false } })()
  let infoRaf = null
  function refreshInfo() {
    infoBtn.classList.toggle('on', infoOn)
    infoEl.classList.toggle('on', infoOn && !!srcImg)
    if (!infoOn || !srcImg || infoRaf) return
    infoRaf = requestAnimationFrame(() => {
      infoRaf = null
      const w = srcImg.naturalWidth || srcImg.width, h = srcImg.naturalHeight || srcImg.height
      infoEl.innerHTML = ''
      const row = (k, v) => { const d = el('div', 'fx-info-row'); const b = el('b'); b.textContent = k; const s2 = el('span'); s2.textContent = v; d.append(b, s2); infoEl.appendChild(d) }
      row(t('info_size'), w + ' × ' + h + ' px')
      const hc = el('canvas'); hc.width = 420; hc.height = 140; infoEl.appendChild(hc)
      drawHistogram(hc, computeHistogram(canvas), { fill: themeColor('--text-secondary') + '66', grid: themeColor('--win-border') })
      for (const [k, v] of exifLines(srcExif)) row(t(k), v)
      if (srcExif && srcExif.gps) {
        const g = el('div', 'fx-info-gps'); g.innerHTML = '<i class="fa-solid fa-location-dot"></i><span></span>'
        g.querySelector('span').textContent = t('info_gps'); infoEl.appendChild(g)
      }
    })
  }
  infoBtn.addEventListener('click', () => { infoOn = !infoOn; try { localStorage.setItem('iceample:fx:info', infoOn ? '1' : '0') } catch {} refreshInfo() })
  refreshInfo()

  // ── Batch: the current stack on many images ────────────────────────────────
  // Pick images → each one goes through the stack (and the local mask) at full
  // size, optionally resized, and lands in the library's Images folder as
  // "<name>-fx.<format>". The originals are never touched.
  const batchCfg = { fmt: 'png', q: 0.9, max: 0 }
  let batchRun = null   // { cancel } while running
  const batchBtn = body.querySelector('#fx-batch')
  function openBatch() {
    if (batchRun) { batchRun.cancel = true; return }   // the button doubles as "stop"
    document.getElementById('fx-pop')?.remove()
    const pop = el('div', 'fx-pop fx-batch'); pop.id = 'fx-pop'
    const head = el('div', 'fx-batch-lbl'); head.textContent = t('fx_batch_hint'); head.style.cssText = 'text-transform:none;letter-spacing:0;font-weight:400;font-size:11px;margin-bottom:8px;white-space:normal;color:var(--text-secondary)'
    pop.appendChild(head)
    const chips = (label, items, key) => {
      const l = el('div', 'fx-batch-lbl'); l.textContent = label
      const row = el('div', 'fx-chips')
      const paint = () => row.querySelectorAll('.fx-chip').forEach(b => b.classList.toggle('on', String(batchCfg[key]) === b.dataset.v))
      for (const [v, txt] of items) {
        const b = el('button', 'fx-chip'); b.textContent = txt; b.dataset.v = String(v)
        b.addEventListener('click', ev => { ev.stopPropagation(); batchCfg[key] = v; paint() })
        row.appendChild(b)
      }
      paint(); pop.append(l, row)
    }
    chips(t('fx_batch_format'), [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP']], 'fmt')
    chips(t('fx_batch_quality'), [[0.95, '95 %'], [0.9, '90 %'], [0.8, '80 %'], [0.7, '70 %']], 'q')
    chips(t('fx_batch_size'), [[0, t('fx_batch_orig')], [3840, '3840'], [2560, '2560'], [1920, '1920'], [1280, '1280']], 'max')
    const go = el('button', 'fx-btn'); go.innerHTML = '<i class="fa-solid fa-images"></i> '; go.appendChild(document.createTextNode(t('fx_batch_pick')))
    go.style.cssText = 'width:100%;justify-content:center'
    go.addEventListener('click', ev => { ev.stopPropagation(); pop.remove(); runBatch() })
    pop.appendChild(go)
    pop.addEventListener('click', ev => ev.stopPropagation())
    const r = batchBtn.getBoundingClientRect()
    document.body.appendChild(pop)
    pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px'
    pop.style.top = (r.bottom + 4) + 'px'
    setTimeout(() => document.addEventListener('click', () => pop.remove(), { once: true }), 0)
  }
  async function runBatch() {
    if (!window.__TAURI__) return
    const root = libRoot(); if (!root) { window.toast?.(t('vc_no_lib'), 'error'); return }
    if (!stack.some(i => i.enabled !== false)) { window.toast?.(t('fx_no_fx'), 'info'); return }
    const { invoke } = window.__TAURI__.core
    let paths
    try { paths = await invoke('pick_files_with_filter', { filterName: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }) } catch { paths = null }
    paths = (Array.isArray(paths) ? paths : paths ? [paths] : []).map(p => typeof p === 'string' ? p : p?.path).filter(Boolean)
    if (!paths.length) return
    const sep = root.includes('\\') ? '\\' : '/'
    const folder = root + sep + 'Images'
    const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
    const run = batchRun = { cancel: false }
    const label = batchBtn.innerHTML
    let done = 0, failed = 0
    for (const p of paths) {
      if (run.cancel) break
      batchBtn.innerHTML = `<i class="fa-solid fa-stop"></i> ${done + failed + 1}/${paths.length}`
      batchBtn.title = t('fx_batch_stop')
      try {
        const ext = (p.split('.').pop() || '').toLowerCase()
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg'
        const b64 = await invoke('read_file_base64', { path: p })
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:' + mime + ';base64,' + b64 })
        const src = batchCfg.max ? reduceForPreview(img, batchCfg.max).image : img
        let out = await runPipeline(src, stack)
        if (local.on) out = compositeLocal(src, out, local)
        if (batchCfg.fmt === 'jpg') {   // JPEG has no transparency: flatten on white
          const f = document.createElement('canvas'); f.width = out.width; f.height = out.height
          const g = f.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, f.width, f.height); g.drawImage(out, 0, 0); out = f
        }
        const data = out.toDataURL(MIME[batchCfg.fmt], batchCfg.fmt === 'png' ? undefined : batchCfg.q).split(',')[1]
        const base = (p.split(/[\\/]/).pop() || 'image').replace(/\.[^.]+$/, '')
        await invoke('save_binary_file', { path: folder + sep + base + '-fx.' + batchCfg.fmt, base64: data })
        done++
      } catch { failed++ }
    }
    batchRun = null
    batchBtn.innerHTML = label; batchBtn.title = t('fx_batch_hint')
    window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder } }))
    window.toast?.(t('fx_batch_done').replace('{n}', done) + (failed ? ' · ' + t('fx_batch_failed').replace('{n}', failed) : ''), failed ? 'warn' : 'success')
  }
  batchBtn.addEventListener('click', e => { e.stopPropagation(); openBatch() })

  // ── Teardown ──────────────────────────────────────────────────────────────
  const cleanObs = new MutationObserver(() => {
    if (document.contains(body)) return
    dead = true
    dropUnlisten?.(); dropUnlisten = null
    document.removeEventListener('keydown', fxKeyDown); document.removeEventListener('keyup', fxKeyUp)
    if (batchRun) batchRun.cancel = true
    pinRo?.disconnect()
    cleanObs.disconnect()
  })
  cleanObs.observe(document.body, { childList: true, subtree: true })

  renderStack()
}
