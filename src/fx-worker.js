// fx-worker.js — Classic worker (no ES modules): runs the heavy per-pixel
// effects (oil, edge, emboss, sharpen) off the main thread so large images
// don't freeze the UI. Loaded via new Worker('fx-worker.js'), resolved against
// the document root (src/ is the web root, like href="styles.css").
// Protocol: receives {id, fx, w, h, buf, params} where buf is a transferred
// ArrayBuffer of RGBA pixels; posts back {id, buf} (transferred) or {id, error}.
// The pixel loops are ported verbatim from effects.js — keep them in sync.

function oilFx(sd, w, h, p) {
  const r=Math.max(1,Math.round(p.radius)), lv=Math.max(2,Math.round(p.levels))
  const od=new Uint8ClampedArray(w*h*4)
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
  return od
}

function edgeFx(sd, w, h, p) {
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
  return out
}

function embossFx(d, w, h, p) {
  const s=p.strength
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
  return d
}

// Separable box blur, radius 1 (3-tap average, edges clamped) on RGB only.
// Stand-in for ctx.filter='blur(1px)' which is unavailable in a worker;
// visually equivalent for the unsharp-mask pre-pass.
function boxBlurRGB(sd, w, h) {
  const tmp=new Float32Array(w*h*3), out=new Float32Array(w*h*3)
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const x0=Math.max(0,x-1), x1=Math.min(w-1,x+1)
    const i=(y*w+x)*3
    const a=(y*w+x0)*4, b=(y*w+x)*4, c=(y*w+x1)*4
    tmp[i]  =(sd[a]  +sd[b]  +sd[c]  )/3
    tmp[i+1]=(sd[a+1]+sd[b+1]+sd[c+1])/3
    tmp[i+2]=(sd[a+2]+sd[b+2]+sd[c+2])/3
  }
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const y0=Math.max(0,y-1), y1=Math.min(h-1,y+1)
    const i=(y*w+x)*3
    const a=(y0*w+x)*3, b=(y*w+x)*3, c=(y1*w+x)*3
    out[i]  =(tmp[a]  +tmp[b]  +tmp[c]  )/3
    out[i+1]=(tmp[a+1]+tmp[b+1]+tmp[c+1])/3
    out[i+2]=(tmp[a+2]+tmp[b+2]+tmp[c+2])/3
  }
  return out
}

function sharpenFx(d, w, h, p) {
  const bd=boxBlurRGB(d, w, h)
  const a=p.amount/100
  for (let i=0,j=0;i<d.length;i+=4,j+=3) {
    d[i]  =Math.min(255,Math.max(0,d[i]  +a*(d[i]  -bd[j])))
    d[i+1]=Math.min(255,Math.max(0,d[i+1]+a*(d[i+1]-bd[j+1])))
    d[i+2]=Math.min(255,Math.max(0,d[i+2]+a*(d[i+2]-bd[j+2])))
  }
  return d
}

self.onmessage = e => {
  const { id, fx, w, h, buf, params } = e.data
  try {
    const data = new Uint8ClampedArray(buf)
    let out
    if (fx === 'oil') out = oilFx(data, w, h, params)
    else if (fx === 'edge') out = edgeFx(data, w, h, params)
    else if (fx === 'emboss') out = embossFx(data, w, h, params)
    else if (fx === 'sharpen') out = sharpenFx(data, w, h, params)
    else throw new Error('unknown fx: ' + fx)
    self.postMessage({ id, buf: out.buffer }, [out.buffer])
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) })
  }
}
