// npm packages for the paint check, installed once into a cache folder outside the skill.
// Gotchas:
// - The first run needs the network (npm install); later runs are offline.
// - Versions are pinned; bump them here and delete the cache folder to upgrade.
// - NEBI_MOD_VERIFY_CACHE moves the cache (default ~/.cache/nebi-mod-verify).
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import os from 'node:os'

export const CACHE = process.env.NEBI_MOD_VERIFY_CACHE || join(os.homedir(), '.cache', 'nebi-mod-verify')
const DEPS = { '@xterm/headless': '6.0.0', '@fontsource/jetbrains-mono': '5.3.0' }

export function ensureDeps() {
  const missing = Object.keys(DEPS).filter(name => !existsSync(join(CACHE, 'node_modules', name, 'package.json')))
  if (missing.length) {
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(join(CACHE, 'package.json'), JSON.stringify({ private: true, dependencies: DEPS }, null, 2) + '\n')
    console.log(`first run: installing ${missing.join(', ')} into ${CACHE}`)
    execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: CACHE, stdio: 'inherit' })
  }
  return createRequire(join(CACHE, 'package.json'))
}

export const fontDir = () => join(CACHE, 'node_modules', '@fontsource', 'jetbrains-mono', 'files')
