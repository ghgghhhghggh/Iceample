// palettes.js — Colour palettes tool. Create palettes, add/remove swatches,
// extract a palette from an image, generate a harmony from a base colour, and
// click any swatch to copy its hex. Palettes persist in localStorage and are
// meant to be reused across tools (image editor brush, 3D materials, …).
import { t } from './i18n.js'
import { promptName } from './rename-dialog.js'

const LS = 'iceample:palettes'
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) } catch { return null } }
const persistRaw = p => { try { localStorage.setItem(LS, JSON.stringify(p)) } catch {} }

export function showPalPicker(anchor, onPick) {
  document.getElementById('pal-pp')?.remove()
  const pals = (load() || []).filter(p => p.colors?.length)
  const pop = document.createElement('div'); pop.id = 'pal-pp'
  pop.style.cssText = 'position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--win-border);border-radius:8px;display:flex;width:248px;max-height:220px;box-shadow:0 8px 24px rgba(0,0,0,.6);overflow:hidden'
  const onDocClick = () => close()
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }
  const close = () => { pop.remove(); document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey, true) }
  if (!pals.length) {
    pop.style.width = 'auto'
    const empty = document.createElement('div')
    empty.style.cssText = 'padding:10px 14px;font-size:11px;color:var(--text-secondary);white-space:nowrap'
    empty.textContent = t('pal_empty')
    pop.appendChild(empty)
  } else {
    const left = document.createElement('div')
    left.style.cssText = 'width:88px;flex-shrink:0;overflow-y:auto;border-right:1px solid var(--win-border-in);padding:4px'
    const right = document.createElement('div')
    right.style.cssText = 'flex:1;overflow-y:auto;padding:6px;display:flex;flex-wrap:wrap;align-content:start;gap:3px'
    const showPal = (pal, btn) => {
      right.innerHTML = ''
      left.querySelectorAll('button').forEach(b => { b.style.background = 'none'; b.style.color = 'var(--text-secondary)' })
      btn.style.background = 'rgba(255,255,255,.07)'; btn.style.color = 'var(--text-primary)'
      pal.colors.forEach(c => {
        const s = document.createElement('button')
        s.title = c; s.style.cssText = `width:18px;height:18px;border-radius:4px;border:1px solid rgba(255,255,255,.14);background:${c};cursor:pointer;padding:0;flex-shrink:0`
        s.addEventListener('click', e => { e.stopPropagation(); onPick(c); close() })
        right.appendChild(s)
      })
    }
    pals.forEach((pal, i) => {
      const btn = document.createElement('button')
      btn.textContent = pal.name
      btn.style.cssText = 'width:100%;text-align:left;padding:4px 6px;border:none;border-radius:4px;background:none;color:var(--text-secondary);font-size:10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;font-family:inherit'
      btn.addEventListener('mouseenter', () => showPal(pal, btn))
      btn.addEventListener('click', e => e.stopPropagation())
      left.appendChild(btn)
      if (i === 0) showPal(pal, btn)
    })
    pop.append(left, right)
  }
  document.body.appendChild(pop)
  const r = anchor.getBoundingClientRect()
  pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - pop.offsetWidth - 10)) + 'px'
  let top = r.bottom + 5
  if (top + pop.offsetHeight > window.innerHeight - 6) top = Math.max(6, r.top - pop.offsetHeight - 5)
  pop.style.top = top + 'px'
  setTimeout(() => { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onKey, true) }, 0)
}

