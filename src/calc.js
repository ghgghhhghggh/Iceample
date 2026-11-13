// calc.js — Calculator utility
import { t } from './i18n.js'

function injectStyles() {
  if (document.getElementById('calc-styles')) return
  const s = document.createElement('style'); s.id = 'calc-styles'
  s.textContent = `
.calc-wrap{display:flex;flex-direction:column;height:100%;background:var(--surface);font-family:inherit;user-select:none}
.calc-display{padding:12px 16px 8px;display:flex;flex-direction:column;align-items:flex-end;gap:2px;border-bottom:1px solid var(--win-border-in);flex-shrink:0}
.calc-expr{font-size:11px;color:var(--text-secondary);min-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.calc-val{font-size:28px;font-weight:300;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.calc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--win-border-in);flex:1}
.calc-key{display:flex;align-items:center;justify-content:center;background:var(--surface);color:var(--text-primary);font-size:16px;font-family:inherit;cursor:pointer;border:none;transition:background .08s}
.calc-key:hover{background:color-mix(in srgb,var(--text-primary) 10%,var(--surface))}
.calc-key:active{background:color-mix(in srgb,var(--text-primary) 18%,var(--surface))}
.calc-key.op{color:var(--color-active)}
.calc-key.fn{color:var(--text-secondary);font-size:13px}
.calc-key.eq{background:var(--btn-primary);color:var(--on-accent)}
.calc-key.eq:hover{background:color-mix(in srgb,var(--btn-primary) 85%,#fff)}
.calc-key.eq:active{background:color-mix(in srgb,var(--btn-primary) 70%,#fff)}
.calc-key.zero{grid-column:span 2}
`
  document.head.appendChild(s)
}

