import { getCtx, getTrackNode } from './audio-bus.js'
import { t } from './i18n.js'
import { getBpm } from './tempo.js'
import { pushHistory } from './history.js'
import { matchesShortcut } from './shortcuts.js'
import { promptName, confirmUnsaved, showInfo } from './rename-dialog.js'
import { registerCommands, unregisterCommandsBy } from './commands.js'

export function initMic(body) {
  body.classList.add('mic-body')

  const root = localStorage.getItem('library:root')
  const sep  = root?.includes('\\') ? '\\' : '/'

  let ZOOM     = 80
  const ZOOM_MIN = 0.5, ZOOM_MAX = 500
  let playheadTime = 0
  let isPlaying    = false
  let isRecording  = false
  let recMode      = 'Voix'

  let playStart     = 0
  let playOffset    = 0
  let activeSources = []
  let rafId         = null

  let stream        = null
  let mediaRecorder = null
  let recChunks     = []
  let recStartWall  = 0
  let recStartTime  = 0
  let recClipEl     = null
  let recAnimFrame  = null

  const clips = []
  let clipId  = 0
  let loopStart = null, loopEnd = null, loopOn = false   // marquee / loop range

  body.innerHTML = `
    <div class="daw-controls">
      <button class="seq-btn daw-play-btn" id="mc-play"><i class="fa-solid fa-play"></i></button>
      <button class="seq-btn" id="mc-stop"><i class="fa-solid fa-stop"></i></button>
      <span class="daw-time" id="mc-time">0:00</span>
      <div class="seq-sep"></div>
      <button class="seq-btn mic-rec-circle" id="mc-rec" title="${t('mic_record_title')}">
        <i class="fa-solid fa-circle"></i>
      </button>
      <button class="mic-mode-btn active" id="mc-mode-voix" data-target="Voix">
        <i class="fa-solid fa-microphone"></i><span>${t('mic_voice')}</span>
      </button>
      <button class="mic-mode-btn" id="mc-mode-sons" data-target="Sons">
        <i class="fa-solid fa-music"></i><span>${t('mic_sound')}</span>
      </button>
      <div class="seq-sep"></div>
      <button class="seq-btn" id="mc-add" title="${t('mic_add_lane')}"><i class="fa-solid fa-plus"></i></button>
      <div style="flex:1"></div>
      <input class="seq-save-input" id="mc-name" type="text" placeholder="${t('daw_name_placeholder')}" maxlength="40" />
      <button class="seq-btn" id="mc-save" title="${t('mic_save_title')}"><i class="fa-solid fa-floppy-disk"></i></button>
      <button class="seq-btn" id="mc-export" title="${t('mic_export_title')}"><i class="fa-solid fa-file-audio"></i></button>
    </div>
    <div class="daw-scrollbar-track"><div class="daw-scrollbar-thumb" id="mc-sb"></div></div>
    <div class="daw-scroll-wrap" id="mc-scroll">
      <div class="daw-inner" id="mc-inner">
        <div class="daw-ruler" id="mc-ruler"></div>
        <div class="daw-lanes" id="mc-lanes"></div>
        <div class="daw-playhead" id="mc-playhead"></div>
      </div>
    </div>
  `

  const btnPlay    = body.querySelector('#mc-play')
  const btnStop    = body.querySelector('#mc-stop')
  const timeEl     = body.querySelector('#mc-time')
  const btnRec     = body.querySelector('#mc-rec')
  const btnAdd     = body.querySelector('#mc-add')
  const nameInp    = body.querySelector('#mc-name')
  const btnSave    = body.querySelector('#mc-save')
  const btnExport  = body.querySelector('#mc-export')

  function setBtnState(btn, state) {
    const icons = { spin: 'fa-spinner fa-spin', ok: 'fa-check', err: 'fa-xmark' }
    btn.innerHTML = `<i class="fa-solid ${icons[state]}"></i>`
  }
  function resetBtn(btn, icon) {
    setTimeout(() => { btn.innerHTML = `<i class="fa-solid ${icon}"></i>` }, 1200)
  }
  function fmtTime(s) {
    const h   = Math.floor(s / 3600)
    const m   = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${m}:${String(sec).padStart(2,'0')}`
  }
  const modeVoix   = body.querySelector('#mc-mode-voix')
  const modeSons   = body.querySelector('#mc-mode-sons')
  const scrollWrap = body.querySelector('#mc-scroll')
  const innerEl    = body.querySelector('#mc-inner')
  const rulerEl    = body.querySelector('#mc-ruler')
  const lanesEl    = body.querySelector('#mc-lanes')
  const playheadEl = body.querySelector('#mc-playhead')
  const sbThumb    = body.querySelector('#mc-sb')

  // ── Lanes + timeline ──────────────────────────────────────────────────────
  const TIMELINE_DUR = 21600   // hard cap (6 h)
  const MIN_DUR    = 120
  const lanes      = []
  const LANE_H_PX  = 58
  const RULER_H_PX = 24

  // Dynamic timeline length = content + view headroom (capped) so the scrollbar
  // maps to the actually-used range, not a fixed 6 h.
  function tlDur() {
    let end = 0
    for (const c of clips) end = Math.max(end, c.startTime + c.duration)
    const viewDur   = scrollWrap.clientWidth / ZOOM
    const viewRight = scrollWrap.scrollLeft / ZOOM + viewDur
    return Math.min(TIMELINE_DUR, Math.max(MIN_DUR, end + 30, viewRight + viewDur, (playheadTime || 0) + 30))
  }
  // Snap to the beat grid (project tempo) — always on.
  function snapTime(sec) { const g = 60 / getBpm(); return Math.round(sec / g) * g }

  function updateInnerHeight() {
    innerEl.style.height = (RULER_H_PX + lanes.length * LANE_H_PX) + 'px'
  }

  // Grow the window so all lanes are visible, clamped to the workspace.
  function autoResizeWindow() {
    const win = body.closest('.tool-win')
    if (!win) return
    const chrome = win.offsetHeight - scrollWrap.clientHeight
    const desired = chrome + RULER_H_PX + lanes.length * LANE_H_PX + 4
    const wb = win.parentElement
    const maxH = wb ? wb.clientHeight - 10 : desired
    win.style.height = Math.min(desired, Math.max(160, maxH)) + 'px'
  }

  function addLane() {
    const lane = document.createElement('div')
    lane.className = 'daw-lane'
    lane.dataset.laneIdx = lanes.length
    lane.style.width = Math.round(tlDur() * ZOOM) + 'px'
    lanesEl.appendChild(lane)
    lanes.push(lane)
    updateInnerHeight()
    updateRuler()
    return lanes.length - 1
  }

  addLane()
  addLane()
  btnAdd.addEventListener('click', () => { addLane(); autoResizeWindow() })

  // ── Ruler + zoom ──────────────────────────────────────────────────────────

  function updateRuler() {
    const totalW = Math.round(tlDur() * ZOOM)
    rulerEl.style.width = totalW + 'px'
    lanes.forEach(l => l.style.width = totalW + 'px')
    rulerEl.innerHTML = ''
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

  function applyZoom(newZoom, cursorClientX) {
    const rect      = scrollWrap.getBoundingClientRect()
    const cursorX   = cursorClientX - rect.left
    const cursorTime = (scrollWrap.scrollLeft + cursorX) / ZOOM
    ZOOM = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom))
    updateRuler()
    clips.forEach(positionClip)
    playheadEl.style.left = (playheadTime * ZOOM) + 'px'
    scrollWrap.scrollLeft = Math.max(0, cursorTime * ZOOM - cursorX)
    updateScrollbar()
  }

  scrollWrap.addEventListener('wheel', e => {
    e.preventDefault()
    applyZoom(ZOOM * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX)
  }, { passive: false })

  // Drag on the ruler → marquee range (snapped); a plain click → seek.
  rulerEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    const sr = scrollWrap.getBoundingClientRect()
    const at = cx => Math.max(0, (cx - sr.left + scrollWrap.scrollLeft) / ZOOM)
    const t0 = snapTime(at(e.clientX))
    let dragged = false
    const onMove = ev => {
      if (Math.abs(ev.clientX - e.clientX) > 3) dragged = true
      if (dragged) setRange(t0, snapTime(at(ev.clientX)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      if (!dragged) {
        playheadTime = at(e.clientX)
        playheadEl.style.left = (playheadTime * ZOOM) + 'px'
      }
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  })

  // ── Scrollbar ─────────────────────────────────────────────────────────────
  function updateScrollbar() {
    const trackW   = scrollWrap.clientWidth
    const contentW = tlDur() * ZOOM
    if (contentW <= trackW) { sbThumb.style.width = '100%'; sbThumb.style.left = '0'; return }
    const thumbW = Math.max(30, trackW / contentW * trackW)
    const maxScroll = contentW - trackW
    const pct = maxScroll > 0 ? scrollWrap.scrollLeft / maxScroll : 0
    sbThumb.style.width = thumbW + 'px'
    sbThumb.style.left  = (pct * (trackW - thumbW)) + 'px'
  }
  scrollWrap.addEventListener('scroll', () => { updateScrollbar(); updateRuler() })

  let sbStartX = 0, sbStartScroll = 0
  sbThumb.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    e.preventDefault()
    sbStartX = e.clientX; sbStartScroll = scrollWrap.scrollLeft
    function onMove(ev) {
      const trackW = scrollWrap.clientWidth
      const contentW = tlDur() * ZOOM
      const thumbW = Math.max(30, trackW / contentW * trackW)
      const trackRange = trackW - thumbW
      const dx = ev.clientX - sbStartX
      scrollWrap.scrollLeft = sbStartScroll + (trackRange > 0 ? dx / trackRange * (contentW - trackW) : 0)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.addEventListener('click', ev => ev.stopPropagation(), { once: true, capture: true })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  // ── Marquee / loop range (drag the timeline → loops + ✂ delete slice) ──────
  const loopRegion = document.createElement('div')
  loopRegion.className = 'daw-loop-region'
  loopRegion.style.display = 'none'
  innerEl.appendChild(loopRegion)
  const marqueeCut = document.createElement('button')
  marqueeCut.className = 'daw-marquee-cut'
  marqueeCut.title = t('marquee_cut')
  marqueeCut.innerHTML = '<i class="fa-solid fa-scissors"></i>'
  marqueeCut.style.display = 'none'
  innerEl.appendChild(marqueeCut)
  marqueeCut.addEventListener('mousedown', ev => ev.stopPropagation())
  marqueeCut.addEventListener('click', ev => {
    ev.stopPropagation()
    if (loopOn && loopStart != null && loopEnd != null && loopEnd > loopStart) { carveRange(loopStart, loopEnd); clearRange() }
  })

  function updateLoopUI() {
    if (loopStart == null || loopEnd == null || loopEnd <= loopStart) {
      loopRegion.style.display = 'none'; marqueeCut.style.display = 'none'; return
    }
    loopRegion.style.display = ''
    loopRegion.style.left  = (loopStart * ZOOM) + 'px'
    loopRegion.style.width = ((loopEnd - loopStart) * ZOOM) + 'px'
    loopRegion.classList.toggle('active', loopOn)
    marqueeCut.style.display = ''
    marqueeCut.style.left = (loopStart * ZOOM + 4) + 'px'
  }
  function setRange(a, b) { loopStart = Math.min(a, b); loopEnd = Math.max(a, b); loopOn = loopEnd > loopStart; updateLoopUI() }
  function clearRange() { loopStart = loopEnd = null; loopOn = false; updateLoopUI() }

  // Mount a clip from a plain data object (preserving its id) — used for
  // creating pieces and for undo/redo restoration.
  function mountClip(d) {
    const icon = d.targetFolder === 'Voix' ? 'fa-microphone' : 'fa-music'
    const el = document.createElement('div')
    el.className = 'daw-clip mic-clip'; el.dataset.clipId = d.id
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span class="daw-clip-name">${d.label ?? d.targetFolder ?? ''}</span>`
    const clip = { id: d.id, laneIdx: d.laneIdx, startTime: d.startTime, duration: d.duration, audioBuffer: d.audioBuffer, targetFolder: d.targetFolder, savedPath: d.savedPath || null, trimStart: d.trimStart || 0, el }
    clips.push(clip)
    positionClip(clip)
    if (lanes[clip.laneIdx]) lanes[clip.laneIdx].appendChild(el)
    makeClipDraggable(clip)
    micWaveDraw(clip)
    return clip
  }
  function snapClip(c) {
    return { id: c.id, laneIdx: c.laneIdx, startTime: c.startTime, duration: c.duration,
      audioBuffer: c.audioBuffer, targetFolder: c.targetFolder, savedPath: c.savedPath || null,
      trimStart: c.trimStart || 0, label: c.el?.querySelector('.daw-clip-name')?.textContent }
  }
  function unmountClipById(id) {
    const i = clips.findIndex(c => c.id === id)
    if (i >= 0) { clips[i].el.remove(); clips.splice(i, 1) }
  }
  function makeClipPiece(src, startTime, duration, trimStart) {
    return mountClip({ id: ++clipId, laneIdx: src.laneIdx, startTime, duration,
      audioBuffer: src.audioBuffer, targetFolder: src.targetFolder, savedPath: src.savedPath,
      trimStart, label: src.el?.querySelector('.daw-clip-name')?.textContent })
  }
  function carveRange(t0, t1) {
    if (t1 <= t0) return
    const affected = clips.filter(c => c.startTime < t1 && c.startTime + c.duration > t0)
    if (!affected.length) return
    const removed = affected.map(snapClip)
    const created = []
    affected.forEach(c => {
      const cs = c.startTime, ce = cs + c.duration, ts = c.trimStart || 0
      unmountClipById(c.id)
      if (cs < t0) created.push(snapClip(makeClipPiece(c, cs, t0 - cs, ts)))
      if (ce > t1) created.push(snapClip(makeClipPiece(c, t1, ce - t1, ts + (t1 - cs))))
    })
    updateRuler(); updateScrollbar()
    pushHistory('mic carve',
      () => { created.forEach(p => unmountClipById(p.id)); removed.forEach(mountClip); updateRuler(); updateScrollbar() },
      () => { removed.forEach(r => unmountClipById(r.id)); created.forEach(mountClip); updateRuler(); updateScrollbar() })
  }

  // Drag the empty timeline → marquee range; plain click → clear.
  lanesEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    if (e.target.closest('.daw-clip')) return
    const sr = scrollWrap.getBoundingClientRect()
    const t0 = snapTime(Math.max(0, (e.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM))
    const x0 = e.clientX, y0 = e.clientY
    let dragged = false
    const onMove = ev => {
      if (!dragged && (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 3)) dragged = true
      if (!dragged) return
      setRange(t0, snapTime(Math.max(0, (ev.clientX - sr.left + scrollWrap.scrollLeft) / ZOOM)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      if (!dragged) clearRange()
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  })
  function rangeReady() { return loopOn && loopStart != null && loopEnd != null && loopEnd > loopStart }
  function goToStart() {
    playheadTime = 0
    playheadEl.style.left = '0px'
    timeEl.textContent = fmtTime(0)
    if (isPlaying) scheduleMicSources()
    updateScrollbar()
  }
  function zoomBy(factor) {
    const r = scrollWrap.getBoundingClientRect()
    applyZoom(ZOOM * factor, r.left + scrollWrap.clientWidth / 2)
  }
  function zoomReset() {
    const r = scrollWrap.getBoundingClientRect()
    applyZoom(80, r.left + scrollWrap.clientWidth / 2)
  }
  function movePlayhead(beats) {
    playheadTime = Math.max(0, playheadTime + beats * (60 / getBpm()))
    playheadEl.style.left = (playheadTime * ZOOM) + 'px'
    timeEl.textContent = fmtTime(playheadTime)
    if (isPlaying) scheduleMicSources()
    updateScrollbar()
  }
  function playLoopRegion() {
    if (loopStart == null || loopEnd == null || loopEnd <= loopStart) return
    loopOn = true; updateLoopUI()
    playheadTime = loopStart
    playheadEl.style.left = (loopStart * ZOOM) + 'px'
    isPlaying ? scheduleMicSources() : doPlay()
  }
  // Split every clip that the playhead crosses (no selection model on the mic).
  function splitAtPlayhead() {
    const tp = playheadTime
    const affected = clips.filter(c => c.startTime + 0.1 < tp && tp < c.startTime + c.duration - 0.1)
    if (!affected.length) return
    const removed = affected.map(snapClip)
    const created = []
    affected.forEach(c => {
      const cs = c.startTime, ce = cs + c.duration, ts = c.trimStart || 0
      unmountClipById(c.id)
      created.push(snapClip(makeClipPiece(c, cs, tp - cs, ts)))
      created.push(snapClip(makeClipPiece(c, tp, ce - tp, ts + (tp - cs))))
    })
    updateRuler(); updateScrollbar()
    pushHistory('mic split',
      () => { created.forEach(p => unmountClipById(p.id)); removed.forEach(mountClip); updateRuler(); updateScrollbar() },
      () => { removed.forEach(r => unmountClipById(r.id)); created.forEach(mountClip); updateRuler(); updateScrollbar() })
  }
  // Customizable shortcuts (active only when the mic tool is focused/hovered).
  function onMicKey(e) {
    const a = document.activeElement
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    if (!body.contains(a) && !body.matches(':hover')) return
    if (matchesShortcut('marquee-clear', e)) { clearRange(); return }
    if (matchesShortcut('clip-delete', e) || e.key === 'Backspace') {
      if (rangeReady()) { e.preventDefault(); carveRange(loopStart, loopEnd); clearRange() }
      return
    }
    if (matchesShortcut('marquee-cut', e)) { if (rangeReady()) { e.preventDefault(); carveRange(loopStart, loopEnd); clearRange() } return }
    if (matchesShortcut('go-to-start', e)) { e.preventDefault(); goToStart(); return }
    if (matchesShortcut('loop-toggle', e)) {
      e.preventDefault()
      if (loopStart != null && loopEnd != null && loopEnd > loopStart) { loopOn = !loopOn; updateLoopUI() }
      return
    }
    if (matchesShortcut('zoom-in', e))        { e.preventDefault(); zoomBy(1.2); return }
    if (matchesShortcut('zoom-out', e))       { e.preventDefault(); zoomBy(1 / 1.2); return }
    if (matchesShortcut('zoom-reset', e))     { e.preventDefault(); zoomReset(); return }
    if (matchesShortcut('record', e))         { e.preventDefault(); btnRec.click(); return }
    if (matchesShortcut('new-track', e))      { e.preventDefault(); btnAdd.click(); return }
    if (matchesShortcut('clip-split', e))     { e.preventDefault(); splitAtPlayhead(); return }
    if (matchesShortcut('playhead-left', e))  { e.preventDefault(); movePlayhead(-1); return }
    if (matchesShortcut('playhead-right', e)) { e.preventDefault(); movePlayhead(1); return }
    if (matchesShortcut('play-loop', e))      { e.preventDefault(); playLoopRegion() }
  }
  document.addEventListener('keydown', onMicKey)

  const LANE_H = 40

  // ── Clips ─────────────────────────────────────────────────────────────────
  function positionClip(c) {
    c.el.style.left  = (c.startTime * ZOOM) + 'px'
    c.el.style.width = Math.max(4, c.duration * ZOOM) + 'px'
  }

  function laneIdxFromY(clientY) {
    let best = 0
    lanes.forEach((laneEl, i) => {
      const r = laneEl.getBoundingClientRect()
      if (clientY >= r.top && clientY <= r.bottom) best = i
    })
    return best
  }

  function makeClipDraggable(clip) {
    clip.el.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.preventDefault(); e.stopPropagation()

      const rect    = clip.el.getBoundingClientRect()
      const offsetX = e.clientX - rect.left
      const prevLane = clip.laneIdx, prevTime = clip.startTime

      const ghost = clip.el.cloneNode(true)
      ghost.style.cssText = `
        position:fixed;pointer-events:none;opacity:0.75;z-index:9000;overflow:hidden;border-radius:4px;
        width:${Math.min(clip.el.offsetWidth, 260)}px;height:${clip.el.offsetHeight}px;
        left:${rect.left}px;top:${rect.top}px;
      `
      document.body.appendChild(ghost)
      clip.el.classList.add('daw-clip-dragging')

      function onMove(ev) {
        ghost.style.left = (ev.clientX - offsetX) + 'px'
        ghost.style.top  = (ev.clientY - LANE_H / 2) + 'px'
      }

      function onUp(ev) {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        ghost.remove()
        clip.el.classList.remove('daw-clip-dragging')

        const under = document.elementFromPoint(ev.clientX, ev.clientY)
        if (under?.closest('.ed-body') && clip.savedPath) {
          const name = clip.savedPath.split(/[\\/]/).pop()
          under.dispatchEvent(new CustomEvent('iceample-drop', {
            bubbles: true,
            detail: { file: { name, path: clip.savedPath }, clientX: ev.clientX, clientY: ev.clientY }
          }))
          document.addEventListener('click', ev2 => ev2.stopPropagation(), { once: true, capture: true })
          return
        }

        const sr       = scrollWrap.getBoundingClientRect()
        const newLaneIdx = laneIdxFromY(ev.clientY)
        const newTime    = snapTime(Math.max(0, (ev.clientX - sr.left + scrollWrap.scrollLeft - offsetX) / ZOOM))

        const cid = clip.id
        const applyPos = (li, ti) => {
          const c = clips.find(x => x.id === cid); if (!c) return
          c.laneIdx = li; c.startTime = ti; positionClip(c)
          if (lanes[li] && !lanes[li].contains(c.el)) lanes[li].appendChild(c.el)
          updateRuler(); updateScrollbar()
        }
        applyPos(newLaneIdx, newTime)
        if (prevLane !== newLaneIdx || Math.abs(prevTime - newTime) > 0.001) {
          pushHistory('mic clip move', () => applyPos(prevLane, prevTime), () => applyPos(newLaneIdx, newTime))
        }

        document.addEventListener('click', ev => ev.stopPropagation(), { once: true, capture: true })
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })

    clip.el.addEventListener('contextmenu', e => {
      e.preventDefault()
      e.stopPropagation()
      showMicClipMenu(e, clip)
    })
  }

  // Right-click menu for a mic clip (open in editor + delete).
  let _micCtx = null
  function deleteMicClip(clip) {
    const snap = snapClip(clip)
    unmountClipById(clip.id)
    updateRuler(); updateScrollbar()
    pushHistory('mic clip delete',
      () => { mountClip(snap); updateRuler(); updateScrollbar() },
      () => { unmountClipById(snap.id); updateRuler(); updateScrollbar() })
  }
  function showMicClipMenu(e, clip) {
    if (_micCtx) { _micCtx.remove(); _micCtx = null }
    const close = () => { menu.remove(); _micCtx = null; document.removeEventListener('mousedown', onDoc) }
    const menu = document.createElement('div')
    menu.className = 'daw-clip-ctx'
    _micCtx = menu
    const name = clip.targetFolder || (clip.savedPath ? clip.savedPath.split(/[\\/]/).pop() : 'Clip')
    const head = document.createElement('div')
    head.className = 'daw-ctx-head'
    head.innerHTML = `<i class="fa-solid fa-microphone"></i><span>${name}</span>`
    menu.appendChild(head)
    if (clip.savedPath) {
      const ed = document.createElement('button')
      ed.className = 'daw-ctx-btn'
      ed.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${t('daw_open_editor')}`
      ed.addEventListener('click', () => {
        close()
        document.dispatchEvent(new CustomEvent('iceample-open-editor', { detail: { file: { name: clip.savedPath.split(/[\\/]/).pop(), path: clip.savedPath } } }))
      })
      menu.appendChild(ed)
      const sep = document.createElement('div'); sep.className = 'daw-ctx-sep'; menu.appendChild(sep)
    }
    if (window.__TAURI__) {
      const save = document.createElement('button')
      save.className = 'daw-ctx-btn'
      save.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${t('clip_save_sample')}`
      save.addEventListener('click', () => { close(); saveMicClipAsSample(clip) })
      menu.appendChild(save)
      const ring = document.createElement('button')
      ring.className = 'daw-ctx-btn'
      ring.innerHTML = `<i class="fa-solid fa-mobile-screen-button"></i> ${t('clip_export_ringtone')}`
      ring.addEventListener('click', () => { close(); exportClipAsRingtone(clip) })
      menu.appendChild(ring)
    }
    const del = document.createElement('button')
    del.className = 'daw-ctx-btn daw-ctx-del'
    del.innerHTML = `<i class="fa-solid fa-trash"></i> ${t('clip_delete')}`
    del.addEventListener('click', () => { close(); deleteMicClip(clip) })
    menu.appendChild(del)
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'
    document.body.appendChild(menu)
    const r = menu.getBoundingClientRect()
    if (r.right > innerWidth)   menu.style.left = (e.clientX - r.width)  + 'px'
    if (r.bottom > innerHeight) menu.style.top  = (e.clientY - r.height) + 'px'
    const onDoc = ev => { if (!menu.contains(ev.target)) close() }
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0)
  }

  // Render a mic clip's audio (honouring trim + duration) and save it as a WAV.
  async function saveMicClipAsSample(clip) {
    if (!window.__TAURI__) return
    if (!root) { window.toast?.(t('clip_save_no_lib'), 'error'); return }
    let buf = clip.audioBuffer
    if (!buf && clip.savedPath) {
      try {
        const { invoke } = window.__TAURI__.core
        const b64 = await invoke('read_file_base64', { path: clip.savedPath })
        const bin = atob(b64); const ab = new ArrayBuffer(bin.length); const v = new Uint8Array(ab)
        for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i)
        buf = await getCtx().decodeAudioData(ab)
      } catch {}
    }
    if (!buf) { window.toast?.(t('ed_no_audio'), 'info', 1200); return }

    const sr  = buf.sampleRate
    const dur = clip.duration || buf.duration
    const off = new OfflineAudioContext(buf.numberOfChannels, Math.max(1, Math.round(dur * sr)), sr)
    const src = off.createBufferSource(); src.buffer = buf
    src.connect(off.destination); src.start(0, clip.trimStart || 0, dur)
    const rendered = await off.startRendering()

    const defBase = clip.savedPath
      ? clip.savedPath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
      : (clip.targetFolder ? clip.targetFolder.toLowerCase() + '_clip' : 'sample')
    const base = await promptName(defBase, { title: t('clip_save_sample') })
    try {
      const fpath = root + sep + 'Sons' + sep + base + '.wav'
      const { invoke } = window.__TAURI__.core
      await invoke('save_binary_file', { path: fpath, base64: bufToBase64(encodeWAV(rendered)) })
      clip.savedPath = fpath   // mark as saved (no longer counts as unsaved)
      clip.el?.querySelector('.daw-clip-name') && (clip.el.querySelector('.daw-clip-name').textContent = base.slice(0, 22))
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Sons' } }))
      window.toast?.(t('clip_saved_sample') + ' : ' + base + '.wav', 'success')
    } catch { window.toast?.(t('clip_save_fail'), 'error') }
  }

  // Ringtones can't exceed this duration on iPhone (Android has no hard cap).
  const RINGTONE_MAX_DUR = 40

  // Render a mic clip's audio (honouring trim + duration, capped for ringtone
  // limits) and export it as .m4r (iPhone) + .mp3 (Android) via ffmpeg.
  async function exportClipAsRingtone(clip) {
    if (!window.__TAURI__) return
    if (!root) { window.toast?.(t('clip_save_no_lib'), 'error'); return }
    let buf = clip.audioBuffer
    if (!buf && clip.savedPath) {
      try {
        const { invoke } = window.__TAURI__.core
        const b64 = await invoke('read_file_base64', { path: clip.savedPath })
        const bin = atob(b64); const ab = new ArrayBuffer(bin.length); const v = new Uint8Array(ab)
        for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i)
        buf = await getCtx().decodeAudioData(ab)
      } catch {}
    }
    if (!buf) { window.toast?.(t('ed_no_audio'), 'info', 1200); return }

    const sr      = buf.sampleRate
    const fullDur = clip.duration || buf.duration
    const dur     = Math.min(fullDur, RINGTONE_MAX_DUR)
    const truncated = fullDur > RINGTONE_MAX_DUR
    const off = new OfflineAudioContext(buf.numberOfChannels, Math.max(1, Math.round(dur * sr)), sr)
    const src = off.createBufferSource(); src.buffer = buf
    src.connect(off.destination); src.start(0, clip.trimStart || 0, dur)
    const rendered = await off.startRendering()

    const defBase = clip.savedPath
      ? clip.savedPath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
      : (clip.targetFolder ? clip.targetFolder.toLowerCase() + '_ringtone' : 'sonnerie')
    const base = await promptName(defBase, { title: t('clip_export_ringtone') })

    try {
      const { invoke } = window.__TAURI__.core
      const dir     = root + sep + 'Sonneries'
      const wavPath = dir + sep + base + '.wav'
      const m4rPath = dir + sep + base + '.m4r'
      const mp3Path = dir + sep + base + '.mp3'
      await invoke('save_binary_file', { path: wavPath, base64: bufToBase64(encodeWAV(rendered)) })
      await invoke('convert_media', { input: wavPath, output: m4rPath, extraArgs: ['-c:a','aac','-b:a','192k','-movflags','+faststart'] })
      await invoke('convert_media', { input: wavPath, output: mp3Path, extraArgs: ['-c:a','libmp3lame','-b:a','192k'] })
      await invoke('delete_file', { path: wavPath })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: dir } }))
      window.toast?.(t('ringtone_saved') + ' : ' + base, 'success')
      const note = truncated ? t('ringtone_truncated_note') + '\n\n' : ''
      await showInfo(t('ringtone_info_title'), note + t('ringtone_info_msg'))
    } catch (e) { console.error(e); window.toast?.(t('ringtone_save_fail'), 'error') }
  }

  // A take recorded in this session that hasn't been written to disk yet.
  const hasUnsavedTakes = () => clips.some(c => c.audioBuffer && !c.savedPath)

  // Save every unsaved take to its category folder (Voix/Sons) with an auto name.
  async function saveAllUnsaved() {
    if (!root || !window.__TAURI__) return
    const { invoke } = window.__TAURI__.core
    const stamp = (() => { const n = new Date(); return n.getFullYear() +
      String(n.getMonth() + 1).padStart(2, '0') + String(n.getDate()).padStart(2, '0') + '_' +
      String(n.getHours()).padStart(2, '0') + String(n.getMinutes()).padStart(2, '0') + String(n.getSeconds()).padStart(2, '0') })()
    let i = 0
    const folders = new Set()
    for (const c of clips) {
      if (!c.audioBuffer || c.savedPath) continue
      const folder = c.targetFolder || 'Sons'
      const base   = folder.toLowerCase() + '_' + stamp + (i ? '_' + i : '')
      i++
      try {
        await invoke('save_binary_file', { path: root + sep + folder + sep + base + '.wav', base64: bufToBase64(encodeWAV(c.audioBuffer)) })
        c.savedPath = root + sep + folder + sep + base + '.wav'
        c.el?.querySelector('.daw-clip-name') && (c.el.querySelector('.daw-clip-name').textContent = base.slice(0, 22))
        folders.add(root + sep + folder)
      } catch {}
    }
    folders.forEach(f => window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: f } })))
  }

  // Render the clip's audio as a waveform behind its label.
  function micWaveDraw(clip) {
    if (!clip.el || !clip.audioBuffer) return
    let canvas = clip.el.querySelector('.daw-clip-wave')
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.className = 'daw-clip-wave'
      clip.el.insertBefore(canvas, clip.el.firstChild)
    }
    requestAnimationFrame(() => {
      const dispW = Math.max(1, Math.round(clip.duration * ZOOM))
      const h     = Math.max(1, Math.round(clip.el.clientHeight || 40))
      const cw    = Math.min(dispW, 2000)
      canvas.width = cw; canvas.height = h
      const ctx  = canvas.getContext('2d'); ctx.clearRect(0, 0, cw, h)
      const buf  = clip.audioBuffer, sr = buf.sampleRate, data = buf.getChannelData(0)
      const startS = Math.floor((clip.trimStart || 0) * sr)
      const lenS = Math.floor(clip.duration * sr)
      const per  = Math.max(1, Math.floor(lenS / cw)), mid = h / 2
      ctx.fillStyle = 'rgba(255,255,255,0.30)'
      for (let x = 0; x < cw; x++) {
        let mn = 1, mx = -1; const s0 = startS + x * per
        for (let i = 0; i < per; i++) { const v = data[s0 + i]; if (v === undefined) break; if (v < mn) mn = v; if (v > mx) mx = v }
        if (mx < mn) continue
        ctx.fillRect(x, mid - mx * mid * 0.92, 1, Math.max(1, (mn - mx) * -mid * 0.92))
      }
    })
  }

  async function createClipFromFile(laneIdx, time, file) {
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 22)
    const el   = document.createElement('div')
    el.className = 'daw-clip mic-clip'
    el.innerHTML = `<i class="fa-solid fa-volume-high"></i><span class="daw-clip-name">${name}</span>`
    const clip = { id: ++clipId, laneIdx, startTime: time, duration: 4, audioBuffer: null, targetFolder: null, savedPath: file.path, el }
    clips.push(clip)
    positionClip(clip)
    if (lanes[laneIdx]) lanes[laneIdx].appendChild(el)
    makeClipDraggable(clip)

    if (window.__TAURI__) {
      try {
        const { invoke } = window.__TAURI__.core
        const b64    = await invoke('read_file_base64', { path: file.path })
        const binary = atob(b64)
        const ab     = new ArrayBuffer(binary.length)
        const view   = new Uint8Array(ab)
        for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
        // Resume first: a suspended AudioContext can leave decodeAudioData
        // pending, so the clip keeps its placeholder size until the first Play.
        const ctx = getCtx()
        if (ctx.state === 'suspended') { try { await ctx.resume() } catch {} }
        const buf = await ctx.decodeAudioData(ab)
        clip.audioBuffer = buf
        clip.duration    = buf.duration
        positionClip(clip)
        micWaveDraw(clip)
        updateRuler(); updateScrollbar()
      } catch(e) { console.error('Mic drop load error:', e) }
    }
  }

  lanesEl.addEventListener('iceample-drop', e => {
    const { file, clientX, clientY } = e.detail
    if (!file) return
    const sr   = scrollWrap.getBoundingClientRect()
    const li   = laneIdxFromY(clientY)
    const time = Math.max(0, (clientX - sr.left + scrollWrap.scrollLeft) / ZOOM)
    createClipFromFile(li, time, file)
  })

  function addClip(laneIdx, startTime, duration, audioBuffer, targetFolder) {
    const id   = ++clipId
    const icon = targetFolder === 'Voix' ? 'fa-microphone' : 'fa-music'
    const el   = document.createElement('div')
    el.className = 'daw-clip mic-clip'
    el.dataset.clipId = id
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span class="daw-clip-name">${targetFolder}</span>`
    const clip = { id, laneIdx, startTime, duration, audioBuffer, targetFolder, el }
    clips.push(clip)
    positionClip(clip)
    if (lanes[laneIdx]) lanes[laneIdx].appendChild(el)
    makeClipDraggable(clip)
    micWaveDraw(clip)
    updateRuler(); updateScrollbar()
    return clip
  }

  // ── Mode buttons ──────────────────────────────────────────────────────────
  ;[modeVoix, modeSons].forEach(btn => {
    btn.addEventListener('click', () => {
      ;[modeVoix, modeSons].forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      recMode = btn.dataset.target
    })
  })

  // ── Recording ─────────────────────────────────────────────────────────────
  async function startRecording() {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { window.toast?.(t('mic_unavailable'), 'error'); return }

    recChunks    = []
    recStartWall = performance.now()
    recStartTime = playheadTime
    const icon   = recMode === 'Voix' ? 'fa-microphone' : 'fa-music'

    recClipEl = document.createElement('div')
    recClipEl.className = 'daw-clip mic-clip mic-clip-recording'
    recClipEl.style.left = (recStartTime * ZOOM) + 'px'
    recClipEl.style.width = '4px'
    recClipEl.innerHTML = `<i class="fa-solid ${icon}"></i><span class="daw-clip-name">●</span>`
    lanes[0]?.appendChild(recClipEl)

    function growClip() {
      if (!isRecording) return
      const elapsed = (performance.now() - recStartWall) / 1000
      if (recClipEl) recClipEl.style.width = Math.max(4, elapsed * ZOOM) + 'px'
      timeEl.textContent = fmtTime(recStartTime + elapsed)
      recAnimFrame = requestAnimationFrame(growClip)
    }
    recAnimFrame = requestAnimationFrame(growClip)

    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data) }
    mediaRecorder.onstop = async () => {
      cancelAnimationFrame(recAnimFrame)
      if (recClipEl) { recClipEl.remove(); recClipEl = null }

      const blob = new Blob(recChunks, { type: mediaRecorder.mimeType })
      try {
        const arrayBuf = await blob.arrayBuffer()
        // Decode on the shared bus context (also where it's played back) instead
        // of spawning a fresh AudioContext per take — browsers cap the number of
        // live contexts (~6), so one-per-recording eventually stops working.
        const decCtx = getCtx()
        if (decCtx.state === 'suspended') { try { await decCtx.resume() } catch {} }
        const decoded  = await decCtx.decodeAudioData(arrayBuf)
        // Keep the take in memory only — it stays "unsaved" until the user saves
        // it (right-click → Save as sample) or confirms saving when closing.
        addClip(0, recStartTime, decoded.duration, decoded, recMode)
      } catch { /* silent */ }
    }

    mediaRecorder.start()
    isRecording = true
    btnRec.classList.add('active')
  }

  function stopRecording() {
    if (!isRecording) return
    isRecording = false
    mediaRecorder.stop()
    stream.getTracks().forEach(t => t.stop())
    btnRec.classList.remove('active')
  }

  btnRec.addEventListener('click', () => { isRecording ? stopRecording() : startRecording() })

  // ── Playback ──────────────────────────────────────────────────────────────
  function getAC() { return getCtx() }

  // (Re)schedule every clip from the current playhead (honours trimStart + duration).
  function scheduleMicSources() {
    const ac = getAC()
    activeSources.forEach(s => { try { s.stop() } catch {} })
    activeSources = []
    playOffset = playheadTime; playStart = ac.currentTime
    clips.forEach(c => {
      if (!c.audioBuffer) return
      const ce = c.startTime + c.duration
      if (ce <= playOffset) return
      const ts       = c.trimStart || 0
      const localOff = Math.max(0, playOffset - c.startTime)
      const delay    = Math.max(0, c.startTime - playOffset)
      const src = ac.createBufferSource()
      src.buffer = c.audioBuffer; src.connect(getTrackNode('mic'))
      src.start(ac.currentTime + delay, ts + localOff, c.duration - localOff)
      activeSources.push(src)
    })
  }

  function doPlay() {
    if (isRecording) stopRecording()
    // With a loop set, start from its beginning if the playhead is outside it.
    if (loopOn && loopStart != null && loopEnd != null && (playheadTime < loopStart || playheadTime >= loopEnd)) {
      playheadTime = loopStart
      playheadEl.style.left = (playheadTime * ZOOM) + 'px'
    }
    isPlaying = true
    btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>'
    scheduleMicSources()

    function tick() {
      if (!isPlaying) return
      playheadTime = playOffset + (getAC().currentTime - playStart)
      if (loopOn && loopEnd != null && loopStart != null && playheadTime >= loopEnd) {
        playheadTime = loopStart
        scheduleMicSources()
      }
      const px = playheadTime * ZOOM
      playheadEl.style.left = px + 'px'
      timeEl.textContent = fmtTime(playheadTime)
      const visibleRight = scrollWrap.scrollLeft + scrollWrap.clientWidth
      if (px > visibleRight - 80) scrollWrap.scrollLeft = px - scrollWrap.clientWidth / 2
      updateScrollbar()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  function doPause() {
    if (!isPlaying) return
    isPlaying = false
    cancelAnimationFrame(rafId)
    activeSources.forEach(s => { try { s.stop() } catch {} })
    activeSources = []
    // Fige la position courante sans remettre à 0
    playheadTime = playOffset + (getAC().currentTime - playStart)
    playheadEl.style.left = (playheadTime * ZOOM) + 'px'
    timeEl.textContent = fmtTime(playheadTime)
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
    updateScrollbar()
  }

  function doStop() {
    isPlaying = false
    cancelAnimationFrame(rafId)
    activeSources.forEach(s => { try { s.stop() } catch {} })
    activeSources = []
    playheadTime = 0
    playheadEl.style.left = '0px'
    timeEl.textContent = '0:00'
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
    updateScrollbar()
  }

  btnPlay.addEventListener('click', () => { isPlaying ? doPause() : doPlay() })

  // Global transport sync (shared position).
  function onTransport(e) {
    const a = e.detail.action
    if (a === 'play') {
      if (e.detail.position != null) {
        playheadTime = e.detail.position
        playheadEl.style.left = (playheadTime * ZOOM) + 'px'
      }
      if (!isPlaying) doPlay()
    } else if (a === 'pause') {
      doPause()
    } else {
      doStop()
    }
  }
  window.addEventListener('iceample-transport', onTransport)
  btnStop.addEventListener('click', () => { doStop(); stopRecording() })

  // ── Sauvegarder projet (.icemic) ─────────────────────────────────────────
  btnSave.addEventListener('click', async () => {
    const name = nameInp.value.trim() || t('mic_default_name')
    if (!root || !window.__TAURI__) { setBtnState(btnSave, 'err'); resetBtn(btnSave, 'fa-floppy-disk'); return }
    setBtnState(btnSave, 'spin')
    try {
      const data = JSON.stringify({
        lanes: lanes.length,
        clips: clips.map(c => ({
          laneIdx:      c.laneIdx,
          startTime:    c.startTime,
          duration:     c.duration,
          targetFolder: c.targetFolder,
          savedPath:    c.savedPath || null,
        })),
      }, null, 2)
      const { invoke } = window.__TAURI__.core
      await invoke('save_text_file', { path: root + sep + 'Pistes' + sep + name + '.icemic', content: data })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Pistes' } }))
      setBtnState(btnSave, 'ok')
    } catch { setBtnState(btnSave, 'err') }
    resetBtn(btnSave, 'fa-floppy-disk')
  })

  nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click() })

  // ── Export WAV ────────────────────────────────────────────────────────────
  btnExport.addEventListener('click', async () => {
    const name       = nameInp.value.trim() || t('mic_default_name')
    const validClips = clips.filter(c => c.audioBuffer)
    if (!root || !window.__TAURI__) { setBtnState(btnExport, 'err'); resetBtn(btnExport, 'fa-file-audio'); return }
    if (!validClips.length) { setBtnState(btnExport, 'err'); resetBtn(btnExport, 'fa-file-audio'); return }

    const dur = Math.max(...validClips.map(c => c.startTime + c.duration))
    if (!dur) { setBtnState(btnExport, 'err'); resetBtn(btnExport, 'fa-file-audio'); return }

    setBtnState(btnExport, 'spin')
    try {
      const offCtx = new OfflineAudioContext(2, Math.ceil(44100 * dur), 44100)
      validClips.forEach(c => {
        const src = offCtx.createBufferSource()
        src.buffer = c.audioBuffer
        src.connect(offCtx.destination)
        src.start(c.startTime)
      })
      const rendered = await offCtx.startRendering()
      const b64 = bufToBase64(encodeWAV(rendered))
      const { invoke } = window.__TAURI__.core
      await invoke('save_binary_file', { path: root + sep + 'Séquences Audio' + sep + name + '.wav', base64: b64 })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Séquences Audio' } }))
      setBtnState(btnExport, 'ok')
    } catch (e) { console.error(e); setBtnState(btnExport, 'err') }
    resetBtn(btnExport, 'fa-file-audio')
  })

  // ── Init ──────────────────────────────────────────────────────────────────
  updateRuler(); updateScrollbar()
  playheadEl.style.left = '0px'

  const resizeObs = new ResizeObserver(() => { updateRuler(); updateScrollbar() })
  resizeObs.observe(scrollWrap)

  // Expose the mic's actions to the command palette while it's open.
  registerCommands([
    { id: 'mic:record',      titleKey: 'sc_record',      icon: 'fa-solid fa-circle',           category: 'tool_mic', shortcutAction: 'record',      run: () => btnRec.click() },
    { id: 'mic:new-track',   titleKey: 'sc_new_track',   icon: 'fa-solid fa-plus',             category: 'tool_mic', shortcutAction: 'new-track',   run: () => btnAdd.click() },
    { id: 'mic:split',       titleKey: 'sc_clip_split',  icon: 'fa-solid fa-scissors',         category: 'tool_mic', shortcutAction: 'clip-split',  run: () => splitAtPlayhead() },
    { id: 'mic:go-to-start', titleKey: 'sc_go_to_start', icon: 'fa-solid fa-backward-fast',    category: 'tool_mic', shortcutAction: 'go-to-start', run: () => goToStart() },
    { id: 'mic:play-loop',   titleKey: 'sc_play_loop',   icon: 'fa-solid fa-repeat',           category: 'tool_mic', shortcutAction: 'play-loop',   run: () => playLoopRegion() },
    { id: 'mic:zoom-in',     titleKey: 'sc_zoom_in',     icon: 'fa-solid fa-magnifying-glass-plus',  category: 'tool_mic', shortcutAction: 'zoom-in',  run: () => zoomBy(1.2) },
    { id: 'mic:zoom-out',    titleKey: 'sc_zoom_out',    icon: 'fa-solid fa-magnifying-glass-minus', category: 'tool_mic', shortcutAction: 'zoom-out', run: () => zoomBy(1 / 1.2) },
    { id: 'mic:zoom-reset',  titleKey: 'sc_zoom_reset',  icon: 'fa-solid fa-magnifying-glass', category: 'tool_mic', shortcutAction: 'zoom-reset', run: () => zoomReset() },
  ])

  const cleanObs = new MutationObserver(() => {
    if (!document.contains(body)) {
      doStop(); stopRecording()
      window.removeEventListener('iceample-transport', onTransport)
      document.removeEventListener('keydown', onMicKey)
      unregisterCommandsBy(c => c.id.startsWith('mic:'))
      cleanObs.disconnect(); resizeObs.disconnect()
    }
  })
  cleanObs.observe(document.body, { childList: true, subtree: true })

  // Closing the track with unsaved takes → classic confirm + offer to save.
  const micWin = body.closest('.tool-win')
  if (micWin) {
    micWin._beforeClose = async (doClose) => {
      if (!hasUnsavedTakes()) { doClose(); return }
      const choice = await confirmUnsaved()
      if (choice === 'cancel') return
      if (choice === 'save') await saveAllUnsaved()
      doClose()
    }
  }
}

function encodeWAV(decoded) {
  const numCh = 2, sr = decoded.sampleRate
  const left  = decoded.getChannelData(0)
  const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left
  const len   = left.length
  const buf   = new ArrayBuffer(44 + len * 4)
  const v     = new DataView(buf)
  const s = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)) }
  s(0,'RIFF'); v.setUint32(4, 36 + len * 4, true); s(8,'WAVE')
  s(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,numCh,true)
  v.setUint32(24,sr,true); v.setUint32(28,sr*numCh*2,true); v.setUint16(32,numCh*2,true); v.setUint16(34,16,true)
  s(36,'data'); v.setUint32(40, len * 4, true)
  let off = 44
  for (let i = 0; i < len; i++) {
    v.setInt16(off, Math.max(-1,Math.min(1,left[i]))  * 0x7fff, true); off += 2
    v.setInt16(off, Math.max(-1,Math.min(1,right[i])) * 0x7fff, true); off += 2
  }
  return new Uint8Array(buf)
}

function bufToBase64(bytes) {
  let b = ''
  for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i])
  return btoa(b)
}
