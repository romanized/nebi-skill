// Nebi Browser: keeps each project in its own Chrome. At session start it
// resolves the route (CONTRACT, Route) and points BROWSER at the router, so
// opened links and artifacts land in the project's Chrome profile. It refuses
// Claude in Chrome calls that pick another browser, broadcast a pairing
// request nobody asked for, or act from the wrong Claude account. Tab listing
// always passes, and no route means every call passes. A route whose files
// name no deviceId keeps only the account guard: there is no device to steer to.
//
// No-mod fallbacks: the BROWSER router exported in ~/.zshenv, the browser line
// the session-start hook adds, and the steer-channel hook's deny.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BrowserRoute } from '../types'
import { accountRoute, clean, currentAccount, gitRootCandidates, joinPath, parseObject, projectRoute } from './route'

const route = atom({ plugin: 'nebi-browser', key: 'route' } as const, null)
const isOff = atom({ plugin: 'nebi-browser', key: 'isOff' } as const, false)

const NAME = 'nebi-browser'
const PREFIX = 'mcp__claude-in-chrome__'
// Listing tabs or browsers changes nothing, so it passes even on the wrong account.
const LISTING = new Set(['tabs_context_mcp', 'list_connected_browsers'])
const MODE_CELLS = 20
const ASKS_TO_PAIR = /\b(re-?pair|pair|switch|re-?name|name|nam)(s|es|ed|ing)?\b[^.?!\n]{0,40}\b(browsers?|chromes?)\b|\b(browsers?|chromes?)\b[^.?!\n]{0,40}\b(re-?pair|pair|switch|re-?name|name|nam)(s|es|ed|ing)?\b/i
// Plain wording that points at another browser: "nope wrong browser", "my main chrome",
// "do it in the karpet24 browser", "use browser 2". "in the browser" or "in your chrome" does not.
const NAMES_A_BROWSER =
  /\b(wrong|other|another|different|right|correct|main)\s+(\w+\s+)?(browsers?|chromes?)\b|\b(use|open|in|on|into|with|to)\s+(the\s+|my\s+)?(?!(the|a|an|this|that|your|my|our|same)\s)[\w-]+\s+(browsers?|chromes?)\b|\b(browsers?|chromes?)\s+\d\b/i

type Setup = { isOff: boolean; route: BrowserRoute | null }

// Module state no drawing reads; a hot reload resets it to the strict side.
let setup: Promise<Setup> | null = null
// This turn's own prompt (composer or bridge) asked to pair, switch or name a browser.
let isPairingAsked = false
// The latest browser listing: did it show the project's device? null: not listed yet.
let isRouteOnline: boolean | null = null
// On the wrong account: `closed` until a page action is refused, `asked` until
// Nebi's next own prompt, then `open`.
let accountGate: 'closed' | 'asked' | 'open' = 'closed'
// Picking another device: `asked` once a select_browser is refused, `open` for the
// turn of Nebi's next own prompt, whatever its wording, then `closed` again.
let switchGate: 'closed' | 'asked' | 'open' = 'closed'

function isNamedOff(value: string | undefined): boolean {
  const names = (value ?? '').split(',').map(name => name.trim().toLowerCase())

  return names.includes('all') || names.includes(NAME)
}

/** route.mjs gitRoot: the nearest folder at or above `cwd` holding `.git` (a folder, or a file in a worktree), or null outside a repository. */
async function gitRootOf($: EngineInterface, cwd: string): Promise<string | null> {
  for (const dir of gitRootCandidates(cwd)) {
    if (await $.fs.exists(joinPath(dir, '.git')).catch(() => false)) return dir
  }

  return null
}

/** route.mjs readJson: the file as an object, or null when it is missing, unreadable or not an object. */
async function readObject($: EngineInterface, path: string): Promise<Record<string, unknown> | null> {
  if (!(await $.fs.exists(path).catch(() => false))) return null
  const text = await $.fs.read(path).catch(() => null)

  return parseObject(typeof text === 'string' ? text : null)
}

/** route.mjs resolveRoute, step for step: the project file at the git root wins; else the account default; else none. */
async function resolveRoute($: EngineInterface, cwd: string, home: string | undefined): Promise<BrowserRoute | null> {
  try {
    const account = currentAccount(await $.env.get('CLAUDE_CONFIG_DIR'), home, cwd || '/')
    const root = cwd ? await gitRootOf($, cwd) : null
    const project = root === null ? null : await readObject($, joinPath(root, '.claude/browser.json'))
    const fromProject = projectRoute(project, account)
    if (fromProject !== null) return fromProject
    if (account === null || !home) return null

    return accountRoute(await readObject($, joinPath(home, '.claude/nebi/browsers.json')), account)
  } catch {
    return null
  }
}

async function load($: EngineInterface, cwd: string | undefined, isStart: boolean): Promise<Setup> {
  const off = isNamedOff(await $.env.get('NEBI_MODS_OFF'))
  const home = await $.env.get('HOME')
  const found = off ? null : await resolveRoute($, cwd ?? (await $.session.cwd()), home)
  await update($, isOff, () => off)
  await update($, route, () => found)

  // Opened links go through BROWSER; set it only when nothing else did and the router is there.
  if (isStart && !off && home && !(await $.env.get('BROWSER'))) {
    const router = `${home}/.claude/nebi/browser-open`
    if (await $.fs.exists(router).catch(() => false)) await $.env.set('BROWSER', router)
  }

  return { isOff: off, route: found }
}

