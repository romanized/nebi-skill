// Nebi Constellation: your OTHER live Claude sessions, kept quiet. Every 10 s
// it reads the beacon files (nebi-beacon, or the Stop hook's fallback) and Red
// Button's hold files. It shows one toast when a peer starts waiting on you,
// one footer label while this session and another live one on the same Chrome
// both called it in the last 10 minutes (quiet at rest: most projects share
// Main Chrome), a footer label naming who waits off the terminal (where there
// is no status line), and /sessions prints the list. No pane, no sound, no
// warning-coloured status.
//
// Its own Chrome is the route claude-home/nebi/route.mjs gives, step for step
// (hooks/route.ts); its own activity is its last mcp__claude-in-chrome__* call
// in any loop, observed here; a peer's comes from its v2 beacon's
// browserActiveAt, which nebi-beacon writes.
//
// Without this mod: the status line's other-sessions segment
// (claude-home/nebi/statusline.mjs) names the sessions waiting on you.
// NEBI_MODS_OFF=all (or a list naming nebi-constellation) turns it off.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { BrowserRoute, ClaudeAccount, Peer, PeerRoute } from '../types'
import { clashLabel, merge, parseBeacon, parseHold, peerRoute, routeKey, sessionsText, toastText, waitingLabel } from './peers'
import { accountRoute, beaconBrowser, currentAccount, gitRootCandidates, joinPath, parseObject, projectRoute } from './route'

const NAME = 'nebi-constellation'
const POLL_MS = 10_000
const BATCH_MS = 10_000
const MAX_FILES = 64
const MAX_FILE_BYTES = 64 * 1024
const CHROME_TOOL = 'mcp__claude-in-chrome__'

const waiting = atom({ plugin: 'nebi-constellation', key: 'waiting' } as const, null)
const clash = atom({ plugin: 'nebi-constellation', key: 'clash' } as const, null)
const seen = atom({ plugin: 'nebi-constellation', key: 'seen' } as const, null)
const browserAt = atom({ plugin: 'nebi-constellation', key: 'browserAt' } as const, null)

// Module state no drawing reads: a reload resets it and the next turn restarts it.
let offCheck: Promise<boolean> | null = null
let poller: Timer | null = null
let polling = false
let lastToastAt = Number.NEGATIVE_INFINITY
const flipped = new Map<string, Peer>()

const isOff = ($: EngineInterface) =>
  (offCheck ??= $.env
    .get('NEBI_MODS_OFF')
    .then(value => (value ?? '').split(',').some(name => ['all', NAME].includes(name.trim())))
    .catch(() => false))

type Scan = { peers: Peer[]; routes: Map<string, PeerRoute | null>; own: PeerRoute | null; at: number }

// route.mjs readJson: the file as an object, or null when it is missing, unreadable or not an object.
async function readObject($: EngineInterface, path: string): Promise<Record<string, unknown> | null> {
  if (!(await $.fs.exists(path).catch(() => false))) return null
  const text = await $.fs.read(path).catch(() => null)

  return parseObject(typeof text === 'string' ? text : null)
}

// route.mjs gitRoot: the nearest folder at or above `cwd` holding `.git` (a folder, or a file in a worktree).
async function gitRootOf($: EngineInterface, cwd: string): Promise<string | null> {
  for (const dir of gitRootCandidates(cwd)) {
    if (await $.fs.exists(joinPath(dir, '.git')).catch(() => false)) return dir
  }

  return null
}

// route.mjs resolveRoute, step for step, for a session on `account`: the
// project file at the git root wins, else that account's default, else none.
async function resolveRoute($: EngineInterface, cwd: string, account: ClaudeAccount | null, home: string | undefined) {
  try {
    const root = cwd ? await gitRootOf($, cwd) : null
    const fromProject = projectRoute(root === null ? null : await readObject($, joinPath(root, '.claude/browser.json')), account)
    if (fromProject !== null) return fromProject
    if (account === null || !home) return null

    return accountRoute(await readObject($, joinPath(home, '.claude/nebi/browsers.json')), account)
  } catch {
    return null
  }
}

// A route's Chrome as drawn, once per account and folder in a scan.
async function routeFor($: EngineInterface, cwd: string, account: ClaudeAccount | null, home: string | undefined, cache: Map<string, PeerRoute | null>) {
  const key = routeKey(account, cwd)
  if (!cache.has(key)) {
    const found: BrowserRoute | null = await resolveRoute($, cwd, account, home)
    cache.set(key, peerRoute(beaconBrowser(found)))
  }

  return cache.get(key) ?? null
}

