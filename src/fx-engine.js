// fx-engine.js — The image effects engine, shared by the Effects tool and the
// image editor (effects on a layer or a selection).
// Each effect is { key, icon, params:[…], apply(ctx, src, params) }: it draws
// `src` transformed into `ctx` (same size), through Canvas 2D, a WebGL pass
// (gpu-fx.js) or the fx worker. A stack [{ type, params, enabled }] runs in
// order with runPipeline().
import { t } from './i18n.js'
import { renderGPUEffect } from './gpu-fx.js'

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r:0, g:0, b:0 }
}

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
export const FX = {
  blur: {
    key: 'fx_blur', icon: 'fa-wind',
    params: [{ id:'radius', key:'fx_radius', type:'range', min:0, max:50, step:0.5, def:5, px:0 }],
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
    params: [{ id:'offset', key:'fx_offset', type:'range', min:0, max:30, step:0.5, def:6, px:0 }],
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
    params: [{ id:'level', key:'fx_size', type:'range', min:1, max:60, step:1, def:12, px:1 }],
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
  grayscale: {
    key: 'fx_grayscale', icon: 'fa-tv',
    params: [{ id:'amount', key:'fx_amount', type:'range', min:0, max:100, step:1, def:100 }],
    apply(ctx, src, p) { ctx.filter=`grayscale(${p.amount}%)`; ctx.drawImage(src,0,0); ctx.filter='none' }
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
    params: [{ id:'strength', key:'fx_strength', type:'range', min:0.5, max:5, step:0.1, def:1.5 }],
    apply(ctx, src, p) { return applyViaWorker('emboss', ctx, src, p, embossSync) }
  },
  edge: {
    key: 'fx_edge', icon: 'fa-vector-square',
    params: [{ id:'threshold', key:'fx_threshold', type:'range', min:0, max:200, step:1, def:40 }],
    apply(ctx, src, p) { return applyViaWorker('edge', ctx, src, p, edgeSync) }
  },
  halftone: {
    key: 'fx_halftone', icon: 'fa-braille',
    params: [{ id:'size', key:'fx_size', type:'range', min:2, max:30, step:1, def:8, px:2 }],
    apply(ctx, src, p) {
      const w=src.width, h=src.height, s=Math.max(2,Math.round(p.size))
      const tmp=mk(w,h); tmp.getContext('2d').drawImage(src,0,0)
      const sd=tmp.getContext('2d').getImageData(0,0,w,h).data
      ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h)   // the paper of the print (content colour)
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
      { id:'spacing',  key:'fx_spacing',   type:'range', min:2,  max:16,  step:1,    def:4, px:1 },
      { id:'opacity',  key:'fx_opacity',   type:'range', min:0,  max:1,   step:0.05, def:0.45 }
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
      { id:'radius', key:'fx_radius', type:'range', min:1, max:6, step:1, def:2, px:1 },
      { id:'levels', key:'fx_levels', type:'range', min:2, max:20, step:1, def:8 }
    ],
    apply(ctx, src, p) { return applyViaWorker('oil', ctx, src, p, oilSync) }
  },
  tilt_shift: {
    key: 'fx_tilt_shift', icon: 'fa-camera',
    params: [
      { id:'focus', key:'fx_focus',    type:'range', min:0,  max:100, step:1,   def:50 },
      { id:'range', key:'fx_range',    type:'range', min:5,  max:80,  step:1,   def:25 },
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
    params: [{ id:'segments', key:'fx_segments', type:'range', min:2, max:16, step:1, def:6 }],
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
      { id:'freq', key:'fx_frequency', type:'range', min:1, max:60,  step:1,     def:12 }
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
    params: [{ id:'scale', key:'fx_scale', type:'range', min:4, max:80, step:1, def:24 }],
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
      { id:'scale',  key:'fx_scale',  type:'range', min:1, max:20,   step:0.5,   def:4 }
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


// Effect families, for the "Add effect" menus (any effect not listed lands in
// the last group, so a new effect is never hidden).
export const FX_GROUPS = [
  ['fx_cat_color',   ['brightness_contrast', 'saturation', 'color_balance', 'hue', 'colorize', 'grayscale', 'sepia', 'duotone', 'invert', 'threshold']],
  ['fx_cat_detail',  ['sharpen', 'blur', 'tilt_shift', 'glow', 'vignette', 'grain']],
  ['fx_cat_style',   ['emboss', 'edge', 'oil', 'halftone', 'pixelate', 'scanlines', 'chroma', 'glitch']],
  ['fx_cat_distort', ['kaleido', 'swirl', 'wave', 'bulge', 'cells', 'warp', 'mirror_h', 'mirror_v']],
]
export function fxGroups() {
  const seen = new Set(FX_GROUPS.flatMap(g => g[1]))
  const extra = Object.keys(FX).filter(k => !seen.has(k))
  return FX_GROUPS.map(([key, ids], i) => [key, ids.filter(id => FX[id]).concat(i === FX_GROUPS.length - 1 ? extra : [])])
}

// ── Built-in presets ──────────────────────────────────────────────────────────
export const BUILTIN = [
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
//
// opts.scale: the source is a reduced copy (preview) — pixel-sized parameters
// (blur radius, pixel size, dot size…) are scaled by the same factor so the
// preview looks like the full-size result. Disabled effects (enabled: false)
// are skipped.
export async function runPipeline(srcImg, stack, opts = {}) {
  const k = opts.scale || 1
  let cur = mk(srcImg.naturalWidth || srcImg.width, srcImg.naturalHeight || srcImg.height)
  cur.getContext('2d').drawImage(srcImg,0,0)
  for (const item of stack) {
    if (item.enabled === false) continue
    const def = resolveFX(item.type); if (!def) continue
    const out = mk(cur.width, cur.height)
    await def.apply(out.getContext('2d'), cur, k === 1 ? item.params : scaledParams(def, item.params, k))
    cur = out
  }
  return cur
}
export function scaledParams(def, params, k) {
  const p = { ...params }
  for (const pm of def.params || []) if ('px' in pm && typeof p[pm.id] === 'number') p[pm.id] = Math.max(pm.px, p[pm.id] * k)
  return p
}
/** A copy no larger than maxDim on its long side (the image itself if it fits). */
export function reduceForPreview(img, maxDim) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
  const k = Math.min(1, maxDim / Math.max(w, h))
  if (k >= 1) return { image: img, scale: 1 }
  const c = mk(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)))
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height)
  return { image: c, scale: k }
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
export function compositeLocal(source, effected, local) {
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

export function defaultParams(def) { const p = {}; (def?.params || []).forEach(pm => { p[pm.id] = pm.def }); return p }

export function resolveFX(type) { return FX[type] }
export function fxName(def) { return def.key ? t(def.key) : def.name }
export function pmLabel(pm) { return pm.key ? t(pm.key) : pm.label }

