#!/usr/bin/env node
// Paint check: run a real `claude` session in a fixed-size pty, capture what the screen shows, then check it.
//   node capture.mjs [--label after] [--out DIR] [--safe-mode] [--cols 150] [--rows 46] [--model NAME]
//                    [--present TEXT]... [--absent TEXT]...
// Writes <out>/turn-end.{png,txt,full.txt,html}, mid-turn.*, debug.log, session.cast, meta.json, then runs
// check.mjs on it and exits with its code (0 pass, 1 fail). --safe-mode is the stock baseline: no CLAUDE.md,
// hooks, status line, skills or installed mods; it is recorded, not asserted.
// Gotchas:
// - A fresh demo git repo is recreated in the cache on every run, so runs compare like for like.
// - Inherited CLAUDE_* / CLAUDECODE variables are stripped (Claude Code refuses to nest), so the run uses
//   account a's config (~/.claude) like a fresh Ghostty launch.
// - The scenes depend on the model following PROMPT_1; compare the chrome (footer, status line, band, hints),
//   not the reply's wording.
// - If Claude Code renames its spinner, update BUSY.
// - The session is silenced (SILENT_SETTINGS, NEBI_VERIFY=1): nobody sits at this terminal, so nothing may push,
//   bridge or write a beacon. It runs under its own --session-id, so the exit check reads only its own beacon.
// - Claude Code shows its own dialogs (auto mode offer, folder trust, surveys). Typed text plus Enter lands in them
//   and picks the highlighted choice: on 2026-10-03 that switched Nebi's real defaultMode to auto. Every keystroke
//   goes through clearDialogs() first (guards.mjs picks the option that keeps the setting; folder trust is accepted),
//   and Enter is pressed only when the input box visibly holds the typed text. meta.json `dialogs` logs each one.
// - Settings guard: ~/.claude/settings.json (and the CLAUDE_CONFIG_DIR one) is snapshotted before launch. If the run
//   changed `permissions` or `enabledPlugins`, those keys are put back and the run fails; other changed top-level
//   keys are reported in meta.json `settingsGuard`, never touched. Ctrl-C or SIGTERM stops claude and runs the
//   same check before this script exits.
// - The run folder is wiped first, so --out and --label go through outputDir() (guards.mjs) before any delete.
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { CACHE, ensureDeps } from './deps.mjs'
import { loadGhosttyTheme, screenText, fullText, screenHTML, pageSize, htmlToPng } from './render.mjs'
import { KEYS, planDialog, readyToSubmit, settingsFiles, snapshotSettings, enforceSettings, outputDir } from './guards.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const { Terminal } = ensureDeps()('@xterm/headless')

function parseArgs(argv) {
  const opts = { present: [], absent: [] }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    if (key === 'safe-mode') opts.safeMode = true
    else if (key === 'present' || key === 'absent') opts[key].push(argv[++i])
    else if (['label', 'out', 'cols', 'rows', 'model'].includes(key)) opts[key] = argv[++i]
    else { console.error(`unknown option ${argv[i]}`); process.exit(2) }
  }
  return opts
}
const opts = parseArgs(process.argv.slice(2))
const LABEL = opts.label || (opts.safeMode ? 'baseline' : 'after')
const COLS = +(opts.cols || 150)
const ROWS = +(opts.rows || 46)
const gitRoot = cwd => { try { return execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
const target = outputDir({ out: opts.out, label: LABEL, runsRoot: join(CACHE, 'runs'), home: os.homedir(), cwd: process.cwd(),
  repoRoots: [gitRoot(process.cwd()), gitRoot(HERE)] })
if (target.error) { console.error(target.error); process.exit(2) }
const OUT = target.dir
const DEMO = join(CACHE, 'demo')
const BEACONS = join(os.homedir(), '.claude', 'nebi', 'beacons')

// The fixed scene script. Keep it identical between runs you compare.
const PROMPT_1 = 'Create hello.py that prints hello. Then ask me in one plain sentence whether you should also add a test, ' +
  'and end your reply with a ❓ Need you status line.'
const PROMPT_2 = 'count to 5 slowly using sleep 2 in bash between numbers'
const TURN_TIMEOUT = 240_000
const IDLE_QUIET_MS = 8_000
const MID_TURN_DELAY_MS = 8_000

// A verification session must never reach Nebi: no push (the model's or a hook's), no Remote Control bridge to his
// phone or the Claude app, and no beacon file his other sessions read (NEBI_VERIFY=1 tells nebi-beacon and the Stop
// hook). --settings is the flag source, which wins over ~/.claude/settings.json; only managed policy beats it.
export const SILENT_SETTINGS = JSON.stringify({ agentPushNotifEnabled: false, inputNeededNotifEnabled: false,
  taskCompleteNotifEnabled: false, remoteControlAtStartup: false })

const T0 = Date.now()
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))

