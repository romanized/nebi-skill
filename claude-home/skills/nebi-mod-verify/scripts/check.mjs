#!/usr/bin/env node
// Check a capture.mjs run: clutter strings absent, promised strings present, every enabled nebi mod loaded.
//   node check.mjs <runDir> [--baseline <runDir>] [--present TEXT]... [--absent TEXT]...
// Exit 0 when every check passes, 1 when one fails, 2 on bad input. Writes <runDir>/checklist.json.
// A --safe-mode run is recorded and compared, never asserted (stock Claude Code shows the clutter).
// Gotchas:
// - Matching is case-sensitive, with no-break and other Unicode spaces read as plain spaces ("NEED\u00a0YOU").
// - The welcome banner ("Claude Code v2.x" plus the model line) is skipped: it is the engine's, and it still
//   says "(1M context)" whatever the status line does.
// - The beacon's one-row NEED YOU badge is allowed; NEED YOU with answer keys ("1: …  2: …  0: dismiss") is not.
// - Absent strings are checked on the final screens and in the scrollback; present strings on the final screen.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ABSENT = ['(1M context)', 'shift+tab to cycle', 'Baked for', 'Churned for', 'background task',
  'recap:', 'new task?']
const SCENES = ['turn-end', 'mid-turn']
const LOAD_FAILURE = /not loaded|did not load|does not load|failed to load|could not build|failed in engine\.create|refused|does not validate/

const norm = t => t.replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ')

/** Drop the welcome banner: from a "Claude Code v<digit>" line in the first rows through the next blank line. */
export function stripBanner(text) {
  const lines = text.split('\n')
  const at = lines.slice(0, 8).findIndex(l => /Claude Code v\d/.test(l))
  if (at < 0) return text
  let end = at
  while (end < lines.length && lines[end].trim() !== '') end++
  return [...lines.slice(0, at), ...lines.slice(end)].join('\n')
}

/** A NEED YOU row followed, within three rows, by answer keys such as "1: Yes" or "0: dismiss". */
export function needYouWithKeys(text) {
  const lines = text.split('\n')
  return lines.some((l, i) => l.includes('NEED YOU') && lines.slice(i, i + 4).some(r => /(?:^|\s)r?\d:\s+\S/.test(r)))
}

/** Enabled nebi mods ("nebi-x@market") from a settings.json, or [] when it cannot be read. */
export function enabledNebiMods(settingsFile) {
  try {
    const plugins = JSON.parse(readFileSync(settingsFile, 'utf8')).enabledPlugins ?? {}
    return Object.entries(plugins).filter(([id, on]) => on === true && /^nebi-[\w-]+@/.test(id)).map(([id]) => id)
  } catch { return [] }
}

/** Every enabled mod has a "hooks module <id> loaded" line; no line names a nebi mod with a failure.
 * "hooks modules not loaded until workspace trust is accepted" is the engine waiting on the trust dialog the
 * capture answers; it passes when every enabled mod has its own loaded line after it. */
export function loadCheck(log, mods) {
  const lines = log.split('\n')
  const failures = []
  const loadedAt = id => lines.findLastIndex(l => l.includes(`hooks module ${id} loaded`))
  for (const id of mods) {
    if (loadedAt(id) < 0) failures.push(`${id}: no "hooks module ${id} loaded" line`)
  }
  lines.forEach((l, i) => {
    if (/hooks modules not loaded until workspace trust is accepted/.test(l)) {
      if (mods.some(id => loadedAt(id) < i)) failures.push(`${l.trim()} (and no loaded line after it for every enabled mod)`)
    } else if (/hooks modules (?:not loaded|are turned off)/.test(l)) failures.push(l.trim())
    else if (/\bnebi-[\w-]+/.test(l) && /hooks module/.test(l) && LOAD_FAILURE.test(l)) failures.push(l.trim())
  })
  return failures
}

