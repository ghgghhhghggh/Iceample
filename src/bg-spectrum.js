// bg-spectrum.js — WebGL2 animated visual background shader
// Pure visual effect, zero audio dependency.
// 6 styles: Cosmos (deep-space nebula), Plasma, Waves, Stars, Grid, Aurora

const LS_KEY = 'iceample:bgspectrum'

const DEFAULT_CFG = {
  enabled:   false,
  style:     'plasma',   // 'plasma' | 'waves' | 'stars' | 'grid' | 'aurora' | 'cosmos' | 'bg-gradient' | 'bg-plasma' | 'bg-geometry' | 'bg-nebula'
  opacity:   0.30,
  color:     '#4a9eff',  // primary colour
  color2:    '#ff6030',  // secondary colour
  color3:    '#3a105a',  // third colour (Canvas2D styles only)
  speed:     1.0,
  intensity: 0.7,
  density:   0.5,
}

const CANVAS2D_STYLES = new Set(['bg-gradient', 'bg-plasma', 'bg-geometry', 'bg-nebula'])

const STYLE_IDX = { plasma: 0, waves: 1, stars: 2, grid: 3, aurora: 4, cosmos: 5, particles: 6, dither: 7 }

// ── Shaders ───────────────────────────────────────────────────────────────────
const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_opacity;
uniform vec3  u_color;
uniform vec3  u_color2;
uniform float u_speed;
uniform float u_intensity;
uniform float u_density;
uniform int   u_style;
out vec4 out_color;

// ── 0 · Plasma ────────────────────────────────────────────────────────────────
// density → pattern scale; color1↔color2 blend across the field
vec4 stylePlasma(vec2 uv) {
  float t  = u_time * u_speed;
  float sc = 4.0 + u_density * 8.0;
  float cx = uv.x - 0.5 + 0.35 * sin(t * 0.31);
  float cy = uv.y - 0.5 + 0.35 * cos(t * 0.27);
  float v  = sin(uv.x * sc          + t)
           + sin(uv.y * (sc * 0.72) + t * 0.8)
           + sin((uv.x + uv.y) * sc * 0.6 + t * 0.6)
           + sin(sqrt(cx*cx + cy*cy) * sc * 1.2 + t * 0.5);
  v = v * 0.25 + 0.5;
  vec3 col = mix(u_color, u_color2, v);
  col *= (0.45 + 0.55 * abs(sin(v * 6.28318))) * u_intensity;
  return vec4(clamp(col, 0.0, 1.0), clamp((v * 0.55 + 0.25) * u_opacity, 0.0, 1.0));
}

// ── 1 · Waves ─────────────────────────────────────────────────────────────────
// density → number of wave layers (2–6); color1=top layers, color2=bottom layers
vec4 styleWaves(vec2 uv) {
  float t  = u_time * u_speed;
  float nw = 2.0 + u_density * 4.0;
  float alpha = 0.0;
  vec3  col   = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float fi  = float(i);
    float w   = clamp(nw - fi, 0.0, 1.0);
    float pos = fi / 5.0;
    float y   = 0.08 + pos * 0.84
              + 0.10 * sin(uv.x * (3.0 + fi * 1.4) + t * (0.7 + fi * 0.35) + fi * 2.1);
    float d   = exp(-abs(uv.y - y) * (14.0 + fi * 4.5)) * w;
    col      += mix(u_color, u_color2, pos) * d;
    alpha    += d;
  }
  return vec4(clamp(col * u_intensity, 0.0, 1.0), clamp(alpha * u_opacity, 0.0, 1.0));
}

