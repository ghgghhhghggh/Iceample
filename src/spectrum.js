import { createPrivateAnalyser, createMasterTap, getCtx } from './audio-bus.js'
import { createBeatDetector } from './beat-detector.js'
import { t } from './i18n.js'
import { showExportPanel } from './export-canvas.js'

const MODES = [
  { id: 'circle',    icon: 'circle-dot',  label: 'Circulaire' },
  { id: 'dna',       icon: 'dna',         label: 'ADN'        },
  { id: 'synapse',   icon: 'brain',       label: 'Synapse'    },
  { id: 'sphere3d',  icon: 'cube',        label: 'Sphère 3D'  },
  { id: 'wfall3d',   icon: 'layer-group', label: 'Waterfall'  },
  { id: 'milkdrop',  icon: 'droplet', label: 'Milkdrop' },
]

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('spectrum-styles')) return
  const s = document.createElement('style')
  s.id = 'spectrum-styles'
  s.textContent = `
.sp-wrap {
  position: relative; width: 100%; height: 100%;
  overflow: hidden; border-radius: 0 0 7px 7px;
}
.sp-canvas {
  position: absolute; inset: 0;
  width: 100%; height: 100%; display: block;
}
.sp-palette-btn {
  position: absolute; top: 6px; right: 6px;
  width: 26px; height: 22px; border-radius: 5px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.14);
  color: rgba(255,255,255,0.45); font-size: 11px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 10;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.sp-palette-btn:hover {
  background: rgba(255,255,255,0.14);
  color: rgba(255,255,255,0.9);
  border-color: rgba(255,255,255,0.28);
}
.sp-panel {
  position: absolute; top: 34px; right: 6px;
  width: 212px; max-height: 470px;
  overflow-y: auto; overflow-x: hidden;
  background: rgba(12,12,14,0.97);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 9px;
  padding: 10px 12px 14px;
  z-index: 10; backdrop-filter: blur(16px);
  display: flex; flex-direction: column; gap: 8px;
  scrollbar-width: thin; scrollbar-color: #444 transparent;
}
.sp-panel.hidden { display: none; }
.sp-section-hdr {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: rgba(150,190,255,0.85);
  padding: 7px 0 3px; margin-top: 3px;
  border-top: 1px solid rgba(255,255,255,0.10);
}
.sp-section-hdr:first-child { border-top: none; margin-top: 0; padding-top: 0; }
.sp-row {
  display: flex; align-items: center;
  justify-content: space-between; gap: 6px;
}
.sp-block {
  display: flex; flex-direction: column; gap: 5px;
}
.sp-block-hdr {
  display: flex; align-items: baseline;
  justify-content: space-between; gap: 8px;
}
.sp-label {
  font-size: 10.5px; color: rgba(255,255,255,0.62);
  white-space: nowrap;
}
.sp-val {
  font-size: 10.5px; color: rgba(255,255,255,0.92);
  font-variant-numeric: tabular-nums;
}
.sp-hint {
  font-size: 9.5px; line-height: 1.45;
  color: rgba(255,255,255,0.42); padding: 1px 0 2px;
}
.sp-group { display: flex; flex-direction: column; gap: 8px; }
.sp-range {
  width: 100%; -webkit-appearance: none; appearance: none;
  height: 3px; background: #2a2a2a; border-radius: 2px;
  outline: none; cursor: pointer; display: block; min-width: 0;
}
.sp-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px; height: 12px; border-radius: 50%;
  background: #fff; cursor: pointer;
}
.sp-hue-wrap {
  width: 100%; height: 14px; border-radius: 7px;
  background: linear-gradient(90deg,
    hsl(0,100%,55%),hsl(30,100%,55%),hsl(60,100%,55%),hsl(90,100%,55%),
    hsl(120,100%,55%),hsl(150,100%,55%),hsl(180,100%,55%),hsl(210,100%,55%),
    hsl(240,100%,55%),hsl(270,100%,55%),hsl(300,100%,55%),hsl(330,100%,55%),hsl(360,100%,55%)
  );
  position: relative; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.1); display: block;
}
.sp-hue-thumb {
  position: absolute; top: 50%;
  transform: translate(-50%,-50%);
  width: 14px; height: 14px; border-radius: 50%;
  background: #fff; border: 2px solid rgba(0,0,0,0.5);
  box-shadow: 0 0 6px rgba(0,0,0,0.6); pointer-events: none;
}
.sp-color-row {
  display: flex; align-items: center;
  justify-content: space-between; gap: 6px;
}
.sp-color-inp {
  width: 28px; height: 18px;
  border-radius: 3px; border: 1px solid rgba(255,255,255,0.18);
  padding: 0; cursor: pointer; background: none;
}
.sp-mode-row {
  display: flex; gap: 4px; justify-content: center;
  padding: 2px 0 4px;
}
.sp-mode-btn {
  flex: 1; height: 26px; border-radius: 5px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.35); font-size: 11px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.sp-mode-btn:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
.sp-mode-btn.active {
  background: rgba(255,255,255,0.12);
  border-color: rgba(255,255,255,0.35);
  color: #fff;
}
`
  document.head.appendChild(s)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return [r,g,b]
}

function _fmtVal(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}

function makeSlider(label, min, max, step, val, onChange) {
  const block = document.createElement('div')
  block.className = 'sp-block'
  block.innerHTML = `<div class="sp-block-hdr"><span class="sp-label">${label}</span><span class="sp-val">${_fmtVal(val)}</span></div><input class="sp-range" type="range" min="${min}" max="${max}" step="${step}" value="${val}">`
  const valEl = block.querySelector('.sp-val')
  block.querySelector('input').addEventListener('input', e => {
    const v = parseFloat(e.target.value)
    valEl.textContent = _fmtVal(v)
    onChange(v)
  })
  return block
}

function makeHueDrag(colorState, panel) {
  const block = document.createElement('div')
  block.className = 'sp-block'
  block.innerHTML = `<span class="sp-label">${t('sp_hue_base')}</span><div class="sp-hue-wrap"><div class="sp-hue-thumb"></div></div>`
  const wrap  = block.querySelector('.sp-hue-wrap')
  const thumb = block.querySelector('.sp-hue-thumb')
  thumb.style.left = ((colorState.hueBase / 360) * 100) + '%'
  wrap.addEventListener('mousedown', e => {
    e.preventDefault()
    const move = ev => {
      const r = wrap.getBoundingClientRect()
      const norm = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width))
      colorState.hueBase = Math.round(norm * 360)
      thumb.style.left = (norm * 100) + '%'
    }
    move(e)
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  })
  return block
}

function makeColorRow(label, val, onChange) {
  const row = document.createElement('div')
  row.className = 'sp-color-row'
  row.innerHTML = `<span class="sp-label">${label}</span><input class="sp-color-inp" type="color" value="${val}">`
  row.querySelector('input').addEventListener('input', e => onChange(e.target.value))
  return row
}

function makeToggleRow(label, icon, active, onChange) {
  const row = document.createElement('div')
  row.className = 'sp-row'
  const lbl = document.createElement('span')
  lbl.className = 'sp-label'
  lbl.textContent = label
  const btn = document.createElement('button')
  btn.className = 'seq-btn' + (active ? ' active' : '')
  btn.innerHTML = `<i class="fa-solid fa-${icon}"></i>`
  btn.addEventListener('click', e => {
    e.stopPropagation()
    const v = !btn.classList.contains('active')
    btn.classList.toggle('active', v)
    onChange(v)
  })
  row.appendChild(lbl)
  row.appendChild(btn)
  return row
}

