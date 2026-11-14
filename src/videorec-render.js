// videorec-render.js — The montage as ONE ffmpeg command.
//
// Pure functions (no DOM): the video editor hands over its clips, texts,
// markers, music and export settings and gets back the ffmpeg arguments, the
// output size and the timeline → export time map. Everything is rendered in a
// single pass at the chosen size / frame rate / quality, so what the timeline
// shows is what the file contains:
//   main lanes   → one sequence sorted by start; gaps between clips are black
//                  (and silent); transitions (xfade) join touching clips
//   overlay lane → clips drawn ABOVE the sequence (picture-in-picture)
//   per clip     → speed, volume, fades, crop (zoom), flips, rotation, colour
//   then markers (zoom / blur / spot), the overlay clips, the titles, and
//   the music mixed under everything.

import { ffmpegFontFile } from './fonts.js'

// ── Settings ─────────────────────────────────────────────────────────────────
export const FX_DEFAULT = Object.freeze({
  speed: 1, vol: 1, fadeIn: 0, fadeOut: 0,
  rot: 0, flipH: false, flipV: false,
  zoom: 1, cx: 50, cy: 50,                 // crop window: 1/zoom of the frame, centred at cx/cy %
  bright: 0, contrast: 100, sat: 100, look: 'none',
  pos: 'br', size: 35, opacity: 100,       // overlay lane only
})
export const EXPORT_DEFAULT = Object.freeze({ aspect: 'auto', res: 1080, fps: 30, quality: 'high', fit: 'contain' })
export const ASPECTS = ['auto', '16:9', '9:16', '1:1', '4:5']
export const RESOLUTIONS = [480, 720, 1080, 1440, 2160]
export const FPS_LIST = [24, 25, 30, 60]
export const QUALITIES = { high: { crf: 18, preset: 'medium' }, standard: { crf: 23, preset: 'medium' }, light: { crf: 28, preset: 'faster' } }
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
export const TXT_SIZES = { s: 24, m: 36, l: 52, xl: 72 }   // px at the 720p reference (short side)
const OV_MARGIN = 0.04   // overlay inset, fraction of the frame's short side

export const ffTime = v => Math.max(0, v || 0).toFixed(3)
const num = (v, d) => { v = +v; return Number.isFinite(v) ? v : d }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const even = v => Math.max(2, Math.round(v / 2) * 2)

export function fxOf(c) {
  const f = { ...FX_DEFAULT, ...((c && c.fx) || {}) }
  f.speed = clamp(num(f.speed, 1), 0.25, 4)
  f.vol = clamp(num(f.vol, 1), 0, 2)
  f.fadeIn = clamp(num(f.fadeIn, 0), 0, 10); f.fadeOut = clamp(num(f.fadeOut, 0), 0, 10)
  f.rot = [0, 90, 180, 270].includes(+f.rot) ? +f.rot : 0
  f.zoom = clamp(num(f.zoom, 1), 1, 4); f.cx = clamp(num(f.cx, 50), 0, 100); f.cy = clamp(num(f.cy, 50), 0, 100)
  f.bright = clamp(num(f.bright, 0), -50, 50); f.contrast = clamp(num(f.contrast, 100), 50, 150); f.sat = clamp(num(f.sat, 100), 0, 200)
  if (!['none', 'bw', 'sepia'].includes(f.look)) f.look = 'none'
  if (!/^[tcb][lcr]$/.test(f.pos)) f.pos = 'br'
  f.size = clamp(num(f.size, 35), 10, 100); f.opacity = clamp(num(f.opacity, 100), 10, 100)
  return f
}
/** Only the fields that differ from the defaults (what a project stores). */
export function fxDiff(fx) {
  const out = {}
  for (const k of Object.keys(FX_DEFAULT)) if (fx && fx[k] !== undefined && fx[k] !== FX_DEFAULT[k]) out[k] = fx[k]
  return Object.keys(out).length ? out : null
}
export function cfgOf(cfg) {
  const c = { ...EXPORT_DEFAULT, ...(cfg || {}) }
  if (!ASPECTS.includes(c.aspect)) c.aspect = EXPORT_DEFAULT.aspect
  if (!RESOLUTIONS.includes(+c.res)) c.res = EXPORT_DEFAULT.res
  if (!FPS_LIST.includes(+c.fps)) c.fps = EXPORT_DEFAULT.fps
  if (!QUALITIES[c.quality]) c.quality = EXPORT_DEFAULT.quality
  if (c.fit !== 'cover') c.fit = 'contain'
  c.res = +c.res; c.fps = +c.fps
  return c
}

