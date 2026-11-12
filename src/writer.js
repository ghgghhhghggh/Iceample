// writer.js — Mini word processor (WYSIWYG / contenteditable)
import { registerTool } from './project.js'

const LS_KEY = 'iceample:writer:content'

function injectStyles() {
  if (document.getElementById('writer-styles')) return
  const s = document.createElement('style'); s.id = 'writer-styles'
  s.textContent = `
.wr-body{display:flex;flex-direction:column;height:100%;background:var(--surface);color:var(--text-primary);font-family:inherit;overflow:hidden}
.wr-toolbar{display:flex;align-items:center;gap:2px;padding:5px 8px;border-bottom:1px solid var(--win-border-in);flex-wrap:wrap;flex-shrink:0;row-gap:3px}
.wr-btn{width:26px;height:24px;display:flex;align-items:center;justify-content:center;border:none;border-radius:4px;background:none;color:var(--text-secondary);cursor:pointer;font-size:11px;transition:background .1s,color .1s;flex-shrink:0;padding:0}
.wr-btn:hover{background:color-mix(in srgb,var(--text-primary) 9%,transparent);color:var(--text-primary)}
.wr-btn.on{background:color-mix(in srgb,var(--color-active) 18%,transparent);color:var(--color-active)}
.wr-sep{width:1px;height:16px;background:var(--win-border-in);margin:0 3px;flex-shrink:0}
.wr-sel{padding:2px 5px;height:24px;background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));border:1px solid var(--win-border-in);border-radius:4px;color:var(--text-primary);font-size:11px;font-family:inherit;outline:none;cursor:pointer;flex-shrink:0}
.wr-sel:focus{border-color:var(--color-active)}
.wr-spacer{flex:1}
.wr-page-wrap{flex:1;overflow:hidden;position:relative;background:color-mix(in srgb,var(--surface) 80%,#000)}
.wr-page{position:absolute;inset:0;overflow-y:auto;padding:20px 28px;color:var(--text-primary);font-size:14px;line-height:1.75;outline:none !important;border:none !important;box-shadow:none !important;font-family:'Segoe UI',system-ui,sans-serif;word-break:break-word;caret-color:var(--color-active);cursor:text;box-sizing:border-box}
.wr-page:focus,.wr-page:focus-visible{outline:none !important;border:none !important;box-shadow:none !important}
.wr-page:empty::before{content:attr(data-ph);color:var(--text-secondary);pointer-events:none}
.wr-page h1{font-size:1.9em;margin:.5em 0 .25em;line-height:1.2;font-weight:700}
.wr-page h2{font-size:1.45em;margin:.55em 0 .25em;line-height:1.25;font-weight:600}
.wr-page h3{font-size:1.15em;margin:.5em 0 .2em;font-weight:600}
.wr-page p{margin:.35em 0}
.wr-page ul,.wr-page ol{margin:.35em 0;padding-left:1.5em}
.wr-page li{margin:.15em 0}
.wr-page a{color:var(--color-active)}
.wr-page blockquote{border-left:3px solid var(--color-active);margin:.5em 0;padding:2px 0 2px 14px;color:var(--text-secondary);font-style:italic}
.wr-page hr{border:none;border-top:1px solid var(--win-border);margin:1em 0}
.wr-page table{border-collapse:collapse;width:100%;margin:.5em 0}
.wr-page td,.wr-page th{border:1px solid var(--win-border);padding:5px 8px;text-align:left}
.wr-page th{background:color-mix(in srgb,var(--text-primary) 6%,transparent);font-weight:600}
.wr-foot{display:flex;align-items:center;gap:12px;padding:4px 10px;border-top:1px solid var(--win-border-in);font-size:10px;color:var(--text-secondary);flex-shrink:0}
  `
  document.head.appendChild(s)
}

