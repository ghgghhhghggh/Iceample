// units.js — Unit converter utility
import { t } from './i18n.js'

// Each category: { label(), units:[{id, label(), toBase, fromBase}] }
// toBase / fromBase convert to/from a canonical base unit
// Labels are functions so they are translated at render time (a language switch
// applies on the next render). Unit symbols stay untranslated.
const CATEGORIES = [
  {
    id: 'length', icon: 'fa-ruler-horizontal', label: () => t('un_cat_length'),
    base: 'm',
    units: [
      { id:'km',  label:() => `${t('un_kilometre')} (km)`,     toBase: v=>v*1000,        fromBase: v=>v/1000 },
      { id:'m',   label:() => `${t('un_metre')} (m)`,          toBase: v=>v,             fromBase: v=>v },
      { id:'cm',  label:() => `${t('un_centimetre')} (cm)`,    toBase: v=>v/100,         fromBase: v=>v*100 },
      { id:'mm',  label:() => `${t('un_millimetre')} (mm)`,    toBase: v=>v/1000,        fromBase: v=>v*1000 },
      { id:'mi',  label:() => `${t('un_mile')} (mi)`,          toBase: v=>v*1609.344,    fromBase: v=>v/1609.344 },
      { id:'yd',  label:() => `${t('un_yard')} (yd)`,          toBase: v=>v*0.9144,      fromBase: v=>v/0.9144 },
      { id:'ft',  label:() => `${t('un_foot')} (ft)`,          toBase: v=>v*0.3048,      fromBase: v=>v/0.3048 },
      { id:'in',  label:() => `${t('un_inch')} (in)`,          toBase: v=>v*0.0254,      fromBase: v=>v/0.0254 },
    ]
  },
  {
    id: 'area', icon: 'fa-vector-square', label: () => t('un_cat_area'),
    base: 'm2',
    units: [
      { id:'km2', label:() => 'km²',                           toBase: v=>v*1e6,         fromBase: v=>v/1e6 },
      { id:'m2',  label:() => 'm²',                            toBase: v=>v,             fromBase: v=>v },
      { id:'cm2', label:() => 'cm²',                           toBase: v=>v/1e4,         fromBase: v=>v*1e4 },
      { id:'mm2', label:() => 'mm²',                           toBase: v=>v/1e6,         fromBase: v=>v*1e6 },
      { id:'ha',  label:() => `${t('un_hectare')} (ha)`,       toBase: v=>v*1e4,         fromBase: v=>v/1e4 },
      { id:'ac',  label:() => `${t('un_acre')} (ac)`,          toBase: v=>v*4046.856,    fromBase: v=>v/4046.856 },
      { id:'ft2', label:() => 'ft²',                           toBase: v=>v*0.092903,    fromBase: v=>v/0.092903 },
      { id:'in2', label:() => 'in²',                           toBase: v=>v*0.00064516,  fromBase: v=>v/0.00064516 },
    ]
  },
  {
    id: 'screen', icon: 'fa-desktop', label: () => t('un_cat_screen'),
    base: 'px_96',
    units: [
      { id:'px',  label:() => `${t('un_pixel')} (px) @96dpi`,  toBase: v=>v,             fromBase: v=>v },
      { id:'pt',  label:() => `${t('un_point')} (pt)`,         toBase: v=>v*96/72,       fromBase: v=>v*72/96 },
      { id:'pc',  label:() => `${t('un_pica')} (pc)`,          toBase: v=>v*16,          fromBase: v=>v/16 },
      { id:'cm_s',label:() => `${t('un_centimetre')} @96dpi`,  toBase: v=>v*96/2.54,     fromBase: v=>v*2.54/96 },
      { id:'mm_s',label:() => `${t('un_millimetre')} @96dpi`,  toBase: v=>v*96/25.4,     fromBase: v=>v*25.4/96 },
      { id:'in_s',label:() => `${t('un_inch')} @96dpi`,        toBase: v=>v*96,          fromBase: v=>v/96 },
      { id:'em',  label:() => `em (${t('un_base_16px')})`,     toBase: v=>v*16,          fromBase: v=>v/16 },
      { id:'rem', label:() => `rem (${t('un_base_16px')})`,    toBase: v=>v*16,          fromBase: v=>v/16 },
    ]
  },
  {
    id: 'weight', icon: 'fa-weight-hanging', label: () => t('un_cat_weight'),
    base: 'kg',
    units: [
      { id:'t',   label:() => `${t('un_tonne')} (t)`,          toBase: v=>v*1000,        fromBase: v=>v/1000 },
      { id:'kg',  label:() => `${t('un_kilogram')} (kg)`,      toBase: v=>v,             fromBase: v=>v },
      { id:'g',   label:() => `${t('un_gram')} (g)`,           toBase: v=>v/1000,        fromBase: v=>v*1000 },
      { id:'mg',  label:() => `${t('un_milligram')} (mg)`,     toBase: v=>v/1e6,         fromBase: v=>v*1e6 },
      { id:'lb',  label:() => `${t('un_pound')} (lb)`,         toBase: v=>v*0.453592,    fromBase: v=>v/0.453592 },
      { id:'oz',  label:() => `${t('un_ounce')} (oz)`,         toBase: v=>v*0.0283495,   fromBase: v=>v/0.0283495 },
    ]
  },
  {
    id: 'temp', icon: 'fa-temperature-half', label: () => t('un_cat_temp'),
    base: 'k',
    units: [
      { id:'c',   label:() => `${t('un_celsius')} (°C)`,       toBase: v=>v+273.15,      fromBase: v=>v-273.15 },
      { id:'f',   label:() => `${t('un_fahrenheit')} (°F)`,    toBase: v=>(v-32)*5/9+273.15, fromBase: v=>(v-273.15)*9/5+32 },
      { id:'k',   label:() => `${t('un_kelvin')} (K)`,         toBase: v=>v,             fromBase: v=>v },
    ]
  },
  {
    id: 'storage', icon: 'fa-hard-drive', label: () => t('un_cat_storage'),
    base: 'b',
    units: [
      { id:'bit', label:() => t('un_bit'),                     toBase: v=>v,             fromBase: v=>v },
      { id:'B',   label:() => `${t('un_byte')} (B)`,           toBase: v=>v*8,           fromBase: v=>v/8 },
      { id:'KB',  label:() => `${t('un_kilobyte')} (KB)`,      toBase: v=>v*8*1024,      fromBase: v=>v/8/1024 },
      { id:'MB',  label:() => `${t('un_megabyte')} (MB)`,      toBase: v=>v*8*1024**2,   fromBase: v=>v/8/1024**2 },
      { id:'GB',  label:() => `${t('un_gigabyte')} (GB)`,      toBase: v=>v*8*1024**3,   fromBase: v=>v/8/1024**3 },
      { id:'TB',  label:() => `${t('un_terabyte')} (TB)`,      toBase: v=>v*8*1024**4,   fromBase: v=>v/8/1024**4 },
    ]
  },
  {
    id: 'speed', icon: 'fa-gauge-high', label: () => t('un_cat_speed'),
    base: 'ms',
    units: [
      { id:'ms',  label:() => 'm/s',                           toBase: v=>v,             fromBase: v=>v },
      { id:'kmh', label:() => 'km/h',                          toBase: v=>v/3.6,         fromBase: v=>v*3.6 },
      { id:'mph', label:() => 'mph',                           toBase: v=>v*0.44704,     fromBase: v=>v/0.44704 },
      { id:'kn',  label:() => `${t('un_knot')} (kn)`,          toBase: v=>v*0.514444,    fromBase: v=>v/0.514444 },
    ]
  },
]

