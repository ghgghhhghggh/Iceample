// file-routes.js — Which tools can open which files.
//
// One registry for every place that hands a file to a tool: the Library
// (double-click and "Open with…"), Search and Recents. A file goes to a tool as
// an `iceample-media` event (see media-bus.js):
//   image → { kind:'image', dataUrl, name, path }   (image tools work on pixels)
//   audio → { kind:'audio', path, name }
//   other → { kind, path, name }   with kind = video | raw | model | iceimg | icevid | icetpl
// To make a tool accept a new kind: listen for that kind in its `iceample-media`
// handler, then add the tool to ROUTES below.

import { t } from './i18n.js'
import { sendMedia, showSendMenu } from './media-bus.js'
import { TOOLS, EXTRA_TOOLS } from './window-manager.js'

const EXTS = {
  audio:  ['wav', 'mp3', 'flac', 'ogg', 'aiff', 'aif', 'm4a', 'm4r'],
  image:  ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
  video:  ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'],
  raw:    ['cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'dng', 'srw', 'pef'],
  model:  ['glb', 'gltf'],
  iceimg: ['iceimg'],
  icevid: ['icevid'],
  icetpl: ['icetpl'],
}

const IMAGE_MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' }

// Tools able to open each kind, in order of preference (the first one is the
// default action). Drag-and-drop targets (DAW, mic and sequencer lanes) are not
// listed: they take files by dropping them where the clip should go.
const ROUTES = {
  audio:  ['editor', 'videorec', 'bganim', 'particles', 'textanim', 'spectrum', 'metadata'],
  image:  ['imgedit', 'effects', 'videorec', 'moodboard', 'palettes', 'watermark', 'tool3d'],
  video:  ['videorec', 'subtitles', 'timelapse', 'metadata'],
  raw:    ['rawtool'],
  model:  ['tool3d'],
  iceimg: ['imgedit'],
  icevid: ['videorec'],
  icetpl: ['videorec'],
}

export const KIND_ICONS = {
  audio: 'fa-music', image: 'fa-image', video: 'fa-film', raw: 'fa-camera-retro',
  model: 'fa-cube', iceimg: 'fa-layer-group', icevid: 'fa-clapperboard', icetpl: 'fa-clapperboard',
}

// Destinations that aren't in the tool picker (context-menu tools).
const EXTRA_DESTS = [{ id: 'spectrum', labelKey: 'ctx_spectrum', icon: 'fa-solid fa-circle-nodes' }]

const extOf = name => String(name || '').split('.').pop().toLowerCase()

/** 'audio' | 'image' | 'video' | 'raw' | 'model' | 'iceimg' | 'icevid' | 'icetpl' | null */
export function fileKind(name) {
  const ext = extOf(name)
  for (const [kind, list] of Object.entries(EXTS)) if (list.includes(ext)) return kind
  return null
}

/** Ids of the tools that can open this file, default first. */
export function openersFor(name) {
  return ROUTES[fileKind(name)] || []
}

/** The media payload a tool receives for this file. */
async function mediaFor(file) {
  const kind = fileKind(file.name)
  if (kind === 'image') {
    const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path: file.path })
    return { kind: 'image', dataUrl: `data:${IMAGE_MIMES[extOf(file.name)]};base64,${b64}`, name: file.name, path: file.path }
  }
  return { kind, path: file.path, name: file.name }
}

/** Open `file` ({ path, name }) in `toolId` (opens/focuses the tool's window). */
export async function openFileIn(toolId, file) {
  try { sendMedia(toolId, await mediaFor(file)) }
  catch { window.toast?.(t('send_fail'), 'error') }
}

/** Default action: the first tool able to open the file. False if none. */
export function openWithDefault(file) {
  const [first] = openersFor(file.name)
  if (!first) return false
  openFileIn(first, file)
  return true
}

/** After a file was saved: a success toast with an "Open with…" button, so a
 *  sound exported by an audio tool can go straight to the montage, an
 *  animation, the editor… */
export function toastSaved(message, path) {
  const file = { path, name: String(path).split(/[\\/]/).pop() }
  const el = window.toast?.(message, 'success', 7000)
  if (!el || !openersFor(file.name).length) return
  const b = document.createElement('button')
  b.className = 'toast-action'
  b.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> <span></span>'
  b.querySelector('span').textContent = t('open_with')
  b.addEventListener('click', e => { e.stopPropagation(); showOpenWithMenu(b, file) })
  el.appendChild(b)
}

/** "Open with…" menu listing every tool able to open `file`. */
export function showOpenWithMenu(anchor, file) {
  const all = [...TOOLS, ...EXTRA_TOOLS, ...EXTRA_DESTS]
  const targets = openersFor(file.name)
    .map(id => all.find(tl => tl.id === id))
    .filter(Boolean)
    .map(tl => ({ id: tl.id, labelKey: tl.labelKey, icon: tl.icon.replace(/^fa-solid\s+/, '') }))
  if (!targets.length) { window.toast?.(t('open_with_none'), 'info'); return }
  showSendMenu(anchor, () => mediaFor(file), { targets, title: t('open_with') })
}
