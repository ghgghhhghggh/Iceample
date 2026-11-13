// effects.js — Standalone image effects tool. Loads its own image independently,
// runs a stacked canvas 2D pipeline, manages built-in + user presets.
import { t } from './i18n.js'
import { promptName } from './rename-dialog.js'
import { renderGPUEffect } from './gpu-fx.js'
import { makeSendButton, imageMedia } from './media-bus.js'
import { registerTool, toDataURLAsync } from './project.js'

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e }
function mk(w, h) { const c = el('canvas'); c.width = w; c.height = h; return c }
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r:0, g:0, b:0 }
}
function libRoot() { return localStorage.getItem('library:root') }

// ── FX worker offload ─────────────────────────────────────────────────────────
// The heavy per-pixel effects (oil, edge, emboss, sharpen) run in fx-worker.js
// (a classic worker) so large images no longer freeze the UI. Lazy singleton +
// pending map keyed by an incrementing job id; if the Worker can't be built or
// its script fails to load (file:// edge cases) we fall back to the original
// synchronous implementations kept below.
let fxWorker = null, fxWorkerDead = false, fxJobId = 0
const fxPending = new Map()

function getFxWorker() {
  if (fxWorker || fxWorkerDead) return fxWorker
  try {
    fxWorker = new Worker('fx-worker.js')
    fxWorker.onmessage = e => {
      const { id, buf, error } = e.data
      const job = fxPending.get(id); if (!job) return
      fxPending.delete(id)
      if (error) job.reject(new Error(error)); else job.resolve(buf)
    }
    fxWorker.onerror = () => {
      // Script failed to load or crashed hard — drop to the sync path for good.
      fxWorkerDead = true
      fxPending.forEach(job => job.reject(new Error('fx-worker failed')))
      fxPending.clear()
      fxWorker?.terminate(); fxWorker = null
    }
  } catch { fxWorkerDead = true; fxWorker = null }
  return fxWorker
}

// runFxWorker(fxName, imageData, params) → Promise<ImageData>
// Transfers the pixels' ArrayBuffer both ways (imageData is consumed).
function runFxWorker(fxName, imageData, params) {
  const wk = getFxWorker()
  if (!wk) return Promise.reject(new Error('fx-worker unavailable'))
  const { width, height } = imageData
  return new Promise((resolve, reject) => {
    const id = ++fxJobId
    fxPending.set(id, { resolve: buf => resolve(new ImageData(new Uint8ClampedArray(buf), width, height)), reject })
    try {
      wk.postMessage({ id, fx: fxName, w: width, h: height, buf: imageData.data.buffer, params }, [imageData.data.buffer])
    } catch (err) { fxPending.delete(id); reject(err) }
  })
}

async function applyViaWorker(fxName, ctx, src, p, syncFn) {
  if (!getFxWorker()) { syncFn(ctx, src, p); return }
  const w = src.width, h = src.height
  const tmp = mk(w, h), tc = tmp.getContext('2d')
  tc.drawImage(src, 0, 0)
  const id = tc.getImageData(0, 0, w, h)
  try { ctx.putImageData(await runFxWorker(fxName, id, p), 0, 0) }
  catch { syncFn(ctx, src, p) }
}

// Sync fallbacks — the original main-thread pixel loops, kept verbatim
// (fx-worker.js ports these same algorithms; keep both in sync).
function sharpenSync(ctx, src, p) {
  const w=src.width, h=src.height
  const bl=mk(w,h); const bc=bl.getContext('2d')
  bc.filter='blur(1px)'; bc.drawImage(src,0,0); bc.filter='none'
  ctx.drawImage(src,0,0)
  const orig=ctx.getImageData(0,0,w,h), blur=bc.getImageData(0,0,w,h)
  const d=orig.data, bd=blur.data, a=p.amount/100
  for (let i=0;i<d.length;i+=4) {
    d[i]  =Math.min(255,Math.max(0,d[i]  +a*(d[i]  -bd[i])))
    d[i+1]=Math.min(255,Math.max(0,d[i+1]+a*(d[i+1]-bd[i+1])))
    d[i+2]=Math.min(255,Math.max(0,d[i+2]+a*(d[i+2]-bd[i+2])))
  }
  ctx.putImageData(orig,0,0)
}
function embossSync(ctx, src, p) {
  ctx.drawImage(src,0,0)
  const id=ctx.getImageData(0,0,src.width,src.height), d=id.data
  const w=src.width, h=src.height, s=p.strength
  const sd=new Uint8ClampedArray(d)
  const K=[-2*s,-s,0, -s,1,s, 0,s,2*s]
  for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++) {
    let r=0,g=0,b=0,ki=0
    for (let ky=-1;ky<=1;ky++) for (let kx=-1;kx<=1;kx++) {
      const pi=((y+ky)*w+(x+kx))*4
      r+=sd[pi]*K[ki]; g+=sd[pi+1]*K[ki]; b+=sd[pi+2]*K[ki]; ki++
    }
    const i=(y*w+x)*4
    d[i]=Math.min(255,Math.max(0,r+128)); d[i+1]=Math.min(255,Math.max(0,g+128)); d[i+2]=Math.min(255,Math.max(0,b+128))
  }
  ctx.putImageData(id,0,0)
}
function edgeSync(ctx, src, p) {
  const w=src.width, h=src.height
  const tmp=mk(w,h); tmp.getContext('2d').drawImage(src,0,0)
  const sd=tmp.getContext('2d').getImageData(0,0,w,h).data
  const gray=new Float32Array(w*h)
  for (let i=0;i<sd.length;i+=4) gray[i/4]=sd[i]*.299+sd[i+1]*.587+sd[i+2]*.114
  const out=new Uint8ClampedArray(w*h*4)
  const Kx=[-1,0,1,-2,0,2,-1,0,1], Ky=[-1,-2,-1,0,0,0,1,2,1]
  for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++) {
    let gx=0,gy=0,ki=0
    for (let ky=-1;ky<=1;ky++) for (let kx=-1;kx<=1;kx++) { const g=gray[(y+ky)*w+(x+kx)]; gx+=g*Kx[ki]; gy+=g*Ky[ki]; ki++ }
    const mag=Math.min(255,Math.sqrt(gx*gx+gy*gy))
    const v=mag>p.threshold?255:0
    const i=(y*w+x)*4; out[i]=out[i+1]=out[i+2]=v; out[i+3]=255
  }
  ctx.putImageData(new ImageData(out,w,h),0,0)
}
function oilSync(ctx, src, p) {
  const w=src.width, h=src.height, r=Math.max(1,Math.round(p.radius)), lv=Math.max(2,Math.round(p.levels))
  const tmp=mk(w,h); tmp.getContext('2d').drawImage(src,0,0)
  const sd=tmp.getContext('2d').getImageData(0,0,w,h).data
  const out=ctx.createImageData(w,h), od=out.data
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const bkts=Array.from({length:lv},()=>({r:0,g:0,b:0,n:0}))
    for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++) {
      const px=Math.min(w-1,Math.max(0,x+dx)), py=Math.min(h-1,Math.max(0,y+dy))
      const si=(py*w+px)*4
      const idx=Math.min(lv-1,Math.floor(((sd[si]*.299+sd[si+1]*.587+sd[si+2]*.114)/255)*(lv-1)))
      bkts[idx].r+=sd[si]; bkts[idx].g+=sd[si+1]; bkts[idx].b+=sd[si+2]; bkts[idx].n++
    }
    const best=bkts.reduce((a,b)=>b.n>a.n?b:a)
    const oi=(y*w+x)*4
    od[oi]=best.n?best.r/best.n:0; od[oi+1]=best.n?best.g/best.n:0; od[oi+2]=best.n?best.b/best.n:0; od[oi+3]=255
  }
  ctx.putImageData(out,0,0)
}