function injectStyles() {
  if (document.getElementById('units-styles')) return
  const s = document.createElement('style'); s.id = 'units-styles'
  s.textContent = `
.u-wrap{display:flex;flex-direction:column;height:100%;background:var(--surface);color:var(--text-primary);font-family:inherit;font-size:12px}
.u-cats{display:flex;flex-wrap:wrap;gap:4px;padding:8px;border-bottom:1px solid var(--win-border-in);flex-shrink:0}
.u-cat{padding:3px 10px;border:1px solid var(--win-border-in);border-radius:20px;background:none;color:var(--text-secondary);font-size:10px;cursor:pointer;font-family:inherit}
.u-cat:hover{border-color:var(--win-border);color:var(--text-primary)}
.u-cat.active{border-color:var(--color-active);background:color-mix(in srgb,var(--color-active) 15%,transparent);color:var(--color-active)}
.u-body{flex:1;overflow-y:auto;padding:10px 8px;display:flex;flex-direction:column;gap:6px}
.u-row{display:flex;align-items:center;gap:6px}
.u-inp{flex:1;padding:7px 10px;background:color-mix(in srgb,var(--surface) 70%,#000) !important;border:1px solid var(--win-border-in);border-radius:6px;color:var(--text-primary) !important;font-size:13px;font-family:inherit;outline:none}
.u-inp:focus{border-color:var(--color-active);background:color-mix(in srgb,var(--surface) 70%,#000)}
.u-inp:-webkit-autofill,.u-inp:-webkit-autofill:focus{-webkit-box-shadow:0 0 0 100px color-mix(in srgb,var(--surface) 70%,#000) inset;-webkit-text-fill-color:var(--text-primary)}
.u-lbl{width:140px;flex-shrink:0;font-size:10px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.u-copy{width:26px;height:26px;flex-shrink:0;border:1px solid var(--win-border-in);border-radius:5px;background:none;color:var(--text-secondary);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;opacity:.6}
.u-copy:hover{color:var(--text-primary);border-color:var(--win-border);opacity:1}
.u-from-lbl{font-size:10px;color:var(--text-secondary)}
.u-sel{flex:1;padding:6px 8px;background:color-mix(in srgb,var(--surface) 70%,#000);border:1px solid var(--win-border-in);border-radius:6px;color:var(--text-primary);font-size:11px;font-family:inherit;outline:none}
.u-sel:focus{border-color:var(--color-active)}
.u-sep{height:1px;background:var(--win-border-in);margin:2px 0 6px}
`
  document.head.appendChild(s)
}

