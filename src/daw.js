// ── Piste audio (DAW) ─────────────────────────────────────────────────────────
import { getCtx, getTrackNode } from './audio-bus.js'
import { t } from './i18n.js'
import { registerTool } from './project.js'
import { pushHistory } from './history.js'
import { getBpm } from './tempo.js'
import { matchesShortcut } from './shortcuts.js'
import { promptName, confirmUnsaved } from './rename-dialog.js'
import { registerCommands, unregisterCommandsBy } from './commands.js'
import { getMicStream, makeInputSwitch } from './devices.js'

function encodeWAV(audioBuffer) {
  const sr   = audioBuffer.sampleRate
  const len  = audioBuffer.length
  const left = audioBuffer.getChannelData(0)
  const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left
  const pcm  = new Int16Array(len * 2)
  for (let i = 0; i < len; i++) {
    pcm[i * 2]     = Math.max(-32768, Math.min(32767, left[i]  * 32767 | 0))
    pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, right[i] * 32767 | 0))
  }
  const buf  = new ArrayBuffer(44 + pcm.byteLength)
  const view = new DataView(buf)
  const str  = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); view.setUint32(4, 36 + pcm.byteLength, true)
  str(8, 'WAVE'); str(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 2, true);  view.setUint32(24, sr, true)
  view.setUint32(28, sr * 4, true); view.setUint16(32, 4, true)
  view.setUint16(34, 16, true); str(36, 'data')
  view.setUint32(40, pcm.byteLength, true)
  new Int16Array(buf, 44).set(pcm)
  return buf
}

function bufToBase64(ab) {
  const bytes = new Uint8Array(ab)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 8192)
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(bin)
}

let   ZOOM         = 80
const TIMELINE_DUR = 21600   // 6 heures — largeur fixe, infini pour l'usage réel
const LANE_H       = 58
const RULER_H      = 24
const ZOOM_MIN     = 0.5
const ZOOM_MAX     = 500