rmSync(DEMO, { recursive: true, force: true })
mkdirSync(DEMO, { recursive: true })
writeFileSync(join(DEMO, 'README.md'), '# demo\n\nScratch project for the nebi-mod-verify paint check.\n')
const git = (...a) => execFileSync('git', ['-c', 'user.name=demo', '-c', 'user.email=demo@example.invalid', ...a], { cwd: DEMO, stdio: 'ignore' })
git('init', '-q', '-b', 'main'); git('add', '.'); git('commit', '-q', '-m', 'init')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const env = { ...process.env }
for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_')) delete env[k]
Object.assign(env, {
  TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty', COLORTERM: 'truecolor',
  TERMINFO: '/Applications/Ghostty.app/Contents/Resources/terminfo',
  COLUMNS: String(COLS), LINES: String(ROWS), NEBI_VERIFY: '1',
})

const theme = loadGhosttyTheme()
const term = new Terminal({ cols: COLS, rows: ROWS, scrollback: 10000, allowProposedApi: true })
const DEBUG_LOG = join(OUT, 'debug.log')
const SESSION_ID = randomUUID()
const claudeArgs = ['claude', '--permission-mode', 'bypassPermissions', '--debug-file', DEBUG_LOG,
  '--session-id', SESSION_ID, '--settings', SILENT_SETTINGS,
  ...(opts.safeMode ? ['--safe-mode'] : []), ...(opts.model ? ['--model', opts.model] : []), PROMPT_1]

// Settings guard: snapshot before launch, enforce after exit (or on any early exit of this script).
const SETTINGS = snapshotSettings(settingsFiles(os.homedir()))
let settingsReport = null
const checkSettings = () => (settingsReport ??= enforceSettings(SETTINGS))
process.on('exit', () => { if (!settingsReport && checkSettings().failed) console.error('FAIL settings changed and were restored:', JSON.stringify(settingsReport)) })

const child = spawn('python3', [join(HERE, 'pty_bridge.py'), String(COLS), String(ROWS), DEMO, ...claudeArgs],
  { env, stdio: ['pipe', 'pipe', 'inherit'] })
log(`started in ${DEMO}: NEBI_VERIFY=1 ${claudeArgs.map(a => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(' ')}`)

const cast = [JSON.stringify({ version: 2, width: COLS, height: ROWS, timestamp: Math.floor(T0 / 1000), env: { TERM: env.TERM } })]
let exited = null
child.stdout.on('data', d => {
  cast.push(JSON.stringify([(Date.now() - T0) / 1000, 'o', d.toString('utf8')]))
  term.write(d)
})
child.on('exit', code => { exited = code ?? 'signal'; log(`claude exited (${exited})`) })
// Ctrl-C or a kill: stop claude first, so it cannot write settings after the guard has put them back; exiting runs it.
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) return
    stopping = true
    log(`${signal}: stopping claude, then checking settings`)
    if (exited === null) child.kill('SIGTERM')
    for (let i = 0; i < 30 && exited === null; i++) await sleep(100)
    if (exited === null) child.kill('SIGKILL')
    process.exit(signal === 'SIGINT' ? 130 : 143)
  })
}
term.onData(d => { if (exited === null) child.stdin.write(d) }) // replies to terminal queries (DA, DSR, ...)