export function initWriter(body) {
  injectStyles()

  body.innerHTML = `
<div class="wr-body">
  <div class="wr-toolbar" id="wr-tb">
    <select class="wr-sel" id="wr-block" title="Style de paragraphe">
      <option value="p">Paragraphe</option>
      <option value="h1">Titre 1</option>
      <option value="h2">Titre 2</option>
      <option value="h3">Titre 3</option>
      <option value="blockquote">Citation</option>
      <option value="pre">Code</option>
    </select>
    <select class="wr-sel" id="wr-font" title="Police">
      <option value="'Segoe UI',system-ui,sans-serif">Sans-serif</option>
      <option value="Georgia,'Times New Roman',serif">Serif</option>
      <option value="Consolas,'Courier New',monospace">Monospace</option>
    </select>
    <select class="wr-sel" id="wr-size" title="Taille">
      <option value="1">8pt</option>
      <option value="2">10pt</option>
      <option value="3" selected>12pt</option>
      <option value="4">14pt</option>
      <option value="5">18pt</option>
      <option value="6">24pt</option>
      <option value="7">36pt</option>
    </select>
    <div class="wr-sep"></div>
    <button class="wr-btn" data-cmd="bold"          title="Gras (Ctrl+B)"><i class="fa-solid fa-bold"></i></button>
    <button class="wr-btn" data-cmd="italic"        title="Italique (Ctrl+I)"><i class="fa-solid fa-italic"></i></button>
    <button class="wr-btn" data-cmd="underline"     title="Souligné (Ctrl+U)"><i class="fa-solid fa-underline"></i></button>
    <button class="wr-btn" data-cmd="strikeThrough" title="Barré"><i class="fa-solid fa-strikethrough"></i></button>
    <button class="wr-btn" id="wr-color-btn"        title="Couleur du texte"><i class="fa-solid fa-palette"></i><input type="color" id="wr-color" style="position:absolute;opacity:0;width:0;height:0;pointer-events:none"></button>
    <div class="wr-sep"></div>
    <button class="wr-btn" data-cmd="justifyLeft"   title="Aligner à gauche"><i class="fa-solid fa-align-left"></i></button>
    <button class="wr-btn" data-cmd="justifyCenter" title="Centrer"><i class="fa-solid fa-align-center"></i></button>
    <button class="wr-btn" data-cmd="justifyRight"  title="Aligner à droite"><i class="fa-solid fa-align-right"></i></button>
    <button class="wr-btn" data-cmd="justifyFull"   title="Justifier"><i class="fa-solid fa-align-justify"></i></button>
    <div class="wr-sep"></div>
    <button class="wr-btn" data-cmd="insertUnorderedList" title="Liste à puces"><i class="fa-solid fa-list-ul"></i></button>
    <button class="wr-btn" data-cmd="insertOrderedList"   title="Liste numérotée"><i class="fa-solid fa-list-ol"></i></button>
    <button class="wr-btn" data-cmd="outdent" title="Désindenter"><i class="fa-solid fa-outdent"></i></button>
    <button class="wr-btn" data-cmd="indent"  title="Indenter"><i class="fa-solid fa-indent"></i></button>
    <div class="wr-sep"></div>
    <button class="wr-btn" id="wr-link"                    title="Insérer un lien"><i class="fa-solid fa-link"></i></button>
    <button class="wr-btn" data-cmd="insertHorizontalRule" title="Ligne de séparation"><i class="fa-solid fa-minus"></i></button>
    <button class="wr-btn" data-cmd="removeFormat"         title="Effacer la mise en forme"><i class="fa-solid fa-text-slash"></i></button>
    <div class="wr-spacer"></div>
    <button class="wr-btn" id="wr-export" title="Exporter (Ctrl+S)"><i class="fa-solid fa-file-export"></i></button>
  </div>
  <div class="wr-page-wrap">
    <div class="wr-page" id="wr-page" contenteditable="true" data-ph="Commencez à écrire…" spellcheck="true"></div>
  </div>
  <div class="wr-foot"><span id="wr-count">0 mot · 0 caractère</span><span id="wr-saved" style="margin-left:auto;opacity:0;transition:opacity .5s"></span></div>
</div>
  `

  const page     = body.querySelector('#wr-page')
  const countEl  = body.querySelector('#wr-count')
  const savedEl  = body.querySelector('#wr-saved')
  const blockSel = body.querySelector('#wr-block')
  const fontSel  = body.querySelector('#wr-font')
  const sizeSel  = body.querySelector('#wr-size')
  const colorIn  = body.querySelector('#wr-color')

  // ── Restore ─────────────────────────────────────────────────────────────────
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) page.innerHTML = saved
  } catch {}

  // ── Save & count ────────────────────────────────────────────────────────────
  let saveTimer, savedFadeTimer
  function onChange() {
    const text = page.innerText || ''
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    countEl.textContent = `${words} mot${words !== 1 ? 's' : ''} · ${text.length} caractère${text.length !== 1 ? 's' : ''}`
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, page.innerHTML) } catch {}
      savedEl.textContent = 'Sauvegardé'; savedEl.style.opacity = '1'
      clearTimeout(savedFadeTimer)
      savedFadeTimer = setTimeout(() => { savedEl.style.opacity = '0' }, 1800)
    }, 500)
  }
  page.addEventListener('input', onChange)

  // ── Toolbar state sync ───────────────────────────────────────────────────────
  function syncToolbar() {
    body.querySelectorAll('.wr-btn[data-cmd]').forEach(btn => {
      try { btn.classList.toggle('on', document.queryCommandState(btn.dataset.cmd)) } catch {}
    })
    try {
      const blk = document.queryCommandValue('formatBlock').toLowerCase().replace(/heading (\d)/, 'h$1')
      blockSel.value = ['h1','h2','h3','blockquote','pre'].includes(blk) ? blk : 'p'
    } catch {}
  }
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === page) syncToolbar()
  })

  // ── Toolbar buttons ──────────────────────────────────────────────────────────
  body.querySelectorAll('.wr-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault()
      document.execCommand(btn.dataset.cmd, false, null)
      onChange()
    })
  })

  blockSel.addEventListener('change', () => {
    document.execCommand('formatBlock', false, blockSel.value)
    page.focus(); onChange()
  })

  fontSel.addEventListener('change', () => {
    document.execCommand('fontName', false, fontSel.value)
    page.focus(); onChange()
  })

  sizeSel.addEventListener('change', () => {
    document.execCommand('fontSize', false, sizeSel.value)
    page.focus(); onChange()
  })

  // Color picker
  body.querySelector('#wr-color-btn').addEventListener('mousedown', e => {
    e.preventDefault(); colorIn.click()
  })
  colorIn.addEventListener('input', () => {
    document.execCommand('foreColor', false, colorIn.value)
    onChange()
  })

  // Link
  body.querySelector('#wr-link').addEventListener('mousedown', e => {
    e.preventDefault()
    const url = prompt('URL du lien :')
    if (url) { document.execCommand('createLink', false, url); onChange() }
  })

  // ── Paste: strip external inline styles ─────────────────────────────────────
  page.addEventListener('paste', e => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    if (html) {
      const clean = html
        .replace(/\s+style="[^"]*"/gi, '')
        .replace(/\s+class="[^"]*"/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      document.execCommand('insertHTML', false, clean)
    } else {
      document.execCommand('insertText', false, text)
    }
    onChange()
  })

  // ── Export ───────────────────────────────────────────────────────────────────
  async function doExport() {
    const pageHtml = page.innerHTML
    const fullHtml = [
      '<!DOCTYPE html>',
      '<html><head><meta charset="utf-8"><title>Document</title>',
      '<style>body{max-width:720px;margin:48px auto;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.75;color:#1a1a1a}h1{font-size:1.9em}h2{font-size:1.45em}h3{font-size:1.15em}a{color:#6040c0}blockquote{border-left:3px solid #6040c0;margin:.5em 0;padding:2px 0 2px 14px;color:#555;font-style:italic}hr{border:none;border-top:1px solid #ccc}</style>',
      '</head><body>',
      pageHtml,
      '</body></html>'
    ].join('\n')

    if (!window.__TAURI__) {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([fullHtml], { type: 'text/html' })),
        download: 'document.html'
      })
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return
    }
    try {
      const { save } = window.__TAURI__.dialog
      const path = await save({
        defaultPath: 'document.html',
        filters: [
          { name: 'HTML', extensions: ['html'] },
          { name: 'Texte brut', extensions: ['txt'] }
        ]
      })
      if (!path) return
      const content = path.toLowerCase().endsWith('.txt') ? (page.innerText || '') : fullHtml
      await window.__TAURI__.core.invoke('save_text_file', { path, content })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: path.replace(/[\\/][^\\/]*$/, '') } }))
      window.toast?.('Exporté', 'success')
    } catch (err) { window.toast?.(String(err?.message ?? err), 'error') }
  }

  body.querySelector('#wr-export').addEventListener('mousedown', e => { e.preventDefault(); doExport() })

  // ── Click and Type : clic sous le contenu → insère des lignes ───────────────
  page.addEventListener('click', e => {
    const lineH = parseFloat(getComputedStyle(page).lineHeight) || 22

    // Mesure le bas du contenu existant via un span temporaire en fin de div
    const probe = document.createElement('span')
    probe.textContent = '​'
    probe.style.cssText = 'position:absolute;visibility:hidden'
    page.appendChild(probe)
    const probeRect = probe.getBoundingClientRect()
    page.removeChild(probe)
    const contentBottom = probeRect.bottom

    // Si le clic est dans ou au-dessus du contenu, le navigateur gère
    if (e.clientY <= contentBottom + lineH * 0.4) return

    // Clic en dessous du contenu : amener le curseur jusqu'à la ligne cliquée
    page.focus()
    const range = document.createRange()
    range.selectNodeContents(page)
    range.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    const lines = Math.min(Math.round((e.clientY - contentBottom) / lineH), 80)
    for (let i = 0; i < lines; i++) {
      document.execCommand('insertParagraph', false, null)
    }
    document.execCommand('justifyLeft', false, null)
    onChange()
  })

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  // Ctrl+B/I/U handled natively by contenteditable; only need Ctrl+S
  page.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); doExport() }
  })

  // ── Project persistence ──────────────────────────────────────────────────────
  registerTool('writer', {
    getState: () => ({ html: page.innerHTML }),
    setState: s => { if (s?.html != null) { page.innerHTML = s.html; onChange() } }
  })

  onChange()

  // ── Teardown ─────────────────────────────────────────────────────────────────
  new MutationObserver((_, obs) => {
    if (!document.contains(body)) {
      clearTimeout(saveTimer); clearTimeout(savedFadeTimer)
      obs.disconnect()
    }
  }).observe(document.body, { childList: true, subtree: true })
}
