import { t } from './i18n.js'
import { routeMedia } from './devices.js'

export function initSearch(body) {
  body.classList.add('search-body')

  const root = localStorage.getItem('library:root')

  if (!root) {
    body.innerHTML = `
      <div class="search-empty">
        <i class="fa-solid fa-folder-open"></i>
        <span>${t('search_not_configured')}</span>
      </div>`
    return
  }

  body.innerHTML = `
    <div class="search-input-wrap">
      <i class="fa-solid fa-magnifying-glass search-icon"></i>
      <input class="search-input" id="sr-input" type="text" placeholder="${t('search_placeholder')}" autocomplete="off" spellcheck="false" />
    </div>
    <div class="search-results" id="sr-results">
      <div class="search-hint"><i class="fa-solid fa-magnifying-glass"></i> ${t('search_hint')}</div>
    </div>
  `

  const input   = body.querySelector('#sr-input')
  const results = body.querySelector('#sr-results')

  let debounce    = null
  let currentAudio = null
  let currentItem  = null

  setTimeout(() => input.focus(), 60)

  input.addEventListener('input', () => {
    clearTimeout(debounce)
    const q = input.value.trim()
    if (!q) {
      stopAudio()
      results.innerHTML = '<div class="search-hint"><i class="fa-solid fa-magnifying-glass"></i> Tapez pour rechercher</div>'
      return
    }
    debounce = setTimeout(() => doSearch(q), 220)
  })

  async function doSearch(q) {
    stopAudio()
    results.innerHTML = `<div class="search-hint"><i class="fa-solid fa-spinner fa-spin"></i> ${t('search_searching')}</div>`

    if (!window.__TAURI__) {
      results.innerHTML = `<div class="search-hint"><i class="fa-solid fa-triangle-exclamation"></i> ${t('search_app_only')}</div>`
      return
    }

    const { invoke } = window.__TAURI__.core
    const files = await invoke('search_library', { root, query: q })

    if (!files.length) {
      results.innerHTML = `<div class="search-hint"><i class="fa-solid fa-face-meh"></i> ${t('search_no_results')}</div>`
      return
    }

    results.innerHTML = ''
    files.forEach(f => results.appendChild(buildItem(f)))
  }

  function buildItem(f) {
    const isSeq  = f.name.endsWith('.iceseq')
    const isDaw  = f.name.endsWith('.icedaw')
    const isMic  = f.name.endsWith('.icemic')
    const isProj = isSeq || isDaw || isMic
    const icon   = isSeq ? 'fa-table-cells' : isDaw ? 'fa-film' : isMic ? 'fa-microphone' : 'fa-music'

    const item = document.createElement('div')
    item.className = 'search-result-item'
    item.innerHTML = `
      <i class="fa-solid ${icon} search-result-icon"></i>
      <span class="search-result-name" title="${f.name}">${f.name}</span>
      <span class="search-folder-badge">${f.folder}</span>
    `

    if (!isProj) {
      item.addEventListener('click', e => {
        if (item.classList.contains('dragging')) return
        togglePreview(item, f)
      })
    }

    makeDraggable(item, f, icon)
    return item
  }

  async function togglePreview(item, f) {
    if (currentAudio && currentItem === item) {
      stopAudio()
      return
    }
    stopAudio()
    if (!window.__TAURI__) return

    currentItem = item
    item.classList.add('playing')

    try {
      const { invoke } = window.__TAURI__.core
      const b64    = await invoke('read_file_base64', { path: f.path })
      const binary = atob(b64)
      const bytes  = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const ext  = f.name.split('.').pop().toLowerCase()
      const mime = { wav:'audio/wav', mp3:'audio/mpeg', ogg:'audio/ogg', flac:'audio/flac', aiff:'audio/aiff', aif:'audio/aiff', m4a:'audio/mp4' }[ext] || 'audio/wav'
      const url  = URL.createObjectURL(new Blob([bytes], { type: mime }))

      currentAudio = new Audio(url)
      routeMedia(currentAudio)
      currentAudio.addEventListener('ended', () => {
        item.classList.remove('playing')
        URL.revokeObjectURL(url)
        currentAudio = null
        currentItem  = null
      })
      currentAudio.play()
    } catch {
      item.classList.remove('playing')
      currentItem = null
    }
  }

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    if (currentItem) {
      currentItem.classList.remove('playing')
      currentItem = null
    }
  }

  function makeDraggable(item, f, icon) {
    item.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.preventDefault()
      const fileData = { name: f.name, path: f.path }
      const label    = f.name.length > 26 ? f.name.slice(0, 24) + '…' : f.name
      let ghost = null, dragging = false
      const sx = e.clientX, sy = e.clientY

      function onMove(ev) {
        if (!dragging) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
          dragging = true
          ghost = document.createElement('div')
          ghost.className = 'lib-drag-ghost'
          ghost.innerHTML = `<i class="fa-solid ${icon}"></i><span>${label}</span>`
          document.body.appendChild(ghost)
          item.classList.add('dragging')
          stopAudio()
        }
        ghost.style.left = (ev.clientX + 14) + 'px'
        ghost.style.top  = (ev.clientY - 14) + 'px'
        const under = document.elementFromPoint(ev.clientX, ev.clientY)
        const lane  = under?.closest('.daw-lane')
        document.querySelectorAll('.daw-lane').forEach(l => l.classList.toggle('drag-over', l === lane))
      }

      function onUp(ev) {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.querySelectorAll('.daw-lane').forEach(l => l.classList.remove('drag-over'))
        item.classList.remove('dragging')
        if (ghost) ghost.remove()
        if (!dragging) return
        document.addEventListener('click', e => e.stopPropagation(), { once: true, capture: true })
        const under = document.elementFromPoint(ev.clientX, ev.clientY)
        if (under) {
          under.dispatchEvent(new CustomEvent('iceample-drop', {
            bubbles: true,
            detail: { file: fileData, clientX: ev.clientX, clientY: ev.clientY }
          }))
        }
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  }
}
