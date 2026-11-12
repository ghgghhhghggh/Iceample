// gpu-fx.js — Shared WebGL render helper (three.js + postprocessing) for the
// Effects tool's GPU-backed effects. Loaded lazily (only when one actually
// runs) via the same dynamic-import pattern tool3d.js uses for three.js, so
// nothing pays for a WebGL context up front. One renderer/composer is reused
// across every call, app-wide; calls are queued so two renders at the same
// moment can't corrupt each other's in-flight frame.

let gpuCtxPromise = null
async function getGPUContext(w, h) {
  if (!gpuCtxPromise) {
    gpuCtxPromise = (async () => {
      const THREE = await import('./vendor/three.module.js')
      const PP = await import('./vendor/postprocessing.esm.js')
      const canvas = document.createElement('canvas')
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true })
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      const texture = new THREE.CanvasTexture(document.createElement('canvas'))
      texture.colorSpace = THREE.SRGBColorSpace
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: texture, transparent: true }))
      scene.add(plane)
      const composer = new PP.EffectComposer(renderer)
      composer.addPass(new PP.RenderPass(scene, camera))
      return { THREE, PP, renderer, composer, camera, texture }
    })()
  }
  const g = await gpuCtxPromise
  if (g.renderer.domElement.width !== w || g.renderer.domElement.height !== h) {
    g.renderer.setSize(w, h, false)
    g.composer.setSize(w, h)
  }
  return g
}

let gpuQueue = Promise.resolve()
// `buildEffect(THREE, PP)` returns the one Effect instance for this render.
export function renderGPUEffect(srcCanvas, buildEffect) {
  const result = gpuQueue.then(() => renderGPUEffectNow(srcCanvas, buildEffect))
  gpuQueue = result.then(() => {}, () => {})   // keep the chain alive even after a failed render
  return result
}
async function renderGPUEffectNow(srcCanvas, buildEffect) {
  const g = await getGPUContext(srcCanvas.width, srcCanvas.height)
  g.texture.image = srcCanvas
  g.texture.needsUpdate = true
  while (g.composer.passes.length > 1) g.composer.removePass(g.composer.passes[g.composer.passes.length - 1])
  g.composer.addPass(new g.PP.EffectPass(g.camera, buildEffect(g.THREE, g.PP)))
  g.composer.render()
  return g.renderer.domElement
}