export function checkRun(dir, { present = [], absent = [] } = {}) {
  const meta = existsSync(join(dir, 'meta.json')) ? JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) : {}
  const read = f => (existsSync(join(dir, f)) ? stripBanner(norm(readFileSync(join(dir, f), 'utf8'))) : null)
  const mods = meta.safeMode ? [] : enabledNebiMods(join(meta.configDir ?? join(process.env.HOME, '.claude'), 'settings.json'))
  const result = { dir: resolve(dir), safeMode: !!meta.safeMode, mods, scenes: {}, failures: [] }
  const fail = msg => { if (!meta.safeMode) result.failures.push(msg) }
  const wantAbsent = [...ABSENT, ...absent]
  for (const scene of SCENES) {
    const screen = read(`${scene}.txt`)
    if (screen === null) { result.scenes[scene] = { missing: true }; result.failures.push(`${scene}: not captured`); continue }
    const all = `${screen}\n${read(`${scene}.full.txt`) ?? ''}`
    const row = { absent: {}, present: {}, needYouWithKeys: needYouWithKeys(screen) }
    for (const s of wantAbsent) { row.absent[s] = all.includes(s); if (row.absent[s]) fail(`${scene}: "${s}" is on screen`) }
    if (row.needYouWithKeys) fail(`${scene}: NEED YOU shows answer keys`)
    if (scene === 'turn-end') {
      const wantPresent = ['❓', ...(mods.some(m => m.startsWith('nebi-beacon@')) ? ['NEED YOU'] : []), ...present]
      for (const s of wantPresent) { row.present[s] = screen.includes(s); if (!row.present[s]) fail(`${scene}: "${s}" is missing`) }
    }
    result.scenes[scene] = row
  }
  // capture.mjs's settings guard: a changed permissions/enabledPlugins fails every run, safe mode included.
  for (const f of meta.settingsGuard?.files ?? []) {
    for (const d of f.guardedDiff) result.failures.push(`settings: ${f.file}: ${d}${f.restored ? ' (restored from the snapshot)' : ''}`)
    if (f.otherChangedKeys.length) (result.settingsOtherKeys ??= {})[f.file] = f.otherChangedKeys
  }
  if (!meta.safeMode) {
    const logFile = meta.debugLog ?? join(dir, 'debug.log')
    if (!existsSync(logFile)) result.failures.push(`no debug log at ${logFile}`)
    else for (const f of loadCheck(readFileSync(logFile, 'utf8'), mods)) result.failures.push(`load: ${f}`)
  }
  writeFileSync(join(dir, 'checklist.json'), JSON.stringify(result, null, 2) + '\n')
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const opts = { present: [], absent: [] }
  let dir, baseline
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--baseline') baseline = argv[++i]
    else if (argv[i] === '--present' || argv[i] === '--absent') opts[argv[i].slice(2)].push(argv[++i])
    else if (!dir && !argv[i].startsWith('--')) dir = argv[i]
    else { console.error(`unknown option ${argv[i]}`); process.exit(2) }
  }
  if (!dir || !existsSync(dir)) { console.error('usage: node check.mjs <runDir> [--baseline <runDir>] [--present TEXT]... [--absent TEXT]...'); process.exit(2) }
  const run = checkRun(dir, opts)
  const base = baseline ? checkRun(baseline, opts) : null
  const mark = v => (v === undefined ? '-' : v ? 'yes' : 'no')
  for (const scene of SCENES) {
    const r = run.scenes[scene], b = base?.scenes[scene]
    if (!r || r.missing) continue
    console.log(`\n${scene}${base ? ` (baseline -> ${run.safeMode ? 'safe mode' : 'this run'})` : ''}`)
    for (const [kind, rows] of [['absent', r.absent], ['present', r.present]]) {
      for (const [s, seen] of Object.entries(rows)) {
        console.log(`  ${kind.padEnd(7)} ${s.padEnd(20)} ${base ? `${mark(b?.[kind]?.[s]).padEnd(3)} -> ` : ''}${mark(seen)}`)
      }
    }
  }
  console.log(`\nmods checked: ${run.mods.length ? run.mods.join(', ') : run.safeMode ? 'none (safe mode)' : 'none enabled'}`)
  for (const [file, keys] of Object.entries(run.settingsOtherKeys ?? {})) console.log(`settings ${file}: other keys changed during the run, left as they are: ${keys.join(', ')}`)
  if (run.safeMode) {
    for (const f of run.failures) console.log(`FAIL ${f}`)
    console.log('safe-mode baseline recorded, screens not asserted')
    process.exit(run.failures.length ? 1 : 0)
  }
  for (const f of run.failures) console.log(`FAIL ${f}`)
  console.log(run.failures.length ? `${run.failures.length} check(s) failed` : 'all checks passed')
  process.exit(run.failures.length ? 1 : 0)
}
