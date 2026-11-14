// image-info.js — What a picture contains: its histogram, and the EXIF data
// of a camera photo (JPEG). No dependency; used by the Effects tool.

// ── Histogram ────────────────────────────────────────────────────────────────
/** Counts of the red, green, blue and luminance values (256 bins each) of a
 *  canvas / image, measured on a copy of at most ~260 000 pixels. */
export function computeHistogram(src) {
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height
  const k = Math.min(1, Math.sqrt(260000 / Math.max(1, w0 * h0)))
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(src, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h).data
  const r = new Uint32Array(256), gr = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256)
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue   // transparent pixels say nothing about the picture
    r[d[i]]++; gr[d[i + 1]]++; b[d[i + 2]]++
    l[Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)]++
    n++
  }
  return { r, g: gr, b, l, n }
}

/** Draws the histogram into `canvas`: luminance as a filled area, the three
 *  channels as lines on top. `colors` = { fill, grid } (theme colours). */
export function drawHistogram(canvas, hist, colors = {}) {
  const W = canvas.width, H = canvas.height
  const g = canvas.getContext('2d')
  g.clearRect(0, 0, W, H)
  if (!hist || !hist.n) return
  // Square-root scale: a few huge peaks (a white background) don't flatten the rest.
  let max = 1
  for (const a of [hist.r, hist.g, hist.b, hist.l]) for (let i = 1; i < 255; i++) max = Math.max(max, a[i])
  const y = v => H - Math.min(1, Math.sqrt(v / max)) * (H - 2)
  const x = i => i / 255 * W
  g.strokeStyle = colors.grid || 'rgba(128,128,128,.25)'; g.lineWidth = 1
  for (const q of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(Math.round(q * W) + 0.5, 0); g.lineTo(Math.round(q * W) + 0.5, H); g.stroke() }
  g.beginPath(); g.moveTo(0, H)
  for (let i = 0; i < 256; i++) g.lineTo(x(i), y(hist.l[i]))
  g.lineTo(W, H); g.closePath()
  g.fillStyle = colors.fill || 'rgba(160,160,160,.35)'; g.fill()
  // The channels themselves (content colours: they ARE red, green and blue).
  g.globalCompositeOperation = 'lighter'; g.lineWidth = 1.2
  for (const [a, col] of [[hist.r, 'rgba(255,70,70,.85)'], [hist.g, 'rgba(70,220,90,.85)'], [hist.b, 'rgba(80,140,255,.9)']]) {
    g.beginPath()
    for (let i = 0; i < 256; i++) i ? g.lineTo(x(i), y(a[i])) : g.moveTo(x(i), y(a[i]))
    g.strokeStyle = col; g.stroke()
  }
  g.globalCompositeOperation = 'source-over'
}

// ── EXIF ─────────────────────────────────────────────────────────────────────
/** Bytes of a data: URL (null when it isn't base64). */
export function dataUrlBytes(dataUrl) {
  const m = /^data:([^;,]*);base64,(.*)$/.exec(String(dataUrl || ''))
  if (!m) return null
  const bin = atob(m[2]), out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const TAGS = {
  0x010F: 'make', 0x0110: 'model', 0x0112: 'orientation', 0x0131: 'software', 0x0132: 'dateTime',
  0x829A: 'exposure', 0x829D: 'fNumber', 0x8827: 'iso', 0x9003: 'dateOriginal', 0x920A: 'focal',
  0xA405: 'focal35', 0xA434: 'lens', 0x9209: 'flash', 0xA002: 'pixelW', 0xA003: 'pixelH',
}
/** EXIF fields of a JPEG file (null if none): camera, lens, exposure, date…
 *  plus `gps: true` when the photo carries a location. */
export function readExif(bytes) {
  if (!bytes || bytes.length < 12 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xFF) return null
    const marker = bytes[i + 1]
    if (marker === 0xDA || marker === 0xD9) return null   // image data starts: no EXIF block
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (marker === 0xE1 && len > 8 && String.fromCharCode(...bytes.subarray(i + 4, i + 8)) === 'Exif') {
      try { return parseTiff(bytes, i + 10, len - 8) } catch { return null }
    }
    i += 2 + len
  }
  return null
}
function parseTiff(b, start, size) {
  const end = Math.min(b.length, start + size)
  const le = b[start] === 0x49
  const u16 = o => { if (start + o + 2 > end) throw 0; return le ? b[start + o] | (b[start + o + 1] << 8) : (b[start + o] << 8) | b[start + o + 1] }
  const u32 = o => { if (start + o + 4 > end) throw 0; return le ? (b[start + o] | (b[start + o + 1] << 8) | (b[start + o + 2] << 16) | (b[start + o + 3] << 24)) >>> 0 : ((b[start + o] << 24) | (b[start + o + 1] << 16) | (b[start + o + 2] << 8) | b[start + o + 3]) >>> 0 }
  const s32 = o => u32(o) | 0
  const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }
  const out = {}
  const readIfd = (off, depth) => {
    if (!off || depth > 2) return
    const n = u16(off)
    for (let k = 0; k < n && k < 400; k++) {
      const e = off + 2 + k * 12
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4)
      const bytesLen = (SIZES[type] || 1) * count
      const vo = bytesLen > 4 ? u32(e + 8) : e + 8
      if (tag === 0x8769) { readIfd(u32(e + 8), depth + 1); continue }   // Exif sub-IFD
      if (tag === 0x8825) { out.gps = true; continue }                   // GPS sub-IFD: location present
      const name = TAGS[tag]; if (!name) continue
      let v
      if (type === 2) { v = ''; for (let j = 0; j < count && vo + j < end - start; j++) { const c = b[start + vo + j]; if (!c) break; v += String.fromCharCode(c) } v = v.trim() }
      else if (type === 3) v = u16(vo)
      else if (type === 4) v = u32(vo)
      else if (type === 9) v = s32(vo)
      else if (type === 5) { const d = u32(vo + 4); v = d ? u32(vo) / d : 0 }
      else if (type === 10) { const d = s32(vo + 4); v = d ? s32(vo) / d : 0 }
      else continue
      out[name] = v
    }
  }
  readIfd(u32(4), 0)
  return Object.keys(out).length ? out : null
}

/** Human lines for display: [[label key, value], …] (label keys are i18n keys). */
export function exifLines(x) {
  if (!x) return []
  const L = []
  const cam = [x.make, x.model].filter(Boolean).join(' ').replace(/^(\w+)\s+\1\b/i, '$1')
  if (cam) L.push(['info_camera', cam])
  if (x.lens) L.push(['info_lens', x.lens])
  const exp = []
  if (x.exposure) exp.push(x.exposure >= 1 ? x.exposure.toFixed(1).replace(/\.0$/, '') + ' s' : '1/' + Math.round(1 / x.exposure) + ' s')
  if (x.fNumber) exp.push('f/' + (+x.fNumber.toFixed(1)))
  if (x.iso) exp.push('ISO ' + x.iso)
  if (x.focal) exp.push(Math.round(x.focal) + ' mm' + (x.focal35 && x.focal35 !== Math.round(x.focal) ? ' (' + x.focal35 + ' mm eq.)' : ''))
  if (exp.length) L.push(['info_exposure', exp.join(' · ')])
  const date = x.dateOriginal || x.dateTime
  if (date) L.push(['info_date', date.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$3/$2/$1')])
  if (x.software) L.push(['info_software', x.software])
  return L
}
