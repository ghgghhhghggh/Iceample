// rename-dialog.js — small modal to (optionally) rename a sample before saving.
import { t } from './i18n.js'

function injectStyles() {
  if (document.getElementById('rename-dialog-styles')) return
  const s = document.createElement('style')
  s.id = 'rename-dialog-styles'
  s.textContent = `
.rnd-overlay { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.5); backdrop-filter:blur(2px); animation:rnd-fade .12s ease; }
@keyframes rnd-fade { from{opacity:0} to{opacity:1} }
.rnd-card { width:300px; max-width:88vw; background:#16161a; border:1px solid var(--win-border,#2c2c2e);
  border-radius:10px; box-shadow:0 16px 48px rgba(0,0,0,0.6); padding:16px; display:flex; flex-direction:column; gap:12px;
  animation:rnd-pop .14s cubic-bezier(.2,.9,.3,1.2); }
@keyframes rnd-pop { from{transform:scale(.94);opacity:0} to{transform:scale(1);opacity:1} }
.rnd-title { font-size:12px; font-weight:700; letter-spacing:0.04em; color:var(--text-primary,#fff);
  display:flex; align-items:center; gap:8px; }
.rnd-title i { color:var(--color-active,#4a9eff); }
.rnd-input { background:#0e0e10; border:1px solid var(--win-border,#2a2a2a); border-radius:6px;
  color:var(--text-primary,#fff); font-family:inherit; font-size:13px; padding:8px 10px; outline:none; }
.rnd-input:focus { border-color:var(--color-active,#4a9eff); }
.rnd-row { display:flex; gap:8px; justify-content:flex-end; }
.rnd-btn { font-family:inherit; font-size:11px; padding:7px 14px; border-radius:6px; cursor:pointer;
  border:1px solid var(--win-border,#2a2a2a); background:#1c1c20; color:var(--text-secondary,#aaa);
  transition:background .1s,color .1s; }
.rnd-btn:hover { background:#26262c; color:var(--text-primary,#fff); }
.rnd-btn.primary { background:var(--color-active,#4a9eff); border-color:var(--color-active,#4a9eff); color:#fff; font-weight:600; }
.rnd-btn.primary:hover { filter:brightness(1.1); }
  `
  document.head.appendChild(s)
}

// Sanitize a filename base (no extension): strip path/illegal chars.
export function sanitizeName(s) {
  return (s || '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60)
}

/**
 * Show a small modal pre-filled with `defaultBase` so the user can rename the
 * sample if desired. Resolves with the chosen (sanitized) base name; on
 * cancel/escape it resolves with the default so a recording is never lost.
 * With opts.cancelable, escape/cancel/backdrop resolve null instead (for
 * data-creating flows where cancel must really cancel).
 */
export function promptName(defaultBase, opts = {}) {
  injectStyles()
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'rnd-overlay'
    const card = document.createElement('div')
    card.className = 'rnd-card'

    const title = document.createElement('div')
    title.className = 'rnd-title'
    title.innerHTML = `<i class="fa-solid fa-floppy-disk"></i><span></span>`
    title.querySelector('span').textContent = opts.title || t('rename_title')

    const input = document.createElement('input')
    input.className = 'rnd-input'
    input.type = 'text'; input.maxLength = 60
    input.value = defaultBase || ''

    const row = document.createElement('div')
    row.className = 'rnd-row'
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'rnd-btn'; cancelBtn.textContent = opts.cancelable ? t('confirm_cancel') : t('rename_keep')
    const okBtn = document.createElement('button')
    okBtn.className = 'rnd-btn primary'; okBtn.textContent = t('rename_save')

    row.append(cancelBtn, okBtn)
    card.append(title, input, row)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    input.focus(); input.select()

    let done = false
    function finish(val) {
      if (done) return
      done = true
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      // Cancel paths pass null: cancelable callers get null back, the
      // legacy contract falls through to the default name.
      if (val === null && opts.cancelable) { resolve(null); return }
      resolve(sanitizeName(val) || sanitizeName(defaultBase) || defaultBase)
    }
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); finish(input.value) }
      else if (e.key === 'Escape') { e.preventDefault(); finish(null) }
    }
    document.addEventListener('keydown', onKey, true)
    okBtn.addEventListener('click', () => finish(input.value))
    cancelBtn.addEventListener('click', () => finish(null))
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) finish(null) })
  })
}

/**
 * Simple info dialog with a single OK button. Resolves when dismissed.
 */
export function showInfo(title, message) {
  injectStyles()
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'rnd-overlay'
    const card = document.createElement('div')
    card.className = 'rnd-card'

    const titleEl = document.createElement('div')
    titleEl.className = 'rnd-title'
    titleEl.innerHTML = `<i class="fa-solid fa-circle-info"></i><span></span>`
    titleEl.querySelector('span').textContent = title || ''

    const msg = document.createElement('div')
    msg.style.cssText = 'font-size:11px;color:var(--text-secondary,#aaa);line-height:1.5;white-space:pre-line;'
    msg.textContent = message || ''

    const row = document.createElement('div')
    row.className = 'rnd-row'
    const okBtn = document.createElement('button')
    okBtn.className = 'rnd-btn primary'; okBtn.textContent = 'OK'

    row.append(okBtn)
    card.append(titleEl, msg, row)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    okBtn.focus()

    let done = false
    function finish() {
      if (done) return
      done = true
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve()
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); finish() }
    }
    document.addEventListener('keydown', onKey, true)
    okBtn.addEventListener('click', finish)
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) finish() })
  })
}

/**
 * Classic "unsaved changes" confirmation before closing.
 * Resolves with 'save', 'discard' or 'cancel'.
 */
export function confirmUnsaved(opts = {}) {
  injectStyles()
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'rnd-overlay'
    const card = document.createElement('div')
    card.className = 'rnd-card'

    const title = document.createElement('div')
    title.className = 'rnd-title'
    title.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span></span>`
    title.querySelector('span').textContent = opts.title || t('confirm_close_title')

    const msg = document.createElement('div')
    msg.style.cssText = 'font-size:11px;color:var(--text-secondary,#aaa);line-height:1.4;'
    msg.textContent = opts.message || t('confirm_close_msg')

    const row = document.createElement('div')
    row.className = 'rnd-row'
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'rnd-btn'; cancelBtn.textContent = t('confirm_cancel')
    const discardBtn = document.createElement('button')
    discardBtn.className = 'rnd-btn'; discardBtn.textContent = t('confirm_discard')
    const saveBtn = document.createElement('button')
    saveBtn.className = 'rnd-btn primary'; saveBtn.textContent = opts.saveLabel || t('confirm_save_close')

    row.append(cancelBtn, discardBtn, saveBtn)
    card.append(title, msg, row)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    saveBtn.focus()

    let done = false
    function finish(val) {
      if (done) return
      done = true
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve(val)
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish('cancel') }
      else if (e.key === 'Enter') { e.preventDefault(); finish('save') }
    }
    document.addEventListener('keydown', onKey, true)
    saveBtn.addEventListener('click', () => finish('save'))
    discardBtn.addEventListener('click', () => finish('discard'))
    cancelBtn.addEventListener('click', () => finish('cancel'))
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) finish('cancel') })
  })
}
