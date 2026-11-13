// tool3d.js — WebGL 3D editor (three.js, vendored locally).
// Primitives registry + 3D text (rendered as a PBR plane masked to the glyph
// shape, so text can carry textures/relief just like shapes), free orbit+pan
// camera with a transform gizmo, a persistent inspector (transform / geometry /
// material), and media-bus wires (receive an image as a texture, send a shot).
// Primitive set & camera approach adapted from the user's "visuel 3d generateur".
import { t } from './i18n.js'
import { pushHistory } from './history.js'
import { showPalPicker } from './palettes.js'
import { promptName } from './rename-dialog.js'
import { createElasticSlider, asciiCanvas } from './rb-effects.js'
import { BUILTIN_PRESETS, getUserPresets, addUserPreset, deleteUserPreset, renameUserPreset } from './material-presets.js'
import { showSendMenu } from './media-bus.js'

const LS_KEY = 'iceample:tool3d'
const DEF_COLOR = '#8a8f9c'
let warnedSaveFull = false   // storage-full toast shown at most once per session

function injectStyles() {
  if (document.getElementById('t3-styles')) return
  const s = document.createElement('style')
  s.id = 't3-styles'
  s.textContent = `
.t3-body { display:flex; flex-direction:column; height:100%; background:var(--surface); }
.t3-bar { display:flex; align-items:center; gap:5px; padding:7px 9px; border-bottom:1px solid var(--win-border-in,#1e1e1e); flex-shrink:0; flex-wrap:wrap; }
.t3-btn { display:flex; align-items:center; gap:5px; height:28px; padding:0 9px; border:1px solid var(--win-border,#2a2a2a);
  background:color-mix(in srgb,var(--text-primary) 7%,var(--surface)); color:var(--text-secondary,#aaa); border-radius:6px; font-family:inherit; font-size:11px; cursor:pointer; }
.t3-btn:hover { background:color-mix(in srgb,var(--text-primary) 13%,var(--surface)); color:var(--text-primary,#fff); }
.t3-btn.on { background:color-mix(in srgb, var(--color-active,#4a9eff) 18%, transparent); color:var(--color-active,#4a9eff); border-color:var(--color-active,#4a9eff); }
.t3-btn.danger:hover { color:#ff6a6a; border-color:#7a2020; }
.t3-sel { height:28px; background:color-mix(in srgb,var(--text-primary) 7%,var(--surface)); border:1px solid var(--win-border,#2a2a2a); border-radius:6px; color:var(--text-primary,#eee); font-family:inherit; font-size:11px; padding:0 6px; }
.t3-sep { width:1px; height:20px; background:var(--win-border-in,#1e1e1e); }
.t3-view { flex:1; display:flex; min-height:0; }
.t3-canvas { flex:1; position:relative; overflow:hidden; min-width:0; }
.t3-canvas canvas { display:block; width:100%; height:100%; }
.t3-msg { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--text-secondary,#666); font-size:12px; }
.t3-insp { width:240px; flex-shrink:0; overflow-y:auto; background:color-mix(in srgb,var(--surface) 75%,#000); border-left:1px solid var(--win-border-in,#1e1e1e); padding:10px 11px; }
.t3-insp-title { font-size:12px; font-weight:700; color:var(--text-primary,#fff); margin:0 0 10px; display:flex; align-items:center; gap:7px; }
.t3-insp-title i { color:var(--color-active,#4a9eff); }
.t3-empty { color:var(--text-secondary,#5f6068); font-size:12px; text-align:center; padding:26px 8px; line-height:1.5; }
.t3-sec { margin-bottom:13px; }
.t3-sec-h { font-size:9.5px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--text-secondary,#7d7f88); margin:0 0 7px; }
.t3-field { display:flex; align-items:center; gap:7px; margin-bottom:6px; }
.t3-field > label { font-size:11px; color:var(--text-secondary,#9a9aa3); width:58px; flex-shrink:0; }
.t3-num { width:100%; min-width:0; background:color-mix(in srgb,var(--surface) 70%,#000); border:1px solid var(--win-border,#2a2a2a); border-radius:5px; color:var(--text-primary,#eee); font-family:inherit; font-size:11px; padding:4px 6px; outline:none; }
.t3-num:focus { border-color:var(--color-active,#4a9eff); }
.t3-xyz { display:flex; gap:4px; flex:1; min-width:0; }
.t3-rng { flex:1; min-width:0; }
.t3-rngval { font-size:10px; color:var(--text-secondary,#9a9aa3); width:36px; text-align:right; flex-shrink:0; font-variant-numeric:tabular-nums; }
.t3-color { width:34px; height:26px; padding:0; border:1px solid var(--win-border,#2a2a2a); border-radius:5px; background:none; cursor:pointer; flex-shrink:0; }
.t3-tinput { width:100%; box-sizing:border-box; background:color-mix(in srgb,var(--surface) 70%,#000); border:1px solid var(--win-border,#2a2a2a); border-radius:5px; color:var(--text-primary,#fff); font-family:inherit; font-size:12px; padding:6px 8px; outline:none; }
.t3-tinput:focus { border-color:var(--color-active,#4a9eff); }
.t3-chk { display:flex; align-items:center; gap:7px; cursor:pointer; font-size:11px; color:var(--text-secondary,#9a9aa3); margin-bottom:6px; }
.t3-mini { display:flex; gap:5px; margin-top:3px; }
.t3-mini .t3-btn { flex:1; justify-content:center; height:26px; padding:0 6px; font-size:10.5px; }
.t3-acts { display:flex; gap:6px; margin-top:4px; }
.t3-acts .t3-btn { flex:1; justify-content:center; }
.t3-sublab { font-size:10px; color:var(--text-secondary,#9a9aa3); margin:0 0 5px; }
.t3-chips { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:9px; }
.t3-chip { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border:1px solid var(--win-border,#2a2a2a);
  background:color-mix(in srgb,var(--text-primary) 7%,var(--surface)); color:var(--text-secondary,#bbb); border-radius:5px; font-family:inherit; font-size:10.5px; cursor:pointer; }
.t3-chip:hover { background:color-mix(in srgb,var(--text-primary) 13%,var(--surface)); color:var(--text-primary,#fff); }
.t3-chip.add { border-style:dashed; }
.t3-chip .nm { cursor:pointer; }
.t3-chip .mini { opacity:.45; font-size:9px; cursor:pointer; }
.t3-chip .mini:hover { opacity:1; }
.t3-chip .mini.x:hover { color:#ff6a6a; }
.t3-objlist { margin-bottom:12px; max-height:150px; overflow-y:auto; border:1px solid var(--win-border-in,#1e1e1e); border-radius:7px; padding:4px; }
.t3-obj { display:flex; align-items:center; gap:7px; padding:5px 7px; border-radius:5px; cursor:default; font-size:11px; color:var(--text-secondary,#9a9aa3); }
.t3-obj:hover { background:color-mix(in srgb,var(--text-primary) 8%,var(--surface)); }
.t3-obj.sel { background:color-mix(in srgb, var(--color-active,#4a9eff) 20%, transparent); color:var(--color-active,#4a9eff); }
.t3-obj > i:first-child { width:13px; text-align:center; font-size:11px; flex-shrink:0; }
.t3-obj .nm { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
.t3-obj .act { opacity:.45; cursor:pointer; font-size:11px; }
.t3-obj .act:hover { opacity:1; }
.t3-obj .act.del:hover { color:#ff6a6a; }
.t3-objempty { font-size:11px; color:var(--text-secondary,#5f6068); text-align:center; padding:12px 6px; }
.t3-hint { position:absolute; left:10px; bottom:9px; z-index:2; font-size:10px; color:var(--text-secondary,#9296a0); line-height:1.55; max-width:250px;
  display:flex; gap:7px; align-items:flex-start; cursor:pointer;
  background:rgba(0,0,0,0.42); border:1px solid var(--win-border-in,#222); border-radius:6px; padding:5px 9px; backdrop-filter:blur(3px); }
.t3-hint-i { color:var(--color-active,#4a9eff); margin-top:1px; flex-shrink:0; }
.t3-hint.collapsed .t3-hint-t { display:none; }
.t3-hint.collapsed { padding:5px 7px; }
  `
  document.head.appendChild(s)
}

