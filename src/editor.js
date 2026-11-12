import { getCtx, getTrackNode } from './audio-bus.js'
import { t } from './i18n.js'
import { pushHistory } from './history.js'
import { matchesShortcut, getShortcut, formatBinding, DEFAULT_SHORTCUTS } from './shortcuts.js'
import { registerCommands, unregisterCommandsBy } from './commands.js'

function injectFxMenuStyles() {
  if (document.getElementById('ed-fx-menu-styles')) return
  const s = document.createElement('style')
  s.id = 'ed-fx-menu-styles'
  s.textContent = `
.ed-fx-menu-pop {
  position: fixed; display: none; flex-direction: column; gap: 1px;
  min-width: 220px; padding: 5px; z-index: 9999;
  background: #121214; border: 1px solid #2c2c2e; border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.7);
}
.ed-fx-menu-pop.open { display: flex; }
.ed-fx-menu-row {
  display: flex; align-items: center; gap: 9px;
  padding: 6px 8px; border: none; border-radius: 5px;
  background: transparent; color: var(--text-secondary, #bbb);
  font-family: inherit; font-size: 11px; cursor: pointer; text-align: left;
  transition: background 0.1s, color 0.1s;
}
.ed-fx-menu-row:hover { background: rgba(255,255,255,0.06); color: var(--text-primary, #fff); }
.ed-fx-menu-row > i { width: 14px; text-align: center; font-size: 11px; color: var(--color-active, #4a9eff); flex-shrink: 0; }
.ed-fx-menu-lbl { flex: 1; }
.ed-fx-menu-kbd {
  font-size: 9px; color: #777; font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em; padding-left: 10px; white-space: nowrap;
}
.ed-fx-menu-sep { height: 1px; margin: 4px 6px; background: rgba(255,255,255,0.08); }
  `
  document.head.appendChild(s)
}

