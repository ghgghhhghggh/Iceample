import { t } from './i18n.js'

export function initImporter(body) {
  body.classList.add('imp-body')

  const root = localStorage.getItem('library:root')
  const sep  = root?.includes('\\') ? '\\' : '/'

  body.innerHTML = `
    <div class="imp-tabs">
      <button class="imp-tab active" id="imp-tab-file">
        <i class="fa-solid fa-file-audio"></i> ${t('imp_tab_file')}
      </button>
      <button class="imp-tab" id="imp-tab-url">
        <i class="fa-solid fa-link"></i> ${t('imp_tab_url')}
      </button>
    </div>

    <div class="imp-panel" id="imp-panel-file">
      <div class="imp-drop-zone" id="imp-drop-zone">
        <i class="fa-solid fa-arrow-up-from-bracket"></i>
        <span>${t('imp_drop_hint')}</span>
        <button class="imp-pick-btn" id="imp-pick">
          <i class="fa-solid fa-folder-open"></i> ${t('imp_pick_btn')}
        </button>
      </div>
      <div class="imp-queue" id="imp-queue"></div>
      <div class="imp-file-footer">
        <button class="seq-btn" id="imp-import-btn" disabled title="${t('imp_import_title')}">
          <i class="fa-solid fa-file-import"></i>
        </button>
        <span class="imp-status" id="imp-file-status"></span>
      </div>
    </div>

    <div class="imp-panel hidden" id="imp-panel-url">
      <div class="imp-url-form">
        <label class="imp-url-label">${t('imp_url_label')}</label>
        <input class="imp-url-input" id="imp-url" type="text"
          placeholder="https://www.youtube.com/watch?v=…" autocomplete="off" spellcheck="false" />
        <div class="imp-url-note">
          <i class="fa-solid fa-circle-info"></i>
          ${t('imp_url_note')}<a class="imp-link" id="imp-sites-link">${t('imp_url_sites')}</a>.
        </div>
        <div class="imp-url-legal">
          <i class="fa-solid fa-scale-balanced"></i>
          <span>${t('imp_legal_note')}</span>
        </div>
      </div>
        <div class="imp-update-bar" id="imp-update-bar" style="display:none">
        <i class="fa-solid fa-triangle-exclamation" style="color:#f0a500"></i>
        <span id="imp-update-msg">${t('imp_ytdlp_outdated')}</span>
        <button class="imp-update-btn" id="imp-update-btn">
          <i class="fa-solid fa-rotate"></i> ${t('imp_ytdlp_update')}
        </button>
      </div>
      <div class="imp-cookie-bar" id="imp-cookie-bar" style="display:none">
        <i class="fa-solid fa-key" style="color:#a78bfa"></i>
        <span>${t('imp_signin_tip')}</span>
        <select class="imp-browser-sel" id="imp-browser">
          <option value="">— ${t('imp_browser_none')} —</option>
          <option value="chrome">Chrome</option>
          <option value="edge">Edge</option>
          <option value="firefox">Firefox</option>
          <option value="brave">Brave</option>
          <option value="opera">Opera</option>
        </select>
        <button class="imp-cookie-btn" id="imp-cookie-btn">
          <i class="fa-solid fa-rotate-right"></i>
        </button>
      </div>
      <div class="imp-url-footer">
        <button class="seq-btn" id="imp-dl-btn" title="${t('imp_dl_title')}">
          <i class="fa-solid fa-download"></i>
        </button>
        <span class="imp-status" id="imp-url-status"></span>
      </div>
    </div>
  `

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabFile    = body.querySelector('#imp-tab-file')
  const tabUrl     = body.querySelector('#imp-tab-url')
  const panelFile  = body.querySelector('#imp-panel-file')
  const panelUrl   = body.querySelector('#imp-panel-url')

  tabFile.addEventListener('click', () => {
    tabFile.classList.add('active'); tabUrl.classList.remove('active')
    panelFile.classList.remove('hidden'); panelUrl.classList.add('hidden')
  })
  tabUrl.addEventListener('click', () => {
    tabUrl.classList.add('active'); tabFile.classList.remove('active')
    panelUrl.classList.remove('hidden'); panelFile.classList.add('hidden')
    setTimeout(() => body.querySelector('#imp-url').focus(), 50)
  })

  // ── Onglet Fichier ────────────────────────────────────────────────────────
  const dropZone   = body.querySelector('#imp-drop-zone')
  const queue      = body.querySelector('#imp-queue')
  const btnPick    = body.querySelector('#imp-pick')
  const btnImport  = body.querySelector('#imp-import-btn')
  const fileStatus = body.querySelector('#imp-file-status')

  let pending = [] // [{ name, path }]

  function refreshQueue() {
    queue.innerHTML = ''
    pending.forEach((f, i) => {
      const row = document.createElement('div')
      row.className = 'imp-queue-row'
      row.innerHTML = `
        <i class="fa-solid fa-music imp-queue-icon"></i>
        <span class="imp-queue-name">${f.name}</span>
        <button class="imp-queue-del" data-i="${i}"><i class="fa-solid fa-xmark"></i></button>
      `
      row.querySelector('.imp-queue-del').addEventListener('click', () => {
        pending.splice(i, 1); refreshQueue()
      })
      queue.appendChild(row)
    })
    btnImport.disabled = pending.length === 0
    fileStatus.textContent = ''
  }

  btnPick.addEventListener('click', async () => {
    if (!window.__TAURI__) return
    const { invoke } = window.__TAURI__.core
    const files = await invoke('pick_multiple_audio_files')
    files.forEach(f => { if (!pending.find(p => p.path === f.path)) pending.push(f) })
    refreshQueue()
  })

  btnImport.addEventListener('click', async () => {
    if (!root || !window.__TAURI__) return
    const { invoke } = window.__TAURI__.core
    btnImport.disabled = true
    fileStatus.textContent = ''
    let ok = 0, fail = 0
    for (const f of pending) {
      const dst = root + sep + 'Importés' + sep + f.name
      try {
        await invoke('copy_file', { src: f.path, dst })
        ok++
      } catch { fail++ }
    }
    pending = []
    refreshQueue()
    fileStatus.textContent = fail === 0
      ? `✓ ${ok} ${t('imp_imported')}`
      : `✓ ${ok}  ✗ ${fail}`
    fileStatus.style.color = fail === 0 ? 'var(--color-active)' : '#ff8c42'
  })

  // ── Onglet URL ────────────────────────────────────────────────────────────
  const urlInput   = body.querySelector('#imp-url')
  const btnDl      = body.querySelector('#imp-dl-btn')
  const urlStatus  = body.querySelector('#imp-url-status')
  const updateBar  = body.querySelector('#imp-update-bar')
  const updateMsg  = body.querySelector('#imp-update-msg')
  const btnUpdate  = body.querySelector('#imp-update-btn')
  const cookieBar  = body.querySelector('#imp-cookie-bar')
  const browserSel = body.querySelector('#imp-browser')
  const btnCookie  = body.querySelector('#imp-cookie-btn')

  const savedBrowser = localStorage.getItem('iceample:ytdlp-browser') || ''
  if (savedBrowser) browserSel.value = savedBrowser

  browserSel.addEventListener('change', () => {
    localStorage.setItem('iceample:ytdlp-browser', browserSel.value)
  })

  function showCookieBar() {
    cookieBar.style.display = 'flex'
  }

  btnCookie.addEventListener('click', async () => {
    const url = urlInput.value.trim()
    if (!url || !root || !window.__TAURI__) return
    btnDl.disabled = true
    try { await doDownload(url, root + sep + 'Importés', false) }
    finally { btnDl.disabled = false }
  })

  body.querySelector('#imp-sites-link').addEventListener('click', () => {
    if (window.__TAURI__) window.__TAURI__.opener.openUrl('https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md').catch(() => {})
  })

  function showUpdateBar(msg) {
    updateBar.style.display = 'flex'
    updateMsg.textContent = msg || t('imp_ytdlp_outdated')
  }

  btnUpdate.addEventListener('click', () => runUpdate())

  async function runUpdate() {
    if (!window.__TAURI__) return false
    btnUpdate.disabled = true
    btnUpdate.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('imp_ytdlp_updating')}`
    urlStatus.textContent = t('imp_ytdlp_updating')
    urlStatus.style.color = 'var(--text-secondary)'
    try {
      const result = await window.__TAURI__.core.invoke('update_ytdlp')
      const isUpToDate = result.includes('up-to-date') || result.includes('à jour')
      updateBar.style.display = 'none'
      urlStatus.textContent = isUpToDate ? `✓ yt-dlp ${t('imp_ytdlp_uptodate')}` : `✓ yt-dlp ${t('imp_ytdlp_updated')}`
      urlStatus.style.color = 'var(--color-active)'
      return true
    } catch {
      urlStatus.textContent = `✗ ${t('imp_ytdlp_update_fail')}`
      urlStatus.style.color = '#ff5555'
      return false
    } finally {
      btnUpdate.disabled = false
      btnUpdate.innerHTML = `<i class="fa-solid fa-rotate"></i> ${t('imp_ytdlp_update')}`
    }
  }

  async function doDownload(url, outputDir, autoUpdated) {
    const { invoke } = window.__TAURI__.core
    const browser = browserSel.value || null
    urlStatus.textContent = t('imp_downloading')
    urlStatus.style.color = 'var(--text-secondary)'
    try {
      const filename = await invoke('download_audio_yt', { url, outputDir, browser })
      urlInput.value = ''
      updateBar.style.display = 'none'
      urlStatus.textContent = `✓ ${filename} importé`
      urlStatus.style.color = 'var(--color-active)'
    } catch(e) {
      const msg = String(e)
      const isOutdated  = msg.includes('older than') || msg.includes('strongly recommended') || msg.includes('yt-dlp -U')
      const noJsRuntime = msg.includes('No supported JavaScript runtime') || msg.includes('js-runtimes')
      const isSignIn    = msg.includes('Sign in to confirm') || msg.includes('--cookies-from-browser')
      if (isOutdated && !autoUpdated) {
        const ok = await runUpdate()
        if (ok) { await doDownload(url, outputDir, true); return }
        showUpdateBar(t('imp_ytdlp_outdated'))
      } else {
        if (isOutdated) showUpdateBar(t('imp_ytdlp_outdated'))
        if (isSignIn) {
          showCookieBar()
          urlStatus.textContent = `✗ ${t('imp_signin_tip')}`
        } else if (noJsRuntime) {
          urlStatus.textContent = `✗ ${t('imp_ytdlp_no_jsruntime')}`
        } else {
          const lines = msg.split('\n').filter(l => /^\s*(ERROR:|error:)/i.test(l) || l.includes('Unable to download'))
          urlStatus.textContent = lines.length ? '✗ ' + lines[0].replace(/^.*?error:\s*/i, '') : '✗ ' + t('imp_download_error')
        }
        urlStatus.style.color = '#ff5555'
      }
    }
  }

  btnDl.addEventListener('click', async () => {
    const url = urlInput.value.trim()
    if (!url || !root || !window.__TAURI__) return
    btnDl.disabled = true
    try { await doDownload(url, root + sep + 'Importés', false) }
    finally { btnDl.disabled = false }
  })

  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnDl.click() })
}
