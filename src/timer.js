// timer.js — Chronomètre / Compte à rebours for Iceample v2
import { t } from './i18n.js'

function injectStyles() {
  if (document.getElementById('timer-styles')) return
  const s = document.createElement('style')
  s.id = 'timer-styles'
  s.textContent = `
.timer-wrap {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100%; gap: 14px; padding: 16px;
}
.timer-mode-row {
  display: flex; gap: 0; border: 1px solid var(--win-border); border-radius: 6px; overflow: hidden;
}
.timer-mode-btn {
  width: 36px; height: 30px; padding: 0; font-size: 14px;
  background: transparent; border: none; color: var(--text-secondary);
  cursor: pointer; font-family: inherit;
  display: flex; align-items: center; justify-content: center;
}
.timer-mode-btn.active {
  background: color-mix(in srgb, var(--color-active) 18%, #000);
  color: var(--color-active);
}
.timer-display {
  font-size: 54px; font-weight: 800; letter-spacing: -2px;
  color: var(--text-primary); font-variant-numeric: tabular-nums;
  line-height: 1;
}
.timer-display.running { color: var(--color-active); }
.timer-display.finished { color: #dc281e; }
.timer-milliseconds {
  font-size: 20px; font-weight: 600; color: var(--text-secondary);
  font-variant-numeric: tabular-nums; letter-spacing: -1px;
}
.timer-btns {
  display: flex; gap: 8px;
}
.timer-btn {
  width: 44px; height: 34px; border-radius: 6px;
  background: #1a1a1a; border: 1px solid var(--win-border);
  color: var(--text-secondary); font-size: 15px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.12s;
}
.timer-btn:hover { background: #242424; color: var(--text-primary); }
.timer-btn.primary {
  background: color-mix(in srgb, var(--color-active) 15%, #000);
  border-color: var(--color-active); color: var(--color-active);
}
.timer-btn.primary:hover {
  background: color-mix(in srgb, var(--color-active) 25%, #000);
}
.timer-countdown-setup {
  display: flex; align-items: center; gap: 6px;
}
.timer-cd-inp {
  width: 48px; background: #161616; border: 1px solid var(--win-border);
  border-radius: 5px; color: var(--text-primary); font-size: 18px;
  font-family: inherit; font-weight: 700; text-align: center;
  padding: 4px 0; outline: none;
}
.timer-cd-inp:focus { border-color: var(--color-active); }
.timer-cd-sep { font-size: 22px; font-weight: 700; color: var(--dim); }
.timer-cd-label { font-size: 10px; color: var(--dim); letter-spacing: 0.06em; }
`
  document.head.appendChild(s)
}

