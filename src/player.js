// player.js — Transport tool: BPM + play/stop + position. Replaces the old
// fixed top-left transport bar with a movable, dockable tool window.
import { t } from './i18n.js'
import { transportToggle, transportStop, getPosition } from './transport.js'
import { getBpm, setBpm, onBpmChange } from './tempo.js'
import { animateCount } from './rb-effects.js'

function injectStyles() {
  if (document.getElementById('player-styles')) return
  const s = document.createElement('style')
  s.id = 'player-styles'
  s.textContent = `
.player-body { display:flex; align-items:center; justify-content:center; height:100%; background:var(--surface,#141414); padding:0 12px; }
.player-row { display:flex; align-items:center; gap:9px; width:100%; }
.player-bpm { min-width:46px; text-align:center; font-size:18px; font-weight:700; color:var(--text-primary,#fff);
  background:#0e0e10; border:1px solid var(--win-border,#2a2a2a); border-radius:7px; padding:5px 9px; cursor:ns-resize;
  outline:none; font-variant-numeric:tabular-nums; user-select:none; }
.player-bpm:focus { border-color:var(--color-active,#4a9eff); }
.player-bpm-lbl { font-size:9px; font-weight:700; letter-spacing:0.12em; color:var(--text-secondary,#888); }
.player-sep { width:1px; height:24px; background:var(--win-border-in,#1e1e1e); }
.player-btn { width:38px; height:32px; display:flex; align-items:center; justify-content:center; border:1px solid var(--win-border,#2a2a2a);
  background:#1c1c20; color:var(--text-primary,#eee); border-radius:7px; cursor:pointer; font-size:13px; transition:background .1s,color .1s,border-color .1s; }
.player-btn:hover { background:#26262c; }
.player-btn.active { color:var(--color-active,#4a9eff); border-color:var(--color-active,#4a9eff); }
.player-time { margin-left:auto; font-size:15px; font-variant-numeric:tabular-nums; color:var(--text-secondary,#bbb); letter-spacing:0.02em; }
  `
  document.head.appendChild(s)
}

const fmt = s => { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') }

export function initPlayer(body) {
  injectStyles()
  body.classList.add('player-body')
  body.innerHTML = `
    <div class="player-row">
      <div class="player-bpm" id="player-bpm" tabindex="0" title="${t('bpm_box')}"></div>
      <span class="player-bpm-lbl">BPM</span>
      <div class="player-sep"></div>
      <button class="player-btn" id="player-play" title="${t('transport_play')}"><i class="fa-solid fa-play"></i></button>
      <button class="player-btn" id="player-stop" title="${t('transport_stop')}"><i class="fa-solid fa-stop"></i></button>
      <div class="player-time" id="player-time">0:00</div>
    </div>
  `
  const bpmEl  = body.querySelector('#player-bpm')
  const playEl = body.querySelector('#player-play')
  const stopEl = body.querySelector('#player-stop')
  const timeEl = body.querySelector('#player-time')

  // BPM — wheel or ↑/↓ to change the project tempo.
  const renderBpm = () => animateCount(bpmEl, getBpm(), { duration: 300 })
  bpmEl.textContent = getBpm()
  const offBpm = onBpmChange(renderBpm)
  bpmEl.addEventListener('wheel', e => { e.preventDefault(); setBpm(getBpm() + (e.deltaY < 0 ? 1 : -1)) }, { passive: false })
  bpmEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp')   { e.preventDefault(); setBpm(getBpm() + 1) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setBpm(getBpm() - 1) }
  })

  playEl.addEventListener('click', () => transportToggle())
  stopEl.addEventListener('click', () => transportStop())

  function onState(e) {
    const playing = !!e.detail.playing
    playEl.innerHTML = playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'
    playEl.classList.toggle('active', playing)
  }
  window.addEventListener('iceample-transport-state', onState)

  let rafId = 0
  const tick = () => { timeEl.textContent = fmt(getPosition()); rafId = requestAnimationFrame(tick) }
  rafId = requestAnimationFrame(tick)

  new MutationObserver((_, obs) => {
    if (!document.contains(body)) {
      window.removeEventListener('iceample-transport-state', onState)
      if (offBpm) offBpm()
      cancelAnimationFrame(rafId)
      obs.disconnect()
    }
  }).observe(document.body, { childList: true, subtree: true })
}
