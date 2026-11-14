// qrcodetool.js — Générateur de QR Code

import { trackRecentFile } from './recent.js'
import { makeSendButton, imageMedia } from './media-bus.js'
import { t } from './i18n.js'
import { enhanceSidePanel } from './side-panel.js'
import { renderDesktopOnly } from './desktop-only.js'

// WIFI: payload — \ ; , : " are escaped with a backslash.
const wifiEsc = s => String(s).replace(/[\\;,:"]/g, m => '\\' + m)
// vCard text value — \ , ; escaped, newlines as \n.
const vcardEsc = s => String(s).replace(/[\\,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n')

export function initQrcode(body) {
  // generate_qrcode is native (Rust): the web version has no QR encoder.
  if (!window.__TAURI__ || window.__ICEAMPLE_WEB__) {
    renderDesktopOnly(body)
    return
  }

  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;font-family:inherit;'

  const INPUT_TYPES = [
    { id: 'url',   label: 'URL',              placeholder: 'https://example.com' },
    { id: 'text',  label: t('qr_text'),       placeholder: t('qr_ph_text') },
    { id: 'wifi',  label: 'Wi-Fi',            placeholder: '' },
    { id: 'vcard', label: 'vCard',            placeholder: '' },
    { id: 'email', label: t('qr_email'),      placeholder: '' },
    { id: 'tel',   label: t('qr_phone'),      placeholder: '+33 6 00 00 00 00' },
  ]

  let currentSvg  = ''
  let inputType   = 'url'

  // ── Layout ─────────────────────────────────────────────────────────────────
  const main = document.createElement('div')
  main.style.cssText = 'display:flex;flex:1;overflow:hidden;'

  const leftPanel = document.createElement('div')
  leftPanel.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:12px;width:220px;flex-shrink:0;overflow-y:auto;border-right:1px solid var(--win-border-in,#1e1e1e);background:var(--surface2,#141414);'

  const previewArea = document.createElement('div')
  previewArea.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;background:var(--preview-bg);'

  main.append(leftPanel, previewArea)
  enhanceSidePanel(leftPanel, { id: 'qrcodetool', side: 'left' })
  body.append(main)

  // ── Preview ────────────────────────────────────────────────────────────────
  // The white square is the QR's own background (content), not UI chrome.
  const svgHolder = document.createElement('div')
  svgHolder.style.cssText = 'background:#fff;border-radius:8px;width:240px;height:240px;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 0 24px rgba(0,0,0,0.5);'

  const placeholder = document.createElement('div')
  placeholder.style.cssText = 'color:var(--text-secondary);font-size:12px;text-align:center;padding:0 12px;overflow-wrap:anywhere;'
  svgHolder.appendChild(placeholder)

  const exportRow = document.createElement('div')
  exportRow.style.cssText = 'display:flex;gap:8px;'
  const BTN = (txt, icon, col, fg = 'var(--on-accent)') => {
    const b = document.createElement('button')
    b.innerHTML = `<i class="fa-solid ${icon}"></i> ${txt}`
    b.style.cssText = `border:none;border-radius:6px;padding:7px 14px;cursor:pointer;font-size:11px;font-family:inherit;background:${col};color:${fg};`
    return b
  }
  const exportPngBtn = BTN('PNG', 'fa-image', 'var(--color-active)')
  const exportSvgBtn = BTN('SVG', 'fa-code', 'color-mix(in srgb,var(--text-primary) 10%,var(--surface))', 'var(--text-primary)')
  // "Send to…" — ship the QR (rasterized at 512px) to another image tool.
  const sendBtn = makeSendButton(() => new Promise(resolve => {
    if (!currentSvg) { resolve(null); return }
    const blob = new Blob([currentSvg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 512
      c.getContext('2d').drawImage(img, 0, 0, 512, 512)
      URL.revokeObjectURL(url)
      resolve(imageMedia(c, 'qrcode'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  }), { self: 'qrcode', className: '', iconOnly: true })
  sendBtn.style.cssText = 'border:none;border-radius:6px;padding:7px 12px;cursor:pointer;font-size:11px;font-family:inherit;background:color-mix(in srgb,var(--text-primary) 10%,var(--surface));color:var(--text-primary,#ddd);'
  exportRow.append(exportPngBtn, exportSvgBtn, sendBtn)

  function setExportEnabled(on) {
    exportPngBtn.disabled = !on; exportSvgBtn.disabled = !on
    exportPngBtn.style.opacity = on ? '1' : '0.4'; exportSvgBtn.style.opacity = on ? '1' : '0.4'
  }

  // No code to show (idle, or an error): drop the old QR and disable export.
  function showPlaceholder(iconHtml, text) {
    currentSvg = ''
    setExportEnabled(false)
    placeholder.innerHTML = iconHtml
    placeholder.append(text)                       // text node: backend errors are never parsed as HTML
    svgHolder.replaceChildren(placeholder)
  }
  const showIdle = () => showPlaceholder('<i class="fa-solid fa-qrcode" style="font-size:40px;display:block;margin-bottom:8px;"></i>', t('qr_preview'))
  const showError = msg => showPlaceholder('<i class="fa-solid fa-triangle-exclamation" style="font-size:28px;display:block;margin-bottom:6px;color:var(--danger);"></i>', msg)

  showIdle()
  previewArea.append(svgHolder, exportRow)

  // ── Left panel ─────────────────────────────────────────────────────────────
  const SEL = 'background:var(--surface,#111);border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-primary,#ddd);border-radius:5px;padding:5px 8px;font-size:11px;font-family:inherit;width:100%;box-sizing:border-box;'
  const INP = SEL + 'margin-top:2px;'

  function label(txt) {
    const d = document.createElement('div')
    d.style.cssText = 'font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;'
    d.textContent = txt; return d
  }

  // Type selector
  leftPanel.appendChild(label(t('qr_type')))
  const typeSel = document.createElement('select')
  typeSel.style.cssText = SEL
  for (const it of INPUT_TYPES) {
    const o = document.createElement('option'); o.value = it.id; o.textContent = it.label; typeSel.appendChild(o)
  }
  leftPanel.appendChild(typeSel)

  // Dynamic input area
  const inputArea = document.createElement('div')
  inputArea.style.cssText = 'display:flex;flex-direction:column;gap:6px;'
  leftPanel.appendChild(inputArea)

  function makeInput(lbl, ph, type = 'text') {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;'
    if (lbl) { const l = label(lbl); wrap.appendChild(l) }
    if (type === 'textarea') {
      const ta = document.createElement('textarea')
      ta.placeholder = ph; ta.rows = 3
      ta.style.cssText = INP + 'resize:vertical;'
      wrap.appendChild(ta); return { wrap, el: ta }
    }
    const inp = document.createElement('input')
    inp.type = type; inp.placeholder = ph; inp.style.cssText = INP
    wrap.appendChild(inp); return { wrap, el: inp }
  }

  let inputRefs = {}

  function buildInputs() {
    inputArea.innerHTML = ''
    inputRefs = {}
    switch (inputType) {
      case 'url':
      case 'tel': {
        const { wrap, el } = makeInput(null, INPUT_TYPES.find(it => it.id === inputType).placeholder)
        inputArea.appendChild(wrap); inputRefs.main = el; break
      }
      case 'text': {
        const { wrap, el } = makeInput(null, t('qr_ph_text'), 'textarea')
        inputArea.appendChild(wrap); inputRefs.main = el; break
      }
      case 'wifi': {
        const ssid = makeInput('SSID', t('qr_ph_network'))
        const pwd  = makeInput(t('qr_password'), '••••••••••')
        const secWrap = document.createElement('div')
        secWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;'
        secWrap.appendChild(label(t('qr_security')))
        const sec = document.createElement('select'); sec.style.cssText = SEL
        for (const s of ['WPA', 'WEP', 'nopass']) {
          const o = document.createElement('option'); o.value = s; o.textContent = s === 'nopass' ? t('qr_sec_none') : s; sec.appendChild(o)
        }
        secWrap.appendChild(sec)
        inputArea.append(ssid.wrap, pwd.wrap, secWrap)
        inputRefs = { ssid: ssid.el, pwd: pwd.el, sec }
        break
      }
      case 'vcard': {
        const fn_  = makeInput(t('qr_full_name'), t('qr_ph_name'))
        const org  = makeInput(t('qr_org'),       'Acme Corp')
        const tel  = makeInput(t('qr_phone'),     '+33 6 00 00 00 00')
        const em   = makeInput(t('qr_email'),     'name@example.com')
        const url  = makeInput(t('qr_website'),   'https://')
        inputArea.append(fn_.wrap, org.wrap, tel.wrap, em.wrap, url.wrap)
        inputRefs = { fn: fn_.el, org: org.el, tel: tel.el, email: em.el, url: url.el }
        break
      }
      case 'email': {
        const to  = makeInput(t('qr_recipient'), 'contact@example.com')
        const sub = makeInput(t('qr_subject'),   t('qr_subject'))
        const bod = makeInput(t('qr_message'),   t('qr_ph_message'), 'textarea')
        inputArea.append(to.wrap, sub.wrap, bod.wrap)
        inputRefs = { to: to.el, subject: sub.el, body: bod.el }
        break
      }
    }
    // live update on all inputs (the security <select> fires 'input' too)
    for (const el of Object.values(inputRefs)) {
      el.addEventListener('input', () => generate())
    }
  }

  // Error correction
  leftPanel.append(document.createElement('div'))
  leftPanel.appendChild(label(t('qr_error_correction')))
  const ecSel = document.createElement('select'); ecSel.style.cssText = SEL
  for (const [v, txt] of [['L',t('qr_ec_l')],['M',t('qr_ec_m')],['Q',t('qr_ec_q')],['H',t('qr_ec_h')]]) {
    const o = document.createElement('option'); o.value = v; o.textContent = txt; ecSel.appendChild(o)
  }
  ecSel.value = 'M'
  leftPanel.appendChild(ecSel)

  // Colors
  leftPanel.appendChild(label(t('qr_colors')))
  const colorRow = document.createElement('div')
  colorRow.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const fgLabel = document.createElement('span'); fgLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);flex:1;'; fgLabel.textContent = t('qr_fg')
  const fgInp = document.createElement('input'); fgInp.type = 'color'; fgInp.value = '#000000'
  fgInp.style.cssText = 'width:36px;height:24px;border:1px solid var(--win-border);border-radius:4px;padding:1px;cursor:pointer;background:none;'
  const bgLabel = document.createElement('span'); bgLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);flex:1;'; bgLabel.textContent = t('qr_bg')
  const bgInp = document.createElement('input'); bgInp.type = 'color'; bgInp.value = '#ffffff'
  bgInp.style.cssText = 'width:36px;height:24px;border:1px solid var(--win-border);border-radius:4px;padding:1px;cursor:pointer;background:none;'
  colorRow.append(fgLabel, fgInp, bgLabel, bgInp)
  leftPanel.appendChild(colorRow)

  // Generate button
  const genBtn = document.createElement('button')
  genBtn.innerHTML = '<i class="fa-solid fa-qrcode"></i> ' + t('qr_generate')
  genBtn.style.cssText = 'border:none;border-radius:6px;padding:8px;cursor:pointer;font-size:12px;font-family:inherit;background:var(--btn-primary);color:var(--on-accent);width:100%;margin-top:4px;'
  leftPanel.appendChild(genBtn)

  // ── Generate ───────────────────────────────────────────────────────────────

  const val = k => inputRefs[k]?.value ?? ''
  const filled = k => !!val(k).trim()

  // The field each type can't do without.
  function requiredFilled() {
    switch (inputType) {
      case 'url': case 'tel': case 'text': return filled('main')
      case 'email': return filled('to')
      case 'wifi':  return filled('ssid')
      case 'vcard': return filled('fn')
      default: return false
    }
  }

  function buildData() {
    switch (inputType) {
      case 'url':  return val('main').trim()
      case 'tel':  return `tel:${val('main').trim()}`
      case 'text': return val('main')
      case 'wifi': {
        const ssid = wifiEsc(val('ssid')); const sec = val('sec') || 'WPA'
        return sec === 'nopass' ? `WIFI:S:${ssid};T:nopass;;` : `WIFI:S:${ssid};T:${sec};P:${wifiEsc(val('pwd'))};;`
      }
      case 'vcard': {
        // N (required by vCard 3.0) = last;first — last word of the full name as the last name.
        const fn_ = val('fn').trim()
        const words = fn_.split(/\s+/).filter(Boolean)
        const last = words.pop() || ''; const first = words.join(' ')
        const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vcardEsc(last)};${vcardEsc(first)};;;`, `FN:${vcardEsc(fn_)}`]
        for (const [k, prop] of [['org', 'ORG'], ['tel', 'TEL'], ['email', 'EMAIL']]) {
          if (filled(k)) lines.push(`${prop}:${vcardEsc(val(k).trim())}`)
        }
        // URL is a URI value, not text: commas/semicolons are legal in it and stay as typed.
        if (filled('url')) lines.push(`URL:${val('url').trim()}`)
        lines.push('END:VCARD')
        return lines.join('\n')
      }
      case 'email': {
        return `mailto:${val('to').trim()}?subject=${encodeURIComponent(val('subject'))}&body=${encodeURIComponent(val('body'))}`
      }
      default: return ''
    }
  }

  let debounce = null
  let genSeq = 0
  function generate() {
    clearTimeout(debounce)
    debounce = setTimeout(async () => {
      const seq = ++genSeq                         // a newer run makes this one stale
      if (!requiredFilled()) { showIdle(); return }
      const data = buildData()
      try {
        const svg = await window.__TAURI__.core.invoke('generate_qrcode', {
          data,
          fg: fgInp.value,
          bg: bgInp.value,
          ec: ecSel.value,
        })
        if (seq !== genSeq) return
        currentSvg = svg
        svgHolder.innerHTML = svg
        const svgEl = svgHolder.querySelector('svg')
        if (svgEl) {
          svgEl.style.cssText = 'width:240px;height:240px;display:block;'
        }
        setExportEnabled(true)
      } catch (e) {
        if (seq !== genSeq) return
        showError(String(e))
      }
    }, 300)
  }

  // ── Exports ────────────────────────────────────────────────────────────────

  exportPngBtn.addEventListener('click', async () => {
    if (!currentSvg || !window.__TAURI__) return
    const size = 512
    const img = new Image()
    const blob = new Blob([currentSvg], { type: 'image/svg+xml' })
    img.src = URL.createObjectURL(blob)
    img.onload = async () => {
      const c = document.createElement('canvas'); c.width = size; c.height = size
      const cx = c.getContext('2d'); cx.drawImage(img, 0, 0, size, size)
      URL.revokeObjectURL(img.src)
      const b64 = c.toDataURL('image/png').split(',')[1]
      try {
        const path = await window.__TAURI__.dialog.save({
          defaultPath: `qrcode.png`,
          filters: [{ name: 'PNG', extensions: ['png'] }],
        })
        if (path) {
          await window.__TAURI__.core.invoke('save_binary_file', { path, base64: b64 })
          trackRecentFile(path, 'qrcode.png')
          window.toast?.(t('qr_exported').replace('{fmt}', 'PNG') + ' ✓', 'success')
        }
      } catch (e) { window.toast?.(String(e), 'error') }
    }
  })

  exportSvgBtn.addEventListener('click', async () => {
    if (!currentSvg || !window.__TAURI__) return
    try {
      const path = await window.__TAURI__.dialog.save({
        defaultPath: `qrcode.svg`,
        filters: [{ name: 'SVG', extensions: ['svg'] }],
      })
      if (path) {
        await window.__TAURI__.core.invoke('save_text_file', { path, content: currentSvg })
        trackRecentFile(path, 'qrcode.svg')
        window.toast?.(t('qr_exported').replace('{fmt}', 'SVG') + ' ✓', 'success')
      }
    } catch (e) { window.toast?.(String(e), 'error') }
  })

  // ── Wiring ─────────────────────────────────────────────────────────────────

  // New type = new, empty fields: the previous code no longer matches them.
  typeSel.addEventListener('change', () => { inputType = typeSel.value; buildInputs(); generate() })
  genBtn.addEventListener('click', generate)
  ecSel.addEventListener('change', generate)
  fgInp.addEventListener('input', generate)
  bgInp.addEventListener('input', generate)

  buildInputs()
}
