// media-url.js — Turns a file path into a URL that <video>, <audio> and <img>
// can load.
//
// file:// URLs are refused by the webview (the page is served from
// http://tauri.localhost), so:
//   desktop → Tauri's asset protocol (convertFileSrc; enabled in tauri.conf.json)
//   web     → the file lives in the browser library (IndexedDB): read it once
//             and serve it as a blob URL (cached per path).

const MIMES = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', aif: 'audio/aiff', aiff: 'audio/aiff',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
}
const isWeb = () => !!window.__ICEAMPLE_WEB__
const _blobUrls = new Map()   // web: path → blob URL

/** Synchronous URL when one can be built right away (desktop always; web once
 *  the file was resolved by mediaUrl()). Null otherwise. */
export function mediaUrlSync(path) {
  if (!path) return null
  if (!isWeb()) {
    const conv = window.__TAURI__?.core?.convertFileSrc
    return conv ? conv(String(path)) : null
  }
  return _blobUrls.get(String(path)) || null
}

/** URL for `path`, resolving it if needed (web: reads the file once). */
export async function mediaUrl(path) {
  const ready = mediaUrlSync(path)
  if (ready || !path) return ready
  const b64 = await window.__TAURI__.core.invoke('read_file_base64', { path })
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ext = String(path).split('.').pop().toLowerCase()
  const url = URL.createObjectURL(new Blob([bytes], { type: MIMES[ext] || '' }))
  _blobUrls.set(String(path), url)
  return url
}