// ── FX definitions ────────────────────────────────────────────────────────────
const FX = {
  blur: {
    key: 'fx_blur', icon: 'fa-wind',
    params: [{ id:'radius', key:'fx_radius', type:'range', min:0, max:50, step:0.5, def:5 }],
    apply(ctx, src, p) { ctx.filter = `blur(${p.radius}px)`; ctx.drawImage(src,0,0); ctx.filter = 'none' }
  },
  grain: {
    key: 'fx_grain', icon: 'fa-film',
    params: [{ id:'amount', key:'fx_amount', type:'range', min:0, max:100, step:1, def:30 }],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => {
        const eff = new PP.NoiseEffect({ blendFunction: PP.BlendFunction.OVERLAY })
        eff.blendMode.opacity.value = p.amount / 100
        return eff
      })
      ctx.drawImage(out, 0, 0)
    }
  },
  vignette: {
    key: 'fx_vignette', icon: 'fa-circle',
    params: [
      { id:'intensity', key:'fx_intensity', type:'range', min:0, max:1, step:0.01, def:0.6 },
      { id:'softness',  key:'fx_softness',  type:'range', min:0, max:1, step:0.01, def:0.5 }
    ],
    apply(ctx, src, p) {
      ctx.drawImage(src,0,0)
      const cx = src.width/2, cy = src.height/2, r = Math.max(cx,cy)
      const g = ctx.createRadialGradient(cx,cy, r*(1-p.softness), cx,cy, r*1.5)
      g.addColorStop(0,'rgba(0,0,0,0)')
      g.addColorStop(1,`rgba(0,0,0,${p.intensity})`)
      ctx.fillStyle = g; ctx.fillRect(0,0,src.width,src.height)
    }
  },
  glow: {
    key: 'fx_glow', icon: 'fa-sun',
    params: [
      { id:'radius',    key:'fx_radius',    type:'range', min:0, max:40, step:1,    def:8 },
      { id:'intensity', key:'fx_intensity', type:'range', min:0, max:2,  step:0.05, def:0.5 }
    ],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => new PP.BloomEffect({
        intensity: p.intensity, radius: Math.min(1, p.radius / 40),
        luminanceThreshold: 0, luminanceSmoothing: 0.3, mipmapBlur: true,
      }))
      ctx.drawImage(out, 0, 0)
    }
  },
  chroma: {
    key: 'fx_chroma', icon: 'fa-angles-left',
    params: [{ id:'offset', key:'fx_offset', type:'range', min:0, max:30, step:0.5, def:6 }],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => new PP.ChromaticAberrationEffect({
        offset: new THREE.Vector2(p.offset / src.width, 0),
      }))
      ctx.drawImage(out, 0, 0)
    }
  },
  duotone: {
    key: 'fx_duotone', icon: 'fa-droplet',
    params: [
      { id:'color1', key:'fx_color1', type:'color', def:'#000000' },
      { id:'color2', key:'fx_color2', type:'color', def:'#ffffff' }
    ],
    apply(ctx, src, p) {
      ctx.drawImage(src,0,0)
      const id = ctx.getImageData(0,0,src.width,src.height), d = id.data
      const c1 = hexToRgb(p.color1), c2 = hexToRgb(p.color2)
      for (let i = 0; i < d.length; i += 4) {
        const lum = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114) / 255
        d[i]   = Math.round(c1.r + (c2.r-c1.r)*lum)
        d[i+1] = Math.round(c1.g + (c2.g-c1.g)*lum)
        d[i+2] = Math.round(c1.b + (c2.b-c1.b)*lum)
      }
      ctx.putImageData(id,0,0)
    }
  },
  pixelate: {
    key: 'fx_pixelate', icon: 'fa-border-all',
    params: [{ id:'level', key:'fx_level', type:'range', min:1, max:60, step:1, def:12 }],
    apply(ctx, src, p) {
      const w = src.width, h = src.height, s = Math.max(1,Math.round(p.level))
      const tmp = mk(Math.ceil(w/s), Math.ceil(h/s)), tc = tmp.getContext('2d')
      tc.drawImage(src,0,0,tmp.width,tmp.height)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(tmp,0,0,tmp.width,tmp.height,0,0,w,h)
      ctx.imageSmoothingEnabled = true
    }
  },
  glitch: {
    key: 'fx_glitch', icon: 'fa-bolt',
    params: [
      { id:'amount', key:'fx_amount', type:'range', min:0, max:100, step:1, def:30 },
      { id:'seed',   key:'fx_seed',   type:'range', min:0, max:100, step:1, def:42 }
    ],
    apply(ctx, src, p) {
      ctx.drawImage(src,0,0)
      const w = src.width, h = src.height
      let seed = p.seed * 1000 + 1
      const rnd = () => { seed = (seed*9301+49297) % 233280; return seed/233280 }
      const slices = Math.floor(p.amount/5) + 2
      for (let i = 0; i < slices; i++) {
        const y = Math.floor(rnd()*h), sh = Math.floor(rnd()*10)+2, dx = (rnd()-0.5)*(w*0.3)
        ctx.drawImage(src, 0,y,w,sh, dx,y,w,sh)
      }
    }
  },
  threshold: {
    key: 'fx_threshold', icon: 'fa-sliders',
    params: [{ id:'levels', key:'fx_levels', type:'range', min:2, max:16, step:1, def:4 }],
    apply(ctx, src, p) {
      ctx.drawImage(src,0,0)
      const id = ctx.getImageData(0,0,src.width,src.height), d = id.data
      const lv = Math.max(2,Math.round(p.levels)), step = 255/(lv-1)
      for (let i = 0; i < d.length; i += 4) {
        d[i]   = Math.round(d[i]   / step) * step
        d[i+1] = Math.round(d[i+1] / step) * step
        d[i+2] = Math.round(d[i+2] / step) * step
      }
      ctx.putImageData(id,0,0)
    }
  },
  sepia: {
    key: 'fx_sepia', icon: 'fa-image',
    params: [{ id:'amount', key:'fx_amount', type:'range', min:0, max:100, step:1, def:80 }],
    apply(ctx, src, p) { ctx.filter=`sepia(${p.amount}%)`; ctx.drawImage(src,0,0); ctx.filter='none' }
  },
  invert: {
    key: 'fx_invert', icon: 'fa-circle-half-stroke',
    params: [{ id:'amount', key:'fx_amount', type:'range', min:0, max:100, step:1, def:100 }],
    apply(ctx, src, p) { ctx.filter=`invert(${p.amount}%)`; ctx.drawImage(src,0,0); ctx.filter='none' }
  },
  hue: {
    key: 'fx_hue', icon: 'fa-rotate',
    params: [{ id:'angle', key:'fx_angle', type:'range', min:0, max:360, step:1, def:90 }],
    apply(ctx, src, p) { ctx.filter=`hue-rotate(${p.angle}deg)`; ctx.drawImage(src,0,0); ctx.filter='none' }
  },
  sharpen: {
    key: 'fx_sharpen', icon: 'fa-crosshairs',
    params: [{ id:'amount', key:'fx_amount', type:'range', min:0, max:300, step:5, def:80 }],
    apply(ctx, src, p) { return applyViaWorker('sharpen', ctx, src, p, sharpenSync) }
  },
  emboss: {
    key: 'fx_emboss', icon: 'fa-mountain',
    params: [{ id:'strength', key:'fx_intensity', type:'range', min:0.5, max:5, step:0.1, def:1.5 }],
    apply(ctx, src, p) { return applyViaWorker('emboss', ctx, src, p, embossSync) }
  },
  edge: {
    key: 'fx_edge', icon: 'fa-vector-square',
    params: [{ id:'threshold', key:'fx_levels', type:'range', min:0, max:200, step:1, def:40 }],
    apply(ctx, src, p) { return applyViaWorker('edge', ctx, src, p, edgeSync) }
  },
  halftone: {
    key: 'fx_halftone', icon: 'fa-braille',
    params: [{ id:'size', key:'fx_level', type:'range', min:2, max:30, step:1, def:8 }],
    apply(ctx, src, p) {
      const w=src.width, h=src.height, s=Math.max(2,Math.round(p.size))
      const tmp=mk(w,h); tmp.getContext('2d').drawImage(src,0,0)
      const sd=tmp.getContext('2d').getImageData(0,0,w,h).data
      ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h)
      for (let y=0;y<h;y+=s) for (let x=0;x<w;x+=s) {
        const px=Math.min(w-1,x+Math.floor(s/2)), py=Math.min(h-1,y+Math.floor(s/2))
        const i=(py*w+px)*4
        const lum=(sd[i]*.299+sd[i+1]*.587+sd[i+2]*.114)/255
        const r=(s/2)*lum*.95
        if (r>.3) {
          const hex=`#${sd[i].toString(16).padStart(2,'0')}${sd[i+1].toString(16).padStart(2,'0')}${sd[i+2].toString(16).padStart(2,'0')}`
          ctx.fillStyle=hex; ctx.beginPath(); ctx.arc(x+s/2,y+s/2,r,0,Math.PI*2); ctx.fill()
        }
      }
    }
  },
  scanlines: {
    key: 'fx_scanlines', icon: 'fa-grip-lines',
    params: [
      { id:'spacing',  key:'fx_level',     type:'range', min:2,  max:16,  step:1,    def:4 },
      { id:'opacity',  key:'fx_intensity', type:'range', min:0,  max:1,   step:0.05, def:0.45 }
    ],
    apply(ctx, src, p) {
      ctx.drawImage(src,0,0)
      ctx.fillStyle=`rgba(0,0,0,${p.opacity})`
      for (let y=0; y<src.height; y+=p.spacing) ctx.fillRect(0,y,src.width,Math.max(1,Math.floor(p.spacing/2)))
    }
  },
  oil: {
    key: 'fx_oil', icon: 'fa-paint-roller',
    params: [
      { id:'radius', key:'fx_radius', type:'range', min:1, max:6, step:1, def:2 },
      { id:'levels', key:'fx_levels', type:'range', min:2, max:20, step:1, def:8 }
    ],
    apply(ctx, src, p) { return applyViaWorker('oil', ctx, src, p, oilSync) }
  },
  tilt_shift: {
    key: 'fx_tilt_shift', icon: 'fa-camera',
    params: [
      { id:'focus', key:'fx_level',    type:'range', min:0,  max:100, step:1,   def:50 },
      { id:'range', key:'fx_softness', type:'range', min:5,  max:80,  step:1,   def:25 },
      { id:'blur',  key:'fx_radius',   type:'range', min:1,  max:20,  step:0.5, def:8 }
    ],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => new PP.TiltShiftEffect({
        offset: (p.focus - 50) / 50,
        focusArea: Math.min(1, p.range / 100),
        feather: 0.3,
        kernelSize: p.blur < 5 ? PP.KernelSize.SMALL : p.blur < 12 ? PP.KernelSize.MEDIUM : p.blur < 18 ? PP.KernelSize.LARGE : PP.KernelSize.VERY_LARGE,
      }))
      ctx.drawImage(out, 0, 0)
    }
  },
  brightness_contrast: {
    key: 'fx_brightness_contrast', icon: 'fa-gauge-high',
    params: [
      { id:'brightness', key:'fx_brightness', type:'range', min:0, max:200, step:1, def:100 },
      { id:'contrast',   key:'fx_contrast',   type:'range', min:0, max:200, step:1, def:100 }
    ],
    apply(ctx, src, p) { ctx.filter = `brightness(${p.brightness}%) contrast(${p.contrast}%)`; ctx.drawImage(src,0,0); ctx.filter = 'none' }
  },
  saturation: {
    key: 'fx_saturation', icon: 'fa-droplet-slash',
    params: [{ id:'amount', key:'fx_amount', type:'range', min:0, max:300, step:1, def:150 }],
    apply(ctx, src, p) { ctx.filter = `saturate(${p.amount}%)`; ctx.drawImage(src,0,0); ctx.filter = 'none' }
  },
  color_balance: {
    key: 'fx_color_balance', icon: 'fa-scale-balanced',
    params: [
      { id:'r', key:'fx_red',   type:'range', min:-100, max:100, step:1, def:0 },
      { id:'g', key:'fx_green', type:'range', min:-100, max:100, step:1, def:0 },
      { id:'b', key:'fx_blue',  type:'range', min:-100, max:100, step:1, def:0 }
    ],
    apply(ctx, src, p) {
      ctx.drawImage(src,0,0)
      const id = ctx.getImageData(0,0,src.width,src.height), d = id.data
      const rg = 1 + p.r/100, gg = 1 + p.g/100, bg = 1 + p.b/100
      for (let i = 0; i < d.length; i += 4) {
        d[i]   = Math.min(255, Math.max(0, d[i]   * rg))
        d[i+1] = Math.min(255, Math.max(0, d[i+1] * gg))
        d[i+2] = Math.min(255, Math.max(0, d[i+2] * bg))
      }
      ctx.putImageData(id,0,0)
    }
  },
  colorize: {
    key: 'fx_colorize', icon: 'fa-paintbrush',
    params: [
      { id:'color1',    key:'fx_color1',    type:'color', def:'#4a9eff' },
      { id:'intensity', key:'fx_intensity', type:'range', min:0, max:1, step:0.01, def:0.6 }
    ],
    apply(ctx, src, p) {
      ctx.drawImage(src,0,0)
      ctx.globalCompositeOperation = 'color'
      ctx.globalAlpha = p.intensity
      ctx.fillStyle = p.color1
      ctx.fillRect(0,0,src.width,src.height)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
  },

  // ── Déformations GPU (héritées de l'ancien Atelier de shaders, devenues des
  // effets à un clic). Chaque shader est un postprocessing Effect autonome :
  // mainUv déplace la coordonnée d'échantillonnage, mainImage laisse passer.
  kaleido: {
    key: 'fx_kaleido', icon: 'fa-snowflake',
    params: [{ id:'segments', key:'fx_levels', type:'range', min:2, max:16, step:1, def:6 }],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => new PP.Effect('KaleidoFx', `
uniform float segs;
void mainUv(inout vec2 uv) {
  vec2 c = uv - 0.5;
  float a = atan(c.y, c.x);
  float r = length(c);
  float seg = 6.28318530718 / segs;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  uv = clamp(vec2(cos(a), sin(a)) * r + 0.5, 0.0, 1.0);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = inputColor; }`,
        { uniforms: new Map([['segs', new THREE.Uniform(p.segments)]]) }))
      ctx.drawImage(out, 0, 0)
    }
  },
  swirl: {
    key: 'fx_swirl', icon: 'fa-hurricane',
    params: [
      { id:'amount', key:'fx_intensity', type:'range', min:-8,  max:8, step:0.1,  def:3 },
      { id:'radius', key:'fx_radius',    type:'range', min:0.1, max:1, step:0.02, def:0.6 }
    ],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => new PP.Effect('SwirlFx', `
uniform float amt; uniform float rad;
void mainUv(inout vec2 uv) {
  vec2 c = uv - 0.5;
  float d = length(c);
  float a = amt * smoothstep(rad, 0.0, d);
  float s = sin(a), co = cos(a);
  uv = clamp(vec2(c.x*co - c.y*s, c.x*s + c.y*co) + 0.5, 0.0, 1.0);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = inputColor; }`,
        { uniforms: new Map([['amt', new THREE.Uniform(p.amount)], ['rad', new THREE.Uniform(p.radius)]]) }))
      ctx.drawImage(out, 0, 0)
    }
  },
  wave: {
    key: 'fx_wave', icon: 'fa-water',
    params: [
      { id:'amp',  key:'fx_amount', type:'range', min:0, max:0.2, step:0.005, def:0.04 },
      { id:'freq', key:'fx_level',  type:'range', min:1, max:60,  step:1,     def:12 }
    ],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => new PP.Effect('WaveFx', `
uniform float amp; uniform float freq;
void mainUv(inout vec2 uv) {
  uv.x += sin(uv.y * freq) * amp;
  uv.y += cos(uv.x * freq) * amp;
  uv = clamp(uv, 0.0, 1.0);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = inputColor; }`,
        { uniforms: new Map([['amp', new THREE.Uniform(p.amp)], ['freq', new THREE.Uniform(p.freq)]]) }))
      ctx.drawImage(out, 0, 0)
    }
  },
  bulge: {
    key: 'fx_bulge', icon: 'fa-magnifying-glass-plus',
    params: [{ id:'amount', key:'fx_intensity', type:'range', min:-0.8, max:0.8, step:0.02, def:0.4 }],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => new PP.Effect('BulgeFx', `
uniform float k;
void mainUv(inout vec2 uv) {
  vec2 c = uv - 0.5;
  float d = max(length(c) * 2.0, 1e-4);
  float f = pow(d, 1.0 + k) / d;
  uv = clamp(c * f + 0.5, 0.0, 1.0);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = inputColor; }`,
        { uniforms: new Map([['k', new THREE.Uniform(p.amount)]]) }))
      ctx.drawImage(out, 0, 0)
    }
  },
  cells: {
    key: 'fx_cells', icon: 'fa-splotch',
    params: [{ id:'scale', key:'fx_level', type:'range', min:4, max:80, step:1, def:24 }],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => new PP.Effect('CellsFx', `
uniform float scl;
vec2 cHash2(vec2 p) { return fract(sin(vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))))*43758.5453); }
void mainUv(inout vec2 uv) {
  vec2 x = uv * scl;
  vec2 n = floor(x); vec2 f = fract(x);
  float md = 8.0; vec2 mp = x;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = cHash2(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md = d; mp = n + g + o; }
  }
  uv = clamp(mp / scl, 0.0, 1.0);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = inputColor; }`,
        { uniforms: new Map([['scl', new THREE.Uniform(p.scale)]]) }))
      ctx.drawImage(out, 0, 0)
    }
  },
  warp: {
    key: 'fx_warp', icon: 'fa-wave-square',
    params: [
      { id:'amount', key:'fx_amount', type:'range', min:0, max:0.25, step:0.005, def:0.06 },
      { id:'scale',  key:'fx_level',  type:'range', min:1, max:20,   step:0.5,   def:4 }
    ],
    async apply(ctx, src, p) {
      const out = await renderGPUEffect(src, (THREE, PP) => new PP.Effect('WarpFx', `
uniform float amt; uniform float scl;
vec3 wPermute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float wSnoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = wPermute(wPermute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
void mainUv(inout vec2 uv) {
  float n1 = wSnoise(uv * scl);
  float n2 = wSnoise(uv * scl + 31.4);
  uv = clamp(uv + vec2(n1, n2) * amt, 0.0, 1.0);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = inputColor; }`,
        { uniforms: new Map([['amt', new THREE.Uniform(p.amount)], ['scl', new THREE.Uniform(p.scale)]]) }))
      ctx.drawImage(out, 0, 0)
    }
  },
  mirror_h: {
    key: 'fx_mirror_h', icon: 'fa-left-right', params: [],
    apply(ctx, src) { ctx.save(); ctx.translate(src.width, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0); ctx.restore() }
  },
  mirror_v: {
    key: 'fx_mirror_v', icon: 'fa-up-down', params: [],
    apply(ctx, src) { ctx.save(); ctx.translate(0, src.height); ctx.scale(1, -1); ctx.drawImage(src, 0, 0); ctx.restore() }
  }
}