// ── 2 · Stars ─────────────────────────────────────────────────────────────────
// density → star count; color1=dim stars, color2=bright stars
float bhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec4 styleStars(vec2 uv) {
  float t      = u_time * u_speed * 0.12;
  float aspect = u_res.x / u_res.y;
  // Fewer, larger cells so stars are always visible regardless of resolution
  float cells  = 5.0 + u_density * 13.0;
  vec2  g      = uv * vec2(aspect * cells, cells);
  vec2  cell   = floor(g);
  vec2  fr     = fract(g);
  float h      = bhash(cell);
  float h2     = bhash(cell + vec2(5.3, 2.7));
  vec2  sp     = vec2(fract(h * 13.71 + 0.1), fract(h * 8.31 + 0.1)) * 0.80 + 0.10;
  float d      = length(fr - sp);
  float twk    = 0.5 + 0.5 * sin(t * (4.0 + h2 * 10.0) + h * 6.28318);
  float thresh = 1.0 - clamp(u_density * 0.82 + 0.1, 0.1, 0.95);
  float vis    = step(thresh, h);
  // Core + soft halo — exp(-d*k) spreads better than tiny Gaussian at low res
  float core   = exp(-d * 55.0) * h;
  float halo   = exp(-d * 16.0) * h * 0.45;
  float star   = (core + halo) * twk * vis * u_intensity;
  // Extra large glow for the brightest stars
  float glow   = exp(-d * 7.0) * h * 0.55 * twk * vis * u_intensity;
  star = mix(star, max(star, glow), step(0.84, h));
  vec3  col    = mix(u_color, u_color2, h * h) * star;
  return vec4(clamp(col, 0.0, 1.0), clamp(star * u_opacity, 0.0, 1.0));
}

// ── 3 · Grid (synthwave) ──────────────────────────────────────────────────────
// density → line spacing; color1=vertical lines, color2=horizontal lines + sky
vec4 styleGrid(vec2 uv) {
  float t   = u_time * u_speed;
  float hor = 0.48;

  // Sky above horizon — subtle gradient using color2
  if (uv.y <= hor) {
    float sk = smoothstep(hor, hor * 0.3, uv.y);
    return vec4(u_color2 * 0.14 * u_intensity, sk * 0.20 * u_opacity);
  }

  float py      = (uv.y - hor) / (1.0 - hor);
  float depth   = 1.0 / (py + 0.04);
  float px      = (uv.x - 0.5) * depth * 0.75;
  float spacing = 0.25 + (1.0 - u_density) * 0.75;

  // Vertical lines diverging from horizon
  float vlD  = abs(fract(px / spacing + 0.5) - 0.5);
  float vl   = exp(-vlD * depth * 7.0 * u_intensity);

  // Horizontal lines scrolling toward viewer
  float zSc  = depth * spacing - t * 0.45;
  float hlD  = abs(fract(zSc) - 0.5);
  float hl   = exp(-hlD * 22.0 * u_intensity);

  float fade = smoothstep(0.0, 0.12, py);
  vec3  col  = u_color * vl + u_color2 * hl;
  return vec4(clamp(col, 0.0, 1.0), clamp(max(vl, hl) * fade * u_opacity, 0.0, 1.0));
}

// ── 4 · Aurora (northern lights) ─────────────────────────────────────────────
// density → band count (2–6); color1 and color2 blend across bands + shimmer
vec4 styleAurora(vec2 uv) {
  float t   = u_time * u_speed * 0.3;
  float nb  = 2.0 + u_density * 4.0;
  float v   = 0.0;
  vec3  col = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float fi    = float(i);
    float w     = clamp(nb - fi, 0.0, 1.0);
    float phase = fi * 1.618 + 0.5;
    float base  = 0.12 + fi * 0.09;
    float bandY = base
                + 0.10 * sin(uv.x * (1.3 + fi * 0.8) + t + phase)
                + 0.04 * sin(uv.x * (4.8 + fi * 1.2) + t * 1.8 + phase * 2.0);
    float thick = max(0.038 + fi * 0.010, 0.001);
    float d     = exp(-pow(abs(uv.y - bandY) / thick, 1.35)) * w;
    float blend = fract(fi * 0.2 + uv.x * 0.35 + t * 0.05);
    col += mix(u_color, u_color2, blend) * d;
    v   += d;
  }
  return vec4(clamp(col * u_intensity, 0.0, 1.0), clamp(v * u_opacity, 0.0, 1.0));
}

