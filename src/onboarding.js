// onboarding.js — First-run guided tour. Three short steps introducing the
// workbench (click = tool menu), the command palette (Ctrl+K) and the quick
// dock. Shown once (localStorage flag); fully theme-driven; Escape or the
// skip button dismisses it for good.
import { t } from './i18n.js'

const FLAG = 'iceample:onboarded'

export function maybeShowOnboarding() {
  try { if (localStorage.getItem(FLAG) === '1') return } catch {}
  const steps = [
    { icon: 'fa-arrow-pointer',        title: t('ob_step1_t'), text: t('ob_step1') },
    { icon: 'fa-keyboard',             title: t('ob_step2_t'), text: t('ob_step2') },
    { icon: 'fa-grip',                 title: t('ob_step3_t'), text: t('ob_step3') },
  ]
  let idx = 0

  const ov = document.createElement('div')
  ov.id = 'onboarding-ov'
  ov.style.cssText = `position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;
    background:color-mix(in srgb, var(--workbench-bg) 55%, transparent);backdrop-filter:blur(2px)`

  const card = document.createElement('div')
  card.style.cssText = `width:380px;max-width:92vw;background:var(--surface);border:1px solid var(--win-border);
    border-radius:14px;padding:26px 28px 20px;box-shadow:0 24px 60px -20px rgba(0,0,0,.7);text-align:center;
    animation:pop-in .2s cubic-bezier(.2,.8,.2,1)`

  const icon = document.createElement('div')
  icon.style.cssText = 'font-size:30px;color:var(--color-active);margin-bottom:14px'
  const title = document.createElement('div')
  title.style.cssText = 'font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:8px'
  const text = document.createElement('div')
  text.style.cssText = 'font-size:12px;line-height:1.6;color:var(--text-secondary);min-height:44px'

  const dots = document.createElement('div')
  dots.style.cssText = 'display:flex;gap:6px;justify-content:center;margin:16px 0 14px'
  const dotEls = steps.map((_, i) => {
    const d = document.createElement('div')
    d.style.cssText = 'width:7px;height:7px;border-radius:50%;background:var(--win-border);transition:background .15s ease'
    dots.appendChild(d)
    return d
  })

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;justify-content:center'
  const skipBtn = document.createElement('button')
  skipBtn.textContent = t('ob_skip')
  skipBtn.style.cssText = 'border:1px solid var(--win-border);background:none;color:var(--text-secondary);border-radius:7px;padding:7px 14px;font-size:11px;font-family:inherit;cursor:pointer'
  const nextBtn = document.createElement('button')
  nextBtn.style.cssText = 'border:none;background:var(--btn-primary);color:var(--on-accent);border-radius:7px;padding:7px 18px;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer'
  row.append(skipBtn, nextBtn)

  card.append(icon, title, text, dots, row)
  ov.appendChild(card)

  function show(i) {
    idx = i
    icon.innerHTML = `<i class="fa-solid ${steps[i].icon}"></i>`
    title.textContent = steps[i].title
    text.textContent = steps[i].text
    dotEls.forEach((d, j) => { d.style.background = j === i ? 'var(--color-active)' : 'var(--win-border)' })
    nextBtn.textContent = i === steps.length - 1 ? t('ob_done') : t('ob_next')
  }
  function close() {
    try { localStorage.setItem(FLAG, '1') } catch {}
    ov.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }

  nextBtn.addEventListener('click', () => { idx < steps.length - 1 ? show(idx + 1) : close() })
  skipBtn.addEventListener('click', close)
  ov.addEventListener('click', e => { if (e.target === ov) close() })
  document.addEventListener('keydown', onKey, true)

  show(0)
  document.body.appendChild(ov)
}
