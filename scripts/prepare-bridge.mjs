// Builds the 32-bit VST bridge and copies it where Tauri bundles resources.
// Run automatically by `tauri build` via `beforeBuildCommand`.
import { execSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root      = join(dirname(fileURLToPath(import.meta.url)), '..');
const bridgeDir = join(root, 'vst-bridge');
const target    = 'i686-pc-windows-msvc';
const exeName   = 'iceample-vst-bridge.exe';

console.log('[prepare-bridge] building 32-bit VST bridge…');
execSync(`cargo build --release --target ${target}`, { cwd: bridgeDir, stdio: 'inherit' });

const built = join(bridgeDir, 'target', target, 'release', exeName);
if (!existsSync(built)) {
  console.error(`[prepare-bridge] build output not found: ${built}`);
  process.exit(1);
}

const destDir = join(root, 'src-tauri', 'bridge');
mkdirSync(destDir, { recursive: true });
copyFileSync(built, join(destDir, exeName));
console.log(`[prepare-bridge] copied → src-tauri/bridge/${exeName}`);