// ── 5 · Cosmos (deep-space nebula + parallax stars) ──────────────────────────
// "Creating matter from the void": domain-warped nebula wisps + 3 star depths.
// density → cloud/star scale; color1↔color2 = nebula palette; intensity = glow.
float chash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = chash(i), b = chash(i + vec2(1.0, 0.0)), c = chash(i + vec2(0.0, 1.0)), d = chash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.55;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.02 + vec2(3.1, 1.7); a *= 0.5; }
  return v;
}
float cstars(vec2 uv, float cells, float t, float seed) {
  vec2 g = uv * cells; vec2 c = floor(g), f = fract(g);
  float h = chash(c + seed);
  if (h < 0.86) return 0.0;
  vec2 sp = vec2(chash(c + seed + 1.3), chash(c + seed + 2.7));
  float d = length(f - sp);
  float tw = 0.65 + 0.35 * sin(t * (2.0 + chash(c + seed + 5.0) * 8.0) + h * 40.0);
  float core = exp(-d * 40.0);                 // crisp centre
  float halo = exp(-d * 11.0) * 0.55;          // soft glow
  return (core + halo) * tw * ((h - 0.86) / 0.14);
}
vec4 styleCosmos(vec2 uv) {
  float t = u_time * u_speed * 0.03;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  // Nebula — drifting wisps over a mostly-empty void
  vec2 q = p * (1.1 + u_density * 1.8) + vec2(t * 0.4, t * 0.25);
  float neb = fbm(q + fbm(q * 0.6));
  neb = smoothstep(0.42, 0.92, neb);
  float hue = fbm(q * 0.5 + 20.0);
  vec3 col = mix(u_color, u_color2, smoothstep(0.3, 0.8, hue));
  col *= neb * (0.6 + u_intensity * 1.3);
  // Parallax stars — clearly visible, two drifting depths
  float s = 0.0;
  s += cstars(p,                     5.0 + u_density * 6.0,  t * 1.0, 0.0)  * 1.0;
  s += cstars(p + vec2(t * 0.3, 0.0), 9.0 + u_density * 9.0,  t * 1.4, 11.0) * 0.65;
  col += vec3(s) * (1.0 + u_intensity);
  float alpha = clamp(neb * 0.55 + s * 1.0, 0.0, 1.0) * u_opacity;
  return vec4(clamp(col, 0.0, 1.0), alpha);
}

// ── 6 · Particles (soft drifting dot field, ported from react-bits idea) ─────
vec4 styleParticles(vec2 uv) {
  float t = u_time * u_speed * 0.05;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float total = 0.0;
  vec3 col = vec3(0.0);
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float cells = (8.0 + u_density * 16.0) * (1.0 + fl * 0.55);
    vec2 g = (p + vec2(t * (0.25 + fl * 0.18), t * 0.08)) * cells;
    vec2 cell = floor(g), fr = fract(g);
    float h = bhash(cell + fl * 31.7);
    if (h < 1.0 - clamp(u_density * 0.5 + 0.25, 0.2, 0.92)) continue;
    vec2 sp = vec2(bhash(cell + fl + 1.3), bhash(cell + fl + 2.7));
    float d = length(fr - sp);
    float size = 0.05 + 0.10 * bhash(cell + fl + 5.0);
    float dot = smoothstep(size, size * 0.25, d) * (0.45 + 0.55 * (1.0 - fl * 0.25));
    col += mix(u_color, u_color2, bhash(cell + fl + 9.0)) * dot;
    total += dot;
  }
  col *= (0.8 + u_intensity);
  return vec4(clamp(col, 0.0, 1.0), clamp(total, 0.0, 1.0) * u_opacity);
}

