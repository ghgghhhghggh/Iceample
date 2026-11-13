// material-presets.js — shared material presets (built-in + user-created),
// usable across tools (3D editor, image editor, …) for consistent styles.
// A preset is a plain bag of material params: { name, roughness, metalness,
// opacity, baseColor, mapKind, gradC2, relief, emissive ('AUTO'|hex|null),
// emissiveInt }. Tools map these onto their own material objects.

const LS = 'iceample:presets'
const OLD_LS = 'iceample:tool3d:presets'   // pre-shared location (migrated once)

export const BUILTIN_PRESETS = [
  { id: 'chrome',  nameKey: 'mp_chrome',  metalness: 1, roughness: 0.05, opacity: 1 },
  { id: 'gold',    nameKey: 'mp_gold',    metalness: 1, roughness: 0.25, opacity: 1, baseColor: '#ffcf5a', mapKind: 'none' },
  { id: 'glass',   nameKey: 'mp_glass',   metalness: 0, roughness: 0.0,  opacity: 0.35 },
  { id: 'plastic', nameKey: 'mp_plastic', metalness: 0, roughness: 0.45, opacity: 1 },
  { id: 'neon',    nameKey: 'mp_neon',    metalness: 0, roughness: 0.5,  opacity: 1, emissive: 'AUTO', emissiveInt: 1.6 },
  { id: 'matte',   nameKey: 'mp_matte',   metalness: 0, roughness: 1,    opacity: 1 },
]

function load() {
  try { const cur = JSON.parse(localStorage.getItem(LS)); if (Array.isArray(cur)) return cur } catch {}
  try { const old = JSON.parse(localStorage.getItem(OLD_LS)); if (Array.isArray(old) && old.length) { localStorage.setItem(LS, JSON.stringify(old)); return old } } catch {}
  return []
}
let _user = load()
function persist() {
  try { localStorage.setItem(LS, JSON.stringify(_user)) } catch {}
  window.dispatchEvent(new CustomEvent('iceample-presets-changed'))
}

export function getUserPresets() { return _user.slice() }
export function addUserPreset(p) { _user.push(p); persist(); return _user.length - 1 }
export function deleteUserPreset(i) { if (i >= 0 && i < _user.length) { _user.splice(i, 1); persist() } }
export function renameUserPreset(i, name) { if (_user[i] && name) { _user[i].name = name; persist() } }