// ── Built-in presets ──────────────────────────────────────────────────────────
const BUILTIN = [
  { name:'Vintage',   effects:[{type:'grain',    params:{amount:25}}, {type:'duotone',  params:{color1:'#2c1810',color2:'#e8d5a3'}}, {type:'vignette', params:{intensity:0.7,softness:0.4}}] },
  { name:'Neon Glow', effects:[{type:'glow',     params:{radius:15,intensity:1.2}}, {type:'threshold', params:{levels:6}}, {type:'glow', params:{radius:8,intensity:0.6}}] },
  { name:'Glitch Art',effects:[{type:'chroma',   params:{offset:12}}, {type:'glitch',   params:{amount:60,seed:7}}, {type:'grain', params:{amount:15}}] },
  { name:'Noir',      effects:[{type:'duotone',  params:{color1:'#000000',color2:'#ffffff'}}, {type:'vignette', params:{intensity:0.8,softness:0.3}}, {type:'threshold', params:{levels:8}}] },
  { name:'Dreamy',    effects:[{type:'blur',     params:{radius:2}}, {type:'glow', params:{radius:20,intensity:0.4}}, {type:'vignette', params:{intensity:0.4,softness:0.7}}] },
  { name:'Cyberpunk', effects:[{type:'chroma',   params:{offset:8}}, {type:'duotone',  params:{color1:'#0d0020',color2:'#00ffff'}}, {type:'glow', params:{radius:10,intensity:0.8}}] },
  { name:'Pixel Art',  effects:[{type:'pixelate',   params:{level:8}},    {type:'threshold',  params:{levels:8}}] },
  { name:'Sépia',      effects:[{type:'sepia',      params:{amount:85}},  {type:'vignette',   params:{intensity:0.5,softness:0.5}}] },
  { name:'Gravure',    effects:[{type:'emboss',     params:{strength:2}}, {type:'threshold',  params:{levels:6}},  {type:'sepia', params:{amount:60}}] },
  { name:'Rétro TV',   effects:[{type:'scanlines',  params:{spacing:4,opacity:0.5}}, {type:'sepia', params:{amount:40}}, {type:'vignette', params:{intensity:0.6,softness:0.4}}] },
  { name:'Halftone',   effects:[{type:'halftone',   params:{size:6}},     {type:'duotone',    params:{color1:'#000000',color2:'#ffffff'}}] },
  { name:'Miniature',  effects:[{type:'tilt_shift', params:{focus:50,range:20,blur:10}}, {type:'vignette', params:{intensity:0.3,softness:0.6}}] },
  { name:'Contours',   effects:[{type:'edge',       params:{threshold:30}},{type:'invert',    params:{amount:100}}, {type:'duotone', params:{color1:'#0a0020',color2:'#ff44cc'}}] },
  { name:'Peinture',   effects:[{type:'oil',        params:{radius:3,levels:10}}, {type:'sharpen', params:{amount:60}}] }
]