export function initEditor(body) {
  body.classList.add('ed-body')


  // ── Tab system ────────────────────────────────────────────────────────────
  let tabs        = []
  let activeTabIdx = 0

  function createTabData(name = '') {
    return { name, buffer: null, trimIn: 0, trimOut: 0, playOffset: 0, fx: [], fxIdSeq: 0, outname: '' }
  }

  // Active-tab mirror — all existing logic reads/writes these
  let buffer = null
  let trimIn = 0, trimOut = 0
  let playing = false, srcNode = null, playStart = 0, playOffset = 0, rafId = null
  const fx = []
  let fxIdSeq = 0
  let edClipboard = null   // { sr, chans:[Float32Array] } — internal editor clipboard

  function saveCurrentTab() {
    if (!tabs.length) return
    const td = tabs[activeTabIdx]
    td.buffer = buffer; td.trimIn = trimIn; td.trimOut = trimOut
    td.playOffset = playOffset
    td.fx = fx.map(f => ({ ...f, _live: null }))
    td.fxIdSeq = fxIdSeq
    td.outname = outnameEl ? outnameEl.value : ''
  }

  function loadTabState(idx) {
    const td = tabs[idx]
    buffer = td.buffer; trimIn = td.trimIn; trimOut = td.trimOut
    playOffset = td.playOffset
    playing = false; srcNode = null; rafId = null
    fx.length = 0; td.fx.forEach(f => fx.push({ ...f, _live: null }))
    fxIdSeq = td.fxIdSeq
    if (outnameEl) outnameEl.value = td.outname
  }

  function switchTab(idx) {
    softStop()
    saveCurrentTab()
    activeTabIdx = idx
    loadTabState(idx)
    renderTabs()
    refreshEditorUI()
  }

  function addNewTab() {
    softStop()
    saveCurrentTab()
    tabs.push(createTabData())
    activeTabIdx = tabs.length - 1
    loadTabState(activeTabIdx)
    renderTabs()
    refreshEditorUI()
  }

  function closeTab(idx) {
    softStop()
    if (tabs.length === 1) {
      tabs[0] = createTabData()
      activeTabIdx = 0
      loadTabState(0)
      renderTabs()
      refreshEditorUI()
      return
    }
    tabs.splice(idx, 1)
    if (activeTabIdx >= tabs.length) activeTabIdx = tabs.length - 1
    else if (idx < activeTabIdx) activeTabIdx--
    loadTabState(activeTabIdx)
    renderTabs()
    refreshEditorUI()
  }

  // ── HTML ──────────────────────────────────────────────────────────────────
  body.innerHTML = `
    <div class="ed-tabs-bar" id="ed-tabs-bar">
      <div class="ed-tabs-list" id="ed-tabs-list"></div>
      <button class="ed-new-tab-btn" id="ed-new-tab" title="${t('ed_new_tab_title')}"><i class="fa-solid fa-plus"></i></button>
      <div style="flex:1"></div>
      <button class="seq-btn daw-play-btn" id="ed-play"><i class="fa-solid fa-play"></i></button>
      <button class="seq-btn" id="ed-stop"><i class="fa-solid fa-stop"></i></button>
      <span class="ed-time" id="ed-time">0:00 / 0:00</span>
    </div>
    <div class="ed-topbar">
      <div class="ed-search-wrap" id="ed-search-wrap">
        <i class="fa-solid fa-magnifying-glass ed-search-icon"></i>
        <input class="ed-search-input" id="ed-search" type="text" placeholder="${t('ed_search_placeholder')}" autocomplete="off" spellcheck="false" />
        <div class="ed-search-drop hidden" id="ed-search-drop"></div>
      </div>
    </div>
    <div class="ed-wave-wrap" id="ed-wave-wrap">
      <canvas id="ed-canvas"></canvas>
      <div class="ed-ph" id="ed-ph"></div>
      <div class="ed-trim-handle ed-trim-in"  id="ed-tin"></div>
      <div class="ed-trim-handle ed-trim-out" id="ed-tout"></div>
      <div class="ed-wave-empty" id="ed-wave-empty">
        <i class="fa-solid fa-arrow-up-from-bracket"></i>
        <span>${t('ed_drop_hint')}</span>
      </div>
    </div>
    <div class="ed-fx-bar">
      <span class="ed-fx-label">${t('ed_fx_label')}</span>
    </div>
    <div class="ed-fx-chain" id="ed-fx-chain"></div>
    <div class="ed-fx-palette" id="ed-fx-palette"></div>
    <div class="ed-vst-panel" id="ed-vst-panel" style="display:none">
      <div class="ed-vst-panel-hdr">
        <span>VST</span>
        <input class="ed-vst-search" id="ed-vst-search" type="text" placeholder="Filtrer…" autocomplete="off" spellcheck="false" />
        <button class="seq-btn" id="ed-vst-scan" title="${t('ed_scan_vst_title')}"><i class="fa-solid fa-rotate"></i></button>
        <button class="seq-btn" id="ed-vst-add-folder" title="${t('ed_add_folder_title')}"><i class="fa-solid fa-folder-plus"></i></button>
        <button class="ed-fx-del" id="ed-vst-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="ed-vst-list" id="ed-vst-list"></div>
    </div>
    <div class="ed-footer">
      <button class="seq-btn" id="ed-fx-menu" title="${t('ed_fx_menu_title')}"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
      <input class="seq-save-input" id="ed-outname" type="text" placeholder="${t('ed_export_placeholder')}" maxlength="40" />
      <button class="seq-btn" id="ed-export" title="${t('ed_export_title')}"><i class="fa-solid fa-file-audio"></i></button>
    </div>
  `

  const tabsList  = body.querySelector('#ed-tabs-list')
  const btnNewTab = body.querySelector('#ed-new-tab')
  const btnPlay   = body.querySelector('#ed-play')
  const btnStop   = body.querySelector('#ed-stop')
  const timeEl    = body.querySelector('#ed-time')
  const waveWrap  = body.querySelector('#ed-wave-wrap')
  const canvas    = body.querySelector('#ed-canvas')
  const phEl      = body.querySelector('#ed-ph')
  const tinEl     = body.querySelector('#ed-tin')
  const toutEl    = body.querySelector('#ed-tout')
  const emptyEl   = body.querySelector('#ed-wave-empty')
  const fxChain      = body.querySelector('#ed-fx-chain')
  const fxPalette    = body.querySelector('#ed-fx-palette')
  const vstPanel     = body.querySelector('#ed-vst-panel')
  const vstSearch    = body.querySelector('#ed-vst-search')
  const vstScanBtn   = body.querySelector('#ed-vst-scan')
  const vstFolderBtn = body.querySelector('#ed-vst-add-folder')
  const vstCloseBtn  = body.querySelector('#ed-vst-close')
  const vstList      = body.querySelector('#ed-vst-list')
  const outnameEl    = body.querySelector('#ed-outname')
  const btnExport = body.querySelector('#ed-export')

  function renderTabs() {
    tabsList.innerHTML = ''
    tabs.forEach((tabData, i) => {
      const tab = document.createElement('div')
      tab.className = 'ed-tab' + (i === activeTabIdx ? ' active' : '')
      const label = tabData.name || t('ed_tab_new')
      tab.innerHTML = `<span class="ed-tab-name" title="${label}">${label}</span><button class="ed-tab-close" title="${t('ed_tab_close_title')}"><i class="fa-solid fa-xmark"></i></button>`
      tab.addEventListener('click', e => {
        if (e.target.closest('.ed-tab-close')) return
        if (i !== activeTabIdx) switchTab(i)
      })
      tab.querySelector('.ed-tab-close').addEventListener('click', e => {
        e.stopPropagation()
        closeTab(i)
      })
      tabsList.appendChild(tab)
    })
  }

  function refreshEditorUI() {
    if (buffer) {
      emptyEl.style.display = 'none'
      drawWaveform()
    } else {
      emptyEl.style.display = ''
      const g = canvas.getContext('2d')
      if (g) g.clearRect(0, 0, canvas.width, canvas.height)
      tinEl.style.left  = '-6px'
      toutEl.style.left = '-6px'
    }
    renderChain()
    tick()
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
  }

  btnNewTab.addEventListener('click', addNewTab)

  // ── Waveform ──────────────────────────────────────────────────────────────
  function drawWaveform() {
    if (!buffer) return
    const W = canvas.width  = waveWrap.clientWidth
    const H = canvas.height = waveWrap.clientHeight
    const g    = canvas.getContext('2d')
    const data = buffer.getChannelData(0)
    const step = Math.max(1, Math.floor(data.length / W))
    const mid  = H / 2
    const col  = getComputedStyle(document.documentElement).getPropertyValue('--color-active').trim() || '#4a9eff'

    g.clearRect(0, 0, W, H)
    g.fillStyle = col + 'aa'
    for (let x = 0; x < W; x++) {
      let peak = 0
      for (let j = 0; j < step; j++) {
        const v = Math.abs(data[x * step + j] || 0)
        if (v > peak) peak = v
      }
      const h = peak * mid * 0.92
      g.fillRect(x, mid - h, 1, h * 2 || 1)
    }

    const dur  = buffer.duration
    const inX  = trimIn  / dur * W
    const outX = trimOut / dur * W

    g.fillStyle = 'rgba(0,0,0,0.5)'
    g.fillRect(0, 0, inX, H)
    g.fillRect(outX, 0, W - outX, H)

    g.strokeStyle = 'rgba(255,255,255,0.85)'
    g.lineWidth = 1
    ;[inX, outX].forEach(x => { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke() })

    tinEl.style.left  = (inX  - 6) + 'px'
    toutEl.style.left = (outX - 6) + 'px'
  }

  // ── Destructive DSP (normalize / fade / reverse) ───────────────────────────
  // All operate on the current trim region [trimIn, trimOut] (the whole clip by
  // default), in place, with a region snapshot pushed to the undo stack.
  function regionRange() {
    if (!buffer) return null
    const sr = buffer.sampleRate
    let s = Math.floor((trimIn || 0) * sr)
    let e = Math.floor((trimOut != null ? trimOut : buffer.duration) * sr)
    s = Math.max(0, Math.min(s, buffer.length))
    e = Math.max(s, Math.min(e, buffer.length))
    return (e - s < 1) ? null : { s, e }
  }
  function applyDsp(label, fn) {
    const r = regionRange()
    if (!r) { window.toast?.(t('ed_no_audio'), 'info', 1200); return }
    const buf = buffer
    const before = []
    for (let c = 0; c < buf.numberOfChannels; c++) before.push(buf.getChannelData(c).slice(r.s, r.e))
    fn(buf, r.s, r.e)
    if (buffer === buf) drawWaveform()
    const after = []
    for (let c = 0; c < buf.numberOfChannels; c++) after.push(buf.getChannelData(c).slice(r.s, r.e))
    const paint = () => { if (buffer === buf) drawWaveform() }
    pushHistory('editor ' + label,
      () => { before.forEach((d, c) => buf.getChannelData(c).set(d, r.s)); paint() },
      () => { after.forEach((d, c) => buf.getChannelData(c).set(d, r.s)); paint() })
    window.toast?.(t('ed_' + label + '_done') || label, 'success', 1000)
  }
  function dspReverse(buf, s, e) {
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = s, j = e - 1; i < j; i++, j--) { const tmp = d[i]; d[i] = d[j]; d[j] = tmp }
    }
  }
  function dspNormalize(buf, s, e) {
    let peak = 0
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = s; i < e; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v }
    }
    if (peak < 1e-6) return
    const g = Math.min(32, 1 / peak)   // peak-normalize to 0 dBFS, capped
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = s; i < e; i++) d[i] *= g
    }
  }
  function dspFade(buf, s, e, dir, curve = 'lin') {
    const n = e - s
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = s; i < e; i++) {
        const tt = (i - s) / n
        let g = dir > 0 ? tt : 1 - tt
        if (curve === 'exp') g = g * g   // quadratic (slow ends, perceptual)
        d[i] *= g
      }
    }
  }
  function dspGain(buf, s, e, db) {
    const g = Math.pow(10, db / 20)
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = s; i < e; i++) d[i] = Math.max(-1, Math.min(1, d[i] * g))
    }
  }
  function dspSilence(buf, s, e) {
    for (let c = 0; c < buf.numberOfChannels; c++) buf.getChannelData(c).fill(0, s, e)
  }

  // ── Length-changing ops (crop / cut / paste) ───────────────────────────────
  function makeBuffer(chans, sr) {
    const b = getCtx().createBuffer(chans.length, Math.max(1, chans[0].length), sr)
    for (let c = 0; c < chans.length; c++) b.copyToChannel(chans[c], c)
    return b
  }
  // Linear-interpolation resampler (used when pasting across sample rates).
  function resampleChannel(data, fromSr, toSr) {
    if (fromSr === toSr) return data
    const ratio = toSr / fromSr
    const outLen = Math.max(1, Math.round(data.length * ratio))
    const out = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) {
      const srcPos = i / ratio
      const i0 = Math.floor(srcPos)
      const i1 = Math.min(data.length - 1, i0 + 1)
      const frac = srcPos - i0
      out[i] = data[i0] * (1 - frac) + data[i1] * frac
    }
    return out
  }
  // Swap the active buffer for a new one (undoable, multi-tab safe).
  function replaceBuffer(label, newBuf, ti, to) {
    const idx = activeTabIdx
    const oldBuf = buffer, oti = trimIn, oto = trimOut
    const set = (buf, a, b) => {
      if (activeTabIdx === idx) { buffer = buf; trimIn = a; trimOut = b; refreshEditorUI() }
      else { const td = tabs[idx]; if (td) { td.buffer = buf; td.trimIn = a; td.trimOut = b } }
    }
    softStop(); set(newBuf, ti, to)
    pushHistory('editor ' + label, () => set(oldBuf, oti, oto), () => set(newBuf, ti, to))
  }
  function cropToSelection() {
    const r = regionRange(); if (!r) { window.toast?.(t('ed_no_audio'), 'info', 1200); return }
    const sr = buffer.sampleRate
    const chans = []
    for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c).slice(r.s, r.e))
    replaceBuffer('crop', makeBuffer(chans, sr), 0, (r.e - r.s) / sr)
    window.toast?.(t('ed_crop_done'), 'success', 1000)
  }
  function copySelection() {
    const r = regionRange(); if (!r) { window.toast?.(t('ed_no_audio'), 'info', 1200); return }
    edClipboard = { sr: buffer.sampleRate, chans: [] }
    for (let c = 0; c < buffer.numberOfChannels; c++) edClipboard.chans.push(buffer.getChannelData(c).slice(r.s, r.e))
    window.toast?.(t('ed_copy_done'), 'info', 900)
  }
  function cutSelection() {
    const r = regionRange(); if (!r) { window.toast?.(t('ed_no_audio'), 'info', 1200); return }
    const sr = buffer.sampleRate
    edClipboard = { sr, chans: [] }
    const newChans = []
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c)
      edClipboard.chans.push(d.slice(r.s, r.e))
      const merged = new Float32Array(d.length - (r.e - r.s))
      merged.set(d.slice(0, r.s), 0)
      merged.set(d.slice(r.e), r.s)
      newChans.push(merged)
    }
    const ti = r.s / sr
    replaceBuffer('cut', makeBuffer(newChans, sr), ti, ti)
    window.toast?.(t('ed_cut_done'), 'success', 1000)
  }
  function pasteClipboard() {
    if (!edClipboard) { window.toast?.(t('ed_clipboard_empty'), 'info', 1200); return }
    if (!buffer) {
      const len = edClipboard.chans[0].length
      replaceBuffer('paste', makeBuffer(edClipboard.chans.map(d => d.slice()), edClipboard.sr), 0, len / edClipboard.sr)
      window.toast?.(t('ed_paste_done'), 'success', 1000); return
    }
    const sr = buffer.sampleRate
    // Resample the clipboard to the target rate if it was copied at another SR.
    const clipChans = edClipboard.chans.map(d => resampleChannel(d, edClipboard.sr, sr))
    const clipLen = clipChans[0].length
    const insertAt = Math.max(0, Math.min(buffer.length, Math.floor((trimIn || 0) * sr)))
    const newChans = []
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c)
      const clip = clipChans[c] || clipChans[0]
      const merged = new Float32Array(d.length + clip.length)
      merged.set(d.slice(0, insertAt), 0)
      merged.set(clip, insertAt)
      merged.set(d.slice(insertAt), insertAt + clip.length)
      newChans.push(merged)
    }
    replaceBuffer('paste', makeBuffer(newChans, sr), insertAt / sr, (insertAt + clipLen) / sr)
    window.toast?.(t('ed_paste_done'), 'success', 1000)
  }
  // Insert N seconds of silence at trimIn (or create a silent clip if empty).
  function insertSilence(seconds = 1) {
    if (!buffer) {
      const sr = getCtx().sampleRate
      const n = Math.round(seconds * sr)
      replaceBuffer('insert_silence', makeBuffer([new Float32Array(n), new Float32Array(n)], sr), 0, seconds)
      window.toast?.(t('ed_insert_silence_done'), 'success', 1000); return
    }
    const sr = buffer.sampleRate
    const n = Math.round(seconds * sr)
    const insertAt = Math.max(0, Math.min(buffer.length, Math.floor((trimIn || 0) * sr)))
    const newChans = []
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c)
      const merged = new Float32Array(d.length + n)
      merged.set(d.slice(0, insertAt), 0)
      merged.set(d.slice(insertAt), insertAt + n)   // middle stays zero
      newChans.push(merged)
    }
    replaceBuffer('insert_silence', makeBuffer(newChans, sr), insertAt / sr, (insertAt + n) / sr)
    window.toast?.(t('ed_insert_silence_done'), 'success', 1000)
  }

  // Editor shortcuts — only when the editor is focused/hovered.
  function onEdKey(e) {
    const a = document.activeElement
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
    if (!body.contains(a) && !body.matches(':hover')) return
    if (matchesShortcut('ed-normalize', e)) { e.preventDefault(); applyDsp('normalize', dspNormalize); return }
    if (matchesShortcut('ed-reverse', e))   { e.preventDefault(); applyDsp('reverse', dspReverse); return }
    if (matchesShortcut('ed-fade-in', e))   { e.preventDefault(); applyDsp('fade_in',  (b, s, en) => dspFade(b, s, en, 1)); return }
    if (matchesShortcut('ed-fade-out', e))  { e.preventDefault(); applyDsp('fade_out', (b, s, en) => dspFade(b, s, en, -1)); return }
    if (matchesShortcut('ed-fade-in-exp', e))  { e.preventDefault(); applyDsp('fade_in_exp',  (b, s, en) => dspFade(b, s, en, 1, 'exp')); return }
    if (matchesShortcut('ed-fade-out-exp', e)) { e.preventDefault(); applyDsp('fade_out_exp', (b, s, en) => dspFade(b, s, en, -1, 'exp')); return }
    if (matchesShortcut('ed-insert-silence', e)) { e.preventDefault(); insertSilence(1); return }
    if (matchesShortcut('ed-gain-up', e))   { e.preventDefault(); applyDsp('gain_up',   (b, s, en) => dspGain(b, s, en, 1)); return }
    if (matchesShortcut('ed-gain-down', e)) { e.preventDefault(); applyDsp('gain_down', (b, s, en) => dspGain(b, s, en, -1)); return }
    if (matchesShortcut('ed-silence', e))   { e.preventDefault(); applyDsp('silence', dspSilence); return }
    if (matchesShortcut('ed-crop', e))      { e.preventDefault(); cropToSelection(); return }
    if (matchesShortcut('ed-cut', e))       { e.preventDefault(); cutSelection(); return }
    if (matchesShortcut('ed-copy', e))      { e.preventDefault(); copySelection(); return }
    if (matchesShortcut('ed-paste', e))     { e.preventDefault(); pasteClipboard() }
  }
  document.addEventListener('keydown', onEdKey)

  // Expose the editor's actions to the command palette while it's open.
  registerCommands([
    { id: 'editor:normalize',      titleKey: 'sc_ed_normalize',     icon: 'fa-solid fa-wand-magic-sparkles', category: 'tool_editor', shortcutAction: 'ed-normalize',     run: () => applyDsp('normalize', dspNormalize) },
    { id: 'editor:gain-up',        titleKey: 'sc_ed_gain_up',       icon: 'fa-solid fa-volume-high',         category: 'tool_editor', shortcutAction: 'ed-gain-up',       run: () => applyDsp('gain_up',   (b, s, e) => dspGain(b, s, e, 1)) },
    { id: 'editor:gain-down',      titleKey: 'sc_ed_gain_down',     icon: 'fa-solid fa-volume-low',          category: 'tool_editor', shortcutAction: 'ed-gain-down',     run: () => applyDsp('gain_down', (b, s, e) => dspGain(b, s, e, -1)) },
    { id: 'editor:fade-in',        titleKey: 'sc_ed_fade_in',       icon: 'fa-solid fa-arrow-trend-up',      category: 'tool_editor', shortcutAction: 'ed-fade-in',       run: () => applyDsp('fade_in',  (b, s, e) => dspFade(b, s, e, 1)) },
    { id: 'editor:fade-out',       titleKey: 'sc_ed_fade_out',      icon: 'fa-solid fa-arrow-trend-down',    category: 'tool_editor', shortcutAction: 'ed-fade-out',      run: () => applyDsp('fade_out', (b, s, e) => dspFade(b, s, e, -1)) },
    { id: 'editor:fade-in-exp',    titleKey: 'sc_ed_fade_in_exp',   icon: 'fa-solid fa-bezier-curve',        category: 'tool_editor', shortcutAction: 'ed-fade-in-exp',   run: () => applyDsp('fade_in_exp',  (b, s, e) => dspFade(b, s, e, 1, 'exp')) },
    { id: 'editor:fade-out-exp',   titleKey: 'sc_ed_fade_out_exp',  icon: 'fa-solid fa-bezier-curve',        category: 'tool_editor', shortcutAction: 'ed-fade-out-exp',  run: () => applyDsp('fade_out_exp', (b, s, e) => dspFade(b, s, e, -1, 'exp')) },
    { id: 'editor:reverse',        titleKey: 'sc_ed_reverse',       icon: 'fa-solid fa-right-left',          category: 'tool_editor', shortcutAction: 'ed-reverse',       run: () => applyDsp('reverse', dspReverse) },
    { id: 'editor:silence',        titleKey: 'sc_ed_silence',       icon: 'fa-solid fa-volume-xmark',        category: 'tool_editor', shortcutAction: 'ed-silence',       run: () => applyDsp('silence', dspSilence) },
    { id: 'editor:insert-silence', titleKey: 'sc_ed_insert_silence',icon: 'fa-solid fa-grip-lines-vertical', category: 'tool_editor', shortcutAction: 'ed-insert-silence',run: () => insertSilence(1) },
    { id: 'editor:crop',           titleKey: 'sc_ed_crop',          icon: 'fa-solid fa-crop-simple',         category: 'tool_editor', shortcutAction: 'ed-crop',          run: () => cropToSelection() },
    { id: 'editor:cut',            titleKey: 'sc_ed_cut',           icon: 'fa-solid fa-scissors',            category: 'tool_editor', shortcutAction: 'ed-cut',           run: () => cutSelection() },
    { id: 'editor:copy',           titleKey: 'sc_ed_copy',          icon: 'fa-solid fa-copy',                category: 'tool_editor', shortcutAction: 'ed-copy',          run: () => copySelection() },
    { id: 'editor:paste',          titleKey: 'sc_ed_paste',         icon: 'fa-solid fa-paste',               category: 'tool_editor', shortcutAction: 'ed-paste',         run: () => pasteClipboard() },
  ])

  new MutationObserver((_, obs) => {
    if (!body.isConnected) {
      document.removeEventListener('keydown', onEdKey); closeFxMenu()
      unregisterCommandsBy(c => c.id.startsWith('editor:'))
      obs.disconnect()
    }
  }).observe(document.body, { childList: true, subtree: true })

  // ── FX menu (discoverable popover for the destructive ops) ──────────────────
  injectFxMenuStyles()
  const fxMenuBtn = body.querySelector('#ed-fx-menu')
  let fxPop = null, fxPopOpen = false
  const ED_OPS = [
    { act: 'ed-normalize',      icon: 'fa-wand-magic-sparkles', run: () => applyDsp('normalize', dspNormalize) },
    { act: 'ed-gain-up',        icon: 'fa-volume-high',         run: () => applyDsp('gain_up',   (b, s, e) => dspGain(b, s, e, 1)) },
    { act: 'ed-gain-down',      icon: 'fa-volume-low',          run: () => applyDsp('gain_down', (b, s, e) => dspGain(b, s, e, -1)) },
    { act: 'ed-fade-in',        icon: 'fa-arrow-trend-up',      run: () => applyDsp('fade_in',  (b, s, e) => dspFade(b, s, e, 1)) },
    { act: 'ed-fade-out',       icon: 'fa-arrow-trend-down',    run: () => applyDsp('fade_out', (b, s, e) => dspFade(b, s, e, -1)) },
    { act: 'ed-fade-in-exp',    icon: 'fa-bezier-curve',        run: () => applyDsp('fade_in_exp',  (b, s, e) => dspFade(b, s, e, 1, 'exp')) },
    { act: 'ed-fade-out-exp',   icon: 'fa-bezier-curve',        run: () => applyDsp('fade_out_exp', (b, s, e) => dspFade(b, s, e, -1, 'exp')) },
    { act: 'ed-reverse',        icon: 'fa-right-left',          run: () => applyDsp('reverse', dspReverse) },
    { act: 'ed-silence',        icon: 'fa-volume-xmark',        run: () => applyDsp('silence', dspSilence) },
    { act: 'ed-insert-silence', icon: 'fa-grip-lines-vertical', run: () => insertSilence(1) },
    { sep: true },
    { act: 'ed-crop',           icon: 'fa-crop-simple',         run: () => cropToSelection() },
    { act: 'ed-cut',            icon: 'fa-scissors',            run: () => cutSelection() },
    { act: 'ed-copy',           icon: 'fa-copy',                run: () => copySelection() },
    { act: 'ed-paste',          icon: 'fa-paste',               run: () => pasteClipboard() },
  ]
  function buildFxPop() {
    const pop = document.createElement('div')
    pop.className = 'ed-fx-menu-pop'
    ED_OPS.forEach(op => {
      if (op.sep) { const d = document.createElement('div'); d.className = 'ed-fx-menu-sep'; pop.appendChild(d); return }
      const def = DEFAULT_SHORTCUTS[op.act]
      const kb  = formatBinding(getShortcut(op.act))
      const row = document.createElement('button')
      row.className = 'ed-fx-menu-row'
      row.innerHTML =
        `<i class="fa-solid ${op.icon}"></i>` +
        `<span class="ed-fx-menu-lbl">${t(def.label_key)}</span>` +
        `<span class="ed-fx-menu-kbd">${kb !== '—' ? kb : ''}</span>`
      row.addEventListener('click', () => { closeFxMenu(); op.run() })
      pop.appendChild(row)
    })
    return pop
  }
  function positionFxPop() {
    const r = fxMenuBtn.getBoundingClientRect()
    fxPop.style.left   = Math.round(r.left) + 'px'
    fxPop.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px'
    fxPop.style.top    = 'auto'
    const pr = fxPop.getBoundingClientRect()
    if (pr.left + pr.width > window.innerWidth - 6) fxPop.style.left = Math.round(window.innerWidth - pr.width - 6) + 'px'
    if (pr.top < 4) { fxPop.style.bottom = 'auto'; fxPop.style.top = Math.round(r.bottom + 6) + 'px' }
  }
  function onFxDocDown(e) {
    if (fxPop && (fxPop.contains(e.target) || fxMenuBtn.contains(e.target))) return
    closeFxMenu()
  }
  function openFxMenu() {
    fxPop = buildFxPop()                 // rebuilt each open → shortcut labels stay current
    document.body.appendChild(fxPop)
    fxPop.classList.add('open')
    positionFxPop()
    fxPopOpen = true
    setTimeout(() => {
      document.addEventListener('mousedown', onFxDocDown, true)
      window.addEventListener('resize', positionFxPop)
    }, 0)
  }
  function closeFxMenu() {
    fxPopOpen = false
    if (fxPop) { fxPop.classList.remove('open'); if (fxPop.isConnected) fxPop.remove(); fxPop = null }
    document.removeEventListener('mousedown', onFxDocDown, true)
    window.removeEventListener('resize', positionFxPop)
  }
  fxMenuBtn?.addEventListener('click', () => { fxPopOpen ? closeFxMenu() : openFxMenu() })

  function fmtTime(s) {
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  function currentT() {
    return playing
      ? Math.min(trimOut, playOffset + (getCtx().currentTime - playStart))
      : playOffset
  }

  function tick() {
    const ct = currentT()
    timeEl.textContent = `${fmtTime(ct - trimIn)} / ${fmtTime(trimOut - trimIn)}`
    if (buffer) phEl.style.left = (ct / buffer.duration * canvas.width) + 'px'
    if (playing) rafId = requestAnimationFrame(tick)
  }

  new ResizeObserver(() => { if (buffer) drawWaveform() }).observe(waveWrap)

  // Trim handles
  function makeTrimDrag(el, isIn) {
    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.preventDefault(); e.stopPropagation()
      function onMove(ev) {
        if (!buffer) return
        const r = waveWrap.getBoundingClientRect()
        const pos = Math.max(0, Math.min(buffer.duration, (ev.clientX - r.left) / r.width * buffer.duration))
        if (isIn) trimIn  = Math.min(pos, trimOut - 0.05)
        else      trimOut = Math.max(pos, trimIn  + 0.05)
        drawWaveform()
        timeEl.textContent = `0:00 / ${fmtTime(trimOut - trimIn)}`
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  }
  makeTrimDrag(tinEl, true)
  makeTrimDrag(toutEl, false)

  canvas.addEventListener('click', e => {
    if (!buffer) return
    const r = waveWrap.getBoundingClientRect()
    const pos = Math.max(trimIn, Math.min(trimOut, (e.clientX - r.left) / r.width * buffer.duration))
    const was = playing
    softStop(); playOffset = pos
    if (was) play(); else tick()
  })

  // ── Load ──────────────────────────────────────────────────────────────────
  function b64ToAB(b64) {
    const bin = atob(b64), ab = new ArrayBuffer(bin.length), v = new Uint8Array(ab)
    for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i)
    return ab
  }

  async function loadBuffer(ab, name) {
    softStop(); playOffset = 0
    try {
      buffer = await getCtx().decodeAudioData(ab)
      trimIn = 0; trimOut = buffer.duration; playOffset = 0
      const baseName = name.replace(/\.[^.]+$/, '')
      tabs[activeTabIdx].name = baseName
      outnameEl.value = baseName
      emptyEl.style.display = 'none'
      renderTabs()
      drawWaveform(); tick()
    } catch { /* silent */ }
  }

  // ── Inline library search ─────────────────────────────────────────────────
  const edLibRoot   = localStorage.getItem('library:root')
  const searchWrap  = body.querySelector('#ed-search-wrap')
  const searchInput = body.querySelector('#ed-search')
  const searchDrop  = body.querySelector('#ed-search-drop')
  let   srDebounce  = null

  searchInput.addEventListener('input', () => {
    clearTimeout(srDebounce)
    const q = searchInput.value.trim()
    if (!q) { searchDrop.classList.add('hidden'); return }
    srDebounce = setTimeout(() => doEdSearch(q), 220)
  })

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchDrop.classList.add('hidden'); searchInput.value = '' }
  })

  document.addEventListener('click', e => {
    if (!searchWrap.contains(e.target)) searchDrop.classList.add('hidden')
  })

  async function doEdSearch(q) {
    if (!edLibRoot || !window.__TAURI__) return
    const { invoke } = window.__TAURI__.core
    const files = await invoke('search_library', { root: edLibRoot, query: q })
    searchDrop.innerHTML = ''
    if (!files.length) {
      searchDrop.innerHTML = `<div class="ed-search-none">${t('ed_no_results')}</div>`
      searchDrop.classList.remove('hidden')
      return
    }
    searchDrop.classList.remove('hidden')
    files.slice(0, 8).forEach(f => {
      const item = document.createElement('div')
      item.className = 'ed-search-item'
      item.innerHTML = `<span class="ed-search-name">${f.name}</span><span class="ed-search-badge">${f.folder}</span>`
      item.addEventListener('click', async () => {
        searchDrop.classList.add('hidden')
        searchInput.value = ''
        const { invoke: inv } = window.__TAURI__.core
        await loadBuffer(b64ToAB(await inv('read_file_base64', { path: f.path })), f.name)
      })
      searchDrop.appendChild(item)
    })
  }

  body.addEventListener('iceample-drop', async e => {
    const { file } = e.detail
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['wav','mp3','flac','ogg','aiff','aif','m4a'].includes(ext)) return
    if (!window.__TAURI__) return
    const { invoke } = window.__TAURI__.core
    await loadBuffer(b64ToAB(await invoke('read_file_base64', { path: file.path })), file.name)
  })

  // ── VST offline processing ────────────────────────────────────────────────
  function audioBufferToBase64(buf, startSample, numFrames) {
    // Interleaved float32 stereo → base64
    const ch = Math.min(buf.numberOfChannels, 2)
    const L  = buf.getChannelData(0)
    const R  = ch > 1 ? buf.getChannelData(1) : L
    const arr = new Float32Array(numFrames * 2)
    for (let i = 0; i < numFrames; i++) {
      arr[i*2]   = L[startSample + i] ?? 0
      arr[i*2+1] = R[startSample + i] ?? 0
    }
    const bytes = new Uint8Array(arr.buffer)
    let b = ''; bytes.forEach(x => b += String.fromCharCode(x))
    return btoa(b)
  }

  function base64ToAudioBuffer(b64, numFrames, sampleRate) {
    const bin = atob(b64)
    const arr = new Float32Array(bin.length / 4)
    const view = new DataView(new ArrayBuffer(bin.length))
    for (let i = 0; i < bin.length; i++) view.setUint8(i, bin.charCodeAt(i))
    for (let i = 0; i < arr.length; i++) arr[i] = view.getFloat32(i * 4, true)
    const out = getCtx().createBuffer(2, numFrames, sampleRate)
    const outL = out.getChannelData(0)
    const outR = out.getChannelData(1)
    for (let i = 0; i < numFrames; i++) { outL[i] = arr[i*2]; outR[i] = arr[i*2+1] }
    return out
  }

  // Apply all enabled VST effects in the chain to an AudioBuffer section.
  // Returns a new AudioBuffer with the processed audio (VST effects only).
  async function applyVstEffects(srcBuf, startSec, endSec) {
    if (!window.__TAURI__) return null
    const vstFx = fx.filter(f => f.enabled && f.type === 'vst' && f.params?.path && f.params?.format === 'vst2')
    if (!vstFx.length) return null

    const { invoke } = window.__TAURI__.core
    const sr      = srcBuf.sampleRate
    const start   = Math.floor(startSec * sr)
    const end     = Math.min(srcBuf.length, Math.floor(endSec * sr))
    const nFrames = end - start
    if (nFrames <= 0) return null

    let currentB64 = audioBufferToBase64(srcBuf, start, nFrames)
    for (const f of vstFx) {
      try {
        f._processing = true
        renderChain() // show spinner
        currentB64 = await invoke('apply_vst2_effect', {
          vstPath:    f.params.path,
          audioB64:   currentB64,
          sampleRate: sr,
          numFrames:  nFrames,
        })
      } catch (e) {
        console.warn('VST effect error:', e)
      } finally {
        f._processing = false
        renderChain()
      }
    }
    return base64ToAudioBuffer(currentB64, nFrames, sr)
  }

  // ── Playback ──────────────────────────────────────────────────────────────
  function connectChain(audioCtx, src, setLive) {
    let prev = src
    for (const f of fx) {
      if (!f.enabled) continue
      const nodes = createFxNodes(f.type, f.params, audioCtx)
      if (setLive) f._live = nodes
      prev.connect(nodes.input)
      prev = nodes.output
    }
    return prev
  }

  async function play() {
    if (!buffer || playing) return
    const c = getCtx()

    // Pre-render VST effects offline before WebAudio playback
    const vstActive = fx.some(f => f.enabled && f.type === 'vst' && f.params?.format === 'vst2')
    let playBuf = buffer
    let vstOffset = playOffset  // offset into playBuf

    if (vstActive) {
      btnPlay.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'
      const processed = await applyVstEffects(buffer, trimIn, trimOut)
      if (processed) {
        playBuf   = processed
        // playOffset was relative to full buffer; map to processed buffer (starts at trimIn)
        vstOffset = Math.max(0, playOffset - trimIn)
      }
    }

    playing   = true
    playStart = c.currentTime
    srcNode   = c.createBufferSource()
    srcNode.buffer = playBuf

    const dur = vstActive
      ? (trimOut - trimIn) - vstOffset
      : trimOut - playOffset

    // For VST-processed buffer, only connect non-VST effects
    connectChain(c, srcNode, true).connect(getTrackNode('editor') ?? c.destination)
    srcNode.start(0, vstOffset, dur)
    srcNode.onended = () => {
      if (!playing) return
      softStop(); playOffset = trimIn; tick()
    }
    btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>'
    rafId = requestAnimationFrame(tick)
  }

  function softStop() {
    if (!playing) return
    playing = false
    cancelAnimationFrame(rafId)
    try { srcNode?.stop(); srcNode?.disconnect() } catch {}
    srcNode = null
    fx.forEach(f => { f._live = null })
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
  }

  function hardStop() {
    softStop(); playOffset = trimIn; tick()
  }

  btnPlay.addEventListener('click', () => {
    if (playing) { const pos = currentT(); softStop(); playOffset = pos; tick() }
    else play()
  })
  btnStop.addEventListener('click', hardStop)

  // ── Effects engine ────────────────────────────────────────────────────────
  function dbLin(db) { return Math.pow(10, db / 20) }

  function makeIR(room, decay, c) {
    const len = Math.floor(c.sampleRate * Math.max(0.1, room))
    const ir  = c.createBuffer(2, len, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, Math.max(1, decay))
    }
    return ir
  }

  function satCurve(drive) {
    const n = 256, k = drive * 0.8, curve = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1
      curve[i] = k > 0 ? ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x)) : x
    }
    return curve
  }

  function createFxNodes(type, p, c) {
    switch (type) {
      case 'gain': {
        const n = c.createGain(); n.gain.value = dbLin(p.db)
        return { input: n, output: n, _n: n }
      }
      case 'eq': {
        const lo = c.createBiquadFilter(); lo.type = 'lowshelf';  lo.frequency.value = 80;   lo.gain.value = p.low
        const mi = c.createBiquadFilter(); mi.type = 'peaking';   mi.frequency.value = 1000; mi.gain.value = p.mid; mi.Q.value = 1
        const hi = c.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 8000; hi.gain.value = p.hi
        lo.connect(mi); mi.connect(hi)
        return { input: lo, output: hi, _lo: lo, _mi: mi, _hi: hi }
      }
      case 'compressor': {
        const n = c.createDynamicsCompressor()
        n.threshold.value = p.threshold; n.ratio.value = p.ratio
        n.attack.value = p.attack; n.release.value = p.release; n.knee.value = p.knee
        return { input: n, output: n, _n: n }
      }
      case 'delay': {
        const inp = c.createGain(), dly = c.createDelay(2)
        const fb = c.createGain(), wet = c.createGain(), dry = c.createGain(), out = c.createGain()
        dly.delayTime.value = p.time; fb.gain.value = p.feedback
        wet.gain.value = p.mix; dry.gain.value = 1 - p.mix
        inp.connect(dly); inp.connect(dry); dly.connect(fb); fb.connect(dly)
        dly.connect(wet); wet.connect(out); dry.connect(out)
        return { input: inp, output: out, _dly: dly, _fb: fb, _wet: wet, _dry: dry }
      }
      case 'reverb': {
        const inp = c.createGain(), conv = c.createConvolver()
        const wet = c.createGain(), dry = c.createGain(), out = c.createGain()
        conv.buffer = makeIR(p.room, p.decay, c)
        wet.gain.value = p.mix; dry.gain.value = 1 - p.mix
        inp.connect(conv); inp.connect(dry)
        conv.connect(wet); wet.connect(out); dry.connect(out)
        return { input: inp, output: out, _conv: conv, _wet: wet, _dry: dry }
      }
      case 'saturation': {
        const n = c.createWaveShaper(); n.curve = satCurve(p.drive); n.oversample = '4x'
        return { input: n, output: n, _n: n }
      }
      case 'pan': {
        const n = c.createStereoPanner(); n.pan.value = p.pan
        return { input: n, output: n, _n: n }
      }
      case 'vst': {
        // VST is pre-rendered via Rust before playback; passthrough here
        const n = c.createGain(); n.gain.value = 1
        return { input: n, output: n }
      }
    }
  }

  function applyLive(f) {
    const L = f._live; if (!L) return; const p = f.params
    switch (f.type) {
      case 'gain':       L._n.gain.value = dbLin(p.db); break
      case 'eq':         L._lo.gain.value = p.low; L._mi.gain.value = p.mid; L._hi.gain.value = p.hi; break
      case 'compressor': L._n.threshold.value = p.threshold; L._n.ratio.value = p.ratio; L._n.attack.value = p.attack; L._n.release.value = p.release; L._n.knee.value = p.knee; break
      case 'delay':      L._dly.delayTime.value = p.time; L._fb.gain.value = p.feedback; L._wet.gain.value = p.mix; L._dry.gain.value = 1 - p.mix; break
      case 'reverb':     L._conv.buffer = makeIR(p.room, p.decay, getCtx()); L._wet.gain.value = p.mix; L._dry.gain.value = 1 - p.mix; break
      case 'saturation': L._n.curve = satCurve(p.drive); break
      case 'pan':        L._n.pan.value = p.pan; break
    }
  }

  function restartIfPlaying() {
    if (!playing) return
    const pos = currentT()
    softStop(); playOffset = Math.max(trimIn, Math.min(trimOut - 0.01, pos)); play()
  }

  // ── Effects UI ────────────────────────────────────────────────────────────
  const FX_DEFS = {
    gain:       { labelKey: 'ed_fx_gain',        icon: 'fa-volume-high',       defaults: { db: 0 } },
    eq:         { labelKey: 'ed_fx_eq',          icon: 'fa-sliders',           defaults: { low: 0, mid: 0, hi: 0 } },
    compressor: { labelKey: 'ed_fx_compressor',  icon: 'fa-compress',          defaults: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 10 } },
    delay:      { labelKey: 'ed_fx_delay',       icon: 'fa-clock-rotate-left', defaults: { time: 0.3, feedback: 0.3, mix: 0.3 } },
    reverb:     { labelKey: 'ed_fx_reverb',      icon: 'fa-water',             defaults: { room: 1.5, decay: 3, mix: 0.3 } },
    saturation: { labelKey: 'ed_fx_saturation',  icon: 'fa-fire',              defaults: { drive: 20 } },
    pan:        { labelKey: 'ed_fx_pan',         icon: 'fa-arrows-left-right', defaults: { pan: 0 } },
  }

  Object.entries(FX_DEFS).forEach(([type, def]) => {
    const btn = document.createElement('button')
    btn.className = 'ed-palette-btn'
    btn.title = `${t('ed_fx_add_title')} ${t(def.labelKey)}`
    btn.innerHTML = `<i class="fa-solid ${def.icon}"></i><span>${t(def.labelKey)}</span>`
    btn.addEventListener('click', () => addFx(type))
    fxPalette.appendChild(btn)
  })

  // VST browse button
  const vstBrowseBtn = document.createElement('button')
  vstBrowseBtn.className = 'ed-palette-btn'
  vstBrowseBtn.innerHTML = `<i class="fa-solid fa-puzzle-piece"></i><span>${t('ed_fx_vst')}</span>`
  vstBrowseBtn.addEventListener('click', () => {
    vstPanel.style.display = vstPanel.style.display === 'none' ? 'flex' : 'none'
  })
  fxPalette.appendChild(vstBrowseBtn)

  // ── VST browser ───────────────────────────────────────────────────────────
  let _vstPlugins   = []
  let _vstExtraPaths = JSON.parse(localStorage.getItem('iceample:vst:paths') || '[]')

  function renderVstList() {
    const q = vstSearch.value.trim().toLowerCase()
    const list = q
      ? _vstPlugins.filter(p => p.name.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q))
      : _vstPlugins
    vstList.innerHTML = ''
    if (!list.length) {
      vstList.innerHTML = `<span class="ed-vst-empty">${_vstPlugins.length ? t('ed_no_results') : t('ed_no_scan')}</span>`
      return
    }
    list.forEach(p => {
      const badge = { vst2: 'VST2', vst3: 'VST3', clap: 'CLAP' }[p.format] || 'VST'
      const item = document.createElement('div')
      item.className = 'ed-vst-item'
      item.innerHTML = `
        <span class="ed-vst-badge ${p.format}">${badge}</span>
        <div class="ed-vst-item-info">
          <span class="ed-vst-item-name">${p.name}</span>
          ${p.vendor ? `<span class="ed-vst-item-vendor">${p.vendor}</span>` : ''}
        </div>
        <button class="ed-vst-add-btn" title="${t('ed_fx_add_title')}${t('ed_fx_vst')}"><i class="fa-solid fa-plus"></i></button>
      `
      item.querySelector('.ed-vst-add-btn').addEventListener('click', () => {
        fx.push({ id: ++fxIdSeq, type: 'vst', enabled: true, params: { ...p }, _live: null })
        renderChain()
        vstPanel.style.display = 'none'
      })
      vstList.appendChild(item)
    })
  }

  vstCloseBtn.addEventListener('click', () => { vstPanel.style.display = 'none' })
  vstSearch.addEventListener('input', renderVstList)

  vstScanBtn.addEventListener('click', async () => {
    if (!window.__TAURI__) return
    vstScanBtn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i>'
    vstScanBtn.disabled = true
    try {
      const { invoke } = window.__TAURI__.core
      _vstPlugins = await invoke('scan_vsts', { extraPaths: _vstExtraPaths })
      renderVstList()
    } catch (e) { console.warn('VST scan:', e) }
    vstScanBtn.innerHTML = '<i class="fa-solid fa-rotate"></i>'
    vstScanBtn.disabled = false
  })

  vstFolderBtn.addEventListener('click', async () => {
    if (!window.__TAURI__) return
    const { invoke } = window.__TAURI__.core
    const folder = await invoke('pick_vst_folder')
    if (folder && !_vstExtraPaths.includes(folder)) {
      _vstExtraPaths.push(folder)
      localStorage.setItem('iceample:vst:paths', JSON.stringify(_vstExtraPaths))
    }
  })

  function mkSlider(label, min, max, step, val, unit, cb) {
    const disp = step < 0.01 ? val.toFixed(3) : step < 1 ? val.toFixed(2) : String(Math.round(val))
    const row = document.createElement('div')
    row.className = 'ed-sl-row'
    row.innerHTML = `
      <label class="ed-sl-lbl">${label}</label>
      <input type="range" class="ed-sl" min="${min}" max="${max}" step="${step}" value="${val}" />
      <span class="ed-sl-val">${disp}${unit}</span>
    `
    const inp = row.querySelector('input')
    const vEl = row.querySelector('.ed-sl-val')
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value)
      vEl.textContent = (step < 0.01 ? v.toFixed(3) : step < 1 ? v.toFixed(2) : Math.round(v)) + unit
      cb(v)
    })
    return row
  }

  function buildFxSliders(f) {
    const p   = f.params
    const upd = () => applyLive(f)
    const wrap = document.createElement('div')
    wrap.className = 'ed-fx-body'
    const rows = []
    switch (f.type) {
      case 'gain':
        rows.push(mkSlider(t('ed_sl_volume'),     -24,  12,   0.1,   p.db,        ' dB', v => { p.db=v;        upd() }))
        break
      case 'eq':
        rows.push(mkSlider(t('ed_sl_bass'),       -12,  12,   0.5,   p.low,       ' dB', v => { p.low=v;       upd() }))
        rows.push(mkSlider(t('ed_sl_mid'),        -12,  12,   0.5,   p.mid,       ' dB', v => { p.mid=v;       upd() }))
        rows.push(mkSlider(t('ed_sl_treble'),     -12,  12,   0.5,   p.hi,        ' dB', v => { p.hi=v;        upd() }))
        break
      case 'compressor':
        rows.push(mkSlider(t('ed_sl_threshold'),  -60,  0,    1,     p.threshold, ' dB', v => { p.threshold=v; upd() }))
        rows.push(mkSlider(t('ed_sl_ratio'),        1,  20,   0.5,   p.ratio,     ':1',  v => { p.ratio=v;     upd() }))
        rows.push(mkSlider(t('ed_sl_attack'),       0,  1,    0.001, p.attack,    ' s',  v => { p.attack=v;    upd() }))
        rows.push(mkSlider(t('ed_sl_release'),      0,  1,    0.01,  p.release,   ' s',  v => { p.release=v;   upd() }))
        rows.push(mkSlider(t('ed_sl_knee'),         0,  40,   1,     p.knee,      ' dB', v => { p.knee=v;      upd() }))
        break
      case 'delay':
        rows.push(mkSlider(t('ed_sl_time'),         0,  1,    0.01,  p.time,      ' s',  v => { p.time=v;      upd() }))
        rows.push(mkSlider(t('ed_sl_feedback'),     0,  0.9,  0.01,  p.feedback,  '',    v => { p.feedback=v;  upd() }))
        rows.push(mkSlider(t('ed_sl_mix'),          0,  1,    0.01,  p.mix,       '',    v => { p.mix=v;       upd() }))
        break
      case 'reverb':
        rows.push(mkSlider(t('ed_sl_size'),       0.1,  4,    0.1,   p.room,      ' s',  v => { p.room=v;      upd() }))
        rows.push(mkSlider(t('ed_sl_decay'),        1,  10,   0.1,   p.decay,     '',    v => { p.decay=v;     upd() }))
        rows.push(mkSlider(t('ed_sl_mix'),          0,  1,    0.01,  p.mix,       '',    v => { p.mix=v;       upd() }))
        break
      case 'saturation':
        rows.push(mkSlider(t('ed_sl_drive'),        0,  100,  1,     p.drive,     '',    v => { p.drive=v;     upd() }))
        break
      case 'pan':
        rows.push(mkSlider(t('ed_sl_pan'),         -1,  1,    0.01,  p.pan,       '',    v => { p.pan=v;       upd() }))
        break
    }
    rows.forEach(r => wrap.appendChild(r))
    return wrap
  }

  function addFx(type) {
    fx.push({ id: ++fxIdSeq, type, enabled: true, params: { ...FX_DEFS[type].defaults }, _live: null })
    renderChain()
    restartIfPlaying()
  }

  function removeFx(id) {
    const i = fx.findIndex(f => f.id === id); if (i < 0) return
    fx.splice(i, 1)
    renderChain()
    restartIfPlaying()
  }

  function renderChain() {
    fxChain.innerHTML = ''
    if (!fx.length) return
    fx.forEach(f => {
      if (f.type === 'vst') {
        const { name, format, path: vpath, vendor } = f.params
        const badge = { vst2: 'VST2', vst3: 'VST3', clap: 'CLAP' }[format] || 'VST'
        const card = document.createElement('div')
        card.className = 'ed-fx-card' + (f.enabled ? '' : ' bypassed')
        const hdr = document.createElement('div')
        hdr.className = 'ed-fx-hdr'

        const bypassBtn = document.createElement('button')
        bypassBtn.className = 'ed-fx-bypass'
        bypassBtn.title = t('ed_bypass_title')
        bypassBtn.innerHTML = '<i class="fa-solid fa-circle"></i>'
        bypassBtn.addEventListener('click', e => {
          e.stopPropagation()
          f.enabled = !f.enabled
          card.classList.toggle('bypassed', !f.enabled)
          restartIfPlaying()
        })

        const badgeEl = document.createElement('span')
        badgeEl.className = `ed-vst-badge ${format}`
        badgeEl.textContent = badge

        const nameEl = document.createElement('span')
        nameEl.className = 'ed-fx-name'
        nameEl.textContent = name

        const spacer = document.createElement('span')
        spacer.style.flex = '1'

        // Processing spinner (shown during VST offline render)
        if (f._processing) {
          const spinner = document.createElement('span')
          spinner.className = 'ed-vst-spinner'
          spinner.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> traitement…'
          hdr.append(bypassBtn, badgeEl, nameEl, spacer, spinner, delBtn)
          card.appendChild(hdr)
          fxChain.appendChild(card)
          return
        }

        const editBtn = document.createElement('button')
        editBtn.className = 'ed-vst-edit-btn'
        editBtn.title = t('ed_vst_open_editor') || 'Ouvrir l\'éditeur du plugin'
        editBtn.innerHTML = '<i class="fa-solid fa-window-restore"></i> ' + (t('ed_vst_editor_btn') || 'Éditeur')
        editBtn.addEventListener('click', async e => {
          e.stopPropagation()
          if (!window.__TAURI__) { alert('Tauri non disponible'); return }
          const { invoke } = window.__TAURI__.core
          try {
            await invoke('open_vst_editor', { path: vpath, format, name })
          }
          catch (err) { toast('VST editor: ' + err, 'error') }
        })

        const delBtn = document.createElement('button')
        delBtn.className = 'ed-fx-del'
        delBtn.title = t('ed_delete_title')
        delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
        delBtn.addEventListener('click', e => {
          e.stopPropagation(); removeFx(f.id)
        })

        if (vendor) {
          const vendorEl = document.createElement('span')
          vendorEl.className = 'ed-vst-vendor'
          vendorEl.textContent = vendor
          hdr.append(bypassBtn, badgeEl, nameEl, vendorEl, spacer, editBtn, delBtn)
        } else {
          hdr.append(bypassBtn, badgeEl, nameEl, spacer, editBtn, delBtn)
        }
        card.appendChild(hdr)
        fxChain.appendChild(card)
        return
      }

      const def  = FX_DEFS[f.type]
      const card = document.createElement('div')
      card.className = 'ed-fx-card' + (f.enabled ? '' : ' bypassed')

      const hdr = document.createElement('div')
      hdr.className = 'ed-fx-hdr'
      hdr.innerHTML = `
        <button class="ed-fx-bypass" title="${t('ed_bypass_title')}"><i class="fa-solid fa-circle"></i></button>
        <i class="fa-solid ${def.icon} ed-fx-ico"></i>
        <span class="ed-fx-name">${t(def.labelKey)}</span>
        <span style="flex:1"></span>
        <button class="ed-fx-del" title="${t('ed_delete_title')}"><i class="fa-solid fa-xmark"></i></button>
        <button class="ed-fx-tog"><i class="fa-solid fa-chevron-right"></i></button>
      `

      const fxBody = buildFxSliders(f)
      fxBody.classList.add('hidden')

      function setOpen(open) {
        fxBody.classList.toggle('hidden', !open)
        hdr.querySelector('.ed-fx-tog i').className = open ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'
      }

      hdr.addEventListener('click', () => setOpen(fxBody.classList.contains('hidden')))
      hdr.querySelector('.ed-fx-bypass').addEventListener('click', e => {
        e.stopPropagation()
        f.enabled = !f.enabled
        card.classList.toggle('bypassed', !f.enabled)
        restartIfPlaying()
      })
      hdr.querySelector('.ed-fx-del').addEventListener('click', e => { e.stopPropagation(); removeFx(f.id) })

      card.appendChild(hdr)
      card.appendChild(fxBody)
      fxChain.appendChild(card)
    })
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function encodeWAV(buf) {
    const ch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length
    const ab = new ArrayBuffer(44 + len * ch * 2), v = new DataView(ab)
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
    ws(0,'RIFF'); v.setUint32(4, 36+len*ch*2, true); ws(8,'WAVE'); ws(12,'fmt ')
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,ch,true)
    v.setUint32(24,sr,true); v.setUint32(28,sr*ch*2,true); v.setUint16(32,ch*2,true); v.setUint16(34,16,true)
    ws(36,'data'); v.setUint32(40, len*ch*2, true)
    let off = 44
    for (let i = 0; i < len; i++) for (let c2 = 0; c2 < ch; c2++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(c2)[i]))
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2
    }
    return ab
  }

  function ab2b64(ab) {
    const bytes = new Uint8Array(ab); let b = ''; bytes.forEach(x => b += String.fromCharCode(x)); return btoa(b)
  }

  btnExport.addEventListener('click', async () => {
    if (!buffer || !window.__TAURI__) return
    const root = localStorage.getItem('library:root')
    if (!root) return
    const sep = root.includes('\\') ? '\\' : '/'
    const dur = trimOut - trimIn
    const sr  = getCtx().sampleRate

    btnExport.disabled = true
    btnExport.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'

    try {
      // Step 1: pre-render VST effects (if any)
      let exportBuf = buffer
      let exportTrimIn = trimIn
      const vstProcessed = await applyVstEffects(buffer, trimIn, trimOut)
      if (vstProcessed) {
        exportBuf    = vstProcessed
        exportTrimIn = 0  // processed buffer already starts at trimIn
      }

      // Step 2: render non-VST effects via OfflineAudioContext
      const offCtx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr)
      const src    = offCtx.createBufferSource()
      src.buffer   = exportBuf
      let prev = src
      for (const f of fx) {
        if (!f.enabled || f.type === 'vst') continue  // skip VST (already applied)
        const nodes = createFxNodes(f.type, f.params, offCtx)
        prev.connect(nodes.input); prev = nodes.output
      }
      prev.connect(offCtx.destination)
      src.start(0, exportTrimIn, dur)
      const rendered = await offCtx.startRendering()

      const name = (outnameEl.value.trim() || 'export') + '.wav'
      const path = root + sep + 'Modifiés' + sep + name
      const { invoke } = window.__TAURI__.core
      await invoke('save_binary_file', { path, base64: ab2b64(encodeWAV(rendered)) })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Modifiés' } }))
      window.toast?.(t('ed_exported') + ': ' + name, 'success')
    } catch (e) {
      window.toast?.(t('ed_export_err') + ': ' + e, 'error')
    } finally {
      btnExport.disabled = false
      btnExport.innerHTML = '<i class="fa-solid fa-file-audio"></i>'
    }
  })

  // ── Init : premier onglet ─────────────────────────────────────────────────
  tabs.push(createTabData())
  loadTabState(0)
  renderTabs()
  refreshEditorUI()
}