function makeSectionHdr(text) {
  const d = document.createElement('div')
  d.className = 'sp-section-hdr'
  d.textContent = text
  return d
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function buildPanel(wrap, cs, analyser) {
  const btn = document.createElement('button')
  btn.className = 'sp-palette-btn'
  btn.innerHTML = '<i class="fa-solid fa-palette"></i>'
  wrap.appendChild(btn)

  const panel = document.createElement('div')
  panel.className = 'sp-panel hidden'
  wrap.appendChild(panel)

  btn.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('hidden') })
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) panel.classList.add('hidden') })

  panel.appendChild(makeSectionHdr('Mode'))
  const modeRow = document.createElement('div')
  modeRow.className = 'sp-mode-row'
  MODES.forEach(m => {
    const b = document.createElement('button')
    b.className = 'sp-mode-btn' + (cs.mode === m.id ? ' active' : '')
    b.title = m.label
    b.innerHTML = `<i class="fa-solid fa-${m.icon}"></i>`
    b.addEventListener('click', e => {
      e.stopPropagation()
      cs.mode = m.id
      modeRow.querySelectorAll('.sp-mode-btn').forEach(x => x.classList.remove('active'))
      b.classList.add('active')
    })
    modeRow.appendChild(b)
  })
  panel.appendChild(modeRow)

  // Tag a control with the models it actually affects ('all' = every model
  // except Milkdrop; 'circle' = circle-only…). The panel then shows only the
  // controls relevant to the current model.
  const tag = (el, m = 'all') => { el.dataset.modes = m; return el }
  const C = 'circle'   // circle-only controls

  panel.appendChild(tag(makeSectionHdr(t('sp_rotation'))))
  const rotRow = document.createElement('div')
  rotRow.className = 'sp-row'
  rotRow.dataset.modes = 'all'
  rotRow.innerHTML = `<span class="sp-label">${t('sp_auto_rotate')}</span><button class="seq-btn ${cs.autoRotate?'active':''}" id="sp-auto-btn"><i class="fa-solid fa-rotate"></i></button>`
  panel.appendChild(rotRow)

  const speedBlock = makeSlider(t('sp_speed'), 0.01, 1.5, 0.01, cs.hueSpeed, v => { cs.hueSpeed = v })
  speedBlock.dataset.modes = 'all'
  if (!cs.autoRotate) { speedBlock.style.opacity = '0.35'; speedBlock.style.pointerEvents = 'none' }
  panel.appendChild(speedBlock)

  rotRow.querySelector('#sp-auto-btn').addEventListener('click', e => {
    e.stopPropagation()
    cs.autoRotate = !cs.autoRotate
    rotRow.querySelector('#sp-auto-btn').classList.toggle('active', cs.autoRotate)
    speedBlock.style.opacity       = cs.autoRotate ? '1' : '0.35'
    speedBlock.style.pointerEvents = cs.autoRotate ? '' : 'none'
  })

  panel.appendChild(tag(makeSectionHdr(t('sp_colors'))))
  panel.appendChild(tag(makeHueDrag(cs, panel)))
  panel.appendChild(tag(makeSlider(t('sp_saturation'),  30, 100, 1,   cs.saturation, v => { cs.saturation = v })))
  panel.appendChild(tag(makeSlider(t('sp_luminosity'),  40,  95, 1,   cs.luminosity, v => { cs.luminosity  = v })))
  panel.appendChild(tag(makeSlider(t('sp_hue_spread'),   0, 300, 5,   cs.hueSpread,  v => { cs.hueSpread   = v })))

  panel.appendChild(tag(makeSectionHdr(t('sp_hue_offsets')), C))
  panel.appendChild(tag(makeSlider(t('sp_crown'),        0, 360, 5, cs.offsetCrown,  v => { cs.offsetCrown  = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_oscilloscope'), 0, 360, 5, cs.offsetWave,   v => { cs.offsetWave   = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_center_glow'),  0, 360, 5, cs.offsetCenter, v => { cs.offsetCenter = v }), C))

  panel.appendChild(tag(makeSectionHdr(t('sp_background'))))
  panel.appendChild(tag(makeColorRow(t('sp_bg_color'), cs.bgColor, v => { cs.bgColor = v })))
  panel.appendChild(tag(makeSlider(t('sp_trail'),  0.04, 0.8, 0.01, cs.trail, v => { cs.trail = v })))

  panel.appendChild(tag(makeSectionHdr(t('sp_visibility')), C))
  panel.appendChild(tag(makeToggleRow(t('sp_bars'),       'chart-bar',   cs.showBars,  v => { cs.showBars  = v }), C))
  panel.appendChild(tag(makeToggleRow(t('sp_crown'),      'circle-dot',  cs.showCrown, v => { cs.showCrown = v }), C))
  panel.appendChild(tag(makeToggleRow(t('sp_wave'),       'wave-square', cs.showWave,  v => { cs.showWave  = v }), C))
  panel.appendChild(tag(makeToggleRow(t('sp_center_glow'),'circle',      cs.showGlow,  v => { cs.showGlow  = v }), C))
  panel.appendChild(tag(makeToggleRow(t('sp_mirror'),     'left-right',  cs.mirror,    v => { cs.mirror    = v }), C))

  panel.appendChild(tag(makeSectionHdr(t('sp_effects'))))
  panel.appendChild(tag(makeSlider(t('sp_bloom'),        0, 2.5, 0.05, cs.bloom,       v => { cs.bloom = v })))
  panel.appendChild(tag(makeSlider(t('sp_bloom_thresh'), 0, 1,   0.02, cs.bloomThresh, v => { cs.bloomThresh = v })))
  panel.appendChild(tag(makeSlider(t('sp_bloom_radius'), 0.5, 4, 0.1,  cs.bloomRadius, v => { cs.bloomRadius = v })))
  panel.appendChild(tag(makeSlider(t('sp_global_glow'),  0, 2, 0.05, cs.glow, v => { cs.glow = v })))
  panel.appendChild(tag(makeSlider(t('sp_bar_glow'),     0, 3, 0.05, cs.barGlow,   v => { cs.barGlow   = v }), 'circle,sphere3d'))
  panel.appendChild(tag(makeSlider(t('sp_crown_glow'),   0, 3, 0.05, cs.crownGlow, v => { cs.crownGlow = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_wave_glow'),    0, 3, 0.05, cs.waveGlow,  v => { cs.waveGlow  = v }), C))
  panel.appendChild(tag(makeToggleRow(t('sp_particles'),  'sparkles', cs.particles, v => { cs.particles = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_particle_qty'), 1, 30, 1, cs.particleCount, v => { cs.particleCount = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_beat_threshold'), 0.2, 0.9, 0.05, cs.beatThreshold, v => { cs.beatThreshold = v }), C))

  panel.appendChild(tag(makeSectionHdr(t('sp_structure'))))
  panel.appendChild(tag(makeSlider(t('sp_inner_radius'),  0.08, 0.35, 0.01, cs.innerR, v => { cs.innerR = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_outer_radius'),  0.25, 0.50, 0.01, cs.outerR, v => { cs.outerR = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_bar_count'),     60, 360, 10, cs.bars, v => { cs.bars = Math.round(v) }), C))
  panel.appendChild(tag(makeSlider(t('sp_crown_thickness'),0.5, 6, 0.5, cs.crownWidth, v => { cs.crownWidth = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_crown_fill'),    0, 0.3, 0.01, cs.crownFill, v => { cs.crownFill = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_wave_amplitude'),0.1, 1.5, 0.05, cs.waveAmplitude, v => { cs.waveAmplitude = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_wave_thickness'),0.5, 5, 0.5, cs.waveWidth, v => { cs.waveWidth = v }), C))
  panel.appendChild(tag(makeSlider(t('sp_smoothing'), 0.5, 0.97, 0.01, cs.smoothing, v => {
    cs.smoothing = v
    analyser.smoothingTimeConstant = v
  })))
}

// ══════════════════════════════════════════════════════════════════════════════
//  WebGL2 engine
// ══════════════════════════════════════════════════════════════════════════════

// GLSL HSL→RGB helper included in shaders that need it
const _HSL = `
vec3 hsl2rgb(float h, float s, float l) {
  h = mod(h, 360.0) / 360.0;  s /= 100.0;  l /= 100.0;
  float c = (1.0 - abs(2.0*l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 r;
  if      (h < 0.1667) r = vec3(c, x, 0.0);
  else if (h < 0.3333) r = vec3(x, c, 0.0);
  else if (h < 0.5000) r = vec3(0.0, c, x);
  else if (h < 0.6667) r = vec3(0.0, x, c);
  else if (h < 0.8333) r = vec3(x, 0.0, c);
  else                 r = vec3(c, 0.0, x);
  return clamp(r + m, 0.0, 1.0);
}
`

// ── Vertex shaders ────────────────────────────────────────────────────────────
// Fullscreen quad
const VERT_QUAD = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`

// Pixel-space geometry vertex shader
// a_xy: screen coords (top-left origin, pixels)
// a_col: rgba
// a_sz: point size (ignored for lines)
const VERT_GEOM = `#version 300 es
in vec2  a_xy;
in vec4  a_col;
in float a_sz;
out vec4 v_col;
uniform vec2 u_res;
void main() {
  v_col = a_col;
  gl_PointSize = max(1.0, a_sz);
  gl_Position  = vec4(
    a_xy.x / u_res.x * 2.0 - 1.0,
    1.0 - a_xy.y / u_res.y * 2.0,
    0.0, 1.0
  );
}`

// ── Fragment shaders ──────────────────────────────────────────────────────────
const FRAG_TRAIL = `#version 300 es
precision highp float;
uniform vec4 u_col;
out vec4 out_col;
void main() { out_col = u_col; }`

// Geometry fragment: solid color for lines, circular softened for points
const FRAG_GEOM = `#version 300 es
precision highp float;
in  vec4 v_col;
out vec4 out_col;
uniform int u_ispt;
void main() {
  float a = v_col.a;
  if (u_ispt != 0) {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    a *= exp(-d * d * 2.8);
    if (a < 0.004) discard;
  }
  out_col = vec4(v_col.rgb, a);
}`

// ── Circle / Arc unified fragment shader ──────────────────────────────────────
// u_mode 0 = circle (full 360°), u_mode 1 = arc (220° bottom)
const FRAG_CIRCLE = `#version 300 es
precision highp float;
${_HSL}
uniform sampler2D u_freq;
uniform sampler2D u_wave;
uniform vec2  u_res;
uniform float u_hue, u_sat, u_lum, u_spread;
uniform float u_innerR, u_outerR;
uniform float u_glow, u_barGlow, u_crownGlow, u_waveGlow;
uniform float u_waveAmp, u_crownW, u_crownFill;
uniform float u_bars, u_mirror;
uniform float u_showBars, u_showCrown, u_showWave, u_showGlow;
uniform float u_bassAvg;
uniform float u_offCrown, u_offWave, u_offCenter;
uniform int   u_mode;
in  vec2 v_uv;
out vec4 out_col;

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

float sampleFreq(float bi, float pow_e, float scale) {
  float t = pow(bi / u_bars, pow_e) * scale;
  return texture(u_freq, vec2(clamp(t, 0.001, 0.999), 0.5)).r;
}

void main() {
  vec2  fc  = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  float minR = min(u_res.x, u_res.y);
  vec3  col  = vec3(0.0);
  float alph = 0.0;

  if (u_mode == 0) {
    // ══ Circle ══════════════════════════════════════════════════════════
    vec2  d     = fc - u_res * 0.5;
    float dist  = length(d);
    // Quarter-turn so the spectrum starts at the TOP (not the left).
    float angle = mod(atan(d.y, d.x) - PI * 0.5 + PI, TAU) - PI;
    float normA = (angle + PI) / TAU;

    float innerR = minR * u_innerR;
    float outerR = minR * u_outerR;
    float slices = u_mirror > 0.5 ? u_bars * 2.0 : u_bars;
    float sliceF = normA * slices;
    float barIdx = u_mirror > 0.5
      ? (sliceF < u_bars ? sliceF : u_bars * 2.0 - 1.0 - sliceF)
      : sliceF;
    float bi    = floor(barIdx);
    float e     = sampleFreq(bi, 1.7, 0.72);
    float hue   = mod(u_hue + (bi / u_bars) * u_spread, 360.0);
    float tipR  = innerR + e * (outerR - innerR);
    // Position uses the pixel's actual slice (full circle) so mirrored bars draw
    // on BOTH sides; bi (mirrored) only drives the frequency/colour.
    float barCa = (floor(sliceF) + 0.5) / slices * TAU - PI;
    float dA    = abs(angle - barCa);
    if (dA > PI) dA = TAU - dA;
    float arcDist = dA * dist;
    float barHW   = PI / slices * innerR * 0.78;

    // Bars
    if (u_showBars > 0.5 && e > 0.003 && dist >= innerR && dist <= tipR) {
      float tt   = (dist - innerR) / max(0.001, tipR - innerR);
      float edge = smoothstep(barHW * 1.1, barHW * 0.1, arcDist);
      vec3  bc   = hsl2rgb(hue, u_sat, min(95.0, u_lum + tt * 12.0));
      float a    = (0.35 + 0.65 * tt) * edge;
      float gd   = exp(-arcDist * arcDist / max(0.001, barHW * barHW) * 1.5)
                   * e * u_glow * u_barGlow * 0.5;
      col  = max(col,  bc * (a + gd * 0.35));
      alph = max(alph, a + gd * 0.3);
    }
    // Bar glow halo outside tip
    if (u_showBars > 0.5 && e > 0.01 && dist > tipR && dist < tipR + minR * 0.04) {
      float od  = (dist - tipR) / (minR * 0.04);
      float gd2 = exp(-od * od * 4.0) * e * u_glow * u_barGlow * 0.4;
      float gd3 = exp(-arcDist * arcDist / max(0.001, barHW * barHW * 2.0)) * gd2;
      col  = max(col,  hsl2rgb(hue, u_sat, min(95.0, u_lum + 18.0)) * gd3);
      alph = max(alph, gd3 * 0.5);
    }

    // Crown
    if (u_showCrown > 0.5 && dist > innerR * 0.5 && dist < outerR * 1.15) {
      float crownHue = mod(u_hue + u_offCrown, 360.0);
      float eTip   = sampleFreq(bi, 1.7, 0.72);
      float crown  = innerR + eTip * (outerR - innerR);
      float cd     = abs(dist - crown);
      float cHW    = max(0.8, u_crownW);
      float cEdge  = exp(-cd * cd / (cHW * cHW) * 3.5) * 0.6;
      float cGlow  = exp(-cd * cd / (cHW * cHW * 6.0)) * 0.35 * u_glow * u_crownGlow;
      vec3  crownC = hsl2rgb(crownHue, u_sat, min(95.0, u_lum + 10.0));
      col  = max(col,  crownC * (cEdge + cGlow));
      alph = max(alph, cEdge + cGlow * 0.5);
      if (u_crownFill > 0.01 && dist >= innerR && dist <= crown) {
        float tt  = (dist - innerR) / max(0.001, crown - innerR);
        float fA  = u_crownFill * tt * 0.5;
        col  = max(col,  hsl2rgb(crownHue, u_sat, u_lum) * fA);
        alph = max(alph, fA);
      }
    }

    // Waveform ring
    if (u_showWave > 0.5 && dist < outerR * 1.3) {
      float wHue   = mod(u_hue + u_offWave, 360.0);
      float wSamp  = texture(u_wave, vec2(normA, 0.5)).r;
      float waveR  = innerR * (1.0 + (wSamp * 2.0 - 1.0) * u_waveAmp);
      float wd     = abs(dist - waveR);
      float wHW    = max(0.7, u_crownW * 0.6);
      float wEdge  = exp(-wd * wd / (wHW * wHW) * 3.5) * 0.8;
      float wGlow  = exp(-wd * wd / (wHW * wHW * 8.0)) * 0.3 * u_glow * u_waveGlow;
      vec3  wC     = hsl2rgb(wHue, u_sat, min(95.0, u_lum + 15.0));
      col  = max(col,  wC * (wEdge + wGlow));
      alph = max(alph, wEdge * 0.8 + wGlow * 0.4);
    }

    // Center glow
    if (u_showGlow > 0.5 && dist < innerR * 1.15) {
      float cHue = mod(u_hue + u_offCenter, 360.0);
      float gn   = dist / (innerR * 1.15);
      float gv   = (1.0 - gn) * (0.05 + u_bassAvg * 0.5) * u_glow;
      col  = max(col,  hsl2rgb(cHue, u_sat, 88.0) * gv);
      alph = max(alph, gv);
    }

  } else {
    // ══ Arc ═════════════════════════════════════════════════════════════
    float arcCY  = u_res.y * 0.5 + minR * 0.22;
    vec2  da     = fc - vec2(u_res.x * 0.5, arcCY);
    float dist   = length(da);
    float arcR0  = minR * 0.32;
    float arcR1  = arcR0 + minR * 0.48;

    // Arc spans 220° centred on bottom (270°): 160°..380° = 160°..360° + 0°..20°
    float aDeg = mod(degrees(atan(da.y, da.x)) + 360.0, 360.0);
    float relA;
    bool  inArc;
    if (aDeg >= 160.0) {
      relA = aDeg - 160.0;  inArc = relA <= 220.0;
    } else if (aDeg <= 20.0) {
      relA = aDeg + 200.0;  inArc = relA <= 220.0;
    } else {
      inArc = false; relA = 0.0;
    }

    if (inArc && dist > arcR0 * 0.3 && dist < arcR1 * 1.25) {
      float barF   = relA / 220.0 * u_bars;
      float bi     = clamp(floor(barF), 0.0, u_bars - 1.0);
      float e      = sampleFreq(bi, 1.6, 0.78);
      float hue    = mod(u_hue + (bi / u_bars) * u_spread, 360.0);
      float r2     = arcR0 + e * (arcR1 - arcR0);

      float barCDeg   = 160.0 + (bi + 0.5) / u_bars * 220.0;
      float dDeg      = abs(aDeg - mod(barCDeg, 360.0));
      if (dDeg > 180.0) dDeg = 360.0 - dDeg;
      float arcDist   = radians(dDeg) * dist;
      float barHW     = radians(110.0 / u_bars) * arcR0;

      // Bars
      if (u_showBars > 0.5 && e > 0.003 && dist >= arcR0 && dist <= r2) {
        float tt   = (dist - arcR0) / max(0.001, r2 - arcR0);
        float edge = smoothstep(barHW * 1.1, barHW * 0.1, arcDist);
        vec3  bc   = hsl2rgb(hue, u_sat, min(95.0, u_lum + tt * 14.0));
        float a    = (0.35 + 0.65 * tt) * edge;
        float gd   = exp(-arcDist * arcDist / max(0.001, barHW * barHW) * 1.5)
                     * e * u_glow * u_barGlow * 0.5;
        col  = max(col,  bc * (a + gd * 0.4));
        alph = max(alph, a + gd * 0.3);
      }

      // Crown
      if (u_showCrown > 0.5) {
        float crownHue = mod(u_hue + u_offCrown, 360.0);
        float crown    = arcR0 + e * (arcR1 - arcR0);
        float cd       = abs(dist - crown);
        float cHW      = max(0.8, u_crownW);
        float cEdge    = exp(-cd * cd / (cHW * cHW) * 3.5) * 0.55;
        float cGlow    = exp(-cd * cd / (cHW * cHW * 6.0)) * 0.3 * u_glow * u_crownGlow;
        col  = max(col,  hsl2rgb(crownHue, u_sat, min(95.0, u_lum+10.0)) * (cEdge + cGlow));
        alph = max(alph, cEdge + cGlow * 0.5);
      }

      // Baseline arc ring
      float bd = abs(dist - arcR0);
      float be = exp(-bd * bd / 4.0) * 0.12;
      col  = max(col,  hsl2rgb(u_hue, u_sat, u_lum) * be);
      alph = max(alph, be);
    }

    // Center glow
    if (u_showGlow > 0.5 && dist < arcR0 * 1.2) {
      float cHue = mod(u_hue + u_offCenter, 360.0);
      float arcR0l = minR * 0.32;
      float gn   = dist / (arcR0l * 1.2);
      float gv   = (1.0 - gn) * (0.04 + u_bassAvg * 0.4) * u_glow;
      col  = max(col,  hsl2rgb(cHue, u_sat, 88.0) * gv);
      alph = max(alph, gv);
    }
  }

  out_col = vec4(col, clamp(alph, 0.0, 1.0));
}`

// ── Bubbles fragment shader ───────────────────────────────────────────────────
const FRAG_BUBBLES = `#version 300 es
precision highp float;
${_HSL}
uniform sampler2D u_freq;
uniform vec2  u_res;
uniform float u_hue, u_sat, u_lum, u_spread, u_glow, u_bassAvg, u_time;
in  vec2 v_uv;
out vec4 out_col;

const int   N    = 96;
const float GOLD = 2.39996322;

void main() {
  vec2  fc   = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  float minR = min(u_res.x, u_res.y);
  vec2  ctr  = u_res * 0.5;
  vec3  col  = vec3(0.0);
  float alph = 0.0;

  for (int i = 0; i < N; i++) {
    float fi    = float(i);
    float norm  = fi / float(N - 1);
    float r     = sqrt(norm) * minR * 0.52;
    float theta = fi * GOLD;
    vec2  cen   = ctr + vec2(cos(theta) * r, sin(theta) * r);

    float t   = fi / float(N) * 0.7;
    float e   = texture(u_freq, vec2(t, 0.5)).r;
    float maxB = minR * 0.13;
    float minB = minR * 0.025;
    float wobble = 1.0 + sin(u_time * 1.8 + fi * 1.234) * 0.06;
    float bR  = (minB + e * (maxB - minB)) * wobble;
    float hue = mod(u_hue + (fi / float(N)) * u_spread + mod(fi, 3.0) * 30.0, 360.0);

    float d  = length(fc - cen);
    float dn = d / max(0.5, bR);

    if (dn < 2.8) {
      float alpha = 0.25 + e * 0.55;
      // Inner glow core
      float core = exp(-dn * dn * 2.5);
      // Rim at ~85% radius
      float rim  = exp(-pow(abs(dn - 0.85), 2.0) * 12.0) * (0.3 + e * 0.5);
      // Top-left highlight
      vec2  hPos  = cen - vec2(bR * 0.28, bR * 0.28);
      float hDist = length(fc - hPos) / max(0.5, bR * 0.22);
      float hl    = exp(-hDist * hDist * 3.0) * 0.28;
      // Outer glow
      float og    = exp(-dn * dn * 0.45) * e * u_glow * 0.45;

      vec3  bubC  = hsl2rgb(hue, u_sat, u_lum + 8.0);
      vec3  rimC  = hsl2rgb(mod(hue + 60.0, 360.0), u_sat, 92.0);
      vec3  cc    = (bubC * core + rimC * rim + vec3(1.0) * hl) * alpha;
      float aa    = (core + rim) * alpha + og * 0.4;
      col  = max(col,  cc + hsl2rgb(hue, u_sat, u_lum) * og);
      alph = max(alph, clamp(aa, 0.0, 1.0));
    }
  }

  // Centre nebula
  float cn = length(fc - ctr) / (minR * 0.35);
  if (cn < 1.0) {
    float gv = (1.0 - cn) * (0.04 + u_bassAvg * 0.18) * u_glow;
    col  = max(col,  hsl2rgb(mod(u_hue + 40.0, 360.0), u_sat, 80.0) * gv);
    alph = max(alph, gv);
  }
  out_col = vec4(col, clamp(alph, 0.0, 1.0));
}`

// (Waterfall uses CPU geometry via batch — no fragment shader needed)

// ── Bloom post-process shaders ────────────────────────────────────────────────
// Bright pass: keep only pixels above a soft luminance threshold.
const FRAG_BRIGHT = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_thresh, u_knee;
in vec2 v_uv;
out vec4 out_col;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float w = smoothstep(u_thresh, u_thresh + u_knee, l);
  out_col = vec4(c * w, 1.0);
}`

// Separable Gaussian blur (13-tap, sigma-ish). u_dir = texel step * radius.
const FRAG_BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
in vec2 v_uv;
out vec4 out_col;
void main() {
  vec3 s = texture(u_tex, v_uv).rgb * 0.1964825501511404;
  vec2 o1 = u_dir * 1.411764705882353;
  vec2 o2 = u_dir * 3.2941176470588234;
  vec2 o3 = u_dir * 5.176470588235294;
  s += (texture(u_tex, v_uv + o1).rgb + texture(u_tex, v_uv - o1).rgb) * 0.2969069646728344;
  s += (texture(u_tex, v_uv + o2).rgb + texture(u_tex, v_uv - o2).rgb) * 0.09447039785044732;
  s += (texture(u_tex, v_uv + o3).rgb + texture(u_tex, v_uv - o3).rgb) * 0.010381362401148057;
  out_col = vec4(s, 1.0);
}`

// Composite: scene + bloom (additive), tiny soft-clip on the very brightest.
const FRAG_COMP = `#version 300 es
precision highp float;
uniform sampler2D u_scene, u_bloom;
uniform float u_intensity;
in vec2 v_uv;
out vec4 out_col;
void main() {
  vec3 sc = texture(u_scene, v_uv).rgb;
  vec3 bl = texture(u_bloom, v_uv).rgb;
  // Pure additive: the base scene is preserved exactly, bloom adds glow on top.
  out_col = vec4(sc + bl * u_intensity, 1.0);
}`

// ══════════════════════════════════════════════════════════════════════════════
//  GL helpers
// ══════════════════════════════════════════════════════════════════════════════
function _mkShader(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error('[Spectrum GL] shader:', gl.getShaderInfoLog(s))
  return s
}

function _cacheUniforms(gl, prog, ...names) {
  const locs = {}
  for (const n of names) locs[n] = gl.getUniformLocation(prog, n)
  return locs
}

function _mkProg(gl, vert, frag) {
  const p = gl.createProgram()
  gl.attachShader(p, _mkShader(gl, gl.VERTEX_SHADER,   vert))
  gl.attachShader(p, _mkShader(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    console.error('[Spectrum GL] link:', gl.getProgramInfoLog(p))
  return p
}

// Create VAO + VBO for fullscreen quad; bind a_pos
function _mkQuadVAO(gl, prog) {
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}

// Create a 1D texture for FFT / waveform data
function _mk1DTex(gl, width) {
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, 1, 0, gl.RED, gl.UNSIGNED_BYTE,
                new Uint8Array(width))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}

// Create an RGBA8 framebuffer + its color texture (for bloom / scene buffers).
function _mkFBO(gl, w, h) {
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fb = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fb, tex, w, h, ok }
}


// ── Geometry batch ─────────────────────────────────────────────────────────────
// Accumulates vertex data (x, y, r, g, b, a, size) then flushes to GL.
// STRIDE = 7 floats per vertex
const _STRIDE = 7

class GeomBatch {
  constructor(gl, prog, maxVerts = 32768) {
    this._gl      = gl
    this._prog    = prog
    this._max     = maxVerts
    this._data    = new Float32Array(maxVerts * _STRIDE)
    this._n       = 0

    this._vao = gl.createVertexArray()
    gl.bindVertexArray(this._vao)
    this._buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buf)
    gl.bufferData(gl.ARRAY_BUFFER, this._data.byteLength, gl.DYNAMIC_DRAW)

    const bpe = 4  // bytes per float
    const sz  = _STRIDE * bpe
    const aXY  = gl.getAttribLocation(prog, 'a_xy')
    const aCol = gl.getAttribLocation(prog, 'a_col')
    const aSz  = gl.getAttribLocation(prog, 'a_sz')
    gl.enableVertexAttribArray(aXY)
    gl.vertexAttribPointer(aXY,  2, gl.FLOAT, false, sz, 0)
    gl.enableVertexAttribArray(aCol)
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, sz, 2 * bpe)
    gl.enableVertexAttribArray(aSz)
    gl.vertexAttribPointer(aSz,  1, gl.FLOAT, false, sz, 6 * bpe)
    gl.bindVertexArray(null)
    this._uIspt = gl.getUniformLocation(prog, 'u_ispt')
  }

  write(x, y, r, g, b, a, sz = 0) {
    if (this._n >= this._max) return
    const i = this._n * _STRIDE
    this._data[i]   = x;  this._data[i+1] = y
    this._data[i+2] = r;  this._data[i+3] = g
    this._data[i+4] = b;  this._data[i+5] = a
    this._data[i+6] = sz
    this._n++
  }

  // Write a line (2 verts identical except position)
  line(x0, y0, x1, y1, r, g, b, a) {
    this.write(x0, y0, r, g, b, a, 0)
    this.write(x1, y1, r, g, b, a, 0)
  }

  flush(mode, isPoint = false) {
    if (this._n === 0) return
    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._data, 0, this._n * _STRIDE)
    gl.bindVertexArray(this._vao)
    gl.uniform1i(this._uIspt, isPoint ? 1 : 0)
    gl.drawArrays(mode, 0, this._n)
    gl.bindVertexArray(null)
    this._n = 0
  }

  // Write a filled rectangle as 2 triangles (use with flush(gl.TRIANGLES))
  rect(x, y, w, h, r, g, b, a) {
    this.write(x,   y,   r, g, b, a, 0)
    this.write(x+w, y,   r, g, b, a, 0)
    this.write(x,   y+h, r, g, b, a, 0)
    this.write(x+w, y,   r, g, b, a, 0)
    this.write(x+w, y+h, r, g, b, a, 0)
    this.write(x,   y+h, r, g, b, a, 0)
  }

  reset() { this._n = 0 }
}

// ══════════════════════════════════════════════════════════════════════════════
//  HSL → [r,g,b] on CPU (for geometry color computation)
// ══════════════════════════════════════════════════════════════════════════════
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h * 6) % 2 - 1))
  const m = l - c / 2
  let r, g, b
  if      (h < 1/6) { r=c; g=x; b=0 }
  else if (h < 2/6) { r=x; g=c; b=0 }
  else if (h < 3/6) { r=0; g=c; b=x }
  else if (h < 4/6) { r=0; g=x; b=c }
  else if (h < 5/6) { r=x; g=0; b=c }
  else              { r=c; g=0; b=x }
  return [r+m, g+m, b+m]
}

// ══════════════════════════════════════════════════════════════════════════════
//  Draw: DNA (geometry mode, CPU projection → GPU lines/points)
// ══════════════════════════════════════════════════════════════════════════════
function drawDNAGL(gl, batch, W, H, cs, freqData, freqBins, hueShift, dpr, bassAvg, dnaState, lineW) {
  const sat = cs.saturation, lum = cs.luminosity, gl_ = cs.glow, spread = cs.hueSpread

  // ── Audio analysis: bands + overall energy (drives the whole reaction) ──────
  let bass = 0, mid = 0, treb = 0
  for (let i = 0;   i < 14;  i++) bass += freqData[i];  bass /= (14 * 255)
  for (let i = 14;  i < 90;  i++) mid  += freqData[i];  mid  /= (76 * 255)
  for (let i = 90;  i < 320; i++) treb += freqData[i];  treb /= (230 * 255)
  const energy = bass * 1.25 + mid * 0.9 + treb * 0.7
  // Smoothed "pulse" so the helix breathes instead of jittering
  dnaState.pulse = (dnaState.pulse ?? 0) * 0.78 + bass * 0.22
  const pulse = dnaState.pulse

  // Bass-reactive rotation (+ a little wobble on energy)
  dnaState.rotY = (dnaState.rotY ?? 0) + (0.009 + bass * 0.045) * (cs.hueSpeed / 0.18)
  const wob = Math.sin(performance.now() * 0.0011) * 0.06 * (0.4 + energy)

  const STEPS  = 240
  const turns  = 3.6     // proportional to length so the helix density stays clean
  const baseR  = Math.min(W, H) * 0.22                     // wider so it fills the frame
  const helixR = baseR * (1 + pulse * 0.42 + mid * 0.14)   // breathes with the music
  const yExt   = H * (1.45 + pulse * 0.14)                 // longer strand — ends run off-screen, no gaps
  const focal  = H * 2.4
  const cx = W / 2, cy = H / 2
  const minWH = Math.min(W, H)

  // In-plane lean so the strand looks tilted rather than a face-on tube.
  const lean = 0.26, cosL = Math.cos(lean), sinL = Math.sin(lean)
  function proj(x3, y3, z3) {
    const s  = focal / (focal + z3 + baseR * 1.2)
    const px = x3 * s, py = y3 * s
    return { x: cx + px * cosL - py * sinL, y: cy + px * sinL + py * cosL, z: z3, s }
  }

  // Per-step strand points + local spectral energy at that height
  const s0 = [], s1 = [], en = []
  for (let i = 0; i <= STEPS; i++) {
    const frac  = i / STEPS
    const y3    = (frac - 0.5) * yExt
    const angle = frac * turns * Math.PI * 2 + dnaState.rotY + wob * Math.sin(frac * 6.0)
    const cosA  = Math.cos(angle), sinA = Math.sin(angle)
    // local energy: low freqs at center, highs toward the ends (spread spectrum on the helix)
    const bin   = Math.floor(Math.pow(Math.abs(frac - 0.5) * 2, 0.8) * freqBins * 0.5)
    en.push(freqData[Math.min(bin, freqBins - 1)] / 255)
    s0.push(proj( helixR * cosA, y3,  helixR * sinA))
    s1.push(proj(-helixR * cosA, y3, -helixR * sinA))
  }

  const hue0 = hueShift
  const hue1 = (hueShift + 30 + spread * 0.35) % 360   // 2nd strand hue uses the Spread control

  // ── Backbones: wide glow pass then bright core (great with bloom) ────────────
  for (let pass = 0; pass < 2; pass++) {
    const wide = pass === 0
    for (let si = 0; si < 2; si++) {
      const strand = si === 0 ? s0 : s1
      const hue    = si === 0 ? hue0 : hue1
      for (let i = 0; i < STEPS; i++) {
        const p = strand[i], q = strand[i + 1]
        const depth = ((p.z + q.z) * 0.5 + baseR) / (2 * baseR)   // 0 far … 1 near
        const e     = (en[i] + en[i + 1]) * 0.5
        const l     = Math.min(94, lum + e * 28)
        const [r, g, b] = hslToRgb(hue, sat, l)
        if (wide) {
          batch.line(p.x, p.y, q.x, q.y, r, g, b, (0.05 + depth * 0.22 + e * 0.25) * gl_)
        } else {
          batch.line(p.x, p.y, q.x, q.y, r, g, b, 0.22 + depth * 0.55 + e * 0.2)
        }
      }
    }
    batch.flush(gl.LINES)
  }

  // ── Base-pair rungs (sorted back→front for depth) ───────────────────────────
  const rungEvery = 8
  const rungs = []
  for (let i = 0; i <= STEPS; i += rungEvery) {
    const p = s0[i], q = s1[i]
    if (!p || !q) continue
    rungs.push({ p, q, midZ: (p.z + q.z) * 0.5, energy: en[i],
                 depth: ((p.z + q.z) * 0.5 + baseR) / (2 * baseR) })
  }
  rungs.sort((a, b) => a.midZ - b.midZ)

  // Rung glow + core (colour driven by energy via the Spread control)
  for (let pass = 0; pass < 2; pass++) {
    for (const { p, q, depth, energy } of rungs) {
      if (energy < 0.03) continue
      const vis = 0.3 + depth * 0.7
      const hue = (hueShift + 60 + energy * spread) % 360
      const [r, g, b] = hslToRgb(hue, sat, Math.min(95, lum + energy * 22))
      if (pass === 0) batch.line(p.x, p.y, q.x, q.y, r, g, b, (0.04 + energy * 0.3) * vis * gl_ * 1.4)
      else            batch.line(p.x, p.y, q.x, q.y, r, g, b, (0.10 + energy * 0.55) * vis)
    }
    batch.flush(gl.LINES)
  }

  // ── Nucleotide orbs at each strand point: big halo + bright core ────────────
  const beatBoost = 1 + bass * 1.2
  for (const { p, q, depth, energy } of rungs) {
    if (energy < 0.03) continue
    const vis  = 0.3 + depth * 0.7
    const hue  = (hueShift + 60 + energy * spread) % 360
    const sz   = minWH * 0.018 * (0.4 + energy * 1.3) * vis * beatBoost
    if (sz < 1) continue
    const [r, g, b]  = hslToRgb(hue, Math.min(100, sat + 10), Math.min(95, lum + 18 + energy * 15))
    const a = (0.55 + energy * 0.4) * vis
    // halo (wide, faint, additive-ish) ×2 then bright core
    batch.write(p.x, p.y, r, g, b, a * 0.32 * gl_, sz * 3.2)
    batch.write(q.x, q.y, r, g, b, a * 0.32 * gl_, sz * 3.2)
    batch.write(p.x, p.y, r, g, b, a * 0.6  * gl_, sz * 1.9)
    batch.write(q.x, q.y, r, g, b, a * 0.6  * gl_, sz * 1.9)
    batch.write(p.x, p.y, r, g, b, a,             sz)
    batch.write(q.x, q.y, r, g, b, a,             sz)
  }
  batch.flush(gl.POINTS, true)
}

// ══════════════════════════════════════════════════════════════════════════════
//  Draw: Sphere 3D
// ══════════════════════════════════════════════════════════════════════════════
function drawSphere3DGL(gl, batch, W, H, cs, freqData, freqBins, hueShift, bassAvg, stSph) {
  const sat = cs.saturation, lum = cs.luminosity, gl_ = cs.glow
  const N     = 128
  // Radius breathes with the bass (smoothed) so the sphere pulses to the music.
  stSph.pulse = (stSph.pulse ?? 0) * 0.8 + bassAvg * 0.2
  const R     = Math.min(W, H) * 0.5 * 0.36 * (1 + stSph.pulse * 0.5)
  const focal = Math.max(W, H) * 1.1
  const cx = W / 2, cy = H / 2

  stSph.rotY = (stSph.rotY ?? 0) + 0.008 * (cs.hueSpeed / 0.18) * (1 + bassAvg * 0.6)
  stSph.rotX = stSph.rotX ?? 0.38

  if (!stSph.pts) {
    const golden = Math.PI * (3 - Math.sqrt(5))
    stSph.pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const phi = golden * i
      return { nx: r * Math.cos(phi), ny: y, nz: r * Math.sin(phi),
               bin: Math.floor((i / N) * freqBins * 0.75) }
    })
  }

  const cosY = Math.cos(stSph.rotY), sinY = Math.sin(stSph.rotY)
  const cosX = Math.cos(stSph.rotX), sinX = Math.sin(stSph.rotX)

  const projected = stSph.pts.map(pt => {
    const rx   = pt.nx * cosY - pt.nz * sinY
    const rz   = pt.nx * sinY + pt.nz * cosY
    const ry2  = pt.ny * cosX - rz * sinX
    const rz2  = pt.ny * sinX + rz * cosX
    const energy = freqData[pt.bin] / 255
    const barLen = R * 0.06 + energy * R * 0.6
    const depth  = (rz2 + 1) * 0.5
    const sB = focal / (focal + rz2 * R + R * 0.5)
    const sT = focal / (focal + rz2 * (R + barLen) + R * 0.5)
    return {
      bx: cx + rx * R * sB, by: cy + ry2 * R * sB,
      tx: cx + rx * (R + barLen) * sT, ty: cy + ry2 * (R + barLen) * sT,
      z: rz2, energy, bin: pt.bin, depth,
    }
  })
  projected.sort((a, b) => a.z - b.z)

  for (const p of projected) {
    if (p.energy < 0.006) continue
    const hue   = (hueShift + (p.bin / freqBins) * cs.hueSpread) % 360
    const alpha = 0.1 + p.depth * 0.65 + p.energy * 0.25
    const [r, g, b] = hslToRgb(hue, sat, Math.min(95, lum + 14))
    // Glow layer
    batch.line(p.bx, p.by, p.tx, p.ty, r, g, b, alpha * 0.3 * gl_ * cs.barGlow)
    // Core
    batch.line(p.bx, p.by, p.tx, p.ty, r, g, b, alpha)
    // Tip dot
    if (p.energy > 0.22 && p.depth > 0.38) {
      const sz = (0.7 + p.energy * 3.2 + p.depth * 1.5) * 1.5
      batch.write(p.tx, p.ty, r, g, b, alpha, sz)
    }
  }
  batch.flush(gl.LINES)
  batch.flush(gl.POINTS, true)

  // Ghost rings
  for (let ring = 0; ring < 3; ring++) {
    const ringY = (ring / 2 - 0.5) * 1.6
    const ringR = Math.sqrt(Math.max(0, 1 - ringY * ringY)) * R
    if (ringR < 0.01) continue
    const [rr, rg, rb] = hslToRgb(hueShift, sat, lum)
    for (let a = 0; a < 64; a++) {
      const phi = (a / 64) * Math.PI * 2
      const wx  = Math.cos(phi) * ringR
      const wz  = Math.sin(phi) * ringR
      const rx2 = wx * cosY - wz * sinY
      const rz2 = wx * sinY + wz * cosY
      const ry3 = ringY * R * cosX - rz2 * sinX
      const rz3 = ringY * R * sinX + rz2 * cosX
      const s   = focal / (focal + rz3 + R * 0.5)
      const nx  = cx + rx2 * s, ny = cy + ry3 * s
      const phi2 = ((a + 1) / 64) * Math.PI * 2
      const wx2  = Math.cos(phi2) * ringR
      const wz2  = Math.sin(phi2) * ringR
      const rx22 = wx2 * cosY - wz2 * sinY
      const rz22 = wx2 * sinY + wz2 * cosY
      const ry32 = ringY * R * cosX - rz22 * sinX
      const rz32 = ringY * R * sinX + rz22 * cosX
      const s2  = focal / (focal + rz32 + R * 0.5)
      batch.line(nx, ny, cx + rx22 * s2, cy + ry32 * s2, rr, rg, rb, 0.07)
    }
  }
  batch.flush(gl.LINES)
}

// ══════════════════════════════════════════════════════════════════════════════
//  Draw: Synapse (CPU physics → GPU lines + points)
// ══════════════════════════════════════════════════════════════════════════════
function drawSynapseGL(gl, batch, W, H, cs, freqData, freqBins, hueShift, dpr, bassAvg, isBeat, synState) {
  const sat = cs.saturation, lum = cs.luminosity, gl_ = cs.glow
  const N = 68
  const cx = W / 2, cy = H / 2
  const minR = Math.min(W, H)
  const CONNECT_DIST = minR * 0.42

  if (synState.W !== W || synState.H !== H || !synState.nodes) {
    synState.W = W; synState.H = H
    synState.rings = []
    const rng = (() => { let s = 0x9e3779b9; return () => { s ^= s<<13; s ^= s>>17; s ^= s<<5; return (s >>> 0) / 0xffffffff } })()
    synState.nodes = Array.from({ length: N }, (_, i) => {
      const r = (0.15 + rng() * 0.85) * minR * 0.88 * 0.5
      const theta = rng() * Math.PI * 2
      const x = cx + Math.cos(theta) * r * (W / Math.max(W, H))
      const y = cy + Math.sin(theta) * r * (H / Math.max(W, H))
      return {
        x, y, targetX: x, targetY: y,
        migTimer: Math.floor(rng() * 180 + 90),
        migrating: false, arrivalGlow: 0,
        bin: Math.floor((i / N) * freqBins * 0.72),
        pulse: 0,
        vx: (rng() - 0.5) * 0.3, vy: (rng() - 0.5) * 0.3,
        phase: rng() * Math.PI * 2, hueOff: rng() * cs.hueSpread,
      }
    })
  }
  if (!synState.rings) synState.rings = []
  const now   = performance.now() / 1000
  const nodes = synState.nodes

  // Node movement
  for (const n of nodes) {
    if (n.migrating) {
      const dx = n.targetX - n.x, dy = n.targetY - n.y
      const dist = Math.hypot(dx, dy)
      n.x += dx * 0.065; n.y += dy * 0.065
      if (dist < 4 * dpr) {
        n.migrating = false; n.arrivalGlow = 1.0
        n.x = n.targetX; n.y = n.targetY
        synState.rings.push({ x: n.x, y: n.y, r: 4 * dpr, life: 1.0, hue: (hueShift + n.hueOff) % 360 })
      }
    } else {
      n.x += n.vx * dpr * 0.16; n.y += n.vy * dpr * 0.16
      if (Math.abs(n.x - cx) > W * 0.44) n.vx *= -1
      if (Math.abs(n.y - cy) > H * 0.44) n.vy *= -1
      n.targetX = n.x; n.targetY = n.y
      n.migTimer--
      if (n.migTimer <= 0) {
        const rr = (0.08 + Math.random() * 0.88) * minR * 0.88 * 0.5
        const theta = Math.random() * Math.PI * 2
        n.targetX = cx + Math.cos(theta) * rr * (W / Math.max(W, H))
        n.targetY = cy + Math.sin(theta) * rr * (H / Math.max(W, H))
        n.migTimer = 140 + Math.floor(Math.random() * 220)
        n.migrating = true
      }
    }
    if (n.arrivalGlow > 0) n.arrivalGlow *= 0.88
  }

  // Beat pulse
  if (isBeat) {
    const hot = nodes.reduce((best, n) => {
      const e = freqData[n.bin] / 255
      return e > best.e ? { n, e } : best
    }, { n: nodes[0], e: 0 })
    hot.n.pulse = 1.0
  }
  for (const n of nodes) {
    if (n.pulse > 0.01) {
      for (const m of nodes) {
        if (m === n) continue
        const d = Math.hypot(m.x - n.x, m.y - n.y)
        if (d < CONNECT_DIST * 0.6 && m.pulse < n.pulse * 0.7)
          m.pulse = Math.max(m.pulse, n.pulse * 0.55)
      }
    }
    n.pulse *= 0.93
  }

  // Arrival rings
  for (let i = synState.rings.length - 1; i >= 0; i--) {
    const ring = synState.rings[i]
    ring.r += 2.2 * dpr; ring.life *= 0.88
    if (ring.life < 0.02) { synState.rings.splice(i, 1); continue }
    // Draw ring as line loop (approximated as many short segments)
    const [rr, rg, rb] = hslToRgb(ring.hue, sat, Math.min(92, lum + 18))
    const segs = 24
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2
      batch.line(
        ring.x + Math.cos(a0) * ring.r, ring.y + Math.sin(a0) * ring.r,
        ring.x + Math.cos(a1) * ring.r, ring.y + Math.sin(a1) * ring.r,
        rr, rg, rb, ring.life * 0.7
      )
    }
  }
  batch.flush(gl.LINES)

  // Migration trails
  for (const n of nodes) {
    if (!n.migrating) continue
    const hue = (hueShift + n.hueOff) % 360
    const dist = Math.hypot(n.targetX - n.x, n.targetY - n.y)
    const alpha = Math.min(0.45, dist / (minR * 0.5)) * 0.5
    const [rr, rg, rb] = hslToRgb(hue, sat, lum)
    batch.line(n.x, n.y, n.targetX, n.targetY, rr, rg, rb, alpha)
  }
  batch.flush(gl.LINES)

  // Edges
  for (let i = 0; i < N; i++) {
    const a = nodes[i], ea = freqData[a.bin] / 255
    for (let j = i + 1; j < N; j++) {
      const b = nodes[j], eb = freqData[b.bin] / 255
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      if (d > CONNECT_DIST) continue
      const strength   = (ea + eb) * 0.5 * (1 - d / CONNECT_DIST)
      const pulse      = (a.pulse + b.pulse) * 0.5
      const totalAlpha = Math.min(0.65, strength * 0.4 + pulse * 0.5)
      if (totalAlpha < 0.015) continue
      const hue = (hueShift + ((i + j) / (N * 1.4)) * cs.hueSpread) % 360
      const [rr, rg, rb] = hslToRgb(hue, sat, lum)
      // Glow
      batch.line(a.x, a.y, b.x, b.y, rr, rg, rb, totalAlpha * 0.3 * gl_)
      // Core
      batch.line(a.x, a.y, b.x, b.y, rr, rg, rb, totalAlpha)
    }
  }
  batch.flush(gl.LINES)

  // Nodes (points)
  for (const n of nodes) {
    const e     = freqData[n.bin] / 255
    const pls   = n.pulse
    const aglow = n.arrivalGlow
    const r     = (2 + e * 5 + pls * 8 + aglow * 6) * dpr
    const hue   = (hueShift + n.hueOff) % 360
    const wobble = 1 + Math.sin(now * 2.5 + n.phase) * 0.12
    const sz    = r * wobble * 2
    const [rr, rg, rb] = hslToRgb(hue, sat, lum + 10)
    // Aura glow
    if (e > 0.07 || pls > 0.04 || aglow > 0.1) {
      const auraA = (e * 0.28 + pls * 0.5 + aglow * 0.6) * gl_
      batch.write(n.x, n.y, rr, rg, rb, auraA * 0.5, sz * 3.5)
    }
    // Core
    const coreA = 0.6 + e * 0.4 + pls * 0.4 + aglow * 0.4
    batch.write(n.x, n.y, rr, rg, rb, coreA, sz)
  }
  batch.flush(gl.POINTS, true)
}

// ══════════════════════════════════════════════════════════════════════════════
//  Draw: Waterfall 3D (CPU geometry → GPU triangles + lines)
// ══════════════════════════════════════════════════════════════════════════════
function drawWfall3DGL(gl, batch, W, H, cs, freqData, freqBins, hueShift, bassAvg, wfSt) {
  const sat = cs.saturation, lum = cs.luminosity, gl_ = cs.glow
  const HISTORY = 64, COLS = 72
  const focal   = H * 1.6
  const floorY  = H * 0.90                       // near edge low → fills toward the bottom
  const barMaxH = Math.min(W, H) * 0.52
  const cx      = W * 0.5
  const SPANX   = 0.96                            // fraction of width the field uses

  if (!wfSt.frames) wfSt.frames = []
  const snap = new Float32Array(COLS)
  for (let i = 0; i < COLS; i++) {
    const bin = Math.floor(Math.pow(i / COLS, 1.5) * freqBins * 0.78)
    snap[i] = freqData[Math.min(bin, freqBins - 1)] / 255
  }
  wfSt.frames.unshift(snap)
  if (wfSt.frames.length > HISTORY) wfSt.frames.pop()
  const ROWS = wfSt.frames.length

  function proj(normX, worldY, normZ) {
    const z = normZ * focal * 0.72
    const s = focal / (focal + z)
    return { x: cx + normX * W * SPANX * s, y: floorY - worldY * s - z * 0.18, s }
  }

  // Floor grid lines
  for (let row = 0; row < ROWS; row += 4) {
    const tz = row / (HISTORY - 1)
    const p0 = proj(-0.5, 0, tz), p1 = proj(0.5, 0, tz)
    const a  = 0.05 * (1 - tz * 0.7)
    batch.line(p0.x, p0.y, p1.x, p1.y, 1, 1, 1, a)
  }
  for (let col = 0; col <= COLS; col += 8) {
    const nx = col / COLS - 0.5
    batch.line(proj(nx,0,0).x, proj(nx,0,0).y, proj(nx,0,1).x, proj(nx,0,1).y, 1,1,1, 0.03)
  }
  batch.flush(gl.LINES)

  // Bars (back to front)
  for (let row = ROWS - 1; row >= 0; row--) {
    const frame = wfSt.frames[row]
    const tz    = row / (HISTORY - 1)
    for (let col = 0; col < COLS; col++) {
      const e = frame[col]
      if (e < 0.007) continue
      const nx    = (col + 0.5) / COLS - 0.5
      const base  = proj(nx, 0, tz)
      const tip   = proj(nx, e * barMaxH, tz)
      const bw    = (W * SPANX / COLS) * base.s * 0.86
      const hue   = (hueShift + (col / COLS) * cs.hueSpread) % 360
      const alpha = (0.16 + e * 0.5) * (1 - tz * 0.5)

      // Bottom part (dark)
      const [r0, g0, b0] = hslToRgb(hue, sat, lum - 12)
      // Top part (bright)
      const [r1, g1, b1] = hslToRgb(hue, sat, Math.min(95, lum + 16))

      const bx = tip.x - bw * 0.5
      const bh = base.y - tip.y
      // Simple solid rect (could be a gradient if we emitted per-vertex colors, but keep it simple)
      const [rm, gm, bm] = hslToRgb(hue, sat, lum)
      batch.rect(bx, tip.y, bw, bh, rm, gm, bm, alpha)

      // Top cap glow line (via a thin bright rect)
      if (e > 0.24) {
        const [rc, gc, bc] = hslToRgb(hue, sat, Math.min(95, lum + 18))
        batch.rect(bx, tip.y - 1, bw, 2.0, rc, gc, bc, alpha * 0.35 * gl_)
      }
    }
  }
  batch.flush(gl.TRIANGLES)
}

// ══════════════════════════════════════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════════════════════════════════════
export function initSpectrum(body) {
  injectStyles()
  body.style.cssText = 'padding:0;overflow:hidden;border-radius:0 0 7px 7px'

  const wrap = document.createElement('div')
  wrap.className = 'sp-wrap'
  body.appendChild(wrap)

  const canvas = document.createElement('canvas')
  canvas.className = 'sp-canvas'
  wrap.appendChild(canvas)

  // Second canvas for the Butterchurn (Milkdrop) mode — it owns its own WebGL
  // context, so it can't share `canvas`. Hidden unless the Milkdrop mode is on.
  const mdCanvas = document.createElement('canvas')
  mdCanvas.className = 'sp-canvas'
  mdCanvas.style.display = 'none'
  wrap.appendChild(mdCanvas)

  // ── WebGL2 context ────────────────────────────────────────────────────────
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: true,   // needed for trail effect
  })
  if (!gl) { console.error('[Spectrum] WebGL2 not available'); return }

  // Compile programs
  const progTrail  = _mkProg(gl, VERT_QUAD, FRAG_TRAIL)
  const progCircle = _mkProg(gl, VERT_QUAD, FRAG_CIRCLE)
  const progBubble = _mkProg(gl, VERT_QUAD, FRAG_BUBBLES)
  const progGeom   = _mkProg(gl, VERT_GEOM, FRAG_GEOM)

  // Cache uniform locations once after compilation (avoids driver hashmap lookup every frame)
  const uTrail  = _cacheUniforms(gl, progTrail,  'u_col')
  const uCircle = _cacheUniforms(gl, progCircle,
    'u_freq','u_wave','u_res','u_hue','u_sat','u_lum','u_spread',
    'u_innerR','u_outerR','u_glow','u_barGlow','u_crownGlow','u_waveGlow',
    'u_waveAmp','u_crownW','u_crownFill','u_bars','u_mirror',
    'u_showBars','u_showCrown','u_showWave','u_showGlow',
    'u_bassAvg','u_offCrown','u_offWave','u_offCenter','u_mode')
  const uBubble = _cacheUniforms(gl, progBubble,
    'u_freq','u_res','u_hue','u_sat','u_lum','u_spread','u_glow','u_bassAvg','u_time')
  const uGeom   = _cacheUniforms(gl, progGeom,   'u_res')

  const quadVAO    = _mkQuadVAO(gl, progTrail)
  const quadVAOcir = _mkQuadVAO(gl, progCircle)
  const quadVAObub = _mkQuadVAO(gl, progBubble)

  // ── Bloom post-process programs ───────────────────────────────────────────
  const progBright = _mkProg(gl, VERT_QUAD, FRAG_BRIGHT)
  const progBlur   = _mkProg(gl, VERT_QUAD, FRAG_BLUR)
  const progComp   = _mkProg(gl, VERT_QUAD, FRAG_COMP)
  const uBright = _cacheUniforms(gl, progBright, 'u_tex', 'u_thresh', 'u_knee')
  const uBlur   = _cacheUniforms(gl, progBlur,   'u_tex', 'u_dir')
  const uComp   = _cacheUniforms(gl, progComp,   'u_scene', 'u_bloom', 'u_intensity')
  const quadVAObr = _mkQuadVAO(gl, progBright)
  const quadVAObl = _mkQuadVAO(gl, progBlur)
  const quadVAOcp = _mkQuadVAO(gl, progComp)

  // Framebuffers: scene (full-res, persistent for trail) + 2 half-res bloom buffers.
  let sceneFBO = null, bloomA = null, bloomB = null, bloomOk = false
  function allocFBOs() {
    [sceneFBO, bloomA, bloomB].forEach(f => { if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex) } })
    const bw = Math.max(1, Math.floor(W / 2)), bh = Math.max(1, Math.floor(H / 2))
    sceneFBO = _mkFBO(gl, Math.max(1, W), Math.max(1, H))
    bloomA   = _mkFBO(gl, bw, bh)
    bloomB   = _mkFBO(gl, bw, bh)
    bloomOk  = sceneFBO.ok && bloomA.ok && bloomB.ok
    if (bloomOk) {  // start from a clean black scene buffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb)
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
  }

  // FFT + waveform textures (512 samples each)
  const TEX_W   = 512
  const freqTex = _mk1DTex(gl, TEX_W)
  const waveTex = _mk1DTex(gl, TEX_W)

  // Geometry batch (shared across all geometry modes)
  const batch = new GeomBatch(gl, progGeom, 65536)

  // Shared blend setup
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  // ── Color/settings state (identical structure to original) ────────────────
  const cs = {
    mode:          'circle',
    autoRotate:    true,
    hueBase:       200,
    hueSpeed:      0.18,
    saturation:    100,
    luminosity:    72,
    hueSpread:     160,
    offsetCrown:   140,
    offsetWave:    220,
    offsetCenter:  0,
    bgColor:       '#000000',
    trail:         0.18,
    glow:          1.0,
    bloom:         0.9,    // bloom intensity (0 = off)
    bloomThresh:   0.42,   // luminance threshold for the bloom bright-pass
    bloomRadius:   1.6,    // blur spread
    particles:     true,
    particleCount: 8,
    beatThreshold: 0.45,
    innerR:        0.19,
    outerR:        0.46,
    bars:          180,
    smoothing:     0.82,
    showBars:      true,
    showCrown:     true,
    showWave:      true,
    showGlow:      true,
    barGlow:       1.0,
    crownGlow:     1.0,
    waveGlow:      1.0,
    crownWidth:    1.8,
    crownFill:     0.06,
    waveAmplitude: 0.55,
    waveWidth:     1.5,
    mirror:        true,
  }

  // ── Analyser ──────────────────────────────────────────────────────────────
  // Private analyser: this tool sets its own fftSize / smoothing, which used to
  // be applied to the shared one and threw off the mixer meters and the kick
  // detector. Released when the window closes.
  const analyser = createPrivateAnalyser('master')
  analyser.fftSize = 4096
  analyser.smoothingTimeConstant = cs.smoothing

  const freqBins = analyser.frequencyBinCount   // 2048
  const freqData = new Uint8Array(freqBins)
  const timeData = new Float32Array(analyser.fftSize)

  buildPanel(wrap, cs, analyser)

  // ── Export button ──────────────────────────────────────────────────────────
  const spExportBtn = document.createElement('button')
  spExportBtn.className = 'sp-palette-btn'
  spExportBtn.style.cssText = 'bottom:auto;top:10px;right:52px'
  spExportBtn.title = 'Exporter'
  spExportBtn.innerHTML = '<i class="fa-solid fa-file-export"></i>'
  wrap.appendChild(spExportBtn)

  spExportBtn.addEventListener('click', () => {
    const activeCanvas = wrap.querySelector('.sp-canvas[style*="display:none"]')
      ? canvas
      : (mdCanvas.style.display !== 'none' ? mdCanvas : canvas)
    showExportPanel(wrap, () => activeCanvas, {
      getDuration: () => 5000,
      getFps:      () => 24,
      getLoop:     () => true,
      // The app's actual mix (it used to be a fresh, unconnected stream, so
      // exported videos were silent). Freed by the exporter when it is done.
      getAudioStream: () => {
        try { return createMasterTap() } catch { return null }
      }
    })
  })

  // ── Sizing ────────────────────────────────────────────────────────────────
  let dpr = devicePixelRatio || 1
  let W = 1, H = 1

  function resize() {
    dpr = devicePixelRatio || 1
    W = canvas.width  = Math.round(canvas.offsetWidth  * dpr)
    H = canvas.height = Math.round(canvas.offsetHeight * dpr)
    gl.viewport(0, 0, W, H)
    allocFBOs()
    mdCanvas.width = W; mdCanvas.height = H
    if (mdViz) try { mdViz.setRendererSize(W, H) } catch {}
  }
  const ro = new ResizeObserver(resize)
  ro.observe(wrap)

  // ── Milkdrop (Butterchurn) ──────────────────────────────────────────────────
  let mdViz = null, mdReady = false, mdPresets = null, mdNames = [], mdIdx = 0
  let mdCycle = true, mdLastSwitch = 0
  function mdInit() {
    if (mdViz || !window.butterchurn) return
    try {
      const bc = window.butterchurn.default || window.butterchurn
      mdViz = bc.createVisualizer(getCtx(), mdCanvas, { width: W, height: H, pixelRatio: 1, textureRatio: 1 })
      mdViz.connectAudio(analyser)
      const pk = window.butterchurnPresetsMinimal
      mdPresets = pk ? (pk.getPresets ? pk.getPresets() : (pk.default && pk.default.getPresets ? pk.default.getPresets() : pk)) : null
      mdNames = mdPresets ? Object.keys(mdPresets) : []
      if (mdNames.length) mdLoadPreset(0, 0)
      mdReady = mdNames.length > 0
    } catch (e) { console.error('[Spectrum] Butterchurn init failed:', e); mdReady = false }
  }
  function mdLoadPreset(i, blend = 1.6) {
    if (!mdViz || !mdNames.length) return
    mdIdx = ((i % mdNames.length) + mdNames.length) % mdNames.length
    try { mdViz.loadPreset(mdPresets[mdNames[mdIdx]], blend) } catch {}
    mdLastSwitch = performance.now()
  }

  // Split the panel into a "general" group (everything except Mode) and a
  // "Milkdrop" group, then show only the relevant one for the current mode.
  let updatePanelMode = () => {}
  const _panel = wrap.querySelector('.sp-panel')
  if (_panel) {
    // Keep the Mode header + mode row always visible (children 0 and 1);
    // move the rest into a hideable "general" group.
    const genWrap = document.createElement('div')
    genWrap.className = 'sp-group'
    ;[..._panel.children].slice(2).forEach(k => genWrap.appendChild(k))
    _panel.appendChild(genWrap)

    // Milkdrop-only controls in their own group.
    const mdWrap = document.createElement('div')
    mdWrap.className = 'sp-group'
    mdWrap.appendChild(makeSectionHdr('Milkdrop'))
    const mdHint = document.createElement('div')
    mdHint.className = 'sp-hint'
    mdHint.textContent = t('sp_md_hint')
    mdWrap.appendChild(mdHint)
    const row = document.createElement('div')
    row.className = 'sp-row'
    row.innerHTML = `<span class="sp-label">Preset</span>
      <button class="seq-btn" id="md-prev" title="Précédent"><i class="fa-solid fa-backward-step"></i></button>
      <button class="seq-btn" id="md-rand" title="Aléatoire"><i class="fa-solid fa-shuffle"></i></button>
      <button class="seq-btn" id="md-next" title="Suivant"><i class="fa-solid fa-forward-step"></i></button>`
    mdWrap.appendChild(row)
    row.querySelector('#md-prev').addEventListener('click', e => { e.stopPropagation(); mdInit(); mdLoadPreset(mdIdx - 1) })
    row.querySelector('#md-next').addEventListener('click', e => { e.stopPropagation(); mdInit(); mdLoadPreset(mdIdx + 1) })
    row.querySelector('#md-rand').addEventListener('click', e => { e.stopPropagation(); mdInit(); mdLoadPreset(Math.floor(Math.random() * Math.max(1, mdNames.length))) })
    mdWrap.appendChild(makeToggleRow(t('sp_autocycle'), 'rotate', mdCycle, v => { mdCycle = v }))
    _panel.appendChild(mdWrap)

    updatePanelMode = () => {
      const md = cs.mode === 'milkdrop'
      genWrap.style.display = md ? 'none' : 'flex'
      mdWrap.style.display  = md ? 'flex' : 'none'
      if (!md) {
        genWrap.querySelectorAll('[data-modes]').forEach(el => {
          const m = el.dataset.modes
          el.style.display = (m === 'all' || m.split(',').includes(cs.mode)) ? '' : 'none'
        })
      }
    }
    updatePanelMode()
  }

  resize()

  // ── Per-mode state ────────────────────────────────────────────────────────
  const parts    = []
  const dnaState = {}
  const synState = { W: 0, H: 0, nodes: null }
  const stSph    = { rotY: 0, rotX: 0.38, pts: null }
  const wfSt     = { frames: null }

  let hueShift = cs.hueBase
  let lastBass = 0, beatCool = 0
  let raf = null
  let _lastPanelMode = null   // tracks mode → toggles the panel's control groups
  const t0 = performance.now()

  // Helper: set all uniforms for a quad-shader program, draw fullscreen quad
  function _drawQuad(prog, vao, setUniforms) {
    gl.useProgram(prog)
    setUniforms(prog)
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindVertexArray(null)
  }

  // Helper: bind FFT tex to unit 0, wave tex to unit 1
  function _bindTextures() {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, freqTex)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, waveTex)
  }

  function spawnParticles(hue) {
    const count = Math.round(cs.particleCount)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const spd = (0.5 + Math.random() * 2) * dpr
      parts.push({
        x: W/2, y: H/2,
        vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
        life: 1, decay: 0.018 + Math.random() * 0.025,
        r: (1 + Math.random() * 2) * dpr, hue,
      })
    }
  }

  // Adaptive sub-bass kick detector → particle bursts on each kick.
  const beat = createBeatDetector({
    minInterval: 250,
    threshold:   1.35,
    onBeat: () => { if (cs.particles && cs.mode !== 'milkdrop') spawnParticles(hueShift) },
  })

  // ── Draw loop ─────────────────────────────────────────────────────────────
  function draw() {
    if (!body.isConnected) return
    raf = requestAnimationFrame(draw)

    // React to mode changes → swap which controls the panel shows.
    if (cs.mode !== _lastPanelMode) { _lastPanelMode = cs.mode; updatePanelMode() }

    // ── Milkdrop mode: hand the frame to Butterchurn, skip our engine ────────
    if (cs.mode === 'milkdrop') {
      if (canvas.style.display   !== 'none') canvas.style.display   = 'none'
      if (mdCanvas.style.display === 'none') mdCanvas.style.display = ''
      mdInit()
      if (mdReady && mdViz) {
        try { mdViz.render() } catch {}
        if (mdCycle && performance.now() - mdLastSwitch > 15000) mdLoadPreset(mdIdx + 1, 2.7)
      }
      return
    }
    if (mdCanvas.style.display !== 'none') mdCanvas.style.display = 'none'
    if (canvas.style.display   === 'none') canvas.style.display   = ''

    analyser.getByteFrequencyData(freqData)
    analyser.getFloatTimeDomainData(timeData)

    if (cs.autoRotate) hueShift = (hueShift + cs.hueSpeed) % 360
    else               hueShift = cs.hueBase

    // Bass / beat detection
    let bassSum = 0
    for (let i = 0; i < 10; i++) bassSum += freqData[i]
    const bassAvg = bassSum / (10 * 255)
    const isBeat  = bassAvg > lastBass * 1.35 && bassAvg > cs.beatThreshold && beatCool <= 0
    if (isBeat) beatCool = 12          // (drives Synapse); particles come from the kick detector
    if (beatCool > 0) beatCool--
    lastBass = bassAvg * 0.15 + lastBass * 0.85

    // Upload FFT texture (downsample 2048 → 512)
    const freqOut = new Uint8Array(TEX_W)
    for (let i = 0; i < TEX_W; i++) {
      const bin = Math.floor(i / TEX_W * freqBins)
      freqOut[i] = freqData[bin]
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, freqTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_W, 1, gl.RED, gl.UNSIGNED_BYTE, freqOut)

    // Upload waveform texture (normalized to 0..255)
    const waveOut = new Uint8Array(TEX_W)
    for (let i = 0; i < TEX_W; i++) {
      const td = timeData[Math.floor(i / TEX_W * analyser.fftSize)] || 0
      waveOut[i] = Math.round((td * 0.5 + 0.5) * 255)
    }
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, waveTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_W, 1, gl.RED, gl.UNSIGNED_BYTE, waveOut)

    // Render the whole scene into the offscreen buffer (kept between frames for
    // the trail), so we can bloom it before showing it.
    const useBloom = bloomOk && cs.bloom > 0.001
    if (useBloom) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb)
      gl.viewport(0, 0, W, H)
    }

    // ── Trail quad ──────────────────────────────────────────────────────────
    const [tr, tg, tb] = hexToRgb(cs.bgColor)
    _drawQuad(progTrail, quadVAO, () => {
      gl.uniform4f(uTrail.u_col, tr/255, tg/255, tb/255, cs.trail)
    })

    const gltime = (performance.now() - t0) / 1000

    // ── Mode dispatch ───────────────────────────────────────────────────────
    switch (cs.mode) {
      // ── Circle ─────────────────────────────────────────────────────────
      case 'circle':
      case 'arc': {
        _bindTextures()
        _drawQuad(progCircle, quadVAOcir, () => {
          const u = uCircle
          gl.uniform1i(u.u_freq,      0)
          gl.uniform1i(u.u_wave,      1)
          gl.uniform2f(u.u_res,       W, H)
          gl.uniform1f(u.u_hue,       hueShift)
          gl.uniform1f(u.u_sat,       cs.saturation)
          gl.uniform1f(u.u_lum,       cs.luminosity)
          gl.uniform1f(u.u_spread,    cs.hueSpread)
          gl.uniform1f(u.u_innerR,    cs.innerR)
          gl.uniform1f(u.u_outerR,    cs.outerR)
          gl.uniform1f(u.u_glow,      cs.glow)
          gl.uniform1f(u.u_barGlow,   cs.barGlow)
          gl.uniform1f(u.u_crownGlow, cs.crownGlow)
          gl.uniform1f(u.u_waveGlow,  cs.waveGlow)
          gl.uniform1f(u.u_waveAmp,   cs.waveAmplitude)
          gl.uniform1f(u.u_crownW,    cs.crownWidth)
          gl.uniform1f(u.u_crownFill, cs.crownFill)
          gl.uniform1f(u.u_bars,      cs.bars)
          gl.uniform1f(u.u_mirror,    cs.mirror ? 1 : 0)
          gl.uniform1f(u.u_showBars,  cs.showBars  ? 1 : 0)
          gl.uniform1f(u.u_showCrown, cs.showCrown ? 1 : 0)
          gl.uniform1f(u.u_showWave,  cs.showWave  ? 1 : 0)
          gl.uniform1f(u.u_showGlow,  cs.showGlow  ? 1 : 0)
          gl.uniform1f(u.u_bassAvg,   bassAvg)
          gl.uniform1f(u.u_offCrown,  cs.offsetCrown)
          gl.uniform1f(u.u_offWave,   cs.offsetWave)
          gl.uniform1f(u.u_offCenter, cs.offsetCenter)
          gl.uniform1i(u.u_mode,      cs.mode === 'circle' ? 0 : 1)
        })

        // Particles (geometry)
        if (cs.particles && parts.length) {
          gl.useProgram(progGeom)
          gl.uniform2f(uGeom.u_res, W, H)
          for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i]
            p.x += p.vx; p.y += p.vy
            p.vy += 0.04 * dpr; p.vx *= 0.97; p.vy *= 0.97
            p.life -= p.decay
            if (p.life <= 0) { parts.splice(i, 1); continue }
            const [pr, pg, pb] = hslToRgb(p.hue, cs.saturation, Math.min(95, cs.luminosity + 15))
            const a = p.life * p.life
            batch.write(p.x, p.y, pr, pg, pb, a, p.r * 2)
          }
          batch.flush(gl.POINTS, true)
        }
        break
      }

      // ── Bubbles ────────────────────────────────────────────────────────
      case 'bubbles': {
        _bindTextures()
        _drawQuad(progBubble, quadVAObub, () => {
          const u = uBubble
          gl.uniform1i(u.u_freq,    0)
          gl.uniform2f(u.u_res,     W, H)
          gl.uniform1f(u.u_hue,     hueShift)
          gl.uniform1f(u.u_sat,     cs.saturation)
          gl.uniform1f(u.u_lum,     cs.luminosity)
          gl.uniform1f(u.u_spread,  cs.hueSpread)
          gl.uniform1f(u.u_glow,    cs.glow)
          gl.uniform1f(u.u_bassAvg, bassAvg)
          gl.uniform1f(u.u_time,    gltime)
        })
        break
      }

      // ── DNA ────────────────────────────────────────────────────────────
      case 'dna': {
        gl.useProgram(progGeom)
        gl.uniform2f(uGeom.u_res, W, H)
        drawDNAGL(gl, batch, W, H, cs, freqData, freqBins, hueShift, dpr, bassAvg, dnaState, 1.5)
        break
      }

      // ── Sphere 3D ──────────────────────────────────────────────────────
      case 'sphere3d': {
        gl.useProgram(progGeom)
        gl.uniform2f(uGeom.u_res, W, H)
        drawSphere3DGL(gl, batch, W, H, cs, freqData, freqBins, hueShift, bassAvg, stSph)
        break
      }

      // ── Synapse ────────────────────────────────────────────────────────
      case 'synapse': {
        gl.useProgram(progGeom)
        gl.uniform2f(uGeom.u_res, W, H)
        drawSynapseGL(gl, batch, W, H, cs, freqData, freqBins, hueShift, dpr, bassAvg, isBeat, synState)
        break
      }

      // ── Waterfall 3D ───────────────────────────────────────────────────
      case 'wfall3d': {
        gl.useProgram(progGeom)
        gl.uniform2f(uGeom.u_res, W, H)
        drawWfall3DGL(gl, batch, W, H, cs, freqData, freqBins, hueShift, bassAvg, wfSt)
        break
      }
    }

    // ── Bloom + composite to screen ───────────────────────────────────────
    if (useBloom) {
      const bw = bloomA.w, bh = bloomA.h
      gl.disable(gl.BLEND)

      // 1) Bright pass: sceneFBO → bloomA (half-res)
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb)
      gl.viewport(0, 0, bw, bh)
      gl.useProgram(progBright)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex)
      gl.uniform1i(uBright.u_tex, 0)
      gl.uniform1f(uBright.u_thresh, cs.bloomThresh)
      gl.uniform1f(uBright.u_knee, 0.25)
      gl.bindVertexArray(quadVAObr); gl.drawArrays(gl.TRIANGLES, 0, 6)

      // 2) Separable Gaussian blur (ping-pong bloomA ↔ bloomB)
      gl.useProgram(progBlur)
      gl.uniform1i(uBlur.u_tex, 0)
      const rad = cs.bloomRadius
      const passes = [[rad/bw, 0], [0, rad/bh], [2*rad/bw, 0], [0, 2*rad/bh]]
      let src = bloomA, dst = bloomB
      for (const [dx, dy] of passes) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb)
        gl.viewport(0, 0, bw, bh)
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex)
        gl.uniform2f(uBlur.u_dir, dx, dy)
        gl.bindVertexArray(quadVAObl); gl.drawArrays(gl.TRIANGLES, 0, 6)
        const tmp = src; src = dst; dst = tmp
      }

      // 3) Composite scene + blurred bloom → default framebuffer (screen)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, W, H)
      gl.useProgram(progComp)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex)
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.tex)
      gl.uniform1i(uComp.u_scene, 0)
      gl.uniform1i(uComp.u_bloom, 1)
      gl.uniform1f(uComp.u_intensity, cs.bloom)
      gl.bindVertexArray(quadVAOcp); gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.bindVertexArray(null)

      // Restore default blend for the next frame's scene pass.
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    }
  }

  draw()

  const obs = new MutationObserver(() => {
    if (!document.contains(body)) {
      cancelAnimationFrame(raf); ro.disconnect(); obs.disconnect(); beat.stop(); analyser.release()
      ;[sceneFBO, bloomA, bloomB].forEach(f => { if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex) } })
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
