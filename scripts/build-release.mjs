// build-release.mjs — Builds the Windows release with nothing from the build
// machine inside, then checks it.
//
// Why: the Rust compiler bakes the absolute path of every source file into the
// executables (for panic messages). Those paths sit under the builder's user
// profile, so they would carry the Windows account name into every installer.
// They are rewritten here with --remap-path-prefix, computed at run time from
// this machine — no path or name is ever written in this file.
//
// After building, the executables that ship (app, 32-bit VST bridge, bundled
// tools) and every file tracked by git are scanned for the account name, the
// profile path and the global git e-mail. Any hit fails the build.
//
// Usage:
//   npm run release                         full build with installers
//   node scripts/build-release.mjs --no-bundle   executables only (quicker check)
//   npm run release:check                   scan only, no build
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root      = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const args      = process.argv.slice(2)
const checkOnly = args.includes('--check-only')
const noBundle  = args.includes('--no-bundle')

// ── 1. Build with source paths remapped ──────────────────────────────────────
function remapFlags() {
  const pairs = [[homedir(), '~'], [root, '.']]   // most specific last: rustc applies the last match
  const flags = []
  for (const [from, to] of pairs) {
    // rustc compares prefixes byte for byte: cover both drive-letter cases.
    const variants = new Set([from, from.charAt(0).toUpperCase() + from.slice(1), from.charAt(0).toLowerCase() + from.slice(1)])
    for (const v of variants) flags.push(`--remap-path-prefix=${v}=${to}`)
  }
  return flags
}

if (!checkOnly) {
  const flags = remapFlags()
  // CARGO_ENCODED_RUSTFLAGS (0x1f-separated) survives spaces in paths and also
  // reaches the VST bridge build that `beforeBuildCommand` starts.
  const existing = process.env.CARGO_ENCODED_RUSTFLAGS || (process.env.RUSTFLAGS || '').split(' ').filter(Boolean).join('\x1f')
  const env = { ...process.env, CARGO_ENCODED_RUSTFLAGS: [existing, ...flags].filter(Boolean).join('\x1f') }
  delete env.RUSTFLAGS
  console.log('[release] building with source paths remapped…')
  execSync(`npx tauri build${noBundle ? ' --no-bundle' : ''}`, { cwd: root, stdio: 'inherit', env, shell: true })
}

// ── 2. Scan what ships ───────────────────────────────────────────────────────
const needles = new Set()
const user = userInfo().username
if (user && user.length >= 3) {
  for (const v of [user, user.toLowerCase(), user.toUpperCase(), user.charAt(0).toUpperCase() + user.slice(1).toLowerCase()]) needles.add(v)
}
for (const h of [homedir(), homedir().replace(/\\/g, '/')]) needles.add(h)
try {
  const mail = execSync('git config --global user.email', { cwd: root, encoding: 'utf8' }).trim()
  if (mail && !mail.endsWith('@users.noreply.github.com')) needles.add(mail)
} catch {}

const patterns = [...needles].flatMap(n => [
  { label: n, buf: Buffer.from(n, 'utf8') },
  { label: n + ' (UTF-16)', buf: Buffer.from(n, 'utf16le') },
])

function scanBuffer(buf) {
  const hits = []
  for (const p of patterns) {
    let count = 0
    for (let i = buf.indexOf(p.buf); i !== -1; i = buf.indexOf(p.buf, i + 1)) count++
    if (count) hits.push(`${count}× ${mask(p.label)}`)
  }
  return hits
}
// Never print the name itself in the report (logs get pasted around).
function mask(s) { return s.length <= 2 ? '**' : s[0] + '*'.repeat(Math.max(1, s.length - 2)) + s[s.length - 1] }

const shipped = [
  'src-tauri/target/release/iceample.exe',
  'src-tauri/bridge/iceample-vst-bridge.exe',
  ...(existsSync(join(root, 'src-tauri/binaries'))
    ? readdirSync(join(root, 'src-tauri/binaries')).filter(f => f.endsWith('.exe')).map(f => 'src-tauri/binaries/' + f)
    : []),
]

let problems = 0
console.log('\n[release] checking the executables that ship…')
for (const rel of shipped) {
  const p = join(root, rel)
  if (!existsSync(p)) { console.log(`  - ${rel}: not built yet (skipped)`); continue }
  const hits = scanBuffer(readFileSync(p))
  if (hits.length) { problems++; console.log(`  ✗ ${rel}: ${hits.join(', ')}`) }
  else console.log(`  ✓ ${rel}`)
}

console.log('[release] checking the files that go to GitHub (tracked, or new and not ignored)…')
const tracked = execSync('git ls-files -z -c -o --exclude-standard', { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
let trackedHits = 0
for (const rel of tracked) {
  const p = join(root, rel)
  if (!existsSync(p)) continue
  const hits = scanBuffer(readFileSync(p))
  if (hits.length) { trackedHits++; console.log(`  ✗ ${rel}: ${hits.join(', ')}`) }
}
if (!trackedHits) console.log(`  ✓ ${tracked.length} files`)
problems += trackedHits

if (problems) {
  console.error(`\n[release] FAILED: ${problems} file(s) contain something from this machine. Do not publish.`)
  process.exit(1)
}
console.log('\n[release] OK: nothing from this machine in what ships.')
if (!checkOnly && !noBundle) {
  console.log('Installers: src-tauri/target/release/bundle/nsis and src-tauri/target/release/bundle/msi')
}