export async function initTool3D(body) {
  injectStyles()
  body.classList.add('t3-body')
  body.innerHTML = `<div class="t3-canvas"><div class="t3-msg">${t('td_loading')}</div></div>`

  // Media bus: register NOW (init is async — three.js is still loading); the
  // handler is swapped in once the scene exists and any queued media applied.
  let pendingBusMedia = null
  let onBusMedia = m => { pendingBusMedia = m }
  body.addEventListener('iceample-media', e => {
    const m = e.detail
    if (m && ((m.kind === 'image' && m.dataUrl) || (m.kind === 'model' && m.path))) onBusMedia(m)
  })

  let THREE, OrbitControls, TransformControls, GLTFExporter, FontLoader, TextGeometry, RoundedBoxGeometry, mergeGeometries, GLTFLoader
  try {
    THREE = await import('./vendor/three.module.js')
    ;({ OrbitControls } = await import('./vendor/OrbitControls.js'))
    ;({ TransformControls } = await import('./vendor/TransformControls.js'))
    ;({ GLTFExporter } = await import('./vendor/GLTFExporter.js'))
    ;({ FontLoader } = await import('./vendor/FontLoader.js'))
    ;({ TextGeometry } = await import('./vendor/TextGeometry.js'))
    ;({ RoundedBoxGeometry } = await import('./vendor/RoundedBoxGeometry.js'))
    ;({ mergeGeometries } = await import('./vendor/BufferGeometryUtils.js'))
    ;({ GLTFLoader } = await import('./vendor/GLTFLoader.js'))
  } catch (e) { body.innerHTML = `<div class="t3-msg">three.js error: ${e?.message ?? e}</div>`; return }
  if (!document.contains(body)) return
  // Font for extruded 3D text (loaded once; text falls back to flat if it fails).
  let font = null
  try { font = new FontLoader().parse(await (await fetch('./vendor/helvetiker_bold.typeface.json')).json()) } catch {}

  // Primitive registry (adapted from the visuel-3d-generateur objects module).
  const S = (key, label, min, max, step, int = false) => ({ key, label, min, max, step, int })
  const GEO = {
    box: { label: t('td_cube'), flat: false, params: { width: 1, height: 1, depth: 1, round: 0, ws: 1, hs: 1, ds: 1 },
      schema: [S('width', 'W', 0.05, 20, 0.05), S('height', 'H', 0.05, 20, 0.05), S('depth', 'D', 0.05, 20, 0.05), S('round', 'Arrondi', 0, 1, 0.02), S('ws', 'Wseg', 1, 40, 1, true), S('hs', 'Hseg', 1, 40, 1, true), S('ds', 'Dseg', 1, 40, 1, true)],
      build: p => p.round > 0 ? new RoundedBoxGeometry(p.width, p.height, p.depth, 4, Math.min(p.round, Math.min(p.width, p.height, p.depth) / 2 - 0.001)) : new THREE.BoxGeometry(p.width, p.height, p.depth, p.ws, p.hs, p.ds) },
    sphere: { label: t('td_sphere'), flat: false, params: { radius: 0.7, ws: 40, hs: 24 },
      schema: [S('radius', 'R', 0.05, 20, 0.05), S('ws', 'Wseg', 3, 128, 1, true), S('hs', 'Hseg', 2, 128, 1, true)],
      build: p => new THREE.SphereGeometry(p.radius, p.ws, p.hs) },
    cylinder: { label: t('td_cylinder'), flat: false, params: { rt: 0.6, rb: 0.6, height: 1.4, rs: 40 },
      schema: [S('rt', 'Rtop', 0, 20, 0.05), S('rb', 'Rbot', 0, 20, 0.05), S('height', 'H', 0.05, 40, 0.05), S('rs', 'Seg', 3, 128, 1, true)],
      build: p => new THREE.CylinderGeometry(p.rt, p.rb, p.height, p.rs) },
    cone: { label: t('td_cone'), flat: false, params: { radius: 0.7, height: 1.4, rs: 40 },
      schema: [S('radius', 'R', 0.05, 20, 0.05), S('height', 'H', 0.05, 40, 0.05), S('rs', 'Seg', 3, 128, 1, true)],
      build: p => new THREE.ConeGeometry(p.radius, p.height, p.rs) },
    torus: { label: t('td_torus'), flat: false, params: { radius: 0.7, tube: 0.28, rs: 24, ts: 96 },
      schema: [S('radius', 'R', 0.05, 20, 0.05), S('tube', 'Tube', 0.02, 10, 0.02), S('rs', 'Rseg', 3, 128, 1, true), S('ts', 'Tseg', 3, 256, 1, true)],
      build: p => new THREE.TorusGeometry(p.radius, p.tube, p.rs, p.ts) },
    torusKnot: { label: t('td_torusknot'), flat: false, params: { radius: 0.55, tube: 0.2, ts: 140, rs: 18, p: 2, q: 3 },
      schema: [S('radius', 'R', 0.05, 20, 0.05), S('tube', 'Tube', 0.02, 10, 0.02), S('ts', 'Tseg', 3, 512, 1, true), S('rs', 'Rseg', 3, 64, 1, true), S('p', 'p', 1, 20, 1, true), S('q', 'q', 1, 20, 1, true)],
      build: p => new THREE.TorusKnotGeometry(p.radius, p.tube, p.ts, p.rs, p.p, p.q) },
    icosahedron: { label: t('td_ico'), flat: false, params: { radius: 0.85, detail: 0 },
      schema: [S('radius', 'R', 0.05, 20, 0.05), S('detail', 'Detail', 0, 5, 1, true)],
      build: p => new THREE.IcosahedronGeometry(p.radius, p.detail) },
    plane: { label: t('td_plane'), flat: true, params: { width: 1.6, height: 1, depth: 0, ws: 1, hs: 1 },
      schema: [S('width', 'W', 0.05, 40, 0.05), S('height', 'H', 0.05, 40, 0.05), S('depth', 'Vol', 0, 10, 0.02), S('ws', 'Wseg', 1, 128, 1, true), S('hs', 'Hseg', 1, 128, 1, true)],
      build: p => p.depth > 0 ? new THREE.BoxGeometry(p.width, p.height, p.depth, p.ws, p.hs, 1) : new THREE.PlaneGeometry(p.width, p.height, p.ws, p.hs) },
    ring: { label: t('td_ring'), flat: true, params: { inner: 0.4, outer: 0.85, depth: 0, ts: 48 },
      schema: [S('inner', 'Rint', 0, 20, 0.02), S('outer', 'Rext', 0.05, 20, 0.02), S('depth', 'Vol', 0, 10, 0.02), S('ts', 'Seg', 3, 128, 1, true)],
      build: p => p.depth > 0 ? extrudeRing(p) : new THREE.RingGeometry(p.inner, p.outer, p.ts) },
    capsule: { label: t('td_capsule'), flat: false, params: { radius: 0.45, length: 1, cs: 8, rs: 18 },
      schema: [S('radius', 'R', 0.05, 20, 0.05), S('length', 'L', 0, 40, 0.05), S('cs', 'Cseg', 1, 32, 1, true), S('rs', 'Rseg', 3, 64, 1, true)],
      build: p => new THREE.CapsuleGeometry(p.radius, p.length, p.cs, p.rs) },
    octahedron: { label: t('td_octa'), flat: false, params: { radius: 0.85, detail: 0 },
      schema: [S('radius', 'R', 0.05, 20, 0.05), S('detail', 'Detail', 0, 5, 1, true)],
      build: p => new THREE.OctahedronGeometry(p.radius, p.detail) },
    dodecahedron: { label: t('td_dodeca'), flat: false, params: { radius: 0.85, detail: 0 },
      schema: [S('radius', 'R', 0.05, 20, 0.05), S('detail', 'Detail', 0, 5, 1, true)],
      build: p => new THREE.DodecahedronGeometry(p.radius, p.detail) },
    tetrahedron: { label: t('td_tetra'), flat: false, params: { radius: 0.9, detail: 0 },
      schema: [S('radius', 'R', 0.05, 20, 0.05), S('detail', 'Detail', 0, 5, 1, true)],
      build: p => new THREE.TetrahedronGeometry(p.radius, p.detail) },
  }
  const primOpts = Object.entries(GEO).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')

  body.innerHTML = `
    <div class="t3-bar">
      <select class="t3-sel" id="t3-prim">${primOpts}</select>
      <button class="t3-btn" id="t3-add"><i class="fa-solid fa-plus"></i> ${t('td_add')}</button>
      <button class="t3-btn" id="t3-text"><i class="fa-solid fa-font"></i> ${t('td_text')}</button>
      <span class="t3-sep"></span>
      <button class="t3-btn on" id="t3-move" title="${t('td_move')} (1)"><i class="fa-solid fa-up-down-left-right"></i></button>
      <button class="t3-btn" id="t3-rotate" title="${t('td_rotate')} (2)"><i class="fa-solid fa-rotate"></i></button>
      <button class="t3-btn" id="t3-scale" title="${t('td_scale')} (3)"><i class="fa-solid fa-maximize"></i></button>
      <button class="t3-btn" id="t3-snap" title="${t('td_snap')}"><i class="fa-solid fa-magnet"></i></button>
      <button class="t3-btn" id="t3-space" title="${t('td_space')}"><i class="fa-solid fa-globe"></i></button>
      <button class="t3-btn" id="t3-spin" title="${t('td_autorotate')}"><i class="fa-solid fa-arrows-spin"></i></button>
      <span class="t3-sep"></span>
      <button class="t3-btn" id="t3-reset" title="${t('td_reset')}"><i class="fa-solid fa-arrows-rotate"></i></button>
      <button class="t3-btn" id="t3-import" title="${t('td_import')}"><i class="fa-solid fa-file-import"></i></button>
      <button class="t3-btn" id="t3-export"><i class="fa-solid fa-camera"></i> ${t('td_export_view')}</button>
      <button class="t3-btn" id="t3-exportpng" title="${t('td_export_png')} (2×)"><i class="fa-solid fa-file-image"></i> PNG</button>
      <button class="t3-btn" id="t3-send" title="${t('send_to')}"><i class="fa-solid fa-share-nodes"></i></button>
      <input type="file" id="t3-file" accept="image/*" hidden />
      <input type="file" id="t3-importfile" accept=".glb,.gltf,model/gltf-binary" hidden />
    </div>
    <div class="t3-view">
      <div class="t3-canvas" id="t3-canvas"></div>
      <div class="t3-insp" id="t3-insp"></div>
    </div>`
  const canvasBox = body.querySelector('#t3-canvas')
  const insp = body.querySelector('#t3-insp')

  // ── Scene ─────────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  canvasBox.appendChild(renderer.domElement)
  const hint = document.createElement('div'); hint.className = 't3-hint'
  hint.innerHTML = `<i class="fa-solid fa-circle-info t3-hint-i"></i><span class="t3-hint-t">${t('td_nav_hint')}</span>`
  if (localStorage.getItem('iceample:tool3d:hint') === 'off') hint.classList.add('collapsed')
  hint.addEventListener('click', () => { const c = hint.classList.toggle('collapsed'); try { localStorage.setItem('iceample:tool3d:hint', c ? 'off' : 'on') } catch {} })
  canvasBox.appendChild(hint)
  const scene = new THREE.Scene()
  const themeBg = getComputedStyle(document.documentElement).getPropertyValue('--workbench-bg').trim() || '#0b0c11'
  scene.background = new THREE.Color(themeBg)
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200); camera.position.set(3, 2.4, 4)
  // Procedural studio environment (soft vertical gradient + softbox strips) so
  // metallic materials (chrome / gold) reflect something instead of going black.
  const envCv = document.createElement('canvas'); envCv.width = 256; envCv.height = 128
  const ex = envCv.getContext('2d'), eg = ex.createLinearGradient(0, 0, 0, 128)
  eg.addColorStop(0, '#e8ecf2'); eg.addColorStop(0.45, '#4a5060'); eg.addColorStop(1, '#101218')
  ex.fillStyle = eg; ex.fillRect(0, 0, 256, 128)
  ex.fillStyle = '#ffffff'; ex.fillRect(18, 16, 74, 13); ex.fillRect(150, 22, 84, 11); ex.fillRect(96, 46, 58, 8)
  const envTex = new THREE.CanvasTexture(envCv)
  envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.colorSpace = THREE.SRGBColorSpace
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envRT = pmrem.fromEquirectangular(envTex)
  scene.environment = envRT.texture
  envTex.dispose(); pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202838, 0.78))
  const dir = new THREE.DirectionalLight(0xffffff, 1.25); dir.position.set(4, 6, 3)
  dir.castShadow = true; dir.shadow.mapSize.set(1024, 1024)
  dir.shadow.camera.left = -8; dir.shadow.camera.right = 8; dir.shadow.camera.top = 8; dir.shadow.camera.bottom = -8
  dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 30; dir.shadow.camera.updateProjectionMatrix()
  scene.add(dir)
  scene.add(new THREE.AmbientLight(0xffffff, 0.22))
  const grid = new THREE.GridHelper(20, 20, 0x3a3a48, 0x1c1c26); grid.position.y = -0.6; scene.add(grid)
  // Shadow catcher — not in `objects`, so never picked / saved / exported.
  const shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.28 }))
  shadowGround.rotation.x = -Math.PI / 2; shadowGround.position.y = -0.6; shadowGround.receiveShadow = true
  scene.add(shadowGround)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true; orbit.dampingFactor = 0.08
  orbit.enablePan = true; orbit.screenSpacePanning = true   // right-drag = pan (free move)
  orbit.zoomToCursor = true; orbit.panSpeed = 1.0; orbit.rotateSpeed = 0.95; orbit.zoomSpeed = 1.1
  // Full mouse navigation: left = orbit, right OR middle = pan, wheel = zoom-to-cursor.
  orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }
  orbit.target.set(0, 0.2, 0)
  const tc = new TransformControls(camera, renderer.domElement); scene.add(tc)
  // Gizmo drags: snapshot the transform on drag start, push an undo/redo entry
  // on drag end when something actually moved.
  let dragSnap = null
  const snapXform = m => ({ pos: m.position.toArray(), rot: [m.rotation.x, m.rotation.y, m.rotation.z], scl: m.scale.toArray() })
  tc.addEventListener('dragging-changed', e => {
    orbit.enabled = !e.value
    const m = tc.object
    if (e.value) { dragSnap = m ? { uid: m.userData.uid, ...snapXform(m) } : null; return }
    if (!dragSnap || !m || m.userData.uid !== dragSnap.uid) { dragSnap = null; return }
    const before = dragSnap, after = snapXform(m); dragSnap = null
    const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9)
    if (same(before.pos, after.pos) && same(before.rot, after.rot) && same(before.scl, after.scl)) return
    const uid = before.uid
    const apply = st => {
      if (!live()) return
      const mm = findByUid(uid); if (!mm) return
      mm.position.fromArray(st.pos); mm.rotation.fromArray(st.rot); mm.scale.fromArray(st.scl)
      syncTransform(); saveSoon()
    }
    pushHistory('3d transform', () => apply(before), () => apply(after))
  })
  tc.addEventListener('objectChange', () => { saveSoon(); syncTransform() })

  const objects = []
  let sel = null
  // Session-only ids so history entries can re-find an object across
  // delete/re-create cycles (never persisted); live() bails once the tool
  // window has been closed (the scene is disposed then).
  let uidSeq = 1
  const findByUid = uid => objects.find(o => o.mesh.userData.uid === uid)?.mesh
  const live = () => document.contains(body)
  const rc = new THREE.Raycaster(), ptr = new THREE.Vector2()
  const DEG = 180 / Math.PI
  const tex = url => { const x = new THREE.TextureLoader().load(url); x.colorSpace = THREE.SRGBColorSpace; x.wrapS = x.wrapT = THREE.RepeatWrapping; return x }
  const ntex = url => { const x = new THREE.TextureLoader().load(url); x.wrapS = x.wrapT = THREE.RepeatWrapping; return x }

  // Glyph mask: white text on black (used as material.alphaMap → letters cut out).
  function textMask(text) {
    const c = document.createElement('canvas'), x = c.getContext('2d')
    const font = '900 140px Segoe UI, system-ui, sans-serif'; x.font = font
    c.width = Math.max(64, Math.ceil(x.measureText(text || ' ').width) + 60); c.height = 220
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height)
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'
    x.fillText(text || ' ', c.width / 2, c.height / 2)
    return c
  }
  function removeOutlineShell(m) {
    const old = m.children.find(c => c.userData.isOutlineShell)
    if (old) { old.material?.dispose?.(); m.remove(old) }
  }
  function gradientCanvas(c1, c2, angle = 45) {
    const s = 512, c = document.createElement('canvas'); c.width = c.height = s
    const x = c.getContext('2d'), a = angle * Math.PI / 180
    const g = x.createLinearGradient(0, 0, Math.cos(a) * s, Math.sin(a) * s)
    g.addColorStop(0, c1); g.addColorStop(1, c2)
    x.fillStyle = g; x.fillRect(0, 0, s, s); return c
  }
  // ── Built-in procedural textures (no external files needed) ─────────────────
  const hexRgb = h => { const n = parseInt((h || '#888888').replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
  const lerp = (a, b, t) => Math.round(a + (b - a) * t)
  function drawBricks(x, s, brick, mortar) {
    x.fillStyle = mortar; x.fillRect(0, 0, s, s)
    const rows = 8, bh = s / rows, cols = 6, bw = s / cols, gap = s * 0.012
    x.fillStyle = brick
    for (let r = 0; r < rows; r++) { const off = (r % 2) ? bw / 2 : 0; for (let c = -1; c <= cols; c++) x.fillRect(c * bw + off + gap, r * bh + gap, bw - gap * 2, bh - gap * 2) }
  }
  function drawWood(x, s, c1, c2) {
    const A = hexRgb(c1), B = hexRgb(c2), img = x.createImageData(s, s)
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
      const v = 0.5 + 0.5 * Math.sin(xx * 0.06 + Math.sin(yy * 0.018) * 2.4 + Math.sin(xx * 0.4) * 0.5)
      const i = (yy * s + xx) * 4; img.data[i] = lerp(A[0], B[0], v); img.data[i + 1] = lerp(A[1], B[1], v); img.data[i + 2] = lerp(A[2], B[2], v); img.data[i + 3] = 255
    }
    x.putImageData(img, 0, 0)
  }
  function drawNoise(x, s, c1, c2) {
    const A = hexRgb(c1), B = hexRgb(c2), cell = 4
    for (let yy = 0; yy < s; yy += cell) for (let xx = 0; xx < s; xx += cell) { const v = Math.random(); x.fillStyle = `rgb(${lerp(A[0], B[0], v)},${lerp(A[1], B[1], v)},${lerp(A[2], B[2], v)})`; x.fillRect(xx, yy, cell, cell) }
  }
  function patternCanvas(kind, c1, c2, m) {
    const s = 512, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d')
    x.fillStyle = c1; x.fillRect(0, 0, s, s); x.fillStyle = c2
    if (kind === 'checker') { const n = 8, t = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) & 1) x.fillRect(i * t, j * t, t, t) }
    else if (kind === 'stripes') { const n = 12, t = s / n; for (let i = 0; i < n; i += 2) x.fillRect(i * t, 0, t, s) }
    else if (kind === 'dots') { const n = 8, t = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.beginPath(); x.arc(i * t + t / 2, j * t + t / 2, t * 0.3, 0, 6.2832); x.fill() } }
    else if (kind === 'bricks') drawBricks(x, s, c1, c2)
    else if (kind === 'wood') drawWood(x, s, c1, c2)
    else if (kind === 'noise') drawNoise(x, s, c1, c2)
    else if (kind === 'ascii') { const word = (m && m.userData.text) ? m.userData.text : 'ICEAMPLE'; x.drawImage(asciiCanvas(word || ' ', c2), 0, 0, s, s) }
    return c
  }
  // Derive a normal map (relief) from a texture's luminance — procedural emboss.
  function heightToNormal(src) {
    const w = src.width, h = src.height
    const sc = document.createElement('canvas'); sc.width = w; sc.height = h; const sx = sc.getContext('2d'); sx.drawImage(src, 0, 0)
    const d = sx.getImageData(0, 0, w, h).data
    const out = document.createElement('canvas'); out.width = w; out.height = h; const ox = out.getContext('2d'); const od = ox.createImageData(w, h)
    const lum = (x, y) => { x = (x + w) % w; y = (y + h) % h; const i = (y * w + x) * 4; return (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255 }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (lum(x - 1, y) - lum(x + 1, y)) * 2.5, dy = (lum(x, y - 1) - lum(x, y + 1)) * 2.5, nz = 1, len = Math.hypot(dx, dy, nz), i = (y * w + x) * 4
      od.data[i] = (dx / len * 0.5 + 0.5) * 255; od.data[i + 1] = (dy / len * 0.5 + 0.5) * 255; od.data[i + 2] = (nz / len * 0.5 + 0.5) * 255; od.data[i + 3] = 255
    }
    ox.putImageData(od, 0, 0); return out
  }
  const PROC = ['gradient', 'checker', 'stripes', 'dots', 'bricks', 'wood', 'noise', 'ascii']
  // Apply the chosen fill (solid / gradient / built-in pattern / image asset) +
  // optional procedural relief, onto material.map / .normalMap / .color.
  function applyFill(m) {
    const mat = m.material, ud = m.userData, k = ud.mapKind
    // 'outline' was removed — fall through to solid color
    if (k === 'outline') { ud.mapKind = 'none' }
    if (mat.map) { mat.map.dispose?.(); mat.map = null }
    if (k === 'image' && ud.imgSrc) { mat.map = tex(ud.imgSrc); mat.color.set('#ffffff') }
    else if (PROC.includes(k)) {
      const cv = k === 'gradient' ? gradientCanvas(ud.baseColor || '#ffffff', ud.grad?.c2 || '#ffffff', ud.grad?.angle ?? 45) : patternCanvas(k, ud.baseColor || '#888888', ud.grad?.c2 || '#ffffff', m)
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping
      mat.map = tx; mat.color.set('#ffffff')
    } else mat.color.set(ud.baseColor || '#ffffff')
    setNormal(m); mat.needsUpdate = true
  }
  // Relief: procedural normal from the pattern, or an external normal-map file.
  function setNormal(m) {
    const mat = m.material, ud = m.userData
    if (mat.normalMap) { mat.normalMap.dispose?.(); mat.normalMap = null }
    if (ud.relief && PROC.includes(ud.mapKind) && ud.mapKind !== 'gradient' && mat.map?.image) {
      const n = new THREE.CanvasTexture(heightToNormal(mat.map.image)); n.wrapS = n.wrapT = THREE.RepeatWrapping; mat.normalMap = n
    } else if (ud.nmapSrc) mat.normalMap = ntex(ud.nmapSrc)
    mat.needsUpdate = true
  }
  // Emissive glow (neon).
  function setEmissive(m) {
    const mat = m.material, ud = m.userData
    if (!mat.emissive) return
    mat.emissive.set(ud.emissive || '#000000'); mat.emissiveIntensity = ud.emissive ? (ud.emissiveInt ?? 1) : 1
    mat.needsUpdate = true
  }

  // ── Material presets (built-in + user-created; shared module) ───────────────
  function applyPreset(m, p) {
    if (!p) return
    const mat = m.material, ud = m.userData
    if (p.roughness != null) mat.roughness = p.roughness
    if (p.metalness != null) mat.metalness = p.metalness
    if (p.opacity != null) { mat.opacity = p.opacity; mat.transparent = p.opacity < 1 || m.userData.type === 'text'; mat.depthWrite = p.opacity >= 1; mat.needsUpdate = true }
    if (p.baseColor) ud.baseColor = p.baseColor
    if (p.mapKind != null) ud.mapKind = p.mapKind
    if (p.gradC2) ud.grad.c2 = p.gradC2
    if (p.relief != null) ud.relief = p.relief
    ud.emissive = p.emissive === 'AUTO' ? (ud.baseColor || '#39ff14') : (p.emissive || null)
    ud.emissiveInt = p.emissiveInt ?? 1
    applyFill(m); setEmissive(m); saveSoon(); refreshInspector()
  }
  function captureCurrent(m, name) {
    const mat = m.material, ud = m.userData
    return { name, roughness: mat.roughness, metalness: mat.metalness, opacity: mat.opacity,
      baseColor: ud.baseColor, mapKind: ud.mapKind, gradC2: ud.grad?.c2, relief: ud.relief,
      emissive: ud.emissive || null, emissiveInt: ud.emissiveInt ?? 1 }
  }

  // Extrude a ring (annulus) outline into a washer with thickness.
  function extrudeRing(p) {
    const shape = new THREE.Shape(); shape.absarc(0, 0, Math.max(p.outer, 0.06), 0, Math.PI * 2, false)
    if (p.inner > 0) { const hole = new THREE.Path(); hole.absarc(0, 0, Math.min(p.inner, p.outer - 0.01), 0, Math.PI * 2, true); shape.holes.push(hole) }
    const g = new THREE.ExtrudeGeometry(shape, { depth: p.depth, bevelEnabled: false, curveSegments: Math.max(8, p.ts) })
    g.translate(0, 0, -p.depth / 2); return g
  }
  // Extruded 3D text geometry (centred on origin).
  function buildTextGeo(text, depth, opts = {}) {
    const bevel = opts.bevel || 0, smooth = Math.max(1, Math.round(opts.smooth || 5))
    const layers = Math.max(1, Math.round(opts.layers || 1)), gap = opts.layerGap ?? 0.15
    const base = new TextGeometry(text || ' ', { font, size: 1, height: Math.max(depth, 0.001), curveSegments: smooth,
      bevelEnabled: bevel > 0 || depth > 0.05, bevelThickness: bevel || Math.min(0.025, depth * 0.3),
      bevelSize: bevel * 0.85 || 0.02, bevelOffset: 0, bevelSegments: Math.max(2, Math.round(smooth * 0.6)) })
    base.computeBoundingBox(); const b = base.boundingBox
    base.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2)
    if (layers <= 1) return base
    // Stacked layers receding in depth (recursive-subdivision look).
    const geos = []
    for (let i = 0; i < layers; i++) { const g = base.clone(); const s = Math.pow(0.9, i); g.scale(s, s, s); g.translate(0, 0, -i * (depth + gap)); geos.push(g) }
    base.dispose()
    const merged = mergeGeometries(geos, false)
    if (merged) { geos.forEach(g => g.dispose()); return merged }
    return geos[0]
  }
  // Build text geometry + material masking based on its depth.
  function applyTextGeometry(m) {
    const text = m.userData.text, depth = m.userData.depth || 0
    m.geometry?.dispose?.()
    removeOutlineShell(m)
    if (depth > 0 && font) {
      if (m.material.alphaMap) { m.material.alphaMap.dispose(); m.material.alphaMap = null }
      m.material.alphaTest = 0
      m.geometry = buildTextGeo(text, depth, { bevel: m.userData.bevel, smooth: m.userData.smooth, layers: m.userData.layers, layerGap: m.userData.layerGap })
      if (m.userData.outlineEnabled) {
        // Inverted-hull: back-face slightly scaled = clean 3D border, no z-fight
        const shellMat = new THREE.MeshBasicMaterial({ color: m.userData.outlineColor || '#000000', side: THREE.BackSide })
        const shell = new THREE.Mesh(m.geometry, shellMat)
        shell.scale.setScalar(1 + (m.userData.outlineWidth || 14) / 100)
        shell.userData.isOutlineShell = true
        m.add(shell)
      }
    } else {
      if (m.userData.outlineEnabled) {
        // Single canvas: stroke (border color) then fill (text color) — no alphaMap needed
        const fillColor = m.userData.baseColor || '#ffffff'
        const strokeColor = m.userData.outlineColor || '#000000'
        const lw = m.userData.outlineWidth || 14
        const fontStr = '900 140px Segoe UI, system-ui, sans-serif'
        const c = document.createElement('canvas'), x = c.getContext('2d')
        x.font = fontStr
        c.width = Math.max(64, Math.ceil(x.measureText(text || ' ').width) + lw * 2 + 80)
        c.height = 230
        x.clearRect(0, 0, c.width, c.height)
        x.font = fontStr; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'
        x.lineWidth = lw * 2; x.strokeStyle = strokeColor; x.strokeText(text || ' ', c.width / 2, c.height / 2)
        x.fillStyle = fillColor; x.fillText(text || ' ', c.width / 2, c.height / 2)
        if (m.material.map) m.material.map.dispose?.()
        if (m.material.alphaMap) { m.material.alphaMap.dispose?.(); m.material.alphaMap = null }
        const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4
        m.material.map = map; m.material.color.set('#ffffff'); m.material.alphaTest = 0
        m.geometry = new THREE.PlaneGeometry(c.width / c.height, 1)
      } else {
        const cv = textMask(text)
        if (m.material.map) { m.material.map.dispose?.(); m.material.map = null }
        if (m.material.alphaMap) m.material.alphaMap.dispose()
        const am = new THREE.CanvasTexture(cv); am.anisotropy = 4
        m.material.alphaMap = am; m.material.alphaTest = 0.45
        m.geometry = new THREE.PlaneGeometry(cv.width / cv.height, 1)
      }
    }
    m.material.transparent = true; m.material.needsUpdate = true
  }
  function rebuildText(m, text) { m.userData.text = text; applyTextGeometry(m); saveSoon() }

  function addMesh(type, o = {}) {
    let mesh
    const legacy = o.color != null ? '#' + new THREE.Color(o.color).getHexString() : null
    if (type === 'text') {
      const txt = o.text || t('td_text_default')
      mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: o.roughness ?? 0.6, metalness: o.metalness ?? 0, transparent: (o.opacity ?? 1) < 1,
        opacity: o.opacity ?? 1, depthWrite: (o.opacity ?? 1) >= 1, side: THREE.DoubleSide, wireframe: !!o.wireframe,
      }))
      mesh.userData.text = txt; mesh.userData.ascii = !!o.ascii; mesh.userData.depth = o.depth || 0
      mesh.userData.bevel = o.bevel || 0; mesh.userData.smooth = o.smooth || 5
      mesh.userData.layers = o.layers || 1; mesh.userData.layerGap = o.layerGap ?? 0.15
      mesh.userData.outlineEnabled = o.outlineEnabled || false
      mesh.userData.outlineColor = o.outlineColor || '#000000'
      mesh.userData.outlineWidth = o.outlineWidth || 14
      applyTextGeometry(mesh)
    } else {
      const def = GEO[type] || GEO.box
      const params = { ...def.params, ...(o.params || {}) }
      mesh = new THREE.Mesh(def.build(params), new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: o.roughness ?? 0.7, metalness: o.metalness ?? 0,
        side: def.flat ? THREE.DoubleSide : THREE.FrontSide, transparent: (o.opacity ?? 1) < 1,
        opacity: o.opacity ?? 1, depthWrite: (o.opacity ?? 1) >= 1, wireframe: !!o.wireframe,
      }))
      mesh.userData.params = params
    }
    mesh.userData.type = type
    // Unified material state — migrate legacy 'outline' to 'none'.
    const rawKind = o.mapKind || (o.map ? 'image' : (o.ascii ? 'ascii' : 'none'))
    mesh.userData.baseColor = o.baseColor || o.textColor || legacy || (type === 'text' ? '#ffffff' : DEF_COLOR)
    mesh.userData.mapKind = rawKind === 'outline' ? 'none' : rawKind
    mesh.userData.imgSrc = o.imgSrc || o.map || null
    mesh.userData.nmapSrc = o.nmapSrc || o.nmap || null
    mesh.userData.relief = o.relief || false
    mesh.userData.emissive = o.emissive || null; mesh.userData.emissiveInt = o.emissiveInt ?? 1
    mesh.userData.grad = o.grad || { c2: '#ffffff', angle: 45 }
    applyFill(mesh); setEmissive(mesh)   // map + normal (relief/external) + glow
    mesh.castShadow = true; mesh.receiveShadow = true
    // Fresh adds (no saved pos) spawn near the orbit target on a small 3×3
    // offset grid (first at the target itself) so repeated Adds don't
    // interpenetrate; restored objects always carry o.pos and keep their place.
    const n = objects.length, OFF = [0, 1.4, -1.4]
    mesh.position.fromArray(o.pos || [orbit.target.x + OFF[n % 3], 0.2, orbit.target.z + OFF[Math.floor(n / 3) % 3]])
    if (o.rot) mesh.rotation.fromArray(o.rot)
    if (o.scl) mesh.scale.fromArray(o.scl)
    if (o.visible === false) mesh.visible = false
    mesh.userData.uid = uidSeq++
    scene.add(mesh); objects.push({ type, mesh })
    return mesh
  }
  async function addText() {
    const txt = await promptName(t('td_text_default'), { title: t('td_text') })
    const m = addMesh('text', { text: txt })
    selectMesh(m); saveSoon(); pushAddHistory(m, '3d add')
  }

  function selectMesh(m) { sel = m; tc.attach(m); refreshInspector() }
  function deselect() { sel = null; tc.detach(); refreshInspector() }
  function removeMesh(m) {
    if (!m) return
    if (tc.object === m) tc.detach()
    if (sel === m) sel = null
    scene.remove(m)
    const i = objects.findIndex(o => o.mesh === m); if (i >= 0) objects.splice(i, 1)
    saveSoon(); refreshInspector()
  }
  function delSel() {
    if (!sel) return
    const m = sel, uid = m.userData.uid, snap = snapObj(m, m.userData.type)
    removeMesh(m)
    pushHistory('3d delete',
      () => { if (live()) restoreObj(snap, uid) },
      () => { if (live()) removeMesh(findByUid(uid)) })
  }
  // Re-create an object from its serialized snapshot (same shape as the
  // localStorage restore path) and give it back its history uid.
  function restoreObj(snap, uid) {
    if (snap.type === 'import') {
      if (snap.glbSrc) loadGlb(snap.glbSrc, snap, g => { g.userData.uid = uid; saveSoon(); refreshInspector() })
      return
    }
    const m = addMesh(snap.type, { ...snap, grad: snap.grad ? { ...snap.grad } : snap.grad, params: snap.params ? { ...snap.params } : null })
    m.userData.uid = uid
    saveSoon(); refreshInspector()
  }
  // History entry for a freshly created object (add / duplicate / import):
  // undo removes it, redo re-creates it from its snapshot.
  function pushAddHistory(m, label = '3d add') {
    const uid = m.userData.uid, snap = snapObj(m, m.userData.type)
    pushHistory(label,
      () => { if (live()) removeMesh(findByUid(uid)) },
      () => { if (live()) restoreObj(snap, uid) })
  }
  function rebuildGeo(m) { const def = GEO[m.userData.type]; if (!def) return; const old = m.geometry; m.geometry = def.build(m.userData.params); old.dispose() }
  function duplicate(m) {
    const ud = m.userData
    const off = m.position.toArray().map((v, i) => i === 0 ? v + 0.6 : v), rot = [m.rotation.x, m.rotation.y, m.rotation.z], scl = m.scale.toArray()
    if (ud.type === 'import') { if (ud.glbSrc) loadGlb(ud.glbSrc, { name: ud.name, pos: off, rot, scl }, g => { selectMesh(g); saveSoon(); pushAddHistory(g, '3d duplicate') }); return }
    const mat = m.material
    const copy = addMesh(ud.type, {
      pos: off, rot, scl,
      baseColor: ud.baseColor, mapKind: ud.mapKind, imgSrc: ud.imgSrc, nmapSrc: ud.nmapSrc, relief: ud.relief, emissive: ud.emissive, emissiveInt: ud.emissiveInt, grad: { ...ud.grad },
      roughness: mat.roughness, metalness: mat.metalness, opacity: mat.opacity, wireframe: mat.wireframe,
      text: ud.text || undefined, ascii: ud.ascii || undefined, depth: ud.depth || undefined,
      bevel: ud.bevel, smooth: ud.smooth, layers: ud.layers, layerGap: ud.layerGap, params: ud.params ? { ...ud.params } : undefined,
    })
    selectMesh(copy); saveSoon(); pushAddHistory(copy, '3d duplicate')
  }
  // F — frame the selection: aim the orbit target at its center and dolly the
  // camera back along its current direction to fit the bounding sphere.
  function frameSelected() {
    if (!sel) return
    const box = new THREE.Box3().setFromObject(sel)
    if (box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    const r = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.05)
    const dv = camera.position.clone().sub(orbit.target)
    if (dv.lengthSq() < 1e-6) dv.set(0.6, 0.45, 1)
    dv.setLength(r * 2.2)
    orbit.target.copy(center); camera.position.copy(center).add(dv)
    saveSoon()
  }

  // ── Inspector ────────────────────────────────────────────────────────────
  let tRows = null
  const round = v => Math.round(v * 100) / 100
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  function sec(titleKey) { const s = el('div', 't3-sec'); s.appendChild(el('div', 't3-sec-h', t(titleKey))); return s }
  function field(label, node) { const f = el('div', 't3-field'); f.appendChild(el('label', null, label)); f.appendChild(node); return f }
  function vec3Row(label, get, step, apply, deg) {
    const box = el('div', 't3-xyz')
    const ins = [0, 1, 2].map(ax => {
      const i = el('input', 't3-num'); i.type = 'number'; i.step = step
      i.value = round(deg ? get()[ax] * DEG : get()[ax])
      i.addEventListener('input', () => { let v = parseFloat(i.value); if (isNaN(v)) return; if (deg) v /= DEG; apply(ax, v); saveSoon() })
      box.appendChild(i); return i
    })
    return { row: field(label, box), ins }
  }
  function rngRow(label, value, min, max, stp, fmt, on) {
    const box = el('div', 't3-field'); box.appendChild(el('label', null, label))
    const r = el('input', 't3-rng'); r.type = 'range'; r.min = min; r.max = max; r.step = stp; r.value = value
    const v = el('span', 't3-rngval', fmt(value))
    r.addEventListener('input', () => { const nv = parseFloat(r.value); v.textContent = fmt(nv); on(nv) })
    box.appendChild(r); box.appendChild(v); return box
  }
  function colorField(label, value, on, withPal) {
    const c = el('input', 't3-color'); c.type = 'color'; c.value = value
    c.addEventListener('input', () => on(c.value))
    if (!withPal) return field(label, c)
    const wrap = el('div'); wrap.style.cssText = 'display:flex;gap:4px;align-items:center;flex:1'
    const pb = el('button'); pb.innerHTML = '<i class="fa-solid fa-palette" style="font-size:10px"></i>'
    pb.style.cssText = 'width:22px;height:22px;border-radius:4px;border:1px solid var(--win-border,#2a2a2a);background:#1c1c20;color:#aaa;cursor:pointer;padding:0;flex-shrink:0'
    pb.addEventListener('click', () => showPalPicker(pb, v => { c.value = v; on(v) }))
    wrap.append(c, pb); return field(label, wrap)
  }

  function syncTransform() {
    if (!sel || !tRows) return
    const set = (ins, arr, deg) => ins.forEach((i, ax) => { if (document.activeElement !== i) i.value = round(deg ? arr[ax] * DEG : arr[ax]) })
    set(tRows.pos.ins, sel.position.toArray())
    set(tRows.rot.ins, [sel.rotation.x, sel.rotation.y, sel.rotation.z], true)
    set(tRows.scl.ins, sel.scale.toArray())
  }

  function objName(m) { const ty = m.userData.type; return ty === 'text' ? (m.userData.text || t('td_text')) : ty === 'import' ? (m.userData.name || t('td_model')) : (GEO[ty]?.label || ty) }
  const objIcon = m => m.userData.type === 'text' ? 'font' : m.userData.type === 'import' ? 'shapes' : 'cube'
  function renderObjList() {
    const box = el('div', 't3-objlist')
    if (!objects.length) { box.appendChild(el('div', 't3-objempty', t('td_no_objects'))); insp.appendChild(box); return }
    objects.forEach(({ mesh: m }) => {
      const row = el('div', 't3-obj' + (m === sel ? ' sel' : ''))
      row.innerHTML = `<i class="fa-solid fa-${objIcon(m)}"></i><span class="nm"></span>`
        + `<i class="fa-solid fa-${m.visible === false ? 'eye-slash' : 'eye'} act vis"></i><i class="fa-solid fa-xmark act del"></i>`
      row.querySelector('.nm').textContent = objName(m)
      row.querySelector('.nm').addEventListener('click', () => selectMesh(m))
      row.querySelector('.vis').addEventListener('click', e => { e.stopPropagation(); m.visible = m.visible === false; saveSoon(); refreshInspector() })
      row.querySelector('.del').addEventListener('click', e => { e.stopPropagation(); if (sel !== m) selectMesh(m); delSel() })
      box.appendChild(row)
    })
    insp.appendChild(box)
  }
  function refreshInspector() {
    insp.innerHTML = ''; tRows = null
    renderObjList()
    if (!sel) { insp.appendChild(el('div', 't3-empty', `<i class="fa-solid fa-arrow-pointer" style="font-size:18px;opacity:.4"></i><br><br>${t('td_select_hint')}`)); return }
    const m = sel, isText = m.userData.type === 'text', def = GEO[m.userData.type], ud = m.userData
    const isStd = !!(m.material && m.material.roughness !== undefined)
    insp.appendChild(el('div', 't3-insp-title', `<i class="fa-solid fa-${objIcon(m)}"></i>${objName(m)}`))

    // Transform
    const ts = sec('td_transform')
    const pos = vec3Row(t('td_position'), () => m.position.toArray(), 0.1, (ax, v) => m.position.setComponent(ax, v))
    const rot = vec3Row(t('td_rotation'), () => [m.rotation.x, m.rotation.y, m.rotation.z], 1, (ax, v) => m.rotation.set(ax === 0 ? v : m.rotation.x, ax === 1 ? v : m.rotation.y, ax === 2 ? v : m.rotation.z), true)
    const scl = vec3Row(t('td_size'), () => m.scale.toArray(), 0.05, (ax, v) => m.scale.setComponent(ax, v || 0.001))
    ts.append(pos.row, rot.row, scl.row)
    const al = el('div', 't3-mini')
    al.innerHTML = `<button class="t3-btn" id="t3a-floor" title="${t('td_align_floor')}"><i class="fa-solid fa-down-long"></i></button>`
      + `<button class="t3-btn" id="t3a-center" title="${t('td_align_center')}"><i class="fa-solid fa-crosshairs"></i></button>`
      + `<button class="t3-btn" id="t3a-reset" title="${t('td_align_reset')}"><i class="fa-solid fa-rotate-left"></i></button>`
    al.querySelector('#t3a-floor').addEventListener('click', () => { const b = new THREE.Box3().setFromObject(m); m.position.y += (-0.6) - b.min.y; syncTransform(); saveSoon() })
    al.querySelector('#t3a-center').addEventListener('click', () => { m.position.x = 0; m.position.z = 0; syncTransform(); saveSoon() })
    al.querySelector('#t3a-reset').addEventListener('click', () => { m.rotation.set(0, 0, 0); syncTransform(); saveSoon() })
    ts.appendChild(al); insp.appendChild(ts)
    tRows = { pos, rot, scl }

    // Text content
    if (isText) {
      const sx = sec('td_text')
      const inp = el('input', 't3-tinput'); inp.value = ud.text || ''
      inp.addEventListener('input', () => rebuildText(m, inp.value))
      sx.appendChild(inp)
      sx.appendChild(rngRow(t('td_volume'), ud.depth || 0, 0, 0.6, 0.02, v => v.toFixed(2),
        nv => { const was = (ud.depth || 0) > 0; ud.depth = nv; applyTextGeometry(m); saveSoon(); if (was !== (nv > 0)) refreshInspector() }))
      if ((ud.depth || 0) > 0) {
        sx.appendChild(rngRow(t('td_bevel'), ud.bevel || 0, 0, 0.25, 0.01, v => v.toFixed(2),
          nv => { ud.bevel = nv; applyTextGeometry(m); saveSoon() }))
        sx.appendChild(rngRow(t('td_smooth'), ud.smooth || 5, 1, 12, 1, v => String(Math.round(v)),
          nv => { ud.smooth = Math.round(nv); applyTextGeometry(m); saveSoon() }))
        sx.appendChild(rngRow(t('td_layers'), ud.layers || 1, 1, 16, 1, v => String(Math.round(v)),
          nv => { ud.layers = Math.round(nv); applyTextGeometry(m); saveSoon() }))
        sx.appendChild(rngRow(t('td_layer_gap'), ud.layerGap ?? 0.15, 0, 0.5, 0.02, v => v.toFixed(2),
          nv => { ud.layerGap = nv; applyTextGeometry(m); saveSoon() }))
      }
      // Outline (bordure) — checkbox + color + width
      const oc = el('label', 't3-chk'); oc.innerHTML = `<input type="checkbox" ${ud.outlineEnabled ? 'checked' : ''}> ${t('td_outline')}`
      oc.querySelector('input').addEventListener('change', e => { ud.outlineEnabled = e.target.checked; applyTextGeometry(m); saveSoon(); refreshInspector() })
      sx.appendChild(oc)
      if (ud.outlineEnabled) {
        sx.appendChild(colorField(t('td_outline_color'), ud.outlineColor || '#000000', v => { ud.outlineColor = v; applyTextGeometry(m); saveSoon() }))
        sx.appendChild(rngRow(t('td_outline_width'), ud.outlineWidth || 14, 2, 40, 1, v => String(Math.round(v)) + 'px',
          nv => { ud.outlineWidth = Math.round(nv); applyTextGeometry(m); saveSoon() }))
      }
      insp.appendChild(sx)
    }

    // Geometry
    if (def) {
      const gs = sec('td_geometry')
      def.schema.forEach(sc => {
        const val = ud.params[sc.key]
        gs.appendChild(rngRow(sc.label, val, sc.min, sc.max, sc.step, v => sc.int ? String(Math.round(v)) : v.toFixed(2),
          nv => { ud.params[sc.key] = sc.int ? Math.round(nv) : nv; rebuildGeo(m); saveSoon() }))
      })
      insp.appendChild(gs)
    }

    // Material — only for objects with a standard material (not imported models).
    if (isStd) {
    const ms = sec('td_material')
    // Preset matter — built-in + user-created chips (apply / rename / delete).
    ms.appendChild(el('div', 't3-sublab', t('mp_material')))
    const chips = el('div', 't3-chips')
    BUILTIN_PRESETS.forEach(p => { const c = el('button', 't3-chip', t(p.nameKey)); c.addEventListener('click', () => applyPreset(m, p)); chips.appendChild(c) })
    getUserPresets().forEach((p, i) => {
      const c = el('span', 't3-chip')
      c.innerHTML = `<span class="nm"></span><i class="fa-solid fa-pen mini"></i><i class="fa-solid fa-xmark mini x"></i>`
      c.querySelector('.nm').textContent = p.name
      c.querySelector('.nm').addEventListener('click', () => applyPreset(m, p))
      c.querySelector('.fa-pen').addEventListener('click', async e => { e.stopPropagation(); const nn = await promptName(p.name, { title: t('mp_rename') }); if (nn != null) { renameUserPreset(i, nn); refreshInspector() } })
      c.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); deleteUserPreset(i); refreshInspector() })
      chips.appendChild(c)
    })
    const add = el('button', 't3-chip add', `<i class="fa-solid fa-floppy-disk"></i> ${t('mp_save_short')}`); add.title = t('mp_save')
    add.addEventListener('click', async () => { const name = await promptName(t('mp_new_name'), { title: t('mp_save') }); if (name == null) return; addUserPreset(captureCurrent(m, name)); refreshInspector() })
    chips.appendChild(add)
    ms.appendChild(chips)
    // Motif — built-in procedural texture (no external file needed); also "Image".
    // 'outline' removed — was causing rendering artefacts.
    const MOTIFS = [['none', 'td_motif_none'], ['gradient', 'td_motif_gradient'], ['checker', 'td_motif_checker'], ['stripes', 'td_motif_stripes'], ['dots', 'td_motif_dots'], ['bricks', 'td_motif_bricks'], ['wood', 'td_motif_wood'], ['noise', 'td_motif_noise'], ['ascii', 'ASCII'], ['image', 'td_motif_image']]
    const mSel = el('select', 't3-sel'); mSel.style.cssText = 'width:100%'
    MOTIFS.forEach(([v, k]) => { const o = document.createElement('option'); o.value = v; o.textContent = k === 'ASCII' ? 'ASCII' : t(k); if (ud.mapKind === v) o.selected = true; mSel.appendChild(o) })
    ms.appendChild(field(t('td_motif'), mSel))
    mSel.addEventListener('change', () => {
      const v = mSel.value
      if (v === 'image') { fileTarget = 'map'; fileInp.click(); mSel.value = ud.mapKind; return }
      ud.mapKind = v; if (ud.type === 'text') applyTextGeometry(m); applyFill(m); saveSoon(); refreshInspector()
    })
    ms.appendChild(colorField(t('td_color'), ud.baseColor || '#ffffff', v => { ud.baseColor = v; if (ud.outlineEnabled && (ud.depth || 0) === 0) applyTextGeometry(m); else applyFill(m); saveSoon() }, true))
    if (PROC.includes(ud.mapKind)) ms.appendChild(colorField(t('td_color') + ' 2', ud.grad?.c2 || '#000000', v => { ud.grad.c2 = v; applyFill(m); saveSoon() }))
    if (PROC.includes(ud.mapKind) && ud.mapKind !== 'gradient') {
      const rc = el('label', 't3-chk'); rc.innerHTML = `<input type="checkbox" ${ud.relief ? 'checked' : ''}> ${t('td_relief')}`
      rc.querySelector('input').addEventListener('change', e => { ud.relief = e.target.checked; applyFill(m); saveSoon() })
      ms.appendChild(rc)
    }
    // PBR amounts (labelled elastic sliders — react-bits)
    const elasticRow = (label, value, onInput) => {
      const f = el('div', 't3-field'); f.appendChild(el('label', null, label))
      f.appendChild(createElasticSlider({ min: 0, max: 1, value, width: 130, onInput }).el); return f
    }
    ms.appendChild(elasticRow(t('td_rough'), m.material.roughness, v => { m.material.roughness = v; saveSoon() }))
    ms.appendChild(elasticRow(t('td_metal'), m.material.metalness, v => { m.material.metalness = v; saveSoon() }))
    ms.appendChild(elasticRow(t('td_opacity'), m.material.opacity, v => { m.material.opacity = v; m.material.transparent = v < 1 || isText; m.material.depthWrite = v >= 1; m.material.needsUpdate = true; saveSoon() }))
    const wc = el('label', 't3-chk'); wc.innerHTML = `<input type="checkbox" ${m.material.wireframe ? 'checked' : ''}> ${t('td_wire')}`
    wc.querySelector('input').addEventListener('change', e => { m.material.wireframe = e.target.checked; saveSoon() })
    ms.appendChild(wc)
    // Émission (néon / glow) — pick a colour (black = off) + intensity.
    ms.appendChild(colorField(t('td_emissive'), ud.emissive || '#000000', v => { const had = !!ud.emissive; ud.emissive = (v === '#000000') ? null : v; setEmissive(m); saveSoon(); if (had !== !!ud.emissive) refreshInspector() }))
    if (ud.emissive) ms.appendChild(rngRow(t('td_emissive') + ' ✦', ud.emissiveInt ?? 1, 0, 4, 0.1, v => v.toFixed(1), nv => { ud.emissiveInt = nv; setEmissive(m); saveSoon() }))
    // Optional external normal-map file (advanced relief from an asset).
    const mini = el('div', 't3-mini')
    mini.innerHTML = `<button class="t3-btn" id="t3i-nmap" title="${t('td_normal')}"><i class="fa-solid fa-mountain"></i></button>`
    mini.querySelector('#t3i-nmap').addEventListener('click', () => { fileTarget = 'nmap'; fileInp.click() })
    ms.appendChild(mini)
    if (ud.mapKind === 'image' || ud.nmapSrc) {
      const clr = el('button', 't3-btn', `<i class="fa-solid fa-eraser"></i>`)
      clr.title = t('td_clear_tex'); clr.style.cssText = 'width:100%;justify-content:center;margin-top:5px'
      clr.addEventListener('click', () => {
        if (ud.mapKind === 'image') { ud.mapKind = 'none'; ud.imgSrc = null }
        if (ud.nmapSrc) ud.nmapSrc = null
        applyFill(m); saveSoon(); refreshInspector()
      })
      ms.appendChild(clr)
    }
    insp.appendChild(ms)
    }

    // Export this object on its own — image (JPG) or 3D file (GLB) → library.
    const exp = el('div', 't3-acts')
    exp.innerHTML = `<button class="t3-btn" id="t3i-eimg" title="${t('td_export_img')}"><i class="fa-solid fa-image"></i></button>`
      + `<button class="t3-btn" id="t3i-e3d" title="${t('td_export_3d')}"><i class="fa-solid fa-cube"></i></button>`
    exp.querySelector('#t3i-eimg').addEventListener('click', () => exportImage(m))
    exp.querySelector('#t3i-e3d').addEventListener('click', () => exportGlb(m))
    insp.appendChild(exp)
    // Actions (icon-only — tooltips on hover)
    const acts = el('div', 't3-acts')
    acts.innerHTML = `<button class="t3-btn" id="t3i-dup" title="${t('td_duplicate')}"><i class="fa-solid fa-clone"></i></button><button class="t3-btn danger" id="t3i-del" title="${t('td_delete')}"><i class="fa-solid fa-trash"></i></button>`
    acts.querySelector('#t3i-dup').addEventListener('click', () => duplicate(m))
    acts.querySelector('#t3i-del').addEventListener('click', delSel)
    insp.appendChild(acts)
  }

  // ── GLB import ──────────────────────────────────────────────────────────────
  const b64ToBuf = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer }
  function addImported(root, o = {}) {
    root.userData.type = 'import'; root.userData.name = o.name || t('td_model'); root.userData.glbSrc = o.glbSrc || null
    root.userData.uid = uidSeq++
    root.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
    root.position.fromArray(o.pos || [0, 0.4, 0]); if (o.rot) root.rotation.fromArray(o.rot); if (o.scl) root.scale.fromArray(o.scl)
    if (o.visible === false) root.visible = false
    scene.add(root); objects.push({ type: 'import', mesh: root }); return root
  }
  function loadGlb(b64, o = {}, cb) {
    try { new GLTFLoader().parse(b64ToBuf(b64), '', g => { const r = addImported(g.scene, { ...o, glbSrc: b64 }); cb && cb(r) }, err => window.toast?.('GLB: ' + (err?.message || err), 'error')) }
    catch (e) { window.toast?.('GLB: ' + (e?.message || e), 'error') }
  }

  // ── Persistence ─────────────────────────────────────────────────────────────
  let saveT = 0
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 350) }
  const warnSaveFull = () => { if (!warnedSaveFull) { warnedSaveFull = true; window.toast?.(t('td_save_full'), 'error', 4000) } }
  // Serialize one object — shared by save() and the history snapshots (grad /
  // params are copied so a snapshot can't be mutated by later edits).
  function snapObj(m, type) {
    const ud = m.userData
    if (type === 'import') return { type, pos: m.position.toArray(), rot: [m.rotation.x, m.rotation.y, m.rotation.z], scl: m.scale.toArray(), visible: m.visible !== false, glbSrc: ud.glbSrc, name: ud.name }
    const mat = m.material
    return { type, pos: m.position.toArray(), rot: [m.rotation.x, m.rotation.y, m.rotation.z], scl: m.scale.toArray(), visible: m.visible !== false,
      baseColor: ud.baseColor, mapKind: ud.mapKind, grad: ud.grad ? { ...ud.grad } : ud.grad, imgSrc: ud.imgSrc, nmapSrc: ud.nmapSrc, relief: ud.relief || false,
      emissive: ud.emissive || null, emissiveInt: ud.emissiveInt ?? 1,
      roughness: mat.roughness, metalness: mat.metalness, opacity: mat.opacity, wireframe: !!mat.wireframe,
      outlineEnabled: ud.outlineEnabled || false, outlineColor: ud.outlineColor || '#000000', outlineWidth: ud.outlineWidth || 14,
      text: ud.text || null, ascii: ud.ascii || false, depth: ud.depth || 0,
      bevel: ud.bevel || 0, smooth: ud.smooth || 5, layers: ud.layers || 1, layerGap: ud.layerGap ?? 0.15, params: ud.params ? { ...ud.params } : null }
  }
  function save() {
    try {
      const data = JSON.stringify({
        cam: { p: camera.position.toArray(), t: orbit.target.toArray() },
        objects: objects.map(({ mesh: m, type }) => snapObj(m, type)),
      })
      if (data.length < 8_000_000) localStorage.setItem(LS_KEY, data)
      else warnSaveFull()
    } catch { warnSaveFull() }
  }
  function restore() {
    let st; try { st = JSON.parse(localStorage.getItem(LS_KEY)) } catch {}
    if (!st) return
    if (st.cam) { camera.position.fromArray(st.cam.p); orbit.target.fromArray(st.cam.t) }
    ;(st.objects || []).forEach(o => { if (o.type === 'import') { if (o.glbSrc) loadGlb(o.glbSrc, o) } else addMesh(o.type === 'cube' ? 'box' : o.type, o) })
  }

  // ── Export to the library ─────────────────────────────────────────────────
  const abToB64 = buf => { let s = ''; const b = new Uint8Array(buf), C = 0x8000; for (let i = 0; i < b.length; i += C) s += String.fromCharCode.apply(null, b.subarray(i, i + C)); return btoa(s) }
  async function libSave(folder, base, ext, base64) {
    const root = window.__TAURI__ && localStorage.getItem('library:root')
    if (!root) {
      // No Tauri bridge / no library root — fall back to a plain download.
      try {
        const bin = atob(base64), u = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
        const mime = ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'model/gltf-binary'
        const url = URL.createObjectURL(new Blob([u], { type: mime }))
        const a = document.createElement('a'); a.href = url; a.download = base + ext; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        window.toast?.(t('td_exported') + ' : ' + base + ext, 'success')
        return true
      } catch { window.toast?.(t('clip_save_no_lib'), 'error'); return false }
    }
    const sep = root.includes('\\') ? '\\' : '/'
    try {
      await window.__TAURI__.core.invoke('save_binary_file', { path: root + sep + folder + sep + base + ext, base64 })
      window.dispatchEvent(new CustomEvent('iceample-library-changed', { detail: { folder: root + sep + folder } }))
      window.toast?.(t('td_exported') + ' : ' + base + ext, 'success')
      return true
    } catch { window.toast?.(t('clip_save_fail'), 'error'); return false }
  }
  // One-shot render with temporary overrides (resolution / background / grid /
  // per-object isolation); restores everything and re-renders afterwards.
  function renderShot({ scale = 1, mime = 'image/jpeg', transparentBg = false, hideGrid = true, onlyMesh = null } = {}) {
    const hidden = []
    if (onlyMesh) objects.forEach(o => { if (o.mesh !== onlyMesh) { hidden.push([o.mesh, o.mesh.visible]); o.mesh.visible = false } })
    const gridWas = grid.visible, groundWas = shadowGround.visible, bgWas = scene.background
    if (hideGrid || onlyMesh) grid.visible = false
    if (transparentBg) { scene.background = null; shadowGround.visible = false }
    const att = tc.object; tc.detach()
    const w = canvasBox.clientWidth || 1, h = canvasBox.clientHeight || 1
    if (scale !== 1) renderer.setSize(w * scale, h * scale, false)
    renderer.render(scene, camera)
    const url = renderer.domElement.toDataURL(mime, 0.92)
    if (scale !== 1) renderer.setSize(w, h, false)
    scene.background = bgWas; grid.visible = gridWas; shadowGround.visible = groundWas
    hidden.forEach(([m, v]) => { m.visible = v })
    if (att) tc.attach(att)
    renderer.render(scene, camera)
    return url
  }
  async function exportImage(onlyMesh, opts = {}) {
    const def = onlyMesh ? (onlyMesh.userData.text || onlyMesh.userData.type) : 'vue-3d'
    const base = await promptName(String(def || '3d').replace(/[^\w-]+/g, '_').slice(0, 40) || '3d', { title: t('td_export_img') })
    if (base == null) return
    const png = opts.mime === 'image/png'
    const url = renderShot({ ...opts, onlyMesh, mime: opts.mime || 'image/jpeg' })
    await libSave('Images', base, png ? '.png' : '.jpg', url.split(',')[1])
  }
  function exportGlb(mesh) {
    promptName((mesh.userData.text || mesh.userData.type || 'objet').replace(/[^\w-]+/g, '_').slice(0, 40) || 'objet', { title: t('td_export_3d') }).then(base => {
      if (base == null) return
      new GLTFExporter().parse(mesh, result => libSave('3D', base, '.glb', abToB64(result)),
        () => window.toast?.('GLB export error', 'error'), { binary: true })
    })
  }

  // ── Toolbar ─────────────────────────────────────────────────────────────────
  const primSel = body.querySelector('#t3-prim'), fileInp = body.querySelector('#t3-file')
  const spinBtn = body.querySelector('#t3-spin')
  let fileTarget = 'map'
  const modeBtns = { translate: body.querySelector('#t3-move'), rotate: body.querySelector('#t3-rotate'), scale: body.querySelector('#t3-scale') }
  const setMode = m => { tc.setMode(m); Object.entries(modeBtns).forEach(([k, b]) => b.classList.toggle('on', k === m)) }

  body.querySelector('#t3-add').addEventListener('click', () => { const m = addMesh(primSel.value, {}); selectMesh(m); saveSoon(); pushAddHistory(m, '3d add') })
  body.querySelector('#t3-text').addEventListener('click', addText)
  modeBtns.translate.addEventListener('click', () => setMode('translate'))
  modeBtns.rotate.addEventListener('click', () => setMode('rotate'))
  modeBtns.scale.addEventListener('click', () => setMode('scale'))
  spinBtn.addEventListener('click', () => { orbit.autoRotate = !orbit.autoRotate; spinBtn.classList.toggle('on', orbit.autoRotate) })
  fileInp.addEventListener('change', () => {
    const f = fileInp.files[0]; if (!f || !sel) { fileInp.value = ''; return }
    const r = new FileReader(); r.onload = () => {
      if (fileTarget === 'nmap') { sel.userData.nmapSrc = r.result; setNormal(sel) }
      else { sel.userData.imgSrc = r.result; sel.userData.mapKind = 'image'; applyFill(sel) }
      saveSoon(); refreshInspector()
    }; r.readAsDataURL(f); fileInp.value = ''
  })
  // Media bus (scene ready): image → texture on the selected object, or a new
  // textured plane when nothing is selected; model → loaded as a GLB import.
  onBusMedia = m => {
    if (m.kind === 'model') { loadModelFromPath(m.path, m.name); return }
    if (sel && sel.userData?.type !== 'import') {
      sel.userData.imgSrc = m.dataUrl; sel.userData.mapKind = 'image'
      applyFill(sel); saveSoon(); refreshInspector()
    } else {
      const p = addMesh('plane', { mapKind: 'image', imgSrc: m.dataUrl })
      selectMesh(p); saveSoon(); pushAddHistory(p, '3d add')
    }
  }
  if (pendingBusMedia) { onBusMedia(pendingBusMedia); pendingBusMedia = null }
  // Load a glb/gltf from a filesystem path (media-bus model / library drop)
  // through the same GLB path as the toolbar import.
  async function loadModelFromPath(path, name) {
    if (!path || !window.__TAURI__) return
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
      if (!live()) return
      loadGlb(b64, { name: String(name || path.split(/[\\/]/).pop() || '3d').replace(/\.(glb|gltf)$/i, '') }, g => { selectMesh(g); saveSoon(); pushAddHistory(g, '3d import') })
    } catch { window.toast?.(t('td_load_fail'), 'error') }
  }
  // Library drop: glb/gltf → model import, image → same path as bus images.
  const DROP_IMG_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
  body.addEventListener('iceample-drop', async e => {
    const file = e.detail?.file
    if (!file || !file.path) return
    const ext = String(file.name || file.path).split('.').pop().toLowerCase()
    if (ext === 'glb' || ext === 'gltf') { loadModelFromPath(file.path, file.name); return }
    if (!DROP_IMG_EXTS.includes(ext) || !window.__TAURI__) return
    try {
      const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path: file.path })
      if (!live()) return
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg'
      onBusMedia({ kind: 'image', dataUrl: 'data:' + mime + ';base64,' + b64, name: file.name })
    } catch { window.toast?.(t('td_load_fail'), 'error') }
  })
  // Gizmo snapping (0.25u / 15° / 0.1) + world↔local space toggles.
  const snapBtn = body.querySelector('#t3-snap'), spaceBtn = body.querySelector('#t3-space')
  snapBtn.addEventListener('click', () => {
    const on = snapBtn.classList.toggle('on')
    tc.setTranslationSnap(on ? 0.25 : null)
    tc.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null)
    tc.setScaleSnap(on ? 0.1 : null)
  })
  spaceBtn.addEventListener('click', () => { const local = spaceBtn.classList.toggle('on'); tc.setSpace(local ? 'local' : 'world') })
  body.querySelector('#t3-reset').addEventListener('click', () => { camera.position.set(3, 2.4, 4); orbit.target.set(0, 0.2, 0); saveSoon() })
  body.querySelector('#t3-export').addEventListener('click', () => exportImage(null, { hideGrid: false }))
  body.querySelector('#t3-exportpng').addEventListener('click', () => exportImage(null, { mime: 'image/png', scale: 2, transparentBg: true }))
  body.querySelector('#t3-send').addEventListener('click', e => {
    e.stopPropagation()
    showSendMenu(e.currentTarget, () => ({ kind: 'image', dataUrl: renderShot({ scale: 2, mime: 'image/png' }), name: 'rendu-3d' }), { self: 'tool3d' })
  })
  const importInp = body.querySelector('#t3-importfile')
  body.querySelector('#t3-import').addEventListener('click', () => importInp.click())
  importInp.addEventListener('change', () => {
    const f = importInp.files[0]; if (!f) return
    const r = new FileReader(); r.onload = () => loadGlb(abToB64(r.result), { name: f.name.replace(/\.(glb|gltf)$/i, '') }, g => { selectMesh(g); saveSoon(); pushAddHistory(g, '3d import') })
    r.readAsArrayBuffer(f); importInp.value = ''
  })

  // Pick / select
  let dx = 0, dy = 0
  renderer.domElement.addEventListener('pointerdown', e => { dx = e.clientX; dy = e.clientY })
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect()
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    rc.setFromCamera(ptr, camera)
    const hit = rc.intersectObjects(objects.map(o => o.mesh), true)[0]   // recursive → imported models too
    if (!hit) return null
    let n = hit.object; while (n && !objects.some(o => o.mesh === n)) n = n.parent
    return n ? { object: n } : null
  }
  renderer.domElement.addEventListener('pointerup', e => {
    if (tc.dragging || Math.hypot(e.clientX - dx, e.clientY - dy) > 5) return
    const hit = pick(e); if (hit) selectMesh(hit.object); else deselect()
  })
  renderer.domElement.addEventListener('dblclick', async e => {
    const hit = pick(e); if (!hit || hit.object.userData.type !== 'text') return
    const txt = await promptName(hit.object.userData.text || '', { title: t('td_text') })
    rebuildText(hit.object, txt); if (sel === hit.object) refreshInspector()
  })
  renderer.domElement.addEventListener('contextmenu', e => { e.preventDefault(); const hit = pick(e); if (hit) selectMesh(hit.object) })

  const flyKeys = new Set(); let flyFast = false
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') }
  function onKey(e) {
    if (!(body.matches(':hover') || body.closest('.tool-win')?.contains(document.activeElement)) || typing()) return
    flyFast = e.shiftKey
    const k = e.key.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); if (sel) duplicate(sel); return }
    if (k.length === 1 && 'wasdqe'.includes(k) && !e.ctrlKey && !e.metaKey && !e.altKey) { flyKeys.add(k); return }
    if (k === '1') setMode('translate'); else if (k === '2') setMode('rotate'); else if (k === '3') setMode('scale')
    else if (e.key === 'Escape' && sel) deselect()
    else if (k === 'f' && sel && !e.ctrlKey && !e.metaKey) frameSelected()
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); delSel() }
  }
  function onKeyUp(e) { flyFast = e.shiftKey; flyKeys.delete(e.key.toLowerCase()) }
  const clearFly = () => flyKeys.clear()
  document.addEventListener('keydown', onKey)
  document.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clearFly)

  // Free-fly camera: WASD truck/dolly, Q/E down/up, Shift = fast (moves camera + target).
  const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _mv = new THREE.Vector3()
  function flyStep() {
    if (!flyKeys.size) return
    const spd = (flyFast ? 0.055 : 0.022) * (camera.position.distanceTo(orbit.target) + 1.2)
    camera.getWorldDirection(_fwd); _right.crossVectors(_fwd, camera.up).normalize(); _mv.set(0, 0, 0)
    if (flyKeys.has('w')) _mv.addScaledVector(_fwd, spd)
    if (flyKeys.has('s')) _mv.addScaledVector(_fwd, -spd)
    if (flyKeys.has('d')) _mv.addScaledVector(_right, spd)
    if (flyKeys.has('a')) _mv.addScaledVector(_right, -spd)
    if (flyKeys.has('e')) _mv.addScaledVector(camera.up, spd)
    if (flyKeys.has('q')) _mv.addScaledVector(camera.up, -spd)
    camera.position.add(_mv); orbit.target.add(_mv); if (!saveT) saveSoon()
  }

  function resize() { const w = canvasBox.clientWidth || 1, h = canvasBox.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
  const ro = new ResizeObserver(resize); ro.observe(canvasBox); resize()
  restore(); refreshInspector()
  let raf = 0, alive = true
  ;(function loop() { if (!alive) return; raf = requestAnimationFrame(loop); flyStep(); orbit.update(); renderer.render(scene, camera) })()

  new MutationObserver((_, obs) => {
    if (!document.contains(body)) {
      alive = false; cancelAnimationFrame(raf); ro.disconnect()
      document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', clearFly)
      const disposeMat = mt => { if (!mt) return; [mt.map, mt.alphaMap, mt.normalMap, mt.emissiveMap].forEach(tx => tx?.dispose?.()); mt.dispose?.() }
      objects.forEach(({ mesh }) => mesh.traverse(n => {
        if (!n.isMesh) return
        n.geometry?.dispose?.()
        if (Array.isArray(n.material)) n.material.forEach(disposeMat); else disposeMat(n.material)
      }))
      shadowGround.geometry.dispose(); shadowGround.material.dispose()
      envRT?.dispose?.()   // PMREM render target (owns scene.environment's texture)
      tc.dispose(); orbit.dispose(); renderer.dispose(); obs.disconnect()
    }
  }).observe(document.body, { childList: true, subtree: true })
}