function injectStyles() {
  if (document.getElementById('pal-styles')) return
  const s = document.createElement('style'); s.id = 'pal-styles'
  s.textContent = `
.pal-body { display:flex; flex-direction:column; height:100%; background:var(--surface); padding:0; overflow:hidden; }
.pal-bar { display:flex; align-items:center; gap:6px; padding:8px 10px; border-bottom:1px solid var(--win-border-in,#1e1e1e); flex-wrap:wrap; flex-shrink:0; }
.pal-btn { display:flex; align-items:center; gap:6px; height:28px; padding:0 10px; border:1px solid var(--win-border,#2a2a2a); background:color-mix(in srgb,var(--text-primary) 7%,var(--surface)); color:var(--text-secondary,#aaa); border-radius:6px; font-family:inherit; font-size:11px; cursor:pointer; }
.pal-btn:hover { background:color-mix(in srgb,var(--text-primary) 13%,var(--surface)); color:var(--text-primary,#fff); }
.pal-color { width:30px; height:28px; padding:0; border:1px solid var(--win-border,#2a2a2a); border-radius:6px; background:none; cursor:pointer; }
.pal-list { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:10px; }
.pal-card { border:1px solid var(--win-border-in,#1e1e1e); border-radius:9px; background:color-mix(in srgb,var(--text-primary) 5%,var(--surface)); padding:9px 10px; }
.pal-card-h { display:flex; align-items:center; gap:8px; margin-bottom:9px; }
.pal-card-h .nm { flex:1; font-size:12px; font-weight:600; color:var(--text-primary,#eee); cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pal-card-h .act { opacity:.5; cursor:pointer; font-size:12px; }
.pal-card-h .act:hover { opacity:1; }
.pal-card-h .act.del:hover { color:#ff6a6a; }
.pal-swatches { display:flex; flex-wrap:wrap; gap:6px; }
.pal-sw { width:34px; height:34px; border-radius:7px; border:1px solid rgba(255,255,255,.14); cursor:pointer; position:relative; transition:transform .1s; }
.pal-sw:hover { transform:scale(1.08); }
.pal-sw .x { position:absolute; top:-5px; right:-5px; width:15px; height:15px; border-radius:50%; background:#222; color:#fff; font-size:9px; display:none; align-items:center; justify-content:center; border:1px solid #444; }
.pal-sw:hover .x { display:flex; }
.pal-sw .e { position:absolute; top:-5px; left:-5px; width:15px; height:15px; border-radius:50%; background:#222; color:#fff; font-size:7px; display:none; align-items:center; justify-content:center; border:1px solid #444; }
.pal-sw:hover .e { display:flex; }
.pal-sw .rp { position:absolute; bottom:-5px; left:-5px; width:15px; height:15px; border-radius:50%; background:#222; color:#fff; font-size:7px; display:none; align-items:center; justify-content:center; border:1px solid #444; }
.pal-sw:hover .rp { display:flex; }
.pal-contrast { border-bottom:1px solid var(--win-border-in,#1e1e1e); flex-shrink:0; }
.pal-contrast-h { display:flex; align-items:center; gap:7px; padding:7px 12px; cursor:pointer; font-size:11px; color:var(--text-secondary,#aaa); user-select:none; }
.pal-contrast-h:hover { color:var(--text-primary,#eee); }
.pal-contrast-h .chev { font-size:9px; transition:transform .15s; }
.pal-contrast.open .chev { transform:rotate(90deg); }
.pal-contrast-body { display:none; padding:0 12px 10px; flex-direction:column; gap:7px; }
.pal-contrast.open .pal-contrast-body { display:flex; }
.pal-contrast-row { display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-secondary,#aaa); flex-wrap:wrap; }
.pal-badge { font-size:9px; padding:2px 7px; border-radius:99px; border:1px solid transparent; font-weight:600; }
.pal-contrast-ratio { font-size:15px; font-weight:700; color:var(--text-primary,#eee); }
.pal-contrast-hint { font-size:10px; color:var(--text-secondary,#5f6068); font-style:italic; }
.pal-add { width:34px; height:34px; border-radius:7px; border:1px dashed var(--win-border,#3a3a3a); background:none; color:#888; cursor:pointer; font-size:14px; }
.pal-add:hover { color:var(--color-active,#4a9eff); border-color:var(--color-active,#4a9eff); }
.pal-hex { width:72px; height:34px; border-radius:7px; border:1px dashed var(--win-border,#3a3a3a); background:none; color:var(--text-primary,#eee); font-family:inherit; font-size:10px; text-align:center; outline:none; padding:0 4px; }
.pal-hex::placeholder { color:var(--text-secondary,#5f6068); }
.pal-hex:focus { border-style:solid; border-color:var(--color-active,#4a9eff); }
.pal-empty { color:var(--text-secondary,#5f6068); font-size:12px; text-align:center; padding:24px; }
`
  document.head.appendChild(s)
}

