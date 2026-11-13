// patterns.js — Générateur de motifs seamless
import { t } from './i18n.js'
import { showPalPicker } from './palettes.js'
import { makeSendButton, imageMedia } from './media-bus.js'
import { promptName } from './rename-dialog.js'

export function initPatterns(body) {
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--surface);font-size:12px;font-family:inherit;'

  const PATTERN_LIST = [
    { id:'lignes',    key:'pat_lines' },
    { id:'grille',    key:'pat_grid' },
    { id:'points',    key:'pat_dots' },
    { id:'damier',    key:'pat_checker' },
    { id:'hexagones', key:'pat_hex' },
    { id:'triangles', key:'pat_tri' },
    { id:'chevrons',  key:'pat_chevrons' },
    { id:'diamants',  key:'pat_diamonds' },
    { id:'zigzag',    key:'pat_zigzag' },
    { id:'vagues',    key:'pat_waves' },
    { id:'pointille', key:'pat_dotted' },
    { id:'croix',     key:'pat_cross' },
  ]

  let state = {
    pattern: 'hexagones',
    col1: '#4a9eff',
    col2: '#111111',
    size: 40,
    strokeW: 2,
    rotation: 0,
    opacity1: 1,
    transparent: false,
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  const STATE_LS = 'iceample:patterns:state'
  const STATE_KEYS = ['pattern', 'col1', 'col2', 'size', 'strokeW', 'rotation', 'opacity1', 'transparent']
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_LS))
    if (saved && typeof saved === 'object') {
      for (const k of STATE_KEYS) if (saved[k] !== undefined) state[k] = saved[k]
    }
  } catch {}
  if (!PATTERN_LIST.some(p => p.id === state.pattern)) state.pattern = 'hexagones'
  function saveState() {
    const out = {}
    for (const k of STATE_KEYS) out[k] = state[k]
    try { localStorage.setItem(STATE_LS, JSON.stringify(out)) } catch {}
  }

  // Widget → UI sync registry: each control registers a function that pulls the
  // current state back into its input (used by presets / randomize / restore).
  const widgetSync = []
  const syncWidgets = () => { for (const f of widgetSync) f() }

  // ── Layout ─────────────────────────────────────────────────────────────────
  const topBar = document.createElement('div')
  topBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--win-border-in,#1e1e1e);flex-shrink:0;flex-wrap:wrap;'

  const main = document.createElement('div')
  main.style.cssText = 'display:flex;flex:1;overflow:hidden;'

  const canvasWrap = document.createElement('div')
  canvasWrap.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg,#0a0a0a);min-width:0;overflow:hidden;'

  const canvas = document.createElement('canvas')
  canvas.width = 420; canvas.height = 360
  canvas.style.cssText = 'display:block;max-width:100%;max-height:100%;'
  const ctx = canvas.getContext('2d')
  canvasWrap.appendChild(canvas)
  let previewCssW = 420   // CSS width of the preview (WYSIWYG export scale reference)

  const panel = document.createElement('div')
  panel.style.cssText = 'width:200px;flex-shrink:0;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-left:1px solid var(--win-border-in,#1e1e1e);background:var(--surface2,var(--surface));'

  main.append(canvasWrap, panel)
  body.append(topBar, main)

  // ── Top bar ────────────────────────────────────────────────────────────────
  const BTN = 'border:none;border-radius:5px;padding:5px 10px;cursor:pointer;font-size:11px;font-family:inherit;'
  const SEL = 'background:var(--surface2,var(--surface));border:1px solid var(--win-border-in,#1e1e1e);color:var(--text-primary,#ddd);border-radius:5px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:inherit;'

  // Pattern gallery: one small live thumbnail per pattern.
  const patRow = document.createElement('div')
  patRow.style.cssText = 'display:flex;gap:4px;overflow-x:auto;flex:1;min-width:120px;padding:2px 0;'
  const thumbs = []
  for (const p of PATTERN_LIST) {
    const tc = document.createElement('canvas')
    tc.width = 88; tc.height = 72
    tc.style.cssText = 'width:44px;height:36px;border-radius:5px;cursor:pointer;flex-shrink:0;border:2px solid var(--win-border,#2a2a2a);display:block;'
    tc.title = t(p.key)
    tc.addEventListener('click', () => { state.pattern = p.id; renderThumbs(); render(); saveState() })
    thumbs.push({ id: p.id, canvas: tc })
    patRow.appendChild(tc)
  }

  const sizeSel = document.createElement('select')
  sizeSel.style.cssText = SEL
  for (const s of [512, 1024, 2048]) {
    const o = document.createElement('option'); o.value = s; o.textContent = `${t('pat_export_size')} ${s}px`; sizeSel.appendChild(o)
  }
  sizeSel.value = '1024'

  const exportPngBtn = document.createElement('button')
  exportPngBtn.innerHTML = '<i class="fa-solid fa-download"></i> PNG'
  exportPngBtn.style.cssText = BTN + 'background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));border:1px solid var(--win-border,#444);color:var(--text-primary,#ddd);'

  const exportSvgBtn = document.createElement('button')
  exportSvgBtn.innerHTML = '<i class="fa-solid fa-code"></i> SVG'
  exportSvgBtn.style.cssText = BTN + 'background:var(--btn-primary);border:none;color:var(--on-accent);margin-left:auto;'

  // "Send to…" — ship the pattern (WYSIWYG scale, export size) to another tool.
  const sendBtn = makeSendButton(() => {
    const S = parseInt(sizeSel.value) || 1024
    const off = document.createElement('canvas'); off.width = S; off.height = S
    const prevSz = state.size
    state.size = state.size * (S / previewCssW)
    renderPattern(off.getContext('2d'), S, S)
    state.size = prevSz
    return imageMedia(off, 'motif-' + state.pattern)
  }, { self: 'patterns', className: '', iconOnly: true })
  sendBtn.style.cssText = BTN + 'background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));border:1px solid var(--win-border,#444);color:var(--text-primary,#ddd);'

  const randBtn = document.createElement('button')
  randBtn.innerHTML = '<i class="fa-solid fa-dice"></i>'
  randBtn.title = t('pat_random')
  randBtn.style.cssText = BTN + 'background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));border:1px solid var(--win-border,#444);color:var(--text-primary,#ddd);'

  topBar.append(patRow, sizeSel, exportPngBtn, sendBtn, randBtn, exportSvgBtn)

  // ── Panel controls ─────────────────────────────────────────────────────────
  function pLabel(text) {
    const d = document.createElement('div')
    d.style.cssText = 'font-size:10px;color:var(--text-secondary,#666);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;'
    d.textContent = text; return d
  }

  function colorCtrl(key, label) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;'
    const lbl = document.createElement('span'); lbl.style.cssText = 'font-size:11px;color:var(--text-secondary,#aaa);flex:1;'; lbl.textContent = label
    const pb = document.createElement('button')
    pb.innerHTML = '<i class="fa-solid fa-palette" style="font-size:10px"></i>'
    pb.style.cssText = 'width:24px;height:24px;border-radius:5px;border:1px solid var(--win-border,#2a2a2a);background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));color:var(--text-secondary,#aaa);cursor:pointer;padding:0;flex-shrink:0;'
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = state[key]
    inp.style.cssText = 'width:40px;height:24px;border:1px solid var(--win-border,#444);border-radius:4px;padding:1px;cursor:pointer;background:none;'
    inp.addEventListener('input', () => { state[key] = inp.value; render(); renderThumbs(); saveState() })
    pb.addEventListener('click', () => showPalPicker(pb, c => { state[key] = c; inp.value = c; render(); renderThumbs(); saveState() }))
    wrap.append(lbl, pb, inp); panel.appendChild(wrap)
    widgetSync.push(() => { inp.value = state[key] })
    return inp
  }

  function rangeCtrl(key, label, min, max, step, decimals = 0) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;'
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary,#aaa);'
    const lbl = document.createElement('span'); lbl.textContent = label
    const val = document.createElement('span'); val.style.cssText = 'color:var(--text-primary,#ddd);font-weight:500;'; val.textContent = state[key].toFixed(decimals)
    row.append(lbl, val)
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = state[key]
    inp.style.cssText = 'width:100%;accent-color:var(--slider-color);'
    inp.addEventListener('input', () => { state[key] = parseFloat(inp.value); val.textContent = state[key].toFixed(decimals); render(); saveState() })
    wrap.append(row, inp); panel.appendChild(wrap)
    widgetSync.push(() => { inp.value = state[key]; val.textContent = state[key].toFixed(decimals) })
    return inp
  }

  // ── Presets ────────────────────────────────────────────────────────────────
  const PRESETS_LS = 'iceample:patterns:presets'
  const loadPresets = () => { try { const p = JSON.parse(localStorage.getItem(PRESETS_LS)); return Array.isArray(p) ? p : [] } catch { return [] } }
  const savePresets = p => { try { localStorage.setItem(PRESETS_LS, JSON.stringify(p)) } catch {} }
  const BUILTIN_PRESETS = [
    { name: 'Néon',      pattern: 'hexagones', col1: '#22d3ee', col2: '#0b1020', size: 44, strokeW: 2,   rotation: 0,  opacity1: 1,    transparent: false },
    { name: 'Blueprint', pattern: 'grille',    col1: '#7fb4ff', col2: '#0a2540', size: 24, strokeW: 1,   rotation: 0,  opacity1: 0.85, transparent: false },
    { name: 'Pop',       pattern: 'points',    col1: '#ff6b9d', col2: '#241726', size: 32, strokeW: 2,   rotation: 15, opacity1: 1,    transparent: false },
    { name: 'Zeste',     pattern: 'zigzag',    col1: '#8ed531', col2: '#101a08', size: 28, strokeW: 3,   rotation: 0,  opacity1: 1,    transparent: false },
    { name: 'Menthe',    pattern: 'vagues',    col1: '#34d399', col2: '#06231c', size: 36, strokeW: 2,   rotation: 0,  opacity1: 0.9,  transparent: false },
    { name: 'Sable',     pattern: 'chevrons',  col1: '#e8c07d', col2: '#2b2117', size: 30, strokeW: 1.5, rotation: 45, opacity1: 1,    transparent: false },
  ]
  const CHIP = 'display:inline-flex;align-items:center;gap:5px;border:1px solid var(--win-border,#2a2a2a);border-radius:99px;padding:3px 9px;background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));color:var(--text-secondary,#aaa);font-size:10px;cursor:pointer;font-family:inherit;'
  panel.append(pLabel(t('pat_presets')))
  const presetRow = document.createElement('div')
  presetRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;'
  panel.appendChild(presetRow)

  function applyPreset(p) {
    for (const k of STATE_KEYS) if (p[k] !== undefined) state[k] = p[k]
    if (!PATTERN_LIST.some(q => q.id === state.pattern)) state.pattern = 'hexagones'
    syncWidgets(); render(); renderThumbs(); saveState()
  }
  function buildPresetChips() {
    presetRow.innerHTML = ''
    const users = loadPresets()
    for (const p of BUILTIN_PRESETS) {
      const chip = document.createElement('button')
      chip.style.cssText = CHIP
      chip.textContent = p.name
      chip.addEventListener('click', () => applyPreset(p))
      presetRow.appendChild(chip)
    }
    users.forEach((p, i) => {
      const chip = document.createElement('button')
      chip.style.cssText = CHIP
      const nm = document.createElement('span'); nm.textContent = p.name
      const x = document.createElement('i')
      x.className = 'fa-solid fa-xmark'
      x.style.cssText = 'font-size:8px;opacity:.55;'
      x.addEventListener('click', e => { e.stopPropagation(); users.splice(i, 1); savePresets(users); buildPresetChips() })
      chip.append(nm, x)
      chip.addEventListener('click', () => applyPreset(p))
      presetRow.appendChild(chip)
    })
    const save = document.createElement('button')
    save.style.cssText = CHIP + 'border-style:dashed;'
    save.innerHTML = '<i class="fa-solid fa-floppy-disk" style="font-size:9px"></i>'
    save.title = t('pat_preset_save')
    save.addEventListener('click', async () => {
      const name = await promptName(t(PATTERN_LIST.find(q => q.id === state.pattern)?.key || 'pat_presets'), { title: t('pat_preset_save') })
      if (name == null || !name.trim()) return
      const p = { name: name.trim() }
      for (const k of STATE_KEYS) p[k] = state[k]
      const list = loadPresets(); list.push(p); savePresets(list); buildPresetChips()
    })
    presetRow.appendChild(save)
  }
  buildPresetChips()

  panel.append(pLabel(t('pat_colors')))
  const c1Inp = colorCtrl('col1', t('pat_color1'))
  // Swap the two colours (⇄)
  const swapRow = document.createElement('div')
  swapRow.style.cssText = 'display:flex;justify-content:flex-end;margin:-4px 0;'
  const swapBtn = document.createElement('button')
  swapBtn.innerHTML = '<i class="fa-solid fa-right-left"></i>'
  swapBtn.title = t('pat_swap')
  swapBtn.style.cssText = 'width:24px;height:20px;border:1px solid var(--win-border,#2a2a2a);border-radius:5px;background:none;color:var(--text-secondary,#aaa);cursor:pointer;font-size:9px;padding:0;'
  swapBtn.addEventListener('click', () => {
    const c = state.col1; state.col1 = state.col2; state.col2 = c
    c1Inp.value = state.col1; c2Inp.value = state.col2
    render(); renderThumbs(); saveState()
  })
  swapRow.appendChild(swapBtn)
  panel.appendChild(swapRow)
  const c2Inp = colorCtrl('col2', t('pat_color2'))
  panel.append(pLabel(t('pat_settings')))
  rangeCtrl('size',    t('pat_size'),     8, 120, 1)
  rangeCtrl('strokeW', t('pat_stroke'),   1,  20, 0.5, 1)
  rangeCtrl('rotation',t('pat_rotation'), 0, 360, 1)
  rangeCtrl('opacity1',t('pat_opacity'),0.1,   1, 0.05, 2)

  // Transparent background (checkerboard shown behind the preview canvas)
  const CHECKER = 'repeating-conic-gradient(color-mix(in srgb,var(--text-primary) 13%,transparent) 0% 25%, color-mix(in srgb,var(--text-primary) 4.5%,transparent) 0% 50%) 0 0 / 16px 16px'
  const updateChecker = () => { canvas.style.background = state.transparent ? CHECKER : 'none' }
  const trWrap = document.createElement('label')
  trWrap.style.cssText = 'display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text-secondary,#aaa);cursor:pointer;'
  const trCb = document.createElement('input')
  trCb.type = 'checkbox'
  trCb.checked = state.transparent
  trCb.style.cssText = 'accent-color:var(--color-active,#4a9eff);margin:0;'
  trCb.addEventListener('change', () => { state.transparent = trCb.checked; updateChecker(); render(); renderThumbs(); saveState() })
  const trLbl = document.createElement('span'); trLbl.textContent = t('pat_transparent')
  trWrap.append(trCb, trLbl)
  panel.appendChild(trWrap)
  widgetSync.push(() => { trCb.checked = state.transparent; updateChecker() })
  updateChecker()

  // ── Pattern drawing ────────────────────────────────────────────────────────

  function renderPattern(targetCtx, W, H) {
    const { pattern, col1, col2, size: sz, strokeW: sw, rotation: rot, opacity1: op, transparent } = state

    if (transparent) {
      targetCtx.clearRect(0, 0, W, H)
    } else {
      targetCtx.fillStyle = col2
      targetCtx.fillRect(0, 0, W, H)
    }

    targetCtx.save()
    targetCtx.translate(W / 2, H / 2)
    targetCtx.rotate((rot * Math.PI) / 180)
    targetCtx.translate(-W / 2, -H / 2)

    targetCtx.globalAlpha = op
    targetCtx.strokeStyle = col1
    targetCtx.fillStyle   = col1
    targetCtx.lineWidth   = sw

    const M = Math.max(W, H) * 1.5  // margin to cover rotated corners
    const OX = W / 2 - M / 2
    const OY = H / 2 - M / 2

    switch (pattern) {

      case 'lignes': {
        const h = sz * 0.5
        for (let y = -M; y < M * 2; y += sz) {
          targetCtx.fillRect(OX, OY + y, M, h)
        }
        break
      }

      case 'grille': {
        targetCtx.beginPath()
        for (let x = -M; x < M * 2; x += sz) {
          targetCtx.moveTo(OX + x, OY - M); targetCtx.lineTo(OX + x, OY + M * 2)
        }
        for (let y = -M; y < M * 2; y += sz) {
          targetCtx.moveTo(OX - M, OY + y); targetCtx.lineTo(OX + M * 2, OY + y)
        }
        targetCtx.stroke()
        break
      }

      case 'points': {
        const r = sz * 0.35
        const step = sz
        for (let x = -M; x < M * 2; x += step) {
          for (let y = -M; y < M * 2; y += step) {
            targetCtx.beginPath()
            targetCtx.arc(OX + x, OY + y, r, 0, Math.PI * 2)
            targetCtx.fill()
          }
        }
        break
      }

      case 'damier': {
        for (let xi = -Math.ceil(M / sz); xi < Math.ceil(M / sz) * 2; xi++) {
          for (let yi = -Math.ceil(M / sz); yi < Math.ceil(M / sz) * 2; yi++) {
            if ((xi + yi) % 2 === 0) {
              targetCtx.fillRect(OX + xi * sz, OY + yi * sz, sz, sz)
            }
          }
        }
        break
      }

      case 'hexagones': {
        const r = sz / 2
        const w = Math.sqrt(3) * r
        const h = 2 * r
        const col = Math.ceil(M * 2 / w) + 2
        const row = Math.ceil(M * 2 / (h * 0.75)) + 2
        for (let xi = -2; xi < col; xi++) {
          for (let yi = -2; yi < row; yi++) {
            const cx = OX + xi * w + (yi % 2 !== 0 ? w / 2 : 0)
            const cy = OY + yi * h * 0.75
            targetCtx.beginPath()
            for (let i = 0; i < 6; i++) {
              const a = (Math.PI / 180) * (60 * i - 30)
              const px = cx + r * Math.cos(a); const py = cy + r * Math.sin(a)
              i === 0 ? targetCtx.moveTo(px, py) : targetCtx.lineTo(px, py)
            }
            targetCtx.closePath()
            targetCtx.stroke()
          }
        }
        break
      }

      case 'triangles': {
        const th = (Math.sqrt(3) / 2) * sz
        const cols = Math.ceil(M * 2 / sz) + 4
        const rows = Math.ceil(M * 2 / th) + 4
        for (let xi = -2; xi < cols; xi++) {
          for (let yi = -2; yi < rows; yi++) {
            const x0 = OX + xi * sz + (yi % 2 !== 0 ? sz / 2 : 0)
            const y0 = OY + yi * th
            // upward triangle
            targetCtx.beginPath()
            targetCtx.moveTo(x0, y0 + th)
            targetCtx.lineTo(x0 + sz / 2, y0)
            targetCtx.lineTo(x0 + sz, y0 + th)
            targetCtx.closePath(); targetCtx.stroke()
          }
        }
        break
      }

      case 'chevrons': {
        const h2 = sz * 0.6
        for (let y = -M; y < M * 2; y += sz) {
          for (let x = -M; x < M * 2; x += sz * 2) {
            targetCtx.beginPath()
            targetCtx.moveTo(OX + x,       OY + y + h2)
            targetCtx.lineTo(OX + x + sz,  OY + y)
            targetCtx.lineTo(OX + x + sz * 2, OY + y + h2)
            targetCtx.stroke()
          }
        }
        break
      }

      case 'diamants': {
        const hs = sz / 2
        for (let xi = -Math.ceil(M / sz); xi < Math.ceil(M / sz) * 2; xi++) {
          for (let yi = -Math.ceil(M / sz); yi < Math.ceil(M / sz) * 2; yi++) {
            const cx = OX + xi * sz + (yi % 2 !== 0 ? hs : 0)
            const cy = OY + yi * sz
            targetCtx.beginPath()
            targetCtx.moveTo(cx, cy - hs)
            targetCtx.lineTo(cx + hs, cy)
            targetCtx.lineTo(cx, cy + hs)
            targetCtx.lineTo(cx - hs, cy)
            targetCtx.closePath(); targetCtx.stroke()
          }
        }
        break
      }

      case 'zigzag': {
        const step = sz
        const amp  = sz * 0.5
        for (let y = -M; y < M * 2; y += sz) {
          targetCtx.beginPath()
          let up = true
          for (let x = -M; x < M * 2; x += step) {
            const py = OY + y + (up ? 0 : amp)
            x === -M ? targetCtx.moveTo(OX + x, py) : targetCtx.lineTo(OX + x, py)
            up = !up
          }
          targetCtx.stroke()
        }
        break
      }

      case 'vagues': {
        for (let y = -M; y < M * 2; y += sz) {
          targetCtx.beginPath()
          for (let x = -M; x < M * 2; x += 2) {
            const py = OY + y + Math.sin(((x) / sz) * Math.PI * 2) * (sz * 0.3)
            x === -M ? targetCtx.moveTo(OX + x, py) : targetCtx.lineTo(OX + x, py)
          }
          targetCtx.stroke()
        }
        break
      }

      case 'pointille': {
        const dash = sz * 0.5
        const gap  = sz * 0.5
        for (let y = -M; y < M * 2; y += sz * 0.6) {
          const offset = ((Math.round(y / (sz * 0.6))) % 2) * (dash + gap) * 0.5
          for (let x = -M + offset; x < M * 2; x += dash + gap) {
            targetCtx.fillRect(OX + x, OY + y - sw / 2, dash, sw)
          }
        }
        break
      }

      case 'croix': {
        const arm = sz * 0.35
        for (let xi = -Math.ceil(M / sz); xi < Math.ceil(M / sz) * 2; xi++) {
          for (let yi = -Math.ceil(M / sz); yi < Math.ceil(M / sz) * 2; yi++) {
            const cx = OX + xi * sz; const cy = OY + yi * sz
            targetCtx.beginPath()
            targetCtx.moveTo(cx - arm, cy); targetCtx.lineTo(cx + arm, cy)
            targetCtx.moveTo(cx, cy - arm); targetCtx.lineTo(cx, cy + arm)
            targetCtx.stroke()
          }
        }
        break
      }
    }

    targetCtx.restore()
    targetCtx.globalAlpha = 1
  }

  function render() {
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderPattern(ctx, canvas.width / dpr, canvas.height / dpr)
  }

  function renderThumbs() {
    const keepPat = state.pattern, keepSize = state.size, keepSW = state.strokeW, keepTr = state.transparent
    for (const th of thumbs) {
      state.pattern = th.id; state.size = 16; state.strokeW = Math.min(keepSW, 2); state.transparent = false
      renderPattern(th.canvas.getContext('2d'), th.canvas.width, th.canvas.height)
    }
    state.pattern = keepPat; state.size = keepSize; state.strokeW = keepSW; state.transparent = keepTr
    for (const th of thumbs) th.canvas.style.borderColor = th.id === state.pattern ? 'var(--color-active,#4a9eff)' : 'var(--win-border,#2a2a2a)'
  }

  // Preview fills its container (DPR-aware), re-rendered on resize.
  function sizePreview() {
    const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight
    if (!w || !h) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
    previewCssW = w
    render()
  }
  new ResizeObserver(sizePreview).observe(canvasWrap)

  // ── Export ─────────────────────────────────────────────────────────────────

  exportPngBtn.addEventListener('click', async () => {
    const exportSize = parseInt(sizeSel.value)
    const offCanvas = document.createElement('canvas')
    offCanvas.width = exportSize; offCanvas.height = exportSize
    const offCtx = offCanvas.getContext('2d')
    // WYSIWYG: scale the pattern size so the export matches the preview density
    const prevSize = state.size
    state.size = state.size * (exportSize / previewCssW)
    renderPattern(offCtx, exportSize, exportSize)
    state.size = prevSize

    const b64 = offCanvas.toDataURL('image/png').split(',')[1]
    const root = window.__TAURI__ && localStorage.getItem('library:root')
    if (root) {
      // Save straight into the library's Images folder.
      const base = await promptName('pattern_' + state.pattern, { title: t('tool_patterns') })
      const sep = root.includes('\\') ? '\\' : '/'
      try {
        await window.__TAURI__.core.invoke('save_binary_file', { path: root + sep + 'Images' + sep + base + '.png', base64: b64 })
        window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + 'Images' } }))
        window.toast?.(t('pat_png_ok'), 'success')
      } catch (e) { window.toast?.(String(e), 'error') }
    } else if (window.__TAURI__) {
      try {
        const path = await window.__TAURI__.dialog.save({
          defaultPath: `pattern_${state.pattern}.png`,
          filters: [{ name: 'PNG', extensions: ['png'] }]
        })
        if (path) {
          await window.__TAURI__.core.invoke('save_binary_file', { path, base64: b64 })
          window.toast?.(t('pat_png_ok'), 'success')
        }
      } catch (e) { window.toast?.(String(e), 'error') }
    } else {
      const a = document.createElement('a'); a.href = 'data:image/png;base64,' + b64
      a.download = `pattern_${state.pattern}.png`; a.click()
    }
  })

  exportSvgBtn.addEventListener('click', async () => {
    const exportSize = parseInt(sizeSel.value)
    const svgContent = buildSvg(exportSize, exportSize)
    if (window.__TAURI__) {
      try {
        const path = await window.__TAURI__.dialog.save({
          defaultPath: `pattern_${state.pattern}.svg`,
          filters: [{ name: 'SVG', extensions: ['svg'] }]
        })
        if (path) {
          await window.__TAURI__.core.invoke('save_text_file', { path, content: svgContent })
          window.toast?.(t('pat_svg_ok'), 'success')
        }
      } catch (e) { window.toast?.(String(e), 'error') }
    } else {
      const a = document.createElement('a')
      a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent)
      a.download = `pattern_${state.pattern}.svg`; a.click()
    }
  })

  function buildSvg(W, H) {
    const sz = state.size
    const sw = state.strokeW
    const c1 = state.col1
    const c2 = state.col2
    const op = state.opacity1

    // Vector <pattern> defs for the simple types; the rotation is applied as a
    // patternTransform so the whole viewBox stays covered.
    const rotAttr = state.rotation !== 0 ? ` patternTransform="rotate(${state.rotation})"` : ''
    let patternDef = ''

    // Transparent background: always go through the canvas-embed branch —
    // the PNG keeps its alpha, so cells show through without a background rect.
    switch (state.transparent ? '' : state.pattern) {
      case 'lignes':
        patternDef = `<pattern id="pat" width="${sz}" height="${sz}" patternUnits="userSpaceOnUse"${rotAttr}><rect width="${sz}" height="${sz}" fill="${c2}"/><rect width="${sz}" height="${sz/2}" fill="${c1}" opacity="${op}"/></pattern>`
        break
      case 'grille':
        patternDef = `<pattern id="pat" width="${sz}" height="${sz}" patternUnits="userSpaceOnUse"${rotAttr}><rect width="${sz}" height="${sz}" fill="${c2}"/><path d="M${sz} 0 L0 0 0 ${sz}" stroke="${c1}" stroke-width="${sw}" fill="none" opacity="${op}"/></pattern>`
        break
      case 'points':
        patternDef = `<pattern id="pat" width="${sz}" height="${sz}" patternUnits="userSpaceOnUse"${rotAttr}><rect width="${sz}" height="${sz}" fill="${c2}"/><circle cx="${sz/2}" cy="${sz/2}" r="${sz*0.35}" fill="${c1}" opacity="${op}"/></pattern>`
        break
      case 'damier':
        patternDef = `<pattern id="pat" width="${sz*2}" height="${sz*2}" patternUnits="userSpaceOnUse"${rotAttr}><rect width="${sz*2}" height="${sz*2}" fill="${c2}"/><g fill="${c1}" opacity="${op}"><rect width="${sz}" height="${sz}"/><rect x="${sz}" y="${sz}" width="${sz}" height="${sz}"/></g></pattern>`
        break
    }

    if (patternDef) {
      return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${patternDef}</defs><rect width="${W}" height="${H}" fill="${c2}"/><rect width="${W}" height="${H}" fill="url(#pat)"/></svg>`
    }

    // No vector def for this pattern: embed the rendered canvas as an <image>
    // filling the viewBox (WYSIWYG scale, rotation baked into the render).
    const off = document.createElement('canvas')
    off.width = W; off.height = H
    const prevSize = state.size
    state.size = state.size * (W / previewCssW)
    renderPattern(off.getContext('2d'), W, H)
    state.size = prevSize
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><image href="${off.toDataURL('image/png')}" x="0" y="0" width="${W}" height="${H}"/></svg>`
  }

  // ── Randomize ──────────────────────────────────────────────────────────────

  function hslToHexLocal(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2
    let r = 0, g = 0, b = 0
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]
    else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]
    const hx = v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')
    return '#' + hx(r + m) + hx(g + m) + hx(b + m)
  }

  function randomize() {
    const rnd = (a, b) => a + Math.random() * (b - a)
    const h = Math.floor(Math.random() * 360)
    state.pattern = PATTERN_LIST[Math.floor(Math.random() * PATTERN_LIST.length)].id
    state.col1 = hslToHexLocal(h, rnd(0.65, 0.9), rnd(0.45, 0.6))
    state.col2 = Math.random() < 0.5
      ? hslToHexLocal((h + 180) % 360, rnd(0.35, 0.7), rnd(0.12, 0.22))
      : hslToHexLocal(h, rnd(0, 0.08), rnd(0.04, 0.1))
    state.size = Math.round(rnd(12, 64))
    state.strokeW = Math.round(rnd(1, 8))
    state.rotation = [0, 15, 30, 45, 60, 90][Math.floor(Math.random() * 6)]
    state.opacity1 = Math.round(rnd(0.7, 1) * 100) / 100
    syncWidgets(); render(); renderThumbs(); saveState()
  }
  randBtn.addEventListener('click', randomize)

  // ── Wiring ─────────────────────────────────────────────────────────────────

  renderThumbs()
  render()
}