export function initTimer(body) {
  injectStyles()
  body.style.padding = '0'

  let mode = 'chrono' // 'chrono' | 'countdown'
  let running = false
  let startTime = 0
  let elapsed = 0
  let countdownMs = 0
  let rafId = null

  const wrap = document.createElement('div')
  wrap.className = 'timer-wrap'
  body.appendChild(wrap)

  // Mode toggle
  const modeRow = document.createElement('div')
  modeRow.className = 'timer-mode-row'
  const btnChrono = document.createElement('button')
  btnChrono.className = 'timer-mode-btn active'
  btnChrono.innerHTML = '<i class="fa-solid fa-stopwatch"></i>'
  btnChrono.title = t('timer_chrono')
  const btnCountdown = document.createElement('button')
  btnCountdown.className = 'timer-mode-btn'
  btnCountdown.innerHTML = '<i class="fa-solid fa-hourglass-half"></i>'
  btnCountdown.title = t('timer_countdown')
  modeRow.appendChild(btnChrono); modeRow.appendChild(btnCountdown)
  wrap.appendChild(modeRow)

  // Display
  const display = document.createElement('div')
  display.className = 'timer-display'
  display.textContent = '00:00'
  wrap.appendChild(display)

  const ms = document.createElement('div')
  ms.className = 'timer-milliseconds'
  ms.textContent = '.000'
  ms.style.display = 'none'   // the rapidly-scrolling ms line was distracting → hidden
  wrap.appendChild(ms)

  // Countdown setup (hidden initially)
  const cdSetup = document.createElement('div')
  cdSetup.className = 'timer-countdown-setup'
  cdSetup.style.display = 'none'

  const cdH = document.createElement('input')
  cdH.className = 'timer-cd-inp'; cdH.value = '0'
  const sep1 = document.createElement('span'); sep1.className = 'timer-cd-sep'; sep1.textContent = ':'
  const cdM = document.createElement('input')
  cdM.className = 'timer-cd-inp'; cdM.value = '5'
  const sep2 = document.createElement('span'); sep2.className = 'timer-cd-sep'; sep2.textContent = ':'
  const cdS = document.createElement('input')
  cdS.className = 'timer-cd-inp'; cdS.value = '0'

  // Natural time entry: one click on a field zeroes the fields to its LEFT and
  // lets you type H→M→S continuously (auto-advance on 2 digits or ":" / space).
  const cdInputs = [cdH, cdM, cdS]
  const cdMax    = [23, 59, 59]
  cdInputs.forEach((inp, i) => {
    inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 2; inp.autocomplete = 'off'
    // Zero the fields to the left only on a real click (not on auto-advance/Tab).
    inp.addEventListener('mousedown', () => { for (let k = 0; k < i; k++) cdInputs[k].value = '0' })
    inp.addEventListener('focus', () => inp.select())
    inp.addEventListener('input', () => {
      let v = inp.value.replace(/\D/g, '').slice(0, 2)
      if (v !== '') v = String(Math.min(parseInt(v, 10), cdMax[i]))
      inp.value = v
      if (inp.value.length >= 2 && i < cdInputs.length - 1) cdInputs[i + 1].focus()
    })
    inp.addEventListener('keydown', e => {
      if ((e.key === ':' || e.key === '.' || e.key === ' ' || e.key === 'Enter') && i < cdInputs.length - 1) {
        e.preventDefault(); cdInputs[i + 1].focus()
      }
    })
  })

  cdSetup.appendChild(cdH); cdSetup.appendChild(sep1); cdSetup.appendChild(cdM)
  cdSetup.appendChild(sep2); cdSetup.appendChild(cdS)
  wrap.appendChild(cdSetup)

  // Buttons
  const btns = document.createElement('div')
  btns.className = 'timer-btns'

  const btnPlay = document.createElement('button')
  btnPlay.className = 'timer-btn primary'
  btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'

  const btnReset = document.createElement('button')
  btnReset.className = 'timer-btn'
  btnReset.innerHTML = '<i class="fa-solid fa-rotate-left"></i>'

  btns.appendChild(btnPlay); btns.appendChild(btnReset)
  wrap.appendChild(btns)

  function getCountdownMs() {
    return (parseInt(cdH.value)||0) * 3600000
         + (parseInt(cdM.value)||0) * 60000
         + (parseInt(cdS.value)||0) * 1000
  }

  function formatTime(totalMs) {
    const absMs = Math.abs(totalMs)
    const h = Math.floor(absMs / 3600000)
    const m = Math.floor((absMs % 3600000) / 60000)
    const s = Math.floor((absMs % 60000) / 1000)
    const millis = absMs % 1000
    const prefix = totalMs < 0 ? '−' : ''
    const hStr = h > 0 ? String(h).padStart(2,'0') + ':' : ''
    return {
      main: prefix + hStr + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0'),
      millis: '.' + String(millis).padStart(3,'0'),
    }
  }

  function tick() {
    const now = performance.now()
    let current

    if (mode === 'chrono') {
      current = elapsed + (running ? now - startTime : 0)
    } else {
      const remaining = countdownMs - (elapsed + (running ? now - startTime : 0))
      current = remaining

      if (remaining <= 0 && running) {
        running = false
        cancelAnimationFrame(rafId)
        display.className = 'timer-display finished'
        btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
        btnPlay.classList.remove('primary')
        const { main, millis: mil } = formatTime(0)
        display.textContent = main; ms.textContent = mil
        return
      }
    }

    const { main, millis: mil } = formatTime(current)
    display.textContent = main; ms.textContent = mil

    if (running) rafId = requestAnimationFrame(tick)
  }

  function start() {
    if (mode === 'countdown' && elapsed === 0) {
      countdownMs = getCountdownMs()
      if (countdownMs <= 0) return
    }
    running = true
    startTime = performance.now()
    display.className = 'timer-display running'
    btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>'
    rafId = requestAnimationFrame(tick)
  }

  function pause() {
    elapsed += performance.now() - startTime
    running = false
    cancelAnimationFrame(rafId)
    display.className = 'timer-display'
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
  }

  function reset() {
    running = false; elapsed = 0; countdownMs = 0
    cancelAnimationFrame(rafId)
    display.className = 'timer-display'
    btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>'
    btnPlay.classList.add('primary')
    const { main, millis: mil } = formatTime(0)
    display.textContent = main; ms.textContent = mil
  }

  btnPlay.addEventListener('click', () => { running ? pause() : start() })
  btnReset.addEventListener('click', reset)

  btnChrono.addEventListener('click', () => {
    if (mode === 'chrono') return
    mode = 'chrono'; reset()
    btnChrono.classList.add('active'); btnCountdown.classList.remove('active')
    cdSetup.style.display = 'none'
  })
  btnCountdown.addEventListener('click', () => {
    if (mode === 'countdown') return
    mode = 'countdown'; reset()
    btnCountdown.classList.add('active'); btnChrono.classList.remove('active')
    cdSetup.style.display = 'flex'; ms.style.display = 'none'
  })

  // Init display
  const { main: m0, millis: ms0 } = formatTime(0)
  display.textContent = m0; ms.textContent = ms0

  const obs = new MutationObserver(() => {
    if (!document.contains(body)) {
      running = false; cancelAnimationFrame(rafId)
      obs.disconnect()
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