// ── Colour helpers ────────────────────────────────────────────────────────────
const hx = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
const rgbHex = (r, g, b) => '#' + hx(r) + hx(g) + hx(b)
function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', ''), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360 }
  const l = (mx + mn) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  return [h, s, l]
}
// Mix two colours in integer sRGB space (amt = fraction of `to`).
function mixHex(from, to, amt) {
  const a = parseInt(from.replace('#', ''), 16), b = parseInt(to.replace('#', ''), 16)
  const ch = sh => Math.round((a >> sh & 255) + ((b >> sh & 255) - (a >> sh & 255)) * amt)
  return rgbHex(ch(16), ch(8), ch(0))
}
// 9-step ramp: 4 tints (lightest first), the colour, 4 shades (darkest last).
function makeRamp(hex) {
  const tints = [0.8, 0.6, 0.4, 0.2].map(p => mixHex(hex, '#ffffff', p))
  const shades = [0.2, 0.4, 0.6, 0.8].map(p => mixHex(hex, '#000000', p))
  return [...tints, hex, ...shades]
}
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]
  return rgbHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

export function initPalettes(body) {
  injectStyles()
  body.classList.add('pal-body')
  let palettes = load()
  // Seed the default palette in storage too, otherwise showPalPicker (which
  // re-reads localStorage) finds nothing on a fresh install.
  if (!Array.isArray(palettes) || !palettes.length) { palettes = [{ name: 'Iceample', colors: ['#b23fd6', '#8ed531', '#ee6a1e', '#0c0a12', '#f2ecff'] }]; persistRaw(palettes) }

  body.innerHTML = `
    <div class="pal-bar">
      <button class="pal-btn" id="pal-new"><i class="fa-solid fa-plus"></i> ${t('pal_new')}</button>
      <button class="pal-btn" id="pal-img"><i class="fa-solid fa-image"></i> ${t('pal_from_image')}</button>
      <button class="pal-btn" id="pal-eye"><i class="fa-solid fa-eye-dropper"></i> ${t('pal_eyedropper')}</button>
      <input class="pal-color" id="pal-base" type="color" value="#b23fd6" title="${t('pal_base')}" />
      <button class="pal-btn" id="pal-gen"><i class="fa-solid fa-wand-magic-sparkles"></i> ${t('pal_generate')}</button>
      <input type="file" id="pal-file" accept="image/*" hidden />
    </div>
    <div class="pal-contrast" id="pal-contrast">
      <div class="pal-contrast-h" id="pal-ct-h">
        <i class="fa-solid fa-chevron-right chev"></i>
        <span>${t('pal_contrast')}</span>
      </div>
      <div class="pal-contrast-body">
        <div class="pal-contrast-row">
          <input class="pal-color" id="pal-ct-fg" type="color" value="#ffffff" />
          <input class="pal-color" id="pal-ct-bg" type="color" value="#000000" />
          <span class="pal-contrast-ratio" id="pal-ct-ratio"></span>
        </div>
        <div class="pal-contrast-row" id="pal-ct-badges"></div>
        <div class="pal-contrast-hint">${t('pal_contrast_hint')}</div>
      </div>
    </div>
    <div class="pal-list" id="pal-list"></div>`
  const list = body.querySelector('#pal-list'), fileInp = body.querySelector('#pal-file'), baseInp = body.querySelector('#pal-base')

  // ── Contrast checker (WCAG) ─────────────────────────────────────────────────
  const ctSec = body.querySelector('#pal-contrast'), ctFg = body.querySelector('#pal-ct-fg'), ctBg = body.querySelector('#pal-ct-bg')
  const ctRatio = body.querySelector('#pal-ct-ratio'), ctBadges = body.querySelector('#pal-ct-badges')
  let ctNextIsFg = true
  const relLum = hex => {
    const n = parseInt(hex.replace('#', ''), 16)
    const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  function updateContrast() {
    const l1 = relLum(ctFg.value), l2 = relLum(ctBg.value)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    ctRatio.textContent = (Math.round(ratio * 10) / 10) + ':1'
    ctBadges.innerHTML = ''
    ;[['AA', 4.5], ['AA Large', 3], ['AAA', 7], ['AAA Large', 4.5]].forEach(([lbl, min]) => {
      const ok = ratio >= min
      const b = el('span', 'pal-badge', null)
      b.textContent = lbl
      const col = ok ? 'var(--vu-color-low)' : 'var(--vu-color-high)'
      b.style.color = col; b.style.borderColor = col
      b.style.background = `color-mix(in srgb, ${col} 14%, transparent)`
      ctBadges.appendChild(b)
    })
  }
  body.querySelector('#pal-ct-h').addEventListener('click', () => { ctSec.classList.toggle('open'); ctNextIsFg = true })
  ctFg.addEventListener('input', updateContrast)
  ctBg.addEventListener('input', updateContrast)

  const persist = () => { persistRaw(palettes); window.dispatchEvent(new CustomEvent('iceample-palettes-changed')) }
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const copy = c => { if (navigator.clipboard?.writeText) navigator.clipboard.writeText(c).then(() => window.toast?.(t('pal_copied') + ' ' + c, 'success', 900), () => {}) }

  function render() {
    list.innerHTML = ''
    if (!palettes.length) { list.appendChild(el('div', 'pal-empty', t('pal_empty'))); return }
    palettes.forEach((pal, pi) => {
      const card = el('div', 'pal-card')
      const h = el('div', 'pal-card-h')
      h.innerHTML = `<span class="nm"></span><i class="fa-solid fa-wand-magic-sparkles act sug" title="${t('pal_suggest')}"></i><i class="fa-solid fa-file-export act exp" title="${t('pal_export')}"></i><i class="fa-solid fa-pen act ren"></i><i class="fa-solid fa-xmark act del"></i>`
      h.querySelector('.nm').textContent = pal.name
      h.querySelector('.sug').addEventListener('click', () => suggest(pal))
      h.querySelector('.exp').addEventListener('click', e => { e.stopPropagation(); showExportPopup(e.currentTarget, pal) })
      h.querySelector('.nm').addEventListener('click', async () => { const n = await promptName(pal.name, { title: t('pal_rename') }); if (n != null) { pal.name = n; persist(); render() } })
      h.querySelector('.ren').addEventListener('click', async () => { const n = await promptName(pal.name, { title: t('pal_rename') }); if (n != null) { pal.name = n; persist(); render() } })
      // Two-click delete: first click arms the icon (turns into a check), a
      // second click within 2s confirms.
      h.querySelector('.del').addEventListener('click', e => {
        const ic = e.currentTarget
        if (ic.dataset.arm) { palettes.splice(pi, 1); persist(); render(); return }
        ic.dataset.arm = '1'
        ic.classList.replace('fa-xmark', 'fa-check')
        ic.style.color = '#ff6a6a'; ic.style.opacity = '1'
        setTimeout(() => {
          if (!ic.isConnected || !ic.dataset.arm) return
          delete ic.dataset.arm
          ic.classList.replace('fa-check', 'fa-xmark')
          ic.style.color = ''; ic.style.opacity = ''
        }, 2000)
      })
      card.appendChild(h)
      const sw = el('div', 'pal-swatches')
      pal.colors.forEach((col, si) => {
        const s = el('div', 'pal-sw'); s.style.background = col; s.title = col + ' — ' + t('pal_copy')
        s.innerHTML = `<span class="x">&times;</span><span class="e" title="${t('pal_edit_color')}"><i class="fa-solid fa-pen"></i></span><span class="rp" title="${t('pal_ramp')}"><i class="fa-solid fa-bars-staggered"></i></span>`
        const ec = el('input'); ec.type = 'color'; ec.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none'
        ec.addEventListener('input', () => { pal.colors[si] = ec.value; s.style.background = ec.value; s.title = ec.value + ' — ' + t('pal_copy'); persist() })
        ec.addEventListener('change', () => render())
        s.appendChild(ec)
        s.addEventListener('click', e => {
          if (e.target.closest('.x')) { pal.colors.splice(si, 1); persist(); render() }
          else if (e.target.closest('.e')) { ec.value = /^#[0-9a-fA-F]{6}$/.test(pal.colors[si]) ? pal.colors[si] : '#ffffff'; ec.click() }
          else if (e.target.closest('.rp')) { palettes.unshift({ name: t('pal_ramp') + ' ' + pal.colors[si], colors: makeRamp(pal.colors[si]) }); persist(); render() }
          else if (e.target !== ec) {
            // While the contrast section is open, swatch clicks feed the checker
            // (alternating foreground → background) instead of copying.
            if (ctSec.classList.contains('open')) {
              const c = /^#[0-9a-fA-F]{6}$/.test(pal.colors[si]) ? pal.colors[si] : null
              if (c) { (ctNextIsFg ? ctFg : ctBg).value = c; ctNextIsFg = !ctNextIsFg; updateContrast() }
            } else copy(pal.colors[si])
          }
        })
        sw.appendChild(s)
      })
      const add = el('button', 'pal-add', '<i class="fa-solid fa-plus"></i>'); add.title = t('pal_add_color')
      const ci = el('input'); ci.type = 'color'; ci.value = '#ffffff'; ci.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none'
      ci.addEventListener('input', () => { pal.colors.push(ci.value); persist(); render() })
      add.addEventListener('click', () => ci.click())
      // Free hex entry: one or more colours separated by spaces/commas.
      const hexInp = el('input', 'pal-hex'); hexInp.type = 'text'; hexInp.placeholder = '#hex'; hexInp.spellcheck = false
      hexInp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return
        const toks = hexInp.value.split(/[\s,;]+/).filter(Boolean)
        const cols = []
        toks.forEach(tk => {
          const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(tk); if (!m) return
          let hh = m[1].toLowerCase()
          if (hh.length === 3) hh = hh.split('').map(c => c + c).join('')
          cols.push('#' + hh)
        })
        if (cols.length) { pal.colors.push(...cols); persist(); render() }
        else if (toks.length) { hexInp.style.borderColor = '#ff6a6a'; setTimeout(() => { hexInp.style.borderColor = '' }, 700) }
      })
      sw.append(add, hexInp, ci); card.appendChild(sw); list.appendChild(card)
    })
  }

  const rnd = (a, b) => a + Math.random() * (b - a)
  // Varied but harmonious palette anchored on the base colour (random scheme + jitter).
  function generate() {
    const [h0, s0, l0] = hexToHsl(baseInp.value)
    const h = (h0 + rnd(-25, 25) + 360) % 360, s = Math.min(0.95, Math.max(0.4, s0 + rnd(-0.15, 0.15))), l = Math.min(0.68, Math.max(0.42, l0))
    const scheme = ['analog', 'comp', 'triad', 'split', 'tetrad', 'mono'][Math.floor(Math.random() * 6)]
    let hues
    if (scheme === 'analog') hues = [h, h + 30, h + 60, h - 30, h - 60]
    else if (scheme === 'comp') hues = [h, h + 180, h + 20, h + 200, h]
    else if (scheme === 'triad') hues = [h, h + 120, h + 240, h + 120, h + 240]
    else if (scheme === 'split') hues = [h, h + 150, h + 210, h + 150, h + 210]
    else if (scheme === 'tetrad') hues = [h, h + 90, h + 180, h + 270, h + 45]
    else hues = [h, h, h, h, h]
    const cols = hues.map((hu, i) => {
      const li = scheme === 'mono' ? [0.28, 0.42, 0.56, 0.7, 0.85][i] : Math.min(0.85, Math.max(0.32, l + rnd(-0.12, 0.12)))
      const si = scheme === 'mono' ? s : Math.min(0.95, Math.max(0.32, s + rnd(-0.12, 0.12)))
      return hslToHex((hu + 360) % 360, si, li)
    })
    palettes.unshift({ name: t('pal_harmony'), colors: cols }); persist(); render()
  }
  // Suggest colours that go with the ones already in the palette.
  function suggest(pal) {
    if (!pal.colors.length) return
    let sinh = 0, cosh = 0, s = 0, l = 0, n = pal.colors.length
    pal.colors.forEach(c => { const [hh, ss, ll] = hexToHsl(c); sinh += Math.sin(hh * Math.PI / 180); cosh += Math.cos(hh * Math.PI / 180); s += ss; l += ll })
    const avgH = (Math.atan2(sinh / n, cosh / n) * 180 / Math.PI + 360) % 360, avgS = Math.min(0.9, Math.max(0.4, s / n)), avgL = Math.min(0.75, Math.max(0.35, l / n))
    const cand = [hslToHex((avgH + 180) % 360, avgS, avgL), hslToHex((avgH + 30) % 360, avgS, Math.min(0.82, avgL + 0.12)), hslToHex((avgH - 30 + 360) % 360, avgS, Math.max(0.28, avgL - 0.12))]
    cand.forEach(c => { if (!pal.colors.includes(c)) pal.colors.push(c) })
    persist(); render()
  }
  // Tiny export popup (CSS variables / JSON → clipboard), showPalPicker-style.
  function showExportPopup(anchor, pal) {
    document.getElementById('pal-exp-pp')?.remove()
    const pop = document.createElement('div'); pop.id = 'pal-exp-pp'
    pop.style.cssText = 'position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--win-border);border-radius:8px;display:flex;flex-direction:column;box-shadow:0 8px 24px rgba(0,0,0,.6);overflow:hidden;padding:4px'
    const onDocClick = () => close()
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } }
    const close = () => { pop.remove(); document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey, true) }
    const copyOut = text => {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => window.toast?.(t('pal_copied_all'), 'success', 900), () => {})
      close()
    }
    const rows = [
      ['CSS', () => ':root {\n' + pal.colors.map((c, i) => `  --color-${i + 1}: ${c};`).join('\n') + '\n}'],
      ['JSON', () => JSON.stringify({ name: pal.name, colors: pal.colors }, null, 2)]
    ]
    rows.forEach(([lbl, make]) => {
      const b = document.createElement('button')
      b.textContent = lbl
      b.style.cssText = 'text-align:left;padding:5px 14px;border:none;border-radius:4px;background:none;color:var(--text-secondary);font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap'
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(255,255,255,.07)'; b.style.color = 'var(--text-primary)' })
      b.addEventListener('mouseleave', () => { b.style.background = 'none'; b.style.color = 'var(--text-secondary)' })
      b.addEventListener('click', e => { e.stopPropagation(); copyOut(make()) })
      pop.appendChild(b)
    })
    document.body.appendChild(pop)
    const r = anchor.getBoundingClientRect()
    pop.style.left = Math.max(6, Math.min(r.left, window.innerWidth - pop.offsetWidth - 10)) + 'px'
    let top = r.bottom + 5
    if (top + pop.offsetHeight > window.innerHeight - 6) top = Math.max(6, r.top - pop.offsetHeight - 5)
    pop.style.top = top + 'px'
    setTimeout(() => { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onKey, true) }, 0)
  }
  body.querySelector('#pal-new').addEventListener('click', () => { palettes.unshift({ name: t('pal_default'), colors: [] }); persist(); render() })
  body.querySelector('#pal-gen').addEventListener('click', generate)
  body.querySelector('#pal-img').addEventListener('click', () => fileInp.click())
  body.querySelector('#pal-eye').addEventListener('click', async () => {
    if (!window.EyeDropper) { window.toast?.('EyeDropper API not supported', 'error'); return }
    try {
      const { sRGBHex } = await new EyeDropper().open()
      let pal = palettes.find(p => p._pip)
      if (!pal) { pal = { name: t('pal_eyedropper'), colors: [], _pip: true }; palettes.unshift(pal) }
      if (!pal.colors.includes(sRGBHex)) pal.colors.push(sRGBHex)
      persist(); render()
    } catch {}
  })
  // Shared by the file picker and the media bus (image sent from another tool).
  function extractFromSrc(src) {
    const im = new Image(); im.onload = () => {
      const S = 48, c = document.createElement('canvas'); c.width = S; c.height = S
      const g = c.getContext('2d'); g.drawImage(im, 0, 0, S, S)
      const d = g.getImageData(0, 0, S, S).data, map = {}
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const k = (d[i] >> 5 << 5) + ',' + (d[i + 1] >> 5 << 5) + ',' + (d[i + 2] >> 5 << 5); map[k] = (map[k] || 0) + 1 }
      const top = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => { const [r2, g2, b2] = k.split(',').map(Number); return rgbHex(r2, g2, b2) })
      palettes.unshift({ name: t('pal_extracted'), colors: top }); persist(); render()
    }; im.src = src
  }
  fileInp.addEventListener('change', () => {
    const f = fileInp.files[0]; if (!f) return
    const r = new FileReader(); r.onload = () => extractFromSrc(r.result)
    r.readAsDataURL(f); fileInp.value = ''
  })
  // Media bus: an image sent here gets its palette extracted.
  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (m && m.kind === 'image' && m.dataUrl) extractFromSrc(m.dataUrl)
  })

  updateContrast()
  render()
}