const send = s => { if (exited === null) child.stdin.write(s) }
const flush = () => new Promise(r => term.write('', r))
const screen = async () => { await flush(); return screenText(term) }
// Busy = the spinner line ("✶ Sprouting… (11s · ↓ 588 tokens)") or the classic interrupt hint.
const BUSY = /^\s*[·✢✳✶✻✽*∗]\s*[A-Z][\w' -]*…|esc to interrupt/m

// Wait until the screen stops changing (two reads 400 ms apart match), at most 4 s.
async function settle() {
  await sleep(800)
  let prev = await screen()
  for (let i = 0; i < 8; i++) { await sleep(400); const s = await screen(); if (s === prev) return; prev = s }
}

// Engine dialogs: press the option guards.mjs picks, settle, look again. The same dialog twice more gets Esc;
// one that still will not close throws, so nothing is ever typed into it.
const dialogs = []
const printable = k => ({ [KEYS.up]: 'Up', [KEYS.down]: 'Down', [KEYS.enter]: 'Enter', [KEYS.esc]: 'Esc' })[k] ?? k
async function clearDialogs(when) {
  let last = null, repeats = 0
  for (let n = 0; n < 8; n++) {
    const plan = planDialog(await screen())
    if (!plan) return
    const sig = `${plan.title}|${plan.options.join('|')}`
    repeats = sig === last ? repeats + 1 : 0
    last = sig
    const keys = repeats >= 2 ? [KEYS.esc] : plan.keys
    const choice = repeats >= 2 ? `Esc (choosing "${plan.choice}" did not close it)` : plan.choice ?? 'Esc'
    dialogs.push({ atSeconds: +((Date.now() - T0) / 1000).toFixed(1), when, title: plan.title, options: plan.options,
      cursor: plan.cursor, choice, reason: plan.reason, keys: keys.map(printable) })
    log(`dialog ${when}: "${plan.title}" [${plan.options.join(' / ')}] -> ${choice} (${keys.map(printable).join(', ')})`)
    for (const k of keys) { send(k); await sleep(300) }
    await settle()
  }
  if (planDialog(await screen())) throw new Error(`a dialog would not close (${when}); nothing typed into it`)
}

// Type, then press Enter only when no dialog is up and the input box shows the text. A dialog that opens in
// between is cleared first; if the text never shows (a dialog swallowed it), throw rather than press Enter blind.
async function typeLine(text) {
  await clearDialogs(`before typing ${JSON.stringify(text)}`)
  send(text)
  for (const start = Date.now(); Date.now() - start < 10_000;) {
    await sleep(600)
    await clearDialogs(`before Enter on ${JSON.stringify(text)}`)
    if (readyToSubmit(await screen(), text)) { send(KEYS.enter); return }
  }
  throw new Error(`the input box never showed ${JSON.stringify(text)}; Enter not pressed`)
}

async function waitFor(pred, timeout, label) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (exited !== null) throw new Error(`claude exited while waiting for ${label}`)
    await clearDialogs(`while waiting for ${label}`)
    const s = await screen()
    if (await pred(s)) return true
    await sleep(500)
  }
  log(`timeout waiting for ${label}`)
  return false
}

// Turn finished = spinner seen, then absent for IDLE_QUIET_MS in a row.
async function waitTurnEnd(label) {
  let seenBusy = false, idleSince = null
  return waitFor(s => {
    if (BUSY.test(s)) { seenBusy = true; idleSince = null; return false }
    if (!seenBusy) return false
    idleSince ??= Date.now()
    return Date.now() - idleSince >= IDLE_QUIET_MS
  }, TURN_TIMEOUT, label)
}

const meta = { label: LABEL, safeMode: !!opts.safeMode, cols: COLS, rows: ROWS, theme: theme.name, debugLog: DEBUG_LOG,
  sessionId: SESSION_ID, claudeArgs, env: { NEBI_VERIFY: '1' }, dialogs,
  configDir: join(os.homedir(), '.claude'), prompts: [PROMPT_1, PROMPT_2],
  claudeVersion: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(), scenes: {} }