// ── 7 · Dither (ordered 4×4 Bayer dithering over a soft field) ───────────────
float dither4x4(vec2 pos, float b) {
  float M[16] = float[16](
    0.0625, 0.5625, 0.1875, 0.6875,
    0.8125, 0.3125, 0.9375, 0.4375,
    0.2500, 0.7500, 0.1250, 0.6250,
    1.0000, 0.5000, 0.8750, 0.3750);
  int x = int(mod(pos.x, 4.0));
  int y = int(mod(pos.y, 4.0));
  return b < M[x + y * 4] ? 0.0 : 1.0;
}
vec4 styleDither(vec2 uv) {
  float t = u_time * u_speed * 0.12;
  float src = clamp(0.5 + 0.40 * sin(uv.y * 6.0 + t) + 0.22 * sin(uv.x * 4.0 - t * 0.7), 0.0, 1.0);
  float scale = mix(1.5, 5.0, u_density);
  vec2 px = (uv * u_res) / scale;
  float d = dither4x4(px, src * (0.6 + u_intensity * 0.8));
  vec3 col = mix(u_color, u_color2, src) * d;
  return vec4(clamp(col, 0.0, 1.0), d * u_opacity);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec4 c;
  if      (u_style == 0) c = stylePlasma(uv);
  else if (u_style == 1) c = styleWaves(uv);
  else if (u_style == 2) c = styleStars(uv);
  else if (u_style == 3) c = styleGrid(uv);
  else if (u_style == 4) c = styleAurora(uv);
  else if (u_style == 5) c = styleCosmos(uv);
  else if (u_style == 6) c = styleParticles(uv);
  else                   c = styleDither(uv);
  out_color = c;
}`

// ── Config helpers ─────────────────────────────────────────────────────────────
export function getBgConfig() {
  try { return { ...DEFAULT_CFG, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') } }
  catch { return { ...DEFAULT_CFG } }
}

export function setBgConfig(partial) {
  localStorage.setItem(LS_KEY, JSON.stringify({ ...getBgConfig(), ...partial }))
}

// ── Internal state ─────────────────────────────────────────────────────────────
let _canvas    = null
let _gl        = null
let _prog      = null
let _vao       = null
let _raf       = null
let _workbench = null

// Canvas 2D layer (bg-* styles)
let _canvas2d   = null
let _ctx2d      = null
let _plasmaOff2 = null
let _geoTrail2  = null
let _t02d       = null
let _prevStyle2 = null
let _prevGeoKey = null

// ── Canvas 2D helpers ─────────────────────────────────────────────────────────
function _fhash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  return ((n ^ (n >>> 16)) >>> 0) / 0xFFFFFFFF
}
function _hexRgb(hex) {
  const n = parseInt((hex || '#000').replace('#',''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// ── Canvas 2D renderers ───────────────────────────────────────────────────────
function _2dGradient(ctx, W, H, elapsed, spd, inten, zoom, c1, c2, c3) {
  const t = elapsed * 0.0004 * spd
  const bk = 0.08
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = `rgb(${Math.round(c1[0]*bk)},${Math.round(c1[1]*bk)},${Math.round(c1[2]*bk)})`
  ctx.fillRect(0, 0, W, H)
  const blobs = [
    { nx: Math.sin(t*0.7), ny: Math.cos(t*0.5),       c: c1, r: 0.62 },
    { nx: Math.cos(t*0.4), ny: Math.sin(t*0.8),       c: c2, r: 0.52 },
    { nx: Math.sin(t*0.6+1.2), ny: Math.cos(t*0.3+2), c: c3, r: 0.48 },
  ]
  ctx.globalCompositeOperation = 'screen'
  blobs.forEach(b => {
    const gx = W * (0.5 + b.nx * 0.38 * inten)
    const gy = H * (0.5 + b.ny * 0.38 * inten)
    const r  = Math.min(W, H) * b.r * zoom
    const g  = ctx.createRadialGradient(gx, gy, 0, gx, gy, r)
    g.addColorStop(0,    `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.92)`)
    g.addColorStop(0.45, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.35)`)
    g.addColorStop(1,    'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  })
  ctx.globalCompositeOperation = 'source-over'
}

function _2dPlasma(ctx, W, H, elapsed, spd, inten, zoom, c1, c2, c3) {
  const t  = elapsed * 0.001 * spd
  const sc = 1.5 + zoom * 4.0
  const div = 6
  const sw = Math.max(1, Math.ceil(W / div)), sh = Math.max(1, Math.ceil(H / div))
  if (!_plasmaOff2 || _plasmaOff2.width !== sw || _plasmaOff2.height !== sh)
    _plasmaOff2 = new OffscreenCanvas(sw, sh)
  const oc  = _plasmaOff2.getContext('2d')
  const img = oc.createImageData(sw, sh)
  const d   = img.data
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const nx = (x / sw) * sc, ny = (y / sh) * sc
      const cx = nx - sc * 0.5, cy = ny - sc * 0.5
      const v = (
        Math.sin(nx * 3.1 + t * 1.1) +
        Math.sin(ny * 2.7 + t * 0.9) +
        Math.sin((nx + ny) * 2.3 + t * 1.4) +
        Math.sin(Math.sqrt(cx*cx + cy*cy) * 6.0 - t * 2.0)
      ) * 0.25
      const p = Math.sin(v * Math.PI) * 0.5 + 0.5
      const q = Math.cos(v * Math.PI * 1.7) * 0.5 + 0.5
      const ii = (y * sw + x) * 4
      d[ii]   = Math.round(c1[0]*p + c2[0]*q*(1-p) + c3[0]*(1-p)*(1-q))
      d[ii+1] = Math.round(c1[1]*p + c2[1]*q*(1-p) + c3[1]*(1-p)*(1-q))
      d[ii+2] = Math.round(c1[2]*p + c2[2]*q*(1-p) + c3[2]*(1-p)*(1-q))
      d[ii+3] = 255
    }
  }
  oc.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(_plasmaOff2, 0, 0, W, H)
}

