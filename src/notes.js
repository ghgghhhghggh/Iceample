// notes.js — Persistent notepad for Iceample v2
import { t } from './i18n.js'

function injectStyles() {
  if (document.getElementById('notes-styles')) return
  const s = document.createElement('style')
  s.id = 'notes-styles'
  s.textContent = `
.notes-wrap {
  display: flex; flex-direction: column; height: 100%; padding: 0;
}
.notes-textarea {
  flex: 1; width: 100%; background: transparent; border: none; outline: none;
  resize: none; color: var(--text-primary);
  font-family: 'Consolas','Monaco',monospace; font-size: 12px; line-height: 1.65;
  padding: 12px 14px;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.notes-textarea::placeholder { color: #333; }
.notes-footer {
  display: flex; align-items: center; justify-content: flex-end;
  padding: 4px 10px; border-top: 1px solid var(--win-border-in);
  font-size: 9px; color: var(--dim); gap: 8px; flex-shrink: 0;
}
.notes-saved {
  opacity: 0; transition: opacity 0.3s; color: #20be3c;
}
.notes-saved.show { opacity: 1; }
`
  document.head.appendChild(s)
}

const KEY = 'iceample:notes'

export function initNotes(body) {
  injectStyles()
  body.style.cssText = 'padding:0;overflow:hidden;'

  const wrap = document.createElement('div')
  wrap.className = 'notes-wrap'

  const textarea = document.createElement('textarea')
  textarea.className = 'notes-textarea'
  textarea.placeholder = ''
  textarea.value = localStorage.getItem(KEY) || ''
  textarea.spellcheck = false

  const footer = document.createElement('div')
  footer.className = 'notes-footer'

  const savedEl = document.createElement('span')
  savedEl.className = 'notes-saved'
  savedEl.innerHTML = `<i class="fa-solid fa-check"></i> ${t('notes_saved')}`

  const chars = document.createElement('span')
  chars.textContent = `${textarea.value.length} ${t('notes_chars')}`

  footer.appendChild(savedEl)
  footer.appendChild(chars)

  let timer = null
  textarea.addEventListener('input', () => {
    chars.textContent = `${textarea.value.length} ${t('notes_chars')}`
    clearTimeout(timer)
    timer = setTimeout(() => {
      localStorage.setItem(KEY, textarea.value)
      savedEl.classList.add('show')
      setTimeout(() => savedEl.classList.remove('show'), 1500)
    }, 400)
  })

  wrap.appendChild(textarea)
  wrap.appendChild(footer)
  body.appendChild(wrap)
  setTimeout(() => textarea.focus(), 60)
}