function ensure($: EngineInterface): Promise<Setup> {
  setup ??= load($, undefined, false)

  return setup
}

// ---- What the model is told instead -------------------------------------------

/** How the messages name the route's Chrome: its label, else its profile. */
const nameOf = (r: BrowserRoute) => clean(r.label ?? r.chromeProfile ?? '').slice(0, 40) || 'its Chrome'
const named = (r: BrowserRoute) => `${nameOf(r)} (${r.deviceId})`

const offline = (r: BrowserRoute) =>
  `This project uses ${named(r)}, and it is not connected. Stop and ask Nebi to open that Chrome; do not pick another browser.`

function wrongDevice(r: BrowserRoute): string {
  if (isRouteOnline === false) return offline(r)

  return `This project uses ${named(r)}. Call select_browser with deviceId ${r.deviceId} instead. If Nebi wants another browser, ask him in one plain sentence: his reply lets you switch.`
}

function pairing(r: BrowserRoute): string {
  if (isRouteOnline === false) return `switch_browser pops a pairing request in every Chrome. ${offline(r)}`

  return `switch_browser pops a pairing request in every Chrome. Call select_browser with deviceId ${r.deviceId} (${nameOf(r)}) instead.`
}

function wrongAccount(r: BrowserRoute): string {
  const right = r.claudeAccount ?? 'a'
  const now = r.account === null ? 'an unknown account' : `account ${r.account}`

  return `This project's Chrome is paired with Claude account ${right}, but this session is on ${now}, so Claude in Chrome cannot act here. Use the codex-browser skill instead: it drives the same Chrome from any account.`
}

/** One footer label: the account and browser off the terminal (its status line has them), a warning anywhere on a mismatch. */
function modeLabel(r: BrowserRoute | null, surface: string): string | null {
  if (r === null) return null
  if (r.mismatch) return '⚠ wrong account'
  if (surface === 'terminal') return null
  const head = `${(r.claudeAccount ?? r.account ?? '?').toUpperCase()} · `
  const name = clean(r.label ?? r.chromeProfile ?? r.deviceId ?? '')
  const short = name.replace(/\s+chrome$/i, '') || name
  const room = MODE_CELLS - head.length

  return head + (short.length > room ? `${short.slice(0, room - 1)}…` : short)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    isPairingAsked = false
    isRouteOnline = null
    accountGate = 'closed'
    switchGate = 'closed'
    setup = load($, e.cwd, true)
    await setup

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    if ((await ensure($)).isOff) return next(e)
    const isPersons = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    // A prompt delivered into a running turn adds to that turn; one that starts a turn replaces it.
    const isNewTurn = e.turnId === undefined
    if (isPersons) {
      const asks = ASKS_TO_PAIR.test(e.text)
      isPairingAsked = isNewTurn ? asks : isPairingAsked || asks
      if (accountGate === 'asked') accountGate = 'open'
      if (switchGate === 'asked' || NAMES_A_BROWSER.test(e.text)) switchGate = 'open'
      else if (isNewTurn) switchGate = 'closed'
    } else if (isNewTurn) {
      isPairingAsked = false
      if (switchGate === 'open') switchGate = 'closed'
    }

    return next(e)
  })

  on('tool.call', { tool: /^mcp__claude-in-chrome__/ }, async ($, e, next) => {
    const now = await ensure($)
    const r = now.route
    if (now.isOff || r === null) return next(e)
    const name = String(e.tool).slice(PREFIX.length)
    const device = r.deviceId

    if (name === 'list_connected_browsers') {
      const listed = await next(e)
      if (device === null || listed.deny !== undefined || listed.isError === true || typeof listed.text !== 'string') return listed
      isRouteOnline = listed.text.toLowerCase().includes(device.toLowerCase())
      if (isRouteOnline || r.mismatch) return listed

      return { ...listed, context: [...(listed.context ?? []), offline(r)] }
    }
    if (LISTING.has(name)) return next(e)

    if (r.mismatch && accountGate !== 'open') {
      accountGate = 'asked'

      return { deny: wrongAccount(r) }
    }

    // No deviceId in the route: nothing to steer the browser to.
    if (device === null) return next(e)
    if (name === 'select_browser') {
      const input = e as unknown as Readonly<Record<string, unknown>>
      const asked = typeof input.deviceId === 'string' ? input.deviceId.trim().toLowerCase() : ''
      if (asked === device.toLowerCase() || isPairingAsked || switchGate === 'open') return next(e)
      switchGate = 'asked'

      return { deny: wrongDevice(r) }
    }
    if (name === 'switch_browser') return isPairingAsked ? next(e) : { deny: pairing(r) }

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const label = (await read($, isOff)) ? null : modeLabel(await read($, route), e.surface)
    if (label === null) return next(e)

    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
  })
}