export function initDAW(body) {
  body.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;position:relative'

  // ── State ──────────────────────────────────────────────────────────────────
  const lanes      = [[], [], []]   // lanes[laneIdx] = array of clip objects
  // Default lane colours follow the theme (Clips, accent, master) until the
  // user picks one for a lane; the picked hex then stays with the project.
  const laneColors = ['var(--daw-clip-color)', 'var(--color-active)', 'var(--master-color)']
  let playing        = false
  let playCtxStart   = 0
  let activeSources  = []
  let rafId          = null
  let playheadTime   = 0    // position de lecture en secondes

  // ── Record state ───────────────────────────────────────────────────────────
  const armedLanes = new Set()   // lane indices ready to record
  let   recording       = false
  let   _mediaRecorder  = null
  let   _recChunks      = []
  let   _recStartTime   = 0      // playheadTime when rec started
  let   _recLane        = 0      // first armed lane at record start

  const LANE_PALETTE = [
    '#91D700','#9B32B9','#E65F00',
    '#6c5ce7','#4a9eff','#22c55e','#f59e0b','#e05555',
    '#a855f7','#06b6d4','#84cc16','#f97316','#ec4899',
    '#14b8a6','#8b5cf6',
  ]

  // ── DOM ────────────────────────────────────────────────────────────────────
  body.innerHTML = `
    <div class="daw-controls">
      <button class="seq-btn daw-play-btn" id="daw-play"><i class="fa-solid fa-play"></i></button>
      <button class="seq-btn" id="daw-stop"><i class="fa-solid fa-stop"></i></button>
      <button class="seq-btn daw-rec-btn" id="daw-rec" title="${t('daw_rec')}"><i class="fa-solid fa-circle"></i></button>
      <div class="seq-sep"></div>
      <button class="seq-btn daw-add-lane-btn" id="daw-add-lane" title="${t('daw_add_lane')}">
        <i class="fa-solid fa-plus"></i>
      </button>
      <div class="seq-sep"></div>
      <button class="seq-btn" id="daw-countin" title="${t('daw_countin')}"><i class="fa-solid fa-hourglass-start"></i></button>
      <div class="seq-sep"></div>
      <input class="seq-save-input" id="daw-save-name" type="text" placeholder="${t('daw_name_placeholder')}" maxlength="40" />
      <button class="seq-btn" id="daw-save-proj" title="${t('daw_save_title')}">
        <i class="fa-solid fa-floppy-disk"></i>
      </button>
      <button class="seq-btn" id="daw-export-wav" title="${t('daw_export_title')}">
        <i class="fa-solid fa-file-audio"></i>
      </button>
    </div>
    <div class="daw-main-area">
      <div class="daw-lane-sidebar" id="daw-lane-sidebar">
        <div class="daw-sidebar-spacer" id="daw-sidebar-spacer"></div>
        <div class="daw-sidebar-btns" id="daw-sidebar-btns"></div>
      </div>
      <div class="daw-right-col">
        <div class="daw-scrollbar-track" id="daw-sb-track">
          <div class="daw-scrollbar-thumb" id="daw-sb-thumb"></div>
        </div>
        <div class="daw-scroll-wrap" id="daw-scroll-wrap">
          <div class="daw-inner" id="daw-inner">
            <div class="daw-ruler" id="daw-ruler"></div>
            <div class="daw-lanes" id="daw-lanes"></div>
            <div class="daw-playhead" id="daw-playhead"></div>
          </div>
        </div>
      </div>
    </div>
  `

  const btnPlay      = body.querySelector('#daw-play')
  const btnStop      = body.querySelector('#daw-stop')

  // Snap to the beat grid (derived from the project tempo) — always on.
  function snapTime(sec) {
    const grid = 60 / getBpm()   // one beat
    return Math.round(sec / grid) * grid
  }

  // Count-in: a one-bar click before recording starts.
  const btnCountIn = body.querySelector('#daw-countin')
  let countInOn = false
  btnCountIn.addEventListener('click', () => {
    countInOn = !countInOn
    btnCountIn.classList.toggle('active', countInOn)
  })
  function playCountIn() {
    return new Promise(resolve => {
      const c = getCtx(); const beat = 60 / getBpm(); const beats = 4
      for (let i = 0; i < beats; i++) {
        const osc = c.createOscillator(), g = c.createGain()
        osc.connect(g); g.connect(c.destination)
        osc.type = 'sine'
        osc.frequency.value = i === 0 ? 1000 : 700
        const t0 = c.currentTime + i * beat
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.005)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05)
        osc.start(t0); osc.stop(t0 + 0.06)
      }
      setTimeout(resolve, beats * beat * 1000)
    })
  }

  const scrollWrap   = body.querySelector('#daw-scroll-wrap')
  const inner        = body.querySelector('#daw-inner')
  const rulerEl      = body.querySelector('#daw-ruler')
  const lanesEl      = body.querySelector('#daw-lanes')
  const playhead     = body.querySelector('#daw-playhead')
  const sbTrack      = body.querySelector('#daw-sb-track')
  const sbThumb      = body.querySelector('#daw-sb-thumb')
  const sidebarBtns  = body.querySelector('#daw-sidebar-btns')
  const sidebarSpacer = body.querySelector('#daw-sidebar-spacer')

  // ── Range selection / marquee (doubles as the loop region) ──────────────────
  let loopStart = null, loopEnd = null, loopOn = false
  const loopRegion = document.createElement('div')
  loopRegion.className = 'daw-loop-region'
  loopRegion.style.display = 'none'
  inner.appendChild(loopRegion)
  // Floating scissors button → cut & delete the marquee slice (also via Delete).
  const marqueeCut = document.createElement('button')
  marqueeCut.className = 'daw-marquee-cut'
  marqueeCut.title = t('marquee_cut')
  marqueeCut.innerHTML = '<i class="fa-solid fa-scissors"></i>'
  marqueeCut.style.display = 'none'
  inner.appendChild(marqueeCut)
  marqueeCut.addEventListener('mousedown', e => e.stopPropagation())
  marqueeCut.addEventListener('click', e => {
    e.stopPropagation()
    if (loopOn && loopStart != null && loopEnd != null && loopEnd > loopStart) { carveRange(loopStart, loopEnd); clearRange() }
  })
  function setRange(a, b) { loopStart = Math.min(a, b); loopEnd = Math.max(a, b); loopOn = loopEnd > loopStart; updateLoopUI() }
  function clearRange() { loopStart = loopEnd = null; loopOn = false; updateLoopUI() }
  function rebuildLane(li) {
    const laneEl = lanesEl.querySelector(`[data-lane="${li}"]`)
    if (!laneEl) return
    laneEl.querySelectorAll('.daw-clip').forEach(e => e.remove())
    lanes[li].forEach(c => laneEl.appendChild(buildClipEl(c)))
  }
  // Delete the marquee time-slice across all lanes, auto-splitting clips at the edges.
  function carveRange(t0, t1) {
    if (t1 <= t0) return
    const touched = []
    lanes.forEach((lc, li) => { if (lc.some(c => c.startTime < t1 && c.startTime + c.duration > t0)) touched.push(li) })
    if (!touched.length) return
    const before = touched.map(li => ({ li, clips: lanes[li].map(c => ({ ...c })) }))
    const carve = clips => {
      const out = []
      for (const c of clips) {
        const cs = c.startTime, ce = cs + c.duration, ts = c.trimStart || 0
        if (cs >= t1 || ce <= t0) { out.push(c); continue }
        if (cs < t0) out.push({ ...c, duration: t0 - cs })
        if (ce > t1) out.push({ ...c, id: c.id + '_r' + Math.floor(Math.random() * 1e6), startTime: t1, duration: ce - t1, trimStart: ts + (t1 - cs) })
      }
      return out
    }
    touched.forEach(li => { lanes[li] = carve(lanes[li]); rebuildLane(li) })
    const after = touched.map(li => ({ li, clips: lanes[li].map(c => ({ ...c })) }))
    const restore = st => st.forEach(({ li, clips }) => { lanes[li] = clips.map(c => ({ ...c })); rebuildLane(li) })
    pushHistory('marquee delete', () => restore(before), () => restore(after))
  }

  // ── Clip selection (multi) ──────────────────────────────────────────────────
  const selected = new Set()
  function setSel(clip, on) {
    if (on) selected.add(clip.id); else selected.delete(clip.id)
    lanesEl.querySelector(`[data-clip-id="${clip.id}"]`)?.classList.toggle('selected', on)
  }
  function clearSelection() {
    selected.forEach(id => lanesEl.querySelector(`[data-clip-id="${id}"]`)?.classList.remove('selected'))
    selected.clear()
  }
  function selectOnly(clip) { clearSelection(); setSel(clip, true) }
  function deleteSelected() {
    const removed = lanes.flat().filter(c => selected.has(c.id))
    if (!removed.length) return
    const snaps = removed.map(c => ({ ...c }))
    removed.forEach(c => {
      lanes[c.lane] = lanes[c.lane].filter(x => x.id !== c.id)
      lanesEl.querySelector(`[data-clip-id="${c.id}"]`)?.remove()
    })
    selected.clear()
    pushHistory('clip delete (multi)',
      () => snaps.forEach(s => { lanes[s.lane].push(s); lanesEl.querySelector(`[data-lane="${s.lane}"]`)?.appendChild(buildClipEl(s)) }),
      () => snaps.forEach(s => { lanes[s.lane] = lanes[s.lane].filter(x => x.id !== s.id); lanesEl.querySelector(`[data-clip-id="${s.id}"]`)?.remove() }))
  }
  // Drag the empty timeline → marquee range (loops + deletable). Plain click → clear.
  lanesEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    if (e.target.closest('.daw-clip')) return
    clearSelection()
    const sr = scrollWrap.getBoundingClientRect()
    const t0 = snapTime(Math.max(0, (e.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM))
    const x0 = e.clientX, y0 = e.clientY
    let dragged = false
    const onMove = ev => {
      if (!dragged && (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 3)) dragged = true
      if (!dragged) return
      const t1 = snapTime(Math.max(0, (ev.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM))
      setRange(t0, t1)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (!dragged) clearRange()       // plain click → clear the marquee/loop
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
  function rangeReady() { return loopOn && loopStart != null && loopEnd != null && loopEnd > loopStart }
  // Split every selected clip at the current playhead position.
  function splitSelectedAtPlayhead() {
    const targets = lanes.flat().filter(c =>
      selected.has(c.id) &&
      playheadTime > c.startTime + 0.1 &&
      playheadTime < c.startTime + c.duration - 0.1)
    targets.forEach(c => {
      const el = lanesEl.querySelector(`[data-clip-id="${c.id}"]`)
      if (el) splitClip(c, el, playheadTime - c.startTime)
    })
  }
  function selectAllClips() { clearSelection(); lanes.flat().forEach(c => setSel(c, true)) }
  // Duplicate selected clips right after themselves.
  function duplicateSelected() {
    const src = lanes.flat().filter(c => selected.has(c.id))
    if (!src.length) return
    clearSelection()
    const made = []
    src.forEach(c => {
      const copy = { ...c, id: 'clip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), startTime: c.startTime + c.duration }
      lanes[c.lane].push(copy)
      const laneEl = lanesEl.querySelector(`[data-lane="${c.lane}"]`)
      if (laneEl) laneEl.appendChild(buildClipEl(copy))
      made.push(copy); setSel(copy, true)
    })
    setTimelineWidth(); updateScrollbar()
    pushHistory('clip duplicate',
      () => made.forEach(m => { lanes[m.lane] = lanes[m.lane].filter(x => x.id !== m.id); lanesEl.querySelector(`[data-clip-id="${m.id}"]`)?.remove() }),
      () => made.forEach(m => { lanes[m.lane].push(m); const le = lanesEl.querySelector(`[data-lane="${m.lane}"]`); if (le) le.appendChild(buildClipEl(m)) }))
  }
  // Nudge selected clips (dir = -1 left, +1 right; frac of a beat, default 1).
  function nudgeSelected(dir, frac = 1) {
    const cs = lanes.flat().filter(c => selected.has(c.id))
    if (!cs.length) return
    const step = (60 / getBpm()) * frac
    const moves = cs.map(c => ({ c, from: c.startTime, to: Math.max(0, c.startTime + dir * step) }))
    moves.forEach(m => { m.c.startTime = m.to; const el = lanesEl.querySelector(`[data-clip-id="${m.c.id}"]`); if (el) _updateClipEl(el, m.c) })
    setTimelineWidth(); updateScrollbar()
    const redraw = m => { const el = lanesEl.querySelector(`[data-clip-id="${m.c.id}"]`); if (el) _updateClipEl(el, m.c) }
    pushHistory('clip nudge',
      () => moves.forEach(m => { m.c.startTime = m.from; redraw(m) }),
      () => moves.forEach(m => { m.c.startTime = m.to; redraw(m) }))
  }
  function zoomBy(factor) {
    const r = scrollWrap.getBoundingClientRect()
    applyZoom(ZOOM * factor, r.left + scrollWrap.clientWidth / 2)
  }
  function zoomReset() {
    const r = scrollWrap.getBoundingClientRect()
    applyZoom(80, r.left + scrollWrap.clientWidth / 2)
  }
  function movePlayhead(beats) { seekTo(playheadTime + beats * (60 / getBpm())) }
  function playLoopRegion() {
    if (loopStart == null || loopEnd == null || loopEnd <= loopStart) return
    loopOn = true; updateLoopUI(); seekTo(loopStart); if (!playing) play()
  }
  // Customizable shortcuts (active only when the tool is focused/hovered).
  function onDawKey(e) {
    const a = document.activeElement
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    if (!body.contains(a) && !body.matches(':hover')) return
    if (matchesShortcut('marquee-clear', e)) { clearRange(); clearSelection(); return }
    if (matchesShortcut('clip-delete', e) || e.key === 'Backspace') {
      if (selected.size) { e.preventDefault(); deleteSelected(); return }
      if (rangeReady())  { e.preventDefault(); carveRange(loopStart, loopEnd); clearRange(); return }
    }
    if (matchesShortcut('marquee-cut', e)) { if (rangeReady()) { e.preventDefault(); carveRange(loopStart, loopEnd); clearRange() } return }
    if (matchesShortcut('clip-split', e))  { e.preventDefault(); splitSelectedAtPlayhead(); return }
    if (matchesShortcut('count-in', e))    { e.preventDefault(); btnCountIn.click(); return }
    if (matchesShortcut('go-to-start', e)) { e.preventDefault(); seekTo(0); return }
    if (matchesShortcut('loop-toggle', e)) {
      e.preventDefault()
      if (loopStart != null && loopEnd != null && loopEnd > loopStart) { loopOn = !loopOn; updateLoopUI() }
      return
    }
    if (matchesShortcut('select-all', e))      { e.preventDefault(); selectAllClips(); return }
    if (matchesShortcut('clip-duplicate', e))  { e.preventDefault(); duplicateSelected(); return }
    if (matchesShortcut('clip-nudge-left', e)) { e.preventDefault(); nudgeSelected(-1); return }
    if (matchesShortcut('clip-nudge-right', e)){ e.preventDefault(); nudgeSelected(1); return }
    if (matchesShortcut('zoom-in', e))         { e.preventDefault(); zoomBy(1.2); return }
    if (matchesShortcut('zoom-out', e))        { e.preventDefault(); zoomBy(1 / 1.2); return }
    if (matchesShortcut('record', e))          { e.preventDefault(); btnRec.click(); return }
    if (matchesShortcut('new-track', e))       { e.preventDefault(); body.querySelector('#daw-add-lane')?.click(); return }
    if (matchesShortcut('zoom-reset', e))      { e.preventDefault(); zoomReset(); return }
    if (matchesShortcut('playhead-left', e))   { e.preventDefault(); movePlayhead(-1); return }
    if (matchesShortcut('playhead-right', e))  { e.preventDefault(); movePlayhead(1); return }
    if (matchesShortcut('play-loop', e))       { e.preventDefault(); playLoopRegion(); return }
    if (matchesShortcut('nudge-fine-left', e)) { e.preventDefault(); nudgeSelected(-1, 0.25); return }
    if (matchesShortcut('nudge-fine-right', e)){ e.preventDefault(); nudgeSelected(1, 0.25) }
  }
  document.addEventListener('keydown', onDawKey)

  function updateLoopUI() {
    if (loopStart == null || loopEnd == null || loopEnd <= loopStart) {
      loopRegion.style.display = 'none'
      marqueeCut.style.display = 'none'
      return
    }
    loopRegion.style.display = ''
    loopRegion.style.left  = (loopStart * ZOOM) + 'px'
    loopRegion.style.width = ((loopEnd - loopStart) * ZOOM) + 'px'
    loopRegion.classList.toggle('active', loopOn)
    marqueeCut.style.display = ''
    marqueeCut.style.left = (loopStart * ZOOM + 4) + 'px'
  }
  // Drag on the ruler → set the marquee range (snapped); a plain click → seek.
  rulerEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    const sr = scrollWrap.getBoundingClientRect()
    const t0 = snapTime(Math.max(0, (e.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM))
    let dragged = false
    const onMove = ev => {
      const t1 = snapTime(Math.max(0, (ev.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM))
      if (Math.abs(t1 - t0) > 0.0001) dragged = true
      if (dragged) { clearSelection(); setRange(t0, t1) }
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (!dragged) seekTo(t0)           // plain click → move playhead
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  const MIN_DUR = 120
  // Dynamic timeline length = content end + view headroom (capped at TIMELINE_DUR)
  // so the scrollbar maps to the actually-used range, not a fixed 6 h.
  function tlDur() {
    let end = 0
    for (const lc of lanes) for (const c of lc) end = Math.max(end, c.startTime + c.duration)
    const viewDur   = scrollWrap.clientWidth / ZOOM
    const viewRight = scrollWrap.scrollLeft / ZOOM + viewDur
    return Math.min(TIMELINE_DUR, Math.max(MIN_DUR, end + 30, viewRight + viewDur, (playheadTime || 0) + 30))
  }
  function setTimelineWidth() {
    const w = Math.round(tlDur() * ZOOM) + 'px'
    inner.style.width = w
    lanesEl.querySelectorAll('.daw-lane').forEach(l => l.style.width = w)
  }

  setTimelineWidth()

  // ── Ruler (virtualisé — seulement les marques visibles) ────────────────────
  function buildRuler() {
    rulerEl.innerHTML = ''
    rulerEl.style.width = Math.round(tlDur() * ZOOM) + 'px'
    const niceSteps = [1,2,5,10,15,30,60,120,300,600,900,1800,3600]
    const step = niceSteps.find(s => s * ZOOM >= 60) ?? 3600
    const visStart = Math.floor(scrollWrap.scrollLeft / ZOOM / step) * step
    const visEnd   = Math.ceil((scrollWrap.scrollLeft + scrollWrap.clientWidth) / ZOOM) + step * 2
    for (let t = Math.max(0, visStart); t <= Math.min(tlDur(), visEnd); t += step) {
      const mark = document.createElement('div')
      mark.className = 'daw-ruler-mark'
      mark.style.left = (t * ZOOM) + 'px'
      const h = Math.floor(t / 3600)
      const m = Math.floor((t % 3600) / 60)
      const s = t % 60
      mark.textContent = h > 0
        ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}s`
      rulerEl.appendChild(mark)
    }
  }

  // ── Lanes DOM ──────────────────────────────────────────────────────────────
  function buildLanes() {
    lanesEl.innerHTML = ''
    sidebarBtns.innerHTML = ''
    // Spacer matches scrollbar-track height (6px) + ruler height (24px) = 30px
    sidebarSpacer.style.height = (6 + RULER_H) + 'px'

    lanes.forEach((laneClips, li) => {
      lanesEl.appendChild(buildLaneEl(li, laneClips))
      sidebarBtns.appendChild(buildSidebarBtn(li))
    })
    updateInnerHeight()
  }

  function buildLaneEl(li, laneClips) {
    const laneEl = document.createElement('div')
    laneEl.className = 'daw-lane'
    laneEl.dataset.lane = li
    laneEl.style.width = Math.round(tlDur() * ZOOM) + 'px'
    laneClips.forEach(clip => laneEl.appendChild(buildClipEl(clip)))
    return laneEl
  }

  function buildSidebarBtn(li) {
    const wrap = document.createElement('div')
    wrap.className = 'daw-sidebar-btn-row'
    wrap.dataset.lane = li

    const armBtn = document.createElement('button')
    armBtn.className = 'daw-arm-btn' + (armedLanes.has(li) ? ' armed' : '')
    armBtn.dataset.lane = li
    armBtn.title = t('daw_arm')
    armBtn.innerHTML = '<i class="fa-solid fa-record-vinyl"></i>'
    armBtn.addEventListener('click', e => {
      e.stopPropagation()
      if (armedLanes.has(li)) { armedLanes.delete(li); armBtn.classList.remove('armed') }
      else                    { armedLanes.add(li);    armBtn.classList.add('armed') }
    })

    const colorBtn = document.createElement('button')
    colorBtn.className = 'daw-color-btn'
    colorBtn.dataset.lane = li
    colorBtn.style.background = laneColors[li] || 'var(--daw-clip-color)'
    colorBtn.title = t('daw_track_color')
    colorBtn.addEventListener('click', e => { e.stopPropagation(); showLaneColorPicker(li, colorBtn) })

    wrap.append(armBtn, colorBtn)
    return wrap
  }

  function updateSidebarBtn(li) {
    const btn = sidebarBtns.querySelector(`.daw-color-btn[data-lane="${li}"]`)
    if (btn) btn.style.background = laneColors[li] || 'var(--daw-clip-color)'
  }

  let _colorPicker = null
  function showLaneColorPicker(li, anchor) {
    if (_colorPicker) { _colorPicker.remove(); _colorPicker = null }
    const picker = document.createElement('div')
    picker.className = 'daw-lane-color-picker'
    _colorPicker = picker

    LANE_PALETTE.forEach(color => {
      const swatch = document.createElement('div')
      swatch.className = 'daw-lane-color-swatch'
      swatch.style.background = color
      if (color === (laneColors[li] || 'var(--daw-clip-color)')) swatch.style.borderColor = 'var(--text-primary)'
      swatch.addEventListener('click', e => {
        e.stopPropagation()
        laneColors[li] = color
        // Update all clips in this lane
        lanesEl.querySelectorAll(`[data-lane="${li}"] .daw-clip`).forEach(cl => {
          cl.style.background = color
        })
        // Update sidebar button
        updateSidebarBtn(li)
        picker.remove(); _colorPicker = null
      })
      picker.appendChild(swatch)
    })

    const rect = anchor.getBoundingClientRect()
    picker.style.left = rect.right + 6 + 'px'
    picker.style.top  = rect.top + 'px'
    document.body.appendChild(picker)

    const closePicker = e => {
      if (!picker.contains(e.target)) { picker.remove(); _colorPicker = null; document.removeEventListener('click', closePicker) }
    }
    setTimeout(() => document.addEventListener('click', closePicker), 0)
  }

  function updateInnerHeight() {
    inner.style.height = (RULER_H + lanes.length * LANE_H) + 'px'
  }

  // Grow (or shrink) the window so all lanes are visible, clamped to the workspace.
  function autoResizeWindow() {
    const win = body.closest('.tool-win')
    if (!win) return
    const chrome = win.offsetHeight - scrollWrap.clientHeight   // titlebar + controls + scrollbar
    const desired = chrome + RULER_H + lanes.length * LANE_H + 4
    const wb = win.parentElement
    const maxH = wb ? wb.clientHeight - 10 : desired
    win.style.height = Math.min(desired, Math.max(160, maxH)) + 'px'
  }

  // ── Clip element ───────────────────────────────────────────────────────────
  // ── Clip waveform rendering ────────────────────────────────────────────────
  function drawClipWave(el, clip) {
    const canvas = el.querySelector('.daw-clip-wave')
    if (!canvas || !clip.buffer) return   // decoded audio lives in clip.buffer
    const dispW = Math.max(1, Math.round(clip.duration * ZOOM))
    const h     = Math.max(1, Math.round(el.clientHeight || 40))
    const cw    = Math.min(dispW, 2000)   // cap internal resolution
    canvas.width = cw; canvas.height = h
    const ctx  = canvas.getContext('2d')
    ctx.clearRect(0, 0, cw, h)
    const buf  = clip.buffer
    const sr   = buf.sampleRate
    const data = buf.getChannelData(0)
    const startS = Math.floor((clip.trimStart || 0) * sr)
    const lenS   = Math.floor((clip.duration  || 0) * sr)
    const per    = Math.max(1, Math.floor(lenS / cw))
    const mid    = h / 2
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    for (let x = 0; x < cw; x++) {
      let min = 1, max = -1
      const s0 = startS + x * per
      for (let i = 0; i < per; i++) {
        const v = data[s0 + i]
        if (v === undefined) break
        if (v < min) min = v
        if (v > max) max = v
      }
      if (max < min) continue
      const y1 = mid - max * mid * 0.92
      const y2 = mid - min * mid * 0.92
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
    }
  }
  function scheduleWave(el, clip) {
    if (el._waveRaf) cancelAnimationFrame(el._waveRaf)
    el._waveRaf = requestAnimationFrame(() => { el._waveRaf = null; drawClipWave(el, clip) })
  }

  function _updateClipEl(el, clip) {
    el.style.left  = (clip.startTime * ZOOM) + 'px'
    el.style.width = (clip.duration  * ZOOM) + 'px'
    // Redraw fade overlays
    const fiEl = el.querySelector('.daw-clip-fade-in')
    const foEl = el.querySelector('.daw-clip-fade-out')
    if (fiEl) fiEl.style.width = Math.min((clip.fadeIn  || 0) * ZOOM, el.offsetWidth / 2) + 'px'
    if (foEl) foEl.style.width = Math.min((clip.fadeOut || 0) * ZOOM, el.offsetWidth / 2) + 'px'
    const gainEl = el.querySelector('.daw-clip-gain')
    if (gainEl) gainEl.textContent = (clip.gain ?? 1).toFixed(2) + '×'
    scheduleWave(el, clip)
    setTimelineWidth(); updateScrollbar()   // keep the timeline/scrollbar in sync with content
  }

  function buildClipEl(clip) {
    // Ensure clip has all editing fields
    clip.fadeIn  = clip.fadeIn  ?? 0
    clip.fadeOut = clip.fadeOut ?? 0
    clip.gain    = clip.gain    ?? 1
    clip.trimStart = clip.trimStart ?? 0  // seconds trimmed from buffer start

    const el = document.createElement('div')
    el.className = 'daw-clip'
    el.dataset.clipId = clip.id
    el.style.left       = (clip.startTime * ZOOM) + 'px'
    el.style.width      = (clip.duration  * ZOOM) + 'px'
    el.style.background = laneColors[clip.lane] || 'var(--daw-clip-color)'
    el.title = clip.name

    // Waveform (rendered behind the labels/overlays)
    const wave = document.createElement('canvas')
    wave.className = 'daw-clip-wave'
    el.appendChild(wave)

    // Fade-in overlay
    const fadeIn = document.createElement('div')
    fadeIn.className = 'daw-clip-fade-in'
    fadeIn.style.width = Math.min(clip.fadeIn * ZOOM, 0) + 'px'
    el.appendChild(fadeIn)

    // Fade-out overlay
    const fadeOut = document.createElement('div')
    fadeOut.className = 'daw-clip-fade-out'
    fadeOut.style.width = Math.min(clip.fadeOut * ZOOM, 0) + 'px'
    el.appendChild(fadeOut)

    // Clip name
    const name = document.createElement('span')
    name.className = 'daw-clip-name'
    name.textContent = clip.name
    el.appendChild(name)

    // Gain badge
    const gainEl = document.createElement('span')
    gainEl.className = 'daw-clip-gain'
    gainEl.textContent = (clip.gain === 1 ? '' : clip.gain.toFixed(2) + '×')
    gainEl.title = t('daw_clip_gain')
    el.appendChild(gainEl)

    // Left trim handle
    const trimL = document.createElement('div')
    trimL.className = 'daw-clip-trim daw-clip-trim-l'
    trimL.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.stopPropagation(); e.preventDefault()
      const startX = e.clientX
      const origStart = clip.startTime, origDur = clip.duration, origTrim = clip.trimStart
      const onMove = ev => {
        const dx  = (ev.clientX - startX) / ZOOM
        const newStart = snapTime(Math.max(0, origStart + dx))
        const delta    = newStart - origStart
        const newDur   = origDur - delta
        const newTrim  = origTrim + delta
        if (newDur < 0.1 || newTrim < 0) return
        clip.startTime = newStart; clip.duration = newDur; clip.trimStart = newTrim
        _updateClipEl(el, clip)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        pushHistory('clip trim-l',
          () => { clip.startTime = origStart; clip.duration = origDur; clip.trimStart = origTrim; _updateClipEl(el, clip) },
          () => { clip.startTime = clip.startTime; _updateClipEl(el, clip) }
        )
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    el.appendChild(trimL)

    // Right trim handle
    const trimR = document.createElement('div')
    trimR.className = 'daw-clip-trim daw-clip-trim-r'
    trimR.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.stopPropagation(); e.preventDefault()
      const startX = e.clientX
      const origDur = clip.duration
      const onMove = ev => {
        const dx = (ev.clientX - startX) / ZOOM
        const newDur = Math.max(0.1, snapTime(clip.startTime + Math.max(0.1, origDur + dx)) - clip.startTime)
        // Don't exceed buffer length
        if (clip.buffer && newDur + clip.trimStart > clip.buffer.duration) return
        clip.duration = newDur
        _updateClipEl(el, clip)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        pushHistory('clip trim-r',
          () => { clip.duration = origDur; _updateClipEl(el, clip) },
          () => { _updateClipEl(el, clip) }
        )
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
    el.appendChild(trimR)

    // Main drag (only when not clicking trim/del) + selection
    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      if (e.target.closest('.daw-clip-trim')) return
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        setSel(clip, !selected.has(clip.id))   // toggle in selection, no drag
        return
      }
      if (!selected.has(clip.id)) selectOnly(clip)
      startClipDrag(e, clip, el)
    })

    // Context menu — clip editing options
    el.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation()
      showClipContextMenu(e, clip, el)
    })

    // Ctrl+click → split clip at cursor
    el.addEventListener('click', e => {
      if (!e.ctrlKey) return
      e.stopPropagation()
      const elRect = el.getBoundingClientRect()
      const offsetSec = (e.clientX - elRect.left) / ZOOM
      if (offsetSec < 0.1 || offsetSec > clip.duration - 0.1) return
      splitClip(clip, el, offsetSec)
    })

    _updateClipEl(el, clip)
    return el
  }

  // ── Clip split ─────────────────────────────────────────────────────────────
  function splitClip(clip, el, offsetSec) {
    const origDur   = clip.duration
    const origStart = clip.startTime
    const splitAt   = clip.startTime + offsetSec

    // Shorten original
    clip.duration = offsetSec
    el.style.width = (offsetSec * ZOOM) + 'px'
    _updateClipEl(el, clip)

    // Create right half
    const right = {
      ...clip,
      id:        'clip_' + Date.now(),
      startTime: splitAt,
      duration:  origDur - offsetSec,
      trimStart: (clip.trimStart || 0) + offsetSec,
    }
    lanes[clip.lane].push(right)
    const laneEl = lanesEl.querySelector(`[data-lane="${clip.lane}"]`)
    const rightEl = buildClipEl(right)
    if (laneEl) laneEl.appendChild(rightEl)

    pushHistory('clip split', () => {
      // undo: merge back
      clip.duration = origDur; clip.startTime = origStart; _updateClipEl(el, clip)
      lanes[right.lane] = lanes[right.lane].filter(c => c.id !== right.id)
      lanesEl.querySelector(`[data-clip-id="${right.id}"]`)?.remove()
    }, () => {
      // redo: split again
      clip.duration = offsetSec; _updateClipEl(el, clip)
      lanes[right.lane].push(right)
      if (laneEl) laneEl.appendChild(buildClipEl(right))
    })
  }

  // ── Clip context menu ──────────────────────────────────────────────────────
  let _clipCtx = null
  // Delete a single clip (used by the context menu), with undo.
  function deleteClip(clip) {
    const snap = { ...clip }
    lanes[clip.lane] = lanes[clip.lane].filter(c => c.id !== clip.id)
    lanesEl.querySelector(`[data-clip-id="${clip.id}"]`)?.remove()
    selected.delete(clip.id)
    pushHistory('clip delete',
      () => { lanes[snap.lane].push(snap); lanesEl.querySelector(`[data-lane="${snap.lane}"]`)?.appendChild(buildClipEl(snap)) },
      () => { lanes[snap.lane] = lanes[snap.lane].filter(c => c.id !== snap.id); lanesEl.querySelector(`[data-clip-id="${snap.id}"]`)?.remove() })
  }

  function showClipContextMenu(e, clip, el) {
    if (_clipCtx) { _clipCtx.remove(); _clipCtx = null }
    const close = () => { menu.remove(); _clipCtx = null; document.removeEventListener('mousedown', onDoc) }

    const menu = document.createElement('div')
    menu.className = 'daw-clip-ctx'
    _clipCtx = menu

    // Header — clip name.
    const head = document.createElement('div')
    head.className = 'daw-ctx-head'
    head.innerHTML = `<i class="fa-solid fa-music"></i><span>${clip.name || 'Clip'}</span>`
    menu.appendChild(head)

    menu.appendChild(_ctxSliderRow(t('daw_fade_in'), 0, Math.min(clip.duration * 0.5, 5), 0.01,
      clip.fadeIn, v => { clip.fadeIn = v; _updateClipEl(el, clip) }))
    menu.appendChild(_ctxSliderRow(t('daw_fade_out'), 0, Math.min(clip.duration * 0.5, 5), 0.01,
      clip.fadeOut, v => { clip.fadeOut = v; _updateClipEl(el, clip) }))
    const gainRow = _ctxSliderRow(t('daw_clip_gain'), 0, 2, 0.01,
      clip.gain, v => { clip.gain = v; gainEl2.textContent = v.toFixed(2) + '×' })
    const gainEl2 = gainRow.querySelector('.daw-ctx-val')
    menu.appendChild(gainRow)

    const sep = document.createElement('div'); sep.className = 'daw-ctx-sep'
    menu.appendChild(sep)

    if (clip.path) {
      const edBtn = document.createElement('button')
      edBtn.className = 'daw-ctx-btn'
      edBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${t('daw_open_editor')}`
      edBtn.addEventListener('click', () => {
        close()
        document.dispatchEvent(new CustomEvent('iceample-open-editor', {
          detail: { file: { name: clip.path.split(/[\\/]/).pop(), path: clip.path } }
        }))
      })
      menu.appendChild(edBtn)
    }

    if (window.__TAURI__) {
      const saveBtn = document.createElement('button')
      saveBtn.className = 'daw-ctx-btn'
      saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${t('clip_save_sample')}`
      saveBtn.addEventListener('click', () => { close(); saveClipAsSample(clip) })
      menu.appendChild(saveBtn)
    }

    const delBtn = document.createElement('button')
    delBtn.className = 'daw-ctx-btn daw-ctx-del'
    delBtn.innerHTML = `<i class="fa-solid fa-trash"></i> ${t('clip_delete')}`
    delBtn.addEventListener('click', () => { close(); deleteClip(clip) })
    menu.appendChild(delBtn)

    menu.style.left = e.clientX + 'px'
    menu.style.top  = e.clientY + 'px'
    document.body.appendChild(menu)
    // Keep the menu on-screen.
    const r = menu.getBoundingClientRect()
    if (r.right > innerWidth)  menu.style.left = (e.clientX - r.width) + 'px'
    if (r.bottom > innerHeight) menu.style.top = (e.clientY - r.height) + 'px'

    const onDoc = ev => { if (!menu.contains(ev.target)) close() }
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0)
  }

  // Decode a clip's audio without mutating the clip (unlike loadClipBuffer).
  async function getClipBuffer(clip) {
    if (clip.buffer) return clip.buffer
    if (!clip.path || !window.__TAURI__) return null
    try {
      const { invoke } = window.__TAURI__.core
      const b64 = await invoke('read_file_base64', { path: clip.path })
      const bin = atob(b64)
      const ab  = new ArrayBuffer(bin.length)
      const v   = new Uint8Array(ab)
      for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i)
      return await getCtx().decodeAudioData(ab)
    } catch { return null }
  }

  // Render a clip's effective audio (trim + fades + gain) to an AudioBuffer.
  async function renderClipToBuffer(clip) {
    const buf = await getClipBuffer(clip)
    if (!buf) return null
    const sr   = buf.sampleRate
    const dur  = clip.duration || buf.duration
    const gain = clip.gain ?? 1
    const fi   = clip.fadeIn || 0, fo = clip.fadeOut || 0
    const off  = new OfflineAudioContext(buf.numberOfChannels, Math.max(1, Math.round(dur * sr)), sr)
    const src  = off.createBufferSource(); src.buffer = buf
    const g    = off.createGain()
    if (fi > 0) { g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(gain, Math.min(fi, dur)) }
    else        { g.gain.setValueAtTime(gain, 0) }
    if (fo > 0) { const t0 = Math.max(0, dur - fo); g.gain.setValueAtTime(gain, t0); g.gain.linearRampToValueAtTime(0, dur) }
    src.connect(g); g.connect(off.destination)
    src.start(0, clip.trimStart || 0, dur)
    return off.startRendering()
  }
  function _setClipName(clip, name) {
    const el = lanesEl.querySelector(`[data-clip-id="${clip.id}"] .daw-clip-name`)
    if (el) el.textContent = name.slice(0, 22)
    clip.name = name
  }

  // Render the clip's effective audio and save it as a WAV (marks it saved).
  async function saveClipAsSample(clip) {
    if (!window.__TAURI__) return
    const root = localStorage.getItem('library:root')
    if (!root) { window.toast?.(t('clip_save_no_lib'), 'error'); return }
    const rendered = await renderClipToBuffer(clip)
    if (!rendered) { window.toast?.(t('ed_no_audio'), 'info', 1200); return }

    const defBase = (clip.name || 'sample').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 40) || 'sample'
    const base = await promptName(defBase, { title: t('clip_save_sample') })
    try {
      const sep = root.includes('\\') ? '\\' : '/'
      const fpath = root + sep + 'Sons' + sep + base + '.wav'
      const { invoke } = window.__TAURI__.core
      await invoke('save_binary_file', { path: fpath, base64: bufToBase64(encodeWAV(rendered)) })
      clip.path = fpath; _setClipName(clip, base)   // now a saved sample
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Sons' } }))
      window.toast?.(t('clip_saved_sample') + ' : ' + base + '.wav', 'success')
    } catch { window.toast?.(t('clip_save_fail'), 'error') }
  }

  // A recorded take held in memory but not yet written to disk.
  const hasUnsavedTakes = () => lanes.flat().some(c => c.buffer && !c.path)

  async function saveAllUnsavedClips() {
    if (!window.__TAURI__) return
    const root = localStorage.getItem('library:root'); if (!root) return
    const sep = root.includes('\\') ? '\\' : '/'
    const { invoke } = window.__TAURI__.core
    const n = new Date()
    const stamp = n.getFullYear() + String(n.getMonth() + 1).padStart(2, '0') + String(n.getDate()).padStart(2, '0') +
      '_' + String(n.getHours()).padStart(2, '0') + String(n.getMinutes()).padStart(2, '0') + String(n.getSeconds()).padStart(2, '0')
    const unsaved = lanes.flat().filter(c => c.buffer && !c.path)
    let i = 0
    for (const c of unsaved) {
      const rendered = await renderClipToBuffer(c)
      if (!rendered) continue
      const base = 'rec_' + stamp + (i ? '_' + i : ''); i++
      try {
        const fpath = root + sep + 'Sons' + sep + base + '.wav'
        await invoke('save_binary_file', { path: fpath, base64: bufToBase64(encodeWAV(rendered)) })
        c.path = fpath; _setClipName(c, base)
      } catch {}
    }
    if (unsaved.length) window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Sons' } }))
  }

  function _ctxSliderRow(label, min, max, step, val, onChange) {
    const row = document.createElement('div')
    row.className = 'daw-ctx-row'
    const lbl = document.createElement('span')
    lbl.className = 'daw-ctx-lbl'; lbl.textContent = label
    const sl = document.createElement('input')
    sl.type = 'range'; sl.className = 'daw-ctx-sl'
    sl.min = min; sl.max = max; sl.step = step; sl.value = val
    const valEl = document.createElement('span')
    valEl.className = 'daw-ctx-val'
    valEl.textContent = parseFloat(val).toFixed(2)
    sl.addEventListener('input', () => { const v = parseFloat(sl.value); valEl.textContent = v.toFixed(2); onChange(v) })
    row.append(lbl, sl, valEl)
    return row
  }

  // ── Create clip ────────────────────────────────────────────────────────────
  async function createClip(laneIdx, time, file) {
    const clip = {
      id:        'clip_' + Date.now(),
      name:      file.name.replace(/\.[^.]+$/, '').slice(0, 22),
      path:      file.path,
      lane:      laneIdx,
      startTime: time,
      duration:  4,
      buffer:    null,
      gain:      1,
      fadeIn:    0,
      fadeOut:   0,
      trimStart: 0,
    }
    lanes[laneIdx].push(clip)

    const laneEl = lanesEl.querySelector(`[data-lane="${laneIdx}"]`)
    const clipEl = buildClipEl(clip)
    laneEl.appendChild(clipEl)

    if (window.__TAURI__) {
      try {
        const { invoke } = window.__TAURI__.core
        const b64    = await invoke('read_file_base64', { path: file.path })
        const binary = atob(b64)
        const ab     = new ArrayBuffer(binary.length)
        const view   = new Uint8Array(ab)
        for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
        // Resume the context first: a suspended AudioContext can leave
        // decodeAudioData pending (the clip then keeps its placeholder size
        // until the first Play). The drop is a user gesture, so this is allowed.
        const ctx = getCtx()
        if (ctx.state === 'suspended') { try { await ctx.resume() } catch {} }
        const buf = await ctx.decodeAudioData(ab)
        clip.buffer   = buf
        clip.duration = buf.duration
        _updateClipEl(clipEl, clip)   // direct ref → real width + fades right away
      } catch(e) { console.error('DAW load error:', e) }
    }
  }

  // ── Clip drag (repositionnement) ───────────────────────────────────────────
  function startClipDrag(e, clip, el) {
    e.preventDefault()
    const rect    = el.getBoundingClientRect()
    const offsetX = e.clientX - rect.left

    const ghost = el.cloneNode(true)
    ghost.style.cssText = `
      position:fixed;pointer-events:none;opacity:0.75;z-index:9000;overflow:hidden;border-radius:4px;
      width:${Math.min(el.offsetWidth, 260)}px;height:${el.offsetHeight}px;
      left:${rect.left}px;top:${rect.top}px;
    `
    document.body.appendChild(ghost)
    el.classList.add('daw-clip-dragging')

    function onMove(e) {
      ghost.style.left = (e.clientX - offsetX) + 'px'
      ghost.style.top  = (e.clientY - LANE_H / 2) + 'px'
    }

    function onUp(e) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      ghost.remove()
      el.classList.remove('daw-clip-dragging')

      const under = document.elementFromPoint(e.clientX, e.clientY)
      if (under?.closest('.ed-body') && clip.path) {
        const name = clip.path.split(/[\\/]/).pop()
        under.dispatchEvent(new CustomEvent('iceample-drop', {
          bubbles: true,
          detail: { file: { name, path: clip.path }, clientX: e.clientX, clientY: e.clientY }
        }))
        document.addEventListener('click', ev => ev.stopPropagation(), { once: true, capture: true })
        return
      }

      let targetLane = clip.lane
      let targetTime = clip.startTime

      const sr = scrollWrap.getBoundingClientRect()
      lanesEl.querySelectorAll('.daw-lane').forEach(laneEl => {
        const r = laneEl.getBoundingClientRect()
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          targetLane = parseInt(laneEl.dataset.lane)
          targetTime = snapTime(Math.max(0, (e.clientX - sr.left + scrollWrap.scrollLeft - offsetX) / ZOOM))
        }
      })

      // Move the dragged clip — and any other selected clips by the same delta.
      const dtTime = targetTime - clip.startTime
      const dLane  = targetLane - clip.lane
      const group  = (selected.size > 1 && selected.has(clip.id))
        ? lanes.flat().filter(c => selected.has(c.id))
        : [clip]
      const moves = group.map(c => ({
        c,
        prevLane: c.lane, prevTime: c.startTime,
        newLane: Math.max(0, Math.min(lanes.length - 1, c.lane + dLane)),
        newTime: Math.max(0, c.startTime + dtTime),
      }))
      const applyMove = (m, lane, time) => {
        lanes[m.c.lane] = lanes[m.c.lane].filter(x => x.id !== m.c.id)
        m.c.lane = lane; m.c.startTime = time
        lanes[lane].push(m.c)
        const cEl = lanesEl.querySelector(`[data-clip-id="${m.c.id}"]`)
        if (cEl) {
          cEl.style.left = (time * ZOOM) + 'px'
          const le = lanesEl.querySelector(`[data-lane="${lane}"]`)
          if (le && !le.contains(cEl)) le.appendChild(cEl)
        }
      }
      moves.forEach(m => applyMove(m, m.newLane, m.newTime))
      const changed = moves.some(m => m.prevLane !== m.newLane || Math.abs(m.prevTime - m.newTime) > 0.01)
      if (changed) {
        pushHistory('clip move',
          () => moves.forEach(m => applyMove(m, m.prevLane, m.prevTime)),
          () => moves.forEach(m => applyMove(m, m.newLane, m.newTime)))
      }

      document.addEventListener('click', e => e.stopPropagation(), { once: true, capture: true })
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── Playback ───────────────────────────────────────────────────────────────
  // (Re)schedule every clip from the current playhead. Extracted so loop
  // playback can restart sources from the loop start without UI churn.
  function scheduleSources() {
    const c = getCtx()
    activeSources.forEach(s => { try { s.stop() } catch(e) {} })
    activeSources = []
    // playCtxStart = temps AudioContext correspondant à playheadTime=0
    playCtxStart = c.currentTime - playheadTime
    lanes.forEach(laneClips => {
      laneClips.forEach(clip => {
        if (!clip.buffer) return
        const clipEnd = clip.startTime + clip.duration
        if (clipEnd <= playheadTime) return   // clip entirely past
        const src  = c.createBufferSource()
        src.buffer = clip.buffer

        const clipGain = c.createGain()
        clipGain.gain.value = clip.gain ?? 1
        src.connect(clipGain)
        clipGain.connect(getTrackNode('daw'))

        const trimStart = clip.trimStart ?? 0
        let   whenCtx   = c.currentTime
        let   bufOffset = trimStart

        if (clip.startTime >= playheadTime) {
          whenCtx = c.currentTime + (clip.startTime - playheadTime)
        } else {
          // Clip already started — seek into buffer
          bufOffset = trimStart + (playheadTime - clip.startTime)
          whenCtx   = c.currentTime
        }

        // Fade in
        const fi = clip.fadeIn ?? 0
        if (fi > 0 && clip.startTime >= playheadTime) {
          clipGain.gain.setValueAtTime(0, whenCtx)
          clipGain.gain.linearRampToValueAtTime(clip.gain ?? 1, whenCtx + fi)
        }

        // Fade out
        const fo = clip.fadeOut ?? 0
        if (fo > 0) {
          const fadeOutStart = whenCtx + clip.duration - fo - Math.max(0, playheadTime - clip.startTime)
          if (fadeOutStart > c.currentTime) {
            clipGain.gain.setValueAtTime(clip.gain ?? 1, fadeOutStart)
            clipGain.gain.linearRampToValueAtTime(0, whenCtx + clip.duration - Math.max(0, playheadTime - clip.startTime))
          }
        }

        src.start(whenCtx, bufOffset, clip.duration - Math.max(0, playheadTime - clip.startTime))
        activeSources.push(src)
      })
    })
  }

  function play() {
    if (playing) return
    // With loop enabled, start from the loop start if the playhead is outside it.
    if (loopOn && loopStart != null && loopEnd != null &&
        (playheadTime < loopStart || playheadTime >= loopEnd)) {
      playheadTime = loopStart
      playhead.style.left = (playheadTime * ZOOM) + 'px'
    }
    playing = true
    scheduleSources()
    btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>'
    btnPlay.classList.add('active')
    animatePlayhead()
  }

  function seekTo(time) {
    playheadTime = Math.max(0, time)
    playhead.style.left = (playheadTime * ZOOM) + 'px'
    if (playing) scheduleSources()
  }

  function pause() {
    if (!playing) return
    playing = false
    activeSources.forEach(s => { try { s.stop() } catch(e) {} })
    activeSources = []
    cancelAnimationFrame(rafId)
    // Fige la position courante (sans remettre à 0)
    playheadTime = getCtx().currentTime - playCtxStart
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
    btnPlay.classList.remove('active')
  }

  function stop() {
    if (recording) stopRecording()
    playing = false
    activeSources.forEach(s => { try { s.stop() } catch(e) {} })
    activeSources = []
    cancelAnimationFrame(rafId)
    playheadTime = 0
    playhead.style.left = '0px'
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
    btnPlay.classList.remove('active')
  }

  function animatePlayhead() {
    if (!playing) return
    playheadTime = getCtx().currentTime - playCtxStart
    // Loop: jump back to the loop start when reaching the end.
    if (loopOn && loopEnd != null && loopStart != null && playheadTime >= loopEnd) {
      playheadTime = loopStart
      scheduleSources()
    }
    const px = playheadTime * ZOOM
    playhead.style.left = px + 'px'

    // Auto-scroll pour suivre la tête de lecture
    const visibleRight = scrollWrap.scrollLeft + scrollWrap.clientWidth
    if (px > visibleRight - 80) {
      scrollWrap.scrollLeft = px - scrollWrap.clientWidth / 2
    }
    updateScrollbar()
    rafId = requestAnimationFrame(animatePlayhead)
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  btnPlay.addEventListener('click', () => playing ? pause() : play())
  btnStop.addEventListener('click', stop)

  // Global transport sync (one Play drives every open tool, from a shared pos).
  function onTransport(e) {
    const a = e.detail.action
    if (a === 'play') {
      if (e.detail.position != null) seekTo(e.detail.position)
      if (!playing) play()
    } else if (a === 'pause') {
      pause()
    } else {
      stop()
    }
  }
  window.addEventListener('iceample-transport', onTransport)

  body.querySelector('#daw-add-lane').addEventListener('click', () => {
    const li = lanes.length
    laneColors[li] = LANE_PALETTE[li % LANE_PALETTE.length]
    lanes.push([])
    buildLanes()
    autoResizeWindow()
  })

  // ── Export / Save ──────────────────────────────────────────────────────────
  const saveNameInp  = body.querySelector('#daw-save-name')
  const btnSaveProj  = body.querySelector('#daw-save-proj')
  const btnExportWav = body.querySelector('#daw-export-wav')

  function setBtnState(btn, state) {
    const icons = { spin: 'fa-spinner fa-spin', ok: 'fa-check', err: 'fa-xmark',
                    proj: 'fa-floppy-disk', wav: 'fa-file-audio' }
    btn.innerHTML = `<i class="fa-solid ${icons[state]}"></i>`
    if (state === 'ok') btn.style.color = 'var(--color-active)'
    else if (state === 'err') btn.style.color = 'var(--danger)'
    else btn.style.color = ''
  }
  function resetBtn(btn, icon) {
    setTimeout(() => { btn.innerHTML = `<i class="fa-solid ${icon}"></i>`; btn.style.color = '' }, 1500)
  }

  async function doSaveProject() {
    const name = saveNameInp.value.trim() || t('daw_default_name')
    const root = localStorage.getItem('library:root')
    if (!root || !window.__TAURI__) { setBtnState(btnSaveProj, 'err'); resetBtn(btnSaveProj, 'fa-floppy-disk'); return }
    setBtnState(btnSaveProj, 'spin')
    try {
      const sep  = root.includes('\\') ? '\\' : '/'
      const data = JSON.stringify({
        lanes: lanes.map(laneClips => laneClips.map(c => ({
          name: c.name, path: c.path, startTime: c.startTime, duration: c.duration
        })))
      })
      const { invoke } = window.__TAURI__.core
      await invoke('save_text_file', { path: root + sep + 'Pistes' + sep + name + '.icedaw', content: data })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Pistes' } }))
      setBtnState(btnSaveProj, 'ok')
    } catch(e) { setBtnState(btnSaveProj, 'err') }
    resetBtn(btnSaveProj, 'fa-floppy-disk')
  }

  async function doExportWAV() {
    const name = saveNameInp.value.trim() || t('daw_default_name')
    const root = localStorage.getItem('library:root')
    if (!root || !window.__TAURI__) { setBtnState(btnExportWav, 'err'); resetBtn(btnExportWav, 'fa-file-audio'); return }
    let maxEnd = 0
    lanes.forEach(lc => lc.forEach(c => { maxEnd = Math.max(maxEnd, c.startTime + c.duration) }))
    if (maxEnd === 0) { setBtnState(btnExportWav, 'err'); resetBtn(btnExportWav, 'fa-file-audio'); return }
    setBtnState(btnExportWav, 'spin')
    try {
      const sr     = 44100
      const offCtx = new OfflineAudioContext(2, Math.ceil(sr * (maxEnd + 0.5)), sr)
      lanes.forEach(laneClips => {
        laneClips.forEach(clip => {
          if (!clip.buffer) return
          const src  = offCtx.createBufferSource()
          src.buffer = clip.buffer
          const gain = offCtx.createGain(); gain.gain.value = 0.85
          src.connect(gain); gain.connect(offCtx.destination)
          src.start(clip.startTime)
        })
      })
      const rendered = await offCtx.startRendering()
      const base64   = bufToBase64(encodeWAV(rendered))
      const sep      = root.includes('\\') ? '\\' : '/'
      const { invoke } = window.__TAURI__.core
      await invoke('save_binary_file', { path: root + sep + 'Séquences Audio' + sep + name + '.wav', base64 })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Séquences Audio' } }))
      setBtnState(btnExportWav, 'ok')
    } catch(e) { console.error(e); setBtnState(btnExportWav, 'err') }
    resetBtn(btnExportWav, 'fa-file-audio')
  }

  async function loadProject(filePath) {
    const { invoke } = window.__TAURI__.core
    const data = JSON.parse(await invoke('read_text_file', { path: filePath }))
    stop()
    lanes.length = 0
    for (const laneClips of (data.lanes || [])) {
      const newLane = laneClips.map((c, i) => ({
        id: 'clip_' + Date.now() + i, name: c.name, path: c.path,
        lane: lanes.length, startTime: c.startTime, duration: c.duration, buffer: null
      }))
      lanes.push(newLane)
    }
    if (lanes.length === 0) lanes.push([])
    buildLanes()
    lanes.forEach(lc => lc.forEach(clip => loadClipBuffer(clip)))
  }

  async function loadClipBuffer(clip) {
    if (!window.__TAURI__) return
    try {
      const { invoke } = window.__TAURI__.core
      const b64    = await invoke('read_file_base64', { path: clip.path })
      const binary = atob(b64)
      const ab     = new ArrayBuffer(binary.length)
      const view   = new Uint8Array(ab)
      for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
      const buf = await getCtx().decodeAudioData(ab)
      clip.buffer   = buf
      // Keep a restored clip's trimmed length (it used to snap back to the
      // whole file); only clamp it to what the file actually holds.
      const room = Math.max(0, buf.duration - (clip.trimStart || 0))
      clip.duration = clip.duration > 0 ? Math.min(clip.duration, room) : buf.duration
      const el = lanesEl.querySelector(`[data-clip-id="${clip.id}"]`)
      if (el) _updateClipEl(el, clip)   // width, fades and waveform
    } catch(e) { console.error('DAW buffer load error:', e) }
  }

  // ── Record ─────────────────────────────────────────────────────────────────
  const btnRec = body.querySelector('#daw-rec')
  btnRec.after(makeInputSwitch('daw'))   // input 1 / 2 (Settings → Device)

  async function startRecording() {
    if (recording) return
    const laneIdx = armedLanes.size > 0 ? Math.min(...armedLanes) : 0
    let stream
    try {
      stream = await getMicStream('daw')
    } catch (e) {
      window.toast?.(t('daw_rec_denied') || 'Microphone access denied', 'error')
      return
    }

    recording = true
    btnRec.classList.add('active')

    // Optional one-bar count-in before the recorder actually starts.
    if (countInOn) {
      btnRec.classList.add('count-in')
      await playCountIn()
      btnRec.classList.remove('count-in')
      if (!recording) { stream.getTracks().forEach(tr => tr.stop()); return }  // cancelled
    }

    _recChunks    = []
    _recStartTime = playheadTime
    _recLane      = laneIdx

    _mediaRecorder = new MediaRecorder(stream)
    _mediaRecorder.ondataavailable = ev => { if (ev.data.size > 0) _recChunks.push(ev.data) }
    _mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(tr => tr.stop())
      if (_recChunks.length === 0) return
      const blob = new Blob(_recChunks, { type: _recChunks[0].type || 'audio/webm' })
      const ab   = await blob.arrayBuffer()
      let buf
      try { buf = await getCtx().decodeAudioData(ab) } catch (e) { console.error('rec decode error', e); return }

      const clip = {
        id:        'clip_rec_' + Date.now(),
        name:      'REC ' + new Date().toLocaleTimeString(),
        path:      null,
        lane:      _recLane,
        startTime: _recStartTime,
        duration:  buf.duration,
        buffer:    buf,
      }
      if (!lanes[_recLane]) { while (lanes.length <= _recLane) lanes.push([]) }
      lanes[_recLane].push(clip)
      const laneEl = lanesEl.querySelector(`[data-lane="${_recLane}"]`)
      if (laneEl) laneEl.appendChild(buildClipEl(clip))
      pushHistory('record clip', () => {
        lanes[clip.lane] = lanes[clip.lane].filter(c => c.id !== clip.id)
        lanesEl.querySelector(`[data-clip-id="${clip.id}"]`)?.remove()
      }, () => {
        lanes[clip.lane].push(clip)
        const le = lanesEl.querySelector(`[data-lane="${clip.lane}"]`)
        if (le) le.appendChild(buildClipEl(clip))
      })
    }
    _mediaRecorder.start()
    if (!playing) play()
  }

  function stopRecording() {
    if (!recording) return
    recording = false
    btnRec.classList.remove('active')
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') _mediaRecorder.stop()
    _mediaRecorder = null
  }

  btnRec.addEventListener('click', () => recording ? stopRecording() : startRecording())

  btnSaveProj.addEventListener('click', doSaveProject)
  btnExportWav.addEventListener('click', doExportWAV)
  saveNameInp.addEventListener('keydown', e => { if (e.key === 'Enter') doSaveProject() })

  // Drop d'un fichier .icedaw sur la piste → charger le projet
  body.addEventListener('iceample-drop', async e => {
    const { file } = e.detail
    if (!file || !file.path.endsWith('.icedaw') || !window.__TAURI__) return
    await loadProject(file.path)
  })

  // ── Drop handling centralisé ───────────────────────────────────────────────
  function laneIdxFromY(clientY) {
    let best = 0
    lanesEl.querySelectorAll('.daw-lane').forEach((el, i) => {
      if (clientY >= el.getBoundingClientRect().top) best = i
    })
    return Math.min(best, lanes.length - 1)
  }

  lanesEl.addEventListener('iceample-drop', e => {
    const { file, clientX, clientY } = e.detail
    if (!file || file.name.endsWith('.iceseq')) return
    const sr   = scrollWrap.getBoundingClientRect()
    const li   = laneIdxFromY(clientY)
    const time = Math.max(0, (clientX - sr.left + scrollWrap.scrollLeft) / ZOOM)
    createClip(li, time, file)
  })

  // ── Zoom à la molette ─────────────────────────────────────────────────────
  function applyZoom(newZoom, cursorClientX) {
    const r          = scrollWrap.getBoundingClientRect()
    const cursorX    = cursorClientX - r.left
    const cursorTime = (scrollWrap.scrollLeft + cursorX) / ZOOM
    ZOOM = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom))

    setTimelineWidth()
    buildRuler()

    lanesEl.querySelectorAll('.daw-lane').forEach(l => {
      l.style.width = Math.round(tlDur() * ZOOM) + 'px'
    })
    lanes.forEach(laneClips => {
      laneClips.forEach(clip => {
        const el = lanesEl.querySelector(`[data-clip-id="${clip.id}"]`)
        if (!el) return
        _updateClipEl(el, clip)
      })
    })

    playhead.style.left = (playheadTime * ZOOM) + 'px'
    updateLoopUI()
    scrollWrap.scrollLeft = Math.max(0, cursorTime * ZOOM - cursorX)
    updateScrollbar()
  }

  scrollWrap.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    applyZoom(ZOOM * factor, e.clientX)
  }, { passive: false })

  // ── Scrollbar custom ───────────────────────────────────────────────────────
  function updateScrollbar() {
    const total   = tlDur() * ZOOM
    const visible = scrollWrap.clientWidth
    const ratio   = Math.min(1, visible / total)
    const thumbW  = Math.max(24, ratio * sbTrack.offsetWidth)
    const maxScroll = total - visible
    const pct = maxScroll > 0 ? scrollWrap.scrollLeft / maxScroll : 0
    const thumbLeft = pct * (sbTrack.offsetWidth - thumbW)
    sbThumb.style.width = thumbW + 'px'
    sbThumb.style.left  = thumbLeft + 'px'
  }

  scrollWrap.addEventListener('scroll', () => { setTimelineWidth(); updateScrollbar(); buildRuler() })

  let sbDragging = false, sbStartX = 0, sbStartScroll = 0
  sbThumb.addEventListener('mousedown', e => {
    sbDragging   = true
    sbStartX     = e.clientX
    sbStartScroll = scrollWrap.scrollLeft
    e.preventDefault()
  })
  document.addEventListener('mousemove', e => {
    if (!sbDragging) return
    const total   = tlDur() * ZOOM
    const visible = scrollWrap.clientWidth
    const thumbW  = Math.max(24, visible / total * sbTrack.offsetWidth)
    const trackRange = sbTrack.offsetWidth - thumbW
    const contentRange = total - visible
    const dx = e.clientX - sbStartX
    scrollWrap.scrollLeft = sbStartScroll + (dx / trackRange) * contentRange
    updateScrollbar()
  })
  document.addEventListener('mouseup', () => {
    if (sbDragging) {
      sbDragging = false
      document.addEventListener('click', e => e.stopPropagation(), { once: true, capture: true })
    }
  })

  // Clic sur ruler pour déplacer playhead
  rulerEl.addEventListener('click', e => {
    const sr = scrollWrap.getBoundingClientRect()
    playheadTime = Math.max(0, (e.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM)
    playhead.style.left = (playheadTime * ZOOM) + 'px'
  })

  // ── Init ───────────────────────────────────────────────────────────────────
  buildRuler()
  buildLanes()
  requestAnimationFrame(updateScrollbar)

  // Expose the DAW's actions to the command palette while it's open.
  registerCommands([
    { id: 'daw:record',      titleKey: 'sc_record',         icon: 'fa-solid fa-circle',          category: 'tool_daw', shortcutAction: 'record',          run: () => btnRec.click() },
    { id: 'daw:new-track',   titleKey: 'sc_new_track',      icon: 'fa-solid fa-plus',            category: 'tool_daw', shortcutAction: 'new-track',       run: () => body.querySelector('#daw-add-lane')?.click() },
    { id: 'daw:count-in',    titleKey: 'sc_count_in',       icon: 'fa-solid fa-stopwatch',       category: 'tool_daw', shortcutAction: 'count-in',        run: () => btnCountIn.click() },
    { id: 'daw:select-all',  titleKey: 'sc_select_all',     icon: 'fa-solid fa-object-group',    category: 'tool_daw', shortcutAction: 'select-all',      run: () => selectAllClips() },
    { id: 'daw:duplicate',   titleKey: 'sc_clip_duplicate', icon: 'fa-solid fa-clone',           category: 'tool_daw', shortcutAction: 'clip-duplicate',  run: () => duplicateSelected() },
    { id: 'daw:split',       titleKey: 'sc_clip_split',     icon: 'fa-solid fa-scissors',        category: 'tool_daw', shortcutAction: 'clip-split',      run: () => splitSelectedAtPlayhead() },
    { id: 'daw:delete',      titleKey: 'sc_clip_delete',    icon: 'fa-solid fa-trash',           category: 'tool_daw', shortcutAction: 'clip-delete',     run: () => deleteSelected() },
    { id: 'daw:nudge-left',  titleKey: 'sc_nudge_left',     icon: 'fa-solid fa-arrow-left',      category: 'tool_daw', shortcutAction: 'clip-nudge-left', run: () => nudgeSelected(-1) },
    { id: 'daw:nudge-right', titleKey: 'sc_nudge_right',    icon: 'fa-solid fa-arrow-right',     category: 'tool_daw', shortcutAction: 'clip-nudge-right',run: () => nudgeSelected(1) },
    { id: 'daw:go-to-start', titleKey: 'sc_go_to_start',    icon: 'fa-solid fa-backward-fast',   category: 'tool_daw', shortcutAction: 'go-to-start',     run: () => seekTo(0) },
    { id: 'daw:play-loop',   titleKey: 'sc_play_loop',      icon: 'fa-solid fa-repeat',          category: 'tool_daw', shortcutAction: 'play-loop',       run: () => playLoopRegion() },
    { id: 'daw:zoom-in',     titleKey: 'sc_zoom_in',        icon: 'fa-solid fa-magnifying-glass-plus',  category: 'tool_daw', shortcutAction: 'zoom-in',  run: () => zoomBy(1.2) },
    { id: 'daw:zoom-out',    titleKey: 'sc_zoom_out',       icon: 'fa-solid fa-magnifying-glass-minus', category: 'tool_daw', shortcutAction: 'zoom-out', run: () => zoomBy(1 / 1.2) },
    { id: 'daw:zoom-reset',  titleKey: 'sc_zoom_reset',     icon: 'fa-solid fa-magnifying-glass', category: 'tool_daw', shortcutAction: 'zoom-reset',    run: () => zoomReset() },
  ])

  const obs = new MutationObserver(() => {
    if (!document.contains(body)) {
      stop(); window.removeEventListener('iceample-transport', onTransport); document.removeEventListener('keydown', onDawKey)
      unregisterCommandsBy(c => c.id.startsWith('daw:'))
      obs.disconnect()
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })

  // Closing the track with unsaved recorded takes → classic confirm + offer to save.
  const dawWin = body.closest('.tool-win')
  if (dawWin) {
    dawWin._beforeClose = async (doClose) => {
      if (!hasUnsavedTakes()) { doClose(); return }
      const choice = await confirmUnsaved()
      if (choice === 'cancel') return
      if (choice === 'save') await saveAllUnsavedClips()
      doClose()
    }
  }

  // ── Project registry ───────────────────────────────────────────────────────
  registerTool('daw', {
    el: body,
    getState: () => ({
      laneColors: [...laneColors],
      lanes: lanes.map(laneClips => laneClips.map(c => ({
        id: c.id, name: c.name, path: c.path,
        lane: c.lane, startTime: c.startTime, duration: c.duration,
        gain: c.gain ?? 1, fadeIn: c.fadeIn ?? 0, fadeOut: c.fadeOut ?? 0, trimStart: c.trimStart ?? 0,
      }))),
    }),
    setState: (state) => {
      if (!state) return
      stop()
      lanes.length = 0
      ;(state.laneColors || []).forEach((col, i) => { laneColors[i] = col })
      ;(state.lanes || []).forEach((laneClips, li) => {
        const newLane = laneClips.map(c => ({
          id: c.id, name: c.name, path: c.path,
          lane: li, startTime: c.startTime, duration: c.duration, buffer: null,
          gain: c.gain ?? 1, fadeIn: c.fadeIn ?? 0, fadeOut: c.fadeOut ?? 0, trimStart: c.trimStart ?? 0,
        }))
        lanes.push(newLane)
      })
      if (lanes.length === 0) lanes.push([])
      buildLanes()
      lanes.forEach(lc => lc.forEach(clip => { if (clip.path) loadClipBuffer(clip) }))
    },
  })
}