function _2dGeometry(ctx, W, H, elapsed, spd, inten, zoom, c1, c2, c3) {
  const t = elapsed * 0.0006 * spd
  if (!_geoTrail2 || _geoTrail2.width !== W || _geoTrail2.height !== H) {
    _geoTrail2 = new OffscreenCanvas(W, H)
    const gc = _geoTrail2.getContext('2d')
    gc.fillStyle = `rgb(${c1[0]},${c1[1]},${c1[2]})`; gc.fillRect(0, 0, W, H)
  }
  const gc  = _geoTrail2.getContext('2d')
  gc.fillStyle = `rgba(${c1[0]},${c1[1]},${c1[2]},0.05)`; gc.fillRect(0, 0, W, H)
  const n    = 6 + Math.round(inten * 7)
  const base = Math.min(W, H) * zoom * 0.18
  const orb  = Math.min(W, H) * zoom * 0.32 * inten
  const cols = [c2, c3, c1]
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2
    const cx  = W*0.5 + Math.cos(theta + t*0.45)*orb + Math.sin(t*0.6+i)*orb*0.25
    const cy  = H*0.5 + Math.sin(theta + t*0.35)*orb*0.7 + Math.cos(t*0.5+i)*orb*0.2
    const r   = base * (0.55 + Math.sin(t*1.1+i*0.9)*0.45)
    const fc  = cols[i % 3]
    const a   = 0.55 + Math.sin(t*0.7+i)*0.35
    const sides = 3 + (i % 5)
    gc.save()
    gc.translate(cx, cy)
    gc.rotate(t * (0.35 + i*0.045) * (i%2===0 ? 1 : -1))
    gc.beginPath()
    for (let s = 0; s < sides; s++) {
      const ang = (s/sides)*Math.PI*2 - Math.PI/2
      s===0 ? gc.moveTo(Math.cos(ang)*r,Math.sin(ang)*r) : gc.lineTo(Math.cos(ang)*r,Math.sin(ang)*r)
    }
    gc.closePath()
    gc.fillStyle   = `rgba(${fc[0]},${fc[1]},${fc[2]},${a*0.22})`
    gc.strokeStyle = `rgba(${fc[0]},${fc[1]},${fc[2]},${a})`
    gc.lineWidth = 1.5; gc.fill(); gc.stroke()
    gc.restore()
  }
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(_geoTrail2, 0, 0)
}

