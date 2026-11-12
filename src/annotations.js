// annotations.js — global toggle for button hint tooltips.
// When ON, every element keeps its native `title` (hover hint). When OFF, the
// title text is stashed in `data-hint` and the `title` removed so no tooltip
// shows. A MutationObserver keeps dynamically-created buttons consistent.

const KEY = 'iceample:display:hints'
let _on = (() => { try { return localStorage.getItem(KEY) !== 'false' } catch { return true } })()  // default ON

function applyTo(el) {
  if (!(el instanceof Element)) return
  if (_on) {
    // Restore the title from the stash if it was stripped.
    const h = el.getAttribute('data-hint')
    if (h != null && h !== '' && !el.getAttribute('title')) el.setAttribute('title', h)
  } else {
    // Stash the title and remove it so no native tooltip appears.
    const t = el.getAttribute('title')
    if (t != null && t !== '') { el.setAttribute('data-hint', t); el.removeAttribute('title') }
  }
}

function sweep(root) {
  if (!(root instanceof Element)) return
  applyTo(root)
  root.querySelectorAll('[title], [data-hint]').forEach(applyTo)
}

let _observer = null

export function initAnnotations() {
  if (_observer) return
  sweep(document.body)
  _observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'attributes' && m.attributeName === 'title') applyTo(m.target)
      else for (const n of m.addedNodes) if (n.nodeType === 1) sweep(n)
    }
  })
  _observer.observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['title'],
  })
}

export function setAnnotations(on) {
  _on = !!on
  try { localStorage.setItem(KEY, _on ? 'true' : 'false') } catch {}
  sweep(document.body)
}

export function getAnnotations() { return _on }