export function initUnits(body) {
  injectStyles()

  let activeCat = CATEGORIES[0]
  let activeFrom = activeCat.units[0]

  body.innerHTML = `<div class="u-wrap"><div class="u-cats" id="u-cats"></div><div class="u-body" id="u-body"></div></div>`

  const catsEl = body.querySelector('#u-cats')
  const bodyEl = body.querySelector('#u-body')

  function renderCats() {
    catsEl.innerHTML = ''
    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button'); btn.className = 'u-cat' + (cat.id===activeCat.id?' active':'')
      btn.innerHTML = `<i class="fa-solid ${cat.icon}"></i> ${cat.label()}`
      btn.addEventListener('click', () => { activeCat = cat; activeFrom = cat.units[0]; renderCats(); renderRows() })
      catsEl.appendChild(btn)
    })
  }

  function renderRows() {
    bodyEl.innerHTML = ''
    // "From" selector
    const fromRow = document.createElement('div'); fromRow.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:4px'
    const fromSel = document.createElement('select'); fromSel.className = 'u-sel'
    activeCat.units.forEach(u => { const o=document.createElement('option'); o.value=u.id; o.textContent=u.label(); if(u.id===activeFrom.id) o.selected=true; fromSel.appendChild(o) })
    const fromLbl = document.createElement('span'); fromLbl.className = 'u-from-lbl'; fromLbl.textContent=t('un_from')
    fromSel.addEventListener('change', () => { activeFrom=activeCat.units.find(u=>u.id===fromSel.value)||activeCat.units[0]; renderRows() })
    fromRow.append(fromLbl, fromSel)
    bodyEl.appendChild(fromRow)

    // Separator
    const sep = document.createElement('div'); sep.className = 'u-sep'; bodyEl.appendChild(sep)

    // Rows — one input per target unit
    const inputs = []
    activeCat.units.forEach(u => {
      const row = document.createElement('div'); row.className='u-row'
      const lbl = document.createElement('div'); lbl.className='u-lbl'; lbl.textContent=u.label(); lbl.title=lbl.textContent
      const inp = document.createElement('input'); inp.type='number'; inp.className='u-inp'; inp.placeholder='0'
      const cpyBtn = document.createElement('button'); cpyBtn.className='u-copy'; cpyBtn.innerHTML='<i class="fa-solid fa-copy"></i>'
      cpyBtn.addEventListener('click', () => { navigator.clipboard?.writeText(inp.value || '0'); window.toast?.(t('un_copied'), 'success') })

      inp.addEventListener('input', () => {
        const val = parseFloat(inp.value)
        if (isNaN(val)) { inputs.forEach(({inp:i2})=>{if(i2!==inp)i2.value=''}); return }
        const base = u.toBase(val)   // this row's own unit (it used to read the 'from' unit)
        inputs.forEach(({u:u2, inp:i2}) => {
          if (i2===inp) return
          const res = u2.fromBase(base)
          i2.value = +res.toFixed(8)
        })
      })

      if (u.id===activeFrom.id) inp.style.borderColor='var(--color-active)'
      row.append(lbl, inp, cpyBtn); bodyEl.appendChild(row)
      inputs.push({u, inp})
    })
  }

  renderCats()
  renderRows()
}