async function scan($: EngineInterface): Promise<Scan> {
  const at = await $.clock.now()
  const routes = new Map<string, PeerRoute | null>()
  const home = await $.env.get('HOME')
  const own = await $.session.id().catch(() => '')
  const dir = `${home ?? ''}/.claude/nebi/beacons`
  const entries = home ? await $.fs.list(dir).catch(() => []) : []
  const files = entries
    .filter(f => f.kind === 'file' && f.name.endsWith('.json') && f.size <= MAX_FILE_BYTES)
    .filter(f => f.name !== `${own}.json` && f.name !== `${own}.hold.json`)
    .slice(0, MAX_FILES)
  const found = await Promise.all(
    files.map(async f => {
      const raw = await $.fs.read(`${dir}/${f.name}`).catch(() => null)
      if (typeof raw !== 'string') return null
      const isHold = f.name.endsWith('.hold.json')
      const stem = f.name.slice(0, -(isHold ? '.hold.json' : '.json').length)

      return { isHold, peer: isHold ? parseHold(raw, stem, at) : parseBeacon(raw, stem, at) }
    }),
  )
  const pick = (isHold: boolean) => found.flatMap(f => (f?.isHold === isHold && f.peer ? [f.peer] : []))
  const peers = merge(pick(false), pick(true))
  const cwd = await $.session.cwd().catch(() => '')
  const account = currentAccount(await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined), home, cwd || '/')
  const ownRoute = await routeFor($, cwd, account, home, routes)
  // A peer's own beacon names its browser; its folder's route is /sessions' fallback.
  for (const p of peers) if (!p.browser) await routeFor($, p.cwd, p.account, home, routes)

  return { peers, routes, own: ownRoute, at }
}

async function poll($: EngineInterface, options: PluginOptions) {
  if (polling || (await isOff($))) return
  polling = true
  try {
    const { peers, routes, own, at } = await scan($)

    // A flip into need joins the batch; the first read only sets the baseline.
    const before = await read($, seen)
    for (const [id] of flipped) if (!peers.some(p => p.id === id && p.kind === 'need')) flipped.delete(id)
    if (before !== null) for (const p of peers) if (p.kind === 'need' && before[p.id] !== 'need') flipped.set(p.id, p)
    await update($, seen, () => Object.fromEntries(peers.map(p => [p.id, p.kind])))
    if (flipped.size > 0 && at - lastToastAt >= BATCH_MS) {
      const text = toastText([...flipped.values()])
      flipped.clear()
      if (text && options.toast !== false) {
        lastToastAt = at
        $.ui.toast(text)
      }
    }

    const nextWaiting = waitingLabel(peers, at)
    const nextClash = clashLabel(own, await read($, browserAt), peers, at)
    if (nextWaiting !== (await read($, waiting))) await update($, waiting, () => nextWaiting)
    if (nextClash !== (await read($, clash))) await update($, clash, () => nextClash)
  } finally {
    polling = false
  }
}

function startPolling($: EngineInterface, options: PluginOptions) {
  if (poller) return
  poller = $.clock.every(POLL_MS, () => void poll($, options))
  void poll($, options)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    poller?.cancel()
    poller = null
    offCheck = null
    lastToastAt = Number.NEGATIVE_INFINITY
    flipped.clear()
    if (await isOff($)) return result
    await update($, seen, () => null)
    await update($, browserAt, () => null)
    await $.command
      .register({ name: 'sessions', description: 'List your other Claude sessions, longest wait first', immediate: true })
      .catch(error => $.ui.log(`nebi-constellation: /sessions not registered: ${String(error)}`, { to: 'debug' }))
    startPolling($, options)

    return result
  })

  // Observes only: a Chrome call in any loop, a sub-agent's too, makes this
  // session active in its browser for the clash rule.
  on('tool.call', async ($, e, next) => {
    if (String(e.tool).startsWith(CHROME_TOOL) && !(await isOff($))) {
      const t = await $.clock.now()
      await update($, browserAt, () => t)
    }

    return next(e)
  })

  // A hot reload drops the poller; the next turn picks it up again.
  on('turn.start', async ($, e, next) => {
    if (!(await isOff($))) startPolling($, options)
    return next(e)
  })

  on('command.run', { command: 'sessions' }, async ($, e, next) => {
    if (await isOff($)) return next(e)
    const { peers, routes, at } = await scan($)

    return { text: sessionsText(peers, at, routes) }
  })

  // One label at most, appended: who waits (off the terminal, where no status
  // line shows it), else a browser clash (every surface).
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.component !== 'SessionMode' || (await isOff($))) return next(e)
    const label = (e.surface !== 'terminal' ? await read($, waiting) : null) ?? (await read($, clash))
    if (!label) return next(e)

    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
  })
}