// ── Pipeline ──────────────────────────────────────────────────────────────────
// Async because some effects render through a WebGL pass (grain, chroma, glow,
// tilt_shift — three.js + postprocessing) or off-thread in fx-worker.js (oil,
// edge, emboss, sharpen) instead of plain Canvas 2D; `await` on a synchronous
// CPU effect's return value is a no-op, so this stays a drop-in replacement
// for every effect regardless of which path it uses.
async function runPipeline(srcImg, stack) {
  let cur = mk(srcImg.naturalWidth || srcImg.width, srcImg.naturalHeight || srcImg.height)
  cur.getContext('2d').drawImage(srcImg,0,0)
  for (const item of stack) {
    const def = resolveFX(item.type); if (!def) continue
    const out = mk(cur.width, cur.height)
    await def.apply(out.getContext('2d'), cur, item.params)
    cur = out
  }
  return cur
}

// ── Localized (marker-centered) compositing ───────────────────────────────────
// Effect-agnostic: the pipeline renders full-frame exactly as before (Canvas 2D,
// GPU and worker paths all untouched), then the result is blended back over the
// untouched source through a radial alpha mask. Clean 2-canvas approach:
//   1. mask canvas = copy of the effected frame, punched by a radial gradient
//      via 'destination-in' (alpha 1 at the center → 0 at the radius edge);
//   2. output = source drawn first, masked effected frame drawn over it.
// `local`: x/y are 0–1 image fractions, radius is % of the min dimension,
// feather (0–100) maps to the gradient's inner stop (0 = hard edge, 100 = fully
// feathered from the center).
function compositeLocal(source, effected, local) {
  const w = effected.width, h = effected.height
  const cx = local.x * w, cy = local.y * h
  const r = Math.max(1, (local.radius / 100) * Math.min(w, h))
  // Keep inner strictly below outer: identical radii would paint nothing.
  const inner = Math.max(0, Math.min(r - 0.5, r * (1 - local.feather / 100)))
  const masked = mk(w, h), mc = masked.getContext('2d')
  mc.drawImage(effected, 0, 0)
  const g = mc.createRadialGradient(cx, cy, inner, cx, cy, r)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  mc.globalCompositeOperation = 'destination-in'
  mc.fillStyle = g
  mc.fillRect(0, 0, w, h)
  const out = mk(w, h), oc = out.getContext('2d')
  oc.drawImage(source, 0, 0)
  oc.drawImage(masked, 0, 0)
  return out
}

