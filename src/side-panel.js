// side-panel.js — The tools' side panels share one behaviour: drag the edge to
// resize, click the tab on the edge (or double-click the edge) to fold the
// panel away and give the whole width to the preview. Width and folded state
// are remembered per tool.
import { t } from './i18n.js'

function injectStyles() {
  if (document.getElementById('sp2-styles')) return
  const s = document.createElement('style'); s.id = 'sp2-styles'
  s.textContent = `
.sp2-rail { flex:0 0 7px; position:relative; z-index:4; cursor:col-resize; margin:0 -3px; touch-action:none; }
.sp2-rail::after { content:''; position:absolute; top:0; bottom:0; left:2.5px; width:2px; border-radius:1px; background:transparent; transition:background .15s; }
.sp2-rail:hover::after, .sp2-rail.drag::after { background:color-mix(in srgb, var(--color-active) 55%, transparent); }
.sp2-rail.folded { flex-basis:0; margin:0; cursor:default; }
.sp2-rail.folded::after { display:none; }
.sp2-tab { position:absolute; top:50%; transform:translateY(-50%); width:14px; height:40px; padding:0; border:1px solid var(--win-border); background:var(--surface); color:var(--text-secondary); font-size:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:.35; transition:opacity .15s, color .15s; }
.sp2-rail.right .sp2-tab { right:4px; border-radius:6px 0 0 6px; border-right:none; }
.sp2-rail.left .sp2-tab { left:4px; border-radius:0 6px 6px 0; border-left:none; }
.sp2-rail.folded.right .sp2-tab { right:0; }
.sp2-rail.folded.left .sp2-tab { left:0; }
.sp2-rail:hover .sp2-tab, .sp2-rail.folded .sp2-tab { opacity:1; }
.sp2-tab:hover { color:var(--color-active); }
.sp2-folded { display:none !important; }
`
  document.head.appendChild(s)
}

const KEY = id => 'iceample:panel:' + id
function load(id) { try { return JSON.parse(localStorage.getItem(KEY(id)) || '{}') || {} } catch { return {} } }
function save(id, st) { try { localStorage.setItem(KEY(id), JSON.stringify(st)) } catch {} }

/** Adds the resize edge + fold tab to `panel` (already in the DOM, inside a
 *  flex row). side: which side of the tool the panel sits on. */
export function enhanceSidePanel(panel, { id, side = 'right', min = 170, max = 560 } = {}) {
  if (!panel || !panel.parentNode || panel._sp2) return
  panel._sp2 = true
  injectStyles()
  const rail = document.createElement('div'); rail.className = 'sp2-rail ' + side
  const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'sp2-tab'
  rail.appendChild(tab)
  panel.parentNode.insertBefore(rail, side === 'right' ? panel : panel.nextSibling)
  const st = load(id)
  function apply() {
    panel.classList.toggle('sp2-folded', !!st.folded)
    rail.classList.toggle('folded', !!st.folded)
    if (st.w) {
      const w = Math.max(min, Math.min(max, st.w))
      panel.style.width = w + 'px'; panel.style.flex = '0 0 ' + w + 'px'
      panel.style.minWidth = '0'; panel.style.maxWidth = 'none'
    }
    const pointsRight = (side === 'right') !== !!st.folded
    tab.innerHTML = `<i class="fa-solid fa-chevron-${pointsRight ? 'right' : 'left'}"></i>`
    tab.title = t(st.folded ? 'panel_show' : 'panel_hide')
    rail.title = st.folded ? '' : t('panel_resize_hint')
  }
  const toggle = () => { st.folded = !st.folded; apply(); save(id, st) }
  tab.addEventListener('click', e => { e.stopPropagation(); toggle() })
  tab.addEventListener('pointerdown', e => e.stopPropagation())
  rail.addEventListener('dblclick', e => { if (!e.target.closest('.sp2-tab')) toggle() })
  rail.addEventListener('pointerdown', e => {
    if (e.button !== 0 || st.folded) return
    e.preventDefault()
    const x0 = e.clientX, w0 = panel.getBoundingClientRect().width
    rail.classList.add('drag')
    try { rail.setPointerCapture(e.pointerId) } catch {}
    const move = ev => {
      const dx = ev.clientX - x0
      st.w = Math.round(Math.max(min, Math.min(max, side === 'right' ? w0 - dx : w0 + dx)))
      apply()
    }
    const up = () => {
      rail.removeEventListener('pointermove', move); rail.removeEventListener('pointerup', up); rail.removeEventListener('pointercancel', up)
      rail.classList.remove('drag'); save(id, st)
    }
    rail.addEventListener('pointermove', move); rail.addEventListener('pointerup', up); rail.addEventListener('pointercancel', up)
  })
  apply()
}