// ── Geometry ─────────────────────────────────────────────────────────────────
const isMain = c => !c.placeholder && (c.laneIdx | 0) >= 0
const isOverlay = c => !c.placeholder && c.laneIdx === -1

/** The clip's picture size once rotated (crop keeps the aspect). 0 = unknown. */
export function pictureDims(c) {
  const w = c.w || 0, h = c.h || 0
  return fxOf(c).rot % 180 ? { w: h, h: w } : { w, h }
}
/** Export frame size: the short side is `res`, the aspect is fixed or follows
 *  the first main clip ("auto", 16:9 when unknown). */
export function exportSize(cfg, clips) {
  cfg = cfgOf(cfg)
  let aw = 16, ah = 9
  if (cfg.aspect === 'auto') {
    const first = [...(clips || [])].filter(isMain).sort((a, b) => a.startTime - b.startTime).find(c => c.w && c.h)
    if (first) { const d = pictureDims(first); aw = d.w; ah = d.h }
  } else [aw, ah] = cfg.aspect.split(':').map(Number)
  const s = cfg.res
  return aw >= ah ? { W: even(s * aw / ah), H: even(s) } : { W: even(s), H: even(s * ah / aw) }
}
/** Crop window (fractions of the source) for a zoom/centre setting. */
export function cropWindow(fx) {
  const w = 1 / Math.max(1, fx.zoom)
  return { l: (1 - w) * fx.cx / 100, t: (1 - w) * fx.cy / 100, w, h: w }
}

// ── Sequence ─────────────────────────────────────────────────────────────────
// A stored transition only counts while its junction is live: the next clip
// sits on the same lane with touching edges (≤ 80 ms, as the badges show).
export const transLive = (left, right) => !!(left && right && left.transition && left.transition.type && right.laneIdx === left.laneIdx && Math.abs(left.startTime + left.duration - right.startTime) <= 0.08)
const GAP_MIN = 0.1   // smaller holes between clips are treated as a cut

/** Main-lane segments in export order: { clip | gap, start (timeline), dur,
 *  at (export start), join: null | { type, dur } (xfade with the previous) }. */
export function buildSequence(clips) {
  const main = clips.filter(isMain).sort((a, b) => a.startTime - b.startTime)
  const segs = []
  let cursor = 0
  for (const c of main) {
    const gap = c.startTime - cursor
    if (gap > GAP_MIN) segs.push({ gap: true, start: cursor, dur: gap })
    segs.push({ clip: c, start: c.startTime, dur: c.duration })
    cursor = Math.max(cursor, c.startTime + c.duration)
  }
  let cum = 0
  segs.forEach((s, k) => {
    const prev = segs[k - 1]
    s.join = null
    if (prev && prev.clip && s.clip && transLive(prev.clip, s.clip)) {
      const d = clamp(+prev.clip.transition.dur || 0.5, 0.05, Math.min(prev.dur - 0.05, s.dur - 0.05, cum - 0.05))
      if (d >= 0.05) s.join = { type: prev.clip.transition.type, dur: d }
    }
    s.at = s.join ? cum - s.join.dur : cum
    cum = s.at + s.dur
  })
  return { segs, total: cum }
}
/** Timeline time → export time (gaps keep their length, transitions overlap). */
export function timeMap(segs, total) {
  return tt => {
    for (const s of segs) {
      if (tt < s.start) return s.at
      if (tt < s.start + s.dur) return Math.min(total, s.at + (tt - s.start))
    }
    return total
  }
}
/** Marker pins are fractions of the PICTURE they were placed on; the export
 *  works on the whole frame, so map them through the clip's fit. */