const STORE_KEY = 'iceample:fx-presets'
function loadUserPresets() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || [] } catch { return [] } }
function saveUserPresets(a) { localStorage.setItem(STORE_KEY, JSON.stringify(a)) }
function defaultParams(def) { const p = {}; (def?.params || []).forEach(pm => { p[pm.id] = pm.def }); return p }

function resolveFX(type) { return FX[type] }
function fxName(def) { return def.key ? t(def.key) : def.name }
function pmLabel(pm) { return pm.key ? t(pm.key) : pm.label }

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('fx-styles')) return
  const s = document.createElement('style'); s.id = 'fx-styles'
  s.textContent = `
.fx-wrap{display:flex;flex-direction:column;height:100%;background:var(--surface);color:var(--text-primary);font-family:inherit;font-size:12px}
.fx-bar{display:flex;align-items:center;gap:4px;padding:7px 9px;border-bottom:1px solid var(--win-border-in);flex-shrink:0;flex-wrap:wrap}
.fx-btn{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;height:27px;border:1px solid var(--win-border);border-radius:7px;background:color-mix(in srgb,var(--text-primary) 7%,var(--surface));color:var(--text-primary);font-size:11px;cursor:pointer;white-space:nowrap;font-family:inherit;transition:background .12s ease,border-color .12s ease,transform .08s ease}
.fx-btn:hover{background:color-mix(in srgb,var(--text-primary) 13%,var(--surface))}
.fx-btn:active{transform:translateY(1px)}
.fx-btn:disabled{opacity:.4;cursor:default}
.fx-sep{width:1px;height:20px;background:var(--win-border-in);margin:0 2px;flex-shrink:0}
.fx-main{display:flex;flex:1;overflow:hidden}
.fx-preview{flex:1;display:flex;align-items:center;justify-content:center;background:
  repeating-conic-gradient(color-mix(in srgb,var(--preview-bg),var(--text-primary) 3%) 0% 25%, color-mix(in srgb,var(--preview-bg),var(--text-primary) 1.5%) 0% 50%) 0 0/22px 22px;
  overflow:hidden;position:relative}
.fx-canvas{max-width:calc(100% - 32px);max-height:calc(100% - 32px);object-fit:contain;display:none;border-radius:8px;box-shadow:0 12px 32px -12px rgba(0,0,0,.65);background:var(--preview-bg)}
.fx-empty-msg{display:flex;flex-direction:column;align-items:center;gap:10px;opacity:.4;pointer-events:none}
.fx-empty-msg i{font-size:38px}
.fx-empty-msg span{font-size:12px}
.fx-panel{width:236px;flex-shrink:0;border-left:1px solid var(--win-border-in);display:flex;flex-direction:column;overflow:hidden;background:var(--surface2)}
.fx-panel-head{display:flex;align-items:center;justify-content:space-between;padding:8px 11px;border-bottom:1px solid var(--win-border-in)}
.fx-panel-head span{font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px}
.fx-stack{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
.fx-no-fx{text-align:center;padding:28px 10px;color:var(--text-secondary);font-size:11px;opacity:.55}
.fx-item{background:color-mix(in srgb,var(--text-primary) 5%,var(--surface));border:1px solid var(--win-border-in);border-radius:8px;overflow:hidden;box-shadow:0 2px 8px -6px rgba(0,0,0,.6);transition:border-color .12s ease}
.fx-item:hover{border-color:color-mix(in srgb,var(--color-active) 35%,var(--win-border-in))}
.fx-item-head{display:flex;align-items:center;gap:6px;padding:7px 8px;cursor:default;user-select:none}
.fx-item-name{flex:1;font-size:11px;font-weight:600}
.fx-item-act{color:var(--text-secondary);cursor:pointer;font-size:10px;padding:3px 4px;opacity:.55;border-radius:4px;transition:opacity .1s ease,color .1s ease,background .1s ease}
.fx-item-act:hover{opacity:1;background:color-mix(in srgb,var(--text-primary) 10%,transparent)}
.fx-item-act.fx-item-del:hover{color:var(--vu-color-high);background:color-mix(in srgb,var(--vu-color-high) 14%,transparent)}
.fx-item-act.fx-item-disabled{cursor:not-allowed;opacity:.2;pointer-events:none}
.fx-item-body{padding:7px 9px 9px;border-top:1px solid var(--win-border-in);display:flex;flex-direction:column;gap:7px}
.fx-field{display:flex;flex-direction:column;gap:2px}
.fx-field label{font-size:10px;color:var(--text-secondary)}
.fx-field input[type=range]{width:100%;accent-color:var(--slider-color)}
.fx-field input[type=color]{width:36px;height:22px;border:1px solid var(--win-border);border-radius:4px;cursor:pointer;padding:0;background:none}
.fx-field .fx-val{font-size:10px;color:var(--text-secondary);text-align:right;opacity:.7}
.fx-row{display:flex;align-items:center;gap:4px}
.fx-add-btn{margin:2px 8px 8px;padding:8px;border:1px dashed var(--win-border);border-radius:8px;background:none;color:var(--text-secondary);cursor:pointer;font-size:11px;font-family:inherit;width:calc(100% - 16px);transition:border-color .12s ease,color .12s ease,background .12s ease}
.fx-add-btn:hover{border-color:var(--color-active);color:var(--text-primary);background:color-mix(in srgb,var(--color-active) 6%,transparent)}
.fx-drop-ov{position:absolute;inset:0;background:color-mix(in srgb,var(--color-active) 20%,transparent);border:2px dashed var(--color-active);display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:18px;color:var(--color-active);z-index:10}
.fx-pop{position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--win-border);border-radius:9px;box-shadow:0 12px 32px rgba(0,0,0,.6);min-width:160px;max-height:min(60vh,380px);overflow-y:auto;overflow-x:hidden;animation:fx-pop-in .12s ease}
@keyframes fx-pop-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.fx-pop-item{padding:7px 14px;cursor:pointer;font-size:11px;color:var(--text-primary);white-space:nowrap;transition:background .1s ease}
.fx-pop-item:hover{background:color-mix(in srgb,var(--text-primary) 10%,transparent)}
.fx-pop-sep{height:1px;background:var(--win-border-in);margin:3px 0}
.fx-pop-head{padding:5px 14px;font-size:9px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;pointer-events:none;opacity:.7}
.fx-lib-ov{position:absolute;inset:0;background:var(--surface);display:flex;flex-direction:column;z-index:5}
.fx-lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;padding:10px;overflow-y:auto;flex:1}
.fx-lib-item{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:5px;border-radius:6px;transition:background .1s ease}
.fx-lib-item:hover{background:var(--hover)}
.fx-lib-item img{width:72px;height:72px;object-fit:cover;border-radius:5px;background:var(--preview-bg)}
.fx-lib-item span{font-size:9px;text-align:center;overflow:hidden;max-width:76px;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary)}
.fx-local{display:flex;flex-direction:column;gap:7px;padding:8px 8px 9px;border-bottom:1px solid var(--win-border-in)}
.fx-local-toggle{justify-content:center}
.fx-local-toggle.fx-local-on{border-color:color-mix(in srgb,var(--color-active) 65%,var(--win-border));color:var(--color-active);background:color-mix(in srgb,var(--color-active) 12%,var(--surface))}
.fx-local-body{display:flex;flex-direction:column;gap:7px}
.fx-local-body[hidden]{display:none}
.fx-pin{position:absolute;z-index:4;transform:translate(-50%,-100%);pointer-events:none;color:var(--color-active);font-size:19px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.55));display:none}
`
  document.head.appendChild(s)
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initEffects(body) {
  injectStyles()
  let srcImg = null
  let stack = []
  // Local (marker-centered) application — ONE marker at a time carrying its own
  // settings (« 1 marqueur = 1 fonction »). x/y are 0–1 fractions of the image;
  // radius is % of the min dimension; feather is the edge falloff (0–100).
  const local = { on: false, x: 0.5, y: 0.5, radius: 25, feather: 60 }

  body.innerHTML = `
<div class="fx-wrap">
  <div class="fx-bar">
    <button class="fx-btn" id="fx-open"><i class="fa-solid fa-folder-open"></i> ${t('fx_open')}</button>
    <button class="fx-btn" id="fx-lib"><i class="fa-solid fa-images"></i> ${t('fx_library')}</button>
    <input type="file" id="fx-file" accept="image/*" hidden />
    <span class="fx-sep"></span>
    <button class="fx-btn" id="fx-presets"><i class="fa-solid fa-layer-group"></i> ${t('fx_presets')} <i class="fa-solid fa-chevron-down" style="font-size:8px;margin-left:2px"></i></button>
    <button class="fx-btn" id="fx-save" title="${t('fx_save')}"><i class="fa-solid fa-floppy-disk"></i></button>
    <button class="fx-btn" id="fx-imp" title="${t('fx_import')}"><i class="fa-solid fa-file-import"></i></button>
    <input type="file" id="fx-imp-file" accept=".json" hidden />
    <span class="fx-sep"></span>
    <button class="fx-btn" id="fx-export" disabled><i class="fa-solid fa-download"></i> ${t('fx_export')}</button>
    <span id="fx-send-slot"></span>
  </div>
  <div class="fx-main">
    <div class="fx-preview" id="fx-preview">
      <div class="fx-empty-msg" id="fx-empty"><i class="fa-solid fa-image"></i><span>${t('fx_empty')}</span></div>
      <canvas class="fx-canvas" id="fx-canvas"></canvas>
    </div>
    <div class="fx-panel">
      <div class="fx-panel-head">
        <span>${t('fx_effects')}</span>
        <button class="fx-btn" id="fx-reset" style="padding:2px 7px;font-size:10px">${t('fx_reset')}</button>
      </div>
      <div class="fx-local">
        <button class="fx-btn fx-local-toggle" id="fx-local-toggle"><i class="fa-solid fa-location-dot"></i> ${t('fx_local')}</button>
        <div class="fx-local-body" id="fx-local-body" hidden>
          <div class="fx-field">
            <label>${t('fx_radius')}</label>
            <div class="fx-row"><input type="range" id="fx-local-radius" min="5" max="60" step="1" value="25" style="flex:1" /><span class="fx-val" id="fx-local-radius-val">25%</span></div>
          </div>
          <div class="fx-field">
            <label>${t('fx_local_feather')}</label>
            <div class="fx-row"><input type="range" id="fx-local-feather" min="0" max="100" step="1" value="60" style="flex:1" /><span class="fx-val" id="fx-local-feather-val">60%</span></div>
          </div>
        </div>
      </div>
      <div class="fx-stack" id="fx-stack"></div>
      <button class="fx-add-btn" id="fx-add"><i class="fa-solid fa-plus"></i> ${t('fx_add')}</button>
    </div>
  </div>
</div>`

  const canvas  = body.querySelector('#fx-canvas')
  const emptyEl = body.querySelector('#fx-empty')
  const stackEl = body.querySelector('#fx-stack')
  const preview = body.querySelector('#fx-preview')

  // ── Pipeline render ────────────────────────────────────────────────────────
  let rafId = null
  let stateRev = 0   // bumped on every repaint request → project auto-save change marker
  function scheduleRender() {
    stateRev++
    if (rafId) return
    rafId = requestAnimationFrame(() => { rafId = null; renderCanvas() })
  }
  let renderGen = 0
  let lastPipeOut = null   // cached full-frame pipeline result, for local-only re-composites
  // Single output seam: preview, export and bus-send all read #fx-canvas, so
  // compositing here guarantees they all carry the SAME (possibly localized) result.
  function blit(out) {
    const final = local.on && srcImg ? compositeLocal(srcImg, out, local) : out
    canvas.width = final.width; canvas.height = final.height
    canvas.getContext('2d').drawImage(final,0,0)
    body.querySelector('#fx-export').disabled = false
    positionPin()
  }
  function renderCanvas() {
    if (!srcImg) return
    const gen = ++renderGen
    runPipeline(srcImg, stack).then(out => {
      if (gen !== renderGen) return   // a newer render started meanwhile — drop this stale one
      lastPipeOut = out
      blit(out)
    }).catch(() => { if (gen === renderGen) window.toast?.(t('ie_export_fail'), 'error') })
  }
  // Local-only changes (center, radius, feather, toggle) re-composite the cached
  // pipeline output instead of re-running every effect — the sliders stay fluid
  // even with heavy effects (oil, GPU passes) in the stack.
  let compRaf = null
  function scheduleComposite() {
    stateRev++
    if (!srcImg) return
    if (!lastPipeOut) { scheduleRender(); return }
    if (compRaf) return
    compRaf = requestAnimationFrame(() => { compRaf = null; if (lastPipeOut) blit(lastPipeOut) })
  }
  function showImage(img) {
    // Invalidate in-flight renders here, not just in renderCanvas: a slow
    // pipeline resolving between this call and the rAF would blit the OLD
    // effect result composited over the NEW source image.
    renderGen++
    srcImg = img; lastPipeOut = null
    emptyEl.style.display = 'none'; canvas.style.display = 'block'; scheduleRender()
  }

  // Media bus: image sent from another tool becomes the source; the rendered
  // RESULT can be shipped onward with the "send to…" button.
  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (!m || m.kind !== 'image' || !m.dataUrl) return
    const i = new Image()
    i.onload = () => { showImage(i); applyIncomingMarkers(m.markers) }
    i.src = m.dataUrl
  })
  // Optional `media.markers = [{x, y}]` (percent coords) rides the bus payload
  // untouched; the FIRST marker pre-centers Local mode with default settings
  // (« 1 marqueur = 1 fonction »). Malformed markers are ignored silently.
  function applyIncomingMarkers(markers) {
    if (!Array.isArray(markers) || !markers.length) return
    const x = Number(markers[0]?.x), y = Number(markers[0]?.y)
    if (!isFinite(x) || !isFinite(y)) return
    local.on = true
    local.x = Math.min(1, Math.max(0, x / 100))
    local.y = Math.min(1, Math.max(0, y / 100))
    local.radius = 25; local.feather = 60
    syncLocalUI(); scheduleComposite()
    window.toast?.(t('fx_local_hint'), 'info')
  }
  {
    const sendBtn = makeSendButton(() => {
      if (!srcImg || !canvas.width) return null
      return imageMedia(canvas, t('tool_effects'))
    }, { self: 'effects', className: 'fx-btn', iconOnly: true })
    body.querySelector('#fx-send-slot').replaceWith(sendBtn)
  }

  // ── Local (marker-centered) application ────────────────────────────────────
  const pin = el('i','fa-solid fa-location-dot fx-pin')
  preview.appendChild(pin)
  const localToggle  = body.querySelector('#fx-local-toggle')
  const localBody    = body.querySelector('#fx-local-body')
  const localRadius  = body.querySelector('#fx-local-radius')
  const localFeather = body.querySelector('#fx-local-feather')
  const localRadiusVal  = body.querySelector('#fx-local-radius-val')
  const localFeatherVal = body.querySelector('#fx-local-feather-val')

  // The pin lives in .fx-preview (position:relative); the canvas is displayed
  // letterboxed inside it, so map the 0–1 image fractions through the canvas
  // client rect. Pointer-events none — clicks fall through to the canvas.
  function positionPin() {
    if (!local.on || !srcImg || canvas.style.display === 'none') { pin.style.display = 'none'; return }
    const pr = preview.getBoundingClientRect(), cr = canvas.getBoundingClientRect()
    if (!cr.width || !cr.height) { pin.style.display = 'none'; return }
    pin.style.display = 'block'
    pin.style.left = (cr.left - pr.left + local.x * cr.width) + 'px'
    pin.style.top  = (cr.top  - pr.top  + local.y * cr.height) + 'px'
  }
  function syncLocalUI() {
    localToggle.classList.toggle('fx-local-on', local.on)
    localBody.hidden = !local.on
    localRadius.value = local.radius;   localRadiusVal.textContent  = local.radius + '%'
    localFeather.value = local.feather; localFeatherVal.textContent = local.feather + '%'
    canvas.style.cursor = local.on ? 'crosshair' : ''
    positionPin()
  }
  localToggle.addEventListener('click', () => { local.on = !local.on; syncLocalUI(); scheduleComposite() })
  localRadius.addEventListener('input', () => { local.radius = parseFloat(localRadius.value); localRadiusVal.textContent = local.radius + '%'; scheduleComposite() })
  localFeather.addEventListener('input', () => { local.feather = parseFloat(localFeather.value); localFeatherVal.textContent = local.feather + '%'; scheduleComposite() })
  canvas.addEventListener('click', e => {
    if (!local.on || !srcImg) return
    const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return
    local.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    local.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    positionPin(); scheduleComposite()
  })
  // Keep the pin glued to the displayed canvas when the pane resizes.
  const pinRo = window.ResizeObserver ? new ResizeObserver(positionPin) : null
  pinRo?.observe(preview)

  // ── Stack UI ───────────────────────────────────────────────────────────────
  function renderStack() {
    stackEl.innerHTML = ''
    if (!stack.length) {
      const p = el('div','fx-no-fx'); p.textContent = t('fx_no_fx'); stackEl.appendChild(p); return
    }
    stack.forEach((item, idx) => {
      const def = resolveFX(item.type); if (!def) return
      const card = el('div','fx-item')
      const head = el('div','fx-item-head')
      const nameSpan = el('span','fx-item-name')
      nameSpan.innerHTML = `<i class="fa-solid ${def.icon}" style="margin-right:5px;font-size:10px;opacity:.65"></i>${fxName(def)}`
      const up = el('i','fa-solid fa-chevron-up fx-item-act' + (idx === 0 ? ' fx-item-disabled' : '')); up.title = t('fx_move_up')
      up.addEventListener('click', () => { if (idx > 0) { [stack[idx-1], stack[idx]] = [stack[idx], stack[idx-1]]; renderStack(); scheduleRender() } })
      const down = el('i','fa-solid fa-chevron-down fx-item-act' + (idx === stack.length - 1 ? ' fx-item-disabled' : '')); down.title = t('fx_move_down')
      down.addEventListener('click', () => { if (idx < stack.length - 1) { [stack[idx], stack[idx+1]] = [stack[idx+1], stack[idx]]; renderStack(); scheduleRender() } })
      const del = el('i','fa-solid fa-trash fx-item-act fx-item-del'); del.title = t('fx_remove')
      del.addEventListener('click', () => { stack.splice(idx,1); renderStack(); scheduleRender() })
      head.append(nameSpan, up, down, del)
      const bdy = el('div','fx-item-body')
      def.params.forEach(pm => {
        const f = el('div','fx-field')
        const lbl = el('label'); lbl.textContent = pmLabel(pm)
        if (pm.type === 'range') {
          const row = el('div','fx-row')
          const inp = el('input'); inp.type='range'; inp.min=pm.min; inp.max=pm.max; inp.step=pm.step; inp.value=item.params[pm.id]??pm.def; inp.style.flex='1'
          const val = el('span','fx-val'); val.textContent = Number(inp.value).toFixed(pm.step < 1 ? 2 : 0)
          inp.addEventListener('input', () => { item.params[pm.id] = parseFloat(inp.value); val.textContent = Number(inp.value).toFixed(pm.step<1?2:0); scheduleRender() })
          row.append(inp,val); f.append(lbl,row)
        } else if (pm.type === 'color') {
          const inp = el('input'); inp.type='color'; inp.value = item.params[pm.id]??pm.def
          inp.addEventListener('input', () => { item.params[pm.id] = inp.value; scheduleRender() })
          f.append(lbl,inp)
        }
        bdy.appendChild(f)
      })
      card.append(head,bdy); stackEl.appendChild(card)
    })
  }

  // ── Popup ──────────────────────────────────────────────────────────────────
  function showPopup(anchor, items) {
    document.getElementById('fx-pop')?.remove()
    const pop = el('div','fx-pop'); pop.id = 'fx-pop'
    items.forEach(item => {
      if (item.sep)  { pop.appendChild(el('div','fx-pop-sep')); return }
      if (item.head) { const h=el('div','fx-pop-head'); h.textContent=item.head; pop.appendChild(h); return }
      const row = el('div','fx-pop-item'); row.innerHTML = item.label
      row.addEventListener('click', () => { pop.remove(); item.action?.() })
      pop.appendChild(row)
    })
    const r = anchor.getBoundingClientRect()
    pop.style.left = Math.min(r.left, window.innerWidth-200) + 'px'
    pop.style.top  = (r.bottom+4) + 'px'
    document.body.appendChild(pop)
    // Flip above the anchor (or clamp) if there isn't room below for it.
    const pr = pop.getBoundingClientRect()
    if (pr.bottom > window.innerHeight - 8) {
      const above = r.top - 4 - pr.height
      pop.style.top = (above >= 4 ? above : Math.max(4, window.innerHeight - pr.height - 8)) + 'px'
    }
    setTimeout(() => document.addEventListener('click', () => pop.remove(), {once:true}), 0)
  }

  // ── Add effect ─────────────────────────────────────────────────────────────
  body.querySelector('#fx-add').addEventListener('click', e => {
    const mkItem = ([type,def]) => ({
      label: `<i class="fa-solid ${def.icon}" style="margin-right:8px;width:12px;text-align:center;opacity:.7"></i>${fxName(def)}`,
      action() { stack.push({type, params:defaultParams(def)}); renderStack(); scheduleRender() }
    })
    showPopup(e.currentTarget, Object.entries(FX).map(mkItem))
  })

  // ── Presets ────────────────────────────────────────────────────────────────
  body.querySelector('#fx-presets').addEventListener('click', e => {
    const userPresets = loadUserPresets()
    const items = [{head:t('fx_builtin')}, ...BUILTIN.map(pr => ({label:pr.name, action(){applyPreset(pr)}}))]
    if (userPresets.length) {
      items.push({sep:true},{head:t('fx_user')})
      userPresets.forEach(pr => items.push({label:pr.name, action(){applyPreset(pr)}}))
    }
    showPopup(e.currentTarget, items)
  })

  function applyPreset(pr) {
    stack = pr.effects
      .filter(item => resolveFX(item.type))
      .map(item => ({type:item.type, params:{...defaultParams(resolveFX(item.type)), ...item.params}}))
    renderStack(); scheduleRender()
  }

  // ── Save preset ────────────────────────────────────────────────────────────
  body.querySelector('#fx-save').addEventListener('click', async () => {
    if (!stack.length) return
    const name = await promptName('', {title:t('fx_preset_name')}); if (!name) return
    const arr = loadUserPresets()
    arr.push({name, effects:stack.map(i => ({type:i.type, params:{...i.params}}))})
    saveUserPresets(arr)
    window.toast?.(t('fx_save') + ': ' + name, 'success')
  })

  // ── Import preset JSON ─────────────────────────────────────────────────────
  const impFile = body.querySelector('#fx-imp-file')
  body.querySelector('#fx-imp').addEventListener('click', () => impFile.click())
  impFile.addEventListener('change', () => {
    const f = impFile.files[0]; if (!f) return
    const r = new FileReader()
    r.onload = () => {
      try {
        const data = JSON.parse(r.result)
        const presets = Array.isArray(data) ? data : [data]
        const arr = loadUserPresets()
        presets.forEach(pr => { if (pr.name && Array.isArray(pr.effects)) arr.push(pr) })
        saveUserPresets(arr)
        window.toast?.(t('fx_imported'), 'success')
      } catch { window.toast?.(t('theme_invalid_json'), 'error') }
    }
    r.readAsText(f); impFile.value = ''
  })

  // ── Reset ──────────────────────────────────────────────────────────────────
  body.querySelector('#fx-reset').addEventListener('click', () => {
    stack = []; renderStack(); if (srcImg) scheduleRender()
  })

  // ── Export to library ──────────────────────────────────────────────────────
  body.querySelector('#fx-export').addEventListener('click', async () => {
    if (!window.__TAURI__) return
    const root = libRoot(); if (!root) { window.toast?.(t('vc_no_lib'), 'error'); return }
    const name = await promptName('export', {title:t('fx_export')}); if (!name) return
    const sep = root.includes('\\') ? '\\' : '/'
    const b64 = canvas.toDataURL('image/png').split(',')[1]
    try {
      await window.__TAURI__.core.invoke('save_binary_file', {path:root+sep+'Images'+sep+name+'.png', base64:b64})
      window.dispatchEvent(new CustomEvent('iceample-library-changed', {detail:{folder:root+sep+'Images'}}))
      window.toast?.(t('fx_export') + ': ' + name + '.png', 'success')
    } catch { window.toast?.(t('ie_export_fail'), 'error') }
  })

  // ── Open file ──────────────────────────────────────────────────────────────
  const fileInp = body.querySelector('#fx-file')
  body.querySelector('#fx-open').addEventListener('click', () => fileInp.click())
  fileInp.addEventListener('change', () => {
    const f = fileInp.files[0]; if (!f) return
    const r = new FileReader()
    r.onload = () => { const img = new Image(); img.onload = () => showImage(img); img.src = r.result }
    r.readAsDataURL(f); fileInp.value = ''
  })

  // ── Library ────────────────────────────────────────────────────────────────
  body.querySelector('#fx-lib').addEventListener('click', openLibrary)
  async function openLibrary() {
    if (!window.__TAURI__) return
    const root = libRoot(); if (!root) { window.toast?.(t('vc_no_lib'), 'error'); return }
    const sep = root.includes('\\') ? '\\' : '/'
    const {invoke} = window.__TAURI__.core
    let items = []
    for (const folder of ['Images','Modifiés','Importés']) {
      try { items = items.concat((await invoke('list_folder_contents',{path:root+sep+folder})) || []) } catch {}
    }
    items = items.filter(f => !f.is_dir && /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name))
    const ov = el('div','fx-lib-ov')
    const bar = el('div'); bar.style.cssText='display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--win-border-in)'
    const title = el('span'); title.style.cssText='flex:1;font-size:12px;font-weight:600'; title.textContent = t('fx_library')
    const cls = el('button','fx-btn'); cls.innerHTML='<i class="fa-solid fa-xmark"></i>'; cls.addEventListener('click',()=>ov.remove())
    bar.append(title,cls)
    const grid = el('div','fx-lib-grid')
    items.forEach(f => {
      const it = el('div','fx-lib-item')
      const img = el('img'); const span = el('span'); span.textContent = f.name
      it.append(img,span)
      const mime = /\.png$/i.test(f.name)?'image/png':/\.webp$/i.test(f.name)?'image/webp':/\.gif$/i.test(f.name)?'image/gif':'image/jpeg'
      ;(async()=>{ try { const b64=await invoke('read_file_base64',{path:f.path}); img.src='data:'+mime+';base64,'+b64 } catch {} })()
      it.addEventListener('click', ()=>{
        if (!img.src || img.src===window.location.href) return
        ov.remove(); const i=new Image(); i.onload=()=>showImage(i); i.src=img.src
      })
      grid.appendChild(it)
    })
    ov.append(bar,grid); preview.appendChild(ov)
  }

  // ── Drag-drop ──────────────────────────────────────────────────────────────
  let dragCtr = 0
  const showDrop = () => { if (!preview.querySelector('.fx-drop-ov')) { const d=el('div','fx-drop-ov'); d.innerHTML='<i class="fa-solid fa-image"></i>'; preview.appendChild(d) } }
  const hideDrop = () => { dragCtr=0; preview.querySelector('.fx-drop-ov')?.remove() }
  preview.addEventListener('dragenter', e=>{ if (!e.dataTransfer?.types.includes('Files')) return; e.preventDefault(); dragCtr++; showDrop() })
  preview.addEventListener('dragleave', ()=>{ dragCtr=Math.max(0,dragCtr-1); if (!dragCtr) preview.querySelector('.fx-drop-ov')?.remove() })
  preview.addEventListener('dragover',  e=>e.preventDefault())
  preview.addEventListener('drop', e=>{
    e.preventDefault(); hideDrop()
    const f=e.dataTransfer?.files?.[0]; if (!f||!f.type.startsWith('image/')) return
    const r=new FileReader(); r.onload=()=>{const i=new Image();i.onload=()=>showImage(i);i.src=r.result}; r.readAsDataURL(f)
  })
  // onDragDropEvent is webview-GLOBAL: its unlisten must be called at teardown,
  // or every open of this tool leaves another listener holding a dead body.
  let dead = false
  let dropUnlisten = null
  if (window.__TAURI__) {
    ;(async()=>{
      try {
        const wv = window.__TAURI__.webview?.getCurrentWebview?.()
        if (!wv?.onDragDropEvent) return
        dropUnlisten = await wv.onDragDropEvent(e=>{
          if (!document.contains(body)) return
          const {type,paths} = e.payload||{}
          if (type==='drop' && paths?.length) {
            const path=paths[0], ext=(path.split('.').pop()||'').toLowerCase()
            if (!['png','jpg','jpeg','webp','gif','bmp'].includes(ext)) return
            ;(async()=>{
              const b64 = await window.__TAURI__.core.invoke('read_file_base64',{path})
              const mime = ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='gif'?'image/gif':ext==='bmp'?'image/bmp':'image/jpeg'
              const img=new Image(); img.onload=()=>showImage(img); img.src='data:'+mime+';base64,'+b64
            })()
          }
        })
        if (dead) { dropUnlisten?.(); dropUnlisten = null }   // closed while awaiting
      } catch {}
    })()
  }

  // ── Library drop (drag from the library tool) ──────────────────────────────
  body.addEventListener('iceample-drop', async e => {
    const file = e.detail?.file
    if (!file || !window.__TAURI__) return
    const ext = (file.name.split('.').pop()||'').toLowerCase()
    if (!['png','jpg','jpeg','webp','gif','bmp'].includes(ext)) return
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', {path:file.path})
      const mime = ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='gif'?'image/gif':ext==='bmp'?'image/bmp':'image/jpeg'
      const img = new Image(); img.onload = () => showImage(img); img.src = 'data:'+mime+';base64,'+b64
    } catch {}
  })

  // ── Project registry (source image + effect stack + local marker) ──────────
  registerTool('effects', {
    el: body,
    rev: () => stateRev,
    getState: async () => ({
      src: srcImg ? await toDataURLAsync(srcImg) : null,
      stack: stack.map(i => ({ type: i.type, params: { ...i.params } })),
      local: { ...local },
    }),
    setState: (state) => {
      if (!state) return
      if (Array.isArray(state.stack)) {
        stack = state.stack
          .filter(item => item && resolveFX(item.type))
          .map(item => ({ type: item.type, params: { ...defaultParams(resolveFX(item.type)), ...item.params } }))
      }
      if (state.local) Object.assign(local, state.local)
      renderStack(); syncLocalUI()
      if (state.src) {
        const i = new Image()
        i.onload = () => { showImage(i); positionPin() }
        i.src = state.src
      } else scheduleRender()
    },
  })

  // ── Teardown ──────────────────────────────────────────────────────────────
  const cleanObs = new MutationObserver(() => {
    if (document.contains(body)) return
    dead = true
    dropUnlisten?.(); dropUnlisten = null
    pinRo?.disconnect()
    cleanObs.disconnect()
  })
  cleanObs.observe(document.body, { childList: true, subtree: true })

  renderStack()
}
