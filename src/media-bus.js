// media-bus.js — Image/video "wires" between tools, mirroring the audio bus
// idea: any tool can hand its result to any other tool of the same domain
// (and a few cross-domain targets) without going through a file on disk.
//
// Flow: a sender calls showSendMenu(anchor, () => media) → the user picks a
// target → sendMedia() fires `iceample-send-media` on window → main.js (which
// owns the open/close machinery) opens/focuses the target window and dispatches
// `iceample-media` on its .tool-win-body → the target's init-registered
// listener consumes it. Media shapes:
//   { kind: 'image', dataUrl, name }
//   { kind: 'video', path?, blob?, name }   (path in Tauri, blob in browser)
import { t } from './i18n.js'

// Tools that can RECEIVE an image (menu order). `self` is filtered out by the
// sender so a tool never lists itself.
export const IMAGE_TARGETS = [
  { id: 'imgedit',   labelKey: 'tool_imgedit',   icon: 'fa-crop-simple' },
  { id: 'effects',   labelKey: 'tool_effects',   icon: 'fa-wand-sparkles' },
  { id: 'moodboard', labelKey: 'tool_moodboard', icon: 'fa-images' },
  { id: 'watermark', labelKey: 'tool_watermark', icon: 'fa-droplet' },
  { id: 'palettes',  labelKey: 'tool_palettes',  icon: 'fa-palette' },
  { id: 'tool3d',    labelKey: 'tool_3d',        icon: 'fa-cube' },
]

export const VIDEO_TARGETS = [
  { id: 'subtitles', labelKey: 'tool_subtitles', icon: 'fa-closed-captioning' },
  { id: 'videorec',  labelKey: 'tool_videocut',  icon: 'fa-clapperboard' },
]

/** Ship media to a tool (opens/focuses it first). Handled in main.js. */
export function sendMedia(toolId, media) {
  window.dispatchEvent(new CustomEvent('iceample-send-media', { detail: { toolId, media } }))
}

/**
 * Standard "send to…" popup. `getMedia` is called lazily on pick (so senders
 * only rasterize their canvas when actually needed) and may return a Promise.
 * opts: { self: toolIdToExclude, targets: IMAGE_TARGETS|VIDEO_TARGETS }
 */
export function showSendMenu(anchor, getMedia, opts = {}) {
  document.getElementById('media-send-menu')?.remove()
  const targets = (opts.targets || IMAGE_TARGETS).filter(t2 => t2.id !== opts.self)
  const pop = document.createElement('div')
  pop.id = 'media-send-menu'
  pop.style.cssText = 'position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--win-border);border-radius:10px;padding:4px;min-width:170px;box-shadow:0 10px 28px -10px rgba(0,0,0,.6)'
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close() } }
  const onDoc = () => close()
  const close = () => { pop.remove(); document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey, true) }
  const head = document.createElement('div')
  head.style.cssText = 'font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-secondary);padding:5px 10px 4px'
  head.textContent = t('send_to')
  pop.appendChild(head)
  targets.forEach(tg => {
    const b = document.createElement('button')
    b.className = 'ctx-item'
    b.innerHTML = `<i class="fa-solid ${tg.icon}"></i><span></span>`
    b.querySelector('span').textContent = t(tg.labelKey)
    b.addEventListener('click', async e => {
      e.stopPropagation(); close()
      try {
        const media = await getMedia(tg.id)
        if (media) sendMedia(tg.id, media)
      } catch { window.toast?.(t('send_fail'), 'error') }
    })
    pop.appendChild(b)
  })
  document.body.appendChild(pop)
  const r = anchor.getBoundingClientRect()
  pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px'
  let top = r.bottom + 5
  if (top + pop.offsetHeight > window.innerHeight - 6) top = Math.max(6, r.top - pop.offsetHeight - 5)
  pop.style.top = top + 'px'
  setTimeout(() => { document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey, true) }, 0)
}

/** Sender-side helper: standard toolbar button that opens the send menu. */
export function makeSendButton(getMedia, opts = {}) {
  const b = document.createElement('button')
  b.className = opts.className ?? 'ie-btn'
  b.title = t('send_to')
  b.innerHTML = `<i class="fa-solid fa-share-nodes"></i>${opts.iconOnly ? '' : ' <span></span>'}`
  if (!opts.iconOnly) b.querySelector('span').textContent = t('send_to')
  b.addEventListener('click', e => { e.stopPropagation(); showSendMenu(b, getMedia, opts) })
  return b
}

/** Receiver-side helper: canvas/Image → dataURL image media. */
export function imageMedia(source, name) {
  const dataUrl = source instanceof HTMLCanvasElement ? source.toDataURL('image/png') : String(source)
  return { kind: 'image', dataUrl, name: name || 'image' }
}