const MK_FULL = { fw: 1, fh: 1, ox: 0, oy: 0 }
export function placement(segs, W, H, fit) {
  return m => {
    const s = segs.find(x => x.clip && m.start >= x.start && m.start < x.start + x.dur) || segs.find(x => x.clip)
    const d = s ? pictureDims(s.clip) : { w: 0, h: 0 }
    if (!d.w || !d.h) return MK_FULL
    const k = fit === 'cover' ? Math.max(W / d.w, H / d.h) : Math.min(W / d.w, H / d.h)
    const fw = d.w * k / W, fh = d.h * k / H
    return { fw, fh, ox: (1 - fw) / 2, oy: (1 - fh) / 2 }
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────
function atempoChain(f) {
  const parts = []; let r = f
  while (r > 2.0001) { parts.push(2); r /= 2 }
  while (r < 0.4999) { parts.push(0.5); r *= 2 }
  parts.push(r)
  return parts.map(x => 'atempo=' + (+x.toFixed(4))).join(',')
}
const SEPIA = 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'
/** Crop → flips → rotation → colour: the same order as the live preview
 *  (object-view-box, then the element's scale() and rotate(), then filter). */
function pictureFilters(fx) {
  const f = []
  if (fx.zoom > 1.001) {
    const z = fx.zoom.toFixed(4)
    f.push(`crop=w=trunc(iw/${z}/2)*2:h=trunc(ih/${z}/2)*2:x=(iw-ow)*${(fx.cx / 100).toFixed(4)}:y=(ih-oh)*${(fx.cy / 100).toFixed(4)}`)
  }
  if (fx.flipH) f.push('hflip')
  if (fx.flipV) f.push('vflip')
  if (fx.rot === 90) f.push('transpose=1')
  else if (fx.rot === 180) f.push('hflip,vflip')
  else if (fx.rot === 270) f.push('transpose=2')
  if (fx.bright || fx.contrast !== 100 || fx.sat !== 100) f.push(`eq=brightness=${(fx.bright / 200).toFixed(3)}:contrast=${(fx.contrast / 100).toFixed(3)}:saturation=${(fx.sat / 100).toFixed(3)}`)
  if (fx.look === 'bw') f.push('hue=s=0')
  else if (fx.look === 'sepia') f.push(SEPIA)
  return f
}
function fadeFilters(fx, dur, alpha) {
  const f = [], a = alpha ? ':alpha=1' : ''
  const fi = Math.min(fx.fadeIn, dur / 2), fo = Math.min(fx.fadeOut, dur / 2)
  if (fi > 0.01) f.push(`fade=t=in:st=0:d=${ffTime(fi)}${a}`)
  if (fo > 0.01) f.push(`fade=t=out:st=${ffTime(dur - fo)}:d=${ffTime(fo)}${a}`)
  return f
}
const AFMT = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo'
function audioChain(idx, fx, dur, out) {
  const f = [`[${idx}:a]asetpts=PTS-STARTPTS`]
  if (Math.abs(fx.speed - 1) > 0.001) f.push(atempoChain(fx.speed))
  if (Math.abs(fx.vol - 1) > 0.001) f.push(`volume=${fx.vol.toFixed(3)}`)
  f.push(AFMT, `apad=whole_dur=${ffTime(dur)}`, `atrim=duration=${ffTime(dur)}`, 'asetpts=PTS-STARTPTS')
  const fi = Math.min(fx.fadeIn, dur / 2), fo = Math.min(fx.fadeOut, dur / 2)
  if (fi > 0.01) f.push(`afade=t=in:st=0:d=${ffTime(fi)}`)
  if (fo > 0.01) f.push(`afade=t=out:st=${ffTime(dur - fo)}:d=${ffTime(fo)}`)
  return f.join(',') + `[${out}]`
}
const silence = (dur, out) => `aevalsrc=0:c=stereo:s=48000:d=${ffTime(dur)},${AFMT}[${out}]`

// drawtext: the text crosses THREE parsers, each with its own escaping —
//   1. drawtext's expansion: `\x` → x, `%{…}` sequences → escape \ and %
//   2. the option parser (key=value:…): escape \ ' and :
//   3. the filtergraph parser: escape \ ' [ ] , and ;
// (A quoted value only protects it from one of the levels: an apostrophe in a
// title used to break the whole export.)
const escapeDrawtext = s => String(s)
  .replace(/[\\%]/g, m => '\\' + m)
  .replace(/[\\':]/g, m => '\\' + m)
  .replace(/[\\'[\],;]/g, m => '\\' + m)
export function buildDrawtextChain(texts, map, W, H) {
  const k = Math.min(W, H) / 720
  return texts.map(tx => {
    let st = map(tx.start), en = map(tx.start + tx.dur)
    if (en <= st) en = st + 0.05
    const yv = tx.pos?.[0] || 'b', xh = tx.pos?.[1] || 'c'
    const x = xh === 'l' ? 'w*0.05' : xh === 'r' ? 'w-text_w-w*0.05' : '(w-text_w)/2'
    const y = yv === 't' ? 'h*0.05' : yv === 'b' ? 'h-text_h-h*0.05' : '(h-text_h)/2'
    const col = '0x' + String(tx.color || '').replace(/[^0-9a-fA-F]/g, '').padEnd(6, 'f').slice(0, 6)
    // One font per title, able to draw its script (Chinese, Japanese, Korean, Arabic…).
    let f = `drawtext=fontfile='${ffmpegFontFile(tx.text)}':text=${escapeDrawtext(tx.text)}` +
      `:fontsize=${Math.round((TXT_SIZES[tx.size] || 36) * k)}:fontcolor=${col}:x=${x}:y=${y}` +
      `:enable='between(t,${ffTime(st)},${ffTime(en)})'`
    if (tx.band) f += `:box=1:boxcolor=black@0.5:boxborderw=${Math.round(14 * k)}`
    return f
  }).join(',')
}

// Markers. Zoom: crop's w/h expressions are evaluated once (they don't
// animate), so zoompan drives the envelope — its z/x/y re-evaluate per frame
// via `time`, and it needs a CFR input at its own fps (the sequence is).
// Overlapping zooms never compound: the earliest-starting one wins.
export function buildMarkerGraph(markers, inLabel, map, W, H, spotIdx, place, fps) {
  const k = Math.min(W, H) / 720
  const at = place || (() => MK_FULL)
  const nodes = []
  let cur = inLabel, n = 0
  const sorted = [...markers].sort((a, b) => a.start - b.start)
  const range = m => { const st = map(m.start); let en = map(m.start + m.dur); if (en <= st) en = st + 0.05; return [st, en] }
  for (const m of sorted) {
    const pl = at(m)
    const cx = (pl.ox + m.x / 100 * pl.fw).toFixed(4), cy = (pl.oy + m.y / 100 * pl.fh).toFixed(4)
    if (m.fn === 'blur') {
      const [st, en] = range(m)
      const side = `min(floor(ih*${(2 * (m.params.radius || 15) / 100 * pl.fh).toFixed(4)}/2)*2,floor(iw/2)*2)`
      const lr = Math.max(2, Math.round(6 * (m.params.intensity || 2) * k))
      n++
      nodes.push(`[${cur}]split[mba${n}][mbb${n}]`)
      nodes.push(`[mbb${n}]crop=w='${side}':h='${side}':x='min(max(iw*${cx}-out_w/2,0),iw-out_w)':y='min(max(ih*${cy}-out_h/2,0),ih-out_h)',boxblur=${lr}:2[mbf${n}]`)
      nodes.push(`[mba${n}][mbf${n}]overlay=x='min(max(main_w*${cx}-overlay_w/2,0),main_w-overlay_w)':y='min(max(main_h*${cy}-overlay_h/2,0),main_h-overlay_h)':enable='between(t,${ffTime(st)},${ffTime(en)})'[mbo${n}]`)
      cur = `mbo${n}`
    } else if (m.fn === 'spot') {
      const idx = spotIdx.get(m.id)
      if (idx == null) continue
      const [st, en] = range(m)
      n++
      nodes.push(`[${cur}][${idx}:v]overlay=0:0:enable='between(t,${ffTime(st)},${ffTime(en)})'[msp${n}]`)
      cur = `msp${n}`
    }
  }
  const zooms = sorted.filter(m => m.fn === 'zoom').map(m => {
    const p = m.params, aIn = +p.in || 0, hold = +p.hold || 0
    const t0 = map(m.start), t1 = map(m.start + aIn), t2 = map(m.start + aIn + hold), t3 = map(m.start + m.dur)
    return { m, t0, t1: Math.max(t1, t0), t2: Math.max(t2, t1), t3: Math.max(t3, t2) }
  }).filter(z => z.t3 - z.t0 > 0.08)
  if (zooms.length) {
    let zExpr = '1'
    let xExpr = 'clip(iw*0.5-(iw/zoom)/2,0,iw-iw/zoom)'
    let yExpr = 'clip(ih*0.5-(ih/zoom)/2,0,ih-ih/zoom)'
    for (let i = zooms.length - 1; i >= 0; i--) {
      const z = zooms[i], f = Math.max(1.01, +z.m.params.factor || 1.8).toFixed(3)
      const up = z.t1 - z.t0 > 0.02 ? `1+(${f}-1)*(time-${ffTime(z.t0)})/${(z.t1 - z.t0).toFixed(3)}` : f
      const down = (!z.m.params.cut && z.t3 - z.t2 > 0.02) ? `${f}-(${f}-1)*(time-${ffTime(z.t2)})/${(z.t3 - z.t2).toFixed(3)}` : '1'
      const inner = `if(lt(time,${ffTime(z.t1)}),${up},if(lt(time,${ffTime(z.t2)}),${f},${down}))`
      const cond = `between(time,${ffTime(z.t0)},${ffTime(z.t3)})`
      zExpr = `if(${cond},${inner},${zExpr})`
      const zp = at(z.m)
      const zx = (zp.ox + z.m.x / 100 * zp.fw).toFixed(4), zy = (zp.oy + z.m.y / 100 * zp.fh).toFixed(4)
      xExpr = `if(${cond},clip(iw*${zx}-(iw/zoom)/2,0,iw-iw/zoom),${xExpr})`
      yExpr = `if(${cond},clip(ih*${zy}-(ih/zoom)/2,0,ih-ih/zoom),${yExpr})`
    }
    n++
    nodes.push(`[${cur}]zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${W}x${H}:fps=${fps}[mzp${n}]`)
    cur = `mzp${n}`
  }
  return { graph: nodes.join(';'), out: cur }
}

// ── The render ───────────────────────────────────────────────────────────────
/** Size, sequence and time map — what the caller needs before building the
 *  command (spot vignettes are painted at W×H through `place`). */
export function planRender({ clips, cfg }) {
  cfg = cfgOf(cfg)
  const { W, H } = exportSize(cfg, clips)
  const { segs, total } = buildSequence(clips)
  return { cfg, W, H, segs, total, map: timeMap(segs, total), place: placement(segs, W, H, cfg.fit) }
}

/**
 * ffmpeg arguments for the whole montage.
 *  opts: { clips, texts, markers, music, cfg, outPath,
 *          hasAudio(path) → bool, spotFiles: [path] (one per spot marker, in order) }
 * Returns { args, total, W, H } — `total` is the output length in seconds
 * (the progress reference).
 */
export function buildRenderArgs(plan, opts) {
  const { cfg, W, H, segs, total, map } = plan
  const F = cfg.fps
  const texts = opts.texts || [], markers = opts.markers || [], music = opts.music
  const hasAudio = opts.hasAudio || (() => true)
  const inputs = [], g = []
  const addInput = (c, span) => {
    const idx = inputs.length
    if (c.image) inputs.push(['-loop', '1', '-framerate', String(F), '-t', ffTime(span), '-i', c.savedPath])
    else inputs.push(['-ss', ffTime(c.srcIn || 0), '-t', ffTime(span), '-i', c.savedPath])
    return idx
  }
  const fitFilters = cfg.fit === 'cover'
    ? [`scale=${W}:${H}:force_original_aspect_ratio=increase:force_divisible_by=2`, `crop=${W}:${H}`]
    : [`scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`]
  const lengthFilters = dur => [`tpad=stop_mode=clone:stop_duration=${ffTime(dur)}`, `trim=duration=${ffTime(dur)}`, 'setpts=PTS-STARTPTS']

  // Main sequence: one [vK][aK] pair per segment.
  segs.forEach((s, k) => {
    if (s.gap) {
      g.push(`color=c=black:s=${W}x${H}:r=${F}:d=${ffTime(s.dur)},format=yuv420p,setsar=1,settb=AVTB[v${k}]`)
      g.push(silence(s.dur, `a${k}`))
      return
    }
    const c = s.clip, fx = fxOf(c), dur = s.dur
    const speed = c.image ? 1 : fx.speed
    const idx = addInput(c, c.image ? dur : dur * speed)
    const v = [`[${idx}:v]setpts=(PTS-STARTPTS)/${speed.toFixed(4)}`, ...pictureFilters(fx), ...fitFilters, 'setsar=1', `fps=${F}`, 'format=yuv420p', ...lengthFilters(dur), ...fadeFilters(fx, dur, false), 'settb=AVTB']
    g.push(v.join(',') + `[v${k}]`)
    if (!c.image && fx.vol > 0.001 && hasAudio(c.savedPath)) g.push(audioChain(idx, { ...fx, speed }, dur, `a${k}`))
    else g.push(silence(dur, `a${k}`))
  })
  // Join: plain cuts are concatenated run by run, runs are chained by xfade.
  const runs = []
  segs.forEach((s, k) => { if (k === 0 || s.join) runs.push({ ks: [k], join: s.join }); else runs[runs.length - 1].ks.push(k) })
  const runOut = runs.map((r, i) => {
    if (r.ks.length === 1) return { v: `v${r.ks[0]}`, a: `a${r.ks[0]}` }
    g.push(r.ks.map(k => `[v${k}][a${k}]`).join('') + `concat=n=${r.ks.length}:v=1:a=1[rv${i}][ra${i}]`)
    return { v: `rv${i}`, a: `ra${i}` }
  })
  let vCur = runOut[0].v, aCur = runOut[0].a
  for (let i = 1; i < runs.length; i++) {
    const j = runs[i].join, off = segs[runs[i].ks[0]].at
    g.push(`[${vCur}][${runOut[i].v}]xfade=transition=${j.type}:duration=${ffTime(j.dur)}:offset=${ffTime(off)}[xv${i}]`)
    g.push(`[${aCur}][${runOut[i].a}]acrossfade=d=${ffTime(j.dur)}[xa${i}]`)
    vCur = `xv${i}`; aCur = `xa${i}`
  }

  // Overlay clips: inputs first (indices), graph after the markers.
  const overlays = opts.clips.filter(isOverlay).sort((a, b) => a.startTime - b.startTime).map(c => {
    const fx = fxOf(c), speed = c.image ? 1 : fx.speed
    return { c, fx, speed, idx: addInput(c, c.image ? c.duration : c.duration * speed), t0: map(c.startTime) }
  }).filter(o => o.t0 < total - 0.05)
  // Music input.
  let musicIdx = -1
  if (music && music.path) { musicIdx = inputs.length; inputs.push(['-i', music.path]) }
  // Spot vignettes (pictures painted at W×H), one input each.
  const spotIdx = new Map()
  const spots = markers.filter(m => m.fn === 'spot')
  ;(opts.spotFiles || []).forEach((p, i) => { if (spots[i]) { spotIdx.set(spots[i].id, inputs.length); inputs.push(['-i', p]) } })

  // Markers act on the sequence picture (the overlays and titles stay sharp).
  if (markers.length) {
    const mg = buildMarkerGraph(markers, vCur, map, W, H, spotIdx, plan.place, F)
    if (mg.graph) { g.push(mg.graph); vCur = mg.out }
  }
  // Overlays, positioned on a 3×3 grid with a small inset.
  const extraAudio = []
  const m = Math.round(Math.min(W, H) * OV_MARGIN)
  overlays.forEach((o, i) => {
    const { c, fx, speed, idx, t0 } = o, dur = c.duration
    const ow = even(W * fx.size / 100)
    const v = [`[${idx}:v]setpts=(PTS-STARTPTS)/${speed.toFixed(4)}`, ...pictureFilters(fx), `scale=${ow}:-2`, 'setsar=1', `fps=${F}`, 'format=yuva420p']
    if (fx.opacity < 100) v.push(`colorchannelmixer=aa=${(fx.opacity / 100).toFixed(3)}`)
    v.push(...lengthFilters(dur), ...fadeFilters(fx, dur, true), `setpts=PTS+${ffTime(t0)}/TB`)
    g.push(v.join(',') + `[ov${i}]`)
    const x = fx.pos[1] === 'l' ? `${m}` : fx.pos[1] === 'r' ? `main_w-overlay_w-${m}` : '(main_w-overlay_w)/2'
    const y = fx.pos[0] === 't' ? `${m}` : fx.pos[0] === 'b' ? `main_h-overlay_h-${m}` : '(main_h-overlay_h)/2'
    g.push(`[${vCur}][ov${i}]overlay=x=${x}:y=${y}:eof_action=pass:enable='between(t,${ffTime(t0)},${ffTime(t0 + dur)})'[vo${i}]`)
    vCur = `vo${i}`
    if (!c.image && fx.vol > 0.001 && hasAudio(c.savedPath)) {
      const ms = Math.round(t0 * 1000)
      g.push(audioChain(idx, { ...fx, speed }, dur, `oa${i}r`).replace(/\[oa\d+r\]$/, `,adelay=${ms}:all=1[oa${i}]`))
      extraAudio.push(`oa${i}`)
    }
  })
  // Titles last, above everything.
  if (texts.length) { g.push(`[${vCur}]${buildDrawtextChain(texts, map, W, H)}[vt]`); vCur = 'vt' }
  g.push(`[${vCur}]format=yuv420p[vout]`)

  // Music under everything (starts at its timeline position, mapped).
  if (musicIdx >= 0) {
    const t0 = map(music.start || 0), ms = Math.round(t0 * 1000)
    let chain = `[${musicIdx}:a]${AFMT},volume=${num(music.volume, 1).toFixed(3)},adelay=${ms}:all=1`
    if (music.fadeOut) {
      const end = Math.min(total, t0 + (music.duration || total))
      chain += `,afade=t=out:st=${ffTime(Math.max(0, end - 2))}:d=2`
    }
    g.push(chain + '[mus]')
    extraAudio.push('mus')
  }
  if (extraAudio.length) g.push(`[${aCur}]${extraAudio.map(a => `[${a}]`).join('')}amix=inputs=${1 + extraAudio.length}:duration=first:normalize=0:dropout_transition=0[aout]`)
  else g.push(`[${aCur}]anull[aout]`)

  const q = QUALITIES[cfg.quality]
  const args = [
    ...inputs.flat(),
    '-filter_complex', g.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', q.preset, '-crf', String(q.crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    opts.outPath,
  ]
  return { args, total, W, H }
}