function _2dNebula(ctx, W, H, elapsed, spd, inten, zoom, c1, c2, c3) {
  const t    = elapsed * 0.00025 * spd
  const base = Math.min(W, H)
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = `rgb(${c1[0]},${c1[1]},${c1[2]})`; ctx.fillRect(0, 0, W, H)
  // Stars
  for (let i = 0; i < 160; i++) {
    const sx = _fhash(i*7+1)*W, sy = _fhash(i*13+3)*H
    ctx.globalAlpha = Math.max(0, Math.sin(t*4.5 + i*0.43))*0.8 + 0.1
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(sx, sy, 0.5+_fhash(i*3+7)*1.3, 0, Math.PI*2); ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'screen'
  const clouds = [
    { bx:0.50, by:0.45, c:c2, rx:0.40, ry:0.28 },
    { bx:0.28, by:0.58, c:c3, rx:0.30, ry:0.20 },
    { bx:0.72, by:0.38, c:c1, rx:0.26, ry:0.36 },
    { bx:0.55, by:0.72, c:c2, rx:0.22, ry:0.16 },
    { bx:0.18, by:0.30, c:c3, rx:0.18, ry:0.24 },
  ]
  clouds.forEach((cl, i) => {
    const x  = (cl.bx + Math.sin(t*0.7+i*1.4)*0.06*inten)*W
    const y  = (cl.by + Math.cos(t*0.5+i*0.9)*0.06*inten)*H
    const rx = cl.rx * base * zoom, ry = cl.ry * base * zoom
    const br = (rx+ry)*0.5
    const rot = Math.sin(t*0.15+i)*0.4
    ctx.save(); ctx.filter = `blur(${Math.round(br*0.9)}px)`
    ctx.globalAlpha = 0.28*inten
    ctx.fillStyle = `rgb(${cl.c[0]},${cl.c[1]},${cl.c[2]})`
    ctx.beginPath(); ctx.ellipse(x,y,rx,ry,rot,0,Math.PI*2); ctx.fill(); ctx.restore()
    ctx.save(); ctx.filter = `blur(${Math.round(br*0.35)}px)`
    ctx.globalAlpha = 0.45*inten
    ctx.fillStyle = `rgb(${cl.c[0]},${cl.c[1]},${cl.c[2]})`
    ctx.beginPath(); ctx.ellipse(x,y,rx*0.45,ry*0.45,rot,0,Math.PI*2); ctx.fill(); ctx.restore()
    ctx.filter = 'none'
  })
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
}

function _draw2d(cfg, elapsed) {
  if (!_ctx2d || !_canvas2d) return
  const ctx = _ctx2d, W = _canvas2d.width, H = _canvas2d.height
  if (W < 2 || H < 2) return
  const spd   = (cfg.speed    ?? 1.0)
  const inten = (cfg.intensity ?? 0.7) * 1.4
  const zoom  = (cfg.density  ?? 0.5) + 0.3
  const c1 = _hexRgb(cfg.color  || '#1a0a3a')
  const c2 = _hexRgb(cfg.color2 || '#0a2a50')
  const c3 = _hexRgb(cfg.color3 || '#3a105a')
  switch (cfg.style) {
    case 'bg-gradient': _2dGradient(ctx, W, H, elapsed, spd, inten, zoom, c1, c2, c3); break
    case 'bg-plasma':   _2dPlasma  (ctx, W, H, elapsed, spd, inten, zoom, c1, c2, c3); break
    case 'bg-geometry': _2dGeometry(ctx, W, H, elapsed, spd, inten, zoom, c1, c2, c3); break
    case 'bg-nebula':   _2dNebula  (ctx, W, H, elapsed, spd, inten, zoom, c1, c2, c3); break
  }
  _canvas2d.style.opacity = cfg.opacity ?? 0.3
}

// ── Init ───────────────────────────────────────────────────────────────────────
export function initBgSpectrum(workbench) {
  if (_canvas) return
  _workbench = workbench

  // Undo the earlier forced-on cosmos backdrop once (back to the plain workbench).
  try {
    if (localStorage.getItem('iceample:cosmosintro') !== 'off') {
      setBgConfig({ enabled: false })
      localStorage.setItem('iceample:cosmosintro', 'off')
    }
  } catch {}

  _canvas = document.createElement('canvas')
  _canvas.id = 'bg-spectrum-canvas'
  workbench.insertBefore(_canvas, workbench.firstChild)

  _canvas2d = document.createElement('canvas')
  _canvas2d.id = 'bg-spectrum-canvas2d'
  workbench.insertBefore(_canvas2d, workbench.firstChild)
  _ctx2d = _canvas2d.getContext('2d')

  _gl = _canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false })
  if (!_gl) { console.warn('[BgShader] WebGL2 unavailable'); return }

  const gl = _gl

  function _mkShader(type, src) {
    const s = gl.createShader(type)
    gl.shaderSource(s, src); gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error('[BgShader] shader error:', gl.getShaderInfoLog(s))
    return s
  }

  _prog = gl.createProgram()
  gl.attachShader(_prog, _mkShader(gl.VERTEX_SHADER,   VERT))
  gl.attachShader(_prog, _mkShader(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(_prog)
  if (!gl.getProgramParameter(_prog, gl.LINK_STATUS)) {
    console.error('[BgShader] link error:', gl.getProgramInfoLog(_prog)); return
  }

  _vao = gl.createVertexArray()
  gl.bindVertexArray(_vao)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(_prog, 'a_pos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  const ro = new ResizeObserver(() => _resize())
  ro.observe(workbench)
  _resize()
  _startLoop()
}

function _resize() {
  if (!_canvas || !_workbench) return
  const r   = _workbench.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  _canvas.width  = Math.round(r.width  * dpr)
  _canvas.height = Math.round(r.height * dpr)
  _canvas.style.width  = r.width  + 'px'
  _canvas.style.height = r.height + 'px'
  if (_gl) _gl.viewport(0, 0, _canvas.width, _canvas.height)
  if (_canvas2d) {
    _canvas2d.width  = Math.round(r.width  * dpr)
    _canvas2d.height = Math.round(r.height * dpr)
    _canvas2d.style.width  = r.width  + 'px'
    _canvas2d.style.height = r.height + 'px'
    _geoTrail2 = null  // reset trail on resize
  }
}

function _hex(h) {
  h = (h || '#000000').replace('#', '')
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255]
}

function _startLoop() {
  if (_raf) return
  const gl   = _gl
  const prog = _prog
  const uRes   = gl.getUniformLocation(prog, 'u_res')
  const uTime  = gl.getUniformLocation(prog, 'u_time')
  const uOp    = gl.getUniformLocation(prog, 'u_opacity')
  const uCol   = gl.getUniformLocation(prog, 'u_color')
  const uCol2  = gl.getUniformLocation(prog, 'u_color2')
  const uSpeed = gl.getUniformLocation(prog, 'u_speed')
  const uInten = gl.getUniformLocation(prog, 'u_intensity')
  const uDen   = gl.getUniformLocation(prog, 'u_density')
  const uStyle = gl.getUniformLocation(prog, 'u_style')
  const t0 = performance.now()

  ;(function frame() {
    _raf = requestAnimationFrame(frame)
    const cfg  = getBgConfig()
    const is2D = CANVAS2D_STYLES.has(cfg.style)

    if (!cfg.enabled) {
      if (_canvas.style.display   !== 'none') _canvas.style.display   = 'none'
      if (_canvas2d && _canvas2d.style.display !== 'none') _canvas2d.style.display = 'none'
      return
    }

    // ── Canvas 2D path ────────────────────────────────────────────────────────
    if (is2D) {
      if (_canvas.style.display !== 'none')   _canvas.style.display   = 'none'
      if (_canvas2d && _canvas2d.style.display !== 'block') _canvas2d.style.display = 'block'

      // Reset trail when style or colors change
      const geoKey = cfg.style + cfg.color + cfg.color2 + cfg.color3 + cfg.density
      if (cfg.style !== _prevStyle2) { _t02d = null; _geoTrail2 = null; _plasmaOff2 = null }
      if (geoKey !== _prevGeoKey)    { _geoTrail2 = null }
      _prevStyle2 = cfg.style; _prevGeoKey = geoKey

      if (_t02d === null) _t02d = performance.now()
      _draw2d(cfg, performance.now() - _t02d)
      return
    }

    // ── WebGL path ────────────────────────────────────────────────────────────
    if (_canvas2d && _canvas2d.style.display !== 'none') _canvas2d.style.display = 'none'
    if (_canvas.style.display !== 'block') _canvas.style.display = 'block'

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(prog)
    gl.bindVertexArray(_vao)

    gl.uniform2f(uRes,    _canvas.width, _canvas.height)
    gl.uniform1f(uTime,   (performance.now() - t0) / 1000)
    gl.uniform1f(uOp,     cfg.opacity)
    gl.uniform3f(uCol,    ..._hex(cfg.color))
    gl.uniform3f(uCol2,   ..._hex(cfg.color2 || '#ff6030'))
    gl.uniform1f(uSpeed,  cfg.speed   ?? 1.0)
    gl.uniform1f(uInten,  cfg.intensity ?? 0.7)
    gl.uniform1f(uDen,    cfg.density  ?? 0.5)
    gl.uniform1i(uStyle,  STYLE_IDX[cfg.style] ?? 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindVertexArray(null)
  })()
}
