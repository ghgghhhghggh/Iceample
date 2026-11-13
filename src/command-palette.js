// command-palette.js — Ctrl+K palette over the command registry.
import { t } from './i18n.js'
import { getCommands } from './commands.js'
import { getShortcut, formatBinding } from './shortcuts.js'
import { animateListIn } from './rb-effects.js'

function injectStyles() {
  if (document.getElementById('cmdk-styles')) return
  const s = document.createElement('style')
  s.id = 'cmdk-styles'
  s.textContent = `
.cmdk-overlay { position:fixed; inset:0; z-index:10001; display:flex; align-items:flex-start; justify-content:center;
  padding-top:12vh; background:rgba(0,0,0,0.45); backdrop-filter:blur(2px); animation:cmdk-fade .1s ease; }
@keyframes cmdk-fade { from{opacity:0} to{opacity:1} }
.cmdk-card { width:560px; max-width:92vw; max-height:64vh; display:flex; flex-direction:column; overflow:hidden;
  background:var(--surface); border:1px solid var(--win-border,#2c2c2e); border-radius:12px;
  box-shadow:0 24px 64px rgba(0,0,0,0.6); animation:cmdk-pop .12s cubic-bezier(.2,.9,.3,1.15); }
@keyframes cmdk-pop { from{transform:translateY(-8px) scale(.985);opacity:0} to{transform:none;opacity:1} }
.cmdk-search { border:none; outline:none; background:transparent; color:var(--text-primary,#fff);
  font-family:inherit; font-size:15px; padding:15px 16px; border-bottom:1px solid var(--win-border,#242426); }
.cmdk-search::placeholder { color:var(--text-secondary); }
.cmdk-list { overflow-y:auto; padding:6px; }
.cmdk-row { display:flex; align-items:center; gap:11px; padding:9px 11px; border-radius:7px; cursor:pointer; }
.cmdk-row.sel { background:color-mix(in srgb, var(--color-active,#4a9eff) 16%, transparent); }
.cmdk-row > i { width:15px; text-align:center; font-size:12px; color:var(--color-active,#4a9eff); flex-shrink:0; }
.cmdk-ttl { flex:1; color:var(--text-primary,#eee); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cmdk-cat { font-size:9px; letter-spacing:0.06em; text-transform:uppercase; color:var(--text-secondary); flex-shrink:0; }
.cmdk-kbd { font-size:10px; color:var(--text-secondary); background:var(--surface2); border:1px solid var(--win-border); border-radius:4px;
  padding:2px 6px; font-variant-numeric:tabular-nums; flex-shrink:0; min-width:22px; text-align:center; }
.cmdk-empty { padding:24px; text-align:center; color:var(--text-secondary); font-size:12px; }
  `
  document.head.appendChild(s)
}

const _norm = s => {
  const r = (s || '').toLowerCase().normalize('NFD')
  let out = ''
  for (let i = 0; i < r.length; i++) { const c = r.charCodeAt(i); if (c < 0x300 || c > 0x36f) out += r[i] }
  return out
}

let _open = false

export function openCommandPalette() {
  if (_open) return
  _open = true
  injectStyles()

  // Snapshot + resolve commands once per open (fresh i18n + bindings).
  const cmds = getCommands().map(c => {
    const title   = c.titleKey ? t(c.titleKey) : (c.title || c.id)
    const cat     = c.category ? t(c.category) : ''
    const binding = c.shortcutAction ? formatBinding(getShortcut(c.shortcutAction)) : ''
    return { cmd: c, title, cat, icon: c.icon || 'fa-solid fa-circle-chevron-right',
      kbd: binding && binding !== '—' ? binding : '',
      hay: _norm([title, cat, c.keywords].filter(Boolean).join(' ')) }
  }).sort((a, b) => (a.cat + a.title).localeCompare(b.cat + b.title))

  const overlay = document.createElement('div')
  overlay.className = 'cmdk-overlay'
  const card = document.createElement('div')
  card.className = 'cmdk-card'
  const input = document.createElement('input')
  input.className = 'cmdk-search'; input.type = 'text'
  input.placeholder = t('cmd_palette_placeholder')
  const list = document.createElement('div')
  list.className = 'cmdk-list'
  card.append(input, list)
  overlay.appendChild(card)
  document.body.appendChild(overlay)
  input.focus()

  let filtered = cmds
  let sel = 0

  function close() {
    if (!_open) return
    _open = false
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  function execIndex(i) {
    const item = filtered[i]
    if (!item) return
    close()
    try { item.cmd.run() } catch (e) { console.error('command failed:', item.cmd.id, e) }
  }
  function render() {
    list.innerHTML = ''
    if (!filtered.length) {
      const e = document.createElement('div')
      e.className = 'cmdk-empty'; e.textContent = t('cmd_palette_empty')
      list.appendChild(e); return
    }
    filtered.forEach((item, i) => {
      const row = document.createElement('div')
      row.className = 'cmdk-row' + (i === sel ? ' sel' : '')
      row.innerHTML =
        `<i class="${item.icon}"></i>` +
        `<span class="cmdk-ttl"></span>` +
        (item.cat ? `<span class="cmdk-cat"></span>` : '') +
        (item.kbd ? `<span class="cmdk-kbd"></span>` : '')
      row.querySelector('.cmdk-ttl').textContent = item.title
      if (item.cat) row.querySelector('.cmdk-cat').textContent = item.cat
      if (item.kbd) row.querySelector('.cmdk-kbd').textContent = item.kbd
      row.addEventListener('mousemove', () => { if (sel !== i) { sel = i; render() } })
      row.addEventListener('click', () => execIndex(i))
      list.appendChild(row)
    })
    const selEl = list.children[sel]
    if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: 'nearest' })
  }
  function applyFilter() {
    const q = _norm(input.value.trim())
    const toks = q ? q.split(/\s+/) : []
    filtered = toks.length ? cmds.filter(c => toks.every(tk => c.hay.includes(tk))) : cmds
    sel = 0
    render()
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (filtered.length) { sel = (sel + 1) % filtered.length; render() } }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); if (filtered.length) { sel = (sel - 1 + filtered.length) % filtered.length; render() } }
    else if (e.key === 'Enter')     { e.preventDefault(); execIndex(sel) }
  }

  input.addEventListener('input', applyFilter)
  document.addEventListener('keydown', onKey, true)
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close() })
  render()
  animateListIn(list)   // staggered entrance (rb-effects)
}
