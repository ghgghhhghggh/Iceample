import { initSequencer, setBounceUtil, setSpawnUtil } from './sequencer.js'
import { transportToggle, transportStop, transportPlay, seekTransport } from './transport.js'
import { getVolume, setVolume, getMuted, setMute, getSolo, setSolo } from './audio-bus.js'
import { getBpm, setBpm, onBpmChange, toggleMetronome, initTempo } from './tempo.js'
import { initAnnotations } from './annotations.js'
import { initMidiBus, reconnectMidi } from './midi-bus.js'
import { initDevices, getDevice, setDevice } from './devices.js'
import { maybeShowOnboarding } from './onboarding.js'
import { autoSaveLayout, getFullLayout } from './layout.js'
import { t, applyTranslations } from './i18n.js'
import { initBgSpectrum } from './bg-spectrum.js'
import { matchesShortcut } from './shortcuts.js'
import { registerCommands } from './commands.js'
import { openCommandPalette } from './command-palette.js'
import { undo, redo, canUndo, canRedo } from './history.js'
import { safeInvoke } from './error-utils.js'
import {
  startAutosave, saveProjectToFile, loadProjectFromFile,
  checkRecovery, resolveRecovery, applyAutosaveRecovery,
} from './project.js'
import {
  TOOLS, EXTRA_TOOLS, openTools, openCtxTools, TOOL_INIT, initWindowManager,
  focusWin, createToolWindow, spawnWindow, showPicker, hidePicker, arrangeWindows, closeAllWindows,
  toggleMaximizeWin,
} from './window-manager.js'
import {
  initTheme, themeMap, notifyThemeChange, resetThemeColors,
} from './theme.js'
import {
  initSettings, buildLangTab, buildAudioTab, buildDisplayTab, buildShortcutsTab,
} from './settings.js'
import { buildThemeExtras } from './theme.js'

// ── Toast notifications (replaces alert() which is blocked in Tauri) ─────────
// Stacked in #toast-stack so several can coexist; look lives in polish.css.
const TOAST_ICONS = { info: 'fa-circle-info', success: 'fa-circle-check', error: 'fa-circle-exclamation' }
window.toast = function(msg, type = 'info', duration = 3500) {
  let stack = document.getElementById('toast-stack')
  if (!stack) {
    stack = document.createElement('div')
    stack.id = 'toast-stack'
    document.body.appendChild(stack)
  }
  const el = document.createElement('div')
  el.className = 'toast toast-' + (TOAST_ICONS[type] ? type : 'info')
  const ic = document.createElement('i')
  ic.className = 'fa-solid ' + (TOAST_ICONS[type] || TOAST_ICONS.info)
  const txt = document.createElement('span')
  txt.textContent = msg
  el.append(ic, txt)
  stack.appendChild(el)
  setTimeout(() => {
    el.classList.add('toast-out')
    setTimeout(() => el.remove(), 260)
  }, duration)
}

// ── Bounce utility ───────────────────────────────────────────────────────────
// elCheck : élément dont on vérifie les bounds
// elMove  : élément qu'on déplace (peut être différent de elCheck)
export function bounceIntoView(elCheck, elMove, container) {
  const CLASSES = ['bounce-left','bounce-right','bounce-top','bounce-bottom']
  const er = elCheck.getBoundingClientRect()
  const cr = container.getBoundingClientRect()

  let dx = 0, dy = 0
  if (er.left   < cr.left)   dx =  cr.left   - er.left
  if (er.right  > cr.right)  dx =  cr.right  - er.right
  if (er.top    < cr.top)    dy =  cr.top    - er.top
  if (er.bottom > cr.bottom) dy =  cr.bottom - er.bottom

  if (dx === 0 && dy === 0) return

  elMove.classList.remove(...CLASSES)
  elMove.style.left = (parseInt(elMove.style.left || 0) + dx) + 'px'
  elMove.style.top  = (parseInt(elMove.style.top  || 0) + dy) + 'px'

  if (dx > 0) elMove.classList.add('bounce-left')
  else if (dx < 0) elMove.classList.add('bounce-right')
  if (dy > 0) elMove.classList.add('bounce-top')
  else if (dy < 0) elMove.classList.add('bounce-bottom')

  elMove.addEventListener('animationend', () => elMove.classList.remove(...CLASSES), { once: true })
}

// ── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const splash           = document.getElementById('splash')
  const logoWrap         = document.getElementById('splash-logo-wrap')
  const app              = document.getElementById('app')
  const btnSettingsClose  = document.getElementById('btn-settings-close')
  const settingsOverlay   = document.getElementById('settings-overlay')
  const workbench        = document.getElementById('workbench')
  const ctxMenu          = document.getElementById('ctx-menu')

  // Background spectrum WebGL canvas (inserted as first child of workbench)
  initBgSpectrum(workbench)

  // Theme: creates wb-bg-img layer, restores saved CSS vars, zoom, opacity
  initTheme(workbench)

  // Display prefs that toggle a root class (set in Settings → Display).
  if (localStorage.getItem('iceample:display:reducemotion') === 'true') document.documentElement.classList.add('reduce-motion')
  if (localStorage.getItem('iceample:display:focus') === 'true')        document.documentElement.classList.add('focus-mode')
  if (localStorage.getItem('iceample:display:winglow') !== 'false')      document.documentElement.classList.add('win-glow')
  if (localStorage.getItem('theme:glass') === 'true')                    document.documentElement.classList.add('glass')

  // Cursor-reactive window glow: a spotlight follows the pointer along the border
  // of the hovered window/menu (CSS reads --gx/--gy/--g-op). No constant loop.
  {
    const GLOW_SEL = '.tool-win, .cmdk-card, #ctx-menu, #ctx-submenu'
    let lit = null
    const dim = el => { if (el) el.style.setProperty('--g-op', '0') }
    document.addEventListener('pointermove', e => {
      if (!document.documentElement.classList.contains('win-glow')) { dim(lit); lit = null; return }
      const el = e.target && e.target.closest ? e.target.closest(GLOW_SEL) : null
      if (el !== lit) { dim(lit); lit = el }
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--gx', (e.clientX - r.left) + 'px')
      el.style.setProperty('--gy', (e.clientY - r.top) + 'px')
      el.style.setProperty('--g-op', '1')
    }, { passive: true })
  }

  // Passe l'utilitaire aux modules
  setBounceUtil((elCheck, elMove) => bounceIntoView(elCheck, elMove ?? elCheck, workbench))

  // Peuple les init des outils maintenant que workbench est connu
  const spawn = (label, icon, w, h, fn) => spawnWindow(label, icon, w, h, fn, workbench)
  setSpawnUtil(spawn)

  // Tool modules load LAZILY: the app used to statically import ~35 tool
  // modules at boot; now each is fetched on first open (then cached), which
  // cuts startup work massively. The wrapper shows a tiny spinner until the
  // module lands, and stamps data-toolReady so the media bus knows when the
  // tool's listeners exist (see the iceample-send-media handler below).
  const ready = fn => body => { fn(body); body.dataset.toolReady = '1' }
  const lazyInit = load => {
    let modP = null
    return body => {
      body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:14px"><i class="fa-solid fa-circle-notch fa-spin"></i></div>'
      ;(modP ||= load()).then(fn => {
        if (!document.contains(body)) return
        body.innerHTML = ''
        fn(body)
        body.dataset.toolReady = '1'
      }).catch(err => { if (document.contains(body)) body.textContent = String(err) })
    }
  }
  TOOL_INIT.daw       = lazyInit(() => import('./daw.js').then(m => m.initDAW))
  TOOL_INIT.sequencer = ready(initSequencer)   // eager: main injects bounce/spawn utils into it at boot
  TOOL_INIT.library   = lazyInit(() => import('./library.js').then(m => body => m.initLibrary(body, spawn)))
  TOOL_INIT.mic       = lazyInit(() => import('./mic.js').then(m => m.initMic))
  TOOL_INIT.editor    = lazyInit(() => import('./editor.js').then(m => m.initEditor))
  TOOL_INIT.mixer     = lazyInit(() => import('./mixer.js').then(m => m.initMixer))
  TOOL_INIT.piano     = lazyInit(() => import('./piano.js').then(m => m.initPiano))
  TOOL_INIT.eq        = lazyInit(() => import('./eq.js').then(m => m.initEq))
  TOOL_INIT.writer    = lazyInit(() => import('./writer.js').then(m => m.initWriter))
  TOOL_INIT.moodboard = lazyInit(() => import('./moodboard.js').then(m => m.initMoodboard))
  TOOL_INIT.palettes  = lazyInit(() => import('./palettes.js').then(m => m.initPalettes))
  TOOL_INIT.imgedit   = lazyInit(() => import('./imageeditor.js').then(m => m.initImageEditor))
  TOOL_INIT.effects   = lazyInit(() => import('./effects.js').then(m => m.initEffects))
  TOOL_INIT.textanim  = lazyInit(() => import('./textanim.js').then(m => m.initTextAnim))
  TOOL_INIT.bganim    = lazyInit(() => import('./bganim.js').then(m => m.initBgAnim))
  TOOL_INIT.subtitles = lazyInit(() => import('./subtitles.js').then(m => m.initSubtitles))
  TOOL_INIT.particles = lazyInit(() => import('./particles.js').then(m => m.initParticles))
  TOOL_INIT.patterns  = lazyInit(() => import('./patterns.js').then(m => m.initPatterns))
  TOOL_INIT.qrcode    = lazyInit(() => import('./qrcodetool.js').then(m => m.initQrcode))
  TOOL_INIT.watermark = lazyInit(() => import('./watermark.js').then(m => m.initWatermark))
  TOOL_INIT.videorec  = lazyInit(() => import('./videorec.js').then(m => m.initVideoRec))
  TOOL_INIT.recorder  = lazyInit(() => import('./recorder.js').then(m => m.initRecorder))
  TOOL_INIT.timelapse = lazyInit(() => import('./timelapse.js').then(m => m.initTimelapse))
  TOOL_INIT.rawtool   = lazyInit(() => import('./rawtool.js').then(m => m.initRawTool))
  TOOL_INIT.recent    = lazyInit(() => import('./recent.js').then(m => m.initRecent))
  TOOL_INIT.metadata  = lazyInit(() => import('./metadata.js').then(m => m.initMetadata))
  TOOL_INIT.converter = lazyInit(() => import('./converter.js').then(m => m.initConverter))
  TOOL_INIT.pdftool   = lazyInit(() => import('./pdftool.js').then(m => m.initPdfTool))
  TOOL_INIT.calc      = lazyInit(() => import('./calc.js').then(m => m.initCalc))
  TOOL_INIT.units     = lazyInit(() => import('./units.js').then(m => m.initUnits))
  TOOL_INIT.tool3d    = lazyInit(() => import('./tool3d.js').then(m => m.initTool3D))
  TOOL_INIT.player    = lazyInit(() => import('./player.js').then(m => m.initPlayer))

  // One-time migration — old mic takes lived in Voice/Sound folders; move them
  // into the real categories Voix/Sons so they show up like every other sample.
  ;(async function migrateVoixSons() {
    if (!window.__TAURI__) return
    if (localStorage.getItem('iceample:migrated:voixsons') === 'done') return
    const root = localStorage.getItem('library:root')
    if (!root) return
    const sep = root.includes('\\') ? '\\' : '/'
    const { invoke } = window.__TAURI__.core
    let moved = 0
    for (const [oldF, newF] of [['Voice', 'Voix'], ['Sound', 'Sons']]) {
      let items = []
      try { items = await invoke('list_folder_contents', { path: root + sep + oldF }) } catch { continue }
      for (const f of items) {
        if (f.is_dir) continue
        try { await invoke('rename_file', { oldPath: f.path, newPath: root + sep + newF + sep + f.name }); moved++ } catch {}
      }
    }
    localStorage.setItem('iceample:migrated:voixsons', 'done')
    if (moved > 0) {
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Voix' } }))
      window.toast?.(t('migrate_voixsons'), 'info', 2500)
    }
  })()

  document.addEventListener('iceample-open-editor', async e => {
    const { file } = e.detail
    const edTool = TOOLS.find(t => t.id === 'editor')
    let edBody = workbench.querySelector('[data-tool-id="editor"] .tool-win-body')
    if (!edBody) {
      openTools.add('editor')
      const wb = workbench.getBoundingClientRect()
      const win = createToolWindow(
        edTool,
        Math.round((wb.width  - edTool.w) / 2),
        Math.round((wb.height - edTool.h) / 2),
        workbench
      )
      edBody = win.querySelector('.tool-win-body')
    } else {
      focusWin(edBody.closest('.tool-win'))
    }
    if (file) {
      // The editor module is lazy-loaded — wait until its init has run.
      for (let i = 0; i < 100 && edBody.dataset.toolReady !== '1' && document.contains(edBody); i++) {
        await new Promise(r => setTimeout(r, 50))
      }
      if (!document.contains(edBody)) return
      edBody.dispatchEvent(new CustomEvent('iceample-drop', {
        bubbles: false,
        detail: { file }
      }))
    }
  })

  // Splash → app
  const showSplash = localStorage.getItem('iceample:display:splash') !== 'false'
  if (!showSplash) {
    splash.style.display = 'none'
    app.classList.remove('hidden')
    app.classList.add('visible')
    maybeShowOnboarding()
  }
  splash.addEventListener('click', () => {
    splash.classList.add('fade-out')
    app.classList.remove('hidden')
    requestAnimationFrame(() => requestAnimationFrame(() => app.classList.add('visible')))
    splash.addEventListener('transitionend', () => { splash.style.display = 'none' }, { once: true })
    maybeShowOnboarding()
  })

  // Settings panel
  function openSettings()  { settingsOverlay.classList.remove('hidden') }
  function closeSettings() { settingsOverlay.classList.add('hidden') }
  btnSettingsClose.addEventListener('click', closeSettings)
  settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings() })

  // Context menu clic droit
  function hideCtx() { ctxMenu.classList.add('hidden'); const s = document.getElementById('ctx-submenu'); if (s) s.style.display = 'none' }

  let ctxSpawnPos = null  // workbench-relative position of the last right-click

  function spawnCtxTool(id, label, icon, w, h, initFn) {
    if (openCtxTools.has(id)) return
    openCtxTools.add(id)
    const p = ctxSpawnPos || {}
    const win = spawnWindow(label, icon, w, h, initFn, workbench, p.x, p.y)
    win.dataset.ctxId = id
    win.querySelector('.tool-win-close').addEventListener('click', () => {
      openCtxTools.delete(id)
      updateDock()
    }, { once: true })
    updateDock()
  }

  app.addEventListener('contextmenu', e => {
    if (e.target.closest('.tool-win') || e.target.closest('#panel-settings')) return
    e.preventDefault()
    showCtxAt(e.clientX, e.clientY)
  })

  // ── Unified tool menu (both clicks) — collapsible domain sections ──────────
  const CTX_FOLD_KEY = 'iceample:ctxfold'
  const ctxFold = (() => { try { return JSON.parse(localStorage.getItem(CTX_FOLD_KEY) || '{}') } catch { return {} } })()
  const isFolded  = dom => ctxFold[dom] !== false                 // default folded (compact)
  const setFolded = (dom, v) => { ctxFold[dom] = v; try { localStorage.setItem(CTX_FOLD_KEY, JSON.stringify(ctxFold)) } catch {} }

  // Second panel that lists a category's tools beside the main menu.
  const ctxSub = document.createElement('div')
  ctxSub.id = 'ctx-submenu'
  ctxSub.style.cssText = 'position:fixed;z-index:501;display:none;background:var(--surface);border:1px solid var(--win-border);border-radius:8px;padding:4px;min-width:180px;box-shadow:0 8px 28px rgba(0,0,0,0.55);'
  ;(ctxMenu.parentNode || document.body).appendChild(ctxSub)

  function openSubmenu(items, rowEl) {
    ctxSub.innerHTML = ''
    const sorted = [...items].sort((a, b) => t(a.labelKey).length - t(b.labelKey).length)
    sorted.forEach(d => {
      const btn = document.createElement('button'); btn.className = 'ctx-item'
      btn.innerHTML = `<i class="${d.icon}"></i><span data-i18n="${d.labelKey}">${t(d.labelKey)}</span>`
      btn.addEventListener('click', ev => { ev.stopPropagation(); toggleTool(d.id); hideCtx() })
      ctxSub.appendChild(btn)
    })
    ctxSub.style.display = 'block'
    const mr = ctxMenu.getBoundingClientRect(), rr = rowEl.getBoundingClientRect(), sr = ctxSub.getBoundingClientRect()
    const GAP = 12
    let left = mr.right + GAP
    if (left + sr.width > window.innerWidth - 6) left = mr.left - sr.width - GAP   // flip if no room on the right
    let top = rr.top
    if (top + sr.height > window.innerHeight - 6) top = Math.max(6, window.innerHeight - sr.height - 6)
    ctxSub.style.left = left + 'px'
    ctxSub.style.top  = top + 'px'
  }

  function showCtxAt(cx, cy) {
    if (!ctxMenu.classList.contains('hidden')) { hideCtx(); return }   // toggle
    buildCtxMenu()
    Object.assign(ctxMenu.style, { position: '', left: cx + 'px', top: cy + 'px', bottom: '', right: '', height: '', maxHeight: '', width: '', overflowY: '', borderRadius: '' })
    ctxMenu.classList.remove('hidden')
  }

  function buildCtxMenu() {
    ctxMenu.innerHTML = ''
    ctxSub.style.display = 'none'
    const ORDER = ['cmd_dom_files', 'cmd_dom_image', 'cmd_dom_anim', 'cmd_dom_video', 'cmd_dom_audio', 'cmd_dom_util']
    const DOM_ICON = {
      cmd_dom_files: 'fa-folder-open', cmd_dom_image: 'fa-image', cmd_dom_anim: 'fa-wand-magic-sparkles',
      cmd_dom_video: 'fa-film', cmd_dom_audio: 'fa-music', cmd_dom_util: 'fa-toolbox',
    }
    const byDom = {}
    DOCKABLE.forEach(d => { if (isDockItemOpen(d.id)) return; const dom = TOOL_DOMAIN[d.id] || 'cmd_dom_util'; (byDom[dom] = byDom[dom] || []).push(d) })
    for (const dom of Object.keys(byDom)) byDom[dom].sort((a, b) => t(a.labelKey).length - t(b.labelKey).length)
    const order = ORDER.filter(d => byDom[d]).concat(Object.keys(byDom).filter(d => !ORDER.includes(d)))
    order.forEach(dom => {
      const row = document.createElement('button')
      row.className = 'ctx-item ctx-cat'
      row.innerHTML = `<i class="fa-solid ${DOM_ICON[dom] || 'fa-toolbox'}"></i><span style="flex:1" data-i18n="${dom}">${t(dom)}</span><i class="fa-solid fa-chevron-right" style="width:auto;font-size:9px;opacity:0.55;"></i>`
      row.addEventListener('mouseenter', () => { openSubmenu(byDom[dom], row) })
      row.addEventListener('click', ev => { ev.stopPropagation(); openSubmenu(byDom[dom], row) })
      ctxMenu.appendChild(row)
    })
    const sep = document.createElement('div'); sep.style.cssText = 'height:1px;background:var(--win-border-in,#1e1e1e);margin:6px 8px;'
    const set = document.createElement('button'); set.className = 'ctx-item'
    set.innerHTML = `<i class="fa-solid fa-gear"></i><span data-i18n="ctx_settings">${t('ctx_settings')}</span>`
    set.addEventListener('mouseenter', () => { ctxSub.style.display = 'none' })
    set.addEventListener('click', ev => { ev.stopPropagation(); openSettings(); hideCtx() })
    ctxMenu.append(sep, set)
  }

  // À propos
  const aboutOverlay = document.getElementById('about-overlay')
  document.getElementById('btn-about').addEventListener('click', () => {
    aboutOverlay.classList.remove('hidden')
  })
  document.getElementById('btn-about-close').addEventListener('click', () => {
    aboutOverlay.classList.add('hidden')
  })
  aboutOverlay.addEventListener('click', e => { if (e.target === aboutOverlay) aboutOverlay.classList.add('hidden') })

  // NOTE: closing on outside clicks is handled by the document listener further
  // down (the one that excludes #workbench) — a bare document-level hideCtx here
  // would swallow the very click that opens the menu (left-click on the
  // workbench bubbles up to document in the same event).
  document.addEventListener('keydown', e => {
    if (matchesShortcut('close-menu', e)) { hideCtx(); hidePicker() }

    if (matchesShortcut('fullscreen', e)) {
      e.preventDefault()
      if (!document.fullscreenElement) document.documentElement.requestFullscreen()
      else document.exitFullscreen()
    }

    // Ne pas interférer si un champ texte est actif
    const active = document.activeElement
    const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)

    if (!isInput) {
      // Play / Pause — affect the focused tool window first, then any open daw/mic
      if (matchesShortcut('play-pause', e)) {
        e.preventDefault()
        const focusedWin = workbench.querySelector('.tool-win:focus-within')
        if (focusedWin) {
          const btn = focusedWin.querySelector('#daw-play, #mc-play')
          if (btn) { btn.click(); return }
        }
        // Fallback: click whichever is present (daw takes priority)
        const dawPlay = workbench.querySelector('#daw-play')
        if (dawPlay) { dawPlay.click(); return }
        workbench.querySelector('#mc-play')?.click()
      }
    }

    // Ctrl+S — sauvegarde du tool focusé
    if (matchesShortcut('save', e)) {
      const focusedWin = workbench.querySelector('.tool-win:focus-within')
      if (focusedWin) {
        const saveBtn = focusedWin.querySelector('#daw-save-proj, #mc-save, #seq-save')
        if (saveBtn && !saveBtn.disabled) { e.preventDefault(); saveBtn.click() }
      }
    }

    // Ctrl+Z — Undo
    if (matchesShortcut('undo', e)) {
      e.preventDefault()
      if (canUndo()) {
        undo()
        window.toast?.(t('sc_undo'), 'info', 1200)
      }
    }

    // Ctrl+Shift+Z — Redo
    if (matchesShortcut('redo', e)) {
      e.preventDefault()
      if (canRedo()) {
        redo()
        window.toast?.(t('sc_redo'), 'info', 1200)
      }
    }

    // Ctrl+Shift+S — Save project
    if (matchesShortcut('proj-save', e)) {
      e.preventDefault()
      saveProjectToFile().then(ok => {
        if (ok) window.toast?.(t('proj_save') + ' ✓', 'success')
      })
    }

    // Command palette
    if (matchesShortcut('command-palette', e)) { e.preventDefault(); openCommandPalette() }

    // Stop all (global transport)
    if (matchesShortcut('transport-stop', e)) { e.preventDefault(); transportStop() }

    // Arrange windows
    if (matchesShortcut('arrange-windows', e)) { e.preventDefault(); arrangeWindows(workbench) }

    // Toggle focus mode
    if (matchesShortcut('focus-mode', e)) {
      e.preventDefault()
      const on = !document.documentElement.classList.contains('focus-mode')
      document.documentElement.classList.toggle('focus-mode', on)
      try { localStorage.setItem('iceample:display:focus', on ? 'true' : 'false') } catch {}
      window.toast?.(t('display_focus_mode'), 'info', 1000)
    }

    // Toggle reduce motion
    if (matchesShortcut('reduce-motion', e)) {
      e.preventDefault()
      const on = !document.documentElement.classList.contains('reduce-motion')
      document.documentElement.classList.toggle('reduce-motion', on)
      try { localStorage.setItem('iceample:display:reducemotion', on ? 'true' : 'false') } catch {}
      window.toast?.(t('display_reduce_motion'), 'info', 1000)
    }

    // Open settings
    if (matchesShortcut('open-settings', e)) { e.preventDefault(); openSettings() }

    // Toggle metronome (global) — ignore while typing in a field
    if (matchesShortcut('metronome', e)) {
      const a = document.activeElement
      const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)
      if (!typing) {
        e.preventDefault()
        const on = toggleMetronome()
        window.toast?.(t('metro_section') + (on ? ' ▶' : ' ⏹'), 'info', 900)
      }
    }

    // Tempo nudge
    if (matchesShortcut('tempo-up', e))   { e.preventDefault(); setBpm(getBpm() + 1) }
    if (matchesShortcut('tempo-down', e)) { e.preventDefault(); setBpm(getBpm() - 1) }

    // Play from start
    if (matchesShortcut('play-from-start', e)) { e.preventDefault(); seekTransport(0); transportPlay() }

    // Master volume
    if (matchesShortcut('master-vol-up', e))   { e.preventDefault(); setVolume('master', Math.min(1.5, getVolume('master') + 0.05)) }
    if (matchesShortcut('master-vol-down', e)) { e.preventDefault(); setVolume('master', Math.max(0,   getVolume('master') - 0.05)) }

    // Close all windows
    if (matchesShortcut('close-all', e)) { e.preventDefault(); closeAllWindows(workbench) }

    // Toggle a tool window open/close
    for (const id of ['daw','mic','mixer','sequencer','editor','piano','eq','library','search','importer','notes','timer','tempo','spectrum','tuner']) {
      if (matchesShortcut('win-' + id, e)) { e.preventDefault(); toggleTool(id); break }
    }

    // Master mute
    if (matchesShortcut('master-mute', e)) {
      e.preventDefault()
      const m = !getMuted('master'); setMute('master', m)
      window.toast?.(t('sc_master_mute') + (m ? ' 🔇' : ' 🔊'), 'info', 900)
    }

    // Toggle dock visibility
    if (matchesShortcut('toggle-dock', e)) {
      e.preventDefault()
      const nowHidden = !dock.classList.contains('hidden')
      dock.classList.toggle('hidden', nowHidden)
      try { localStorage.setItem('iceample:display:dock', nowHidden ? 'false' : 'true') } catch {}
    }

    // Window focus cycling + maximize
    if (matchesShortcut('focus-next-win', e)) { e.preventDefault(); cycleWin(1) }
    if (matchesShortcut('focus-prev-win', e)) { e.preventDefault(); cycleWin(-1) }
    if (matchesShortcut('win-maximize', e))   { e.preventDefault(); toggleMaximize() }

    // Per-track mute / solo (mixer strips stay in sync via onMixChange)
    for (const id of ['seq','daw','mic','editor','piano']) {
      if (matchesShortcut('mute-' + id, e)) { e.preventDefault(); setMute(id, !getMuted(id)); break }
      if (matchesShortcut('solo-' + id, e)) { e.preventDefault(); setSolo(id, !getSolo(id)); break }
    }

    // Mixdown / export master (clicks the mixer's record button; opens it if closed)
    if (matchesShortcut('mixdown', e)) {
      e.preventDefault()
      const b = document.querySelector('.mix-export-btn')
      if (b) b.click()
      else { toggleTool('mixer'); window.toast?.(t('mix_export_master'), 'info', 1200) }
    }
  })


  // ── Theme color pickers — save on change, notify preset indicator ────────────
  Object.entries(themeMap).forEach(([id, cssVar]) => {
    const inp = document.getElementById(id)
    if (!inp) return
    inp.addEventListener('input', () => {
      document.documentElement.style.setProperty(cssVar, inp.value)
      try { localStorage.setItem('theme:' + cssVar, inp.value) } catch {}
      notifyThemeChange()
    })
  })

  // Reset button — back to the default theme (pickers then show its colours;
  // they used to show stale HTML defaults).
  document.getElementById('theme-reset-btn')?.addEventListener('click', () => resetThemeColors())

  // Settings tabs nav
  document.querySelectorAll('.settings-nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.settings-nav-btn[data-tab]').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active')
    })
  })


  buildLangTab()
  buildAudioTab()
  buildDisplayTab()
  buildShortcutsTab()
  applyTranslations()
  buildThemeExtras()
  initAnnotations()   // apply the hint-tooltip toggle (and watch new buttons)

  // ── MIDI bus ───────────────────────────────────────────────────────────────
  initMidiBus()
  initDevices()

  // ── Quick dock ────────────────────────────────────────────────────────────
  const dock = document.createElement('div')
  dock.id = 'quick-dock'
  dock.className = 'hidden'

  // ⋮ menu trigger — lets the user pick which tools live in the dock.
  const dockMenuBtn = document.createElement('button')
  dockMenuBtn.id = 'dock-menu-btn'
  dockMenuBtn.innerHTML = '&#8942;'  // vertical dots
  dockMenuBtn.title = t('dock_customize') + ' — ' + t('cmd_palette_title')
  dock.appendChild(dockMenuBtn)

  // Which tools are pinned to the dock (empty by default → just the dots).
  const DOCK_KEY = 'iceample:dock:tools'
  const loadDockTools = () => { try { return JSON.parse(localStorage.getItem(DOCK_KEY)) || [] } catch { return [] } }
  const saveDockTools = a => { try { localStorage.setItem(DOCK_KEY, JSON.stringify(a)) } catch {} }
  let dockTools = loadDockTools()

  // Pinnable items = left-click tools + right-click tools (Settings excluded).
  const CTX_DOCK_TOOLS = [
    { id:'search',   labelKey:'tool_search',   icon:'fa-solid fa-magnifying-glass', w:300, h:380, init:lazyInit(() => import('./search.js').then(m => m.initSearch)) },
    { id:'importer', labelKey:'tool_importer', icon:'fa-solid fa-file-import',      w:380, h:300, init:lazyInit(() => import('./importer.js').then(m => m.initImporter)) },
    { id:'notes',    labelKey:'ctx_notes',     icon:'fa-solid fa-note-sticky',      w:300, h:380, init:lazyInit(() => import('./notes.js').then(m => m.initNotes)) },
    { id:'timer',    labelKey:'ctx_timer',     icon:'fa-solid fa-stopwatch',        w:280, h:260, init:lazyInit(() => import('./timer.js').then(m => m.initTimer)) },
    { id:'tempo',    labelKey:'ctx_metro',     icon:'fa-solid fa-drum',             w:300, h:215, init:initTempo },
    { id:'spectrum', labelKey:'ctx_spectrum',  icon:'fa-solid fa-circle-nodes',     w:480, h:480, init:lazyInit(() => import('./spectrum.js').then(m => m.initSpectrum)) },
    { id:'tuner',    labelKey:'ctx_tuner',     icon:'fa-solid fa-guitar',           w:300, h:520, init:lazyInit(() => import('./tuner.js').then(m => m.initTuner)) },
    { id:'delay',    labelKey:'tool_delay',    icon:'fa-solid fa-wave-square',      w:340, h:340, init:lazyInit(() => import('./delay.js').then(m => m.initDelay)) },
  ]
  const DOCKABLE = [
    ...[...TOOLS, ...EXTRA_TOOLS].map(tl => ({ id: tl.id, icon: tl.icon, labelKey: tl.labelKey, kind: 'tool', tool: tl })),
    ...CTX_DOCK_TOOLS.map(c => ({ id: c.id, icon: c.icon, labelKey: c.labelKey, kind: 'ctx', meta: c })),
  ]
  const dockableById = id => DOCKABLE.find(d => d.id === id)
  const isDockItemOpen = id => openTools.has(id) || openCtxTools.has(id)

  function openDockItem(d) {
    if (d.kind === 'tool') {
      openTools.add(d.id)
      const wb = workbench.getBoundingClientRect()
      createToolWindow(d.tool, Math.round(wb.width / 2 - d.tool.w / 2), Math.round(wb.height / 2 - d.tool.h / 2), workbench)
      autoSaveLayout(workbench)
    } else {
      ctxSpawnPos = null   // open centred
      spawnCtxTool(d.id, t(d.meta.labelKey), d.meta.icon, d.meta.w, d.meta.h, d.meta.init)
    }
  }
  function closeDockItem(d) {
    if (d.kind === 'tool') {
      const win = workbench.querySelector(`.tool-win[data-tool-id="${d.id}"]`)
      if (win) { openTools.delete(d.id); win.remove(); autoSaveLayout(workbench) }
    } else {
      const win = workbench.querySelector(`.tool-win[data-ctx-id="${d.id}"]`)
      if (win) win.remove()
      openCtxTools.delete(d.id)
    }
  }

  // Open/close a tool window by id (used by the keyboard shortcuts).
  function toggleTool(id) {
    const d = dockableById(id)
    if (!d) return
    isDockItemOpen(id) ? closeDockItem(d) : openDockItem(d)
    updateDock()
  }
  // Cycle focus through open windows (dir = +1 next, -1 previous).
  function cycleWin(dir) {
    const wins = [...workbench.querySelectorAll('.tool-win')]
    if (!wins.length) return
    const cur = workbench.querySelector('.tool-win.focused')
    const idx = cur ? wins.indexOf(cur) : -1
    const next = wins[(idx + dir + wins.length) % wins.length]
    focusWin(next); workbench.appendChild(next)   // raise (stacking is DOM order)
  }
  // Maximize / restore the focused window.
  function toggleMaximize() {
    const win = workbench.querySelector('.tool-win.focused') || workbench.querySelector('.tool-win')
    if (win) toggleMaximizeWin(win, workbench)
  }

  // Tools grouped by creative domain (Sound / Image / Text / Files / Utilities).
  // Drives how the palette clusters the "open tool" entries; extends to video etc.
  const TOOL_DOMAIN = {
    daw: 'cmd_dom_audio', mic: 'cmd_dom_audio', mixer: 'cmd_dom_audio', sequencer: 'cmd_dom_audio',
    editor: 'cmd_dom_audio', piano: 'cmd_dom_audio', eq: 'cmd_dom_audio',
    tempo: 'cmd_dom_audio', spectrum: 'cmd_dom_anim', tuner: 'cmd_dom_util', delay: 'cmd_dom_audio', player: 'cmd_dom_audio',
    moodboard: 'cmd_dom_image', imgedit: 'cmd_dom_image', tool3d: 'cmd_dom_image', palettes: 'cmd_dom_image', effects: 'cmd_dom_image',
    textanim: 'cmd_dom_anim', bganim: 'cmd_dom_anim',
    writer: 'cmd_dom_util', notes: 'cmd_dom_util',
    calc: 'cmd_dom_util', units: 'cmd_dom_util',
    library: 'cmd_dom_files', search: 'cmd_dom_files', importer: 'cmd_dom_files',
    recent: 'cmd_dom_files', metadata: 'cmd_dom_files', converter: 'cmd_dom_files', pdftool: 'cmd_dom_files',
    subtitles: 'cmd_dom_anim', particles: 'cmd_dom_anim',
    patterns: 'cmd_dom_image',
    qrcode: 'cmd_dom_util', watermark: 'cmd_dom_util',
    timer: 'cmd_dom_util',
    videorec: 'cmd_dom_video',
    recorder: 'cmd_dom_video',
    timelapse: 'cmd_dom_video',
    rawtool: 'cmd_dom_image',
  }

  // ── Command registry — seed it with everything the palette (Ctrl+K) can run ──
  registerCommands([
    // Open / close each tool window, grouped by domain.
    ...DOCKABLE.map(d => ({
      id: 'open-' + d.id, titleKey: d.labelKey, icon: d.icon,
      category: TOOL_DOMAIN[d.id] || 'cmd_cat_tools', shortcutAction: 'win-' + d.id,
      keywords: 'open ouvrir toggle ' + d.id, run: () => toggleTool(d.id),
    })),
    // Transport.
    { id: 'cmd-play-pause', titleKey: 'sc_play_pause', icon: 'fa-solid fa-play', category: 'cmd_cat_transport', shortcutAction: 'play-pause', run: () => transportToggle() },
    { id: 'cmd-stop', titleKey: 'sc_transport_stop', icon: 'fa-solid fa-stop', category: 'cmd_cat_transport', shortcutAction: 'transport-stop', run: () => transportStop() },
    { id: 'cmd-play-start', titleKey: 'sc_play_from_start', icon: 'fa-solid fa-backward-fast', category: 'cmd_cat_transport', shortcutAction: 'play-from-start', run: () => { seekTransport(0); transportPlay() } },
    { id: 'cmd-metronome', titleKey: 'sc_metronome', icon: 'fa-solid fa-drum', category: 'cmd_cat_transport', shortcutAction: 'metronome', run: () => toggleMetronome() },
    { id: 'cmd-tempo-up', titleKey: 'sc_tempo_up', icon: 'fa-solid fa-plus', category: 'cmd_cat_transport', shortcutAction: 'tempo-up', run: () => setBpm(getBpm() + 1) },
    { id: 'cmd-tempo-down', titleKey: 'sc_tempo_down', icon: 'fa-solid fa-minus', category: 'cmd_cat_transport', shortcutAction: 'tempo-down', run: () => setBpm(getBpm() - 1) },
    // View.
    { id: 'cmd-arrange', titleKey: 'sc_arrange', icon: 'fa-solid fa-table-cells-large', category: 'cmd_cat_view', shortcutAction: 'arrange-windows', run: () => arrangeWindows(workbench) },
    { id: 'cmd-focus-mode', titleKey: 'sc_focus_mode', icon: 'fa-solid fa-eye', category: 'cmd_cat_view', shortcutAction: 'focus-mode', run: () => {
      const on = !document.documentElement.classList.contains('focus-mode')
      document.documentElement.classList.toggle('focus-mode', on)
      try { localStorage.setItem('iceample:display:focus', on ? 'true' : 'false') } catch {}
    } },
    { id: 'cmd-reduce-motion', titleKey: 'sc_reduce_motion', icon: 'fa-solid fa-wand-sparkles', category: 'cmd_cat_view', shortcutAction: 'reduce-motion', run: () => {
      const on = !document.documentElement.classList.contains('reduce-motion')
      document.documentElement.classList.toggle('reduce-motion', on)
      try { localStorage.setItem('iceample:display:reducemotion', on ? 'true' : 'false') } catch {}
    } },
    { id: 'cmd-window-glow', titleKey: 'display_window_glow', icon: 'fa-solid fa-wand-magic-sparkles', category: 'cmd_cat_view', run: () => {
      const on = !document.documentElement.classList.contains('win-glow')
      document.documentElement.classList.toggle('win-glow', on)
      try { localStorage.setItem('iceample:display:winglow', on ? 'true' : 'false') } catch {}
      window.toast?.(t('display_window_glow'), 'info', 1000)
    } },
    { id: 'cmd-toggle-dock', titleKey: 'sc_toggle_dock', icon: 'fa-solid fa-grip', category: 'cmd_cat_view', shortcutAction: 'toggle-dock', run: () => {
      const dk = document.getElementById('quick-dock'); if (!dk) return
      const nowHidden = !dk.classList.contains('hidden')
      dk.classList.toggle('hidden', nowHidden)
      try { localStorage.setItem('iceample:display:dock', nowHidden ? 'false' : 'true') } catch {}
    } },
    // Windows.
    { id: 'cmd-close-all', titleKey: 'sc_close_all', icon: 'fa-solid fa-xmark', category: 'cmd_cat_window', shortcutAction: 'close-all', run: () => closeAllWindows(workbench) },
    { id: 'cmd-focus-next', titleKey: 'sc_focus_next', icon: 'fa-solid fa-arrow-right', category: 'cmd_cat_window', shortcutAction: 'focus-next-win', run: () => cycleWin(1) },
    { id: 'cmd-focus-prev', titleKey: 'sc_focus_prev', icon: 'fa-solid fa-arrow-left', category: 'cmd_cat_window', shortcutAction: 'focus-prev-win', run: () => cycleWin(-1) },
    { id: 'cmd-maximize', titleKey: 'sc_win_maximize', icon: 'fa-solid fa-expand', category: 'cmd_cat_window', shortcutAction: 'win-maximize', run: () => toggleMaximize() },
    // Settings.
    { id: 'cmd-settings', titleKey: 'sc_open_settings', icon: 'fa-solid fa-gear', category: 'cmd_cat_settings', shortcutAction: 'open-settings', run: () => openSettings() },
    { id: 'cmd-master-mute', titleKey: 'sc_master_mute', icon: 'fa-solid fa-volume-xmark', category: 'cmd_cat_settings', shortcutAction: 'master-mute', run: () => { const m = !getMuted('master'); setMute('master', m) } },
    { id: 'cmd-master-up', titleKey: 'sc_master_vol_up', icon: 'fa-solid fa-volume-high', category: 'cmd_cat_settings', shortcutAction: 'master-vol-up', run: () => setVolume('master', Math.min(1.5, getVolume('master') + 0.05)) },
    { id: 'cmd-master-down', titleKey: 'sc_master_vol_down', icon: 'fa-solid fa-volume-low', category: 'cmd_cat_settings', shortcutAction: 'master-vol-down', run: () => setVolume('master', Math.max(0, getVolume('master') - 0.05)) },
  ])

  const dockBtns = {}
  function makeDockBtn(d) {
    const btn = document.createElement('button')
    btn.className = 'dock-btn'
    btn.innerHTML = `<i class="${d.icon}"></i><span class="dock-btn-tip">${t(d.labelKey)}</span>`
    btn.title = t(d.labelKey)
    btn.dataset.toolId = d.id
    // Drag to reorder within the dock.
    btn.draggable = true
    btn.addEventListener('dragstart', e => {
      btn.classList.add('dragging')
      e.dataTransfer.effectAllowed = 'move'
      try { e.dataTransfer.setData('text/plain', d.id) } catch {}
    })
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging')
      dockTools = [...dock.querySelectorAll('.dock-btn')].map(b => b.dataset.toolId)
      saveDockTools(dockTools)
    })
    btn.addEventListener('click', () => {
      hidePicker(); hideCtx()                       // clicking the dock closes the menus
      isDockItemOpen(d.id) ? closeDockItem(d) : openDockItem(d)
      updateDock()
    })
    return btn
  }
  function renderDock() {
    Object.values(dockBtns).forEach(b => b.remove())
    for (const k in dockBtns) delete dockBtns[k]
    dockTools.forEach(id => {
      const d = dockableById(id)
      if (!d) return
      const btn = makeDockBtn(d)
      dockBtns[id] = btn
      dock.appendChild(btn)
    })
    updateDock()
  }
  // Right-click on the dock: never open the context menu, just dismiss menus.
  dock.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation(); hideCtx(); hidePicker()
  })

  workbench.appendChild(dock)

  // Fixed in the bottom-left corner (not draggable), same 5px inset as the
  // other corner toolbars.
  dock.style.left   = '5px'
  dock.style.top    = '5px'

  // Live reordering: move the dragged button to the slot under the cursor.
  function dockBtnAfter(x) {
    const others = [...dock.querySelectorAll('.dock-btn:not(.dragging)')]
    let closest = { offset: -Infinity, el: null }
    for (const b of others) {
      const box = b.getBoundingClientRect()
      const offset = x - box.left - box.width / 2
      if (offset < 0 && offset > closest.offset) closest = { offset, el: b }
    }
    return closest.el
  }
  dock.addEventListener('dragover', e => {
    const dragging = dock.querySelector('.dock-btn.dragging')
    if (!dragging) return
    e.preventDefault()
    const after = dockBtnAfter(e.clientX)
    if (after == null) dock.appendChild(dragging)
    else dock.insertBefore(dragging, after)
  })

  // ── Dock customise menu (pick tools) ──────────────────────────────────────
  const dockMenu = document.createElement('div')
  dockMenu.id = 'dock-menu'
  dockMenu.className = 'hidden'
  workbench.appendChild(dockMenu)

  function buildDockMenu() {
    dockMenu.innerHTML = ''
    DOCKABLE.forEach(d => {
      const row = document.createElement('button')
      row.className = 'dock-menu-item' + (dockTools.includes(d.id) ? ' on' : '')
      row.innerHTML = `<i class="${d.icon}"></i><span>${t(d.labelKey)}</span><i class="fa-solid fa-check dock-menu-check"></i>`
      row.addEventListener('click', () => {
        dockTools = dockTools.includes(d.id)
          ? dockTools.filter(x => x !== d.id)
          : [...dockTools, d.id]
        saveDockTools(dockTools)
        row.classList.toggle('on', dockTools.includes(d.id))
        renderDock()
      })
      dockMenu.appendChild(row)
    })
  }
  function openDockMenu() {
    buildDockMenu()
    dockMenu.style.left   = '5px'
    dockMenu.style.top    = (dock.offsetHeight + 9) + 'px'   // dock is top-left → open below
    dockMenu.style.bottom = 'auto'
    dockMenu.classList.remove('hidden')
  }
  // Left-click ⋮ → pick which tools live in the dock ; right-click ⋮ → command palette.
  dockMenuBtn.addEventListener('click', e => {
    e.stopPropagation()
    hidePicker(); hideCtx()
    dockMenu.classList.contains('hidden') ? openDockMenu() : dockMenu.classList.add('hidden')
  })
  dockMenuBtn.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation()
    hidePicker(); hideCtx()
    openCommandPalette()
  })
  document.addEventListener('mousedown', e => {
    if (!dockMenu.classList.contains('hidden') &&
        !dockMenu.contains(e.target) && !dockMenuBtn.contains(e.target)) {
      dockMenu.classList.add('hidden')
    }
  })

  function updateDock() {
    const dockEnabled = localStorage.getItem('iceample:display:dock') !== 'false'  // on by default
    dock.classList.toggle('hidden', !dockEnabled)
    Object.entries(dockBtns).forEach(([id, btn]) => btn.classList.toggle('open', isDockItemOpen(id)))
  }
  renderDock()

  // ── Media bus (image/video "wires" between tools) ─────────────────────────
  // A sender fires `iceample-send-media` {toolId, media}; we open/focus the
  // target window and hand the media to its body as an `iceample-media` event.
  // Receivers register their listener at the very start of their init (before
  // any dynamic import), so once the body exists the event can be delivered.
  window.addEventListener('iceample-send-media', async e => {
    const { toolId, media } = e.detail || {}
    const d = dockableById(toolId)
    if (!d || !media) return
    if (!isDockItemOpen(toolId)) { openDockItem(d); updateDock() }
    const findBody = () =>
      workbench.querySelector(`.tool-win[data-tool-id="${toolId}"] .tool-win-body`) ||
      workbench.querySelector(`.tool-win[data-ctx-id="${toolId}"] .tool-win-body`)
    let tbody = findBody()
    for (let i = 0; i < 40 && !tbody; i++) { await new Promise(r => setTimeout(r, 50)); tbody = findBody() }
    if (!tbody) return
    focusWin(tbody.closest('.tool-win'))
    // Tool modules are lazy-loaded: wait for the init to have run (toolReady)
    // so the target's 'iceample-media' listener actually exists.
    for (let i = 0; i < 100 && tbody.dataset.toolReady !== '1' && document.contains(tbody); i++) {
      await new Promise(r => setTimeout(r, 50))
    }
    if (!document.contains(tbody)) return
    setTimeout(() => tbody.dispatchEvent(new CustomEvent('iceample-media', { detail: media })), 30)
  })

  // Wire updateDock callback into extracted modules
  initWindowManager({ updateDock })
  initSettings({ workbench, updateDock })

  // ── Périphériques ──────────────────────────────────────────────────────────
  const isTauri = !!window.__TAURI__ && !window.__ICEAMPLE_WEB__

  // Microphones and outputs: listed by the webview itself, whose deviceIds are
  // what getUserMedia / setSinkId understand (devices.js applies the choices).
  function fillDeviceSelect(id, items, name, emptyLabel) {
    const sel = document.getElementById(id); if (!sel) return
    sel.innerHTML = ''
    const none = document.createElement('option'); none.value = ''; none.textContent = emptyLabel
    sel.appendChild(none)
    for (const d of items) {
      const o = document.createElement('option'); o.value = d.id; o.textContent = d.name
      sel.appendChild(o)
    }
    const saved = getDevice(name)
    sel.value = items.some(d => d.id === saved) ? saved : ''
    sel.onchange = () => setDevice(name, sel.value)
  }

  async function loadDevices() {
    let list = []
    try { list = await navigator.mediaDevices.enumerateDevices() } catch {}
    // 'default' / 'communications' are aliases of a real device: the empty
    // "system default" option already covers them.
    const named = (kind, key) => list
      .filter(d => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, name: d.label || t(key).replace('{n}', i + 1) }))
    const inputs  = named('audioinput',  'dev_generic_in')
    const outputs = named('audiooutput', 'dev_generic_out')
    fillDeviceSelect('dev-mic-1', inputs,  'mic1', t('dev_default'))
    fillDeviceSelect('dev-mic-2', inputs,  'mic2', t('dev_none'))
    fillDeviceSelect('dev-out-1', outputs, 'out1', t('dev_default'))
    fillDeviceSelect('dev-out-2', outputs, 'out2', t('dev_none'))
    // Names (and full lists) only come once microphone access was granted.
    const allow = document.getElementById('dev-allow')
    if (allow) allow.style.display = list.some(d => d.label) ? 'none' : ''

    const midiSel = document.getElementById('dev-midi-in'); if (!midiSel) return
    if (isTauri) {
      const midiPorts = await safeInvoke('list_midi_inputs')
      if (!midiPorts) return
      midiSel.innerHTML = `<option value="">${t('dev_none')}</option>` +
        midiPorts.map((name, i) => `<option value="${i}">${name}</option>`).join('')
      const saved = localStorage.getItem('dev:midi-in')
      if (saved) midiSel.value = saved
      midiSel.onchange = () => {
        localStorage.setItem('dev:midi-in', midiSel.value)
        const selectedName = midiPorts[parseInt(midiSel.value)]
        if (selectedName) localStorage.setItem('dev:midi-in-name', selectedName)
        else localStorage.removeItem('dev:midi-in-name')
        reconnectMidi()
      }
    } else {
      try {
        const midi = await navigator.requestMIDIAccess()
        const ports = [...midi.inputs.values()]
        midiSel.innerHTML = `<option value="">${t('dev_none')}</option>` +
          ports.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')
        const savedMidi = localStorage.getItem('dev:midi-in')
        if (savedMidi) midiSel.value = savedMidi
        midiSel.onchange = () => {
          localStorage.setItem('dev:midi-in', midiSel.value)
          const port = ports[parseInt(midiSel.value)]
          if (port) localStorage.setItem('dev:midi-in-name', port.name)
          else localStorage.removeItem('dev:midi-in-name')
          reconnectMidi()
        }
      } catch { midiSel.innerHTML = '<option>MIDI non disponible</option>' }
    }
  }

  loadDevices()
  document.getElementById('dev-refresh')?.addEventListener('click', loadDevices)
  document.getElementById('dev-allow')?.addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach(tr => tr.stop())   // only needed for the names: release the mic at once
    } catch {}
    loadDevices()
  })
  navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices)

  // Clic gauche workbench → même menu unifié que le clic droit
  workbench.addEventListener('click', e => {
    if (e.target.closest('#ctx-menu') || e.target.closest('#ctx-submenu')) return
    if (e.target.closest('#proj-bar') || e.target.closest('#arrange-bar')) return
    if (e.target.closest('#quick-dock') || e.target.closest('#dock-menu')) { hideCtx(); return }
    if (e.target.closest('.tool-win')) { hideCtx(); return }
    showCtxAt(e.clientX, e.clientY)
  })

  document.addEventListener('click', e => {
    if (!e.target.closest('#ctx-menu') && !e.target.closest('#ctx-submenu') && !e.target.closest('#workbench')) hideCtx()
  })

  // Subtle 3D-cube parallax: the depth glow drifts opposite the cursor, so the
  // workspace reads as a volume rather than a flat plane.
  workbench.addEventListener('mousemove', e => {
    if (document.documentElement.classList.contains('reduce-motion')) return
    const r = workbench.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width  - 0.5
    const ny = (e.clientY - r.top)  / r.height - 0.5
    workbench.style.setProperty('--wb-px', (-nx * 26).toFixed(1) + 'px')
    workbench.style.setProperty('--wb-py', (-ny * 20).toFixed(1) + 'px')
  }, { passive: true })

  // ── Auto-save ─────────────────────────────────────────────────────────────
  startAutosave()

  // ── Restore windows from last session ────────────────────────────────────
  ;(function restoreLastSession() {
    const savedWins = getFullLayout()
    if (!savedWins.length) return
    for (const entry of savedWins) {
      const d = dockableById(entry.id)
      if (!d || d.kind !== 'tool' || openTools.has(entry.id)) continue
      openTools.add(entry.id)
      createToolWindow(d.tool, entry.x, entry.y, workbench, true)
    }
    updateDock()
  })()

  // ── Auto-save recovery banner (only after an abnormal exit) ───────────────
  checkRecovery().then(recovery => {
    if (!recovery) return
    const banner = document.createElement('div')
    banner.id = 'recovery-banner'
    banner.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:var(--surface,#1a1a2a);
      border:1px solid var(--color-active,#4a9eff);
      color:var(--text-primary,#e0e0e0);
      padding:10px 16px;border-radius:10px;font-size:12px;z-index:99998;
      box-shadow:0 8px 24px -8px rgba(0,0,0,0.6);display:flex;align-items:center;gap:10px;
    `
    banner.innerHTML = `
      <i class="fa-solid fa-cloud-arrow-down" style="color:var(--color-active,#4a9eff);font-size:14px;"></i>
      <span>${t('proj_recovery')}</span>
      <button id="recovery-restore" style="
        background:var(--btn-primary);border:none;color:var(--on-accent);padding:4px 10px;
        border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;">
        ${t('proj_recovery_restore')}
      </button>
      <button id="recovery-discard" style="
        background:var(--surface,#111);border:1px solid var(--win-border-in,#2a2a2a);
        color:var(--text-secondary,#aaa);padding:4px 10px;
        border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;">
        ${t('proj_recovery_discard')}
      </button>
    `
    document.body.appendChild(banner)
    banner.querySelector('#recovery-restore').addEventListener('click', () => {
      // Tools that were open in the crashed session but are closed now get
      // reopened: each one picks up its recovered state as it initialises.
      const TOOL_OF = { seq: 'sequencer' }   // project-registry id → tool id
      for (const id of applyAutosaveRecovery(recovery)) {
        const d = dockableById(TOOL_OF[id] || id)
        if (d && d.kind === 'tool' && !isDockItemOpen(d.id)) openDockItem(d)
      }
      updateDock()
      resolveRecovery()
      banner.remove()
      window.toast?.(t('proj_autosave') + ' ✓', 'success')
    })
    banner.querySelector('#recovery-discard').addEventListener('click', () => {
      resolveRecovery()
      banner.remove()
    })
  })

  // Transport (BPM + Play/Stop) lives in the movable "Player" tool — open it from
  // the menu, dock or Ctrl+K. The Spacebar still toggles play/stop globally.

  // Spacebar = global play/stop (ignored while typing in a field).
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.repeat) return
    const el = document.activeElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    e.preventDefault()
    transportToggle()
  })

  // ── Arrange-windows button (bottom-right of workbench) ────────────────────
  const arrangeBar = document.createElement('div')
  arrangeBar.id = 'arrange-bar'
  arrangeBar.style.cssText = `
    position:absolute;bottom:5px;right:5px;z-index:200;
    display:flex;gap:4px;align-items:center;
  `
  const projArrangeBtn = document.createElement('button')
  projArrangeBtn.className = 'seq-btn'
  projArrangeBtn.title = t('ctx_arrange') + ' — ' + t('arrange_close_all')
  projArrangeBtn.innerHTML = '<i class="fa-solid fa-table-cells-large"></i>'
  projArrangeBtn.style.cssText = 'font-size:11px;padding:4px 7px;opacity:0.65;'
  projArrangeBtn.addEventListener('mouseenter', () => { projArrangeBtn.style.opacity = '1' })
  projArrangeBtn.addEventListener('mouseleave', () => { projArrangeBtn.style.opacity = '0.65' })
  projArrangeBtn.addEventListener('click', () => arrangeWindows(workbench))
  // Right-click → close every open window (and don't open the context menu)
  projArrangeBtn.addEventListener('contextmenu', e => {
    e.preventDefault()
    e.stopPropagation()
    closeAllWindows(workbench)
  })
  arrangeBar.append(projArrangeBtn)
  workbench.appendChild(arrangeBar)

  // ── Corner-bar occlusion ──────────────────────────────────────────────────
  // When a tool window slides under a corner toolbar, make that bar solid
  // (no transparency) so it stays readable.
  const cornerBars = [arrangeBar, dock]
  const rectsOverlap = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  function updateCornerOcclusion() {
    const wins = [...workbench.querySelectorAll('.tool-win')].map(w => w.getBoundingClientRect())
    for (const bar of cornerBars) {
      if (!bar || bar.classList.contains('hidden')) continue
      const br = bar.getBoundingClientRect()
      if (br.width === 0 || br.height === 0) { bar.classList.remove('occluded'); continue }
      const occ = wins.some(r => rectsOverlap(br, r))
      if (bar.classList.contains('occluded') !== occ) bar.classList.toggle('occluded', occ)
    }
  }
  let occRaf = null
  const scheduleOcc = () => { if (!occRaf) occRaf = requestAnimationFrame(() => { occRaf = null; updateCornerOcclusion() }) }
  const occObs = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') { scheduleOcc(); return }
      if (m.type === 'attributes' && m.target.classList?.contains('tool-win')) { scheduleOcc(); return }
    }
  })
  occObs.observe(workbench, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
  window.addEventListener('resize', scheduleOcc)
  updateCornerOcclusion()
})
