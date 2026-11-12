// desktop-only.js — what the web version shows in place of a tool (or a
// feature) that needs native code: the reason, and where to get the desktop app.
import { t } from './i18n.js'

// Installer URL, set once in index.html. Empty = nothing to download yet → no link.
export function downloadUrl() {
  return document.querySelector('meta[name="iceample-download-url"]')?.content?.trim() || ''
}

// data-i18n lets applyTranslations() re-label it on language change.
export function downloadLink(cls = 'desktop-only-link') {
  const url = downloadUrl()
  if (!url) return null
  const a = document.createElement('a')
  a.className = cls
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener'
  a.innerHTML = '<i class="fa-solid fa-download"></i><span data-i18n="web_download_app"></span>'
  a.querySelector('span').textContent = t('web_download_app')
  return a
}

export function renderDesktopOnly(body) {
  body.innerHTML = '<div class="desktop-only"><i class="fa-solid fa-desktop desktop-only-icon"></i><p data-i18n="web_desktop_only"></p></div>'
  const wrap = body.firstElementChild
  wrap.querySelector('p').textContent = t('web_desktop_only')
  const link = downloadLink()
  if (link) wrap.appendChild(link)
}