export function initCalc(body) {
  injectStyles()

  let expr = ''
  let result = '0'
  let justEvaled = false
  let opPending = false   // an operator was just pressed: the next digit starts a new number

  body.innerHTML = `
<div class="calc-wrap">
  <div class="calc-display">
    <div class="calc-expr" id="calc-expr"></div>
    <div class="calc-val" id="calc-val">0</div>
  </div>
  <div class="calc-grid" id="calc-grid"></div>
</div>`

  const exprEl = body.querySelector('#calc-expr')
  const valEl  = body.querySelector('#calc-val')
  const grid   = body.querySelector('#calc-grid')

  const keys = [
    { label:'C',   cls:'fn',           action:'clear'  },
    { label:'+/−', cls:'fn',           action:'negate' },
    { label:'%',   cls:'fn op',        action:'pct'    },
    { label:'÷',   cls:'op',           action:'op:/'   },
    { label:'7',   cls:'',             action:'d:7'    },
    { label:'8',   cls:'',             action:'d:8'    },
    { label:'9',   cls:'',             action:'d:9'    },
    { label:'×',   cls:'op',           action:'op:*'   },
    { label:'4',   cls:'',             action:'d:4'    },
    { label:'5',   cls:'',             action:'d:5'    },
    { label:'6',   cls:'',             action:'d:6'    },
    { label:'−',   cls:'op',           action:'op:-'   },
    { label:'1',   cls:'',             action:'d:1'    },
    { label:'2',   cls:'',             action:'d:2'    },
    { label:'3',   cls:'',             action:'d:3'    },
    { label:'+',   cls:'op',           action:'op:+'   },
    { label:'0',   cls:'zero',         action:'d:0'    },
    { label:'.',   cls:'',             action:'dot'    },
    { label:'=',   cls:'eq',           action:'eval'   },
  ]

  keys.forEach(k => {
    const btn = document.createElement('button')
    btn.className = 'calc-key ' + k.cls
    btn.textContent = k.label
    btn.addEventListener('click', () => dispatch(k.action))
    grid.appendChild(btn)
  })

  function display(v) { valEl.textContent = v; exprEl.textContent = expr }

  function dispatch(action) {
    if (action === 'clear') { expr = ''; result = '0'; justEvaled = false; opPending = false; display('0'); return }
    if (action === 'negate') {
      if (result !== '0' && result !== 'Error') { result = result.startsWith('-') ? result.slice(1) : '-' + result; display(result) }
      return
    }
    if (action === 'pct') {
      if (result !== 'Error') { result = String(parseFloat(result) / 100); display(result) }
      return
    }
    if (action === 'dot') {
      if (justEvaled) { expr = ''; result = '0'; justEvaled = false }
      opPending = false
      if (!result.includes('.')) { result += '.'; display(result) }
      return
    }
    if (action.startsWith('d:')) {
      const d = action[2]
      if (justEvaled) { expr = ''; result = '0'; justEvaled = false }
      opPending = false
      result = result === '0' ? d : result + d
      display(result)
      return
    }
    if (action.startsWith('op:')) {
      const sym = {'/':'÷','*':'×','-':'−','+':'+'}[action[3]] || action[3]
      if (result === 'Error') return
      if (opPending && expr) {
        expr = expr.slice(0, -1) + sym          // operator pressed twice: keep the last one
      } else {
        const base = justEvaled ? '' : expr     // after "=", the result starts a new expression
        expr = (base ? base + ' ' : '') + result + ' ' + sym
      }
      result = '0'                               // the operand being typed (was overwritten by the operator)
      justEvaled = false
      opPending = true
      display('0')
      return
    }
    if (action === 'eval') {
      if (!expr) return
      const full = expr + ' ' + result
      try {
        const safe = full.replace(/÷/g,'/').replace(/×/g,'*').replace(/−/g,'-')
        // parse and evaluate the expression manually
        const val = evalExpr(safe)
        expr = full + ' ='
        result = String(Number.isFinite(val) ? +val.toFixed(10) : 'Error')
        justEvaled = true
        opPending = false
        display(result)
      } catch { result = 'Error'; display('Error') }
      return
    }
  }

  function evalExpr(s) {
    // tokenise and evaluate a flat a op b op c ... expression (no parentheses)
    const tokens = s.trim().split(/\s+/)
    // first pass: * /
    let i = 0, arr = [...tokens]
    while (i < arr.length) {
      if (arr[i] === '*' || arr[i] === '/') {
        const a = parseFloat(arr[i-1]), b = parseFloat(arr[i+1])
        const r = arr[i] === '*' ? a*b : b === 0 ? Infinity : a/b
        arr.splice(i-1, 3, r)
        i = 0
      } else i++
    }
    // second pass: + -
    let res = parseFloat(arr[0])
    for (let j = 1; j < arr.length; j += 2) {
      const v = parseFloat(arr[j+1])
      if (arr[j] === '+') res += v
      else if (arr[j] === '-') res -= v
    }
    return res
  }

  // Keyboard support
  const onKey = e => {
    if (!document.contains(body)) { document.removeEventListener('keydown', onKey); return }
    // Only when the calculator is the focused window, and never while typing
    // in a field (it used to swallow digits and "/" typed anywhere in the app).
    if (!body.closest('.tool-win')?.classList.contains('focused')) return
    const tg = e.target
    if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key
    if (k >= '0' && k <= '9') dispatch('d:'+k)
    else if (k === '.') dispatch('dot')
    else if (k === '+') dispatch('op:+')
    else if (k === '-') dispatch('op:-')
    else if (k === '*') dispatch('op:*')
    else if (k === '/') { e.preventDefault(); dispatch('op:/') }
    else if (k === 'Enter' || k === '=') dispatch('eval')
    else if (k === 'Escape' || k === 'Delete') dispatch('clear')
    else if (k === 'Backspace') {
      if (justEvaled || opPending) return
      result = result.length > 1 ? result.slice(0, -1) : '0'
      if (result === '-') result = '0'
      display(result)
    }
  }
  document.addEventListener('keydown', onKey)
}