async function capture(name, note) {
  await flush()
  const text = screenText(term)
  writeFileSync(join(OUT, `${name}.txt`), text)
  writeFileSync(join(OUT, `${name}.full.txt`), fullText(term))
  const html = join(OUT, `${name}.html`)
  writeFileSync(html, screenHTML(term, theme, `${LABEL} ${name}`))
  await htmlToPng(html, join(OUT, `${name}.png`), pageSize(term))
  meta.scenes[name] = { atSeconds: +((Date.now() - T0) / 1000).toFixed(1), busy: BUSY.test(text), note }
  log(`captured ${name} (${note})`)
}

let failure = null
try {
  const ended = await waitTurnEnd('turn 1 end')
  await capture('turn-end', ended ? 'idle after turn 1' : 'TIMEOUT: turn 1 never went idle')
  if (!ended) failure = 'turn 1 never went idle'
  await typeLine(PROMPT_2)
  let busyAt = null
  const busy = await waitFor(s => {
    if (BUSY.test(s)) busyAt ??= Date.now()
    else if (busyAt && Date.now() - busyAt > 2000) return true // turn ended early; capture anyway
    return busyAt && Date.now() - busyAt >= MID_TURN_DELAY_MS
  }, 90_000, 'turn 2 spinner')
  await capture('mid-turn', busy ? `${MID_TURN_DELAY_MS / 1000}s after the spinner appeared` : 'TIMEOUT: spinner never appeared')
  await waitTurnEnd('turn 2 end')
} catch (e) {
  failure = String(e?.message || e)
  log('error:', failure)
}

// Graceful exit so SessionEnd hooks run and beacon files are removed. The retry Enter goes only to an input box
// still holding "/exit", never to a dialog.
if (exited === null) {
  try {
    await typeLine('/exit')
    for (let i = 0; i < 60 && exited === null; i++) {
      await sleep(500)
      if (i === 10) {
        await clearDialogs('during /exit')
        if (readyToSubmit(await screen(), '/exit')) send(KEYS.enter)
      }
    }
  } catch (e) {
    failure ??= String(e?.message || e)
    log('error during /exit:', String(e?.message || e))
  }
}
if (exited === null) {
  log('graceful exit failed; SIGTERM')
  meta.forcedKill = true
  child.kill('SIGTERM'); await sleep(3000)
  if (exited === null) child.kill('SIGKILL')
}
await sleep(1500)
await flush()
writeFileSync(join(OUT, 'session.full.txt'), fullText(term))
writeFileSync(join(OUT, 'session.cast'), cast.join('\n') + '\n')

let leftovers = ''
try { leftovers = execFileSync('pgrep', ['-fl', DEMO], { encoding: 'utf8' }).trim() } catch { /* none */ }
// Only this session's own files count: other live sessions write theirs during the run.
const beaconsAfter = existsSync(BEACONS) ? readdirSync(BEACONS) : []
// Settings guard: claude has exited, so put back what it changed in permissions/enabledPlugins and fail the run.
meta.settingsGuard = checkSettings()
for (const f of meta.settingsGuard.files) {
  for (const d of f.guardedDiff) log(`FAIL settings ${f.file}: ${d}${f.restored ? ' (restored)' : ''}`)
  if (f.error) log(`settings ${f.file}: ${f.error}`)
  if (f.otherChangedKeys.length) log(`settings ${f.file}: other keys changed, left as they are: ${f.otherChangedKeys.join(', ')}`)
}
if (meta.settingsGuard.failed) failure = [failure, 'the run changed permissions or enabledPlugins in settings.json'].filter(Boolean).join('; ')

meta.exit = { code: exited, failure, leftoverProcs: leftovers || null,
  newBeaconsStillPresent: beaconsAfter.filter(b => b.startsWith(`${SESSION_ID}.`)) }
writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
log('exit check', JSON.stringify(meta.exit))

const extra = [...opts.present.flatMap(t => ['--present', t]), ...opts.absent.flatMap(t => ['--absent', t])]
let code = 0
try { execFileSync(process.execPath, [join(HERE, 'check.mjs'), OUT, ...extra], { stdio: 'inherit' }) } catch (e) { code = e.status ?? 1 }
if (failure) log(`FAILED: ${failure}`)
log(`screens and logs in ${OUT}`)
process.exit(failure ? 1 : code)
