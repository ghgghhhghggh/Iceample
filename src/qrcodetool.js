// qrcodetool.js — Générateur de QR Code

import { trackRecentFile } from './recent.js'
import { makeSendButton, imageMedia } from './media-bus.js'

export function initQrcode(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;font-family:inherit;'

  const INPUT_TYPES = [
    { id: 'url',   label: 'URL',    placeholder: 'https://exemple.com' },
    { id: 'text',  label: 'Texte',  placeholder: 'Votre texte...' },
    { id: 'wifi',  label: 'Wi-Fi',  placeholder: '' },
    { id: 'vcard', label: 'vCard',  placeholder: '' },
    { id: 'email', label: 'E-mail', placeholder: '' },
    { id: 'tel',   label: 'Tél.',   placeholder: '+33 6 00 00 00 00' },
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
  body.append(main)

  // ── Preview ────────────────────────────────────────────────────────────────
  const svgHolder = document.createElement('div')
  svgHolder.style.cssText = 'background:#fff;border-radius:8px;width:240px;height:240px;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 0 24px rgba(0,0,0,0.5);'

  const placeholder = document.createElement('div')
  placeholder.style.cssText = 'color:#bbb;font-size:12px;text-align:center;'
  placeholder.innerHTML = '<i class="fa-solid fa-qrcode" style="font-size:40px;display:block;margin-bottom:8px;color:#444;"></i>Aperçu QR Code'
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
  exportPngBtn.disabled = true; exportSvgBtn.disabled = true
  exportPngBtn.style.opacity = '0.4'; exportSvgBtn.style.opacity = '0.4'

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
  leftPanel.appendChild(label('Type'))
  const typeSel = document.createElement('select')
  typeSel.style.cssText = SEL
  for (const t of INPUT_TYPES) {
    const o = document.createElement('option'); o.value = t.id; o.textContent = t.label; typeSel.appendChild(o)
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
        const { wrap, el } = makeInput(null, INPUT_TYPES.find(t => t.id === inputType).placeholder)
        inputArea.appendChild(wrap); inputRefs.main = el; break
      }
      case 'text': {
        const { wrap, el } = makeInput(null, 'Votre texte ici...', 'textarea')
        inputArea.appendChild(wrap); inputRefs.main = el; break
      }
      case 'wifi': {
        const ssid = makeInput('SSID', 'Nom du réseau')
        const pwd  = makeInput('Mot de passe', '••••••••••')
        const secWrap = document.createElement('div')
        secWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;'
        secWrap.appendChild(label('Sécurité'))
        const sec = document.createElement('select'); sec.style.cssText = SEL
        for (const s of ['WPA', 'WEP', 'nopass']) {
          const o = document.createElement('option'); o.value = s; o.textContent = s; sec.appendChild(o)
        }
        secWrap.appendChild(sec)
        inputArea.append(ssid.wrap, pwd.wrap, secWrap)
        inputRefs = { ssid: ssid.el, pwd: pwd.el, sec }
        break
      }
      case 'vcard': {
        const fn_  = makeInput('Prénom Nom',   'Jean Dupont')
        const org  = makeInput('Organisation', 'Acme Corp')
        const tel  = makeInput('Tél.',         '+33 6 00 00 00 00')
        const em   = makeInput('E-mail',       'jean@exemple.com')
        const url  = makeInput('Site',         'https://')
        inputArea.append(fn_.wrap, org.wrap, tel.wrap, em.wrap, url.wrap)
        inputRefs = { fn: fn_.el, org: org.el, tel: tel.el, email: em.el, url: url.el }
        break
      }
      case 'email': {
        const to  = makeInput('Destinataire', 'contact@exemple.com')
        const sub = makeInput('Sujet',        'Sujet')
        const bod = makeInput('Message',      'Votre message...', 'textarea')
        inputArea.append(to.wrap, sub.wrap, bod.wrap)
        inputRefs = { to: to.el, subject: sub.el, body: bod.el }
        break
      }
    }
    // live update on all inputs
    for (const el of Object.values(inputRefs)) {
      el.addEventListener('input', () => generate())
    }
  }

  // Error correction
  leftPanel.append(document.createElement('div'))
  leftPanel.appendChild(label('Correction d\'erreur'))
  const ecSel = document.createElement('select'); ecSel.style.cssText = SEL
  for (const [v, t] of [['L','L – Faible (7%)'],['M','M – Moyen (15%)'],['Q','Q – Quartile (25%)'],['H','H – Élevé (30%)']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = t; ecSel.appendChild(o)
  }
  ecSel.value = 'M'
  leftPanel.appendChild(ecSel)

  // Colors
  leftPanel.appendChild(label('Couleurs'))
  const colorRow = document.createElement('div')
  colorRow.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const fgLabel = document.createElement('span'); fgLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);flex:1;'; fgLabel.textContent = 'Code'
  const fgInp = document.createElement('input'); fgInp.type = 'color'; fgInp.value = '#000000'
  fgInp.style.cssText = 'width:36px;height:24px;border:1px solid var(--win-border);border-radius:4px;padding:1px;cursor:pointer;background:none;'
  const bgLabel = document.createElement('span'); bgLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);flex:1;'; bgLabel.textContent = 'Fond'
  const bgInp = document.createElement('input'); bgInp.type = 'color'; bgInp.value = '#ffffff'
  bgInp.style.cssText = 'width:36px;height:24px;border:1px solid var(--win-border);border-radius:4px;padding:1px;cursor:pointer;background:none;'
  colorRow.append(fgLabel, fgInp, bgLabel, bgInp)
  leftPanel.appendChild(colorRow)

  // Generate button
  const genBtn = document.createElement('button')
  genBtn.innerHTML = '<i class="fa-solid fa-qrcode"></i> Générer'
  genBtn.style.cssText = 'border:none;border-radius:6px;padding:8px;cursor:pointer;font-size:12px;font-family:inherit;background:var(--btn-primary);color:var(--on-accent);width:100%;margin-top:4px;'
  leftPanel.appendChild(genBtn)

  // ── Generate ───────────────────────────────────────────────────────────────

  function buildData() {
    switch (inputType) {
      case 'url':  return inputRefs.main?.value?.trim() || ''
      case 'tel':  return `tel:${inputRefs.main?.value?.trim() || ''}`
      case 'text': return inputRefs.main?.value || ''
      case 'wifi': {
        const ssid = inputRefs.ssid?.value || ''; const pwd = inputRefs.pwd?.value || ''; const sec = inputRefs.sec?.value || 'WPA'
        return `WIFI:S:${ssid};T:${sec};P:${pwd};;`
      }
      case 'vcard': {
        const fn_ = inputRefs.fn?.value || ''; const org = inputRefs.org?.value || ''
        const tel = inputRefs.tel?.value || ''; const em  = inputRefs.email?.value || ''; const url = inputRefs.url?.value || ''
        return `BEGIN:VCARD\nVERSION:3.0\nFN:${fn_}\nORG:${org}\nTEL:${tel}\nEMAIL:${em}\nURL:${url}\nEND:VCARD`
      }
      case 'email': {
        const to = inputRefs.to?.value || ''; const sub = inputRefs.subject?.value || ''; const bod = inputRefs.body?.value || ''
        return `mailto:${to}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(bod)}`
      }
      default: return ''
    }
  }

  let debounce = null
  function generate() {
    clearTimeout(debounce)
    debounce = setTimeout(async () => {
      const data = buildData()
      if (!data || !window.__TAURI__) return
      try {
        const svg = await window.__TAURI__.core.invoke('generate_qrcode', {
          data,
          fg: fgInp.value,
          bg: bgInp.value,
          ec: ecSel.value,
        })
        currentSvg = svg
        svgHolder.innerHTML = svg
        const svgEl = svgHolder.querySelector('svg')
        if (svgEl) {
          svgEl.style.cssText = 'width:240px;height:240px;display:block;'
        }
        exportPngBtn.disabled = false; exportSvgBtn.disabled = false
        exportPngBtn.style.opacity = '1'; exportSvgBtn.style.opacity = '1'
      } catch (e) {
        svgHolder.innerHTML = ''; svgHolder.appendChild(placeholder)
        placeholder.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size:28px;display:block;margin-bottom:6px;color:#e84;"></i>${String(e)}`
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
          window.toast?.('PNG exporté ✓', 'success')
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
        window.toast?.('SVG exporté ✓', 'success')
      }
    } catch (e) { window.toast?.(String(e), 'error') }
  })

  // ── Wiring ─────────────────────────────────────────────────────────────────

  typeSel.addEventListener('change', () => { inputType = typeSel.value; buildInputs() })
  genBtn.addEventListener('click', generate)
  ecSel.addEventListener('change', generate)
  fgInp.addEventListener('input', generate)
  bgInp.addEventListener('input', generate)

  buildInputs()
}
